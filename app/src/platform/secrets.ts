/**
 * Secrets: the GitHub token and the AI keys. They never go into a JSON
 * file (the old app kept them in `secrets.json`, mode 0600), never into a
 * log, a report or a printed object.
 *
 * - On Android: {@link KeystoreSecretStore}, @aparajita/capacitor-secure-storage.
 *   Each value is encrypted with an AES-GCM key held by the Android
 *   Keystore; only the ciphertext is in the app's SharedPreferences.
 * - In the browser: {@link MemorySecretStore}. Secrets last until the page
 *   closes. On purpose there is no localStorage fallback, not even in
 *   development builds: localStorage is plain text on disk, and the
 *   plugin's own web implementation uses it, so the plugin is only called
 *   on a native platform.
 */
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { Capacitor } from "@capacitor/core";

/** The names secrets are stored under. */
export const SECRET_KEYS = {
  githubToken: "github.token",
  /** One key per AI provider, e.g. `aiKey("groq")`. */
  aiKey: (provider: string) => `ai_key.${provider}`,
} as const;

export interface SecretStore {
  /** The secret, or `null` when none is stored. */
  get(name: string): Promise<string | null>;
  /** Stores a secret (trimmed); an empty value throws. */
  set(name: string, value: string): Promise<void>;
  /** Forgets one secret; a missing one is fine. */
  remove(name: string): Promise<void>;
  /** The names of the stored secrets. */
  names(): Promise<string[]>;
  /** Every stored value, for hiding them in logs and reports. */
  values(): Promise<string[]>;
  /** Forgets every secret of this app. */
  clear(): Promise<void>;
}

function clean(value: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error("empty secret");
  return v;
}

/** Secrets in memory only: the browser, and tests. */
export class MemorySecretStore implements SecretStore {
  // A true private field: not shown by console.log, JSON or spread.
  #values = new Map<string, string>();

  async get(name: string): Promise<string | null> {
    return this.#values.get(name) ?? null;
  }

  async set(name: string, value: string): Promise<void> {
    this.#values.set(name, clean(value));
  }

  async remove(name: string): Promise<void> {
    this.#values.delete(name);
  }

  async names(): Promise<string[]> {
    return [...this.#values.keys()];
  }

  async values(): Promise<string[]> {
    return [...this.#values.values()];
  }

  async clear(): Promise<void> {
    this.#values.clear();
  }

  toString(): string {
    return `MemorySecretStore(${this.#values.size} secrets)`;
  }

  toJSON(): string {
    return this.toString();
  }
}

/** Our own prefix: the plugin's default is shared with other plugins. */
const KEY_PREFIX = "nagmon_";

/** Secrets in Android Keystore-backed storage. */
export class KeystoreSecretStore implements SecretStore {
  #ready: Promise<void> | null = null;

  private ready(): Promise<void> {
    // On failure, the next call tries again instead of failing forever.
    this.#ready ??= SecureStorage.setKeyPrefix(KEY_PREFIX).catch((e: unknown) => {
      this.#ready = null;
      throw e;
    });
    return this.#ready;
  }

  async get(name: string): Promise<string | null> {
    await this.ready();
    return SecureStorage.getItem(name);
  }

  async set(name: string, value: string): Promise<void> {
    const v = clean(value);
    await this.ready();
    await SecureStorage.setItem(name, v);
  }

  async remove(name: string): Promise<void> {
    await this.ready();
    await SecureStorage.removeItem(name);
  }

  async names(): Promise<string[]> {
    await this.ready();
    return SecureStorage.keys();
  }

  async values(): Promise<string[]> {
    const out: string[] = [];
    for (const name of await this.names()) {
      const v = await this.get(name);
      if (v) out.push(v);
    }
    return out;
  }

  async clear(): Promise<void> {
    // Only our prefixed keys, never the whole store.
    for (const name of await this.names()) await this.remove(name);
  }

  toString(): string {
    return "KeystoreSecretStore";
  }

  toJSON(): string {
    return this.toString();
  }
}

/** The secret store for this platform. */
export function createSecretStore(): SecretStore {
  return Capacitor.isNativePlatform() ? new KeystoreSecretStore() : new MemorySecretStore();
}
