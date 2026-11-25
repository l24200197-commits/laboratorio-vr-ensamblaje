// Configuración del laboratorio: datos, no lógica. Cambiar aquí NO requiere reescribir reglas.
// Unidades en metros (espacio de referencia 'local-floor': y = 0 es el piso).

export const LAB = {
  feedbackMs: 1300, // duración de la señal roja de error
  tableTopY: 0.78,
  // Mesa del laboratorio: pupitre grande de tablero azul y patas negras (como los del salón).
  table: { width: 1.5, depth: 0.7, centerZ: -0.6 },
  // Mesa de atrás (a espaldas del usuario, en el pasillo central): ahí están las piezas al iniciar.
  backTable: { width: 1.5, depth: 0.75, centerZ: 0.85 },
  // Área permitida para soltar piezas: todo el salón (si caen al piso, ahí se quedan).
  dragBounds: { min: [-3.3, 0.05, -2.9], max: [3.6, 2.4, 5.1] },
  hud: { position: [0, 1.48, -1.15], width: 0.9, height: 0.45 },
  rayLength: 3,
  // Gravedad y rebote de las piezas al soltarlas (ver js/physics.js).
  physics: {
    gravity: 9.81,        // m/s²
    restitution: 0.25,    // 0 = no rebota, 1 = rebote perfecto
    friction: 5,          // frenado horizontal mientras tocan una superficie (1/s)
    restSpeed: 0.05,      // m/s: por debajo de esto la pieza se considera quieta
    restSeconds: 0.35,    // tiempo quieta antes de evaluar el depósito
    maxFallSeconds: 3,    // seguro: evalúa aunque siga moviéndose (p. ej. resbalando sobre otras piezas)
    throwScale: 0.6,      // fracción de la velocidad de la mano que hereda la pieza al soltarla (VR)
    maxThrowSpeed: 2,     // m/s, tope de la velocidad heredada
  },
};

// Cajas de depósito (una por pieza). Medidas internas y de pared en metros.
// La pieza correcta es la que queda DENTRO de su caja (centro dentro del hueco y por debajo del borde).
// Caben 5 piezas por caja (4 abajo + 1 encima, por debajo del borde).
export const BOX = { inner: 0.26, wall: 0.012, floor: 0.012, height: 0.18 };

// Tipos de pieza: forma, color y etiqueta.
export const SHAPE_TYPES = [
  { type: 'cubo', label: 'CUBO', shape: 'box', color: 0xe4572e },
  { type: 'esfera', label: 'ESFERA', shape: 'sphere', color: 0x29a3d9 },
  { type: 'cono', label: 'CONO', shape: 'cone', color: 0xf2c14e },
  { type: 'cilindro', label: 'CILINDRO', shape: 'cylinder', color: 0x7bc950 },
  { type: 'prisma', label: 'PRISMA', shape: 'prism', color: 0x9b5de5 },
];
export const PIECES_PER_TYPE = 5;

// Piezas: PIECES_PER_TYPE de cada tipo, mezcladas (orden fijo) en una cuadrícula sobre la mesa de atrás.
export const PIECES = (() => {
  const list = [];
  for (const t of SHAPE_TYPES) {
    for (let n = 1; n <= PIECES_PER_TYPE; n++) list.push({ ...t, id: `${t.type}-${n}`, target: `caja-${t.type}` });
  }
  let seed = 7; // barajado determinista (siempre la misma mezcla)
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const cols = 5, dx = 0.26, dz = 0.135;
  const z0 = LAB.backTable.centerZ - ((Math.ceil(list.length / cols) - 1) * dz) / 2;
  list.forEach((p, i) => { p.startX = ((i % cols) - (cols - 1) / 2) * dx; p.startZ = z0 + Math.floor(i / cols) * dz; });
  return list;
})();

// Cajas (una por tipo) en orden distinto al de los tipos para que no sea trivial.
export const TARGETS = [
  { id: 'caja-cilindro', type: 'cilindro', x: -0.58 },
  { id: 'caja-prisma', type: 'prisma', x: -0.29 },
  { id: 'caja-cubo', type: 'cubo', x: 0 },
  { id: 'caja-esfera', type: 'esfera', x: 0.29 },
  { id: 'caja-cono', type: 'cono', x: 0.58 },
];
export const TARGET_ROW_Z = -0.72; // centro de las cajas sobre la mesa del frente

// Celebración al completar todas las piezas.
export const CELEBRATION = {
  message: '¡ERES UN DEMONIO!',
  seconds: 8,
  confetti: 450,
  sparks: 600,
  banner: { position: [0, 1.98, -1.15], width: 1.3, height: 0.26 },
};

