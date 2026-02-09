export type ImageEntryType = 'image' | 'file' | 'folder'

export type ImageEntry = {
  type: ImageEntryType
  name: string
  path: string
  url?: string
  size?: number
  uploadedAt?: string
}

export type ImagesListResponse = {
  path: string
  items: ImageEntry[]
  total?: number
}
