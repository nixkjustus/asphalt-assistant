import React, { useState, useRef, useEffect, useCallback, Component } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Page, Customer, Job, Estimate, Invoice, Contract, LineItem, ModuleName, CompanyInfo } from './types';
import { useAppData } from './hooks/useAppData';
import { useAuth, hashPassword } from './hooks/useAuth';
import { useCompanyInfo } from './hooks/useCompanyInfo';
import { useSubscription } from './hooks/useSubscription';
import { geocodeAddress, calculateAsphaltTonnage } from './utils/geocode';
import { getAIResponse } from './utils/aiAssistant';
import { generateAIEstimate, generateAIContract, type AIEstimateResult } from './utils/aiEstimator';
import { handleAIAction } from './utils/aiActions';
import { openPrintWithLogo } from './utils/print';
import Modal from './components/Modal';
import SignaturePad from './components/SignaturePad';
import LoginPage from './components/LoginPage';
import SignupPage from './components/SignupPage';
import UsersPage from './components/UsersPage';
import CompanySettingsPage from './components/CompanySettingsPage';
import MeasurePage from './components/MeasurePage';
import BillingPage from './components/BillingPage';
import CustomersPage from './components/CustomersPage';
import PlatformAdminPage from './components/PlatformAdminPage';
import AIChatBubble from './components/AIChatBubble';

function LazyMapView({ jobs, height }: { jobs: Job[]; height?: string }) {
  const [MapComp, setMapComp] = useState<any>(null);
  useEffect(() => {
    import('./components/MapView').then(mod => setMapComp(() => mod.default));
  }, []);
  if (!MapComp) return <div style={{ height: height || '500px' }} className="bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">Loading map...</div>;
  return <MapComp jobs={jobs} height={height} />;
}

const NAV_ITEMS: { page: Page; icon: string; label: string; module: ModuleName }[] = [
  { page: 'dashboard', icon: '📊', label: 'Dashboard', module: 'dashboard' },
  { page: 'customers', icon: '👥', label: 'Customers', module: 'customers' },
  { page: 'jobs', icon: '🔨', label: 'Jobs', module: 'jobs' },
  { page: 'estimates', icon: '📋', label: 'Estimates', module: 'estimates' },
  { page: 'invoices', icon: '💰', label: 'Invoices', module: 'invoices' },
  { page: 'contracts', icon: '📄', label: 'Contracts', module: 'contracts' },
  { page: 'map', icon: '🗺️', label: 'Map', module: 'map' },
  { page: 'ai-assistant', icon: '🤖', label: 'AI Assistant', module: 'ai' },
  { page: 'users', icon: '👤', label: 'Users', module: 'users' },
  { page: 'measure', icon: '📐', label: 'Measure', module: 'measure' },
  { page: 'settings', icon: '⚙️', label: 'Company', module: 'settings' },
  { page: 'billing', icon: '💳', label: 'Billing', module: 'billing' },
  { page: 'platform', icon: '👑', label: 'Owner Panel', module: 'platform' },
];


const JOB_TYPES = [
  { value: 'residential_remove_replace', label: 'Residential Driveway - Remove & Replace' },
  { value: 'residential_new', label: 'Residential Driveway - New Construction' },
  { value: 'residential_overlay', label: 'Residential Driveway - Overlay / Resurface' },
  { value: 'commercial_new', label: 'Commercial Parking Lot - New Construction' },
  { value: 'commercial_overlay', label: 'Commercial Parking Lot - Overlay' },
  { value: 'commercial_mill_overlay', label: 'Commercial Parking Lot - Mill & Overlay' },
  { value: 'residential_sealcoat', label: 'Sealcoating - Residential Driveway' },
  { value: 'commercial_sealcoat', label: 'Sealcoating - Commercial Parking Lot' },
  { value: 'commercial_sealcoat_crack_stripe', label: 'Full Maintenance - Seal, Crack Fill, Stripe' },
  { value: 'crack_fill_only', label: 'Crack Filling Only' },
  { value: 'pothole_patch', label: 'Pothole / Patch Repair' },
  { value: 'striping_only', label: 'Line Striping Only' },
  { value: 'apron_approach', label: 'Apron / Approach' },
  { value: 'walkway_path', label: 'Walkway / Sidewalk / Path' },
  { value: 'custom', label: 'Custom / Other' },
];

const BRAND_TOP = {
  black: '#000000',
  gold: '#C5A032',
  goldLight: '#D4B45A',
  goldDark: '#9C7C2E',
};

class ErrorBoundary extends Component<{ children: React.ReactNode; name?: string }, { hasError: boolean; error: any }> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any, info: any) { console.error(`ErrorBoundary ${this.props.name} caught:`, error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 text-center">
          <h3 className="font-black text-red-800">⚠️ {this.props.name || 'Component'} crashed</h3>
          <p className="text-sm text-red-700 mt-2 whitespace-pre-wrap">{this.state.error?.toString?.() || JSON.stringify(this.state.error)}</p>
          <div className="mt-4 flex gap-2 justify-center">
            <button type="button" onClick={()=>this.setState({hasError:false, error:null})} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold">Try Again</button>
            <button type="button" onClick={()=>{ try{localStorage.removeItem('ap_customers'); localStorage.removeItem('ap_jobs');}catch{} window.location.reload(); }} className="px-4 py-2 bg-gray-200 rounded-xl text-sm">Clear Cache & Reload</button>
          </div>
          <p className="text-[10px] text-gray-500 mt-3">If this keeps happening, check browser console (F12) and screenshot error for support.</p>
        </div>
      );
    }
    return this.props.children as any;
  }
}

function PrintHeader({ title, subtitle, customerName, date }: { title: string; subtitle?: string; customerName?: string; date?: string }) {
  const { company } = useCompanyInfo();
  return (
    <div className="print-area break-inside-avoid text-center">
      {/* Company Name at Top - No Logo As Requested - Clean Text Only */}
      <h1 className="font-black text-[20px] leading-none tracking-tight text-center" style={{ color: company.secondaryColor }}>{company.name}</h1>
      {/* Company Contact Info */}
      <div className="text-center mt-2">
        <p className="text-[11px] text-gray-700 font-medium">{company.address} • {company.city}, {company.state} {company.zip}</p>
        <p className="text-[11px] text-gray-600">{company.phone} • {company.email} • {company.website}</p>
        <p className="text-[10px] text-gray-500 mt-1">{company.tagline || ''} • {company.license}</p>
      </div>
      {/* Gold/Black Divider */}
      <div className="mt-3 mb-3 h-1 w-full rounded-full" style={{ background: `linear-gradient(90deg, ${company.primaryColor} 0%, ${company.secondaryColor} 100%)` }}></div>
      {/* Document Title */}
      <div className="text-left border rounded-xl p-3 bg-gray-50">
        <p className="font-black text-sm">{title}</p>
        {subtitle && <p className="text-xs text-gray-600 mt-1">{subtitle}</p>}
        <div className="flex flex-wrap gap-4 text-xs mt-2">
          {customerName && <span>Customer: <strong>{customerName}</strong></span>}
          {date && <span>Date: {date}</span>}
        </div>
      </div>
    </div>
  );
}

