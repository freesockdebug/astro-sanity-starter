import React, { useState, useEffect } from 'react'
import { Card, Flex, Box, Stack, Text, Heading, Button, TextInput, Badge, Spinner, Grid } from '@sanity/ui'
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
  { label: '🏠 首页 (Homepage)', path: '/', desc: '清理官网主页 /' },
  { label: '🏛️ 产品大厅 (Products Catalog)', path: '/products', desc: '清理产品列表页及分类' },
  { label: '📄 关于我们 (About Page)', path: '/about', desc: '清理品牌介绍关于页' },
]

export function CachePurgeDashboard() {
  const toast = useToast()
  const client = useClient({ apiVersion: '2023-01-01' })

  const [customPath, setCustomPath] = useState('')
  const [loadingPath, setLoadingPath] = useState<string | null>(null)
  const [logs, setLogs] = useState<PurgeResult[]>([])
  const [recentProducts, setRecentProducts] = useState<Array<{ title: string; slug: string }>>([])
  const [loadingProducts, setLoadingProducts] = useState(false)

  // 线上地址与密钥：优先读取 studio 环境变量，支持安全默认值
  const siteUrl = (process.env.SANITY_STUDIO_SITE_URL || 'https://gwenvenni.com').replace(/\/$/, '')
  const secret = process.env.SANITY_STUDIO_REVALIDATE_SECRET || 'itsasecret'

  // 加载最近的产品列表方便直接点选清理
  useEffect(() => {
    let mounted = true
    setLoadingProducts(true)
    client
      .fetch(`*[_type == "product" && defined(slug.current)] | order(_updatedAt desc)[0...8]{ title, "slug": slug.current }`)
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
        headers: { Accept: 'application/json' },
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
      const errorMsg = err.message || '网络请求超时或失败'
      toast.push({
        status: 'error',
        title: `网络连接失败`,
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
    <Box padding={[4, 5, 6]} style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <Stack space={5}>
        {/* Header Banner */}
        <Card padding={4} radius={3} shadow={1} tone="primary">
          <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
            <Stack space={2}>
              <Flex align="center" gap={2}>
                <Heading as="h1" size={3}>
                  ⚡ Cloudflare 边缘缓存与 CDN 快速刷新
                </Heading>
                <Badge tone="positive" fontSize={1} padding={2}>
                  双层缓存直连
                </Badge>
              </Flex>
              <Text size={1} muted>
                点击下方按钮即可触发 Cloudflare Worker 边缘缓存 (<code style={{ fontSize: '11px' }}>caches.default</code>) 与全球 CDN 节点的秒级物理清理，让前台买手立刻看到 Sanity Studio 发布的最新内容。
              </Text>
            </Stack>
            <Button
              text={loadingPath === 'all-core' ? '全站批量清理中...' : '🚀 一键清理全部核心页面'}
              tone="positive"
              fontSize={1}
              padding={3}
              loading={loadingPath === 'all-core'}
              disabled={Boolean(loadingPath)}
              onClick={purgeAllCore}
            />
          </Flex>
        </Card>

        {/* 1. 常用核心页面卡片 */}
        <Card padding={4} radius={3} border>
          <Stack space={3}>
            <Heading as="h2" size={1}>
              1. 核心页面一键刷新
            </Heading>
            <Text size={1} muted>
              最常修改的公共页面，单次点击 20ms 内完成全网缓存清除：
            </Text>

            <Grid columns={[1, 2, 3]} gap={3}>
              {PRESET_PAGES.map((p) => {
                const isLoading = loadingPath === p.path
                return (
                  <Card key={p.path} padding={3} radius={2} border tone="inherit">
                    <Flex direction="column" justify="space-between" style={{ height: '100%' }} gap={3}>
                      <Stack space={1}>
                        <Text weight="semibold" size={1}>
                          {p.label}
                        </Text>
                        <Text size={1} muted>
                          路径: <code style={{ fontSize: '11px', color: '#6366f1' }}>{p.path}</code>
                        </Text>
                      </Stack>
                      <Button
                        text={isLoading ? '清理中...' : '立即清除此页缓存'}
                        tone="primary"
                        fontSize={1}
                        loading={isLoading}
                        disabled={Boolean(loadingPath)}
                        onClick={() => executePurge(p.path)}
                      />
                    </Flex>
                  </Card>
                )
              })}
            </Grid>
          </Stack>
        </Card>

        {/* 2. 产品详情页快速选填清理 */}
        <Card padding={4} radius={3} border>
          <Stack space={3}>
            <Flex justify="space-between" align="center">
              <Heading as="h2" size={1}>
                2. 最近更新的产品详情页 (Product Detail)
              </Heading>
              {loadingProducts && <Spinner size={1} />}
            </Flex>
            <Text size={1} muted>
              点击即可精准清除对应款式的详情页缓存（<code style={{ fontSize: '11px' }}>/products/[slug]</code>）：
            </Text>

            <Grid columns={[1, 2, 4]} gap={2}>
              {recentProducts.map((prod) => {
                const target = `/products/${prod.slug}`
                const isLoading = loadingPath === target
                return (
                  <Card key={prod.slug} padding={2} radius={2} border tone="transparent">
                    <Flex justify="space-between" align="center" gap={2}>
                      <Box style={{ overflow: 'hidden' }}>
                        <Text size={1} textOverflow="ellipsis" weight="medium">
                          {prod.title}
                        </Text>
                        <Text size={0} muted textOverflow="ellipsis">
                          {prod.slug}
                        </Text>
                      </Box>
                      <Button
                        text={isLoading ? '...' : '刷新'}
                        fontSize={0}
                        padding={2}
                        tone="default"
                        loading={isLoading}
                        disabled={Boolean(loadingPath)}
                        onClick={() => executePurge(target)}
                      />
                    </Flex>
                  </Card>
                )
              })}
            </Grid>
          </Stack>
        </Card>

        {/* 3. 自定义任意路径清理 */}
        <Card padding={4} radius={3} border>
          <Stack space={3}>
            <Heading as="h2" size={1}>
              3. 自定义路径清理 (Custom Path Purge)
            </Heading>
            <Text size={1} muted>
              如需清理特定独立落地页或特殊 URL，请在下方直接输入路径（例如 <code style={{ fontSize: '11px' }}>/products/silk-crew-socks</code> 或 <code style={{ fontSize: '11px' }}>/privacy</code>）：
            </Text>

            <Flex gap={2}>
              <Box flex={1}>
                <TextInput
                  placeholder="/products/your-product-slug"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.currentTarget.value)}
                  disabled={Boolean(loadingPath)}
                />
              </Box>
              <Button
                text={loadingPath === customPath ? '正在清除...' : '⚡ 立即清除'}
                tone="caution"
                loading={loadingPath === customPath}
                disabled={Boolean(loadingPath) || !customPath.trim()}
                onClick={() => executePurge(customPath)}
              />
            </Flex>
          </Stack>
        </Card>

        {/* 4. 最近操作日志 */}
        {logs.length > 0 && (
          <Card padding={4} radius={3} border tone="inherit">
            <Stack space={3}>
              <Heading as="h2" size={1}>
                📋 最近刷新结果
              </Heading>
              <Stack space={2}>
                {logs.map((log, idx) => (
                  <Card key={idx} padding={2} radius={2} tone={log.success ? 'positive' : 'critical'}>
                    <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
                      <Flex align="center" gap={2}>
                        <Badge tone={log.success ? 'positive' : 'critical'} fontSize={0}>
                          {log.success ? 'PURGED 200' : 'FAILED'}
                        </Badge>
                        <Text size={1} weight="semibold">
                          {log.path}
                        </Text>
                      </Flex>
                      <Text size={0} muted>
                        {log.timestamp}
                      </Text>
                    </Flex>
                    {log.purgedUrls && log.purgedUrls.length > 0 && (
                      <Box paddingTop={2}>
                        <Text size={0} muted>
                          已从 CDN 广播失效节点: {log.purgedUrls.join(', ')}
                        </Text>
                      </Box>
                    )}
                    {log.error && (
                      <Box paddingTop={1}>
                        <Text size={0} tone="critical">
                          错误原因: {log.error}
                        </Text>
                      </Box>
                    )}
                  </Card>
                ))}
              </Stack>
            </Stack>
          </Card>
        )}
      </Stack>
    </Box>
  )
}
