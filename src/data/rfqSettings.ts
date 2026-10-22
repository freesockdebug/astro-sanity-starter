import { client } from '@utils/sanity-client';
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

/**
 * Service class managing B2B RFQ settings, caching, and button visibility policies
 */
export class RfqSettingsService {
  private static cachedSettings: RfqSettings | null = null;
  private static cacheTimestamp: number = 0;
  private static inflightPromise: Promise<RfqSettings> | null = null;
  private static readonly CACHE_TTL_MS = 10_000; // 10s in-memory cache for SSR request deduplication

  /**
   * Fetches merged RFQ settings with in-memory caching to prevent duplicate Sanity calls in one page render
   */
  public static seed(settings?: any): void {
    this.cachedSettings = settings && typeof settings === 'object'
      ? { ...DEFAULT_RFQ_SETTINGS, ...settings }
      : { ...DEFAULT_RFQ_SETTINGS };
    this.cacheTimestamp = Date.now();
  }

  public static async getSettings(forceRefresh = false): Promise<RfqSettings> {
    const now = Date.now();
    if (!forceRefresh && this.cachedSettings && (now - this.cacheTimestamp < this.CACHE_TTL_MS)) {
      return this.cachedSettings;
    }

    if (!forceRefresh && this.inflightPromise) {
      return this.inflightPromise;
    }

    this.inflightPromise = (async () => {
      try {
        const directDoc = await client.fetch<any>('*[_type == "rfqSettings"][0]');
        if (directDoc && Object.keys(directDoc).length > 2) {
          this.cachedSettings = { ...DEFAULT_RFQ_SETTINGS, ...directDoc };
          this.cacheTimestamp = Date.now();
          return this.cachedSettings;
        }
      } catch (e: any) {
        console.warn("RfqSettingsService.getSettings fallback to defaults:", e?.message);
      } finally {
        this.inflightPromise = null;
      }

      this.cachedSettings = { ...DEFAULT_RFQ_SETTINGS };
      this.cacheTimestamp = Date.now();
      return this.cachedSettings;
    })();

    return this.inflightPromise;
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
    this.cachedSettings = null;
    this.cacheTimestamp = 0;
  }
}

// Backward-compatible function exports
export const fetchRfqSettings = (forceRefresh?: boolean) => RfqSettingsService.getSettings(forceRefresh);
