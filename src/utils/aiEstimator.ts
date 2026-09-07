import { v4 as uuidv4 } from 'uuid';
import type { LineItem } from '../types';
import { calculateAsphaltTonnage } from './geocode';

export interface AIEstimateResult {
  title: string;
  description: string;
  lineItems: LineItem[];
  notes: string;
  confidence?: number;
  jobType?: string;
}

type JobContext = {
  squareFootage?: number;
  depth?: number;
  description?: string;
  title?: string;
  address?: string;
  jobType?: string;
};

const PRICING = {
  drivewayRemoveReplace: { min: 4.5, mid: 5.25, max: 6.5 },
  drivewayNew: { min: 4.0, mid: 4.75, max: 6.0 },
  drivewayOverlay: { min: 2.5, mid: 3.0, max: 4.0 },
  sealcoatResidential: { min: 0.28, mid: 0.35, max: 0.48 },
  sealcoatCommercial: { min: 0.22, mid: 0.32, max: 0.42 },
  parkingLotNew3in: { min: 3.2, mid: 3.85, max: 5.0 },
  parkingLotOverlay15in: { min: 2.25, mid: 2.85, max: 3.75 },
  parkingLotMillAndOverlay: { min: 3.0, mid: 3.9, max: 5.2 },
  potholeRepair: { base: 350, perTon: 135 },
  crackFillPerLinearFt: { min: 1.5, mid: 2.25, max: 3.5 },
  crackFillPerLb: 3.75,
  excavationPerSqFt: { min: 0.75, mid: 1.05, max: 1.5 },
  base304PerSqFt6in: { min: 1.1, mid: 1.35, max: 1.75 },
  basePerTon: 52,
  basePerCuYd: 78,
  tackPerGal: 9.5,
  tackPerSqFt: 0.12,
  compactionPerSqFt: 0.18,
  stallPerStall: { min: 32, mid: 38, max: 55 },
  adaPerEach: { min: 165, mid: 195, max: 275 },
  arrowPerEach: 45,
  mobilizationResidential: 495,
  mobilizationCommercial: 850,
  mobilizationSmallJob: 650,
  sawCutPerLinearFt: 4.5,
  disposalPerTon: 55,
  disposalMin: 180,
};

function buildLineItem(desc: string, qty: number, unit: string, unitPrice: number, opts?: { isOptional?: boolean }): LineItem {
  return {
    id: uuidv4(),
    description: desc + (opts?.isOptional ? ' (OPTIONAL / ADD-ON)' : ''),
    quantity: qty,
    unit,
    unitPrice,
    total: Math.round(qty * unitPrice * 100) / 100,
  };
}

type JobType = 
  | 'residential_remove_replace'
  | 'residential_new'
  | 'residential_overlay'
  | 'residential_sealcoat'
  | 'residential_sealcoat_crack'
  | 'commercial_new'
  | 'commercial_overlay'
  | 'commercial_mill_overlay'
  | 'commercial_sealcoat'
  | 'commercial_sealcoat_crack_stripe'
  | 'pothole_patch'
  | 'crack_fill_only'
  | 'striping_only'
  | 'apron_approach'
  | 'walkway_path';

