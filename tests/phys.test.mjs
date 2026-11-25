import { createPhysics, createBody } from '../js/physics.js';
let fails = 0; const ok = (n, c, d='') => { console.log((c?'PASS ':'FAIL ')+n, d); if(!c) fails++; };
// Mesa + caja (interior 0.20, pared 0.012, alto 0.12, piso 0.012) centrada en (0, -0.78); mesa top 0.78
const T=0.78, cx=0, cz=-0.78, ih=0.10, w=0.012, H=0.12, o=ih+w;
const solids = [
  {min:[-0.75,0.74,-0.95], max:[0.75,T,-0.25]},                                  // mesa
  {min:[cx-o,T,cz-o], max:[cx+o,T+0.012,cz+o]},                                   // piso caja
  {min:[cx-o,T,cz-o], max:[cx+o,T+H,cz-ih], nudge:'z', inward:1},                 // pared fondo
  {min:[cx-o,T,cz+ih], max:[cx+o,T+H,cz+o], nudge:'z', inward:-1},                // pared frente
  {min:[cx-o,T,cz-ih], max:[cx-ih,T+H,cz+ih], nudge:'x', inward:1},               // izquierda
  {min:[cx+ih,T,cz-ih], max:[cx+o,T+H,cz+ih], nudge:'x', inward:-1},              // derecha
];
const mk = (shape, pos, vel) => ({ box:{r:0.045,h:0.045}, sphere:{r:0.05,h:0.05}, prism:{r:0.062,h:0.05} }[shape]) && createBody({ position:pos, velocity:vel, ...{ box:{r:0.045,h:0.045}, sphere:{r:0.05,h:0.05}, prism:{r:0.062,h:0.05} }[shape] });
function run(b, ph, secs=6){ for(let t=0;t<secs;t+=1/60){ ph.advance(b,1/60); if(b.restTime>0.35) return t; } return null; }
const bounds = {min:[-3.3,-3],max:[3.7,5.1]};

// 1) cae dentro de la caja desde 25 cm
let ph = createPhysics({solids, bounds}); let b = mk('sphere',[0.01,T+0.35,cz-0.01]);
let t = run(b, ph); ok('esfera suelta sobre la caja queda quieta dentro', t!==null && Math.abs(b.pos[1]-(T+0.012+0.05))<1e-3 && Math.abs(b.pos[0]-0.01)<0.02, `t=${t?.toFixed(2)} pos=${b.pos.map(v=>+v.toFixed(3))}`);
// 2) cae en la mesa fuera de la caja
b = mk('box',[0.5,T+0.2,-0.4]); t = run(b, ph);
ok('cubo suelto sobre la mesa se posa a y=mesa+half', t!==null && Math.abs(b.pos[1]-(T+0.045))<1e-3, b.pos.map(v=>+v.toFixed(3)));
// 3) cae fuera de la mesa -> piso
b = mk('box',[1.2,T+0.2,-0.4]); t = run(b, ph);
ok('fuera de la mesa llega al piso (y=half)', t!==null && Math.abs(b.pos[1]-0.045)<1e-3, b.pos.map(v=>+v.toFixed(3)));
// 4) sobre el borde de la pared no se queda en equilibrio
b = mk('prism',[cx+ih+w/2, T+H+0.1, cz]); t = run(b, ph, 8);
ok('pieza sobre el borde resbala (no equilibrio)', t!==null && !(Math.abs(b.pos[1]-(T+H+0.05))<1e-3 && Math.abs(b.pos[0]-(cx+ih+w/2))<1e-3), `pos=${b.pos.map(v=>+v.toFixed(3))}`);
// 5) lanzada fuerte no sale del salón
b = mk('sphere',[0,T+0.1,-0.4],[30,2,0]); run(b, ph, 3); ok('lanzada a 30 m/s no atraviesa el muro', b.pos[0] <= 3.7-0.05+1e-6, b.pos.map(v=>+v.toFixed(3)));
// 6) determinismo
const a1 = mk('sphere',[0.03,T+0.3,cz]), a2 = mk('sphere',[0.03,T+0.3,cz]); run(a1, createPhysics({solids,bounds})); run(a2, createPhysics({solids,bounds}));
ok('determinista', JSON.stringify(a1.pos)===JSON.stringify(a2.pos));
// 7) independiente del dt del cuadro (30 vs 90 fps)
const d1 = mk('box',[0.02,T+0.3,cz]), d2 = mk('box',[0.02,T+0.3,cz]); const p1=createPhysics({solids,bounds}), p2=createPhysics({solids,bounds});
for(let i=0;i<120;i++){p1.advance(d1,1/30);} for(let i=0;i<360;i++){p2.advance(d2,1/90);}
ok('resultado independiente de FPS', Math.hypot(...d1.pos.map((v,i)=>v-d2.pos[i]))<0.005, `${d1.pos.map(v=>+v.toFixed(3))} vs ${d2.pos.map(v=>+v.toFixed(3))}`);
// 8) caída libre: tiempo de 0.5 m ≈ sqrt(2h/g)
const f = mk('sphere',[2,0.05+0.5,2]); let tt=0; while(!f.grounded && tt<2){ createPhysics().advance(f,1/240); tt+=1/240; }
ok('tiempo de caída libre 0.5 m ≈ 0.319 s', Math.abs(tt-0.319)<0.02, tt.toFixed(3));
process.exit(fails?1:0);
