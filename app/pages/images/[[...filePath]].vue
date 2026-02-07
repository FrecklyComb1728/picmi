<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-3 rounded-xl border border-zinc-200 shadow-sm sticky top-[70px] z-20">
      <div class="flex items-center gap-2 overflow-x-auto no-scrollbar">
         <n-breadcrumb>
           <n-breadcrumb-item @click="navigateTo('/images')">
             <n-icon :component="ImagesOutline" class="text-primary" />
           </n-breadcrumb-item>
           <n-breadcrumb-item v-for="(p, idx) in filePath" :key="idx" @click="navigateToPath(idx)">
             {{ p }}
           </n-breadcrumb-item>
         </n-breadcrumb>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <n-input-group>
           <n-input v-model:value="search" placeholder="搜索..." class="w-32 sm:w-48" size="small">
             <template #prefix><n-icon :component="SearchOutline" /></template>
           </n-input>
        </n-input-group>
        <n-popselect v-model:value="sort" :options="sortOptions" trigger="click">
           <n-button size="small" secondary>
             <template #icon><n-icon :component="FilterOutline" /></template>
             <span class="hidden sm:inline">排序</span>
           </n-button>
        </n-popselect>
        <n-select v-model:value="pageSize" :options="pageSizeOptions" size="small" class="w-28" />
        <n-button type="primary" size="small" @click="uploadOpen = true">
          <template #icon><n-icon :component="CloudUploadOutline" /></template>
          上传
        </n-button>
        <n-button size="small" @click="mkDirOpen = true">
          <template #icon><n-icon :component="FolderOpenOutline" /></template>
          新建文件夹
        </n-button>
        <n-button size="small" :type="publicEnabled ? 'success' : 'default'" @click="handleTogglePublic">
          <template #icon><n-icon :component="ShareSocialOutline" /></template>
          {{ publicEnabled ? '已公开' : '设为公开' }}
        </n-button>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2 px-1">
       <div class="flex items-center gap-2">
         <n-button size="tiny" secondary @click="selectable = !selectable">
           {{ selectable ? '取消选择' : '选择' }}
         </n-button>
         <template v-if="selectable">
            <n-button size="tiny" secondary @click="clearSelection">清空</n-button>
            <span class="text-xs text-zinc-500 ml-1">已选 {{ selectedPaths.size }}</span>
         </template>
       </div>
       <div class="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <n-button-group size="tiny">
          <n-button secondary :disabled="selectedPaths.size === 0" @click="copySelected">复制</n-button>
          <n-button secondary :disabled="selectedPaths.size === 0" @click="cutSelected">剪切</n-button>
          <n-button secondary :disabled="selectedPaths.size === 0" @click="openMove">移动到</n-button>
          <n-button secondary :disabled="!canPaste" @click="pasteIntoCurrent">粘贴</n-button>
        </n-button-group>

        <n-button-group size="tiny">
          <n-button secondary :disabled="selectedImageEntries.length === 0" @click="copySelectedLinks">复制链接</n-button>
          <n-button secondary :disabled="selectedImageEntries.length !== 1" @click="copySelectedImage">复制图片</n-button>
        </n-button-group>
         
         <n-button-group size="tiny">
            <n-button secondary :disabled="selectedPaths.size !== 1" @click="renameOpen = true">重命名</n-button>
            <n-button type="error" ghost :disabled="selectedPaths.size === 0" @click="handleDelete">删除</n-button>
         </n-button-group>
         
         <n-button size="tiny" secondary :type="publicEnabled ? 'success' : 'default'" @click="handleTogglePublic">
           {{ publicEnabled ? '已公开' : '公开列表' }}
         </n-button>
       </div>
    </div>

    <div v-if="pending" class="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
       <n-skeleton v-for="i in 10" :key="i" height="180px" class="rounded-xl" />
    </div>
    
    <div v-else-if="error" class="p-4 text-red-500 bg-red-50 rounded-xl border border-red-100">
      加载失败：{{ error.message }}
    </div>
    
    <div v-else class="space-y-6 pb-12">
      <div v-if="sortedItems.length">
        <div v-if="sortedFolders.length" class="mb-6 p-4 rounded-xl bg-zinc-50/50 border border-zinc-100">
          <div class="mb-3 text-xs font-semibold text-zinc-500 flex justify-between uppercase tracking-wider">
            <span>Folders</span>
            <span>{{ sortedFolders.length }}</span>
          </div>
          <ImageGrid
            :entries="sortedFolders"
            :selectable="selectable"
            :selected-set="selectedPaths"
            @open="openEntry"
            @toggle="toggleEntry"
            @action="handleGridAction"
          />
        </div>

        <div v-if="sortedImages.length">
          <div class="mb-2 text-xs font-semibold text-zinc-500 flex justify-between uppercase tracking-wider">
            <span>Images</span>
            <span>{{ sortedImages.length }}</span>
          </div>
          <ImageGrid
            :entries="pagedImages"
            :selectable="selectable"
            :selected-set="selectedPaths"
            @open="openEntry"
            @toggle="toggleEntry"
            @action="handleGridAction"
            @dblclick="handlePreview"
          />
          <div class="mt-6 flex justify-center">
            <n-pagination v-if="sortedImages.length > pageSize" v-model:page="page" :page-size="pageSize" :item-count="sortedImages.length" />
          </div>
        </div>
      </div>
      <n-empty v-else description="暂无文件" class="py-12" />
    </div>

    <ImageDetailModal v-model="detailOpen" :entry="activeEntry" />
    <ImageUploadModal v-model="open" :current-path="currentPath" :incoming-files="incomingFiles" @uploaded="refresh" />
    <GlobalPasteUpload :current-path="currentPath" @uploaded="refresh" @paste="handlePaste" />

    <n-modal
       v-model:show="renameOpen"
       preset="card"
       title="重命名"
       class="w-full max-w-md"
       :segmented="{ content: 'soft', footer: 'soft' }"
       size="medium"
       :bordered="false"
    >
       <div class="space-y-4 py-2">
         <n-input
           v-model:value="renameValue"
           placeholder="请输入新名称"
           @keydown.enter="renameSelected"
           autofocus
           size="large"
         />
       </div>
       <template #footer>
         <div class="flex justify-end gap-3">
           <n-button @click="renameOpen = false">取消</n-button>
           <n-button type="primary" :loading="renaming" @click="renameSelected">保存</n-button>
         </div>
       </template>
    </n-modal>

    <n-modal
      v-model:show="moveOpen"
      preset="card"
      title="移动到"
      class="w-full max-w-lg"
      :segmented="{ content: 'soft', footer: 'soft' }"
      size="medium"
      :bordered="false"
    >
      <div class="space-y-4">
        <div class="flex items-center justify-between text-sm text-zinc-500 bg-zinc-50 px-3 py-2 rounded-md border border-zinc-100">
          <span>已选 {{ selectedPaths.size }}</span>
          <span>目标目录：{{ moveBrowsePath }}</span>
        </div>

        <n-breadcrumb>
          <n-breadcrumb-item @click="navigateMoveToRoot">/</n-breadcrumb-item>
          <n-breadcrumb-item v-for="(p, idx) in movePathParts" :key="idx" @click="navigateMoveToIndex(idx)">
            {{ p }}
          </n-breadcrumb-item>
        </n-breadcrumb>

        <div class="grid gap-2">
          <n-button v-if="moveBrowsePath !== '/'" size="small" secondary @click="navigateMoveUp">返回上级</n-button>
          <n-button
            v-for="folder in moveFolders"
            :key="folder.path"
            size="small"
            secondary
            @click="enterMoveFolder(folder.path)"
          >
            {{ folder.name }}
          </n-button>
          <n-empty v-if="!moveLoading && moveFolders.length === 0" description="暂无子目录" />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <n-button @click="moveOpen = false">取消</n-button>
          <n-button type="primary" :loading="moving" :disabled="moveDisabled" @click="moveSelected">
            移动
          </n-button>
        </div>
      </template>
    </n-modal>

    <n-modal v-model:show="mkDirOpen" preset="card" title="新建文件夹" class="w-full max-w-sm">
      <div class="space-y-4">
        <n-input v-model:value="newFolderName" placeholder="请输入文件夹名称" @keydown.enter="handleCreateFolder" />
        <div class="flex justify-end gap-2">
          <n-button @click="mkDirOpen = false">取消</n-button>
          <n-button type="primary" :disabled="!newFolderName.trim()" @click="handleCreateFolder">创建</n-button>
        </div>
      </div>
    </n-modal>

    <n-modal v-model:show="previewVisible" class="bg-transparent shadow-none" :show-icon="false">
      <div class="relative h-screen w-screen flex items-center justify-center p-4" @click="previewVisible = false">
        <img :src="previewUrl" class="max-h-full max-w-full object-contain rounded-lg shadow-2xl" @click.stop />
        <n-button circle secondary class="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 border-none" @click="previewVisible = false">
          <template #icon><n-icon :component="CloseOutline" /></template>
        </n-button>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'
