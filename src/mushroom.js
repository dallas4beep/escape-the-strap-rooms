// The Mushroom Dome Bar: a glowing domed bar room in the middle hall. It's walled in by
// a round club wall with a doorway lined up with the dome's arch, so from the hall it
// looks like any other room; inside, the dome rises through a hole in the ceiling. Its
// own textures already glow, so it skips the club shader. The walls and the bar counter
// are traced into the wall map so nobody walks through them.
import * as THREE from "three";
import { SPOTS } from "./config.js";
import { clubify } from "./clublook.js";

const WALL_H = 2.66;        // floor to ceiling in the middle hall
const DOOR_H = 2.3;

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

  // The round wall. Cylinder angles run x = sin(a), z = cos(a); the doorway faces +x.
  const R = SPOTS.mushroom.hole + 0.1, gap = 0.5, door = Math.PI / 2, y = world.floorY;
  const wallMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  clubify(wallMat, "Wall_1");
  const ring = (y0, h, start, len, mat, r = R) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 72, 1, true, start, len), mat);
    m.position.set(cx, y0 + h / 2, cz);
    world.scene.add(m);
  };
  ring(y, WALL_H, door + gap / 2, Math.PI * 2 - gap, wallMat);
  ring(y + DOOR_H, WALL_H - DOOR_H, door - gap / 2, gap, wallMat);
  // Neon along the bottom and top, like every other wall in the club.
  ring(y + 0.04, 0.06, door + gap / 2, Math.PI * 2 - gap, new THREE.MeshBasicMaterial({ color: 0xff3d9a, side: THREE.DoubleSide, fog: false }), R + 0.03);
  ring(y + 2.33, 0.05, door + gap / 2, Math.PI * 2 - gap, new THREE.MeshBasicMaterial({ color: 0x9b5cff, side: THREE.DoubleSide, fog: false }), R + 0.03);
  for (let a = door + gap / 2; a < door + Math.PI * 2 - gap / 2; a += 0.05 / R) {
    const x = cx + Math.sin(a) * R, z = cz + Math.cos(a) * R;
    world.blockRect(x - 0.06, z - 0.06, x + 0.06, z + 0.06);
  }

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
