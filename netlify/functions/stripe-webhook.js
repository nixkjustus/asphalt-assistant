import Stripe from 'stripe';

export default async (req, context) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (!process.env.STRIPE_SECRET_KEY) return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured' }), { status: 500, headers });
  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let stripeEvent;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const body = await req.text();
    if (webhookSecret && sig) stripeEvent = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    else { console.warn('No webhook secret, skipping verification'); stripeEvent = JSON.parse(body); }
    console.log(`Stripe event ${stripeEvent.type}`);
    return new Response(JSON.stringify({ received: true, type: stripeEvent.type }), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Webhook Error: ${err.message}` }), { status: 400, headers });
  }
};
export const config = { path: "/.netlify/functions/stripe-webhook" };
