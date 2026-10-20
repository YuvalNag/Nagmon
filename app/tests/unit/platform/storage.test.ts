/**
 * The JSON file store (port of tests/nagmon/test_family_jsonio.py, 8 cases),
 * run against every implementation: memory, localStorage and Capacitor
 * Filesystem (through a fake plugin).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DATA_FILES,
  type FileStore,
  MemoryFileStore,
  readJson,
  removeJson,
  writeJson,
} from "../../../src/platform/storage";

// A fake @capacitor/filesystem: the plugin calls land in a memory store,
// so the Capacitor implementation can be checked without a phone.
const fake = vi.hoisted(() => ({ calls: [] as string[], backing: null as unknown }));

vi.mock("@capacitor/filesystem", () => {
  const notFound = () => new Error("File does not exist");
  const fs = () => fake.backing as FileStore;
  return {
    Directory: { Data: "DATA" },
    Encoding: { UTF8: "utf8" },
    Filesystem: {
      async readFile(o: { path: string; directory: string }) {
        fake.calls.push(`readFile ${o.directory} ${o.path}`);
        const text = await fs().readText(o.path);
        if (text === null) throw notFound();
        return { data: text };
      },
      async writeFile(o: { path: string; data: string; recursive?: boolean }) {
        fake.calls.push(`writeFile ${o.path}`);
        if (!o.recursive) throw new Error("expected recursive writes");
        await fs().writeText(o.path, o.data);
        return { uri: o.path };
      },
      async deleteFile(o: { path: string }) {
        if ((await fs().stat(o.path)) !== "file") throw notFound();
        await fs().remove(o.path);
      },
      async mkdir(o: { path: string; recursive?: boolean }) {
        if ((await fs().stat(o.path)) !== null) throw new Error("Directory exists");
        await fs().mkdir(o.path);
      },
      async rmdir(o: { path: string }) {
        if ((await fs().stat(o.path)) !== "dir") throw notFound();
        await fs().remove(o.path);
      },
      async readdir(o: { path: string }) {
        if ((await fs().stat(o.path)) !== "dir") throw notFound();
        const files = (await fs().list(o.path)).map((e) => ({
          name: e.name,
          type: e.kind === "dir" ? "directory" : "file",
          size: 0,
        }));
        return { files };
      },
      async stat(o: { path: string }) {
        const kind = await fs().stat(o.path);
        if (kind === null) throw notFound();
        return { name: o.path, type: kind === "dir" ? "directory" : "file", size: 0 };
      },
      async rename(o: { from: string; to: string }) {
        fake.calls.push(`rename ${o.from} ${o.to}`);
        // Like the native side may do: refuse to replace an existing file.
        if ((await fs().stat(o.to)) !== null) throw new Error("Destination exists");
        await fs().rename(o.from, o.to);
      },
      async copy(o: { from: string; to: string }) {
        await fs().copy(o.from, o.to);
        return { uri: o.to };
      },
    },
  };
});

const { CapacitorFileStore } = await import("../../../src/platform/storage");

/** A localStorage stand-in, so each test starts empty. */
class FakeStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

const IMPLEMENTATIONS: [string, () => FileStore][] = [
  ["memory", () => new MemoryFileStore()],
  ["localStorage", () => new MemoryFileStore({ storage: new FakeStorage() })],
  [
    "capacitor",
    () => {
      fake.backing = new MemoryFileStore();
      fake.calls = [];
      return new CapacitorFileStore();
    },
  ],
];

async function names(fs: FileStore, dir = ""): Promise<string[]> {
  return (await fs.list(dir)).map((e) => e.name).sort();
}

