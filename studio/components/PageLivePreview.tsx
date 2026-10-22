import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useClient } from 'sanity'

interface PageLivePreviewProps {
  document?: {
    displayed?: {
      _id?: string
      _type?: string
      slug?: { current?: string }
      title?: string
      sections?: any[]
    }
    draft?: any
    published?: any
  }
  documentId?: string
}

export type DeviceMode =
  | 'desktop-full'
  | 'macbook'
  | 'laptop'
  | 'ipad-landscape'
  | 'ipad-portrait'
  | 'mobile'

export type BuilderMode = 'canvas' | 'live-iframe'

export interface DevicePreset {
  id: DeviceMode
  name: string
  width: number | string
  height: number | string
  label: string
  shortLabel: string
  icon: string
  aspect: string
  category: 'desktop' | 'laptop' | 'tablet' | 'mobile'
}

export const DEVICE_PRESETS: Record<DeviceMode, DevicePreset> = {
  'desktop-full': {
    id: 'desktop-full',
    name: '桌面全屏',
    width: '100%',
    height: '100%',
    label: '🖥️ 全宽自适应 (100%)',
    shortLabel: '🖥️ 全宽自适应',
    icon: '🖥️',
    aspect: '自适应',
    category: 'desktop',
  },
  macbook: {
    id: 'macbook',
    name: 'MacBook Pro',
    width: 1440,
    height: 900,
    label: '💻 MacBook (1440 × 900)',
    shortLabel: '💻 1440×900',
    icon: '💻',
    aspect: '16:10',
    category: 'laptop',
  },
  laptop: {
    id: 'laptop',
    name: '常见便携本',
    width: 1280,
    height: 800,
    label: '💻 笔记本 (1280 × 800)',
    shortLabel: '💻 1280×800',
    icon: '💻',
    aspect: '16:10',
    category: 'laptop',
  },
  'ipad-landscape': {
    id: 'ipad-landscape',
    name: 'iPad 横屏',
    width: 1024,
    height: 768,
    label: '📱 iPad 横屏 (1024 × 768)',
    shortLabel: '📱 1024×768',
    icon: '📱',
    aspect: '4:3',
    category: 'tablet',
  },
  'ipad-portrait': {
    id: 'ipad-portrait',
    name: 'iPad 竖屏',
    width: 768,
    height: 1024,
    label: '📱 iPad 竖屏 (768 × 1024)',
    shortLabel: '📱 768×1024',
    icon: '📱',
    aspect: '3:4',
    category: 'tablet',
  },
  mobile: {
    id: 'mobile',
    name: 'iPhone 15/16',
    width: 393,
    height: 852,
    label: '📱 iPhone (393 × 852)',
    shortLabel: '📱 393×852',
    icon: '📱',
    aspect: '9:19.5',
    category: 'mobile',
  },
}

interface BlockItem {
  _type: string
  _key: string
  [key: string]: any
}

function getSanityImageUrl(source: any): string | null {
  if (!source) return null
  if (typeof source === 'string') return source
  if (source.asset?.url) return source.asset.url
  const ref = source.asset?._ref || source._ref
  if (ref && typeof ref === 'string') {
    const match = ref.match(/^image-([a-f0-9]+)-(\d+x\d+)-([a-z0-9]+)$/)
    if (match) {
      const [, id, dims, ext] = match
      return `https://cdn.sanity.io/images/xvhhd8u0/production/${id}-${dims}.${ext}?auto=format&q=80`
    }
  }
  return null
}

function safeText(val: any, fallback = ''): string {
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object' && val !== null) {
    const extracted = val.en || val.zh || val.de || val.fr || val.es || Object.values(val)[0]
    return typeof extracted === 'string' ? extracted : fallback
  }
  return fallback
}

const PALETTE_BLOCKS = [
  {
    type: 'headingBlock',
    title: '✍️ 标题与叙事文本',
    desc: '主标题、眉标与副标题，支持以句号实现双段灰度对比',
    heightFraction: '1/5 屏',
    heightPercent: 20,
    capacityPerScreen: '单屏可放 5 个',
    capacityTip: '顶置标头 · 占 20% 高度 · 适合作首屏开篇',
    badgeBg: '#1e3a8a',
    badgeColor: '#93c5fd',
    role: '顶置标头',
    defaultData: {
      _type: 'headingBlock',
      badge: 'CRAFT & HERITAGE',
      headline: '手工精编. 意大利原产工艺',
      subtitle: '每一双袜子均出自意大利专业织机，匠心打造细腻触感。',
      align: 'center',
      size: 'section',
    },
  },
  {
    type: 'mediaBlock',
    title: '🖼️ 高精多媒体框',
    desc: '单图宽屏展台或双图等高对比展示',
    heightFraction: '3/5 屏',
    heightPercent: 60,
    capacityPerScreen: '单屏仅放 1 个',
    capacityTip: '核心展台 · 占 60% 高度 · 留 40% 给标题/指标',
    badgeBg: '#4c1d95',
    badgeColor: '#c4b5fd',
    role: '核心展台',
    defaultData: {
      _type: 'mediaBlock',
      mediaType: 'dual',
      aspectRatio: '16/10',
      rounded: '2xl',
      shadow: 'soft',
      caption: '工坊双针筒特写对比',
    },
  },
  {
    type: 'metricGridBlock',
    title: '📊 核心数据指标流',
    desc: '2~4 列硬核技术参数与工艺指标对比',
    heightFraction: '1/5 屏',
    heightPercent: 20,
    capacityPerScreen: '单屏可放 5 个',
    capacityTip: '参数指标 · 占 20% 高度 · 适合底置硬核背书',
    badgeBg: '#064e3b',
    badgeColor: '#6ee7b7',
    role: '底部背书',
    defaultData: {
      _type: 'metricGridBlock',
      columns: 3,
      metrics: [
        { _key: 'm1', value: '200N', label: 'Needle Density', desc: '高针高密织造' },
        { _key: 'm2', value: '0mm', label: 'Hand Linking', desc: '无骨手工缝头' },
        { _key: 'm3', value: '48h', label: 'Sampling Lead', desc: '极速打样出卡' },
      ],
    },
  },
  {
    type: 'bentoCardBlock',
    title: '🍱 Bento 苹果风卡片矩阵',
    desc: '多维度工艺卡片阵列，自适应网格排列',
    heightFraction: '1/2 屏',
    heightPercent: 50,
    capacityPerScreen: '单屏可放 2 个',
    capacityTip: '特性矩阵 · 占 50% 高度 · 2个可均分满屏',
    badgeBg: '#831843',
    badgeColor: '#fbcfe8',
    role: '卡片矩阵',
    defaultData: {
      _type: 'bentoCardBlock',
      columns: 3,
      cards: [
        { _key: 'c1', tag: 'LONATI', title: '全进口织袜机', desc: '意大利 Lonati 原装高精密单/双针筒设备' },
        { _key: 'c2', tag: 'OEKO-TEX', title: '环保安全认证', desc: '通过 OEKO-TEX Standard 100 权威母婴级认证' },
        { _key: 'c3', tag: 'QC 100%', title: '全检出厂标准', desc: '每批次经过严格抗起球及耐水洗拉伸测试' },
      ],
    },
  },
  {
    type: 'quoteBlock',
    title: '💬 工坊品牌语录',
    desc: '匠人署名或合作品牌评语',
    heightFraction: '1/3 屏',
    heightPercent: 33,
    capacityPerScreen: '单屏可放 3 个',
    capacityTip: '叙事语录 · 占 33% 高度 · 3个刚好铺满一屏',
    badgeBg: '#312e81',
    badgeColor: '#a5b4fc',
    role: '工坊评语',
    defaultData: {
      _type: 'quoteBlock',
      quote: '用对待高级定制的态度织造每一双袜子，这是我们三十年未变的准则。',
      author: 'Master Artisan',
      company: 'Gwenvenni Workshop Chief',
    },
  },
  {
    type: 'buttonGroupBlock',
    title: '🔘 全能操作按钮组',
    desc: '一键呼出询盘抽屉或跳转链接',
    heightFraction: '1/10 屏',
    heightPercent: 10,
    capacityPerScreen: '单屏可放 10 个',
    capacityTip: '行动条 · 占 10% 高度 · 紧凑操作与吸底',
    badgeBg: '#78350f',
    badgeColor: '#fcd34d',
    role: '行动呼吁',
    defaultData: {
      _type: 'buttonGroupBlock',
      align: 'center',
      buttons: [
        { _key: 'b1', label: '免费索取样卡', actionType: 'rfqDrawer', style: 'primary' },
        { _key: 'b2', label: '查看生产规格 ›', actionType: 'url', url: '#specs', style: 'secondary' },
      ],
    },
  },
  {
    type: 'dividerBlock',
    title: '➖ 装饰分隔与留白',
    desc: '极简细线、微光分割或占位留白',
    heightFraction: '1/20 屏',
    heightPercent: 5,
    capacityPerScreen: '微型间隔 (5%)',
    capacityTip: '呼吸留白 · 占 5% 高度 · 微调间距',
    badgeBg: '#27272a',
    badgeColor: '#a1a1aa',
    role: '微光留白',
    defaultData: {
      _type: 'dividerBlock',
      style: 'line',
      height: 'medium',
    },
  },
]

