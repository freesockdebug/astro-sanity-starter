import { client } from '@utils/sanity-client';

export const DEFAULT_RFQ_SETTINGS = {
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

  // Buttons & Links
  btnSampleAmazonText: "Order Sample on Amazon",
  defaultAmazonStoreUrl: "https://www.amazon.com",
  btnAddToQuoteText: "Add to Quote Basket",
  cardQuoteBtnText: "Quote",
  heroSwatchBtnText: "Request Swatch Kit",
  drawerSubmitButtonText: "Submit Request for Quote",

  // Drawer
  drawerTitle: "Quote Basket",
  drawerSubtitle: "Wholesale RFQ & Sample Dispatch",
  drawerStatus: "48h Express Dispatch",
  drawerEmptyTitle: "Your Quote Basket is empty",
  drawerEmptyDesc: "Browse our ready-to-order capsule lines and add styles to request formal wholesale quotes, custom branding, and physical samples.",

  // Swatch
  swatchKitTitle: "Curated Hosiery Swatch Kit & Color Book",
  swatchKitDesc: "Physical fabric swatches & yarn color dossier via DHL Express",

  // Feedback
  drawerSuccessMessage: "✓ Quote request received! Our B2B specialist will reply with official wholesale quotation and PI within 24 hours.",
  drawerErrorMessage: "Submission failed. Please check your connection and try again."
};

export async function fetchRfqSettings() {
  try {
    const directDoc = await client.fetch('*[_type == "rfqSettings"][0]');
    if (directDoc && Object.keys(directDoc).length > 2) {
      return { ...DEFAULT_RFQ_SETTINGS, ...directDoc };
    }
    const siteConfig = await client.fetch('*[_type == "siteConfig"][0]{ rfqConfig }');
    if (siteConfig?.rfqConfig) {
      return { ...DEFAULT_RFQ_SETTINGS, ...siteConfig.rfqConfig };
    }
  } catch (e) {
    console.warn("fetchRfqSettings fallback to defaults:", e);
  }
  return DEFAULT_RFQ_SETTINGS;
}
