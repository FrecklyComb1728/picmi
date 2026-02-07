<template>
  <n-modal
    v-model:show="show"
    preset="card"
    class="w-[600px] fixed top-24 left-1/2 -translate-x-1/2"
    :bordered="false"
    size="small"
    :closable="false"
    :mask-closable="true"
    content-style="padding: 0;"
  >
    <div class="flex flex-col h-[400px]">
      <div class="flex items-center px-4 py-3 border-b border-zinc-100">
        <n-icon :component="SearchOutline" class="text-zinc-400 mr-3" size="20" />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          class="flex-1 bg-transparent border-none outline-none text-zinc-900 placeholder-zinc-400 text-base"
          placeholder="搜索命令、文件或设置..."
          @keydown="onKeydown"
        />
        <div class="flex gap-1">
          <kbd class="hidden sm:inline-block px-1.5 py-0.5 text-xs font-medium text-zinc-500 bg-zinc-100 rounded border border-zinc-200">ESC</kbd>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        <div v-if="filteredGroups.length === 0" class="flex flex-col items-center justify-center h-full text-zinc-400">
          <n-icon :component="SearchOutline" size="48" class="mb-2 opacity-20" />
          <span class="text-sm">未找到相关结果</span>
        </div>

        <template v-for="group in filteredGroups" :key="group.key">
          <div class="px-2 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            {{ group.label }}
          </div>
          <div
            v-for="(item, idx) in group.items"
            :key="item.key"
            class="flex items-center px-3 py-2 rounded-md cursor-pointer transition-colors"
            :class="{ 'bg-primary/10 text-primary': activeKey === item.key, 'hover:bg-zinc-100 text-zinc-700': activeKey !== item.key }"
            @click="execute(item)"
            @mouseenter="activeKey = item.key"
          >
            <n-icon :component="item.icon" class="mr-3" :class="{ 'text-primary': activeKey === item.key, 'text-zinc-400': activeKey !== item.key }" />
            <span class="flex-1">{{ item.label }}</span>
            <span v-if="item.shortcut" class="text-xs text-zinc-400">{{ item.shortcut }}</span>
          </div>
        </template>
      </div>
      
      <div class="px-4 py-2 border-t border-zinc-100 bg-zinc-50 text-xs text-zinc-400 flex justify-between rounded-b-xl">
        <div class="flex gap-3">
          <span><kbd class="font-sans">↑↓</kbd> 导航</span>
          <span><kbd class="font-sans">↵</kbd> 选择</span>
        </div>
        <span>PicMi Command Palette</span>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { NModal, NIcon } from 'naive-ui'
import { 
  SearchOutline, 
  HomeOutline, 
  ImagesOutline, 
  SettingsOutline, 
  PeopleOutline, 
  LogOutOutline,
  MoonOutline,
  CloudUploadOutline
} from '@vicons/ionicons5'

const router = useRouter()
const { logout } = useAuth()

const { show, close } = useCommandPalette()

const query = ref('')
const activeKey = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

type CommandItem = {
  key: string
  label: string
  icon: any
  shortcut?: string
  action: () => void
}

type CommandGroup = {
  key: string
  label: string
  items: CommandItem[]
}

const commands = computed<CommandGroup[]>(() => [
  {
    key: 'navigation',
    label: '导航',
    items: [
      { key: 'nav-dashboard', label: '转到仪表盘', icon: HomeOutline, action: () => router.push('/dashboard') },
      { key: 'nav-images', label: '转到图片管理', icon: ImagesOutline, action: () => router.push('/images') },
      { key: 'nav-config', label: '转到系统设置', icon: SettingsOutline, action: () => router.push('/config') },
      { key: 'nav-users', label: '转到用户管理', icon: PeopleOutline, action: () => router.push('/users') }
    ]
  },
  {
    key: 'actions',
    label: '操作',
    items: [
      { key: 'act-upload', label: '上传图片', icon: CloudUploadOutline, action: () => router.push('/images?upload=1') },
      { key: 'act-logout', label: '退出登录', icon: LogOutOutline, action: async () => { await logout(); router.push('/login') } }
    ]
  }
])

const filteredGroups = computed(() => {
  const q = query.value.toLowerCase().trim()
  if (!q) return commands.value

  return commands.value.map(group => ({
    ...group,
    items: group.items.filter(item => item.label.toLowerCase().includes(q))
  })).filter(group => group.items.length > 0)
})

const flatItems = computed(() => filteredGroups.value.flatMap(g => g.items))

watch(show, (v) => {
  if (v) {
    query.value = ''
    activeKey.value = flatItems.value[0]?.key || ''
    nextTick(() => inputRef.value?.focus())
  }
})

watch(query, () => {
  activeKey.value = flatItems.value[0]?.key || ''
})

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const idx = flatItems.value.findIndex(i => i.key === activeKey.value)
    const next = flatItems.value[idx + 1] || flatItems.value[0]
    if (next) activeKey.value = next.key
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const idx = flatItems.value.findIndex(i => i.key === activeKey.value)
    const prev = flatItems.value[idx - 1] || flatItems.value[flatItems.value.length - 1]
    if (prev) activeKey.value = prev.key
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = flatItems.value.find(i => i.key === activeKey.value)
    if (item) execute(item)
  }
}

const execute = (item: CommandItem) => {
  item.action()
  close()
}

// Global Keyboard Shortcut
const onGlobalKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    show.value = !show.value
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})

</script>
