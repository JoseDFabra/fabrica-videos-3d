# Personajes 3D (`componentes/personaje3d.js`)

Personas low-poly amables, en 3D (Three.js r158), sentadas en silla de oficina frente a un escritorio con monitor o
portátil, con poses que se encadenan en el tiempo y la pantalla del equipo como lienzo que el video dibuja. Estilo
plano (`MeshToonMaterial` de 3 tonos, luz suave, sin brillos ni neón), canvas transparente sobre el fondo oscuro de la
marca. Todo es función pura de `t`: mismo `t` → mismo cuadro (verificado con `framemd5`).

Demo: `pruebas/personaje-3d/` (12,5 s, sin voz) → `salida/personaje-3d-demo.mp4`, hoja `salida/cuadros-2fps.jpg`.

## Incluirlo en un video

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<script src="lib/vendor/three-r158.min.js"></script>   <!-- local: nada del 3D sale a internet -->
<script src="tiempos.js"></script>
<script src="lib/fabrica.js"></script>
<script src="lib/personaje3d.js"></script>
...
<canvas id="gl" width="1080" height="1920" style="position:absolute;left:0;top:0;width:1080px;height:1920px"></canvas>
```

`python3 motor/fabrica.py lib` copia `personaje3d.js` y `componentes/vendor/` (three r158 + licencia MIT) a `lib/`
**solo si `index.html` menciona `personaje3d.js`**; a los demás videos no les llega nada nuevo. Por eso: escribe
primero las etiquetas `<script>` y luego corre `lib`.

## API

```js
const fx = Fabrica.crear("mi-marca-NN-nombre");
const { W, F } = fx;
try {
  const esc = Personaje3D.escena("#gl", { fov: 34 });          // renderer (preserveDrawingBuffer), escena, cámara, luces, piso
  const ana = esc.persona({ piel: 2, pelo: "#3b2618", ropa: "#3d62f1", peinado: "rizado", planta: true });
  ana.pose("escribe", W(0), W(7))                              // pose(nombre, desde, hasta = ∞, { trans })
     .pose("mira-celular", W(7), W(15))
     .pose("sorpresa", W(15), F[3])
     .pose("celebra", W(40));
  ana.pantalla((ctx, w, h, t) => { /* canvas 2D del monitor, 640×390 (portátil 512×320) */ });
  ana.pantallaCelular((ctx, w, h, t) => { /* 128×256 */ });
  esc.camara([{ t: 0, angulo: 150, altura: 2.2, distancia: 4.6, mira: [0, 0.66, -0.4] },
              { t: W(7), angulo: 40, altura: 1.95, distancia: 5.2, mira: [-0.22, 0.66, -0.25] }]);
  fx.dibuja((t) => esc.dibujar(t));                            // un solo reloj, un solo render por cuadro
} catch (e) { console.warn("3D apagado:", e); }                // sin WebGL el timeline igual se registra
window.__timelines["mi-marca-NN-nombre"] = fx.fin();
```

### `Personaje3D.escena(canvas, opciones)`
`canvas`: selector o elemento (o `null` para calcular sin dibujar, como en `prueba.js`). Opciones: `ancho`/`alto`
(1080×1920), `fov` (34), `fondo` (color; por defecto transparente), `piso` (`false` lo quita), `radioPiso`, `colorPiso`,
`luzAmbiente` (1.5), `luzPrincipal` (2.3), `contraluz` (0.7), `vaiven` (0.01 m: deriva leve para que la cámara nunca
quede clavada). Devuelve `esc` con:

- `esc.persona(opciones)` → persona (ver abajo). Varias personas: cada una con su puesto, ubicadas con `en: [x, z]` y `giro` (grados).
- `esc.camara(claves | fn)`: claves en **órbita** `{ t, angulo, altura, distancia, mira: [x,y,z], fov }` (ángulo en grados:
  0 = de frente, 90 = a su derecha, 180 = por detrás) o **cartesianas** `{ t, pos, mira, fov }`. Lo que una clave no dice
  se hereda de la anterior. Interpolación cúbica monótona por canal: velocidad continua y sin pasarse (dos claves iguales =
  quieta, sin rebote). También acepta `(t) => ({ pos, mira, fov })`.
- `esc.dibujar(t)`: poses + pantallas + cámara + `renderer.render`. Llámalo solo desde `fx.dibuja`.
- `esc.caja(t)` → `{x0, y0, x1, y1}` en px de todo lo de las personas y sus puestos (para comprobar que nada se sale).
- `esc.ok` (hay WebGL), `esc.scene`, `esc.camera`, `esc.renderer`, `esc.THREE`, `esc.material(color)` (toon cacheado),
  `esc.malla(geo, color, padre, pos, rot, escala)` para sumar objetos propios con el mismo estilo.

### `esc.persona(opciones)`
| opción | valores |
|---|---|
| `piel`, `pelo`, `ropa` | color CSS o índice de `Personaje3D.PIELES` (6 tonos), `PELOS` (6), `ROPAS` (8). Sin «colores de niño/niña»: cualquier combinación vale para cualquiera. |
| `pantalon`, `zapatos`, `ojos`, `mesa`, `silla`, `carcasa`, `colorTaza`, `colorLentes` | colores |
| `peinado` | `corto`, `rizado`, `largo`, `mono` (moño), `rapado` |
| `lentes` | `true` |
| `manga` | `"corta"` (antebrazo en piel) |
| `equipo` | `"monitor"` (con teclado y ratón) o `"laptop"` |
| `taza` (`false` la quita), `planta` (`true`), `celular` (`false` lo quita) | |
| `en`, `giro`, `desfase` | posición del puesto, giro en grados, desfase de los movimientos (dos personas no se mueven igual) |

Métodos: `pose(nombre, desde, hasta, { trans })`, `pantalla(fn)`, `pantallaCelular(fn)`, `estado(t)` (los números de la
pose mezclada), `revisa(t)` (lista de brazos/manos que atraviesan la mesa; `[]` si nada), `ultimo()`, y los grupos
`grupo`, `cuerpo`, `torso`, `cabeza`, `celular` por si hace falta pegarles algo.

## Poses

| pose | qué hace | transición de entrada |
|---|---|---|
| `respira` | reposo que nunca está quieto: respira, mano en el ratón, la otra en la mesa, cabeza que deriva | 0,8 s |
| `escribe` | inclinada a la pantalla, teclea (golpecitos a ~4 Hz por mano), cabeza leve | 0,5 s |
| `mira-celular` | coreografía: alcanza el celular de la mesa, lo levanta, lo mira (pulgar), y al final **lo deja donde estaba**. Pide ≥ 2,4 s para el ritmo completo; con menos, se comprime | 0,5 s |
| `sorpresa` | la silla rueda 11 cm atrás, se echa atrás, manos arriba al pecho, cejas arriba, ojos grandes, boca «o» | 0,3 s |
| `preocupado` | mano detrás de la cabeza (se rasca), cabeza gacha e inclinada, cejas de pena, boca hacia abajo | 0,5 s |
| `piensa` | mano al mentón, mira arriba a un lado, una ceja levantada | 0,5 s |
| `celebra` | brazos arriba en V con rebote, ojos felices, sonrisa grande | 0,55 s |
| `saluda` | saluda con la mano derecha, sonriendo | 0,5 s |

Alias: `celular` = `mira-celular`, `idle`/`quieto` = `respira`. Entre poses se mezcla con *smootherstep* (C²) y la
mezcla es recursiva: aunque una pose empiece antes de que termine la transición anterior, no hay saltos. Los huecos
entre poses y lo que va después de la última se llenan con `respira`. El parpadeo es con semilla (cada 2,4–5 s, 0,16 s).

Brazos con **IK de dos huesos** (hombro → codo → mano): las poses dicen dónde va cada mano (en el marco del puesto
`{ p: [...] }` —el teclado no se mueve aunque la silla ruede— o en el del torso `{ t: [...] }`) y hacia dónde apunta el
codo. Pose nueva: `Personaje3D.POSES["mi-pose"] = (c) => ({ ... })` con los campos de `Personaje3D.BASE`
(`silla, tI, tG, tL` torso, `cX, cY, cZ` cabeza, `ceja, pena, asim, ojos, feliz, boca (−1…1), bocaO`, `manoI, manoD`,
`codoI, codoD`, `agarre, alza` para el celular) y `c = { t, v, s, d, tramo(a,b), A }` (`s` segundos desde que empezó,
`d` duración, `A` = `Personaje3D.ANCLA`: teclado, ratón, celular, reposo). Después: `node pruebas/personaje-3d/prueba.js`.

## Atar poses a la voz

Igual que todo en la fábrica: nunca segundos fijos, siempre `W(i)` / `F[k]`.

```js
// «Estabas cerrando el mes (escribe) cuando te llegó un mensaje (mira-celular): ¡un centavo menos! (sorpresa)»
ana.pose("escribe", F[0], W(6) - 0.2)
   .pose("mira-celular", W(6) - 0.2, W(12))          // ≥ 2,4 s para que alcance a dejar el celular
   .pose("sorpresa", W(12) - 0.1, F[2])               // un poco antes de la palabra: la cara llega con ella
   .pose("preocupado", F[2], F[3]);
