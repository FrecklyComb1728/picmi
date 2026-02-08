import fs from 'node:fs'

const portFromConfig = (() => {
  try {
    const raw = fs.readFileSync(new URL('./config.json', import.meta.url), 'utf-8')
    const data = JSON.parse(raw)
    const port = Number(data?.port)
    if (!Number.isInteger(port)) return null
    if (port < 1 || port > 65535) return null
    return port
  } catch {
    return null
  }
})()

if (portFromConfig && !process.env.NUXT_PORT && !process.env.PORT) {
  process.env.NUXT_PORT = String(portFromConfig)
  process.env.PORT = String(portFromConfig)
}

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: true,
  devtools: { enabled: process.env.NODE_ENV !== 'production' },
  modules: ['@vueuse/motion/nuxt'],
  css: ['~/assets/css/tailwind.css'],
  build: {
    transpile: [
      'naive-ui',
      'vueuc',
      '@css-render/vue3-ssr',
      '@juggle/resize-observer'
    ]
  },
  vite: {
    optimizeDeps: {
      include: [
        'naive-ui',
        'vueuc',
        'date-fns-tz/formatInTimeZone'
      ]
    }
  },
  postcss: {
    plugins: {
      '@tailwindcss/postcss': {},
      autoprefixer: {}
    },
  },
  runtimeConfig: {
    public: {
      apiBase: '/api',
      uploadPath: '/api/images/upload',
      listPath: '/api/images/list'
    }
  },
  nitro: {
    routeRules: {
      '/login': { headers: { 'Cache-Control': 'no-store' } },
      '/dashboard': { headers: { 'Cache-Control': 'no-store' } },
      '/images/**': { headers: { 'Cache-Control': 'no-store' } },
      '/config': { headers: { 'Cache-Control': 'no-store' } },
      '/users': { headers: { 'Cache-Control': 'no-store' } },

      '/api/**': { headers: { 'Cache-Control': 'no-store' } },
      '/': { headers: { 'Cache-Control': 'no-store' } },
      '/uploads/**': {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          'Cache-Control': 'no-store'
        }
      },
      '/_nuxt/**': { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
      '/assets/**': { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
      '/favicon.ico': { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
    }
  },
  typescript: {
    strict: true,
    typeCheck: false
  }
})
