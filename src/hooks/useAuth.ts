import { useState, useEffect, useCallback } from 'react';
import type { User, UserRole, PermissionsMap, ModuleName } from '../types';
import { DEFAULT_PERMISSIONS } from '../types';
import { v4 as uuidv4 } from 'uuid';

const USERS_KEY = 'bg_users';
const SESSION_KEY = 'bg_session';

export async function hashPassword(password: string): Promise<string> {
  try {
    const enc = new TextEncoder().encode(password);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(32, '0');
  }
}

function loadUsers(): User[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveUsers(users: User[]) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (e) {
    console.warn('Failed to save users', e);
  }
}

function loadSession(): { userId: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveSession(userId: string | null) {
  try {
    if (userId) localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
    else localStorage.removeItem(SESSION_KEY);
    // Dispatch event so CompanyInfo and AppData know user changed and reload per-user data
    try {
      window.dispatchEvent(new CustomEvent('bg_session_changed', { detail: { userId } }));
      window.dispatchEvent(new Event('storage'));
    } catch {}
  } catch {}
}

// Cloud sync helpers for users
async function cloudGetUsers(): Promise<User[] | null> {
  try {
    if (!navigator.onLine) return null;
    const res = await fetch('/.netlify/functions/users', { method: 'GET' });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data)) return data;
    return null;
  } catch {
    return null;
  }
}