// IMPROVED KEYWORD-FOCUSED DETECTION - focuses on job description keywords
function detectJobType(text: string): { type: JobType; confidence: number; keywords: string[]; matched: string[] } {
  const p = text.toLowerCase();
  const scores: Record<JobType, number> = {
    residential_remove_replace: 0,
    residential_new: 0,
    residential_overlay: 0,
    residential_sealcoat: 0,
    residential_sealcoat_crack: 0,
    commercial_new: 0,
    commercial_overlay: 0,
    commercial_mill_overlay: 0,
    commercial_sealcoat: 0,
    commercial_sealcoat_crack_stripe: 0,
    pothole_patch: 0,
    crack_fill_only: 0,
    striping_only: 0,
    apron_approach: 0,
    walkway_path: 0,
  };
  const matched: string[] = [];
  const keywords: string[] = [];

  const addScore = (type: JobType, word: string, weight: number, kw?: string) => {
    // Use word boundary regex for accurate keyword matching
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(p) || p.includes(word.toLowerCase())) {
      scores[type] += weight;
      if (!matched.includes(word)) matched.push(word);
      if (kw && !keywords.includes(kw)) keywords.push(kw);
    }
  };

  const hasPhrase = (phrase: string, type: JobType, weight: number, kw?: string) => {
    if (p.includes(phrase.toLowerCase())) {
      scores[type] += weight;
      if (!matched.includes(phrase)) matched.push(phrase);
      if (kw && !keywords.includes(kw)) keywords.push(kw);
    }
  };

  // --- RESIDENTIAL ---
  // Remove & Replace - strongest signals: remove, tear out, demo, existing, replace
  hasPhrase('remove and replace', 'residential_remove_replace', 8, 'remove & replace');
  hasPhrase('remove & replace', 'residential_remove_replace', 8, 'remove & replace');
  hasPhrase('r&r', 'residential_remove_replace', 7, 'R&R');
  hasPhrase('tear out', 'residential_remove_replace', 6, 'tear out');
  hasPhrase('tear-out', 'residential_remove_replace', 6, 'tear out');
  hasPhrase('excavate existing', 'residential_remove_replace', 6, 'excavate existing');
  hasPhrase('demo existing', 'residential_remove_replace', 5, 'demo existing');
  hasPhrase('remove existing', 'residential_remove_replace', 5, 'remove existing');
  hasPhrase('replace driveway', 'residential_remove_replace', 6, 'replace driveway');
  hasPhrase('driveway replacement', 'residential_remove_replace', 6, 'driveway replacement');
  addScore('residential_remove_replace', 'remove', 3, 'remove');
  addScore('residential_remove_replace', 'replace', 3, 'replace');
  addScore('residential_remove_replace', 'demolition', 4, 'demolition');
  addScore('residential_remove_replace', 'excavation', 3, 'excavation');
  addScore('residential_remove_replace', 'haul off', 3, 'haul off');
  addScore('residential_remove_replace', 'disposal', 2, 'disposal');

  // New Construction - new driveway, from dirt/gravel, new construction
  hasPhrase('new driveway', 'residential_new', 8, 'new driveway');
  hasPhrase('new construction', 'residential_new', 7, 'new construction');
  hasPhrase('from dirt', 'residential_new', 6, 'from dirt');
  hasPhrase('from gravel', 'residential_new', 6, 'from gravel');
  hasPhrase('new asphalt', 'residential_new', 4, 'new asphalt');
  hasPhrase('install new', 'residential_new', 5, 'install new');
  addScore('residential_new', 'new', 2, 'new');

  // Overlay / Resurface - overlay, resurface, cap, 1.5 inch
  hasPhrase('overlay', 'residential_overlay', 7, 'overlay');
  hasPhrase('resurface', 'residential_overlay', 7, 'resurface');
  hasPhrase('cap existing', 'residential_overlay', 6, 'cap existing');
  hasPhrase('1.5 inch overlay', 'residential_overlay', 8, '1.5" overlay');
  hasPhrase('2 inch overlay', 'residential_overlay', 8, '2" overlay');
  hasPhrase('asphalt overlay', 'residential_overlay', 7, 'asphalt overlay');
  addScore('residential_overlay', 'overlay', 5, 'overlay');

  // Sealcoat Residential - sealcoat, seal coat, sealer, coal tar, seal
  hasPhrase('sealcoat', 'residential_sealcoat', 6, 'sealcoat');
  hasPhrase('seal coat', 'residential_sealcoat', 6, 'sealcoat');
  hasPhrase('seal coating', 'residential_sealcoat', 6, 'sealcoat');
  hasPhrase('coal tar', 'residential_sealcoat', 5, 'coal tar');
  hasPhrase('asphalt sealer', 'residential_sealcoat', 5, 'asphalt sealer');
  hasPhrase('driveway sealing', 'residential_sealcoat', 6, 'driveway sealing');
  addScore('residential_sealcoat', 'sealcoat', 5, 'sealcoat');
  addScore('residential_sealcoat', 'sealer', 4, 'sealer');
  addScore('residential_sealcoat', 'sealing', 3, 'sealing');

  // Sealcoat + Crack - both seal and crack
  if (p.includes('seal') && p.includes('crack')) {
    scores['residential_sealcoat_crack'] += 8;
    matched.push('seal + crack');
    keywords.push('seal + crack');
  }
  hasPhrase('seal and crack', 'residential_sealcoat_crack', 7, 'seal and crack');
  hasPhrase('crack and seal', 'residential_sealcoat_crack', 7, 'crack and seal');

  // Crack fill only - crack fill, crack sealing, routing, hot rubber
  hasPhrase('crack fill', 'crack_fill_only', 8, 'crack fill');
  hasPhrase('crackfill', 'crack_fill_only', 8, 'crack fill');
  hasPhrase('crack filling', 'crack_fill_only', 8, 'crack fill');
  hasPhrase('crack sealing', 'crack_fill_only', 7, 'crack sealing');
  hasPhrase('crack repair', 'crack_fill_only', 6, 'crack repair');
  hasPhrase('hot rubber', 'crack_fill_only', 6, 'hot rubber');
  hasPhrase('routing', 'crack_fill_only', 5, 'routing');
  hasPhrase('route and seal', 'crack_fill_only', 7, 'route and seal');

  // Commercial - parking lot, commercial, plaza, strip mall, business
  hasPhrase('parking lot', 'commercial_new', 6, 'parking lot');
  hasPhrase('parking area', 'commercial_new', 5, 'parking area');
  hasPhrase('commercial driveway', 'commercial_new', 6, 'commercial driveway');
  hasPhrase('business parking', 'commercial_new', 5, 'business parking');
  hasPhrase('plaza', 'commercial_new', 4, 'plaza');
  hasPhrase('strip mall', 'commercial_new', 5, 'strip mall');
  hasPhrase('apartment complex', 'commercial_new', 5, 'apartment complex');
  addScore('commercial_new', 'commercial', 3, 'commercial');
  addScore('commercial_new', 'parking', 2, 'parking');

  // Commercial overlay
  hasPhrase('parking lot overlay', 'commercial_overlay', 9, 'parking lot overlay');
  hasPhrase('lot overlay', 'commercial_overlay', 8, 'lot overlay');
  hasPhrase('overlay parking', 'commercial_overlay', 8, 'overlay parking');
  hasPhrase('resurface parking', 'commercial_overlay', 7, 'resurface parking');
  hasPhrase('commercial overlay', 'commercial_overlay', 8, 'commercial overlay');

  // Mill & Overlay - mill, milling, mill and overlay
  hasPhrase('mill and overlay', 'commercial_mill_overlay', 10, 'mill and overlay');
  hasPhrase('mill & overlay', 'commercial_mill_overlay', 10, 'mill and overlay');
  hasPhrase('milling and overlay', 'commercial_mill_overlay', 9, 'milling and overlay');
  hasPhrase('mill existing', 'commercial_mill_overlay', 8, 'mill existing');
  addScore('commercial_mill_overlay', 'milling', 7, 'milling');
  addScore('commercial_mill_overlay', 'mill', 5, 'mill');

  // Commercial sealcoat
  hasPhrase('commercial sealcoat', 'commercial_sealcoat', 9, 'commercial sealcoat');
  hasPhrase('sealcoat parking lot', 'commercial_sealcoat', 8, 'sealcoat parking lot');
  hasPhrase('parking lot sealing', 'commercial_sealcoat', 7, 'parking lot sealing');
  hasPhrase('lot sealcoating', 'commercial_sealcoat', 7, 'lot sealcoating');

  // Full maintenance - seal + crack + stripe
  if (p.includes('seal') && p.includes('crack') && (p.includes('stripe') || p.includes('striping') || p.includes('line'))) {
    scores['commercial_sealcoat_crack_stripe'] += 10;
    matched.push('seal + crack + stripe');
    keywords.push('full maintenance');
  }
  hasPhrase('full maintenance', 'commercial_sealcoat_crack_stripe', 8, 'full maintenance');
  hasPhrase('seal crack stripe', 'commercial_sealcoat_crack_stripe', 9, 'seal crack stripe');
  hasPhrase('parking lot maintenance', 'commercial_sealcoat_crack_stripe', 8, 'parking lot maintenance');

  // Pothole / Patch
  hasPhrase('pothole', 'pothole_patch', 8, 'pothole');
  hasPhrase('potholes', 'pothole_patch', 8, 'pothole');
  hasPhrase('patch repair', 'pothole_patch', 7, 'patch repair');
  hasPhrase('asphalt patch', 'pothole_patch', 7, 'asphalt patch');
  hasPhrase('hole repair', 'pothole_patch', 6, 'hole repair');
  hasPhrase('patching', 'pothole_patch', 5, 'patching');
  addScore('pothole_patch', 'pothole', 6, 'pothole');
  addScore('pothole_patch', 'patch', 4, 'patch');

  // Striping only
  hasPhrase('line striping', 'striping_only', 9, 'line striping');
  hasPhrase('striping only', 'striping_only', 9, 'striping only');
  hasPhrase('parking lot striping', 'striping_only', 8, 'parking lot striping');
  hasPhrase('restripe', 'striping_only', 7, 'restripe');
  hasPhrase('re-stripe', 'striping_only', 7, 'restripe');
  hasPhrase('paint lines', 'striping_only', 6, 'paint lines');
  hasPhrase('stall striping', 'striping_only', 7, 'stall striping');
  hasPhrase('ada striping', 'striping_only', 7, 'ADA striping');

  // Apron / Approach
  hasPhrase('apron', 'apron_approach', 8, 'apron');
  hasPhrase('approach', 'apron_approach', 7, 'approach');
  hasPhrase('driveway apron', 'apron_approach', 9, 'driveway apron');
  hasPhrase('entrance apron', 'apron_approach', 8, 'entrance apron');

  // Walkway / Path
  hasPhrase('walkway', 'walkway_path', 7, 'walkway');
  hasPhrase('sidewalk', 'walkway_path', 7, 'sidewalk');
  hasPhrase('pathway', 'walkway_path', 7, 'pathway');
  hasPhrase('asphalt path', 'walkway_path', 8, 'asphalt path');
  hasPhrase('bike path', 'walkway_path', 7, 'bike path');
  hasPhrase('trail', 'walkway_path', 5, 'trail');

  // Boost logic: driveway vs parking lot
  const hasDriveway = p.includes('driveway');
  const hasParking = p.includes('parking');
  const hasSeal = p.includes('seal');
  const hasRemove = p.includes('remove') || p.includes('tear out') || p.includes('replace') || p.includes('demo');

  // If driveway + seal, likely residential sealcoat, not commercial
  if (hasDriveway && hasSeal && !hasParking) {
    scores['residential_sealcoat'] += 4;
    scores['residential_sealcoat_crack'] += p.includes('crack') ? 5 : 0;
  }
  // If parking + seal, commercial sealcoat
  if (hasParking && hasSeal) {
    scores['commercial_sealcoat'] += 5;
    if (p.includes('crack') || p.includes('stripe')) scores['commercial_sealcoat_crack_stripe'] += 6;
  }
  // If remove + driveway, definitely R&R
  if (hasRemove && hasDriveway) {
    scores['residential_remove_replace'] += 6;
  }
  // If remove + parking, commercial new or overlay
  if (hasRemove && hasParking) {
    scores['commercial_new'] += 4;
  }

  // Find max
  let maxType: JobType = 'residential_remove_replace';
  let maxScore = 0;
  for (const [type, score] of Object.entries(scores) as [JobType, number][]) {
    if (score > maxScore) {
      maxScore = score;
      maxType = type;
    }
  }

  // Fallback if no strong signal - use context clues
  if (maxScore < 3) {
    if (p.includes('seal')) {
      maxType = hasParking ? 'commercial_sealcoat' : 'residential_sealcoat';
    } else if (p.includes('crack') && !p.includes('seal')) {
      maxType = 'crack_fill_only';
    } else if (p.includes('pothole') || p.includes('patch')) {
      maxType = 'pothole_patch';
    } else if (p.includes('stripe') || p.includes('striping') || p.includes('line')) {
      maxType = 'striping_only';
    } else if (p.includes('apron') || p.includes('approach')) {
      maxType = 'apron_approach';
    } else if (p.includes('walkway') || p.includes('sidewalk') || p.includes('path')) {
      maxType = 'walkway_path';
    } else if (p.includes('parking')) {
      maxType = 'commercial_new';
    } else if (p.includes('driveway')) {
      maxType = hasRemove ? 'residential_remove_replace' : p.includes('new') ? 'residential_new' : 'residential_remove_replace';
    }
  }

  const confidence = Math.min(98, 35 + maxScore * 8 + matched.length * 3);
  return { type: maxType, confidence, keywords, matched };
}

