import { StructureResolver, DefaultDocumentNodeResolver } from 'sanity/structure'
import { HomeIcon } from '@sanity/icons/Home'
import { TagIcon } from '@sanity/icons/Tag'
import { ThListIcon } from '@sanity/icons/ThList'
import { MasterDetailIcon } from '@sanity/icons/MasterDetail'
import { DocumentsIcon } from '@sanity/icons/Documents'
import { CogIcon } from '@sanity/icons/Cog'
import { ArchiveIcon } from '@sanity/icons/Archive'
import { EnvelopeIcon } from '@sanity/icons/Envelope'
import { BoltIcon } from '@sanity/icons/Bolt'
import { SyncIcon } from '@sanity/icons/Sync'
import { PageLivePreview } from './components/PageLivePreview'
import { CachePurgeDashboard } from './components/CachePurgeDashboard'
import { SchemaSyncDashboard } from './components/SchemaSyncDashboard'

export const defaultDocumentNode: DefaultDocumentNodeResolver = (S, { schemaType }) => {
  if (schemaType === 'page') {
    return S.document().views([
      S.view.form().id('editor').title('📝 内容与积木编辑'),
      S.view.component(PageLivePreview).id('visual-builder').title('🎨 可视化拖拽编排 (Visual Builder)'),
    ])
  }
  return undefined
}

export const deskStructure: StructureResolver = (S) =>
  S.list()
    .id('root')
    .title('Content')
    .items([
      // 1. Quick access to Home Page
      S.listItem()
        .id('homepage')
        .title('🏠 Homepage (首页内容与版块)')
        .icon(HomeIcon)
        .child(
          S.document()
            .schemaType('page')
            .documentId('a59d87e4-e3ff-4929-acc1-d67b1808d36c')
            .title('Homepage 编辑')
            .views([
              S.view.form().id('editor').title('📝 内容与积木编辑'),
              S.view.component(PageLivePreview).id('visual-builder').title('🎨 可视化拖拽编排 (Visual Builder)'),
            ])
        ),

      // 2. Products Catalog
      S.listItem()
        .id('products')
        .title('📦 Products (产品款式与订货目录)')
        .icon(TagIcon)
        .schemaType('product')
        .child(S.documentTypeList('product').title('全部产品款式')),

      // 2.1 Product Categories
      S.listItem()
        .id('categories')
        .title('🏷️ Categories (产品类别配置)')
        .icon(ThListIcon)
        .schemaType('category')
        .child(S.documentTypeList('category').title('全部产品类别')),

      // 2.2 Product Catalog Page Settings
      S.listItem()
        .id('catalogSettings')
        .title('🏛️ Catalog Settings (产品大厅页面配置)')
        .icon(MasterDetailIcon)
        .child(
          S.document()
            .schemaType('catalogSettings')
            .documentId('catalogSettings')
            .title('产品陈列大厅页面配置')
        ),

      // 3. All Pages (About, Contact, Private Label)
      S.listItem()
        .id('pages')
        .title('📄 Pages (独立页面管理)')
        .icon(DocumentsIcon)
        .schemaType('page')
        .child(S.documentTypeList('page').title('全部前台页面')),

      // 4. B2B RFQ Components & Drawer Settings
      S.listItem()
        .id('rfqSettings')
        .title('💬 B2B RFQ Settings (询盘车与组件文案配置)')
        .icon(EnvelopeIcon)
        .child(
          S.document()
            .schemaType('rfqSettings')
            .documentId('rfqSettings')
            .title('B2B 询盘车与全站按钮文案配置')
        ),

      // 5. B2B RFQ Inquiries (Inbox)
      S.listItem()
        .id('inquiries')
        .title('📬 B2B Inquiries (询盘与打样管理/收件箱)')
        .icon(ArchiveIcon)
        .schemaType('inquiry')
        .child(S.documentTypeList('inquiry').title('全部采购商询盘与打样申请')),

      // 6. Site Settings (Brand, Nav, Footer)
      S.listItem()
        .id('settings')
        .title('⚙️ Site Settings (全站品牌与导航)')
        .icon(CogIcon)
        .child(
          S.document()
            .schemaType('siteConfig')
            .documentId('427de992-8d59-40a3-af5f-2f83675af6c3')
            .title('全局品牌与页头页尾')
        ),

      // 7. Cloudflare Edge & CDN Cache Purge
      S.listItem()
        .id('cachePurge')
        .title('⚡ Cloudflare 缓存清理 (CDN & Edge)')
        .icon(BoltIcon)
        .child(
          S.component(CachePurgeDashboard)
            .title('Cloudflare 边缘缓存与 CDN 快速刷新')
            .id('cache-purge-view')
        ),

      // 8. Schema & Frontend Projection Sync Dashboard
      S.listItem()
        .id('schemaSync')
        .title('🔄 Schema 与前端数据同步看板')
        .icon(SyncIcon)
        .child(
          S.component(SchemaSyncDashboard)
            .title('Schema 与前端 GROQ/TS 契约同步看板')
            .id('schema-sync-view')
        ),
    ])
