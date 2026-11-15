// src/components/index.ts
/**
 * Central registry and component map for all site sections
 */
import SectionBoundary from './SectionBoundary.astro';
import AppleHero from './AppleHero.astro';
import BentoSpecMatrix from './BentoSpecMatrix.astro';
import ProductCollections from './ProductCollections.astro';
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
import AppleProductGridSkeleton from './AppleProductGridSkeleton.astro';
import Breadcrumbs from './Breadcrumbs.astro';
import MarkdownRenderer from './MarkdownRenderer.astro';
import LocalTime from './LocalTime.astro';
import NotFoundView from './NotFoundView.astro';

export {
  SectionBoundary,
  AppleHero,
  BentoSpecMatrix,
  ProductCollections,
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
  AppleProductGridSkeleton,
  Breadcrumbs,
  MarkdownRenderer,
  LocalTime,
  NotFoundView,
};

/**
 * Standard Sanity schema block to Astro component mapping
 */
export const componentMap: Record<string, any> = {
  heroSection: AppleHero,
  featureMatrixSection: BentoSpecMatrix,
  productShowcaseSection: ProductCollections,
  manufacturingSection: ManufacturingCapabilities,
  inquirySection: SwatchInquiry,
  customSection: CustomSection,
};
