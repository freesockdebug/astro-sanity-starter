// scripts/sync-dynamic-cms-fields.cjs
require('dotenv').config();
const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID || 'xvhhd8u0',
  dataset: process.env.SANITY_DATASET || 'production',
  token: process.env.SANITY_TOKEN,
  apiVersion: '2024-03-01',
  useCdn: false
});

async function run() {
  console.log('🔄 Fetching homepage document...');
  const homeDoc = await client.fetch('*[_type == "page" && slug.current == "/"][0]');
  if (homeDoc) {
    console.log(`Found homepage: ${homeDoc._id}`);
    const sections = homeDoc.sections || [];
    const updatedSections = sections.map((sec) => {
      if (sec._type === 'hosieryHeroSection') {
        return {
          ...sec,
          superTitle: sec.superTitle || 'B2B Hosiery Manufacturing & Private Label',
        };
      }
      if (sec._type === 'hosierySpecSection') {
        return {
          ...sec,
          bento1Tag: sec.bento1Tag || 'Yarn Architecture',
          bento1Title: sec.bento1Title || '60s/2 Double-Ply Combed Cotton.',
          bento1Description: sec.bento1Description || 'Ultra-long staple combed fibers spun for anti-pilling longevity (Grade 4.5) and a breathable, second-skin handfeel across 50+ wash cycles.',
          
          bento2Tag: sec.bento2Tag || 'Toe Closure',
          bento2Stat: sec.bento2Stat || '0',
          bento2Unit: sec.bento2Unit || 'mm',
          bento2Title: sec.bento2Title || 'Hand-Linked Seamless',
          bento2Description: sec.bento2Description || 'Individual loop-by-loop manual interlocking eliminates interior ridges for zero pressure on toes.',
          bento2BadgeText: sec.bento2BadgeText || 'OEKO-TEX® 100 Class I',
          bento2BadgeStatus: sec.bento2BadgeStatus || 'Certified Safe',

          bento3Tag: sec.bento3Tag || 'Machine Gauge',
          bento3Stat: sec.bento3Stat || '200',
          bento3Unit: sec.bento3Unit || 'N',
          bento3Title: sec.bento3Title || 'Lonati Cylinders',
          bento3Description: sec.bento3Description || 'Italian high-density circular knit delivering refined micro-rib clarity with zero distortion.',
          bento3FooterNote: sec.bento3FooterNote || 'Tolerance: ±0.5% Needle Pitch',

          bento4Tag: sec.bento4Tag || 'Elasticity',
          bento4Stat: sec.bento4Stat || 'Zero',
          bento4Unit: sec.bento4Unit || 'Mark',
          bento4Title: sec.bento4Title || 'Lycra Soft Stretch',
          bento4Description: sec.bento4Description || 'Graduated tension welt stays upright without calf constrictions or pressure marks.',
          bento4FooterNote: sec.bento4FooterNote || 'Non-Slip Silicone Grip Compatible',

          bento5Tag: sec.bento5Tag || 'Sampling Speed',
          bento5Stat: sec.bento5Stat || '48',
          bento5Unit: sec.bento5Unit || 'h',
          bento5Title: sec.bento5Title || 'Global Courier Dispatch',
          bento5Description: sec.bento5Description || 'Curated fabric swatch books and custom lab dip samples dispatched via DHL Express in 48 hours.',
          bento5FooterNote: sec.bento5FooterNote || 'Bulk Lead: 14 – 18 Working Days',
        };
      }
      return sec;
    });

    await client.patch(homeDoc._id).set({ sections: updatedSections }).commit();
    console.log('✅ Homepage sections updated with dynamic fields.');
  }

  // 2. Update SiteConfig Footer columns
  console.log('🔄 Fetching siteConfig document...');
  const siteConfig = await client.fetch('*[_type == "siteConfig"][0]');
  if (siteConfig) {
    console.log(`Found siteConfig: ${siteConfig._id}`);
    const fiveColumns = [
      {
        _key: 'col1',
        title: 'GWENVENNI',
        links: [
          {_key: 'l11', label: 'Overview', url: '/'},
          {_key: 'l12', label: 'Hero Weave', url: '#hero'},
          {_key: 'l13', label: 'Technical Architecture', url: '#specs'},
          {_key: 'l14', label: 'Ready-to-Order', url: '#collections'},
        ],
      },
      {
        _key: 'col2',
        title: 'Hosiery Lines',
        links: [
          {_key: 'l21', label: 'Double Ruffle Lace', url: '/products/gwenvenni-double-ruffle-lace-socks'},
          {_key: 'l22', label: 'Mulberry Silk Loafers', url: '#collections'},
          {_key: 'l23', label: 'Ribbed Cashmere Crews', url: '#collections'},
          {_key: 'l24', label: '15D Seamless Tights', url: '#collections'},
        ],
      },
      {
        _key: 'col3',
        title: 'B2B Services',
        links: [
          {_key: 'l31', label: 'Request Swatch Kit', url: '#inquiry'},
          {_key: 'l32', label: 'Custom Pantone Dyeing', url: '#manufacturing'},
          {_key: 'l33', label: 'Private Label Packaging', url: '#manufacturing'},
          {_key: 'l34', label: 'Rapid 72h Prototyping', url: '#manufacturing'},
        ],
      },
      {
        _key: 'col4',
        title: 'Certifications',
        links: [
          {_key: 'l41', label: 'OEKO-TEX Standard 100', url: '#specs'},
          {_key: 'l42', label: 'CPSIA Certified Safe', url: '#specs'},
          {_key: 'l43', label: 'GOTS Organic Cotton', url: '#specs'},
          {_key: 'l44', label: 'ISO 9001:2015', url: '#specs'},
        ],
      },
      {
        _key: 'col5',
        title: 'Direct Inquiries',
        links: [
          {_key: 'l51', label: 'Order Swatch Kit', url: '#inquiry'},
          {_key: 'l52', label: 'Request OEM Quote', url: '#inquiry'},
          {_key: 'l53', label: 'Factory Audit Tour', url: '#manufacturing'},
          {_key: 'l54', label: 'contact@gwenvenni.com', url: 'mailto:contact@gwenvenni.com'},
        ],
      },
    ];

    await client.patch(siteConfig._id).set({
      'footer.columns': fiveColumns
    }).commit();
    console.log('✅ SiteConfig footer updated with full 5 columns.');
  }

  // 3. Update products with shortTitle, statusBadge, supportBadge, specsHeading
  console.log('🔄 Fetching products...');
  const products = await client.fetch('*[_type == "product"]');
  const shortTitleMap = {
    'gwenvenni-double-ruffle-lace-socks': 'Double Ruffle Lace',
    'ribbed-cashmere-crew': 'Ribbed Cashmere Crew',
    'silk-loafer': 'Mulberry Silk Loafer',
    'sheer-tights': '15D Invisible Sheer',
    'merino-slouch': 'Superfine Merino Slouch'
  };

  for (const prod of products) {
    const slug = prod.slug?.current || '';
    const shortTitle = prod.shortTitle || shortTitleMap[slug] || prod.title;
    await client.patch(prod._id).set({
      shortTitle: shortTitle,
      statusBadge: prod.statusBadge || 'Active Production Ready',
      supportBadge: prod.supportBadge || 'Full Private Label Support',
      specsHeading: prod.specsHeading || 'Complete Technical Specifications'
    }).commit();
    console.log(`✅ Product ${slug || prod.title} patched with shortTitle: "${shortTitle}".`);
  }

  console.log('🎉 All live CMS documents synchronized successfully!');
}

run().catch((err) => {
  console.error('❌ Error during synchronization:', err);
  process.exit(1);
});
