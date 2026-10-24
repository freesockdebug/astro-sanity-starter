# Multilingual Markdown Product Story & PDP Alignment Architecture

This document outlines the architectural implementation of multilingual Markdown craftsmanship stories and the resolution of section alignment and navbar obscuration on the product detail page (`/products/[slug]`).

---

## 1. Issue Diagnosis & Root Cause Analysis

### A. Title & Gallery Top Obscuration ("标题和大图顶部被遮盖住")
1. **Header Height Stacking**:
   - `AppleNav.astro`: `position: fixed; top: 0; left: 0; right: 0; z-index: 50; height: 48px;`.
   - `Breadcrumbs.astro`: `position: sticky; top: 48px; z-index: 40; height: 36px;`.
   - Total fixed/sticky bar height = **84px**.
2. **Rigid Viewport Clipping & Negative Centering**:
   - `#product-overview` previously used `lg:h-[calc(100svh-84px)] lg:max-h-[884px] lg:overflow-hidden` with `my-auto justify-center` on the `.apple-rail-bento` child.
   - On screens where the viewport height is less than ~850px (e.g. 1366x768 or 1440x900 laptops with browser chrome), the content inside the right column (~600px) exceeded the container.
   - Flexbox `justify-center` / `my-auto` centered the oversized content, pushing the top 40-60px into negative Y space.
   - Combined with `lg:overflow-hidden` and the 84px top navbar/breadcrumbs, the top of the main gallery stage (including SKU & MOQ badges) and the product title (`<h1>`) were completely clipped and hidden beneath the top navbar.

### B. Section-Level Misalignment ("产品详情页的区块没有对齐")
1. **Overview Grid Top Baseline**:
   - Left column (`product-gallery-col`) and right column (`product-info-col`) previously had mismatched vertical paddings and stretching behavior (`h-full justify-between`).
2. **Container Rail Mismatch**:
   - Breadcrumbs bar used `apple-rail-bento` (max 1360px).
   - `#product-overview` used `apple-rail-bento` (max 1360px).
   - `#product-story` had an inner `max-w-4xl mx-auto` (896px) centering constraint, which indented its content and headings by over 230px relative to the overview and specs sections above and below it.
   - `#specs` used `apple-rail-bento` (max 1360px).
   - This caused headings and content edges to jump back and forth as users scrolled down.

---

## 2. Implemented Architecture & Solutions

### 1. Robust Spacing & Overflow Removal in `#product-overview`
- **Removed Rigid Height & Overflow Clipping**: Replaced `lg:h-[calc(100svh-84px)] lg:overflow-hidden` with responsive padding `w-full pt-4 pb-8 sm:pt-6 sm:pb-10 lg:pt-6 lg:pb-12 border-b border-black/5 bg-white overflow-visible`.
- **Top-Aligned Grid Baseline**: Changed grid to `grid items-start gap-6 xl:gap-8`. Both the gallery (thumbnails & main image stage) and product info (status badge & product title) now start at the exact same horizontal top baseline.
- **Stable Gallery Aspect Ratio**: Defined main viewport box as `order-1 lg:order-2 relative w-full flex-1 aspect-square sm:aspect-[4/3] lg:aspect-[4/3] rounded-2xl`, ensuring gallery height is consistent, predictable, and never overlaps.
- **Right Column Proportional Flow**: Changed `product-info-col` from `h-full justify-between py-0.5 space-y-2 lg:space-y-0` to `flex flex-col justify-start space-y-3.5 sm:space-y-4`, eliminating sudden layout jumps across screen heights.

### 2. Apple Bento Rail Alignment Across All Sections
- **Unified Section Margins**: Removed `max-w-4xl mx-auto` from `#product-story`. The craftsmanship story header ("CRAFTSMANSHIP & STORY / The Story Behind the Silhouette") and narrative prose now align with `apple-rail-bento`, sharing the exact same left margin and vertical grid as `#product-overview` and `#specs`.
- **Scroll Padding Anchor Protection**: Updated global `html { scroll-padding-top: 84px; }` in `src/styles/globals.css` and added `scroll-mt-24` to `#product-overview`, `#product-story`, and `#specs` so anchor links and silhouette navigations never scroll behind the sticky 84px header.

### 3. Synchronized Transition Skeleton
- Updated `src/components/AppleProductDetailSkeleton.astro` to match the exact `pt-4 pb-8 sm:pt-6 sm:pb-10 lg:pt-6 lg:pb-12` padding, `items-start` grid alignment, and aspect ratio, ensuring zero Cumulative Layout Shift (CLS = 0) during silhouette navigation.

### 4. Cloudflare Worker SSR Compatibility
- Verified that all components rendered in PDP are native `.astro` components (including `MarkdownRenderer.astro`), ensuring 100% compliance with Cloudflare Workers SSR.

---

## 3. Verification Summary
- **Applet Compilation**: `compile_applet` passed successfully.
- **Production Cloudflare Build**: `npm run build` executed in 2.6s with zero errors, outputting the SSR server bundle.
- **HTTP Endpoint Check**: Local runtime verified at `HTTP 200 OK` (357,454 bytes) with active breadcrumbs, overview, story narrative, and specs.
