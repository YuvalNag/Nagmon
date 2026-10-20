import { AVATAR_KEYS } from "../core/family/avatars";
import { ParentStore } from "../core/family/parent";
import { ProfileStore } from "../core/family/profiles";
import { createFileStore, type FileStore } from "../platform/storage";

/** Everything the screens read and write, opened once at start. */
export interface Services {
  fs: FileStore;
  profiles: ProfileStore;
  parent: ParentStore;
}

export async function openServices(fs: FileStore = createFileStore()): Promise<Services> {
  return {
    fs,
    profiles: new ProfileStore(fs, { avatars: AVATAR_KEYS }),
    parent: await ParentStore.open(fs),
  };
}
