// Celebración al completar el reto: letrero "¡ERES UN DEMONIO!", confeti que cae del techo y
// chispas tipo fuegos artificiales. Todo son partículas baratas: 1 InstancedMesh + 1 Points.
import * as THREE from 'three';
import { CELEBRATION } from './config.js?v=20261125c';
import { makeCanvas, roundRect } from './text.js?v=20261125c';

const CONFETTI_COLORS = [0xff1744, 0xffea00, 0x00e676, 0x2979ff, 0xd500f9, 0xff9100, 0xffffff];
const SPARK_COLORS = [0xffd54f, 0xff6d00, 0xff1744, 0xffffff, 0xffab40];

function makeBanner({ width, height }, text) {
  const { ctx, texture } = makeCanvas(1024, Math.round(1024 * (height / width)));
  const { width: w, height: h } = ctx.canvas;
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#7f0000'); g.addColorStop(0.5, '#d50000'); g.addColorStop(1, '#7f0000');
  ctx.fillStyle = g;
  roundRect(ctx, 0, 0, w, h, h * 0.3);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#ffd54f';
  ctx.stroke();
  const label = `😈 ${text} 😈`;
  let size = Math.round(h * 0.56);
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  while (ctx.measureText(label).width > w * 0.9 && size > 10) { size -= 2; ctx.font = `900 ${size}px system-ui, sans-serif`; }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#2b0000';
  ctx.strokeText(label, w / 2, h / 2 + 4);
  ctx.fillStyle = '#fff8e1';
  ctx.fillText(label, w / 2, h / 2 + 4);
  texture.needsUpdate = true;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  mesh.renderOrder = 10;
  return mesh;
}

export function createCelebration(scene, cfg = CELEBRATION) {
  const group = new THREE.Group();
  group.name = 'celebracion';
  group.visible = false;
  scene.add(group);

  const banner = makeBanner(cfg.banner, cfg.message);
  banner.position.fromArray(cfg.banner.position);
  group.add(banner);

  // --- Confeti: papelitos que caen girando y oscilando ----------------------
  const nC = cfg.confetti;
  const confetti = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.03, 0.018),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    nC,
  );
  confetti.frustumCulled = false;
  const color = new THREE.Color();
  for (let i = 0; i < nC; i++) confetti.setColorAt(i, color.setHex(CONFETTI_COLORS[i % CONFETTI_COLORS.length]));
  group.add(confetti);
  const cPos = new Float32Array(nC * 3), cVel = new Float32Array(nC * 3), cSpin = new Float32Array(nC * 4);

  // --- Chispas: ráfagas radiales con gravedad que se apagan ---------------
  const nS = cfg.sparks;
  const sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(nS * 3), sCol = new Float32Array(nS * 3);
  const sVel = new Float32Array(nS * 3), sLife = new Float32Array(nS), sBase = new Float32Array(nS * 3);
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  const sparks = new THREE.Points(sGeo, new THREE.PointsMaterial({
    size: 0.05, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sparks.frustumCulled = false;
  group.add(sparks);

  const dummy = new THREE.Object3D();
  let t = 0, active = false, nextBurst = 0, burstIndex = 0;
  const center = new THREE.Vector3();

  function burst(origin) {
    const per = Math.floor(nS / 6);
    const start = (burstIndex % 6) * per;
    burstIndex++;
    const hex = SPARK_COLORS[burstIndex % SPARK_COLORS.length];
    color.setHex(hex);
    for (let i = start; i < start + per; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const speed = 1.2 + Math.random() * 1.4;
      sPos.set([origin.x, origin.y, origin.z], i * 3);
      sVel.set([r * Math.cos(a) * speed, u * speed + 0.6, r * Math.sin(a) * speed], i * 3);
      sLife[i] = 1 + Math.random() * 0.6;
      const c = Math.random() < 0.25 ? 1 : 0; // algunas chispas blancas
      sBase.set(c ? [1, 1, 1] : [color.r, color.g, color.b], i * 3);
    }
  }

  function start(around = center.set(0, 1.4, -0.7)) {
    t = 0; nextBurst = 0; burstIndex = 0; active = true;
    group.visible = true;
    for (let i = 0; i < nC; i++) {
      cPos.set([around.x + (Math.random() - 0.5) * 4, 2.6 + Math.random() * 1.4, around.z + (Math.random() - 0.5) * 4], i * 3);
      cVel.set([(Math.random() - 0.5) * 0.3, -(0.45 + Math.random() * 0.4), (Math.random() - 0.5) * 0.3], i * 3);
      cSpin.set([Math.random() * 6, Math.random() * 6, 2 + Math.random() * 6, Math.random() * 6], i * 4);
    }
    sLife.fill(0);
    sCol.fill(0);
  }

  function stop() { active = false; group.visible = false; }

  function update(dt) {
    if (!active) return;
    t += dt;
    if (t > cfg.seconds) { stop(); return; }

    // Letrero: aparece con rebote y late.
    const pop = Math.min(1, t / 0.35);
    banner.scale.setScalar((1 - Math.pow(1 - pop, 3)) * (1 + Math.sin(t * 6) * 0.04));
    banner.material.opacity = t > cfg.seconds - 1 ? cfg.seconds - t : 1;

    // Ráfagas de chispas durante los primeros segundos, alrededor de las cajas y del letrero.
    if (t >= nextBurst && t < cfg.seconds - 2) {
      const b = cfg.banner.position;
      burst(center.set(b[0] + (Math.random() - 0.5) * 1.6, b[1] - 0.2 + Math.random() * 0.5, b[2] + 0.2 + Math.random() * 0.4));
      nextBurst = t + 0.35 + Math.random() * 0.35;
    }
    for (let i = 0; i < nS; i++) {
      if (sLife[i] <= 0) continue;
      sLife[i] -= dt;
      const k = i * 3;
      sVel[k + 1] -= 3.5 * dt;
      sVel[k] *= 0.985; sVel[k + 2] *= 0.985;
      sPos[k] += sVel[k] * dt; sPos[k + 1] += sVel[k + 1] * dt; sPos[k + 2] += sVel[k + 2] * dt;
      const f = Math.max(0, Math.min(1, sLife[i])); // se apaga (aditivo: negro = invisible)
      sCol[k] = sBase[k] * f; sCol[k + 1] = sBase[k + 1] * f; sCol[k + 2] = sBase[k + 2] * f;
    }
    sGeo.attributes.position.needsUpdate = true;
    sGeo.attributes.color.needsUpdate = true;

    // Confeti
    for (let i = 0; i < nC; i++) {
      const k = i * 3, s = i * 4;
      if (cPos[k + 1] > 0.01) {
        cPos[k] += (cVel[k] + Math.sin(t * cSpin[s + 2] + cSpin[s]) * 0.25) * dt;
        cPos[k + 1] = Math.max(0.005, cPos[k + 1] + cVel[k + 1] * dt);
        cPos[k + 2] += (cVel[k + 2] + Math.cos(t * cSpin[s + 2] + cSpin[s + 1]) * 0.25) * dt;
      }
      dummy.position.set(cPos[k], cPos[k + 1], cPos[k + 2]);
      if (cPos[k + 1] > 0.01) dummy.rotation.set(t * cSpin[s + 2] + cSpin[s], t * cSpin[s + 3], cSpin[s + 1]);
      else dummy.rotation.set(-Math.PI / 2, 0, cSpin[s]); // en el piso queda plano
      dummy.updateMatrix();
      confetti.setMatrixAt(i, dummy.matrix);
    }
    confetti.instanceMatrix.needsUpdate = true;
  }

  return { start, stop, update, isActive: () => active };
}
