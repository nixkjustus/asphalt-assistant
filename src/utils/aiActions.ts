import { v4 as uuidv4 } from 'uuid';
import type { Customer, Job, Estimate, Invoice, Contract } from '../types';
import { calculateAsphaltTonnage } from './geocode';
import { generateAIEstimate, generateAIContract } from './aiEstimator';

type AppData = {
  customers: Customer[];
  jobs: Job[];
  estimates: Estimate[];
  invoices: Invoice[];
  contracts: Contract[];
  saveCustomer: (c: Customer) => Promise<void>;
  saveJob: (j: Job) => Promise<void>;
  saveEstimate: (e: Estimate) => Promise<void>;
  saveInvoice: (i: Invoice) => Promise<void>;
  saveContract: (c: Contract) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  deleteEstimate: (id: string) => Promise<void>;
};

function extractEmail(text: string): string {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : '';
}

function extractPhone(text: string): string {
  const m = text.match(/(?:\(?\d{3}\)?[\s\-\.]?\d{3}[\s\-\.]?\d{4})|(\d{3}[\s\-\.]\d{3}[\s\-\.]\d{4})/);
  if (m) return m[0].trim();
  const m2 = text.match(/(?:phone|ph|tel|call)[\s:]*([\(\)\d\-\s]{10,20})/i);
  return m2 ? m2[1].trim() : '';
}

function extractSqFt(text: string): number | null {
  const m = text.match(/(\d{2,5})\s*(?:sq\s*ft|sft|sf|square\s*ft|sqft|square\s*feet)/i);
  if (m) return parseInt(m[1].replace(/,/g,''),10);
  const m2 = text.match(/(\d{3,5})\s*(?:foot|ft)/i);
  if (m2) {
    const n = parseInt(m2[1],10);
    if (n>=100 && n<=20000) return n;
  }
  return null;
}

function extractDepth(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:"|inch|in\b|inches)/i);
  if (m) {
    const d = parseFloat(m[1]);
    if (d>=0.5 && d<=12) return d;
  }
  return null;
}

function extractZIP(text: string): string {
  const m = text.match(/\b\d{5}(?:-\d{4})?\b/);
  return m ? m[0] : '';
}

function findCustomer(query: string, customers: Customer[]): Customer | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  let found = customers.find(c => c.name.toLowerCase() === q);
  if (found) return found;
  found = customers.find(c => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()));
  if (found) return found;
  const parts = q.split(' ');
  for (const part of parts) {
    if (part.length < 3) continue;
    found = customers.find(c => c.name.toLowerCase().includes(part));
    if (found) return found;
  }
  return null;
}

