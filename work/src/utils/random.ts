export class SeededRNG {
  private state: number;
  public readonly seedString: string;

  constructor(seed?: string) {
    this.seedString = seed || SeededRNG.generateSeedString();
    this.state = SeededRNG.hashString(this.seedString);
  }

  public static generateSeedString(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  public static hashString(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  public getState(): number {
    return this.state;
  }

  public setState(nextState: number): void {
    this.state = nextState >>> 0;
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  public int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  public pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  public chance(prob: number): boolean {
    return this.next() < prob;
  }

  public angle(): number {
    return this.next() * Math.PI * 2;
  }
}
