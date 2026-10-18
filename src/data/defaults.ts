// src/data/defaults.ts
/**
 * Single source of truth for all global fallbacks, default copy, and site configurations.
 * Used when CMS content is empty or initializing.
 */

// =============================================================================
// 1. Brand & SEO Meta Defaults
// =============================================================================
export const DEFAULT_BRAND_TITLE = 'GWENVENNI';
export const DEFAULT_META_TITLE = 'Gwenvenni Luxury Atelier | 200-Needle Luxury B2B Wholesale';
export const DEFAULT_META_DESCRIPTION =
  'Specialized manufacturer of 200-needle luxury apparel, fine silks, cashmere, and seamless essentials. Low MOQ, rapid 48h swatch dispatch, and full OEM/ODM customization.';
export const DEFAULT_CONTACT_EMAIL = 'contact@gwenvenni.com';
export const DEFAULT_FALLBACK_IMAGE = '/images/hero-light.jpg';

// =============================================================================
// 2. Global Footer Defaults
// =============================================================================
export const DEFAULT_FOOTER_BIO =
  "Specialized manufacturer of 200-needle luxury apparel, fine silks, cashmere, and seamless second-skin essentials for global fashion labels.";
export const DEFAULT_STATUS_BADGE = 'Sample Room: 48h Global Dispatch Active';
export const DEFAULT_COPYRIGHT_TEXT = '© 2026 Gwenvenni Co., Ltd. All rights reserved.';

export const DEFAULT_FOOTER_COLUMNS = [
  {
    title: DEFAULT_BRAND_TITLE,
    links: [
      { label: 'Overview', url: '/' },
      { label: 'Signature Weave', url: '#hero' },
      { label: 'Technical Architecture', url: '#specs' },
      { label: 'Ready-to-Order Archive', url: '/products' },
    ],
  },
  {
    title: 'Product Lines',
    links: [
      { label: 'All Silhouettes Archive', url: '/products' },
      { label: 'Mulberry Silk Loafers', url: '/products' },
      { label: 'Ribbed Cashmere Crews', url: '/products' },
      { label: 'Seamless Essentials', url: '/products' },
    ],
  },
  {
    title: 'B2B Services',
    links: [
      { label: 'Wholesale Quote (RFQ)', url: '#inquiry' },
      { label: 'Custom Pantone Dyeing', url: '#manufacturing' },
      { label: 'Private Label Packaging', url: '#manufacturing' },
      { label: 'Rapid 72h Prototyping', url: '#manufacturing' },
    ],
  },
  {
    title: 'Certifications',
    links: [
      { label: 'OEKO-TEX Standard 100 Class I', url: '#specs' },
      { label: 'CPSIA Certified Safe', url: '#specs' },
      { label: 'GOTS Organic Cotton', url: '#specs' },
      { label: 'ISO 9001:2015', url: '#specs' },
    ],
  },
  {
    title: 'Direct Inquiries',
    links: [
      { label: 'Order Swatch Kit', url: '#inquiry' },
      { label: 'Request OEM Quote', url: '#inquiry' },
      { label: 'Factory Audit Tour', url: '#manufacturing' },
      { label: DEFAULT_CONTACT_EMAIL, url: `mailto:${DEFAULT_CONTACT_EMAIL}` },
    ],
  },
];

export const DEFAULT_LEGAL_LINKS = [
  { label: 'Privacy Policy', url: '#' },
  { label: 'Supply Agreement', url: '#' },
  { label: 'Export Compliance', url: '#' },
];

// =============================================================================
// 3. Homepage Sections Defaults
// =============================================================================

// Hero Section
export const DEFAULT_HERO = {
  superTitle: 'B2B Manufacturing & Private Label Atelier',
  headline: 'Engineered Elegance. 200-Needle Micro Weave.',
  subline:
    'Knitted on Italian Lonati machinery with 100% artisan hand-linked seamless toes. Built for modern private-label brands and luxury retail.',
  primaryButtonText: 'Request Swatch Kit',
  primaryButtonUrl: '#inquiry',
  secondaryButtonText: 'Explore Line Sheets',
  secondaryButtonUrl: '/products',
};

