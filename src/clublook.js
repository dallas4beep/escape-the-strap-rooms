// Turns the office-yellow level into a nightclub dressed like the Mushroom Dome Bar:
// its glowing spotted skin on the walls, its dark floor underfoot, colour-cycling
// ceiling lights, slow light sweeps on the beat, and neon strips along every wall.
import * as THREE from "three";

export const clubTime = { value: 0 };

// What each of the level's surfaces becomes.
function kindOf(name) {
  if (/^Exit/.test(name)) return null;                       // keep the exit easy to spot
  if (/Lamp/.test(name)) return "light";
  if (/^Moquette/.test(name)) return "floor";
  if (/^Ceiling/.test(name)) return "ceiling";
  if (/^(Wall|Withe|Wood)/.test(name)) return "wall";
  return "prop";
}

const KIND = { wall: 0, floor: 1, ceiling: 2, prop: 3, light: 4 };
// Filled in once the Mushroom Dome Bar's textures are loading.
export const clubTex = { wall: { value: null }, floor: { value: null } };
// A round hole in the ceiling (x, z, radius) for the Mushroom Dome Bar to rise through.
export const clubHole = { value: new THREE.Vector3(0, 0, 0) };

export function clubify(material, name) {
  const kind = kindOf(name);
  if (!kind) return;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clubTime;
    shader.uniforms.uWallTex = clubTex.wall;
    shader.uniforms.uFloorTex = clubTex.floor;
    shader.uniforms.uKind = { value: KIND[kind] };
    shader.uniforms.uHole = clubHole;
    shader.vertexShader = "varying vec3 vClubPos;\n" + shader.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\n  vClubPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = `varying vec3 vClubPos;
uniform float uTime;
uniform int uKind;
uniform vec3 uHole;
uniform sampler2D uWallTex, uFloorTex;
vec3 clubHue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
` + shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
  {
    vec3 p = vClubPos;
    if ((uKind == 2 || uKind == 4) && distance(p.xz, uHole.xy) < uHole.z) discard;
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    float beat = pow(0.5 + 0.5 * cos(uTime * 12.566), 6.0);
    if (uKind == 4) {
      // Ceiling panels glow and slowly cycle through the club colours.
      diffuseColor.rgb = mix(vec3(1.0), clubHue(fract(uTime * 0.05 + p.x * 0.015 + p.z * 0.01)), 0.75) * (0.7 + 0.5 * lum) * (0.85 + 0.15 * beat);
    } else {
      // Mushroom Dome Bar skin on walls, its dark floor on floors, painted in world space.
      vec3 n = normalize(cross(dFdx(p), dFdy(p)));
      vec2 side = abs(n.x) > abs(n.z) ? vec2(p.z, p.y) : vec2(p.x, p.y);
      vec3 col;
      if (uKind == 1) col = texture2D(uFloorTex, p.xz / 3.0).rgb * (0.75 + 0.5 * lum);
      else if (uKind == 2) col = texture2D(uFloorTex, p.xz / 3.0).rgb * 0.3;
      else col = texture2D(uWallTex, side / 2.6).rgb * (0.7 + 0.5 * lum);
      // The purple spots pulse on the beat.
      float spot = smoothstep(0.05, 0.25, col.b - col.g);
      col += col * spot * (0.4 + 0.8 * beat);
      // Three soft beams sweeping across the room in different directions.
      float b1 = smoothstep(0.7, 1.0, sin(p.x * 0.22 + p.z * 0.09 - uTime * 0.9));
      float b2 = smoothstep(0.75, 1.0, sin(p.z * 0.31 - p.x * 0.07 + uTime * 0.7));
      float b3 = smoothstep(0.8, 1.0, sin((p.x + p.z) * 0.13 + uTime * 1.3));
      vec3 sweep = vec3(1.0, 0.25, 0.65) * b1 + vec3(0.2, 0.85, 1.0) * b2 + vec3(0.6, 0.3, 1.0) * b3;
      diffuseColor.rgb = col + sweep * (0.1 + 0.25 * lum);
    }
  }`);
  };
  material.needsUpdate = true;
}

// Thin glowing strips along both faces of every wall, at the floor and near the ceiling.
// Built from the wall map, merged into one mesh per colour so it stays cheap on phones.
export function neonStrips(world, skipAreas = []) {
  const g = world.grid, W = g.width, H = g.height, base = world.base, y = world.floorY;
  const skip = (x, z) => skipAreas.some((a) => x > a.min[0] && x < a.max[0] && z > a.min[1] && z < a.max[1]);
  const lines = [];   // [ax, az, bx, bz, nx, nz] runs along cell edges, normal pointing into the open side
  const wall = (x, z) => x >= 0 && z >= 0 && x < W && z < H && base[z * W + x] === 1;
  // Edges running along x (between rows).
  for (let z = 0; z < H; z++) {
    for (const dir of [-1, 1]) {
      let start = -1;
      for (let x = 0; x <= W; x++) {
        const on = x < W && wall(x, z) && !wall(x, z + dir) && z + dir >= 0 && z + dir < H;
        if (on && start < 0) start = x;
        if (!on && start >= 0) {
          const ez = g.originZ + (dir > 0 ? z + 1 : z) * g.cell;
          lines.push([g.originX + start * g.cell, ez, g.originX + x * g.cell, ez, 0, dir]);
          start = -1;
        }
      }
    }
  }
  // Edges running along z (between columns).
  for (let x = 0; x < W; x++) {
    for (const dir of [-1, 1]) {
      let start = -1;
      for (let z = 0; z <= H; z++) {
        const on = z < H && wall(x, z) && !wall(x + dir, z) && x + dir >= 0 && x + dir < W;
        if (on && start < 0) start = z;
        if (!on && start >= 0) {
          const ex = g.originX + (dir > 0 ? x + 1 : x) * g.cell;
          lines.push([ex, g.originZ + start * g.cell, ex, g.originZ + z * g.cell, dir, 0]);
          start = -1;
        }
      }
    }
  }
  const build = (y0, y1, color) => {
    const pos = [];
    for (const [ax, az, bx, bz, nx, nz] of lines) {
      if (Math.hypot(bx - ax, bz - az) < 0.25) continue;     // skip specks
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (skip(mx, mz)) continue;
      const ox = nx * 0.02, oz = nz * 0.02;
      const A = [ax + ox, az + oz], B = [bx + ox, bz + oz];
      pos.push(A[0], y0, A[1], B[0], y0, B[1], B[0], y1, B[1], A[0], y0, A[1], B[0], y1, B[1], A[0], y1, A[1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false }));
    world.scene.add(mesh);
    return mesh;
  };
  build(y + 0.04, y + 0.1, 0xff3d9a);
  build(y + 2.33, y + 2.38, 0x9b5cff);
}
