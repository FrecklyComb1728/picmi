<template>
  <div class="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
    <div
      v-for="entry in entries"
      :key="entry.path"
      class="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white text-left transition hover:border-zinc-300 hover:shadow-sm"
      :class="{ 'ring-2 ring-primary ring-offset-1': selectedSet.has(entry.path) }"
      @click="onOpen(entry)"
    >
      <div class="flex items-start gap-3 p-3">
        <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-50 text-zinc-900">
          <img :src="iconUrl(entry)" alt="" class="h-6 w-6" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium text-zinc-900">{{ entry.name }}</div>
          <div class="mt-0.5 truncate text-xs text-zinc-500">{{ entry.type === 'folder' ? '文件夹' : metaText(entry) }}</div>
        </div>
        <div class="shrink-0 flex items-center gap-1" @click.stop>
          <n-dropdown trigger="click" :options="getActionOptions(entry)" @select="(k) => handleAction(k, entry)">
            <n-button size="tiny" quaternary circle>
              <template #icon><n-icon :component="EllipsisVertical" /></template>
            </n-button>
          </n-dropdown>
          <n-checkbox
            v-if="selectable"
            :checked="selectedSet.has(entry.path)"
            @update:checked="(v) => onToggle(entry, v)"
          />
        </div>
      </div>

      <div v-if="entry.type === 'image'" class="relative aspect-video w-full bg-zinc-50">
        <img
          v-if="entry.thumbUrl || entry.url"
          :src="entry.thumbUrl || entry.url"
          :alt="entry.name"
          class="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-90"
          loading="lazy"
          @dblclick.stop="onDblClick(entry)"
          @contextmenu.stop.prevent="(e) => onContextMenu(e, entry)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toRefs, h } from 'vue'
import { NCheckbox, NDropdown, NButton, NIcon } from 'naive-ui'
import { EllipsisVertical, CopyOutline, FolderOpenOutline, CreateOutline, TrashOutline } from '@vicons/ionicons5'
import type { ImageEntry } from '~/types/images'
import folderIconUrl from '~/assets/svg/folder.svg?url'
import imageIconUrl from '~/assets/svg/image.svg?url'
import fileIconUrl from '~/assets/svg/file.svg?url'

const props = defineProps<{
  entries: ImageEntry[]
  selectable: boolean
  selectedSet: Set<string>
}>()

const emit = defineEmits<{
  open: [entry: ImageEntry]
  toggle: [entry: ImageEntry, checked: boolean]
  action: [action: string, entry: ImageEntry]
  dblclick: [entry: ImageEntry]
  contextmenu: [entry: ImageEntry, x: number, y: number]
}>()

const renderIcon = (icon: any) => {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const iconUrl = (entry: ImageEntry) => {
  if (entry.type === 'folder') return folderIconUrl
  if (entry.type === 'image') return imageIconUrl
  return fileIconUrl
}

const getActionOptions = (entry: ImageEntry) => [
  { label: '复制', key: 'copy', icon: renderIcon(CopyOutline) },
  { label: '移动', key: 'move', icon: renderIcon(FolderOpenOutline) },
  { label: '重命名', key: 'rename', icon: renderIcon(CreateOutline) },
  { label: '删除', key: 'delete', icon: renderIcon(TrashOutline), props: { style: 'color: #d03050' } }
]

const handleAction = (key: string, entry: ImageEntry) => {
  emit('action', key, entry)
}

const onOpen = (entry: ImageEntry) => {
  emit('open', entry)
}

const onDblClick = (entry: ImageEntry) => {
  emit('dblclick', entry)
}

const onContextMenu = (e: MouseEvent, entry: ImageEntry) => {
  emit('contextmenu', entry, e.clientX, e.clientY)
}

const onToggle = (entry: ImageEntry, checked: boolean) => {
  emit('toggle', entry, checked)
}

const metaText = (entry: ImageEntry) => {
  if (entry.size != null) {
    const kb = entry.size / 1024
    if (kb < 1024) return `${kb.toFixed(0)} KB`
    return `${(kb / 1024).toFixed(1)} MB`
  }
  if (entry.type === 'folder') return '文件夹'
  return entry.uploadedAt ? new Date(entry.uploadedAt).toLocaleDateString() : (entry.type === 'image' ? '图片' : '文件')
}

const { entries, selectable, selectedSet } = toRefs(props)
</script>