// Specification Matrix Section
export const DEFAULT_SPEC_MATRIX = {
  badge: 'Engineered Construction',
  title: 'Specification Matrix',
  description:
    'We treat the architectural construction of luxury knitwear with the exactitude of horology. Every seam, tension zone, and yarn twist is calibrated for zero friction.',
  macroImage: '/images/spec-light.jpg',
  primaryButtonUrl: '#inquiry',
  secondaryButtonText: 'Download B2B Line Sheet (PDF)',
  secondaryButtonUrl: '#inquiry',
  bento1Tag: 'Yarn Architecture',
  bento1Title: '60s/2 Double-Ply Combed Cotton.',
  bento1Description:
    'Ultra-long staple combed fibers spun for anti-pilling longevity (Grade 4.5) and a breathable, second-skin handfeel across 50+ wash cycles.',
  bento2Tag: 'Toe Closure',
  bento2Stat: '0',
  bento2Unit: 'mm',
  bento2Title: 'Hand-Linked Seamless',
  bento2Description:
    'Individual loop-by-loop manual interlocking eliminates interior ridges for zero pressure on toes.',
  bento2BadgeText: 'OEKO-TEX® 100 Class I',
  bento2BadgeStatus: 'Certified Safe',
  bento3Tag: 'Machine Gauge',
  bento3Stat: '200',
  bento3Unit: 'N',
  bento3Title: 'Lonati Cylinders',
  bento3Description:
    'Italian high-density circular knit delivering refined micro-rib clarity with zero distortion.',
  bento3FooterNote: 'Tolerance: ±0.5% Needle Pitch',
  bento4Tag: 'Color Fastness',
  bento4Stat: 'Grade 4+',
  bento4Unit: 'Wash',
  bento4Title: 'Low-Impact Eco Dyes.',
  bento4Description:
    'Custom pantone formulation with non-toxic reactive dyes ensuring Grade 4+ wash fastness without bleeding.',
  bento4FooterNote: 'OEKO-TEX & REACH Compliant',
  bento5Tag: 'Quality Control',
  bento5Stat: '100',
  bento5Unit: '%',
  bento5Title: 'Optical Inspection',
  bento5Description:
    'Automated camera inspection pairs with artisan hand-stretching checks for a zero-defect guarantee.',
  bento5FooterNote: 'Zero-Defect Standard',
};

// Manufacturing Capabilities Section
export const DEFAULT_MANUFACTURING = {
  badge: 'OEM / ODM & Private Label',
  headline: 'Vertical Knitting Infrastructure',
  subline:
    'From spinning fiber selection to finished packaging, our smart manufacturing line delivers bespoke apparel solutions with rapid prototyping and global export compliance.',
  capabilities: [
    {
      title: '350+ Lonati Cylinders',
      description:
        'State-of-the-art Italian single and double cylinder electronic machines capable of 96N to 200N gauge high-density knitting.',
    },
    {
      title: '72h Sample Prototyping',
      description:
        'CAD digital patterning to custom physical sample dispatched within 72 hours with yarn lab dip verification.',
    },
    {
      title: 'Full Private Labeling',
      description:
        'Jacquard logos, micro embroidery, silicone sole grippers, custom Pantone dyeing, and FSC certified retail packaging.',
    },
    {
      title: 'Zero-Defect Audit',
      description:
        '100% optical camera inspection and manual hand stretch testing. Fully Sedex, BSCI, and ISO9001 compliant.',
    },
  ],
};

// Swatch Inquiry Section
export const DEFAULT_SWATCH_INQUIRY = {
  badge: 'B2B Sample Room',
  headline: 'Request Your Curated Swatch Kit',
  subline:
    'Feel the micron-level hand feel in person. Verified fashion labels, buying offices, and independent designers receive curated swatch books dispatched within 48 hours.',
  buttonText: 'Request Swatch Kit',
  categories: ['Double Ruffle Lace', 'Mulberry Silk', 'Cashmere-Silk', 'Seamless Essentials'],
};

