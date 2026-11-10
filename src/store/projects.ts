/**
 * Several named projects saved in the browser. No account or server: each project is a
 * JSON document in localStorage, listed in a small index.
 */
export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  rooms: number;
  parts: number;
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export const INDEX_KEY = "wirelab.projects.v1";
export const CURRENT_KEY = "wirelab.current.v1";
export const LEGACY_KEY = "wirelab.editor.v1";
const docKey = (id: string) => `wirelab.project.${id}`;

/** File format written by "Save file". */
export const FILE_EXT = ".wirelab";
export const FILE_VERSION = 1;

type Doc = { rooms?: unknown[]; parts?: unknown[] };

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const stats = (d: Doc) => ({ rooms: d.rooms?.length ?? 0, parts: d.parts?.length ?? 0 });

export function listProjects(kv: KV): ProjectMeta[] {
  try {
    const raw = kv.getItem(INDEX_KEY);
    const list = raw ? (JSON.parse(raw) as ProjectMeta[]) : [];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
  } catch {
    return [];
  }
}

function writeIndex(kv: KV, list: ProjectMeta[]) {
  kv.setItem(INDEX_KEY, JSON.stringify(list));
}

export function loadProject<T>(kv: KV, id: string): T | null {
  try {
    const raw = kv.getItem(docKey(id));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function createProject(kv: KV, name: string, doc: Doc, now = new Date().toISOString()): ProjectMeta {
  const meta: ProjectMeta = { id: newId(), name: name.trim() || "Untitled project", createdAt: now, updatedAt: now, ...stats(doc) };
  kv.setItem(docKey(meta.id), JSON.stringify(doc));
  writeIndex(kv, [meta, ...listProjects(kv)]);
  kv.setItem(CURRENT_KEY, meta.id);
  return meta;
}

export function saveProject(kv: KV, id: string, doc: Doc, now = new Date().toISOString()): void {
  kv.setItem(docKey(id), JSON.stringify(doc));
  writeIndex(
    kv,
    listProjects(kv).map((p) => (p.id === id ? { ...p, updatedAt: now, ...stats(doc) } : p)),
  );
}

export function renameProject(kv: KV, id: string, name: string): void {
  writeIndex(
    kv,
    listProjects(kv).map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)),
  );
}

export function duplicateProject(kv: KV, id: string): ProjectMeta | null {
  const src = listProjects(kv).find((p) => p.id === id);
  const doc = loadProject<Doc>(kv, id);
  if (!src || !doc) return null;
  return createProject(kv, `${src.name} (copy)`, doc);
}

export function deleteProject(kv: KV, id: string): void {
  kv.removeItem(docKey(id));
  writeIndex(
    kv,
    listProjects(kv).filter((p) => p.id !== id),
  );
  if (kv.getItem(CURRENT_KEY) === id) kv.removeItem(CURRENT_KEY);
}

export const currentId = (kv: KV) => kv.getItem(CURRENT_KEY);
export const setCurrent = (kv: KV, id: string) => kv.setItem(CURRENT_KEY, id);

/**
 * Open the project to show at start-up: the last one used, else the newest, else a new
 * one. A drawing saved by the single-project version is moved into the list once.
 */
export function bootProject<T extends Doc>(kv: KV, empty: T): { meta: ProjectMeta; doc: T } {
  const legacy = kv.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      const d = JSON.parse(legacy) as T;
      if ((d.rooms?.length ?? 0) || (d.parts?.length ?? 0)) createProject(kv, "My first project", d);
    } catch {
      /* ignore a corrupt legacy save */
    }
    kv.removeItem(LEGACY_KEY);
  }
  const cur = currentId(kv);
  for (;;) {
    const list = listProjects(kv);
    const pick = list.find((p) => p.id === cur) ?? list[0];
    if (!pick) break;
    const doc = loadProject<T>(kv, pick.id);
    if (doc) {
      setCurrent(kv, pick.id);
      return { meta: pick, doc };
    }
    deleteProject(kv, pick.id); // index entry whose drawing is gone or corrupt
  }
  const meta = createProject(kv, "Untitled project", empty);
  return { meta, doc: empty };
}

/** Wrap a project for a downloadable file. */
export function toFile(meta: Pick<ProjectMeta, "name">, doc: unknown): string {
  return JSON.stringify({ app: "wirelab", version: FILE_VERSION, name: meta.name, savedAt: new Date().toISOString(), doc }, null, 2);
}

/** Read a .wirelab file, or a bare document saved by older versions. */
export function fromFile(text: string, fallbackName: string): { name: string; doc: Doc } {
  const j = JSON.parse(text) as { app?: string; name?: string; doc?: Doc } & Doc;
  const doc = j.app === "wirelab" && j.doc ? j.doc : j;
  if (!Array.isArray(doc.rooms) || !Array.isArray(doc.parts)) throw new Error("Not a WireLab project");
  return { name: (j.app === "wirelab" && j.name) || fallbackName.replace(/\.(wirelab|json)$/i, ""), doc };
}

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
