import { useState, useEffect, useCallback } from 'react';
import type { CompanyInfo } from '../types';
import { DEFAULT_COMPANY_INFO } from '../types';

const COMPANY_KEY = 'bg_company';

function getCurrentUserId(): string | null {
  try {
    const raw = localStorage.getItem('bg_session');
    if (raw) {
      const sess = JSON.parse(raw);
      return sess.userId || null;
    }
  } catch {}
  return null;
}

function getCompanyKey(userId: string | null): string {
  return userId ? `${COMPANY_KEY}_${userId}` : COMPANY_KEY;
}

function isAdminUser(userId: string | null): boolean {
  try {
    if (!userId) return false;
    const raw = localStorage.getItem('bg_users');
    if (!raw) return false;
    const users = JSON.parse(raw);
    const u = users.find((x: any) => x.id === userId);
    if (!u) return false;
    const username = (u.username || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    return username === 'admin' || email === 'justusasphalt@gmail.com' || email === 'support@asphaltassistant.com';
  } catch { return false; }
}

function loadCompany(userId: string | null = null): CompanyInfo {
  const uid = userId ?? getCurrentUserId();
  try {
    // STRICT per-user isolation: if userId exists, ONLY use per-user key, never global
    // This prevents test company overwriting admin's Black Gold
    if (uid) {
      const perUserRaw = localStorage.getItem(getCompanyKey(uid));
      if (perUserRaw) {
        const parsed = JSON.parse(perUserRaw) as CompanyInfo;
        // CORRUPTION FIX: If admin's per-user company is test company, reset to Black Gold
        if (isAdminUser(uid)) {
          const nameLower = (parsed.name || '').toLowerCase();
          const isBlackGold = nameLower.includes('black gold') || parsed.name === DEFAULT_COMPANY_INFO.name;
          const isTest = nameLower.includes('test') || (nameLower.length > 0 && !isBlackGold && nameLower !== DEFAULT_COMPANY_INFO.name.toLowerCase());
          if (isTest && !isBlackGold) {
            console.warn(`⚠️ Admin company corrupted as "${parsed.name}" - resetting to Black Gold DEFAULT`);
            try { localStorage.removeItem(getCompanyKey(uid)); } catch {}
            // Also clear global if it has test company
            try {
              const globalRaw = localStorage.getItem(COMPANY_KEY);
              if (globalRaw) {
                const globalParsed = JSON.parse(globalRaw);
                if ((globalParsed.name || '').toLowerCase().includes('test')) {
                  localStorage.removeItem(COMPANY_KEY);
                }
              }
            } catch {}
            return DEFAULT_COMPANY_INFO;
          }
        }
        console.log(`📂 Loaded per-user company for ${uid}: ${parsed.name}`);
        return { ...DEFAULT_COMPANY_INFO, ...parsed };
      }
      // Per-user key missing -> return DEFAULT (Black Gold)
      console.log(`📂 No per-user company for ${uid}, returning DEFAULT (Black Gold) to avoid cross-contamination`);
      return DEFAULT_COMPANY_INFO;
    }
    // No user logged in - fallback to global (for login page branding)
    const raw = localStorage.getItem(COMPANY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CompanyInfo;
      return { ...DEFAULT_COMPANY_INFO, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load company', e);
  }
  return DEFAULT_COMPANY_INFO;
}

function saveCompany(company: CompanyInfo, userId: string | null = null) {
  const uid = userId ?? getCurrentUserId();
  try {
    // Save to per-user key (isolated) - PRIMARY
    if (uid) {
      localStorage.setItem(getCompanyKey(uid), JSON.stringify(company));
      console.log(`💾 Saved per-user company for ${uid}: ${company.name} (isolated)`);
      // Do NOT save to global when userId exists - prevents test company overwriting admin's Black Gold in global
      // Global is only for no-user state (login page)
      return;
    }
    // No user - save to global (for login page)
    localStorage.setItem(COMPANY_KEY, JSON.stringify(company));
  } catch (e) {
    console.warn('Failed to save company', e);
  }
}

async function cloudSaveCompany(company: CompanyInfo) {
  try {
    const userId = getCurrentUserId();
    if (!userId) return;
    if (!navigator.onLine) return;
    
    await fetch('/.netlify/functions/user-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, company }),
    });
  } catch (e) {
    console.warn('Cloud company save failed', e);
  }
}

async function cloudLoadCompany(userId?: string): Promise<CompanyInfo | null> {
  try {
    const uid = userId ?? getCurrentUserId();
    if (!uid) return null;
    if (!navigator.onLine) return null;
    
    const res = await fetch(`/.netlify/functions/user-data?userId=${encodeURIComponent(uid)}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.data && json.data.company) {
      return json.data.company as CompanyInfo;
    }
    return null;
  } catch {
    return null;
  }
}

export function useCompanyInfo() {
  const [company, setCompany] = useState<CompanyInfo>(() => {
    if (typeof window === 'undefined') return DEFAULT_COMPANY_INFO;
    return loadCompany();
  });
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => getCurrentUserId());

  // Watch for user changes (login/logout/switch account) - reload company per user
  useEffect(() => {
    const checkUserChange = () => {
      const uid = getCurrentUserId();
      if (uid !== currentUserId) {
        console.log(`👤 User changed: ${currentUserId} -> ${uid}, reloading company info`);
        setCurrentUserId(uid);
        const perUserCompany = loadCompany(uid);
        setCompany(perUserCompany);
      }
    };

    // Check on focus and storage events (login/logout in another tab)
    const interval = setInterval(checkUserChange, 1000);
    window.addEventListener('focus', checkUserChange);
    window.addEventListener('storage', checkUserChange);

    // Also listen to custom event we can dispatch on login
    const handleLogin = () => checkUserChange();
    window.addEventListener('bg_session_changed', handleLogin as any);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkUserChange);
      window.removeEventListener('storage', checkUserChange);
      window.removeEventListener('bg_session_changed', handleLogin as any);
    };
  }, [currentUserId]);

  useEffect(() => {
    const init = async () => {
      const uid = getCurrentUserId();
      setCurrentUserId(uid);
      const local = loadCompany(uid);
      setCompany(local);
      
      // Try cloud sync if logged in and online
      if (uid && navigator.onLine) {
        try {
          const cloudCompany = await cloudLoadCompany(uid);
          if (cloudCompany) {
            // If cloud has custom company and local is default or different, use cloud
            // BUT only if cloud is for THIS user (per-user isolation)
            const isLocalDefault = local.name === DEFAULT_COMPANY_INFO.name && !local.logoDataUrl;
            const isCloudCustom = cloudCompany.name !== DEFAULT_COMPANY_INFO.name || !!cloudCompany.logoDataUrl;
            
            // Use cloud if local is default and cloud is custom, OR if both custom but different and cloud newer?
            // For isolation, prioritize per-user cloud
            if ((isLocalDefault && isCloudCustom) || (cloudCompany.name && cloudCompany.name !== local.name && cloudCompany.name !== DEFAULT_COMPANY_INFO.name)) {
              console.log(`☁️ Syncing company from cloud for user ${uid} - found custom company from other device: ${cloudCompany.name}`);
              const merged = { ...DEFAULT_COMPANY_INFO, ...cloudCompany };
              setCompany(merged);
              saveCompany(merged, uid);
            }
          }
        } catch (e) {
          console.warn('Cloud company sync failed', e);
        }
      }
      
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!loading) {
      const uid = getCurrentUserId();
      saveCompany(company, uid);
      cloudSaveCompany(company);
    }
  }, [company, loading]);

  const updateCompany = useCallback((patch: Partial<CompanyInfo>) => {
    setCompany(prev => ({ ...prev, ...patch }));
  }, []);

  const setFullCompany = useCallback((newCompany: CompanyInfo) => {
    const uid = getCurrentUserId();
    console.log(`🏢 Setting company for user ${uid}: ${newCompany.name} (per-user isolated)`);
    setCompany(newCompany);
    // Immediately save per-user
    saveCompany(newCompany, uid);
  }, []);

  const resetToDefault = useCallback(() => {
    const uid = getCurrentUserId();
    setCompany(DEFAULT_COMPANY_INFO);
    if (uid) {
      try { localStorage.removeItem(getCompanyKey(uid)); } catch {}
    }
    try { localStorage.removeItem(COMPANY_KEY); } catch {}
  }, []);

  const logoUrl = (() => {
    // If company has uploaded logo, use it
    if (company.logoDataUrl) return company.logoDataUrl;
    // If company is Black Gold (default), use Black Gold logo
    if (company.name === DEFAULT_COMPANY_INFO.name) return '/logo.png';
    // For white-label new companies without logo, return empty (blank) per user request
    // Don't show Black Gold logo for other companies
    return '';
  })();

  const hasLogo = !!company.logoDataUrl || company.name === DEFAULT_COMPANY_INFO.name;

  return {
    company,
    logoUrl,
    hasLogo,
    loading,
    updateCompany,
    setFullCompany,
    resetToDefault,
    isCustom: company.name !== DEFAULT_COMPANY_INFO.name || !!company.logoDataUrl,
    currentUserId,
  };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
