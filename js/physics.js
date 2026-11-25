// Física mínima para las piezas: gravedad + colisión contra cajas alineadas a los ejes (AABB).
// Sin dependencias y sin Three.js (solo números): se puede probar en Node.
//
// Modelo: cada pieza es un cuerpo con una "caja de colisión" vertical de radio `r` (horizontal) y
// semialtura `h`. Cada sólido estático es una AABB; para colisionar se EXPANDE el sólido con el
// tamaño de la pieza y se trata la pieza como un punto. Integración semi-implícita de Euler con
// paso fijo (1/120 s) -> determinista y sin túnel: a 5 m/s avanza 4 cm por paso, menos que el
// grosor de cualquier sólido expandido (≥ 2·h ≈ 10 cm).
//
// Unidades: metros, segundos. Y es arriba.

export const FIXED_DT = 1 / 120;

/**
 * @typedef {{min:number[], max:number[], nudge?:'x'|'z'|'xz', inward?:number}} Solid
 *  nudge: la cara superior es muy estrecha (borde de una caja, otra pieza): una pieza que
 *  aterrice encima no se queda en equilibrio, sino que resbala hacia el lado donde está su centro.
 *  inward: signo (+1/-1) hacia el que cae si cae justo en el centro (hacia el interior de la caja).
 *
 * @typedef {{pos:number[], vel:number[], r:number, h:number, restTime:number, age:number, grounded:boolean}} Body
 */

export function createBody({ position, velocity = [0, 0, 0], r, h }) {
  return { pos: [...position], vel: [...velocity], r, h, restTime: 0, age: 0, grounded: false };
}

export function createPhysics({
  gravity = 9.81,
  restitution = 0.25,   // fracción de velocidad que rebota
  friction = 5,         // amortiguación horizontal (1/s) mientras hay contacto
  restSpeed = 0.05,     // m/s por debajo de los cuales se considera "quieta"
  floorY = 0,
  solids = [],
  bounds = null,        // {min:[x,z], max:[x,z]}: muros invisibles del salón
} = {}) {
  const staticSolids = [...solids];
  let room = bounds;

  function add(...list) { staticSolids.push(...list); }
  function setBounds(b) { room = b; }

  /** Resuelve la colisión con un sólido. Devuelve true si hubo contacto. */
  function collide(b, s, prevY, dt) {
    const { pos: p, vel: v, r, h } = b;
    const minX = s.min[0] - r, maxX = s.max[0] + r;
    const minY = s.min[1] - h, maxY = s.max[1] + h;
    const minZ = s.min[2] - r, maxZ = s.max[2] + r;
    if (p[0] <= minX || p[0] >= maxX || p[1] <= minY || p[1] >= maxY || p[2] <= minZ || p[2] >= maxZ) return false;

    // Cara de salida: si venía desde arriba (o abajo) manda el eje vertical; si no, la penetración menor.
    let face;
    if (prevY >= maxY - 1e-9 && v[1] <= 0) face = 'top';
    else if (prevY <= minY + 1e-9 && v[1] >= 0) face = 'bottom';
    else {
      const pen = { '-x': p[0] - minX, '+x': maxX - p[0], bottom: p[1] - minY, top: maxY - p[1], '-z': p[2] - minZ, '+z': maxZ - p[2] };
      face = Object.keys(pen).reduce((a, k) => (pen[k] < pen[a] ? k : a));
    }

    switch (face) {
      case '-x': p[0] = minX; if (v[0] > 0) v[0] = -v[0] * restitution; break;
      case '+x': p[0] = maxX; if (v[0] < 0) v[0] = -v[0] * restitution; break;
      case '-z': p[2] = minZ; if (v[2] > 0) v[2] = -v[2] * restitution; break;
      case '+z': p[2] = maxZ; if (v[2] < 0) v[2] = -v[2] * restitution; break;
      case 'bottom': p[1] = minY; if (v[1] > 0) v[1] = -v[1] * restitution; break;
      case 'top': {
        p[1] = maxY;
        if (v[1] < 0) { v[1] = -v[1] * restitution; if (v[1] < 0.3) v[1] = 0; }
        b.grounded = true;
        const damp = Math.max(0, 1 - friction * dt);
        v[0] *= damp; v[2] *= damp;
        if (s.nudge) slideOff(b, s);
        break;
      }
    }
    return true;
  }

  /** Empuja la pieza fuera de una cara superior estrecha (no hay equilibrio sobre un borde). */
  function slideOff(b, s) {
    const cx = (s.min[0] + s.max[0]) / 2, cz = (s.min[2] + s.max[2]) / 2;
    const speed = 0.5;
    if (s.nudge === 'x' || s.nudge === 'z') {
      const i = s.nudge === 'x' ? 0 : 2;
      const off = b.pos[i] - (i === 0 ? cx : cz);
      b.vel[i] = (Math.abs(off) < 1e-4 ? (s.inward ?? 1) : Math.sign(off)) * speed;
    } else {
      let dx = b.pos[0] - cx, dz = b.pos[2] - cz;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) { dx = 1; dz = 0; } else { dx /= len; dz /= len; }
      b.vel[0] = dx * speed; b.vel[2] = dz * speed;
    }
  }

  function substep(b, dt, extra) {
    const { pos: p, vel: v } = b;
    b.grounded = false;
    v[1] -= gravity * dt;
    const prevY = p[1];
    p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;

    // Piso del salón
    if (p[1] - b.h < floorY) {
      p[1] = floorY + b.h;
      if (v[1] < 0) { v[1] = -v[1] * restitution; if (v[1] < 0.3) v[1] = 0; }
      b.grounded = true;
      const damp = Math.max(0, 1 - friction * dt);
      v[0] *= damp; v[2] *= damp;
    }

    for (const s of staticSolids) collide(b, s, prevY, dt);
    if (extra) for (const s of extra) collide(b, s, prevY, dt);

    // Muros invisibles: la pieza no sale del salón
    if (room) {
      const lo = [room.min[0] + b.r, room.min[1] + b.r], hi = [room.max[0] - b.r, room.max[1] - b.r];
      if (p[0] < lo[0]) { p[0] = lo[0]; if (v[0] < 0) v[0] = -v[0] * restitution; }
      if (p[0] > hi[0]) { p[0] = hi[0]; if (v[0] > 0) v[0] = -v[0] * restitution; }
      if (p[2] < lo[1]) { p[2] = lo[1]; if (v[2] < 0) v[2] = -v[2] * restitution; }
      if (p[2] > hi[1]) { p[2] = hi[1]; if (v[2] > 0) v[2] = -v[2] * restitution; }
    }

    const speed = Math.hypot(v[0], v[1], v[2]);
    if (b.grounded && speed < restSpeed) b.restTime += dt; else b.restTime = 0;
    b.age += dt;
  }

  /**
   * Avanza el cuerpo `dt` segundos con pasos fijos. `extra`: sólidos dinámicos de este cuadro
   * (otras piezas). Devuelve el cuerpo.
   */
  function advance(b, dt, extra) {
    let left = dt;
    while (left > 1e-9) {
      const d = Math.min(FIXED_DT, left);
      substep(b, d, extra);
      left -= d;
    }
    return b;
  }

  return { add, setBounds, advance, get solids() { return staticSolids; }, config: { gravity, restitution, friction, restSpeed, floorY } };
}
