import type { CSSProperties } from "react";
import { artUsable, frameStyle, npcBattleFrame } from "../game/art";

interface FrameProps {
  /** A sheet of the art manifest. */
  id: string;
  frame: number;
  /** A CSS length: the frame's height. */
  height: string;
  className?: string;
}

/** One frame of a sheet (the icons, a person's portrait...) drawn as a background: no extra request per frame. */
export function SpriteFrame({ id, frame, height, className }: FrameProps) {
  return <span className={className ?? "sprite-frame"} aria-hidden="true" data-art={id} data-frame={frame} style={{ display: "inline-block", ...(frameStyle(id, frame, height) as CSSProperties) }} />;
}

/** A person's battle picture (front view) as a portrait of the given height, or nothing when there is none. */
export function Portrait({ npc, height, className }: { npc: string; height: string; className?: string }) {
  const f = npcBattleFrame(npc, "front");
  if (!f || !artUsable(f.sheetId)) return null;
  return <SpriteFrame id={f.sheetId} frame={f.frame} height={height} className={className ?? "portrait"} />;
}
