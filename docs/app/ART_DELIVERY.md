# Art delivery: private, lazy packs

Status: **spec, nothing built yet.** Everything below is a plan. Statements about
what exists in the code were read from `nagmon-app` at `d3cc775`. Statements about
GitHub, Capacitor and Android behaviour that were not verified on a device are
marked **(verify)**; slice A1 starts with a spike that settles them.

Two requests, one design:

1. The APK keeps growing. Heavy assets become **lazy**: the app downloads only what
   the stage in front of the child needs, and shows something useful while it waits.
2. Every picture **we made** (ChatGPT-generated: people, creatures, backdrops, effects,
   UI kit, story cards, title, cat) leaves the public repo and the APK, lives in a
   **private** repo, and is loaded from there at run time. It is the family's
   copyright. Third-party assets (Tuxemon and other CC art, music, Twemoji) stay public.

Builds on: `tools/app/art2.py` and `app/public/game/art/manifest.json` (72 entries,
format in `docs/app/ART_ASSETS.md`), `app/src/game/art.ts` (`artUrl`, `backdropFor`),
`app/src/core/fieldData/` (GitHub client, private-repo guard, secrets in
`app/src/platform/secrets.ts`). Branch `app/art-import-3` currently adds only
`tools/app/art3_key.py` (matte keyer, no manifest change), so the plan builds on the
art2 manifest and adds to it; it does not fight art3.

---

## 0. Decisions in one table

| Topic | Decision |
|---|---|
| Where packs live | **GitHub Releases** of a private repo, one zip per pack version, plus one small `catalog.json` asset. Not files in git. |
| Which private repo | Recommended: a **new** private repo `YuvalNag/nagmon-art`, not `nagmon-data` (see 3.1 and open question 1). Repo name is configurable; default can stay `nagmon-data` if the parent insists. |
| Token | A second, **read-only** fine-grained token (Contents: read, that one repo only), own secret key `github.artToken`. Never the upload token. |
| Download | A small **native Android plugin** (`ArtPacks`): streams to disk, follows the redirect without the token, resumes with `Range`, hashes while streaming, unzips natively. JS fallback for browser/dev. |
| Serving to Phaser/React | Files in the app's private files dir, loaded through `Capacitor.convertFileSrc` (same origin `https://localhost`). One resolver `art.url(id)`; no raw `game/art/...` strings in code. |
| Never-broken rule | The APK ships a **placeholder set** (flat shapes and emoji, same ids and frame sizes as the real art). No token, no network, no download yet: the game still looks finished. |
| Packs | `core` (always), one pack per chapter/zone group, `fx`, `story` optional. Each pack has version, size, sha256, deps, priority. |
| Wait screen | Bundled, art-free explainer for the stage (CSS animation, tips, facts); optional video generated on device from core art. Background pre-download of the next chapter. |
| CI | Public CI builds **without** the family's art and tests against a small **synthetic test pack** committed to the repo. |
| History | Move first, rewrite last. Recommended end state: `git filter-repo` once, after all branches are merged, then force-push and a GitHub support request to purge. Making the whole repo private is the fallback. |

---

## 1. What is in the public repo today (inventory)

Measured with `du` on `app/public/game` (30 MB total, 30 MB = 10,092 + 7,772 + 6,304
+ 1,936 + 1,880 + 896 KB + small files).

### 1.1 The family's art (moves to the private repo)

Rule used by `tools/app/credits.py::_is_owner_art`: everything under
`app/public/game/art/`, and `mods/nagmon/` files named `nagmon_*`, under `/owl/`, or
under `gfx/sprites/battle/`. Credits shows these as "the Nagmon owner (made with image
generators), licence not stated yet".

| Path (under `app/public/game/`) | What | Files | Size |
|---|---|---|---|
| `art/backdrops, effects, effects_additive, ui, story, title, poses, portraits, enemy_parts, cat` + `art/manifest.json` | batch 2 (WebP, manifest) | 72 | 7.8 MB |
| `sprites/monsters/*-sheet.png` | all 70 creature sheets (`mods/nagmon/gfx/sprites/battle/` is owner art by the credits rule; the older doc says 12 Nagmon + 29 Tuxemon, the credits rule and the 70 files now present say all are ours, **confirm in A0**) | 70 | 2.5 MB |
| `sprites/npc/nagmon_*.png` | heroes (boy, girl, curly), owl, owl caped, owl space, Mila, Granite, granny, sage, teacher, shopkeeper, tourist... | 20 | 5.7 MB |
| `sprites/portraits/nagmon_*.png` | dialog portraits | 17 | 1.2 MB |
| `avatars/{boy_blue,girl_curly,girl_teal}.png` | "Nagmon HD" avatars | 3 | 0.1 MB |
| `sprites/items/nagmon_badge_*.png` | badges | 2 | tiny |
| `atlas/nagmon_*.png` and `atlas/solar_*.png` (map sheets) | **mixed**: the layout is ours, the tiles are xBRZ x4 copies of Tuxemon CORES (CC BY-SA 4.0, share-alike). See 1.3. | 14 | ~0.7 MB |
| **Subtotal that clearly moves** | | ~184 | **~17.3 MB** (57%) |

Also in the public repo but outside the APK (the larger leak, because it is in git
history and clones): `mods/nagmon/gfx/` (58 MB: owl sheets, intro frames, solar, sprites),
`art_sources/` (48 MB: `intro.mp4`, owl, teachers, hero/girl/Granite PNGs, `batch3/` 11 MB),
and the `tools/art/` manifest with source hashes (hashes are harmless; file names are
not secret). Repo packed size is 172 MB over 548 commits; most of it is this art.

### 1.2 Third-party (stays public)

