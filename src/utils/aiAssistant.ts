import type { Customer, Job, Estimate, Invoice } from '../types';

interface ContextData {
  customers: Customer[];
  jobs: Job[];
  estimates: Estimate[];
  invoices: Invoice[];
}

export async function getAIResponse(question: string, context: ContextData): Promise<string> {
  const q = question.toLowerCase();

  // Simulate latency
  await new Promise(r => setTimeout(r, 500));

  // Revenue queries
  if (q.includes('revenue') || q.includes('money') || q.includes('income')) {
    const paid = context.invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
    const outstanding = context.invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.balanceDue, 0);
    return `Here's your financial snapshot:\n\n💰 Paid revenue: $${paid.toLocaleString()}\n⚠️ Outstanding: $${outstanding.toLocaleString()} from ${context.invoices.filter(i=>i.status!=='paid').length} invoices\n\nTip: Follow up on overdue invoices to improve cash flow. Would you like me to draft a payment reminder?`;
  }

  if (q.includes('job') && (q.includes('scheduled') || q.includes('active') || q.includes('status'))) {
    const scheduled = context.jobs.filter(j => j.status === 'scheduled').length;
    const active = context.jobs.filter(j => j.status === 'in-progress').length;
    const completed = context.jobs.filter(j => j.status === 'completed').length;
    return `Job Status:\n📅 Scheduled: ${scheduled}\n🔨 In Progress: ${active}\n✅ Completed: ${completed}\n\n${context.jobs.filter(j=>j.status==='scheduled').slice(0,3).map(j=>`• ${j.title} - ${j.customerName} - ${j.scheduledDate||'TBD'}`).join('\n')}`;
  }

  if (q.includes('estimate') && q.includes('tonnage')) {
    const lastJob = context.jobs[context.jobs.length - 1];
    if (lastJob?.squareFootage && lastJob?.depth) {
      return `For ${lastJob.squareFootage.toLocaleString()} sq ft at ${lastJob.depth}" depth, you need ~${lastJob.asphaltTonnage} tons of asphalt (includes 10% waste factor). Formula: (sqft × depth/12 × 145 lb/cf ÷ 2000) × 1.1`;
    }
    return `Tonnage formula: Tons = (SqFt × Depth(in)/12 × 145 ÷ 2000) × 1.1 waste factor. Example: 1,000 sq ft at 3" depth = ~19.94 tons. Give me your dimensions and I can calculate it!`;
  }

  if (q.includes('price') || q.includes('cost') || q.includes('how much')) {
    return `Columbus-area Black Gold pricing (2024-2025):\n\n🏠 Residential driveway (2-2.5"): $3.50 - $6.50 / sq ft\n🅿️ Parking lot (3"): $3.00 - $5.00 / sq ft\n🛣️ Overlay (1.5"): $2.00 - $3.50 / sq ft\n🧱 Sealcoat: $0.25 - $0.40 / sq ft (Columbus rates)\n\nCost drivers: Base prep, drainage, haul distance, oil prices. For a precise quote, use the AI Estimator in Estimates → + New Estimate → 🤖 AI Generate`;
  }

  if (q.includes('seal') || q.includes('crack') || q.includes('pothole')) {
    return `Paving Pro Tip:\n\n• Sealcoat every 2-3 years - extends life 2x\n• Crack fill before sealcoat - use hot rubber for cracks >1/4"\n• Pothole repair: Saw cut, remove 4", compact base, tack coat, 3" hot mix in lifts\n• Always check drainage - 2% slope minimum (1/4" per foot)\n\nNeed a custom line-item estimate for this repair type?`;
  }

  if (q.includes('contract') || q.includes('warranty') || q.includes('terms')) {
    return `Standard Akron Paving Contract should include:\n\n✓ Scope & sq ft\n✓ Depth/type (e.g., ODOT 448 Type 1 Surface)\n✓ Base prep included\n✓ Exclusions (permits, striping unless noted)\n✓ Payment terms (e.g., 50% upfront, 50% on completion)\n✓ 1-year workmanship warranty\n✓ Change order clause\n\nI can generate a full contract in Contracts → + New Contract → 🤖 AI Generate`;
  }

  // Default helpful assistant
  return `I'm your offline-capable paving assistant! I can help with:\n\n• 📊 Metrics: "What's my revenue?" or "How many jobs scheduled?"\n• 🧮 Calculations: "Tonnage for 1500sqft 3 inches"\n• 💲 Pricing: "Cost per sq ft for driveway?"\n• 🔨 Best practices: "How to fix potholes?"\n• 📄 Contracts & legal tips\n\nYou have ${context.customers.length} customers, ${context.jobs.length} jobs, ${context.estimates.length} estimates. What do you want to dive into?\n\n(Tip: All this works offline - data is stored locally on your device!)`;
}
