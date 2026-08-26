const fs = require('fs');
const zlib = require('zlib');

// CRC32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = data.length;
  const buf = Buffer.alloc(12 + len);
  buf.writeUInt32BE(len, 0);
  typeBuf.copy(buf, 4);
  data.copy(buf, 8);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function encodePNG(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 70, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // RGBA color type
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0 (None)
  const rowBytes = width * 4;
  const filtered = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    filtered[y * (rowBytes + 1)] = 0; // Filter None
    rgbaBuffer.copy(filtered, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  const compressed = zlib.deflateSync(filtered);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate high-resolution 1200x630 OpenGraph Preview Card
const W = 1200;
const H = 630;
const buf = Buffer.alloc(W * H * 4);

// Background: Deep luxury radial gradient #161130 -> #07050e
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const idx = (y * W + x) * 4;
    const dx = (x - W / 2) / (W / 2);
    const dy = (y - H / 2) / (H / 2);
    const d = Math.sqrt(dx * dx + dy * dy);
    const t = Math.min(1, d);

    // Radial gradient from #181236 to #07050e
    buf[idx] = Math.round(24 * (1 - t) + 7 * t);
    buf[idx + 1] = Math.round(18 * (1 - t) + 5 * t);
    buf[idx + 2] = Math.round(54 * (1 - t) + 14 * t);
    buf[idx + 3] = 255;
  }
}

// Draw a beautiful 32-bit Pool Table on the preview card
const tx = 150, ty = 120, tw = 900, th = 470;
const rx = tx + 35, ry = ty + 35, rw = tw - 70, rh = th - 70; // Playfield felt

// Table drop shadow
for (let y = ty + 16; y < ty + th + 30; y++) {
  for (let x = tx + 16; x < tx + tw + 30; x++) {
    if (x < W && y < H) {
      const idx = (y * W + x) * 4;
      buf[idx] = Math.round(buf[idx] * 0.35);
      buf[idx + 1] = Math.round(buf[idx + 1] * 0.35);
      buf[idx + 2] = Math.round(buf[idx + 2] * 0.35);
    }
  }
}

// Mahogany wood rails
for (let y = ty; y < ty + th; y++) {
  for (let x = tx; x < tx + tw; x++) {
    const idx = (y * W + x) * 4;
    const relY = (y - ty) / th;
    buf[idx] = Math.round(168 * (1 - relY) + 66 * relY);
    buf[idx + 1] = Math.round(84 * (1 - relY) + 26 * relY);
    buf[idx + 2] = Math.round(43 * (1 - relY) + 10 * relY);
    buf[idx + 3] = 255;
  }
}

// Emerald Felt with spotlight
for (let y = ry; y < ry + rh; y++) {
  for (let x = rx; x < rx + rw; x++) {
    const idx = (y * W + x) * 4;
    const cx = rx + rw / 2;
    const cy = ry + rh / 2;
    const dist = Math.hypot((x - cx) / (rw / 2), (y - cy) / (rh / 2));
    const t = Math.min(1, dist);

    const r = Math.round(46 * (1 - t * 0.7) + 13 * (t * 0.7));
    const g = Math.round(203 * (1 - t * 0.7) + 92 * (t * 0.7));
    const b = Math.round(126 * (1 - t * 0.7) + 54 * (t * 0.7));

    buf[idx] = r;
    buf[idx + 1] = g;
    buf[idx + 2] = b;
    buf[idx + 3] = 255;
  }
}

