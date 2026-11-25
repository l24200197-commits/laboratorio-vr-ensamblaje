// Punto de entrada: inicializa renderer, escena, estado, entradas y sesión WebXR.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PIECES, SALON, CLASSROOM, LAB, TEACHER, DOOR } from './config.js?v=20261125b';
import { createStore } from './state.js?v=20261125b';
import { buildGenericEnvironment, buildTable, loadSalon, buildPieces, buildTargets } from './scene.js?v=20261125b';
import { createHud } from './hud.js?v=20261125b';
import { createLabController } from './lab.js?v=20261125b';
import { createPhysics } from './physics.js?v=20261125b';
import { buildClassroom } from './classroom.js?v=20261125b';
import { buildTeacherArea } from './teacher.js?v=20261125b';
import { setupDoor } from './door.js?v=20261125b';
import { createXRHands } from './xr-hands.js?v=20261125b';
import { createDesktopPointer } from './desktop-pointer.js?v=20261125b';
import { createPageUI, detectXR } from './page-ui.js?v=20261125b';
import { sounds, unlockAudio } from './audio.js?v=20261125b';

const ui = createPageUI();

window.addEventListener('error', (e) => ui.showError(`Error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => ui.showError(`Error: ${e.reason?.message ?? e.reason}`));

init().catch((err) => {
  console.error(err);
  ui.showError(`No se pudo iniciar la aplicación: ${err.message}. Revisa Console/Network (import map / CDN).`);
  ui.setButton({ enabled: false, text: 'No disponible' });
});

async function init() {
  const container = document.getElementById('preview');

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 50);
  camera.position.set(0, 1.45, 0.35);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.9, -0.7);
  controls.enableDamping = true;
  controls.maxDistance = SALON.maxOrbitDistance; // la vista de depuración no sale del salón
  controls.update();

  const table = buildTable(); // la mesa es del laboratorio: va con cualquier entorno
  scene.add(table);
  const labGroup = new THREE.Group(); // en el origen: coordenadas locales = mundo
  scene.add(labGroup);

  const store = createStore(PIECES.map((p) => p.id));
  const pieces = buildPieces(labGroup);
  const targets = buildTargets(labGroup);
  const hud = createHud(labGroup);
  // Gravedad: sólidos fijos = mesa + cajas (el salón y su mobiliario se suman al cargar).
  const physics = createPhysics({
    ...LAB.physics,
    solids: [...table.userData.solids, ...[...targets.values()].flatMap((t) => t.solids)],
    bounds: { min: [-3.5, -3.5], max: [3.5, 3.5] }, // entorno de respaldo; con el salón se ajusta a sus muros
  });
  const lab = createLabController({ store, pieces, targets, hud, sounds, physics });

  const onButton = (action) => {
    if (action === 'reset') lab.reset();
    else if (action === 'exit') exitVR();
  };

  // Elementos interactivos del salón que se agregan al cargar el GLB (la puerta).
  const world = { door: null, teacher: null };
  const xrHands = createXRHands({ renderer, scene, labGroup, lab, hud, store, onButton, world });
  createDesktopPointer({ renderer, camera, controls, labGroup, lab, hud, onButton, world });

  // --- Sesión WebXR -------------------------------------------------------
  let currentSession = null;

  async function enterVR() {
    unlockAudio(); // requiere gesto del usuario
    ui.clearError();
    ui.setButton({ enabled: false, text: 'Iniciando VR…', busy: true });
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['hand-tracking', 'bounded-floor'],
      });
      session.addEventListener('end', onSessionEnd);
      await renderer.xr.setSession(session);
      currentSession = session;
      store.session.xrActive = true;
      controls.enabled = false;
      ui.setInSession(true);
      ui.setButton({ enabled: true, text: 'Salir de VR' });
    } catch (err) {
      console.error(err);
      ui.showError(`No se pudo abrir la sesión VR (${err.name}): ${err.message}`);
      ui.setButton({ enabled: true, text: 'Entrar a VR' });
    }
  }

  function exitVR() {
    renderer.xr.getSession()?.end().catch((err) => console.warn('Fin de sesión:', err));
  }

  // También se ejecuta si el sistema cierra la sesión (menú del visor).
  function onSessionEnd() {
    currentSession?.removeEventListener('end', onSessionEnd);
    currentSession = null;
    xrHands.cancelAll();   // detiene arrastres pendientes sin corromper el estado
    xrHands.clearHover();
    store.session.xrActive = false;
    store.session.hands = { left: false, right: false };
    store.session.controllers = false;
    controls.enabled = true;
    ui.setInSession(false);
    ui.setButton({ enabled: true, text: 'Entrar a VR' });
  }

  ui.els.btn.addEventListener('click', () => (currentSession ? exitVR() : enterVR()));

  // --- Tamaño y ciclo de animación -----------------------------------------
  function resize() {
    if (renderer.xr.isPresenting) return;
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // setAnimationLoop es obligatorio en WebXR (usa requestAnimationFrame de la sesión).
  const viewer = new THREE.Vector3();
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (renderer.xr.isPresenting) xrHands.update();
    else controls.update();
    lab.tick(now);
    world.door?.update(dt);
    world.teacher?.update(now, camera.getWorldPosition(viewer));
    renderer.render(scene, camera);
  });

  // El spinner sigue visible hasta que el salón cargue (o falle y se use el respaldo).
  let classroom = null;
  try {
    const { root, bounds } = await loadSalon(scene, SALON);
    const m = CLASSROOM.roomMargin; // muros invisibles: las piezas no salen del salón
    physics.setBounds({ min: [bounds.min.x + m, bounds.min.z + m], max: [bounds.max.x - m, bounds.max.z - m] });
    if (CLASSROOM.enabled) {
      classroom = buildClassroom(CLASSROOM);
      scene.add(classroom.group);
      physics.add(...classroom.solids);
    }
    if (TEACHER.enabled) {
      world.teacher = buildTeacherArea(TEACHER);
      scene.add(world.teacher.group);
      physics.add(...world.teacher.solids);
    }
    if (DOOR.enabled) world.door = setupDoor(root, DOOR, { onToggle: (open) => sounds.door(open) });
  } catch (err) {
    console.warn('Salón no disponible, se usa el entorno de respaldo:', err);
    buildGenericEnvironment(scene);
    ui.showError(`No se pudo cargar el salón (${err.message}). Se muestra el entorno genérico de respaldo.`);
  }
  ui.setLoaded();

  // Herramientas de inspección para pruebas: solo con ?debug en la URL.
  if (new URLSearchParams(location.search).has('debug')) {
    window.__lab = { THREE, scene, camera, renderer, controls, store, pieces, targets, lab, hud, physics, classroom, world };
  }

  const xr = await detectXR();
  ui.setStatus(xr.level, xr.text);
  ui.setButton(xr.vr ? { enabled: true, text: 'Entrar a VR' } : { enabled: false, text: 'VR no disponible' });
}
