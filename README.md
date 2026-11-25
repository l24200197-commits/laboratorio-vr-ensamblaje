# Laboratorio virtual de manipulación y ensamblaje 3D

Práctica **3.1 Introducción a las aplicaciones VR** · Meta Quest 3 · Three.js r160 + WebXR · Bootstrap 5.3

Aplicación web **100 % estática** de realidad virtual inmersiva (`immersive-vr`). El usuario toma cinco piezas geométricas con **seguimiento de manos** (rayo + pinza índice-pulgar), las arrastra y las suelta sobre su **caja**: caen por **gravedad** y se validan al quedar quietas. Incluye validación, sonido, contador 0/5, cronómetro, reinicio y salida de VR desde un panel 3D.

- Repositorio: `https://github.com/<usuario>/<repositorio>`
- GitHub Pages: `https://<usuario>.github.io/<repositorio>/`

## Requisitos
- Meta Quest 3 con Meta Quest Browser actualizado y **seguimiento de manos activado**.
- Para desarrollo: Visual Studio Code + extensión Live Server + Git. **Sin Node.js, npm, bundlers ni backend.**

## Ejecución local (sin compilación)
1. Abrir la carpeta en VS Code.
2. Clic derecho en `index.html` → **Open with Live Server** (`http://127.0.0.1:5500/`). No usar `file://`: los módulos ES fallan.
3. En escritorio se ve la portada y una **vista previa 3D de depuración** (arrastrar piezas con ratón). Esto **no es VR**.

> `localhost` de la PC **no** es el `localhost` del visor. La prueba de manos se hace en el Quest con la URL HTTPS de GitHub Pages.

## Publicación en GitHub Pages
1. Crear repositorio **público** y subir los archivos a la rama `main` (raíz).
2. *Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/(root)` → Save*.
3. Esperar 1-2 min y abrir `https://<usuario>.github.io/<repositorio>/`.
4. Todas las rutas internas son **relativas** (`js/main.js`, `css/styles.css`, `assets/favicon.svg`), por eso funcionan bajo el subdirectorio `/<repositorio>/`. El archivo `.nojekyll` evita el procesamiento Jekyll.
5. Depuración: DevTools → *Console* (errores de módulos) y *Network* (404 = ruta incorrecta; fallos en `cdn.jsdelivr.net` = CDN/versión).

## Controles (dentro de VR)
| Acción | Gesto |
|---|---|
| Apuntar | Rayo azul que sale de la mano; la pieza apuntada se ilumina |
| Tomar | Pinza índice + pulgar |
| Arrastrar | Mantener la pinza y mover la mano (se conserva el offset de agarre) |
| Soltar / validar | Abrir la pinza |
| Reiniciar / Salir de VR | Apuntar al botón 3D bajo el panel y pellizcar |

No usar la pinza con la palma hacia la cara: es el gesto de menú del sistema Meta y la app no lo intercepta.

## Import map
Declarado en `index.html` **antes** del `<script type="module">`:
```json
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/" } }
```
El navegador no sabe qué es `import 'three'` (especificador "desnudo"). El import map le dice a qué URL corresponde. La entrada con `/` final mapea un **prefijo**: `three/addons/webxr/XRHandModelFactory.js` → `.../examples/jsm/webxr/XRHandModelFactory.js`. Núcleo y addons usan **la misma versión y el mismo CDN**; si se mezclaran versiones habría dos copias de Three.js con clases incompatibles (`instanceof` falla, errores de materiales, etc.). Los addons importan internamente `'three'`, que también se resuelve por el mismo mapa.

