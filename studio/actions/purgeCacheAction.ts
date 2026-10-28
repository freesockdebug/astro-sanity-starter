import { DocumentActionComponent, DocumentActionProps } from 'sanity'
import { useToast } from '@sanity/ui/toast'
import { useState } from 'react'
import { BoltIcon } from '@sanity/icons/Bolt'

export function createPurgeCacheAction(): DocumentActionComponent {
  return function PurgeCacheAction(props: DocumentActionProps) {
    const { id, type, published, draft } = props
    const toast = useToast()
    const [isPurging, setIsPurging] = useState(false)

    // 仅在有草稿或已发布文档时显示
    const doc = published || draft
    if (!doc) return null

    // 计算当前文档对应的线上前台路径
    let targetPath = ''
    if (type === 'product') {
      const slug = (doc as any)?.slug?.current
      if (slug) {
        targetPath = `/products/${slug}`
      }
    } else if (type === 'page') {
      const slug = (doc as any)?.slug?.current
      if (slug === 'home' || slug === 'index' || id === 'a59d87e4-e3ff-4929-acc1-d67b1808d36c') {
        targetPath = '/'
      } else if (slug) {
        targetPath = `/${slug.replace(/^\//, '')}`
      }
    } else if (type === 'catalogSettings') {
      targetPath = '/products'
    } else if (type === 'siteConfig') {
      targetPath = '/'
    }

    if (!targetPath) return null

    const viteEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {}
    const procEnv = (typeof process !== 'undefined' && process.env ? process.env : {}) as Record<string, string | undefined>
    const isGwenDomain = typeof window !== 'undefined' && window.location.hostname.endsWith('gwenvenni.com')
    const defaultOrigin = isGwenDomain ? 'https://gwenvenni.com' : (typeof window !== 'undefined' ? window.location.origin : 'https://gwenvenni.com')
    const siteUrl = (viteEnv.SANITY_STUDIO_SITE_URL || procEnv.SANITY_STUDIO_SITE_URL || defaultOrigin).replace(/\/$/, '')
    const secret = viteEnv.SANITY_STUDIO_REVALIDATE_SECRET || procEnv.SANITY_STUDIO_REVALIDATE_SECRET || 'itsasecret'

    return {
      label: isPurging ? '正在清除缓存...' : '⚡ 清除此页 CDN 缓存',
      title: `向 Cloudflare 边缘分发节点发出指令，清除 ${targetPath} 缓存`,
      icon: BoltIcon,
      disabled: isPurging,
      onHandle: async () => {
        setIsPurging(true)
        try {
          const endpoint = `${siteUrl}/api/revalidate?path=${encodeURIComponent(targetPath)}&secret=${encodeURIComponent(secret)}`
          const res = await fetch(endpoint, {
            method: 'GET',
            mode: 'cors',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(10000),
          })
          const data = await res.json()

          if (res.ok && data.success) {
            toast.push({
              status: 'success',
              title: `缓存清除成功: ${targetPath}`,
              description: `Cloudflare Worker 与 CDN 缓存已即时更新`,
            })
          } else {
            toast.push({
              status: 'error',
              title: `清除失败: ${targetPath}`,
              description: data.error || `HTTP ${res.status}`,
            })
          }
        } catch (err: any) {
          toast.push({
            status: 'error',
            title: `网络连接异常`,
            description: err.message || '请求超时或被拦截',
          })
        } finally {
          setIsPurging(false)
        }
      },
    }
  }
}
