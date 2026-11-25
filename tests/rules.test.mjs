// node tests/rules.test.mjs
import { validateDeposit } from '../js/rules.js';
let fails = 0; const ok = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n, d); if (!c) fails++; };
const boxes = [
  { id: 'caja-a', cx: 0, cz: -0.78, innerHalf: 0.1, floorY: 0.792, rimY: 0.9 },
  { id: 'caja-b', cx: 0.26, cz: -0.78, innerHalf: 0.1, floorY: 0.792, rimY: 0.9 },
];
const r = (x, y, z, exp) => validateDeposit({ x, y, z }, exp, boxes);
ok('dentro de su caja -> ok', r(0.02, 0.84, -0.8, 'caja-a').ok);
ok('dentro de otra caja -> reason caja', r(0.26, 0.84, -0.78, 'caja-a').reason === 'caja' && r(0.26, 0.84, -0.78, 'caja-a').boxId === 'caja-b');
ok('sobre la mesa -> reason fuera', r(0.13, 0.83, -0.78, 'caja-a').reason === 'fuera');
ok('en el piso -> fuera', r(0, 0.05, -0.78, 'caja-a').reason === 'fuera');
ok('justo encima del borde (sin estar dentro) -> fuera', r(0, 1.2, -0.78, 'caja-a').reason === 'fuera');
ok('límite del hueco (0.1) cuenta como dentro; 0.101 no', r(0.1, 0.84, -0.78, 'caja-a').ok && r(0.101, 0.84, -0.78, 'caja-a').reason === 'fuera');
let threw = false; try { validateDeposit({ x: 0, y: 0, z: 0 }, 'x', []); } catch { threw = true; }
ok('sin cajas lanza TypeError', threw);
process.exit(fails ? 1 : 0);
