import { useState } from 'react';
import type { User, UserRole, PermissionsMap, ModuleName } from '../types';
import { DEFAULT_PERMISSIONS } from '../types';
import Modal from './Modal';

const MODULE_LABELS: Record<ModuleName, string> = {
  dashboard: 'Dashboard',
  customers: 'Customers',
  jobs: 'Jobs',
  estimates: 'Estimates',
  invoices: 'Invoices',
  contracts: 'Contracts',
  map: 'Map',
  ai: 'AI Assistant',
  users: 'Users Management',
};

const ROLE_LABELS: Record<UserRole, { label: string; desc: string; color: string }> = {
  admin: { label: 'Admin', desc: 'Full access, can manage users', color: 'bg-black text-yellow-400 border-yellow-500' },
  manager: { label: 'Manager', desc: 'Can manage jobs, estimates, invoices', color: 'bg-blue-900 text-blue-200 border-blue-700' },
  crew: { label: 'Crew', desc: 'Field crew - can view & update job status', color: 'bg-amber-900 text-amber-200 border-amber-700' },
  viewer: { label: 'Viewer', desc: 'Read-only access', color: 'bg-zinc-800 text-zinc-300 border-zinc-600' },
  custom: { label: 'Custom', desc: 'Set specific permissions', color: 'bg-purple-900 text-purple-200 border-purple-700' },
};

const MODULES: ModuleName[] = ['dashboard','customers','jobs','estimates','invoices','contracts','map','ai','users'];

