import React, { useState, useEffect } from 'react'
import { useToast } from '@sanity/ui/toast'
import { useClient } from 'sanity'

interface PurgeResult {
  path: string
  success: boolean
  purgedUrls?: string[]
  edgeCachePurged?: boolean
  cdnPurged?: boolean
  error?: string
  timestamp: string
}

const PRESET_PAGES = [
  { label: '🏠 首页 (Homepage)', path: '/', desc: '官网主页及所有积木区块缓存' },
  { label: '🏛️ 产品大厅 (Products)', path: '/products', desc: '产品目录大厅、筛选及规格卡片' },
  { label: '📄 关于我们 (About)', path: '/about', desc: '工坊介绍与品牌故事独立单页' },
]

export function CachePurgeDashboard() {
  const toast = useToast()
  const client = useClient({ apiVersion: '2023-01-01' })

  const [customPath, setCustomPath] = useState('')
  const [loadingPath, setLoadingPath] = useState<string | null>(null)
  const [logs, setLogs] = useState<PurgeResult[]>([])
  const [recentProducts, setRecentProducts] = useState<Array<{ title: any; slug: string }>>([])
  const [loadingProducts, setLoadingProducts] = useState(false)

  // 线上前台地址与密钥：优先读取 studio 环境变量
  const siteUrl = (process.env.SANITY_STUDIO_SITE_URL || 'https://gwenvenni.com').replace(/\/$/, '')
  const secret = process.env.SANITY_STUDIO_REVALIDATE_SECRET || 'itsasecret'

  const getTitleText = (title: any): string => {
    if (typeof title === 'string') return title
    if (typeof title === 'object' && title !== null) {
      return title.en || title.zh || title.de || title.fr || title.es || Object.values(title)[0] || '未命名产品'
    }
    return '未命名产品'
  }

  // 加载最近的产品列表方便直接点选清理
  useEffect(() => {
    let mounted = true
    setLoadingProducts(true)
    client
      .fetch(`*[_type == "product" && defined(slug.current)] | order(_updatedAt desc)[0...8]{ "title": coalesce(title.en, title.zh, title.de, title), "slug": slug.current }`)
      .then((data) => {
        if (mounted && Array.isArray(data)) {
          setRecentProducts(data)
        }
      })
      .catch((err) => {
        console.warn('Failed to load recent products for cache purge dashboard:', err)
      })
      .finally(() => {
        if (mounted) setLoadingProducts(false)
      })

    return () => {
      mounted = false
    }
  }, [client])

  // 执行缓存清理核心调用
  const executePurge = async (targetPath: string) => {
    let cleanPath = targetPath.trim()
    if (!cleanPath) return
    if (!cleanPath.startsWith('/')) {
      cleanPath = `/${cleanPath}`
    }

    setLoadingPath(cleanPath)

    try {
      const endpoint = `${siteUrl}/api/revalidate?path=${encodeURIComponent(cleanPath)}&secret=${encodeURIComponent(secret)}`
      const res = await fetch(endpoint, {
        method: 'GET',
        mode: 'cors',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      })

      const data = await res.json()
      const now = new Date().toLocaleTimeString()

      if (res.ok && data.success) {
        toast.push({
          status: 'success',
          title: `已成功清除缓存: ${cleanPath}`,
          description: `Worker 边缘缓存与 Cloudflare CDN 已全部秒级同步刷新`,
        })

        setLogs((prev) => [
          {
            path: cleanPath,
            success: true,
            purgedUrls: data.purgedUrls || [`${siteUrl}${cleanPath}`],
            edgeCachePurged: data.edgeCachePurged ?? true,
            cdnPurged: data.cdnPurged ?? true,
            timestamp: now,
          },
          ...prev.slice(0, 9),
        ])
      } else {
        const errorMsg = data.error || `HTTP ${res.status}`
        toast.push({
          status: 'error',
          title: `清除缓存失败: ${cleanPath}`,
          description: errorMsg,
        })

        setLogs((prev) => [
          {
            path: cleanPath,
            success: false,
            error: errorMsg,
            timestamp: now,
          },
          ...prev.slice(0, 9),
        ])
      }
    } catch (err: any) {
      const errorMsg = err.message || '网络请求超时或跨域被拦截'
      toast.push({
        status: 'error',
        title: `网络连接异常`,
        description: errorMsg,
      })

      setLogs((prev) => [
        {
          path: cleanPath,
          success: false,
          error: errorMsg,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 9),
      ])
    } finally {
      setLoadingPath(null)
    }
  }

  // 一键清理所有核心页面
  const purgeAllCore = async () => {
    setLoadingPath('all-core')
    try {
      for (const p of PRESET_PAGES) {
        await executePurge(p.path)
      }
      toast.push({
        status: 'success',
        title: '核心页面批量清理完成',
        description: '首页、产品大厅与关于页面均已更新至最新状态',
      })
    } finally {
      setLoadingPath(null)
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        backgroundColor: '#f8fafc',
        color: '#0f172a',
        padding: '28px 24px 60px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
      }}
    >
      <div style={{ maxWidth: '1020px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* 顶部主横幅 Banner */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            padding: '24px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ flex: '1 1 500px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '20px' }}>⚡</span>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a', lineHeight: 1.4 }}>
                Cloudflare 边缘缓存与 CDN 快速刷新
              </h1>
              <span
                style={{
                  backgroundColor: '#ecfdf5',
                  color: '#059669',
                  border: '1px solid #a7f3d0',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}
              >
                双层缓存直连
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
              点击下方按钮即可触发 Cloudflare Worker 边缘缓存 (<code style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#2563eb', fontSize: '12px' }}>caches.default</code>) 与全球 CDN 节点的秒级物理清理，让前台买手立刻看到 Sanity Studio 发布的最新款式与版块。
            </p>
          </div>

          <div>
            <button
              type="button"
              disabled={Boolean(loadingPath)}
              onClick={purgeAllCore}
              style={{
                backgroundColor: loadingPath === 'all-core' ? '#94a3b8' : '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: loadingPath ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{loadingPath === 'all-core' ? '⏳ 批量清理中...' : '🚀 一键清理全部核心页面'}</span>
            </button>
          </div>
        </div>

        {/* 板块 1: 常用核心页面 */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            padding: '20px 24px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 600, color: '#1e293b', lineHeight: 1.4 }}>
              1. 核心页面一键刷新 (Core Pages)
            </h2>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
              最常编辑的主干页面，单次点击 20ms 内完成全网缓存失效：
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            {PRESET_PAGES.map((p) => {
              const isLoading = loadingPath === p.path
              return (
                <div
                  key={p.path}
                  style={{
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#f8fafc',
                    borderRadius: '10px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
                      {p.label}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', lineHeight: 1.4 }}>
                      {p.desc}
                    </div>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: '#2563eb',
                        backgroundColor: '#eff6ff',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid #dbeafe',
                      }}
                    >
                      {p.path}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={Boolean(loadingPath)}
                    onClick={() => executePurge(p.path)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      fontSize: '13px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: isLoading ? '#94a3b8' : '#2563eb',
                      color: '#ffffff',
                      cursor: loadingPath ? 'not-allowed' : 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    {isLoading ? '⏳ 清除中...' : '立即清除此页缓存'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* 板块 2: 最近更新的产品详情页 */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            padding: '20px 24px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 600, color: '#1e293b', lineHeight: 1.4 }}>
                2. 最近更新的产品详情页 (Product Details)
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                点击快速清除单款产品详情页缓存（<code style={{ fontSize: '12px', color: '#2563eb' }}>/products/[slug]</code>）：
              </p>
            </div>
            {loadingProducts && <span style={{ fontSize: '12px', color: '#94a3b8' }}>正在同步产品列表...</span>}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
            }}
          >
            {recentProducts.map((prod) => {
              const target = `/products/${prod.slug}`
              const isLoading = loadingPath === target
              return (
                <div
                  key={prod.slug}
                  style={{
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#1e293b',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginBottom: '2px',
                      }}
                      title={getTitleText(prod.title)}
                    >
                      {getTitleText(prod.title)}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#64748b',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={prod.slug}
                    >
                      {prod.slug}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={Boolean(loadingPath)}
                    onClick={() => executePurge(target)}
                    style={{
                      flexShrink: 0,
                      padding: '5px 12px',
                      fontSize: '12px',
                      fontWeight: 500,
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: isLoading ? '#f1f5f9' : '#ffffff',
                      color: isLoading ? '#94a3b8' : '#0f172a',
                      cursor: loadingPath ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isLoading ? '...' : '刷新'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* 板块 3: 自定义路径输入 */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            padding: '20px 24px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ marginBottom: '14px' }}>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 600, color: '#1e293b', lineHeight: 1.4 }}>
              3. 自定义路径清理 (Custom Path Purge)
            </h2>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
              输入任意线上相对路径（例如 <code style={{ fontSize: '12px', color: '#2563eb' }}>/products/silk-crew-socks</code> 或 <code style={{ fontSize: '12px', color: '#2563eb' }}>/privacy</code>）：
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px', position: 'relative' }}>
              <input
                type="text"
                placeholder="/products/your-slug"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                disabled={Boolean(loadingPath)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 14px',
                  fontSize: '13px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  outline: 'none',
                }}
              />
            </div>
            <button
              type="button"
              disabled={Boolean(loadingPath) || !customPath.trim()}
              onClick={() => executePurge(customPath)}
              style={{
                padding: '10px 20px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                border: 'none',
                backgroundColor: loadingPath === customPath ? '#94a3b8' : '#f59e0b',
                color: '#ffffff',
                cursor: loadingPath || !customPath.trim() ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s ease',
              }}
            >
              {loadingPath === customPath ? '⏳ 清除中...' : '⚡ 立即清除'}
            </button>
          </div>
        </div>

        {/* 板块 4: 最近清除结果日志 */}
        {logs.length > 0 && (
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              padding: '20px 24px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div style={{ marginBottom: '14px' }}>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 600, color: '#1e293b', lineHeight: 1.4 }}>
                📋 最近刷新结果 (Recent Activity)
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {logs.map((log, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: log.success ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${log.success ? '#bbf7d0' : '#fecaca'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: log.success ? '#22c55e' : '#ef4444',
                          color: '#ffffff',
                        }}
                      >
                        {log.success ? 'PURGED 200' : 'FAILED'}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                        {log.path}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      {log.timestamp}
                    </span>
                  </div>

                  {log.purgedUrls && log.purgedUrls.length > 0 && (
                    <div style={{ fontSize: '11px', color: '#475569', wordBreak: 'break-all' }}>
                      广播生效 URL: {log.purgedUrls.join(', ')}
                    </div>
                  )}

                  {log.error && (
                    <div style={{ fontSize: '12px', color: '#dc2626' }}>
                      错误说明: {log.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
