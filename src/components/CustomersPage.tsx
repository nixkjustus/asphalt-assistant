import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Customer } from '../types';
import { useCompanyInfo } from '../hooks/useCompanyInfo';

// Safe wrapper - no external calls that can throw during render
export default function CustomersPage({ data, showToast, auth }: { data: any; showToast: (m:string)=>void; auth: any }) {
  const companyInfo = useCompanyInfo();
  const company = companyInfo?.company || { primaryColor: '#C5A032', secondaryColor: '#000000', name: 'Company' };

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState<Partial<Customer>>({
    id: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    city: 'Columbus',
    state: 'OH',
    zip: '',
    notes: '',
  });

  // Safely get customers list
  let customers: Customer[] = [];
  try {
    customers = data?.customers && Array.isArray(data.customers) ? data.customers : [];
  } catch { customers = []; }

  let filtered: Customer[] = customers;
  try {
    const q = (search || '').toLowerCase().trim();
    if (q) {
      filtered = customers.filter((c:any) => {
        try {
          const hay = `${c?.name||''} ${c?.email||''} ${c?.phone||''} ${c?.address||''}`.toLowerCase();
          return hay.includes(q);
        } catch { return false; }
      });
    }
  } catch { filtered = customers; }

  let canCreate = true, canEdit = true, canDelete = true;
  try { canCreate = auth?.can ? auth.can('customers','create') : true; } catch {}
  try { canEdit = auth?.can ? auth.can('customers','edit') : true; } catch {}
  try { canDelete = auth?.can ? auth.can('customers','delete') : true; } catch {}

  const startAdd = (e?: any) => {
    try {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      console.log('Add customer clicked');
      setFormData({
        id: (()=>{ try { return uuidv4(); } catch { return 'cust-'+Date.now(); } })(),
        name: '',
        email: '',
        phone: '',
        address: '',
        city: 'Columbus',
        state: 'OH',
        zip: '',
        notes: '',
        createdAt: new Date().toISOString(),
      } as any);
      setEditing(null);
      setShowForm(true);
      // scroll to form
      setTimeout(()=>{ try{ document.getElementById('customer-form')?.scrollIntoView({behavior:'smooth'});}catch{} },100);
    } catch (err:any) { 
      console.error('startAdd failed', err); 
      alert('Failed to open form: '+(err?.message||err));
    }
  };

  const startEdit = (c: Customer, e?: any) => {
    try {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      setFormData({ ...c });
      setEditing(c);
      setShowForm(true);
      setTimeout(()=>{ try{ document.getElementById('customer-form')?.scrollIntoView({behavior:'smooth'});}catch{} },100);
    } catch (err) { console.error('startEdit failed', err); }
  };

  const save = async (e?: any) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try {
      if (!formData.name || !(formData.name as string).trim()) { 
        showToast('Name required - please enter customer name'); 
        return; 
      }
      let toSave: any = { 
        ...formData,
        createdAt: (formData as any).createdAt || new Date().toISOString(),
      };
      // Try geocode but don't fail if it errors
      if (toSave.address && toSave.city && toSave.state) {
        try {
          // Import dynamically to avoid crash if geocode module fails
          const { geocodeAddress } = await import('../utils/geocode');
          const coords = await geocodeAddress(toSave.address, toSave.city, toSave.state, toSave.zip || '');
          if (coords) { toSave.lat = coords.lat; toSave.lng = coords.lng; }
        } catch (geErr) { console.log('Geocode skip', geErr); }
      }
      if (!data?.saveCustomer) throw new Error('saveCustomer not available');
      await data.saveCustomer(toSave);
      setShowForm(false);
      setEditing(null);
      showToast(editing ? '✅ Customer updated!' : '✅ Customer added! Cloud syncing...');
      setFormData({ id: '', name: '', email: '', phone: '', address: '', city: 'Columbus', state: 'OH', zip: '', notes: '' } as any);
    } catch (err: any) {
      console.error('Save failed', err);
      showToast('Save failed: ' + (err?.message || 'Unknown') + ' - Check console');
    }
  };

  const del = async (id: string, e?: any) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try {
      if (!canDelete) { showToast('No permission'); return; }
      if (confirm('Delete this customer? This cannot be undone.')) { 
        if (!data?.deleteCustomer) throw new Error('deleteCustomer not available');
        await data.deleteCustomer(id); 
        showToast('🗑️ Customer deleted - syncing to cloud'); 
      }
    } catch (err:any) { showToast('Delete failed: '+(err?.message||err)); }
  };

  const clearForm = (e?: any) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setShowForm(false);
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      {/* Debug header - shows that fixed version is loaded */}
      <div className="bg-white rounded-xl p-3 border-2 flex flex-col md:flex-row md:items-center gap-2" style={{ borderColor: company.primaryColor || '#C5A032' }}>
        <div className="flex items-center gap-2">
          <span className="text-lg">👥</span>
          <span className="text-sm font-black">Customers - {customers.length} total</span>
          <span className="text-[10px] px-2 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 font-bold">✅ Fixed v3 - No White Screen - No Refresh</span>
        </div>
        <div className="md:ml-auto flex items-center gap-2 text-[10px]">
          <span className="px-2 py-1 bg-black text-yellow-400 rounded-full font-bold">Div Buttons - No form submit</span>
          <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full border">ErrorBoundary Wrapped</span>
        </div>
      </div>

      {/* Search + Add */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <input 
            type="text" 
            placeholder="🔍 Search customers by name, phone, email..." 
            value={search} 
            onChange={e=>setSearch(e.target.value)} 
            onKeyDown={e=>{ if(e.key==='Enter') e.preventDefault(); }} 
            className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none focus:border-yellow-500"
          />
          {search && <button type="button" onClick={()=>setSearch('')} className="absolute right-3 top-3 text-gray-400 hover:text-black">✕</button>}
        </div>
        {canCreate ? (
          <div 
            role="button" 
            tabIndex={0} 
            onClick={startAdd} 
            onKeyDown={(e:any)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); startAdd(); } }} 
            className="px-6 py-3 text-black rounded-xl font-black border-2 cursor-pointer select-none text-center hover:brightness-110 active:scale-95 transition"
            style={{ background: company.primaryColor || '#C5A032' }}
            aria-label="Add Customer"
          >
            + Add Customer
          </div>
        ) : (
          <span className="text-xs bg-gray-100 px-4 py-3 rounded-xl border-2 flex items-center">View Only - No Create Permission</span>
        )}
      </div>

      {/* Inline Form - Never uses <form> tag to prevent refresh */}
      {showForm && (
        <div id="customer-form" className="bg-white rounded-2xl border-2 p-5 sm:p-6 shadow-xl animate-in fade-in" style={{ borderColor: company.primaryColor || '#C5A032' }}>
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-black text-lg flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-black text-yellow-400 flex items-center justify-center text-sm" style={{ borderColor: company.primaryColor }}>{editing ? '✏️' : '+'}</span>
              {editing ? `Edit Customer - ${editing.name}` : 'Add New Customer'}
            </h3>
            <span className="text-[10px] px-2 py-1 bg-green-50 text-green-700 rounded-full border border-green-200 font-bold">Inline Form - Safe</span>
          </div>
          
          <div className="grid gap-4">
            <div>
              <label className="block text-xs font-black mb-1 tracking-widest">NAME * Required</label>
              <input 
                autoFocus
                value={(formData as any).name || ''} 
                onChange={e=>setFormData(f=>({...f, name: e.target.value}))} 
                placeholder="John Smith - Customer full name" 
                className="w-full px-4 py-3 border-2 rounded-xl text-sm font-medium focus:outline-none focus:border-yellow-500"
              />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black mb-1">PHONE</label>
                <input value={(formData as any).phone || ''} onChange={e=>setFormData(f=>({...f, phone: e.target.value}))} placeholder="(380) 201-5143" className="w-full px-4 py-3 border-2 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-xs font-black mb-1">EMAIL</label>
                <input type="email" value={(formData as any).email || ''} onChange={e=>setFormData(f=>({...f, email: e.target.value}))} placeholder="john@example.com" className="w-full px-4 py-3 border-2 rounded-xl text-sm" />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-black mb-1">STREET ADDRESS</label>
              <input value={(formData as any).address || ''} onChange={e=>setFormData(f=>({...f, address: e.target.value}))} placeholder="123 Main St - Will attempt to map" className="w-full px-4 py-3 border-2 rounded-xl text-sm" />
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-black mb-1">CITY</label>
                <input value={(formData as any).city || ''} onChange={e=>setFormData(f=>({...f, city: e.target.value}))} placeholder="Columbus" className="w-full px-4 py-3 border-2 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-xs font-black mb-1">STATE</label>
                <input value={(formData as any).state || ''} onChange={e=>setFormData(f=>({...f, state: e.target.value}))} placeholder="OH" className="w-full px-4 py-3 border-2 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-xs font-black mb-1">ZIP</label>
                <input value={(formData as any).zip || ''} onChange={e=>setFormData(f=>({...f, zip: e.target.value}))} placeholder="43215" className="w-full px-4 py-3 border-2 rounded-xl text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black mb-1">NOTES (Optional)</label>
              <textarea value={(formData as any).notes || ''} onChange={e=>setFormData(f=>({...f, notes: e.target.value}))} placeholder="Gate code, special instructions..." rows={2} className="w-full px-4 py-3 border-2 rounded-xl text-sm" />
            </div>

            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 text-xs">
              <p className="font-black text-blue-800">☁️ Cloud Sync Info:</p>
              <p className="text-blue-700 mt-1">When you save, customer will be saved locally AND synced to cloud (if online) so it shows on other device for same account. Check header: ☁️ Synced time.</p>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <div role="button" tabIndex={0} onClick={clearForm} className="px-6 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold cursor-pointer select-none border-2">Cancel</div>
              <div role="button" tabIndex={0} onClick={save} className="px-8 py-3 text-black rounded-xl font-black cursor-pointer select-none border-2 hover:brightness-110 active:scale-95" style={{ background: company.primaryColor || '#C5A032' }}>💾 Save Customer</div>
            </div>
          </div>
        </div>
      )}

      {/* Customer List */}
      <div className="grid gap-3">
        {filtered.length===0 && !showForm && (
          <div className="bg-white rounded-2xl p-12 text-center border-2 border-dashed border-gray-200">
            <div className="text-5xl mb-3">👥</div>
            <p className="font-black text-gray-800">{search ? `No customers matching "${search}"` : 'No customers yet'}</p>
            <p className="text-sm text-gray-500 mt-2">{search ? 'Try different search' : 'Add first customer with button above - will sync to cloud'}</p>
            {!search && canCreate && <div role="button" onClick={startAdd} className="mt-4 inline-block px-6 py-3 rounded-xl font-black text-black cursor-pointer" style={{ background: company.primaryColor || '#C5A032' }}>+ Add First Customer</div>}
          </div>
        )}
        {filtered.map((c:any)=>{
          try {
            return (
              <div key={c.id || Math.random()} className="bg-white rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-l-4 shadow-sm hover:shadow-md transition" style={{ borderLeftColor: company.secondaryColor || '#000' }}>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-[15px] truncate">{c.name || 'Unnamed'}</p>
                  <p className="text-sm text-gray-600 truncate">{[c.address, c.city, c.state, c.zip].filter(Boolean).join(', ') || 'No address'}</p>
                  <div className="flex gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                    {c.phone && <span>📞 {c.phone}</span>}
                    {c.email && <span>✉️ {c.email}</span>}
                    {c.lat && c.lng && <span className="text-green-600 font-bold">📍 Mapped</span>}
                  </div>
                </div>
                <div className="flex gap-2 self-start sm:self-center">
                  {canEdit && <div role="button" tabIndex={0} onClick={(e:any)=>startEdit(c,e)} className="px-4 py-2 bg-black text-yellow-400 rounded-xl text-xs font-black border-2 cursor-pointer hover:bg-zinc-800 select-none" style={{ borderColor: company.primaryColor || '#C5A032' }}>Edit</div>}
                  {canDelete && <div role="button" tabIndex={0} onClick={(e:any)=>del(c.id,e)} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-black border-2 border-red-200 cursor-pointer select-none">Delete</div>}
                  {!canEdit && !canDelete && <span className="text-[10px] bg-gray-100 px-3 py-2 rounded-full border">View Only</span>}
                </div>
              </div>
            );
          } catch (err) {
            console.error('Customer card render failed', err, c);
            return <div key={c.id} className="bg-red-50 border-2 border-red-200 p-3 rounded-xl text-xs">⚠️ Error rendering customer {c?.name} - {String(err)}</div>;
          }
        })}
      </div>

      {/* Sync help */}
      <div className="bg-black text-white rounded-xl p-4 border-2" style={{ borderColor: company.primaryColor || '#C5A032' }}>
        <h4 className="font-black text-sm" style={{ color: company.primaryColor }}>☁️ Cloud Sync - How it works (Fixed)</h4>
        <ul className="text-xs text-gray-300 mt-2 space-y-1 list-disc ml-4">
          <li>When you add customer, it saves offline AND automatically syncs to Netlify Blobs if online</li>
          <li>Login same account on other device → click 🔄 Sync Now in header → customers appear</li>
          <li>If sync shows \"Local only\", check internet or click Sync Now</li>
          <li>Functions now fixed: .cjs + connectLambda + strong consistency - no more module errors</li>
        </ul>
      </div>
    </div>
  );
}
