import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import type { FloorKind } from "@/editor/parts";

/** Metres covered by one texture tile, per finish. */
export const TILE_M: Record<FloorKind, number> = { tile: 2.4, wood: 2.4, vinyl: 2.4, concrete: 3 };

const cache = new Map<string, CanvasTexture>();

/** Deterministic pseudo-random so textures look the same on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function paint(kind: FloorKind, color: string, ctx: CanvasRenderingContext2D, S: number) {
  const r = rng(kind.length * 97 + parseInt(color.slice(1), 16));
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  if (kind === "tile") {
    const n = 4; // 0.6 m tiles
    const t = S / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = shade(color, 0.95 + r() * 0.1);
        ctx.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      }
    ctx.fillStyle = shade(color, 0.72);
    for (let i = 0; i <= n; i++) {
      ctx.fillRect(i * t - 2, 0, 4, S);
      ctx.fillRect(0, i * t - 2, S, 4);
    }
  } else if (kind === "wood" || kind === "vinyl") {
    const rows = kind === "wood" ? 12 : 8;
    const h = S / rows;
    for (let j = 0; j < rows; j++) {
      let x = -r() * S * 0.5;
      while (x < S) {
        const len = S * (0.35 + r() * 0.4);
        ctx.fillStyle = shade(color, 0.85 + r() * 0.3);
        ctx.fillRect(x, j * h, len - 2, h - 2);
        if (kind === "wood") {
          ctx.strokeStyle = shade(color, 0.7);
          ctx.globalAlpha = 0.35;
          for (let g = 0; g < 4; g++) {
            const y = j * h + 4 + r() * (h - 8);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 6, x + len * 0.6, y + (r() - 0.5) * 6, x + len - 2, y);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        x += len;
      }
    }
  } else {
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = shade(color, 0.8 + r() * 0.4);
      ctx.globalAlpha = 0.25;
      ctx.fillRect(r() * S, r() * S, 2 + r() * 3, 2 + r() * 3);
    }
    ctx.globalAlpha = 1;
  }
}

/** A floor texture sized so one repeat covers TILE_M metres. */
export function floorTexture(kind: FloorKind, color: string, w: number, d: number): Texture {
  const key = `${kind}|${color}`;
  let base = cache.get(key);
  if (!base) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    paint(kind, color, c.getContext("2d")!, 512);
    base = new CanvasTexture(c);
    base.colorSpace = SRGBColorSpace;
    base.wrapS = base.wrapT = RepeatWrapping;
    base.anisotropy = 8;
    cache.set(key, base);
  }
  const t = base.clone();
  t.repeat.set(w / TILE_M[kind], d / TILE_M[kind]);
  t.needsUpdate = true;
  return t;
}
