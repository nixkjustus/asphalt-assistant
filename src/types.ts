export type Page = 'dashboard' | 'customers' | 'jobs' | 'estimates' | 'invoices' | 'contracts' | 'map' | 'ai-assistant' | 'users' | 'settings' | 'billing' | 'measure' | 'platform';

export interface Subscription {
  id: string;
  companyName: string;
  status: 'trial' | 'active' | 'expired' | 'canceled';
  plan: 'yearly';
  price: number; // 49.99
  currency: string; // USD
  trialStart: string; // ISO
  trialEnd: string; // ISO - 14 days
  currentPeriodStart?: string;
  currentPeriodEnd?: string; // +1 year when active
  cancelAtPeriodEnd?: boolean;
  isLifetime?: boolean; // true = paid forever, never expires
  paymentMethod?: {
    last4: string;
    brand: string; // visa, mastercard etc
    expMonth: number;
    expYear: number;
  };
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: string;
  updatedAt: string;
}

export const SUBSCRIPTION_PLAN = {
  price: 49.99,
  currency: 'USD',
  interval: 'year' as const,
  trialDays: 14,
  name: 'Asphalt Assistant Pro - Yearly',
  description: 'Full access to all features, unlimited customers, jobs, estimates, white-label branding, offline mode',
};

export interface CompanyInfo {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  license: string;
  logoDataUrl?: string; // base64 data URL for logo
  primaryColor: string; // e.g. #C5A032
  secondaryColor: string; // e.g. #000000
  tagline?: string;
  // Stripe real payment config
  stripePaymentLink?: string; // e.g. https://buy.stripe.com/... for $49.99/year
  stripePublishableKey?: string; // pk_live_... or pk_test_...
  stripePriceId?: string; // price_... for yearly $49.99
  stripeCustomerPortalLink?: string; // https://billing.stripe.com/p/login/...
}

export const APP_INFO = {
  name: 'Asphalt Assistant',
  tagline: 'Paving Business Management Platform',
  description: 'All-in-one asphalt & sealcoating business management - works offline',
  logo: '/app-logo.png',
  logoDataUrl: undefined as string | undefined,
  website: 'asphaltassistant.com',
  supportEmail: 'support@asphaltassistant.com',
  primaryColor: '#FF8C00',
  secondaryColor: '#0a0a0a',
  version: '2.0',
};

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  name: 'Black Gold Asphalt & Sealcoating',
  phone: '(380) 201-5143',
  email: 'justusasphalt@gmail.com',
  address: 'Columbus, Ohio and surrounding areas',
  city: 'Columbus',
  state: 'OH',
  zip: '43215',
  website: 'blackgoldasphalt.com',
  license: 'OH Lic #BG-2024',
  logoDataUrl: undefined,
  primaryColor: '#C5A032',
  secondaryColor: '#000000',
  tagline: 'Asphalt and Sealcoating - Columbus OH',
};

// Keep legacy COMPANY_INFO for backward compat, points to default
export const COMPANY_INFO = DEFAULT_COMPANY_INFO;

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  lat?: number;
  lng?: number;
  createdAt: string;
}

export interface Job {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  description: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: 'potential' | 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
  squareFootage?: number;
  depth?: number;
  asphaltTonnage?: number;
  scheduledDate?: string;
  completedDate?: string;
  lat?: number;
  lng?: number;
  estimateId?: string;
  createdAt: string;
  measurements?: {
    id: string;
    sqFeet: number;
    acres: number;
    perimeterFeet: number;
    points: { lat: number; lng: number }[];
    screenshotDataUrl?: string;
    address?: string;
    createdAt: string;
    tons?: { tons2in: number; tons2_5in: number; tons3in: number };
  }[];
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface Estimate {
  id: string;
  customerId: string;
  customerName: string;
  jobId?: string;
  title: string;
  jobType?: string;
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  status: 'draft' | 'sent' | 'accepted' | 'declined';
  validUntil?: string;
  notes?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  customerId: string;
  customerName: string;
  jobId?: string;
  estimateId?: string;
  title: string;
  jobType?: string;
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  dueDate?: string;
  notes?: string;
  createdAt: string;
}

export interface Contract {
  id: string;
  customerId: string;
  customerName: string;
  jobId?: string;
  estimateId?: string;
  title: string;
  content: string;
  jobType?: string;
  status: 'draft' | 'sent' | 'signed' | 'active';
  signedAt?: string;
  signatureData?: string;
  customerSignatureName?: string;
  createdAt: string;
}

// AUTH & RBAC
export type UserRole = 'admin' | 'manager' | 'crew' | 'viewer' | 'custom';

export type ModuleName = 'dashboard' | 'customers' | 'jobs' | 'estimates' | 'invoices' | 'contracts' | 'map' | 'ai' | 'users' | 'settings' | 'billing' | 'measure' | 'platform';

export interface ModulePermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

export type PermissionsMap = Record<ModuleName, ModulePermissions>;

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  email: string;
  role: UserRole;
  permissions: PermissionsMap;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
  createdBy?: string;
  // Optional: link to company
  companyId?: string;
}

