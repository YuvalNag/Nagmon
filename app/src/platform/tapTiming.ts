/**
 * How long a tap takes to show: from the finger's lift to the end of the
 * next drawn frame, for the last {@link MAX_TAPS} taps. Always on (one
 * frame callback per tap); the browser tests and the emulator check read
 * it from `window.__responses` (docs/app/SDD.md §5).
 */
export const MAX_TAPS = 50;

type Timed = { __responses?: number[] };

export function tapTimes(target: object = window): number[] {
  const w = target as Timed;
  return (w.__responses ??= []);
}

export function installTapTiming(target: Window = window): () => void {
  const times = tapTimes(target);
  const frame = (cb: () => void) =>
    typeof target.requestAnimationFrame === "function" ? target.requestAnimationFrame(cb) : setTimeout(cb, 16);
  const channel = new MessageChannel();
  const queue: number[] = [];
  channel.port1.onmessage = () => {
    const start = queue.shift();
    if (start === undefined) return;
    times.push(performance.now() - start);
    if (times.length > MAX_TAPS) times.splice(0, times.length - MAX_TAPS);
  };
  const onUp = (e: Event) => {
    const now = performance.now();
    // the event's own time also counts the wait before the page got it
    const start = e.timeStamp > 0 && e.timeStamp <= now ? e.timeStamp : now;
    // the frame callback runs before that frame is drawn; the message after it
    frame(() => {
      queue.push(start);
      channel.port2.postMessage(0);
    });
  };
  target.addEventListener("pointerup", onUp, { capture: true, passive: true });
  return () => {
    target.removeEventListener("pointerup", onUp, { capture: true });
    channel.port1.close();
  };
}
