import { useState, useEffect, useCallback } from 'react';
import type { Subscription } from '../types';
import { SUBSCRIPTION_PLAN } from '../types';
import { v4 as uuidv4 } from 'uuid';

const SUB_KEY = 'bg_subscription';

function loadSub(): Subscription | null {
  try {
    const raw = localStorage.getItem(SUB_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveSub(sub: Subscription) {
  try {
    localStorage.setItem(SUB_KEY, JSON.stringify(sub));
  } catch (e) {
    console.warn('Failed to save subscription', e);
  }
}

function daysBetween(a: Date, b: Date): number {
  const diff = b.getTime() - a.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function useSubscription(companyName?: string) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const existing = loadSub();
    if (existing) {
      setSubscription(existing);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (subscription && !loading) {
      saveSub(subscription);
    }
  }, [subscription, loading]);

  const startTrial = useCallback((companyNameOverride?: string) => {
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + SUBSCRIPTION_PLAN.trialDays);

    const newSub: Subscription = {
      id: uuidv4(),
      companyName: companyNameOverride || companyName || 'Your Company',
      status: 'trial',
      plan: 'yearly',
      price: SUBSCRIPTION_PLAN.price,
      currency: SUBSCRIPTION_PLAN.currency,
      trialStart: now.toISOString(),
      trialEnd: trialEnd.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    setSubscription(newSub);
    return newSub;
  }, [companyName]);

  const activateSubscription = useCallback((paymentMethod?: { last4: string; brand: string; expMonth: number; expYear: number }) => {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    setSubscription(prev => {
      if (!prev) {
        const newSub: Subscription = {
          id: uuidv4(),
          companyName: companyName || 'Your Company',
          status: 'active',
          plan: 'yearly',
          price: SUBSCRIPTION_PLAN.price,
          currency: SUBSCRIPTION_PLAN.currency,
          trialStart: now.toISOString(),
          trialEnd: now.toISOString(),
          currentPeriodStart: now.toISOString(),
          currentPeriodEnd: periodEnd.toISOString(),
          paymentMethod,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };
        return newSub;
      }
      return {
        ...prev,
        status: 'active',
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
        paymentMethod: paymentMethod || prev.paymentMethod,
        isLifetime: false,
        updatedAt: now.toISOString(),
      };
    });
  }, [companyName]);

  const activateLifetime = useCallback((reason?: string) => {
    const now = new Date();
    const farFuture = new Date('2099-12-31T23:59:59Z');
    setSubscription(prev => {
      const base: Subscription = prev || {
        id: uuidv4(),
        companyName: companyName || 'Your Company',
        status: 'active',
        plan: 'yearly',
        price: 0,
        currency: 'USD',
        trialStart: now.toISOString(),
        trialEnd: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      return {
        ...base,
        status: 'active',
        isLifetime: true,
        price: 0,
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: farFuture.toISOString(),
        paymentMethod: {
          last4: 'LIFE',
          brand: reason ? reason.slice(0, 20) : 'Lifetime Owner',
          expMonth: 12,
          expYear: 2099,
        },
        updatedAt: now.toISOString(),
      };
    });
  }, [companyName]);

  const cancelSubscription = useCallback(() => {
    setSubscription(prev => {
      if (!prev) return prev;
      if (prev.isLifetime) return prev; // Cannot cancel lifetime
      return { ...prev, status: 'canceled', cancelAtPeriodEnd: true, updatedAt: new Date().toISOString() };
    });
  }, []);

  const reactivateSubscription = useCallback(() => {
    setSubscription(prev => prev ? { ...prev, status: 'active', cancelAtPeriodEnd: false, updatedAt: new Date().toISOString() } : prev);
  }, []);

  const now = new Date();
  const trialEndDate = subscription ? new Date(subscription.trialEnd) : null;
  const periodEndDate = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;

  const daysLeftInTrial = trialEndDate ? daysBetween(now, trialEndDate) : 0;
  const isTrial = subscription?.status === 'trial' && !subscription?.isLifetime;
  const isActive = subscription?.status === 'active';
  const isLifetime = !!subscription?.isLifetime;
  
  const isExpired = (() => {
    if (!subscription) return true;
    if (isLifetime) return false; // Lifetime never expires
    if (subscription.status === 'trial') {
      return now > trialEndDate!;
    }
    if (subscription.status === 'active') {
      if (periodEndDate) return now > periodEndDate;
      return false;
    }
    return subscription.status === 'expired' || subscription.status === 'canceled';
  })();

  const isTrialExpired = isTrial && daysLeftInTrial <= 0;
  const shouldBlockAccess = (() => {
    if (!subscription) return false;
    if (isLifetime) return false;
    if (isActive) return false;
    if (isTrial && daysLeftInTrial > 0) return false;
    return true;
  })();

  const trialProgress = isTrial ? Math.max(0, Math.min(100, ((SUBSCRIPTION_PLAN.trialDays - Math.max(0, daysLeftInTrial)) / SUBSCRIPTION_PLAN.trialDays) * 100)) : 0;

  return {
    subscription,
    loading,
    isTrial,
    isActive,
    isLifetime,
    isExpired,
    isTrialExpired,
    shouldBlockAccess,
    daysLeftInTrial,
    trialProgress,
    startTrial,
    activateSubscription,
    activateLifetime,
    cancelSubscription,
    reactivateSubscription,
    plan: SUBSCRIPTION_PLAN,
  };
}
