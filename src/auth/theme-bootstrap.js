(function bootstrapKelpTheme() {
  const storageKey = 'kelp:first-paint-theme:v1'
  const allowedThemes = ['ocean', 'kelp', 'coral', 'orchid', 'sunrise', 'slate']
  const root = document.documentElement
  const fallback = allowedThemes.includes(root.dataset.kelpTheme) ? root.dataset.kelpTheme : 'ocean'
  let cachedTheme = ''

  try {
    cachedTheme = localStorage.getItem(storageKey) || ''
  } catch (error) {
    cachedTheme = ''
  }

  const firstPaintTheme = allowedThemes.includes(cachedTheme) ? cachedTheme : fallback
  root.dataset.kelpTheme = firstPaintTheme
  root.dataset.kelpThemeSource = allowedThemes.includes(cachedTheme) ? 'first-paint-cache' : 'page-fallback'
})()
