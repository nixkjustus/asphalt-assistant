import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS, DELETE',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers });

  let store;
  try { store = getStore({ name: 'users', consistency: 'strong' }); } catch { try { store = getStore('users'); } catch (e) { return new Response(JSON.stringify({ error: 'Blob init failed: '+e.message }), { status: 500, headers }); } }

  async function getAll() {
    try { const data = await store.get('list', { type: 'json' }); return data || []; } catch { try { const raw = await store.get('list'); if (!raw) return []; return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; } }
  }
  async function setAll(list) {
    try { await store.setJSON('list', list); } catch { await store.set('list', JSON.stringify(list)); }
  }

  if (req.method === 'GET') {
    try {
      const all = await getAll();
      return new Response(JSON.stringify(all), { status: 200, headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { action, user, username, passwordHash } = body;
      let allUsers = await getAll();

      if (action === 'create' || action === 'signup') {
        if (!user?.username) return new Response(JSON.stringify({ error: 'Missing username' }), { status: 400, headers });
        if (allUsers.some(u => u.username.toLowerCase() === user.username.toLowerCase())) {
          return new Response(JSON.stringify({ error: 'Username exists' }), { status: 400, headers });
        }
        allUsers.push(user);
        await setAll(allUsers);
        return new Response(JSON.stringify({ success: true, user, count: allUsers.length }), { status: 200, headers });
      }

      if (action === 'login') {
        const found = allUsers.find(u => (u.username.toLowerCase() === (username||'').toLowerCase() || u.email.toLowerCase() === (username||'').toLowerCase()) && u.isActive);
        if (!found) return new Response(JSON.stringify({ error: 'User not found' }), { status: 401, headers });
        if (found.passwordHash !== passwordHash) return new Response(JSON.stringify({ error: 'Invalid password' }), { status: 401, headers });
        const updated = allUsers.map(u => u.id === found.id ? { ...u, lastLoginAt: new Date().toISOString() } : u);
        await setAll(updated);
        return new Response(JSON.stringify({ success: true, user: found }), { status: 200, headers });
      }

      if (action === 'update') {
        if (!user?.id) return new Response(JSON.stringify({ error: 'Missing user.id' }), { status: 400, headers });
        allUsers = allUsers.map(u => u.id === user.id ? user : u);
        await setAll(allUsers);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers });
      }

      if (action === 'delete') {
        if (!user?.id) return new Response(JSON.stringify({ error: 'Missing user.id' }), { status: 400, headers });
        allUsers = allUsers.filter(u => u.id !== user.id);
        await setAll(allUsers);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers });
      }

      if (action === 'bulk-sync') {
        const incoming = body.users || [];
        let merged = [...allUsers];
        for (const inc of incoming) {
          if (!merged.some(u => u.id === inc.id || u.username.toLowerCase() === inc.username.toLowerCase())) merged.push(inc);
        }
        await setAll(merged);
        return new Response(JSON.stringify({ success: true, count: merged.length }), { status: 200, headers });
      }

      return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers });
    } catch (err) {
      console.error('users error', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
};

export const config = { path: "/.netlify/functions/users" };