const BLOCK_INFO_MAP: Record<string, { fraction: string; percent: number; color: string; role: string; capacity: string }> = {
  headingBlock: { fraction: '1/5 屏', percent: 20, color: '#3b82f6', role: '顶置标头', capacity: '单屏可放 5 个' },
  mediaBlock: { fraction: '3/5 屏', percent: 60, color: '#8b5cf6', role: '核心展台', capacity: '单屏仅 1 个' },
  metricGridBlock: { fraction: '1/5 屏', percent: 20, color: '#10b981', role: '底部背书', capacity: '单屏可放 5 个' },
  bentoCardBlock: { fraction: '1/2 屏', percent: 50, color: '#ec4899', role: '卡片矩阵', capacity: '单屏可放 2 个' },
  quoteBlock: { fraction: '1/3 屏', percent: 33, color: '#6366f1', role: '工坊评语', capacity: '单屏可放 3 个' },
  buttonGroupBlock: { fraction: '1/10 屏', percent: 10, color: '#f59e0b', role: '行动呼吁', capacity: '单屏可放 10 个' },
  dividerBlock: { fraction: '1/20 屏', percent: 5, color: '#6b7280', role: '微光留白', capacity: '微型间隔' },
}

export function PageLivePreview(props: PageLivePreviewProps) {
  const { document: docProp, documentId } = props
  const client = useClient({ apiVersion: '2023-01-01' })

  const displayed = docProp?.displayed
  const slug = displayed?.slug?.current || ''
  const docId = documentId || displayed?._id || ''

  // 1. 确定前台预览路径
  let path = '/test'
  if (slug === '/' || slug === 'home' || docId === 'a59d87e4-e3ff-4929-acc1-d67b1808d36c') {
    path = '/'
  } else if (slug) {
    path = slug.startsWith('/') ? slug : `/${slug}`
  }

  const [origin, setOrigin] = useState('')
  useEffect(() => {
    const env = (typeof process !== 'undefined' && process.env ? process.env : {}) as Record<string, string | undefined>
    if (env.SANITY_STUDIO_SITE_URL) {
      setOrigin(env.SANITY_STUDIO_SITE_URL.replace(/\/$/, ''))
      return
    }
    if (typeof window !== 'undefined') {
      if (window.location.port === '3333') {
        const hostname = window.location.hostname || 'localhost'
        setOrigin(`http://${hostname}:4321`)
      } else {
        setOrigin(window.location.origin)
      }
    }
  }, [])

  const previewUrl = `${origin}${path}`

  // 2. 本地工作区状态管理
  const [builderMode, setBuilderMode] = useState<BuilderMode>('canvas')
  const [iframeKey, setIframeKey] = useState<number>(0)
  const [device, setDevice] = useState<DeviceMode>('desktop-full')
  const [zoomScale, setZoomScale] = useState<'fit' | number>('fit')
  const iframeContainerRef = useRef<HTMLDivElement>(null)
  const [containerDims, setContainerDims] = useState<{ width: number; height: number }>({ width: 1200, height: 800 })
  const [sections, setSections] = useState<any[]>(displayed?.sections || [])
  const [activeSectionIndex, setActiveSectionIndex] = useState<number>(0)
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'saving' | 'error'>('idle')
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null)

  // 监听容器视口变化以精准计算等比缩放
  useEffect(() => {
    if (!iframeContainerRef.current) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          setContainerDims({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          })
        }
      }
    })
    ro.observe(iframeContainerRef.current)
    return () => ro.disconnect()
  }, [builderMode])

  // 当外部文档更新时同步
  useEffect(() => {
    if (displayed?.sections) {
      setSections(displayed.sections)
    }
  }, [displayed?.sections])

  // 当前激活的 customSection
  const customSectionIndices = sections
    .map((sec, idx) => (sec._type === 'customSection' ? idx : -1))
    .filter((idx) => idx !== -1)

  const currentSectionIndex =
    customSectionIndices.includes(activeSectionIndex)
      ? activeSectionIndex
      : customSectionIndices[0] ?? -1

  const currentSection = currentSectionIndex !== -1 ? sections[currentSectionIndex] : null
  const currentBlocks: BlockItem[] = currentSection?.blocks || []

  // 3. 提交持久化到 Sanity 后端
  const commitToSanity = useCallback(
    async (newSections: any[]) => {
      setSaveStatus('saving')
      setIsSaving(true)
      try {
        const targetDocId = docId.startsWith('drafts.') ? docId : `drafts.${docId}`
        await client.patch(targetDocId).set({ sections: newSections }).commit()
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2500)
      } catch (err) {
        try {
          await client.patch(docId).set({ sections: newSections }).commit()
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2500)
        } catch (e2) {
          console.error('Commit failed:', e2)
          setSaveStatus('error')
        }
      } finally {
        setIsSaving(false)
      }
    },
    [client, docId]
  )

  // 更新当前版块中的 blocks
  const updateCurrentBlocks = (newBlocks: BlockItem[]) => {
    if (currentSectionIndex === -1) return
    const updatedSections = [...sections]
    updatedSections[currentSectionIndex] = {
      ...updatedSections[currentSectionIndex],
      blocks: newBlocks,
    }
    setSections(updatedSections)
    commitToSanity(updatedSections)
  }

  // 更新当前版块属性（如场景预设、主题）
  const updateCurrentSectionField = (field: string, value: any) => {
    if (currentSectionIndex === -1) return
    const updatedSections = [...sections]
    updatedSections[currentSectionIndex] = {
      ...updatedSections[currentSectionIndex],
      [field]: value,
    }
    setSections(updatedSections)
    commitToSanity(updatedSections)
  }

  // 4. 积木拖拽与排序逻辑
  const handleDragStart = (index: number) => {
    setDraggedBlockIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedBlockIndex === null || draggedBlockIndex === index) return

    const newBlocks = [...currentBlocks]
    const [movedBlock] = newBlocks.splice(draggedBlockIndex, 1)
    newBlocks.splice(index, 0, movedBlock)

    setDraggedBlockIndex(index)
    updateCurrentBlocks(newBlocks)
  }

  const handleDragEnd = () => {
    setDraggedBlockIndex(null)
  }

  // 添加新积木
  const handleAddBlock = (defaultData: any, targetIndex?: number) => {
    const newBlock = {
      ...defaultData,
      _key: Math.random().toString(36).substring(2, 14),
    }
    const newBlocks = [...currentBlocks]
    if (typeof targetIndex === 'number') {
      newBlocks.splice(targetIndex, 0, newBlock)
    } else {
      newBlocks.push(newBlock)
    }
    updateCurrentBlocks(newBlocks)
    setSelectedBlockKey(newBlock._key)
  }

  // 删除积木
  const handleDeleteBlock = (key: string) => {
    const newBlocks = currentBlocks.filter((b) => b._key !== key)
    updateCurrentBlocks(newBlocks)
    if (selectedBlockKey === key) setSelectedBlockKey(null)
  }

  // 移动积木顺序 (向上 / 向下)
  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === currentBlocks.length - 1) return
    const newBlocks = [...currentBlocks]
    const targetIdx = direction === 'up' ? index - 1 : index + 1
    const [moved] = newBlocks.splice(index, 1)
    newBlocks.splice(targetIdx, 0, moved)
    updateCurrentBlocks(newBlocks)
  }

  // 更新当前选中积木的字段
  const updateSelectedBlockField = (field: string, value: any) => {
    if (!selectedBlockKey) return
    const newBlocks = currentBlocks.map((b) => {
      if (b._key === selectedBlockKey) {
        return { ...b, [field]: value }
      }
      return b
    })
    updateCurrentBlocks(newBlocks)
  }

  const selectedBlock = currentBlocks.find((b) => b._key === selectedBlockKey)

  const currentPreset = DEVICE_PRESETS[device] || DEVICE_PRESETS['desktop-full']
  const isFixedDevice = typeof currentPreset.width === 'number' && typeof currentPreset.height === 'number'
  const targetW = typeof currentPreset.width === 'number' ? currentPreset.width : containerDims.width
  const targetH = typeof currentPreset.height === 'number' ? currentPreset.height : containerDims.height

  // 计算自适应缩放比例（保证真实机身完美居中完整呈现于可视窗口中）
  const availW = Math.max(containerDims.width - 48, 320)
  const availH = Math.max(containerDims.height - 88, 360)
  let calculatedFitScale = 1
  if (isFixedDevice) {
    calculatedFitScale = Math.min(availW / (targetW as number), availH / (targetH as number), 1)
    calculatedFitScale = Math.max(Math.round(calculatedFitScale * 100) / 100, 0.25)
  }
  const effectiveScale = !isFixedDevice
    ? 1
    : zoomScale === 'fit'
    ? calculatedFitScale
    : zoomScale

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0b0e',
        color: '#e4e4e7',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* ======================= 1. 顶部控制栏 ======================= */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          backgroundColor: '#121318',
          borderBottom: '1px solid #23252e',
          gap: '12px',
          zIndex: 20,
        }}
      >
        {/* 左侧：模式切换 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              backgroundColor: '#07080a',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid #23252e',
            }}
          >
            <button
              type="button"
              onClick={() => setBuilderMode('canvas')}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: builderMode === 'canvas' ? 600 : 400,
                color: builderMode === 'canvas' ? '#ffffff' : '#9ca3af',
                backgroundColor: builderMode === 'canvas' ? '#2563eb' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <span>🎨 可视化编排 (拖拽/调参)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setBuilderMode('live-iframe')
                setIframeKey((k) => k + 1)
              }}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: builderMode === 'live-iframe' ? 600 : 400,
                color: builderMode === 'live-iframe' ? '#ffffff' : '#9ca3af',
                backgroundColor: builderMode === 'live-iframe' ? '#2563eb' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <span>🌐 前台真机实景 (100% 浏览器原貌)</span>
            </button>
          </div>

          {/* 版块选择器 */}
          {customSectionIndices.length > 1 && (
            <select
              value={currentSectionIndex}
              onChange={(e) => setActiveSectionIndex(Number(e.target.value))}
              style={{
                backgroundColor: '#1b1d24',
                color: '#e4e4e7',
                border: '1px solid #323542',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {customSectionIndices.map((idx, i) => (
                <option key={idx} value={idx}>
                  版块 #{i + 1}: {sections[idx]?.adminLabel || '自由积木版块'}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 中间：设备视口切换 (兼顾真实宽度与高度规格) */}
        <div
          style={{
            display: 'flex',
            backgroundColor: '#07080a',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid #23252e',
            gap: '2px',
          }}
        >
          {(Object.keys(DEVICE_PRESETS) as DeviceMode[]).map((key) => {
            const item = DEVICE_PRESETS[key]
            const isActive = device === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDevice(key)}
                style={{
                  padding: '5px 9px',
                  fontSize: '11px',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#ffffff' : '#9ca3af',
                  backgroundColor: isActive ? '#272a36' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
                title={item.label}
              >
                <span>{item.icon}</span>
                <span>{item.shortLabel}</span>
              </button>
            )
          })}
        </div>

        {/* 右侧：保存状态与外链 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {saveStatus === 'saving' && (
            <span style={{ fontSize: '11px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>💾</span> 保存中...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>✓</span> 已自动同步
            </span>
          )}
          {saveStatus === 'error' && (
            <span style={{ fontSize: '11px', color: '#f87171' }}>⚠️ 保存失败</span>
          )}

          {builderMode === 'live-iframe' && (
            <button
              type="button"
              onClick={() => setIframeKey((k) => k + 1)}
              style={{
                padding: '5px 10px',
                fontSize: '12px',
                color: '#cbd5e1',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="重新加载前台页面"
            >
              <span>🔄</span>
              <span>刷新实景</span>
            </button>
          )}

          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#ffffff',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              cursor: 'pointer',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>新标签打开</span>
            <span style={{ fontSize: '11px' }}>↗</span>
          </a>
        </div>
      </div>

      {/* ======================= 2. 模式 A: 前台真机仿真 (Iframe: 兼顾真实宽度+真实高度与折叠比例) ======================= */}
      {builderMode === 'live-iframe' && (
        <div
          ref={iframeContainerRef}
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#08090d',
            overflow: 'hidden',
          }}
        >
          {/* 仿真视口参数及缩放控制条 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 16px',
              backgroundColor: '#12141c',
              borderBottom: '1px solid #222634',
              fontSize: '11px',
              color: '#94a3b8',
              flexWrap: 'wrap',
              gap: '8px',
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>{currentPreset.icon}</span>
                <span>{currentPreset.label}</span>
              </span>
              <span style={{ color: '#475569' }}>|</span>
              <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>
                视口规格: {typeof currentPreset.width === 'number' ? `${currentPreset.width} × ${currentPreset.height} px` : '100% 响应式'}
              </span>
              {isFixedDevice && (
                <>
                  <span style={{ color: '#475569' }}>|</span>
                  <span>比例: {currentPreset.aspect}</span>
                  <span style={{ color: '#475569' }}>|</span>
                  <span style={{ color: '#a78bfa' }}>
                    首屏高度 (100svh): {currentPreset.height}px
                  </span>
                </>
              )}
            </div>

            {/* 缩放比例微调 */}
            {isFixedDevice && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#64748b', fontSize: '11px' }}>缩放显示:</span>
                <div
                  style={{
                    display: 'flex',
                    backgroundColor: '#090a0f',
                    padding: '2px',
                    borderRadius: '6px',
                    border: '1px solid #1e293b',
                    gap: '2px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setZoomScale('fit')}
                    style={{
                      padding: '3px 8px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: zoomScale === 'fit' ? '#2563eb' : 'transparent',
                      color: zoomScale === 'fit' ? '#ffffff' : '#94a3b8',
                      fontWeight: zoomScale === 'fit' ? 600 : 400,
                    }}
                    title="根据当前窗口自动等比缩放整个屏幕"
                  >
                    自适应 ({Math.round(calculatedFitScale * 100)}%)
                  </button>
                  {[1, 0.85, 0.75, 0.5].map((scaleVal) => (
                    <button
                      key={scaleVal}
                      type="button"
                      onClick={() => setZoomScale(scaleVal)}
                      style={{
                        padding: '3px 8px',
                        fontSize: '11px',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: zoomScale === scaleVal ? '#2563eb' : 'transparent',
                        color: zoomScale === scaleVal ? '#ffffff' : '#94a3b8',
                        fontWeight: zoomScale === scaleVal ? 600 : 400,
                      }}
                    >
                      {Math.round(scaleVal * 100)}%
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 仿真设备视口画布 */}
          <div
            style={{
              flex: 1,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'auto',
              padding: isFixedDevice ? '24px' : '0',
              boxSizing: 'border-box',
            }}
          >
            {!isFixedDevice ? (
              // 桌面全屏模式
              <div style={{ width: '100%', height: '100%', backgroundColor: '#ffffff' }}>
                <iframe
                  key={iframeKey}
                  src={previewUrl}
                  title="Astro Live Preview Fullscreen"
                  style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#ffffff' }}
                />
              </div>
            ) : (
              // 固定宽高仿真机身外壳 (MacBook / Laptop / iPad / iPhone)
              <div
                style={{
                  width: `${(targetW as number) * effectiveScale}px`,
                  height: `${(targetH as number) * effectiveScale + 36}px`,
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: '#18181b',
                  borderRadius: device === 'mobile' ? '36px' : '12px',
                  boxShadow: '0 25px 60px -15px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.1)',
                  overflow: 'hidden',
                  margin: 'auto',
                  transition: 'width 0.25s ease, height 0.25s ease',
                  flexShrink: 0,
                }}
              >
                {/* 仿真浏览器 / 系统顶部状态条 */}
                <div
                  style={{
                    height: '36px',
                    backgroundColor: '#1f2028',
                    borderBottom: '1px solid #2e303d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px',
                    fontSize: '11px',
                    color: '#94a3b8',
                    userSelect: 'none',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }} />
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#eab308', display: 'inline-block' }} />
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} />
                    <span style={{ marginLeft: '6px', fontSize: '11px', color: '#cbd5e1', fontWeight: 500 }}>
                      {currentPreset.name} · {targetW}×{targetH}
                    </span>
                  </div>

                  <div
                    style={{
                      backgroundColor: '#121318',
                      padding: '2px 14px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      color: '#64748b',
                      maxWidth: '320px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      border: '1px solid #272a38',
                    }}
                  >
                    {previewUrl}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setIframeKey((k) => k + 1)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '11px',
                        padding: '2px',
                      }}
                      title="刷新 iframe"
                    >
                      🔄
                    </button>
                  </div>
                </div>

                {/* 实际 100% 物理像素执行环境 (通过 CSS Transform Scale 完美容纳于视图) */}
                <div
                  style={{
                    width: `${(targetW as number) * effectiveScale}px`,
                    height: `${(targetH as number) * effectiveScale}px`,
                    position: 'relative',
                    overflow: 'hidden',
                    backgroundColor: '#ffffff',
                  }}
                >
                  <iframe
                    key={iframeKey}
                    src={previewUrl}
                    title="Astro Live Preview Device"
                    style={{
                      width: `${targetW}px`,
                      height: `${targetH}px`,
                      border: 'none',
                      backgroundColor: '#ffffff',
                      transform: `scale(${effectiveScale})`,
                      transformOrigin: 'top left',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================= 3. 模式 B: 可视化积木拖拽画布 (Visual Builder) ======================= */}
      {builderMode === 'canvas' && (
        <div style={{ flex: 1, display: 'flex', width: '100%', overflow: 'hidden' }}>
          {/* ----- 左侧：积木工具库 (Block Palette) ----- */}
          <div
            style={{
              width: '280px',
              minWidth: '280px',
              backgroundColor: '#121318',
              borderRight: '1px solid #23252e',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid #23252e',
                fontSize: '13px',
                fontWeight: 600,
                color: '#f4f4f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>🧩 积木工具箱</span>
              <span style={{ fontSize: '11px', color: '#71717a', fontWeight: 400 }}>点击或拖拽添加</span>
            </div>

            {/* 预设快捷模板选择 */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #1f2129' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '8px' }}>
                📐 页面场景预设 (自动锁定黄金空间)
              </div>
              <select
                value={currentSection?.preset || 'dual-compare'}
                onChange={(e) => updateCurrentSectionField('preset', e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  backgroundColor: '#1c1e27',
                  color: '#ffffff',
                  border: '1px solid #353849',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <option value="dual-compare">🔬 双图工坊对比屏 (100svh 满屏自动适配)</option>
                <option value="cinematic-hero">🎬 宽幅大片沉浸屏 (宽屏巨幕焦点)</option>
                <option value="split-showcase">⚖️ 左右双栏工坊屏 (图文横向展开)</option>
                <option value="bento-grid">🍱 Bento 苹果风特性矩阵</option>
                <option value="custom-free">🧩 自由原子拼接 (高级模式)</option>
              </select>
            </div>

            {/* 满屏搭配参考指导 (包含 1/2, 1/3, 1/5 屏容量说明) */}
            <div
              style={{
                margin: '12px 14px',
                padding: '12px 14px',
                backgroundColor: '#161922',
                border: '1px solid #282f42',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#cbd5e1',
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💡</span> 单屏 (100%) 空间指导表:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px' }}>
                <div>• <b>1/2 屏 (50%)</b>: 单屏最多放 <b style={{ color: '#4ade80' }}>2 个</b> (上下对半或均分)</div>
                <div>• <b>1/3 屏 (33%)</b>: 单屏最多放 <b style={{ color: '#4ade80' }}>3 个</b> (经典三段式黄金流)</div>
                <div>• <b>1/5 屏 (20%)</b>: 单屏最多放 <b style={{ color: '#4ade80' }}>5 个</b> (标题/指标/短文)</div>
                <div>• <b>3/5 屏 (60%)</b>: 占大半屏，单屏仅建议 <b style={{ color: '#f59e0b' }}>1 个</b></div>
              </div>
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #282f42', color: '#94a3b8' }}>
                <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '3px' }}>🎯 推荐满屏组合公式:</div>
                <div>• <b>经典工坊屏</b>: 1/5 标题 + 3/5 双图 + 1/5 指标 = <span style={{ color: '#4ade80', fontWeight: 700 }}>100% 刚好满屏</span></div>
                <div>• <b>特性矩阵屏</b>: 1/2 Bento + 1/2 展台 = <span style={{ color: '#4ade80', fontWeight: 700 }}>100% 刚好满屏</span></div>
                <div>• <b>宽幅大片屏</b>: 1/5 标题 + 3/5 大图 + 1/10 按钮 ≈ <span style={{ color: '#38bdf8', fontWeight: 700 }}>90% 舒展单屏</span></div>
              </div>
            </div>

            {/* 可用积木卡片列表 (含高度比例标注与单屏容量指导) */}
            <div style={{ padding: '0 14px 16px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '2px', display: 'flex', justifyContent: 'space-between' }}>
                <span>可用原子积木 ({PALETTE_BLOCKS.length})</span>
                <span style={{ color: '#38bdf8' }}>含单屏容量说明</span>
              </div>
              {PALETTE_BLOCKS.map((item) => (
                <div
                  key={item.type}
                  onClick={() => handleAddBlock(item.defaultData)}
                  style={{
                    padding: '12px 14px',
                    backgroundColor: '#1a1c24',
                    border: '1px solid #282b37',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#222533'
                    e.currentTarget.style.borderColor = '#3b82f6'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#1a1c24'
                    e.currentTarget.style.borderColor = '#282b37'
                  }}
                >
                  {/* 标题与高度分数标签 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#f4f4f5' }}>{item.title}</span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        padding: '2px 7px',
                        backgroundColor: item.badgeBg,
                        color: item.badgeColor,
                        borderRadius: '6px',
                        border: `1px solid ${item.badgeColor}40`,
                      }}
                    >
                      {item.heightFraction} ({item.heightPercent}%)
                    </span>
                  </div>

                  <div style={{ fontSize: '11px', color: '#9ca3af', lineHeight: 1.4, marginBottom: '8px' }}>
                    {item.desc}
                  </div>

                  {/* 💡 核心指导：满屏占比微条 + 单屏容量指导 */}
                  <div
                    style={{
                      backgroundColor: '#11131a',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #252836',
                      marginBottom: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>单屏高度占比</span>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: item.badgeColor }}>
                        占 {item.heightFraction}
                      </span>
                    </div>

                    {/* 高度可视化进度槽 */}
                    <div
                      style={{
                        width: '100%',
                        height: '5px',
                        backgroundColor: '#272b3b',
                        borderRadius: '9999px',
                        overflow: 'hidden',
                        marginBottom: '6px',
                      }}
                    >
                      <div
                        style={{
                          width: `${item.heightPercent}%`,
                          height: '100%',
                          backgroundColor: item.badgeColor,
                          borderRadius: '9999px',
                        }}
                      />
                    </div>

                    {/* 明确的“单屏可放几个”指导 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#4ade80' }}>
                        👉 {item.capacityPerScreen}
                      </span>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>
                        {item.role}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px', color: '#71717a' }}>{item.capacityTip}</span>
                    <span style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600 }}>+ 点击加入</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ----- 中间：可视化排版画布 (Visual Screen Stage) ----- */}
          <div
            style={{
              flex: 1,
              backgroundColor: '#07080a',
              overflowY: 'auto',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            {/* 视口高度预算计算条 (Screen Height Budget Meter) */}
            {(() => {
              const totalPercent = currentBlocks.reduce(
                (acc, b) => acc + (BLOCK_INFO_MAP[b._type]?.percent || 15),
                0
              )
              return (
                <div
                  style={{
                    width: typeof currentPreset.width === 'number' ? `${currentPreset.width}px` : currentPreset.width,
                    maxWidth: '100%',
                    backgroundColor: '#13151c',
                    border: '1px solid #232734',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    marginBottom: '16px',
                    transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>
                        🖥️ 当前单屏高度预算:
                      </span>
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          color: totalPercent === 100 ? '#4ade80' : totalPercent < 100 ? '#38bdf8' : '#fb923c',
                        }}
                      >
                        {totalPercent}%
                      </span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                        (约 {(totalPercent / 100).toFixed(1)} 屏高)
                      </span>
                    </div>

                    <div style={{ fontSize: '11px', fontWeight: 500 }}>
                      {totalPercent === 100 && (
                        <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>🟢</span> 完美满屏 (1/1 屏) · 刚好填满一屏，首屏无截断、无需滚动
                        </span>
                      )}
                      {totalPercent < 100 && (
                        <span style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>🔵</span> 宽松单屏 (约 {(totalPercent / 100).toFixed(1)} 屏) · 尚余 {100 - totalPercent}% 空间
                          <span style={{ color: '#93c5fd', marginLeft: '6px' }}>
                            (还可放：{100 - totalPercent >= 50 ? '1个 1/2屏 或 ' : ''}{100 - totalPercent >= 33 ? '1个 1/3屏 或 ' : ''}{Math.floor((100 - totalPercent) / 20) > 0 ? `${Math.floor((100 - totalPercent) / 20)}个 1/5屏` : '轻量按钮'})
                          </span>
                        </span>
                      )}
                      {totalPercent > 100 && (
                        <span style={{ color: '#fb923c', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>🟠</span> 超出单屏 (约 {(totalPercent / 100).toFixed(1)} 屏) · 超出部分位于 1 屏折叠线下方，需向下滚动浏览
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 比例分段条 */}
                  <div
                    style={{
                      width: '100%',
                      height: '8px',
                      backgroundColor: '#232734',
                      borderRadius: '9999px',
                      overflow: 'hidden',
                      display: 'flex',
                    }}
                  >
                    {currentBlocks.map((b, idx) => {
                      const info = BLOCK_INFO_MAP[b._type] || { fraction: '1/6 屏', percent: 15, color: '#6b7280', role: '' }
                      const segmentWidth = `${(info.percent / Math.max(totalPercent, 100)) * 100}%`
                      return (
                        <div
                          key={b._key || idx}
                          title={`#${idx + 1} ${b._type} (${info.fraction})`}
                          style={{
                            width: segmentWidth,
                            height: '100%',
                            backgroundColor: info.color,
                            borderRight: '1px solid #13151c',
                          }}
                        />
                      )
                    })}
                  </div>

                  {/* 积木分布微标签 */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '8px' }}>
                    {currentBlocks.map((b, idx) => {
                      const info = BLOCK_INFO_MAP[b._type] || { fraction: '1/6 屏', percent: 15, color: '#6b7280', role: '' }
                      return (
                        <span
                          key={b._key || idx}
                          style={{
                            fontSize: '11px',
                            color: '#cbd5e1',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <span
                            style={{
                              width: '7px',
                              height: '7px',
                              borderRadius: '50%',
                              backgroundColor: info.color,
                              display: 'inline-block',
                            }}
                          />
                          #{idx + 1} {info.role || b._type} ({info.fraction})
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* 模拟屏幕容器 */}
            <div
              style={{
                width: typeof currentPreset.width === 'number' ? `${currentPreset.width}px` : currentPreset.width,
                maxWidth: '100%',
                minHeight: typeof currentPreset.height === 'number' ? `${currentPreset.height}px` : '85svh',
                backgroundColor: currentSection?.theme === 'dark' ? '#09090b' : '#ffffff',
                color: currentSection?.theme === 'dark' ? '#ffffff' : '#1d1d1f',
                borderRadius: '16px',
                boxShadow: '0 20px 40px -15px rgba(0,0,0,0.6)',
                border: '1px solid #23252e',
                padding: '36px 28px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                gap: '20px',
                transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                boxSizing: 'border-box',
              }}
            >
              {/* 模拟前台极简 Apple 顶栏 (还原真实浏览器浏览上下文与视觉对齐) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 18px',
                  backgroundColor: currentSection?.theme === 'dark' ? '#18181b' : '#f5f5f7',
                  borderRadius: '10px',
                  border: currentSection?.theme === 'dark' ? '1px solid #27272a' : '1px solid #e4e4e7',
                  fontSize: '11px',
                  color: '#86868b',
                  userSelect: 'none',
                  width: '100%',
                  maxWidth: '1040px',
                  margin: '0 auto',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700, color: currentSection?.theme === 'dark' ? '#ffffff' : '#1d1d1f', letterSpacing: '0.04em' }}>
                    GWENVENNI
                  </span>
                  <span style={{ color: '#d4d4d8' }}>/</span>
                  <span style={{ color: '#71717a' }}>{currentSection?.adminLabel || '版块实景'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11px' }}>
                  <span>Capsule Collection</span>
                  <span>Technology</span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: currentSection?.theme === 'dark' ? '#ffffff' : '#1d1d1f',
                      color: currentSection?.theme === 'dark' ? '#1d1d1f' : '#ffffff',
                      fontSize: '10px',
                      fontWeight: 600,
                    }}
                  >
                    B2B RFQ
                  </span>
                </div>
              </div>

              {/* 画布空状态 */}
              {currentBlocks.length === 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '400px',
                    border: '2px dashed #d4d4d8',
                    borderRadius: '12px',
                    color: '#71717a',
                    padding: '32px',
                    textAlign: 'center',
                    width: '100%',
                    maxWidth: '1040px',
                    margin: '0 auto',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ fontSize: '36px', marginBottom: '12px' }}>🧱</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#3f3f46', marginBottom: '6px' }}>
                    当前版块尚未添加任何积木
                  </div>
                  <div style={{ fontSize: '12px', color: '#71717a', maxWidth: '320px', marginBottom: '16px' }}>
                    请点击左侧工具箱中的【标题】、【多媒体】或【指标】积木，快速组合出精美屏幕排版。
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddBlock(PALETTE_BLOCKS[0].defaultData)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    + 快速插入主标题文案
                  </button>
                </div>
              )}

              {/* 积木流列表 (全支持可拖拽与点击选定，含 100% 满屏折叠截断线) */}
              {(() => {
                let accumulatedHeight = 0
                let foldLineShown = false

                return currentBlocks.map((block, index) => {
                  const isSelected = selectedBlockKey === block._key
                  const isDragging = draggedBlockIndex === index
                  const bInfo = BLOCK_INFO_MAP[block._type] || { fraction: '1/6 屏', percent: 15, color: '#6b7280', role: block._type, capacity: '通用积木' }
                  accumulatedHeight += bInfo.percent
                  const shouldShowFold = !foldLineShown && accumulatedHeight >= 100
                  if (shouldShowFold) {
                    foldLineShown = true
                  }

                  return (
                    <React.Fragment key={block._key}>
                      <div
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedBlockKey(block._key)
                        }}
                        style={{
                          position: 'relative',
                          width: '100%',
                          maxWidth: '1040px',
                          margin: '0 auto',
                          padding: '14px 16px',
                          borderRadius: '12px',
                          border: isSelected ? '2px solid #2563eb' : '1px solid transparent',
                          boxShadow: isSelected ? '0 0 0 4px rgba(37,99,235,0.15)' : 'none',
                          backgroundColor: isSelected
                            ? currentSection?.theme === 'dark'
                              ? '#18181b'
                              : '#f0f7ff'
                            : 'transparent',
                          opacity: isDragging ? 0.35 : 1,
                          cursor: 'grab',
                          transition: 'all 0.15s ease',
                          boxSizing: 'border-box',
                        }}
                      >
                    {/* 积木悬浮/选中控制条 */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '8px',
                        paddingBottom: '6px',
                        borderBottom: isSelected ? '1px solid #bfdbfe' : '1px dashed #e4e4e7',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '13px',
                            cursor: 'grab',
                            color: '#9ca3af',
                            userSelect: 'none',
                          }}
                          title="按住鼠标拖拽此手柄上下调位"
                        >
                          ⠿
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            backgroundColor: isSelected ? '#2563eb' : '#e4e4e7',
                            color: isSelected ? '#ffffff' : '#3f3f46',
                            borderRadius: '9999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: bInfo.color,
                              display: 'inline-block',
                            }}
                          />
                          #{index + 1} {bInfo.role} · 占 {bInfo.fraction} ({bInfo.percent}%) · {bInfo.capacity}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleMoveBlock(index, 'up')
                          }}
                          disabled={index === 0}
                          style={{
                            padding: '3px 6px',
                            fontSize: '11px',
                            cursor: index === 0 ? 'not-allowed' : 'pointer',
                            opacity: index === 0 ? 0.3 : 0.8,
                            backgroundColor: '#ffffff',
                            border: '1px solid #d4d4d8',
                            borderRadius: '4px',
                          }}
                        >
                          ⬆️
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleMoveBlock(index, 'down')
                          }}
                          disabled={index === currentBlocks.length - 1}
                          style={{
                            padding: '3px 6px',
                            fontSize: '11px',
                            cursor: index === currentBlocks.length - 1 ? 'not-allowed' : 'pointer',
                            opacity: index === currentBlocks.length - 1 ? 0.3 : 0.8,
                            backgroundColor: '#ffffff',
                            border: '1px solid #d4d4d8',
                            borderRadius: '4px',
                          }}
                        >
                          ⬇️
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteBlock(block._key)
                          }}
                          style={{
                            padding: '3px 6px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            borderRadius: '4px',
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* --- 真实视觉渲染: 标题积木 (支持 Apple 双色中英双段灰度对比) --- */}
                    {block._type === 'headingBlock' && (() => {
                      const rawHeadline = safeText(block.headline, '未填写主标题')
                      const match = rawHeadline.match(/^(.+?[\.|\。])\s*(.+)$/)
                      const isDark = currentSection?.theme === 'dark'

                      return (
                        <div
                          style={{
                            textAlign: block.align || 'center',
                            padding: '6px 0',
                            width: '100%',
                          }}
                        >
                          {block.badge && (
                            <div
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                letterSpacing: '0.08em',
                                color: '#86868b',
                                textTransform: 'uppercase',
                                marginBottom: '6px',
                              }}
                            >
                              {safeText(block.badge)}
                            </div>
                          )}
                          <h2
                            style={{
                              fontSize: block.size === 'hero' ? '34px' : '26px',
                              fontWeight: 600,
                              letterSpacing: '-0.025em',
                              lineHeight: 1.15,
                              margin: '0 auto 8px auto',
                              maxWidth: '820px',
                              color: isDark ? '#ffffff' : '#1d1d1f',
                            }}
                          >
                            {match ? (
                              <>
                                <span>{match[1]}</span>{' '}
                                <span style={{ color: '#86868b', fontWeight: 400 }}>{match[2]}</span>
                              </>
                            ) : (
                              rawHeadline
                            )}
                          </h2>
                          {block.subtitle && (
                            <p
                              style={{
                                fontSize: '14px',
                                color: '#86868b',
                                margin: '0 auto',
                                maxWidth: '640px',
                                lineHeight: 1.5,
                              }}
                            >
                              {safeText(block.subtitle)}
                            </p>
                          )}
                        </div>
                      )
                    })()}

                    {/* --- 真实视觉渲染: 多媒体展台 (真实 Sanity 原图等高齐平渲染) --- */}
                    {block._type === 'mediaBlock' && (() => {
                      const img1 = getSanityImageUrl(block.image)
                      const img2 = getSanityImageUrl(block.secondaryImage)
                      const isDark = currentSection?.theme === 'dark'

                      return (
                        <div style={{ width: '100%', padding: '4px 0' }}>
                          {block.mediaType === 'dual' ? (
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '20px',
                                width: '100%',
                              }}
                            >
                              <div
                                style={{
                                  aspectRatio: '16/10',
                                  backgroundColor: isDark ? '#18181b' : '#f5f5f7',
                                  borderRadius: '16px',
                                  border: isDark ? '1px solid #27272a' : '1px solid rgba(0,0,0,0.06)',
                                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.08)',
                                  overflow: 'hidden',
                                  position: 'relative',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {img1 ? (
                                  <img
                                    src={img1}
                                    alt="主展示图"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>🖼️ 待上传左图 (16:10)</span>
                                )}
                              </div>
                              <div
                                style={{
                                  aspectRatio: '16/10',
                                  backgroundColor: isDark ? '#18181b' : '#f5f5f7',
                                  borderRadius: '16px',
                                  border: isDark ? '1px solid #27272a' : '1px solid rgba(0,0,0,0.06)',
                                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.08)',
                                  overflow: 'hidden',
                                  position: 'relative',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {img2 ? (
                                  <img
                                    src={img2}
                                    alt="对比副图"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>🖼️ 待上传右图 (16:10)</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div
                              style={{
                                aspectRatio: '16/9',
                                backgroundColor: isDark ? '#18181b' : '#f5f5f7',
                                borderRadius: '16px',
                                border: isDark ? '1px solid #27272a' : '1px solid rgba(0,0,0,0.06)',
                                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.08)',
                                overflow: 'hidden',
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '100%',
                              }}
                            >
                              {img1 ? (
                                <img
                                    src={img1}
                                    alt="宽幅大片"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <span style={{ fontSize: '13px', color: '#9ca3af' }}>🖼️ 待上传宽幅大片 (16:9)</span>
                                )}
                            </div>
                          )}
                          {block.caption && (
                            <div
                              style={{
                                fontSize: '11px',
                                color: '#86868b',
                                textAlign: 'center',
                                marginTop: '6px',
                              }}
                            >
                              {safeText(block.caption)}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* --- 真实视觉渲染: 数据指标栏 (1:1 与多媒体舞台左边线与右边线严格平齐) --- */}
                    {block._type === 'metricGridBlock' && (() => {
                      const isDark = currentSection?.theme === 'dark'

                      return (
                        <div style={{ width: '100%', padding: '4px 0' }}>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: `repeat(${block.columns || 3}, 1fr)`,
                              gap: '20px',
                              paddingTop: '16px',
                              borderTop: isDark ? '1px solid #27272a' : '1px solid rgba(0,0,0,0.08)',
                              width: '100%',
                            }}
                          >
                            {(block.metrics || []).map((m: any, mIdx: number) => (
                              <div key={m._key || mIdx} style={{ textAlign: 'left', padding: '0', margin: '0' }}>
                                <div
                                  style={{
                                    fontSize: '26px',
                                    fontWeight: 600,
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                    letterSpacing: '-0.03em',
                                    color: isDark ? '#ffffff' : '#1d1d1f',
                                    lineHeight: 1.1,
                                    marginBottom: '3px',
                                  }}
                                >
                                  {safeText(m.value, '--')}
                                </div>
                                <div
                                  style={{
                                    fontSize: '10px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    fontWeight: 600,
                                    fontFamily: 'ui-monospace, monospace',
                                    color: '#86868b',
                                    marginBottom: '2px',
                                  }}
                                >
                                  {safeText(m.label, '指标名称')}
                                </div>
                                {m.desc && (
                                  <div style={{ fontSize: '11px', color: '#86868b', lineHeight: 1.35 }}>
                                    {safeText(m.desc)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* --- 真实视觉渲染: 操作按钮组 --- */}
                    {block._type === 'buttonGroupBlock' && (
                      <div
                        style={{
                          width: '100%',
                          display: 'flex',
                          justifyContent:
                            block.align === 'center'
                              ? 'center'
                              : block.align === 'right'
                              ? 'flex-end'
                              : 'flex-start',
                          gap: '12px',
                          padding: '6px 0',
                        }}
                      >
                        {(block.buttons || []).map((btn: any, bIdx: number) => (
                          <span
                            key={btn._key || bIdx}
                            style={{
                              padding: '8px 20px',
                              fontSize: '12px',
                              fontWeight: 500,
                              borderRadius: '9999px',
                              backgroundColor: btn.style === 'secondary' ? '#f4f4f5' : '#1d1d1f',
                              color: btn.style === 'secondary' ? '#1d1d1f' : '#ffffff',
                              border: '1px solid transparent',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <span>{safeText(btn.label, '按钮文案')}</span>
                            {btn.actionType === 'rfqDrawer' && <span style={{ fontSize: '10px' }}>⚡</span>}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* --- 真实视觉渲染: Bento 卡片矩阵 --- */}
                    {block._type === 'bentoCardBlock' && (
                      <div
                        style={{
                          width: '100%',
                          display: 'grid',
                          gridTemplateColumns: `repeat(${block.columns || 3}, 1fr)`,
                          gap: '20px',
                          padding: '6px 0',
                        }}
                      >
                        {(block.cards || []).map((c: any, cIdx: number) => (
                          <div
                            key={c._key || cIdx}
                            style={{
                              padding: '16px',
                              backgroundColor: '#f5f5f7',
                              borderRadius: '12px',
                              border: '1px solid #e4e4e7',
                            }}
                          >
                            {c.tag && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  padding: '2px 6px',
                                  backgroundColor: '#e4e4e7',
                                  borderRadius: '4px',
                                  display: 'inline-block',
                                  marginBottom: '8px',
                                }}
                              >
                                {safeText(c.tag)}
                              </span>
                            )}
                            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                              {safeText(c.title)}
                            </div>
                            <div style={{ fontSize: '12px', color: '#71717a', lineHeight: 1.4 }}>
                              {safeText(c.desc)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* --- 真实视觉渲染: 装饰分割线 --- */}
                    {block._type === 'dividerBlock' && (
                      <div style={{ width: '100%', padding: '6px 0' }}>
                        <div style={{ height: '1px', backgroundColor: '#e4e4e7', width: '100%' }} />
                      </div>
                    )}
                    </div>

                    {/* 视口满屏折叠线 (Fold Line: 标注 100% 视口截断分界) */}
                    {shouldShowFold && (
                      <div
                        style={{
                          width: '100%',
                          maxWidth: '1040px',
                          margin: '8px auto',
                          padding: '8px 14px',
                          backgroundColor: '#0f172a',
                          border: '1.5px dashed #38bdf8',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          color: '#38bdf8',
                          fontSize: '11px',
                          fontWeight: 600,
                          boxShadow: '0 4px 12px rgba(56, 189, 248, 0.15)',
                          boxSizing: 'border-box',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>📱</span>
                          <span>1 屏满屏折叠线 (100% 视口截断) · 👆 此线以上为访客首屏直接可见范围</span>
                        </div>
                        <span style={{ fontSize: '10px', backgroundColor: '#0284c7', color: '#ffffff', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                          100svh 首屏
                        </span>
                      </div>
                    )}
                  </React.Fragment>
                )
              })
            })()}
            </div>
          </div>

          {/* ----- 右侧：选中积木实时属性调参面板 (Block Inspector) ----- */}
          <div
            style={{
              width: '320px',
              minWidth: '320px',
              backgroundColor: '#121318',
              borderLeft: '1px solid #23252e',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid #23252e',
                fontSize: '13px',
                fontWeight: 600,
                color: '#f4f4f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>⚙️ 积木参数调参面板</span>
              {selectedBlock && (
                <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 500 }}>
                  已选 #{selectedBlock._type}
                </span>
              )}
            </div>

            {!selectedBlock && (
              <div
                style={{
                  padding: '32px 20px',
                  textAlign: 'center',
                  color: '#71717a',
                  fontSize: '12px',
                  lineHeight: 1.6,
                }}
              >
                👈 请在中间画布中点击任意积木，在此处直接修改文案、画幅比例或指标参数。
              </div>
            )}

            {selectedBlock && (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 针对 HeadingBlock */}
                {selectedBlock._type === 'headingBlock' && (
                  <>
                    <div>
                      <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                        主标题 (Headline) - 支持英文 `.` 或中文 `。` 双段灰度对比
                      </label>
                      <input
                        type="text"
                        value={safeText(selectedBlock.headline)}
                        onChange={(e) => updateSelectedBlockField('headline', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          backgroundColor: '#1c1e27',
                          color: '#ffffff',
                          border: '1px solid #353849',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                        顶部胶囊眉标 (Badge Label)
                      </label>
                      <input
                        type="text"
                        value={safeText(selectedBlock.badge)}
                        onChange={(e) => updateSelectedBlockField('badge', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          backgroundColor: '#1c1e27',
                          color: '#ffffff',
                          border: '1px solid #353849',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                        副标题叙述文案 (Subtitle / Narrative)
                      </label>
                      <textarea
                        rows={3}
                        value={safeText(selectedBlock.subtitle)}
                        onChange={(e) => updateSelectedBlockField('subtitle', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          backgroundColor: '#1c1e27',
                          color: '#ffffff',
                          border: '1px solid #353849',
                          borderRadius: '6px',
                          fontSize: '12px',
                          resize: 'vertical',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                        对齐方式 (Alignment)
                      </label>
                      <select
                        value={selectedBlock.align || 'center'}
                        onChange={(e) => updateSelectedBlockField('align', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          backgroundColor: '#1c1e27',
                          color: '#ffffff',
                          border: '1px solid #353849',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      >
                        <option value="center">居中对齐 (Center)</option>
                        <option value="left">居左对齐 (Left)</option>
                        <option value="right">居右对齐 (Right)</option>
                      </select>
                    </div>
                  </>
                )}

                {/* 针对 MediaBlock */}
                {selectedBlock._type === 'mediaBlock' && (
                  <>
                    <div>
                      <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                        展示模式 (Media Mode)
                      </label>
                      <select
                        value={selectedBlock.mediaType || 'dual'}
                        onChange={(e) => updateSelectedBlockField('mediaType', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          backgroundColor: '#1c1e27',
                          color: '#ffffff',
                          border: '1px solid #353849',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      >
                        <option value="dual">双图等高特写对比 (Dual Compare)</option>
                        <option value="single">单张高精宽幅大片 (Single Image)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                        画幅比例 (预设模式已自动等高对齐)
                      </label>
                      <select
                        value={selectedBlock.aspectRatio || '16/10'}
                        onChange={(e) => updateSelectedBlockField('aspectRatio', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          backgroundColor: '#1c1e27',
                          color: '#ffffff',
                          border: '1px solid #353849',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      >
                        <option value="16/10">16:10 黄金对比 (推荐)</option>
                        <option value="16/9">16:9 宽屏展台</option>
                        <option value="4/3">4:3 经典工坊比例</option>
                        <option value="1/1">1:1 正方形精细特写</option>
                        <option value="auto">自适应原图高度 (Auto)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                        底部小字说明 (Caption)
                      </label>
                      <input
                        type="text"
                        value={selectedBlock.caption || ''}
                        onChange={(e) => updateSelectedBlockField('caption', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          backgroundColor: '#1c1e27',
                          color: '#ffffff',
                          border: '1px solid #353849',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      />
                    </div>
                  </>
                )}

                {/* 针对 MetricGridBlock */}
                {selectedBlock._type === 'metricGridBlock' && (
                  <>
                    <div>
                      <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                        展示列数 (Columns)
                      </label>
                      <select
                        value={selectedBlock.columns || 3}
                        onChange={(e) => updateSelectedBlockField('columns', Number(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          backgroundColor: '#1c1e27',
                          color: '#ffffff',
                          border: '1px solid #353849',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      >
                        <option value={2}>2 列</option>
                        <option value={3}>3 列 (标准推荐)</option>
                        <option value={4}>4 列</option>
                      </select>
                    </div>

                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '6px',
                        }}
                      >
                        <span style={{ fontSize: '11px', color: '#9ca3af' }}>指标项列表</span>
                        <button
                          type="button"
                          onClick={() => {
                            const metrics = selectedBlock.metrics || []
                            updateSelectedBlockField('metrics', [
                              ...metrics,
                              {
                                _key: Math.random().toString(36).substring(2, 10),
                                value: '99.8%',
                                label: 'Pass Rate',
                                desc: '全检合格率',
                              },
                            ])
                          }}
                          style={{
                            fontSize: '11px',
                            color: '#60a5fa',
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          + 添加指标
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(selectedBlock.metrics || []).map((m: any, mIdx: number) => (
                          <div
                            key={m._key || mIdx}
                            style={{
                              padding: '8px',
                              backgroundColor: '#1c1e27',
                              borderRadius: '6px',
                              border: '1px solid #282b37',
                            }}
                          >
                            <input
                              type="text"
                              placeholder="数值 (如 200N)"
                              value={m.value || ''}
                              onChange={(e) => {
                                const newM = [...selectedBlock.metrics]
                                newM[mIdx] = { ...newM[mIdx], value: e.target.value }
                                updateSelectedBlockField('metrics', newM)
                              }}
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                backgroundColor: '#121318',
                                color: '#ffffff',
                                border: '1px solid #323542',
                                borderRadius: '4px',
                                fontSize: '11px',
                                marginBottom: '4px',
                              }}
                            />
                            <input
                              type="text"
                              placeholder="名称 (如 Needle Density)"
                              value={m.label || ''}
                              onChange={(e) => {
                                const newM = [...selectedBlock.metrics]
                                newM[mIdx] = { ...newM[mIdx], label: e.target.value }
                                updateSelectedBlockField('metrics', newM)
                              }}
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                backgroundColor: '#121318',
                                color: '#ffffff',
                                border: '1px solid #323542',
                                borderRadius: '4px',
                                fontSize: '11px',
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* 针对 ButtonGroupBlock */}
                {selectedBlock._type === 'buttonGroupBlock' && (
                  <div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>按钮列表</div>
                    {(selectedBlock.buttons || []).map((b: any, bIdx: number) => (
                      <div
                        key={b._key || bIdx}
                        style={{
                          padding: '8px',
                          backgroundColor: '#1c1e27',
                          borderRadius: '6px',
                          border: '1px solid #282b37',
                          marginBottom: '8px',
                        }}
                      >
                        <input
                          type="text"
                          placeholder="按钮文字"
                          value={safeText(b.label)}
                          onChange={(e) => {
                            const newB = [...selectedBlock.buttons]
                            newB[bIdx] = { ...newB[bIdx], label: e.target.value }
                            updateSelectedBlockField('buttons', newB)
                          }}
                          style={{
                            width: '100%',
                            padding: '4px 6px',
                            backgroundColor: '#121318',
                            color: '#ffffff',
                            border: '1px solid #323542',
                            borderRadius: '4px',
                            fontSize: '11px',
                            marginBottom: '4px',
                          }}
                        />
                        <select
                          value={b.actionType || 'rfqDrawer'}
                          onChange={(e) => {
                            const newB = [...selectedBlock.buttons]
                            newB[bIdx] = { ...newB[bIdx], actionType: e.target.value }
                            updateSelectedBlockField('buttons', newB)
                          }}
                          style={{
                            width: '100%',
                            padding: '4px 6px',
                            backgroundColor: '#121318',
                            color: '#ffffff',
                            border: '1px solid #323542',
                            borderRadius: '4px',
                            fontSize: '11px',
                          }}
                        >
                          <option value="rfqDrawer">⚡ 一键打开询盘抽屉</option>
                          <option value="url">🌐 网页跳转链接</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
