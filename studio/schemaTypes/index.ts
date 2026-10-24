// 1. Independent Document Types (独立实体与配置文档)
import page from './page'
import product from './product'
import category from './category'
import inquiry from './inquiry'
import siteConfig from './siteConfig'
import rfqSettings from './rfqSettings'
import catalogSettings from './catalogSettings'
import productStorySettings from './productStorySettings'

// 2. Reusable Page Section Blocks (页面可拖拽积木块)
import heroSection from './heroSection'
import featureMatrixSection from './featureMatrixSection'
import productShowcaseSection from './productShowcaseSection'
import manufacturingSection from './manufacturingSection'
import inquirySection from './inquirySection'
import customSection from './customSection'

// 3. Shared Objects & Primitive Types (通用基础对象)
import actionButton from './actionButton'
import actionLink from './actionLink'
import customImage from './customImage'
import header from './header'
import footer from './footer'
import localeString from './localeString'
import localeText from './localeText'
import localeMarkdown from './localeMarkdown'

export const documentTypes = [
  page,
  product,
  category,
  inquiry,
  siteConfig,
  rfqSettings,
  catalogSettings,
  productStorySettings,
]

export const sectionTypes = [
  heroSection,
  featureMatrixSection,
  productShowcaseSection,
  manufacturingSection,
  inquirySection,
  customSection,
]

export const objectTypes = [
  actionButton,
  actionLink,
  customImage,
  header,
  footer,
  localeString,
  localeText,
  localeMarkdown,
]

export const schemaTypes = [
  ...documentTypes,
  ...sectionTypes,
  ...objectTypes,
]

