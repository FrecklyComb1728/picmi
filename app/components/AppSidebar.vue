<template>
  <n-layout-sider
    collapse-mode="width"
    :collapsed-width="64"
    :width="240"
    :collapsed="collapsed"
    bordered
    show-trigger
    @collapse="collapsed = true"
    @expand="collapsed = false"
    class="h-screen bg-white"
  >
    <div class="flex flex-col h-full">
      <div class="h-16 flex items-center justify-center border-b border-zinc-100">
        <div class="flex items-center gap-2" :class="{ 'justify-center w-full': collapsed, 'px-6 w-full': !collapsed }">
          <img :src="logoUrl" alt="PicMi" class="w-8 h-8" />
          <span v-if="!collapsed" class="text-lg font-bold text-zinc-800 tracking-tight">PicMi</span>
        </div>
      </div>

      <div v-if="!collapsed" class="px-4 py-4">
        <n-input placeholder="搜索... (Ctrl+K)" size="small" round readonly @click="openCommandPalette">
          <template #prefix>
            <n-icon :component="SearchOutline" />
          </template>
        </n-input>
      </div>
      <div v-else class="py-4 flex justify-center">
         <n-button circle size="small" secondary @click="openCommandPalette">
            <template #icon>
              <n-icon :component="SearchOutline" />
            </template>
         </n-button>
      </div>

      <div class="flex-1 overflow-y-auto py-2">
        <n-menu
          :collapsed="collapsed"
          :collapsed-width="64"
          :collapsed-icon-size="22"
          :options="menuOptions"
          :value="activeKey"
          @update:value="handleUpdateValue"
        />
      </div>

      <div class="border-t border-zinc-100 p-4">
        <div v-if="!collapsed" class="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 transition-colors group">
          <n-avatar round size="small" class="bg-primary text-white shrink-0">
            {{ (username || 'A').charAt(0).toUpperCase() }}
          </n-avatar>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-zinc-900 truncate">{{ username || 'Admin' }}</p>
            <p class="text-xs text-zinc-500 truncate">管理员</p>
          </div>
          <n-button text class="text-zinc-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100" @click="handleLogout" title="退出登录">
            <template #icon>
              <n-icon :component="LogOutOutline" size="18" />
            </template>
          </n-button>
        </div>
        <div v-else class="flex justify-center">
           <n-tooltip trigger="hover" placement="right">
             <template #trigger>
               <n-button text class="text-zinc-500 hover:text-red-600" @click="handleLogout">
                 <template #icon><n-icon :component="LogOutOutline" size="24" /></template>
               </n-button>
             </template>
             退出登录
           </n-tooltip>
        </div>
      </div>
    </div>
  </n-layout-sider>
</template>

<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NLayoutSider, NMenu, NAvatar, NIcon, NInput, NButton, NTooltip } from 'naive-ui'
import { 
  HomeOutline, 
  ImagesOutline, 
  SettingsOutline, 
  PersonOutline, 
  SearchOutline, 
  LogOutOutline
} from '@vicons/ionicons5'
import logoUrl from '~/assets/svg/logo.svg?url'

const { open: openCommandPalette } = useCommandPalette()

const route = useRoute()
const router = useRouter()
const { logout, state: authState } = useAuth()

const collapsed = ref(false)
const username = computed(() => authState.value.username || 'Admin')

const activeKey = computed(() => {
  const path = route.path
  if (path.startsWith('/dashboard')) return 'dashboard'
  if (path.startsWith('/images')) return 'images'
  if (path.startsWith('/config')) return 'config'
  if (path.startsWith('/users')) return 'users'
  return null
})

const renderIcon = (icon: any) => {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const menuOptions = [
  {
    label: '仪表盘',
    key: 'dashboard',
    icon: renderIcon(HomeOutline)
  },
  {
    label: '图片管理',
    key: 'images',
    icon: renderIcon(ImagesOutline)
  },
  {
    label: '系统设置',
    key: 'config',
    icon: renderIcon(SettingsOutline)
  },
  {
    label: '个人资料',
    key: 'users',
    icon: renderIcon(PersonOutline)
  }
]

const handleUpdateValue = (key: string) => {
  router.push(`/${key}`)
}

const handleLogout = async () => {
  await logout()
  router.push('/login')
}
</script>
