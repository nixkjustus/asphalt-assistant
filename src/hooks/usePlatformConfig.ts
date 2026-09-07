import { useState, useEffect, useCallback } from 'react';

export interface PlatformStripeConfig {
  paymentLink?: string;
  publishableKey?: string;
  priceId?: string;
  customerPortalLink?: string;
  updatedAt?: string;
  updatedBy?: string;
}

const PLATFORM_KEY = 'bg_platform_stripe';

function loadPlatform(): PlatformStripeConfig | null {
  try {
    const raw = localStorage.getItem(PLATFORM_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function savePlatform(config: PlatformStripeConfig) {
  try {
    localStorage.setItem(PLATFORM_KEY, JSON.stringify({ ...config, updatedAt: new Date().toISOString() }));
  } catch (e) {
    console.warn('Failed to save platform config', e);
  }
}

async function cloudLoadPlatform(): Promise<PlatformStripeConfig | null> {
  try {
    if (!navigator.onLine) return null;
    const res = await fetch('/.netlify/functions/platform-config', { method: 'GET' });
    if (!res.ok) return null;
    const json = await res.json();
    return json.config || null;
  } catch { return null; }
}

async function cloudSavePlatform(config: PlatformStripeConfig): Promise<boolean> {
  try {
    if (!navigator.onLine) return false;
    const res = await fetch('/.netlify/functions/platform-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return res.ok;
  } catch { return false; }
}

export function usePlatformConfig() {
  const [config, setConfig] = useState<PlatformStripeConfig | null>(() => {
    if (typeof window === 'undefined') return null;
    return loadPlatform();
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const local = loadPlatform();
      // Try cloud global config - this is shared across ALL companies/devices
      if (navigator.onLine) {
        try {
          const cloud = await cloudLoadPlatform();
          if (cloud && (cloud.paymentLink || cloud.priceId)) {
            // Cloud has real config, use it (overrides local if newer or local empty)
            const isLocalEmpty = !local || (!local.paymentLink && !local.priceId);
            const cloudHasData = !!(cloud.paymentLink || cloud.priceId);
            if (cloudHasData && (isLocalEmpty || (cloud.updatedAt && local?.updatedAt && cloud.updatedAt > local.updatedAt))) {
              console.log('☁️ Loaded platform Stripe config from cloud (global, shared by all companies)');
              setConfig(cloud);
              savePlatform(cloud);
              setLoading(false);
              return;
            }
            if (isLocalEmpty && cloudHasData) {
              setConfig(cloud);
              savePlatform(cloud);
            }
          }
        } catch (e) {
          console.warn('Cloud platform config load failed', e);
        }
      }
      setConfig(local);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!loading && config) {
      savePlatform(config);
      // Also sync to cloud global store so ALL white-label companies get it
      if (navigator.onLine && (config.paymentLink || config.priceId)) {
        cloudSavePlatform(config).then(ok => {
          if (ok) console.log('✅ Platform Stripe config synced to cloud (global for all companies)');
        });
      }
    }
  }, [config, loading]);

  const updateConfig = useCallback((patch: Partial<PlatformStripeConfig>) => {
    setConfig(prev => ({ ...(prev || {}), ...patch }));
  }, []);

  const setFullConfig = useCallback((newConfig: PlatformStripeConfig) => {
    setConfig(newConfig);
  }, []);

  const clearConfig = useCallback(() => {
    setConfig(null);
    try { localStorage.removeItem(PLATFORM_KEY); } catch {}
    // Note: we don't clear cloud on purpose - keeps global config
  }, []);

  return {
    config,
    loading,
    updateConfig,
    setFullConfig,
    clearConfig,
    hasRealStripe: !!(config?.paymentLink || (config?.publishableKey && config?.priceId)),
  };
}
