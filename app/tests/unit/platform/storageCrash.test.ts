/**
 * The JSON store on a slow device (every plugin call waits a macrotask,
 * like the real bridge), and an app killed in the middle of a save.
 * From the review of app/family: a read during a save must never call the
 * new file corrupt, and a save cut short must not lose the newest data.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const disk = vi.hoisted(() => ({
  files: new Map<string, string>(),
  dirs: new Set<string>([""]),
  /** Throws ("app killed") right after the nth call of this operation. */
  kill: null as null | { op: string; after: number },
  calls: [] as string[],
}));

vi.mock("@capacitor/filesystem", () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const notFound = () => new Error("File does not exist");
  const parent = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  const done = async (op: string) => {
    disk.calls.push(op);
    if (disk.kill && disk.kill.op === op && --disk.kill.after === 0) {
      disk.kill = null;
      throw new Error("app killed");
    }
  };
  return {
    Directory: { Data: "DATA" },
    Encoding: { UTF8: "utf8" },
    Filesystem: {
      async readFile({ path }: { path: string }) {
        await tick();
        if (!disk.files.has(path)) throw notFound();
        return { data: disk.files.get(path)! };
      },
      async writeFile({ path, data }: { path: string; data: string }) {
        await tick();
        for (let d = parent(path); d; d = parent(d)) disk.dirs.add(d);
        disk.files.set(path, data);
        await done("writeFile");
      },
      async stat({ path }: { path: string }) {
        await tick();
        if (disk.files.has(path)) return { type: "file" };
        if (disk.dirs.has(path)) return { type: "directory" };
        throw notFound();
      },
      async readdir({ path }: { path: string }) {
        await tick();
        const names = [...disk.files.keys()].filter((f) => parent(f) === path).map((f) => f.slice(path ? path.length + 1 : 0));
        return { files: names.map((name) => ({ name, type: "file", size: 0 })) };
      },
      async mkdir({ path }: { path: string }) {
        await tick();
        for (let d = path; d; d = parent(d)) disk.dirs.add(d);
      },
      async deleteFile({ path }: { path: string }) {
        await tick();
        disk.files.delete(path);
        await done("deleteFile");
      },
      async rename({ from, to }: { from: string; to: string }) {
        await tick();
        if (!disk.files.has(from)) throw notFound();
        if (disk.files.has(to)) throw new Error("Destination exists");
        disk.files.set(to, disk.files.get(from)!);
        disk.files.delete(from);
        await done("rename");
      },
      async rmdir() {
        await tick();
      },
    },
  };
});

const { CapacitorFileStore, readJson, writeJson } = await import("../../../src/platform/storage");

const tick = () => new Promise((r) => setTimeout(r, 0));
const corruptFiles = () => [...disk.files.keys()].filter((k) => k.includes(".corrupt-"));

beforeEach(() => {
  disk.files.clear();
  disk.dirs.clear();
  disk.dirs.add("");
  disk.kill = null;
  disk.calls = [];
});

describe("a read during a save", () => {
  it("never moves the new file aside and never sees a half state", async () => {
    for (let offset = 0; offset < 30; offset++) {
      disk.files.clear();
      const fs = new CapacitorFileStore();
      await writeJson(fs, "l.json", { n: 1 });
      await writeJson(fs, "l.json", { n: 2 });
      const write = writeJson(fs, "l.json", { n: 3 });
      for (let i = 0; i < offset; i++) await tick();
      const read = readJson(fs, "l.json");
      await write;
      const res = await read;
      expect(res.status, `offset ${offset}`).toBe("ok");
      expect([2, 3]).toContain((res.data as { n: number }).n);
      expect(corruptFiles(), `offset ${offset}`).toEqual([]);
      expect((await readJson(fs, "l.json")).data).toEqual({ n: 3 });
    }
  });
});

describe("an app killed in the middle of a save", () => {
  it("killed after the old file became the .bak: the newest data comes from the .tmp", async () => {
    const fs = new CapacitorFileStore();
    await writeJson(fs, "learning.json", { answers: 1 });
    await writeJson(fs, "learning.json", { answers: 2 });
    // The save renames learning.json to .bak, then the .tmp to learning.json.
    disk.kill = { op: "rename", after: 1 };
    await expect(writeJson(fs, "learning.json", { answers: 3 })).rejects.toThrow("app killed");
    expect(disk.files.has("learning.json")).toBe(false);
    const res = await readJson(fs, "learning.json");
    expect(res).toEqual({ data: { answers: 3 }, status: "tmp", recovered: true });
    // The interrupted save is finished: the next read is a normal one.
    expect(await readJson(fs, "learning.json")).toEqual({ data: { answers: 3 }, status: "ok", recovered: false });
    expect(JSON.parse(disk.files.get("learning.json.bak")!)).toEqual({ answers: 2 });
  });

  it("without a backup, killed between delete and rename: still the newest data", async () => {
    const fs = new CapacitorFileStore();
    await writeJson(fs, "s.json", { a: 1 }, { backup: false });
    disk.kill = { op: "deleteFile", after: 1 };
    await expect(writeJson(fs, "s.json", { a: 2 }, { backup: false })).rejects.toThrow("app killed");
    const res = await readJson(fs, "s.json");
    expect(res.data).toEqual({ a: 2 });
    expect(res.recovered).toBe(true);
  });

  it("a half-written .tmp is skipped for the .bak", async () => {
    const fs = new CapacitorFileStore();
    await writeJson(fs, "d.json", { v: 1 });
    await writeJson(fs, "d.json", { v: 2 });
    disk.files.delete("d.json");
    disk.files.set("d.json.tmp", '{"v": 3');
    expect(await readJson(fs, "d.json")).toEqual({ data: { v: 1 }, status: "backup", recovered: true });
  });

  it("a failed backup fails the save and keeps the file as it was", async () => {
    const fs = new CapacitorFileStore();
    await writeJson(fs, "d.json", { v: 1 });
    await writeJson(fs, "d.json", { v: 2 });
    // Making the backup deletes the old .bak first; die right there.
    disk.kill = { op: "deleteFile", after: 1 };
    await expect(writeJson(fs, "d.json", { v: 3 })).rejects.toThrow("app killed");
    expect(await readJson(fs, "d.json")).toEqual({ data: { v: 2 }, status: "ok", recovered: false });
  });
});