| Path | Licence / source | Size |
|---|---|---|
| `audio/music/*.ogg` (6 JRPG tracks) | Yubatake, CC BY 3.0 | 5.8 MB |
| `audio/sfx` | Tuxemon sounds, mixed CC; `mods/nagmon/sounds/battle/` is our own (OWN_SOUNDS, small) | 0.45 MB |
| `emoji/*.svg` | Twemoji, CC BY 4.0 | 1.9 MB |
| `sprites/ui/*` (battle interior, grass backgrounds, islands, HP bars, trays) | Tuxemon, CC0 / CC BY-SA | 0.6 MB |
| `sprites/animations/*` | Tuxemon technique/item/tileset animations, CC | 0.1 MB |
| `sprites/npc/rockitten.png` | Tuxemon | small |
| `atlas/classic_*` | HD xBRZ of Tuxemon core tilesets (CC BY-SA 4.0 share-alike) | ~0.2 MB |
| `maps/`, `db/`, `content/`, `i18n`, JSON | code and data (GPL-3.0); questions and Hebrew content are ours as text, not art | ~3.5 MB |
| `licenses/`, `credits.json`, Rubik font | licence texts | small |

`credits.json` (schema 2) lists 41 entries by section (Type Icons, Technique
Animations, CORES, Sounds, Battle Backgrounds, Item Animations, Items, Emoji, Music,
Tilesets, Tuxemon). Rule for the packer: **an asset whose credits entry names a
third-party licence never goes into a private pack.** The packer reads
`credits.json` and refuses (test-enforced) to include anything not marked owner art.

### 1.3 Grey zone: decide in A0

`atlas/solar_*.png`: composed by us, but built from CC BY-SA tiles. Share-alike
applies to the tiles, not to our map layout, yet the file is a derivative. Safest and
simplest: **keep them public** (they are credited in `credits.json` as CORES derivatives).
Same for the Tuxemon-derived `classic_*`. The packs then hold only art with no
attribution duty.

### 1.4 APK size, before and after (estimates)

Raw asset folder is measured; the APK numbers are **estimates** (no APK was measured
in this task; PNG/WebP/OGG barely compress, so APK assets about equal raw size).

| | Assets | + JS (Phaser chunk 1.4 MB, app) + Android libs | About |
|---|---|---|---|
| Today | 30 MB | ~4 MB | **~34 MB** |
| After A3 (family art out, placeholders in ~1 MB) | 30 - 17.3 + 1 = ~13.7 MB | ~4 MB | **~18 MB** |
| Optional A5b (music 5.8 MB as a public lazy pack) | ~7.9 MB | ~4 MB | **~12 MB** |

Why this matters beyond Play limits: the roadmap adds art (chapter packs, effects,
UI kit, new creatures); `BATTLE_V3.md` budgets +8 MB art and +3 MB audio. Without
lazy packs the APK would pass 50 MB within a few slices. Packs are not size-capped
by the APK.

---

## 2. (a) The pack model

### 2.1 Packs

| Pack id | Contents | When needed | Priority | Est. size |
|---|---|---|---|---|
| `core` | hero boy/girl/curly (map sheets, poses), owl + Mila portraits and map sheets, Hearthrock backdrop, UI kit (16 `ui_*`), logo, first creatures (the 3 starters + route 1 wild ones), badges, avatars | First launch, before the first map | 0 (blocking) | ~6 MB |
| `zone.<name>` for `moon`, `sun`, `rocky`, `giants`, `outer`, `station` | that zone's creatures, NPC sheets, backdrop, enemy parts for its subjects | Child nears the zone (see 5.3) | 10 | 2-5 MB each |
| `subject.<name>` for math, hebrew, english, science, logic, geometry | `enemy_parts`, attack effects (+ additive twin) of that subject | with the first zone that uses it | 20 | ~1 MB each |
| `ch.<name>` for later chapters (letters, numbers, harbor, shapes, puzzle, body, weather...) | creatures, NPCs, backdrops of that chapter, as the world grows | when the chapter unlocks | 30 | planned |
| `fx` | effects not used by the first battles (levelup, befriend, net variants) | idle download | 50 | ~1.3 MB |
| `story` | story cards, seasons, grey valley, color burst, title, intro video | idle download, before the cutscene that needs it | 60 | ~3 MB (+5 MB video) |

Rules:

- A pack is a unit of **download and replacement**, not of loading. Phaser still loads
  textures per scene from files that exist in the cache.
- Every asset id appears in exactly one pack. `core` may be depended on by all;
  dependencies are explicit (`needs: ["core"]`) and acyclic.
- Cap: **one pack zip <= 25 MB** (memory-safe on the JS fallback, well under
  any API limit); split a bigger one into `zone.sun.a/.b`.
- Names are stable ids; contents change by **version**.

### 2.2 The manifest gets two fields

The art2 manifest entry (`id, kind, file, size, frame, frames, ..., source`) gains:

```
"pack": "zone.moon",          // which pack ships it (default by kind + id prefix, see tools/art/packs.yaml)
"status": "accepted"          // accepted | draft  (default accepted; absent today)
```

`draft` assets are imported and listed but **not** packed for devices unless the
packer is run with `--include-draft` (parent's dev phone). A draft is replaced by an
`accepted` one at the same id, which bumps the pack version (delta update, 4.6). If
`app/art-import-3` or a later branch adds its own per-asset status first, adopt its
name and mapping instead; the packer reads one function `asset_status(entry)`.

Pack assignment lives in `tools/art/packs.yaml` (id -> pack by glob), **public**, ids
only, no pixels.

### 2.3 Pack zip format

`<pack>-<version>.zip`, method **STORE** (WebP/PNG/OGG are already compressed;
store = fast native unzip, no inflate cost), entries in sorted order, fixed timestamps
(reproducible: same input gives the same sha256). Inside: the files at their game
paths (`art/backdrops/moon.webp`...) plus `pack.json`:

```
{ "id": "zone.moon", "version": 3, "files": { "art/backdrops/moon.webp": {"size": 91234, "sha256": "..."} } }
```

### 2.4 The catalog

One small asset `catalog.json` on the release `art` (read first, always):

```
{ "schema": 1,
  "min_app": 12,                       // app build that can read this catalog
  "published": "2026-10-22T10:00:00Z",
  "packs": {
    "core":      { "version": 7, "file": "core-7.zip",      "asset_id": 1234567890, "size": 6291456,  "sha256": "...",
                   "needs": [], "priority": 0 },
    "zone.moon": { "version": 3, "file": "zone.moon-3.zip", "asset_id": 1234567891, "size": 3200100,  "sha256": "...",
                   "needs": ["core"], "priority": 10,
                   "ids": ["backdrop_moon", "creature_lunibble", "..."],
                   "from": { "2": { "file": "zone.moon-2to3.zip", "asset_id": 1234567899, "size": 41234, "sha256": "..." } } }
  } }
```

`ids` lets the app answer "which pack holds this id" without opening zips. `from`
holds optional **delta** packs (4.6). The asset id is written by the packer after
upload (two-step publish, 3.3), because the download endpoint needs the id, not the
name.

---

## 3. (b) Private repo layout, hosting and the packer

### 3.1 Which repo

- Recommended: **new private repo `YuvalNag/nagmon-art`**. Reason: a fine-grained
  token is scoped per repo and per permission, not per folder. `nagmon-data` holds
  `family/FAMILY.md` and the devices' logs and progress (children's names and
  progress). A read token that lives on a child's phone (extractable on a rooted phone
  or from a backup) must not read those. A dedicated art repo makes the blast radius
  "the art", which the token is meant to read anyway.
