// Construcción de la escena: ambiente, mesa, piezas y destinos. Solo geometrías de Three.js
// (sin modelos descargados): ligero para Quest 3 y sin dependencias de licencias.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAB, BOX, CLASSROOM, PIECES, PIECE_ROW_Z, TARGETS, TARGET_ROW_Z } from './config.js?v=20261125b';
import { makeLabel } from './text.js?v=20261125b';
import { deskGeometries } from './classroom.js?v=20261125b';

const SHAPES = {
  // half = semialtura; r = radio horizontal que usa la física (caja de colisión vertical).
  box: { make: () => new THREE.BoxGeometry(0.09, 0.09, 0.09), half: 0.045, r: 0.045 },
  sphere: { make: () => new THREE.SphereGeometry(0.05, 24, 16), half: 0.05, r: 0.05 },
  cone: { make: () => new THREE.ConeGeometry(0.055, 0.11, 24), half: 0.055, r: 0.055 },
  cylinder: { make: () => new THREE.CylinderGeometry(0.045, 0.045, 0.1, 24), half: 0.05, r: 0.045 },
  prism: { make: () => new THREE.CylinderGeometry(0.062, 0.062, 0.1, 3), half: 0.05, r: 0.06 },
};

function shapeOf(name) {
  const s = SHAPES[name];
  if (!s) throw new Error(`Forma no soportada: ${name}`);
  return s;
}

/** Entorno genérico (círculo + pared). Solo se usa como RESPALDO si el salón no carga. */
export function buildGenericEnvironment(scene) {
  scene.background = new THREE.Color(0x0d1526); // fondo virtual OPACO (sin passthrough)

  scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(1, 3, 1);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4, 48),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // Anillo que delimita la zona de trabajo
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.45, 1.5, 64),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  scene.add(ring);

  // Pared de fondo suave
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 3),
    new THREE.MeshStandardMaterial({ color: 0x15233d }),
  );
  wall.position.set(0, 1.5, -2.5);
  scene.add(wall);
}

/**
 * Carga el salón (GLB) y lo coloca según SALON (config.js). Lanza un error si el archivo falta o no
 * es un GLB válido; main.js lo atiende mostrando el mensaje y usando el entorno de respaldo.
 * El salón es solo decorado: se desactiva su raycast para que los rayos de manos/ratón no lo vean.
 */
export async function loadSalon(scene, cfg, onProgress) {
  const gltf = await new GLTFLoader().loadAsync(cfg.url, onProgress);
  const root = gltf.scene;
  root.name = 'salon';
  root.position.fromArray(cfg.position);
  root.rotation.y = THREE.MathUtils.degToRad(cfg.rotationYDeg);
  root.updateMatrixWorld(true);

  root.traverse((o) => {
    o.userData.kind = 'environment';
    o.raycast = () => {}; // nunca es objetivo de rayos
    o.matrixAutoUpdate = false; // estático: no se recalcula cada cuadro
    if (o.isMesh) o.frustumCulled = true;
  });
  scene.add(root);

  const bounds = new THREE.Box3().setFromObject(root);
  const L = cfg.lighting;
  scene.background = new THREE.Color(L.background);
  scene.add(new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiIntensity));
  const sun = new THREE.DirectionalLight(L.sunColor, L.sunIntensity);
  sun.position.fromArray(L.sunPosition);
  scene.add(sun);

  if (cfg.ceiling?.enabled) {
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x, size.z),
      // Mira hacia abajo, donde solo llega luz hemisférica de "suelo": se compensa con un poco de emisión.
      new THREE.MeshStandardMaterial({ color: cfg.ceiling.color, emissive: cfg.ceiling.color, emissiveIntensity: 0.3, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
    );
    ceiling.name = 'techo';
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(center.x, bounds.max.y, center.z);
    ceiling.raycast = () => {};
    ceiling.userData.kind = 'environment';
    scene.add(ceiling);
  }
  return { root, bounds };
}

/** Mesa del laboratorio: pupitre grande (tablero azul, patas negras) igual a los del salón. */
export function buildTable() {
  const { width, depth, centerZ } = LAB.table;
  const top = LAB.tableTopY;
  const thickness = 0.04;
  const { top: topGeo, frame } = deskGeometries({ width, depth, height: top, topThickness: thickness });
  const group = new THREE.Group();
  group.name = 'mesa-laboratorio';
  const c = CLASSROOM.colors;
  const slab = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ color: c.top, roughness: 0.4, metalness: 0.05 }));
  const legs = new THREE.Mesh(frame, new THREE.MeshStandardMaterial({ color: c.frame, roughness: 0.5, metalness: 0.3 }));
  group.add(slab, legs);
  group.position.set(0, 0, centerZ);
  group.traverse((o) => { o.raycast = () => {}; o.userData.kind = 'environment'; });
  // Cara superior para la física (coordenadas de mundo).
  group.userData.solids = [{ min: [-width / 2, top - thickness, centerZ - depth / 2], max: [width / 2, top, centerZ + depth / 2] }];
  return group;
}