import { 
  NBreadcrumb, NBreadcrumbItem, NIcon, NInput, NInputGroup, NButton, NButtonGroup, 
  NPopselect, NSkeleton, NEmpty, NPagination, NModal, NSelect, useMessage, useDialog 
} from 'naive-ui'
import { 
  ImagesOutline, SearchOutline, FilterOutline, CloudUploadOutline, FolderOpenOutline, CloseOutline, ShareSocialOutline
} from '@vicons/ionicons5'
import type { ClipboardItem } from '~/composables/useImageClipboard'
import type { ImageEntry, ImagesListResponse } from '~/types/images'

definePageMeta({
  path: '/images/:filePath(.*)*'
})

const route = useRoute()
const message = useMessage()
const dialog = useDialog()
const { apiFetch } = useApi()
const { clipboard, set: setClipboard, clear: clearClipboard } = useImageClipboard()

const uploadOpen = ref(false)
const mkDirOpen = ref(false)
const newFolderName = ref('')
const previewVisible = ref(false)
const previewUrl = ref('')

const incomingFiles = ref<File[]>([])
const open = computed({
  get: () => uploadOpen.value,
  set: (v) => uploadOpen.value = v
})

const handlePreview = (entry: ImageEntry) => {
  if (entry.type !== 'image' || !entry.url) return
  previewUrl.value = entry.url
  previewVisible.value = true
}

