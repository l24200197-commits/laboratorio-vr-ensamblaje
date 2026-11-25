// Estado central ÚNICO del laboratorio. El progreso se DERIVA de los estados de las piezas
// (no existe un contador separado que pueda desincronizarse o duplicarse).

export const STATUS = Object.freeze({
  AVAILABLE: 'disponible',
  SELECTED: 'seleccionada',
  MOVING: 'en movimiento',
  FALLING: 'cayendo', // soltada: cae por gravedad hasta quedar quieta y se evalúa
  PLACED: 'colocada',
});

export const PHASE = Object.freeze({
  PENDING: 'pendiente',
  ACTIVE: 'activo',
  ERROR: 'error',
  DONE: 'completado',
});

const VALID_STATUS = new Set(Object.values(STATUS));

export function createStore(pieceIds) {
  if (!Array.isArray(pieceIds) || pieceIds.length === 0) {
    throw new TypeError('createStore requiere una lista de IDs de piezas');
  }

  const initial = () => ({
    pieces: new Map(pieceIds.map((id) => [id, { status: STATUS.AVAILABLE, holder: null }])),
    phase: PHASE.PENDING,
    message: 'Toma las piezas de la mesa de atrás y llévalas a su caja',
    errorUntil: 0,
    timerStart: null,
    timerEnd: null,
  });

  let state = initial();
  // Datos de sesión XR: se conservan entre reinicios del reto.
  const session = { xrActive: false, hands: { left: false, right: false }, controllers: false };

  return {
    total: pieceIds.length,
    session,
    get: () => state,
    piece: (id) => state.pieces.get(id),

    placedCount() {
      let n = 0;
      for (const p of state.pieces.values()) if (p.status === STATUS.PLACED) n++;
      return n;
    },

    setPiece(id, status, holder = null) {
      const p = state.pieces.get(id);
      if (!p) throw new Error(`Pieza desconocida: ${id}`);
      if (!VALID_STATUS.has(status)) throw new Error(`Estado inválido: ${status}`);
      p.status = status;
      p.holder = holder;
    },

    startTimer(now) { if (state.timerStart === null) state.timerStart = now; },
    stopTimer(now) { if (state.timerStart !== null && state.timerEnd === null) state.timerEnd = now; },
    elapsedMs(now) {
      if (state.timerStart === null) return 0;
      return (state.timerEnd ?? now) - state.timerStart;
    },

    setPhase(phase, message, errorUntil = 0) {
      state.phase = phase;
      state.message = message;
      state.errorUntil = errorUntil;
    },

    tick(now) {
      if (state.phase === PHASE.ERROR && now >= state.errorUntil) {
        state.phase = PHASE.ACTIVE;
        state.message = 'Intenta de nuevo';
      }
    },

    reset() { state = initial(); },
  };
}

export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}
