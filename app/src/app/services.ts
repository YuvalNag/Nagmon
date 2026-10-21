import { AVATAR_KEYS } from "../core/family/avatars";
import { ParentStore } from "../core/family/parent";
import { ProfileStore } from "../core/family/profiles";
import { FieldData } from "../core/fieldData/uploads";
import { FieldLog } from "../core/game/fieldLog";
import { Reports } from "../core/report/reports";
import { appLogText, buildInfo, getLogger } from "../platform/appLog";
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
  /** The "something is wrong" reports from the game, kept on the phone until the parents send them. */
  reports: Reports;
}

export async function openServices(
  fs: FileStore = createFileStore(),
  secrets: SecretStore = new MemorySecretStore(),
): Promise<Services> {
  const profiles = new ProfileStore(fs, { avatars: AVATAR_KEYS });
  const log = getLogger("nagmon.field_data");
  const reports = new Reports({
    fs,
    field: new FieldLog(getLogger("nagmon.field")),
    build: buildInfo,
    log: appLogText,
    names: () => profiles.allNames(),
  });
  return {
    fs,
    profiles,
    parent: await ParentStore.open(fs),
    secrets,
    fieldData: new FieldData({ fs, secrets, names: () => profiles.allNames(), log: (m) => log.info(m), reports }),
    reports,
  };
}
