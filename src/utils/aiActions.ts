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
  // Match (380) 201-5143, 380-201-5143, 380 201 5143, 10-11 digits
  const m = text.match(/(?:\(?\d{3}\)?[\s\-\.]?\d{3}[\s\-\.]?\d{4})|(\d{3}[\s\-\.]\d{3}[\s\-\.]\d{4})/);
  if (m) return m[0].trim();
  // Also try label phone X
  const m2 = text.match(/(?:phone|ph|tel|call)[\s:]*([\(\)\d\-\s]{10,20})/i);
  return m2 ? m2[1].trim() : '';
}

function extractSqFt(text: string): number | null {
  const m = text.match(/(\d{2,5})\s*(?:sq\s*ft|sft|sf|square\s*ft|sqft|square\s*feet)/i);
  if (m) return parseInt(m[1].replace(/,/g,''),10);
  // Also standalone like "1500 sq"
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
  // Exact name match first
  let found = customers.find(c => c.name.toLowerCase() === q);
  if (found) return found;
  // Includes
  found = customers.find(c => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()));
  if (found) return found;
  // First name partial
  const parts = q.split(' ');
  for (const part of parts) {
    if (part.length < 3) continue;
    found = customers.find(c => c.name.toLowerCase().includes(part));
    if (found) return found;
  }
  return null;
}

