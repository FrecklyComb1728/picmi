<template>
  <n-layout position="absolute" has-sider class="h-screen">
    <AppSidebar />
    <n-layout class="bg-zinc-50">
      <AppHeader />
      <n-layout-content 
        content-style="padding: 24px;" 
        :native-scrollbar="false"
      >
        <div class="max-w-7xl mx-auto">
          <slot />
        </div>
      </n-layout-content>
    </n-layout>
    <CommandPalette />
  </n-layout>
</template>

<script setup lang="ts">
import { NLayout, NLayoutContent } from 'naive-ui'
import AppSidebar from '~/components/AppSidebar.vue'
import AppHeader from '~/components/AppHeader.vue'
import CommandPalette from '~/components/CommandPalette.vue'
</script>
