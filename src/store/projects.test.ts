import { describe, expect, it } from "vitest";
import {
  LEGACY_KEY,
  bootProject,
  createProject,
  currentId,
  deleteProject,
  duplicateProject,
  fromFile,
  listProjects,
  loadProject,
  memoryKV,
  renameProject,
  saveProject,
  toFile,
} from "./projects";

const empty = { rooms: [], parts: [] };
const house = { rooms: [{ id: "r1" }, { id: "r2" }], parts: [{ id: "p" }] };

describe("projects", () => {
  it("boots a fresh browser with one untitled project", () => {
    const kv = memoryKV();
    const { meta, doc } = bootProject(kv, empty);
    expect(meta.name).toBe("Untitled project");
    expect(doc).toEqual(empty);
    expect(listProjects(kv)).toHaveLength(1);
  });
  it("migrates the old single save once", () => {
    const kv = memoryKV();
    kv.setItem(LEGACY_KEY, JSON.stringify(house));
    const { meta, doc } = bootProject(kv, empty);
    expect(meta.name).toBe("My first project");
    expect(doc).toEqual(house);
    expect(kv.getItem(LEGACY_KEY)).toBeNull();
    bootProject(kv, empty);
    expect(listProjects(kv)).toHaveLength(1);
  });
  it("saves, counts, renames, duplicates and deletes", () => {
    const kv = memoryKV();
    const a = createProject(kv, "Bahay", empty, "2026-01-01T00:00:00Z");
    saveProject(kv, a.id, house, "2026-01-02T00:00:00Z");
    expect(listProjects(kv)[0]).toMatchObject({ rooms: 2, parts: 1, updatedAt: "2026-01-02T00:00:00Z" });
    renameProject(kv, a.id, "Bahay ni Juan");
    const b = duplicateProject(kv, a.id)!;
    expect(b.name).toBe("Bahay ni Juan (copy)");
    expect(loadProject(kv, b.id)).toEqual(house);
    expect(currentId(kv)).toBe(b.id);
    deleteProject(kv, b.id);
    expect(listProjects(kv).map((p) => p.id)).toEqual([a.id]);
    expect(currentId(kv)).toBeNull();
  });
  it("reopens the last project", () => {
    const kv = memoryKV();
    const a = createProject(kv, "A", house);
    createProject(kv, "B", empty);
    kv.setItem("wirelab.current.v1", a.id);
    expect(bootProject(kv, empty).meta.name).toBe("A");
  });
  it("round-trips files and reads old bare JSON", () => {
    const f = fromFile(toFile({ name: "Unit 4B" }, house), "x.wirelab");
    expect(f).toEqual({ name: "Unit 4B", doc: house });
    expect(fromFile(JSON.stringify(house), "old-house.json").name).toBe("old-house");
    expect(() => fromFile("{}", "x")).toThrow();
  });
});
