// Puerta interactiva del salón. El GLB trae la puerta y su marco en una sola malla ("Madera roble"):
// aquí se separan los triángulos de la HOJA (por su caja en coordenadas del modelo, ver DOOR en
// config.js) y se montan, junto con el cristal y la manija, en un pivote sobre la bisagra.
// Se abre/cierra con: toque del dedo índice (manos XR), rayo + pinza, o clic en escritorio.
import * as THREE from 'three';
import { DOOR } from './config.js?v=20261125c';

function findByMaterial(root, name) {
  let found = null;
  root.traverse((o) => { if (!found && o.isMesh && o.material?.name === name) found = o; });
  return found;
}

/** Divide una geometría en dos según `inLeaf(a, b, c)` (vértices del triángulo). */
function splitGeometry(geometry, inLeaf) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const pos = g.attributes.position;
  const names = Object.keys(g.attributes);
  const out = { leaf: names.map(() => []), rest: names.map(() => []) };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const bucket = inLeaf(a, b, c) ? out.leaf : out.rest;
    names.forEach((n, k) => {
      const attr = g.attributes[n];
      for (let v = i; v < i + 3; v++) for (let j = 0; j < attr.itemSize; j++) bucket[k].push(attr.array[v * attr.itemSize + j]);
    });
  }
  const build = (arrays) => {
    const geo = new THREE.BufferGeometry();
    names.forEach((n, k) => geo.setAttribute(n, new THREE.Float32BufferAttribute(arrays[k], g.attributes[n].itemSize)));
    return geo;
  };
  return { leaf: build(out.leaf), rest: build(out.rest), leafCount: out.leaf[0].length };
}

/**
 * @param {THREE.Object3D} root raíz del salón (ya colocada en el mundo)
 * @returns {null | {meshes: THREE.Mesh[], toggle: () => void, update: (dt:number) => void,
 *   touch: (key:string, point:THREE.Vector3|null, now:number) => boolean, isOpen: () => boolean}}
 */
export function setupDoor(root, cfg = DOOR, { onToggle } = {}) {
  const wood = findByMaterial(root, cfg.materials.wood);
  if (!wood) { console.warn('[puerta] no se encontró la malla de la puerta'); return null; }
  const glass = findByMaterial(root, cfg.materials.glass);
  const handle = findByMaterial(root, cfg.materials.handle);

  const { min, max } = cfg.leaf;
  const inside = (v) => v.x >= min[0] && v.x <= max[0] && v.y >= min[1] && v.y <= max[1] && v.z >= min[2] && v.z <= max[2];
  const parts = splitGeometry(wood.geometry, (a, b, c) => inside(a) && inside(b) && inside(c));
  if (!parts.leafCount) { console.warn('[puerta] la hoja no coincide con DOOR.leaf'); return null; }

  // Las mallas del GLB no tienen transformación propia: sus vértices ya están en coordenadas del modelo.
  const [hx, hz] = cfg.hinge;
  const pivot = new THREE.Group();
  pivot.name = 'puerta-pivote';
  pivot.position.set(hx, 0, hz);
  wood.parent.add(pivot);

  wood.geometry = parts.rest; // el marco y el dintel se quedan fijos
  const leaf = new THREE.Mesh(parts.leaf.translate(-hx, 0, -hz), wood.material);
  leaf.name = 'puerta-hoja';
  pivot.add(leaf);
  const meshes = [leaf];
  for (const m of [glass, handle]) {
    if (!m) continue;
    m.geometry = m.geometry.clone().translate(-hx, 0, -hz);
    pivot.add(m);
    meshes.push(m);
  }
  for (const m of meshes) {
    m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    m.matrixAutoUpdate = true;
    m.frustumCulled = false;
    m.raycast = THREE.Mesh.prototype.raycast; // el resto del salón no es seleccionable; la puerta sí
    m.userData.kind = 'door';
  }

  // Piso del pasillo exterior, para no ver el vacío al abrir.
  const h = cfg.hallway;
  const hall = new THREE.Mesh(
    new THREE.PlaneGeometry(h.depth, (max[2] - min[2]) + 1.2),
    new THREE.MeshStandardMaterial({ color: h.color, roughness: 0.95 }),
  );
  hall.rotation.x = -Math.PI / 2;
  hall.position.set(-h.depth / 2, 0.001, (min[2] + max[2]) / 2);
  hall.raycast = () => {};
  hall.userData.kind = 'environment';
  wood.parent.add(hall);

  const openAngle = THREE.MathUtils.degToRad(cfg.openAngleDeg);
  let open = false, angle = 0;
  const touching = new Map(); // key -> estaba tocando en el cuadro anterior
  let lastToggle = -Infinity;
  const box = new THREE.Box3();

  function toggle() {
    open = !open;
    lastToggle = performance.now();
    onToggle?.(open);
  }

  function update(dt) {
    const target = open ? openAngle : 0;
    const step = cfg.speed * dt;
    angle = Math.abs(target - angle) <= step ? target : angle + Math.sign(target - angle) * step;
    pivot.rotation.y = angle;
  }

  /** Toque físico (dedo/control): alterna solo al ENTRAR en contacto, con tiempo de espera. */
  function touch(key, point, now) {
    if (!point) { touching.delete(key); return false; }
    box.setFromObject(pivot).expandByScalar(cfg.touchMargin);
    const inContact = box.containsPoint(point);
    const was = touching.get(key) ?? false;
    touching.set(key, inContact);
    if (inContact && !was && now - lastToggle > cfg.touchCooldownMs) { toggle(); return true; }
    return false;
  }

  return { meshes, toggle, update, touch, isOpen: () => open, openness: () => angle / openAngle };
}