- The parent asked for "the private repo". If `nagmon-data` is kept, the minimum
  mitigation is: no `FAMILY.md` secrets that matter, and the art token is read-only
  (it still reads `devices/`). This is **open question 1**; code takes the repo from
  one constant (`ART_REPO`), like `DEFAULT_REPO` in `fieldData/github.ts`.
- Must be private. The app reuses the guard of `github.ts`: it refuses to download from a repo
  whose `GET /repos/{repo}` says `private: false` (a public art repo defeats the purpose).

---|---|---|---|
| Per-file limit | 2 GiB per asset (up to 1,000 assets per release) | **100 MB** per file via Contents API; 1 MB for JSON body via the "raw" media type is fine, bigger files need the blob API | 2 GB on free plans |
| History bloat | none (assets are outside git) | every art revision stays in `.git` forever; the repo grows like the public one did | pointer files; objects in LFS storage |
| Quota | no storage cap documented for release assets; download bandwidth not metered for normal use **(verify for private repos)** | repo size soft limit ~5 GB recommended | **1 GB storage + 1 GB/month bandwidth free**; a few phone installs of 30 MB packs would exhaust it |
| Replace one fixed picture | upload a new small delta pack; old versions remain downloadable for rollback | commit; clients need a manifest diff | commit |
| Atomic publish | upload zips first, upload `catalog.json` last, then the app sees the new set | multi-file commit is atomic | |
| App download | `GET /repos/{r}/releases/assets/{id}` with `Accept: application/octet-stream`, `Authorization: Bearer`, answers **302** to a short-lived signed URL on GitHub's asset CDN | `GET /repos/{r}/contents/{path}` with `Accept: application/vnd.github.raw+json` | needs the LFS batch API |
| Source of truth for art | zips only; **the original PNG packages stay local/off-GitHub** (they are ~100 MB; keep them in the parent's cloud drive) | the repo | |

Decision: **Releases**. Layout of the private repo:

```
README.md                     # what this is, private, how to publish (one command)
packs/packs.yaml              # copy of tools/art/packs.yaml at the published commit (ids only)
catalog/<date>.json           # history of published catalogs (text, small)
releases:
  art            (rolling)    -> catalog.json + every pack zip of the current set
  art-<yyyymmdd>-<n>          -> optional immutable snapshot of what a given app build expects
```

Keep **old pack versions as assets** of the rolling release for 3 versions (rollback
and phones that are mid-update). Pruning is a packer command (`--prune-old`).
The release is published (not draft): reading a draft needs write access.

Source images for packs are produced by the existing pipeline (`art2.py` writes WebP
and manifest). The new tool takes the **already-encoded** files and does not touch
pixels, so a pack never differs from what `art2.py --check` validated.

### 3.3 The packer: `tools/app/packs.py`, one command

```
python -m tools.app.packs publish            # build changed packs, upload, write catalog
python -m tools.app.packs build   --out dist/packs        # zips only, no network (also used by CI test)
python -m tools.app.packs verify              # download the catalog and every pack, check sha256 (read token)
python -m tools.app.packs dev-install --adb   # build and push into a connected phone's cache for testing
python -m tools.app.packs publish --include-draft --channel dev
```

`publish`:

1. Read `art/manifest.json`, `tools/art/packs.yaml`, `credits.json`. Fail if any
   asset has no pack, a pack is empty, a file is missing or its sha256 differs from
   the manifest (reuses `art2` validation), any file is third-party per credits, or a
   pack exceeds 25 MB.
2. Build each zip reproducibly. Pack version = previous published version + 1 only
   when the pack's content hash changed (hash of sorted `(path, sha256)`); unchanged
   packs keep their asset.
3. For a changed pack with a published previous version, also build the **delta**
   zip (only changed/added files + a `removed` list in `pack.json`), kept if it is
   under 50% of the full zip.
4. Upload with `gh release upload art <files>` (token from `GITHUB_TOKEN`, or
   `gh auth`). It is the parent's **upload** token, on the desktop only; never the
   phone's read token. If the release is missing, create it.
5. Read back asset ids (`gh api repos/.../releases/tags/art`), write `catalog.json`
   with ids, sizes, sha256, upload it last (replacing the old one with
   `--clobber`), save a copy as `catalog/<date>.json` in the repo.
6. Print one summary: packs changed, bytes uploaded, catalog sha256. Nothing prints
   a token.

Idempotent: a second run with no change uploads nothing. Dry run by default off;
`--dry-run` prints the plan.

---

## 4. (c) Runtime

### 4.1 Authentication

- The parent's area already stores a GitHub token under `SECRET_KEYS.githubToken`
  (Android Keystore AES-GCM, via `@aparajita/capacitor-secure-storage`). That token is a
  **write** token for uploads (the connect check in `uploads.ts` requires `permissions.push`).
- Add `SECRET_KEYS.artToken = "github.artToken"`: a **read-only** fine-grained token for
  the art repo. A new `ArtAuth` mirrors `connect()`: format `^github_pat_...$`
  (a classic `ghp_` token is refused, same regex as `FINE_GRAINED_RE`), `GET /repos/{ART_REPO}`
  must say `private: true` and `permissions.pull: true`; a token with `push: true`
  is **accepted but warned** ("this token can write; make a read-only one") in the
  parents' area. The existing writable-check must not be reused as is, since a
  read-only token would fail it.
- Fallback for a parent who does not want a token on the phone at all: **import from a
  file**: the parents' area has "Import art pack(s)": a file picker for the zips the
  packer's `build` made (sent over cable, drive or share). Same verify/unzip path;
  no network, no token. Useful for the first install and for offline testing.

### 4.2 First run, no token yet

What the child sees: **the whole game, in placeholder look** (4.3). No download UI,
no error, no mention of tokens. The child cannot trigger anything that needs the
parent.

What the parent sees: only in the parents' area (PIN-gated), a card "Pictures: not
connected" with steps: create the token (a 4-line how-to, text only), paste, "Download
core now". Nothing about this appears on the map or in battles.

When the token arrives and `core` finishes, the app swaps placeholders for real art
at the next scene start (never mid-battle), with the normal "new pictures arrived"
chime and no flicker (4.7).

### 4.3 Bundled placeholder set (not the family's art)

- Generated by `tools/app/placeholders.py` from the **same manifest**: for every art id
  it writes a PNG/WebP with the **same size, frame size, frame count and labels**, so
  code and Phaser frame configs are identical for placeholder and real art.
- Look: flat colour blocks per kind (backdrop = 2-3 horizontal bands in the zone's
  colour, creature = a rounded body shape in the subject colour with the Twemoji
  for its element centred, hero = a simple figure of circles and rectangles, owl =
  the Twemoji owl on a coloured disc, UI pieces = rounded rectangles). No
  generated-model artwork, no copy of the family's pictures, no likeness of a person.
- Paletted PNG with few colours, so each file is a few KB. Budget **<= 1.2 MB total**
  (checked by test); WebP lossless is allowed when smaller.
- Placeholders ship **in the APK** and also act as the **fallback for a failed or
  missing single file** in a real pack (never a broken-image icon).
- The credits screen lists them as "Nagmon placeholders (GPL-3.0)" so they are
  clearly the project's own simple art.

### 4.4 Storage and URL scheme

Cache location: the app's private internal files dir, `Directory.Data` at
`art/<pack>/<version>/...` (never external/shared storage, so no other app can read it,
and the backup rules already copy nothing: `allowBackup=false`, `dataExtractionRules`).
`art/state.json` records installed pack versions, last access time, sizes.

Loading options considered:

| Option | Verdict |
|---|---|
| **`Capacitor.convertFileSrc(path)`**: `https://localhost/_capacitor_file_/data/user/0/<app>/files/art/...`, served by Capacitor's local server into the WebView | **Chosen.** Same origin as the app, so no CORS and no canvas taint, works for `<img>`, CSS `url()`, `<audio>`, Phaser's XHR/Image loader, range requests for audio **(verify ranges)**. No bytes cross the JS bridge. |
| `file://` | Rejected: the page is `https://localhost`, so `file://` is cross-origin and mixed; WebView `allowFileAccess*` flags are off or deprecated. |
| Blob URLs from `Filesystem.readFile` | Fallback for the JS/web path only: `readFile` moves base64 over the bridge (+33%, one copy in JS heap); fine for a few KB, wasteful for 20 MB of textures. |
| Service worker + Cache API | Works on `https://localhost` in the Android WebView, and is how a PWA would do it, but adds a second storage system, eviction by the browser, and a SW update lifecycle. Not needed when the file server already exists. Candidate for the **browser/Playwright** build only. |
| Custom `shouldInterceptRequest` mapping `https://localhost/game/art/...` straight to cache files | Best long-term (code keeps writing `game/art/x`, zero path changes, instant fallback to placeholder on miss) but needs Java in `MainActivity` and tests. Plan B if `convertFileSrc` shows a problem **(verify)**; also a good A5 polish. |

Resolver (single seam, replaces raw paths):

```ts
// app/src/game/art.ts (changed)
artUrl(id): string        // real if installed, else the placeholder's bundled path
artState(id): "real" | "placeholder"
onArtChanged(cb)          // fired when a pack is installed or swapped
```

`artUrl` stays the entry point. Today it returns `game/${entry.file}` and a few call
sites hard-code paths (`BattleQuestion.tsx` uses `game/sprites/portraits/nagmon_owl.png`;
`mapGame.ts` builds NPC/hero sheet URLs; `IntroScreen`, `Stage`, `BefriendThrow`,
`styles.css` use art). A unit test greps `src/` for `game/(art|avatars|sprites/(monsters|npc|portraits))` string
literals and fails on any raw one. Sprites that are not in the art manifest today
(monsters, NPC, portraits, avatars) get **manifest entries in A2** (kind `creature`,
`npc`, `portrait`, `avatar`), generated from the existing files and `db/npcs.json`.

Performance at 60 fps: after the one-time load, a Phaser texture lives on the GPU; the
cache is never read during play. Loading happens in scene `preload` (same as now) with
progress, from local flash (tens of MB/s), so a zone's ~5 MB loads in well under a
second. Rules that keep the parent's phone at 60 fps: load a scene's textures before
it starts; `textures.remove` the previous zone's creature/backdrop textures when
leaving (GPU memory); decode big backdrops (1920x864) once; never fetch art from the
network in a frame. The existing perf log (`frameStats.ts`) gets one line per pack
load (ms, bytes) to prove it on the device.

### 4.5 Download manager (`ArtPacks`)

Native plugin (Java, `app/android/.../ArtPacksPlugin.java`) + TS service
`app/src/core/art/packs.ts`.

Native `download({assetId, repo, dest, expectedSha256, expectedSize, resumeFrom})`:

1. `GET https://api.github.com/repos/{repo}/releases/assets/{id}` with
   `Authorization: Bearer <token>` and `Accept: application/octet-stream`,
   `User-Agent`, `X-GitHub-Api-Version`; `setInstanceFollowRedirects(false)`.
2. Expect **302** with `Location` (a signed, short-lived URL on GitHub's asset CDN). Send
   the second GET to `Location` **without** the Authorization header, with
   `Range: bytes=<resumeFrom>-`. (A redirect that forwards the token to another host
   is a leak; the existing `github.ts` already sets `redirect: "error"` for the same
   reason.) A **200** instead of 302 is also handled: stream it.
3. Stream to `dest.part`, updating a `SHA-256` `MessageDigest` (on resume, re-hash the
   existing part first), emit progress events (bytes, total).
4. On finish: size and sha256 must equal the catalog's, else delete the part and fail
   `integrity`. Rename `.part` to `.zip`.
5. `unzip(zip, dir.tmp)` natively, verifying each file's size and sha256 from `pack.json`.
6. **Atomic swap**: write into `art/<pack>/<version>.tmp/`, `fsync`, rename to
   `art/<pack>/<version>/`, then rewrite `state.json` (write temp, rename), then delete
   the previous version directory only when no scene holds it (next app start or after
   the scene using it ends). A half-installed pack is never visible; a crash leaves
   either the old or the new set.

Why native: CORS on the redirect target and header stripping across hosts make a pure
`fetch` path fragile **(verify)**; `Filesystem.downloadFile` is deprecated since
Capacitor Filesystem 7.1 in favour of `@capacitor/file-transfer`, whose header and
redirect options for downloads I could not confirm from the docs available in this task
**(verify in the A1 spike; if it does everything above, use it instead of Java)**.
`@capacitor/filesystem` 8.1.4 is already a dependency.

Queue and policy (TS):

- One download at a time; queue ordered by `(priority, request time)`; `core` first,
  a **blocking** request (child at a locked stage) jumps the queue.
- **Wi-Fi only by default** (`ConnectivityManager`, not metered); a parents'-area
  switch "Allow mobile data". Core on mobile data is asked of the parent, never the
  child.
- Resume: partial `.part` files persist across app kills; retry with exponential
  backoff 5 s, 20 s, 60 s, then wait for connectivity/foreground (3 attempts per
  session, then idle until the child's next need or the parent's "Retry").
- Foreground behaviour: downloads run while the app is in the foreground (kids' play
  sessions are foreground; chapter packs are 2-5 MB so a wait is seconds on Wi-Fi). On
  `appStateChange` to background the transfer is **paused and resumable** (Android
  may kill a background process; no foreground service and no extra permissions are
  planned: the manifest check allows `INTERNET` only, `docs/app/SDD.md` section 10). WorkManager
  background download is **not** part of this plan; it needs `FOREGROUND_SERVICE_DATA_SYNC`
  or `RUN_USER_INITIATED_DATA_TRANSFER` and conflicts with the minimal-permissions rule.
- Storage quota: default cap **300 MB** for art (parent can lower); free-space check
  before each download (`StatFs`, need `size x 2.2` for part + unzip); a pack is
  refused with `no_space` in the parent's terms.
- Eviction (when over quota or space is low): never `core`; never packs for the
  chapter(s) the profile has unlocked; evict least-recently-used **optional** packs
  first (`story`, `fx`), then packs of finished chapters, oldest `last_used`. Evicted
  packs fall back to placeholders and re-download on demand.
- Integrity: sha256 of the zip (catalog) and of every file (`pack.json`), both streamed
  natively; verification runs again at install, never on every load (cost). A cached
  file that disappears or fails to decode is replaced by the placeholder at runtime
  and queues a repair of that pack.
- Rate limits: the REST API allows 5,000 requests per hour for an authenticated
  token; a check is 1-2 requests (`releases/tags/art`, or the asset list), a pack is
  1 request to the API plus the CDN fetch (CDN fetches are not API-counted).
  The app checks the catalog **at most once per 6 hours and at app start when on
  Wi-Fi**, with `If-None-Match` ETag (a 304 does not count against the primary
  limit). 403/429 with `X-RateLimit-Remaining: 0` maps to "later", never to "bad token"
  (same rule as `statusCode()` in `github.ts`).

### 4.6 Delta updates

- A pack has an integer `version`. A fixed picture changes a few files; the packer
  produces `<pack>-<from>to<to>.zip` containing only changed/added files plus
  `removed: [...]` in `pack.json` (a replaced 91 KB backdrop is a 91 KB update, not a
  3 MB one).
- The app installed `zone.moon@2`, the catalog says `3` and offers `from["2"]`: download
  that delta, build the new version directory by **hard-linking/copying unchanged
  files** from `@2` and applying the delta, verify against `pack.json` of v3, atomic
  swap. Without a matching delta (older than 3 versions, or delta over 50%) download
  the full zip.
- Updates are low priority and ask nothing of the child; applied at the next scene
  start. A replaced asset takes effect everywhere at once, because every user of the
  art goes through `artUrl`.

### 4.7 Switching from placeholder to real art without flicker

Phaser: `textures.exists(key)` is checked at scene start; a scene loads real art when
installed, else the placeholder under the **same key**. When a pack lands during a
scene, nothing changes until the next scene (or React screen) mount: no hot swap in
battle. React: `useArt(id)` reads `artUrl`, re-renders on `onArtChanged` only between
screens. This avoids layout jump (same frame sizes) and half-drawn sheets.

### 4.8 Offline

After install, everything runs offline from `Directory.Data`. The app never needs the
network to **play**; the token and network are needed only to install or update packs.
Offline with a pack missing: placeholders, and no wait screen (nothing to wait for).
The catalog is cached (`art/catalog.json`) and used offline to know sizes and names.

### 4.9 Failure states a child understands

The child never sees "download", "token", "error 403". Child-facing states:

| Situation | What the child sees | What the parent sees (parents' area) |
|---|---|---|
| Waiting for a pack, progress known | the wait screen (section 5) with a friendly progress bar made of the stage's emoji | pack, bytes, speed |
| No Wi-Fi, pack needed | the owl: "The trip needs the Wi-Fi. Let's do something else first!" + a big button "Play something else" (returns to the map; the stage door stays) | "Waiting for Wi-Fi: zone moon (3.2 MB)" + "Allow mobile data" |
| Failed 3 times | owl: "I couldn't get the pictures yet. Try again later!" + one button "Try again" | the failure code (`integrity`, `no_space`, `bad_token`, `offline`, `rate_limit`), no URL, no token |
| Token missing/expired (401) | **nothing**: placeholders, the game continues | red card "Art token expired" with the steps |
| Storage full | like "failed", no scary words | "Free 40 MB or lower the cache" |

Stage doors that need a missing pack open into the wait screen only when the child can
actually get it (token + connectivity); otherwise the stage plays with placeholders
(the gameplay is identical; only pictures differ). **Gameplay never blocks on art.**

---

## 5. (d) The wait screen

### 5.1 When it appears

Only when: a stage's pack is not installed, a download is possible (token, network),
and the estimated remaining time is over about 1.5 s. Under that, a plain 300 ms fade.
The screen is skippable by "play with placeholders now" held for 2 s (hidden from a
child by accident, visible as a small owl button), because **gameplay never blocks on
art** (4.9).

### 5.2 What plays (all bundled, none of it the family's art)

In priority order, picked by availability:

1. **Explainer card sequence** (default, ~0 KB art): 4-6 cards for the stage, each a
   CSS-animated scene built from Twemoji and simple shapes (the placeholder style):
   "What is Moon?" with a one-line fact, one tip for the subject the stage trains
   (for example "Counting craters: group in tens"), and a "who lives here" teaser
   using **creature names and element emoji, not their pictures**. Text in Hebrew and
   English from `i18n`, reviewed like other texts (`W1_HEBREW_REVIEW.md` process). Cards
   rotate every 6 s; tap to go on.
2. **Core-art mini story** (after `core` exists): an on-device **generated** 8-12 s
   animation (not a video file): Phaser/CSS tweens with the hero and the owl from the
   `core` pack walking along a stylised path toward the stage's emoji. Nothing is
   baked into a video; it is code plus art already in the cache.
3. **Optional short video** (only art-free): a 10-15 s WebM (<= 700 KB) made with
   simple vector motion (no model-generated art, no likeness), one per chapter, bundled.
   Not required for A1-A4; add only if the cards feel dull in the device test.

The mix: while `core` is missing (no real art at all) only 1 is used. Parents' language
setting and the child's profile level choose text depth (the language ladder).

### 5.3 Pre-download so the wait rarely happens

Triggers (all background, Wi-Fi only, low priority, one pack at a time, never during a
battle or a question):

- **Zone progress**: on finishing zone *k* of *n* in a chapter, queue the next chapter
  pack (for 5 zones: after zone 3).
- **Trip unlock**: when a trip/chapter unlocks (or its door appears on the map), queue
  that pack immediately.
- **Idle**: on the "who plays" screen and map idle for 20 s, charging or not, queue
  `fx` then `story`.
- **First install**: after `core`, queue the first chapter and the first zone silently.
- Only packs whose `needs` are installed; limited to packs for chapters the profile
  can reach next (`solar_missions` data supplies "reachable next").

### 5.4 Parents' area

- **Pictures** card: connected or not, installed packs with versions and sizes, free
  space, last update check, a button **Check for new pictures**, **Download everything
  now (Wi-Fi)** (queues all packs, shows total size and a confirm), **Allow mobile
  data**, cache cap slider, **Delete downloaded pictures** (back to placeholders),
  **Import from file**, token connect/replace/forget (shows only `***abcd`, as
  `maskedToken()` does for the upload token).
- The card shows status as text only (no thumbnails of the art are required).

---

## 6. (e) CI, build and tests

### 6.1 Public CI

- The public repo contains **no family art**: `app/public/game/art/**` (real files),
  `sprites/monsters`, `sprites/npc/nagmon_*`, `sprites/portraits`, `avatars`, `sprites/items/nagmon_*`
  are removed and git-ignored; `app/public/game/placeholders/**` replaces them in the APK.
- `app.yml` (`npm ci`, `typecheck`, `vitest`, `playwright`, then APK build) and
  `android.yml` run exactly as now; the APK is built with placeholders only. No art
  secret exists in public CI, and none is added: a fork or PR cannot read it.
- `tools/app/art2.py --check` and `credits.py` change: the manifest and its **hashes**
  remain public (ids, sizes, source hashes, no pixels), but file existence is checked only
  with `--with-files DIR` (local, where the art is). `tests/app/test_app_art2.py` splits into
  a **manifest-structure** test (public CI) and a **files-match** test (skipped unless
  `NAGMON_ART_DIR` is set).

### 6.2 Synthetic test pack (committed, small)

`app/tests/fixtures/artpack/` (about 150 KB):

- `catalog.json` + `core-1.zip`, `zone.test-1.zip`, `zone.test-2to...` (delta),
  a corrupt-sha pack, an oversized-declared pack, a pack with a missing file; zips
  built by `tools/app/packs.py build --synthetic` from generated flat-colour images
  with the **same ids and frame geometry** as the real manifest (the placeholder
  generator with a different seed, so tests catch geometry mistakes).
- Vitest: catalog parsing, dependency order, queue priority, resume (a fake fetch that
  drops the connection after N bytes), integrity failure, atomic swap and crash
  between steps, eviction rules, quota, Wi-Fi gating, error messages never contain
  the token or any URL with a query, delta apply, `artUrl` fallback.
- Python (`tests/app/test_app_packs.py`): packer determinism (same input, same sha256),
  refusal of third-party and over-sized packs, delta under 50%, catalog schema.

### 6.3 Playwright e2e

The browser build has no native plugin: a **JS fallback** `BrowserPacks` (fetch + `fflate`
unzip + Cache API or OPFS) implements the same interface `PackInstaller`. e2e starts
`vite preview` with `VITE_ART_BASE=/_fixtures/artpack/` pointing at the synthetic pack
served as static files (no GitHub, no token), and asserts: first run shows placeholders
and no download UI for the child; with the fixture "token" the core installs and
backdrop textures switch at the next scene; wait screen appears for a slow-served pack
(Playwright route with a delay) and disappears; offline (`context.setOffline`) keeps the
installed art; corrupt pack shows the child message and a parent code.
The existing `art.spec.ts` keeps working against the synthetic ids.

### 6.4 Developers with the real art locally

- Art lives in the private repo clone (`/home/user/nagmon-art` or `nagmon-data`) and in
  the packer's output. `NAGMON_ART_DIR=<dir with art/...>` makes dev/e2e builds serve
  the real files (a Vite plugin maps `/game/art/*` to that dir); nothing is committed.
- `npm run dev` with `VITE_ART_BASE` unset and `NAGMON_ART_DIR` set = real art in the browser.
- To test on a phone without token: `python -m tools.app.packs dev-install --adb`
  pushes zips to the app's files dir (debug build) and writes `state.json`.
- The screenshots in docs/storybook that need real art are produced locally, not in CI.

---

## 7. (f) The history problem

The family art is in public git history: 548 commits, 172 MB packed, including
`mods/nagmon/gfx/`, `art_sources/` (48 MB) and `app/public/game/{art,sprites,avatars}`.
Moving files forward does not remove them from history, forks or caches.

| Option | What it does | Pros | Cons / risks |
|---|---|---|---|
| (i) Leave history | stop adding art; old commits keep it | zero risk, zero work | the art stays public for anyone who clones; fails the "private" goal for existing art |
| (ii) `git filter-repo` + force-push | delete the art paths from all commits | removes it from the repo's branches and tags; shrinks clones | rewrites every SHA: every worktree (`/home/user/wt-*` ~25), every local branch and open PR breaks; GitHub keeps unreachable objects **and PR refs** (`refs/pull/*`) until GC or a support request; anyone who already cloned or forked still has copies; Actions caches and artifacts may hold files; release notes and Issues attachments unaffected |
| (iii) Make the repo private | nothing is public | immediate; no rewriting | the repo is a **public** Tuxemon fork and the plan assumes public CI. A private repo on a free plan has **2,000 Actions minutes/month** (Linux 1x), and the APK + emulator matrix run up to 150 minutes each, so it exhausts quickly; breaks the open-source/GPL posture (distribution to the family does not require publishing, but forks/network graph, Dependabot and Pages behave differently); already-made forks of a public repo are separate copies that stay |

**Recommendation: (i) now, (ii) at the end, (iii) only as the fallback.**

1. A1-A4 stop the bleeding (no new art enters public git).
2. After A4 is merged and all feature branches are merged or rebased (a quiet day),
   run **one** `git filter-repo` pass removing exactly the family-art paths listed in
   1.1 plus `art_sources/` and `mods/nagmon/gfx/{owl,intro,solar,sprites}`,
   with `--invert-paths`, on a fresh mirror clone, verify the tree, force-push all
   branches and tags, **then** the parent opens a GitHub Support request
   ("remove cached views and unreachable objects containing sensitive data") for
   `refs/pull/*` and gc. Re-create worktrees from the new `nagmon-app`.
3. Expect that **any existing clone or fork keeps the art**. Treat history cleanup as
   making the art no longer *casually discoverable*, not as a recall. The decision
   how hard to push depends on how sensitive the art is (open question 3: do the people
   pictures resemble the children?).
4. If the parent wants a stronger guarantee than that, go (iii): and budget the CI:
   run the APK/emulator jobs only on manual dispatch or on a self-hosted runner, keep
   unit/e2e on push (about 5 minutes).

The rewrite is **A5**, last and separate, with a backup (`git bundle` of the old repo
into the private repo's release, tagged `pre-filter-<date>`), because it cannot be
undone for collaborators.

---

## 8. (g) Privacy and safety

- **Two tokens, two secrets.** Upload token (read+write on `nagmon-data`, already in
  the app) and the new **art token** (fine-grained, **Contents: Read** on `nagmon-art`
  only, expiry set to the maximum, reminder 14 days before it). The app uses the art
  token only for downloads, the upload token only for uploads. A pasted art token
  with write permission is accepted but flagged; one for a **public** repo, or a classic
  `ghp_`, is refused.
- The packer's upload credential (`gh auth` or `GITHUB_TOKEN` with `Contents: write`
  on the art repo) lives **only on the desktop**.
- Token handling copies `github.ts`: private field `#token`, `toString` prints `token=***`,
  `redirect: "error"` for API calls, only the method, path and status are logged. In
  the native plugin the token is passed per call from JS (read from secure storage),
  never stored natively, never logged; Java logging of URLs is off; the **signed CDN
  URL is never logged or surfaced** (it is short-lived but bearer-like). Errors carry a
  `Code` (`bad_token`, `no_permission`, `not_found`, `offline`, `timeout`, `rate_limit`,
  `integrity`, `no_space`, `failed`) and no URL or body. Add the art token to
  `SecretStore.values()` so the redaction in logs/reports hides it, as for the others.
- The token never goes in the APK, never in public CI, never in `capacitor.config`.
- Private cache: internal storage only; backups copy nothing (existing rules); the
  cache is not a security boundary (a rooted phone reads it), the same as the APK.
- Integrity guards against a swapped or truncated download, not against a malicious
  catalog: the catalog is fetched with the token over TLS from the private repo; the
  app additionally checks `catalog.min_app`, pack names `^[a-z0-9._-]+$`, and
  **zip-slip** (no `..`, no absolute paths, only paths under the pack's declared file
  list); only image/audio/json extensions are written; size caps per file and per pack.
- The repo-private check (`private: true`) runs before the first download and then at most daily.
- No analytics: download results go to the app log and to the parent's reports in the
  existing field-data flow only.
- If `nagmon-data` is kept for art: the read token can read `family/` and `devices/`.
  See 3.1.

---

## 9. (h) Migration plan

Order and rollback. Each slice is a branch `app/art-delivery-aN`, TDD, CI green, reviewed
by a separate agent, storybook and `VERSION` updated as in `CLAUDE.md`.

| Slice | What | Effort | Acceptance tests | Rollback |
|---|---|---|---|---|
| **A0** (docs, 0.5 d) | Parent's decisions (section 10), confirm owner vs third-party list (1.1, 1.3), create the private art repo and the read-only token | 0.5 d + parent | Parent answers; list checked against `credits.json` | none needed |
| **A1** (first, small, 2 d) | **Manifest + resolver + placeholders, nothing moves yet.** Add `pack` and `status` to the manifest; manifest entries for monsters/NPC/portraits/avatars; `tools/app/placeholders.py`; `artUrl` returns real if present else placeholder; lint test that forbids raw paths; **no download code, no repo change, art still in git** | 2 d | Vitest: every id has a placeholder with identical size/frames; placeholder total <= 1.2 MB; grep test finds zero raw art paths; Playwright: delete real files from a test build and the game still plays; screenshot diff shows placeholders | revert the branch (additive) |
| **A2** (3 d) | `tools/app/packs.py build/publish/verify`, `packs.yaml`, catalog, synthetic test pack; first real publish to the private repo (parent runs one command); `verify` downloads and checks sha256 | 3 d | pytest determinism, third-party refusal, delta size; `verify` green against the real release; the packer fails on a missing file | delete the release; nothing in the app uses it yet |
| **A3** (4 d) | Runtime: `ArtAuth`, `packs.ts` (queue, state, eviction, integrity), `ArtPacks` Java plugin (or file-transfer), `convertFileSrc` loading, parents' area card, import-from-file; **core pack only**; the APK still ships the real art so nothing can regress | 4 d | Vitest queue/resume/atomic swap/eviction/redaction; Playwright fixture-pack flow; **device**: core installs on the Poco F3, 60 fps log unchanged (`frameStats`), airplane-mode keeps art, app kill mid-download resumes | feature flag `artDelivery` off = old paths |
| **A4** (3 d) | **Cut over:** remove family art from `app/public/game` and the APK; chapter/zone/subject/fx/story packs; wait screen v1 (cards); pre-download triggers; "download all"; credits/INDEPENDENCE docs update | 3 d | APK size check in CI (<= 22 MB); public CI builds without art; e2e: first run placeholders only; zone door with a slow pack shows the wait screen then real art; **device checklist** | A3's flag back on + `git revert` of the removal commit (art is still in history) |
| **A5** (1 d + waiting) | History rewrite (section 7), git bundle backup, worktrees recreated; optional A5b: music as a public lazy pack and the generated mini story; optional video | 1 d | fresh clone has no family art paths; `git count-objects` smaller; CI green; GitHub support ticket filed | restore from the bundle |

The **first slice to build next is A1**: it is additive, needs no token or repo change,
removes the biggest risk (the app looking broken without art), and every later slice
depends on its resolver and placeholders.

---

## 10. (i) Risks and open questions for the parent (max 6)

1. **Which private repo?** `nagmon-data` already holds family details and device logs,
   and the phone would hold a read token to it. *Recommended default:* a new private repo
   `YuvalNag/nagmon-art` for the art, read-only token for that repo only.
2. **Wi-Fi only?** *Default:* Wi-Fi only, with a parents'-area switch for mobile data;
   `core` (~6 MB) may also be fetched on mobile data once if the parent confirms.
3. **How sensitive is the existing art, and how hard to purge history?** (do the
   people pictures look like the children?) *Default:* do the migration (A1-A4), then
   the one-time history rewrite (A5) plus the GitHub support request; accept that
   old clones and forks keep copies. Make the whole repo private only if the answer is
   "very sensitive" (costs CI minutes).
4. **Grey zone art:** `atlas/solar_*` and the town sheets are our layout over CC BY-SA
   tiles. *Default:* keep them public with attribution (no loss of privacy of the
   family's creations); only art with no third-party licence moves.
5. **Token lifetime and who maintains it.** A fine-grained token expires (max 1 year).
   *Default:* maximum expiry plus an in-app reminder 14 days before; the parents' area
   has a one-tap re-paste; "Import from file" always works as the backup path.
6. **Licence for the owner art** (`licence: not stated yet` in `credits.json`). It does
   not block this work, but once the art is private the credits screen should say
   "All rights reserved, the family" instead of "not stated yet". *Default:* all
   rights reserved, shown in credits.

Technical risks (not parent decisions): (a) `convertFileSrc` or file-transfer
behaviour on the target WebView (range requests, header/redirect handling) is
unverified: A1/A3 spike first, with plan B in the table in 4.4; (b) a native plugin adds
Java to maintain and test (Android Lint and the manifest check must stay green, and
no new permission is needed); (c) the pack count grows with the world, so keep the
catalog small and packs under 25 MB; (d) a first install with no token looks like a
placeholder game: acceptable by design, but the parent must be told in the release notes.

---

## 11. Facts used and where they came from

- Sizes: `du` on `app/public/game` of `nagmon-app` at `d3cc775` (sprites 10,092 KB,
  art 7,772 KB, audio 6,304 KB, content 1,936 KB, emoji 1,880 KB, atlas 896 KB).
  Repo packed size from `git count-objects -vH` (172 MB, 548 commits).
- Owner-art rule: `tools/app/credits.py::_is_owner_art`; third-party: `credits.json`
  schema 2 sections, `docs/app/INVENTORY.md` sections 6-7.
- Existing GitHub client behaviour (private guard, fine-grained token regex, no-redirect,
  redaction): `app/src/core/fieldData/github.ts`, `uploads.ts`; secrets: `app/src/platform/secrets.ts`.
- GitHub: release-asset download uses the asset **id** with `Accept: application/octet-stream`
  and a fine-grained token with **Contents: read**; clients must handle 302 or 200
  (GitHub REST docs, "Get a release asset", via search; the page itself could not be
  fetched in this task). Release asset limits (2 GiB per asset), the 100 MB Contents-API
  file limit, the 5,000 requests/hour authenticated limit and the 2,000 free private
  Actions minutes are from memory of GitHub's documentation: **re-check before relying on
  the exact numbers**.
- Capacitor: Filesystem `downloadFile` deprecated in 7.1.0 in favour of
  `@capacitor/file-transfer` (Capacitor docs via search); `convertFileSrc` serves local
  files to `<img>`/`<video>`/`fetch`. File-access, range and header behaviour: **(verify)**.
- Play base-module size limit: see `BATTLE_V3.md` section on the APK size budget (200 MB or
  500 MB, check the live page).
