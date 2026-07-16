import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const schedulesRoot = path.join(projectRoot, 'src', 'app', 'schedules');
const stylesheetPath = path.join(projectRoot, 'src', 'styles', 'style.css');
const dashboardPath = path.join(projectRoot, 'src', 'app', 'dashboard', 'student-dashboard.html');
const logoPath = path.join(projectRoot, 'public', 'assets', 'logos', 'Kelp-logo-gpt.png');

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function relativeHref(fromFile, targetFile) {
  const href = path.relative(path.dirname(fromFile), targetFile);
  return toPosix(href) || './';
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderInline(value = '') {
  let html = escapeHtml(value);
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return html;
}

function isDashboardHref(href = '') {
  return /(?:student|tutor)-dashboard\.html$/i.test(String(href));
}

function dashboardLinkAttribute(href = '') {
  return isDashboardHref(href) ? ' data-dashboard-link' : '';
}

function renderDashboardRoutingScript() {
  return [
    '    (() => {',
    '      const links = document.querySelectorAll("[data-dashboard-link]");',
    '      if (!links.length) return;',
    '',
    '      const readStorage = (key) => {',
    '        try {',
    '          return localStorage.getItem(key) || sessionStorage.getItem(key) || "";',
    '        } catch (error) {',
    '          return "";',
    '        }',
    '      };',
    '',
    '      const pickDashboardFile = (value) => {',
    '        const text = String(value || "").toLowerCase();',
    '        if (text.includes("tutor-dashboard.html")) return "tutor-dashboard.html";',
    '        if (text.includes("student-dashboard.html")) return "student-dashboard.html";',
    '        return "";',
    '      };',
    '',
    '      const pickDashboardRole = (value) => {',
    '        const role = String(value || "").trim().toLowerCase();',
    '        if (["teacher", "tutor", "mentor", "admin"].includes(role)) return "tutor-dashboard.html";',
    '        if (role === "student") return "student-dashboard.html";',
    '        return "";',
    '      };',
    '',
    '      const dashboard = [document.referrer].map(pickDashboardFile).find(Boolean)',
    '        || [readStorage("kelpUserRole"), readStorage("userRole"), readStorage("role")].map(pickDashboardRole).find(Boolean)',
    '        || [readStorage("kelpDashboardTarget")].map(pickDashboardFile).find(Boolean);',
    '      if (!dashboard) return;',
    '',
    '      try {',
    '        localStorage.setItem("kelpDashboardTarget", dashboard);',
    '      } catch (error) {}',
    '',
    '      links.forEach((link) => {',
    '        const href = link.getAttribute("href") || "";',
    '        link.setAttribute("href", href.replace(/(?:student|tutor)-dashboard\\.html$/i, dashboard));',
    '      });',
    '    })();'
  ].join('\n');
}

function renderImage(line) {
  const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)(?::\s*(.*))?$/);
  if (!match) return '';

  const altParts = match[1].split('|').map((part) => part.trim()).filter(Boolean);
  const label = altParts.length > 1 ? altParts[0] : 'Visual';
  const title = altParts.length > 1 ? altParts.slice(1).join(' | ') : (altParts[0] || 'Visual reference');
  const captionParts = (match[3] || '').split(/\s*\|\|\s*read aloud:\s*/i);
  const captionText = captionParts[0]?.trim() || '';
  const readAloudText = (captionParts[1]?.trim() || [label, title, captionText].filter(Boolean).join('. '));
  const caption = captionText
    ? '\n          <figcaption>' + renderInline(captionText) + '</figcaption>'
    : '';
  const readButton = readAloudText
    ? '\n          <button class="figure-read-button" type="button" data-read-aloud="' + escapeHtml(readAloudText) + '">Read out loud</button>'
    : '';

  return '        <figure class="week-figure">\n          <div class="week-figure-header">\n            <span class="week-figure-label">' + escapeHtml(label) + '</span>\n            <h3 class="week-figure-title">' + escapeHtml(title) + '</h3>\n          </div>\n          <img src="' + escapeHtml(match[2]) + '" alt="' + escapeHtml(title) + '" />' + caption + readButton + '\n        </figure>';
}

function parseFrontMatter(markdown, sourceFile) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Missing front matter in ' + sourceFile);
  }

  const meta = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    meta[key] = value;
  }

  return { meta, body: match[2] };
}