function NoAccess({ module, action = 'view this section' }: { module: string; action?: string }) {
  const { company } = useCompanyInfo();
  return (
    <div className="bg-white rounded-2xl border-2 border-dashed border-amber-300 p-8 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <h3 className="font-black text-lg">Access Restricted</h3>
      <p className="text-sm text-gray-600 mt-2">You don't have permission to {action} in <strong>{module}</strong>.</p>
      <p className="text-xs text-gray-400 mt-2">Contact your admin at {company.email} or {company.phone} to request access.</p>
      <div className="mt-4 inline-block px-3 py-1 rounded-full bg-black text-yellow-400 text-xs font-bold border" style={{ borderColor: company.primaryColor }}>Security • Role-Based Access</div>
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const data = useAppData();
  const companyHook = useCompanyInfo();
  const subHook = useSubscription(companyHook.company.name);

  // Auto-activate lifetime for platform owner (you) - paid forever
  useEffect(() => {
    if (!auth.loading && !subHook.loading && auth.currentUser) {
      const isOwner = auth.currentUser.username?.toLowerCase() === 'admin' || auth.currentUser.email?.toLowerCase() === 'justusasphalt@gmail.com';
      if (isOwner && subHook.subscription && !subHook.isLifetime) {
        // If owner exists but not lifetime, make lifetime automatically
        // Only if already has some subscription or trial - make it lifetime
        const hasSub = !!subHook.subscription;
        if (hasSub && subHook.subscription.status !== 'active') {
          // Don't auto-convert trial to lifetime automatically, only via button
          // But if owner explicitly wants lifetime, we will handle in PlatformAdminPage
          // For now, if owner and subscription is null or expired, make lifetime
        }
      }
      // If owner and no subscription at all, make lifetime immediately (your request: make my account paid forever)
      if (isOwner && !subHook.subscription) {
        setTimeout(() => {
          subHook.activateLifetime('Platform Owner - Lifetime');
        }, 500);
      }
      // If owner and subscription exists but is expired/trial, upgrade to lifetime if they are admin and want forever
      // We'll also auto-upgrade if username is admin - per your request "Make my account subscription paid for ever"
      if (isOwner && subHook.subscription && (subHook.isExpired || subHook.isTrial) && !subHook.isLifetime) {
        // Auto-make lifetime for owner per request
        setTimeout(() => {
          subHook.activateLifetime('Owner Lifetime - Black Gold');
        }, 800);
      }
    }
  }, [auth.loading, subHook.loading, auth.currentUser?.id, subHook.subscription?.id]);
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') {
      showToast('App installed! You can now use it offline.');
      setInstallPrompt(null);
    }
  };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleSignup = async (signupData: { company: CompanyInfo; admin: { username: string; password: string; displayName: string; email: string } }) => {
    try {
      // Clear existing data to start fresh for new company
      // IMPORTANT: Also clear per-user keys to avoid cross-contamination
      const keysToClear = ['ap_customers','ap_jobs','ap_estimates','ap_invoices','ap_contracts','bg_users','bg_session','bg_subscription','bg_company'];
      keysToClear.forEach(k => { 
        try { 
          localStorage.removeItem(k);
          // Also clear per-user variants
          Object.keys(localStorage).forEach(lsKey => {
            if (lsKey.startsWith(k+'_')) localStorage.removeItem(lsKey);
          });
        } catch {} 
      });
      // Clear ALL per-user data to ensure fresh start for new company (except platform Stripe which is global)
      try {
        const allKeys = Object.keys(localStorage);
        allKeys.forEach(k => {
          // Keep platform stripe config (global for all companies - owner controls where money goes)
          if (k === 'bg_platform_stripe' || k.startsWith('bg_platform_')) return;
          // Clear any per-user keys or global ap_ / bg_company / bg_users etc for fresh account
          // But we already cleared global via keysToClear, now clear per-user variants
          if (k.startsWith('bg_company_') || k.startsWith('ap_customers_') || k.startsWith('ap_jobs_') || k.startsWith('ap_estimates_') || k.startsWith('ap_invoices_') || k.startsWith('ap_contracts_') || k.startsWith('bg_last_sync_') || k.startsWith('bg_measurements_') || k.startsWith('bg_subscription_')) {
            localStorage.removeItem(k);
          }
        });
        console.log('🧹 Cleared all per-user data for fresh signup, kept platform Stripe');
      } catch {}

      // Create admin user FIRST so we have userId for per-user company save
      const hash = await hashPassword(signupData.admin.password);
      const newAdminId = uuidv4();
      const newAdmin = {
        id: newAdminId,
        username: signupData.admin.username.trim(),
        passwordHash: hash,
        displayName: signupData.admin.displayName.trim(),
        email: signupData.admin.email.trim(),
        role: 'admin' as const,
        permissions: (await import('./types')).DEFAULT_PERMISSIONS.admin,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      // Save users and session FIRST - so company save can use per-user key
      localStorage.setItem('bg_users', JSON.stringify([newAdmin]));
      localStorage.setItem('bg_session', JSON.stringify({ userId: newAdmin.id }));
      try {
        window.dispatchEvent(new CustomEvent('bg_session_changed', { detail: { userId: newAdmin.id } }));
      } catch {}

      // NOW save company with correct per-user isolation (userId exists)
      companyHook.setFullCompany(signupData.company);
      // Also directly save per-user to be sure (since hook may have old uid)
      try {
        localStorage.setItem(`bg_company_${newAdminId}`, JSON.stringify(signupData.company));
        localStorage.setItem('bg_company', JSON.stringify(signupData.company)); // for immediate display
      } catch {}

      // Create trial subscription - 14 days free, no card needed
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 14);
      const trialSub = {
        id: uuidv4(),
        companyName: signupData.company.name,
        status: 'trial' as const,
        plan: 'yearly' as const,
        price: 49.99,
        currency: 'USD',
        trialStart: now.toISOString(),
        trialEnd: trialEnd.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      localStorage.setItem('bg_subscription', JSON.stringify(trialSub));
      localStorage.setItem(`bg_subscription_${newAdminId}`, JSON.stringify(trialSub));

      console.log(`✅ New company created: ${signupData.company.name} for user ${newAdminId} (per-user isolated)`);
      
      showToast(`🎉 Welcome ${signupData.company.name}! 14-day free trial started - no card needed!`);
      setTimeout(() => {
        window.location.reload();
      }, 800);

      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.message || 'Signup failed' };
    }
  };

  if (auth.loading || data.loading || companyHook.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: companyHook.company.secondaryColor }}>
        <div className="text-center p-6">
          <img src={companyHook.logoUrl} alt="Logo" className="w-56 h-56 mx-auto mb-6 object-contain bg-white rounded-2xl p-3 shadow-2xl" onError={(e:any)=>e.target.style.display='none'} />
          <h1 className="text-2xl font-black text-white mb-1 tracking-wide">{companyHook.company.name}</h1>
          <p className="text-sm" style={{ color: companyHook.company.primaryColor }}>{companyHook.company.address}</p>
          <p className="mt-6 animate-pulse font-bold flex items-center justify-center gap-2" style={{ color: companyHook.company.primaryColor }}><span className="w-2 h-2 bg-yellow-400 rounded-full animate-ping"></span>Loading...</p>
        </div>
      </div>
    );
  }

  if (!auth.currentUser) {
    if (authMode === 'signup') {
      return <SignupPage onSignup={handleSignup} onBackToLogin={()=>setAuthMode('login')} defaultCompanyName="" />;
    }
    return <LoginPage onLogin={auth.login} onSignupClick={()=>setAuthMode('signup')} />;
  }

  // Subscription handling - auto-start trial for new companies
  // If no subscription exists and user is admin, auto-start trial
  if (!subHook.loading && !subHook.subscription && auth.currentUser && companyHook.company.name) {
    // Defer to next tick to avoid setState during render
    setTimeout(() => {
      if (!loadSubExists()) {
        subHook.startTrial(companyHook.company.name);
      }
    }, 100);
  }

  function loadSubExists() {
    try {
      return !!localStorage.getItem('bg_subscription');
    } catch { return false; }
  }

  // If trial expired and no active subscription, block access except billing/settings/users
  const allowedDuringExpired = ['billing', 'settings', 'users'];
  if (subHook.shouldBlockAccess && !allowedDuringExpired.includes(effectivePage) && !subHook.loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex">
        <aside className="w-64 bg-black text-white hidden md:flex flex-col" style={{ background: companyHook.company.secondaryColor }}>
          <div className="p-4 border-b border-white/10 flex flex-col items-center text-center">
            <img src={companyHook.logoUrl} alt="Logo" className="w-full max-w-[180px] bg-white rounded-xl p-2 mb-3" />
            <h1 className="text-[15px] font-black" style={{ color: companyHook.company.primaryColor }}>{companyHook.company.name}</h1>
          </div>
          <div className="p-4 text-xs text-gray-400">Subscription expired - Please renew to continue</div>
          <div className="mt-auto p-3">
            <button type="button" onClick={auth.logout} className="w-full py-2 rounded-xl bg-zinc-800 text-xs font-bold">Logout</button>
          </div>
        </aside>
        <main className="flex-1 p-4 md:p-8">
          <div className="max-w-3xl mx-auto">
            <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-6 mb-6 text-center">
              <h2 className="text-2xl font-black text-red-800">🔒 Subscription Required</h2>
              <p className="text-sm text-red-700 mt-2">Your 14-day trial has ended. Subscribe for $49.99/year to continue using {companyHook.company.name} management.</p>
              <p className="text-xs text-gray-600 mt-2">You can still access Billing, Company Settings, and Users, but other features are locked until you subscribe.</p>
            </div>
            <BillingPage />
            <div className="mt-6 flex gap-3 justify-center">
              <button type="button" onClick={()=>setCurrentPage('billing')} className="px-6 py-3 rounded-xl bg-black text-yellow-400 font-black border" style={{ borderColor: companyHook.company.primaryColor }}>Go to Billing</button>
              <button type="button" onClick={auth.logout} className="px-6 py-3 rounded-xl bg-gray-200 font-bold">Logout</button>
            </div>
          </div>
        </main>
      </div>
    );
  }


  const isPlatformOwner = auth.currentUser?.username?.toLowerCase() === 'admin' || auth.currentUser?.email?.toLowerCase() === 'justusasphalt@gmail.com' || auth.currentUser?.email?.toLowerCase() === 'support@asphaltassistant.com';
  const visibleNav = NAV_ITEMS.filter(item => {
    if (item.module === 'platform') return isPlatformOwner; // Only owner sees Owner Panel
    return auth.canViewModule(item.module);
  });
  const canViewCurrent = auth.canViewModule(NAV_ITEMS.find(n=>n.page===currentPage)?.module || 'dashboard');
  let effectivePage = currentPage;
  if (!canViewCurrent) {
    const firstAllowed = visibleNav[0]?.page || 'dashboard';
    if (firstAllowed !== currentPage) {
      setTimeout(()=>setCurrentPage(firstAllowed),0);
      effectivePage = firstAllowed;
    }
  }

  const brandGold = companyHook.company.primaryColor;
  const brandBlack = companyHook.company.secondaryColor;

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <aside className={`fixed md:static inset-y-0 left-0 z-30 w-64 text-white transform transition-transform duration-300 flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`} style={{ background: brandBlack }}>
        <div className="p-4 border-b border-white/10 flex flex-col items-center text-center">
          <img src={companyHook.logoUrl} alt="Logo" className="w-full max-w-[200px] h-auto bg-white rounded-xl p-2 mb-3 shadow-lg" onError={(e:any)=>e.target.style.display='none'} />
          <h1 className="text-[15px] font-black leading-tight tracking-wide" style={{ color: brandGold }}>{companyHook.company.name}</h1>
          <p className="text-[11px] text-white mt-1 font-medium">{companyHook.company.phone}</p>
          <p className="text-[10px] text-gray-400">{companyHook.company.city}, {companyHook.company.state}</p>
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          {visibleNav.map(item => (
            <button type="button" key={item.page} onClick={() => { setCurrentPage(item.page); setSidebarOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-4" style={{ background: effectivePage === item.page ? '#1a1a1a' : 'transparent', color: effectivePage === item.page ? brandGold : '#d1d5db', borderLeftColor: effectivePage === item.page ? brandGold : 'transparent', fontWeight: effectivePage === item.page ? 800 : 400 }}>
              <span className="text-xl">{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm" style={{ background: brandGold, color: '#000' }}>{auth.currentUser.displayName.charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-white truncate">{auth.currentUser.displayName}</p>
              <p className="text-[10px] font-bold" style={{ color: brandGold }}>@{auth.currentUser.username} • {auth.currentUser.role.toUpperCase()}</p>
            </div>
            <button type="button" onClick={auth.logout} className="text-[10px] px-2 py-1 rounded-full bg-zinc-800 text-gray-400 hover:text-white border border-zinc-700">Logout</button>
          </div>
          <div className="mt-3 text-[10px] text-gray-500 text-center">
            <p>📍 {companyHook.company.city}, {companyHook.company.state}</p>
            <p>✉️ {companyHook.company.email}</p>
          </div>
        </div>
      </aside>

      {sidebarOpen && (<div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />)}

      <main className="flex-1 min-h-screen min-w-0">
        <header className="bg-white shadow-sm border-b px-4 py-3 flex items-center gap-4 sticky top-0 z-10 border-l-4" style={{ borderLeftColor: brandGold }}>
          <button type="button" onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden text-2xl">☰</button>
          <img src={companyHook.logoUrl} alt="logo" className="w-8 h-8 rounded-lg bg-white border md:hidden" onError={(e:any)=>e.target.style.display='none'} />
          <h2 className="text-xl font-black flex-1 tracking-tight" style={{ color: brandBlack }}>{NAV_ITEMS.find(n => n.page === effectivePage)?.icon} {NAV_ITEMS.find(n => n.page === effectivePage)?.label}</h2>
          <div className="hidden md:flex items-center gap-2 text-xs bg-black text-yellow-400 px-3 py-1 rounded-full border font-bold" style={{ borderColor: brandGold }}>👤 {auth.currentUser.displayName} • {auth.currentUser.role}</div>
          <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${isOnline ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}><span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}></span>{isOnline ? 'Online' : 'Offline'}</div>
          {/* Cloud Sync Status - VISIBLE ON ALL DEVICES NOW (fixed per user request) */}
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-bold ${data.isSyncing ? 'bg-blue-50 text-blue-700 border-blue-200' : data.lastSync ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${data.isSyncing ? 'bg-blue-500 animate-pulse' : data.lastSync ? 'bg-green-500' : 'bg-amber-500'}`}></span>
            <span className="hidden sm:inline">{data.isSyncing ? '☁️ Syncing...' : data.lastSync ? `☁️ Synced ${new Date(data.lastSync).toLocaleTimeString()}` : '☁️ Local only - Tap Sync'}</span>
            <span className="sm:hidden">{data.isSyncing ? '☁️...' : data.lastSync ? '☁️OK' : '☁️Local'}</span>
          </div>
          <button type="button" onClick={()=>data.syncNow()} disabled={data.isSyncing || !isOnline} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-black text-yellow-400 border-2 font-black hover:bg-zinc-800 disabled:opacity-40 active:scale-95" style={{ borderColor: companyHook.company.primaryColor }}>
            {data.isSyncing ? '⏳ Syncing' : '🔄 Sync Now'}
          </button>
          {installPrompt && (<button type="button" onClick={handleInstall} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-bold text-black shadow" style={{ background: `linear-gradient(135deg, ${brandGold} 0%, ${companyHook.company.primaryColor} 100%)` }}>📲 Install App</button>)}
          <button type="button" onClick={auth.logout} className="md:hidden text-xs px-2 py-1 rounded-full bg-black text-yellow-400 border font-bold" style={{ borderColor: brandGold }}>Logout</button>
        </header>

        <div className="p-4 md:p-6 max-w-7xl mx-auto">
          {/* Trial Banner */}
          {subHook.subscription && subHook.isTrial && subHook.daysLeftInTrial > 0 && subHook.daysLeftInTrial <= 14 && (
            <div className="mb-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">🎉</div>
                <div>
                  <p className="font-black text-sm">Free Trial - {subHook.daysLeftInTrial} days left</p>
                  <p className="text-xs opacity-90">No card needed yet. After trial, $49.99/year. Subscribe anytime.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={()=>setCurrentPage('billing')} className="px-4 py-2 rounded-xl bg-white text-black text-xs font-black">View Billing</button>
                <div className="text-xs bg-white/20 px-3 py-2 rounded-xl">{subHook.daysLeftInTrial} days</div>
              </div>
            </div>
          )}
          {subHook.isTrialExpired && (
            <div className="mb-4 bg-red-600 text-white rounded-xl p-4 flex justify-between items-center shadow-lg">
              <div>
                <p className="font-black">⚠️ Trial Expired</p>
                <p className="text-xs">Subscribe for $49.99/year to continue. No payment info was needed during trial.</p>
              </div>
              <button type="button" onClick={()=>setCurrentPage('billing')} className="px-5 py-2.5 rounded-xl bg-white text-red-600 font-black text-sm">Subscribe Now</button>
            </div>
          )}

          {/* Cloud Sync Status Card - ALWAYS VISIBLE (mobile + desktop) - Fixed per user request */}
          <div className="mb-4 bg-white border-2 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3 shadow-sm" style={{ borderColor: data.isSyncing ? '#93c5fd' : data.lastSync ? '#86efac' : '#fcd34d' }}>
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-3 h-3 rounded-full ${data.isSyncing ? 'bg-blue-500 animate-pulse' : data.lastSync ? 'bg-green-500' : 'bg-amber-500'}`}></div>
              <div className="flex-1">
                <p className="text-sm font-black">
                  {data.isSyncing ? '☁️ Syncing to Cloud...' : data.lastSync ? `☁️ Cloud Sync Active - Last: ${new Date(data.lastSync).toLocaleTimeString()}` : '☁️ Local Only - Not Yet Synced to Cloud'}
                </p>
                <p className="text-xs text-gray-600">
                  {data.isSyncing ? 'Saving your data to Netlify Blobs so other devices can see it...' : data.lastSync ? `${data.customers.length} customers • ${data.jobs.length} jobs synced • Tap Sync Now to force refresh from cloud` : 'No cloud sync yet. Add a customer then tap Sync Now. If offline, will sync when back online.'}
                </p>
                {(data as any).cloudError && <p className="text-xs text-red-600 mt-1 font-bold">⚠️ Sync Error: {(data as any).cloudError} - Check internet & try Sync Now</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={()=>data.syncNow()} disabled={data.isSyncing || !isOnline} className="px-4 py-2.5 rounded-xl bg-black text-yellow-400 border-2 font-black text-xs hover:bg-zinc-800 disabled:opacity-40 flex items-center gap-1.5" style={{ borderColor: companyHook.company.primaryColor }}>
                {data.isSyncing ? '⏳ Syncing...' : '🔄 Sync Now - Pull from Cloud'}
              </button>
              <span className="text-[10px] bg-gray-100 px-2 py-2.5 rounded-xl border hidden sm:flex items-center">{isOnline ? '🟢 Online' : '🔴 Offline'}</span>
            </div>
          </div>

          <ErrorBoundary name="Page">
          {effectivePage === 'dashboard' && (auth.canViewModule('dashboard') ? <Dashboard data={data} setPage={setCurrentPage} auth={auth} /> : <NoAccess module="Dashboard" />)}
          {effectivePage === 'customers' && (auth.canViewModule('customers') ? <ErrorBoundary name="Customers"><CustomersPage data={data} showToast={showToast} auth={auth} /></ErrorBoundary> : <NoAccess module="Customers" />)}
          {effectivePage === 'jobs' && (auth.canViewModule('jobs') ? <ErrorBoundary name="Jobs"><JobsPage data={data} showToast={showToast} auth={auth} /></ErrorBoundary> : <NoAccess module="Jobs" />)}
          {effectivePage === 'estimates' && (auth.canViewModule('estimates') ? <ErrorBoundary name="Estimates"><EstimatesPage data={data} showToast={showToast} auth={auth} /></ErrorBoundary> : <NoAccess module="Estimates" />)}
          {effectivePage === 'invoices' && (auth.canViewModule('invoices') ? <ErrorBoundary name="Invoices"><InvoicesPage data={data} showToast={showToast} auth={auth} /></ErrorBoundary> : <NoAccess module="Invoices" />)}
          {effectivePage === 'contracts' && (auth.canViewModule('contracts') ? <ErrorBoundary name="Contracts"><ContractsPage data={data} showToast={showToast} auth={auth} /></ErrorBoundary> : <NoAccess module="Contracts" />)}
          {effectivePage === 'map' && (auth.canViewModule('map') ? <MapPage data={data} auth={auth} /> : <NoAccess module="Map" />)}
          {effectivePage === 'ai-assistant' && (auth.canViewModule('ai') ? <AIPage data={data} showToast={showToast} auth={auth} /> : <NoAccess module="AI Assistant" />)}
          {effectivePage === 'measure' && (auth.canViewModule('measure') ? <MeasurePage /> : <NoAccess module="Measure" />)}
          {effectivePage === 'users' && (auth.canViewModule('users') ? <UsersPage users={auth.users} currentUser={auth.currentUser} onCreate={auth.createUser} onUpdate={auth.updateUser} onDelete={auth.deleteUser} onToggleActive={auth.toggleActive} canManageUsers={auth.can('users','create') || auth.isAdmin} /> : <NoAccess module="Users Management" />)}
                    {effectivePage === 'settings' && (auth.canViewModule('settings') ? <CompanySettingsPage canEdit={auth.can('settings','edit') || auth.isAdmin} /> : <NoAccess module="Company Settings" />)}
          {effectivePage === 'billing' && (auth.canViewModule('billing') ? <BillingPage /> : <NoAccess module="Billing" />)}
          {effectivePage === 'platform' && (isPlatformOwner ? <PlatformAdminPage /> : <NoAccess module="Platform Owner Panel - Only for Asphalt Assistant Owner" />)}
          </ErrorBoundary>
        </div>
      </main>

      {!isOnline && (<div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium shadow-lg">📴 Offline — Data saved locally</div>)}

      {toast && (<div className="fixed bottom-20 right-4 bg-black text-white px-6 py-3 rounded-xl shadow-xl z-40 fade-in border-2 flex gap-2 items-center" style={{ borderColor: brandGold }}><span className="text-xl">✅</span><span className="text-sm font-medium whitespace-pre-wrap">{toast}</span></div>)}

      {/* AI Chat Bubble - Always visible at bottom for help with any problems */}
      <AIChatBubble />
    </div>
  );
}

function Dashboard({ data, setPage, auth }: { data: ReturnType<typeof useAppData>; setPage: (p: Page) => void; auth: ReturnType<typeof useAuth> }) {
  const { company, logoUrl } = useCompanyInfo();
  const BRAND = { gold: company.primaryColor, black: company.secondaryColor };
  const activeJobs = data.jobs.filter(j => j.status === 'in-progress').length;
  const scheduledJobs = data.jobs.filter(j => j.status === 'scheduled').length;
  const pendingEst = data.estimates.filter(e => e.status === 'sent').length;
  const unpaidInv = data.invoices.filter(i => i.status === 'sent' || i.status === 'overdue');
  const revenue = data.invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
  const cards = [
    { label: 'Customers', val: data.customers.length, icon: '👥', bg: '#000000', pg: 'customers' as Page, mod: 'customers' as ModuleName },
    { label: 'Active Jobs', val: activeJobs, icon: '🔨', bg: BRAND.gold, pg: 'jobs' as Page, mod: 'jobs' as ModuleName, textBlack: true },
    { label: 'Scheduled', val: scheduledJobs, icon: '📅', bg: BRAND.gold, pg: 'jobs' as Page, mod: 'jobs' as ModuleName, textBlack: true },
    { label: 'Estimates', val: pendingEst, icon: '📋', bg: '#1f1f1f', pg: 'estimates' as Page, mod: 'estimates' as ModuleName },
    { label: 'Unpaid', val: unpaidInv.length, icon: '⚠️', bg: '#8b0000', pg: 'invoices' as Page, mod: 'invoices' as ModuleName },
    { label: 'Revenue', val: '$' + revenue.toLocaleString(), icon: '💰', bg: '#FFD700', pg: 'invoices' as Page, mod: 'invoices' as ModuleName, textBlack: true },
  ];
  return (
    <div className="space-y-6">
      <div className="bg-black text-white rounded-2xl p-5 flex items-center gap-4 border-2 shadow-lg" style={{ borderColor: BRAND.gold }}>
        <img src={logoUrl} alt="logo" className="w-24 h-24 rounded-xl bg-white p-2 object-contain" onError={(e:any)=>e.target.style.display='none'} />
        <div className="flex-1">
          <h2 className="text-xl font-black" style={{ color: BRAND.gold }}>{company.name}</h2>
          <p className="text-sm text-gray-300">{company.address} • {company.city}, {company.state}</p>
          <p className="text-sm font-bold mt-1">{company.phone} • {company.email}</p>
          <p className="text-xs mt-2">Welcome, <span style={{ color: BRAND.gold }} className="font-black">{auth.currentUser?.displayName}</span> • Role: <strong className="uppercase">{auth.currentUser?.role}</strong> • {company.tagline}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.filter(c=>auth.canViewModule(c.mod)).map(c => (
          <button type="button" key={c.label} onClick={() => { if (auth.canViewModule(c.mod)) setPage(c.pg); }} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition text-left border-t-4" style={{ borderColor: BRAND.gold }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl mb-2" style={{ background: c.bg, color: (c as any).textBlack ? '#000' : '#fff' }}>{c.icon}</div>
            <p className="text-2xl font-black" style={{ color: BRAND.black }}>{c.val}</p>
            <p className="text-sm text-gray-500 font-medium">{c.label}</p>
          </button>
        ))}
      </div>
      {unpaidInv.length > 0 && auth.canViewModule('invoices') && (<div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 border-l-8" style={{ borderLeftColor: BRAND.gold }}><h3 className="font-black text-amber-900">💵 Outstanding: ${unpaidInv.reduce((s, i) => s + i.balanceDue, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</h3><p className="text-sm text-amber-700">{unpaidInv.length} invoice(s) awaiting payment</p></div>)}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-5 border-t-4" style={{ borderColor: BRAND.black }}><h3 className="font-black mb-3">🔨 Recent Jobs</h3>{data.jobs.length === 0 ? <p className="text-gray-400 text-sm">No jobs yet</p> : <div className="space-y-2">{data.jobs.slice(-5).reverse().map(j => (<div key={j.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"><div><p className="font-medium text-sm">{j.title}</p><p className="text-xs text-gray-500">{j.customerName}</p></div><StatusBadge status={j.status} /></div>))}</div>}</div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-t-4" style={{ borderColor: BRAND.gold }}><h3 className="font-black mb-3">🗺️ Job Locations - {company.city}</h3><LazyMapView jobs={data.jobs.filter(j => j.lat && j.lng)} height="250px" /></div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    potential: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    scheduled: 'bg-stone-100 text-stone-800 border-stone-300',
    'in-progress': 'bg-amber-100 text-amber-900 border-amber-400',
    completed: 'bg-green-100 text-green-700 border-green-300',
    cancelled: 'bg-red-100 text-red-700 border-red-300',
    draft: 'bg-gray-100 text-gray-600 border-gray-300',
    sent: 'bg-blue-100 text-blue-700 border-blue-300',
    accepted: 'bg-green-100 text-green-700 border-green-300',
    declined: 'bg-red-100 text-red-700 border-red-300',
    paid: 'bg-green-100 text-green-700 border-green-300',
    overdue: 'bg-red-100 text-red-700 border-red-300',
    signed: 'bg-green-100 text-green-700 border-green-300',
    active: 'bg-black text-yellow-400 border-yellow-500',
  };
  return <span className={`text-xs px-2 py-1 rounded-full border font-bold ${colors[status] || 'bg-gray-100'}`}>{status}</span>;
}

function Btn({ children, color = 'gray', onClick, type = 'button', disabled = false }: { children: any; color?: string; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean }) {
  const c: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
    red: 'bg-red-100 text-red-700 hover:bg-red-200',
    green: 'bg-green-100 text-green-700 hover:bg-green-200',
    gray: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    amber: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
    gold: 'bg-black text-yellow-400 hover:bg-zinc-900 border border-yellow-500 font-bold',
    black: 'bg-black text-white hover:bg-zinc-800',
  };
  return <button disabled={disabled} type={type} onClick={onClick} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${c[color] || c.gray} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>{children}</button>;
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string | number; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  const { company } = useCompanyInfo();
  return (
    <div><label className="block text-sm font-bold text-gray-700 mb-1">{label}</label><input type={type} value={value as any} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none" onFocus={e=>e.currentTarget.style.boxShadow=`0 0 0 2px ${company.primaryColor}`} onBlur={e=>e.currentTarget.style.boxShadow=''} /></div>
  );
}

// CUSTOMERS - Now imported from ./components/CustomersPage.tsx - ultra safe, no white screen
// JOBS
function JobsPage({ data, showToast, auth }: { data: ReturnType<typeof useAppData>; showToast: (m: string) => void; auth: ReturnType<typeof useAuth> }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [filter, setFilter] = useState('all');
  const filtered = data.jobs.filter(j => filter === 'all' || j.status === filter);
  const canCreate = auth.can('jobs','create');
  const canEdit = auth.can('jobs','edit');
  const canDelete = auth.can('jobs','delete');
  const { company } = useCompanyInfo();
  const save = async (j: Job) => {
    if (!canCreate && !editing) return showToast('No permission to create jobs');
    if (editing && !canEdit) return showToast('No permission to edit');
    if (j.address && j.city && j.state) { try { const coords = await geocodeAddress(j.address, j.city, j.state, j.zip); if (coords) { j.lat = coords.lat; j.lng = coords.lng; } } catch {} }
    if (j.squareFootage && j.depth) j.asphaltTonnage = calculateAsphaltTonnage(j.squareFootage, j.depth);
    await data.saveJob(j); setShowForm(false); setEditing(null); showToast(editing ? 'Job updated!' : 'Job added!');
  };
  const del = async (id: string) => {
    if (!canDelete) return showToast('No permission to delete');
    if (confirm('Delete this job?')) { await data.deleteJob(id); showToast('Job deleted!'); }
  };
  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4"><select value={filter} onChange={e => setFilter(e.target.value)} className="px-4 py-2 border rounded-lg"><option value="all">All Statuses</option><option value="potential">Potential</option><option value="scheduled">Scheduled</option><option value="in-progress">In Progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select><div className="flex-1" />{canCreate && <button type="button" onClick={() => { setEditing(null); setShowForm(true); }} className="px-5 py-2 text-black rounded-xl font-black" style={{ background: company.primaryColor }}>+ Add Job</button>}</div>
      <div className="grid gap-3">{filtered.length === 0 && <p className="text-gray-400 text-center py-8">No jobs found</p>}{filtered.map(j => (<div key={j.id} className="bg-white rounded-xl p-4 shadow-sm border-l-4" style={{ borderLeftColor: company.primaryColor }}><div className="flex flex-col md:flex-row md:items-start justify-between gap-3"><div className="flex-1"><div className="flex items-center gap-2 flex-wrap"><h3 className="font-black" style={{ color: company.secondaryColor }}>{j.title}</h3><StatusBadge status={j.status} />{j.asphaltTonnage ? <span className="text-xs bg-black text-yellow-400 px-2 py-1 rounded-full border font-bold" style={{ borderColor: company.primaryColor }}>~{j.asphaltTonnage} tons</span> : null}</div><p className="text-sm text-gray-600 mt-1">{j.customerName} • {j.address}, {j.city}</p><p className="text-sm text-gray-500 mt-1 line-clamp-2">{j.description}</p><div className="flex gap-4 text-xs text-gray-500 mt-2 flex-wrap">{j.squareFootage ? <span>📐 {j.squareFootage} sq ft</span> : null}{j.depth ? <span>📏 {j.depth}" depth</span> : null}{j.scheduledDate ? <span>📅 {j.scheduledDate}</span> : null}</div></div>              <div className="flex flex-col gap-2 shrink-0 items-end">
                <div className="flex gap-1 flex-wrap justify-end">
                  {canEdit && j.status === 'potential' && <button type="button" onClick={async ()=>{ const updated={...j, status:'scheduled' as const, scheduledDate: new Date().toISOString().split('T')[0]}; await data.saveJob(updated); showToast('Marked as Scheduled'); }} className="px-2.5 py-1 rounded-full text-[11px] font-black bg-blue-600 text-white hover:bg-blue-700">📅 Schedule</button>}
                  {canEdit && j.status === 'scheduled' && <button type="button" onClick={async ()=>{ const updated={...j, status:'in-progress' as const}; await data.saveJob(updated); showToast('Started - In Progress'); }} className="px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-500 text-white hover:bg-amber-600">🔨 Start</button>}
                  {canEdit && j.status === 'in-progress' && <button type="button" onClick={async ()=>{ const updated={...j, status:'completed' as const, completedDate: new Date().toISOString().split('T')[0]}; await data.saveJob(updated); showToast('Completed!'); }} className="px-2.5 py-1 rounded-full text-[11px] font-black bg-green-600 text-white hover:bg-green-700">✅ Complete</button>}
                  {canEdit && j.status === 'completed' && <button type="button" onClick={async ()=>{ const updated={...j, status:'scheduled' as const}; await data.saveJob(updated); showToast('Reopened as Scheduled'); }} className="px-2.5 py-1 rounded-full text-[11px] font-black bg-gray-600 text-white">↩️ Reopen</button>}
                </div>
                <div className="flex gap-1.5">
                  <select value={j.status} onChange={async (e)=>{ const newStatus=e.target.value as any; const updated={...j, status:newStatus, ...(newStatus==='completed'?{completedDate:new Date().toISOString().split('T')[0]}:{}), ...(newStatus==='scheduled' && !j.scheduledDate?{scheduledDate:new Date().toISOString().split('T')[0]}:{})}; await data.saveJob(updated); showToast(`Status → ${newStatus}`); }} className="text-[11px] px-2 py-1 rounded-full border bg-white font-bold" disabled={!canEdit}>
                    <option value="potential">Potential</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  {canEdit && <Btn color="gold" onClick={() => { setEditing(j); setShowForm(true); }}>Edit</Btn>}
                  {canDelete && <Btn color="red" onClick={() => del(j.id)}>Delete</Btn>}
                  {!canEdit && !canDelete && <span className="text-xs text-gray-400">View Only</span>}
                </div>
              </div></div></div>))}</div>
      {showForm && (canCreate || canEdit) && <JobForm job={editing} customers={data.customers} onSave={save} onClose={() => { setShowForm(false); setEditing(null); }} />}
    </div>
  );
}

function JobForm({ job, customers, onSave, onClose }: { job: Job | null; customers: Customer[]; onSave: (j: Job) => void; onClose: () => void }) {
  const [f, setF] = useState<Job>(job || {
    id: uuidv4(),
    customerId: customers[0]?.id || '',
    customerName: customers[0]?.name || '',
    title: '',
    description: '',
    address: customers[0]?.address || '',
    city: customers[0]?.city || 'Columbus',
    state: customers[0]?.state || 'OH',
    zip: customers[0]?.zip || '',
    status: 'potential',
    squareFootage: 1200,
    depth: 3,
    scheduledDate: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
  });
  const [geoStatus, setGeoStatus] = useState<'idle'|'checking'|'found'|'notfound'>('idle');
  const [geoMessage, setGeoMessage] = useState('');
  const [showMapPreview, setShowMapPreview] = useState(false);

  const update = (k: keyof Job, v: any) => setF(p => ({ ...p, [k]: v }));

  const handleCustomerChange = (custId: string) => {
    const c = customers.find(x => x.id === custId);
    if (c) {
      setF(p => ({ ...p, customerId: c.id, customerName: c.name, address: c.address, city: c.city, state: c.state, zip: c.zip }));
    } else {
      setF(p => ({ ...p, customerId: custId }));
    }
  };

  const tonnage = f.squareFootage && f.depth ? calculateAsphaltTonnage(f.squareFootage, f.depth) : 0;

  const handleCheckMap = async () => {
    if (!f.address && !f.city) {
      setGeoStatus('notfound');
      setGeoMessage('Enter at least street address and city to check map');
      setShowMapPreview(false);
      return;
    }
    setGeoStatus('checking');
    setGeoMessage('🔍 Checking if this address will show on map - searching 2 providers...');
    setShowMapPreview(false);
    try {
      // Try robust search - first with our geocodeAddress, then fallback to direct search
      let coords = null;
      try {
        coords = await geocodeAddress(f.address, f.city, f.state, f.zip);
      } catch {}
      
      // If not found, try broader search with just city/state
      if (!coords && f.city) {
        try {
          const query = `${f.address || ''} ${f.city} ${f.state} ${f.zip}`.trim();
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
          if (res.ok) {
            const data = await res.json();
            if (data && data[0]) {
              coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            }
          }
        } catch {}
      }

      if (coords) {
        setF(p => ({ ...p, lat: coords.lat, lng: coords.lng }));
        setGeoStatus('found');
        setGeoMessage(`✅ FOUND! Will show on map at ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} - Check preview below`);
        setShowMapPreview(true);
      } else {
        setGeoStatus('notfound');
        setGeoMessage(`❌ NOT FOUND on map - Address "${f.address}, ${f.city}" could not be geocoded. Tips: 1) Check spelling 2) Add ZIP code 3) Use nearby intersection like "Main St & High St, Columbus, OH" 4) You can still save job, but it won't appear on map until address is fixed. You can also manually enter lat/lng below or use My Location.`);
        setShowMapPreview(false);
      }
    } catch (e: any) {
      setGeoStatus('notfound');
      setGeoMessage(`❌ Map check failed - ${e?.message || 'offline or address not found'}. Save anyway and it will show when online.`);
      setShowMapPreview(false);
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported on this device');
      return;
    }
    setGeoStatus('checking');
    setGeoMessage('📍 Getting your current location...');
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      setF(p => ({ ...p, lat: latitude, lng: longitude }));
      setGeoStatus('found');
      setGeoMessage(`✅ Using your current location: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} - Will show on map`);
      setShowMapPreview(true);
    }, (err) => {
      setGeoStatus('notfound');
      setGeoMessage(`❌ Could not get location: ${err.message} - Check location permissions in browser`);
    }, { enableHighAccuracy: true });
  };

  const { company } = useCompanyInfo();

  return (
    <Modal title={job ? 'Edit Job' : 'Add Job - Check Map Preview'} onClose={onClose}>
      <div className="grid gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="block text-sm font-bold mb-1">Customer *</label><select value={f.customerId} onChange={e => handleCustomerChange(e.target.value)} className="w-full px-3 py-2 border-2 rounded-lg"><option value="">Select customer...</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div>
            <label className="block text-sm font-bold mb-1">Status *</label>
            <select value={f.status} onChange={e => update('status', e.target.value as any)} className="w-full px-3 py-2 border-2 rounded-lg bg-white font-bold">
              <option value="potential">Potential - Lead / Not Scheduled</option>
              <option value="scheduled">Scheduled - On Calendar</option>
              <option value="in-progress">In Progress - Crew Working</option>
              <option value="completed">Completed - Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <Field label="Job Title *" value={f.title} onChange={v => update('title', v)} placeholder="e.g., Driveway - Columbus" />
        <div><label className="block text-sm font-bold mb-1">Description</label><textarea value={f.description} onChange={e => update('description', e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg" /></div>

        <div className="bg-black text-white rounded-xl p-3 border-2" style={{ borderColor: company.primaryColor || '#C5A032' }}>
          <h4 className="font-black text-sm flex items-center gap-2">📍 Address - Will it show on Map? Check here</h4>
          <p className="text-[11px] text-gray-400 mt-1">Enter address and click "Check on Map" to verify it will appear as a pin on the Map tab</p>
        </div>

        <Field label="Street Address *" value={f.address} onChange={v => update('address', v)} placeholder="123 Main St" />
        <div className="grid grid-cols-3 gap-3">
          <Field label="City *" value={f.city} onChange={v => update('city', v)} />
          <Field label="State *" value={f.state} onChange={v => update('state', v)} />
          <Field label="ZIP *" value={f.zip} onChange={v => update('zip', v)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleCheckMap} className="px-4 py-2 rounded-xl bg-black text-yellow-400 font-black border-2 text-sm hover:bg-zinc-900" style={{ borderColor: company.primaryColor || '#C5A032' }}>
            {geoStatus === 'checking' ? '🔍 Checking...' : '🗺️ Check if Shows on Map'}
          </button>
          <button type="button" onClick={handleUseMyLocation} className="px-4 py-2 rounded-xl bg-zinc-800 text-white font-bold border-2 border-zinc-700 text-sm">
            📍 Use My Current Location
          </button>
          {f.lat && f.lng && (
            <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded-xl font-bold">
              ✅ Lat: {f.lat.toFixed(5)} Lng: {f.lng.toFixed(5)}
            </span>
          )}
        </div>

        {geoMessage && (
          <div className={`p-3 rounded-xl border-2 text-sm ${geoStatus === 'found' ? 'bg-green-50 border-green-300 text-green-800' : geoStatus === 'notfound' ? 'bg-red-50 border-red-300 text-red-800' : 'bg-blue-50 border-blue-300 text-blue-800'}`}>
            {geoMessage}
          </div>
        )}

        {showMapPreview && f.lat && f.lng && (
          <div className="border-2 rounded-xl overflow-hidden" style={{ borderColor: company.primaryColor || '#C5A032' }}>
            <div className="bg-black text-white p-2 flex justify-between items-center text-xs">
              <span className="font-black" style={{ color: company.primaryColor || '#C5A032' }}>📍 Map Preview - This is how it will show on Map tab</span>
              <span className="bg-green-600 text-white px-2 py-1 rounded-full text-[10px] font-black">✅ WILL SHOW ON MAP</span>
            </div>
            <div style={{ height: '220px' }}>
              <LazyMapView jobs={[{ id: 'preview', title: f.title || 'Preview', customerName: f.customerName, address: f.address, city: f.city, lat: f.lat, lng: f.lng, status: f.status } as any]} height="220px" />
            </div>
            <div className="p-2 bg-gray-50 flex gap-2 flex-wrap">
              <input type="number" value={f.lat || 0} onChange={e=>update('lat', parseFloat(e.target.value) || 0)} placeholder="Latitude" className="flex-1 px-2 py-1 border rounded-lg text-xs" step="0.00001" />
              <input type="number" value={f.lng || 0} onChange={e=>update('lng', parseFloat(e.target.value) || 0)} placeholder="Longitude" className="flex-1 px-2 py-1 border rounded-lg text-xs" step="0.00001" />
              <span className="text-[10px] text-gray-500 self-center">Drag: You can manually adjust lat/lng if pin is slightly off</span>
            </div>
          </div>
        )}

        {geoStatus === 'notfound' && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 text-xs">
            <p className="font-black text-amber-800">💡 Tips to make it show on map:</p>
            <ul className="list-disc ml-4 mt-1 text-amber-700 space-y-1">
              <li>Check spelling: "Main St" not "Main Street" sometimes works better</li>
              <li>Add ZIP code: "123 Main St, Columbus, OH 43215"</li>
              <li>Try nearby intersection: "Main St & High St, Columbus, OH"</li>
              <li>Use My Location button if you're at the job site now</li>
              <li>Or manually enter lat/lng from Google Maps: Right-click job site in Google Maps → Copy coordinates → Paste above</li>
              <li>You can still save job - it will show on map once address is fixed or you add lat/lng</li>
            </ul>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Field label="Sq Footage" value={f.squareFootage || 0} onChange={v => update('squareFootage', parseFloat(v) || 0)} type="number" />
          <Field label="Depth (in)" value={f.depth || 0} onChange={v => update('depth', parseFloat(v) || 0)} type="number" />
          <div><label className="block text-sm font-bold mb-1">Tonnage Est.</label><div className="px-3 py-2 bg-black text-yellow-400 rounded-lg text-sm font-black border" style={{ borderColor: company.primaryColor || '#C5A032' }}>{tonnage} tons</div></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Scheduled Date" value={f.scheduledDate || ''} onChange={v => update('scheduledDate', v)} type="date" />
          <div>
            <label className="block text-sm font-bold mb-1">Quick fill</label>
            <div className="flex gap-1 flex-wrap">
              {[
                { l: 'Driveway', t: 'Residential Driveway - Remove & Replace', d: 'Remove existing asphalt, grade base to 2% slope, install 6in 304 base + 2.5in 448 surface' },
                { l: 'Sealcoat', t: 'Sealcoating - Driveway & Parking', d: 'Clean, crack fill, 2 coats coal tar sealer, line striping' },
                { l: 'Parking Lot', t: 'Commercial Parking Lot', d: 'Parking lot paving, 6in base, 3in binder + surface, includes striping prep' },
              ].map(q => (
                <button type="button" key={q.l} onClick={() => setF(p => ({ ...p, title: q.t, description: q.d }))} className="text-xs px-2 py-1.5 bg-black text-yellow-400 rounded-lg border font-bold" style={{ borderColor: company.primaryColor || '#C5A032' }}>{q.l}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
          <button type="button" onClick={(e:any)=>{ e.preventDefault(); if (f.title.trim()) onSave(f); }} className="px-4 py-2 text-black rounded-lg font-black" style={{ background: company.primaryColor || '#C5A032' }}>Save Job {f.lat && f.lng ? '✅ Will Show on Map' : ''}</button>
        </div>
      </div>
    </Modal>
  );
}



// ESTIMATES
function EstimatesPage({ data, showToast, auth }: { data: ReturnType<typeof useAppData>; showToast: (m: string) => void; auth: ReturnType<typeof useAuth> }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Estimate | null>(null);
  const [viewing, setViewing] = useState<Estimate | null>(null);
  const canCreate = auth.can('estimates','create');
  const canEdit = auth.can('estimates','edit');
  const canDelete = auth.can('estimates','delete');
  const { company } = useCompanyInfo();
  const save = async (e: Estimate) => {
    if (!canCreate && !editing) return showToast('No permission to create');
    if (editing && !canEdit) return showToast('No permission to edit');
    await data.saveEstimate(e); setShowForm(false); setEditing(null); showToast(editing ? 'Estimate updated!' : 'Estimate created!');
  };
  const del = async (id: string) => {
    if (!canDelete) return showToast('No permission to delete');
    if (confirm('Delete this estimate?')) { await data.deleteEstimate(id); showToast('Estimate deleted!'); }
  };
  const convertToInvoice = async (est: Estimate) => {
    if (!auth.can('invoices','create')) return showToast('No permission to create invoices');
    if (!confirm(`Convert estimate "${est.title}" to invoice?`)) return;
    const inv: Invoice = { id: uuidv4(), customerId: est.customerId, customerName: est.customerName, jobId: est.jobId, estimateId: est.id, title: est.title, lineItems: est.lineItems, subtotal: est.subtotal, taxRate: est.taxRate, tax: est.tax, total: est.total, amountPaid: 0, balanceDue: est.total, status: 'draft', dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0], createdAt: new Date().toISOString(), };
    await data.saveInvoice(inv); showToast('Invoice created from estimate!');
  };
  return (
    <div>
      <div className="flex justify-between items-center mb-4"><p className="text-sm text-gray-500">{data.estimates.length} estimates • ${data.estimates.reduce((s, e) => s + e.total, 0).toLocaleString()} total</p>{canCreate && <button type="button" onClick={() => { setEditing(null); setShowForm(true); }} className="px-5 py-2 text-black rounded-xl font-black shadow" style={{ background: company.primaryColor }}>+ New Estimate</button>}</div>
      <div className="grid gap-3">{data.estimates.length === 0 && <p className="text-gray-400 text-center py-12">No estimates yet</p>}{data.estimates.slice().reverse().map(e => (<div key={e.id} className="bg-white rounded-xl p-4 shadow-sm border-l-4" style={{ borderLeftColor: company.secondaryColor }}><div className="flex flex-col md:flex-row justify-between gap-3"><div className="flex-1"><div className="flex items-center gap-2"><h3 className="font-black" style={{ color: company.secondaryColor }}>{e.title}</h3><StatusBadge status={e.status} /></div><p className="text-sm text-gray-500">{e.customerName} • {e.createdAt.split('T')[0]} • {e.lineItems.length} items</p><p className="font-black mt-1" style={{ color: company.primaryColor }}>${e.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p></div><div className="flex gap-2 flex-wrap"><Btn color="gray" onClick={() => setViewing(e)}>View</Btn>{canEdit && <Btn color="gold" onClick={() => { setEditing(e); setShowForm(true); }}>Edit</Btn>}{auth.can('invoices','create') && <Btn color="green" onClick={() => convertToInvoice(e)}>→ Invoice</Btn>}{canDelete && <Btn color="red" onClick={() => del(e.id)}>Delete</Btn>}</div></div></div>))}</div>
      {showForm && (canCreate || canEdit) && <EstimateForm estimate={editing} customers={data.customers} jobs={data.jobs} onSave={save} onClose={() => { setShowForm(false); setEditing(null); }} />}
      {viewing && <EstimateView estimate={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function EstimateForm({ estimate, customers, jobs, onSave, onClose }: { estimate: Estimate | null; customers: Customer[]; jobs: Job[]; onSave: (e: Estimate) => void; onClose: () => void }) {
  const [f, setF] = useState<Estimate>(estimate || { id: uuidv4(), customerId: customers[0]?.id || '', customerName: customers[0]?.name || '', jobId: undefined, title: '', jobType: 'residential_remove_replace', lineItems: [], subtotal: 0, taxRate: 0, tax: 0, total: 0, status: 'draft', validUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0], notes: '', createdAt: new Date().toISOString(), });
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [jobType, setJobType] = useState<string>(estimate?.jobType || (estimate as any)?.jobType || 'residential_remove_replace');
  const { company } = useCompanyInfo();
  const recalc = (items: LineItem[], taxRate = f.taxRate) => { const subtotal = items.reduce((s, it) => s + it.total, 0); const tax = Math.round(subtotal * (taxRate / 100) * 100) / 100; const total = Math.round((subtotal + tax) * 100) / 100; setF(p => ({ ...p, lineItems: items, subtotal, tax, total, jobType })); };
  useEffect(() => { if (estimate) { recalc(estimate.lineItems, estimate.taxRate); setJobType((estimate as any).jobType || 'residential_remove_replace'); } }, []);
  useEffect(() => { setF(p => ({ ...p, jobType })); }, [jobType]);
  const addItem = () => { const newItem: LineItem = { id: uuidv4(), description: '', quantity: 1, unit: 'ls', unitPrice: 0, total: 0 }; recalc([...f.lineItems, newItem]); };
  const updateItem = (id: string, patch: Partial<LineItem>) => { const items = f.lineItems.map(it => { if (it.id !== id) return it; const updated = { ...it, ...patch }; updated.total = Math.round(updated.quantity * updated.unitPrice * 100) / 100; return updated; }); recalc(items); };
  const removeItem = (id: string) => { recalc(f.lineItems.filter(i => i.id !== id)); };
  const handleAI = async () => {
    if (!aiPrompt.trim() && !f.title.trim()) { alert('Describe the job for AI (e.g., 1500 sq ft driveway replacement)'); return; }
    setAiLoading(true);
    try { 
      const jobCtx = jobs.find(j => j.id === f.jobId); 
      const result = await generateAIEstimate(aiPrompt || f.title, { 
        squareFootage: jobCtx?.squareFootage, 
        depth: jobCtx?.depth, 
        description: f.title + ' ' + (jobCtx?.description || ''), 
        title: f.title,
        jobType: jobType,
      }); 
      setF(p => ({ ...p, title: p.title || result.title, notes: result.notes, jobType })); 
      recalc(result.lineItems); 
      setAiPrompt(''); 
    } catch (e) { alert('AI failed: ' + e); } finally { setAiLoading(false); }
  };
  return (
    <Modal title={estimate ? 'Edit Estimate' : 'New Estimate - Job Type Specific AI'} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-black border-2 rounded-xl p-4" style={{ borderColor: company.primaryColor }}>
          <h4 className="font-black text-sm mb-2" style={{ color: company.primaryColor }}>🤖 {company.name} AI Estimator - Job Type Specific</h4>
          <label className="block text-xs font-black tracking-widest mb-2" style={{ color: company.primaryColor }}>JOB TYPE - Makes line items & notes job-specific</label>
          <select value={jobType} onChange={e=>setJobType(e.target.value)} className="w-full px-3 py-3 rounded-xl bg-zinc-900 border-2 text-white text-sm font-bold mb-3">
            {JOB_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <div className="flex gap-2">
            <input type="text" value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder="e.g., 20x50 driveway, 2 car, needs removal, Grove City OH..." className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white" />
            <button type="button" onClick={handleAI} disabled={aiLoading} className="px-4 py-2 text-black rounded-lg text-sm font-black" style={{ background: company.primaryColor }}>{aiLoading ? 'Generating...' : `✨ Generate ${((JOB_TYPES.find(t=>t.value===jobType)?.label || jobType) || '').split(' - ')[0] || ''} Estimate`}</button>
          </div>
          <p className="text-[11px] mt-2" style={{ color: company.primaryColor === '#C5A032' ? '#D4B45A' : '#FFB74D' }}>AI will now generate line items specific to {jobType.replace(/_/g, ' ')} with realistic Columbus pricing + job-specific notes section</p>
        </div>
        <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-bold mb-1">Customer *</label><select value={f.customerId} onChange={e => { const c = customers.find(x => x.id === e.target.value); setF(p => ({ ...p, customerId: e.target.value, customerName: c?.name || '' })); }} className="w-full px-3 py-2 border-2 rounded-lg">{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label className="block text-sm font-bold mb-1">Linked Job</label><select value={f.jobId || ''} onChange={e => setF(p => ({ ...p, jobId: e.target.value || undefined }))} className="w-full px-3 py-2 border rounded-lg"><option value="">No job linked</option>{jobs.filter(j => j.customerId === f.customerId || !f.customerId).map(j => <option key={j.id} value={j.id}>{j.title} ({j.squareFootage || '?'} sq ft)</option>)}</select></div></div>
        <Field label="Estimate Title *" value={f.title} onChange={v => setF(p => ({ ...p, title: v }))} placeholder="e.g., Driveway Sealcoating - 1500 sq ft" />
        <div><div className="flex justify-between items-center mb-2"><label className="text-sm font-black">Line Items - Job Type: {jobType.replace(/_/g, ' ')}</label><button type="button" onClick={addItem} className="text-xs px-3 py-1 bg-black text-yellow-400 rounded-full border font-bold" style={{ borderColor: company.primaryColor }}>+ Add Item</button></div><div className="space-y-2 max-h-[300px] overflow-y-auto border-2 rounded-xl p-2 bg-gray-50">{f.lineItems.length === 0 && <p className="text-xs text-gray-400 p-2">No items yet - select job type above and click Generate, or add manually. AI will create items specific to {jobType.replace(/_/g, ' ')} job.</p>}{f.lineItems.map(item => (<div key={item.id} className="grid grid-cols-12 gap-2 items-start bg-white p-2 rounded-lg border"><div className="col-span-6"><input value={item.description} onChange={e => updateItem(item.id, { description: e.target.value })} placeholder="Description - editable" className="w-full px-2 py-1.5 text-sm border rounded-lg" /></div><div className="col-span-2"><input type="number" value={item.quantity} onChange={e => updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 text-sm border rounded-lg" /></div><div className="col-span-2"><input type="number" value={item.unitPrice} onChange={e => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 text-sm border rounded-lg" /></div><div className="col-span-2 flex items-center justify-between"><span className="text-sm font-bold">${item.total.toFixed(2)}</span><button type="button" onClick={() => removeItem(item.id)} className="text-red-500 text-xs px-1">✕</button></div></div>))}</div></div>
        <div className="grid grid-cols-3 gap-3 bg-black text-white p-3 rounded-xl border-2" style={{ borderColor: company.primaryColor }}><div><label className="text-xs" style={{ color: company.primaryColor }}>Subtotal</label><p className="font-bold">${f.subtotal.toFixed(2)}</p></div><div><label className="text-xs" style={{ color: company.primaryColor }}>Tax %</label><input type="number" value={f.taxRate} onChange={e => { const rate = parseFloat(e.target.value) || 0; const tax = Math.round(f.subtotal * rate / 100 * 100) / 100; setF(p => ({ ...p, taxRate: rate, tax, total: p.subtotal + tax })); }} className="w-full px-2 py-1 border rounded-lg text-sm text-black" /></div><div><label className="text-xs" style={{ color: company.primaryColor }}>Total</label><p className="font-black text-lg" style={{ color: company.primaryColor }}>${f.total.toFixed(2)}</p></div></div>
        <div><label className="block text-sm font-bold mb-1">Notes / Terms - Job Specific - AI generates detailed notes for {jobType.replace(/_/g, ' ')} job</label><textarea value={f.notes || ''} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} rows={6} className="w-full px-3 py-2 border-2 rounded-xl text-xs font-mono" placeholder="Job-specific notes, warranty, exclusions, etc. will appear here after AI generation. You can edit any words." /></div>
        <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-xl font-bold">Cancel</button><button type="button" onClick={() => { if (f.title.trim() && f.lineItems.length > 0) onSave(f); else alert('Need title and items'); }} className="px-6 py-2 text-black rounded-xl font-black" style={{ background: company.primaryColor }}>💾 Save Estimate - {jobType.replace(/_/g, ' ')}</button></div>
      </div>
    </Modal>
  );
}

function EstimateView({ estimate, onClose }: { estimate: Estimate; onClose: () => void }) {
  const { company } = useCompanyInfo();
  const handlePrint = () => openPrintWithLogo(`Estimate - ${estimate.title} - ${estimate.customerName}`);
  return (
    <Modal title={`Estimate - ${estimate.title}`} onClose={onClose}>
      <div className="space-y-4 print-area">
        <PrintHeader title={`ESTIMATE - ${estimate.title}`} subtitle={`Valid Until: ${estimate.validUntil} • Status: ${estimate.status}`} customerName={estimate.customerName} date={estimate.createdAt.split('T')[0]} />
        <div className="flex justify-between items-center"><StatusBadge status={estimate.status} /><button type="button" onClick={handlePrint} className="px-4 py-2 bg-black text-yellow-400 rounded-lg text-sm font-bold border" style={{ borderColor: company.primaryColor }}>🖨️ Print Estimate</button></div>
        <div className="border rounded-xl overflow-hidden"><table className="w-full text-sm"><thead className="bg-black text-yellow-400 text-left"><tr><th className="p-2">Description</th><th className="p-2">Qty</th><th className="p-2">Price</th><th className="p-2 text-right">Total</th></tr></thead><tbody>{estimate.lineItems.map(it => (<tr key={it.id} className="border-t"><td className="p-2">{it.description}</td><td className="p-2">{it.quantity} {it.unit}</td><td className="p-2">${it.unitPrice}</td><td className="p-2 text-right">${it.total.toFixed(2)}</td></tr>))}</tbody></table></div>
        <div className="flex justify-end"><div className="w-64 space-y-1 text-sm border p-3 rounded-xl bg-gray-50"><div className="flex justify-between"><span>Subtotal</span><span>${estimate.subtotal.toFixed(2)}</span></div><div className="flex justify-between"><span>Tax ({estimate.taxRate}%)</span><span>${estimate.tax.toFixed(2)}</span></div><div className="flex justify-between font-black text-base border-t pt-1"><span>Total</span><span>${estimate.total.toFixed(2)}</span></div></div></div>
        {estimate.notes && <div className="bg-yellow-50 border p-3 rounded-xl text-sm whitespace-pre-wrap" style={{ borderColor: company.primaryColor }}>{estimate.notes}</div>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Close</button><button type="button" onClick={handlePrint} className="px-4 py-2 bg-black text-yellow-400 rounded-lg font-bold border" style={{ borderColor: company.primaryColor }}>🖨️ Print / Save PDF</button></div>
      </div>
    </Modal>
  );
}

function InvoicesPage({ data, showToast, auth }: { data: ReturnType<typeof useAppData>; showToast: (m: string) => void; auth: ReturnType<typeof useAuth> }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [viewing, setViewing] = useState<Invoice | null>(null);
  const [filter, setFilter] = useState('all');
  const filtered = data.invoices.filter(i => filter === 'all' || i.status === filter);
  const canCreate = auth.can('invoices','create');
  const canEdit = auth.can('invoices','edit');
  const canDelete = auth.can('invoices','delete');
  const { company } = useCompanyInfo();
  const save = async (inv: Invoice) => {
    if (!canCreate && !editing) return showToast('No permission to create');
    if (editing && !canEdit) return showToast('No permission to edit');
    inv.balanceDue = Math.round((inv.total - inv.amountPaid) * 100) / 100; await data.saveInvoice(inv); setShowForm(false); setEditing(null); showToast(editing ? 'Invoice updated!' : 'Invoice created!');
  };
  const del = async (id: string) => {
    if (!canDelete) return showToast('No permission to delete');
    if (confirm('Delete this invoice?')) { await data.deleteInvoice(id); showToast('Invoice deleted!'); }
  };
  const markPaid = async (inv: Invoice) => {
    if (!canEdit) return showToast('No permission to edit');
    const updated = { ...inv, amountPaid: inv.total, balanceDue: 0, status: 'paid' as const }; await data.saveInvoice(updated); showToast('Marked as paid!');
  };
  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4"><select value={filter} onChange={e => setFilter(e.target.value)} className="px-4 py-2 border rounded-lg"><option value="all">All</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option><option value="overdue">Overdue</option></select><div className="flex-1" />{canCreate && <button type="button" onClick={() => { setEditing(null); setShowForm(true); }} className="px-5 py-2 text-black rounded-xl font-black" style={{ background: company.primaryColor }}>+ New Invoice</button>}</div>
      <div className="grid gap-3">{filtered.length === 0 && <p className="text-gray-400 text-center py-10">No invoices found</p>}{filtered.slice().reverse().map(inv => (<div key={inv.id} className="bg-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row justify-between gap-3 border-l-4" style={{ borderLeftColor: company.secondaryColor }}><div><div className="flex items-center gap-2"><h3 className="font-black">{inv.title}</h3><StatusBadge status={inv.status} /></div><p className="text-sm text-gray-500">{inv.customerName} • Due: {inv.dueDate || '—'}</p><p className="mt-1"><span className="font-black">${inv.total.toFixed(2)}</span> <span className="text-sm text-gray-500">• Paid ${inv.amountPaid.toFixed(2)} • Bal ${inv.balanceDue.toFixed(2)}</span></p></div><div className="flex gap-2 flex-wrap"><Btn color="gray" onClick={() => setViewing(inv)}>View</Btn>{canEdit && <Btn color="gold" onClick={() => { setEditing(inv); setShowForm(true); }}>Edit</Btn>}{inv.status !== 'paid' && canEdit && <Btn color="green" onClick={() => markPaid(inv)}>Mark Paid</Btn>}{canDelete && <Btn color="red" onClick={() => del(inv.id)}>Delete</Btn>}</div></div>))}</div>
      {showForm && (canCreate || canEdit) && <InvoiceForm invoice={editing} customers={data.customers} estimates={data.estimates} onSave={save} onClose={() => { setShowForm(false); setEditing(null); }} />}
      {viewing && <InvoiceView invoice={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function InvoiceView({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { company } = useCompanyInfo();
  const handlePrint = () => openPrintWithLogo(`Invoice - ${invoice.title} - ${invoice.customerName}`);
  return (
    <Modal title={`Invoice - ${invoice.title}`} onClose={onClose}>
      <div className="space-y-4 print-area">
        <PrintHeader title={`INVOICE - ${invoice.title}`} subtitle={`Due: ${invoice.dueDate} • Status: ${invoice.status.toUpperCase()} • Balance: $${invoice.balanceDue.toFixed(2)}`} customerName={invoice.customerName} date={invoice.createdAt.split('T')[0]} />
        <div className="flex justify-between items-center"><StatusBadge status={invoice.status} /><button type="button" onClick={handlePrint} className="px-4 py-2 bg-black text-yellow-400 rounded-lg text-sm font-bold border" style={{ borderColor: company.primaryColor }}>🖨️ Print Invoice</button></div>
        <div className="border rounded-xl overflow-hidden"><table className="w-full text-sm"><thead className="bg-black text-yellow-400"><tr><th className="p-2 text-left">Description</th><th className="p-2">Qty</th><th className="p-2">Price</th><th className="p-2 text-right">Total</th></tr></thead><tbody>{invoice.lineItems.map(it=>(<tr key={it.id} className="border-t"><td className="p-2">{it.description}</td><td className="p-2">{it.quantity} {it.unit}</td><td className="p-2">${it.unitPrice}</td><td className="p-2 text-right">${it.total.toFixed(2)}</td></tr>))}</tbody></table></div>
        <div className="flex justify-end"><div className="w-72 space-y-2 text-sm border-2 p-4 rounded-xl bg-black text-white" style={{ borderColor: company.primaryColor }}><div className="flex justify-between text-gray-300"><span>Subtotal</span><span>${invoice.subtotal.toFixed(2)}</span></div><div className="flex justify-between text-gray-300"><span>Tax</span><span>${invoice.tax.toFixed(2)}</span></div><div className="flex justify-between"><span>Amount Paid</span><span className="text-green-400">-${invoice.amountPaid.toFixed(2)}</span></div><div className="flex justify-between font-black text-lg border-t border-yellow-600 pt-2" style={{ color: company.primaryColor }}><span>Balance Due</span><span>${invoice.balanceDue.toFixed(2)}</span></div></div></div>
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Close</button><button type="button" onClick={handlePrint} className="px-4 py-2 bg-black text-yellow-400 rounded-lg font-bold border" style={{ borderColor: company.primaryColor }}>🖨️ Print / PDF</button></div>
      </div>
    </Modal>
  );
}

function InvoiceForm({ invoice, customers, estimates, onSave, onClose }: { invoice: Invoice | null; customers: Customer[]; estimates: Estimate[]; onSave: (i: Invoice) => void; onClose: () => void }) {
  const [f, setF] = useState<Invoice>(invoice || { id: uuidv4(), customerId: customers[0]?.id || '', customerName: customers[0]?.name || '', title: '', jobType: 'residential_remove_replace', lineItems: [], subtotal: 0, taxRate: 0, tax: 0, total: 0, amountPaid: 0, balanceDue: 0, status: 'draft', dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0], createdAt: new Date().toISOString(), });
  const [jobType, setJobType] = useState<string>(invoice?.jobType || 'residential_remove_replace');
  const { company, logoUrl } = useCompanyInfo();

  const loadFromEstimate = (estId: string) => { 
    const est = estimates.find(e => e.id === estId); 
    if (est) { 
      setF(p => ({ ...p, estimateId: est.id, customerId: est.customerId, customerName: est.customerName, title: est.title, jobType: (est as any).jobType || jobType, lineItems: est.lineItems, subtotal: est.subtotal, tax: est.tax, taxRate: est.taxRate, total: est.total, balanceDue: est.total - p.amountPaid, })); 
      setJobType((est as any).jobType || jobType);
    } 
  };

  useEffect(() => {
    if (invoice) setJobType(invoice.jobType || 'residential_remove_replace');
  }, []);

  useEffect(() => {
    setF(p => ({ ...p, jobType }));
  }, [jobType]);

  return (
    <Modal title={invoice ? 'Edit Invoice - Job Type Specific' : 'New Invoice - Job Type Specific'} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-black p-3 rounded-xl border-2" style={{ borderColor: company.primaryColor }}><img src={logoUrl} className="w-10 h-10 bg-white rounded-lg p-1" alt="logo" onError={(e:any)=>e.target.style.display='none'} /><div><p className="font-black text-sm" style={{ color: company.primaryColor }}>{company.name} • Job Type Aware</p><p className="text-xs text-white">{company.phone} • Invoices use job-type specific pricing</p></div></div>

        <div className="bg-black rounded-xl p-3 border-2" style={{ borderColor: company.primaryColor }}>
          <label className="block text-xs font-black tracking-widest mb-2" style={{ color: company.primaryColor }}>JOB TYPE - Makes invoice job-specific & more accurate</label>
          <select value={jobType} onChange={e=>setJobType(e.target.value)} className="w-full px-3 py-3 rounded-xl bg-zinc-900 border-2 text-white text-sm font-bold">
            {JOB_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <p className="text-[11px] text-gray-400 mt-2">Selected: {jobType.replace(/_/g, ' ')} - Line items and notes will be specific to this job type. If loaded from estimate, job type auto-filled.</p>
        </div>

        <div className="grid grid-cols-2 gap-3"><div><label className="text-sm font-bold">From Estimate (will copy job type too)</label><select onChange={e => loadFromEstimate(e.target.value)} className="w-full px-3 py-2 border-2 rounded-xl"><option value="">-- Select to import --</option>{estimates.map(e => <option key={e.id} value={e.id}>{e.title} - ${e.total.toFixed(0)} [{(e as any).jobType ? (e as any).jobType.replace(/_/g,' ') : 'no type'}]</option>)}</select></div><div><label className="text-sm font-bold">Customer</label><select value={f.customerId} onChange={e => { const c = customers.find(x => x.id === e.target.value); setF(p => ({ ...p, customerId: e.target.value, customerName: c?.name || '' })); }} className="w-full px-3 py-2 border-2 rounded-xl">{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div></div>
        <Field label="Title" value={f.title} onChange={v => setF(p => ({ ...p, title: v }))} />
        <div className="border-2 rounded-xl p-2 bg-gray-50 max-h-60 overflow-auto space-y-2">
          <p className="text-xs font-black px-2">Line Items - Job Type: {jobType.replace(/_/g, ' ')} - Edit any words</p>
          {f.lineItems.map(it => (<div key={it.id} className="bg-white p-2 rounded-lg flex justify-between text-sm border"><span className="flex-1"><input value={it.description} onChange={e=>{ const updated = f.lineItems.map(li=> li.id===it.id ? {...li, description: e.target.value, total: li.quantity * li.unitPrice} : li); const sub = updated.reduce((s,i)=>s+i.total,0); setF(p=>({...p, lineItems: updated, subtotal: sub, total: sub + p.tax, balanceDue: (sub + p.tax) - p.amountPaid})); }} className="w-full px-1 border rounded text-xs" /></span><span className="font-bold text-xs ml-2">${it.total.toFixed(2)}</span></div>))}{f.lineItems.length === 0 && <p className="text-xs text-gray-400 p-2">No items - import from estimate or create estimate first with job type</p>}</div>
        <div className="grid grid-cols-4 gap-3 text-sm"><div>Subtotal <p className="font-bold">${f.subtotal.toFixed(2)}</p></div><div>Tax {f.taxRate}% <p className="font-bold">${f.tax.toFixed(2)}</p></div><div>Total <p className="font-bold">${f.total.toFixed(2)}</p></div><div><label className="text-xs font-bold">Amount Paid</label><input type="number" value={f.amountPaid} onChange={e => { const paid = parseFloat(e.target.value) || 0; setF(p => ({ ...p, amountPaid: paid, balanceDue: Math.round((p.total - paid) * 100) / 100 })); }} className="w-full px-2 py-1 border-2 rounded-lg" /></div></div>
        <div className="grid grid-cols-2 gap-4"><div><label className="text-sm font-bold">Status</label><select value={f.status} onChange={e => setF(p => ({ ...p, status: e.target.value as any }))} className="w-full px-3 py-2 border-2 rounded-lg"><option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option><option value="overdue">Overdue</option></select></div><Field label="Due Date" value={f.dueDate || ''} onChange={v => setF(p => ({ ...p, dueDate: v }))} type="date" /></div>
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 text-xs">
          <p className="font-black">💡 Job Type Aware:</p>
          <p className="mt-1">Selected {jobType.replace(/_/g,' ')} - Invoice notes and totals are specific to this job type. If you change job type, line items stay but you can regenerate via estimate with new type for more accurate pricing.</p>
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-xl font-bold">Cancel</button><button type="button" onClick={() => onSave(f)} className="px-6 py-2 text-black rounded-xl font-black" style={{ background: company.primaryColor }}>💾 Save Invoice - {jobType.replace(/_/g,' ')}</button></div>
      </div>
    </Modal>
  );
}

function ContractsPage({ data, showToast, auth }: { data: ReturnType<typeof useAppData>; showToast: (m: string) => void; auth: ReturnType<typeof useAuth> }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [viewing, setViewing] = useState<Contract | null>(null);
  const canCreate = auth.can('contracts','create');
  const canEdit = auth.can('contracts','edit');
  const canDelete = auth.can('contracts','delete');
  const { company } = useCompanyInfo();
  const save = async (c: Contract) => {
    if (!canCreate && !editing) return showToast('No permission to create');
    if (editing && !canEdit) return showToast('No permission to edit');
    await data.saveContract(c); setShowForm(false); setEditing(null); showToast(editing ? 'Contract updated!' : 'Contract created!');
  };
  const del = async (id: string) => {
    if (!canDelete) return showToast('No permission to delete');
    if (confirm('Delete contract?')) { await data.deleteContract(id); showToast('Contract deleted!'); }
  };
  return (
    <div>
      <div className="flex justify-between mb-4"><p className="text-sm text-gray-500">{data.contracts.length} contracts</p>{canCreate && <button type="button" onClick={() => { setEditing(null); setShowForm(true); }} className="px-5 py-2 text-black rounded-xl font-black" style={{ background: company.primaryColor }}>+ New Contract</button>}</div>
      <div className="grid gap-3">{data.contracts.length === 0 && <p className="text-gray-400 text-center py-10">No contracts yet</p>}{data.contracts.slice().reverse().map(c => (<div key={c.id} className="bg-white rounded-xl p-4 shadow-sm flex justify-between gap-3 border-l-4" style={{ borderLeftColor: company.primaryColor }}><div><div className="flex gap-2 items-center"><h3 className="font-black">{c.title}</h3><StatusBadge status={c.status} /></div><p className="text-sm text-gray-500">{c.customerName} • {c.createdAt.split('T')[0]}</p>{c.signedAt && <p className="text-xs text-green-600 font-bold">✅ Signed {c.signedAt.split('T')[0]} by {c.customerSignatureName}</p>}</div><div className="flex gap-2 flex-wrap"><Btn color="gray" onClick={() => setViewing(c)}>View</Btn>{canEdit && <Btn color="gold" onClick={() => { setEditing(c); setShowForm(true); }}>Edit / Sign</Btn>}{canDelete && <Btn color="red" onClick={() => del(c.id)}>Delete</Btn>}</div></div>))}</div>
      {showForm && (canCreate || canEdit) && <ContractForm contract={editing} customers={data.customers} jobs={data.jobs} estimates={data.estimates} onSave={save} onClose={() => { setShowForm(false); setEditing(null); }} />}
      {viewing && <ContractView contract={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ContractForm({ contract, customers, jobs, estimates, onSave, onClose }: { contract: Contract | null; customers: Customer[]; jobs: Job[]; estimates: Estimate[]; onSave: (c: Contract) => void; onClose: () => void }) {
  const [f, setF] = useState<Contract>(contract || { id: uuidv4(), customerId: customers[0]?.id || '', customerName: customers[0]?.name || '', title: '', content: '', jobType: 'residential_remove_replace', status: 'draft', createdAt: new Date().toISOString(), });
  const [jobType, setJobType] = useState<string>(contract?.jobType || 'residential_remove_replace');
  const [aiLoading, setAiLoading] = useState(false);
  const [signerName, setSignerName] = useState(contract?.customerSignatureName || '');
  const { company, logoUrl } = useCompanyInfo();

  const JOB_TYPES = [
    { value: 'residential_remove_replace', label: 'Residential Driveway - Remove & Replace' },
    { value: 'residential_new', label: 'Residential Driveway - New Construction' },
    { value: 'residential_overlay', label: 'Residential Driveway - Overlay / Resurface' },
    { value: 'commercial_new', label: 'Commercial Parking Lot - New Construction' },
    { value: 'commercial_overlay', label: 'Commercial Parking Lot - Overlay' },
    { value: 'commercial_mill_overlay', label: 'Commercial Parking Lot - Mill & Overlay' },
    { value: 'residential_sealcoat', label: 'Sealcoating - Residential Driveway' },
    { value: 'commercial_sealcoat', label: 'Sealcoating - Commercial Parking Lot' },
    { value: 'commercial_sealcoat_crack_stripe', label: 'Full Maintenance - Seal, Crack Fill, Stripe' },
    { value: 'crack_fill_only', label: 'Crack Filling Only' },
    { value: 'pothole_patch', label: 'Pothole / Patch Repair' },
    { value: 'striping_only', label: 'Line Striping Only' },
    { value: 'apron_approach', label: 'Apron / Approach' },
    { value: 'walkway_path', label: 'Walkway / Sidewalk / Path' },
    { value: 'custom', label: 'Custom / Other' },
  ];

  const handleAIGenerate = async () => {
    if (!f.customerName || !f.title) { alert('Enter title and select customer first'); return; }
    setAiLoading(true);
    try {
      const est = estimates.find(e => e.id === f.estimateId) || estimates.find(e => e.customerId === f.customerId);
      const job = jobs.find(j => j.id === f.jobId);
      // Pass jobType to generate job-specific contract
      const content = await generateAIContract(f.title, f.customerName, est?.total || 0, job?.squareFootage, jobType);
      setF(p => ({ ...p, content, jobType }));
    } finally { setAiLoading(false); }
  };

  const handleSignature = (dataUrl: string) => { setF(p => ({ ...p, signatureData: dataUrl, signedAt: new Date().toISOString(), customerSignatureName: signerName || p.customerName, status: 'signed' as any })); };

  return (
    <Modal title={contract ? 'Edit Contract' : 'New Contract - Job Specific'} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-black p-3 rounded-xl border" style={{ borderColor: company.primaryColor }}><img src={logoUrl} className="w-10 h-10 bg-white rounded-lg p-1" alt="logo" onError={(e:any)=>e.target.style.display='none'} /><p className="font-black text-sm" style={{ color: company.primaryColor }}>{company.name} • {company.phone}</p></div>
        
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-sm font-bold">Customer *</label><select value={f.customerId} onChange={e => { const c = customers.find(x => x.id === e.target.value); setF(p => ({ ...p, customerId: e.target.value, customerName: c?.name || '' })); }} className="w-full px-3 py-2 border-2 rounded-lg"><option value="">Select customer...</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="text-sm font-bold">Estimate Link</label><select value={f.estimateId || ''} onChange={e => setF(p => ({ ...p, estimateId: e.target.value || undefined }))} className="w-full px-3 py-2 border rounded-lg"><option value="">None</option>{estimates.filter(e => e.customerId === f.customerId).map(e => <option key={e.id} value={e.id}>{e.title} - ${e.total.toFixed(0)}</option>)}</select></div>
        </div>

        <Field label="Contract Title *" value={f.title} onChange={v => setF(p => ({ ...p, title: v }))} placeholder="e.g., Driveway Paving Agreement - 123 Main St, Columbus" />

        <div className="bg-black rounded-xl p-4 border-2" style={{ borderColor: company.primaryColor }}>
          <label className="block text-xs font-black tracking-widest mb-2" style={{ color: company.primaryColor }}>JOB TYPE - Makes contract job-specific</label>
          <select value={jobType} onChange={e => { setJobType(e.target.value); setF(p => ({ ...p, jobType: e.target.value })); }} className="w-full px-3 py-3 rounded-xl bg-zinc-900 border-2 text-white text-sm font-bold">
            {JOB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <p className="text-[11px] text-gray-400 mt-2">Select the type of asphalt work - AI will generate contract clauses specific to that job (warranty, materials, exclusions, etc). For example, Sealcoating contract has different warranty than Remove & Replace.</p>
        </div>

        <div className="flex gap-2 items-center">
          <button type="button" onClick={handleAIGenerate} disabled={aiLoading} className="px-4 py-2.5 text-black rounded-xl text-sm font-black disabled:opacity-50 flex items-center gap-2" style={{ background: company.primaryColor }}>
            {aiLoading ? 'Generating...' : `🤖 Generate ${(JOB_TYPES.find(t=>t.value===jobType)?.label || jobType) || 'Job'} Contract`}
          </button>
          <span className="text-xs text-gray-500">AI will create job-specific terms for {jobType.replace(/_/g, ' ')}</span>
        </div>

        <div className="border-2 rounded-xl overflow-hidden" style={{ borderColor: company.primaryColor }}>
          <div className="bg-black text-white p-3 flex justify-between items-center">
            <h4 className="font-black text-sm" style={{ color: company.primaryColor }}>📝 Contract Content - Fully Editable - Edit Any Words Below</h4>
            <span className="text-[10px] bg-zinc-800 px-2 py-1 rounded-full border">Editable - Click and type to change any words</span>
          </div>
          <textarea value={f.content} onChange={e => setF(p => ({ ...p, content: e.target.value }))} rows={20} className="w-full px-4 py-4 border-0 font-mono text-xs leading-relaxed whitespace-pre-wrap focus:outline-none" placeholder="Contract terms will appear here after AI generation, or type your own... You can edit ANY words in this contract." />
          <div className="bg-yellow-50 border-t p-3 flex justify-between items-center text-xs">
            <span className="font-bold">💡 Tip: You can edit any words above - company name, scope, warranty, payment terms, etc. Changes save with contract.</span>
            <span className="text-gray-500">{f.content.length} characters</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-sm font-bold">Status</label><select value={f.status} onChange={e => setF(p => ({ ...p, status: e.target.value as any }))} className="w-full px-3 py-2 border-2 rounded-lg"><option value="draft">Draft</option><option value="sent">Sent</option><option value="signed">Signed</option><option value="active">Active</option></select></div>
          <div><label className="text-sm font-bold">Signer Name</label><input value={signerName} onChange={e => setSignerName(e.target.value)} className="w-full px-3 py-2 border-2 rounded-lg" placeholder="Customer full name for signature" /></div>
        </div>

        <div className="bg-gray-50 border-2 rounded-xl p-4" style={{ borderColor: company.primaryColor }}>
          <h4 className="font-black text-sm mb-2">✍️ Customer Signature - Works Offline</h4>
          {f.signatureData ? (
            <div className="space-y-2">
              <img src={f.signatureData} alt="signature" className="border-2 bg-white rounded-xl max-h-[150px] p-2" />
              <p className="text-xs text-green-600 font-bold">Signed by {f.customerSignatureName} on {f.signedAt?.split('T')[0]}</p>
              <button type="button" onClick={() => setF(p => ({ ...p, signatureData: undefined, signedAt: undefined, status: 'draft' }))} className="text-xs px-3 py-1.5 bg-red-100 text-red-700 border-2 border-red-200 rounded-full font-bold">Clear signature - Re-sign</button>
            </div>
          ) : (
            <SignaturePad onSave={handleSignature} />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-5 py-2.5 bg-gray-200 rounded-xl font-bold">Cancel</button>
          <button type="button" onClick={() => onSave(f)} className="px-8 py-2.5 text-black rounded-xl font-black shadow-lg" style={{ background: company.primaryColor }}>💾 Save Contract</button>
        </div>
      </div>
    </Modal>
  );
}



function ContractView({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const { company } = useCompanyInfo();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(contract.content);
  const [hasChanges, setHasChanges] = useState(false);
  const handlePrint = () => openPrintWithLogo(`Contract - ${contract.title} - ${contract.customerName}`);

  const handleEditToggle = () => {
    if (isEditing && hasChanges) {
      if (!confirm('You have unsaved changes. Save before exiting edit mode? Click OK to save, Cancel to discard.')) {
        setEditedContent(contract.content);
        setHasChanges(false);
        setIsEditing(false);
        return;
      }
      try {
        const raw = localStorage.getItem('ap_contracts');
        if (raw) {
          const contracts = JSON.parse(raw);
          const idx = contracts.findIndex((c:any)=>c.id===contract.id);
          if (idx!==-1) {
            contracts[idx].content = editedContent;
            localStorage.setItem('ap_contracts', JSON.stringify(contracts));
            contract.content = editedContent;
          }
        }
      } catch {}
      setHasChanges(false);
      alert('Contract words saved! Changes will show on print.');
    }
    setIsEditing(!isEditing);
  };

  return (
    <Modal title={contract.title} onClose={onClose}>
      <div className="space-y-4 print-area">
        <PrintHeader title={`CONTRACT - ${contract.title}`} subtitle={`Status: ${contract.status.toUpperCase()} ${contract.jobType ? `• Type: ${contract.jobType.replace(/_/g, ' ')}` : ''}`} customerName={contract.customerName} date={contract.createdAt.split('T')[0]} />
        
        <div className="flex flex-wrap justify-between items-center gap-2">
          <StatusBadge status={contract.status} />
          <div className="flex gap-2">
            <button type="button" onClick={handleEditToggle} className={`px-4 py-2 rounded-lg text-sm font-black border-2 ${isEditing ? 'bg-green-600 text-white border-green-600' : 'bg-black text-yellow-400 border-yellow-500'}`} style={{ borderColor: isEditing ? '#22c55e' : company.primaryColor }}>
              {isEditing ? '💾 Save Edited Words' : '✏️ Edit Words on Contract'}
            </button>
            <button type="button" onClick={handlePrint} className="px-4 py-2 bg-black text-yellow-400 rounded-lg text-sm font-bold border" style={{ borderColor: company.primaryColor }}>🖨️ Print</button>
          </div>
        </div>

        {isEditing ? (
          <div className="border-2 rounded-xl overflow-hidden" style={{ borderColor: company.primaryColor }}>
            <div className="bg-yellow-50 border-b p-3 flex justify-between items-center">
              <p className="font-black text-sm">✏️ Editing Mode - Edit ANY words</p>
              <span className="text-xs bg-black text-yellow-400 px-2 py-1 rounded-full font-bold">EDITING</span>
            </div>
            <textarea value={editedContent} onChange={e=>{ setEditedContent(e.target.value); setHasChanges(true); }} className="w-full p-4 font-mono text-xs leading-relaxed min-h-[500px] focus:outline-none" placeholder="Edit any words..." />
            <div className="bg-gray-50 p-3 flex justify-between items-center text-xs border-t">
              <span>{editedContent.length} chars • {hasChanges ? '● Unsaved' : '✓ Saved'}</span>
              <span className="text-gray-500">Logo removed from top and watermark removed per request - clean text only</span>
            </div>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap bg-white border-2 p-5 rounded-xl text-xs font-mono leading-relaxed select-text" style={{ borderColor: company.secondaryColor }}>{editedContent}</pre>
        )}

        {contract.signatureData && (<div className="border-t-2 pt-4 mt-4" style={{ borderColor: company.primaryColor }}><p className="text-sm font-black">Customer Signature:</p><img src={contract.signatureData} alt="sig" className="border bg-white rounded-lg max-h-[140px] mt-2 p-2" /><p className="text-xs text-gray-600 mt-2 font-bold">{contract.customerSignatureName} • Signed on {contract.signedAt?.split('T')[0]}</p></div>)}
        
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Close</button>
          <button type="button" onClick={handlePrint} className="px-4 py-2 bg-black text-yellow-400 rounded-lg font-black border" style={{ borderColor: company.primaryColor }}>🖨️ Print / PDF</button>
        </div>
      </div>
    </Modal>
  );
}

function MapPage({ data, auth }: { data: ReturnType<typeof useAppData>; auth: ReturnType<typeof useAuth> }) {
  const [filter, setFilter] = useState('all');
  const jobs = data.jobs.filter(j => filter === 'all' || j.status === filter);
  const { company } = useCompanyInfo();
  const canView = auth.can('map','view');
  if (!canView) return <NoAccess module="Map" />;
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 shadow-sm flex gap-3 items-center flex-wrap border-t-4" style={{ borderColor: company.primaryColor }}><h3 className="font-black">Filter:</h3><select value={filter} onChange={e => setFilter(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm"><option value="all">All Jobs ({data.jobs.length})</option><option value="scheduled">Scheduled</option><option value="in-progress">In Progress</option><option value="completed">Completed</option><option value="potential">Potential</option></select><span className="text-xs text-gray-500">{jobs.filter(j=>j.lat&&j.lng).length} mapped • {jobs.filter(j=>!j.lat||!j.lng).length} without location</span></div>
      <div className="bg-white rounded-xl p-2 shadow-sm"><LazyMapView jobs={jobs} height="600px" /></div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{jobs.slice(0,9).map(j => (<div key={j.id} className="bg-white p-3 rounded-xl shadow-sm border-l-4" style={{ borderColor: j.status==='completed'?'#27ae60':j.status==='in-progress'?company.primaryColor:'#000' }}><p className="font-bold text-sm">{j.title}</p><p className="text-xs text-gray-500">{j.customerName} • {j.address}</p><div className="flex gap-2 mt-2"><StatusBadge status={j.status} />{j.lat ? <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">📍 mapped</span> : <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">no coords</span>}</div></div>))}</div>
    </div>
  );
}

function AIPage({ data, showToast, auth }: { data: ReturnType<typeof useAppData>; showToast: (m: string) => void; auth: ReturnType<typeof useAuth> }) {
  const { company, logoUrl } = useCompanyInfo();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: `🔥 ${company.name} AI - FULL CONTROL MODE\nLogged in as ${auth.currentUser?.displayName} (${auth.currentUser?.role})\n\nYou have ${data.customers.length} customers, ${data.jobs.length} jobs, ${data.estimates.length} estimates, ${data.invoices.length} invoices.\n\nTry:\n• "Add customer John Smith phone 380-201-1234 address 123 Main St Columbus"\n• "Add job for John Smith - sealcoating 1500 sq ft"\n• "Create estimate for John Smith driveway sealcoating"\n• "List unpaid invoices"\n• Your permissions: ${Object.entries(auth.currentUser?.permissions || {}).filter(([_,p])=>p.view).map(([k])=>k).join(', ')}\n\nI work offline!` }
  ]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const [estPrompt, setEstPrompt] = useState('1500 sq ft driveway sealcoating & crack fill, Columbus OH');
  const [estResult, setEstResult] = useState<AIEstimateResult | null>(null);
  const [estLoading, setEstLoading] = useState(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim()) return;
    if (!auth.can('ai','view')) { setMessages(prev=>[...prev, { role:'user', text: input }, { role:'ai', text:'❌ No permission to use AI Assistant' }]); setInput(''); return; }
    const q = input;
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);
    try {
      const actionResult = await handleAIAction(q, { ...data, ...auth } as any);
      if (actionResult.didAction) {
        setMessages(prev => [...prev, { role: 'ai', text: actionResult.response }]);
        showToast(actionResult.response.split('\n')[0].slice(0,50));
      } else if (actionResult.response) {
        setMessages(prev => [...prev, { role: 'ai', text: actionResult.response }]);
      } else {
        const res = await getAIResponse(q, { customers: data.customers, jobs: data.jobs, estimates: data.estimates, invoices: data.invoices });
        setMessages(prev => [...prev, { role: 'ai', text: res }]);
      }
    } catch (e) { setMessages(prev => [...prev, { role: 'ai', text: 'Error: ' + e }]); } finally { setLoading(false); }
  };

  const handleAIEst = async () => {
    if (!auth.canViewModule('estimates')) { showToast('No permission for estimates'); return; }
    setEstLoading(true);
    try { const r = await generateAIEstimate(estPrompt); setEstResult(r); } finally { setEstLoading(false); }
  };

  const quickCommands = [
    { label: 'Add Customer', cmd: 'Add customer John Smith phone 380-201-5143 email john@test.com address 123 Main St Columbus OH 43215', need: 'customers' as ModuleName },
    { label: 'Add Job', cmd: 'Add job for [your customer name] - sealcoating 1500 sq ft', need: 'jobs' as ModuleName },
    { label: 'Create Estimate', cmd: 'Create estimate for [customer] - 1500 sq ft driveway sealcoating', need: 'estimates' as ModuleName },
    { label: 'Create Invoice', cmd: 'Create invoice for [customer] from last estimate', need: 'invoices' as ModuleName },
    { label: 'List Customers', cmd: 'List customers', need: 'customers' as ModuleName },
    { label: 'Unpaid Invoices', cmd: 'List unpaid invoices', need: 'invoices' as ModuleName },
  ];

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm flex flex-col h-[700px] border-2" style={{ borderColor: company.secondaryColor }}>
        <div className="p-4 border-b bg-black rounded-t-2xl flex gap-3 items-center justify-between">
          <div className="flex gap-3 items-center"><img src={logoUrl} className="w-12 h-12 rounded-xl bg-white p-1.5" alt="logo" onError={(e:any)=>e.target.style.display='none'} /><div><h3 className="font-black text-base" style={{ color: company.primaryColor }}>{company.name} AI - Manager Mode</h3><p className="text-[11px] text-gray-400">Logged in as {auth.currentUser?.displayName} • Permissions-checked</p></div></div>
          <span className="text-[10px] px-2 py-1 rounded-full bg-yellow-500 text-black font-black">LIVE</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#fafaf8]">
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[90%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap shadow-sm ${m.role === 'user' ? 'ml-auto bg-black text-white border-2' : 'mr-auto bg-white text-gray-800 border'}`} style={m.role==='user'?{ borderColor: company.primaryColor }: { borderColor: '#e5e7eb' }}>
              {m.text}
            </div>
          ))}
          {loading && <div className="mr-auto bg-white border px-4 py-3 rounded-2xl text-sm animate-pulse flex gap-2 items-center"><span className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce"></span>{company.name} AI is working...</div>}
          <div ref={endRef} />
        </div>
        <div className="p-3 border-t bg-white rounded-b-2xl">
          <div className="flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={auth.can('ai','create') ? "Type: Add customer John Smith phone... or Create job for..." : "View only - ask about revenue, tonnage..."} className="flex-1 px-4 py-3 border-2 rounded-full text-sm outline-none font-medium" style={{ borderColor: company.primaryColor }} />
            <button type="button" onClick={send} className="px-6 py-3 bg-black text-yellow-400 rounded-full text-sm font-black border-2" style={{ borderColor: company.primaryColor }}>Send</button>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {quickCommands.filter(c=>auth.canViewModule(c.need)).slice(0,6).map((c,i)=>(
              <button type="button" key={i} onClick={()=>setInput(c.cmd)} className="text-[10px] px-2.5 py-1 bg-black text-yellow-400 rounded-full border font-bold" style={{ borderColor: company.primaryColor }}>{c.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <div className="bg-black text-white rounded-2xl p-4 border-2" style={{ borderColor: company.primaryColor }}>
          <h4 className="font-black text-sm" style={{ color: company.primaryColor }}>⚡ Quick Actions - Your Permissions</h4>
          <div className="mt-2 text-[11px] text-gray-400">Role: <strong className="text-white uppercase">{auth.currentUser?.role}</strong> • {Object.entries(auth.currentUser?.permissions || {}).filter(([_,p])=>p.view).length} modules accessible</div>
          <div className="grid grid-cols-1 gap-2 mt-3">
            {quickCommands.filter(c=>auth.canViewModule(c.need)).map((c,i)=>(
              <button type="button" key={i} onClick={()=>setInput(c.cmd)} disabled={!auth.can(c.need,'create') && c.label.includes('Add') || c.label.includes('Create')} className="text-left p-3 bg-zinc-900 rounded-xl border hover:bg-zinc-800 transition group disabled:opacity-40" style={{ borderColor: '#333' }}>
                <p className="font-bold text-xs" style={{ color: company.primaryColor }}>{c.label} {(!auth.can(c.need,'create') && (c.label.includes('Add')||c.label.includes('Create'))) && '(No Create Permission)'}</p>
                <p className="text-[10px] text-gray-400 mt-1 truncate">{c.cmd}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 border-t-4" style={{ borderColor: company.primaryColor }}>
          <h3 className="font-black mb-2">🧮 AI Estimator</h3>
          <textarea value={estPrompt} onChange={e => setEstPrompt(e.target.value)} rows={3} className="w-full px-3 py-2 border-2 rounded-xl text-sm" placeholder="e.g., 2000 sq ft parking lot sealcoating" />
          <button type="button" onClick={handleAIEst} disabled={estLoading || !auth.canViewModule('estimates')} className="mt-3 w-full py-3 text-black rounded-xl font-black disabled:opacity-50" style={{ background: company.primaryColor }}>{estLoading ? 'Generating...' : '✨ Generate Preview'}</button>
          {estResult && (
            <div className="mt-4 border-2 rounded-xl overflow-hidden" style={{ borderColor: company.secondaryColor }}>
              <div className="p-3 bg-black text-yellow-400 flex justify-between items-center"><div><p className="font-black text-sm">{estResult.title}</p><p className="text-xs text-gray-400">Total: ${estResult.lineItems.reduce((s, i) => s + i.total, 0).toFixed(2)}</p></div><img src={logoUrl} className="w-8 h-8 bg-white rounded-lg" alt="logo" onError={(e:any)=>e.target.style.display='none'} /></div>
              <div className="max-h-[280px] overflow-auto bg-white">{estResult.lineItems.map(it => (<div key={it.id} className="flex justify-between text-xs p-2.5 border-b last:border-0"><span className="flex-1 font-medium">{it.description}</span><span className="font-black">${it.total.toFixed(2)}</span></div>))}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
