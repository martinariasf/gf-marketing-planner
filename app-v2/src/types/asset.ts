export type AssetKind = 'image' | 'logo' | 'video' | 'document'
export type AssetSource = 'unsplash' | 'nano-banana' | 'canva' | 'internal' | 'other'

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
