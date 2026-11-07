import type { APIRoute } from 'astro';
import { client } from '../utils/sanity-client';
import { ALL_LOCALE_CODES, DEFAULT_LOCALE, type SupportedLocale } from '../i18n/ui';
import { getLocalizedPath } from '../i18n/utils';

export const prerender = false;

const SITE_URL = 'https://gwenvenni.com';
const EXCLUDED_SLUGS = new Set(['test', 'draft', 'preview', '404', '500']);

interface SanityDoc {
  _type: 'page' | 'product';
  slug: string;
  _updatedAt?: string;
}

interface SitemapEntry {
  path: string;
  lastmod?: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatLastmod(dateStr?: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export const GET: APIRoute = async () => {
  const entries: SitemapEntry[] = [
    { path: '/' },
    { path: '/products' },
  ];

  try {
    const docs = await client.fetch<SanityDoc[]>(
      `*[_type in ["page", "product"] && defined(slug.current) && !(_id in path("drafts.**"))]{
        _type,
        "slug": slug.current,
        _updatedAt
      }`
    );

    const seen = new Set<string>(['/', '/products']);

    for (const doc of docs || []) {
      const raw = (doc.slug || '').replace(/^\/+|\/+$/g, '');
      if (!raw || raw === 'home' || raw === 'index') {
        if (doc._updatedAt) {
          const home = entries.find((e) => e.path === '/');
          if (home) home.lastmod = doc._updatedAt;
        }
        continue;
      }

      if (EXCLUDED_SLUGS.has(raw)) continue;

      const routePath = doc._type === 'product' ? `/products/${raw}` : `/${raw}`;
      if (!seen.has(routePath)) {
        seen.add(routePath);
        entries.push({ path: routePath, lastmod: doc._updatedAt });
      }
    }
  } catch (err) {
    console.error('[sitemap] Failed to query Sanity, serving static entries:', err);
  }

  const urlBlocks: string[] = [];

  for (const entry of entries) {
    const lastmodTag = formatLastmod(entry.lastmod);

    for (const locale of ALL_LOCALE_CODES) {
      const localizedPath = getLocalizedPath(entry.path, locale as SupportedLocale);
      const locUrl = escapeXml(`${SITE_URL}${localizedPath}`);

      const alternateLinks = ALL_LOCALE_CODES.map((altLocale) => {
        const altPath = getLocalizedPath(entry.path, altLocale as SupportedLocale);
        const altUrl = escapeXml(`${SITE_URL}${altPath}`);
        return `    <xhtml:link rel="alternate" hreflang="${altLocale}" href="${altUrl}" />`;
      });

      const defaultPath = getLocalizedPath(entry.path, DEFAULT_LOCALE);
      const defaultUrl = escapeXml(`${SITE_URL}${defaultPath}`);
      alternateLinks.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${defaultUrl}" />`);

      const tags = [
        '  <url>',
        `    <loc>${locUrl}</loc>`,
        lastmodTag ? `    <lastmod>${lastmodTag}</lastmod>` : null,
        ...alternateLinks,
        '  </url>',
      ].filter(Boolean);

      urlBlocks.push(tags.join('\n'));
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlBlocks.join('\n')}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
};