## Arquitectura
| Módulo | Responsabilidad |
|---|---|
| `js/main.js` | Inicialización: renderer, cámara, sesión WebXR (entrar/salir/fin por el sistema), ciclo `setAnimationLoop` |
| `js/config.js` | Datos: piezas, cajas, gravedad, área de trabajo, HUD, salón y mobiliario |
| `js/state.js` | **Estado central único** (estados de piezas, fase, mensaje, cronómetro, sesión XR). El progreso se *deriva* contando piezas `colocada` → no puede duplicarse |
| `js/rules.js` | Regla de validación pura (¿en qué caja quedó la pieza? ¿es la suya?) |
| `js/physics.js` | Gravedad, rebote y colisión con mesa/cajas/pupitres/piso (sin dependencias; probada en Node) |
| `js/teacher.js` | Zona del profesor: tarima, escritorio de madera, silla y profesor sentado (respira y voltea a ver al usuario) |
| `js/door.js` | Puerta interactiva: separa la hoja del marco en el GLB y la gira sobre su bisagra |
| `js/classroom.js` | Pupitres azules y sillas (InstancedMesh) y la geometría del pupitre que reutiliza la mesa del laboratorio |
| `js/lab.js` | Máquina de estados: tomar, soltar, caer, acierto/error, bloqueo, reinicio, retroalimentación visual |
| `js/scene.js` | Mesa, 5 piezas y 5 cajas de depósito; carga del salón GLB (`loadSalon`) y entorno genérico de respaldo (`buildGenericEnvironment`) |
| `js/hud.js` | Panel 3D (canvas → textura) y botones 3D *Reiniciar* / *Salir de VR* |
| `js/xr-hands.js` | Manos XR: modelo de manos, rayo, raycasting, pinza (`selectstart/selectend`), arrastre, pérdida de tracking |
| `js/desktop-pointer.js` | Depuración con ratón en escritorio (no sustituye VR) |
| `js/page-ui.js` | Portada Bootstrap: estado de compatibilidad, errores, botón Entrar a VR |
| `js/audio.js` | Sonidos sintetizados con Web Audio (sin archivos, sin licencias) |
| `js/text.js` | Utilidades de texto sobre texturas |

Flujo: **portada → Entrar a VR → apuntar → pinza (seleccionada) → mover (en movimiento) → soltar → cae por gravedad (cayendo) → queda quieta → validar → colocada / error → progreso**.

### Reglas de negocio
- Estados de pieza: `disponible → seleccionada → en movimiento → cayendo → colocada` (o vuelve a `disponible` tras un error).
- Al soltar la pinza la pieza **cae por gravedad** (`LAB.physics`: 9.81 m/s², rebote 0.25, fricción). Si la mano se movía, hereda el 60 % de su velocidad (tope 2 m/s). Con el ratón se levanta sobre el borde de las cajas al tomarla y cae al soltarla.
- La validación ocurre **cuando la pieza queda quieta** (≥ 0.35 s por debajo de 5 cm/s; seguro de 6 s). «Dentro de una caja» = el centro de la pieza está dentro del hueco de la caja y por debajo de su borde.
- **Acierto**: queda dentro de SU caja. Se queda donde cayó, caja y pieza en verde, sonido, bloqueo, +1.
- **Caja equivocada** o **fuera de las cajas** (mesa, piso, pupitre): rojo temporal (pieza y caja), sonido grave, mensaje; no suma; tras la señal la pieza vuelve a su lugar.
- Una pieza `colocada`, `cayendo` o sujeta por otra mano no es seleccionable. Las piezas se pueden apilar/golpear entre sí.
- Prioridad del rayo: botones > piezas; piso, mesa, cajas, salón y mobiliario nunca están en la lista de raycast.
- Cronómetro: inicia al tomar la primera pieza; se detiene en 5/5.
- Reiniciar: suelta selecciones activas, cancela caídas en curso y restaura posiciones, orientaciones, materiales, estados, contador y cronómetro (también tras completar).
- Pérdida de tracking durante arrastre / fin de sesión por el sistema: la pieza se libera con seguridad y regresa a su posición inicial.

### Física (`js/physics.js`)
Cada pieza es una caja de colisión vertical (radio `r`, semialtura `h`); los sólidos fijos son AABB (tablero de la mesa, piso y 4 paredes de cada caja, tablero de cada pupitre) más el piso del salón y unos muros invisibles a ≈ 25 cm de los muros reales. Paso fijo de 1/120 s (resultado independiente de los FPS). Los bordes estrechos de las cajas no admiten equilibrio: la pieza resbala hacia el lado donde está su centro. Pruebas unitarias en `tests/phys.test.mjs` (`node tests/phys.test.mjs`).