function parseCards(body, sourceFile) {
  const cards = [];
  const lines = body.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line === '---') continue;

    const ordered = line.match(/^(\d+)\.\s+\[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?$/);
    const unordered = line.match(/^-\s+\[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?$/);

    if (ordered) {
      cards.push({ number: ordered[1], title: ordered[2], href: ordered[3], description: ordered[4] || '' });
      continue;
    }

    if (unordered) {
      cards.push({ title: unordered[1], href: unordered[2], description: unordered[3] || '' });
      continue;
    }

    throw new Error('Could not parse card line in ' + sourceFile + ': ' + line);
  }

  return cards;
}

function toMarkdownPath(fromFile, href) {
  if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) {
    return null;
  }

  const hrefPath = href.split('#')[0].split('?')[0].replace(/\.html$/i, '.md');
  const resolvedPath = path.resolve(path.dirname(fromFile), hrefPath);
  return resolvedPath.startsWith(schedulesRoot) ? resolvedPath : null;
}

async function flattenModuleCards(markdownFile, cards, outputFile) {
  const flattenedCards = [];

  for (const moduleCard of cards) {
    const moduleFile = toMarkdownPath(markdownFile, moduleCard.href);
    if (!moduleFile) {
      continue;
    }

    const moduleMarkdown = await fs.readFile(moduleFile, 'utf8');
    const { body } = parseFrontMatter(moduleMarkdown, moduleFile);
    const sessionCards = parseCards(body, moduleFile);

    sessionCards.forEach((sessionCard) => {
      const targetFile = path.resolve(path.dirname(moduleFile), sessionCard.href);
      flattenedCards.push({
        ...sessionCard,
        href: relativeHref(outputFile, targetFile)
      });
    });
  }

  return flattenedCards;
}

function renderNav(meta, outputFile) {
  const links = [];
  if (meta.back) {
    links.push('<a href="' + escapeHtml(meta.back) + '"' + dashboardLinkAttribute(meta.back) + '>' + escapeHtml(meta.backLabel || 'Back') + '</a>');
  }

  if (meta.home !== 'false') {
    const homeHref = meta.home || relativeHref(outputFile, dashboardPath);
    links.push('<a href="' + escapeHtml(homeHref) + '"' + dashboardLinkAttribute(homeHref) + '>' + escapeHtml(meta.homeLabel || 'Home') + '</a>');
  }

  return links.join('\n        ');
}

function renderCards(cards) {
  return cards.map((card) => {
    const number = card.number
      ? '\n          <span class="link-number">' + escapeHtml(card.number) + '</span>'
      : '';
    const description = card.description
      ? '\n          <span class="link-description">' + escapeHtml(card.description) + '</span>'
      : '';

    return '        <a href="' + escapeHtml(card.href) + '" class="link-card">' + number + '\n          <span class="link-title">' + escapeHtml(card.title) + '</span>' + description + '\n        </a>';
  }).join('\n');
}

function renderMarkdownBody(body) {
  const lines = body.split(/\r?\n/);
  const html = [];
  let sectionOpen = false;
  let listOpen = false;

  function closeList() {
    if (listOpen) {
      html.push('        </ul>');
      listOpen = false;
    }
  }

  function openSection(title) {
    closeList();
    if (sectionOpen) html.push('      </section>');
    html.push('      <section class="week-section">');
    html.push('        <h2>' + renderInline(title) + '</h2>');
    sectionOpen = true;
  }

  function ensureSection() {
    if (!sectionOpen) {
      html.push('      <section class="week-section">');
      sectionOpen = true;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeList();
      continue;
    }

    if (line.startsWith('## ')) {
      openSection(line.slice(3).trim());
      continue;
    }

    if (line.startsWith('### ')) {
      ensureSection();
      closeList();
      html.push('        <h3>' + renderInline(line.slice(4).trim()) + '</h3>');
      continue;
    }

    if (line.startsWith('- ')) {
      ensureSection();
      if (!listOpen) {
        html.push('        <ul class="week-list">');
        listOpen = true;
      }
      html.push('          <li>' + renderInline(line.slice(2).trim()) + '</li>');
      continue;
    }

    if (line.startsWith('![')) {
      ensureSection();
      closeList();
      const imageHtml = renderImage(line);
      html.push(imageHtml || '<p>' + renderInline(line) + '</p>');
      continue;
    }

    ensureSection();
    closeList();
    html.push('        <p>' + renderInline(line) + '</p>');
  }

  closeList();
  if (sectionOpen) html.push('      </section>');
  return html.join('\n');
}