function extractSqFtSmart(text: string): number | null {
  const lower = text.toLowerCase();
  let match = lower.match(/(\d{2,5}(?:,\d{3})?)\s*(?:sq\s*ft|sft|sf|sqft|square\s*feet|square\s*ft)/i);
  if (match) return parseInt(match[1].replace(/,/g, ''), 10);
  match = lower.match(/(\d{2,3})\s*(?:'|ft|feet)?\s*x\s*(\d{2,3})\s*(?:'|ft|feet)?/i);
  if (match) {
    const w = parseInt(match[1], 10);
    const h = parseInt(match[2], 10);
    if (w >= 8 && w <= 300 && h >= 8 && h <= 300) return w * h;
  }
  match = lower.match(/(\d{2,3})\s*by\s*(\d{2,3})/i);
  if (match) {
    const w = parseInt(match[1], 10);
    const h = parseInt(match[2], 10);
    if (w >= 8 && h >= 8 && w <= 300 && h <= 300) return w * h;
  }
  if (lower.includes('1 car') || lower.includes('single car')) return 320;
  if (lower.includes('2 car') || lower.includes('double car')) return 600;
  if (lower.includes('3 car') || lower.includes('triple car')) return 900;
  if (lower.includes('4 car')) return 1200;
  if (lower.includes('turnaround') || lower.includes('turn around')) return 200;
  return null;
}

