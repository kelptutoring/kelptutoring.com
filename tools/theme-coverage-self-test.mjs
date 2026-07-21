import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const themeBootstrapPath = '/src/auth/theme-bootstrap.js'
const explicitPages = [
  'src/app/dashboard/student-dashboard.html',
  'src/app/profile/student-profile.html',
  'src/app/profile/student-preferences.html'
]
const schedulePages = [
  ...await htmlFiles(resolve(projectRoot, 'src/app/schedules')),
  ...await htmlFiles(resolve(projectRoot, 'src/app/schedule-generator'))
]
const pages = [...explicitPages.map((path) => resolve(projectRoot, path)), ...schedulePages]
let coveredSchedulePages = 0

for (const path of pages) {
  const html = await readFile(path, 'utf8')
  if (!html.includes('styles/style.css')) continue
  const displayPath = relative(projectRoot, path).replaceAll('\\', '/')
  assert.match(html, /<html\b[^>]*\bdata-kelp-theme="ocean"[^>]*>/i, `${displayPath} needs an Ocean fallback.`)
  assert.match(html, new RegExp(`<script\\s+src="${escapeRegExp(themeBootstrapPath)}"><\\/script>`), `${displayPath} needs the first-paint bootstrap.`)
  assert.ok(
    html.indexOf(themeBootstrapPath) < html.indexOf('styles/style.css'),
    `${displayPath} must run the theme bootstrap before loading shared styles.`
  )
  if (displayPath.startsWith('src/app/schedules/') || displayPath.startsWith('src/app/schedule-generator/')) {
    coveredSchedulePages += 1
  }
}

assert.ok(coveredSchedulePages >= 300, `Expected broad Tracks/Schedules coverage; found ${coveredSchedulePages} pages.`)
console.log(`First-paint theme coverage passed for ${coveredSchedulePages} Tracks and Schedule pages plus Student shells.`)

async function htmlFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await htmlFiles(path))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) files.push(path)
  }
  return files
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
