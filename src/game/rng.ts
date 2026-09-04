export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(a: number, b: number): number { return a + Math.floor(this.next() * (b - a + 1)); }
  f(a: number, b: number): number { return a + this.next() * (b - a); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  gauss(mean: number, sd: number): number {
    const u = this.next() + this.next() + this.next() + this.next();
    return mean + (u - 2) * sd * 1.22;
  }
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  weighted<T>(items: T[], weights: number[]): T {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const newSeed = () => Math.floor(Math.random() * 0xffffffff);
