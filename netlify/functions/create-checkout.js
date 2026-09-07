import Stripe from 'stripe';

export default async (req, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
  if (!process.env.STRIPE_SECRET_KEY) return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured' }), { status: 500, headers });
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { priceId, email, companyName, origin } = await req.json();
    if (!priceId) return new Response(JSON.stringify({ error: 'Missing priceId' }), { status: 400, headers });
    const requestOrigin = origin || req.headers.get('origin') || req.headers.get('referer')?.replace(/\/$/, '') || 'https://asphaltassistant.netlify.app';
    const cleanOrigin = requestOrigin.replace(/\/$/, '').split('?')[0];
    const successUrl = `${cleanOrigin}?payment_success=true&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${cleanOrigin}?payment_canceled=true`;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      client_reference_id: companyName || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      metadata: { companyName: companyName || 'Unknown', app: 'Asphalt Assistant' },
    });
    return new Response(JSON.stringify({ sessionId: session.id, url: session.url, success: true }), { status: 200, headers });
  } catch (err) {
    console.error('create-checkout error', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};
export const config = { path: "/.netlify/functions/create-checkout" };
