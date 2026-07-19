import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTftData } from './tft-data-updater.mjs';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = path.join(rootDir, 'config', 'publish-manifest.json');
const publicDataDir = path.join(rootDir, 'public', 'data');
const catalogPath = path.join(publicDataDir, 'catalog.json');
const fallbackPath = path.join(publicDataDir, 'tft-current.json');
const snapshotsDir = path.join(publicDataDir, 'snapshots');
const assetsDir = path.join(publicDataDir, 'assets');
const simulateFailure = process.argv.includes('--simulate-failure');

const manifest = await readManifest();
const stageDir = path.join(rootDir, '.tmp', `tft-publish-${Date.now()}`);

try {
  const published = [];

  for (const dataset of manifest.datasets) {
    process.stdout.write(`Building ${dataset.id} (${dataset.version}/${dataset.setId})...\n`);
    const snapshot = await buildTftData(dataset);
    validateSnapshot(snapshot, dataset);

    const localized = structuredClone(snapshot);
    const stagedAssetDir = path.join(stageDir, 'assets', dataset.id);
    await localizeSnapshotAssets(localized, dataset.id, stagedAssetDir);
    validateLocalAssets(localized);

    const serialized = `${JSON.stringify(localized, null, 2)}\n`;
    const contentHash = sha256(serialized).slice(0, 12);
    const fileName = `${dataset.id}-${contentHash}.json`;
    const stagedSnapshotPath = path.join(stageDir, 'snapshots', fileName);
    await fs.mkdir(path.dirname(stagedSnapshotPath), { recursive: true });
    await fs.writeFile(stagedSnapshotPath, serialized, 'utf8');

    published.push({
      id: dataset.id,
      version: localized.meta.version ?? dataset.version,
      setId: localized.meta.setId,
      setName: localized.meta.setName,
      preview: Boolean(localized.meta.preview),
      path: `/data/snapshots/${fileName}`,
      updatedAt: localized.meta.fetchedAt,
      snapshot: localized
    });
  }

  if (simulateFailure) {
    throw new Error('Simulated failure before published files were changed.');
  }

  const defaultSnapshot = published.find((snapshot) => snapshot.id === manifest.defaultSnapshotId);
  if (!defaultSnapshot) {
    throw new Error(`Default snapshot ${manifest.defaultSnapshotId} was not generated.`);
  }

  await fs.mkdir(publicDataDir, { recursive: true });
  await fs.mkdir(snapshotsDir, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.cp(path.join(stageDir, 'snapshots'), snapshotsDir, { recursive: true });
  await fs.cp(path.join(stageDir, 'assets'), assetsDir, { recursive: true });

  await writeJsonAtomic(fallbackPath, defaultSnapshot.snapshot);
  await writeJsonAtomic(catalogPath, {
    generatedAt: new Date().toISOString(),
    defaultSnapshotId: manifest.defaultSnapshotId,
    snapshots: published.map(({ snapshot, ...entry }) => entry)
  });

  process.stdout.write(
    `Published ${published.length} snapshots. Default: ${manifest.defaultSnapshotId}.\n`
  );
} finally {
  await fs.rm(stageDir, { recursive: true, force: true });
}

async function readManifest() {
  const parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (!safeText(parsed.defaultSnapshotId) || !Array.isArray(parsed.datasets)) {
    throw new Error('Publish manifest requires defaultSnapshotId and datasets.');
  }

  const ids = new Set();
  for (const dataset of parsed.datasets) {
    if (!safeText(dataset.id) || !safeText(dataset.version) || !safeText(dataset.setId)) {
      throw new Error('Every publish dataset requires id, version, and setId.');
    }
    if (!/^[a-z0-9-]+$/.test(dataset.id)) {
      throw new Error(`Dataset id ${dataset.id} must use lowercase letters, numbers, and dashes.`);
    }
    if (ids.has(dataset.id)) {
      throw new Error(`Duplicate dataset id: ${dataset.id}.`);
    }
    ids.add(dataset.id);
  }

  return parsed;
}

function validateSnapshot(snapshot, dataset) {
  if (!snapshot?.meta || !Array.isArray(snapshot.traits) || !Array.isArray(snapshot.units)) {
    throw new Error(`${dataset.id} did not produce normalized TFT data.`);
  }
  if (snapshot.traits.length === 0 || snapshot.units.length === 0) {
    throw new Error(`${dataset.id} produced an empty roster or trait list.`);
  }

  const traitIds = new Set();
  for (const trait of snapshot.traits) {
    if (!safeText(trait.id) || !safeText(trait.name) || traitIds.has(trait.id)) {
      throw new Error(`${dataset.id} contains an invalid or duplicate trait id: ${trait.id}.`);
    }
    traitIds.add(trait.id);

    for (const effect of trait.effects ?? []) {
      if (
        !Number.isFinite(effect.minUnits) ||
        !Number.isFinite(effect.maxUnits) ||
        !Number.isFinite(effect.style) ||
        effect.minUnits < 1 ||
        effect.maxUnits < effect.minUnits
      ) {
        throw new Error(`${dataset.id} contains an invalid effect for ${trait.name}.`);
      }
    }
  }

  const unitIds = new Set();
  for (const unit of snapshot.units) {
    if (!safeText(unit.id) || !safeText(unit.name) || unitIds.has(unit.id)) {
      throw new Error(`${dataset.id} contains an invalid or duplicate unit id: ${unit.id}.`);
    }
    unitIds.add(unit.id);
    if (!Number.isFinite(unit.cost) || unit.cost < 1) {
      throw new Error(`${dataset.id} contains an invalid cost for ${unit.name}.`);
    }
    for (const traitId of unit.allTraitIds ?? []) {
      if (!traitIds.has(traitId)) {
        throw new Error(`${dataset.id} unit ${unit.name} references missing trait ${traitId}.`);
      }
    }
  }
}

async function localizeSnapshotAssets(snapshot, snapshotId, outputDir) {
  const targets = [
    ...snapshot.traits.map((trait) => ({ record: trait, label: `trait ${trait.name}` })),
    ...snapshot.units.map((unit) => ({ record: unit, label: `unit ${unit.name}` }))
  ].filter(({ record }) => /^https?:\/\//i.test(record.iconUrl ?? ''));

  const cachedUrls = new Map();
  await runWithConcurrency(targets, 8, async ({ record, label }) => {
    const existing = cachedUrls.get(record.iconUrl);
    if (existing) {
      record.iconUrl = existing;
      return;
    }

    const asset = await downloadImage(record.iconUrl, label);
    const contentHash = sha256(asset.bytes).slice(0, 16);
    const fileName = `${contentHash}.${asset.extension}`;
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, fileName), asset.bytes);

    const publicPath = `/data/assets/${snapshotId}/${fileName}`;
    cachedUrls.set(record.iconUrl, publicPath);
    record.iconUrl = publicPath;
  });
}

