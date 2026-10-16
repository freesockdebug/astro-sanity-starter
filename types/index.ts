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
    quantity?: string;
    price?: string;
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

export interface Product {
    _id: string;
    title: string;
    shortTitle?: string;
    slug: string;
    sku?: string;
    tagline?: string;
    statusBadge?: string;
    supportBadge?: string;
    specsHeading?: string;
    specsBadge?: string;
    galleryHint?: string;
    priceNote?: string;
    paletteTitle?: string;
    addToQuoteButtonText?: string;
    amazonAsin?: string;
    amazonUrl?: string;
    sampleButtonText?: string;
    primaryButtonText?: string;
    secondaryButtonText?: string;
    moq?: string;
    leadTime?: string;
    mainImage?: string;
    gallery?: GalleryItem[];
    colors?: ColorVariant[];
    pricingTiers?: PricingTier[];
    specifications?: ProductSpecification[];
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
}

export interface BuyerInfo {
    company: string;
    name?: string;
    email: string;
    whatsapp?: string;
    destination?: string;
    message?: string;
}

