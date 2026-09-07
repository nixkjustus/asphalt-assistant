import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers });

  let store;
  try { store = getStore({ name: 'platform-config', consistency: 'strong' }); } catch { try { store = getStore('platform-config'); } catch (e) { return new Response(JSON.stringify({ error: 'Blob init failed: '+e.message }), { status: 500, headers }); } }

  if (req.method === 'GET') {
    try {
      let config = null;
      try { config = await store.get('stripe', { type: 'json' }); } catch { try { const raw = await store.get('stripe'); if (raw) config = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch {} }
      return new Response(JSON.stringify({ config }), { status: 200, headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { paymentLink, publishableKey, priceId, customerPortalLink } = body;
      const config = { paymentLink, publishableKey, priceId, customerPortalLink, updatedAt: new Date().toISOString() };
      try { await store.setJSON('stripe', config); } catch { await store.set('stripe', JSON.stringify(config)); }
      console.log('✅ Saved platform stripe config', config);
      return new Response(JSON.stringify({ success: true, config }), { status: 200, headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
};

export const config = { path: "/.netlify/functions/platform-config" };
