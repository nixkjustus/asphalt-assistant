import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response('', { status: 200, headers });
  }

  let store;
  try {
    store = getStore({ name: 'user-data', consistency: 'strong' });
  } catch (e) {
    try { store = getStore('user-data'); } catch (e2) {
      console.error('Failed to get store', e2);
      return new Response(JSON.stringify({ error: 'Blob store init failed: ' + e2.message }), { status: 500, headers });
    }
  }

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId') || req.headers.get('x-user-id') || req.headers.get('X-User-Id');
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId query param' }), { status: 400, headers });
    }
    try {
      let data = null;
      try { data = await store.get(userId, { type: 'json' }); } catch { 
        const raw = await store.get(userId);
        if (raw) { try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { data = null; } }
      }
      if (!data) {
        return new Response(JSON.stringify({ message: 'No cloud data yet', data: null }), { status: 200, headers });
      }
      return new Response(JSON.stringify({ data }), { status: 200, headers });
    } catch (err) {
      console.error('Get user-data error', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { userId, customers, jobs, estimates, invoices, contracts, company, measurements } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers });
      }
      let existing = null;
      try { existing = await store.get(userId, { type: 'json' }); } catch { 
        try { const raw = await store.get(userId); if (raw) existing = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch {}
      }
      existing = existing || {};
      const merged = {
        ...existing,
        customers: customers !== undefined ? customers : existing.customers,
        jobs: jobs !== undefined ? jobs : existing.jobs,
        estimates: estimates !== undefined ? estimates : existing.estimates,
        invoices: invoices !== undefined ? invoices : existing.invoices,
        contracts: contracts !== undefined ? contracts : existing.contracts,
        company: company !== undefined ? company : existing.company,
        measurements: measurements !== undefined ? measurements : existing.measurements,
        updatedAt: new Date().toISOString(),
        lastSync: new Date().toISOString(),
      };
      try { await store.setJSON(userId, merged); } catch { await store.set(userId, JSON.stringify(merged)); }
      console.log(`✅ Saved cloud for ${userId}: ${customers?.length||0} customers`);
      return new Response(JSON.stringify({ success: true, updatedAt: merged.updatedAt }), { status: 200, headers });
    } catch (err) {
      console.error('Save user-data error', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
};

export const config = {
  path: "/.netlify/functions/user-data"
};