const handleCreateFolder = async () => {
  if (!newFolderName.value) return
  try {
    await apiFetch('/images/mkdir', {
      method: 'POST',
      body: {
        path: currentPath.value,
        name: newFolderName.value
      }
    })
    message.success('创建成功')
    mkDirOpen.value = false
    newFolderName.value = ''
    await refresh()
  } catch {
    message.error('创建失败')
  }
}

const handlePaste = (files: File[]) => {
  incomingFiles.value = files
  uploadOpen.value = true
}

const filePath = computed(() => {
  const raw = route.params.filePath
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string' && raw.length) return [raw]
  return []
})

const currentPath = computed(() => `/${filePath.value.join('/')}`.replaceAll('//', '/'))
const config = useRuntimeConfig()
const listApiFromConfig = ref<string | null>(null)
try {
  const cfg = await apiFetch<{ listApi?: string }>('/config', { method: 'GET' })
  listApiFromConfig.value = cfg?.listApi ? String(cfg.listApi) : null
} catch {
  listApiFromConfig.value = null
}
const listUrl = computed(() => listApiFromConfig.value || config.public.listPath)

const unwrap = <T>(value: any) => {
  if (value && typeof value === 'object' && 'code' in value && 'data' in value) return value.data as T
  return value as T
}

const { data, pending, error, refresh } = await useFetch<ImagesListResponse>(listUrl, {
  method: 'GET',
  credentials: 'include',
  query: computed(() => ({ path: currentPath.value })),
  transform: (value) => unwrap<ImagesListResponse>(value)
})

const rawItems = computed<ImageEntry[]>(() => data.value?.items ?? [])
const publicEnabled = ref(false)

const loadPublicStatus = async () => {
  try {
    const res = await apiFetch<{ enabled?: boolean }>('/images/public-status', {
      method: 'GET',
      query: { path: currentPath.value }
    })
    publicEnabled.value = res?.enabled === true
  } catch {
    publicEnabled.value = false
  }
}

await loadPublicStatus()
watch(currentPath, () => {
  loadPublicStatus()
})

const search = ref('')
const sortOptions = [
  { label: '默认排序', value: 'default' },
  { label: '名称 A-Z', value: 'name-asc' },
  { label: '名称 Z-A', value: 'name-desc' },
  { label: '时间新->旧', value: 'time-desc' },
  { label: '时间旧->新', value: 'time-asc' }
]
const sort = ref<string>('default')
const pageSize = ref(40)
const pageSizeOptions = [
  { label: '每页 20', value: 20 },
  { label: '每页 40', value: 40 },
  { label: '每页 80', value: 80 },
  { label: '每页 120', value: 120 }
]
const page = ref(1)

const selectable = ref(false)
const selectedPaths = reactive(new Set<string>())

watch([search, sort, pageSize], () => { page.value = 1 })

const filteredList = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? rawItems.value.filter((it) => it.name.toLowerCase().includes(q)) : rawItems.value
})

const byNameAsc = (a: ImageEntry, b: ImageEntry) => a.name.localeCompare(b.name)
const byNameDesc = (a: ImageEntry, b: ImageEntry) => b.name.localeCompare(a.name)
const byTimeDesc = (a: ImageEntry, b: ImageEntry) => {
  const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0
  const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0
  return tb - ta
}
const byTimeAsc = (a: ImageEntry, b: ImageEntry) => {
  const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0
  const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0
  return ta - tb
}

