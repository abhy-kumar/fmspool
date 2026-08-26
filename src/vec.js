export function vec(x = 0, y = 0) {
  return { x, y };
}

export function cloneVec(v) {
  return { x: v.x, y: v.y };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function mul(v, s) {
  return { x: v.x * s, y: v.y * s };
}

export function div(v, s) {
  return s !== 0 ? { x: v.x / s, y: v.y / s } : { x: 0, y: 0 };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

export function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

export function perp(v) {
  return { x: -v.y, y: v.x };
}

export function lenSq(v) {
  return v.x * v.x + v.y * v.y;
}

export function len(v) {
  return Math.hypot(v.x, v.y);
}

export function distSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function norm(v) {
  const l = Math.hypot(v.x, v.y);
  return l > 0.000001 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpVec(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function angle(v) {
  return Math.atan2(v.y, v.x);
}

export function fromAngle(rad, length = 1) {
  return {
    x: Math.cos(rad) * length,
    y: Math.sin(rad) * length,
  };
}

export function rotate(v, rad) {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  };
}

export function angleBetween(a, b) {
  const d = dot(norm(a), norm(b));
  return Math.acos(clamp(d, -1, 1));
}

export function lerpAngle(a, b, t) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
}

export function distToSegment(p, a, b) {
  const l2 = distSq(a, b);
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = clamp(t, 0, 1);
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

export function rayCircleIntersect(origin, dir, circlePos, radius) {
  // Returns hit distance t >= 0 or null
  const d = norm(dir);
  const m = sub(origin, circlePos);
  const b = dot(m, d);
  const c = dot(m, m) - radius * radius;
  if (c > 0 && b > 0) return null;
  const discr = b * b - c;
  if (discr < 0) return null;
  let t = -b - Math.sqrt(discr);
  if (t < 0) t = 0;
  return t;
}
