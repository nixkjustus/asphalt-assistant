import { useState, useRef } from 'react';
import type { CompanyInfo, UserRole } from '../types';
import { APP_INFO } from '../types';
import { fileToDataUrl } from '../hooks/useCompanyInfo';

interface SignupData {
  company: CompanyInfo;
  admin: {
    username: string;
    password: string;
    displayName: string;
    email: string;
  };
}

export default function SignupPage({ onSignup, onBackToLogin, defaultCompanyName }: {
  onSignup: (data: SignupData) => Promise<{ success: boolean; message?: string }>;
  onBackToLogin: () => void;
  defaultCompanyName?: string;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [company, setCompany] = useState<CompanyInfo>({
    name: defaultCompanyName || '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: 'OH',
    zip: '',
    website: '',
    license: '',
    logoDataUrl: undefined,
    primaryColor: '#C5A032',
    secondaryColor: '#000000',
    tagline: '',
  });

  const [admin, setAdmin] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    email: '',
  });

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Logo must be under 5MB');
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setLogoPreview(dataUrl);
      setCompany(c => ({ ...c, logoDataUrl: dataUrl }));
    } catch {
      setError('Failed to read logo file');
    }
  };

  const validateStep1 = () => {
    if (!company.name.trim()) { setError('Company name is required'); return false; }
    if (!company.email.trim() && !company.phone.trim()) { setError('Provide company email or phone'); return false; }
    if (!company.city.trim()) { setError('City is required'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!admin.username.trim() || admin.username.trim().length < 3) { setError('Username must be at least 3 characters'); return false; }
    if (!admin.displayName.trim()) { setError('Your full name is required'); return false; }
    if (!admin.email.trim() || !admin.email.includes('@')) { setError('Valid admin email required'); return false; }
    if (admin.password.length < 6) { setError('Password must be at least 6 characters'); return false; }
    if (admin.password !== admin.confirmPassword) { setError('Passwords do not match'); return false; }
    return true;
  };

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (validateStep1()) setStep(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validateStep1() || !validateStep2()) return;
    setLoading(true);
    try {
      const res = await onSignup({
        company: {
          ...company,
          name: company.name.trim(),
          email: company.email.trim(),
          phone: company.phone.trim(),
          city: company.city.trim(),
          state: company.state.trim() || 'OH',
          zip: company.zip.trim(),
          address: company.address.trim() || `${company.city}, ${company.state}`,
          website: company.website.trim(),
          license: company.license.trim(),
        },
        admin: {
          username: admin.username.trim(),
          password: admin.password,
          displayName: admin.displayName.trim(),
          email: admin.email.trim(),
        }
      });
      if (!res.success) setError(res.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'radial-gradient(circle at top, #1a1a1a 0%, #000000 80%)' }}>
      <div className="w-full max-w-2xl">
        {/* App Branding Header */}
        <div className="flex flex-col items-center mb-6">
          <img src="/app-logo.png" alt="Asphalt Assistant" className="w-20 h-20 object-contain rounded-xl bg-white p-2 shadow-lg" onError={(e:any)=>e.target.src='/asphalt-assistant-logo.png'} />
          <h2 className="font-black text-xl mt-3 tracking-tight"><span style={{ color: '#C0C0C0' }}>ASPHALT</span> <span style={{ color: '#FF8C00' }}>ASSISTANT</span></h2>
          <p className="text-[10px] tracking-[0.2em] text-gray-500 font-bold">{APP_INFO.tagline.toUpperCase()}</p>
        </div>
        <div className="bg-black border-2 rounded-3xl p-6 md:p-8 shadow-2xl" style={{ borderColor: company.primaryColor || '#C5A032' }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white p-2 flex items-center justify-center border" style={{ borderColor: company.primaryColor || '#C5A032' }}>
                {logoPreview || company.logoDataUrl ? (
                  <img src={logoPreview || company.logoDataUrl} alt="logo" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xl">🏢</span>
                )}
              </div>
              <div>
                <h1 className="font-black text-lg" style={{ color: company.primaryColor || '#C5A032' }}>Create Company Account</h1>
                <p className="text-xs text-gray-400">White-label — Your logo brands the whole app</p>
              </div>
            </div>
            <button onClick={onBackToLogin} className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 text-gray-400 hover:text-white border border-zinc-700">Back to Login</button>
          </div>

          {/* Progress */}
          <div className="flex gap-2 mb-6">
            <div className={`flex-1 h-1.5 rounded-full ${step >= 1 ? 'bg-yellow-500' : 'bg-zinc-800'}`} />
            <div className={`flex-1 h-1.5 rounded-full ${step >= 2 ? 'bg-yellow-500' : 'bg-zinc-800'}`} />
          </div>
          <p className="text-xs font-black tracking-widest text-gray-500 mb-6">STEP {step} OF 2: {step === 1 ? 'COMPANY INFORMATION' : 'OWNER ACCOUNT'}</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {step === 1 && (
              <>
                {/* Logo Upload */}
                <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
                  <label className="block text-xs font-black tracking-widest text-gray-400 mb-3">COMPANY LOGO</label>
                  <div className="flex gap-4 items-start">
                    <div className="w-24 h-24 rounded-xl bg-white border-2 flex items-center justify-center overflow-hidden" style={{ borderColor: company.primaryColor || '#C5A032' }}>
                      {logoPreview || company.logoDataUrl ? (
                        <img src={logoPreview || company.logoDataUrl} alt="logo" className="w-full h-full object-contain p-2" />
                      ) : (
                        <span className="text-3xl">🛣️</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="px-4 py-2 rounded-xl bg-white text-black text-xs font-black border">📁 Upload Logo</button>
                      <p className="text-[10px] text-gray-500 mt-2">PNG, JPG, SVG up to 5MB. Will show on all estimates, invoices, contracts, and print views. Transparent background recommended.</p>
                      {(logoPreview || company.logoDataUrl) && <button type="button" onClick={()=>{setLogoPreview(null); setCompany(c=>({...c, logoDataUrl: undefined}))}} className="text-[11px] text-red-400 mt-2">Remove logo</button>}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black mb-1">COMPANY NAME *</label>
                  <input value={company.name} onChange={e=>setCompany(c=>({...c, name: e.target.value}))} placeholder="e.g., Black Gold Asphalt & Sealcoating" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border-2 text-white outline-none focus:border-yellow-500" style={{ borderColor: '#2a2a2a' }} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black mb-1">PHONE</label>
                    <input value={company.phone} onChange={e=>setCompany(c=>({...c, phone: e.target.value}))} placeholder="(380) 201-5143" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border text-white" style={{ borderColor: '#2a2a2a' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-black mb-1">EMAIL *</label>
                    <input value={company.email} onChange={e=>setCompany(c=>({...c, email: e.target.value}))} placeholder="info@yourcompany.com" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border text-white" style={{ borderColor: '#2a2a2a' }} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-black mb-1">CITY *</label>
                    <input value={company.city} onChange={e=>setCompany(c=>({...c, city: e.target.value}))} placeholder="Columbus" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border text-white" style={{ borderColor: '#2a2a2a' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-black mb-1">STATE</label>
                    <input value={company.state} onChange={e=>setCompany(c=>({...c, state: e.target.value}))} placeholder="OH" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border text-white" style={{ borderColor: '#2a2a2a' }} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black mb-1">FULL ADDRESS</label>
                    <input value={company.address} onChange={e=>setCompany(c=>({...c, address: e.target.value}))} placeholder="123 Industrial Pkwy" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border text-white" style={{ borderColor: '#2a2a2a' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-black mb-1">ZIP CODE</label>
                    <input value={company.zip} onChange={e=>setCompany(c=>({...c, zip: e.target.value}))} placeholder="43215" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border text-white" style={{ borderColor: '#2a2a2a' }} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black mb-1">WEBSITE</label>
                    <input value={company.website} onChange={e=>setCompany(c=>({...c, website: e.target.value}))} placeholder="www.yourcompany.com" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border text-white" style={{ borderColor: '#2a2a2a' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-black mb-1">LICENSE #</label>
                    <input value={company.license} onChange={e=>setCompany(c=>({...c, license: e.target.value}))} placeholder="OH Lic #12345" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border text-white" style={{ borderColor: '#2a2a2a' }} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-black mb-1">PRIMARY COLOR (Gold)</label>
                    <div className="flex gap-2 items-center"><input type="color" value={company.primaryColor} onChange={e=>setCompany(c=>({...c, primaryColor: e.target.value}))} className="w-10 h-10 rounded-lg" /><span className="text-xs text-gray-400">{company.primaryColor}</span></div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black mb-1">SECONDARY COLOR</label>
                    <div className="flex gap-2 items-center"><input type="color" value={company.secondaryColor} onChange={e=>setCompany(c=>({...c, secondaryColor: e.target.value}))} className="w-10 h-10 rounded-lg" /><span className="text-xs text-gray-400">{company.secondaryColor}</span></div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black mb-1">TAGLINE</label>
                    <input value={company.tagline} onChange={e=>setCompany(c=>({...c, tagline: e.target.value}))} placeholder="Asphalt & Sealcoating" className="w-full px-3 py-2 rounded-xl bg-zinc-900 border text-xs text-white" style={{ borderColor: '#2a2a2a' }} />
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
                  <div className="flex gap-3 items-center">
                    {(logoPreview || company.logoDataUrl) ? <img src={logoPreview || company.logoDataUrl} alt="logo" className="w-12 h-12 bg-white rounded-xl p-1 object-contain" onError={(e:any)=>e.target.style.display='none'} /> : <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-xl">🏗️</div>}
                    <div>
                      <p className="font-black text-sm" style={{ color: company.primaryColor }}>{company.name}</p>
                      <p className="text-xs text-gray-400">{company.city}, {company.state} • {company.phone}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black mb-1">YOUR FULL NAME * (Display Name)</label>
                  <input value={admin.displayName} onChange={e=>setAdmin(a=>({...a, displayName: e.target.value}))} placeholder="John Smith - Owner" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border text-white" style={{ borderColor: '#2a2a2a' }} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black mb-1">USERNAME * (login)</label>
                    <input value={admin.username} onChange={e=>setAdmin(a=>({...a, username: e.target.value}))} placeholder="admin or jsmith" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border text-white" style={{ borderColor: '#2a2a2a' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-black mb-1">ADMIN EMAIL *</label>
                    <input value={admin.email} onChange={e=>setAdmin(a=>({...a, email: e.target.value}))} placeholder="you@company.com" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border text-white" style={{ borderColor: '#2a2a2a' }} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black mb-1">PASSWORD *</label>
                    <input type="password" value={admin.password} onChange={e=>setAdmin(a=>({...a, password: e.target.value}))} placeholder="Min 6 chars" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border text-white" style={{ borderColor: '#2a2a2a' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-black mb-1">CONFIRM PASSWORD *</label>
                    <input type="password" value={admin.confirmPassword} onChange={e=>setAdmin(a=>({...a, confirmPassword: e.target.value}))} placeholder="Repeat password" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border text-white" style={{ borderColor: '#2a2a2a' }} />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-950/50 to-blue-950/30 border border-green-800 rounded-xl p-4 text-xs">
                  <p className="font-black text-green-400 flex items-center gap-2">🎉 14-Day Free Trial + $49.99/year</p>
                  <ul className="list-disc ml-4 mt-2 text-gray-300 space-y-1.5 text-[11px]">
                    <li><strong>No credit card needed</strong> to start - trial begins instantly</li>
                    <li>Company "{company.name}" gets full access for 14 days free</li>
                    <li>Logo appears on all estimates, invoices, contracts & prints</li>
                    <li>After trial: <strong>$49.99/year</strong> billed yearly - cancel anytime</li>
                    <li>Admin <strong>{admin.username || '...'}</strong> gets full access to manage users & billing</li>
                    <li>Other companies can sign up on their devices - 100% offline & private data</li>
                  </ul>
                  <div className="mt-3 bg-black/50 rounded-xl p-2.5 border border-green-900/50 flex gap-2 items-center">
                    <span className="text-lg">💳</span>
                    <div><p className="font-black text-[11px] text-white">No payment info needed until trial ends</p><p className="text-[10px] text-gray-400">After 14 days, you'll be asked to add card. $0 today.</p></div>
                  </div>
                </div>
              </>
            )}

            {error && <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm rounded-xl p-3">{error}</div>}

            <div className="flex gap-3">
              {step === 2 && <button type="button" onClick={()=>setStep(1)} className="px-5 py-3 rounded-xl bg-zinc-800 text-white text-sm font-bold border border-zinc-700">← Back</button>}
              {step === 1 ? (
                <button type="button" onClick={handleNext} className="flex-1 py-3.5 rounded-xl font-black text-black" style={{ background: company.primaryColor || '#C5A032' }}>Next: Owner Account →</button>
              ) : (
                <button type="submit" disabled={loading} className="flex-1 py-3.5 rounded-xl font-black text-black disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: company.primaryColor || '#C5A032' }}>
                  {loading ? <><span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span> Creating...</> : `🚀 Create ${company.name} Account`}
                </button>
              )}
            </div>

            <p className="text-[10px] text-center text-gray-500">By signing up, you agree data is stored locally on device. No cloud. You control everything.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