function renderLayout({ meta, outputFile, bodyHtml }) {
  const title = meta.title || meta.heading || 'Kelp Tracks';
  const heading = meta.heading || title;
  const kicker = meta.kicker || 'Learning tracks';
  const intro = meta.intro || 'Select an option to continue.';
  const cssHref = relativeHref(outputFile, stylesheetPath);
  const logoHref = relativeHref(outputFile, logoPath);
  const logoLink = meta.logoLink || meta.home || relativeHref(outputFile, dashboardPath);

  return [
    '<!DOCTYPE html>',
    '<html lang="pt-BR">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>' + escapeHtml(title) + '</title>',
    '  <link rel="stylesheet" href="' + escapeHtml(cssHref) + '" />',
    '</head>',
    '',
    '<body class="tracks-body gradient-background">',
    '  <header class="tracks-header">',
    '    <div class="container tracks-header-content">',
    '      <a href="' + escapeHtml(logoLink) + '"' + dashboardLinkAttribute(logoLink) + ' class="tracks-logo-link" aria-label="Back to dashboard">',
    '        <img src="' + escapeHtml(logoHref) + '" alt="Kelp logo" class="tracks-logo" />',
    '      </a>',
    '',
    '      <nav class="tracks-nav" aria-label="Track navigation">',
    '        ' + renderNav(meta, outputFile),
    '      </nav>',
    '    </div>',
    '  </header>',
    '',
    '  <main class="container tracks-main" aria-labelledby="page-title">',
    '    <section class="tracks-panel">',
    '      <div class="tracks-intro">',
    '        <p class="tracks-kicker">' + escapeHtml(kicker) + '</p>',
    '        <h1 id="page-title">' + escapeHtml(heading) + '</h1>',
    '        <p>' + escapeHtml(intro) + '</p>',
    '      </div>',
    '',
    bodyHtml,
    '    </section>',
    '  </main>',
    '  <script>',
    renderDashboardRoutingScript(),
    '    document.querySelectorAll("[data-read-aloud]").forEach((button) => {',
    '      button.addEventListener("click", () => {',
    '        const text = button.getAttribute("data-read-aloud") || "";',
    '        if (!("speechSynthesis" in window) || !text) return;',
    '        window.speechSynthesis.cancel();',
    '        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));',
    '      });',
    '    });',
    '  </script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

function renderCardPage({ meta, cards, outputFile }) {
  const listClass = ['link-list', meta.listClass || ''].filter(Boolean).join(' ');
  const bodyHtml = [
    '      <div class="' + escapeHtml(listClass) + '">',
    renderCards(cards),
    '      </div>'
  ].join('\n');

  return renderLayout({ meta, outputFile, bodyHtml });
}

function renderWeekPage({ meta, body, outputFile }) {
  const bodyHtml = [
    '      <div class="week-content">',
    renderMarkdownBody(body),
    '      </div>'
  ].join('\n');

  return renderLayout({ meta, outputFile, bodyHtml });
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function generateSchedules({ root = schedulesRoot } = {}) {
  const markdownFiles = await walk(root);
  const generated = [];

  for (const markdownFile of markdownFiles) {
    const markdown = await fs.readFile(markdownFile, 'utf8');
    const { meta, body } = parseFrontMatter(markdown, markdownFile);
    const outputFile = markdownFile.replace(/\.md$/, '.html');
    const pageType = meta.type || 'cards';
    let html;

    if (pageType === 'week' || pageType === 'lesson') {
      html = renderWeekPage({ meta, body, outputFile });
    } else {
      const cards = parseCards(body, markdownFile);
      const renderedCards = meta.flattenModules === 'true'
        ? await flattenModuleCards(markdownFile, cards, outputFile)
        : cards;
      html = renderCardPage({ meta, cards: renderedCards, outputFile });
    }

    await fs.writeFile(outputFile, html, 'utf8');
    generated.push(path.relative(projectRoot, outputFile));
  }

  return generated;
}

if (globalThis.process?.argv?.[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateSchedules()
    .then((generated) => {
      console.log('Generated ' + generated.length + ' schedule page(s).');
      for (const file of generated) console.log('- ' + toPosix(file));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
