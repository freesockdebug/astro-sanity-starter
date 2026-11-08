// src/utils/tier.ts
// Single Source of Truth for B2B Buyer Tier Configuration & Styling

export type BuyerTier = 'VIP' | 'PARTNER' | 'STANDARD' | string;

export interface TierStyleConfig {
  bg: string;
  badgeBg: string;
  label: string;
  shortLabel: string;
}

export const TIER_CONFIGS: Record<string, TierStyleConfig> = {
  VIP: {
    bg: 'bg-purple-100 text-purple-900 border-purple-300',
    badgeBg: 'bg-purple-50 text-purple-800 border-purple-200',
    label: 'VIP Commercial',
    shortLabel: 'VIP',
  },
  PARTNER: {
    bg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    label: 'Strategic Partner',
    shortLabel: 'Partner',
  },
  DISTRIBUTOR: {
    bg: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    badgeBg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    label: 'Regional Distributor',
    shortLabel: 'Distributor',
  },
  STANDARD: {
    bg: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    badgeBg: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    label: 'Standard Buyer',
    shortLabel: 'Standard',
  },
};

export function getTierConfig(tier?: string | null): TierStyleConfig {
  const normalized = (tier || 'STANDARD').toUpperCase();
  if (TIER_CONFIGS[normalized]) return TIER_CONFIGS[normalized];

  return {
    bg: 'bg-blue-100 text-blue-900 border-blue-300',
    badgeBg: 'bg-blue-50 text-blue-800 border-blue-200',
    label: normalized,
    shortLabel: normalized,
  };
}

