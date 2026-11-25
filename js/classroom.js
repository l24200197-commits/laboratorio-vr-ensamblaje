// Mobiliario del salón: pupitres de tablero azul con patas negras y sillas de plástico negro,
// construidos con cajas de Three.js (sin descargas ni texturas). Se dibujan con InstancedMesh:
// 24 pupitres + 24 sillas = 4 draw calls y ~4 000 triángulos en total.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CLASSROOM } from './config.js?v=20261125b';

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/**
 * Geometrías de un pupitre centrado en el origen (x ancho, z fondo), con el piso en y = 0:
 * tablero azul + estructura de tubo negro (4 patas, 2 largueros altos, 2 bajos, 1 travesaño).
 */
export function deskGeometries({ width: w, depth: d, height: h, topThickness: t }) {
  const top = box(w, t, d, 0, h - t / 2, 0);
  const frame = [];
  const legH = h - t;
  const lx = w / 2 - 0.05, lz = d / 2 - 0.05;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) frame.push(box(0.04, legH, 0.04, sx * lx, legH / 2, sz * lz));
    frame.push(box(0.03, 0.04, d - 0.1, sx * lx, legH - 0.03, 0)); // larguero alto
    frame.push(box(0.03, 0.03, d - 0.1, sx * lx, 0.22, 0));        // larguero bajo
  }
  frame.push(box(w - 0.1, 0.04, 0.03, 0, legH - 0.03, lz));        // travesaño trasero
  return { top, frame: mergeGeometries(frame) };
}

/** Silla con el frente hacia -Z: asiento y respaldo de plástico, estructura de tubo. */
export function chairGeometries() {
  const shell = mergeGeometries([
    box(0.42, 0.04, 0.42, 0, 0.45, 0),        // asiento
    box(0.40, 0.26, 0.03, 0, 0.74, 0.205),    // respaldo
  ]);
  const frame = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) frame.push(box(0.025, 0.43, 0.025, sx * 0.17, 0.215, sz * 0.17));
    frame.push(box(0.02, 0.02, 0.34, sx * 0.17, 0.2, 0));      // larguero
    frame.push(box(0.025, 0.3, 0.025, sx * 0.17, 0.62, 0.19)); // poste del respaldo
  }
  return { shell, frame: mergeGeometries(frame) };
}

// Generador pseudoaleatorio con semilla fija: la distribución de sillas es la misma en cada carga.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @returns {{group: THREE.Group, solids: Array, desks: number}}
 *   solids: la cara superior de cada pupitre como AABB para la física (una pieza puede caer encima).
 */
export function buildClassroom(cfg = CLASSROOM) {
  const group = new THREE.Group();
  group.name = 'mobiliario';
  const solids = [];
  const { desk, columnsX, rowsZ, colors, chairJitter } = cfg;
  const count = columnsX.length * rowsZ.length;

  const dg = deskGeometries(desk);
  const cg = chairGeometries();
  const matTop = new THREE.MeshStandardMaterial({ color: colors.top, roughness: 0.4, metalness: 0.05 });
  const matFrame = new THREE.MeshStandardMaterial({ color: colors.frame, roughness: 0.5, metalness: 0.3 });
  const matChair = new THREE.MeshStandardMaterial({ color: colors.chair, roughness: 0.55, metalness: 0.05 });

  const parts = {
    deskTop: new THREE.InstancedMesh(dg.top, matTop, count),
    deskFrame: new THREE.InstancedMesh(dg.frame, matFrame, count),
    chairShell: new THREE.InstancedMesh(cg.shell, matChair, count),
    chairFrame: new THREE.InstancedMesh(cg.frame, matFrame, count),
  };

  const rng = mulberry32(2026);
  const m = new THREE.Matrix4(), rot = new THREE.Matrix4(), pos = new THREE.Matrix4();
  let i = 0;
  for (const z of rowsZ) {
    for (const x of columnsX) {
      m.makeTranslation(x, 0, z);
      parts.deskTop.setMatrixAt(i, m);
      parts.deskFrame.setMatrixAt(i, m);

      // Silla detrás del pupitre (z mayor), medio metida bajo el tablero, con una pequeña variación fija.
      const jx = (rng() - 0.5) * 2 * chairJitter, jz = (rng() - 0.5) * 2 * chairJitter, yaw = (rng() - 0.5) * 4 * chairJitter;
      pos.makeTranslation(x + jx, 0, z + desk.depth / 2 + 0.15 + jz);
      rot.makeRotationY(yaw);
      m.multiplyMatrices(pos, rot);
      parts.chairShell.setMatrixAt(i, m);
      parts.chairFrame.setMatrixAt(i, m);

      solids.push({
        min: [x - desk.width / 2, desk.height - desk.topThickness, z - desk.depth / 2],
        max: [x + desk.width / 2, desk.height, z + desk.depth / 2],
      });
      i++;
    }
  }
  for (const [name, mesh] of Object.entries(parts)) {
    mesh.name = name;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;       // 4 mallas: no compensa calcular la esfera envolvente
    mesh.raycast = () => {};          // decorado: los rayos nunca lo ven
    mesh.userData.kind = 'environment';
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return { group, solids, desks: count };
}
