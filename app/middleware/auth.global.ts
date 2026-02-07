export default defineNuxtRouteMiddleware(async (to) => {
  if (to.meta.auth === false) return
  if (to.path === '/login') return

  const { state, refreshAuth } = useAuth()
  if (!state.value.checked) {
    if (import.meta.server) {
      const authCookie = useCookie<string | null>('picmi.auth', { default: () => null, sameSite: 'lax', path: '/' })
      state.value.checked = true
      state.value.loggedIn = Boolean(authCookie.value)
      if (!state.value.loggedIn) state.value.username = null
    } else {
      await refreshAuth()
    }
  }
  if (!state.value.loggedIn) {
    return navigateTo({ path: '/login', query: { url: to.fullPath } })
  }
})
