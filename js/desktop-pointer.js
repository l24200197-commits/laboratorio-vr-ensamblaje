// Entrada de ESCRITORIO solo para depuración: arrastra piezas con el ratón sobre un plano
// horizontal. NO sustituye la prueba con manos en Meta Quest 3.
import * as THREE from 'three';
import { pickHit } from './lab.js';
import { LAB, BOX } from './config.js';

// Altura a la que se lleva la pieza con el ratón: por encima del borde de las cajas.
const CARRY_Y = LAB.tableTopY + BOX.height + 0.12;

export function createDesktopPointer({ renderer, camera, controls, labGroup, lab, hud, onButton }) {
  const el = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  const offset = new THREE.Vector3();
  let drag = null;

  function setRay(evt) {
    const r = el.getBoundingClientRect();
    ndc.set(((evt.clientX - r.left) / r.width) * 2 - 1, -((evt.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  function onDown(evt) {
    if (renderer.xr.isPresenting || evt.button !== 0) return;
    setRay(evt);
    const hit = pickHit(raycaster.intersectObjects(lab.selectables(), false));
    if (!hit) return;
    const data = hit.object.userData;
    if (data.kind === 'button') { onButton(data.action); return; }
    if (data.kind === 'piece' && lab.grab(data.id, 'mouse')) {
      const mesh = hit.object;
      // Al tomarla con el ratón la pieza se levanta a CARRY_Y y queda justo bajo el cursor (a esa altura),
      // así pasa por encima de las cajas y lo que se ve en pantalla coincide con donde cae al soltar.
      plane.constant = -Math.max(mesh.position.y, CARRY_Y);
      if (raycaster.ray.intersectPlane(plane, point)) { mesh.position.copy(point); offset.set(0, 0, 0); }
      else { offset.set(0, 0, 0); }
      drag = { id: data.id, mesh };
      controls.enabled = false;
      el.setPointerCapture(evt.pointerId);
    }
  }

  function onMove(evt) {
    if (renderer.xr.isPresenting) return;
    setRay(evt);
    if (drag) {
      if (raycaster.ray.intersectPlane(plane, point)) drag.mesh.position.copy(point).add(offset);
      return;
    }
    const hit = pickHit(raycaster.intersectObjects(lab.selectables(), false));
    const kind = hit?.object.userData.kind;
    lab.setHover('mouse', kind === 'piece' ? hit.object.userData.id : null);
    hud.setHover('mouse', kind === 'button' ? hit.object.userData.action : null);
    el.style.cursor = hit ? 'pointer' : 'grab';
  }

  function onUp() {
    if (!drag) return;
    const { id } = drag;
    drag = null;
    controls.enabled = true;
    lab.drop(id);
  }

  function cancel() {
    if (!drag) return;
    const { id } = drag;
    drag = null;
    controls.enabled = true;
    lab.releaseToStart(id);
  }

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', cancel);
  lab.registerCanceller(cancel);

  return {
    cancel,
    dispose() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', cancel);
    },
  };
}
