<template>
  <div class="hidden"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, toRefs } from 'vue'

const props = defineProps<{ currentPath: string }>()
const emit = defineEmits<{ 
  uploaded: [],
  paste: [File[]] 
}>()

const onPaste = (e: ClipboardEvent) => {
  const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : []
  const files = items
    .map((it) => (it.kind === 'file' ? it.getAsFile() : null))
    .filter((f): f is File => f !== null && f.type.startsWith('image/'))

  if (!files.length) return
  emit('paste', files)
}

onMounted(() => {
  window.addEventListener('paste', onPaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
})
</script>
