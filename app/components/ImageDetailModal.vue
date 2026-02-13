<template>
  <n-drawer v-model:show="open" :width="420" placement="right">
    <n-drawer-content title="图片详情" closable>
      <div v-if="entry" class="space-y-6">
        <div class="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
          <img v-if="entry.url" ref="imageRef" :src="entry.url" :alt="entry.name" class="w-full h-auto object-contain" @load="onImageLoad" />
          <div v-else class="flex aspect-square items-center justify-center text-sm text-zinc-500">无预览</div>
        </div>

        <div class="space-y-4">
          <div class="space-y-1">
             <label class="text-sm font-medium text-zinc-700">URL</label>
             <n-input-group>
               <n-input :value="urlText" readonly placeholder="无 URL" />
               <n-button type="primary" ghost @click="copyUrl" :disabled="!urlText">
                 <template #icon><n-icon :component="CopyOutline" /></template>
               </n-button>
             </n-input-group>
          </div>

          <n-descriptions :column="1" label-placement="left" bordered>
            <n-descriptions-item label="文件名">
              <span class="break-all">{{ entry.name }}</span>
            </n-descriptions-item>
            <n-descriptions-item label="大小">{{ sizeText }}</n-descriptions-item>
            <n-descriptions-item label="分辨率">{{ resolutionText }}</n-descriptions-item>
            <n-descriptions-item label="上传时间">{{ timeText }}</n-descriptions-item>
          </n-descriptions>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { 
  NDrawer, NDrawerContent, NInput, NInputGroup, NButton, NIcon, 
  NDescriptions, NDescriptionsItem, useMessage 
} from 'naive-ui'
import { CopyOutline } from '@vicons/ionicons5'
import type { ImageEntry } from '~/types/images'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ entry: ImageEntry | null }>()

const message = useMessage()
const imageRef = ref<HTMLImageElement | null>(null)
const resolutionText = ref('-')

const urlText = computed(() => {
  const url = props.entry?.url
  if (!url) return ''
  if (/^https?:\/\//.test(url)) return url
  if (import.meta.client) return new URL(url, window.location.origin).toString()
  return url
})

const sizeText = computed(() => {
  const size = props.entry?.size
  if (!size && size !== 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB'] as const
  let value = size
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
})

const timeText = computed(() => {
  const t = props.entry?.uploadedAt
  if (!t) return '-'
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return t
  return d.toLocaleString()
})

const onImageLoad = () => {
  const el = imageRef.value
  const w = el?.naturalWidth
  const h = el?.naturalHeight
  if (Number.isFinite(w) && Number.isFinite(h) && w && h) resolutionText.value = `${w} x ${h}`
  else resolutionText.value = '-'
}

watch(
  () => props.entry?.url,
  async () => {
    resolutionText.value = '-'
    await nextTick()
    onImageLoad()
  }
)

const copyUrl = async () => {
  const url = urlText.value
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    message.success('已复制 URL')
  } catch (error) {
    message.error('复制失败')
  }
}
</script>
