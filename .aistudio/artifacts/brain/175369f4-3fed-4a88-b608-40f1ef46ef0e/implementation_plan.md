# Multilingual Markdown Product Story & Editorial Detail Architecture

This plan establishes multilingual Markdown editing in Sanity Studio (`EN`, `DE`, `FR`, `ES`) and renders a rich, Apple-style craftsmanship and product story section directly below the product detail hero grid.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions incorporate your confirmed preferences from the clarification step:

- **Confirmed Decision 1 (Placement Below Hero Showcase)**: Position the rich Markdown narrative as a dedicated, full-width "Story & Craftsmanship" editorial section directly beneath the 2-column hero grid (gallery + contiguous purchase module), preserving high-converting purchasing actions above the fold while providing deep storytelling below.
- **Confirmed Decision 2 (Multilingual Schema in Sanity Studio)**: Introduce a dedicated `localeMarkdown` schema in Sanity Studio supporting localized Markdown fields for all four store languages (`EN`, `DE`, `FR`, `ES`), allowing editors to compose unique localized text, headings, bulleted technical specs, and embedded imagery per market.
- **Confirmed Decision 3 (Rich Editorial Typography & Callouts)**: Render Markdown using `marked` with an Apple-style prose layout—refined typography (`#1d1d1f` headings, `#424245` body), styled quotation callouts, technical specification tables, and rounded high-definition media frames.

---

## 1. Overview & Core Concept

- **What It Does**: Upgrades the product detail page from basic parameter tags into a high-end luxury editorial experience. Store editors can write structured Markdown with headings, narrative paragraphs, craft callouts, material breakdown tables, and process photography in Sanity Studio. The storefront automatically renders the active language's story section with graceful fallback for products without rich descriptions.
- **Target Audience / Persona**: B2B and retail clients exploring luxury cashmere and silk sock manufacturing who require comprehensive information on craftsmanship, material composition, origin, and care guides before purchasing.
- **Key Value**: Replaces thin spec-only boxes with immersive brand storytelling, significantly increasing perceived brand equity, session dwell time, and organic search relevance without adding client-side bundle bloat.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Shopper Landing**: The customer views the product gallery and contiguous purchase box (title, pricing, material tags, MOQ, and sample request CTA) in the top hero.
  2. **Editorial Scroll**: Scrolling down reveals the full-width "The Craft & The Details" section, framed with generous whitespace (`py-16` / `py-24`) and subtle border dividers.
  3. **Rich Media Reading**: The customer reads artisan details, inspects high-contrast typography, browses structured specification tables, and views process imagery seamlessly embedded within the narrative.
  4. **Language Switching**: When switching between `EN`, `DE`, `FR`, and `ES`, the story content instantaneously switches to the corresponding localized translation fetched server-side during SSR.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Apple-inspired quiet luxury and editorial craftsmanship (`apple-rail-narrow`, minimalist typography, balanced leading).
  - *Color Palette*: Clean white canvas (`bg-white` / `#ffffff`), deep charcoal display headings (`text-[#1d1d1f]`), warm muted secondary text (`text-[#424245]`), subtle dividers (`border-black/5`).
  - *Typography*: High-contrast display headlines (`clamp(1.75rem, 3vw, 2.5rem)`), tabular numeric figures for yarn gauges and measurements, and refined serif/sans hybrid body copy.
  - *Callout Styling*: Inset quote blocks and craft highlight cards featuring subtle neutral borders and 16px padding.
- **Graceful Empty State**: If a product has no Markdown story filled in Sanity, the section cleanly unmounts without leaving empty white boxes or broken borders.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Server-Side Static Markdown Parsing with `marked`**
  - *Chosen Approach*: Parse Markdown into sanitized HTML server-side inside `src/pages/products/[slug].astro` using the already installed `marked: ^15.0.4` dependency.
  - *Why*: Eliminates client-side JavaScript execution, keeps the Astro page 100% lightweight for Cloudflare Workers SSR, and renders immediate HTML directly to Googlebot for SEO indexation.
  - *Alternatives Considered*: Client-side React Markdown component (would inflate bundle size and risk hydration mismatches on Cloudflare Workers).
