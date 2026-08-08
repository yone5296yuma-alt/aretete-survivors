export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}
export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}
export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
export function randRange(min, max) {
  return min + Math.random() * (max - min);
}
export function randInt(min, max) {
  return Math.floor(randRange(min, max + 1));
}
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
export function weightedPick(entries) {
  // entries: [{item, weight}]
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.item;
  }
  return entries[entries.length - 1].item;
}
export class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  copy() { return new Vec2(this.x, this.y); }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  len() { return Math.sqrt(this.x * this.x + this.y * this.y); }
  norm() {
    const l = this.len();
    if (l > 0.0001) { this.x /= l; this.y /= l; }
    return this;
  }
}
