// scripts/seed-sanity-products.cjs
require('dotenv').config();
const { createClient } = require('@sanity/client');
const fs = require('fs');
const path = require('path');

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID || 'xvhhd8u0',
  dataset: process.env.SANITY_DATASET || 'production',
  token: process.env.SANITY_TOKEN,
  apiVersion: '2024-03-01',
  useCdn: false
});

async function uploadImage(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const fileStream = fs.createReadStream(filePath);
    const asset = await client.assets.upload('image', fileStream, {
      filename: path.basename(filePath)
    });
    return {
      _type: 'image',
      asset: {
        _type: 'reference',
        _ref: asset._id
      }
    };
  } catch (err) {
    console.error('Image upload failed for', filePath, err.message);
    return null;
  }
}

async function seed() {
  console.log('Seeding initial luxury hosiery products into Sanity...');

  // Upload local images
  console.log('Uploading images to Sanity Asset CDN...');
  const heroLightImg = await uploadImage(path.join(__dirname, '../public/images/hero-light.jpg'));
  const cashmereCrewImg = await uploadImage(path.join(__dirname, '../public/images/sock-cashmere-crew.jpg'));
  const silkLoaferImg = await uploadImage(path.join(__dirname, '../public/images/sock-silk-loafer.jpg'));
  const specLightImg = await uploadImage(path.join(__dirname, '../public/images/spec-light.jpg'));
  const toeDetailImg = await uploadImage(path.join(__dirname, '../public/images/detail-toe.jpg'));
  const cuffDetailImg = await uploadImage(path.join(__dirname, '../public/images/detail-cuff.jpg'));

  const products = [
    {
      _id: 'product-ribbed-cashmere-crew',
      _type: 'product',
      title: '200N Ribbed Cashmere-Silk Crew',
      slug: { _type: 'slug', current: 'ribbed-cashmere-crew' },
      sku: 'NK-CS200-01',
      tagline: 'Ultra-Fine 15.2µm Mongolian Cashmere & Grade 6A Mulberry Silk',
      moq: '150 Pairs / Color',
      leadTime: 'Sample: 48 Hours | Bulk: 18 - 22 Days',
      featured: true,
      mainImage: cashmereCrewImg,
      gallery: [cashmereCrewImg, heroLightImg, toeDetailImg, cuffDetailImg, specLightImg].filter(Boolean),
      colors: [
        { _key: 'c1', name: 'Oatmeal Melange', hex: '#e7e3db' },
        { _key: 'c2', name: 'Heather Fog Grey', hex: '#c8c6c4' },
        { _key: 'c3', name: 'Warm Alabaster', hex: '#fbf9f5' },
        { _key: 'c4', name: 'Charcoal Noir', hex: '#1c1917' }
      ],
      pricingTiers: [
        { _key: 'p1', range: '150 - 499 Pairs', price: '$6.80' },
        { _key: 'p2', range: '500 - 1,999 Pairs', price: '$5.40' },
        { _key: 'p3', range: '2,000+ Pairs', price: '$4.60' }
      ],
      specifications: [
        { _key: 's1', label: 'Yarn Count & Composition', value: '70% Inner Mongolian Cashmere, 30% Mulberry Silk' },
        { _key: 's2', label: 'Cylinder Gauge', value: '200-Needle Single Cylinder Derby Rib (Lonati)' },
        { _key: 's3', label: 'Toe Closure', value: '100% Artisan Hand-Linked Seamless (Zero Ridge)' },
        { _key: 's4', label: 'Elasticity & Cuff', value: 'Zero-Feel Japanese Lycra Core-Spun Welt' },
        { _key: 's5', label: 'Weight per Pair', value: '42 grams (Winter Thermal Lightweight)' },
        { _key: 's6', label: 'Color Fastness', value: 'Grade 4-5 (ISO 105-C06 Laboratory Tested)' },
        { _key: 's7', label: 'Certifications', value: 'OEKO-TEX Standard 100 Class I, GOTS, ISO9001' }
      ]
    },
    {
      _id: 'product-silk-loafer',
      _type: 'product',
      title: 'Mulberry Silk Invisible Loafer Sock',
      slug: { _type: 'slug', current: 'silk-loafer' },
      sku: 'NK-SL200-02',
      tagline: 'Ultra-Low Cut Architectural Fit for Luxury Loafers & Sneakers',
      moq: '200 Pairs / Color',
      leadTime: 'Sample: 48 Hours | Bulk: 15 - 18 Days',
      featured: true,
      mainImage: silkLoaferImg,
      gallery: [silkLoaferImg, toeDetailImg, heroLightImg, cuffDetailImg].filter(Boolean),
      colors: [
        { _key: 'c1', name: 'Champagne Nude', hex: '#f5edd8' },
        { _key: 'c2', name: 'Crisp Chalk', hex: '#fbf9f5' },
        { _key: 'c3', name: 'Onyx Black', hex: '#1c1917' }
      ],
      pricingTiers: [
        { _key: 'p1', range: '200 - 499 Pairs', price: '$4.90' },
        { _key: 'p2', range: '500 - 1,999 Pairs', price: '$3.80' },
        { _key: 'p3', range: '2,000+ Pairs', price: '$3.10' }
      ],
      specifications: [
        { _key: 's1', label: 'Yarn Count & Composition', value: '88% Grade 6A Mulberry Silk, 12% Spandex' },
        { _key: 's2', label: 'Cylinder Gauge', value: '200-Needle Ultra-Thin Breathable Knit' },
        { _key: 's3', label: 'Heel Grip', value: '360° Medical-Grade Silicone Non-Slip Contour' },
        { _key: 's4', label: 'Toe Closure', value: 'Hand-Linked Flat Seamless' }
      ]
    },
    {
      _id: 'product-sheer-tights',
      _type: 'product',
      title: '15D Invisible Sheer Tights',
      slug: { _type: 'slug', current: 'sheer-tights' },
      sku: 'NK-ST400-03',
      tagline: 'Second-Skin Compression with Run-Resistant Bi-Component Italian Yarn',
      moq: '300 Pairs / Color',
      leadTime: 'Sample: 48 Hours | Bulk: 20 - 25 Days',
      featured: true,
      mainImage: heroLightImg,
      gallery: [heroLightImg, toeDetailImg, cuffDetailImg, specLightImg].filter(Boolean),
      colors: [
        { _key: 'c1', name: 'Natural Fair', hex: '#d4b996' },
        { _key: 'c2', name: 'Warm Honey', hex: '#a18262' },
        { _key: 'c3', name: 'Smoky Black', hex: '#18181b' }
      ],
      pricingTiers: [
        { _key: 'p1', range: '300 - 999 Pairs', price: '$5.20' },
        { _key: 'p2', range: '1,000 - 4,999 Pairs', price: '$4.10' },
        { _key: 'p3', range: '5,000+ Pairs', price: '$3.40' }
      ],
      specifications: [
        { _key: 's1', label: 'Yarn Count & Composition', value: '80% Italian Polyamide, 20% Elastane' },
        { _key: 's2', label: 'Gauge', value: '400-Needle Circular Seamless Machine' },
        { _key: 's3', label: 'Waistband', value: 'Zero-Pinch Comfort Band with Breathable Cotton Gusset' }
      ]
    },
    {
      _id: 'product-merino-slouch',
      _type: 'product',
      title: 'Superfine 18.5µ Merino Boot Sock',
      slug: { _type: 'slug', current: 'merino-slouch' },
      sku: 'NK-MB144-04',
      tagline: 'Thermo-Regulating Australian Merino with Cushioned Loop Footbed',
      moq: '200 Pairs / Color',
      leadTime: 'Sample: 48 Hours | Bulk: 18 - 22 Days',
      featured: true,
      mainImage: specLightImg,
      gallery: [specLightImg, cashmereCrewImg, toeDetailImg, cuffDetailImg].filter(Boolean),
      colors: [
        { _key: 'c1', name: 'Charcoal Heather', hex: '#44403c' },
        { _key: 'c2', name: 'Oatmeal Grey', hex: '#a8a29e' },
        { _key: 'c3', name: 'Ecru Wool', hex: '#f5f5f4' }
      ],
      pricingTiers: [
        { _key: 'p1', range: '200 - 499 Pairs', price: '$5.80' },
        { _key: 'p2', range: '500 - 1,999 Pairs', price: '$4.60' },
        { _key: 'p3', range: '2,000+ Pairs', price: '$3.90' }
      ],
      specifications: [
        { _key: 's1', label: 'Yarn Count & Composition', value: '85% Australian Merino Wool, 15% Nylon' },
        { _key: 's2', label: 'Cylinder Gauge', value: '144-Needle Cushion Terry Loop' }
      ]
    }
  ];

  for (const prod of products) {
    console.log(`Writing product: ${prod.title} (${prod._id})`);
    await client.createOrReplace(prod);
  }

  console.log('All products successfully seeded into Sanity!');
}

seed().catch(console.error);
