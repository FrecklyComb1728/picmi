export const useCommandPalette = () => {
  const show = useState('command-palette-show', () => false)
  const toggle = () => show.value = !show.value
  const open = () => show.value = true
  const close = () => show.value = false
  return { show, toggle, open, close }
}