export const DEFAULT_PERMISSIONS: Record<UserRole, PermissionsMap> = {
  admin: {
    dashboard: { view: true, create: true, edit: true, delete: true },
    customers: { view: true, create: true, edit: true, delete: true },
    jobs: { view: true, create: true, edit: true, delete: true },
    estimates: { view: true, create: true, edit: true, delete: true },
    invoices: { view: true, create: true, edit: true, delete: true },
    contracts: { view: true, create: true, edit: true, delete: true },
    map: { view: true, create: true, edit: true, delete: true },
    ai: { view: true, create: true, edit: true, delete: true },
    users: { view: true, create: true, edit: true, delete: true },
    settings: { view: true, create: true, edit: true, delete: true },
    billing: { view: true, create: true, edit: true, delete: true },
    measure: { view: true, create: true, edit: true, delete: true },
    platform: { view: true, create: true, edit: true, delete: true },
  },
  manager: {
    dashboard: { view: true, create: false, edit: false, delete: false },
    customers: { view: true, create: true, edit: true, delete: true },
    jobs: { view: true, create: true, edit: true, delete: true },
    estimates: { view: true, create: true, edit: true, delete: true },
    invoices: { view: true, create: true, edit: true, delete: false },
    contracts: { view: true, create: true, edit: true, delete: false },
    map: { view: true, create: false, edit: false, delete: false },
    ai: { view: true, create: true, edit: true, delete: false },
    users: { view: true, create: false, edit: false, delete: false },
    settings: { view: true, create: false, edit: false, delete: false },
    billing: { view: true, create: false, edit: false, delete: false },
    measure: { view: true, create: true, edit: true, delete: false },
    platform: { view: false, create: false, edit: false, delete: false },
  },
  crew: {
    dashboard: { view: true, create: false, edit: false, delete: false },
    customers: { view: true, create: false, edit: false, delete: false },
    jobs: { view: true, create: false, edit: true, delete: false },
    estimates: { view: true, create: false, edit: false, delete: false },
    invoices: { view: true, create: false, edit: false, delete: false },
    contracts: { view: true, create: false, edit: false, delete: false },
    map: { view: true, create: false, edit: false, delete: false },
    ai: { view: true, create: false, edit: false, delete: false },
    users: { view: false, create: false, edit: false, delete: false },
    settings: { view: false, create: false, edit: false, delete: false },
    billing: { view: false, create: false, edit: false, delete: false },
    measure: { view: true, create: false, edit: false, delete: false },
    platform: { view: false, create: false, edit: false, delete: false },
  },
  viewer: {
    dashboard: { view: true, create: false, edit: false, delete: false },
    customers: { view: true, create: false, edit: false, delete: false },
    jobs: { view: true, create: false, edit: false, delete: false },
    estimates: { view: true, create: false, edit: false, delete: false },
    invoices: { view: true, create: false, edit: false, delete: false },
    contracts: { view: true, create: false, edit: false, delete: false },
    map: { view: true, create: false, edit: false, delete: false },
    ai: { view: true, create: false, edit: false, delete: false },
    users: { view: false, create: false, edit: false, delete: false },
    settings: { view: false, create: false, edit: false, delete: false },
    billing: { view: false, create: false, edit: false, delete: false },
    measure: { view: true, create: false, edit: false, delete: false },
    platform: { view: false, create: false, edit: false, delete: false },
  },
  custom: {
    dashboard: { view: true, create: false, edit: false, delete: false },
    customers: { view: false, create: false, edit: false, delete: false },
    jobs: { view: false, create: false, edit: false, delete: false },
    estimates: { view: false, create: false, edit: false, delete: false },
    invoices: { view: false, create: false, edit: false, delete: false },
    contracts: { view: false, create: false, edit: false, delete: false },
    map: { view: false, create: false, edit: false, delete: false },
    ai: { view: false, create: false, edit: false, delete: false },
    users: { view: false, create: false, edit: false, delete: false },
    settings: { view: false, create: false, edit: false, delete: false },
    billing: { view: false, create: false, edit: false, delete: false },
    measure: { view: false, create: false, edit: false, delete: false },
    platform: { view: false, create: false, edit: false, delete: false },
  },
};
