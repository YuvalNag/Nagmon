/**
 * Secrets (the GitHub token, AI keys): never in a JSON file, never shown.
 * The memory store is the browser's; the Keystore store is the phone's,
 * checked here through a fake plugin.
 */
import { describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => {
  const items = new Map<string, string>();
  const state = { prefix: "capacitor-storage_", calls: [] as string[] };
  return { items, state };
});

vi.mock("@aparajita/capacitor-secure-storage", () => ({
  SecureStorage: {
    async setKeyPrefix(prefix: string) {
      plugin.state.calls.push(`prefix ${prefix}`);
      plugin.state.prefix = prefix;
    },
    async getItem(key: string) {
      return plugin.items.get(plugin.state.prefix + key) ?? null;
    },
    async setItem(key: string, value: string) {
      plugin.items.set(plugin.state.prefix + key, value);
    },
    async removeItem(key: string) {
      plugin.items.delete(plugin.state.prefix + key);
    },
    async keys() {
      return [...plugin.items.keys()]
        .filter((k) => k.startsWith(plugin.state.prefix))
        .map((k) => k.slice(plugin.state.prefix.length));
    },
  },
}));

const { KeystoreSecretStore, MemorySecretStore, SECRET_KEYS, createSecretStore } = await import(
  "../../../src/platform/secrets"
);

const TOKEN = "github_pat_TEST" + "1234567890abcdef".repeat(2);

describe.each([
  ["memory", () => new MemorySecretStore()],
  ["keystore", () => new KeystoreSecretStore()],
])("secret store (%s)", (_label, make) => {
  it("keeps, lists and forgets a secret", async () => {
    const s = make();
    await s.clear();
    expect(await s.get(SECRET_KEYS.githubToken)).toBeNull();
    await s.set(SECRET_KEYS.githubToken, `  ${TOKEN} `);
    await s.set(SECRET_KEYS.aiKey("groq"), "gsk_TESTabcdefabcdefabcdef");
    expect(await s.get(SECRET_KEYS.githubToken)).toBe(TOKEN);
    expect((await s.names()).sort()).toEqual(["ai_key.groq", "github.token"]);
    expect((await s.values()).sort()).toEqual([TOKEN, "gsk_TESTabcdefabcdefabcdef"]);
    await s.remove(SECRET_KEYS.githubToken);
    expect(await s.get(SECRET_KEYS.githubToken)).toBeNull();
    await s.remove(SECRET_KEYS.githubToken); // twice is fine
    await s.clear();
    expect(await s.names()).toEqual([]);
  });

  it("refuses an empty secret", async () => {
    const s = make();
    await expect(s.set(SECRET_KEYS.githubToken, "   ")).rejects.toThrow();
  });

  it("never shows a secret when printed", async () => {
    const s = make();
    await s.set(SECRET_KEYS.githubToken, TOKEN);
    expect(String(s)).not.toContain("TEST");
    expect(JSON.stringify(s)).not.toContain("TEST");
    expect(JSON.stringify({ s })).not.toContain("TEST");
    await s.clear();
  });
});

describe("keystore store", () => {
  it("uses its own key prefix, never the shared default", async () => {
    const s = new KeystoreSecretStore();
    await s.set(SECRET_KEYS.githubToken, TOKEN);
    expect(plugin.state.calls[0]).toBe("prefix nagmon_");
    expect([...plugin.items.keys()]).toEqual(["nagmon_github.token"]);
    await s.clear();
  });
});

describe("createSecretStore", () => {
  it("is memory-only in the browser (never localStorage)", async () => {
    localStorage.clear();
    const s = createSecretStore();
    expect(s).toBeInstanceOf(MemorySecretStore);
    await s.set(SECRET_KEYS.githubToken, TOKEN);
    expect(JSON.stringify({ ...localStorage })).not.toContain("TEST");
  });
});
