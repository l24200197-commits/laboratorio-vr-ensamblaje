// Entrada XR: seguimiento de ambas manos, rayo de apuntado, pinza (selectstart/selectend),
// arrastre y liberación. En Meta Quest Browser la pinza índice+pulgar dispara los eventos
// 'selectstart'/'selectend' del XRInputSource de la mano (target-ray space).
// La pinza hacia la palma (menú del sistema) la consume el sistema y NO llega a la página.
import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { LAB } from './config.js?v=20261125c';
import { pickHit } from './lab.js?v=20261125c';

export function createXRHands({ renderer, scene, labGroup, lab, hud, store, onButton, world = {} }) {
  const factory = new XRHandModelFactory();
  const raycaster = new THREE.Raycaster();
  const rotation = new THREE.Matrix4();
  const trailPoint = new THREE.Vector3();
  const tipPoint = new THREE.Vector3();

  const sources = [0, 1].map((index) => {
    const controller = renderer.xr.getController(index); // espacio del rayo de apuntado
    const hand = renderer.xr.getHand(index);             // articulaciones de la mano
    hand.add(factory.createHandModel(hand, 'spheres'));  // representación visible (sin descargas)

    const ray = makeRay();
    controller.add(ray);

    const s = { key: `xr-${index}`, controller, hand, ray, handedness: null, isHand: false, connected: false, heldId: null, trail: [] };

    controller.addEventListener('connected', (e) => {
      s.connected = true;
      s.handedness = e.data?.handedness ?? null;
      s.isHand = Boolean(e.data?.hand);
      refreshInputStatus();
    });
    controller.addEventListener('disconnected', () => {
      cancelHold(s); // pérdida de tracking durante arrastre -> liberación segura
      s.connected = false;
      s.isHand = false;
      lab.setHover(s.key, null);
      hud.setHover(s.key, null);
      refreshInputStatus();
    });
    controller.addEventListener('selectstart', () => onSelectStart(s));
    controller.addEventListener('selectend', () => onSelectEnd(s));

    scene.add(controller);
    scene.add(hand);
    return s;
  });

  lab.registerCanceller(() => sources.forEach(cancelHold));

  function makeRay() {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.8 }));
    line.scale.z = LAB.rayLength;
    return line;
  }

  function refreshInputStatus() {
    const hands = { left: false, right: false };
    let controllers = false;
    for (const s of sources) {
      if (!s.connected) continue;
      if (s.isHand && (s.handedness === 'left' || s.handedness === 'right')) hands[s.handedness] = true;
      if (!s.isHand) controllers = true;
    }
    store.session.hands = hands;
    store.session.controllers = controllers;
  }

  function intersect(s) {
    rotation.identity().extractRotation(s.controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(s.controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
    const hit = pickHit(raycaster.intersectObjects(lab.selectables(), false));
    if (hit || !world.door) return hit;
    return raycaster.intersectObjects(world.door.meshes, false)[0] ?? null; // la puerta, si no hay nada del laboratorio
  }

  function onSelectStart(s) {
    if (!s.connected || s.heldId) return;
    const hit = intersect(s);
    if (!hit) return;
    const data = hit.object.userData;
    if (data.kind === 'button') { onButton(data.action); return; }
    if (data.kind === 'door') { world.door?.toggle(); return; }
    if (data.kind === 'piece' && lab.grab(data.id, s.key)) {
      s.controller.attach(hit.object); // conserva el offset de agarre
      s.heldId = data.id;
      s.trail.length = 0;
      lab.setHover(s.key, null);
    }
  }

  function onSelectEnd(s) {
    if (!s.heldId) return;
    const id = s.heldId;
    s.heldId = null;
    labGroup.attach(lab.pieceMesh(id)); // vuelve al mundo conservando la pose
    // La pieza hereda (en parte) la velocidad de la mano y cae por gravedad; se evalúa al quedar quieta.
    lab.drop(id, performance.now(), releaseVelocity(s));
  }

  function cancelHold(s) {
    if (!s.heldId) return;
    const id = s.heldId;
    s.heldId = null;
    labGroup.attach(lab.pieceMesh(id));
    lab.releaseToStart(id);
  }

  /** Velocidad (m/s, mundo) de la pieza sujeta en los últimos ~100 ms: 0 si la mano estaba quieta. */
  function releaseVelocity(s) {
    const now = performance.now();
    const recent = s.trail.filter((p) => now - p.t <= 100);
    if (recent.length < 2) return [0, 0, 0];
    const a = recent[0], b = recent[recent.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt < 0.02) return [0, 0, 0];
    return [(b.x - a.x) / dt, (b.y - a.y) / dt, (b.z - a.z) / dt];
  }

  /** Punta del dedo índice (manos) o posición del control: lo que "toca" la puerta. */
  function touchPoint(s) {
    if (s.isHand) {
      const tip = s.hand.joints?.['index-finger-tip'];
      return tip?.visible ? tip.getWorldPosition(tipPoint) : null;
    }
    return s.controller.getWorldPosition(tipPoint);
  }

  /** Se llama cada frame mientras la sesión XR está activa. */
  function update() {
    const now = performance.now();
    for (const s of sources) {
      s.ray.visible = s.connected;
      world.door?.touch(s.key, s.connected ? touchPoint(s) : null, now);
      if (!s.connected) continue;
      if (s.heldId) {
        s.ray.scale.z = 0.15;
        const p = lab.pieceMesh(s.heldId).getWorldPosition(trailPoint);
        s.trail.push({ t: performance.now(), x: p.x, y: p.y, z: p.z });
        if (s.trail.length > 12) s.trail.shift();
        continue;
      }
      const hit = intersect(s);
      s.ray.scale.z = hit ? hit.distance : LAB.rayLength;
      const kind = hit?.object.userData.kind;
      lab.setHover(s.key, kind === 'piece' ? hit.object.userData.id : null);
      hud.setHover(s.key, kind === 'button' ? hit.object.userData.action : null);
    }
  }

  return {
    update,
    cancelAll: () => sources.forEach(cancelHold),
    clearHover: () => sources.forEach((s) => { lab.setHover(s.key, null); hud.setHover(s.key, null); }),
  };
}
