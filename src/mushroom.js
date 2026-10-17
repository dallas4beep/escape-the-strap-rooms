// The Mushroom Dome Bar: a glowing domed bar room standing in the middle hall, tall
// enough that it rises through a hole in the ceiling. Its own textures already glow,
// so it skips the club shader. The dome wall and the bar counter are traced into the
// wall map so nobody walks through them.
import * as THREE from "three";
import { SPOTS } from "./config.js";

const DIR = "assets/models/mushroom/";

export async function buildMushroom(world, gltfLoader, texLoader) {
  const [gltf, outline] = await Promise.all([
    gltfLoader.loadAsync(DIR + "mushroom.glb"),
    fetch(DIR + "mushroom.json").then((r) => r.json()),
  ]);
  const [cx, cz] = SPOTS.mushroom.pos, { yaw, size } = SPOTS.mushroom;
  const textures = {};
  const tex = (name) => {
    if (!textures[name]) {
      const t = texLoader.load(DIR + name + ".webp");
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = false;
      textures[name] = t;
    }
    return textures[name];
  };
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.material = new THREE.MeshBasicMaterial({ map: tex(o.parent.name), side: THREE.DoubleSide });
  });
  gltf.scene.rotation.y = yaw;
  gltf.scene.scale.setScalar(size);
  gltf.scene.position.set(cx, world.floorY + 0.045, cz);
  world.scene.add(gltf.scene);

  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const seg of outline.segments) {
    const [ax, az, bx, bz] = seg.map((v) => v * size);
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05));
    for (let i = 0; i <= n; i++) {
      const lx = ax + (bx - ax) * i / n, lz = az + (bz - az) * i / n;
      const x = cx + lx * c + lz * s, z = cz - lx * s + lz * c;
      world.blockRect(x - 0.05, z - 0.05, x + 0.05, z + 0.05);
    }
  }
}

// The dome's skin and floor, repeated across the whole club.
export function mushroomTextures(texLoader) {
  const load = (name) => {
    const t = texLoader.load(DIR + name + ".webp");
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  return { wall: load("BarHouse"), floor: load("BarFloor") };
}
