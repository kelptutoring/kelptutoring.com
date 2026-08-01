import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const schedulesRoot = path.join(projectRoot, 'src', 'app', 'schedules');
const dataOutputPath = path.join(projectRoot, 'src', 'data', 'tracks-data.js');
const scheduleGeneratorRoot = path.join(projectRoot, 'src', 'app', 'schedule-generator');

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function getContentId(kind, sourceFile) {
  const relativePath = toPosix(path.relative(schedulesRoot, sourceFile))
    .replace(/\.[^.]+$/, '');
  return `builtin_${kind}_${slugify(relativePath)}`;
}

function getPlanningHref(markdownFile) {
  if (!markdownFile) return null;
  const htmlFile = markdownFile.replace(/\.md$/i, '.html');
  return toPosix(path.relative(scheduleGeneratorRoot, htmlFile));
}

function getContentVersionKey(markdown) {
  const normalized = String(markdown || '').replace(/\r\n?/g, '\n');
  return `sha256:${createHash('sha256').update(normalized, 'utf8').digest('hex')}`;
}

function taxonomySlug(value) {
  const slug = slugify(value);
  return slug === 'math' ? 'mathematics' : slug;
}

function getAcademicPathway(...pages) {
  for (const page of pages) {
    const title = String(page?.meta?.academicPathway || '').trim();
    if (!title) continue;
    return {
      key: slugify(title),
      title,
      taxonomySlug: slugify(title)
    };
  }
  return null;
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
      cards.push({
        number: Number(ordered[1]),
        title: ordered[2],
        href: ordered[3],
        description: ordered[4] || ''
      });
      continue;
    }

    if (unordered) {
      cards.push({
        number: null,
        title: unordered[1],
        href: unordered[2],
        description: unordered[3] || ''
      });
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

  if (!resolvedPath.startsWith(schedulesRoot)) {
    return null;
  }

  return resolvedPath;
}

async function readSchedulePage(markdownFile) {
  const markdown = await fs.readFile(markdownFile, 'utf8');
  const { meta, body } = parseFrontMatter(markdown, markdownFile);

  return {
    file: markdownFile,
    meta,
    body,
    cards: parseCards(body, markdownFile)
  };
}

async function readWeekBody(markdownFile) {
  const markdown = await fs.readFile(markdownFile, 'utf8');
  return parseFrontMatter(markdown, markdownFile).body;
}

async function readWeekSource(markdownFile) {
  const markdown = await fs.readFile(markdownFile, 'utf8');
  const { body } = parseFrontMatter(markdown, markdownFile);
  return {
    body,
    sourceContentVersionKey: getContentVersionKey(markdown)
  };
}

function combineTitleAndDescription(card) {
  if (!card.description) {
    return card.title;
  }

  return card.title + ': ' + card.description;
}

