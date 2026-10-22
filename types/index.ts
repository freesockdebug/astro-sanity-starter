export interface Action {
    _type?: string;
    label: string;
    url?: string;
    ariaLabel?: string;
}

export interface ActionButton extends Action {
    theme?: 'primary' | 'secondary' | 'accent' | 'neutral';
}

export interface ActionLink extends Action {}

export interface CustomImage {
    _id?: string;
    src: string;
    alt?: string;
    dimensions?: { height: number; width: number };
}

export interface Footer {
    text?: string;
    description?: string;
    statusBadge?: string;
    columns?: Array<{
        title: string;
        links: Array<{ label: string; url: string }>;
    }>;
}

export interface Header {
    title?: string;
    subtitle?: string;
    logo?: CustomImage;
    showActionButton?: boolean;
    navLinks?: Array<ActionButton | ActionLink>;
}

export interface Slug {
    current: string;
}

export interface Page {
    _id: string;
    slug: Slug;
    title: string;
    sections: Array<any>;
    metaTitle?: string;
    addTitleSuffix?: boolean;
    metaDescription?: string;
    socialImage?: CustomImage;
}

export interface ProductSpecification {
    label?: string;
    value?: string;
}

export interface PricingTier {
    range?: string;
    quantity?: string;
    price?: string;
    unit?: string;
}

export interface ColorVariant {
    name?: string;
    hex?: string;
    pantone?: string;
}

export interface GalleryItem {
    _id?: string;
    src: string;
    alt?: string;
    caption?: string;
}

export interface ProductCategory {
    _id: string;
    title: string;
    slug: string;
    description?: string;
    order?: number;
}

export interface Product {
    _id: string;
    title: string | Record<string, string>;
    shortTitle?: string | Record<string, string>;
    slug: string;
    sku?: string;
    currency?: string;
    tagline?: string | Record<string, string>;
    statusBadge?: string | Record<string, string>;
    supportBadge?: string | Record<string, string>;
    specsHeading?: string | Record<string, string>;
    specsBadge?: string | Record<string, string>;
    galleryHint?: string | Record<string, string>;
    priceNote?: string | Record<string, string>;
    paletteTitle?: string | Record<string, string>;
    addToQuoteButtonText?: string | Record<string, string>;
    amazonAsin?: string;
    amazonUrl?: string;
    sampleButtonText?: string | Record<string, string>;
    primaryButtonText?: string | Record<string, string>;
    secondaryButtonText?: string | Record<string, string>;
    moq?: string;
    leadTime?: string;
    category?: ProductCategory | string;
    mainImage?: string;
    gallery?: GalleryItem[];
    colors?: ColorVariant[];
    pricingTiers?: PricingTier[];
    specifications?: ProductSpecification[];
}

export interface CatalogSettings {
    badgeText?: string;
    title?: string;
    subtitle?: string;
    metaTitle?: string;
    metaDescription?: string;
    searchPlaceholder?: string;
    allSilhouettesLabel?: string;
    endOfCatalogText?: string;
    emptyStateHeading?: string;
    emptyStateText?: string;
}

export interface RfqSettings {
    showSwatchKitButton?: boolean;
    showNavActionButton?: boolean;
    showHeroPrimaryButton?: boolean;
    showHeroSecondaryButton?: boolean;
    showSpecsPrimaryButton?: boolean;
    showSpecsSecondaryButton?: boolean;
    showCollectionsHeaderButton?: boolean;
    showCardQuoteButton?: boolean;
    showManufacturingActionButton?: boolean;
    showInquirySection?: boolean;
    showInquirySectionButton?: boolean;
    showProductBuySampleButton?: boolean;
    showProductAddToQuoteButton?: boolean;
    showProductSpecSheetButton?: boolean;

    btnSampleAmazonText?: string;
    defaultAmazonStoreUrl?: string;
    btnAddToQuoteText?: string;
    cardQuoteBtnText?: string;
    heroSwatchBtnText?: string;
    drawerSubmitButtonText?: string;

    drawerTitle?: string;
    drawerSubtitle?: string;
    drawerStatus?: string;
    drawerEmptyTitle?: string;
    drawerEmptyDesc?: string;

    swatchKitSku?: string;
    swatchKitTitle?: string;
    swatchKitDesc?: string;
    swatchKitOptions?: Array<{
        sku: string;
        title: string;
        desc?: string;
        moq?: string;
    }>;
    swatchKitImageUrl?: string;
    swatchKitMoq?: string;
    swatchKitImage?: {
        asset?: {
            url?: string;
        };
    };

    drawerSuccessMessage?: string;
    drawerErrorMessage?: string;
}

export interface SiteConfig {
    _id?: string;
    favicon?: CustomImage;
    header?: Header;
    footer?: Footer;
    titleSuffix?: string;
    rfqConfig?: RfqSettings;
    enableImageProxy?: boolean;
    edgeCacheTtl?: number;

    // Widget 1: WhatsApp Click-to-Chat Widget
    enableWhatsApp?: boolean;
    whatsAppNumber?: string;
    whatsAppPrefillText?: string;
    whatsAppTooltip?: string;


    // Widget 4: Instant Quote/Sample Notification Webhook
    enableNotificationWebhook?: boolean;
    notificationWebhookUrl?: string;
    notificationRecipientEmail?: string;
}

export interface BuyerInfo {
    company: string;
    name?: string;
    email: string;
    whatsapp?: string;
    destination?: string;
    message?: string;
}

