export type ClipboardMode = 'copy' | 'cut'

export type ClipboardItem = {
  path: string
  type: 'image' | 'folder'
}

type ImageClipboard = {
  mode: ClipboardMode | null
  items: ClipboardItem[]
}

export function useImageClipboard() {
  const clipboard = useState<ImageClipboard>('images.clipboard', () => ({ mode: null, items: [] }))

  const set = (mode: ClipboardMode, items: ClipboardItem[]) => {
    clipboard.value = { mode, items }
  }

  const clear = () => {
    clipboard.value = { mode: null, items: [] }
  }

  return { clipboard, set, clear }
}
