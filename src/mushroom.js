// The Mushroom Dome Bar: a glowing domed bar built into the south-west corner of the
// middle hall. From the hall it's a wall with a doorway, like any other room; inside, the
// dome rises through a hole in the ceiling. Its own textures already glow, so it skips the
// club shader. The walls and the bar counter are traced into the wall map so nobody walks
// through them.
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

  // Close the corner into a room: a north wall, and an east wall with the doorway. The
  // hall's own west and south walls make the other two sides.
  const R = SPOTS.mushroom.room, M = SPOTS.mushroom, y = world.floorY;
  const [x0, z0] = R.min, [x1, z1] = R.max, nz = z0 + 0.05, ex = x1 - 0.05;
  const wallMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  clubify(wallMat, "Wall_1");
  const pane = (w, h, px, py, pz, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(px, py, pz);
    m.rotation.y = rotY;
    world.scene.add(m);
  };
  const strip = (len, h, py, color, px, pz, alongZ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.02 : len, h, alongZ ? len : 0.02),
      new THREE.MeshBasicMaterial({ color, fog: false }));
    m.position.set(px, py, pz);
    world.scene.add(m);
  };
  const width = ex - x0, before = M.doorFrom - nz, after = z1 - M.doorTo, door = M.doorTo - M.doorFrom;
  pane(width, WALL_H, x0 + width / 2, y + WALL_H / 2, nz, 0);
  pane(before, WALL_H, ex, y + WALL_H / 2, nz + before / 2, Math.PI / 2);
  pane(after, WALL_H, ex, y + WALL_H / 2, M.doorTo + after / 2, Math.PI / 2);
  pane(door, WALL_H - DOOR_H, ex, y + (DOOR_H + WALL_H) / 2, M.doorFrom + door / 2, Math.PI / 2);
  world.blockRect(x0, nz - 0.08, ex, nz + 0.08);
  world.blockRect(ex - 0.08, nz, ex + 0.08, M.doorFrom);
  world.blockRect(ex - 0.08, M.doorTo, ex + 0.08, z1);
  // Neon along the outside, like every other wall in the club.
  for (const [py, h, color] of [[y + 0.07, 0.06, 0xff3d9a], [y + 2.355, 0.05, 0x9b5cff]]) {
    strip(width, h, py, color, x0 + width / 2, nz - 0.03, false);
    strip(before, h, py, color, ex + 0.03, nz + before / 2, true);
    strip(after, h, py, color, ex + 0.03, M.doorTo + after / 2, true);
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
