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

export interface SiteConfig {
    _id?: string;
    favicon?: CustomImage;
    header?: Header;
    footer?: Footer;
    titleSuffix?: string;
    rfqConfig?: any;
}

