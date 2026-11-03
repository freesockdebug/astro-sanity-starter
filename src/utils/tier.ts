// src/utils/tier.ts
// Single Source of Truth for B2B Buyer Tier Configuration & Styling

export type BuyerTier = 'VIP' | 'PARTNER' | 'STANDARD';

export interface TierStyleConfig {
  bg: string;
  badgeBg: string;
  label: string;
  shortLabel: string;
}

export const TIER_CONFIGS: Record<BuyerTier, TierStyleConfig> = {
  VIP: {
    bg: 'bg-amber-100 text-amber-900 border-amber-300',
    badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
    label: 'VIP Buyer',
    shortLabel: 'VIP',
  },
  PARTNER: {
    bg: 'bg-purple-100 text-purple-900 border-purple-300',
    badgeBg: 'bg-purple-50 text-purple-800 border-purple-200',
    label: 'Atelier Partner',
    shortLabel: 'Partner',
  },
  STANDARD: {
    bg: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    badgeBg: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    label: 'Standard',
    shortLabel: 'Standard',
  },
};

export function getTierConfig(tier?: string | null): TierStyleConfig {
  const normalized = (tier || 'STANDARD').toUpperCase() as BuyerTier;
  return TIER_CONFIGS[normalized] || TIER_CONFIGS.STANDARD;
}