// Salón de clases (modelo GLB exportado de SketchUp y optimizado: metros, +Y arriba, piso en y = 0).
// Todo lo que sigue son DATOS: para mover el salón respecto al laboratorio basta con editar aquí.
//
// En el GLB original el pizarrón está en el muro "sur" (z ≈ -0.22) y mira hacia -Z, mientras que
// el laboratorio mira hacia -Z desde el origen. Por eso el salón se gira 180° en Y: así el pizarrón
// queda de frente, al fondo, y el usuario aparece de pie en el centro del salón.
//   Mundo = R_y(180°) · modelo + position   =>   (x, z)_mundo = (-x + 3.93, -z - 3.215)
//   · x = 3.93 centra el pizarrón (x ≈ 2.04…5.82 en el modelo) en x = 0 del laboratorio.
//   · z = -3.215 deja el pizarrón ~3 m delante del origen (la mesa está en z -0.9…-0.3 y el HUD en -1.15).
// Resultado: interior del salón en el mundo x ∈ [-3.37, 3.73], z ∈ [-2.99, 5.19]; sin muebles ni muros
// dentro del área de trabajo (la mesa ocupa x ±0.75, z -0.95…-0.25). Los pupitres (CLASSROOM) dejan libre |x| < 1.0.
export const SALON = {
  url: 'assets/models/salon.glb?v=20261125c',
  position: [3.93, 0, -3.215],
  rotationYDeg: 180,
  // El modelo no trae techo: se cierra con un plano a la altura de los muros para no ver el vacío.
  ceiling: { enabled: true, color: 0xe8e4dc },
  // Iluminación pensada para materiales PBR sin mapa de entorno (interior claro, sin sombras).
  lighting: {
    background: 0xb9d0e4, // cielo claro: es lo que se ve a través de las ventanas
    hemiSky: 0xffffff,
    hemiGround: 0xa9a399,
    hemiIntensity: 1.5,
    sunColor: 0xfff4e0,
    sunIntensity: 1.1,
    sunPosition: [1.5, 3, 1.5],
  },
  // Cámara de la vista de escritorio (depuración): no sale del salón.
  maxOrbitDistance: 2.5,
};

// Mobiliario del salón: pupitres de tablero azul con patas negras y sillas de plástico negro, como en
// el salón real. Coordenadas de MUNDO (el salón ya está girado/colocado por SALON). Todo es dato:
// quitar o mover filas/columnas no requiere tocar código.
//   · columnsX deja un pasillo central libre (|x| < 1.0) para el usuario y la mesa del laboratorio.
//   · rowsZ: z del centro de cada pupitre; el alumno se sienta detrás (z mayor) mirando al pizarrón (-z).
// Interior del salón en el mundo: x ∈ [-3.37, 3.73], z ∈ [-2.99, 5.19] (el pizarrón está en z ≈ -3.0).
export const CLASSROOM = {
  enabled: true,
  desk: { width: 1.1, depth: 0.5, height: 0.75, topThickness: 0.035 },
  columnsX: [-2.65, -1.55, 1.55, 2.65],
  // La primera fila empieza en z = -1.25 para dejar espacio al frente para el escritorio del profesor.
  rowsZ: [-1.25, -0.13, 0.99, 2.11, 3.23, 4.35],
  colors: { top: 0x2457c5, frame: 0x15171c, chair: 0x30343b },
  chairJitter: 0.1, // variación fija (determinista) de posición/giro de las sillas, para que no se vean clonadas
  // Muros invisibles para las piezas (margen respecto a los límites reales del modelo, en metros).
  roomMargin: 0.25,
};

// Escritorio del profesor (como el del salón real): tarima baja, escritorio de tablero de madera con
// estructura negra y silla negra, en la esquina del frente junto a las ventanas (x < 0). El profesor
// está sentado mirando a los alumnos (+z). Coordenadas de MUNDO.
export const TEACHER = {
  enabled: true,
  platform: { min: [-3.37, -2.99], max: [-1.25, -1.65], height: 0.12, color: 0xc9c2b4 },
  desk: { x: -2.35, z: -2.15, width: 1.2, depth: 0.62, height: 0.76, topThickness: 0.035, topColor: 0x7a5232 },
  chairZ: -2.72, // silla detrás del escritorio (lado del pizarrón), girada 180° hacia los alumnos
  professor: {
    skin: 0xc68e64, hair: 0x1c1512, jacket: 0x6b4226, shirt: 0xe9e4da, pants: 0x2b2f3a, shoes: 0x141414,
    glasses: 0x111111,
    maxHeadYaw: 0.7, // rad: hasta dónde voltea la cabeza para mirar al usuario
  },
};

// Puerta del salón: la hoja de la puerta del GLB se separa del marco y gira sobre su bisagra.
// Coordenadas del MODELO (antes de girar/colocar el salón). Se abre/cierra al tocarla con el dedo,
// al apuntarla con el rayo y pellizcar, o con un clic en la vista de escritorio.
export const DOOR = {
  enabled: true,
  materials: { wood: 'Madera roble', glass: 'Cristal puerta', handle: 'Metal manija' },
  // Hoja: x 0.08…0.12, y 0.005…2.278, z -1.508…-0.572 (el resto de "Madera roble" es marco y dintel).
  leaf: { min: [0.079, 0.004, -1.509], max: [0.121, 2.279, -0.571] },
  hinge: [0.12, -0.572],     // eje vertical (x, z) del lado opuesto a la manija, cara interior
  openAngleDeg: -95,         // negativo = abre hacia el interior del salón
  speed: 2.4,                // rad/s
  touchMargin: 0.03,         // m alrededor de la hoja que cuentan como "tocar"
  touchCooldownMs: 800,      // evita que un solo toque la abra y la cierre
  hallway: { color: 0xb8b2a6, depth: 1.6 }, // piso del pasillo que se ve al abrir
};

// Visitantes: al abrir la puerta aparecen unas mujeres en el pasillo saludando con la mano.
// Coordenadas del MODELO del salón (el pasillo está en x < 0; el interior del salón en x > 0.2).
export const VISITORS = {
  enabled: true,
  people: [
    { x: -0.75, z: -1.32, dress: 0xc2185b, hair: 0x3b2314, skin: 0xd9a27a, hairLong: true, phase: 0 },
    { x: -0.95, z: -1.0, dress: 0x00897b, hair: 0x111111, skin: 0xa8734f, hairLong: true, phase: 1.3 },
    { x: -0.7, z: -0.7, dress: 0xf9a825, hair: 0x8d5524, skin: 0xe8b996, hairLong: false, phase: 2.4 },
  ],
  greeting: '¡Hola!',
  hallwayWall: { color: 0xe6e1d6, height: 2.7 },
};
