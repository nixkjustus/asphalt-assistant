import { useState } from 'react';
import { usePlatformConfig } from '../hooks/usePlatformConfig';
import { useCompanyInfo } from '../hooks/useCompanyInfo';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';

export default function PlatformAdminPage() {
  const { config, setFullConfig, clearConfig, hasRealStripe } = usePlatformConfig();
  const { company } = useCompanyInfo();
  const subHook = useSubscription(company.name);
  const auth = useAuth();
  const [form, setForm] = useState({
    paymentLink: config?.paymentLink || '',
    publishableKey: config?.publishableKey || '',
    priceId: config?.priceId || '',
    portalLink: config?.customerPortalLink || '',
  });
  const [toast, setToast] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);

  const handleSave = () => {
    if (!form.paymentLink && !(form.publishableKey && form.priceId)) {
      setToast('Enter at least Payment Link or Publishable Key + Price ID');
      setTimeout(()=>setToast(null),3000);
      return;
    }
    setFullConfig({
      paymentLink: form.paymentLink.trim() || undefined,
      publishableKey: form.publishableKey.trim() || undefined,
      priceId: form.priceId.trim() || undefined,
      customerPortalLink: form.portalLink.trim() || undefined,
    });
    setToast('✅ Platform Stripe config saved! Controls where ALL payments go.');
    setTimeout(()=>setToast(null),4000);
  };

  const makeLifetime = () => {
    if (!confirm('Make YOUR account lifetime paid forever? Until 2099, never expires.')) return;
    subHook.activateLifetime(`Owner Lifetime - ${auth.currentUser?.displayName || 'Platform Owner'}`);
    setToast('🎉 Lifetime activated! Paid forever until 2099.');
    setTimeout(()=>setToast(null),5000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-black text-white rounded-2xl p-6 border-2 flex items-center gap-4" style={{ borderColor: '#FF8C00' }}>
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-2xl">👑</div>
        <div>
          <h2 className="text-xl font-black" style={{ color: '#FF8C00' }}>Platform Owner - Control Panel</h2>
          <p className="text-sm text-gray-300">Only YOU can see/edit this. Controls where $49.99/year goes + lifetime.</p>
          <p className="text-xs text-gray-500 mt-1">User: {auth.currentUser?.displayName} @{auth.currentUser?.username} • {auth.currentUser?.email}</p>
        </div>
      </div>

      <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-400 rounded-2xl p-5">
        <h3 className="font-black text-amber-900 flex items-center gap-2">♾️ Your Account - Lifetime Paid Forever</h3>
        <div className="mt-3 bg-white rounded-xl p-4 border flex flex-col md:flex-row justify-between gap-4">
          <div>
            <p className="text-sm font-bold">Current: {subHook.isLifetime ? '♾️ LIFETIME - Paid Forever Until 2099' : subHook.isActive ? `Active until ${subHook.subscription?.currentPeriodEnd ? new Date(subHook.subscription.currentPeriodEnd).toLocaleDateString() : ''}` : subHook.isTrial ? `Trial - ${subHook.daysLeftInTrial} days left` : 'Expired'}</p>
            {subHook.subscription && (
              <div className="mt-2 text-[11px] bg-gray-50 p-2 rounded-lg font-mono">
                <p>Status: {subHook.subscription.status} {subHook.subscription.isLifetime ? '(LIFETIME)' : ''}</p>
                <p>End: {subHook.subscription.currentPeriodEnd ? new Date(subHook.subscription.currentPeriodEnd).toLocaleDateString() : ''}</p>
                <p>Price: ${subHook.subscription.price} {subHook.subscription.isLifetime ? '(FREE FOREVER)' : ''}</p>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {!subHook.isLifetime ? (
              <button onClick={makeLifetime} className="px-6 py-3 rounded-xl bg-black text-yellow-400 font-black border-2 text-sm" style={{ borderColor: '#FF8C00' }}>♾️ Make My Account Lifetime Forever</button>
            ) : (
              <div className="px-6 py-3 rounded-xl bg-green-600 text-white font-black text-sm text-center border-2 border-green-700">✅ Lifetime - Paid Forever Until 2099</div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5">
        <h3 className="font-black text-amber-900">🔒 Why locked to you only:</h3>
        <p className="text-sm text-amber-800 mt-2">If Stripe settings were in Company Settings, any company could change Payment Link to their account and steal payments. Now only owner (admin / justusasphalt@gmail.com) sees this.</p>
      </div>

      <div className="bg-white rounded-2xl border-2 p-6 shadow-sm" style={{ borderColor: hasRealStripe ? '#22c55e' : '#e5e7eb' }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black">💳 Platform Stripe - Where $49.99/year Goes</h3>
          <span className={`text-xs px-3 py-1 rounded-full font-black border ${hasRealStripe ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300'}`}>{hasRealStripe ? '✅ Real' : '⚠️ Mock'}</span>
        </div>
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-black mb-2">STRIPE PAYMENT LINK (REAL) - RECOMMENDED</label>
            <input value={form.paymentLink} onChange={e=>setForm(f=>({...f, paymentLink: e.target.value}))} placeholder="https://buy.stripe.com/..." className="w-full px-4 py-3 rounded-xl border-2 text-sm font-mono" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black mb-1">PUBLISHABLE KEY</label>
              <div className="relative">
                <input type={showKeys ? 'text' : 'password'} value={form.publishableKey} onChange={e=>setForm(f=>({...f, publishableKey: e.target.value}))} placeholder="pk_test_..." className="w-full px-4 py-3 rounded-xl border text-xs font-mono pr-16" />
                <button type="button" onClick={()=>setShowKeys(!showKeys)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-2 py-1 bg-black text-yellow-400 rounded-full border font-bold">{showKeys?'HIDE':'SHOW'}</button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-black mb-1">PRICE ID</label>
              <input type={showKeys ? 'text' : 'password'} value={form.priceId} onChange={e=>setForm(f=>({...f, priceId: e.target.value}))} placeholder="price_..." className="w-full px-4 py-3 rounded-xl border text-xs font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-black mb-1">CUSTOMER PORTAL LINK</label>
            <input value={form.portalLink} onChange={e=>setForm(f=>({...f, portalLink: e.target.value}))} placeholder="https://billing.stripe.com/p/login/..." className="w-full px-4 py-3 rounded-xl border text-xs font-mono" />
          </div>
          <div className="flex gap-3">
            <button onClick={handleSave} className="flex-1 py-3.5 rounded-xl bg-black text-yellow-400 font-black border-2 text-sm" style={{ borderColor: '#FF8C00' }}>💾 Save Platform Stripe Config</button>
            <button onClick={()=>{ if (confirm('Clear?')) { clearConfig(); setForm({ paymentLink: '', publishableKey: '', priceId: '', portalLink: '' }); setToast('Cleared'); setTimeout(()=>setToast(null),3000); }}} className="px-5 py-3 rounded-xl bg-red-50 border-2 border-red-200 text-red-700 font-bold text-sm">Clear</button>
          </div>
        </div>
      </div>
      {toast && <div className="fixed bottom-4 right-4 bg-black text-white px-6 py-3 rounded-xl border-2 shadow-xl z-50" style={{ borderColor: '#FF8C00' }}>{toast}</div>}
    </div>
  );
}