/** @returns {Map<string, {config, mesh, material, startPosition, startQuaternion, flashUntil:number, r:number, half:number}>} */
export function buildPieces(parent) {
  const pieces = new Map();
  for (const cfg of PIECES) {
    const shape = shapeOf(cfg.shape);
    const material = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.45, metalness: 0.1 });
    const mesh = new THREE.Mesh(shape.make(), material);
    mesh.name = `pieza-${cfg.id}`;
    mesh.userData = { kind: 'piece', id: cfg.id };
    mesh.position.set(cfg.startX, LAB.tableTopY + shape.half, PIECE_ROW_Z);
    parent.add(mesh);
    pieces.set(cfg.id, {
      config: cfg,
      mesh,
      material,
      r: shape.r,
      half: shape.half,
      startPosition: mesh.position.clone(),
      startQuaternion: mesh.quaternion.clone(),
      flashUntil: 0,
    });
  }
  return pieces;
}

// Geometría de una caja abierta (piso + 4 paredes + aro de color en el borde), con el fondo en y = 0.
// Color por vértice: cuerpo oscuro y borde brillante, para que la caja se lea aunque no haya etiqueta a la vista.
function boxGeometry(bodyColor, rimColor) {
  const { inner, wall, floor, height } = BOX;
  const o = inner + 2 * wall;
  const parts = [];
  const add = (w, h, d, x, y, z, color) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    parts.push(g);
  };
  const body = new THREE.Color(bodyColor), rim = new THREE.Color(rimColor);
  const rimH = 0.014, off = inner / 2 + wall / 2;
  add(o, floor, o, 0, floor / 2, 0, body);
  add(o, height, wall, 0, height / 2, -off, body);       // fondo
  add(o, height, wall, 0, height / 2, off, body);        // frente
  add(wall, height, inner, -off, height / 2, 0, body);   // izquierda
  add(wall, height, inner, off, height / 2, 0, body);    // derecha
  add(o + 0.006, rimH, wall + 0.006, 0, height - rimH / 2, -off, rim);
  add(o + 0.006, rimH, wall + 0.006, 0, height - rimH / 2, off, rim);
  add(wall + 0.006, rimH, inner, -off, height - rimH / 2, 0, rim);
  add(wall + 0.006, rimH, inner, off, height - rimH / 2, 0, rim);
  return mergeGeometries(parts);
}

/**
 * Cajas de depósito (una por pieza). Devuelve Map id -> caja con:
 *  - volume: {id, cx, cz, innerHalf, floorY, rimY} para validar el depósito (reglas puras)
 *  - solids: AABB del piso y las 4 paredes para la física
 * @returns {Map<string, {id, pieceId, label, mesh, material, baseColor, volume, solids, position, flashUntil:number}>}
 */
export function buildTargets(parent) {
  const targets = new Map();
  const byId = new Map(PIECES.map((p) => [p.id, p]));
  const { inner, wall, floor, height } = BOX;
  const o = inner + 2 * wall;
  const y0 = LAB.tableTopY;
  for (const cfg of TARGETS) {
    const piece = byId.get(cfg.pieceId);
    if (!piece) throw new Error(`La caja ${cfg.id} apunta a una pieza inexistente`);
    const bright = new THREE.Color(piece.color);
    const baseColor = bright.clone().multiplyScalar(0.55).getHex();

    // El color va en los vértices; el rojo/verde de retroalimentación se aplica como emisión.
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });
    material.emissive.setHex(0x000000);
    const mesh = new THREE.Mesh(boxGeometry(baseColor, bright.getHex()), material);
    mesh.name = cfg.id;
    mesh.position.set(cfg.x, y0, TARGET_ROW_Z);
    mesh.userData.kind = 'box';
    parent.add(mesh);

    // Etiqueta en la cara frontal (la que mira al usuario).
    const label = makeLabel(piece.label, { width: 0.17, height: 0.05, border: `#${piece.color.toString(16).padStart(6, '0')}` });
    label.position.set(0, height * 0.45, o / 2 + 0.002);
    label.userData.kind = 'label';
    mesh.add(label);

    const cx = cfg.x, cz = TARGET_ROW_Z, ih = inner / 2;
    const solids = [
      { min: [cx - o / 2, y0, cz - o / 2], max: [cx + o / 2, y0 + floor, cz + o / 2] },                                  // piso
      { min: [cx - o / 2, y0, cz - o / 2], max: [cx + o / 2, y0 + height, cz - ih], nudge: 'z', inward: 1 },             // fondo
      { min: [cx - o / 2, y0, cz + ih], max: [cx + o / 2, y0 + height, cz + o / 2], nudge: 'z', inward: -1 },            // frente
      { min: [cx - o / 2, y0, cz - ih], max: [cx - ih, y0 + height, cz + ih], nudge: 'x', inward: 1 },                   // izquierda
      { min: [cx + ih, y0, cz - ih], max: [cx + o / 2, y0 + height, cz + ih], nudge: 'x', inward: -1 },                  // derecha
    ];

    targets.set(cfg.id, {
      id: cfg.id,
      pieceId: cfg.pieceId,
      label: piece.label,
      mesh,
      material,
      baseColor,
      volume: { id: cfg.id, cx, cz, innerHalf: ih, floorY: y0 + floor, rimY: y0 + height },
      solids,
      position: new THREE.Vector3(cx, y0 + floor, cz), // fondo de la caja (referencia)
      flashUntil: 0,
    });
  }
  return targets;
}