export default function UsersPage({ users, currentUser, onCreate, onUpdate, onDelete, onToggleActive, canManageUsers }: {
  users: User[];
  currentUser: User | null;
  onCreate: (data: { username: string; password: string; displayName: string; email: string; role: UserRole; permissions?: PermissionsMap }) => Promise<{ success: boolean; message?: string; user?: User }>;
  onUpdate: (id: string, patch: Partial<User> & { password?: string }) => Promise<{ success: boolean; message?: string }>;
  onDelete: (id: string) => { success: boolean; message?: string };
  onToggleActive: (id: string) => { success: boolean; message?: string };
  canManageUsers: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const filtered = users.filter(u => `${u.username} ${u.displayName} ${u.email} ${u.role}`.toLowerCase().includes(filter.toLowerCase()));

  const handleDelete = (id: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    const res = onDelete(id);
    if (!res.success) setToast(res.message || 'Delete failed');
    else setToast('User deleted');
    setTimeout(()=>setToast(null),3000);
  };

  const handleToggle = (id: string) => {
    const res = onToggleActive(id);
    if (!res.success) setToast(res.message || 'Action failed');
    else setToast('User status updated');
    setTimeout(()=>setToast(null),3000);
  };

  return (
    <div className="space-y-4">
      <div className="bg-black text-white rounded-2xl p-5 border-2 flex flex-col md:flex-row justify-between gap-4" style={{ borderColor: '#C5A032' }}>
        <div className="flex gap-4 items-center">
          <img src="/logo.png" className="w-14 h-14 bg-white rounded-xl p-1" alt="logo" />
          <div>
            <h2 className="font-black text-lg" style={{ color: '#C5A032' }}>User Management - Black Gold</h2>
            <p className="text-xs text-gray-400">{users.length} total users • {users.filter(u=>u.isActive).length} active • Logged in as {currentUser?.displayName} ({currentUser?.role})</p>
          </div>
        </div>
        {canManageUsers && <button onClick={()=>{setEditing(null); setShowForm(true);}} className="px-5 py-2.5 rounded-xl font-black text-black shadow" style={{ background: '#C5A032' }}>+ Create User</button>}
      </div>

      {!canManageUsers && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-amber-800 text-sm">
          ⚠️ You don't have permission to manage users. View only. Contact admin (justusasphalt@gmail.com) to get manager rights.
        </div>
      )}

      <div className="flex gap-3">
        <input type="text" placeholder="Search users..." value={filter} onChange={e=>setFilter(e.target.value)} className="flex-1 px-4 py-2 border rounded-xl outline-none" />
        <div className="text-xs bg-white border rounded-xl px-3 py-2 flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full"></span> Active: {users.filter(u=>u.isActive).length}
          <span className="w-2 h-2 bg-gray-400 rounded-full ml-2"></span> Inactive: {users.filter(u=>!u.isActive).length}
        </div>
      </div>

      <div className="grid gap-3">
        {filtered.map(u => (
          <div key={u.id} className="bg-white rounded-xl p-4 shadow-sm border-l-4 flex flex-col md:flex-row justify-between gap-3" style={{ borderLeftColor: u.isActive ? (u.role==='admin'?'#C5A032':'#000') : '#ccc' }}>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="font-black">{u.displayName}</h3>
                <span className={`text-[10px] px-2.5 py-1 rounded-full border font-black tracking-wide ${ROLE_LABELS[u.role].color}`}>{ROLE_LABELS[u.role].label}</span>
                {!u.isActive && <span className="text-[10px] px-2 py-1 rounded-full bg-red-100 text-red-700 border border-red-300 font-bold">INACTIVE</span>}
                {currentUser?.id===u.id && <span className="text-[10px] px-2 py-1 rounded-full bg-green-100 text-green-700 border">YOU</span>}
              </div>
              <p className="text-sm text-gray-600">@{u.username} • {u.email || 'no email'} • Created {new Date(u.createdAt).toLocaleDateString()}</p>
              {u.lastLoginAt && <p className="text-xs text-gray-400">Last login: {new Date(u.lastLoginAt).toLocaleString()}</p>}
              <div className="mt-2 flex flex-wrap gap-1">
                {MODULES.map(m=> {
                  const p = u.permissions[m];
                  const hasAny = p.view || p.create || p.edit || p.delete;
                  if (!hasAny) return null;
                  return <span key={m} className="text-[9px] px-2 py-0.5 rounded-full bg-gray-100 border text-gray-600 font-medium">{MODULE_LABELS[m]}: {p.view?'V':''}{p.create?'C':''}{p.edit?'E':''}{p.delete?'D':''}</span>
                })}
              </div>
            </div>
            {canManageUsers && (
              <div className="flex gap-2 flex-wrap items-start">
                <button onClick={()=>{setEditing(u); setShowForm(true);}} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-black text-yellow-400 border" style={{ borderColor: '#C5A032' }}>Edit</button>
                <button onClick={()=>handleToggle(u.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${u.isActive ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>{u.isActive ? 'Deactivate' : 'Activate'}</button>
                {currentUser?.id!==u.id && <button onClick={()=>handleDelete(u.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-700">Delete</button>}
              </div>
            )}
          </div>
        ))}
      </div>

      {showForm && <UserForm user={editing} onSave={async (data)=>{ 
        if (editing) {
          const res = await onUpdate(editing.id, data);
          if (!res.success) { setToast(res.message||'Update failed'); return; }
          setToast('User updated');
        } else {
          const res = await onCreate(data as any);
          if (!res.success) { setToast(res.message||'Create failed'); return; }
          setToast('User created: '+res.user?.username);
        }
        setShowForm(false); setEditing(null); setTimeout(()=>setToast(null),3000);
      }} onClose={()=>{setShowForm(false); setEditing(null);}} />}

      {toast && <div className="fixed bottom-4 right-4 bg-black text-white px-5 py-3 rounded-xl border-2 shadow-xl z-50" style={{ borderColor: '#C5A032' }}>{toast}</div>}

      <div className="bg-white rounded-xl p-5 border-2 mt-6" style={{ borderColor: '#000' }}>
        <h3 className="font-black text-sm mb-3">🔐 Roles Explained - Black Gold Asphalt</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {Object.entries(ROLE_LABELS).map(([key, info])=>(
            <div key={key} className={`p-3 rounded-xl border-2 ${info.color}`}><p className="font-black">{info.label}</p><p className="mt-1 opacity-80">{info.desc}</p><div className="mt-2 text-[10px] opacity-70">
              {Object.entries(DEFAULT_PERMISSIONS[key as UserRole]).filter(([_,p])=>(p as any).view).map(([mod])=>MODULE_LABELS[mod as ModuleName]).join(', ')}
            </div></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UserForm({ user, onSave, onClose }: { user: User | null; onSave: (data: any) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState({
    username: user?.username || '',
    password: '',
    displayName: user?.displayName || '',
    email: user?.email || '',
    role: (user?.role || 'crew') as UserRole,
    permissions: user?.permissions || DEFAULT_PERMISSIONS.crew,
  });
  const [showPass, setShowPass] = useState(false);

  const updateRole = (role: UserRole) => {
    setForm(f=>({ ...f, role, permissions: role==='custom' ? f.permissions : DEFAULT_PERMISSIONS[role] }));
  };

  const togglePerm = (mod: ModuleName, action: keyof PermissionsMap[ModuleName]) => {
    setForm(f=>({
      ...f,
      role: 'custom',
      permissions: {
        ...f.permissions,
        [mod]: { ...f.permissions[mod], [action]: !f.permissions[mod][action] }
      }
    }));
  };

  const canSave = form.username.trim().length>=3 && (user || form.password.trim().length>=6) && form.displayName.trim().length>=2;

  return (
    <Modal title={user ? `Edit User - ${user.displayName}` : 'Create New User'} onClose={onClose}>
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <div className="bg-black p-3 rounded-xl border flex gap-3 items-center" style={{ borderColor: '#C5A032' }}>
          <img src="/logo.png" className="w-10 h-10 bg-white rounded-lg p-1" alt="logo" />
          <div><p className="font-black text-xs" style={{ color: '#C5A032' }}>Black Gold User</p><p className="text-[11px] text-white">{user ? 'Editing existing user' : 'New crew member - Columbus OH'}</p></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-black mb-1">USERNAME *</label><input value={form.username} onChange={e=>setForm(f=>({...f, username: e.target.value}))} placeholder="j.smith" className="w-full px-3 py-2.5 border rounded-xl text-sm" /></div>
          <div><label className="block text-xs font-black mb-1">DISPLAY NAME *</label><input value={form.displayName} onChange={e=>setForm(f=>({...f, displayName: e.target.value}))} placeholder="John Smith" className="w-full px-3 py-2.5 border rounded-xl text-sm" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-black mb-1">EMAIL</label><input value={form.email} onChange={e=>setForm(f=>({...f, email: e.target.value}))} placeholder="john@example.com" className="w-full px-3 py-2.5 border rounded-xl text-sm" /></div>
          <div>
            <label className="block text-xs font-black mb-1">PASSWORD {user ? '(leave blank to keep)' : '* min 6 chars'}</label>
            <div className="relative"><input type={showPass?'text':'password'} value={form.password} onChange={e=>setForm(f=>({...f, password: e.target.value}))} placeholder={user ? '••••••••' : 'BlackGold123'} className="w-full px-3 py-2.5 border rounded-xl text-sm pr-14" /><button type="button" onClick={()=>setShowPass(!showPass)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-1 bg-black text-yellow-400 rounded-full border" style={{ borderColor: '#C5A032' }}>{showPass?'HIDE':'SHOW'}</button></div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-black mb-2">ROLE</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.entries(ROLE_LABELS).map(([key, info])=>(
              <button key={key} type="button" onClick={()=>updateRole(key as UserRole)} className={`p-3 rounded-xl border-2 text-left transition ${form.role===key ? 'ring-2 ring-yellow-400' : ''} ${info.color}`}><p className="font-black text-xs">{info.label}</p><p className="text-[11px] mt-1 opacity-80">{info.desc}</p></button>
            ))}
          </div>
        </div>

        <div className="border-2 rounded-xl p-3 bg-gray-50" style={{ borderColor: '#000' }}>
          <div className="flex justify-between items-center mb-3"><h4 className="font-black text-xs">PERMISSIONS {form.role==='custom' && '(Custom Editing Enabled)'}</h4><span className="text-[10px] bg-black text-yellow-400 px-2 py-1 rounded-full border" style={{ borderColor: '#C5A032' }}>View-Create-Edit-Delete</span></div>
          <div className="space-y-2">
            {MODULES.map(mod=>(
              <div key={mod} className="bg-white rounded-xl p-2.5 border flex flex-col md:flex-row md:items-center justify-between gap-2">
                <span className="font-bold text-xs min-w-[120px]">{MODULE_LABELS[mod]}</span>
                <div className="flex gap-1 flex-wrap">
                  {(['view','create','edit','delete'] as const).map(action=>(
                    <label key={action} className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold cursor-pointer transition ${form.permissions[mod][action] ? 'bg-black text-yellow-400 border-yellow-500' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      <input type="checkbox" checked={form.permissions[mod][action]} onChange={()=>togglePerm(mod, action)} className="hidden" />
                      {form.permissions[mod][action] ? '✓' : '○'} {action.toUpperCase()}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-2">💡 Tip: Uncheck all for View-Only, check View+Create for crew that can add jobs but not delete.</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-xl text-sm font-bold">Cancel</button>
          <button disabled={!canSave} onClick={()=>onSave(form)} className="px-6 py-2.5 bg-black text-yellow-400 rounded-xl text-sm font-black border disabled:opacity-40" style={{ borderColor: '#C5A032', background: canSave ? '#000' : '#333' }}>{user ? 'Save User' : 'Create User'}</button>
        </div>
      </div>
    </Modal>
  );
}
