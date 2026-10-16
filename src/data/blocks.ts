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
