// Zona del profesor: tarima, escritorio de tablero de madera, silla y el profesor sentado.
// Solo primitivas de Three.js (sin descargas). El profesor respira y voltea la cabeza hacia el usuario.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CLASSROOM, TEACHER } from './config.js?v=20261125b';
import { deskGeometries, chairGeometries } from './classroom.js?v=20261125b';

const mat = (color, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Cápsula entre dos puntos (extremidades). */
function limb(radius, a, b) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CapsuleGeometry(radius, Math.max(0.001, len), 4, 10);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyQuaternion(q);
  const mid = va.add(vb).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

function boxAt(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/**
 * Profesor sentado, mirando hacia +z, con la cadera sobre el asiento (y local 0 = piso donde está la silla).
 * @returns {{group: THREE.Group, head: THREE.Object3D, torso: THREE.Object3D}}
 */
export function buildProfessor(c = TEACHER.professor) {
  const group = new THREE.Group();
  group.name = 'profesor';
  const skin = mat(c.skin, 0.7), shirt = mat(c.shirt, 0.8), pants = mat(c.pants, 0.85), shoes = mat(c.shoes, 0.5), hair = mat(c.hair, 0.9);

  // Piernas: muslos hacia delante, espinillas hacia abajo, zapatos.
  const legs = [];
  const shoeParts = [];
  for (const sx of [-1, 1]) {
    const x = sx * 0.1;
    legs.push(limb(0.072, [x, 0.55, -0.02], [x, 0.55, 0.38]));
    legs.push(limb(0.058, [x, 0.55, 0.4], [x, 0.1, 0.44]));
    shoeParts.push(boxAt(0.1, 0.08, 0.25, x, 0.04, 0.49));
  }
  legs.push(boxAt(0.34, 0.16, 0.3, 0, 0.56, -0.02)); // cadera
  group.add(new THREE.Mesh(mergeGeometries(legs), pants));
  group.add(new THREE.Mesh(mergeGeometries(shoeParts), shoes));

  // Torso (pivote en la cadera para la respiración/inclinación).
  const torso = new THREE.Group();
  torso.position.set(0, 0.62, -0.04);
  torso.rotation.x = 0.08; // ligeramente inclinado hacia el escritorio
  group.add(torso);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 4, 12), shirt);
  chest.scale.set(1.2, 1, 0.72);
  chest.position.y = 0.27;
  torso.add(chest);

  // Brazos: hombro -> codo -> mano apoyada en el escritorio (coordenadas del torso).
  const arms = [], hands = [];
  for (const sx of [-1, 1]) {
    const sh = [sx * 0.23, 0.46, 0], el = [sx * 0.27, 0.22, 0.12], wr = [sx * 0.16, 0.2, 0.4];
    arms.push(limb(0.052, sh, el), limb(0.045, el, wr));
    const h = new THREE.SphereGeometry(0.05, 10, 8);
    h.scale(1, 0.6, 1.3);
    h.translate(wr[0], wr[1], wr[2] + 0.04);
    hands.push(h);
  }
  torso.add(new THREE.Mesh(mergeGeometries(arms), shirt));
  torso.add(new THREE.Mesh(mergeGeometries(hands), skin));

  // Cuello y cabeza (pivote en el cuello para voltear).
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), skin);
  neck.position.y = 0.58;
  torso.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.62;
  torso.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), skin);
  face.scale.set(0.92, 1.12, 1);
  face.position.y = 0.11;
  head.add(face);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.scale.set(0.95, 1.1, 1.04);
  hairCap.position.set(0, 0.125, -0.008);
  hairCap.rotation.x = -0.35;
  head.add(hairCap);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 8), skin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.1, 0.11);
  head.add(nose);
  const eyes = new THREE.Mesh(
    mergeGeometries([-1, 1].map((sx) => new THREE.SphereGeometry(0.013, 8, 6).translate(sx * 0.037, 0.135, 0.092))),
    mat(0x1a1a1a, 0.3),
  );
  head.add(eyes);
  const ears = new THREE.Mesh(
    mergeGeometries([-1, 1].map((sx) => new THREE.SphereGeometry(0.025, 8, 6).scale(0.5, 1, 0.8).translate(sx * 0.098, 0.11, 0))),
    skin,
  );
  head.add(ears);

  group.traverse((o) => { o.raycast = () => {}; o.userData.kind = 'environment'; });
  return { group, head, torso };
}