function getModuleNumber(moduleTitle) {
  const match = moduleTitle.match(/^Module\s+(\d+)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function sortModules(modules) {
  return modules.slice().sort((a, b) => {
    const moduleNumberDifference = getModuleNumber(a.title) - getModuleNumber(b.title);
    if (moduleNumberDifference !== 0) return moduleNumberDifference;
    return a.title.localeCompare(b.title);
  });
}

function isModuleCard(card) {
  return /^Module\s+\d+\b/i.test(card.title);
}

function isModulePage(page) {
  return page.cards.length > 0 && page.cards.every(isModuleCard);
}

function normalizeDifficulty(value = '') {
  const cleaned = String(value)
    .replace(/\s+/g, ' ')
    .replace(/[.;]\s*$/, '')
    .trim()
    .toLowerCase();

  if (!cleaned) {
    return 'medium';
  }

  if (
    cleaned.includes('🔴') ||
    cleaned.includes('high') ||
    cleaned.includes('multiple concepts') ||
    cleaned.includes('multi-step') ||
    cleaned.includes('complex') ||
    cleaned.includes('challenging')
  ) {
    return 'high';
  }

  if (
    cleaned.includes('🟢') ||
    cleaned.includes('low') ||
    cleaned.includes('foundational') ||
    cleaned.includes('definition') ||
    cleaned.includes('direct method') ||
    cleaned.includes('direct application') ||
    cleaned.includes('manageable')
  ) {
    return 'low';
  }

  return 'medium';
}

function extractDifficulty(body) {
  const match = body.match(/-\s*Difficulty level:\s*([^\r\n]+)/i)
    || body.match(/-\s*Difficulty:\s*([^\r\n]+)/i);

  return normalizeDifficulty(match?.[1] || '');
}

async function getWeekDifficulty(modulePageFile, weekCard) {
  const weekFile = toMarkdownPath(modulePageFile, weekCard.href);
  if (!weekFile) {
    return '';
  }

  try {
    const weekBody = await readWeekBody(weekFile);
    return extractDifficulty(weekBody);
  } catch {
    return '';
  }
}

async function getWeekSourceDetails(modulePageFile, weekCard) {
  const weekFile = toMarkdownPath(modulePageFile, weekCard.href);
  if (!weekFile) {
    return { difficulty: '', sourceContentVersionKey: null };
  }

  try {
    const source = await readWeekSource(weekFile);
    return {
      difficulty: extractDifficulty(source.body),
      sourceContentVersionKey: source.sourceContentVersionKey
    };
  } catch {
    return { difficulty: '', sourceContentVersionKey: null };
  }
}

function getWeekTitle(weekCard) {
  const title = weekCard.title.trim();
  if (/^Week\s+\d+\s*:/i.test(title)) {
    return title;
  }

  if (weekCard.number) {
    return 'Week ' + weekCard.number + ': ' + title;
  }

  return title;
}

async function buildSessions(modulePage, moduleId) {
  if (modulePage.meta.flattenModules === 'true') {
    const sessions = [];

    for (const nestedModuleCard of modulePage.cards) {
      const nestedModuleFile = toMarkdownPath(modulePage.file, nestedModuleCard.href);
      if (!nestedModuleFile) {
        continue;
      }

      const nestedModulePage = await readSchedulePage(nestedModuleFile);
      sessions.push(...await buildSessions(nestedModulePage, moduleId));
    }

    return sessions;
  }

  const sessions = [];

  for (const weekCard of modulePage.cards) {
    const sessionFile = toMarkdownPath(modulePage.file, weekCard.href);
    const sessionId = sessionFile
      ? getContentId('session', sessionFile)
      : getContentId('session', `${modulePage.file}-${weekCard.number || weekCard.title}`);
    const sourceDetails = await getWeekSourceDetails(modulePage.file, weekCard);

    sessions.push({
      id: sessionId,
      sourceSessionId: sessionId,
      moduleId,
      title: getWeekTitle(weekCard),
      difficulty: sourceDetails.difficulty,
      sourceContentVersionKey: sourceDetails.sourceContentVersionKey,
      planningHref: getPlanningHref(sessionFile),
      type: 'lesson'
    });
  }

  return sessions;
}

async function buildCatalogModules(indexPage) {
  const modules = [];

  for (const moduleCard of indexPage.cards) {
    const moduleFile = toMarkdownPath(indexPage.file, moduleCard.href);
    if (!moduleFile) {
      continue;
    }

    const modulePage = await readSchedulePage(moduleFile);
    const moduleId = getContentId('module', moduleFile);
    modules.push({
      id: moduleId,
      title: combineTitleAndDescription(moduleCard),
      sessions: await buildSessions(modulePage, moduleId)
    });
  }

  return sortModules(modules);
}

async function buildCatalogTracks(subjectPage, subjectTitle) {
  if (isModulePage(subjectPage)) {
    return [{
      id: getContentId('track', subjectPage.file),
      title: subjectTitle,
      taxonomySlug: taxonomySlug(subjectTitle),
      academicPathway: getAcademicPathway(subjectPage),
      isImplicit: true,
      modules: await buildCatalogModules(subjectPage)
    }];
  }

  const tracks = [];

  for (const trackCard of subjectPage.cards) {
    const trackFile = toMarkdownPath(subjectPage.file, trackCard.href);
    if (!trackFile) {
      continue;
    }

    const trackPage = await readSchedulePage(trackFile);
    tracks.push({
      id: getContentId('track', trackFile),
      title: trackCard.title,
      taxonomySlug: taxonomySlug(trackCard.title),
      description: trackCard.description || '',
      academicPathway: getAcademicPathway(trackPage, subjectPage),
      isImplicit: false,
      modules: await buildCatalogModules(trackPage)
    });
  }

  return tracks;
}

export async function buildTracksCatalog({ root = schedulesRoot } = {}) {
  const rootPage = await readSchedulePage(path.join(root, 'schedules.md'));
  const catalog = {
    schemaVersion: 2,
    levels: []
  };

  for (const levelCard of rootPage.cards) {
    const levelFile = toMarkdownPath(rootPage.file, levelCard.href);
    if (!levelFile) {
      continue;
    }

    const levelPage = await readSchedulePage(levelFile);
    const level = {
      id: getContentId('level', levelFile),
      title: levelCard.title,
      taxonomySlug: taxonomySlug(levelCard.title),
      subjects: []
    };

    for (const subjectCard of levelPage.cards) {
      const subjectFile = toMarkdownPath(levelPage.file, subjectCard.href);
      if (!subjectFile) {
        continue;
      }

      const subjectPage = await readSchedulePage(subjectFile);
      level.subjects.push({
        id: getContentId('subject', subjectFile),
        title: subjectCard.title,
        taxonomySlug: taxonomySlug(subjectCard.title),
        tracks: await buildCatalogTracks(subjectPage, subjectCard.title)
      });
    }

    catalog.levels.push(level);
  }

  return catalog;
}

function catalogModuleToLegacy(module) {
  return {
    id: module.id,
    title: module.title,
    weeks: module.sessions.map((session) => ({ ...session }))
  };
}

export function catalogToLegacyTracksData(catalog) {
  const tracksData = {};

  for (const level of catalog.levels) {
    tracksData[level.title] = {};

    for (const subject of level.subjects) {
      const implicitTrack = subject.tracks.length === 1 && subject.tracks[0].isImplicit;

      if (implicitTrack) {
        tracksData[level.title][subject.title] = {
          modulesOnly: subject.tracks[0].modules.map(catalogModuleToLegacy)
        };
        continue;
      }

      tracksData[level.title][subject.title] = {};
      for (const track of subject.tracks) {
        tracksData[level.title][subject.title][track.title] = track.modules.map(catalogModuleToLegacy);
      }
    }
  }

  return tracksData;
}

export async function buildTracksData({ root = schedulesRoot } = {}) {
  return catalogToLegacyTracksData(await buildTracksCatalog({ root }));
}

export async function generateTracksData({
  root = schedulesRoot,
  outputPath = dataOutputPath
} = {}) {
  const tracksCatalog = await buildTracksCatalog({ root });
  const tracksData = catalogToLegacyTracksData(tracksCatalog);
  const catalogJson = JSON.stringify(tracksCatalog, null, 2);
  const legacyJson = JSON.stringify(tracksData, null, 2);
  const relativeOutput = toPosix(path.relative(projectRoot, outputPath));
  const relativeRoot = toPosix(path.relative(projectRoot, root));
  const fileContents = [
    '// Generated by tools/generate-tracks-data.mjs.',
    '// Source: ' + relativeRoot + '/**/*.md',
    '// Loaded as a plain browser script so schedule-generator.html works from file://.',
    '',
    '(function () {',
    '  globalThis.tracksCatalog = ' + catalogJson + ';',
    '  globalThis.tracksData = ' + legacyJson + ';',
    '}());',
    ''
  ].join('\n');

  await fs.writeFile(outputPath, fileContents, 'utf8');

  return {
    output: relativeOutput,
    levels: tracksCatalog.levels.length
  };
}

if (globalThis.process?.argv?.[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateTracksData()
    .then(({ output, levels }) => {
      console.log('Generated ' + output + ' from schedule markdown.');
      console.log('Found ' + levels + ' top-level schedule group(s).');
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