// Collections Showcase Section
export const DEFAULT_COLLECTIONS = {
  badge: 'Capsule Catalog 2026',
  title: 'Ready-to-Order Line Sheets',
  subtitle:
    'Proprietary silhouettes developed for white-labeling, brand customization, and low-MOQ rapid wholesale reordering.',
  cardDetailsButtonText: 'View Gallery & Specs',
  cardQuoteButtonText: 'Quote',
};

// =============================================================================
// 4. B2B RFQ & Quote Basket Defaults
// =============================================================================
export const DEFAULT_RFQ = {
  btnSampleAmazonText: 'Order Sample on Amazon',
  defaultAmazonStoreUrl: 'https://www.amazon.com',
  btnAddToQuoteText: 'Add to Quote Basket',
  cardQuoteBtnText: 'Quote',
  heroSwatchBtnText: 'Request Swatch Kit',
  drawerSubmitButtonText: 'Submit Request for Quote',

  drawerTitle: 'Quote Basket',
  drawerSubtitle: 'Wholesale RFQ & Sample Dispatch',
  drawerStatus: '48h Express Dispatch',
  drawerEmptyTitle: 'Your Quote Basket is empty',
  drawerEmptyDesc:
    'Browse our ready-to-order capsule lines and add styles to request formal wholesale quotes, custom branding, and physical samples.',

  swatchKitSku: 'SWATCH-KIT',
  swatchKitTitle: 'Curated Swatch Kit & Fabric Color Book',
  swatchKitDesc: 'Physical fabric swatches & yarn color dossier via DHL Express',
  swatchKitImageUrl: '/images/spec-light.jpg',
  swatchKitMoq: '1 Set (Priority Dispatch)',

  drawerSuccessMessage:
    '✓ Quote request received! Our B2B specialist will reply with official wholesale quotation and PI within 24 hours.',
  drawerErrorMessage: 'Submission failed. Please check your connection and try again.',
};

// =============================================================================
// 5. Catalog Hall Page (/products) Defaults
// =============================================================================
export const DEFAULT_CATALOG = {
  badgeText: 'B2B Production Archive · 2026 Ready-To-Order',
  title: 'Product Catalog & Line Sheets',
  subtitle:
    'Select proprietary silhouettes engineered for white-label branding, customized colorways, and rapid low-MOQ reordering.',
  metaTitle: 'Complete Product Archive & Line Sheets | Gwenvenni B2B Atelier',
  metaDescription:
    'Explore our full ready-to-order capsule silhouettes, technical knit compositions, and low-MOQ rapid wholesale reordering archive.',
  searchPlaceholder: 'Search silhouette, SKU...',
  allSilhouettesLabel: 'All Silhouettes',
  endOfCatalogText: 'End of Catalog · All Products Loaded',
  emptyStateHeading: 'No matching silhouettes found',
  emptyStateText:
    "We couldn't find any products matching your current filters. Try searching for other fiber blends or reset categories.",
  fallbackCategories: [
    { id: 'silk', label: 'Mulberry Silk' },
    { id: 'cashmere', label: 'Cashmere & Wool' },
    { id: 'sheer', label: 'Sheer & Tights' },
    { id: 'cotton', label: 'Combed Cotton' },
    { id: 'terry', label: 'Terry & Athletic' },
  ],
};

// =============================================================================
// 6. Product Detail Page (/products/[slug]) Defaults
// =============================================================================
export const DEFAULT_PRODUCT_DETAIL = {
  galleryHint: 'Click thumbnails or use arrows to inspect fabric weave, tactile finish, and construction details.',
  statusBadge: 'Active Production Ready',
  priceNote: '* Customs, freight, and custom branded packaging quoted upon destination.',
  paletteTitle: 'Available In-Stock Yarn Palette:',
  supportBadge: 'Full Private Label Support',
  specsBadge: 'Factory Quality Standard',
  specsHeading: 'Technical Specifications & Construction',
  fallbackMoq: '200 Units',
  fallbackVariant: 'Standard Spec',
};

