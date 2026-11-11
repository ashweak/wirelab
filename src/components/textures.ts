import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import type { FloorKind } from "@/editor/parts";

/** Metres covered by one texture tile, per finish. */
export const TILE_M: Record<FloorKind, number> = {
  tile: 1.2,
  porcelain60: 2.4,
  granite: 2.4,
  marble: 2.4,
  vinyl: 2.4,
  wood: 2.4,
  parquet: 1.2,
  concrete: 3,
  epoxy: 3,
  carpet: 2,
};

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
  if (kind === "tile" || kind === "porcelain60" || kind === "granite" || kind === "marble" || kind === "carpet") {
    const n = 4; // TILE_M / 4 per tile: 0.3 m ceramic, 0.6 m porcelain/stone, 0.5 m carpet
    const t = S / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = shade(color, 0.95 + r() * 0.1);
        ctx.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      }
    if (kind === "granite" || kind === "carpet") {
      for (let i = 0; i < 14000; i++) {
        ctx.fillStyle = shade(color, kind === "granite" ? 0.55 + r() * 0.9 : 0.85 + r() * 0.3);
        ctx.globalAlpha = kind === "granite" ? 0.5 : 0.35;
        ctx.fillRect(r() * S, r() * S, 1.5 + r() * 2, 1.5 + r() * 2);
      }
      ctx.globalAlpha = 1;
    }
    if (kind === "marble") {
      ctx.strokeStyle = shade(color, 0.7);
      ctx.globalAlpha = 0.35;
      for (let v = 0; v < 10; v++) {
        let x = r() * S;
        let y = 0;
        ctx.beginPath();
        ctx.moveTo(x, y);
        while (y < S) {
          x += (r() - 0.5) * 40;
          y += 20 + r() * 30;
          ctx.lineTo(x, y);
        }
        ctx.lineWidth = 1 + r() * 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = shade(color, kind === "carpet" ? 0.9 : 0.72);
    for (let i = 0; i <= n; i++) {
      ctx.fillRect(i * t - (kind === "carpet" ? 1 : 2), 0, kind === "carpet" ? 2 : 4, S);
      ctx.fillRect(0, i * t - (kind === "carpet" ? 1 : 2), S, kind === "carpet" ? 2 : 4);
    }
  } else if (kind === "parquet") {
    const n = 8;
    const t = S / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const vertical = (i + j) % 2 === 0;
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = shade(color, 0.82 + r() * 0.3);
          if (vertical) ctx.fillRect(i * t + (k * t) / 4 + 1, j * t + 1, t / 4 - 2, t - 2);
          else ctx.fillRect(i * t + 1, j * t + (k * t) / 4 + 1, t - 2, t / 4 - 2);
        }
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
export function floorTexture(kind: FloorKind, color: string, w: number, d: number, tileM?: number | null): Texture {
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
  // the canvas holds 4 × 4 tiles, so a custom tile size scales the repeat
  const rep = tileM ? tileM * 4 : TILE_M[kind];
  t.repeat.set(w / rep, d / rep);
  t.needsUpdate = true;
  return t;
}
