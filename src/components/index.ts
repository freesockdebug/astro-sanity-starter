// src/components/index.ts
/**
 * Central registry and component map for all site sections
 */
import SectionBoundary from './SectionBoundary.astro';
import StoreHero from './StoreHero.astro';
import BentoSpecMatrix from './BentoSpecMatrix.astro';
import ProductCollections from './ProductCollections.astro';
import ManufacturingCapabilities from './ManufacturingCapabilities.astro';
import SwatchInquiry from './SwatchInquiry.astro';
import CustomSection from './CustomSection.astro';
import StoreNav from './StoreNav.astro';
import StoreFooter from './StoreFooter.astro';
import QuoteDrawer from './QuoteDrawer.astro';
import StageNavigator from './StageNavigator.astro';
import WhatsAppWidget from './WhatsAppWidget.astro';
import LanguagePicker from './LanguagePicker.astro';
import SEO from './SEO.astro';
import ProductGridSkeleton from './ProductGridSkeleton.astro';
import Breadcrumbs from './Breadcrumbs.astro';
import MarkdownRenderer from './MarkdownRenderer.astro';
import LocalTime from './LocalTime.astro';
import NotFoundView from './NotFoundView.astro';
import ThemeProvider from './ThemeProvider.astro';

export {
  SectionBoundary,
  StoreHero,
  BentoSpecMatrix,
  ProductCollections,
  ManufacturingCapabilities,
  SwatchInquiry,
  CustomSection,
  StoreNav,
  StoreFooter,
  QuoteDrawer,
  StageNavigator,
  WhatsAppWidget,
  LanguagePicker,
  SEO,
  ProductGridSkeleton,
  Breadcrumbs,
  MarkdownRenderer,
  LocalTime,
  NotFoundView,
  ThemeProvider,
};

/**
 * Standard Sanity schema block to Astro component mapping
 */
export const componentMap: Record<string, any> = {
  heroSection: StoreHero,
  featureMatrixSection: BentoSpecMatrix,
  productShowcaseSection: ProductCollections,
  manufacturingSection: ManufacturingCapabilities,
  inquirySection: SwatchInquiry,
  customSection: CustomSection,
};