/**
 * Tarima + escritorio + silla + profesor.
 * @returns {{group: THREE.Group, solids: Array, update: (now:number, viewer:THREE.Vector3) => void}}
 */
export function buildTeacherArea(cfg = TEACHER) {
  const group = new THREE.Group();
  group.name = 'zona-profesor';
  const { platform: pf, desk: dk } = cfg;
  const P = pf.height;
  const solids = [];

  // Tarima
  const pw = pf.max[0] - pf.min[0], pd = pf.max[1] - pf.min[1];
  const pcx = (pf.min[0] + pf.max[0]) / 2, pcz = (pf.min[1] + pf.max[1]) / 2;
  const plat = new THREE.Mesh(new THREE.BoxGeometry(pw, P, pd), mat(pf.color, 0.9));
  plat.position.set(pcx, P / 2, pcz);
  group.add(plat);
  solids.push({ min: [pf.min[0], 0, pf.min[1]], max: [pf.max[0], P, pf.max[1]] });

  // Escritorio (mismo diseño de estructura que los pupitres, tablero de madera)
  const frameMat = mat(CLASSROOM.colors.frame, 0.5, 0.3);
  const dg = deskGeometries({ width: dk.width, depth: dk.depth, height: dk.height, topThickness: dk.topThickness });
  const desk = new THREE.Group();
  desk.position.set(dk.x, P, dk.z);
  desk.add(new THREE.Mesh(dg.top, mat(dk.topColor, 0.55)), new THREE.Mesh(dg.frame, frameMat));
  // Laptop cerrada y papeles sobre el escritorio
  const y = dk.height;
  const laptop = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.022, 0.24), mat(0x3a3d42, 0.4, 0.5));
  laptop.position.set(0.32, y + 0.011, 0.02);
  laptop.rotation.y = -0.2;
  const papers = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.008, 0.29), mat(0xf4f1ea, 0.9));
  papers.position.set(-0.3, y + 0.004, 0.05);
  papers.rotation.y = 0.15;
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), mat(0x1d4ed8, 0.4));
  pen.rotation.set(0, 0.5, Math.PI / 2);
  pen.position.set(-0.13, y + 0.006, 0.08);
  desk.add(laptop, papers, pen);
  group.add(desk);
  solids.push({
    min: [dk.x - dk.width / 2, P + dk.height - dk.topThickness, dk.z - dk.depth / 2],
    max: [dk.x + dk.width / 2, P + dk.height, dk.z + dk.depth / 2],
  });

  // Silla (girada 180°: mira hacia los alumnos) con el profesor sentado
  const cg = chairGeometries();
  const chair = new THREE.Group();
  chair.position.set(dk.x, P, cfg.chairZ);
  chair.rotation.y = Math.PI;
  chair.add(new THREE.Mesh(cg.shell, mat(CLASSROOM.colors.chair, 0.55)), new THREE.Mesh(cg.frame, frameMat));
  group.add(chair);

  const prof = buildProfessor(cfg.professor);
  prof.group.position.set(dk.x, P, cfg.chairZ);
  group.add(prof.group);

  group.traverse((o) => { if (o.isMesh) o.raycast = () => {}; o.userData.kind = 'environment'; });

  const headWorld = new THREE.Vector3();
  let yaw = 0;
  function update(now, viewer) {
    const t = now / 1000;
    prof.torso.scale.y = 1 + Math.sin(t * 1.6) * 0.008; // respiración
    // Voltea la cabeza (suavemente y con límite) hacia el usuario; si está detrás, mira al frente.
    prof.head.getWorldPosition(headWorld);
    let target = Math.atan2(viewer.x - headWorld.x, viewer.z - headWorld.z);
    if (Math.abs(target) > cfg.professor.maxHeadYaw * 1.6) target = 0;
    target = THREE.MathUtils.clamp(target, -cfg.professor.maxHeadYaw, cfg.professor.maxHeadYaw);
    yaw += (target - yaw) * 0.04;
    prof.head.rotation.y = yaw + Math.sin(t * 0.37) * 0.05;
  }

  return { group, solids, update };
}
