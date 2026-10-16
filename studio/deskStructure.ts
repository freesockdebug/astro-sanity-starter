import { StructureResolver } from 'sanity/structure'
import { HomeIcon } from '@sanity/icons/Home'
import { TagIcon } from '@sanity/icons/Tag'
import { DocumentsIcon } from '@sanity/icons/Documents'
import { CogIcon } from '@sanity/icons/Cog'
import { ArchiveIcon } from '@sanity/icons/Archive'
import { EnvelopeIcon } from '@sanity/icons/Envelope'

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
        ),

      // 2. Products / Hosiery Catalog
      S.listItem()
        .id('products')
        .title('🧦 Products (女袜款式与订货)')
        .icon(TagIcon)
        .schemaType('product')
        .child(S.documentTypeList('product').title('全部女袜款式')),

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

      // 5. Site Settings (Brand, Nav, Footer)
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
    ])
