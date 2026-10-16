export const IMAGE = `{
  "_id": asset->_id,
  "src": asset->url,
  "alt": alt
}`;

export const SECTIONS = `{
  ...,
  _type == "hosieryHeroSection" => {
    ...,
    "heroImage": heroImage.asset->url
  },
  _type == "hosierySpecSection" => {
    ...,
    "macroImage": macroImage.asset->url
  },
  _type == "hosieryCollectionSection" => {
    ...,
    products[]->{
      title,
      shortTitle,
      "slug": slug.current,
      tagline,
      featured,
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
  }
}`;