const sortFn = computed(() => {
  if (sort.value === 'name-asc') return byNameAsc
  if (sort.value === 'name-desc') return byNameDesc
  if (sort.value === 'time-desc') return byTimeDesc
  if (sort.value === 'time-asc') return byTimeAsc
  return null
})

const folders = computed(() => filteredList.value.filter((it) => it.type === 'folder'))
const images = computed(() => filteredList.value.filter((it) => it.type === 'image'))

const sortedFolders = computed(() => (sortFn.value ? [...folders.value].sort(sortFn.value) : folders.value))
const sortedImages = computed(() => (sortFn.value ? [...images.value].sort(sortFn.value) : images.value))

const sortedItems = computed(() => [...sortedFolders.value, ...sortedImages.value])

const pagedImages = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return sortedImages.value.slice(start, start + pageSize.value)
})

watch([sortedImages, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(sortedImages.value.length / pageSize.value))
  if (page.value > maxPage) page.value = maxPage
})

const detailOpen = ref(false)
const activeEntry = ref<ImageEntry | null>(null)

const openEntry = async (entry: ImageEntry) => {
  if (entry.type === 'folder') {
    const encoded = entry.path
      .replace(/^\/+/, '')
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/')
    await navigateTo(`/images/${encoded}`)
    return
  }
  activeEntry.value = entry
  detailOpen.value = true
}

const toggleEntry = (entry: ImageEntry, checked: boolean) => {
  if (!selectable.value) return
  if (checked) selectedPaths.add(entry.path)
  else selectedPaths.delete(entry.path)
}

const handleGridAction = (action: string, entry: ImageEntry) => {
  selectedPaths.clear()
  selectedPaths.add(entry.path)
  
  switch (action) {
    case 'copy':
      copySelected()
      break
    case 'move':
      openMove()
      break
    case 'rename':
      renameOpen.value = true
      break
    case 'delete':
      handleDelete()
      break
  }
}

const clearSelection = () => {
  selectedPaths.clear()
  selectable.value = false
}

const navigateToPath = (idx: number) => {
  const parts = filePath.value.slice(0, idx + 1)
  navigateTo(`/images/${parts.join('/')}`)
}

const selectedItems = computed<ClipboardItem[]>(() => {
  const map = new Map(rawItems.value.map((it) => [it.path, it]))
  return [...selectedPaths].map((path) => {
    const it = map.get(path)
    return { path, type: it?.type ?? 'image' }
  })
})

const selectedImageEntries = computed(() => {
  const map = new Map(rawItems.value.map((it) => [it.path, it]))
  return [...selectedPaths]
    .map((p) => map.get(p))
    .filter((it): it is ImageEntry => it != null && it.type === 'image')
})

const copySelected = () => {
  setClipboard('copy', selectedItems.value)
  message.success('已复制到剪贴板')
}

const cutSelected = () => {
  setClipboard('cut', selectedItems.value)
  message.warning('已剪切到剪贴板')
}

const copySelectedLinks = async () => {
  const urls = selectedImageEntries.value.map((it) => it.url).filter((u): u is string => Boolean(u))
  if (urls.length === 0) return
  try {
    await navigator.clipboard.writeText(urls.join('\n'))
    message.success('已复制链接')
  } catch {
    message.error('复制失败')
  }
}

const copySelectedImage = async () => {
  const entry = selectedImageEntries.value[0]
  if (!entry?.url) return
  const ClipboardItemCtor = (globalThis as any).ClipboardItem
  if (!ClipboardItemCtor || !navigator.clipboard?.write) {
    message.error('当前浏览器不支持复制图片')
    return
  }
  try {
    const resp = await fetch(entry.url, { credentials: 'include' })
    const blob = await resp.blob()
    const item = new ClipboardItemCtor({ [blob.type || 'image/png']: blob })
    await navigator.clipboard.write([item])
    message.success('已复制图片')
  } catch {
    message.error('复制失败')
  }
}

const canPaste = computed(() => Boolean(clipboard.value.mode) && clipboard.value.items.length > 0)

const pasteIntoCurrent = async () => {
  if (!canPaste.value) return
  try {
    const endpoint = clipboard.value.mode === 'cut' ? '/images/move' : '/images/copy'
    await apiFetch(endpoint, {
      method: 'POST',
      body: {
        toPath: currentPath.value,
        items: clipboard.value.items
      }
    })

    if (clipboard.value.mode === 'cut') clearClipboard()
    message.success('已粘贴')
    await refresh()
  } catch (error) {
    message.error('粘贴失败')
  }
}

