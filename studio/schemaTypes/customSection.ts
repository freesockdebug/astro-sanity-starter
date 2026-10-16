import {defineField, defineType} from 'sanity'
import {DashboardIcon} from '@sanity/icons/Dashboard'
import {EditIcon} from '@sanity/icons/Edit'
import {ImageIcon} from '@sanity/icons/Image'
import {SquareIcon} from '@sanity/icons/Square'
import {BarChartIcon} from '@sanity/icons/BarChart'
import {ThLargeIcon} from '@sanity/icons/ThLarge'
import {DoubleQuoteIcon} from '@sanity/icons/DoubleQuote'
import {SplitHorizontalIcon} from '@sanity/icons/SplitHorizontal'

export default defineType({
  name: 'customSection',
  title: '🎨 自由积木排版版块 (Modular Block Section)',
  type: 'object',
  icon: DashboardIcon,
  fieldsets: [
    {
      name: 'advancedLayout',
      title: '⚙️ 进阶排版与视口微调 (高级开发者可选 - 预设已默认最优)',
      options: {collapsible: true, collapsed: true},
    },
  ],
  fields: [
    defineField({
      name: 'adminLabel',
      title: 'Admin Label (版块管理别名 / 备注)',
      description: '【推荐填写】方便在页面版块列表中快速识别（如：春季面料专区、工坊大牌背书等）',
      type: 'string',
    }),

    // 0. 核心场景预设：降低积木搭建难度
    defineField({
      name: 'preset',
      title: '📐 页面屏幕场景预设 (Screen Presets)',
      description: '【降低拼积木难度核心】一键选择经典成熟的屏幕空间分配方案，系统自动锁定各积木高度、宽度与边距比例，无需手动记参数。',
      type: 'string',
      options: {
        list: [
          {
            title: '🔬 双图工坊对比屏 (Dual Compare Screen - 100svh 满屏自适应，头部20% / 图片60% / 指标20%)',
            value: 'dual-compare',
          },
          {
            title: '🎬 宽幅大片沉浸屏 (Cinematic Hero Screen - 宽屏巨幕焦点 + 行动呼吁)',
            value: 'cinematic-hero',
          },
          {
            title: '⚖️ 左右双栏工坊屏 (Split 6:4 / 5:5 Stage - 图文并茂横向展开，杜绝纵向挤压)',
            value: 'split-showcase',
          },
          {
            title: '🍱 Bento 苹果风特性矩阵 (Bento Matrix - 模块化特性卡片阵列)',
            value: 'bento-grid',
          },
          {
            title: '🧩 自由原子拼接 (Custom Freeflow - 进阶高级自定义)',
            value: 'custom-free',
          },
        ],
        layout: 'radio',
      },
      initialValue: 'dual-compare',
    }),

    // 1. 容器主题配色
    defineField({
      name: 'theme',
      title: 'Theme & Background (视觉背景配色)',
      description: '选择本版块的整体视觉基调',
      type: 'string',
      options: {
        list: [
          {title: '⚪ 纯白极简 (Clean White)', value: 'light'},
          {title: '🔘 浅灰微质感 (Subtle Gray #f5f5f7 - Apple 风格)', value: 'subtle'},
          {title: '⚫ 极夜深黑 (Onyx Black)', value: 'dark'},
          {title: '🌌 极夜冷光微渐变 (Obsidian Dark Gradient)', value: 'gradient-dark'},
        ],
      },
      initialValue: 'light',
    }),

    // 进阶参数（默认折叠）：供高级场景精确调参
    defineField({
      name: 'sectionHeight',
      title: 'Section Height Mode (版块高度与视口满屏适配)',
      description: '控制本版块是随内容自由撑开，还是精准填充占满一整屏',
      type: 'string',
      fieldset: 'advancedLayout',
      options: {
        list: [
          {title: '🌟 精准占满一屏且不溢出 (100dvh Exact Fit)', value: 'screen-fit'},
          {title: '📐 至少占满一整屏 (Min 100dvh)', value: 'screen-min'},
          {title: '🎯 四分之三屏 (75dvh Focus)', value: 'screen-75'},
          {title: '🌓 半屏展示 (50dvh Half Screen)', value: 'screen-50'},
          {title: '📦 内容自适应 (Content Auto - 随内容自然撑开)', value: 'auto'},
        ],
      },
      initialValue: 'screen-fit',
    }),
    defineField({
      name: 'verticalAlign',
      title: 'Vertical Content Alignment (满屏时视口垂直对齐)',
      type: 'string',
      fieldset: 'advancedLayout',
      options: {
        list: [
          {title: '垂直居中 (Center)', value: 'center'},
          {title: '首尾分布 (Space Between)', value: 'between'},
          {title: '靠顶对齐 (Top)', value: 'start'},
          {title: '靠底对齐 (Bottom)', value: 'end'},
        ],
      },
      initialValue: 'center',
    }),
    defineField({
      name: 'preventOverflow',
      title: 'Prevent Media Overflow (智能防溢出缩放)',
      type: 'boolean',
      fieldset: 'advancedLayout',
      initialValue: true,
    }),
    defineField({
      name: 'containerWidth',
      title: 'Container Max Width (容器最大宽度)',
      type: 'string',
      fieldset: 'advancedLayout',
      options: {
        list: [
          {title: '标准宽幅 (Max-w-6xl / 1152px)', value: 'standard'},
          {title: '豪华大屏 (Max-w-7xl / 1280px)', value: 'wide'},
          {title: '紧凑叙事 (Max-w-3xl / 768px)', value: 'narrow'},
          {title: '100% 全屏贴边 (Full Bleed)', value: 'full'},
        ],
      },
      initialValue: 'wide',
    }),
    defineField({
      name: 'paddingY',
      title: 'Vertical Spacing (上下留白密度)',
      type: 'string',
      fieldset: 'advancedLayout',
      options: {
        list: [
          {title: '零留白 (None - 0px)', value: 'none'},
          {title: '紧凑 (Compact - 48px)', value: 'compact'},
          {title: '标准 (Standard - 96px)', value: 'standard'},
          {title: '留白大气 (Spacious - 144px)', value: 'spacious'},
        ],
      },
      initialValue: 'standard',
    }),
    defineField({
      name: 'layoutMode',
      title: 'Layout Structure (排版分栏架构)',
      type: 'string',
      fieldset: 'advancedLayout',
      options: {
        list: [
          {title: '垂直单列流 (Vertical Stream Flow)', value: 'flow'},
          {title: '双列分栏 5:5 对称 (5:5 Split Grid)', value: 'split-50-50'},
          {title: '双列分栏 6:4 左大右小 (6:4 Split)', value: 'split-60-40'},
          {title: '双列分栏 4:6 左小右大 (4:6 Split)', value: 'split-40-60'},
        ],
      },
      initialValue: 'flow',
    }),

    // 核心积木流
    defineField({
      name: 'blocks',
      title: 'Blocks Stream (自由积木流 - 可任意增删与上下拖动排序)',
      description: '💡 点击下方 "Add item..." 随时插入标题文案、高精多媒体、数据指标、按钮组、Bento卡片等；按住左侧手柄直接拖拽即可调整排版上下位置',
      type: 'array',
      of: [
        // 积木 1: 标题与文本
        {
          name: 'headingBlock',
          title: '✍️ 标题与叙事文本 (Heading & Text)',
          type: 'object',
          icon: EditIcon,
          fields: [
            defineField({
              name: 'badge',
              title: 'Badge Label (顶部胶囊眉标)',
              type: 'string',
            }),
            defineField({
              name: 'headline',
              title: 'Headline (主标题 - 支持句号两段式灰度对比)',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'subtitle',
              title: 'Subtitle / Narrative (副标题或说明段落)',
              type: 'text',
              rows: 3,
            }),
            defineField({
              name: 'align',
              title: 'Text Alignment (对齐方式)',
              type: 'string',
              options: {
                list: [
                  {title: '居左对齐 (Left)', value: 'left'},
                  {title: '居中对齐 (Center)', value: 'center'},
                  {title: '居右对齐 (Right)', value: 'right'},
                ],
              },
              initialValue: 'left',
            }),
            defineField({
              name: 'size',
              title: 'Title Scale (标题字号层级)',
              type: 'string',
              options: {
                list: [
                  {title: '超大巨幕 (Hero Scale - 48~64px)', value: 'hero'},
                  {title: '标配章节 (Section Scale - 36~48px)', value: 'section'},
                  {title: '紧凑卡片 (Compact Scale - 24~32px)', value: 'compact'},
                ],
              },
              initialValue: 'section',
            }),
          ],
          preview: {
            select: {title: 'headline', subtitle: 'badge'},
            prepare({title, subtitle}) {
              return {
                title: `✍️ [标题文本] ${title || '未命名标题'}`,
                subtitle: subtitle ? `眉标: ${subtitle}` : '标题与文本块',
              }
            },
          },
        },

        // 积木 2: 高精多媒体框
        {
          name: 'mediaBlock',
          title: '🖼️ 高精多媒体框 (Image & Media Frame)',
          type: 'object',
          icon: ImageIcon,
          fields: [
            defineField({
              name: 'mediaType',
              title: 'Media Mode (展示模式)',
              type: 'string',
              options: {
                list: [
                  {title: '单张高精大图 (Single Image)', value: 'single'},
                  {title: '双图对比特写 (Dual Comparison Images)', value: 'dual'},
                ],
              },
              initialValue: 'single',
            }),
            defineField({
              name: 'image',
              title: 'Primary Image (主图)',
              type: 'image',
              options: {hotspot: true},
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'secondaryImage',
              title: 'Secondary Image (对比副图 - 仅双图模式生效)',
              type: 'image',
              options: {hotspot: true},
            }),
            defineField({
              name: 'aspectRatio',
              title: 'Aspect Ratio (画幅比例)',
              type: 'string',
              options: {
                list: [
                  {title: '16:9 宽屏', value: '16/9'},
                  {title: '4:3 经典工坊比例', value: '4/3'},
                  {title: '1:1 正方形精细特写', value: '1/1'},
                  {title: '21:9 超宽电影级', value: '21/9'},
                  {title: '自适应原图高度 (Auto)', value: 'auto'},
                ],
              },
              initialValue: '16/9',
            }),
            defineField({
              name: 'rounded',
              title: 'Corner Radius (圆角弧度)',
              type: 'string',
              options: {
                list: [
                  {title: 'Apple 经典圆角 (24px)', value: '2xl'},
                  {title: '超大柔和圆角 (36px)', value: '3xl'},
                  {title: '直角利落 (None)', value: 'none'},
                  {title: '胶囊全圆角 (Full)', value: 'full'},
                ],
              },
              initialValue: '2xl',
            }),
            defineField({
              name: 'shadow',
              title: 'Elevation Shadow (悬浮光影)',
              type: 'string',
              options: {
                list: [
                  {title: '柔和高级悬浮阴影 (Soft Shadow)', value: 'soft'},
                  {title: '边缘微光立体感 (Border Glow)', value: 'glow'},
                  {title: '平顺无阴影 (Flat)', value: 'none'},
                ],
              },
              initialValue: 'soft',
            }),
            defineField({
              name: 'caption',
              title: 'Caption / Note (底部小字说明)',
              type: 'string',
            }),
          ],
          preview: {
            select: {media: 'image', caption: 'caption', ratio: 'aspectRatio'},
            prepare({media, caption, ratio}) {
              return {
                title: `🖼️ [多媒体框] ${caption || '高精大图'}`,
                subtitle: `比例: ${ratio || '16/9'}`,
                media,
              }
            },
          },
        },

        // 积木 3: 全能操作按钮组
        {
          name: 'buttonGroupBlock',
          title: '🔘 全能操作按钮组 (Action Buttons Group)',
          type: 'object',
          icon: SquareIcon,
          fields: [
            defineField({
              name: 'align',
              title: 'Alignment (按钮对齐)',
              type: 'string',
              options: {
                list: [
                  {title: '居左对齐 (Left)', value: 'left'},
                  {title: '居中对齐 (Center)', value: 'center'},
                  {title: '居右对齐 (Right)', value: 'right'},
                ],
              },
              initialValue: 'left',
            }),
            defineField({
              name: 'buttons',
              title: 'Button List (按钮列表)',
              type: 'array',
              of: [
                {
                  type: 'object',
                  fields: [
                    defineField({
                      name: 'label',
                      title: 'Button Text (按钮文字)',
                      type: 'string',
                      validation: (Rule) => Rule.required(),
                    }),
                    defineField({
                      name: 'actionType',
                      title: 'Action Trigger (点击行为)',
                      description: '可选择普通 URL 页面跳转，或直接呼出右侧询价索样抽屉',
                      type: 'string',
                      options: {
                        list: [
                          {title: '🌐 页面跳转链接 (URL / Anchor)', value: 'url'},
                          {title: '⚡ 一键打开询价索样抽屉 (Open Quote Drawer)', value: 'rfqDrawer'},
                        ],
                      },
                      initialValue: 'url',
                    }),
                    defineField({
                      name: 'url',
                      title: 'Destination URL (目标链接 - actionType 为 URL 时生效)',
                      type: 'string',
                      initialValue: '#inquiry',
                    }),
                    defineField({
                      name: 'sku',
                      title: 'Custom Swatch Kit SKU (专属样卡编号 - 呼出抽屉时生效)',
                      description: '留空则默认装载官方标准样卡',
                      type: 'string',
                    }),
                    defineField({
                      name: 'style',
                      title: 'Button Style (视觉样式)',
                      type: 'string',
                      options: {
                        list: [
                          {title: '⚫ 黑色实心 (Dark Solid)', value: 'primary'},
                          {title: '🔘 浅灰胶囊 (Subtle Capsule)', value: 'secondary'},
                          {title: '🔲 细线微光 (Outline)', value: 'outline'},
                          {title: '🔗 文字带箭头 (Text Link with Arrow)', value: 'link'},
                        ],
                      },
                      initialValue: 'primary',
                    }),
                  ],
                  preview: {
                    select: {label: 'label', style: 'style', actionType: 'actionType'},
                    prepare({label, style, actionType}) {
                      return {
                        title: label || '未命名按钮',
                        subtitle: `${style} · 行为: ${actionType === 'rfqDrawer' ? '呼出询价抽屉' : '跳转链接'}`,
                      }
                    },
                  },
                },
              ],
            }),
          ],
          preview: {
            select: {buttons: 'buttons', align: 'align'},
            prepare({buttons, align}) {
              const count = Array.isArray(buttons) ? buttons.length : 0;
              return {
                title: `🔘 [按钮组] 包含 ${count} 个按钮`,
                subtitle: `对齐: ${align || 'left'}`,
              }
            },
          },
        },

        // 积木 4: 核心数据指标流
        {
          name: 'metricGridBlock',
          title: '📊 核心数据指标流 (Stat & Metrics Counters)',
          type: 'object',
          icon: BarChartIcon,
          fields: [
            defineField({
              name: 'columns',
              title: 'Columns Count (展示列数)',
              type: 'number',
              options: {
                list: [
                  {title: '2 列', value: 2},
                  {title: '3 列', value: 3},
                  {title: '4 列', value: 4},
                ],
              },
              initialValue: 3,
            }),
            defineField({
              name: 'metrics',
              title: 'Metrics Items (指标列表)',
              type: 'array',
              of: [
                {
                  type: 'object',
                  fields: [
                    defineField({
                      name: 'value',
                      title: 'Metric Value (核心数字/参数，如 200N, 0mm, 48h, 99.8%)',
                      type: 'string',
                      validation: (Rule) => Rule.required(),
                    }),
                    defineField({
                      name: 'label',
                      title: 'Metric Label (指标名称，如 Needle Density, Hand Linking)',
                      type: 'string',
                      validation: (Rule) => Rule.required(),
                    }),
                    defineField({
                      name: 'desc',
                      title: 'Brief Description (辅助补充说明)',
                      type: 'string',
                    }),
                  ],
                  preview: {
                    select: {value: 'value', label: 'label'},
                    prepare({value, label}) {
                      return {
                        title: `${value || ''} - ${label || ''}`,
                      }
                    },
                  },
                },
              ],
            }),
          ],
          preview: {
            select: {metrics: 'metrics'},
            prepare({metrics}) {
              const count = Array.isArray(metrics) ? metrics.length : 0;
              return {
                title: `📊 [数据指标流] 包含 ${count} 项硬核参数`,
              }
            },
          },
        },

        // 积木 5: Bento 苹果风卡片矩阵
        {
          name: 'bentoCardBlock',
          title: '🍱 Bento 苹果风卡片矩阵 (Bento Cards Grid)',
          type: 'object',
          icon: ThLargeIcon,
          fields: [
            defineField({
              name: 'columns',
              title: 'Grid Columns (桌面端网格列数)',
              type: 'number',
              options: {
                list: [
                  {title: '2 列标准网格', value: 2},
                  {title: '3 列豪华网格', value: 3},
                ],
              },
              initialValue: 3,
            }),
            defineField({
              name: 'cards',
              title: 'Cards List (卡片列表)',
              type: 'array',
              of: [
                {
                  type: 'object',
                  fields: [
                    defineField({
                      name: 'span',
                      title: 'Card Span (跨列宽度)',
                      type: 'string',
                      options: {
                        list: [
                          {title: '单列常规卡片 (1 Column)', value: 'span-1'},
                          {title: '双列大焦点卡片 (Span 2 Columns)', value: 'span-2'},
                        ],
                      },
                      initialValue: 'span-1',
                    }),
                    defineField({
                      name: 'tag',
                      title: 'Top Kicker Tag (标号或分类，如 01, LONATI, OEKO-TEX)',
                      type: 'string',
                    }),
                    defineField({
                      name: 'title',
                      title: 'Card Title (卡片标题)',
                      type: 'string',
                      validation: (Rule) => Rule.required(),
                    }),
                    defineField({
                      name: 'desc',
                      title: 'Card Description (详细阐述)',
                      type: 'text',
                      rows: 3,
                    }),
                    defineField({
                      name: 'image',
                      title: 'Card Illustration Image (卡片配图 - 可选)',
                      type: 'image',
                      options: {hotspot: true},
                    }),
                  ],
                  preview: {
                    select: {title: 'title', tag: 'tag', span: 'span', media: 'image'},
                    prepare({title, tag, span, media}) {
                      return {
                        title: `${title || '未命名卡片'} (${span === 'span-2' ? '跨双列' : '单列'})`,
                        subtitle: tag ? `标签: ${tag}` : '',
                        media,
                      }
                    },
                  },
                },
              ],
            }),
          ],
          preview: {
            select: {cards: 'cards'},
            prepare({cards}) {
              const count = Array.isArray(cards) ? cards.length : 0;
              return {
                title: `🍱 [Bento卡片组] 包含 ${count} 个特性卡片`,
              }
            },
          },
        },

        // 积木 6: 工坊语录与品牌引言
        {
          name: 'quoteBlock',
          title: '💬 工坊语录与品牌引言 (Quote & Testimonial)',
          type: 'object',
          icon: DoubleQuoteIcon,
          fields: [
            defineField({
              name: 'quote',
              title: 'Quote Statement (引言正文)',
              type: 'text',
              rows: 3,
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'author',
              title: 'Author Name (签署人姓名 / 匠人)',
              type: 'string',
            }),
            defineField({
              name: 'company',
              title: 'Organization / Role (头衔或品牌机构)',
              type: 'string',
            }),
            defineField({
              name: 'avatar',
              title: 'Avatar or Monogram (头像或印章)',
              type: 'image',
              options: {hotspot: true},
            }),
          ],
          preview: {
            select: {title: 'author', subtitle: 'quote', media: 'avatar'},
            prepare({title, subtitle, media}) {
              return {
                title: `💬 [语录引言] ${title || '工坊评语'}`,
                subtitle: subtitle ? `“${subtitle.slice(0, 40)}...”` : '',
                media,
              }
            },
          },
        },

        // 积木 7: 装饰分隔线与微光留白
        {
          name: 'dividerBlock',
          title: '➖ 装饰分隔线与留白 (Divider & Spacer)',
          type: 'object',
          icon: SplitHorizontalIcon,
          fields: [
            defineField({
              name: 'style',
              title: 'Divider Style (风格样式)',
              type: 'string',
              options: {
                list: [
                  {title: '细线极简分隔 (Subtle Hairline)', value: 'line'},
                  {title: '柔光渐变分割 (Radial Glow Line)', value: 'glow'},
                  {title: '纯留白占位 (Blank Spacer)', value: 'spacer'},
                ],
              },
              initialValue: 'line',
            }),
            defineField({
              name: 'height',
              title: 'Spacing Height (垂直占位高度)',
              type: 'string',
              options: {
                list: [
                  {title: '小 (24px)', value: 'small'},
                  {title: '中 (48px)', value: 'medium'},
                  {title: '大 (96px)', value: 'large'},
                ],
              },
              initialValue: 'medium',
            }),
          ],
          preview: {
            select: {style: 'style', height: 'height'},
            prepare({style, height}) {
              return {
                title: `➖ [装饰分隔] 风格: ${style || 'line'} (高度: ${height || 'medium'})`,
              }
            },
          },
        },
      ],
    }),
  ],
  preview: {
    select: {
      adminLabel: 'adminLabel',
      preset: 'preset',
      theme: 'theme',
      layoutMode: 'layoutMode',
      sectionHeight: 'sectionHeight',
      blocks: 'blocks',
    },
    prepare({adminLabel, preset, theme, layoutMode, sectionHeight, blocks}) {
      const count = Array.isArray(blocks) ? blocks.length : 0;
      const presetMap: Record<string, string> = {
        'dual-compare': '🔬 双图对比屏',
        'cinematic-hero': '🎬 宽幅大片沉浸屏',
        'split-showcase': '⚖️ 左右双栏工坊屏',
        'bento-grid': '🍱 Bento特性矩阵',
        'custom-free': '🧩 自由拼接',
      };
      const themeMap: Record<string, string> = {
        light: '纯白',
        subtle: '浅灰',
        dark: '极黑',
        'gradient-dark': '深色渐变',
      };
      const name = adminLabel || '未命名积木版块';
      const presetName = presetMap[preset] || (sectionHeight === 'screen-fit' ? '🔬 双图对比屏' : '🧩 自由排版');
      return {
        title: `🎨 [积木版块] ${name}`,
        subtitle: `场景: ${presetName} · 主题: ${themeMap[theme] || '纯白'} · 积木: ${count} 个 (可直接拖拽调整顺序)`,
      }
    },
  },
})
