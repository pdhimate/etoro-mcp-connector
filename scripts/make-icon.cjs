// Generates a neutral 512x512 PNG icon for the listing: an upward candlestick
// chart on a deep-navy rounded square. Deliberately uses NO eToro branding,
// logo, or brand colors — generic markets iconography only.
// Rendered at 3x supersample and downsampled with premultiplied-alpha averaging
// for clean anti-aliased edges. Run: node scripts/make-icon.cjs
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

const OUT = 512;
const SS = 3;
const N = OUT * SS;
const buf = new Float32Array(N * N * 4); // straight RGBA, alpha 0..255, init transparent

function px(x, y, r, g, b, a) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  const i = (y * N + x) * 4;
  const da = buf[i + 3] / 255;
  const outA = a + da * (1 - a);
  if (outA <= 0) return;
  buf[i] = (r * a + buf[i] * da * (1 - a)) / outA;
  buf[i + 1] = (g * a + buf[i + 1] * da * (1 - a)) / outA;
  buf[i + 2] = (b * a + buf[i + 2] * da * (1 - a)) / outA;
  buf[i + 3] = outA * 255;
}

// Geometry in 512-space, scaled to render space.
const s = SS;
const x0 = 24 * s,
  y0 = 24 * s,
  x1 = 488 * s,
  y1 = 488 * s,
  rad = 96 * s;

function insideRR(x, y) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  let dx = 0,
    dy = 0;
  if (x < x0 + rad) dx = x0 + rad - x;
  else if (x > x1 - rad) dx = x - (x1 - rad);
  if (y < y0 + rad) dy = y0 + rad - y;
  else if (y > y1 - rad) dy = y - (y1 - rad);
  return dx * dx + dy * dy <= rad * rad;
}

// Background: vertical gradient navy.
const topC = [17, 41, 74]; // #11294A
const botC = [10, 27, 51]; // #0A1B33
for (let y = y0; y <= y1; y++) {
  const t = (y - y0) / (y1 - y0);
  const r = topC[0] + (botC[0] - topC[0]) * t;
  const g = topC[1] + (botC[1] - topC[1]) * t;
  const b = topC[2] + (botC[2] - topC[2]) * t;
  for (let x = x0; x <= x1; x++) {
    if (insideRR(x, y)) px(x, y, r, g, b, 1);
  }
}

function fillRect(cx, halfW, yTop, yBot, color) {
  const xa = (cx - halfW) * s,
    xb = (cx + halfW) * s,
    ya = yTop * s,
    yb = yBot * s;
  for (let y = Math.round(ya); y <= Math.round(yb); y++) {
    for (let x = Math.round(xa); x <= Math.round(xb); x++) {
      if (insideRR(x, y)) px(x, y, color[0], color[1], color[2], 1);
    }
  }
}

const UP = [46, 204, 158]; // teal #2ECC9E
const DOWN = [255, 107, 107]; // coral #FF6B6B

// Four candles, ascending trend. {cx, openY, closeY, highY, lowY, up}
const candles = [
  { cx: 160, openY: 300, closeY: 332, highY: 286, lowY: 348, up: false },
  { cx: 244, openY: 322, closeY: 268, highY: 252, lowY: 338, up: true },
  { cx: 328, openY: 276, closeY: 216, highY: 200, lowY: 292, up: true },
  { cx: 412, openY: 224, closeY: 156, highY: 140, lowY: 240, up: true },
];

for (const c of candles) {
  const color = c.up ? UP : DOWN;
  fillRect(c.cx, 3, c.highY, c.lowY, color); // wick
  const top = Math.min(c.openY, c.closeY);
  const bot = Math.max(c.openY, c.closeY);
  fillRect(c.cx, 24, top, bot, color); // body
}

// Downsample SSxSS -> OUT with premultiplied-alpha averaging.
const out = new PNG({ width: OUT, height: OUT });
for (let oy = 0; oy < OUT; oy++) {
  for (let ox = 0; ox < OUT; ox++) {
    let R = 0,
      G = 0,
      B = 0,
      A = 0;
    for (let dy = 0; dy < SS; dy++) {
      for (let dx = 0; dx < SS; dx++) {
        const i = ((oy * SS + dy) * N + (ox * SS + dx)) * 4;
        const a = buf[i + 3] / 255;
        R += buf[i] * a;
        G += buf[i + 1] * a;
        B += buf[i + 2] * a;
        A += a;
      }
    }
    const count = SS * SS;
    const oi = (oy * OUT + ox) * 4;
    if (A > 0) {
      out.data[oi] = Math.round(R / A);
      out.data[oi + 1] = Math.round(G / A);
      out.data[oi + 2] = Math.round(B / A);
    } else {
      out.data[oi] = out.data[oi + 1] = out.data[oi + 2] = 0;
    }
    out.data[oi + 3] = Math.round((A / count) * 255);
  }
}

const outPath = path.join(__dirname, "..", "icon.png");
fs.writeFileSync(outPath, PNG.sync.write(out));
console.log("wrote", outPath, `(${OUT}x${OUT})`);