describe.each(IMPLEMENTATIONS)("JSON file store (%s)", (_label, make) => {
  let fs: FileStore;
  beforeEach(() => {
    fs = make();
  });

  it("atomic write leaves no tmp and keeps a backup", async () => {
    await writeJson(fs, "data.json", { a: 1 });
    await writeJson(fs, "data.json", { a: 2 });
    expect(JSON.parse((await fs.readText("data.json"))!)).toEqual({ a: 2 });
    expect(JSON.parse((await fs.readText("data.json.bak"))!)).toEqual({ a: 1 });
    expect((await names(fs)).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("keeps Hebrew readable", async () => {
    await writeJson(fs, "data.json", { name: "נועה" });
    expect(await fs.readText("data.json")).toContain("נועה");
  });

  it("loads a missing file as missing", async () => {
    const res = await readJson(fs, "nope.json");
    expect(res.data).toBeNull();
    expect(res.status).toBe("missing");
    expect(res.recovered).toBe(false);
  });

  it("loads a good file", async () => {
    await writeJson(fs, "data.json", { a: 1 });
    const res = await readJson(fs, "data.json");
    expect(res.data).toEqual({ a: 1 });
    expect(res.status).toBe("ok");
    expect(res.recovered).toBe(false);
  });

  it("falls back to the backup when the file is corrupt", async () => {
    await writeJson(fs, "data.json", { a: 1 });
    await writeJson(fs, "data.json", { a: 2 });
    await fs.writeText("data.json", "{not json");
    const res = await readJson(fs, "data.json");
    expect(res.data).toEqual({ a: 1 });
    expect(res.status).toBe("backup");
    expect(res.recovered).toBe(true);
    const corrupt = (await names(fs)).filter((n) => n.startsWith("data.json.corrupt-"));
    expect(corrupt).toHaveLength(1);
    expect(await fs.readText(corrupt[0]!)).toBe("{not json");
  });

  it("resets a corrupt file without a backup", async () => {
    await fs.writeText("data.json", "\x00\x01garbage");
    const res = await readJson(fs, "data.json");
    expect(res.data).toBeNull();
    expect(res.status).toBe("reset");
    expect(res.recovered).toBe(true);
    expect(await fs.stat("data.json")).toBeNull();
    expect((await names(fs)).some((n) => n.startsWith("data.json.corrupt-"))).toBe(true);
  });

  it("treats JSON that is not an object as corrupt", async () => {
    await fs.writeText("data.json", "[1, 2, 3]");
    const res = await readJson(fs, "data.json");
    expect(res.data).toBeNull();
    expect(res.status).toBe("reset");
  });

  it("two corruptions do not overwrite each other", async () => {
    await fs.writeText("data.json", "bad1");
    await readJson(fs, "data.json");
    await fs.writeText("data.json", "bad2");
    await readJson(fs, "data.json");
    const corrupt = (await names(fs)).filter((n) => n.startsWith("data.json.corrupt-"));
    expect(corrupt).toHaveLength(2);
  });

  // ---- beyond the Python tests: what the stores need on top

  it("writes keys sorted, two-space indented, like the old files", async () => {
    await writeJson(fs, "d.json", { b: 1, a: { d: 2, c: 3 } });
    expect(await fs.readText("d.json")).toBe(
      '{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}',
    );
  });

  it("writes to one file at once land in order, none lost", async () => {
    await Promise.all([1, 2, 3, 4, 5].map((v) => writeJson(fs, "d.json", { v })));
    expect((await readJson(fs, "d.json")).data).toEqual({ v: 5 });
    expect(JSON.parse((await fs.readText("d.json.bak"))!)).toEqual({ v: 4 });
    expect(await fs.stat("d.json.tmp")).toBeNull();
  });

  it("can skip the backup (secrets must not leave copies)", async () => {
    await writeJson(fs, "s.json", { a: 1 }, { backup: false });
    await writeJson(fs, "s.json", { a: 2 }, { backup: false });
    expect(await fs.stat("s.json.bak")).toBeNull();
  });

  it("uses the backup when only the backup is left (a rename cut short)", async () => {
    await writeJson(fs, "d.json", { a: 1 });
    await writeJson(fs, "d.json", { a: 2 });
    await fs.remove("d.json");
    const res = await readJson(fs, "d.json");
    expect(res).toEqual({ data: { a: 1 }, status: "backup", recovered: true });
  });

  it("removeJson removes the file and its backup", async () => {
    await writeJson(fs, "d.json", { a: 1 });
    await writeJson(fs, "d.json", { a: 2 });
    await removeJson(fs, "d.json");
    expect((await readJson(fs, "d.json")).status).toBe("missing");
    expect(await fs.stat("d.json.bak")).toBeNull();
  });

  it("creates parent directories and lists them", async () => {
    await writeJson(fs, "profiles/p12345/profile.json", { a: 1 });
    expect(await fs.stat("profiles")).toBe("dir");
    expect(await fs.list("profiles")).toEqual([{ name: "p12345", kind: "dir" }]);
    expect(await fs.list("nothing")).toEqual([]);
  });

  it("renames a directory with everything in it", async () => {
    await fs.writeText("profiles/p1/a.txt", "a");
    await fs.writeText("profiles/p1/saves/s.txt", "s");
    await fs.mkdir("profiles/p1/empty");
    await fs.rename("profiles/p1", "trash/p1-5");
    expect(await fs.stat("profiles/p1")).toBeNull();
    expect(await fs.readText("trash/p1-5/saves/s.txt")).toBe("s");
    expect(await fs.stat("trash/p1-5/empty")).toBe("dir");
  });

  it("refuses to rename over an existing directory", async () => {
    await fs.mkdir("a");
    await fs.mkdir("b");
    await expect(fs.rename("a", "b")).rejects.toThrow();
  });

  it("removes files and directories, and a missing path is fine", async () => {
    await fs.writeText("x/y.txt", "y");
    await fs.remove("x/y.txt");
    expect(await fs.stat("x/y.txt")).toBeNull();
    await fs.writeText("x/z/w.txt", "w");
    await fs.remove("x");
    expect(await fs.stat("x")).toBeNull();
    await fs.remove("never");
  });
});

describe("localStorage persistence", () => {
  it("a second store on the same storage sees the files", async () => {
    const storage = new FakeStorage();
    const a = new MemoryFileStore({ storage });
    await writeJson(a, "profiles/p1/profile.json", { name: "נועה" });
    await a.mkdir("profiles/p1/saves");
    const b = new MemoryFileStore({ storage });
    expect((await readJson(b, "profiles/p1/profile.json")).data).toEqual({ name: "נועה" });
    expect(await b.stat("profiles/p1/saves")).toBe("dir");
  });
});

describe("Capacitor store", () => {
  it("writes in the app's data directory with a tmp file and a rename", async () => {
    fake.backing = new MemoryFileStore();
    fake.calls = [];
    const fs = new CapacitorFileStore();
    await writeJson(fs, "parent.json", { a: 1 });
    expect(fake.calls).toContain("writeFile parent.json.tmp");
    expect(fake.calls).toContain("rename parent.json.tmp parent.json");
    await fs.readText("parent.json");
    expect(fake.calls).toContain("readFile DATA parent.json");
  });
});

describe("data layout", () => {
  it("keeps the old file names (INVENTORY §7.1)", () => {
    expect(DATA_FILES.parent).toBe("parent.json");
    expect(DATA_FILES.usage).toBe("usage.json");
    expect(DATA_FILES.device).toBe("device.json");
    expect(DATA_FILES.appLog).toBe("nagmon/app_log.txt");
    expect(DATA_FILES.lastCrash).toBe("crash/last_crash.txt");
    expect(DATA_FILES.profile("p1a2b3")).toBe("profiles/p1a2b3/profile.json");
    expect(DATA_FILES.learning("p1a2b3")).toBe("profiles/p1a2b3/learning.json");
    expect(DATA_FILES.saves("p1a2b3")).toBe("profiles/p1a2b3/saves");
    expect(DATA_FILES.owlLog("p1a2b3")).toBe("profiles/p1a2b3/owl_log.jsonl");
  });
});