## Mobiliario
`CLASSROOM` (config.js) define 6 filas × 4 columnas de pupitres (tablero azul, estructura negra) con una silla detrás de cada uno, con pasillo central libre; todo son datos (quitar filas o columnas no requiere código). La mesa del laboratorio usa el mismo pupitre, más grande. ~4 000 triángulos y 4 draw calls (InstancedMesh). Las sillas tienen una pequeña variación fija (semilla constante) para no verse clonadas.

## Profesor y puerta
- **Escritorio del profesor** (`TEACHER` en config.js): en la esquina del frente junto a las ventanas, sobre una tarima baja, con tablero de madera, estructura negra, laptop y papeles. El profesor está sentado en su silla mirando a los alumnos y voltea la cabeza hacia el usuario. La tarima y el escritorio son sólidos para la física.
- **Puerta** (`DOOR` en config.js): se abre o cierra **tocándola con la punta del dedo índice** (o con el control), **apuntándola con el rayo y pellizcando**, o con **clic** en la vista de escritorio. Gira 95° hacia el interior del salón; un toque solo alterna al entrar en contacto (con 0.8 s de espera) para que no se abra y cierre de inmediato.

## Salón de clases (GLB)
El laboratorio se monta dentro de `assets/models/salon.glb` (carga con `GLTFLoader`, ruta relativa, compatible con GitHub Pages). Si el archivo falla, se muestra el error en `#error-box` y se usa el entorno genérico anterior: la práctica sigue funcionando.

- **Modelo optimizado**: metros, +Y arriba, piso en y = 0, ~1 100 triángulos, 10 draw calls, 3 texturas PNG (≤512 px), sin la figura de escala de SketchUp (fuente actual: `Salon_corregido.glb`), sin extensiones especiales (el original usaba *specular-glossiness*, que Three r160 no soporta; se convirtió a PBR metal-rough).
- **Alineación** (`SALON` en `js/config.js`): `position` y `rotationYDeg` colocan el salón para que el usuario nazca en (0, 0) sobre el piso, de frente al pizarrón, con la mesa del laboratorio dentro del salón sin cruzar muros. Para mover el salón solo se editan esos datos.
- **Raycast**: todo el salón y el mobiliario tienen `raycast` desactivado; los rayos de manos y ratón solo pueden tocar piezas disponibles y botones del HUD.
- **Iluminación**: hemisférica + direccional (sin sombras), fondo de cielo claro para las ventanas y techo procedural (`SALON.ceiling`) porque el modelo no trae techo.
- **Reexportar desde SketchUp**: glTF/GLB real (no renombrar un `.skp`), unidades en metros. Si se cambia el modelo, repetir el análisis de escala/triángulos y reajustar `SALON.position`.

## Compatibilidad y seguridad
- Detección por capacidades (`navigator.xr.isSessionSupported('immersive-vr')`), no por user-agent.
- Sesión: `immersive-vr`, `local-floor` requerido, `hand-tracking` opcional. **Sin AR, sin passthrough, sin cámaras.**
- Sin secretos, tokens, analítica, `eval` ni backend.

## Rendimiento (optimizaciones aplicadas)
Geometrías primitivas de bajo número de polígonos, salón optimizado (ver arriba), sin sombras ni posprocesado, HUD redibujado solo cuando cambia el texto (~1 vez/s), raycast sobre una lista acotada. **No se afirman FPS**: medir en el visor con Meta Quest Developer Hub / OVR Metrics Tool.

## Créditos y licencias
- Desarrollo: **[Tu nombre]** — [Institución], 2026.
- [Three.js](https://threejs.org) r160 — MIT. Idea de interacción basada en el ejemplo `webxr_vr_handinput_pointerdrag` (no se copió su diseño).
- [Bootstrap](https://getbootstrap.com) 5.3.3 — MIT.
- Favicon, geometrías y sonidos: creación propia.
- Código asistido por un agente de IA (Claude), revisado por el autor.

## Limitaciones conocidas
- La arrastre en escritorio es solo en plano horizontal (depuración).
- El seguimiento de manos depende de la iluminación y de que las manos estén dentro del campo de visión.
- Ver `docs/matriz-pruebas.md`: las pruebas marcadas *Quest* solo pueden aprobarse con evidencia real en el visor.
