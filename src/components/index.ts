// src/components/index.ts
/**
 * Central registry and component map for all site sections
 */
import SockHero from './SockHero.astro';
import SockSpecMatrix from './SockSpecMatrix.astro';
import SockCollections from './SockCollections.astro';
import ManufacturingCapabilities from './ManufacturingCapabilities.astro';
import SwatchInquiry from './SwatchInquiry.astro';
import CustomSection from './CustomSection.astro';
import AppleNav from './AppleNav.astro';
import AppleFooter from './AppleFooter.astro';
import QuoteDrawer from './QuoteDrawer.astro';
import AppleStageNavigator from './AppleStageNavigator.astro';
import WhatsAppWidget from './WhatsAppWidget.astro';
import LanguagePicker from './LanguagePicker.astro';
import SEO from './SEO.astro';
import SchemaSyncStatus from './SchemaSyncStatus.astro';
import AppleProductGridSkeleton from './AppleProductGridSkeleton.astro';
import AppleProductDetailSkeleton from './AppleProductDetailSkeleton.astro';
import Breadcrumbs from './Breadcrumbs.astro';
import MarkdownRenderer from './MarkdownRenderer';

export {
  SockHero,
  SockSpecMatrix,
  SockCollections,
  ManufacturingCapabilities,
  SwatchInquiry,
  CustomSection,
  AppleNav,
  AppleFooter,
  QuoteDrawer,
  AppleStageNavigator,
  WhatsAppWidget,
  LanguagePicker,
  SEO,
  SchemaSyncStatus,
  AppleProductGridSkeleton,
  AppleProductDetailSkeleton,
  Breadcrumbs,
  MarkdownRenderer,
};

/**
 * Standard Sanity schema block to Astro component mapping
 */
export const componentMap: Record<string, any> = {
  heroSection: SockHero,
  featureMatrixSection: SockSpecMatrix,
  productShowcaseSection: SockCollections,
  manufacturingSection: ManufacturingCapabilities,
  inquirySection: SwatchInquiry,
  customSection: CustomSection,
  // Legacy alias support
  hosieryHeroSection: SockHero,
  hosierySpecSection: SockSpecMatrix,
  hosieryCollectionSection: SockCollections,
  hosieryManufacturingSection: ManufacturingCapabilities,
  hosieryInquirySection: SwatchInquiry,
};
