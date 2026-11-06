# Apple-Style B2B Commerce Starter (Astro + Sanity + Cloudflare D1)

An edge-first, headless B2B wholesale showroom and inquiry platform engineered with Apple's refined design aesthetic. Built for manufacturers, suppliers, and global exporters across any industry (Consumer Electronics, Industrial Hardware, Apparel & Textiles, Home Goods, and more).

> **Seed Dataset & Demo Theme**: Includes an out-of-the-box luxury textile & apparel demo seed. Brand name, logo, navigation, currencies, and product taxonomies are completely decoupled from code and managed through Sanity CMS `siteConfig` and Cloudflare D1 settings.

Built with **Astro SSR + Sanity CMS + Cloudflare Workers / D1 / KV + Tailwind CSS v4 + DaisyUI + Nanostores**.

---

## Architecture Highlights

- **Edge-First SSR**: Cloudflare Workers deployment with single-flight edge HTML caching, client-side SWR, and SQLite WAL prepared statement pooling.
- **Decoupled Industry-Neutral Components**:
  - `AppleHero`: High-impact, responsive visual marquee with viewport-aware shimmer loading.
  - `BentoSpecMatrix`: Apple-style bento grid featuring technical specifications, certifications, and macro texture showcases.
  - `ProductCollections`: Fluid horizontal and grid product showcase with dynamic inquiry/quote cart integration.
  - `CustomSection`: Block-based flexible layout builder (comparison sliders, bento cards, metrics, quotes).
- **Zero-Flicker Progressive Shimmer**: Global pooled `IntersectionObserver` with idle-scheduled progressive skeleton shimmer for high-resolution product macro visual assets.
- **B2B Inquiry & Claiming Engine**:
  - Dynamic sliding Quote Cart drawer (`nanostores`).
  - Guest inquiry creation with automatic user account association and backfilling.
  - Multi-tier wholesale pricing (Standard, VIP, Distributor, Strategic Partner).
  - Role-based fulfillment workspace (`/admin/orders`, `/admin/users`, `/admin/settings`, `/admin/logs`).
- **Comprehensive Observability**: Micro-batched error logging (`db.batch()`), multi-column diagnostic search, and client-side navigation breadcrumbs.

---

## Prerequisites

- **Node.js**: `>= 22.0.0`
- **Package Manager**: `npm`
- **Cloudflare Account**: Workers, D1 Database, and KV namespace

---

## Quick Start & Development

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Configure environment
cp .env.example .env
# Fill in your Sanity project ID, dataset, and Cloudflare credentials

# 3. Start local development server (includes /studio)
npm run dev

# 4. Run pre-flight architecture & quality checks
npm run check

# 5. Run end-to-end B2B workflow & database integrity self-check
npm run test:b2b

# 6. Build production Astro SSR Worker bundle
npm run build

# 7. Deploy to Cloudflare Workers
npm run deploy
npm run deploy:studio
```

---

## License

MIT License. Open source and ready for production customization.
