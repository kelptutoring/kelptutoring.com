import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const schedulesRoot = path.join(projectRoot, 'src', 'app', 'schedules');

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function stripTags(value = '') {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function getMatch(html, regex) {
  const match = html.match(regex);
  return match ? stripTags(match[1]) : '';
}

function getAttr(matchText, attr) {
  const match = matchText.match(new RegExp(attr + '="([^"]*)"'));
  return match ? decodeHtml(match[1]) : '';
}

function escapeMarkdownText(value = '') {
  return value.replace(/\]/g, '\\]');
}

function cardLine(card) {
  const title = escapeMarkdownText(card.title);
  const suffix = card.description ? ': ' + card.description : '';
  if (card.number) return card.number + '. [' + title + '](' + card.href + ')' + suffix;
  return '- [' + title + '](' + card.href + ')' + suffix;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractLinks(navBlock) {
  const links = [];
  for (const match of navBlock.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    links.push({ href: decodeHtml(match[1]), label: stripTags(match[2]) });
  }
  return links;
}

function extractCards(html) {
  const cards = [];
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*class="[^"]*link-card[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const block = match[2];
    cards.push({
      href: decodeHtml(match[1]),
      number: getMatch(block, /<span\b[^>]*class="[^"]*link-number[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
      title: getMatch(block, /<span\b[^>]*class="[^"]*link-title[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
      description: getMatch(block, /<span\b[^>]*class="[^"]*link-description[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
    });
  }
  return cards.filter((card) => card.title && card.href);
}

function htmlToMarkdown(html, htmlFile) {
  const cards = extractCards(html);
  if (!cards.length) return null;

  const title = getMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || 'Kelp Tracks';
  const introBlock = html.match(/<div\b[^>]*class="[^"]*tracks-intro[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  const kicker = getMatch(introBlock, /<p\b[^>]*class="[^"]*tracks-kicker[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  const heading = getMatch(introBlock, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || title;
  const introParagraphs = [...introBlock.matchAll(/<p\b(?![^>]*tracks-kicker)[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => stripTags(match[1])).filter(Boolean);
  const intro = introParagraphs[0] || 'Select an option to continue.';
  const listClassRaw = html.match(/<div\b[^>]*class="([^"]*\blink-list\b[^"]*)"/i)?.[1] || 'link-list';
  const listClass = listClassRaw.split(/\s+/).filter((className) => className && className !== 'link-list').join(' ');
  const navBlock = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i)?.[1] || '';
  const navLinks = extractLinks(navBlock);
  const backLink = navLinks.find((link) => /^back$/i.test(link.label));
  const homeLink = navLinks.find((link) => !/^back$/i.test(link.label));

  const meta = [
    ['title', title],
    ['kicker', kicker],
    ['heading', heading],
    ['intro', intro],
    ['back', backLink?.href || ''],
    ['home', homeLink?.href || ''],
    ['homeLabel', homeLink?.label && homeLink.label !== 'Home' ? homeLink.label : ''],
    ['listClass', listClass]
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');

  return [
    '---',
    ...meta.map(([key, value]) => key + ': ' + value),
    '---',
    '',
    ...cards.map(cardLine),
    ''
  ].join('\n');
}

export async function extractScheduleMarkdown({ root = schedulesRoot } = {}) {
  const htmlFiles = await walk(root);
  const written = [];
  const skipped = [];

  for (const htmlFile of htmlFiles) {
    const html = await fs.readFile(htmlFile, 'utf8');
    const markdown = htmlToMarkdown(html, htmlFile);
    if (!markdown) {
      skipped.push(path.relative(projectRoot, htmlFile));
      continue;
    }

    const markdownFile = htmlFile.replace(/\.html$/, '.md');
    await fs.writeFile(markdownFile, markdown, 'utf8');
    written.push(path.relative(projectRoot, markdownFile));
  }

  return { written, skipped };
}

if (globalThis.process?.argv?.[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  extractScheduleMarkdown()
    .then(({ written, skipped }) => {
      console.log('Wrote ' + written.length + ' markdown schedule source file(s).');
      for (const file of written) console.log('- ' + toPosix(file));
      if (skipped.length) console.log('Skipped ' + skipped.length + ' html file(s) without schedule cards.');
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
