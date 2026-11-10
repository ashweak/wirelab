"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Staged, type InvItem } from "./ItemPreview";

/**
 * Inventory icons rendered from the real 3D models. One hidden WebGL canvas works through
 * a queue: it draws an item, waits two frames for textures, copies the pixels into a
 * PNG and moves on. Icons are cached for the session.
 */
const SIZE = 96;
const cache = new Map<string, string>();
const queue: InvItem[] = [];
const queued = new Set<string>();
const listeners = new Set<() => void>();
const keyOf = (i: InvItem) => `${i.kind}:${i.id}`;
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function requestThumb(item: InvItem) {
  const k = keyOf(item);
  if (cache.has(k) || queued.has(k)) return;
  queued.add(k);
  queue.push(item);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Data URL of the icon, or null while it is being drawn. */
export function useThumb(item: InvItem): string | null {
  useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => requestThumb(item), [item]);
  return cache.get(keyOf(item)) ?? null;
}

function Worker() {
  const { gl, scene, camera } = useThree();
  const [item, setItem] = useState<InvItem | null>(null);
  const frames = useRef(0);
  useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => {
    if (!item && queue.length) setItem(queue.shift()!);
  });
  useFrame(() => {
    if (!item) return;
    frames.current++;
    if (frames.current < 3) return;
    gl.render(scene, camera);
    cache.set(keyOf(item), gl.domElement.toDataURL("image/png"));
    queued.delete(keyOf(item));
    frames.current = 0;
    setItem(queue.shift() ?? null);
    emit();
  });
  return item ? <Staged key={keyOf(item)} item={item} /> : null;
}

/** Mount once; renders off-screen. */
export default function ThumbnailFactory() {
  return (
    <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: SIZE, height: SIZE, pointerEvents: "none" }}>
      <Canvas
        frameloop="always"
        dpr={1}
        gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
        camera={{ position: [1.75, 1.25, 1.75], fov: 38, near: 0.01, far: 50 }}
        style={{ width: SIZE, height: SIZE }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      >
        <hemisphereLight args={["#ffffff", "#5b6472", 1.2]} />
        <directionalLight position={[3, 5, 2.5]} intensity={1.9} />
        <directionalLight position={[-3, 2, -2]} intensity={0.5} />
        <Worker />
      </Canvas>
    </div>
  );
}
