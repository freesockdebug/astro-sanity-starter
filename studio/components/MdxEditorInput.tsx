import React, { useCallback, useId, useEffect, useState, useRef } from 'react'
import { StringInputProps, set, unset, useClient } from 'sanity'
import {
  MDXEditor,
  MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  tablePlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  diffSourcePlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  CreateLink,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  DiffSourceToggleWrapper,
  ListsToggle,
} from '@mdxeditor/editor'
import { Dialog, Button, Card, Box, Flex, Text, Spinner, TextInput, Badge } from '@sanity/ui'

interface SanityImageAsset {
  _id: string
  url: string
  originalFilename?: string
  size?: number
  _createdAt?: string
  metadata?: {
    dimensions?: {
      width: number
      height: number
      aspectRatio: number
    }
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes) return ''
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function MdxEditorInput(props: StringInputProps) {
  const { value, onChange, readOnly } = props
  const editorKey = useId()
  const editorRef = useRef<MDXEditorMethods | null>(null)
  const client = useClient({ apiVersion: '2024-01-01' })

  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  const [assets, setAssets] = useState<SanityImageAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAsset, setSelectedAsset] = useState<SanityImageAsset | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    // Dynamic import to prevent Node.js / tsx runner CSS syntax error during schema preflights
    // @ts-ignore
    import('@mdxeditor/editor/style.css')
  }, [])

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    try {
      const data = await client.fetch<SanityImageAsset[]>(
        `*[_type == "sanity.imageAsset"] | order(_createdAt desc)[0..160]{
          _id,
          url,
          originalFilename,
          size,
          _createdAt,
          metadata { dimensions { width, height, aspectRatio } }
        }`
      )
      setAssets(data || [])
      if (data && data.length > 0) {
        setSelectedAsset(data[0])
      }
    } catch (err) {
      console.error('Failed to load Sanity image assets:', err)
    } finally {
      setLoading(false)
    }
  }, [client])

  const handleOpenLibrary = useCallback(() => {
    setIsLibraryOpen(true)
    fetchAssets()
  }, [fetchAssets])

  const handleCloseLibrary = useCallback(() => {
    setIsLibraryOpen(false)
  }, [])

  const handleChange = useCallback(
    (nextMarkdown: string) => {
      onChange(nextMarkdown ? set(nextMarkdown) : unset())
    },
    [onChange]
  )

  // Upload handler for MDXEditor native paste/drag-and-drop & native dialog
  const handleImageUpload = useCallback(
    async (file: File): Promise<string> => {
      const asset = await client.assets.upload('image', file, {
        filename: file.name,
      })
      return asset.url
    },
    [client]
  )

  // Direct insert an asset
  const handleInsertAsset = useCallback(
    (asset: SanityImageAsset) => {
      const altText = asset.originalFilename
        ? asset.originalFilename.replace(/\.[^/.]+$/, '').trim()
        : 'Image'
      const markdownToInsert = `![${altText}](${asset.url})\n\n`

      if (editorRef.current) {
        editorRef.current.insertMarkdown(markdownToInsert)
        try {
          editorRef.current.focus()
        } catch {
          // ignore focus error
        }
      } else {
        const current = value || ''
        onChange(set(current ? `${current}\n\n${markdownToInsert}` : markdownToInsert))
      }
      setIsLibraryOpen(false)
    },
    [value, onChange]
  )

  // Upload new image from within Asset Library dialog
  const handleUploadFromDialog = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return
      const file = files[0]
      setUploading(true)
      try {
        const newAsset = (await client.assets.upload('image', file, {
          filename: file.name,
        })) as SanityImageAsset
        // Prepend to asset list and insert
        setAssets((prev) => [newAsset, ...prev])
        handleInsertAsset(newAsset)
      } catch (err) {
        console.error('Error uploading asset to Sanity:', err)
      } finally {
        setUploading(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [client, handleInsertAsset]
  )

  const filteredAssets = assets.filter((asset) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (asset.originalFilename || '').toLowerCase().includes(q)
  })

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        backgroundColor: '#ffffff',
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <MDXEditor
        ref={editorRef}
        key={editorKey}
        markdown={value || ''}
        onChange={handleChange}
        readOnly={readOnly}
        contentEditableClassName="mdx-editor-prose"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          tablePlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          imagePlugin({
            imageUploadHandler: handleImageUpload,
          }),
          diffSourcePlugin({ viewMode: 'rich-text' }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <DiffSourceToggleWrapper>
                <UndoRedo />
                <BlockTypeSelect />
                <BoldItalicUnderlineToggles />
                <ListsToggle />
                <CreateLink />
                <InsertImage />
                <button
                  type="button"
                  title="从 Sanity 资源库中选择图片 (Asset Library)"
                  aria-label="从 Sanity 资源库中选择图片"
                  onClick={handleOpenLibrary}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#1e293b',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    lineHeight: '1.2',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#e2e8f0'
                    e.currentTarget.style.borderColor = '#94a3b8'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f8fafc'
                    e.currentTarget.style.borderColor = '#cbd5e1'
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>资源库</span>
                </button>
                <InsertTable />
                <InsertThematicBreak />
              </DiffSourceToggleWrapper>
            ),
          }),
        ]}
      />

      {isLibraryOpen && (
        <Dialog
          id="sanity-asset-library-dialog"
          header="Sanity 媒体资源库"
          onClose={handleCloseLibrary}
          width={4}
          zOffset={100000}
        >
          <Box padding={4} style={{ minWidth: '600px', maxWidth: '960px', width: '100%', boxSizing: 'border-box' }}>
            {/* Header Action Bar */}
            <Flex gap={3} align="center" justify="space-between" style={{ marginBottom: '14px' }}>
              <Box flex={1}>
                <TextInput
                  placeholder="搜索图片文件名..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  fontSize={1}
                  padding={2}
                />
              </Box>
              <Flex gap={2} align="center">
                <Button
                  mode="ghost"
                  text="刷新"
                  onClick={fetchAssets}
                  disabled={loading}
                  fontSize={1}
                  padding={2}
                />
                <Button
                  tone="primary"
                  text={uploading ? '上传中...' : '上传新图片'}
                  onClick={() => fileInputRef.current?.click()}
                  loading={uploading}
                  fontSize={1}
                  padding={2}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleUploadFromDialog}
                />
              </Flex>
            </Flex>

            {/* Instruction Tip */}
            <Flex justify="space-between" align="center" style={{ marginBottom: '12px' }}>
              <Text size={1} muted>
                单击选择图片，双击或点击下方按钮直接插入到 Markdown 文档中
              </Text>
              <Badge tone="default" fontSize={0}>
                共 {filteredAssets.length} 张图片
              </Badge>
            </Flex>

            {/* Loading */}
            {loading && (
              <Flex justify="center" align="center" padding={6} style={{ minHeight: '260px' }}>
                <Spinner size={3} />
              </Flex>
            )}

            {/* Empty */}
            {!loading && filteredAssets.length === 0 && (
              <Card padding={5} tone="transparent" radius={2} border style={{ textAlign: 'center', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text size={2} muted>
                  {searchQuery ? '没有找到匹配的图片' : '暂无已上传的图片资产'}
                </Text>
              </Card>
            )}

            {/* Standard Media Library Grid */}
            {!loading && filteredAssets.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(136px, 1fr))',
                  gap: '12px',
                  maxHeight: '52vh',
                  overflowY: 'auto',
                  padding: '4px',
                  boxSizing: 'border-box',
                }}
              >
                {filteredAssets.map((asset) => {
                  const isSelected = selectedAsset?._id === asset._id
                  const dim = asset.metadata?.dimensions
                  const dimText = dim ? `${dim.width}×${dim.height}` : ''

                  return (
                    <div
                      key={asset._id}
                      onClick={() => setSelectedAsset(asset)}
                      onDoubleClick={() => handleInsertAsset(asset)}
                      title={`${asset.originalFilename || '图片'}${dimText ? ` (${dimText})` : ''}`}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 0 0 2px rgba(37,99,235,0.2)' : 'none',
                        userSelect: 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = '#94a3b8'
                          e.currentTarget.style.transform = 'translateY(-1px)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = '#e2e8f0'
                          e.currentTarget.style.transform = 'none'
                        }
                      }}
                    >
                      {/* Thumbnail Container (1:1 Aspect Ratio) */}
                      <div
                        style={{
                          width: '100%',
                          paddingTop: '100%',
                          position: 'relative',
                          backgroundColor: '#f8fafc',
                        }}
                      >
                        <img
                          src={`${asset.url}?w=260&h=260&fit=crop&auto=format`}
                          alt={asset.originalFilename || 'Asset'}
                          loading="lazy"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                        />
                        {/* Selected Checkmark Badge */}
                        {isSelected && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '6px',
                              right: '6px',
                              backgroundColor: '#2563eb',
                              color: '#ffffff',
                              borderRadius: '50%',
                              width: '20px',
                              height: '20px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Info Bar */}
                      <div
                        style={{
                          padding: '6px 8px',
                          backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                          borderTop: '1px solid #f1f5f9',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: 500,
                            color: isSelected ? '#1e40af' : '#334155',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {asset.originalFilename || '未命名'}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '10px',
                            color: '#94a3b8',
                            marginTop: '2px',
                          }}
                        >
                          <span>{dimText}</span>
                          <span>{formatBytes(asset.size)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Bottom Confirm Toolbar */}
            <Flex
              justify="space-between"
              align="center"
              style={{
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid #e2e8f0',
              }}
            >
              <Box flex={1} style={{ overflow: 'hidden', marginRight: '16px' }}>
                {selectedAsset ? (
                  <Text size={1}>
                    已选: <strong>{selectedAsset.originalFilename || '未命名图片'}</strong>
                    {selectedAsset.metadata?.dimensions && (
                      <span style={{ color: '#64748b', marginLeft: '6px' }}>
                        ({selectedAsset.metadata.dimensions.width} × {selectedAsset.metadata.dimensions.height})
                      </span>
                    )}
                  </Text>
                ) : (
                  <Text size={1} muted>
                    请点击选择一张图片
                  </Text>
                )}
              </Box>
              <Flex gap={2}>
                <Button mode="ghost" text="取消" onClick={handleCloseLibrary} fontSize={1} padding={2} />
                <Button
                  tone="primary"
                  text="插入选中图片"
                  disabled={!selectedAsset}
                  onClick={() => selectedAsset && handleInsertAsset(selectedAsset)}
                  fontSize={1}
                  padding={2}
                />
              </Flex>
            </Flex>
          </Box>
        </Dialog>
      )}

      <style>{`
        .mdx-editor-prose {
          min-height: 240px;
          padding: 16px 20px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
          font-size: 14.5px;
          line-height: 1.62;
          color: #1e293b;
          text-wrap: pretty;
          max-width: 72ch;
          margin: 0 auto;
        }
        .mdx-editor-prose h1, .mdx-editor-prose h2, .mdx-editor-prose h3, .mdx-editor-prose h4 {
          color: #0f172a;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-top: 1.15em;
          margin-bottom: 0.35em;
          line-height: 1.25;
          text-wrap: balance;
        }
        .mdx-editor-prose h1 { font-size: 1.45rem; }
        .mdx-editor-prose h2 { font-size: 1.22rem; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
        .mdx-editor-prose h3 { font-size: 1.08rem; }
        .mdx-editor-prose h4 { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b; }
        .mdx-editor-prose p {
          margin-top: 0;
          margin-bottom: 0.7em;
          line-height: 1.62;
          text-wrap: pretty;
        }
        .mdx-editor-prose table {
          border-collapse: separate;
          border-spacing: 0;
          width: 100%;
          margin: 12px 0 16px 0;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          overflow: hidden;
          font-size: 13px;
        }
        .mdx-editor-prose th, .mdx-editor-prose td {
          border-bottom: 1px solid #e2e8f0;
          padding: 7px 12px;
          text-align: left;
          vertical-align: middle;
        }
        .mdx-editor-prose th {
          background-color: #f8fafc;
          font-weight: 600;
          color: #334155;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border-bottom: 1px solid #cbd5e1;
        }
        .mdx-editor-prose td:first-child {
          font-weight: 500;
          color: #0f172a;
          width: 38%;
        }
        .mdx-editor-prose tr:last-child td {
          border-bottom: none;
        }
        .mdx-editor-prose tr:nth-child(even) td {
          background-color: #fafafc;
        }
        .mdx-editor-prose blockquote {
          border-left: 3px solid #f59e0b;
          padding: 8px 14px;
          margin: 12px 0;
          color: #475569;
          font-style: italic;
          background-color: #fbf9f5;
          border-radius: 0 6px 6px 0;
        }
        .mdx-editor-prose img {
          max-width: 100%;
          width: 100%;
          height: auto;
          border-radius: 10px;
          margin: 12px 0 4px 0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          display: block;
        }
      `}</style>
    </div>
  )
}

export default MdxEditorInput