ana.pantalla((ctx, w, h, t) => (t < W(12) ? dibujaSaldo : dibujaAlerta)(ctx, w, h, t));
```

Ritmo (SKILL.md): una pose o un movimiento de cámara nuevo cada 2,5–4 s; la cámara orbita despacio (≤ ~60°/s) y nunca
pasa por el frente exacto (`angulo` ≈ 0) a la altura de la cara: el monitor la tapa. Por encima del hombro (130–160°)
se lee la pantalla; de 3/4 (30–60°) se ve la cara.

## Encuadre y comprobaciones

- Con `fov` 34, una persona con su puesto entera cabe en 9:16 a `distancia` 4,6–5,4 y `altura` 1,9–2,4 mirando a
  `y ≈ 0,66`; a 3/4 corre `mira` unos −0,22 en x para centrar (el escritorio se abre hacia un lado).
- `node pruebas/personaje-3d/prueba.js` (copia el patrón para tu video): cuadro a cuadro a 30 fps revisa brazos contra
  la mesa (`persona.revisa`), la caja en pantalla (`esc.caja`) y el mayor salto por cuadro de manos y celular. No
  necesita navegador (three en Node, canvas falso).
- `npx hyperframes snapshot --at 1,3.6,5.5` para iterar cámara y caras (≈ 5 s por tanda, sin renderizar).
- Hoja densa: `ffmpeg -i x.mp4 -vf "fps=2,scale=270:-1,tile=9x3" hoja.jpg`.
- Determinismo: `npx hyperframes render --crf 0 --start 2 --end 6 ...` dos veces y comparar
  `ffmpeg -i x.mp4 -map 0:v -f framemd5 -`.
- Texto en la pantalla: el canvas usa la fuente si ya cargó. Usa en el canvas una fuente que ya esté en el HTML
  (Archivo de `lib/marca.css`) para que HyperFrames la espere; si no, los primeros cuadros podrían salir con otra.

## Costos medidos (Mac, GPU, 2026-11-01)

- Demo completa 12,5 s · 375 cuadros · 1080×1920 · calidad alta: **10,6 s** de render (≈ 0,03 s/cuadro; 12 s de
  pared con lint y arranque). Una persona con puesto ≈ 70 mallas; texturas del monitor y el celular se suben cada cuadro (barato).
- Tramo 2–6 s (120 cuadros) con `--crf 0`: 23,2–23,4 s (casi todo es codificar sin pérdida).
- **Determinismo**: ese tramo, dos renders → los 120 cuadros con el mismo `framemd5` (`pruebas/personaje-3d/salida/det-*.framemd5`).
- `prueba.js`: 0 choques con la mesa, todo dentro del cuadro (x 20–1059, y 441–1627), mayor salto por cuadro 0,088 m
  (brazos al subir en `celebra`) y 0,067 m el celular.
- Cuatro personas a la vez (monitor, portátil, lentes, manga corta) se dibujan sin problema (`snapshot`).

## Límites e ideas

- Las piernas no se mueven (están bajo la mesa); no hay personas de pie ni caminando.
- La cara es de estilo plano: ojos de punto, cejas, boca; no hay pupilas que miren a un lado ni boca que hable
  (sincronía labial con `tiempos.js` sería posible: abrir `bocaO` con las palabras).
- Ideas: `mira-camara` (gira la cabeza al espectador: identifica mucho), `bosteza`/`cansado` (noche), `habla-telefono`,
  `se-levanta`, `señala-pantalla`; un segundo personaje que llega por detrás; oficina con ventana/noche; vista cenital
  de varias mesas («todo el equipo»); `esc.letrero(texto)` como globo 3D sobre la cabeza.
