import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { currentMap, setCurrentMap } from "../../game/current";
import type { MapController, MapLifecycle } from "../../game/mapGame";
import { gameClock } from "../../platform/lifecycle";
import { t } from "../../i18n";
import { getLogger } from "../../platform/appLog";
import { DPad } from "../DPad";
import { DpadState } from "../dpadState";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";

const log = getLogger("nagmon.map");

/** How long the "closed way" note stays up. */
export const NOTE_MS = 3500;
/** CSS px kept clear between the d-pad and the hero. */
export const PAD_GAP = 8;

type Load = () => Promise<typeof import("../../game/mapGame")>;

// Phaser is fetched only when a map opens: "who plays" starts without it
const loadGame: Load = () => import("../../game/mapGame");

interface Props {
  name: string;
  avatar: string;
  /** Back to "who plays". */
  onExit: () => void;
  /** Android's back button on the map: App calls it (it opens or closes the menu). */
  backRef: MutableRefObject<(() => void) | null>;
  /** The app's lifecycle: the map pauses in the background. */
  lifecycle?: MapLifecycle;
  load?: Load;
}

type Debuggable = Window & { __nagmonMap?: MapController };

/**
 * The map (milestone M3): the Phaser scene fills the screen, the d-pad
 * sits at the bottom left, and the menu button at the top. The menu (and
 * Android's back) pauses the game: continue, or back to "who plays".
 */
export function MapScreen({ name, avatar, onExit, backRef, lifecycle, load = loadGame }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const [dpad] = useState(() => new DpadState());
  const [ctl, setCtl] = useState<MapController | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [menu, setMenu] = useState(0);
  const [note, setNote] = useState(0);
  const menuOpen = menu > 0;

  useEffect(() => {
    let alive = true;
    let controller: MapController | null = null;
    load().then(
      ({ startMap }) => {
        if (!alive || !stage.current) return;
        controller = startMap({
          parent: stage.current,
          avatar,
          lifecycle,
          clock: () => gameClock.now(),
          input: () => dpad.take(),
          release: () => dpad.clear(),
          // the camera keeps the hero right of the d-pad (bottom left)
          reservedLeft: () => {
            const pad = stage.current?.parentElement?.querySelector(".dpad");
            return pad ? pad.getBoundingClientRect().right + PAD_GAP : 0;
          },
          onBlocked: () => setNote((n) => n + 1),
          onReady: () => alive && setStatus("ready"),
          onError: () => alive && setStatus("failed"),
        });
        setCurrentMap(controller);
        // the browser tests and the emulator check read the map through it
        (window as Debuggable).__nagmonMap = controller;
        setCtl(controller);
      },
      (e) => {
        log.error("Could not load the map's code", e);
        if (alive) setStatus("failed");
      },
    );
    return () => {
      alive = false;
      controller?.destroy();
      if (currentMap() === controller) setCurrentMap(null);
      if ((window as Debuggable).__nagmonMap === controller) delete (window as Debuggable).__nagmonMap;
    };
  }, [avatar, dpad, load, lifecycle]);

  const openMenu = useCallback(() => {
    dpad.clear();
    setMenu((m) => (m > 0 ? m : m + 1));
  }, [dpad]);

  const closeMenu = useCallback(() => setMenu(0), []);

  // the menu holds the game still (the loop and the music), even one opened while it loaded
  useEffect(() => {
    if (!ctl || !menuOpen) return;
    ctl.pause("menu");
    return () => ctl.resume("menu");
  }, [ctl, menuOpen]);

  // Android's back: the menu, and back again closes it (one step back each time)
  useEffect(() => {
    // on "the map did not open" it is the way back, as the overlay's button
    backRef.current = () => (status === "failed" ? onExit() : menuOpen ? closeMenu() : openMenu());
    return () => {
      backRef.current = null;
    };
  }, [backRef, menuOpen, openMenu, closeMenu, status, onExit]);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(0), NOTE_MS);
    return () => clearTimeout(timer);
  }, [note]);

  return (
    <main className="screen map-screen" data-screen="play" data-map={status}>
      <div ref={stage} className="map-stage" data-id="map_stage" />
      {status === "loading" && <p className="map-loading">{t("mapLoading")}</p>}
      {status === "failed" && (
        <div className="map-overlay" data-screen="map-failed">
          <p className="notice">{t("mapFailed")}</p>
          <Tap id="map_back" className="primary" onTap={onExit}>
            {t("mapToWhoPlays")}
          </Tap>
        </div>
      )}
      {status === "ready" && !menuOpen && (
        // a new screen for the fingers: a press from before the map (or on
        // the menu's "continue") counts for nothing. Under the menu the map's
        // own buttons are gone, not just covered: a finger or TalkBack finds
        // only the menu's.
        <ScreenTime key="map-ready">
          <div className="map-hud">
            <span className="map-name">{name}</span>
            <Tap id="map_menu" className="map-menu" aria-label={t("mapMenu")} disabled={menuOpen} onTap={openMenu}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            </Tap>
          </div>
          {note > 0 && (
            <p className="map-note" role="status" data-id="map_note">
              {t("mapClosedWay")}
            </p>
          )}
          <DPad state={dpad} disabled={menuOpen} />
        </ScreenTime>
      )}
      {menuOpen && (
        <ScreenTime key={`menu-${menu}`}>
          <div className="map-overlay" data-screen="map-menu" role="dialog" aria-label={t("mapPaused")}>
            <h2 className="title">{t("mapPaused")}</h2>
            <div className="row">
              <Tap id="map_continue" className="primary" onTap={closeMenu}>
                {t("mapContinue")}
              </Tap>
              <Tap id="map_exit" onTap={onExit}>
                {t("mapToWhoPlays")}
              </Tap>
            </div>
          </div>
        </ScreenTime>
      )}
    </main>
  );
}