function parseCustomerNameFromAdd(text: string): string {
  const m = text.match(/(?:add|create|new)\s+customer\s+([a-z\s\.\-']+?)(?:\s+phone|\s+email|\s+address|\s+city|\s+zip|\s+with|\s*$)/i);
  if (m) return m[1].trim().replace(/[,]+$/,'');
  const m2 = text.match(/customer\s+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (m2) return m2[1].trim();
  return '';
}

function extractAddressBlock(text: string): { address: string; city: string; state: string; zip: string } {
  let address = '';
  let city = 'Columbus';
  let state = 'OH';
  let zip = '';
  
  const addrMatch = text.match(/address\s+([^,]+(?:,\s*[^,]+)*?)(?:\s+city|\s+zip|\s+phone|\s+email|$)/i);
  if (addrMatch) {
    address = addrMatch[1].trim();
    const parts = address.split(',');
    if (parts.length >= 2) {
      address = parts[0].trim();
      city = parts[1].trim() || city;
    }
  }
  zip = extractZIP(text);
  const cityMatch = text.match(/city\s+([A-Za-z\s]+?)(?:\s+state|\s+zip|\s+phone|\s+email|$)/i);
  if (cityMatch) city = cityMatch[1].trim();
  const stateMatch = text.match(/state\s+([A-Za-z]{2})/i);
  if (stateMatch) state = stateMatch[1].toUpperCase();
  
  if (!address) {
    const streetMatch = text.match(/(\d+\s+[A-Za-z\s]+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Ln|Lane|Ct|Circle|Way)\.?)/i);
    if (streetMatch) address = streetMatch[1].trim();
  }
  
  return { address, city, state, zip };
}

function findEstimate(query: string, estimates: Estimate[]): Estimate | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  let found = estimates.find(e => e.title.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
  if (found) return found;
  // Try last few words
  const words = q.split(' ').filter(w=>w.length>3);
  for (const w of words) {
    found = estimates.find(e => e.title.toLowerCase().includes(w));
    if (found) return found;
  }
  return estimates[estimates.length-1] || null;
}

function findInvoice(query: string, invoices: Invoice[]): Invoice | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  let found = invoices.find(i => i.title.toLowerCase().includes(q) || i.id.toLowerCase().includes(q) || i.customerName?.toLowerCase().includes(q));
  if (found) return found;
  return invoices[invoices.length-1] || null;
}

export async function handleAIAction(input: string, data: AppData): Promise<{ response: string; didAction: boolean }> {
  const text = input.trim();
  const lower = text.toLowerCase();

  if (lower.includes('what can you do') || lower === 'help' || lower.includes('show commands')) {
    return {
      didAction: false,
      response: `🔧 Asphalt Assistant AI - I can DO things!

**CUSTOMERS:**
• "Add customer John Smith phone 380-201-1234 email john@email.com address 123 Main St Columbus OH 43215"
• "Find customer John" / "List customers"

**ESTIMATES - NOW NO CUSTOMER NEEDED:**
• "Create estimate - 1500 sq ft driveway sealcoating with crack fill $2500" (no customer needed!)
• "Create estimate for John Smith - 1500 sq ft driveway"
• "Add customer John to estimate Driveway Sealcoating"
• "Add customer info to estimate [title] - John Smith phone 380..."

**INVOICES - NOW NO CUSTOMER NEEDED:**
• "Create invoice - 1500 sq ft driveway $3000" (no customer needed!)
• "Create invoice for John from his last estimate"
• "Add customer John to invoice Driveway"
• "Add customer info to invoice [title] - email, phone, address"

**JOBS:**
• "Add job for John Smith - driveway sealcoating 1500 sq ft"

**OTHER:**
• "List estimates / invoices / jobs / contracts"
• "Mark invoice [title] as paid"

Try: "Create estimate 20x50 driveway removal and replace" (no customer needed, you can add customer later in Estimates tab → Edit → Customer)`
    };
  }

  if (lower.startsWith('list ') || lower.startsWith('show ') || lower.includes('how many')) {
    if (lower.includes('customer')) {
      if (data.customers.length === 0) return { response: 'No customers yet. Say "Add customer [name]..." to create one.', didAction: false };
      const list = data.customers.slice(-10).map(c => `• ${c.name} - ${c.phone || 'no phone'} - ${c.city || 'Columbus'}`).join('\n');
      return { response: `📋 Last ${Math.min(10, data.customers.length)} of ${data.customers.length} customers:\n${list}`, didAction: false };
    }
    if (lower.includes('job')) {
      const filtered = lower.includes('scheduled') ? data.jobs.filter(j=>j.status==='scheduled') : lower.includes('active') || lower.includes('in progress') ? data.jobs.filter(j=>j.status==='in-progress') : data.jobs;
      if (filtered.length===0) return { response: 'No jobs found.', didAction: false };
      const list = filtered.slice(-8).map(j=>`• ${j.title} - ${j.customerName || 'No customer'} - ${j.status}`).join('\n');
      return { response: `🔨 Jobs (${filtered.length}):\n${list}`, didAction: false };
    }
    if (lower.includes('estimate')) {
      if (data.estimates.length===0) return { response: 'No estimates yet. Say "Create estimate 1500 sq ft driveway..." (no customer needed)', didAction: false };
      const list = data.estimates.slice(-6).map(e=>`• ${e.title} - ${e.customerName || 'No customer'} - $${e.total.toFixed(2)}`).join('\n');
      return { response: `📋 Estimates:\n${list}`, didAction: false };
    }
    if (lower.includes('invoice')) {
      const unpaid = data.invoices.filter(i=>i.status!=='paid');
      const target = lower.includes('unpaid') ? unpaid : data.invoices;
      if (target.length===0) return { response: lower.includes('unpaid') ? 'No unpaid invoices!' : 'No invoices yet. Say "Create invoice 1500 sq ft..." (no customer needed)', didAction: false };
      const list = target.slice(-6).map(i=>`• ${i.title} - ${i.customerName || 'No customer'} - $${i.total.toFixed(2)} bal $${i.balanceDue.toFixed(2)}`).join('\n');
      return { response: `💰 Invoices (${target.length}):\n${list}`, didAction: false };
    }
  }

  // ADD CUSTOMER
  if ((lower.startsWith('add customer') || lower.startsWith('create customer') || lower.startsWith('new customer')) || (lower.includes('add a customer') && lower.split('customer').length>1)) {
    let name = parseCustomerNameFromAdd(text);
    if (!name || name.length < 2) {
      const fallback = text.match(/customer\s+([A-Za-z\s]+)/i);
      if (fallback) name = fallback[1].split(/phone|email|address/i)[0].trim();
    }
    if (!name || name.length < 3) {
      return { response: `❓ I need a name. Try: "Add customer John Smith phone 380-201-5143 address 123 Main St Columbus OH 43215"`, didAction: false };
    }
    const email = extractEmail(text);
    const phone = extractPhone(text);
    const { address, city, state, zip } = extractAddressBlock(text);
    
    const customer: Customer = {
      id: uuidv4(),
      name: name.split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' '),
      email,
      phone,
      address: address || '',
      city: city || 'Columbus',
      state: state || 'OH',
      zip: zip || '',
      notes: `Created via AI: "${text}"`,
      createdAt: new Date().toISOString(),
    };
    await data.saveCustomer(customer);
    return { response: `✅ Customer created!\n\n👤 ${customer.name}\n📞 ${customer.phone || 'No phone'} \n✉️ ${customer.email || 'No email'}\n📍 ${customer.address} ${customer.city}, ${customer.state} ${customer.zip}\n\nID: ${customer.id.slice(0,8)}\nYou can now say "Add customer ${customer.name} to estimate [title]"`, didAction: true };
  }

  // ADD CUSTOMER TO EXISTING ESTIMATE (NEW - allows adding customer after estimate created)
  if ((lower.includes('add customer') || lower.includes('add client')) && lower.includes('estimate')) {
    // Patterns: "Add customer John to estimate Driveway" or "Add customer info to estimate X - John phone..."
    const custNameMatch = text.match(/add customer\s+([A-Za-z\s]+?)\s+to estimate/i) || text.match(/add customer\s+([A-Za-z\s]+?)\s+to/i);
    const estMatch = text.match(/to estimate\s+(.+)/i) || text.match(/estimate\s+([A-Za-z0-9\s\-]+?)(?:\s*-\s*|\s*$)/i);
    
    let cust: Customer | null = null;
    let est: Estimate | null = null;

    if (custNameMatch) cust = findCustomer(custNameMatch[1], data.customers);
    if (!cust) {
      // Try find any customer in text
      for (const c of data.customers) {
        if (lower.includes(c.name.toLowerCase())) { cust = c; break; }
      }
    }

    if (estMatch) est = findEstimate(estMatch[1], data.estimates);
    if (!est) est = findEstimate(text, data.estimates);

    if (!est) return { response: `❌ Estimate not found. Available: ${data.estimates.map(e=>e.title).join(', ') || 'none'}`, didAction: false };
    if (!cust) {
      // If no customer found but text has customer info like name, phone, email, create inline customer info
      const inlineName = parseCustomerNameFromAdd(text) || text.match(/customer\s+([A-Za-z\s]+)/i)?.[1] || '';
      const inlineEmail = extractEmail(text);
      const inlinePhone = extractPhone(text);
      const addrBlock = extractAddressBlock(text);
      
      if (inlineName || inlineEmail || inlinePhone) {
        const updated: Estimate = {
          ...est,
          customerName: inlineName || est.customerName || '',
          customerEmail: inlineEmail || est.customerEmail || '',
          customerPhone: inlinePhone || est.customerPhone || '',
          customerAddress: addrBlock.address ? `${addrBlock.address}, ${addrBlock.city}, ${addrBlock.state} ${addrBlock.zip}` : est.customerAddress || '',
        };
        await data.saveEstimate(updated);
        return { response: `✅ Added inline customer info to estimate "${est.title}"!\n\n👤 ${updated.customerName || 'No name'}\n📞 ${updated.customerPhone || 'No phone'}\n✉️ ${updated.customerEmail || 'No email'}\n📍 ${updated.customerAddress || 'No address'}\n\nYou can edit more in Estimates tab → Edit`, didAction: true };
      }
      return { response: `❌ Customer not found. Try "Add customer John Smith to estimate ${est.title}" or provide info like "Add customer info to estimate ${est.title} - John Smith phone 380-201-1234 email john@test.com"`, didAction: false };
    }

    const updated: Estimate = {
      ...est,
      customerId: cust.id,
      customerName: cust.name,
      customerEmail: cust.email,
      customerPhone: cust.phone,
      customerAddress: `${cust.address}, ${cust.city}, ${cust.state} ${cust.zip}`.trim(),
    };
    await data.saveEstimate(updated);
    return { response: `✅ Added customer ${cust.name} to estimate "${est.title}"!\n\nNow estimate shows customer: ${cust.name} • ${cust.phone} • ${cust.email}\nView in Estimates tab`, didAction: true };
  }

  // ADD CUSTOMER TO EXISTING INVOICE (NEW)
  if ((lower.includes('add customer') || lower.includes('add client') || lower.includes('customer info')) && lower.includes('invoice')) {
    const custNameMatch = text.match(/add customer\s+([A-Za-z\s]+?)\s+to invoice/i) || text.match(/to invoice\s+.*customer\s+([A-Za-z\s]+)/i);
    let cust: Customer | null = null;
    let inv: Invoice | null = null;

    if (custNameMatch) cust = findCustomer(custNameMatch[1], data.customers);
    if (!cust) {
      for (const c of data.customers) {
        if (lower.includes(c.name.toLowerCase())) { cust = c; break; }
      }
    }

    const invMatch = text.match(/to invoice\s+(.+)/i) || text.match(/invoice\s+([A-Za-z0-9\s\-]+?)(?:\s*-\s*|\s*$)/i);
    if (invMatch) inv = findInvoice(invMatch[1], data.invoices);
    if (!inv) inv = findInvoice(text, data.invoices);

    if (!inv) return { response: `❌ Invoice not found. Available: ${data.invoices.map(i=>i.title).join(', ') || 'none'}`, didAction: false };

    if (!cust) {
      const inlineName = parseCustomerNameFromAdd(text) || '';
      const inlineEmail = extractEmail(text);
      const inlinePhone = extractPhone(text);
      const addrBlock = extractAddressBlock(text);
      
      if (inlineName || inlineEmail || inlinePhone) {
        const updated: Invoice = {
          ...inv,
          customerName: inlineName || inv.customerName || '',
          customerEmail: inlineEmail || inv.customerEmail || '',
          customerPhone: inlinePhone || inv.customerPhone || '',
          customerAddress: addrBlock.address ? `${addrBlock.address}, ${addrBlock.city}, ${addrBlock.state} ${addrBlock.zip}` : inv.customerAddress || '',
        };
        await data.saveInvoice(updated);
        return { response: `✅ Added inline customer info to invoice "${inv.title}"!\n\n👤 ${updated.customerName}\n📞 ${updated.customerPhone}\n✉️ ${updated.customerEmail}\n📍 ${updated.customerAddress}`, didAction: true };
      }
      return { response: `❌ Customer not found. Try "Add customer John to invoice ${inv.title}"`, didAction: false };
    }

    const updated: Invoice = {
      ...inv,
      customerId: cust.id,
      customerName: cust.name,
      customerEmail: cust.email,
      customerPhone: cust.phone,
      customerAddress: `${cust.address}, ${cust.city}, ${cust.state} ${cust.zip}`.trim(),
    };
    await data.saveInvoice(updated);
    return { response: `✅ Added customer ${cust.name} to invoice "${inv.title}"!`, didAction: true };
  }

  // ADD JOB - allow no customer? Keep requiring customer for jobs (needs address)
  if (lower.includes('add job') || lower.includes('create job') || lower.startsWith('new job')) {
    const forMatch = text.match(/for\s+([A-Za-z\s]+?)(?:\s+-\s+|\s+–\s+|\s+driveway|\s+parking|\s+seal|\s+\d+\s*sq|\s*$)/i);
    let customer: Customer | null = null;
    let customerNameFromText = '';
    if (forMatch) {
      customerNameFromText = forMatch[1].trim();
      customer = findCustomer(customerNameFromText, data.customers);
    }
    if (!customer) {
      for (const c of data.customers) {
        if (lower.includes(c.name.toLowerCase().split(' ')[0]) && lower.includes(c.name.toLowerCase().split(' ').pop()||'')) {
          customer = c;
          break;
        }
      }
    }
    if (!customer && data.customers.length === 0) {
      return { response: `❌ No customers yet. Add a customer first: "Add customer John Smith..."`, didAction: false };
    }
    if (!customer) {
      return { response: `❌ Customer "${customerNameFromText || '???'}" not found. Available: ${data.customers.map(c=>c.name).join(', ') || 'none'}`, didAction: false };
    }
    const sqft = extractSqFt(text) || 1200;
    const depth = extractDepth(text) || (lower.includes('seal') ? 0 : 3);
    let title = '';
    const titleMatch = text.match(/(?:for\s+[^\-\n]+-\s*)(.+?)(?:\s*\d+\s*sq|\s*$)/i);
    if (titleMatch) title = titleMatch[1].trim();
    else {
      title = text.replace(/.*for\s+[A-Za-z\s]+/i,'').replace(/\d+\s*sq.*/i,'').trim();
      if (!title || title.length < 3) title = `Sealcoating & Paving - ${sqft} sq ft`;
    }
    if (title.length > 60) title = title.slice(0,60);
    
    const job: Job = {
      id: uuidv4(),
      customerId: customer.id,
      customerName: customer.name,
      title: title.split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ').slice(0,80),
      description: `Created via AI: "${text}".`,
      address: customer.address || '',
      city: customer.city || 'Columbus',
      state: customer.state || 'OH',
      zip: customer.zip || '',
      status: 'potential',
      squareFootage: sqft,
      depth: depth || undefined,
      asphaltTonnage: depth ? calculateAsphaltTonnage(sqft, depth) : undefined,
      scheduledDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };
    await data.saveJob(job);
    return { response: `✅ Job created for ${customer.name}!\n\n🔨 ${job.title}\n📐 ${job.squareFootage} sq ft`, didAction: true };
  }

  // CREATE ESTIMATE - NOW ALLOWS NO CUSTOMER
  if (lower.includes('create estimate') || lower.includes('new estimate') || (lower.includes('estimate for') && !lower.includes('list'))) {
    let cust: Customer | null = null;
    const forMatch = text.match(/estimate\s+for\s+([A-Za-z\s]+?)(?:\s+-\s+|\s+\d+|\s*$)/i) || text.match(/for\s+([A-Za-z\s]+?)\s+(?:\d+|driveway|parking|seal)/i);
    if (forMatch) {
      cust = findCustomer(forMatch[1], data.customers);
    }
    if (!cust) {
      for (const c of data.customers) {
        if (lower.includes(c.name.toLowerCase())) { cust = c; break; }
      }
    }
    const hasCustomer = !!cust;
    let prompt = text.replace(/create estimate for\s+[A-Za-z\s]+/i,'').trim();
    if (!prompt) prompt = text;
    if (prompt.length < 5) prompt = `${cust ? cust.name + ' - ' : ''}1500 sq ft driveway sealcoating Columbus OH`;
    
    const aiResult = await generateAIEstimate(prompt, { squareFootage: extractSqFt(text) || undefined, depth: extractDepth(text) || undefined, title: prompt });
    
    const estimate: Estimate = {
      id: uuidv4(),
      customerId: cust?.id || '',
      customerName: cust?.name || '',
      title: aiResult.title,
      lineItems: aiResult.lineItems,
      subtotal: aiResult.lineItems.reduce((s,i)=>s+i.total,0),
      taxRate: 0,
      tax: 0,
      total: aiResult.lineItems.reduce((s,i)=>s+i.total,0),
      status: 'draft',
      validUntil: new Date(Date.now()+30*24*3600*1000).toISOString().split('T')[0],
      notes: aiResult.notes,
      createdAt: new Date().toISOString(),
    };
    estimate.total = estimate.subtotal;
    await data.saveEstimate(estimate);
    if (hasCustomer) {
      return { response: `✅ Estimate created for ${cust!.name}!\n\n📋 ${estimate.title}\n💰 $${estimate.total.toFixed(2)} - ${estimate.lineItems.length} items\n${estimate.lineItems.slice(0,4).map(i=>`• ${i.description} - $${i.total.toFixed(2)}`).join('\n')}`, didAction: true };
    } else {
      return { response: `✅ Estimate created WITHOUT customer (add later)!\n\n📋 ${estimate.title}\n💰 $${estimate.total.toFixed(2)}\n\nTo add customer: Estimates tab → Edit → Customer → Save\nOr: "Add customer John to estimate ${estimate.title.slice(0,20)}"`, didAction: true };
    }
  }

  // CREATE INVOICE - NOW ALLOWS NO CUSTOMER
  if (lower.includes('create invoice') || lower.includes('new invoice')) {
    let cust: Customer | null = null;
    let est: Estimate | null = null;
    
    for (const c of data.customers) {
      if (lower.includes(c.name.toLowerCase())) { cust = c; break; }
    }
    for (const e of data.estimates) {
      if (lower.includes(e.title.toLowerCase().slice(0,20)) || (e.customerName && lower.includes(e.customerName.toLowerCase()))) { est = e; break; }
    }
    if (!est && (lower.includes('last estimate') || lower.includes('from estimate'))) {
      est = data.estimates[data.estimates.length-1] || null;
      if (est && est.customerId) cust = data.customers.find(c=>c.id===est.customerId) || cust;
    }
    if (!cust && est && est.customerId) cust = data.customers.find(c=>c.id===est.customerId) || null;

    const hasCustomer = !!cust;
    const hasEstimate = !!est;

    let title = '';
    let lineItems: any[] = [];
    let subtotal = 0;
    let total = 0;

    if (est) {
      title = est.title;
      lineItems = est.lineItems;
      subtotal = est.subtotal;
      total = est.total;
    } else {
      const aiResult = await generateAIEstimate(text, {});
      title = aiResult.title;
      lineItems = aiResult.lineItems;
      subtotal = lineItems.reduce((s,i)=>s+i.total,0);
      total = subtotal;
    }

    const invoice: Invoice = {
      id: uuidv4(),
      customerId: cust?.id || '',
      customerName: cust?.name || '',
      estimateId: est?.id,
      title,
      lineItems,
      subtotal,
      taxRate: 0,
      tax: 0,
      total,
      amountPaid: 0,
      balanceDue: total,
      status: 'draft',
      dueDate: new Date(Date.now()+30*24*3600*1000).toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };

    await data.saveInvoice(invoice);
    if (hasCustomer) {
      return { response: `✅ Invoice created for ${cust!.name}!${hasEstimate ? ` from estimate "${est!.title}"` : ''}\n\n💰 ${invoice.title}\nTotal: $${invoice.total.toFixed(2)}\nBal Due: $${invoice.balanceDue.toFixed(2)}`, didAction: true };
    } else {
      return { response: `✅ Invoice created WITHOUT customer (add later)!${hasEstimate ? ` from estimate "${est!.title}"` : ''}\n\n💰 ${invoice.title}\nTotal: $${invoice.total.toFixed(2)}\n\nTo add customer: Invoices tab → Edit → Customer → Save\nOr: "Add customer John to invoice ${invoice.title.slice(0,20)}"`, didAction: true };
    }
  }

  // MARK INVOICE PAID
  if (lower.includes('invoice') && lower.includes('paid')) {
    if (lower.includes('mark') && lower.includes('paid')) {
      let inv: Invoice | null = null;
      for (const i of data.invoices) {
        if (lower.includes(i.title.toLowerCase().slice(0,25)) || (i.customerName && lower.includes(i.customerName.toLowerCase()))) { inv = i; break; }
      }
      if (!inv) inv = data.invoices.filter(i=>i.status!=='paid')[0] || null;
      if (!inv) return { response: `❌ No unpaid invoice found.`, didAction: false };
      const updated: Invoice = { ...inv, amountPaid: inv.total, balanceDue: 0, status: 'paid' };
      await data.saveInvoice(updated);
      return { response: `✅ Invoice marked PAID:\n${updated.title} - ${updated.customerName || 'No customer'}\n$${updated.total.toFixed(2)}`, didAction: true };
    }
  }

  // CREATE CONTRACT
  if (lower.includes('create contract') || lower.includes('new contract')) {
    let cust: Customer | null = null;
    for (const c of data.customers) {
      if (lower.includes(c.name.toLowerCase())) { cust = c; break; }
    }
    // Allow contract without customer too
    const hasCustomer = !!cust;
    const est = hasCustomer ? (data.estimates.find(e=>e.customerId===cust!.id) || data.estimates[data.estimates.length-1]) : data.estimates[data.estimates.length-1];
    const job = hasCustomer ? data.jobs.find(j=>j.customerId===cust!.id) : null;
    const titleMatch = text.match(/contract\s+for\s+[A-Za-z\s]+(?:-\s+)?(.+)/i);
    const title = titleMatch ? titleMatch[1].trim().slice(0,80) : hasCustomer ? `Paving Agreement - ${cust!.name} - Columbus OH` : `Paving Agreement - ${new Date().toLocaleDateString()}`;
    
    const contractContent = await generateAIContract(title, cust?.name || 'Customer', est?.total || 0, job?.squareFootage);
    
    const contract: Contract = {
      id: uuidv4(),
      customerId: cust?.id || '',
      customerName: cust?.name || '',
      estimateId: est?.id,
      jobId: job?.id,
      title,
      content: contractContent,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    await data.saveContract(contract);
    if (hasCustomer) {
      return { response: `✅ Contract created for ${cust!.name}!\n\n📄 ${contract.title}`, didAction: true };
    } else {
      return { response: `✅ Contract created WITHOUT customer (add later)!\n\n📄 ${contract.title}\n\nTo add customer: Contracts tab → Edit → Customer`, didAction: true };
    }
  }

  return { response: '', didAction: false };
}
