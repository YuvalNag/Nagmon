/**
 * The map's music: one looping track at a time, streamed by an <audio>
 * element. Not WebAudio: a decoded minute of music is about 20 MB, and
 * a streamed one is a few hundred KB (docs/app/SDD.md §5, memory).
 *
 * The browser plays sound only after a touch. The map opens from a tap,
 * so the first try usually works; if it was refused, the next finger on
 * the screen starts it.
 */
export class Music {
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private held = false;
  /** Destroyed: a late play (a map that finished loading after the exit) stays silent. */
  private dead = false;
  private retry = () => void this.start();

  constructor(private readonly volume = 0.5) {}

  /** Plays `url` (the same track goes on without a restart); null is silence. */
  play(url: string | null): void {
    if (this.dead) return;
    if (url === this.url) {
      void this.start();
      return;
    }
    this.stopTrack();
    this.url = url;
    if (!url) return;
    const a = new Audio(url);
    a.loop = true;
    a.volume = this.volume;
    a.preload = "auto";
    this.audio = a;
    void this.start();
  }

  /** Silence while paused (the menu, the background); the track waits where it was. */
  hold(): void {
    this.held = true;
    this.audio?.pause();
  }

  release(): void {
    if (this.dead) return;
    this.held = false;
    void this.start();
  }

  get playing(): boolean {
    return !!this.audio && !this.audio.paused;
  }

  get track(): string | null {
    return this.url;
  }

  get destroyed(): boolean {
    return this.dead;
  }

  destroy(): void {
    this.dead = true;
    this.stopTrack();
    this.url = null;
  }

  private async start(): Promise<void> {
    const a = this.audio;
    if (!a || this.held || this.dead || !a.paused) return;
    try {
      await a.play();
      document.removeEventListener("pointerdown", this.retry, true);
      // paused or changed while the play was starting
      if (this.held || this.dead || this.audio !== a) a.pause();
    } catch {
      // no touch yet, or no sound on this device: wait for the next finger
      document.addEventListener("pointerdown", this.retry, { capture: true, once: true });
    }
  }

  private stopTrack(): void {
    document.removeEventListener("pointerdown", this.retry, true);
    if (!this.audio) return;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.audio = null;
  }
}