async function downloadImage(url, label) {
  const response = await fetch(url, {
    headers: {
      Accept: 'image/avif,image/webp,image/svg+xml,image/png,image/jpeg,*/*',
      'User-Agent': 'TFT-Trait-Matrix-Data-Publisher/1.0'
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`Unable to download ${label}: ${response.status} from ${url}`);
  }

  const contentType = safeText(response.headers.get('content-type')).split(';')[0].toLowerCase();
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error(`Downloaded an empty image for ${label}.`);
  }

  return {
    bytes,
    extension: imageExtension(contentType, url)
  };
}

function imageExtension(contentType, url) {
  const extensions = {
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp'
  };
  if (extensions[contentType]) {
    return extensions[contentType];
  }

  const urlExtension = path.extname(new URL(url).pathname).slice(1).toLowerCase();
  if (['avif', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'].includes(urlExtension)) {
    return urlExtension === 'jpeg' ? 'jpg' : urlExtension;
  }
  throw new Error(`Unsupported image content type ${contentType || 'unknown'} from ${url}`);
}

function validateLocalAssets(snapshot) {
  for (const record of [...snapshot.traits, ...snapshot.units]) {
    if (record.iconUrl && !record.iconUrl.startsWith('/data/assets/')) {
      throw new Error(`Asset localization failed for ${record.name}.`);
    }
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}

async function writeJsonAtomic(targetPath, value) {
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, targetPath);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeText(value) {
  return String(value ?? '').trim();
}
