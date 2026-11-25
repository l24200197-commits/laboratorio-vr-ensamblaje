// Panel HUD 3D dentro de VR: textura de canvas sobre un plano + botones 3D seleccionables.
// Solo se redibuja cuando cambia la información (no se reconstruye la escena).
import * as THREE from 'three';
import { LAB } from './config.js?v=20261125c';
import { makeCanvas, roundRect } from './text.js?v=20261125c';

const PHASE_COLORS = { pendiente: '#94a3b8', activo: '#38bdf8', error: '#ef4444', completado: '#22c55e' };

export function createHud(parent) {
  const { canvas, ctx, texture } = makeCanvas(1024, 512);
  const { position, width, height } = LAB.hud;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  panel.position.set(...position);
  panel.name = 'hud';
  parent.add(panel);

  const buttons = [
    makeButton('reset', 'Reiniciar', -0.17, '#0ea5e9'),
    makeButton('exit', 'Salir de VR', 0.17, '#f43f5e'),
  ];
  for (const b of buttons) parent.add(b);

  const hovers = new Map();
  let lastKey = '';

  function makeButton(action, text, x, color) {
    const { ctx: c, texture: tex } = makeCanvas(512, 160);
    c.fillStyle = color;
    roundRect(c, 4, 4, 504, 152, 40);
    c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 64px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 256, 82);
    tex.needsUpdate = true;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.08, 0.02),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    mesh.position.set(x, position[1] - height / 2 - 0.07, position[2] + 0.02);
    mesh.userData = { kind: 'button', action };
    mesh.name = `boton-${action}`;
    return mesh;
  }

  function draw(view) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0b1220';
    roundRect(ctx, 0, 0, 1024, 512, 36);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = PHASE_COLORS[view.phase] ?? '#38bdf8';
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillText('Laboratorio de ensamblaje 3D', 40, 30);
    ctx.font = '28px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Toma las piezas de la mesa de atrás · suéltalas en su caja', 40, 92);

    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Piezas ${view.placed}/${view.total}`, 40, 150);
    ctx.fillText(`⏱ ${view.time}`, 600, 150);

    ctx.fillStyle = PHASE_COLORS[view.phase] ?? '#fff';
    roundRect(ctx, 40, 255, 300, 56, 28);
    ctx.fill();
    ctx.fillStyle = '#0b1220';
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.fillText(`Estado: ${view.phase}`, 60, 266);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '34px system-ui, sans-serif';
    ctx.fillText(fit(ctx, view.message, 940), 40, 340);

    ctx.font = '28px system-ui, sans-serif';
    ctx.fillStyle = view.handsOk ? '#86efac' : '#fca5a5';
    ctx.fillText(view.handsText, 40, 420);
    texture.needsUpdate = true;
  }

  function fit(c, text, maxWidth) {
    let t = text;
    while (c.measureText(t).width > maxWidth && t.length > 4) t = `${t.slice(0, -2)}…`;
    return t;
  }

  return {
    panel,
    buttons,
    update(view) {
      const key = JSON.stringify(view);
      if (key === lastKey) return;
      lastKey = key;
      draw(view);
    },
    setHover(sourceKey, action) {
      if (action) hovers.set(sourceKey, action); else hovers.delete(sourceKey);
      const active = new Set(hovers.values());
      for (const b of buttons) {
        const on = active.has(b.userData.action);
        b.material.color.setHex(on ? 0xfff3a0 : 0xffffff);
        b.scale.setScalar(on ? 1.08 : 1);
      }
    },
    clearHover() { hovers.clear(); this.setHover('_', null); },
  };
}
