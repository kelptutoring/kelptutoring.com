export function bindStudentNavigation() {
  const menus = [...document.querySelectorAll('[data-dashboard-menu]')]

  for (const menu of menus) {
    menu.addEventListener('toggle', () => {
      if (!menu.open) return
      menus.forEach((candidate) => {
        if (candidate !== menu) candidate.open = false
      })
    })

    menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
      menu.open = false
    }))
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-dashboard-menu]')) return
    menus.forEach((menu) => { menu.open = false })
  })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    menus.forEach((menu) => { menu.open = false })
  })
}
