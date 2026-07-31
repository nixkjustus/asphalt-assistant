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

// Columbus OH 2024-2025 Market Pricing - Realistic
const PRICING = {
  // Residential
  drivewayRemoveReplace: { min: 4.5, mid: 5.25, max: 6.5 }, // $/sq ft
  drivewayNew: { min: 4.0, mid: 4.75, max: 6.0 },
  drivewayOverlay: { min: 2.5, mid: 3.0, max: 4.0 },
  sealcoatResidential: { min: 0.28, mid: 0.35, max: 0.48 }, // 2 coats
  sealcoatCommercial: { min: 0.22, mid: 0.32, max: 0.42 },
  // Commercial
  parkingLotNew3in: { min: 3.2, mid: 3.85, max: 5.0 },
  parkingLotOverlay15in: { min: 2.25, mid: 2.85, max: 3.75 },
  parkingLotMillAndOverlay: { min: 3.0, mid: 3.9, max: 5.2 },
  // Repair
  potholeRepair: { base: 350, perTon: 135 }, // base + per ton
  crackFillPerLinearFt: { min: 1.5, mid: 2.25, max: 3.5 },
  crackFillPerLb: 3.75,
  // Base & Prep
  excavationPerSqFt: { min: 0.75, mid: 1.05, max: 1.5 },
  base304PerSqFt6in: { min: 1.1, mid: 1.35, max: 1.75 },
  basePerTon: 52,
  basePerCuYd: 78,
  // Asphalt materials
  tackPerGal: 9.5,
  tackPerSqFt: 0.12,
  compactionPerSqFt: 0.18,
  // Striping
  stallPerStall: { min: 32, mid: 38, max: 55 },
  adaPerEach: { min: 165, mid: 195, max: 275 },
  arrowPerEach: 45,
  // Other
  mobilizationResidential: 495,
  mobilizationCommercial: 850,
  mobilizationSmallJob: 650, // <500 sq ft
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

function detectJobType(text: string): { type: JobType; confidence: number; keywords: string[] } {
  const p = text.toLowerCase();
  let scores: Record<JobType, number> = {
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
  const keywords: string[] = [];

  // Keywords scoring
  const has = (words: string[], type: JobType, weight = 1, kw?: string) => {
    for (const w of words) {
      if (p.includes(w)) {
        scores[type] += weight;
        if (kw && !keywords.includes(kw)) keywords.push(kw);
      }
    }
  };

  // Residential
  has(['driveway'], 'residential_remove_replace', 2, 'driveway');
  has(['residential', 'home', 'house'], 'residential_remove_replace', 1, 'residential');
  has(['remove', 'tear out', 'tear-out', 'demo', 'demolition', 'excavate', 'existing'], 'residential_remove_replace', 3, 'remove & replace');
  has(['new driveway', 'new construction', 'from dirt', 'from gravel'], 'residential_new', 4, 'new construction');
  has(['overlay', 'resurface', 'cap', '1.5"', '1.5 inch'], 'residential_overlay', 3, 'overlay');
  has(['sealcoat', 'seal coat', 'sealer', 'sealing', 'coal tar'], 'residential_sealcoat', 2, 'sealcoat');
  has(['sealcoat', 'seal and', 'crack'], 'residential_sealcoat_crack', 3, 'seal + crack');
  has(['crack fill', 'crackfill', 'crack sealing', 'routing'], 'crack_fill_only', 4, 'crack fill');
  has(['apron', 'approach', 'entrance'], 'apron_approach', 3, 'apron');

  // Commercial
  has(['parking lot', 'parking area', 'lot paving', 'commercial', 'business', 'plaza', 'strip mall'], 'commercial_new', 3, 'commercial parking');
  has(['parking lot overlay', 'lot overlay', 'overlay parking', 'resurface lot'], 'commercial_overlay', 4, 'parking overlay');
  has(['mill', 'milling', 'mill and overlay', 'mill & overlay'], 'commercial_mill_overlay', 5, 'mill & overlay');
  has(['sealcoat parking', 'seal parking', 'commercial seal'], 'commercial_sealcoat', 3, 'commercial seal');
  has(['sealcoat', 'crack', 'stripe', 'striping', 'line'], 'commercial_sealcoat_crack_stripe', 3, 'seal + crack + stripe');

  // Repair
  has(['pothole', 'potholes', 'patch', 'patching', 'hole repair'], 'pothole_patch', 4, 'pothole/patch');
  has(['line striping', 'striping only', 'restripe', 're-stripe', 'paint lines', 'stall'], 'striping_only', 4, 'striping');
  has(['walkway', 'sidewalk', 'pathway', 'path', 'trail'], 'walkway_path', 3, 'walkway');

  // Sealcoat boost for small jobs
  if (p.includes('seal') && !p.includes('asphalt') && !p.includes('paving')) {
    scores['residential_sealcoat'] += 2;
  }

  // Determine max
  let maxType: JobType = 'residential_remove_replace';
  let maxScore = 0;
  for (const [type, score] of Object.entries(scores) as [JobType, number][]) {
    if (score > maxScore) {
      maxScore = score;
      maxType = type;
    }
  }

  // Fallbacks if no strong signal
  if (maxScore < 2) {
    if (p.includes('driveway')) maxType = 'residential_remove_replace';
    else if (p.includes('parking')) maxType = 'commercial_new';
    else if (p.includes('seal')) maxType = 'residential_sealcoat';
    else maxType = 'residential_remove_replace';
  }

  const confidence = Math.min(95, 40 + maxScore * 10);
  return { type: maxType, confidence, keywords };
}

function extractSqFtSmart(text: string): number | null {
  const lower = text.toLowerCase();
  // Direct sq ft
  let match = lower.match(/(\d{2,5}(?:,\d{3})?)\s*(?:sq\s*ft|sft|sf|sqft|square\s*feet|square\s*ft)/i);
  if (match) return parseInt(match[1].replace(/,/g, ''), 10);

  // Dimensions like 20x50, 20 x 50, 20' x 50', 20 ft by 50 ft
  match = lower.match(/(\d{2,3})\s*(?:'|ft|feet)?\s*x\s*(\d{2,3})\s*(?:'|ft|feet)?/i);
  if (match) {
    const w = parseInt(match[1], 10);
    const h = parseInt(match[2], 10);
    if (w >= 8 && w <= 300 && h >= 8 && h <= 300) {
      return w * h;
    }
  }

  // "20 by 40"
  match = lower.match(/(\d{2,3})\s*by\s*(\d{2,3})/i);
  if (match) {
    const w = parseInt(match[1], 10);
    const h = parseInt(match[2], 10);
    if (w >= 8 && h >= 8 && w <= 300 && h <= 300) return w * h;
  }

  // Car count
  if (lower.includes('1 car') || lower.includes('single car')) return 320; // ~12x26
  if (lower.includes('2 car') || lower.includes('double car')) return 600; // ~20x30
  if (lower.includes('3 car') || lower.includes('triple car')) return 900; // ~30x30
  if (lower.includes('4 car')) return 1200;

  // Turnaround
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
  // Common phrases
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
  await new Promise(r => setTimeout(r, 600)); // Simulate AI thinking

  const fullText = `${prompt} ${ctx?.description || ''} ${ctx?.title || ''} ${ctx?.jobType || ''}`.toLowerCase();
  let detected = detectJobType(fullText);
  // If explicit jobType provided via dropdown, override detection with 95% confidence
  if (ctx?.jobType && ctx.jobType !== 'auto') {
    const explicit = ctx.jobType as any;
    // Map explicit dropdown value to internal JobType
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
      detected = { type: mapped, confidence: 95, keywords: [explicit, 'explicit dropdown'] };
    }
  }
  
  // Smart extractions
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

  // Helper to add with realistic pricing
  const add = (desc: string, qty: number, unit: string, unitPrice: number, optional = false) => {
    items.push(buildLineItem(desc, qty, unit, unitPrice, { isOptional: optional }));
  };

  // Job Type Templates - REALISTIC Columbus OH Pricing

  switch (detected.type) {
    case 'residential_remove_replace': {
      // Full driveway R&R
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
      
      // Optional add-on: Sealcoat after 90 days
      if (fullText.includes('seal') || fullText.includes('coating') || Math.random() > 0.3) {
        add(`Sealcoat - 2 coats coal tar sealer with sand additive (OPTIONAL - Apply 90-180 days after paving, extends life 2x)`, sqft, 'sq ft', PRICING.sealcoatResidential.mid, true);
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
      // Striping if parking lot
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
      add('Oil spot primer - petroleum primer for  oil stained areas', Math.ceil(sqft / 500), 'spot', 22);
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
      const numPotholes = extractStalls(fullText) || Math.max(1, Math.ceil(sqft / 25));
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

    default: {
      // Fallback generic paving
      add('Mobilization & equipment', 1, 'ls', sqft > 2000 ? 750 : 495);
      add('Grading & base prep - 2% slope', sqft, 'sq ft', 0.95);
      add(`Asphalt - ${depth}" - ${tonnage} tons`, tonnage, 'ton', 120);
      add('Rolling & compaction', sqft, 'sq ft', 0.18);
    }
  }

  // Always add these if not already and job is not seal-only
  if (!detected.type.includes('seal') && !detected.type.includes('crack') && !detected.type.includes('stripe')) {
    // Ensure tack is included (if not already)
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

  // Generate title based on detection
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
    default: title = ctx?.title || `Paving Estimate - ${sqft.toLocaleString()} sq ft - ${detected.keywords.slice(0,3).join(', ')}`;
  }

  const total = lineItems.reduce((s, i) => s + i.total, 0);
  const perSqFt = total / sqft;

  // Detailed notes based on type
  let notes = `BLACK GOLD ASPHALT & SEALCOATING - COLUMBUS OH ESTIMATE (${new Date().toLocaleDateString()})\n\n`;
  notes += `SCOPE ANALYSIS: Detected job type: ${detected.type.replace(/_/g, ' ')} (Confidence: ${detected.confidence}%) - Keywords: ${detected.keywords.join(', ') || 'general paving'}\n`;
  notes += `Area: ${sqft.toLocaleString()} sq ft (${(sqft/43560).toFixed(3)} acres) - Calculated from: ${extractSqFtSmart(fullText.toLowerCase()) ? 'explicit dimensions in description' : 'estimated from description + context'}\n\n`;
  notes += `ESTIMATE INCLUDES:\n• All labor, materials, equipment, trucking, compaction per ODOT 448\n`;
  notes += `• Base prep to achieve 2% min slope (1/4" per ft) for drainage - laser graded\n`;
  notes += `• Materials: ODOT 304 limestone base, ODOT 448 Type 1 Surface & Type 2 Intermediate as noted (PG 64-22)\n`;
  notes += `• Tack coat SS-1H for bonding, finish rolling with 1-ton & 10-ton rollers\n`;
  notes += `• Cleanup & haul-off of spoils - job left broom clean\n`;
  notes += `• 1-year workmanship warranty - excludes base failure, heavy loads (dumpsters, RVs), oil spills, lack of sealcoating\n\n`;
  notes += `PRICING: Columbus OH 2024-2025 market rates - Total $${total.toLocaleString('en-US', {minimumFractionDigits:2})} = $${perSqFt.toFixed(2)}/sq ft - `;
  if (detected.type.includes('residential')) notes += `Residential range $4.00-$6.50/sq ft for R&R, this estimate at $${perSqFt.toFixed(2)}/sq ft is ${perSqFt < 4.0 ? 'BELOW market - verify access & small job premium' : perSqFt > 6.5 ? 'ABOVE market - includes difficult access, hand work, or small size' : 'WITHIN market'}\n`;
  else if (detected.type.includes('commercial')) notes += `Commercial range $3.00-$5.00/sq ft new, $2.25-$3.75 overlay - at $${perSqFt.toFixed(2)}/sq ft\n`;
  else if (detected.type.includes('seal')) notes += `Sealcoat range $0.25-$0.48/sq ft for 2 coats in Columbus - at $${perSqFt.toFixed(2)}/sq ft\n`;
  else notes += `At $${perSqFt.toFixed(2)}/sq ft\n`;

  notes += `\nEXCLUSIONS (Unless Noted Above): Permits, engineering, survey, soil testing, landscaping restoration beyond backfill, concrete work, drainage pipe, downspout extensions, striping unless listed, utility locates for private lines (sprinkler, dog fence).\n\n`;
  notes += `TERMS: Valid 30 days. Oil price escalation clause: If liquid asphalt index increases >5% from today, price subject to adjustment per ODOT. Payment: 40% upon scheduling to hold date, 60% upon substantial completion - Net 10, 1.5% monthly late fee.\n\n`;
  notes += `SCHEDULE: Weather permitting, 7-14 business days from deposit & signed contract. Not liable for delays due to weather, hidden site conditions, utility conflicts.\n\n`;
  notes += `WARRANTY: 1-year workmanship. Sealcoat: 1-year against peeling/flaking under normal use. Cracks: Hot rubber has 1-year against pull-out >50%, but new cracks can appear from base movement - not covered. Pothole patches: 6 months.\n\n`;
  notes += `CUSTOMER RESPONSIBILITIES: Clear vehicles, locate private utilities, ensure gutters drain away from new asphalt post-completion, keep irrigation off 24hrs before/after sealcoat, no parking on new asphalt 24hrs (foot traffic 24hrs), 72hrs before heavy vehicles.\n\n`;
  notes += `Generated by Asphalt Assistant AI - Confidence ${detected.confidence}% - Review with owner before sending. For questions: (380) 201-5143 • justusasphalt@gmail.com • Columbus, Ohio and surrounding areas • OH Lic #BG-2024`;

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
  // Job-type specific clauses
  let scopeDetails = "";
  let materialsDetails = "";
  let warrantyDetails = "";
  let exclusionsAdd = "";

  if (jt.includes('residential_remove_replace')) {
    scopeDetails = `Remove existing asphalt driveway (approx ${sqft ? sqft + ' sq ft' : 'per plan'}), haul off and dispose, excavate subgrade, fine grade to 2% slope for drainage, install 6" ODOT 304 limestone base compacted to 95%, install ${sqft ? Math.ceil(sqft/9) + ' sq yd' : ''} of asphalt (2.5" surface + 1.5" intermediate as needed), compact, backfill edges, cleanup.`;
    materialsDetails = `- Aggregate Base: ODOT 304 Limestone, 6" compacted
- Binder: ODOT 448 Type 2 Intermediate, 1.5" 
- Surface: ODOT 448 Type 1 Surface, 2.5", PG 64-22
- Tack: SS-1H`;
    warrantyDetails = `1-year workmanship - excludes cracking from base failure, heavy loads, oil spills, lack of sealcoating.`;
  } else if (jt.includes('commercial_new') || jt.includes('commercial')) {
    scopeDetails = `Commercial parking lot new construction - ${sqft ? sqft + ' sq ft' : 'per plan'} - Includes heavy equipment mobilization, excavation to grade, 8" ODOT 304 base for commercial loading, fine grading with string line for drainage to catch basins, 2" binder + 1.5" surface asphalt (PG 64-22), tack between lifts, 10-ton breakdown and 1-ton finish rolling, adjust utilities, line striping per plan, ADA compliance markings.`;
    materialsDetails = `- Base: ODOT 304, 8" commercial spec, 95% Mod Proctor
- Binder: ODOT 448 Type 2, 2", PG 64-22
- Surface: ODOT 448 Type 1, 1.5", PG 64-22
- Striping: 4" white traffic paint, ADA blue`;
    warrantyDetails = `1-year commercial - excludes heavy truck damage, snowplow damage, oil/fuel spills, lack of maintenance sealcoating.`;
  } else if (jt.includes('sealcoat')) {
    scopeDetails = `Sealcoating service - ${sqft ? sqft + ' sq ft' : 'per plan'} - Includes power sweeping, air blow, degreaser for oil spots, crack routing and hot rubber filling where >1/4", oil spot priming, 2 coats of commercial grade coal tar sealer with 2-3 lbs sand per gallon + 2% latex additive applied perpendicular, barricades during 2-4hr curing. ${jt.includes('stripe') ? 'Includes re-striping per existing layout + ADA markings.' : ''}`;
    materialsDetails = `- Cleaner: Power sweeper, degreaser, oil spot primer
- Crack Filler: Hot rubber, 340°F, routed to 3/4"x3/4"
- Sealer: Coal tar emulsion, 2 coats, sand + latex additive
- Striping: 4" white traffic paint (if included)`;
    warrantyDetails = `1-year against peeling/flaking under normal use - excludes wear from traffic, turning tires while stationary, oil/gas spills, failure to keep irrigation off 24hrs, parking too soon (24-48hrs required).`;
    exclusionsAdd = `Sealcoat will not fill alligatored areas or structural cracks - those reflect through. New asphalt must cure 90-180 days before sealcoating.`;
  } else if (jt.includes('crack_fill')) {
    scopeDetails = `Crack filling service - Includes routing cracks to 3/4" wide x 3/4" deep with crack router, cleaning with air compressor, filling with 340°F hot rubberized crack filler, overband squeegee for smooth finish.`;
    materialsDetails = `- Router: 3/4" x 3/4" rout
- Filler: Hot rubber, ASTM D6690 Type II`;
    warrantyDetails = `1-year against pull-out >50% - new cracks can appear from base movement, not covered.`;
  } else if (jt.includes('pothole') || jt.includes('patch')) {
    scopeDetails = `Pothole / patch repair - Saw cut to square edges, excavate 6-8" deep, remove failed material, haul off, install 4" ODOT 304 compacted in lifts, tack vertical edges with SS-1H, install hot mix asphalt ${sqft ? sqft + ' sq ft' : ''} in lifts (3" each max), compact with plate compactor and roller.`;
    materialsDetails = `- Base: ODOT 304, 4" compacted
- Asphalt: ODOT 448 Type 1 Surface, ${sqft ? '' : '3" typical'}
- Tack: SS-1H on vertical edges`;
    warrantyDetails = `6 months workmanship - excludes base failure, heavy loads, water undermining.`;
  } else if (jt.includes('striping')) {
    scopeDetails = `Line striping service - Layout and measure per plan or existing, chalk lines, apply 4" white traffic paint (1 coat) for stalls, ADA blue, arrows, stop bars, crosswalks as needed.`;
    materialsDetails = `- Paint: 4" white traffic paint, VOC compliant
- ADA: Blue paint, signage
- Layout: Chalk line, measure 18'x9' stalls standard`;
    warrantyDetails = `90 days against peeling/flaking under normal traffic.`;
  } else {
    scopeDetails = `Asphalt paving / sealcoating services as described in Estimate - ${sqft ? sqft + ' sq ft' : 'per plan'} - Includes mobilization, base prep, asphalt installation / sealcoat application, compaction, striping as noted, cleanup. All work per ODOT 448 where applicable.`;
    materialsDetails = `- Base: ODOT 304 Limestone, compacted to 95%
- Asphalt: ODOT 448 Type 1 Surface & Type 2 Intermediate, PG 64-22
- Sealcoat: Coal tar or asphalt emulsion, 2 coats with sand & latex where noted
- Tack: SS-1H`;
    warrantyDetails = `1-year workmanship for paving - excludes base failure, heavy loads, oil spills, lack of maintenance. Sealcoat 1-year against peeling/flaking under normal use.`;
  }

  return `PAVING CONTRACT - ${jt.toUpperCase().replace(/_/g, ' ')} - BLACK GOLD ASPHALT & SEALCOATING

This Agreement is entered into on ${new Date().toLocaleDateString()} by and between Black Gold Asphalt & Sealcoating (Contractor) and ${customerName} (Customer) for the project: ${estimateTitle}.

JOB TYPE: ${jt.replace(/_/g, ' ').toUpperCase()} - This contract is specific to this job type with tailored clauses.

1. SCOPE OF WORK:
${scopeDetails}

Approximate area: ${sqft ? sqft.toLocaleString() + ' sq ft' : 'per plans'}. Includes all labor, materials, equipment, trucking, compaction, and jobsite cleanup leaving area broom clean.

2. MATERIALS - JOB SPECIFIC:
${materialsDetails}
- Depth: Per estimate (see scope above)
- Tack: SS-1H asphalt emulsion for bonding

3. PRICE & PAYMENT:
Total Contract Price: $${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}.
Payment Terms: 40% upon scheduling to hold date and order materials, 60% upon substantial completion. Invoices due Net 10, 1.5% monthly late fee. 3% fee for credit card payments. Change orders due upon approval.

4. SCHEDULE:
Work to begin within 7-14 business days of deposit, signed contract, and weather permitting (dry conditions, 50°F and rising for paving, 50°F+ overnight for sealcoat, no rain 24hrs). Contractor not liable for delays due to weather, material plant closures, hidden site conditions, utility conflicts, or customer not having area clear.

5. CUSTOMER RESPONSIBILITIES:
Provide clear access (10' wide minimum for paver, 12' for trucks), remove vehicles, boats, trailers from area, locate and mark private utilities (sprinkler heads/lines, dog fence, invisible fence, septic, private electric/gas, landscape lighting), trim low branches to 12' clearance, ensure gutters and downspouts drain away from new asphalt post-completion, keep irrigation off 24hrs before and after sealcoat, no parking on fresh sealer 24-48hrs, no parking on new asphalt 24hrs foot traffic, 72hrs before heavy vehicles, keep leaves/debris off sealer 24hrs.

6. WARRANTY - JOB SPECIFIC:
${warrantyDetails}
General: Warranty excludes cracking from base failure, subgrade movement/settlement, heavy loads (dumpsters, RVs, trucks, PODS), oil/gas spills, lack of sealcoating (for paving), snowplow/ice melt damage, tree root intrusion, or Acts of God. Must notify in writing within warranty period.

7. EXCLUSIONS (Unless Specifically Listed Above):
Permits (unless noted), survey, engineering, soil testing/borings, landscaping restoration beyond trench backfill with existing soil, concrete work, curb, drainage pipe, downspout extensions, striping unless listed, private utility locates, rock excavation, dewatering, handling of contaminated soils, traffic control beyond cones/barricades (flagger, off-duty officer if required by city).
${exclusionsAdd ? '\nJOB-SPECIFIC EXCLUSIONS: ' + exclusionsAdd : ''}

8. CHANGE ORDERS - JOB SPECIFIC FOR ${jt.replace(/_/g, ' ').toUpperCase()}:
If hidden conditions found (soft subgrade requiring more base, more asphalt depth needed due to settlement, additional crack fill lin ft beyond estimate, additional striping, etc), contractor will stop and provide written change order with price adjustment for customer approval before proceeding. Customer will not be charged extra without written approval except for emergency safety issues.

9. ACCEPTANCE:
By signing below, both parties accept all terms, scope, materials, price, schedule, warranty, exclusions, customer responsibilities, and change order process. Customer acknowledges they have read entire contract and understands job-type specific clauses above for ${jt.replace(/_/g, ' ')}.

Contractor: _________________________ Date: _______
Print Name: Black Gold Asphalt & Sealcoating - ${companyInfoPlaceholder()}

Customer: __________________________ Date: _______
Print Name: ${customerName}

Black Gold Asphalt & Sealcoating | Columbus, Ohio and surrounding areas | (380) 201-5143 | justusasphalt@gmail.com | OH Lic #BG-2024 | blackgoldasphalt.com

---
This contract was generated by Asphalt Assistant AI - Job Type: ${jt} - Confidence tailored to ${jt.replace(/_/g, ' ')} - Editable - You can change any words above before signing.
`;

function companyInfoPlaceholder() {
  return 'Owner';
}

`;
}

function companyInfoPlaceholder() { return 'Owner'; }

`;
}

function extractSqFt(text: string): number | null {
  return extractSqFtSmart(text.toLowerCase());
}
