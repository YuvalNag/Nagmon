import { AVATAR_KEYS } from "../core/family/avatars";
import { ParentStore } from "../core/family/parent";
import { ProfileStore } from "../core/family/profiles";
import { FieldData } from "../core/fieldData/uploads";
import { getLogger } from "../platform/appLog";
import { MemorySecretStore, type SecretStore } from "../platform/secrets";
import { createFileStore, type FileStore } from "../platform/storage";

/** Everything the screens read and write, opened once at start. */
export interface Services {
  fs: FileStore;
  profiles: ProfileStore;
  parent: ParentStore;
  /** The GitHub token and the AI keys (Android's Keystore on the phone). */
  secrets: SecretStore;
  /** The private data repo: the token's check and the uploads. */
  fieldData: FieldData;
}

export async function openServices(
  fs: FileStore = createFileStore(),
  secrets: SecretStore = new MemorySecretStore(),
): Promise<Services> {
  const profiles = new ProfileStore(fs, { avatars: AVATAR_KEYS });
  const log = getLogger("nagmon.field_data");
  return {
    fs,
    profiles,
    parent: await ParentStore.open(fs),
    secrets,
    fieldData: new FieldData({ fs, secrets, names: () => profiles.allNames(), log: (m) => log.info(m) }),
  };
}
