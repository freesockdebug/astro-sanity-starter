import { client } from '@utils/sanity-client';
import { createSwrCache } from '@utils/cache';
import { DEFAULT_RFQ } from './defaults';
import type { RfqSettings } from 'types';

export const DEFAULT_RFQ_SETTINGS: Required<Omit<RfqSettings, 'swatchKitImage'>> = {
  // Global Visibility Toggles
  showSwatchKitButton: true,
  showNavActionButton: false,
  showHeroPrimaryButton: false,
  showHeroSecondaryButton: true,
  showSpecsPrimaryButton: false,
  showSpecsSecondaryButton: true,
  showCollectionsHeaderButton: false,
  showCardQuoteButton: true,
  showManufacturingActionButton: false,
  showInquirySection: true,
  showInquirySectionButton: true,
  showProductBuySampleButton: true,
  showProductAddToQuoteButton: true,
  showProductSpecSheetButton: true,

  // Buttons, Drawer, Swatch, and Feedback defaults from centralized defaults.ts
  ...DEFAULT_RFQ,
};

export interface ButtonVisibilityOptions {
  propOverride?: boolean;
  settingOverride?: boolean;
  isSwatchAction?: boolean;
  globalSwatchSetting?: boolean;
  buttonText?: string;
}

const rfqCache = createSwrCache<RfqSettings>(
  async () => {
    const directDoc = await client.fetch<any>('*[_type == "rfqSettings"][0]');
    if (directDoc && Object.keys(directDoc).length > 2) {
      return { ...DEFAULT_RFQ_SETTINGS, ...directDoc };
    }
    return { ...DEFAULT_RFQ_SETTINGS };
  },
  { ...DEFAULT_RFQ_SETTINGS },
  10_000
);

/**
 * Service class managing B2B RFQ settings, caching, and button visibility policies
 */
export class RfqSettingsService {
  /**
   * Fetches merged RFQ settings with in-memory caching to prevent duplicate Sanity calls in one page render
   */
  public static seed(settings?: any): void {
    const merged: RfqSettings = settings && typeof settings === 'object'
      ? { ...DEFAULT_RFQ_SETTINGS, ...settings }
      : { ...DEFAULT_RFQ_SETTINGS };
    rfqCache.seed(merged);
  }

  public static async getSettings(forceRefresh = false): Promise<RfqSettings> {
    return rfqCache.get(forceRefresh);
  }

  /**
   * Centralized button visibility policy to eliminate repetitive 8-line ternary checks
   */
  public static isButtonVisible(options: ButtonVisibilityOptions): boolean {
    const {
      propOverride,
      settingOverride,
      isSwatchAction = false,
      globalSwatchSetting = true,
      buttonText = ''
    } = options;

    const hasText = Boolean(buttonText?.trim());
    if (!hasText) return false;

    // 1. Explicit prop passed to component takes highest priority
    if (propOverride !== undefined) {
      return Boolean(propOverride);
    }

    // 2. Specific section setting in RFQ Settings
    if (settingOverride !== undefined) {
      return Boolean(settingOverride);
    }

    // 3. Fallback based on whether this is a swatch trigger
    if (isSwatchAction) {
      return Boolean(globalSwatchSetting);
    }

    return true;
  }

  /**
   * Clears cache
   */
  public static invalidateCache(): void {
    rfqCache.invalidate();
  }
}

// Backward-compatible function exports
export const fetchRfqSettings = (forceRefresh?: boolean) => RfqSettingsService.getSettings(forceRefresh);
