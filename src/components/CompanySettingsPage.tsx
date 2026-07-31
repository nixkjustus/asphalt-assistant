import { useState, useRef } from 'react';
import type { CompanyInfo } from '../types';
import { fileToDataUrl } from '../hooks/useCompanyInfo';
import { useCompanyInfo } from '../hooks/useCompanyInfo';

export default function CompanySettingsPage({ canEdit }: { canEdit: boolean }) {
  const { company, logoUrl, updateCompany, setFullCompany, resetToDefault } = useCompanyInfo();
  const [form, setForm] = useState<CompanyInfo>(company);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(company.logoDataUrl || null);

  const handleLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5*1024*1024) { setToast('Logo must be under 5MB'); return; }
    const dataUrl = await fileToDataUrl(file);
    setPreview(dataUrl);
    setForm(f=>({...f, logoDataUrl: dataUrl}));
  };

  const handleSave = () => {
    if (!form.name.trim()) { setToast('Company name required'); return; }
    setFullCompany(form);
    setToast('Company info saved! Logo now shows on all prints.');
    setTimeout(()=>setToast(null), 3000);
  };

  const handleReset = () => {
    if (!confirm('Reset to default Black Gold info? This will remove custom logo.')) return;
    resetToDefault();
    setForm(company);
    setPreview(null);
    setToast('Reset to default');
    setTimeout(()=>setToast(null),3000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-black text-white rounded-2xl p-6 border-2 flex items-center gap-5" style={{ borderColor: form.primaryColor || '#C5A032' }}>
        {(preview || logoUrl) ? <img src={preview || logoUrl} alt="logo" className="w-24 h-24 bg-white rounded-2xl p-2 object-contain shadow-xl" onError={(e:any)=>e.target.style.display='none'} /> : <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center text-3xl">🏗️</div>}
        <div>
          <h2 className="text-2xl font-black" style={{ color: form.primaryColor || '#C5A032' }}>{form.name || 'Your Company'}</h2>
          <p className="text-sm text-gray-300">{form.city}, {form.state} • {form.phone} • {form.email}</p>
          <p className="text-xs text-gray-500 mt-1">{form.tagline || 'Asphalt and Sealcoating'} • {form.license}</p>
          <div className="mt-2 flex gap-2">
            <span className="text-[10px] px-2 py-1 rounded-full bg-zinc-900 border text-yellow-400" style={{ borderColor: form.primaryColor }}>{form.primaryColor}</span>
            <span className="text-[10px] px-2 py-1 rounded-full bg-white text-black border">{form.secondaryColor}</span>
          </div>
        </div>
      </div>

      {!canEdit && <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-sm text-amber-800">⚠️ View only - you don't have permission to edit company settings. Contact admin.</div>}

      <div className="bg-white rounded-2xl p-6 shadow-sm border-t-4" style={{ borderColor: form.primaryColor }}>
        <h3 className="font-black mb-4">🏢 Company Information - This shows on all prints</h3>
        
        <div className="space-y-5">
          <div className="bg-gray-50 rounded-2xl p-4 border-2 border-dashed">
            <label className="block text-xs font-black tracking-widest mb-2">COMPANY LOGO (Shows on Estimates, Invoices, Contracts, Print)</label>
            <div className="flex gap-4 items-start">
              <div className="w-32 h-32 bg-white rounded-xl border-2 flex items-center justify-center overflow-hidden" style={{ borderColor: form.primaryColor }}>
                {preview || form.logoDataUrl ? <img src={preview || form.logoDataUrl} alt="logo" className="w-full h-full object-contain p-2" /> : <span className="text-4xl">🏗️</span>}
              </div>
              <div className="flex-1 space-y-2">
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogo} className="hidden" />
                <div className="flex gap-2">
                  <button type="button" onClick={()=>fileInputRef.current?.click()} disabled={!canEdit} className="px-4 py-2 rounded-xl bg-black text-yellow-400 text-xs font-black border disabled:opacity-40" style={{ borderColor: form.primaryColor }}>📁 Upload New Logo</button>
                  {(preview || form.logoDataUrl) && <button type="button" onClick={()=>{setPreview(null); setForm(f=>({...f, logoDataUrl: undefined}))}} disabled={!canEdit} className="px-4 py-2 rounded-xl bg-gray-200 text-xs font-bold disabled:opacity-40">Remove</button>}
                </div>
                <p className="text-[11px] text-gray-500">PNG/JPG/SVG up to 5MB. Transparent background recommended. This logo replaces the default and appears everywhere: header, print views, PDFs, dashboard.</p>
                <p className="text-[10px] text-amber-700 bg-amber-50 p-2 rounded-lg border">💡 Tip: Use a square logo at least 500x500px for best print quality. The app stores it as base64 offline.</p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black mb-1">COMPANY NAME *</label>
            <input disabled={!canEdit} value={form.name} onChange={e=>setForm(f=>({...f, name: e.target.value}))} className="w-full px-4 py-3 rounded-xl border-2 font-bold text-lg disabled:bg-gray-100" placeholder="e.g., Black Gold Asphalt & Sealcoating" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-xs font-black mb-1">PHONE</label><input disabled={!canEdit} value={form.phone} onChange={e=>setForm(f=>({...f, phone: e.target.value}))} placeholder="(380) 201-5143" className="w-full px-4 py-3 rounded-xl border" /></div>
            <div><label className="block text-xs font-black mb-1">EMAIL</label><input disabled={!canEdit} value={form.email} onChange={e=>setForm(f=>({...f, email: e.target.value}))} placeholder="info@company.com" className="w-full px-4 py-3 rounded-xl border" /></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-xs font-black mb-1">CITY *</label><input disabled={!canEdit} value={form.city} onChange={e=>setForm(f=>({...f, city: e.target.value}))} placeholder="Columbus" className="w-full px-4 py-3 rounded-xl border" /></div>
            <div><label className="block text-xs font-black mb-1">STATE</label><input disabled={!canEdit} value={form.state} onChange={e=>setForm(f=>({...f, state: e.target.value}))} placeholder="OH" className="w-full px-4 py-3 rounded-xl border" /></div>
            <div><label className="block text-xs font-black mb-1">ZIP</label><input disabled={!canEdit} value={form.zip} onChange={e=>setForm(f=>({...f, zip: e.target.value}))} placeholder="43215" className="w-full px-4 py-3 rounded-xl border" /></div>
          </div>

          <div>
            <label className="block text-xs font-black mb-1">FULL ADDRESS / SERVICE AREA</label>
            <input disabled={!canEdit} value={form.address} onChange={e=>setForm(f=>({...f, address: e.target.value}))} placeholder="Columbus, Ohio and surrounding areas or 123 Industrial Pkwy" className="w-full px-4 py-3 rounded-xl border" />
            <p className="text-[10px] text-gray-500 mt-1">This shows on print header. Can be service area description.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-xs font-black mb-1">WEBSITE</label><input disabled={!canEdit} value={form.website} onChange={e=>setForm(f=>({...f, website: e.target.value}))} placeholder="www.company.com" className="w-full px-4 py-3 rounded-xl border text-sm" /></div>
            <div><label className="block text-xs font-black mb-1">LICENSE #</label><input disabled={!canEdit} value={form.license} onChange={e=>setForm(f=>({...f, license: e.target.value}))} placeholder="OH Lic #12345" className="w-full px-4 py-3 rounded-xl border text-sm" /></div>
            <div><label className="block text-xs font-black mb-1">TAGLINE</label><input disabled={!canEdit} value={form.tagline} onChange={e=>setForm(f=>({...f, tagline: e.target.value}))} placeholder="Asphalt and Sealcoating" className="w-full px-4 py-3 rounded-xl border text-sm" /></div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl border">
            <div><label className="block text-[10px] font-black mb-1">PRIMARY COLOR</label><div className="flex gap-2 items-center"><input disabled={!canEdit} type="color" value={form.primaryColor} onChange={e=>setForm(f=>({...f, primaryColor: e.target.value}))} className="w-10 h-10 rounded-lg" /><span className="text-xs font-mono">{form.primaryColor}</span></div><p className="text-[9px] text-gray-500 mt-1">Gold, buttons</p></div>
            <div><label className="block text-[10px] font-black mb-1">SECONDARY COLOR</label><div className="flex gap-2 items-center"><input disabled={!canEdit} type="color" value={form.secondaryColor} onChange={e=>setForm(f=>({...f, secondaryColor: e.target.value}))} className="w-10 h-10 rounded-lg" /><span className="text-xs font-mono">{form.secondaryColor}</span></div><p className="text-[9px] text-gray-500 mt-1">Black, sidebar</p></div>
            <div className="col-span-2 bg-white p-3 rounded-xl border">
              <p className="text-[10px] font-black">PREVIEW</p>
              <div className="flex gap-2 mt-2">
                <div className="px-3 py-1.5 rounded-full text-xs font-black text-black" style={{ background: form.primaryColor }}>Button</div>
                <div className="px-3 py-1.5 rounded-full text-xs font-black text-white" style={{ background: form.secondaryColor }}>Sidebar</div>
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="flex gap-3 justify-end pt-4 border-t">
              <button onClick={handleReset} className="px-4 py-2.5 rounded-xl bg-gray-200 text-sm font-bold">Reset to Default</button>
              <button onClick={handleSave} className="px-8 py-2.5 rounded-xl bg-black text-yellow-400 text-sm font-black border-2" style={{ borderColor: form.primaryColor }}>💾 Save Company Info</button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 text-sm">
        <h4 className="font-black text-blue-900">📋 Where your company info shows:</h4>
        <ul className="list-disc ml-5 mt-2 text-blue-800 text-xs space-y-1">
          <li>Dashboard header card with logo</li>
          <li>All <strong>Print views</strong> for Estimates, Invoices, Contracts (logo top left)</li>
          <li>Sidebar header logo</li>
          <li>Login and Signup pages</li>
          <li>Email signatures and PDF footers</li>
          <li>Contracts generated by AI</li>
        </ul>
      </div>

      {toast && <div className="fixed bottom-4 right-4 bg-black text-white px-6 py-3 rounded-xl border-2 shadow-xl z-50" style={{ borderColor: form.primaryColor }}>{toast}</div>}
    </div>
  );
}
