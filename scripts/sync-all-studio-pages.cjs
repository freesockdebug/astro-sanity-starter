// scripts/sync-all-studio-pages.cjs
require('dotenv').config();
const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID || 'xvhhd8u0',
  dataset: process.env.SANITY_DATASET || 'production',
  token: process.env.SANITY_TOKEN,
  apiVersion: '2024-03-01',
  useCdn: false
});

async function sync() {
  console.log('Syncing all Studio pages and site configuration...');

  // 1. Update Homepage with all 5 sections
  console.log('Updating Home page document...');
  await client.patch('a59d87e4-e3ff-4929-acc1-d67b1808d36c')
    .set({
      title: 'Nordic Knit Atelier | Luxury Hosiery (首页)',
      metaTitle: 'Nordic Knit Atelier | 200-Needle Luxury Women\'s Hosiery B2B',
      metaDescription: 'Specialized manufacturer of 200-needle luxury women\'s hosiery, cashmere ribbed crew socks, and seamless tights for global fashion labels.',
      sections: [
        {
          _key: 'sec-hero',
          _type: 'hosieryHeroSection',
          headline: 'Engineered Elegance. 200-Needle Micro Weave.',
          subline: 'Premium women\'s hosiery meticulously crafted with Italian Lonati cylinders and artisan seamless hand-linking. Designed for global fashion houses and private labels.',
          badges: [
            'MOQ: 200 Pairs / Style',
            '100% Hand-Linked Seamless Toe',
            'GOTS & OEKO-TEX Standard 100'
          ]
        },
        {
          _key: 'sec-specs',
          _type: 'hosierySpecSection',
          badge: 'Engineered Construction',
          title: 'Specification Matrix',
          description: 'We treat the architectural construction of women\'s hosiery with the exactitude of horology. Every seam, tension zone, and yarn twist is calibrated for zero friction.',
          specsList: [
            { _key: 'sp1', category: 'Yarn Count & Ply', value: '60s/2 Double-Ply Combed Cotton', note: 'Long-staple fibers, anti-pilling grade 4.5' },
            { _key: 'sp2', category: 'Welt & Cuff Elasticity', value: 'Zero-Feel Lycra Soft Stretch', note: 'Gentle hold without calf restriction' },
            { _key: 'sp3', category: 'Toe Closure', value: 'Italian Hand-Linked Seamless', note: 'Individual stitch loop interlocking' },
            { _key: 'sp4', category: 'Global Certification', value: 'OEKO-TEX 100 Class I', note: 'Zero hazardous dyes or heavy metals' },
            { _key: 'sp5', category: 'Color Fastness', value: 'Grade 4 - 5 (ISO 105-C06)', note: 'Resistant to friction & laundering fading' },
            { _key: 'sp6', category: 'Production Lead Time', value: '72h Sample / 18d Bulk', note: 'Express air courier dispatch globally' }
          ]
        },
        {
          _key: 'sec-collections',
          _type: 'hosieryCollectionSection',
          badge: 'Capsule Catalog 2026',
          title: 'Ready-to-Order Line Sheets',
          subtitle: 'Proprietary silhouettes developed for white-labeling, brand customization, and low-MOQ rapid wholesale reordering.',
          products: [
            { _key: 'r1', _type: 'reference', _ref: 'product-ribbed-cashmere-crew' },
            { _key: 'r2', _type: 'reference', _ref: 'product-silk-loafer' },
            { _key: 'r3', _type: 'reference', _ref: 'product-sheer-tights' },
            { _key: 'r4', _type: 'reference', _ref: 'product-merino-slouch' }
          ]
        },
        {
          _key: 'sec-manufacturing',
          _type: 'hosieryManufacturingSection',
          badge: 'OEM / ODM & Private Label',
          headline: 'Vertical Knitting Infrastructure',
          subline: 'From spinning fiber selection to finished packaging, our smart manufacturing line delivers bespoke hosiery solutions with rapid prototyping and global export compliance.',
          capabilities: [
            {
              _key: 'c1',
              title: '350+ Lonati Cylinders',
              description: 'State-of-the-art Italian single and double cylinder electronic machines capable of 96N to 200N gauge high-density knitting.'
            },
            {
              _key: 'c2',
              title: '72h Sample Prototyping',
              description: 'CAD digital patterning to custom physical sample dispatched within 72 hours with yarn lab dip verification.'
            },
            {
              _key: 'c3',
              title: 'Full Private Labeling',
              description: 'Jacquard logos, micro embroidery, silicone sole grippers, custom Pantone dyeing, and FSC certified retail packaging.'
            },
            {
              _key: 'c4',
              title: 'Zero-Defect Audit',
              description: '100% optical camera inspection and manual hand stretch testing. Fully Sedex, BSCI, and ISO9001 compliant.'
            }
          ]
        },
        {
          _key: 'sec-inquiry',
          _type: 'hosieryInquirySection',
          badge: 'B2B Sample Room',
          headline: 'Request Your Curated Swatch Kit',
          subline: 'Feel the micron-level hand feel in person. Verified fashion labels, buying offices, and independent designers receive free swatch books dispatched within 48 hours.',
          buttonText: 'Dispatch Free Swatch Kit'
        }
      ]
    })
    .commit();

  // 2. Create/Update About Page
  console.log('Creating/Updating About / Manufacturing page...');
  await client.createOrReplace({
    _id: 'page-about',
    _type: 'page',
    title: 'Manufacturing & Atelier (工坊与制造实力)',
    slug: { _type: 'slug', current: 'about' },
    metaTitle: 'Manufacturing & Atelier | Nordic Knit B2B',
    metaDescription: 'Explore our 350+ Lonati cylinder knitting facility, 72-hour prototyping capabilities, and global certifications.',
    sections: [
      {
        _key: 'sec-hero',
        _type: 'hosieryHeroSection',
        headline: 'Precision Machinery. Zero Compromise.',
        subline: 'Specialized 200-needle cylinder knitting lines producing luxury socks for international designer labels.',
        badges: ['350+ Italian Knitting Cylinders', 'OEKO-TEX Class I', 'BSCI Audited']
      },
      {
        _key: 'sec-mfg',
        _type: 'hosieryManufacturingSection',
        badge: 'Vertical Manufacturing',
        headline: 'From Raw Spun Fiber to Global Freight',
        subline: 'Complete in-house control over dyeing, circular knitting, hand-linking, steam boarding, and branded packaging.'
      },
      {
        _key: 'sec-specs',
        _type: 'hosierySpecSection',
        badge: 'Quality Control',
        title: 'Factory Tolerance Matrix',
        description: 'Every production batch undergoes strict tensile testing, yarn count verification, and rub fastness checks.'
      },
      {
        _key: 'sec-inq',
        _type: 'hosieryInquirySection',
        headline: 'Schedule a Factory Audit or Sample Dispatch',
        subline: 'Request production capacity documentation or physical sample kits directly.'
      }
    ]
  });

  // 3. Create/Update Private Label Page
  console.log('Creating/Updating Private Label page...');
  await client.createOrReplace({
    _id: 'page-private-label',
    _type: 'page',
    title: 'Private Label & OEM Services (贴牌与私模定制)',
    slug: { _type: 'slug', current: 'private-label' },
    metaTitle: 'Private Label Hosiery OEM/ODM | Nordic Knit',
    metaDescription: 'Custom Pantone yarn dyeing, custom jacquard patterns, woven label placement, and bespoke gift packaging for luxury fashion brands.',
    sections: [
      {
        _key: 'sec-hero',
        _type: 'hosieryHeroSection',
        headline: 'Bespoke Private Label Hosiery Program',
        subline: 'White-label our proprietary 200-needle silhouettes or develop fully bespoke jacquards and rib constructions with our design team.',
        badges: ['Low MOQ: 200 Pairs', 'Custom Pantone Dyeing', 'Branded FSC Packaging']
      },
      {
        _key: 'sec-colls',
        _type: 'hosieryCollectionSection',
        badge: 'Customizable Bases',
        title: 'Available Core Silhouettes for White-Labeling',
        subtitle: 'Select from our proven silhouettes and apply your brand labels, custom colors, and packaging.',
        products: [
          { _key: 'r1', _type: 'reference', _ref: 'product-ribbed-cashmere-crew' },
          { _key: 'r2', _type: 'reference', _ref: 'product-silk-loafer' },
          { _key: 'r3', _type: 'reference', _ref: 'product-sheer-tights' },
          { _key: 'r4', _type: 'reference', _ref: 'product-merino-slouch' }
        ]
      },
      {
        _key: 'sec-inq',
        _type: 'hosieryInquirySection',
        headline: 'Submit Your Private Label Tech Pack',
        subline: 'Share your vector logo, Pantone codes, or sketches. Our technicians provide digital CAD mockups within 24 hours.'
      }
    ]
  });

  // 4. Create/Update Contact Page
  console.log('Creating/Updating Contact page...');
  await client.createOrReplace({
    _id: 'page-contact',
    _type: 'page',
    title: 'B2B Wholesale & Sample Inquiries (商务联系与索样)',
    slug: { _type: 'slug', current: 'contact' },
    metaTitle: 'Contact B2B Wholesale Team | Nordic Knit',
    metaDescription: 'Connect with our export department to request physical sample books, wholesale price sheets, or factory visits.',
    sections: [
      {
        _key: 'sec-inq',
        _type: 'hosieryInquirySection',
        badge: 'Priority Export Desk',
        headline: 'Request Your Curated Swatch Kit',
        subline: 'Verified fashion labels, buying offices, and independent designers receive free swatch books dispatched within 48 hours via DHL Express.'
      }
    ]
  });

  // 5. Update siteConfig
  console.log('Updating siteConfig...');
  await client.patch('427de992-8d59-40a3-af5f-2f83675af6c3')
    .set({
      titleSuffix: 'Nordic Knit Atelier | 200-Needle Luxury Women\'s Hosiery B2B',
      header: {
        _type: 'header',
        title: 'Nordic Knit Atelier',
        navLinks: [
          { _key: 'l1', _type: 'actionLink', label: 'Micro Weave', url: '/#hero' },
          { _key: 'l2', _type: 'actionLink', label: 'Spec Matrix', url: '/#specs' },
          { _key: 'l3', _type: 'actionLink', label: 'Capsule Lines', url: '/#collections' },
          { _key: 'l4', _type: 'actionLink', label: 'OEM / ODM', url: '/#manufacturing' },
          { _key: 'l5', _type: 'actionLink', label: 'Private Label', url: '/private-label' },
          { _key: 'l6', _type: 'actionLink', label: 'About Atelier', url: '/about' },
          { _key: 'l7', _type: 'actionButton', label: 'Request Swatch Kit', theme: 'primary', url: '/#inquiry' }
        ]
      },
      footer: {
        _type: 'footer',
        text: '© 2026 Nordic Knit Atelier Hosiery Co., Ltd. All rights reserved.'
      }
    })
    .commit();

  console.log('All pages, sections, and siteConfig successfully synchronized in Sanity Studio!');
}

sync().catch(console.error);