function extractDepthSmart(text: string): number | null {
  const lower = text.toLowerCase();
  const match = lower.match(/(\d+(?:\.\d+)?)\s*(?:"|''|inch|inches|in\b)/i);
  if (match) {
    const d = parseFloat(match[1]);
    if (d >= 0.5 && d <= 12) return d;
  }
  if (lower.includes('1.5"') || lower.includes('1.5 inch')) return 1.5;
  if (lower.includes('2"') && !lower.includes('2.5') && !lower.includes('3"')) return 2;
  if (lower.includes('2.5"') || lower.includes('2.5 inch')) return 2.5;
  if (lower.includes('3"') || lower.includes('3 inch')) return 3;
  if (lower.includes('4"')) return 4;
  return null;
}

function extractLinearFt(text: string): number | null {
  const match = text.match(/(\d{2,5})\s*(?:linear\s*ft|lin\s*ft|lf|lineal)/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

function extractStalls(text: string): number | null {
  const match = text.match(/(\d{1,3})\s*(?:stall|space|spot|car)/i);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n >= 1 && n <= 500) return n;
  }
  return null;
}

export async function generateAILineItems(prompt: string, ctx?: JobContext): Promise<LineItem[]> {
  await new Promise(r => setTimeout(r, 600));

  const fullText = `${prompt} ${ctx?.description || ''} ${ctx?.title || ''} ${ctx?.jobType || ''}`.toLowerCase();
  let detected = detectJobType(fullText);
  
  if (ctx?.jobType && ctx.jobType !== 'auto' && ctx.jobType !== '') {
    const explicit = ctx.jobType as any;
    const mapping: Record<string, any> = {
      'residential_remove_replace': 'residential_remove_replace',
      'residential_new': 'residential_new',
      'residential_overlay': 'residential_overlay',
      'residential_sealcoat': 'residential_sealcoat',
      'residential_sealcoat_crack': 'residential_sealcoat_crack',
      'commercial_new': 'commercial_new',
      'commercial_overlay': 'commercial_overlay',
      'commercial_mill_overlay': 'commercial_mill_overlay',
      'commercial_sealcoat': 'commercial_sealcoat',
      'commercial_sealcoat_crack_stripe': 'commercial_sealcoat_crack_stripe',
      'pothole_patch': 'pothole_patch',
      'crack_fill_only': 'crack_fill_only',
      'striping_only': 'striping_only',
      'apron_approach': 'apron_approach',
      'walkway_path': 'walkway_path',
    };
    const mapped = mapping[explicit] || explicit;
    if (mapped) {
      detected = { type: mapped, confidence: 95, keywords: [explicit, 'explicit dropdown'], matched: [explicit] };
    }
  }
  
  const sqftFromText = extractSqFtSmart(fullText);
  const depthFromText = extractDepthSmart(fullText);
  const linearFt = extractLinearFt(fullText);
  const stallsFromText = extractStalls(fullText);

  const sqft = Math.round(ctx?.squareFootage || sqftFromText || 1200);
  const depth = ctx?.depth || depthFromText || (detected.type.includes('overlay') ? 1.5 : detected.type.includes('seal') ? 0 : 2.5);
  const tonnage = depth > 0 ? calculateAsphaltTonnage(sqft, depth) : 0;

  const items: LineItem[] = [];
  const isSmallJob = sqft < 600;
  const isLargeJob = sqft > 5000;

  const add = (desc: string, qty: number, unit: string, unitPrice: number, optional = false) => {
    items.push(buildLineItem(desc, qty, unit, unitPrice, { isOptional: optional }));
  };

  console.log(`🤖 AI Estimator - Prompt: "${prompt.slice(0,80)}..." | Detected: ${detected.type} (${detected.confidence}%) | Keywords: ${detected.matched.join(', ')} | SqFt: ${sqft} | Depth: ${depth}"`);

  switch (detected.type) {
    case 'residential_remove_replace': {
      const mobilization = isSmallJob ? PRICING.mobilizationSmallJob : PRICING.mobilizationResidential;
      add('Mobilization, equipment transport, traffic control', 1, 'ls', mobilization);
      add('Saw cutting at existing asphalt/concrete edges - clean termination', Math.ceil(sqft / 100) * 2, 'lin ft', PRICING.sawCutPerLinearFt);
      add(`Removal of existing asphalt (${Math.ceil(sqft / 9)} sq yd) + haul-off & disposal - includes up to 6" depth`, Math.ceil(tonnage * 0.7), 'ton', PRICING.disposalPerTon);
      add('Subgrade excavation & fine grading to achieve 2% slope (1/4" per ft) for drainage - laser graded', sqft, 'sq ft', PRICING.excavationPerSqFt.mid);
      add('Aggregate base - ODOT 304 limestone, 6" compacted to 95% Modified Proctor - includes trucking', Math.ceil(sqft * 0.5 / 27 * 1.15), 'cu yd', PRICING.basePerCuYd + 5);
      add('Tack coat - SS-1H asphalt emulsion for bonding (if overlaying existing base)', Math.ceil(sqft * 0.04), 'gal', PRICING.tackPerGal);
      if (depth >= 2.5) {
        add(`Hot mix asphalt - ODOT 448 Type 2 Intermediate Binder, 1.5" compacted (${(tonnage * 0.6).toFixed(1)} tons)`, Math.ceil(tonnage * 0.6), 'ton', isLargeJob ? 98 : 115);
      }
      add(`Hot mix asphalt - ODOT 448 Type 1 Surface, ${depth}" compacted, PG 64-22 - ${tonnage} tons total with 10% waste - Includes paver, roller, labor`, tonnage, 'ton', isLargeJob ? 105 : 128);
      add('Compaction & finish rolling - minimum 2 passes with 1-ton roller', sqft, 'sq ft', PRICING.compactionPerSqFt);
      add('Hand work around garage, walkways, utilities - compaction with plate compactor', 1, 'ls', 145);
      add('Final cleanup, backfill edges with topsoil where disturbed', 1, 'ls', 85);
      
      if (fullText.includes('seal') || fullText.includes('coating')) {
        add(`Sealcoat - 2 coats coal tar sealer with sand additive (OPTIONAL - Apply 90-180 days after paving)`, sqft, 'sq ft', PRICING.sealcoatResidential.mid, true);
      }
      break;
    }

    case 'residential_new': {
      add('Mobilization & site prep', 1, 'ls', PRICING.mobilizationResidential);
      add('Rough & fine grading - establish 2% slope, compact subgrade', sqft, 'sq ft', 0.95);
      add('Aggregate base - ODOT 304, 6" compacted - includes material, trucking, spreading', Math.ceil(sqft * 0.5 / 27 * 1.15), 'cu yd', PRICING.basePerCuYd);
      add(`Hot mix asphalt - ${depth}" ODOT 448 Type 1 Surface - ${tonnage} tons - Paver laid`, tonnage, 'ton', 122);
      add('Compaction and finish rolling', sqft, 'sq ft', PRICING.compactionPerSqFt);
      break;
    }

    case 'residential_overlay': {
      add('Power broom & air blow cleaning - remove all loose debris, dirt', sqft, 'sq ft', 0.18);
      add('Crack filling - hot rubberized crack filler, rout & seal where needed', linearFt || Math.ceil(sqft / 10), 'lin ft', PRICING.crackFillPerLinearFt.mid);
      add('Tack coat - SS-1H - full coverage for bonding', Math.ceil(sqft * 0.035), 'gal', PRICING.tackPerGal);
      add(`Asphalt overlay - ${depth || 1.5}" ODOT 448 Type 1 Surface - ${calculateAsphaltTonnage(sqft, depth || 1.5)} tons - Includes leveling course`, sqft, 'sq ft', PRICING.parkingLotOverlay15in.mid);
      add('Edge feathering and tie-ins to existing concrete/garage', 1, 'ls', 95);
      break;
    }

    case 'residential_sealcoat':
    case 'residential_sealcoat_crack': {
      const needsCrack = fullText.includes('crack') || detected.type === 'residential_sealcoat_crack';
      add('Surface preparation - power broom, blow, remove loose material', sqft, 'sq ft', 0.12);
      if (needsCrack) {
        add('Crack routing & hot rubber crack fill - clean, rout to 3/4" x 3/4", fill with hot rubber', linearFt || Math.ceil(sqft / 8), 'lin ft', PRICING.crackFillPerLinearFt.mid);
        add('Oil spot treatment - primer for oil/gas spots to ensure sealer adhesion', Math.ceil(sqft / 400), 'spot', 18);
      }
      add('First coat - coal tar sealer with 2-3 lbs sand per gallon + 2% latex additive', sqft, 'sq ft', 0.18);
      add('Second coat - coal tar sealer, perpendicular to first coat for uniform coverage', sqft, 'sq ft', 0.17);
      add('Barricades & traffic control during curing (2-4 hrs)', 1, 'ls', 45);
      break;
    }

    case 'commercial_new': {
      add('Mobilization - heavy equipment, lowboy, traffic control plan', 1, 'ls', PRICING.mobilizationCommercial);
      add('Excavation & subgrade prep - cut to grade, compact to 95%, proof roll', sqft, 'sq ft', PRICING.excavationPerSqFt.mid + 0.15);
      add('Aggregate base - ODOT 304, 8" compacted for commercial loading (parking lot spec)', Math.ceil(sqft * 0.67 / 27 * 1.15), 'cu yd', PRICING.basePerCuYd - 2);
      add('Fine grading & string line for drainage - 2% min slope to catch basins', sqft, 'sq ft', 0.22);
      add(`Binder course - ODOT 448 Type 2 Intermediate, 2" - ${(tonnage * 0.65).toFixed(1)} tons`, Math.ceil(tonnage * 0.65), 'ton', 102);
      add(`Surface course - ODOT 448 Type 1 Surface, 1.5" - ${(tonnage * 0.35).toFixed(1)} tons - Paver laid, breakdown & finish rolling`, Math.ceil(tonnage * 0.35), 'ton', 118);
      add('Tack coat between lifts - SS-1H', Math.ceil(sqft * 0.06), 'gal', PRICING.tackPerGal);
      add('Compaction - 10-ton breakdown + 1-ton finish roller', sqft, 'sq ft', PRICING.compactionPerSqFt + 0.04);
      const stalls = stallsFromText || Math.max(6, Math.ceil(sqft / 300));
      add(`Line striping - 4" white traffic paint, layout + 1 coat - ${stalls} stalls @ 18' x 9'`, stalls, 'stall', PRICING.stallPerStall.mid);
      add('ADA compliance - van accessible + standard accessible + signage + crosshatch', 1, 'ls', 385);
      break;
    }

    case 'commercial_overlay':
    case 'commercial_mill_overlay': {
      const isMill = detected.type === 'commercial_mill_overlay';
      if (isMill) {
        add('Milling - 1.5" to 2" mill existing asphalt, haul off millings', sqft, 'sq ft', 1.15);
        add('Sweep & clean milled surface, air blow', sqft, 'sq ft', 0.12);
      } else {
        add('Surface cleaning - power sweeper + air blow', sqft, 'sq ft', 0.16);
        add('Crack fill - hot rubber, rout where >1/4"', linearFt || Math.ceil(sqft / 12), 'lin ft', PRICING.crackFillPerLinearFt.mid);
      }
      add('Tack coat - SS-1H, 0.04-0.06 gal/sq yd', Math.ceil(sqft * 0.04), 'gal', PRICING.tackPerGal);
      add(`Asphalt overlay - ${depth || 1.5}" ODOT 448 Type 1 Surface - ${calculateAsphaltTonnage(sqft, depth || 1.5)} tons`, sqft, 'sq ft', isMill ? PRICING.parkingLotMillAndOverlay.mid : PRICING.parkingLotOverlay15in.mid);
      add('Adjust utilities, manholes to new grade (up to 2)', isMill ? 2 : 1, 'each', 185);
      if (fullText.includes('stripe') || fullText.includes('lot')) {
        const stalls = stallsFromText || Math.ceil(sqft / 300);
        add(`Re-stripe per existing layout - ${stalls} stalls`, stalls, 'stall', PRICING.stallPerStall.mid - 6);
      }
      break;
    }

    case 'commercial_sealcoat':
    case 'commercial_sealcoat_crack_stripe': {
      const needsCrack = fullText.includes('crack');
      const needsStripe = fullText.includes('stripe') || fullText.includes('striping');
      add('Deep cleaning - power sweeper, degreaser for oil spots', sqft, 'sq ft', 0.14);
      if (needsCrack) add('Crack fill - hot rubber, rout & seal', linearFt || Math.ceil(sqft / 6), 'lin ft', PRICING.crackFillPerLinearFt.mid);
      add('Oil spot primer - petroleum primer for oil stained areas', Math.ceil(sqft / 500), 'spot', 22);
      add('First coat - commercial grade coal tar sealer with sand + latex', sqft, 'sq ft', PRICING.sealcoatCommercial.mid);
      add('Second coat - perpendicular application', sqft, 'sq ft', PRICING.sealcoatCommercial.mid - 0.03);
      if (needsStripe) {
        const stalls = stallsFromText || Math.ceil(sqft / 300);
        add(`Line striping - re-stripe per existing or new layout`, stalls, 'stall', PRICING.stallPerStall.mid);
        add('ADA - repaint blue, crosshatch, signage', 1, 'ls', PRICING.adaPerEach.mid);
      }
      break;
    }

    case 'pothole_patch': {
      const numPotholes = stallsFromText || Math.max(1, Math.ceil(sqft / 25));
      add(`Pothole repair - saw cut to square, excavate 6"-8" deep, square edges - ${numPotholes} pothole(s)`, numPotholes, 'each', 285);
      add('Haul off spoils & disposal - includes trucking', Math.ceil(numPotholes * 0.5), 'ton', PRICING.disposalPerTon);
      add('Compacted aggregate base - ODOT 304, 4" - compact in lifts', Math.ceil(sqft / 20), 'ton', PRICING.basePerTon + 8);
      add(`Hot mix asphalt - ODOT 448 Type 1 Surface ${depth || 3}" - ${tonnage} tons - Hand laid, compacted in lifts`, tonnage, 'ton', tonnage > 5 ? 108 : 145);
      add('Tack coat - SS-1H on vertical edges for bonding', Math.ceil(sqft / 200), 'gal', 14);
      add('Compaction - plate compactor + roller', 1, 'ls', 65);
      break;
    }

    case 'crack_fill_only': {
      const linFt = linearFt || Math.ceil(sqft * 1.5) || 500;
      add('Crack routing - rout cracks to 3/4" wide x 3/4" deep with router, clean with air', linFt, 'lin ft', 1.15);
      add('Hot rubber crack filler - 340° hot pour, overband squeegee', linFt, 'lin ft', PRICING.crackFillPerLinearFt.mid);
      add('Mobilization - crack router, melter, compressor', 1, 'ls', 250);
      break;
    }

    case 'striping_only': {
      const stalls = stallsFromText || 10;
      add(`Layout & measure - chalk lines for ${stalls} stalls`, 1, 'ls', 85);
      add(`Line striping - 4" white - ${stalls} stalls @ 18'x9'`, stalls, 'stall', PRICING.stallPerStall.mid);
      add('ADA - blue + signage as needed', 1, 'ls', PRICING.adaPerEach.mid);
      add('Arrows, stop bars, crosswalks - per plan', 2, 'each', PRICING.arrowPerEach);
      break;
    }

    case 'apron_approach': {
      add('Mobilization & saw cutting at road/curb', 1, 'ls', 295);
      add('Removal of existing apron - includes disposal', Math.ceil(sqft / 9), 'sq yd', 28);
      add('Base - ODOT 304 - 8" for heavy loading at street', Math.ceil(sqft * 0.67 / 27), 'cu yd', PRICING.basePerCuYd);
      add(`Asphalt - ${depth || 3}" ODOT 448 - ${tonnage} tons - Hand work, slope to street`, tonnage, 'ton', 135);
      add('Taper to existing road per city spec - includes inspection coordination', 1, 'ls', 150);
      break;
    }

    case 'walkway_path': {
      add('Mobilization & grading for walkway', 1, 'ls', 395);
      add('Aggregate base - ODOT 304, 4" compacted for pedestrian loading', Math.ceil(sqft * 0.33 / 27), 'cu yd', 72);
      add(`Asphalt walkway - ${depth || 2}" ODOT 448 - ${tonnage} tons - Hand laid, slope for drainage`, tonnage, 'ton', 125);
      add('Edging and finish rolling', sqft, 'sq ft', 0.22);
      break;
    }

    default: {
      add('Mobilization & equipment', 1, 'ls', sqft > 2000 ? 750 : 495);
      add('Grading & base prep - 2% slope', sqft, 'sq ft', 0.95);
      add(`Asphalt - ${depth}" - ${tonnage} tons`, tonnage, 'ton', 120);
      add('Rolling & compaction', sqft, 'sq ft', 0.18);
    }
  }

  if (!detected.type.includes('seal') && !detected.type.includes('crack') && !detected.type.includes('stripe')) {
    if (!items.some(i => i.description.toLowerCase().includes('tack'))) {
      add('Tack coat - SS-1H', Math.ceil(sqft * 0.04), 'gal', PRICING.tackPerGal);
    }
  }

  return items;
}

export async function generateAIEstimate(prompt: string, ctx?: JobContext): Promise<AIEstimateResult> {
  const fullText = `${prompt} ${ctx?.description || ''} ${ctx?.title || ''}`.trim();
  const detected = detectJobType(fullText);
  const lineItems = await generateAILineItems(prompt, ctx);

  const sqft = ctx?.squareFootage || extractSqFtSmart(fullText.toLowerCase()) || 1200;

  let title = 'Asphalt Paving Estimate';
  switch (detected.type) {
    case 'residential_remove_replace': title = `Residential Driveway - Remove & Replace - ${sqft.toLocaleString()} sq ft`; break;
    case 'residential_new': title = `New Residential Driveway - ${sqft.toLocaleString()} sq ft`; break;
    case 'residential_overlay': title = `Driveway Overlay / Resurface - ${sqft.toLocaleString()} sq ft`; break;
    case 'residential_sealcoat': title = `Residential Sealcoating - ${sqft.toLocaleString()} sq ft - 2 Coats`; break;
    case 'residential_sealcoat_crack': title = `Sealcoating + Crack Fill - ${sqft.toLocaleString()} sq ft`; break;
    case 'commercial_new': title = `Commercial Parking Lot - New Construction - ${sqft.toLocaleString()} sq ft`; break;
    case 'commercial_overlay': title = `Parking Lot Overlay - ${sqft.toLocaleString()} sq ft`; break;
    case 'commercial_mill_overlay': title = `Mill & Overlay - Parking Lot - ${sqft.toLocaleString()} sq ft`; break;
    case 'commercial_sealcoat': title = `Commercial Sealcoating - ${sqft.toLocaleString()} sq ft`; break;
    case 'commercial_sealcoat_crack_stripe': title = `Full Parking Lot Maintenance - Seal, Crack, Stripe - ${sqft.toLocaleString()} sq ft`; break;
    case 'pothole_patch': title = `Asphalt Patch / Pothole Repair - ${sqft.toLocaleString()} sq ft`; break;
    case 'crack_fill_only': title = `Crack Filling Service - ${extractLinearFt(fullText.toLowerCase()) || Math.ceil(sqft * 1.5)} lin ft`; break;
    case 'striping_only': title = `Line Striping - ${extractStalls(fullText.toLowerCase()) || 10} stalls`; break;
    case 'apron_approach': title = `Driveway Apron / Approach - ${sqft.toLocaleString()} sq ft`; break;
    case 'walkway_path': title = `Walkway / Path - ${sqft.toLocaleString()} sq ft`; break;
    default: title = ctx?.title || `Paving Estimate - ${sqft.toLocaleString()} sq ft`;
  }

  const total = lineItems.reduce((s, i) => s + i.total, 0);
  const perSqFt = total / sqft;

  let notes = `BLACK GOLD ASPHALT & SEALCOATING - COLUMBUS OH ESTIMATE (${new Date().toLocaleDateString()})\n\n`;
  notes += `🔍 KEYWORD ANALYSIS: Detected "${detected.type.replace(/_/g, ' ')}" (Confidence: ${detected.confidence}%)\n`;
  notes += `Matched keywords: ${detected.matched.join(', ') || 'general paving'}\n`;
  notes += `General keywords: ${detected.keywords.join(', ') || 'none'}\n`;
  notes += `Area: ${sqft.toLocaleString()} sq ft (${(sqft/43560).toFixed(3)} acres) - from ${extractSqFtSmart(fullText.toLowerCase()) ? 'explicit dimensions' : 'estimated'}\n`;
  notes += `Job description focus: "${prompt.slice(0,120)}..."\n\n`;
  notes += `ESTIMATE INCLUDES:\n• All labor, materials, equipment per ODOT 448\n• Base prep 2% slope, laser graded\n• Materials: ODOT 304 base, ODOT 448 Type 1 Surface & Type 2 Intermediate (PG 64-22)\n• Tack coat SS-1H, finish rolling\n• Cleanup, haul-off, broom clean\n• 1-year workmanship warranty\n\n`;
  notes += `PRICING: Columbus OH 2024-2025 market - Total $${total.toLocaleString('en-US', {minimumFractionDigits:2})} = $${perSqFt.toFixed(2)}/sq ft\n\n`;
  notes += `EXCLUSIONS: Permits, engineering, survey, landscaping beyond backfill, concrete, drainage pipe, striping unless listed, private utility locates.\n\n`;
  notes += `TERMS: Valid 30 days. Payment 40% scheduling, 60% completion. Net 10, 1.5% late fee.\n\n`;
  notes += `WARRANTY: 1-year paving workmanship. Sealcoat 1-year peeling/flaking. Crack fill 1-year pull-out >50%. Patches 6 months.\n\n`;
  notes += `Generated by Asphalt Assistant AI - Focused on keywords "${detected.matched.slice(0,5).join(', ')}" - Confidence ${detected.confidence}% - (380) 201-5143 • justusasphalt@gmail.com`;

  return {
    title,
    description: fullText,
    lineItems,
    notes,
    confidence: detected.confidence,
    jobType: detected.type,
  };
}

export async function generateAIContract(estimateTitle: string, customerName: string, total: number, sqft?: number, jobType?: string): Promise<string> {
  const jt = (jobType || 'residential_remove_replace').toLowerCase();
  await new Promise(r => setTimeout(r, 600));
  let scopeDetails = "";
  let materialsDetails = "";
  let warrantyDetails = "";
  let exclusionsAdd = "";

  if (jt.includes('residential_remove_replace')) {
    scopeDetails = `Remove existing asphalt driveway (approx ${sqft ? sqft + ' sq ft' : 'per plan'}), haul off and dispose, excavate subgrade, fine grade to 2% slope for drainage, install 6" ODOT 304 limestone base compacted to 95%, install ${sqft ? Math.ceil(sqft/9) + ' sq yd' : ''} of asphalt (2.5" surface + 1.5" intermediate as needed), compact, backfill edges, cleanup.`;
    materialsDetails = `- Aggregate Base: ODOT 304 Limestone, 6" compacted\n- Binder: ODOT 448 Type 2 Intermediate, 1.5" \n- Surface: ODOT 448 Type 1 Surface, 2.5", PG 64-22\n- Tack: SS-1H`;
    warrantyDetails = `1-year workmanship - excludes cracking from base failure, heavy loads, oil spills, lack of sealcoating.`;
  } else if (jt.includes('commercial_new') || jt.includes('commercial')) {
    scopeDetails = `Commercial parking lot new construction - ${sqft ? sqft + ' sq ft' : 'per plan'} - Includes heavy equipment mobilization, excavation to grade, 8" ODOT 304 base for commercial loading, fine grading with string line for drainage to catch basins, 2" binder + 1.5" surface asphalt (PG 64-22), tack between lifts, 10-ton breakdown and 1-ton finish rolling, adjust utilities, line striping per plan, ADA compliance markings.`;
    materialsDetails = `- Base: ODOT 304, 8" commercial spec, 95% Mod Proctor\n- Binder: ODOT 448 Type 2, 2", PG 64-22\n- Surface: ODOT 448 Type 1, 1.5", PG 64-22\n- Striping: 4" white traffic paint, ADA blue`;
    warrantyDetails = `1-year commercial - excludes heavy truck damage, snowplow damage, oil/fuel spills, lack of maintenance sealcoating.`;
  } else if (jt.includes('sealcoat')) {
    scopeDetails = `Sealcoating service - ${sqft ? sqft + ' sq ft' : 'per plan'} - Includes power sweeping, air blow, degreaser for oil spots, crack routing and hot rubber filling where >1/4", oil spot priming, 2 coats of commercial grade coal tar sealer with 2-3 lbs sand per gallon + 2% latex additive applied perpendicular, barricades during 2-4hr curing. ${jt.includes('stripe') ? 'Includes re-striping per existing layout + ADA markings.' : ''}`;
    materialsDetails = `- Cleaner: Power sweeper, degreaser, oil spot primer\n- Crack Filler: Hot rubber, 340°F, routed to 3/4"x3/4"\n- Sealer: Coal tar emulsion, 2 coats, sand + latex additive\n- Striping: 4" white traffic paint (if included)`;
    warrantyDetails = `1-year against peeling/flaking under normal use.`;
    exclusionsAdd = `Sealcoat will not fill alligatored areas or structural cracks - those reflect through. New asphalt must cure 90-180 days before sealcoating.`;
  } else if (jt.includes('crack_fill')) {
    scopeDetails = `Crack filling service - Includes routing cracks to 3/4" wide x 3/4" deep with crack router, cleaning with air compressor, filling with 340°F hot rubberized crack filler, overband squeegee.`;
    materialsDetails = `- Router: 3/4" x 3/4" rout\n- Filler: Hot rubber, ASTM D6690 Type II`;
    warrantyDetails = `1-year against pull-out >50%.`;
  } else if (jt.includes('pothole') || jt.includes('patch')) {
    scopeDetails = `Pothole / patch repair - Saw cut to square edges, excavate 6-8" deep, remove failed material, haul off, install 4" ODOT 304 compacted in lifts, tack vertical edges with SS-1H, install hot mix asphalt ${sqft ? sqft + ' sq ft' : ''} in lifts, compact.`;
    materialsDetails = `- Base: ODOT 304, 4" compacted\n- Asphalt: ODOT 448 Type 1 Surface\n- Tack: SS-1H on vertical edges`;
    warrantyDetails = `6 months workmanship.`;
  } else if (jt.includes('striping')) {
    scopeDetails = `Line striping service - Layout and measure per plan or existing, chalk lines, apply 4" white traffic paint for stalls, ADA blue, arrows, stop bars, crosswalks.`;
    materialsDetails = `- Paint: 4" white traffic paint\n- ADA: Blue paint, signage`;
    warrantyDetails = `90 days against peeling/flaking.`;
  } else {
    scopeDetails = `Asphalt paving / sealcoating services as described in Estimate - ${sqft ? sqft + ' sq ft' : 'per plan'} - Includes mobilization, base prep, asphalt installation / sealcoat application, compaction, striping as noted, cleanup.`;
    materialsDetails = `- Base: ODOT 304 Limestone\n- Asphalt: ODOT 448 Type 1 Surface & Type 2 Intermediate, PG 64-22\n- Sealcoat: Coal tar or asphalt emulsion, 2 coats`;
    warrantyDetails = `1-year workmanship for paving.`;
  }

  return `PAVING CONTRACT - ${jt.toUpperCase().replace(/_/g, ' ')} - BLACK GOLD ASPHALT & SEALCOATING

This Agreement is entered into on ${new Date().toLocaleDateString()} by and between Black Gold Asphalt & Sealcoating (Contractor) and ${customerName} (Customer) for the project: ${estimateTitle}.

JOB TYPE: ${jt.replace(/_/g, ' ').toUpperCase()}

1. SCOPE OF WORK:
${scopeDetails}

Approximate area: ${sqft ? sqft.toLocaleString() + ' sq ft' : 'per plans'}.

2. MATERIALS:
${materialsDetails}

3. PRICE & PAYMENT:
Total Contract Price: $${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}.

4. SCHEDULE:
Work to begin within 7-14 business days of deposit, signed contract, and weather permitting.

5. CUSTOMER RESPONSIBILITIES:
Clear access, remove vehicles, locate private utilities, trim branches, ensure drainage away from new asphalt.

6. WARRANTY:
${warrantyDetails}

7. EXCLUSIONS:
Permits, survey, engineering, landscaping beyond backfill, concrete, drainage pipe, private utility locates.
${exclusionsAdd ? '\nJOB-SPECIFIC EXCLUSIONS: ' + exclusionsAdd : ''}

8. CHANGE ORDERS:
If hidden conditions found, contractor will provide written change order for approval before proceeding.

9. ACCEPTANCE:
Contractor: _________________________ Date: _______
Customer: __________________________ Date: _______
Print Name: ${customerName}

Black Gold Asphalt & Sealcoating | Columbus, Ohio | (380) 201-5143 | justusasphalt@gmail.com | OH Lic #BG-2024

---
Generated by Asphalt Assistant AI - Job Type: ${jt} - Editable
`;
}