async function cloudCreateUser(user: User): Promise<boolean> {
  try {
    if (!navigator.onLine) return false;
    const res = await fetch('/.netlify/functions/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', user }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function cloudUpdateUser(user: User): Promise<boolean> {
  try {
    if (!navigator.onLine) return false;
    const res = await fetch('/.netlify/functions/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', user }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function cloudDeleteUser(userId: string): Promise<boolean> {
  try {
    if (!navigator.onLine) return false;
    const res = await fetch('/.netlify/functions/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', user: { id: userId } }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function cloudLogin(username: string, passwordHash: string): Promise<User | null> {
  try {
    if (!navigator.onLine) return null;
    const res = await fetch('/.netlify/functions/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', username, passwordHash }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success && data.user) return data.user;
    return null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Init users and session with cloud sync
  useEffect(() => {
    const init = async () => {
      let loaded = loadUsers();
      
      // If no users, create default admin
      if (loaded.length === 0) {
        const defaultHash = await hashPassword('BlackGold123');
        const admin: User = {
          id: uuidv4(),
          username: 'admin',
          passwordHash: defaultHash,
          displayName: 'Owner - Black Gold',
          email: 'justusasphalt@gmail.com',
          role: 'admin',
          permissions: DEFAULT_PERMISSIONS.admin,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        loaded = [admin];
        saveUsers(loaded);
        // Also try to save to cloud
        if (navigator.onLine) {
          await cloudCreateUser(admin);
        }
        console.log('Default admin created: admin / BlackGold123');
      } else {
        // Try to sync with cloud - if cloud has more users or newer, merge
        if (navigator.onLine) {
          try {
            const cloudUsers = await cloudGetUsers();
            if (cloudUsers && cloudUsers.length > 0) {
              // If cloud has users and local only has default admin, use cloud
              // Or merge: combine both, dedupe by id
              const localIds = new Set(loaded.map(u => u.id));
              const newFromCloud = cloudUsers.filter((cu: User) => !localIds.has(cu.id));
              if (newFromCloud.length > 0 || cloudUsers.length > loaded.length) {
                // Merge: keep all local + new from cloud, or if cloud is superset, use cloud
                if (loaded.length === 1 && loaded[0].username === 'admin' && cloudUsers.length > 1) {
                  // Local only has default admin, cloud has real users - use cloud
                  loaded = cloudUsers;
                  saveUsers(loaded);
                  console.log('☁️ Synced users from cloud - found', cloudUsers.length, 'users from other device');
                } else {
                  // Merge
                  const merged = [...loaded];
                  newFromCloud.forEach((cu: User) => {
                    if (!merged.some(u => u.username.toLowerCase() === cu.username.toLowerCase())) {
                      merged.push(cu);
                    }
                  });
                  if (merged.length !== loaded.length) {
                    loaded = merged;
                    saveUsers(loaded);
                  }
                }
              }
            }
          } catch (e) {
            console.warn('Cloud users sync failed', e);
          }
        }
      }

      setUsers(loaded);

      // Restore session
      const sess = loadSession();
      if (sess) {
        const u = loaded.find(x => x.id === sess.userId && x.isActive);
        if (u) {
          setCurrentUser(u);
        }
      }

      setLoading(false);
    };
    init();
  }, []);

  // Persist users when changed
  useEffect(() => {
    if (!loading && users.length > 0) {
      saveUsers(users);
    }
  }, [users, loading]);

  const login = useCallback(async (username: string, password: string): Promise<{ success: boolean; message?: string; user?: User }> => {
    const hash = await hashPassword(password);
    
    // Try local first
    let user = users.find(u => (u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === username.toLowerCase()) && u.isActive);
    
    // If not found locally and online, try cloud
    if (!user && navigator.onLine) {
      try {
        const cloudUser = await cloudLogin(username, hash);
        if (cloudUser) {
          user = cloudUser;
          // Save cloud user to local
          setUsers(prev => {
            const exists = prev.find(p => p.id === cloudUser.id);
            if (exists) return prev;
            const updated = [...prev, cloudUser];
            saveUsers(updated);
            return updated;
          });
        }
      } catch (e) {
        console.warn('Cloud login failed', e);
      }
    }

    if (!user) {
      return { success: false, message: 'User not found or deactivated. If you created account on another device, make sure you are online to sync.' };
    }
    if (user.passwordHash !== hash) {
      return { success: false, message: 'Invalid password' };
    }

    const updatedUsers = users.map(u => u.id === user!.id ? { ...u, lastLoginAt: new Date().toISOString() } : u);
    // If user came from cloud and wasn't in local list, add it
    let finalUsers = updatedUsers;
    if (!users.some(u => u.id === user!.id)) {
      finalUsers = [...users, { ...user, lastLoginAt: new Date().toISOString() }];
    }
    setUsers(finalUsers);
    const updatedUser = { ...user, lastLoginAt: new Date().toISOString() };
    setCurrentUser(updatedUser);
    saveSession(updatedUser.id);
    
    // Sync last login to cloud
    if (navigator.onLine) {
      cloudUpdateUser(updatedUser);
    }
    
    return { success: true, user: updatedUser };
  }, [users]);

  const logout = useCallback(() => {
    setCurrentUser(null);
    saveSession(null);
  }, []);

  const createUser = useCallback(async (data: { username: string; password: string; displayName: string; email: string; role: UserRole; permissions?: PermissionsMap }, createdById?: string): Promise<{ success: boolean; message?: string; user?: User }> => {
    if (users.some(u => u.username.toLowerCase() === data.username.toLowerCase())) {
      return { success: false, message: 'Username already exists' };
    }
    if (data.email && users.some(u => u.email && u.email.toLowerCase() === data.email.toLowerCase())) {
      return { success: false, message: 'Email already exists' };
    }

    const hash = await hashPassword(data.password);
    const perms = data.permissions || DEFAULT_PERMISSIONS[data.role] || DEFAULT_PERMISSIONS.viewer;

    const newUser: User = {
      id: uuidv4(),
      username: data.username.trim(),
      passwordHash: hash,
      displayName: data.displayName.trim() || data.username,
      email: data.email.trim(),
      role: data.role,
      permissions: perms,
      isActive: true,
      createdAt: new Date().toISOString(),
      createdBy: createdById,
    };

    setUsers(prev => [...prev, newUser]);
    
    // Sync to cloud
    if (navigator.onLine) {
      await cloudCreateUser(newUser);
    }
    
    return { success: true, user: newUser };
  }, [users]);

  const updateUser = useCallback(async (id: string, patch: Partial<User> & { password?: string }): Promise<{ success: boolean; message?: string }> => {
    const user = users.find(u => u.id === id);
    if (!user) return { success: false, message: 'User not found' };

    let newPerms = patch.permissions || user.permissions;
    if (patch.role && patch.role !== 'custom' && patch.role !== user.role && !patch.permissions) {
      newPerms = DEFAULT_PERMISSIONS[patch.role];
    }

    let newHash = user.passwordHash;
    if (patch.password && patch.password.trim().length > 0) {
      newHash = await hashPassword(patch.password);
    }

    const updated = {
      ...user,
      ...patch,
      passwordHash: newHash,
      permissions: newPerms,
    };
    // @ts-ignore
    delete updated.password;

    setUsers(prev => prev.map(u => u.id === id ? updated : u));

    if (currentUser?.id === id) {
      setCurrentUser(updated);
    }

    if (navigator.onLine) {
      await cloudUpdateUser(updated);
    }

    return { success: true };
  }, [users, currentUser]);

  const deleteUser = useCallback((id: string): { success: boolean; message?: string } => {
    const user = users.find(u => u.id === id);
    if (!user) return { success: false, message: 'User not found' };
    if (user.role === 'admin' && users.filter(u => u.role === 'admin' && u.isActive).length <= 1) {
      return { success: false, message: 'Cannot delete last active admin' };
    }
    if (currentUser?.id === id) {
      return { success: false, message: 'Cannot delete yourself' };
    }
    setUsers(prev => prev.filter(u => u.id !== id));
    
    if (navigator.onLine) {
      cloudDeleteUser(id);
    }
    
    return { success: true };
  }, [users, currentUser]);

  const toggleActive = useCallback((id: string): { success: boolean; message?: string } => {
    const user = users.find(u => u.id === id);
    if (!user) return { success: false, message: 'User not found' };
    if (user.role === 'admin' && users.filter(u => u.role === 'admin' && u.isActive).length <= 1 && user.isActive) {
      return { success: false, message: 'Cannot deactivate last admin' };
    }
    const updated = { ...user, isActive: !user.isActive };
    setUsers(prev => prev.map(u => u.id === id ? updated : u));
    
    if (navigator.onLine) {
      cloudUpdateUser(updated);
    }
    
    return { success: true };
  }, [users]);

  const can = useCallback((module: ModuleName, action: keyof PermissionsMap[ModuleName]): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    const perm = currentUser.permissions[module];
    if (!perm) return false;
    return !!perm[action];
  }, [currentUser]);

  const canViewModule = useCallback((module: ModuleName) => can(module, 'view'), [can]);

  return {
    loading,
    users,
    currentUser,
    login,
    logout,
    createUser,
    updateUser,
    deleteUser,
    toggleActive,
    can,
    canViewModule,
    isAdmin: currentUser?.role === 'admin',
  };
}
