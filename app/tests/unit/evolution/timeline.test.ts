import { describe, expect, it } from "vitest";
import type { Timer } from "../../../src/ui/battle/pace";
import { EASE, lengthAt, MIN_FADE_MS, pulsesPerSecond, stepsOf } from "../../../src/ui/evolution/effects";
import { particlesOf } from "../../../src/ui/evolution/particles";
import { type Anim, countAt, type Beat, type BeatId, EvolutionClock, MAX_TICKS_PER_S, type Mode, planFor, SKIP_AFTER_MS } from "../../../src/ui/evolution/timeline";
import { gameJson } from "../game/helpers";

const anim = (gameJson<{ evolution: { animation: Anim } }>("battle_rules.json").evolution.animation);

/** A clock that only moves when the test says so. */
class FakeTimer implements Timer {
  t = 0;
  private next = 1;
  private jobs = new Map<number, { at: number; fn: () => void }>();
  set = (fn: () => void, ms: number) => {
    const id = this.next++;
    this.jobs.set(id, { at: this.t + ms, fn });
    return id;
  };
  clear = (id: unknown) => void this.jobs.delete(id as number);
  now = () => this.t;
  /** Runs to the next job; false when nothing is left. */
  step(limit = Infinity): boolean {
    const due = [...this.jobs.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (!due || due[1].at > limit) return false;
    this.jobs.delete(due[0]);
    this.t = due[1].at;
    due[1].fn();
    return true;
  }
  runTo(limit: number): void {
    while (this.step(limit));
    this.t = Math.max(this.t, limit);
  }
  runAll(): void {
    while (this.step());
  }
}

function run(mode: Mode, tapAt: number[] = []) {
  const timer = new FakeTimer();
  const log: { id: BeatId; at: number; rate: number }[] = [];
  let done: number | null = null;
  const plan = planFor(mode, anim);
  const clock = new EvolutionClock(plan, timer, anim.skip_rate, { beat: (b) => log.push({ id: b.id, at: timer.t, rate: clock.speed }), done: () => (done = timer.t) });
  clock.start();
  const taps: boolean[] = [];
  for (const at of tapAt) {
    timer.runTo(at);
    taps.push(clock.tap());
  }
  timer.runAll();
  return { log, done, taps, clock, plan };
}

describe("the plan (7.4): the rules' seconds", () => {
  it("the long version has the ten beats B0 to B9 and is 10.6 s (a fake clock, plus or minus 0.2)", () => {
    const { log, done } = run("long");
    expect(log.map((b) => b.id)).toEqual(["B0", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9"]);
    expect(done! / 1000).toBeGreaterThan(10.4);
    expect(done! / 1000).toBeLessThan(10.8);
    // the beats start where the spec's table says (seconds): 0, 0.4, 1.4, 3.2, 4.4, 5.6, 6.4, 7.6, 9.0, 10.0
    expect(log.map((b) => Math.round(b.at / 100) / 10)).toEqual([0, 0.4, 1.4, 3.2, 4.4, 5.6, 6.4, 7.6, 9.0, 10.0]);
  });

  it("the lengths are the data's: other rules, other seconds", () => {
    const plan = planFor("long", { ...anim, long_s: 8 });
    expect(plan.reduce((n, b) => n + b.ms, 0)).toBe(8000);
    expect(planFor("short", { ...anim, short_s: 5 }).reduce((n, b) => n + b.ms, 0)).toBeGreaterThan(4900);
  });

  it("the short version (the parent's choice) is about 6 s: B2 is shorter, B8 is dropped, the name card B7 stays whole", () => {
    const { log, done, plan } = run("short");
    expect(done! / 1000).toBeGreaterThan(5.8);
    expect(done! / 1000).toBeLessThan(6.2);
    expect(log.map((b) => b.id)).not.toContain("B8");
    const long = planFor("long", anim);
    const b2 = (p: Beat[]) => p.find((b) => b.id === "B2")!.ms;
    expect(b2(plan)).toBeLessThan(b2(long) / 2);
    expect(plan.find((b) => b.id === "B7")!.ms).toBe(long.find((b) => b.id === "B7")!.ms);
  });

  it("calm effects: one crossfade of 1.6 s in place of B1 to B6, then the name card and the settle", () => {
    const { log } = run("calm");
    expect(log.map((b) => b.id)).toEqual(["B0", "calm", "B7", "B9"]);
    expect(planFor("calm", anim).find((b) => b.id === "calm")!.ms).toBe(1600);
  });
});

describe("a tap (the skip)", () => {
  it("before 1.4 s it changes nothing; after it, the rest plays at the skip rate (3) and the evolution still shows B6 and B7 and ends", () => {
    const early = run("long", [1000]);
    expect(early.taps).toEqual([false]);
    expect(early.done! / 1000).toBeGreaterThan(10.4);
    const r = run("long", [SKIP_AFTER_MS + 100]);
    expect(r.taps).toEqual([true]);
    expect(anim.skip_rate).toBe(3);
    expect(r.log.map((b) => b.id)).toEqual(["B0", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9"]);
    expect(r.done! / 1000).toBeLessThan(6);
    const rates = Object.fromEntries(r.log.map((b) => [b.id, b.rate]));
    expect([rates["B3"], rates["B6"], rates["B8"]]).toEqual([3, 3, 3]);
    // the name card is read at normal speed even when skipping
    expect(rates["B7"]).toBe(1);
    expect(r.log.find((b) => b.id === "B7")!.at).toBeGreaterThan(0);
    expect(r.clock.finished).toBe(true);
  });

  it("a second tap does nothing more; a tap when it is over does nothing", () => {
    const r = run("long", [1500, 1600, 20000]);
    expect(r.taps).toEqual([true, false, false]);
  });

  it("the time of the whole is tracked in plan milliseconds, whatever the speed", () => {
    const timer = new FakeTimer();
    const clock = new EvolutionClock(planFor("long", anim), timer, 3, { beat: () => {}, done: () => {} });
    clock.start();
    timer.runTo(2000);
    expect(Math.round(clock.elapsed())).toBe(2000);
    clock.tap();
    timer.runTo(2300);
    expect(Math.round(clock.elapsed())).toBe(2000 + 900);
  });
});

describe("safety: no flashing (WCAG 2.3.1), measured on the plan", () => {
  const beats: BeatId[] = ["B0", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "calm"];

  it("no brightness step of a layer is quicker than 300 ms, in any version and at any speed", () => {
    for (const mode of ["long", "short", "calm"] as Mode[]) {
      const plan = planFor(mode, anim);
      for (const beat of plan) {
        const factor = beat.ms / (planFor("long", anim).find((b) => b.id === beat.id)?.ms ?? beat.ms);
        for (const step of stepsOf(beat.id)) {
          if (!step.keyframes.some((k) => k.opacity !== undefined)) continue;
          for (const rate of [1, anim.skip_rate]) {
            const ms = Math.max(MIN_FADE_MS, lengthAt({ ...step, ms: step.ms * factor }, rate));
            expect(ms, `${mode} ${beat.id} ${step.layer} at ${rate}x`).toBeGreaterThanOrEqual(MIN_FADE_MS);
            expect(lengthAt({ ...step, ms: step.ms * factor }, rate), `${mode} ${beat.id} ${step.layer} at ${rate}x`).toBeGreaterThanOrEqual(step.fade ? MIN_FADE_MS : 0);
          }
        }
      }
    }
  });

  it("every step that changes opacity is marked as a fade (it plays in calm mode, movement does not)", () => {
    for (const b of beats) for (const s of stepsOf(b)) if (s.keyframes.some((k) => k.opacity !== undefined)) expect(s.fade, `${b} ${s.layer}`).toBe(true);
  });

  it("no more than two pulses a second (B3 has two in 1.2 s) and no step is a strobe", () => {
    for (const b of beats) expect(pulsesPerSecond(b)).toBeLessThanOrEqual(2);
    expect(pulsesPerSecond("B3")).toBeGreaterThan(0);
  });

  it("the white silhouette is never the whole screen: the dim layer stays up until the burst, and only the creature's silhouette changes", () => {
    const dimEnds = (b: BeatId) => stepsOf(b).filter((s) => s.layer === "dim").map((s) => s.keyframes.at(-1)!.opacity);
    expect(dimEnds("B0")).toEqual([0.6]);
    for (const b of ["B1", "B2", "B3", "B4"] as BeatId[]) expect(dimEnds(b)).toEqual([]);
    expect(dimEnds("B5")).toEqual([0]);
  });

  it("the easings are the spec's named curves", () => {
    expect(EASE.backOut).toBe("cubic-bezier(0.34,1.56,0.64,1)");
    expect(EASE.outExpo).toBe("cubic-bezier(0.16,1,0.3,1)");
  });
});

describe("the lights (7.4)", () => {
  const area = { w: 873, h: 393 };
  it("16 motes in B2, 12 sparks in B4, 24 stars in B5, 8 hearts and stars in B8, 6 gold motes in B0; none elsewhere", () => {
    const n = (b: BeatId) => particlesOf(b, area).length;
    expect([n("B0"), n("B2"), n("B4"), n("B5"), n("B8")]).toEqual([6, 16, 12, 24, 8]);
    expect([n("B1"), n("B7"), n("B9"), n("calm")]).toEqual([0, 0, 0, 0]);
  });

  it("the motes are staggered 60 ms and last 1.2 to 1.6 s; the stars live 900 ms and fly 220 to 420 px/s", () => {
    const motes = particlesOf("B2", area);
    expect(motes.map((p) => p.delay)).toEqual(Array.from({ length: 16 }, (_, i) => i * 60));
    for (const p of motes) expect([p.ms >= 1200, p.ms <= 1600]).toEqual([true, true]);
    for (const p of particlesOf("B5", area)) {
      expect(p.ms).toBe(900);
      const end = p.path.at(-1)!;
      // distance over the life, gravity aside: between 220 and 420 px/s (gravity adds a little)
      const flown = Math.hypot(end.x, end.y - 0.5 * 120 * 0.81) / 0.9;
      expect(flown).toBeGreaterThan(215);
      expect(flown).toBeLessThan(425);
    }
  });

  it("is the same every time (no random), and every path starts and ends inside twice the screen", () => {
    expect(particlesOf("B2", area)).toEqual(particlesOf("B2", area));
    for (const p of [...particlesOf("B2", area), ...particlesOf("B5", area)]) for (const pt of p.path) expect(Math.hypot(pt.x, pt.y)).toBeLessThan(Math.hypot(area.w, area.h) * 2);
  });
});

describe("the counting numbers (B7)", () => {
  it("count from the old number to the new, out-cubic, and stay inside", () => {
    expect(countAt(20, 30, 0)).toBe(20);
    expect(countAt(20, 30, 1)).toBe(30);
    expect(countAt(20, 30, 0.5)).toBeGreaterThan(25);
    expect(countAt(20, 30, 2)).toBe(30);
    expect(MAX_TICKS_PER_S).toBe(10);
  });
});
