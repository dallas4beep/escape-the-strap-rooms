"""Export the Backrooms USDZ scene for the game.

Writes:
  level.glb     geometry only (positions + UVs), one mesh per material, named after it
  level.json    texture file for each material, floor height, bounds
  walls.png     top-down wall map (white = blocked), 10 cm per pixel
Textures are copied as the original JPEGs.
"""
import sys, os, json, shutil, numpy as np, trimesh
from PIL import Image
from pxr import Usd, UsdGeom, UsdShade

src, out = sys.argv[1], sys.argv[2]
base = os.path.dirname(src)
st = Usd.Stage.Open(src)
xc = UsdGeom.XformCache()
by_mat = {}            # material name -> list of (positions, uvs, faces)
tex_of = {}

def material_info(prim):
    mat, _ = UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial()
    if not mat:
        return 'none', None
    tex = None
    for p in Usd.PrimRange(mat.GetPrim()):
        sh = UsdShade.Shader(p)
        if sh and sh.GetIdAttr().Get() == 'UsdUVTexture':
            f = sh.GetInput('file').Get()
            if f:
                tex = os.path.join(base, f.path)
                break
    return mat.GetPrim().GetName(), tex

for p in st.Traverse():
    if p.GetTypeName() != 'Mesh':
        continue
    m = UsdGeom.Mesh(p)
    pts = np.array(m.GetPointsAttr().Get(), dtype=np.float64)
    cnt = np.array(m.GetFaceVertexCountsAttr().Get())
    idx = np.array(m.GetFaceVertexIndicesAttr().Get())
    M = np.array(xc.GetLocalToWorldTransform(p)).T
    pts = (np.c_[pts, np.ones(len(pts))] @ M.T)[:, :3] * 0.01      # centimetres to metres
    pv = UsdGeom.PrimvarsAPI(p)
    uvp = next((pv.GetPrimvar(n) for n in ('st', 'UVMap', 'st0', 'map1') if pv.HasPrimvar(n)), None)
    fv_pos = pts[idx]
    if uvp:
        uv = np.array(uvp.Get())
        ui = np.array(uvp.GetIndices()) if uvp.IsIndexed() else None
        if uvp.GetInterpolation() == 'faceVarying':
            fv_uv = uv[ui] if ui is not None else uv
        else:
            fv_uv = (uv[ui] if ui is not None else uv)[idx]
    else:
        fv_uv = np.zeros((len(idx), 2))
    faces = []
    s = 0
    for c in cnt:
        for k in range(1, c - 1):
            faces.append([s, s + k, s + k + 1])
        s += c
    name, tex = material_info(p)
    tex_of[name] = tex
    by_mat.setdefault(name, []).append((fv_pos, fv_uv, np.array(faces)))

scene = trimesh.Scene()
all_meshes = []
os.makedirs(out, exist_ok=True)
textures = {}
for name, parts in by_mat.items():
    off = 0; P = []; U = []; F = []
    for pos, uv, fa in parts:
        P.append(pos); U.append(uv); F.append(fa + off); off += len(pos)
    P = np.vstack(P); U = np.vstack(U); F = np.vstack(F)
    mesh = trimesh.Trimesh(vertices=P, faces=F, process=False)
    mesh.visual = trimesh.visual.TextureVisuals(uv=U)
    scene.add_geometry(mesh, node_name=name, geom_name=name)
    all_meshes.append(mesh)
    t = tex_of.get(name)
    if t and os.path.exists(t):
        dst = os.path.basename(t)
        shutil.copy(t, os.path.join(out, dst))
        textures[name] = dst
scene.export(os.path.join(out, 'level.glb'))

# Wall map: slice the whole level at several heights and rasterise the cuts.
full = trimesh.util.concatenate(all_meshes)
lo, hi = full.bounds
floor_y = -0.13
RES = 0.1
W = int(np.ceil((hi[0] - lo[0]) / RES)) + 2
H = int(np.ceil((hi[2] - lo[2]) / RES)) + 2
grid = np.zeros((H, W), dtype=np.uint8)
for h in (0.25, 0.6, 1.0, 1.6):
    segs = trimesh.intersections.mesh_plane(full, plane_normal=[0, 1, 0], plane_origin=[0, floor_y + h, 0])
    for a, b in segs:
        n = int(np.ceil(np.linalg.norm(b - a) / (RES / 3))) + 1
        xs = np.linspace(a[0], b[0], n); zs = np.linspace(a[2], b[2], n)
        gx = ((xs - lo[0]) / RES).astype(int) + 1; gz = ((zs - lo[2]) / RES).astype(int) + 1
        ok = (gx >= 0) & (gx < W) & (gz >= 0) & (gz < H)
        grid[gz[ok], gx[ok]] = 255
Image.fromarray(grid).save(os.path.join(out, 'walls.png'), optimize=True)
json.dump({
    'textures': textures,
    'floorY': floor_y,
    'grid': {'originX': float(lo[0]) - RES, 'originZ': float(lo[2]) - RES, 'cell': RES, 'width': W, 'height': H},
    'bounds': [list(map(float, lo)), list(map(float, hi))],
}, open(os.path.join(out, 'level.json'), 'w'), indent=1)
print('materials', len(by_mat), 'textured', len(textures), 'grid', W, H, 'glb KB', os.path.getsize(os.path.join(out, 'level.glb')) // 1024)
