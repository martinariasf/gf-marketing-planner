export type AssetKind = 'image' | 'logo' | 'video' | 'document'
// Known sources we have dedicated styling for. The agent also writes provider
// strings like "openrouter:gpt-5.4-image-2", so the runtime type stays open —
// the UI falls back to a generic "AI generated" badge for anything unknown.
export type KnownAssetSource = 'unsplash' | 'nano-banana' | 'canva' | 'internal' | 'other'
export type AssetSource = KnownAssetSource | (string & {})

export interface AssetItem {
  id: string
  filename: string
  url: string
  kind: AssetKind
  source: AssetSource
  designBrief?: string
  usedInPosts: string[]
  owner: string
  finalApproved: boolean
  createdAt: string
}

export interface AssetsManifest {
  items: AssetItem[]
}