function parseCustomerNameFromAdd(text: string): string {
  // Patterns: add customer John Doe, create customer John Doe, new customer John Doe
  const m = text.match(/(?:add|create|new)\s+customer\s+([a-z\s\.\-']+?)(?:\s+phone|\s+email|\s+address|\s+city|\s+zip|\s+with|\s*$)/i);
  if (m) return m[1].trim().replace(/[,]+$/,'');
  // Fallback: after "customer" take first 2-3 words as name
  const m2 = text.match(/customer\s+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (m2) return m2[1].trim();
  return '';
}

function extractAddressBlock(text: string): { address: string; city: string; state: string; zip: string } {
  // Look for "address" keyword
  let address = '';
  let city = 'Columbus';
  let state = 'OH';
  let zip = '';
  
  const addrMatch = text.match(/address\s+([^,]+(?:,\s*[^,]+)*?)(?:\s+city|\s+zip|\s+phone|\s+email|$)/i);
  if (addrMatch) {
    address = addrMatch[1].trim();
    // Try to split if contains city
    const parts = address.split(',');
    if (parts.length >= 2) {
      address = parts[0].trim();
      city = parts[1].trim() || city;
    }
  }
  zip = extractZIP(text);
  // City extraction
  const cityMatch = text.match(/city\s+([A-Za-z\s]+?)(?:\s+state|\s+zip|\s+phone|\s+email|$)/i);
  if (cityMatch) city = cityMatch[1].trim();
  const stateMatch = text.match(/state\s+([A-Za-z]{2})/i);
  if (stateMatch) state = stateMatch[1].toUpperCase();
  
  // If address contains typical street, use it
  if (!address) {
    const streetMatch = text.match(/(\d+\s+[A-Za-z\s]+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Ln|Lane|Ct|Circle|Way)\.?)/i);
    if (streetMatch) address = streetMatch[1].trim();
  }
  
  return { address, city, state, zip };
}

export async function handleAIAction(input: string, data: AppData): Promise<{ response: string; didAction: boolean }> {
  const text = input.trim();
  const lower = text.toLowerCase();

  // HELP - list capabilities
  if (lower.includes('what can you do') || lower === 'help' || lower.includes('show commands')) {
    return {
      didAction: false,
      response: `🔧 Black Gold AI - I can actually DO things, not just talk!

**CUSTOMERS:**
• "Add customer John Smith phone 380-201-1234 email john@email.com address 123 Main St Columbus OH 43215"
• "Find customer John" / "List customers" / "Delete customer John"
• "Update customer John phone to 380-201-9999"

**JOBS:**
• "Add job for John Smith - driveway sealcoating 1500 sq ft 2 inch - 123 Main St"
• "Create job for Acme Properties parking lot paving 5000 sq ft"
• "List jobs" / "Show scheduled jobs" / "Mark job [title] completed"

**ESTIMATES:**
• "Create estimate for John Smith - 1500 sq ft driveway sealcoating with crack fill"
• "Create estimate for [customer] parking lot 5000 sq ft overlay"
• "List estimates"

**INVOICES:**
• "Create invoice for John from his last estimate"
• "Mark invoice [title] as paid" / "List unpaid invoices"

**CONTRACTS:**
• "Create contract for John Smith for driveway job"
• "List contracts"

Try now: "Add customer Test User phone 614-555-0199" or "Create job for [existing customer name] sealcoating 1200 sq ft"`
    };
  }

  // LIST COMMANDS
  if (lower.startsWith('list ') || lower.startsWith('show ') || lower.includes('how many')) {
    if (lower.includes('customer')) {
      if (data.customers.length === 0) return { response: 'No customers yet. Say "Add customer [name]..." to create one.', didAction: false };
      const list = data.customers.slice(-10).map(c => `• ${c.name} - ${c.phone || 'no phone'} - ${c.city || 'Columbus'} - ${c.email || ''}`).join('\n');
      return { response: `📋 Last ${Math.min(10, data.customers.length)} of ${data.customers.length} customers:\n${list}`, didAction: false };
    }
    if (lower.includes('job')) {
      const filtered = lower.includes('scheduled') ? data.jobs.filter(j=>j.status==='scheduled') : lower.includes('active') || lower.includes('in progress') ? data.jobs.filter(j=>j.status==='in-progress') : data.jobs;
      if (filtered.length===0) return { response: 'No jobs found. Say "Add job for [customer]..."', didAction: false };
      const list = filtered.slice(-8).map(j=>`• ${j.title} - ${j.customerName} - ${j.status} - ${j.squareFootage||'?'} sq ft`).join('\n');
      return { response: `🔨 Jobs (${filtered.length}):\n${list}`, didAction: false };
    }
    if (lower.includes('estimate')) {
      if (data.estimates.length===0) return { response: 'No estimates yet.', didAction: false };
      const list = data.estimates.slice(-6).map(e=>`• ${e.title} - ${e.customerName} - $${e.total.toFixed(2)} - ${e.status}`).join('\n');
      return { response: `📋 Estimates:\n${list}`, didAction: false };
    }
    if (lower.includes('invoice')) {
      const unpaid = data.invoices.filter(i=>i.status!=='paid');
      const target = lower.includes('unpaid') || lower.includes('outstanding') ? unpaid : data.invoices;
      if (target.length===0) return { response: lower.includes('unpaid') ? 'No unpaid invoices! Great!' : 'No invoices yet.', didAction: false };
      const list = target.slice(-6).map(i=>`• ${i.title} - ${i.customerName} - $${i.total.toFixed(2)} bal $${i.balanceDue.toFixed(2)} - ${i.status}`).join('\n');
      const total = target.reduce((s,i)=>s+i.balanceDue,0);
      return { response: `💰 Invoices (${target.length}) total bal $${total.toFixed(2)}:\n${list}`, didAction: false };
    }
    if (lower.includes('contract')) {
      if (data.contracts.length===0) return { response: 'No contracts yet.', didAction: false };
      const list = data.contracts.slice(-6).map(c=>`• ${c.title} - ${c.customerName} - ${c.status}`).join('\n');
      return { response: `📄 Contracts:\n${list}`, didAction: false };
    }
  }

  // ADD CUSTOMER
  if ((lower.startsWith('add customer') || lower.startsWith('create customer') || lower.startsWith('new customer')) || (lower.includes('add a customer') && lower.split('customer').length>1)) {
    let name = parseCustomerNameFromAdd(text);
    // Fallback: try to get 2 words after customer
    if (!name || name.length < 2) {
      const fallback = text.match(/customer\s+([A-Za-z\s]+)/i);
      if (fallback) name = fallback[1].split(/phone|email|address/i)[0].trim();
    }
    if (!name || name.length < 3) {
      return { response: `❓ I need a name. Try: "Add customer John Smith phone 380-201-5143 address 123 Main St Columbus OH 43215"`, didAction: false };
    }
    // Check duplicate
    const existing = findCustomer(name, data.customers);
    if (existing && lower.includes('force') === false && text.toLowerCase().includes('add customer '+existing.name.toLowerCase())) {
      // Allow duplicate but warn
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
    return { response: `✅ Customer created!\n\n👤 ${customer.name}\n📞 ${customer.phone || 'No phone'} \n✉️ ${customer.email || 'No email'}\n📍 ${customer.address} ${customer.city}, ${customer.state} ${customer.zip}\n\nID: ${customer.id.slice(0,8)}\nYou can now say "Add job for ${customer.name}..."`, didAction: true };
  }

  // UPDATE CUSTOMER
  if (lower.includes('update customer') || (lower.includes('edit customer') && lower.includes('phone') || lower.includes('email'))) {
    // "Update customer John phone to 380..."
    const nameMatch = text.match(/(?:update|edit)\s+customer\s+([A-Za-z\s]+?)\s+(?:phone|email|address)/i);
    if (nameMatch) {
      const cust = findCustomer(nameMatch[1], data.customers);
      if (!cust) return { response: `❌ Customer "${nameMatch[1]}" not found.`, didAction: false };
      let updated = { ...cust };
      if (lower.includes('phone')) {
        const newPhone = extractPhone(text.split('to').pop() || text);
        if (newPhone) updated.phone = newPhone;
      }
      if (lower.includes('email')) {
        const newEmail = extractEmail(text);
        if (newEmail) updated.email = newEmail;
      }
      await data.saveCustomer(updated);
      return { response: `✅ Updated ${updated.name}: Phone=${updated.phone} Email=${updated.email}`, didAction: true };
    }
  }

  // DELETE CUSTOMER
  if ((lower.includes('delete customer') || lower.includes('remove customer')) && !lower.includes('add')) {
    const namePart = text.replace(/.*(?:delete|remove)\s+customer\s+/i,'').trim();
    const cust = findCustomer(namePart, data.customers);
    if (!cust) return { response: `❌ Customer "${namePart}" not found.`, didAction: false };
    await data.deleteCustomer(cust.id);
    return { response: `🗑️ Deleted customer ${cust.name}`, didAction: true };
  }

  // ADD JOB
  if (lower.includes('add job') || lower.includes('create job') || lower.startsWith('new job')) {
    // Try to extract customer name after "for"
    const forMatch = text.match(/for\s+([A-Za-z\s]+?)(?:\s+-\s+|\s+–\s+|\s+driveway|\s+parking|\s+seal|\s+\d+\s*sq|\s*$)/i);
    let customer: Customer | null = null;
    let customerNameFromText = '';
    if (forMatch) {
      customerNameFromText = forMatch[1].trim();
      customer = findCustomer(customerNameFromText, data.customers);
    }
    // If no customer found but we have customers, try to find any name in text
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
      return { response: `❌ Customer "${customerNameFromText || '???'}" not found. Available: ${data.customers.map(c=>c.name).join(', ') || 'none'}. Try "Add job for ${data.customers[0]?.name || '[Customer Name]'}..."`, didAction: false };
    }
    const sqft = extractSqFt(text) || 1200;
    const depth = extractDepth(text) || (lower.includes('seal') ? 0 : 3);
    // Title extraction: after customer name or after "job for X -"
    let title = '';
    const titleMatch = text.match(/(?:for\s+[^-\n]+-\s*)(.+?)(?:\s*\d+\s*sq|\s*$)/i);
    if (titleMatch) title = titleMatch[1].trim();
    else {
      // Remove "add job for X" part and use rest as title
      title = text.replace(/.*for\s+[A-Za-z\s]+/i,'').replace(/\d+\s*sq.*/i,'').trim();
      if (!title || title.length < 3) title = `Sealcoating & Paving - ${sqft} sq ft`;
    }
    // Cap title length
    if (title.length > 60) title = title.slice(0,60);
    
    const job: Job = {
      id: uuidv4(),
      customerId: customer.id,
      customerName: customer.name,
      title: title.split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ').slice(0,80),
      description: `Created via AI: "${text}". Columbus OH area.`,
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
    return { response: `✅ Job created for ${customer.name}!\n\n🔨 ${job.title}\n📐 ${job.squareFootage} sq ft ${job.depth ? `• ${job.depth}" depth` : ''} ${job.asphaltTonnage ? `• ~${job.asphaltTonnage} tons` : ''}\n📍 ${job.address} ${job.city}\nStatus: ${job.status}\n\nSay "Create estimate for ${customer.name} ${job.title}" to generate pricing.`, didAction: true };
  }

  // UPDATE JOB STATUS
  if (lower.includes('mark job') || (lower.includes('job') && lower.includes('status to')) || (lower.includes('update job') && lower.includes('scheduled'))) {
    // "mark job driveway completed" or "update job X status to scheduled"
    const jobTitlePart = text.match(/job\s+([A-Za-z0-9\s\-]+?)\s+(?:to\s+)?(potential|scheduled|in-progress|in progress|completed|cancelled)/i) || text.match(/mark\s+job\s+([A-Za-z0-9\s\-]+?)\s+(completed|scheduled|in-progress|cancelled)/i);
    let status: Job['status'] | null = null;
    if (lower.includes('completed')) status = 'completed';
    else if (lower.includes('scheduled')) status = 'scheduled';
    else if (lower.includes('in-progress') || lower.includes('in progress') || lower.includes('active')) status = 'in-progress';
    else if (lower.includes('cancelled') || lower.includes('canceled')) status = 'cancelled';
    else if (lower.includes('potential')) status = 'potential';

    if (status) {
      // Find job by title snippet after "job"
      const afterJob = text.split(/job/i)[1] || '';
      const snippet = jobTitlePart ? jobTitlePart[1] : afterJob.split(status)[0];
      const job = data.jobs.find(j=>j.title.toLowerCase().includes(snippet.trim().toLowerCase().slice(0,20))) || data.jobs[data.jobs.length-1];
      if (job) {
        const updated = { ...job, status, completedDate: status==='completed' ? new Date().toISOString().split('T')[0] : job.completedDate };
        await data.saveJob(updated);
        return { response: `✅ Job "${updated.title}" marked as ${status}`, didAction: true };
      }
    }
  }

  // CREATE ESTIMATE
  if (lower.includes('create estimate') || lower.includes('new estimate') || (lower.includes('estimate for') && !lower.includes('list'))) {
    // Extract customer name
    let cust: Customer | null = null;
    const forMatch = text.match(/estimate\s+for\s+([A-Za-z\s]+?)(?:\s+-\s+|\s+\d+|\s*$)/i) || text.match(/for\s+([A-Za-z\s]+?)\s+(?:\d+|driveway|parking|seal)/i);
    if (forMatch) {
      cust = findCustomer(forMatch[1], data.customers);
    }
    if (!cust) {
      // Try find any customer name in text
      for (const c of data.customers) {
        if (lower.includes(c.name.toLowerCase())) { cust = c; break; }
      }
    }
    if (!cust) {
      return { response: `❌ Customer not found for estimate. Try "Create estimate for ${data.customers[0]?.name || 'John Doe'} - 1500 sq ft sealcoating"`, didAction: false };
    }
    // Prompt for AI estimator is the whole text minus "create estimate for X"
    let prompt = text.replace(/create estimate for\s+[A-Za-z\s]+/i,'').trim();
    if (!prompt) prompt = text;
    if (prompt.length < 5) prompt = `${cust.name} - 1500 sq ft driveway sealcoating Columbus OH`;
    
    const aiResult = await generateAIEstimate(prompt, { squareFootage: extractSqFt(text) || undefined, depth: extractDepth(text) || undefined, title: prompt });
    
    const estimate: Estimate = {
      id: uuidv4(),
      customerId: cust.id,
      customerName: cust.name,
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
    estimate.tax = 0;
    estimate.total = estimate.subtotal;
    await data.saveEstimate(estimate);
    return { response: `✅ Estimate created for ${cust.name}!\n\n📋 ${estimate.title}\n💰 $${estimate.total.toFixed(2)} - ${estimate.lineItems.length} items\n${estimate.lineItems.slice(0,4).map(i=>`• ${i.description} - $${i.total.toFixed(2)}`).join('\n')}${estimate.lineItems.length>4?`\n... +${estimate.lineItems.length-4} more` : ''}\n\nYou can view it in Estimates tab or say "Create invoice from this estimate"`, didAction: true };
  }

  // CREATE INVOICE
  if (lower.includes('create invoice') || lower.includes('new invoice')) {
    // Try to find customer and optionally estimate
    let cust: Customer | null = null;
    let est: Estimate | null = null;
    
    for (const c of data.customers) {
      if (lower.includes(c.name.toLowerCase())) { cust = c; break; }
    }
    for (const e of data.estimates) {
      if (lower.includes(e.title.toLowerCase().slice(0,20)) || lower.includes(e.customerName.toLowerCase())) { est = e; break; }
    }
    // If phrase "from estimate" or "from last estimate"
    if (!est && (lower.includes('last estimate') || lower.includes('from estimate'))) {
      est = data.estimates[data.estimates.length-1] || null;
      if (est) cust = data.customers.find(c=>c.id===est.customerId) || cust;
    }
    if (!cust && est) cust = data.customers.find(c=>c.id===est.customerId) || null;
    if (!cust) {
      return { response: `❌ Need customer for invoice. Try "Create invoice for ${data.customers[0]?.name || 'John Doe'}" or "Create invoice from last estimate"`, didAction: false };
    }
    const invoice: Invoice = est ? {
      id: uuidv4(),
      customerId: cust.id,
      customerName: cust.name,
      estimateId: est.id,
      title: est.title,
      lineItems: est.lineItems,
      subtotal: est.subtotal,
      taxRate: est.taxRate,
      tax: est.tax,
      total: est.total,
      amountPaid: 0,
      balanceDue: est.total,
      status: 'draft',
      dueDate: new Date(Date.now()+30*24*3600*1000).toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    } : {
      id: uuidv4(),
      customerId: cust.id,
      customerName: cust.name,
      title: `Invoice - ${cust.name} - Columbus OH`,
      lineItems: [],
      subtotal: 0,
      taxRate: 0,
      tax: 0,
      total: 0,
      amountPaid: 0,
      balanceDue: 0,
      status: 'draft',
      dueDate: new Date(Date.now()+30*24*3600*1000).toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };
    if (!est) {
      // Try generate minimal invoice from prompt
      const aiResult = await generateAIEstimate(text, {});
      invoice.lineItems = aiResult.lineItems;
      invoice.subtotal = aiResult.lineItems.reduce((s,i)=>s+i.total,0);
      invoice.total = invoice.subtotal;
      invoice.balanceDue = invoice.total;
      invoice.title = aiResult.title;
    }
    await data.saveInvoice(invoice);
    return { response: `✅ Invoice created for ${cust.name}!\n\n💰 ${invoice.title}\nTotal: $${invoice.total.toFixed(2)}\nBal Due: $${invoice.balanceDue.toFixed(2)}\nStatus: ${invoice.status}\nDue: ${invoice.dueDate}`, didAction: true };
  }

  // MARK INVOICE PAID
  if ((lower.includes('invoice') && (lower.includes('paid') || lower.includes('mark')) ) ) {
    if (lower.includes('mark') && (lower.includes('paid') || lower.includes('as paid'))) {
      // Find invoice by title/customer
      let inv: Invoice | null = null;
      for (const i of data.invoices) {
        if (lower.includes(i.title.toLowerCase().slice(0,25)) || lower.includes(i.customerName.toLowerCase())) { inv = i; break; }
      }
      if (!inv) inv = data.invoices.filter(i=>i.status!=='paid')[0] || null;
      if (!inv) return { response: `❌ No unpaid invoice found.`, didAction: false };
      const updated: Invoice = { ...inv, amountPaid: inv.total, balanceDue: 0, status: 'paid' };
      await data.saveInvoice(updated);
      return { response: `✅ Invoice marked PAID:\n${updated.title} - ${updated.customerName}\n$${updated.total.toFixed(2)}`, didAction: true };
    }
  }

  // CREATE CONTRACT
  if (lower.includes('create contract') || lower.includes('new contract')) {
    let cust: Customer | null = null;
    for (const c of data.customers) {
      if (lower.includes(c.name.toLowerCase())) { cust = c; break; }
    }
    if (!cust) return { response: `❌ Need customer for contract. Try "Create contract for ${data.customers[0]?.name || 'John Doe'} - driveway paving"`, didAction: false };
    
    const est = data.estimates.find(e=>e.customerId===cust.id) || data.estimates[data.estimates.length-1];
    const job = data.jobs.find(j=>j.customerId===cust.id);
    const titleMatch = text.match(/contract\s+for\s+[A-Za-z\s]+(?:-\s+)?(.+)/i);
    const title = titleMatch ? titleMatch[1].trim().slice(0,80) : `Paving Agreement - ${cust.name} - Columbus OH`;
    
    const contractContent = await generateAIContract(title, cust.name, est?.total || 0, job?.squareFootage);
    const branded = contractContent.replace(/Akron Asphalt Paving Co\./g, 'Black Gold Asphalt & Sealcoating').replace(/123 Industrial Pkwy, Akron OH 44301/g, 'Columbus, Ohio and surrounding areas').replace(/\(330\) 555-0142/g, '(380) 201-5143').replace(/OH Lic #12345/g, 'OH Lic #BG-2024').replace(/info@akronasphalt\.com/g,'justusasphalt@gmail.com');
    
    const contract: Contract = {
      id: uuidv4(),
      customerId: cust.id,
      customerName: cust.name,
      estimateId: est?.id,
      jobId: job?.id,
      title,
      content: branded,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    await data.saveContract(contract);
    return { response: `✅ Contract created for ${cust.name}!\n\n📄 ${contract.title}\nStatus: ${contract.status}\n${contract.content.slice(0,300)}...\n\nOpen Contracts tab to sign it.`, didAction: true };
  }

  // No action matched
  return { response: '', didAction: false };
}
