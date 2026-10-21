import {defineField, defineType} from 'sanity'
import {SquareIcon} from '@sanity/icons/Square'
export default defineType({
  name: 'header',
  title: 'Header',
  type: 'object',
  icon: SquareIcon,
  groups: [
    {
      name: 'content',
      title: 'Content',
      default: true,
    },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Brand Title (品牌纯名，如 GWENVENNI)',
      type: 'string',
      description: 'Apple 规范：建议填写纯净品牌英文字符，不带第三方平台前缀或后缀',
      validation: (Rule) => Rule.required(),
      group: 'content',
    }),
    defineField({
      name: 'subtitle',
      title: 'Brand Subtitle / Tagline (内部副标/无障碍描述)',
      type: 'string',
      description: '前台按照 Apple 48px 极简顶栏标准默认仅展示纯净品牌名',
      initialValue: 'LUXURY ATELIER · B2B',
      group: 'content',
    }),
    defineField({
      name: 'logo',
      title: 'Logo (品牌图片 Logo，可选)',
      type: 'customImage',
      group: 'content',
    }),
    defineField({
      name: 'showActionButton',
      title: 'Show Action Button (是否显示右上角操作按钮)',
      description: '控制顶部导航栏右上角的按钮是否展示',
      type: 'boolean',
      initialValue: false,
      group: 'content',
    }),
    defineField({
      name: 'navLinks',
      title: 'Navigation Links (导航菜单项与按钮)',
      type: 'array',
      of: [{type: 'actionButton'}, {type: 'actionLink'}],
      group: 'content',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      media: 'logo.image.asset',
    },
    prepare(selection: any) {
      return {
        title: selection?.title ? String(selection.title) : 'Header',
        media: selection?.media,
      }
    },
  },
})