- **Decision 2: Multilingual Schema Design in Sanity Studio**
  - *Chosen Approach*: Define `studio/schemaTypes/localeMarkdown.ts` providing distinct `markdown` inputs for `en`, `de`, `fr`, and `es`, organized in an intuitive tabbed or collapsible field group in Sanity Studio.
  - *Why*: Seamlessly matches existing localized types (`localeString`, `localeText`), preserves language parity, and integrates with the existing Sanity markdown plugin (`sanity-plugin-markdown: ^9.0.18`).
  - *Alternatives Considered*: Single monolingual field (would prevent French, German, or Spanish buyers from reading localized craft stories).

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### System Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Sanity Studio CMS                               │
│  • schema: localeMarkdown (type: 'markdown' for en, de, fr, es)        │
│  • product schema: field 'story' / 'content' in Editorial tab          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ GROQ Query (PRODUCT_FIELDS)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Astro SSR Data Layer                              │
│  • src/data/products.ts: fetch localized story with fallback           │
│  • types/index.ts: Product type includes content / story field         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Localized Markdown String
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   PDP Storefront Component                             │
│                  src/pages/products/[slug].astro                       │
│  • Server-side parsing: marked.parse(localizedStory)                   │
│  • Container: <section id="product-story" class="apple-rail-narrow">   │
│  • Typography: Tailwind prose styling tailored to Apple aesthetics     │
│  • Rendered elements: Headings, Blockquotes, Spec Tables, Image frames │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model Additions

1. **Sanity Schema (`studio/schemaTypes/localeMarkdown.ts`)**:
   ```typescript
   export default {
     title: 'Localized Markdown',
     name: 'localeMarkdown',
     type: 'object',
     fields: [
       { title: 'English', name: 'en', type: 'markdown' },
       { title: 'German (Deutsch)', name: 'de', type: 'markdown' },
       { title: 'French (Français)', name: 'fr', type: 'markdown' },
       { title: 'Spanish (Español)', name: 'es', type: 'markdown' },
     ],
   }
   ```

2. **Product Schema Update (`studio/schemaTypes/product.ts`)**:
   - Add field `story` or `content` of type `localeMarkdown` under an editorial group.

3. **TypeScript Definition (`src/types/index.ts`)**:
   - Add `story?: string | Record<string, string>;` to `Product` interface.

4. **Product Query & Helper (`src/data/products.ts`)**:
   - Add `story` to `PRODUCT_FIELDS` projection.
   - Use `getLocalizedValue(product.story, lang)` to extract the current locale's Markdown string.

### Component Styling & Layout Specs

- Container: `<section id="product-story" class="border-t border-black/5 bg-[#fafafa]/50 py-16 md:py-24">`
- Inner Width: `max-w-4xl mx-auto px-6 lg:px-8`
- Editorial Section Header: Subtitle badge "CRAFTSMANSHIP & DESIGN" + H2 title "The Story Behind the Product"
- Prose Styling:
  - `prose prose-neutral max-w-none`
  - Headers: `prose-headings:font-medium prose-headings:text-[#1d1d1f]`
  - Body: `prose-p:text-[#424245] prose-p:leading-relaxed prose-p:text-base md:prose-p:text-lg`
  - Lists: `prose-li:text-[#424245]`
  - Quotes: `prose-blockquote:border-l-2 prose-blockquote:border-[#1d1d1f] prose-blockquote:italic prose-blockquote:text-[#1d1d1f]`
  - Tables: Styled responsive table wrappers with tabular numbers for technical yarn/gauge breakdowns.

### Verification & Cloudflare Compliance Strategy

- Build check via `npm run check:cf` and `compile_applet`.
- Verification of zero hydration errors and adherence to Cloudflare Worker 3MB bundle limits.
