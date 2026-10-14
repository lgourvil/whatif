import { CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace } from "three";

const cache = new Map<string, CanvasTexture>();

const make = (key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = NearestFilter;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
};

// Madras-style plaid (original pattern): warm base + translucent crossing bands.
export const madrasTexture = (base = "#e23d32", band1 = "#f6c33f", band2 = "#2f9e57", line = "#ffffff") =>
  make(`madras${base}${band1}${band2}`, 128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    const bands: [number, number, string, number][] = [
      [8, 26, band1, 0.85], [44, 10, band2, 0.7], [70, 30, band1, 0.85], [108, 8, line, 0.6],
    ];
    for (const [o, w, col, a] of bands) {
      g.globalAlpha = a * 0.75;
      g.fillStyle = col;
      g.fillRect(o, 0, w, 128);
      g.fillRect(0, o, 128, w);
    }
    g.globalAlpha = 0.9;
    g.fillStyle = "#1a1020";
    for (const o of [36, 102]) {
      g.fillRect(o, 0, 2, 128);
      g.fillRect(0, o, 128, 2);
    }
    g.globalAlpha = 1;
  });

// Original imperial banner: madras field, green hoist triangle, rising yellow sun.
export const bannerTexture = () =>
  make("banner", 256, 160, (g) => {
    g.fillStyle = "#e23d32";
    g.fillRect(0, 0, 256, 160);
    g.globalAlpha = 0.55;
    g.fillStyle = "#f6c33f";
    for (const o of [18, 70, 122]) { g.fillRect(0, o, 256, 14); }
    for (const o of [100, 170, 232]) { g.fillRect(o, 0, 12, 160); }
    g.globalAlpha = 1;
    g.fillStyle = "#2f9e57";
    g.beginPath(); g.moveTo(0, 0); g.lineTo(96, 80); g.lineTo(0, 160); g.closePath(); g.fill();
    g.fillStyle = "#f6c33f";
    g.beginPath(); g.arc(36, 80, 22, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#f6c33f"; g.lineWidth = 5;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath(); g.moveTo(36 + Math.cos(a) * 28, 80 + Math.sin(a) * 28); g.lineTo(36 + Math.cos(a) * 38, 80 + Math.sin(a) * 38); g.stroke();
    }
    g.strokeStyle = "#111"; g.lineWidth = 6; g.strokeRect(0, 0, 256, 160);
  });
