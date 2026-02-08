export default defineNuxtRouteMiddleware(async (to) => {
  if (to.meta.auth === false) return
  if (to.path === '/login') return

  const { state, refreshAuth } = useAuth()
  if (!state.value.checked) {
    await refreshAuth()
  }
  if (!state.value.loggedIn) {
    return navigateTo({ path: '/login', query: { url: to.fullPath } })
  }
})
