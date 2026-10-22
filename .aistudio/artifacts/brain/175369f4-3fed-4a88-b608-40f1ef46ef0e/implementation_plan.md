# Cross-Stack Schema & Data Contract Synchronization Check

Extend the automated pre-build verification suite to enforce high-cohesion synchronization across Sanity Studio document schemas, frontend GROQ projections and default fallbacks, and shared TypeScript data interfaces.

## User Review & Critical Decisions

> [!IMPORTANT]
> The verification policy follows your confirmed selections from Phase 1 to prevent silent schema drift while allowing legitimate frontend-only computed properties.

- **Confirmed Scope**: Core documents (`product`, `category`, `siteConfig`, `page`, `rfqSettings`, and `catalogSettings`), their corresponding frontend GROQ projections and default objects, and shared TypeScript interfaces.
- **Confirmed Enforcement Level**:
  - **Fail-Fast (Build Blocker)**: Trigger an immediate error if a frontend GROQ projection queries a field that does not exist in the Studio schema, or if a Studio schema defines a core document field that is missing from the corresponding shared TypeScript interface or primary GROQ projection/default contract.
  - **Non-Blocking Warning**: Emit a clear diagnostic warning if a TypeScript interface or fallback object includes extra frontend-computed properties not backed by the Sanity schema.

---

## 1. Overview & Core Concept

- **What It Does**: Introduces a dedicated **Three-Way Contract Synchronization Verification** stage into the preflight pipeline that parses Studio schema field definitions, frontend GROQ query projections / default data contracts, and shared TypeScript interfaces, verifying that field keys remain aligned across all three layers.
- **Target Audience / Persona**: Full-stack engineers and automated CI/CD pipelines maintaining the Astro SSR storefront and Sanity v3 Studio.
- **Key Value**: Eliminates single-sided edits (such as adding a field in Sanity Studio without exposing it in GROQ/TypeScript, or querying a renamed field in frontend data services) by catching schema drift during `npm run check` and `npm run build` (`prebuild`).

---

## 2. User Experience & Visual Design

- **Developer CLI Experience**:
  - Runs automatically during `npm run check` and the `prebuild` hook before `npm run build`.
  - Displays a dedicated ANSI-formatted section header in the terminal output reporting the synchronization status for each core document contract (`product`, `category`, `siteConfig`, `page`, `rfqSettings`, `catalogSettings`).
  - When a mismatch is detected, prints the exact document type, the missing or drifted field name(s), and which layer (`Studio Schema`, `Frontend GROQ / Defaults`, or `TypeScript Interface`) is out of sync.
- **Visual Identity & Output Formatting**:
  - Uses consistent terminal color tokens: bold cyan section headers, green `✅ PASS` badges for verified contracts, yellow `⚠️ WARN` notices for extra computed fields, and red `❌ FAIL` diagnostics that immediately halt the build.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Three-Way Static & Runtime Contract Introspection**
  - *Chosen Approach*: Dynamically load the Studio schema modules (already loaded during Step 1 of the preflight check) to extract canonical field sets, and cross-verify them against parsed top-level fields from the frontend GROQ projections/default objects and TypeScript interfaces.
  - *Why*: Reuses the existing zero-overhead schema loader in the preflight runner, keeping execution time under 2 seconds without spawning external TypeScript compiler processes.
  - *Alternatives Considered*: Running full Sanity GraphQL/TypeGen code generation on every build was rejected because it requires network/CLI overhead and slows down local and CI `prebuild` hooks.
- **Decision 2: Asymmetric Fail-on-Missing / Warn-on-Extra Policy**
  - *Chosen Approach*: Missing schema fields in GROQ/TypeScript or phantom fields queried in GROQ fail the build (`logFail`), whereas extra frontend-computed fields on TypeScript interfaces emit a warning (`logWarn`) or respect an explicit computed-field allowlist.
  - *Why*: Guarantees 100% coverage of CMS fields in the frontend while accommodating legitimate runtime-augmented properties (such as `_id` or merged configuration objects).
- **Decision 3: Self-Evolving Rule Registration**
  - *Chosen Approach*: Register the cross-stack schema synchronization invariant as Rule #24 in the architectural rulebook so `npm run check:list` documents the guard alongside existing pitfalls.
  - *Why*: Maintains complete alignment with the self-evolving preflight protocol.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Verification Flow Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Pre-Build Preflight Runner (CLI)                     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│   Studio Layer    │     │  Frontend Data    │     │ Shared Type Layer │
│ (Document Schemas)│     │ (GROQ & Defaults) │     │  (TS Interfaces)  │
└─────────┬─────────┘     └─────────┬─────────┘     └─────────┬─────────┘
          │                         │                         │
          │ Extract defineField()   │ Parse top-level GROQ    │ Extract interface
          │ field names per doc     │投影 keys & default keys │ property keys
          └─────────────┬───────────┴───────────┬─────────────┘
                        ▼                       ▼
              ┌───────────────────────────────────────────┐
              │   Three-Way Contract Comparator Engine    │
              ├───────────────────────────────────────────┤
              │ 1. GROQ Field ∉ Schema      ──► ❌ FAIL   │
              │ 2. Schema Field ∉ TS Type   ──► ❌ FAIL   │
              │ 3. Schema Field ∉ GROQ/Def  ──► ❌ FAIL   │
              │ 4. Extra Computed TS Field  ──► ⚠️ WARN   │
              └───────────────────────────────────────────┘
```

- **Contract Mapping Matrix**:
  - `product` Schema ⟷ `PRODUCT_FIELDS` & `PRODUCT_CARD_FIELDS` (subset check) ⟷ `Product` interface (plus nested `pricingTiers` ⟷ `PricingTier`, `colors` ⟷ `ColorVariant`, `specifications` ⟷ `ProductSpecification`, `gallery` ⟷ `GalleryItem`).
  - `category` Schema ⟷ `CATEGORY_FIELDS` ⟷ `ProductCategory` interface.
  - `siteConfig` Schema ⟷ `CONFIG_QUERY_OBJ` ⟷ `SiteConfig` interface.
  - `page` Schema ⟷ `PAGE_QUERY_OBJ` ⟷ `Page` interface.
  - `rfqSettings` Schema ⟷ `DEFAULT_RFQ_SETTINGS` ⟷ `RfqSettings` interface.
  - `catalogSettings` Schema ⟷ `DEFAULT_CATALOG.settings` ⟷ `CatalogSettings` interface.
- **Interactive Verification & Error Recovery**:
  - Parses top-level GROQ projection blocks (handling aliased projections like `"slug": slug.current`, `"mainImage": mainImage.asset->url`, and spread/object expansions like `header { ... }`) to accurately extract referenced root schema field names.
  - Reconciles any existing minor drift in shared TypeScript interfaces (such as ensuring `swatchKitOptions` in `rfqSettings` is typed on `RfqSettings`) so the baseline codebase passes with zero errors and zero warnings.
