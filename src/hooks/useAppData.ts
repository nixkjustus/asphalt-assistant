import { useState, useEffect, useCallback, useRef } from 'react';
import type { Customer, Job, Estimate, Invoice, Contract, CompanyInfo } from '../types';

const BASE_KEYS = {
  customers: 'ap_customers',
  jobs: 'ap_jobs',
  estimates: 'ap_estimates',
  invoices: 'ap_invoices',
  contracts: 'ap_contracts',
  company: 'bg_company',
  measurements: 'bg_measurements',
  lastSync: 'bg_last_sync',
};

function getCurrentUserId(): string | null {
  try {
    const raw = localStorage.getItem('bg_session');
    if (raw) { const sess = JSON.parse(raw); return sess.userId || null; }
  } catch {} return null;
}

function getKey(base: string, userId: string | null = null): string {
  const uid = userId ?? getCurrentUserId();
  return uid ? `${base}_${uid}` : base;
}

function load<T>(baseKey: string, fallback: T, userId: string | null = null): T {
  const uid = userId ?? getCurrentUserId();
  try {
    // Try per-user key first (isolated per account)
    if (uid) {
      const perUser = localStorage.getItem(`${baseKey}_${uid}`);
      if (perUser) return JSON.parse(perUser);
    }
    // Fallback to global key (backward compat)
    const raw = localStorage.getItem(baseKey);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function save(baseKey: string, val: any, userId: string | null = null) {
  const uid = userId ?? getCurrentUserId();
  try {
    if (uid) {
      localStorage.setItem(`${baseKey}_${uid}`, JSON.stringify(val));
    }
    // Also save to global for current session compat
    localStorage.setItem(baseKey, JSON.stringify(val));
  } catch (e) { console.warn('LocalStorage save failed', e); }
}

function mergeById<T extends { id: string }>(local: T[], cloud: T[] | undefined): T[] {
  if (!cloud || cloud.length===0) return local;
  if (local.length===0) return cloud;
  const map = new Map<string, T>();
  for (const item of cloud) map.set(item.id, item);
  for (const item of local) map.set(item.id, item);
  return Array.from(map.values());
}

async function cloudLoad(userId: string): Promise<any | null> {
  try {
    if (!navigator.onLine) { console.log('Offline - skip cloud load'); return null; }
    console.log(`☁️ Cloud LOAD for user ${userId}...`);
    const res = await fetch(`/.netlify/functions/user-data?userId=${encodeURIComponent(userId)}`, {
      method: 'GET', headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn('Cloud load failed', res.status, txt);
      return null;
    }
    const json = await res.json();
    return json.data || null;
  } catch (e) {
    console.warn('Cloud load error', e);
    return null;
  }
}

async function cloudSave(userId: string, data: any): Promise<{ success: boolean; error?: string }> {
  try {
    if (!navigator.onLine) return { success: false, error: 'Offline' };
    console.log(`☁️ Cloud SAVE for user ${userId}: ${data.customers?.length||0} customers, ${data.jobs?.length||0} jobs`);
    const res = await fetch('/.netlify/functions/user-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...data }),
    });
    const txt = await res.text();
    if (!res.ok) return { success: false, error: `HTTP ${res.status}: ${txt.slice(0,200)}` };
    try {
      const json = JSON.parse(txt);
      if (json.success) {
        try { localStorage.setItem(getKey(BASE_KEYS.lastSync), new Date().toISOString()); } catch {}
        return { success: true };
      }
      return { success: false, error: json.error || 'Unknown' };
    } catch { return { success: false, error: 'Invalid JSON' }; }
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

export function useAppData() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => getCurrentUserId());
  const initialLoadDone = useRef(false);

  // Watch for user changes (switch account) - reload per-user data
  useEffect(() => {
    const checkUserChange = () => {
      const uid = getCurrentUserId();
      if (uid !== currentUserId) {
        console.log(`👤 User changed in useAppData: ${currentUserId} -> ${uid}, reloading per-user data`);
        setCurrentUserId(uid);
        // Reload data for new user
        const localCustomers = load<Customer[]>(BASE_KEYS.customers, [], uid);
        const localJobs = load<Job[]>(BASE_KEYS.jobs, [], uid);
        const localEstimates = load<Estimate[]>(BASE_KEYS.estimates, [], uid);
        const localInvoices = load<Invoice[]>(BASE_KEYS.invoices, [], uid);
        const localContracts = load<Contract[]>(BASE_KEYS.contracts, [], uid);
        setCustomers(localCustomers);
        setJobs(localJobs);
        setEstimates(localEstimates);
        setInvoices(localInvoices);
        setContracts(localContracts);
        setLastSync(load<string | null>(BASE_KEYS.lastSync, null, uid));
      }
    };
    const interval = setInterval(checkUserChange, 1000);
    window.addEventListener('focus', checkUserChange);
    window.addEventListener('storage', checkUserChange);
    window.addEventListener('bg_session_changed', checkUserChange as any);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkUserChange);
      window.removeEventListener('storage', checkUserChange);
      window.removeEventListener('bg_session_changed', checkUserChange as any);
    };
  }, [currentUserId]);

  // Initial load per user
  useEffect(() => {
    const loadAll = async () => {
      const uid = getCurrentUserId();
      setCurrentUserId(uid);
      const localCustomers = load<Customer[]>(BASE_KEYS.customers, [], uid);
      const localJobs = load<Job[]>(BASE_KEYS.jobs, [], uid);
      const localEstimates = load<Estimate[]>(BASE_KEYS.estimates, [], uid);
      const localInvoices = load<Invoice[]>(BASE_KEYS.invoices, [], uid);
      const localContracts = load<Contract[]>(BASE_KEYS.contracts, [], uid);

      console.log(`📂 Loading data for user ${uid}: ${localCustomers.length} customers, ${localJobs.length} jobs (per-user isolated)`);
      setCustomers(localCustomers);
      setJobs(localJobs);
      setEstimates(localEstimates);
      setInvoices(localInvoices);
      setContracts(localContracts);
      setLastSync(load<string | null>(BASE_KEYS.lastSync, null, uid));

      if (uid && navigator.onLine) {
        setIsSyncing(true);
        setCloudError(null);
        try {
          const cloudData = await cloudLoad(uid);
          if (cloudData) {
            const hasCloud = (cloudData.customers?.length > 0) || (cloudData.jobs?.length > 0);
            const localEmpty = localCustomers.length===0 && localJobs.length===0 && localEstimates.length===0;

            if (hasCloud) {
              if (localEmpty) {
                console.log('☁️ Local empty, using cloud data for this user');
                if (cloudData.customers) setCustomers(cloudData.customers);
                if (cloudData.jobs) setJobs(cloudData.jobs);
                if (cloudData.estimates) setEstimates(cloudData.estimates);
                if (cloudData.invoices) setInvoices(cloudData.invoices);
                if (cloudData.contracts) setContracts(cloudData.contracts);
                if (cloudData.company) { try { localStorage.setItem(getKey(BASE_KEYS.company, uid), JSON.stringify(cloudData.company)); localStorage.setItem(BASE_KEYS.company, JSON.stringify(cloudData.company)); } catch {} }
                if (cloudData.measurements) { try { localStorage.setItem(getKey(BASE_KEYS.measurements, uid), JSON.stringify(cloudData.measurements)); localStorage.setItem(BASE_KEYS.measurements, JSON.stringify(cloudData.measurements)); } catch {} }
                if (cloudData.updatedAt) { setLastSync(cloudData.updatedAt); save(BASE_KEYS.lastSync, cloudData.updatedAt, uid); }
                if (cloudData.customers) save(BASE_KEYS.customers, cloudData.customers, uid);
                if (cloudData.jobs) save(BASE_KEYS.jobs, cloudData.jobs, uid);
                if (cloudData.estimates) save(BASE_KEYS.estimates, cloudData.estimates, uid);
                if (cloudData.invoices) save(BASE_KEYS.invoices, cloudData.invoices, uid);
                if (cloudData.contracts) save(BASE_KEYS.contracts, cloudData.contracts, uid);
              } else {
                const mergedCustomers = mergeById(localCustomers, cloudData.customers);
                const mergedJobs = mergeById(localJobs, cloudData.jobs);
                const mergedEst = mergeById(localEstimates, cloudData.estimates);
                const mergedInv = mergeById(localInvoices, cloudData.invoices);
                const mergedCont = mergeById(localContracts, cloudData.contracts);
                
                if (mergedCustomers.length !== localCustomers.length || mergedJobs.length !== localJobs.length) {
                  console.log('☁️ Merging cloud + local for this user', { local: localCustomers.length, cloud: cloudData.customers?.length, merged: mergedCustomers.length });
                  setCustomers(mergedCustomers);
                  setJobs(mergedJobs);
                  setEstimates(mergedEst);
                  setInvoices(mergedInv);
                  setContracts(mergedCont);
                  save(BASE_KEYS.customers, mergedCustomers, uid);
                  save(BASE_KEYS.jobs, mergedJobs, uid);
                  save(BASE_KEYS.estimates, mergedEst, uid);
                  save(BASE_KEYS.invoices, mergedInv, uid);
                  save(BASE_KEYS.contracts, mergedCont, uid);
                }
                const company = load<CompanyInfo | null>(BASE_KEYS.company, null, uid);
                const measurements = load<any>(BASE_KEYS.measurements, [], uid);
                await cloudSave(uid, { customers: mergedCustomers, jobs: mergedJobs, estimates: mergedEst, invoices: mergedInv, contracts: mergedCont, company, measurements });
                setLastSync(new Date().toISOString());
              }
            } else {
              if (!localEmpty) {
                console.log('☁️ Cloud empty for this user, pushing local data to cloud');
                const company = load<CompanyInfo | null>(BASE_KEYS.company, null, uid);
                const measurements = load<any>(BASE_KEYS.measurements, [], uid);
                const res = await cloudSave(uid, { customers: localCustomers, jobs: localJobs, estimates: localEstimates, invoices: localInvoices, contracts: localContracts, company, measurements });
                if (res.success) setLastSync(new Date().toISOString());
                else setCloudError(res.error || 'Push failed');
              }
            }
          }
        } catch (e:any) {
          setCloudError(e?.message || String(e));
        } finally { setIsSyncing(false); }
      }
      setLoading(false);
      initialLoadDone.current = true;
    };
    setTimeout(loadAll, 600);
  }, []);

  // Local persistence per user
  useEffect(() => { if (!loading) save(BASE_KEYS.customers, customers); }, [customers, loading]);
  useEffect(() => { if (!loading) save(BASE_KEYS.jobs, jobs); }, [jobs, loading]);
  useEffect(() => { if (!loading) save(BASE_KEYS.estimates, estimates); }, [estimates, loading]);
  useEffect(() => { if (!loading) save(BASE_KEYS.invoices, invoices); }, [invoices, loading]);
  useEffect(() => { if (!loading) save(BASE_KEYS.contracts, contracts); }, [contracts, loading]);

  // Auto cloud save
  useEffect(() => {
    if (loading || !initialLoadDone.current) return;
    const uid = getCurrentUserId();
    if (!uid || !navigator.onLine) return;
    const timeout = setTimeout(async () => {
      setIsSyncing(true);
      setCloudError(null);
      try {
        const company = load<CompanyInfo | null>(BASE_KEYS.company, null, uid);
        const measurements = load<any>(BASE_KEYS.measurements, [], uid);
        const res = await cloudSave(uid, { customers, jobs, estimates, invoices, contracts, company, measurements });
        if (res.success) setLastSync(new Date().toISOString());
        else setCloudError(res.error || 'Auto sync failed');
      } catch (e:any) {
        setCloudError(e?.message);
      } finally { setIsSyncing(false); }
    }, 1800);
    return () => clearTimeout(timeout);
  }, [customers, jobs, estimates, invoices, contracts, loading]);

  useEffect(() => {
    const handleOnline = () => {
      console.log('📶 Back online - triggering sync');
      setTimeout(()=>{ syncNow(); }, 1000);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [customers, jobs, estimates, invoices, contracts]);

  const syncNow = useCallback(async () => {
    const uid = getCurrentUserId();
    if (!uid) { setCloudError('Not logged in'); return false; }
    if (!navigator.onLine) { setCloudError('Offline - check internet'); return false; }
    setIsSyncing(true);
    setCloudError(null);
    try {
      const cloudData = await cloudLoad(uid);
      if (cloudData && (cloudData.customers?.length || cloudData.jobs?.length)) {
        const mergedCustomers = mergeById(customers, cloudData.customers);
        const mergedJobs = mergeById(jobs, cloudData.jobs);
        const mergedEst = mergeById(estimates, cloudData.estimates);
        const mergedInv = mergeById(invoices, cloudData.invoices);
        const mergedCont = mergeById(contracts, cloudData.contracts);
        
        setCustomers(mergedCustomers);
        setJobs(mergedJobs);
        setEstimates(mergedEst);
        setInvoices(mergedInv);
        setContracts(mergedCont);
        
        save(BASE_KEYS.customers, mergedCustomers, uid);
        save(BASE_KEYS.jobs, mergedJobs, uid);
        save(BASE_KEYS.estimates, mergedEst, uid);
        save(BASE_KEYS.invoices, mergedInv, uid);
        save(BASE_KEYS.contracts, mergedCont, uid);
        
        if (cloudData.company) { try { localStorage.setItem(getKey(BASE_KEYS.company, uid), JSON.stringify(cloudData.company)); localStorage.setItem(BASE_KEYS.company, JSON.stringify(cloudData.company)); } catch {} }
        if (cloudData.updatedAt) { setLastSync(cloudData.updatedAt); save(BASE_KEYS.lastSync, cloudData.updatedAt, uid); }
        else { setLastSync(new Date().toISOString()); }
        
        const company = load<CompanyInfo | null>(BASE_KEYS.company, null, uid);
        const measurements = load<any>(BASE_KEYS.measurements, [], uid);
        await cloudSave(uid, { customers: mergedCustomers, jobs: mergedJobs, estimates: mergedEst, invoices: mergedInv, contracts: mergedCont, company, measurements });
        return true;
      } else {
        const company = load<CompanyInfo | null>(BASE_KEYS.company, null, uid);
        const measurements = load<any>(BASE_KEYS.measurements, [], uid);
        const res = await cloudSave(uid, { customers, jobs, estimates, invoices, contracts, company, measurements });
        if (res.success) { setLastSync(new Date().toISOString()); return true; }
        else { setCloudError(res.error||'Push failed'); return false; }
      }
    } catch (e:any) {
      setCloudError(e?.message || String(e));
      return false;
    } finally { setIsSyncing(false); }
  }, [customers, jobs, estimates, invoices, contracts]);

  const saveCustomer = useCallback(async (c: Customer) => {
    setCustomers(prev => { const exists = prev.find(p => p.id === c.id); return exists ? prev.map(p => p.id === c.id ? c : p) : [...prev, c]; });
  }, []);
  const deleteCustomer = useCallback(async (id: string) => { setCustomers(prev => prev.filter(p => p.id !== id)); }, []);
  const saveJob = useCallback(async (j: Job) => { setJobs(prev => { const exists = prev.find(p => p.id === j.id); return exists ? prev.map(p => p.id === j.id ? j : p) : [...prev, j]; }); }, []);
  const deleteJob = useCallback(async (id: string) => { setJobs(prev => prev.filter(p => p.id !== id)); }, []);
  const saveEstimate = useCallback(async (e: Estimate) => { setEstimates(prev => { const exists = prev.find(p => p.id === e.id); return exists ? prev.map(p => p.id === e.id ? e : p) : [...prev, e]; }); }, []);
  const deleteEstimate = useCallback(async (id: string) => { setEstimates(prev => prev.filter(p => p.id !== id)); }, []);
  const saveInvoice = useCallback(async (inv: Invoice) => { setInvoices(prev => { const exists = prev.find(p => p.id === inv.id); return exists ? prev.map(p => p.id === inv.id ? inv : p) : [...prev, inv]; }); }, []);
  const deleteInvoice = useCallback(async (id: string) => { setInvoices(prev => prev.filter(p => p.id !== id)); }, []);
  const saveContract = useCallback(async (c: Contract) => { setContracts(prev => { const exists = prev.find(p => p.id === c.id); return exists ? prev.map(p => p.id === c.id ? c : p) : [...prev, c]; }); }, []);
  const deleteContract = useCallback(async (id: string) => { setContracts(prev => prev.filter(p => p.id !== id)); }, []);

  const getCustomerById = useCallback((id: string) => customers.find(c => c.id === id), [customers]);
  const getJobById = useCallback((id: string) => jobs.find(j => j.id === id), [jobs]);

  return {
    loading, isSyncing, lastSync, cloudError, currentUserId,
    customers, jobs, estimates, invoices, contracts,
    saveCustomer, deleteCustomer,
    saveJob, deleteJob,
    saveEstimate, deleteEstimate,
    saveInvoice, deleteInvoice,
    saveContract, deleteContract,
    getCustomerById, getJobById,
    syncNow,
  };
}
