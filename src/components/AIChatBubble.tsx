import { useState, useRef, useEffect } from 'react';
import { useCompanyInfo } from '../hooks/useCompanyInfo';
import { useAppData } from '../hooks/useAppData';
import { getAIResponse } from '../utils/aiAssistant';
import { handleAIAction } from '../utils/aiActions';
import { useAuth } from '../hooks/useAuth';

export default function AIChatBubble() {
  const { company, logoUrl } = useCompanyInfo();
  const data = useAppData();
  const auth = useAuth() as any;
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string; time: string }[]>([
    {
      role: 'ai',
      text: `👋 Hi! I'm ${company.name} AI Helper\n\nI can help you with ANY problem in this app:\n\n• 🧭 How to use? "How do I add a customer?"\n• ☁️ Sync issues? "Why is it Local Only?"\n• 👥 Customers not showing?\n• 📋 Estimates / 💰 Invoices / 🔨 Jobs help\n• 📐 Measure tool / 🗺️ Map not finding address?\n• 💳 Billing / trial questions\n• 🐛 Bug or white screen?\n\nTry quick buttons below or type your question. I work offline too!`,
      time: new Date().toLocaleTimeString()
    }
  ]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, isOpen]);

  const send = async (text?: string) => {
    const q = (text || input).trim();
    if (!q) return;
    setMessages(prev => [...prev, { role: 'user', text: q, time: new Date().toLocaleTimeString() }]);
    setInput('');
    setLoading(true);
    try {
      // Try action first (create customer/job etc)
      if (auth && data) {
        try {
          const actionResult = await handleAIAction(q, { ...data, ...auth } as any);
          if (actionResult.didAction) {
            setMessages(prev => [...prev, { role: 'ai', text: actionResult.response, time: new Date().toLocaleTimeString() }]);
            setLoading(false);
            return;
          }
        } catch {}
      }
      // Otherwise general help with app context
      const context = {
        customers: data?.customers || [],
        jobs: data?.jobs || [],
        estimates: data?.estimates || [],
        invoices: data?.invoices || [],
      };
      // Custom help for app problems
      const lower = q.toLowerCase();
      let response: string | null = null;

      if (lower.includes('sync') || lower.includes('local only') || lower.includes('not yet synced') || lower.includes('404')) {
        response = `☁️ **Sync Fix for "${company.name}"**\n\nYour screenshot showed "Local Only" + HTTP 404 Page not found.\n\n**Why:** Functions weren't deployed (0 new functions). Latest fix commit 3988cc1 ADDs netlify/functions back.\n\n**Fix now:**\n1. Netlify Dashboard → wondrous-concha-3a2f5c → Deploys → You should see new deploy with "5 new function(s) to upload" (not 0)\n2. After live, this header card should change from "Local Only" to "☁️Cloud Sync Active"\n3. If still Local Only, tap **🔄 Sync Now** → check console (F12) for "☁️ Cloud SAVE success"\n4. Test functions: https://wondrous-concha-3a2f5c.netlify.app/.netlify/functions/users → should return [] not 404\n\nIf still 404 after clear-cache deploy, it's cache: Hold refresh → Empty cache & hard reload on phone.\n\nOther device: Login same account (admin/BlackGold123) → tap Sync Now → data appears.`;
      } else if (lower.includes('customer') && (lower.includes('add') || lower.includes('white screen') || lower.includes('not showing'))) {
        response = `👥 **Customers Tab Help** - Fixed v3\n\nWhite screen was caused by button type=submit causing refresh. Fixed to div role=button + ErrorBoundary.\n\n**How to add customer now:**\n1. Customers tab → **+ Add Customer** (black/gold button)\n2. Inline form slides down (NOT modal) - Name * required\n3. Fill phone/email/address → **💾 Save Customer**\n4. Should show "✅ Customer added! Cloud syncing..."\n5. Header shows ☁️ Synced time\n\nIf still white screen, you'll now see RED error box with message instead of white. Screenshot that and send it. Also try "Clear Cache & Reload" button in error box.`;
      } else if (lower.includes('estimate') && (lower.includes('white') || lower.includes('not working') || lower.includes('add'))) {
        response = `📋 **Estimates Help** - Fixed JOB_TYPES bug\n\nWhite screen when clicking "New Estimate" was because JOB_TYPES defined only in ContractForm, not top-level → ReferenceError.\n\nFixed: Top-level JOB_TYPES 15 types now.\n\n**How to create estimate:**\n1. Estimates → + New Estimate\n2. Select **Job Type** dropdown (e.g., Residential Remove & Replace, Sealcoating, etc)\n3. Type description e.g., "20x50 driveway, 2 car, removal needed, Grove City"\n4. Click **✨ Generate** → AI creates job-specific line items with Columbus OH pricing\n5. Edit any words → Save\n\nIf white screen, ErrorBoundary will show red box with error, not white.`;
      } else if (lower.includes('measure') || lower.includes('satellite') || lower.includes('pin')) {
        response = `📐 **Measure Tab Help**\n\nSide panel was hidden on mobile - now fixed to always visible below map (420px map + tools below). Say "MEASUREMENT TOOLS - SCROLL DOWN".\n\n**How to measure:**\n1. Measure tab → Address search bar at top → type address → results dropdown → select\n2. Or drag map to job site\n3. Tap map to place pin points → shows Sq Ft, Acres, Perimeter, Tons\n4. Save to history → Export PDF with logo + satellite screenshot → Attach to job\n\nIf satellite blurry: Switch tile layer - Google Clearest (mt1.google... lyrs=s) has maxNativeZoom 20 vs Esri 19, plus Enhance toggle contrast/saturate.\n\nIf address not found: We try 4 providers (ArcGIS, Photon, Nominatim, Census) + lat,lng fallback. Try nearby intersection like "Main St & High St, Columbus OH".`;
      } else if (lower.includes('map') || lower.includes('pin not showing') || lower.includes('verification')) {
        response = `🗺️ **Map Help + Verification**\n\nWhen creating Job: Enter address → Click **🗺️ Check if Shows on Map** → Verifies via geocode, shows preview with lat/lng. If not found, tips + Use My Location button if you're at site.\n\nMapPage: Filter by status, shows 🟢 mapped vs 🟠 no coords. Quick status buttons: Schedule/Start/Complete.\n\nIf job not showing on map: Edit job → Check on Map → manually adjust lat/lng from Google Maps (right-click → copy coordinates → paste).`;
      } else if (lower.includes('billing') || lower.includes('trial') || lower.includes('subscription') || lower.includes('49.99')) {
        response = `💳 **Billing Help - $49.99/year, 14-day trial, no card needed til trial ends**\n\nTrial banner shows days left. After trial, subscribe via:\n- **Real Stripe Payment Link** (easiest, no backend): Paste https://buy.stripe.com/... in Owner Panel → Platform Stripe Config\n- **Price ID checkout**: Needs STRIPE_SECRET_KEY env var in Netlify + Price ID price_... → calls /.netlify/functions/create-checkout\n- **Mock**: Card 4242 4242 4242 4242 for testing\n\nOwner account (admin/justusasphalt@gmail.com) is Lifetime until 2099 auto-activated per your request.\n\nStripe setup screenshot showed purple box with Payment Link, Publishable Key, Price ID, Portal Link - that box is now Owner Panel only (not in Company Settings, so regular companies can't change where payments go).`;
      } else if (lower.includes('apk') || lower.includes('android') || lower.includes('download')) {
        response = `📱 **APK Build Help - 2 options**\n\n**PWABuilder (2 min, recommended for you):** Live link https://wondrous-concha-3a2f5c.netlify.app/ → https://www.pwabuilder.com → Enter URL → Build My PWA → Android → Download APK. Always up-to-date when you deploy site.\n\n**Capacitor (native offline):** Needs 4GB RAM, fails in 1.9GB sandbox with dexBuilder OOM. Fixed via GitHub Actions (7GB RAM cloud): Push to GitHub → Actions tab → Download app-debug.apk artifact. Also have Android Studio project zip (6.8MB) → Open in Android Studio → Build APK.\n\nBoth have shield logo and Asphalt Assistant branding.`;
      } else if (lower.includes('logo') || lower.includes('branding') || lower.includes('black gold')) {
        response = `🎨 **Branding - Fixed per your requests**\n\n- Company: Black Gold Asphalt & Sealcoating, (380) 201-5143, Columbus OH, justusasphalt@gmail.com, logo.png black/gold roller\n- App name: Asphalt Assistant, shield logo app-logo.png (wrench/hammer/road/cone sunset, silver/orange)\n- Login page shows Asphalt Assistant branding, not Black Gold labeling\n- Print: Company name at top, no logo (you asked remove logo, then tiny, then removed), no watermark on contracts\n- Small screens: huge logos fixed (CSS was 17KB vs 52KB due to NODE_ENV development - fixed to production 52.44KB)\n\nIf you see huge logos repeating, hard refresh to clear cache.`;
      } else if (lower.includes('how to') || lower.includes('help') || lower.includes('use') || lower.includes('tutorial')) {
        response = `🧭 **How to use Asphalt Assistant**\n\n**Quick start:**\n1. **Customers**: + Add Customer → name/phone/address (will try to geocode for map)\n2. **Jobs**: + Add Job → select customer → title/description → Check if Shows on Map → sq ft/depth → Save → Quick status buttons Schedule/Start/Complete\n3. **Estimates**: + New Estimate → select Job Type → describe job → AI Generate → edit line items → Save\n4. **Invoices**: From estimate → → Invoice or + New Invoice → From Estimate dropdown → Save → Mark Paid\n5. **Contracts**: + New Contract → Job Type specific → AI Generate → Fully editable textarea → Signature pad (works offline)\n6. **Map**: Filter by status, see pins\n7. **Measure**: Satellite (Esri/Google Clearest) → search address → tap to place pins → sq ft/acres/tons → Save → Export PDF + attach to job\n8. **AI Assistant**: Chat "Add customer John...", "List unpaid invoices", etc\n9. **Users**: Admin can create manager/crew/viewer/custom roles with permissions\n10. **Billing**: Trial 14 days no card, then $49.99/year via real Stripe\n\nWhat specific part needs help? Ask e.g., "How do I measure?" or "Sync error".`;
      }

      if (!response) {
        response = await getAIResponse(q, context);
      }

      setMessages(prev => [...prev, { role: 'ai', text: response!, time: new Date().toLocaleTimeString() }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${e?.message || e}`, time: new Date().toLocaleTimeString() }]);
    } finally {
      setLoading(false);
    }
  };

  const quickHelp = [
    { label: '☁️ Sync Error 404', q: 'Sync shows HTTP 404 Page not found error' },
    { label: '👥 Add Customer', q: 'How do I add a customer? White screen?' },
    { label: '📋 Estimate Help', q: 'How to create estimate? Job type?' },
    { label: '📐 Measure Tool', q: 'How to use Measure tab satellite?' },
    { label: '🗺️ Map Check', q: 'Job not showing on map, how to verify?' },
    { label: '💳 Billing Trial', q: 'How does billing trial and Stripe work?' },
    { label: '📱 APK Build', q: 'How to build APK via PWABuilder vs Capacitor?' },
    { label: '🧭 How to Use App', q: 'How to use app tutorial?' },
  ];

  return (
    <>
      {/* Floating Bubble Button - Always visible */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-5 right-5 z-[100] w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-2xl font-black border-2 hover:scale-110 active:scale-95 transition-transform"
        style={{ background: company.primaryColor || '#FF8C00', color: '#000', borderColor: company.secondaryColor || '#000' }}
        aria-label="AI Help Chat"
      >
        {isOpen ? '✕' : '🤖'}
        {!isOpen && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-20 right-3 sm:right-5 z-[100] w-[92vw] sm:w-[380px] max-w-[380px] h-[70vh] sm:h-[520px] bg-white rounded-2xl shadow-2xl border-2 flex flex-col overflow-hidden" style={{ borderColor: company.primaryColor || '#FF8C00' }}>
          {/* Header */}
          <div className="bg-black text-white p-3 flex items-center gap-3 border-b-2" style={{ borderColor: company.primaryColor || '#FF8C00' }}>
            <img src={logoUrl} alt="logo" className="w-9 h-9 rounded-xl bg-white p-1 object-contain" onError={(e:any)=>e.target.style.display='none'} />
            <div className="flex-1 min-w-0">
              <h3 className="font-black text-sm truncate" style={{ color: company.primaryColor || '#FF8C00' }}>{company.name} AI Help</h3>
              <p className="text-[11px] text-gray-400 truncate">Always here • Offline capable • Fixes for sync/white screen</p>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-full bg-green-600 text-white font-bold animate-pulse">● LIVE</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#fafaf8]">
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[88%] px-3 py-2.5 rounded-2xl text-[13px] whitespace-pre-wrap shadow-sm ${m.role === 'user' ? 'ml-auto bg-black text-white border-2' : 'mr-auto bg-white text-gray-800 border'}`} style={m.role==='user'?{ borderColor: company.primaryColor || '#FF8C00' }: {}}>
                <p>{m.text}</p>
                <p className={`text-[9px] mt-1 ${m.role==='user' ? 'text-gray-400' : 'text-gray-400'}`}>{m.time}</p>
              </div>
            ))}
            {loading && <div className="mr-auto bg-white border px-4 py-3 rounded-2xl text-xs animate-pulse flex gap-2 items-center"><span className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce"></span>AI thinking...</div>}
            <div ref={endRef} />
          </div>

          {/* Quick Help Buttons */}
          <div className="px-2 py-2 border-t bg-white">
            <p className="text-[10px] font-black text-gray-500 mb-1.5 tracking-widest">QUICK HELP - TAP A PROBLEM</p>
            <div className="flex gap-1.5 flex-wrap max-h-[70px] overflow-y-auto">
              {quickHelp.map((h, idx) => (
                <button key={idx} type="button" onClick={()=>send(h.q)} className="text-[10px] px-2.5 py-1 rounded-full bg-black text-yellow-400 border font-bold hover:bg-zinc-800" style={{ borderColor: company.primaryColor || '#FF8C00' }}>
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="p-2 border-t bg-white flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter') send(); }}
              placeholder="Ask: How to fix sync 404? How to add customer?"
              className="flex-1 px-3 py-2.5 border-2 rounded-full text-sm outline-none"
              style={{ borderColor: company.primaryColor || '#FF8C00' }}
            />
            <button type="button" onClick={()=>send()} disabled={loading || !input.trim()} className="w-10 h-10 rounded-full bg-black text-yellow-400 border-2 font-black flex items-center justify-center disabled:opacity-40" style={{ borderColor: company.primaryColor || '#FF8C00' }}>
              ➤
            </button>
          </div>

          {/* Footer */}
          <div className="px-3 py-1.5 bg-gray-50 border-t flex justify-between items-center text-[9px] text-gray-500">
            <span>💡 AI knows your last fix: sync 404 = functions missing</span>
            <span>Black Gold • Columbus OH</span>
          </div>
        </div>
      )}
    </>
  );
}
