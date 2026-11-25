// Reglas de negocio PURAS (sin Three.js de escena ni DOM): fáciles de probar y explicar.
//
// La pieza se SUELTA y cae por gravedad; cuando queda quieta se evalúa en qué caja quedó.
// "Dentro de una caja" = el centro de la pieza está dentro del hueco de la caja (en planta) y por
// debajo de su borde. No hay tolerancia de distancia: o está dentro, o no.

/**
 * @typedef {{id:string, cx:number, cz:number, innerHalf:number, floorY:number, rimY:number}} BoxVolume
 *   cx/cz: centro de la caja; innerHalf: mitad del hueco interior; floorY/rimY: alturas del fondo y del borde.
 *
 * @param {{x:number,y:number,z:number}} pos  centro de la pieza en reposo
 * @param {string} expectedBoxId             caja asignada a la pieza
 * @param {BoxVolume[]} boxes
 * @param {number} [rimMargin]               holgura sobre el borde (una pieza apilada sobre otra sigue "dentro")
 * @returns {{ok:boolean, reason:'ok'|'caja'|'fuera', boxId:string|null}}
 */
export function validateDeposit(pos, expectedBoxId, boxes, rimMargin = 0.06) {
  if (!Array.isArray(boxes) || boxes.length === 0) throw new TypeError('No hay cajas');
  const inside = boxes.find((b) =>
    Math.abs(pos.x - b.cx) <= b.innerHalf &&
    Math.abs(pos.z - b.cz) <= b.innerHalf &&
    pos.y >= b.floorY && pos.y <= b.rimY + rimMargin);
  if (!inside) return { ok: false, reason: 'fuera', boxId: null };
  if (inside.id !== expectedBoxId) return { ok: false, reason: 'caja', boxId: inside.id };
  return { ok: true, reason: 'ok', boxId: inside.id };
}
