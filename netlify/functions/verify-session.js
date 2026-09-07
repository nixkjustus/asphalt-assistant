import Stripe from 'stripe';

export default async (req, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers });
  if (!process.env.STRIPE_SECRET_KEY) return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured' }), { status: 500, headers });
  const url = new URL(req.url);
  let sessionId = url.searchParams.get('session_id');
  if (!sessionId && req.method === 'POST') { try { const b = await req.json(); sessionId = b.session_id; } catch {} }
  if (!sessionId) return new Response(JSON.stringify({ error: 'Missing session_id' }), { status: 400, headers });
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription', 'customer'] });
    const isPaid = session.payment_status === 'paid' || session.status === 'complete';
    let periodEnd = null;
    let customerEmail = session.customer_details?.email || session.customer_email;
    const subscription = session.subscription;
    if (subscription && typeof subscription === 'object') periodEnd = new Date(subscription.current_period_end * 1000).toISOString();
    else if (session.subscription) { try { const sub = await stripe.subscriptions.retrieve(session.subscription); periodEnd = new Date(sub.current_period_end * 1000).toISOString(); } catch {} }
    return new Response(JSON.stringify({ success: true, verified: isPaid, sessionId: session.id, paymentStatus: session.payment_status, status: session.status, customerEmail, subscriptionId: typeof subscription === 'object' ? subscription.id : subscription, currentPeriodEnd: periodEnd, shouldActivate: isPaid }), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, verified: false }), { status: 500, headers });
  }
};
export const config = { path: "/.netlify/functions/verify-session" };
