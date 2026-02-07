# 前端说明

## 路由与页面

- /login：登录页
- /dashboard：仪表盘
- /images/:filePath(.*)*：图片管理与目录浏览
- /config：系统设置与存储节点管理
- /users：用户管理
- /：重定向到 /dashboard

## 布局

- layouts/auth.vue：登录页使用的简化布局
- layouts/default.vue：主应用布局，包含侧边栏与顶部导航

## 关键组件

- AppSidebar.vue：侧边栏导航与用户菜单
- AppHeader.vue：面包屑与页面标题
- CommandPalette.vue：快捷指令面板
- ImageGrid.vue：图片与文件夹网格
- ImageDetailModal.vue：图片详情弹窗
- ImageUploadModal.vue：上传弹窗
- GlobalPasteUpload.vue：全局粘贴上传处理

## Composables

- useApi：统一封装 API 调用，自动处理 code/message/data
- useAuth：登录、登出、初始化与状态刷新
- useImageClipboard：复制/剪切的图片状态
- useCommandPalette：命令面板开关与状态

## 运行时配置

位于 nuxt.config.ts：

- apiBase：默认 /api
- uploadPath：默认 /api/images/upload
- listPath：默认 /api/images/list

## 图片管理逻辑

- 路径通过参数 filePath 映射为当前目录
- 文件夹与图片分组显示
- 选择模式支持批量移动、复制、删除
- 上传支持拖拽、粘贴与选择文件
- 上传前通过 /api/images/exists 校验重名

## 资源规范

- SVG 资源位于 app/assets/svg
- 公共静态资源位于 public/
