// scripts/migrate-section-types.cjs
// Migration script: Updates legacy hosiery* section types to generalized clean section types in Sanity
const { createClient } = require('@sanity/client');
require('dotenv').config();

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID || 'xvhhd8u0',
  dataset: process.env.SANITY_DATASET || 'production',
  useCdn: false,
  apiVersion: '2023-05-03',
  token: process.env.SANITY_TOKEN
});

const typeMap = {
  hosieryHeroSection: 'heroSection',
  hosieryCollectionSection: 'productShowcaseSection',
  hosierySpecSection: 'featureMatrixSection',
  hosieryManufacturingSection: 'manufacturingSection',
  hosieryInquirySection: 'inquirySection'
};

async function migrate() {
  console.log('Fetching pages from Sanity production dataset...');
  const pages = await client.fetch('*[_type == "page"]{_id, title, "slug": slug.current, sections}');
  console.log(`Found ${pages.length} pages to check.`);

  for (const page of pages) {
    if (!page.sections || !page.sections.length) continue;

    let changed = false;
    const updatedSections = page.sections.map((sec) => {
      const targetType = typeMap[sec._type];
      if (targetType) {
        changed = true;
        return {
          ...sec,
          _type: targetType
        };
      }
      return sec;
    });

    if (changed) {
      console.log(`Migrating page "${page.title}" (${page._id})...`);
      console.log('  From:', page.sections.map((s) => s._type));
      console.log('  To:  ', updatedSections.map((s) => s._type));

      await client
        .patch(page._id)
        .set({ sections: updatedSections })
        .commit();
      console.log(`  ✓ Successfully updated "${page.title}"`);
    } else {
      console.log(`Page "${page.title}" already uses clean section types.`);
    }
  }

  console.log('\nMigration completed successfully!');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
