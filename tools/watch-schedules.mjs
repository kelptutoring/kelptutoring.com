import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateSchedules } from './generate-schedules.mjs';
import { generateTracksData } from './generate-tracks-data.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const schedulesRoot = path.join(projectRoot, 'src', 'app', 'schedules');
const pollIntervalMs = 1200;

let previousSnapshot = new Map();
let running = false;
let pending = false;

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

async function walkMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walkMarkdownFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function snapshotMarkdownTree() {
  const files = await walkMarkdownFiles(schedulesRoot);
  const snapshot = new Map();

  for (const file of files) {
    const stats = await fs.stat(file);
    snapshot.set(file, `${stats.mtimeMs}:${stats.size}`);
  }

  return snapshot;
}

function snapshotsMatch(currentSnapshot, lastSnapshot) {
  if (currentSnapshot.size !== lastSnapshot.size) {
    return false;
  }

  for (const [file, signature] of currentSnapshot) {
    if (lastSnapshot.get(file) !== signature) {
      return false;
    }
  }

  return true;
}

async function regenerate(reason) {
  if (running) {
    pending = true;
    return;
  }

  running = true;
  pending = false;

  try {
    const generatedPages = await generateSchedules();
    const tracksResult = await generateTracksData();
    const now = new Date().toLocaleTimeString();

    console.log(`[${now}] ${reason}`);
    console.log(`Generated ${generatedPages.length} schedule page(s).`);
    console.log(`Generated ${tracksResult.output} from ${tracksResult.levels} top-level schedule group(s).`);
  } catch (error) {
    console.error('Schedule regeneration failed.');
    console.error(error);
  } finally {
    running = false;

    if (pending) {
      await regenerate('Queued schedule markdown change detected.');
    }
  }
}

async function checkForChanges() {
  const currentSnapshot = await snapshotMarkdownTree();

  if (!snapshotsMatch(currentSnapshot, previousSnapshot)) {
    previousSnapshot = currentSnapshot;
    await regenerate('Schedule markdown change detected.');
  }
}

export async function watchSchedules() {
  previousSnapshot = await snapshotMarkdownTree();

  console.log('Watching schedule markdown for changes.');
  console.log(`Source: ${toPosix(path.relative(projectRoot, schedulesRoot))}/**/*.md`);
  console.log('Press Ctrl+C to stop.');

  await regenerate('Initial schedule refresh.');
  setInterval(() => {
    checkForChanges().catch((error) => {
      console.error('Schedule watch check failed.');
      console.error(error);
    });
  }, pollIntervalMs);
}

if (globalThis.process?.argv?.[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  watchSchedules().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
