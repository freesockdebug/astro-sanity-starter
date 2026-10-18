import { SanityImageService } from '@utils/image';

export const IMAGE = `{
  "_id": asset->_id,
  "src": asset->url,
  "alt": alt
}`;

export const SECTIONS = `{
  ...,
  _type in ["heroSection", "hosieryHeroSection"] => {
    ...,
    "heroImage": heroImage.asset->url
  },
  _type in ["featureMatrixSection", "hosierySpecSection"] => {
    ...,
    "macroImage": macroImage.asset->url
  },
  _type in ["productShowcaseSection", "hosieryCollectionSection"] => {
    ...,
    products[]->{
      title,
      shortTitle,
      "slug": slug.current,
      tagline,
      moq,
      leadTime,
      "mainImage": mainImage.asset->url,
      "gallery": gallery[]{
        "src": asset->url,
        "alt": alt,
        "caption": caption
      },
      colors,
      pricingTiers,
      specifications
    }
  },
  _type == "customSection" => {
    ...,
    blocks[]{
      ...,
      _type == "mediaBlock" => {
        ...,
        "image": image.asset->url,
        "secondaryImage": secondaryImage.asset->url
      },
      _type == "bentoCardBlock" => {
        ...,
        cards[]{
          ...,
          "image": image.asset->url
        }
      },
      _type == "quoteBlock" => {
        ...,
        "avatar": avatar.asset->url
      }
    }
  }
}`;

/**
 * Universal Section Normalizer:
 * Enforces high-cohesion, centralized image optimization and edge proxy routing across all CMS section blocks.
 */
export function normalizeSections(sections: any[] = []): any[] {
  if (!Array.isArray(sections)) return [];

  return sections.map((section) => {
    if (!section || typeof section !== 'object') return section;
    const s = { ...section };

    // 1. Hero Sections (1600px High-Res Banner)
    if ((s._type === 'heroSection' || s._type === 'hosieryHeroSection') && s.heroImage) {
      s.heroImage = SanityImageService.hero(s.heroImage, 1600);
    }

    // 2. Technical Matrix / Specs Sections (1200px Macro Detail)
    if ((s._type === 'featureMatrixSection' || s._type === 'hosierySpecSection') && s.macroImage) {
      s.macroImage = SanityImageService.macro(s.macroImage, 1200);
    }

    // 3. Product Showcase / Collections Sections
    if ((s._type === 'productShowcaseSection' || s._type === 'hosieryCollectionSection') && Array.isArray(s.products)) {
      s.products = s.products.map((p: any) => {
        if (!p) return p;
        const mainImg = p.mainImage || (p.gallery && p.gallery[0]?.src);
        return {
          ...p,
          mainImage: mainImg ? SanityImageService.thumbnail(mainImg, 700) : p.mainImage,
          gallery: Array.isArray(p.gallery)
            ? p.gallery.map((g: any) => ({
                ...g,
                src: g?.src ? SanityImageService.thumbnail(g.src, 700) : g?.src,
              }))
            : p.gallery,
        };
      });
    }

    // 4. Custom Bento / Modular Sections
    if (s._type === 'customSection' && Array.isArray(s.blocks)) {
      s.blocks = s.blocks.map((b: any) => {
        if (!b) return b;
        const block = { ...b };
        if (block._type === 'mediaBlock') {
          if (block.image) block.image = SanityImageService.hero(block.image, 1600);
          if (block.secondaryImage) block.secondaryImage = SanityImageService.hero(block.secondaryImage, 1200);
        } else if (block._type === 'bentoCardBlock' && Array.isArray(block.cards)) {
          block.cards = block.cards.map((c: any) => ({
            ...c,
            image: c?.image ? SanityImageService.thumbnail(c.image, 800) : c?.image,
          }));
        } else if (block._type === 'quoteBlock' && block.avatar) {
          block.avatar = SanityImageService.avatar(block.avatar, 120);
        }
        return block;
      });
    }

    return s;
  });
}