// Helper: Draw 32-bit shaded 3D billiard sphere
function drawSphere(cx, cy, radius, baseR, baseG, baseB, darkR, darkG, darkB, number = null) {
  const rSq = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const dx = x - cx;
      const dy = y - cy;
      const dSq = dx * dx + dy * dy;
      if (dSq <= rSq) {
        const idx = (y * W + x) * 4;
        const normDist = Math.sqrt(dSq) / radius;
        const lx = (dx + radius * 0.35) / radius;
        const ly = (dy + radius * 0.35) / radius;
        const lDist = Math.min(1, Math.hypot(lx, ly));

        let pr = Math.round(baseR * (1 - lDist * 0.8) + darkR * (lDist * 0.8));
        let pg = Math.round(baseG * (1 - lDist * 0.8) + darkG * (lDist * 0.8));
        let pb = Math.round(baseB * (1 - lDist * 0.8) + darkB * (lDist * 0.8));

        // Specular highlight
        const specDist = Math.hypot(dx + radius * 0.35, dy + radius * 0.35);
        if (specDist < radius * 0.45) {
          const spec = 1 - specDist / (radius * 0.45);
          pr = Math.min(255, Math.round(pr + 255 * spec * 0.9));
          pg = Math.min(255, Math.round(pg + 255 * spec * 0.9));
          pb = Math.min(255, Math.round(pb + 255 * spec * 0.9));
        }

        // Center white number circle
        if (number !== null && Math.hypot(dx, dy) < radius * 0.42) {
          pr = 245; pg = 245; pb = 250;
        }

        buf[idx] = pr;
        buf[idx + 1] = pg;
        buf[idx + 2] = pb;
        buf[idx + 3] = 255;
      }
    }
  }
}

// 6 Pockets
const pockets = [
  { x: rx, y: ry },
  { x: rx + rw / 2, y: ry },
  { x: rx + rw, y: ry },
  { x: rx, y: ry + rh },
  { x: rx + rw / 2, y: ry + rh },
  { x: rx + rw, y: ry + rh }
];
pockets.forEach(p => {
  drawSphere(p.x, p.y, 26, 15, 12, 25, 0, 0, 0);
});

// Draw Racked Triangle of Balls on right
const rackOriginX = rx + rw * 0.68;
const rackOriginY = ry + rh * 0.5;
const br = 20;
const ballColors = [
  [255, 204, 0, 196, 144, 0],   // 1 Yellow
  [0, 119, 255, 0, 71, 179],    // 2 Blue
  [255, 34, 68, 179, 11, 36],    // 3 Red
  [155, 38, 182, 94, 15, 115],  // 4 Purple
  [255, 119, 0, 179, 78, 0],    // 5 Orange
  [0, 200, 83, 0, 122, 48],     // 6 Green
  [156, 27, 62, 89, 9, 30],     // 7 Maroon
  [20, 18, 28, 5, 4, 8],        // 8 Black
  [255, 204, 0, 196, 144, 0],   // 9 Yellow
  [0, 119, 255, 0, 71, 179],    // 10 Blue
  [255, 34, 68, 179, 11, 36],   // 11 Red
  [155, 38, 182, 94, 15, 115],  // 12 Purple
  [255, 119, 0, 179, 78, 0],    // 13 Orange
  [0, 200, 83, 0, 122, 48],     // 14 Green
  [156, 27, 62, 89, 9, 30],     // 15 Maroon
];

let bIndex = 0;
for (let row = 0; row < 5; row++) {
  const rxPos = rackOriginX + row * (br * 1.732);
  for (let col = 0; col <= row; col++) {
    const ryPos = rackOriginY + (col - row * 0.5) * (br * 2.05);
    const c = ballColors[bIndex % ballColors.length];
    drawSphere(rxPos, ryPos, br, c[0], c[1], c[2], c[3], c[4], c[5], bIndex + 1);
    bIndex++;
  }
}

// Draw Cue Ball on Left
drawSphere(rx + rw * 0.28, ry + rh * 0.5, br, 255, 255, 255, 190, 200, 220);

// Draw Laser Aim Line
for (let t = 0; t < 360; t += 16) {
  const ax = rx + rw * 0.28 + t * 1.0;
  const ay = ry + rh * 0.5;
  for (let i = 0; i < 8; i++) {
    const px = Math.round(ax + i);
    const py = Math.round(ay);
    if (px < W && py < H) {
      const idx = (py * W + px) * 4;
      buf[idx] = 0; buf[idx + 1] = 240; buf[idx + 2] = 255; buf[idx + 3] = 255;
    }
  }
}

// Write out og-image.png (1200x630)
const pngData = encodePNG(W, H, buf);
fs.writeFileSync('./og-image.png', pngData);
console.log('Successfully generated og-image.png (1200x630)');

// Also generate apple-touch-icon.png (180x180) and icon-512.png (512x512)
fs.writeFileSync('./icon-512.png', pngData);
fs.writeFileSync('./apple-touch-icon.png', pngData);
