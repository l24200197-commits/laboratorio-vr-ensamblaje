// Visitantes del pasillo: al abrir la puerta aparecen unas mujeres saludando con la mano (y un
// globo "¡Hola!"). Se construyen con primitivas y viven en coordenadas del MODELO del salón.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VISITORS, DOOR } from './config.js?v=20261125c';
import { makeLabel } from './text.js?v=20261125c';

const mat = (color, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function limb(radius, a, b) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const g = new THREE.CapsuleGeometry(radius, Math.max(0.001, va.distanceTo(vb)), 4, 10);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
  const m = va.add(vb).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}

/** Mujer de pie mirando hacia +z, saludando con la mano derecha. */
function buildWoman(p) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // se escala al aparecer
  root.add(body);
  const skin = mat(p.skin, 0.7), dress = mat(p.dress, 0.8), hair = mat(p.hair, 0.6), dark = mat(0x161616, 0.4);

  body.add(new THREE.Mesh(mergeGeometries([-1, 1].map((sx) => limb(0.045, [sx * 0.07, 0.06, 0], [sx * 0.07, 0.55, 0]))), skin));
  body.add(new THREE.Mesh(mergeGeometries([-1, 1].map((sx) => new THREE.BoxGeometry(0.08, 0.06, 0.2).translate(sx * 0.07, 0.03, 0.04))), dark));
  body.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.27, 0.52, 20).translate(0, 0.76, 0), dress)); // falda
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.26, 4, 12), dress);
  chest.scale.set(1.15, 1, 0.72);
  chest.position.y = 1.2;
  body.add(chest);

  // Brazo izquierdo abajo; brazo derecho levantado (el antebrazo se mueve para saludar).
  body.add(new THREE.Mesh(mergeGeometries([
    limb(0.042, [-0.19, 1.37, 0], [-0.23, 1.12, 0.02]),
    limb(0.037, [-0.23, 1.12, 0.02], [-0.22, 0.9, 0.06]),
  ]), dress));
  body.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8).translate(-0.22, 0.86, 0.07), skin));
  body.add(new THREE.Mesh(limb(0.042, [0.19, 1.37, 0], [0.33, 1.52, 0.05]), dress));
  const forearm = new THREE.Group();
  forearm.position.set(0.33, 1.52, 0.05);
  forearm.add(new THREE.Mesh(limb(0.036, [0, 0, 0], [0.02, 0.24, 0.02]), dress));
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin);
  hand.scale.set(0.9, 1.25, 0.5);
  hand.position.set(0.025, 0.3, 0.025);
  forearm.add(hand);
  body.add(forearm);

  // Cabeza
  body.add(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.1, 10).translate(0, 1.47, 0), skin));
  const head = new THREE.Group();
  head.position.y = 1.5;
  body.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 14).scale(0.9, 1.12, 0.98).translate(0, 0.1, 0), skin));
  head.add(new THREE.Mesh(mergeGeometries([-1, 1].map((sx) => new THREE.SphereGeometry(0.012, 8, 6).translate(sx * 0.035, 0.125, 0.088))), dark));
  head.add(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 14, Math.PI).rotateZ(Math.PI).translate(0, 0.075, 0.09), mat(0xa83a3a, 0.5))); // sonrisa
  const hairParts = [new THREE.SphereGeometry(0.108, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.95, 1.12, 1.04).rotateX(-0.25).translate(0, 0.115, -0.01)];
  if (p.hairLong) hairParts.push(new THREE.BoxGeometry(0.2, 0.34, 0.06).translate(0, -0.02, -0.075)); // cabello largo
  else hairParts.push(new THREE.SphereGeometry(0.055, 12, 10).translate(0, 0.2, -0.09));                // chongo
  head.add(new THREE.Mesh(mergeGeometries(hairParts), hair));

  root.traverse((o) => { o.raycast = () => {}; o.userData.kind = 'environment'; });
  return { root, body, forearm, head };
}

/**
 * @param {THREE.Object3D} salonRoot raíz del salón (coordenadas del modelo)
 * @returns {{group: THREE.Group, update: (now:number, dt:number, openness:number) => void}}
 */
export function buildVisitors(salonRoot, cfg = VISITORS) {
  const group = new THREE.Group();
  group.name = 'visitantes';
  salonRoot.add(group);

  // Pared del fondo del pasillo (para que se vea un pasillo y no el cielo).
  const { min, max } = DOOR.leaf;
  const depth = DOOR.hallway.depth;
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry((max[2] - min[2]) + 1.2, cfg.hallwayWall.height),
    mat(cfg.hallwayWall.color, 0.95),
  );
  wall.rotation.y = Math.PI / 2; // mira hacia +x (hacia el salón)
  wall.position.set(-depth, cfg.hallwayWall.height / 2, (min[2] + max[2]) / 2);
  wall.raycast = () => {};
  salonRoot.add(wall);

  const people = cfg.people.map((p, i) => {
    const w = buildWoman(p);
    w.root.position.set(p.x, 0, p.z);
    w.root.rotation.y = Math.PI / 2; // de frente al salón (+x del modelo)
    group.add(w.root);
    return { ...w, cfg: p, delay: i * 0.18, shown: 0 };
  });

  const bubble = makeLabel(cfg.greeting, { width: 0.32, height: 0.12, bg: '#ffffff', fg: '#c2185b', border: '#c2185b' });
  const mid = people[Math.floor(people.length / 2)];
  bubble.position.set(0, 1.95, 0);
  mid.root.add(bubble);

  group.visible = false;
  let t = 0, appear = 0;
  function update(now, dt, openness) {
    // Aparecen cuando la puerta está suficientemente abierta; se van al cerrarla.
    appear = THREE.MathUtils.clamp(appear + (openness > 0.35 ? dt : -dt) * 2.5, 0, 1 + people.length * 0.2);
    group.visible = appear > 0;
    if (!group.visible) return;
    t += dt;
    for (const w of people) {
      const k = THREE.MathUtils.clamp((appear - w.delay) / 0.6, 0, 1);
      const e = k * k * (3 - 2 * k);
      w.body.scale.setScalar(Math.max(0.001, e));
      w.root.visible = k > 0;
      w.forearm.rotation.z = Math.sin(t * 9 + w.cfg.phase) * 0.45; // saludo
      w.head.rotation.z = Math.sin(t * 2 + w.cfg.phase) * 0.06;
      w.body.position.y = Math.abs(Math.sin(t * 4.5 + w.cfg.phase)) * 0.015 * e; // saltitos
    }
    bubble.scale.setScalar(THREE.MathUtils.clamp(appear - 0.5, 0.001, 1));
    bubble.position.y = 1.95 + Math.sin(t * 3) * 0.02;
  }
  return { group, update };
}
