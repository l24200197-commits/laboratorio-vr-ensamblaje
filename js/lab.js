// Controlador del laboratorio: máquina de estados de piezas y reto.
// Las entradas (manos XR o ratón) SOLO llaman grab / drop / releaseToStart / setHover;
// toda decisión de negocio ocurre aquí.
//
// Flujo de una pieza: disponible → seleccionada → en movimiento → (suelta) cayendo → colocada
//                                                                              └→ disponible (donde cayó)
// Al soltarla actúa la gravedad (js/physics.js). Cuando queda quieta se evalúa en qué caja quedó.
// Si no quedó en su caja, la pieza se QUEDA donde cayó (piso, mesa, otra caja): hay que recogerla.
import * as THREE from 'three';
import { LAB, CELEBRATION } from './config.js?v=20261125c';
import { validateDeposit } from './rules.js?v=20261125c';
import { createBody } from './physics.js?v=20261125c';
import { STATUS, PHASE, formatTime } from './state.js?v=20261125c';

const C = { none: 0x000000, hover: 0xffffff, error: 0xff1a1a, ok: 0x22c55e };

export function createLabController({ store, pieces, targets, hud, sounds, physics, onComplete, onReset }) {
  const boxVolumes = [...targets.values()].map((t) => t.volume);
  const perTarget = new Map(); // id de caja -> cuántas piezas le corresponden
  for (const p of pieces.values()) perTarget.set(p.config.target, (perTarget.get(p.config.target) ?? 0) + 1);
  const P = LAB.physics;
  const bodies = new Map();      // id -> cuerpo físico de las piezas que están cayendo
  const IDENTITY_Q = new THREE.Quaternion();
  let lastTick = null;
  const hovers = new Map();      // fuente -> id de pieza apuntada
  const cancellers = new Set();  // funciones de las entradas para soltar sin validar
  const grabPositions = new Map();
  const tmp = new THREE.Vector3();
  const [minB, maxB] = [new THREE.Vector3(...LAB.dragBounds.min), new THREE.Vector3(...LAB.dragBounds.max)];

  function grab(id, holder, now = performance.now()) {
    const p = store.piece(id);
    if (!p || p.status !== STATUS.AVAILABLE) return false; // bloqueada, colocada o ya sujeta por otra mano
    store.setPiece(id, STATUS.SELECTED, holder);
    grabPositions.set(id, pieces.get(id).mesh.getWorldPosition(new THREE.Vector3()));
    store.startTimer(now);
    if (store.get().phase === PHASE.PENDING) store.setPhase(PHASE.ACTIVE, 'Lleva la pieza sobre su caja y suéltala');
    return true;
  }

  function isHeld(id) {
    const s = store.piece(id)?.status;
    return s === STATUS.SELECTED || s === STATUS.MOVING;
  }

  /**
   * Suelta la pieza: la entrada ya no la sostiene y empieza a caer. NO se valida aquí: la validación
   * ocurre cuando la pieza queda quieta (settle). `velocity` [x,y,z] m/s es la de la mano al soltar.
   */
  function drop(id, now = performance.now(), velocity = [0, 0, 0]) {
    if (!isHeld(id)) return;
    const piece = pieces.get(id);
    piece.mesh.position.clamp(minB, maxB); // limita el área de trabajo
    const v = new THREE.Vector3(...velocity).multiplyScalar(P.throwScale);
    if (v.length() > P.maxThrowSpeed) v.setLength(P.maxThrowSpeed);
    const p = piece.mesh.position;
    bodies.set(id, createBody({ position: [p.x, p.y, p.z], velocity: [v.x, v.y, v.z], r: piece.r, h: piece.half }));
    store.setPiece(id, STATUS.FALLING, null);
  }

  /** Sólidos dinámicos: las demás piezas que no están en una mano (se pueden apilar/golpear). */
  const dynamic = [];
  function dynamicSolids(exceptId) {
    dynamic.length = 0;
    for (const q of pieces.values()) {
      if (q.config.id === exceptId || isHeld(q.config.id)) continue;
      const { x, y, z } = q.mesh.position;
      dynamic.push({ min: [x - q.r, y - q.half, z - q.r], max: [x + q.r, y + q.half, z + q.r], nudge: 'xz' });
    }
    return dynamic;
  }

  function stepPhysics(dt, now) {
    if (dt > 0.05) dt = 0.05; // pestañeo / pausa: no simular saltos enormes
    for (const [id, body] of bodies) {
      const piece = pieces.get(id);
      physics.advance(body, dt, dynamicSolids(id));
      piece.mesh.position.set(body.pos[0], body.pos[1], body.pos[2]);
      piece.mesh.quaternion.slerp(IDENTITY_Q, Math.min(1, dt * 14)); // se endereza al caer
      if (body.restTime >= P.restSeconds || body.age >= P.maxFallSeconds) settle(id, now);
    }
  }

  /** La pieza quedó quieta: se evalúa en qué caja está. */
  function settle(id, now) {
    bodies.delete(id);
    const piece = pieces.get(id);
    piece.mesh.quaternion.copy(IDENTITY_Q);
    const result = validateDeposit(piece.mesh.position, piece.config.target, boxVolumes);
    if (result.ok) place(piece, now);
    else reject(piece, result, now);
  }

  function place(piece, now) {
    store.setPiece(piece.config.id, STATUS.PLACED, null); // se queda donde cayó, dentro de su caja
    const n = store.placedCount();
    if (n === store.total) {
      store.stopTimer(now);
      store.setPhase(PHASE.DONE, `${CELEBRATION.message} Tiempo final ${formatTime(store.elapsedMs(now))}`);
      sounds.finish();
      onComplete?.();
    } else {
      store.setPhase(PHASE.ACTIVE, `¡Correcto! ${piece.config.label} depositado en su caja (${n}/${store.total})`);
      sounds.success();
    }
  }

  /** No quedó en su caja: se queda donde cayó y vuelve a estar disponible (hay que recogerla). */
  function reject(piece, result, now) {
    store.setPiece(piece.config.id, STATUS.AVAILABLE, null);
    if (result.reason === 'caja') {
      const until = now + LAB.feedbackMs;
      const t = targets.get(result.boxId);
      piece.flashUntil = until;
      t.flashUntil = until;
      store.setPhase(PHASE.ERROR, `Error: ${piece.config.label} no va en la caja ${t.label}. Sácala y llévala a la suya`, until);
      sounds.error();
    } else {
      const where = piece.mesh.position.y < 0.3 ? 'en el piso' : 'fuera de las cajas';
      store.setPhase(PHASE.ACTIVE, `${piece.config.label} quedó ${where}: recógela y llévala a su caja`);
      sounds.drop();
    }
  }

  /** Pérdida de tracking / cancelación: devuelve la pieza sin validar ni sumar. */
  function releaseToStart(id) {
    if (!isHeld(id)) return;
    resetTransform(pieces.get(id));
    store.setPiece(id, STATUS.AVAILABLE, null);
    store.setPhase(PHASE.ACTIVE, 'Seguimiento perdido: la pieza volvió a su lugar');
  }

  function resetTransform(piece) {
    piece.mesh.position.copy(piece.startPosition);
    piece.mesh.quaternion.copy(piece.startQuaternion);
  }

  function reset() {
    for (const cancel of cancellers) cancel(); // suelta selecciones activas primero
    bodies.clear();
    for (const p of pieces.values()) { resetTransform(p); p.flashUntil = 0; }
    for (const t of targets.values()) t.flashUntil = 0;
    hovers.clear();
    grabPositions.clear();
    store.reset();
    onReset?.();
    sounds.click();
  }

  function setHover(source, id) {
    if (id) hovers.set(source, id); else hovers.delete(source);
  }

  function updateMovingStatus() {
    for (const [id, start] of grabPositions) {
      const p = store.piece(id);
      if (p.status !== STATUS.SELECTED) { if (p.status !== STATUS.MOVING) grabPositions.delete(id); continue; }
      if (pieces.get(id).mesh.getWorldPosition(tmp).distanceTo(start) > 0.01) store.setPiece(id, STATUS.MOVING, p.holder);
    }
  }

  function applyVisuals(now) {
    const hovered = new Set(hovers.values());
    for (const p of pieces.values()) {
      const st = store.piece(p.config.id).status;
      let color = C.none;
      let intensity = 0;
      if (st === STATUS.PLACED) { color = C.ok; intensity = 0.6; }
      else if (p.flashUntil > now) { color = C.error; intensity = 0.9; }
      else if (st === STATUS.SELECTED || st === STATUS.MOVING) { color = C.hover; intensity = 0.25; }
      else if (hovered.has(p.config.id)) { color = C.hover; intensity = 0.4; }
      p.material.emissive.setHex(color);
      p.material.emissiveIntensity = intensity;
    }
    // Caja: se pone más verde conforme se llena; verde completo con todas sus piezas.
    const filled = new Map();
    for (const p of pieces.values()) {
      if (store.piece(p.config.id).status === STATUS.PLACED) filled.set(p.config.target, (filled.get(p.config.target) ?? 0) + 1);
    }
    for (const t of targets.values()) {
      const ratio = (filled.get(t.id) ?? 0) / (perTarget.get(t.id) || 1);
      const flash = t.flashUntil > now;
      t.material.emissive.setHex(flash ? C.error : ratio > 0 ? C.ok : C.none);
      t.material.emissiveIntensity = flash ? 0.8 : ratio * 0.4;
    }
  }

  function tick(now) {
    stepPhysics(lastTick === null ? 0 : (now - lastTick) / 1000, now);
    lastTick = now;
    store.tick(now);
    updateMovingStatus();
    applyVisuals(now);
    const s = store.get();
    const { hands, controllers, xrActive } = store.session;
    let handsText = 'Manos: (vista previa de escritorio)';
    let handsOk = true;
    if (xrActive) {
      handsOk = hands.left || hands.right;
      handsText = `Mano izq: ${hands.left ? 'detectada' : 'no detectada'} · Mano der: ${hands.right ? 'detectada' : 'no detectada'}`;
      if (controllers) handsText += ' · deja los controles';
    }
    hud.update({
      placed: store.placedCount(),
      total: store.total,
      time: formatTime(store.elapsedMs(now)),
      phase: s.phase,
      message: s.message,
      handsText,
      handsOk,
    });
  }

  /** Objetos que el rayo puede seleccionar: botones + piezas disponibles (nunca piso/mesa). */
  function selectables() {
    const list = [...hud.buttons];
    for (const p of pieces.values()) if (store.piece(p.config.id).status === STATUS.AVAILABLE) list.push(p.mesh);
    return list;
  }

  return {
    grab, drop, releaseToStart, reset, setHover, tick, selectables,
    isFalling: (id) => bodies.has(id),
    registerCanceller: (fn) => cancellers.add(fn),
    pieceMesh: (id) => pieces.get(id)?.mesh,
  };
}

/** Prioridad: si el rayo toca un botón, gana el botón; si no, la pieza más cercana. */
export function pickHit(hits) {
  if (!hits.length) return null;
  return hits.find((h) => h.object.userData.kind === 'button') ?? hits[0];
}
