import {defineField, defineType} from 'sanity'
import {ThListIcon} from '@sanity/icons/ThList'

export default defineType({
  name: 'category',
  title: 'Product Categories (产品类别配置)',
  type: 'document',
  icon: ThListIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Category Title (类别名称)',
      description: 'e.g. Mulberry Silk, Cashmere & Wool, Sheer & Tights, Combed Cotton',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug (唯一路径/筛选标识)',
      description: '用于前端陈列大厅分类筛选的 URL/key 标识，如 silk, cashmere, sheer, cotton, terry',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description (分类简介 / 材质特性说明)',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'order',
      title: 'Sort Order (显示排序权重，数字越小越靠前)',
      type: 'number',
      initialValue: 10,
    }),
  ],
  orderings: [
    {
      title: 'Display Order',
      name: 'orderAsc',
      by: [
        {field: 'order', direction: 'asc'},
        {field: 'title', direction: 'asc'},
      ],
    },
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'slug.current',
    },
  },
})
