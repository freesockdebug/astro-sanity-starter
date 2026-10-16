// src/data/products.js
import { client } from '@utils/sanity-client';

export const PRODUCT_FIELDS = `{
  _id,
  title,
  shortTitle,
  statusBadge,
  supportBadge,
  specsHeading,
  specsBadge,
  galleryHint,
  priceNote,
  paletteTitle,
  addToQuoteButtonText,
  amazonAsin,
  amazonUrl,
  sampleButtonText,
  primaryButtonText,
  secondaryButtonText,
  "slug": slug.current,
  sku,
  tagline,
  moq,
  leadTime,
  featured,
  "mainImage": mainImage.asset->url,
  "gallery": gallery[] {
    "_id": asset->_id,
    "src": asset->url,
    "alt": alt,
    "caption": caption
  },
  colors,
  pricingTiers,
  specifications
}`;

export async function fetchAllProducts() {
  try {
    const data = await client.fetch(`*[_type == "product"] | order(_createdAt asc) ${PRODUCT_FIELDS}`);
    return data || [];
  } catch (err) {
    console.error('Failed to fetch products from Sanity:', err.message);
    return [];
  }
}

export async function fetchProductBySlug(slug) {
  try {
    const data = await client.fetch(`*[_type == "product" && slug.current == $slug][0] ${PRODUCT_FIELDS}`, { slug });
    return data;
  } catch (err) {
    console.error(`Failed to fetch product ${slug} from Sanity:`, err.message);
    return null;
  }
}
