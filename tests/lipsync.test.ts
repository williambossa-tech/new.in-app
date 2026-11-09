import { describe, expect, it } from "vitest";
import { analyzeSamples, mouthAt, visemeOf } from "@/components/owl3d/lipsync";

const SR = 24000;
const tone = (hz: number[], secs: number, amp = 0.4) => {
  const d = new Float32Array(Math.round(SR * secs));
  for (let i = 0; i < d.length; i++) d[i] = hz.reduce((s, f, k) => s + Math.sin((2 * Math.PI * f * i) / SR) / (k + 1), 0) * amp;
  return d;
};
const concat = (...xs: Float32Array[]) => { const o = new Float32Array(xs.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of xs) { o.set(x, p); p += x.length; } return o; };

describe("Sincronização do bico", () => {
  it("bico fechado no silêncio e aberto com voz", () => {
    const t = analyzeSamples(concat(new Float32Array(SR * 0.5), tone([220, 700, 1200], 0.6), new Float32Array(SR * 0.5)), SR);
    expect(t.duration).toBeCloseTo(1.6, 1);
    expect(mouthAt(t, 0.2).open).toBeLessThan(0.01);
    expect(mouthAt(t, 0.8).open).toBeGreaterThan(0.4);
    expect(mouthAt(t, 1.45).open).toBeLessThan(0.01);
    expect(mouthAt(t, 99).open).toBe(0);
  });

  it("sons escuros arredondam e sons claros alargam o bico", () => {
    const dark = tone([200, 400], 0.5), mid = tone([220, 900, 1300], 0.5), bright = tone([3000, 4200, 5200], 0.5);
    const t = analyzeSamples(concat(dark, mid, bright), SR);
    expect(mouthAt(t, 0.25).round).toBeGreaterThan(0.6);
    expect(mouthAt(t, 1.25).wide).toBeGreaterThan(0.6);
  });

  it("classificação por visema", () => {
    expect(visemeOf(0.05, 1000, 600, 1500)).toBe("rest");
    expect(visemeOf(0.5, 500, 600, 1500)).toBe("O");
    expect(visemeOf(0.5, 1000, 600, 1500)).toBe("A");
    expect(visemeOf(0.5, 2000, 600, 1500)).toBe("E");
  });
});