const moveOpen = ref(false)
const moveBrowsePath = ref('/')
const moveFolders = ref<ImageEntry[]>([])
const moveLoading = ref(false)
const moving = ref(false)

const movePathParts = computed(() => moveBrowsePath.value.replace(/^\/+/, '').split('/').filter(Boolean))
const moveDisabled = computed(() => {
  if (selectedPaths.size === 0) return true
  if (moveBrowsePath.value === currentPath.value) return true
  const folderPaths = [...selectedPaths].filter((p) => rawItems.value.some((it) => it.path === p && it.type === 'folder'))
  return folderPaths.some((p) => {
    const normalized = p.replace(/\/+$/, '')
    return moveBrowsePath.value === normalized || moveBrowsePath.value.startsWith(`${normalized}/`)
  })
})

const fetchList = async (path: string) => {
  const res = await $fetch<any>(listUrl.value, {
    method: 'GET',
    credentials: 'include',
    query: { path }
  })
  return unwrap<ImagesListResponse>(res)
}

const loadMoveFolders = async () => {
  moveLoading.value = true
  try {
    const data = await fetchList(moveBrowsePath.value)
    const items = Array.isArray(data?.items) ? data.items : []
    moveFolders.value = items.filter((it: any) => it && it.type === 'folder')
  } catch {
    moveFolders.value = []
  } finally {
    moveLoading.value = false
  }
}

const openMove = async () => {
  if (selectedPaths.size === 0) return
  moveBrowsePath.value = currentPath.value
  moveOpen.value = true
}

watch(moveOpen, async (v) => {
  if (!v) return
  await loadMoveFolders()
})

watch(moveBrowsePath, async () => {
  if (!moveOpen.value) return
  await loadMoveFolders()
})

const navigateMoveToRoot = () => {
  moveBrowsePath.value = '/'
}

const navigateMoveUp = () => {
  const parts = movePathParts.value
  if (parts.length <= 1) {
    moveBrowsePath.value = '/'
    return
  }
  moveBrowsePath.value = `/${parts.slice(0, -1).join('/')}`
}

const navigateMoveToIndex = (idx: number) => {
  const parts = movePathParts.value.slice(0, idx + 1)
  moveBrowsePath.value = `/${parts.join('/')}`
}

const enterMoveFolder = (path: string) => {
  moveBrowsePath.value = path
}

const moveSelected = async () => {
  if (moveDisabled.value) return
  moving.value = true
  try {
    await apiFetch('/images/move', {
      method: 'POST',
      body: {
        toPath: moveBrowsePath.value,
        items: selectedItems.value
      }
    })
    message.success('已移动')
    moveOpen.value = false
    clearSelection()
    await refresh()
  } catch {
    message.error('移动失败')
  } finally {
    moving.value = false
  }
}

const handleDelete = () => {
  dialog.warning({
    title: '确认删除',
    content: `将删除 ${selectedPaths.size} 个项目，且不可恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await apiFetch('/images/delete', {
          method: 'POST',
          body: { paths: [...selectedPaths] }
        })
        message.success('已删除')
        clearSelection()
        await refresh()
      } catch (error) {
        message.error('删除失败')
      }
    }
  })
}

const handleTogglePublic = () => {
  dialog.info({
    title: '公开文件列表',
    content: `将切换当前目录（${currentPath.value}）的公开状态。`,
    positiveText: '切换',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const res = await apiFetch<{ enabled?: boolean }>('/images/public', {
          method: 'POST',
          body: { path: currentPath.value }
        })
        publicEnabled.value = res?.enabled === true
        message.success('已切换公开状态')
      } catch (error) {
        message.error('操作失败')
      }
    }
  })
}

const renameOpen = ref(false)
const renameValue = ref('')
const renaming = ref(false)

watch(renameOpen, (v) => {
  if (!v) return
  const first = [...selectedPaths][0]
  const entry = rawItems.value.find((it) => it.path === first)
  renameValue.value = entry?.name ?? ''
})

const renameSelected = async () => {
  const from = [...selectedPaths][0]
  if (!from || !renameValue.value.trim()) return
  renaming.value = true
  try {
    await apiFetch('/images/rename', {
      method: 'POST',
      body: {
        path: from,
        newName: renameValue.value.trim()
      }
    })
    message.success('已重命名')
    renameOpen.value = false
    selectedPaths.clear()
    await refresh()
  } catch (error) {
    message.error('重命名失败')
  } finally {
    renaming.value = false
  }
}
</script>
