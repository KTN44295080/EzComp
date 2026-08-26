import { assetToBlob, clearAssets, restoreAsset } from './assets';
import { defaultAdjustments, defaultDepthOfField, defaultDocument, defaultFinish, defaultSceneLock, type CompositeDocument, type RasterLayer } from '../types/editor';

export const PROJECT_EXTENSION = '.ezcomp';
const DB_NAME = 'ezcomp-local';
const STORE_NAME = 'autosave';
const AUTOSAVE_KEY = 'latest';

export interface ProjectSnapshot { document: CompositeDocument; layers: RasterLayer[] }
interface StoredProject extends ProjectSnapshot { version: 1; assets: Record<string, Blob> }
interface PortableProject extends ProjectSnapshot { version: 1; assets: Record<string, string> }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'));
  });
}

async function capture(snapshot: ProjectSnapshot): Promise<StoredProject> {
  const assetIds = new Set<string>();
  for (const layer of snapshot.layers) {
    if (layer.kind !== 'group' && layer.assetId) assetIds.add(layer.assetId);
    if (layer.depthOfField?.depthMapAssetId) assetIds.add(layer.depthOfField.depthMapAssetId);
  }
  const entries = await Promise.all([...assetIds].map(async (assetId) => [assetId, await assetToBlob(assetId)] as const));
  return { version: 1, document: snapshot.document, layers: snapshot.layers, assets: Object.fromEntries(entries) };
}

async function hydrate(project: StoredProject): Promise<ProjectSnapshot> {
  if (project.version !== 1 || !project.document || !Array.isArray(project.layers)) throw new Error('Unsupported EzComp project.');
  clearAssets();
  await Promise.all(Object.entries(project.assets).map(([id, blob]) => restoreAsset(id, blob)));
  return { document: { ...defaultDocument(), ...project.document, sceneLock: { ...defaultSceneLock(), ...project.document.sceneLock }, finish: { ...defaultFinish(), ...project.document.finish } }, layers: project.layers.map((layer) => ({ ...layer, kind: layer.kind ?? 'raster', depth: layer.depth ?? 0, adjustments: { ...defaultAdjustments(), ...layer.adjustments }, depthOfField: { ...defaultDepthOfField(), ...layer.depthOfField } })) };
}

export async function saveAutosave(snapshot: ProjectSnapshot): Promise<void> {
  const database = await openDb();
  const project = await capture(snapshot);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(project, AUTOSAVE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Autosave failed.'));
  });
  database.close();
}

export async function loadAutosave(): Promise<ProjectSnapshot | null> {
  const database = await openDb();
  const result = await new Promise<StoredProject | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(AUTOSAVE_KEY);
    request.onsuccess = () => resolve(request.result as StoredProject | undefined);
    request.onerror = () => reject(request.error ?? new Error('Autosave could not be read.'));
  });
  database.close();
  return result ? hydrate(result) : null;
}

export async function clearAutosave(): Promise<void> {
  const database = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(AUTOSAVE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Autosave could not be cleared.'));
  });
  database.close();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Project encoding failed.'));
    reader.readAsDataURL(blob);
  });
}

export async function downloadProject(snapshot: ProjectSnapshot): Promise<void> {
  const stored = await capture(snapshot);
  const portable: PortableProject = {
    version: 1, document: stored.document, layers: stored.layers,
    assets: Object.fromEntries(await Promise.all(Object.entries(stored.assets).map(async ([id, blob]) => [id, await blobToDataUrl(blob)]))),
  };
  const blob = new Blob([JSON.stringify(portable)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${snapshot.document.name || 'Untitled'}${PROJECT_EXTENSION}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function readProject(file: File): Promise<ProjectSnapshot> {
  let portable: PortableProject;
  try { portable = JSON.parse(await file.text()) as PortableProject; }
  catch { throw new Error('The selected file is not a valid EzComp project.'); }
  const assets: Record<string, Blob> = {};
  for (const [id, dataUrl] of Object.entries(portable.assets ?? {})) assets[id] = await (await fetch(dataUrl)).blob();
  return hydrate({ version: portable.version, document: portable.document, layers: portable.layers, assets });
}
