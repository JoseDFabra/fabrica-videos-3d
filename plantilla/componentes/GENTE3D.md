# Gente 3D de pie (`componentes/gente3d.js`)

Multitudes low-poly amables en 3D (Three.js r158): personas de pie con cara plana (ojos de punto, cejas, boca) que
esperan fastidiadas, miran el reloj o el celular, bostezan, se impacientan, caminan y celebran; y la utilería de una
«fila»: caja/taquilla con cajero y **barra de carga**, **portero** que señala, **paquetes** (solicitudes) que viajan,
**carteles** y un **piso que parece una página web**. Mismo estilo que `personaje3d.js` (toon de 3 tonos
`[90,170,255]`, luz suave, colores planos, sin brillos ni neón). Todo es función pura de `t` (verificado con `framemd5`).

Las personas se dibujan con **InstancedMesh por parte del cuerpo**: ~28 draw calls para 1 o 300 personas.

Demo: `pruebas/gente-3d/` (10 s, sin voz) → `salida/gente-3d-demo.mp4`, hoja `salida/cuadros-2fps.jpg`.
Prueba de carga: `pruebas/gente-3d/estres/` (150 personas, 5 s) → `salida/estres.mp4`.

## Incluirlo en un video

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<script src="lib/vendor/three-r158.min.js"></script>   <!-- local: nada del 3D sale a internet -->
<script src="tiempos.js"></script>
<script src="lib/fabrica.js"></script>
<script src="lib/gente3d.js"></script>
...
<canvas id="gl" width="1080" height="1920" style="position:absolute;left:0;top:0;width:1080px;height:1920px"></canvas>
```

`python3 motor/fabrica.py lib` copia `gente3d.js` (y `componentes/vendor/`) a `lib/` **solo si `index.html` menciona
`gente3d.js`** (igual que con `personaje3d.js`; se pueden usar los dos). Escribe primero las etiquetas `<script>` y
luego corre `lib`. Si editas `componentes/gente3d.js`, vuelve a correr `lib` (la copia en `lib/` no se actualiza sola).

## API

```js
const fx = Fabrica.crear("mi-marca-NN-nombre");
const { W, F } = fx;
try {
  const esc = Gente3D.escena("#gl", { fov: 38, piso: false });
  esc.pagina({ ancho: 8.6, largo: 15, url: "boletas.com/fila-virtual", titulo: "Preventa", boton: "COMPRAR" });
  const caja = esc.caja({ en: [0.75, 5.7], giro: 180, barra: [[0, 0.4], [W(9), 1]] });     // mira a −z (a la fila)
  const ana = esc.persona({ en: [0.75, 4.85], piel: 2, pelo: 1, ropa: "#2a9d8f", peinado: "rizado" });
  ana.estado("espera-fastidio", F[0], W(6))
     .estado("mira-reloj", W(6), W(11))
     .globo("reloj", W(6), W(11))
     .ir([2.25, 4.85], W(12), W(12) + 1.5).gira(0, W(12) + 1.6)
     .estado("feliz", W(12) + 1.6);
  esc.portero({ en: [3.7, 4.4], giro: -90 }).apunta([2.25, 0.9, 4.2], W(12), F[3]);
  esc.paquete({ de: (t) => ana.punto("pecho", t), a: caja.punto(0), desde: W(8), hasta: W(8) + 0.9 });
  esc.camara([{ t: 0, angulo: -42, altura: 1.3, distancia: 1.1, mira: [0.75, 1.2, 4.85], fov: 40 },
              { t: W(5), angulo: 2, altura: 13, distancia: 8, mira: [0.5, 0, 1], fov: 48 }]);
  fx.dibuja((t) => esc.dibujar(t));                            // un solo reloj, un solo render por cuadro
} catch (e) { console.warn("3D apagado:", e); }
window.__timelines["mi-marca-NN-nombre"] = fx.fin();
```

### Ejes y convenciones
- Metros; piso `y = 0`. Una persona con `giro: 0` **mira hacia +z**; su izquierda es +x. `giro` en grados (90 = mira a +x).
- Altura 1 ≈ 1,40 m de coronilla (proporción amable de cabeza grande). Por defecto, altura al azar 0,92–1,08.
- Cámara en órbita: `angulo` 0 = de frente a quien tiene giro 0 (cámara en +z), 90 = a su derecha (−x), 180 = por detrás.

### `Gente3D.escena(canvas, opciones)` → `esc`
`canvas`: selector, elemento o `null` (calcular sin dibujar, para `prueba.js` en Node). Opciones: `ancho`/`alto`
(1080×1920), `fov` (38), `fondo` (por defecto transparente), `piso` (`false` quita el disco suave; radio `radioPiso` 5),
`luzAmbiente` (1.5), `luzPrincipal` (2.2), `contraluz` (0.6), `vaiven` (0.01), `detalle` (`"normal"` | `"lejos"`),
`cara` (1: tamaño de ojos/cejas/boca; 1,3–1,5 ayuda en planos muy lejanos), `duracion` (60: tope de `camino(fn)` sin `hasta`).

- `esc.camara(claves | fn)`: igual que personaje3d (interpolación cúbica monótona; lo que una clave no dice se hereda).
  Órbita `{ t, angulo, altura, distancia, mira:[x,y,z], fov }` o cartesianas `{ t, pos, mira, fov }`, o `(t) => ({pos, mira, fov})`.
- `esc.dibujar(t)`: cámara → gente y utilería → `renderer.render`. Llámalo solo desde `fx.dibuja`.
- `esc.aPantalla([x,y,z], t?)` → `{x, y, z, dentro}` en px del canvas: para pegar rótulos HTML a algo 3D (ver la demo).
- `esc.caja(t)` con un número = `esc.encuadre(t)` → `{x0,y0,x1,y1}` px de toda la gente (cabezas, manos, pies).
  Con un objeto, `esc.caja({...})` crea una caja/taquilla (abajo).
- `esc.ok`, `esc.scene`, `esc.camera`, `esc.renderer`, `esc.THREE`, `esc.grupo` (todo lo de la gente cuelga de aquí),
  `esc.material(color)` (toon cacheado), `esc.plano(color)` (sin luz), `esc.malla(geo, color, padre, pos, rot, escala)`.

### `Gente3D.en(scene, THREE, material?, opciones?)` → `g` (integrarse a una escena existente)
Crea un `Group` dentro de `scene` con la gente y la utilería, sin renderer, luces ni cámara propias. `material(color)`
opcional: tu caché de toon (así todo comparte material). Cada cuadro: `g.actualizar(t, camera)` **antes** de tu
`renderer.render` (la cámara hace falta para las barras, carteles y paquetes que miran a cámara). Tiene los mismos
`persona`, `gente`, `caja`, `portero`, `paquete`, `cartel`, `pagina`. Para reemplazar las figuras cilindro+esfera del
video 20: `const g = Gente3D.en(S, THREE, mat); g.gente(150, (i) => ({ en: camino(i) }))` y en el reloj `g.actualizar(t, cam)`.

### `esc.persona(opciones)` → persona
| opción | valores |
|---|---|
| `piel`, `pelo`, `ropa`, `pantalon` | color CSS o índice de `Gente3D.PIELES` (6), `PELOS` (6), `ROPAS` (10), `PANTALONES` (5). Sin índice: al azar con semilla. Sin «colores de niño/niña». |
| `peinado` | `corto`, `rizado`, `largo`, `mono` (moño), `rapado` |
| `altura` | 1 = 1,40 m (por defecto 0,92–1,08 al azar) |
| `en`, `giro` | `[x, z]`, grados |
| `semilla`, `desfase` | cambian el azar de colores/alturas y el desfase de los movimientos (dos personas nunca se mueven igual) |
| `lentes`, `manga: "corta"`, `chaleco: color`, `franja`, `reloj: false`, `sombra: false`, `sentado: altura` | extras |
| `colorCelular`, `ojos`, `zapatos`, `cara`, `detalle: "lejos"` | |

Métodos (todos encadenables):
- `estado(nombre, desde, hasta = ∞, { trans, ... })`: como `pose` de personaje3d; mezcla *smootherstep* recursiva, huecos = `respira`. `limpiar()` borra los estados puestos.
- `en(x, z)`, `giro(grados)`, `gira(grados | [x,z] | persona, t, dur = 0.5)`: se voltea en t.
- `camino(fn(t) → [x,z] | [[t,x,z],...], desde, hasta)`: se mueve; **mira hacia donde avanza** (giro suave) y **camina**
  automáticamente (pasos según la distancia recorrida: los pies no patinan). Al parar se queda mirando hacia donde iba
  (encadena `gira(0, t)` para que vuelva a mirar a la caja).
- `ir([x,z] | [[x,z],[x,z],...], desde, hasta)`: en línea recta o quebrada, a velocidad pareja (acelera y frena).
- `señala(objetivo, desde, hasta, { mano: "I"|"D" })`: el objetivo puede ser `[x,z]`, `[x,y,z]`, claves `[[t,x,y,z],...]`, `fn(t)` o un objeto con `.punto(t)` (una caja, otra persona).
- `globo(icono, desde, hasta, { tam })`: sprite sobre la cabeza con pop. Íconos: `"zzz"`, `"..."`, `"reloj"`, `"!"`, `"?"`, `"ok"`, `"x"`, `"sobre"`, `"carrito"` o cualquier texto corto.
- `aparece(t, dur)`, `desaparece(t, dur)`: pop de escala.
- `pantallaCelular(color | (ctx, 128, 256, t) => {})`: color plano (instanciado) o canvas propio (una malla más).
- Lectura: `posicion(t)`, `rumbo(t)`, `velocidad(t)`, `estadoEn(t)`, `punto("cabeza"|"cara"|"centro-cabeza"|"mano"|"manoI"|"pecho"|"pies", t?)`, `ultimo()`.

### Estados
| estado | qué hace |
|---|---|
| `respira` (`quieto`) | reposo vivo: respira, se mece apenas, la cabeza deriva |
| `espera-fastidio` (`fastidio`) | brazos cruzados, zapatea con la punta (talón fijo), cejas bajas hacia adentro, boca hacia abajo, resopla cada 2,4–3 s (hombros suben, mejillas infladas) |
| `mira-reloj` | ciclo de 3,4 s: sube la muñeca izquierda (reloj), mira, sacude la cabeza con fastidio, baja |
| `celular` | celular en la mano derecha con la pantalla hacia la cara, cabeza gacha, pulgar que toca |
| `bosteza` | ciclo de 4,2 s: estira los brazos arriba, cabeza atrás, boca muy abierta, ojos cerrados |
| `impaciente` | manos en la cintura, pasa el peso de un pie al otro, cada ~3 s estira el cuello para mirar adelante |
| `feliz` | sonrisa, ojos felices, manos juntas adelante, rebote leve |
| `celebra` | brazos arriba en V, saltitos (los pies despegan), sonrisa grande |
| `camina` | caminar en el sitio (`{ vel }` m/s); para moverse de verdad usa `camino`/`ir` |
| `señala` | gira el torso y la cabeza hacia el objetivo, brazo extendido con un vaivén de «por aquí»; la otra mano en la cintura |
| `atiende` | (cajero) teclea en el mostrador; mira a la pantalla y al público; con la barra alta se agobia (cejas de pena, boca abajo, teclea más rápido) |

**v1.1 · manos y mesa** (opciones comunes: `teclado`/`punto` = `[x,y,z]` del mundo, `fn(t)` u objeto con `.punto(t)`;
se convierten solos al marco de la persona. `mesa` = altura de la mesa en m (0,74), `dz` = distancia de las manos al torso):
| estado | qué hace |
|---|---|
| `teclea` | ambas manos sobre `teclado` tecleando por turnos. `{ teclado, ritmo: 5, desorden: 0–1 (niño), pausa: true (manos quietas), ancho: 0.24, sonrie, miraAbajo }` |
| `presiona` | una mano baja a `punto` y lo hunde en el instante `en`; la otra queda en `teclado` o en reposo. `{ punto, en, mano: "D"|"I", teclado }` (combínalo con `tablero.pulsa(id, en)`) |
| `escribe-pizarra` | de pie, mano derecha en `punto` (que se mueve con el trazo: usa `pizarra.punto(u, v)` dentro de `fn(t)`); la otra en la cintura |
| `mira` | gira cabeza y torso hacia `punto`. `{ punto, sentado: true, mesa }` (sentado apoya los antebrazos) |
| `reposo-mesa` | sentado, antebrazos sobre la mesa |
| `piensa` | mano a la barbilla, ojos arriba, cejas |
| `explica` | manos abiertas que gesticulan. `{ giroTorso }` |
| `discute` | se inclina hacia un lado y gesticula (murmullo). `{ lado: 1|-1 }` |
| `asiente` / `niega` | cabeza sí / no (sentado: `{ mesa }` deja las manos sobre la mesa) |
| `brazos-cruzados` | sentado y reclinado con los brazos cruzados (el «no» del jefe) |
| `sorpresa` | manos al pecho, se echa atrás, boca en «o» |
| `mira-camara` | mira al lente (para hablarle al público). `{ cY }` |

Sentado: `sentado: 0.46` (altura del asiento) ya flexiona rodillas y apoya los pies en el piso; `reclina: 0–1` echa el
torso atrás (asientos de cabina). Para cambiar de silla a de pie usa dos instancias con `aparece/desaparece` en el corte.

Estado nuevo: `Gente3D.ESTADOS["mi-estado"] = (c) => ({ ... })` con los campos de `Gente3D.BASE` (`cad`, `tI/tG/tL`
torso, `cX/cY/cZ` cabeza, `cuello`, `hombros`, `ceja`, `pena`, `enojo`, `ojos`, `cierra`, `feliz`, `boca` −1…1, `bocaO`,
`manoI/manoD` `{t:[...]}` (marco del torso) o `{l:[...]}` (marco de la persona), `codoI/codoD`, `pieI/pieD`
`[x, alza, z, punta]`, `celu`, `pulgar`, `brazosLibres` 0–1 = si al caminar los brazos se balancean). Brazos y piernas
con IK de dos huesos.

### Utilería
- **`esc.caja({ en, giro, ancho: 1.2, alto: 0.85, color, acento, barra, tamBarra, alturaBarra, cajero: {opciones} | false, aparece, desaparece })`**
  Mostrador con monitor y banquito, cajero sentado (`caja.cajero`, una persona más) y barra de carga encima que **siempre
  mira a la cámara**. `barra`: número, `fn(t)` o claves `[[t, v], ...]` (0–1); color verde → ámbar (0,5) → rojo (1), y
  late al llenarse. Métodos: `aparece(t)`, `desaparece(t)` (pop de escala, cajero incluido), `barra(x)`, `valor(t)`,
  `punto(t)` (frente del mostrador, para paquetes/portero), `puntoBarra()` (para un rótulo HTML).
- **`esc.portero({ ...opciones de persona, apunta, desde, hasta })`**: persona con chaleco ámbar y franja; `portero.apunta(objetivo, desde, hasta)`.
- **`esc.paquete({ de, a, desde, hasta, icono: "sobre"|"tarjeta"|"ok"|"x"|"carrito"|texto, color, tinta, tam, arco: 0.5, queda })`**:
  tarjeta que mira a cámara y viaja en arco de `de` a `a` (cada uno `[x,y,z]`, `[x,z]`, `fn(t)` u objeto con `.punto(t)`).
- **`esc.cartel(texto, { en: [x,y,z], giro, mira: "camara", ancho: 1.6, alto: 0.55, fondo, tinta, borde, marco, poste, aparece })`**:
  letrero plano con texto que se ajusta al ancho (`\n` = varias líneas); `cartel.texto("nuevo")` lo repinta.
- **`esc.pagina({ ancho, largo, centro: [x,z], giro, url, titulo, boton, colores, marco })`**: piso-ventana de navegador
  (puntos de colores, barra de dirección, título, botón, renglones) con marco índigo.

- **Salas e inmersión (v1.1)**, todas con `giro` y dibujos por tiempo `dibujo(ctx, w, h, t)` (deterministas, se repintan cada cuadro):
  - `esc.sala({ centro: [x,z], ancho, fondo, alto, piso, veta, pared, paredLado, zocalo, izquierda: true, derecha: false, techo, lampara: [x,z], ventana | ventanas: [{ x, y, ancho, alto, dibujo }] })` → `{ grupo, ventanas }`: piso de tablas, pared del fondo y laterales; el frente queda abierto para la cámara.
  - `esc.ventana({ en, giro, ancho, alto, px, dibujo, marco, cruz })`: vista al exterior (ciudad, espacio, simulación).
  - `esc.pizarra({ en, giro, ancho, alto, px, fondo, marco, dibujo })` → `{ punto(u, v) }`: u, v ∈ [0,1] desde arriba a la izquierda → punto del mundo para la mano.
  - `esc.mesa({ en: [x,z], largo (en z), ancho, alto: 0.74, giro, color })` → `{ alto, punto(dx, dz) }`; `esc.silla({ en, giro, alto: 0.44, reclina, color })`.
  - `esc.tablero({ en, giro, inclina: 35, ancho, alto, teclas: [[id, texto, color?]], columnas, tecla, pantalla: { ancho, alto, dibujo }, interruptores, semilla })` → `{ tecla(id), punto("teclado"|"pantalla"), pulsa(id, t, dur), tecleo(desde, hasta, ritmo, semilla) }`: consola inclinada con teclas 3D que se hunden e iluminan.
  - `esc.monitor({ en, giro, ancho, alto, dibujo })` → `{ punto() }`; `Gente3D.lienzoVivo(w, h, dibuja)`: textura de canvas que se repinta por cuadro.
  - Regla: nada de cursores HTML haciendo acciones humanas; la mano de una persona va al `punto` real (tecla, pizarra, pantalla).

## Atar a la voz
Igual que todo en la fábrica: tiempos con `W(i)` / `F[k]`, nunca segundos fijos. Una caminata de `ir` dura lo que le
des: ~1,2–1,6 m/s se ve natural; > 2 m/s se ve apurado. Un estado o movimiento de cámara nuevo cada 2,5–4 s.

## Encuadre y comprobaciones
- Primer plano de una cara en una fila: no pongas la cámara entre la persona y la de adelante en línea recta (se mete
  en la cabeza de la otra al alejarse); ponla en diagonal entre carriles (`angulo` ±40–50, `distancia` ≈ 1,1, `fov` 40).
- Plano «dron» de una fila de 4 carriles a 1,5 m: `altura` 12–14, `distancia` ≈ 8, `fov` 46–48 (cabezas de ~45 px: las
  caras aún se leen). En 9:16 lo ancho cabe mal: pon la fila a lo largo (en z) y los carriles juntos.
- Gestos vistos desde arriba: un brazo que señala **de lado en la pantalla** se lee; hacia la cámara, no.
- `node pruebas/gente-3d/prueba.js` (copia el patrón): cuadro a cuadro revisa personas a < 0,45 m (se atraviesan),
  el mayor salto por cuadro de manos y cabeza, dónde cae la cara del gancho y el costo con 150 personas.
- `npx hyperframes snapshot --at 0,2,4 --no-end` para iterar (≈ 5 s); `--zoom x,y,w,h --zoom-scale 1` para un detalle.
- Determinismo: `npx hyperframes render --crf 0 --start 5 --end 9 ...` dos veces y comparar `ffmpeg -i x.mp4 -map 0:v -f framemd5 -`.
- Texto de carteles, globos, paquetes y página: canvas con Archivo; se repinta solo cuando la fuente termina de cargar.

## Costos medidos (Mac, GPU, 2026-11-02)
- Demo 10 s · 300 cuadros · 1080×1920 · 45 personas (40 + 4 cajeros + portero), 4 cajas, ~30 paquetes, 7 globos:
  **11 s** de pared con lint (captura 6,4 s ≈ 47 cuadros/s con los workers en paralelo).
- Estrés 150 personas caminando/gesticulando + globos, 5 s · 150 cuadros: **7,7 s** de pared (captura 3,6 s ≈ 42 cuadros/s).
- CPU (Node, sin GPU): **1,3 ms por cuadro con 150 personas** (estados + IK + matrices); 28 InstancedMesh para toda la gente.
- **Determinismo**: tramo 5–9 s (120 cuadros, con caminatas, pop de la 4.ª caja, paquetes) dos renders → mismo
  `framemd5` (`pruebas/gente-3d/salida/det-*.framemd5`).
- `prueba.js` de la demo: nadie a menos de 0,67 m de otro en ningún cuadro; mayor salto por cuadro 0,18 m (una mano de
  alguien que avanza a ~2 m/s).

## Límites
- Sin colisiones automáticas: las rutas se diseñan para no cruzarse (y se comprueban con `prueba.js`). Personas que se
  cruzan se atraviesan.
- El celular va siempre en la mano derecha y el reloj en la izquierda. No hay objetos en la mano aparte del celular.
- `señala` usa una mano fija por tramo (la del lado del objetivo al empezar, o `{ mano }`); si el objetivo cruza al otro
  lado, el brazo cruza el cuerpo: parte el tramo en dos.
- La cara es plana (sin pupilas que miren a un lado ni boca que hable). En `detalle: "lejos"` no hay mejillas ni orejas.
- Sombras de contacto como manchas (no hay sombras proyectadas). Las barras/paquetes/globos miran siempre a la cámara.
- Las personas no suben escaleras ni se sientan en sillas genéricas (solo `sentado` en banquito alto, como el cajero).
- Cada persona con `pantallaCelular(fn)` suma una malla y una textura que se sube cada cuadro: úsalo en pocas.
- Ideas: `habla` (boca con la voz), `aplaude`, `mira-camara`, cola que avanza sola (`fila(camino, n, ritmo)`), salir por una puerta.

## v1.3 · `desplaza` (video 24)
Opción de persona `desplaza: (t) => [dx, dy, dz, giroX]`: corre a la persona en el mundo y la ladea alrededor del eje x del
mundo (radianes) cada cuadro, sin caminar. Sirve para alguien sentado en algo que se mueve: la niña en la llanta del columpio
del video 24 (`sentado: 0.62`, el vaivén calcula dónde queda el asiento). Úsalo con `sombra: false`.

## v1.4 · manos de verdad y pulgar que toca el celular (video 27, dueño 2026-11-04: «el dedo parece una salchicha»)
Opción de persona **`manos: "detalle"`** (aditiva: sin ella todo queda como antes, con la bola de mano y el pulgar cápsula).
Cambia las dos manos por una mano 3D completa, instanciada como el resto del cuerpo (5 InstancedMesh más para toda la gente):
- **palma** con volumen (caja redondeada `hPalma`) y dorso, muñeca, borde del meñique y **eminencia del pulgar**;
- **cuatro dedos** de distinto largo (índice, medio, anular, meñique) con **3 falanges** cada uno que se afinan hacia la
  punta (`hSeg`, cilindro cónico), **nudillos** que sobresalen en el dorso y articulaciones/yemas redondeadas (`hBola`);
- **pulgar** con metacarpiano + **2 falanges** (IK de dos huesos) y **uñas claras** (`hUna`) en los cinco dedos;
- **puño de la manga** (`hPuno`, color de la ropa un poco más oscuro; sin puño con `manga: "corta"`) y el antebrazo
  un 18 % más delgado para que la manga caiga sobre una muñeca. Piel, uñas y puño salen de `piel`/`ropa` de cada persona.
- Material **MeshLambertMaterial** mate (sombreado suave: se leen los volúmenes); el resto del cuerpo sigue en toon.

Con el celular (`q.celu` > 0,35, p. ej. estado `celular`) la mano **derecha** lo agarra: la palma por detrás del borde
derecho, los cuatro dedos cruzan el dorso y asoman doblados por el borde izquierdo, y el **pulgar** pasa por encima del
borde derecho a la pantalla. El antebrazo se recalcula para llegar a la muñeca nueva. La mano izquierda queda suelta
(siguiendo al antebrazo, palma hacia el cuerpo, dedos algo doblados; `dedos: 0–1` en un estado los abre o cierra).

- **`persona.pulgarToca([[t, u, v], ...], { reposo: [1.05, 0.45] })`**: `u, v` ∈ 0–1 desde arriba a la izquierda de la
  pantalla (el mismo lienzo de `pantallaCelular`). El pulgar llega 0,45 s antes, se queda flotando, **baja y se dobla en
  `t`**, sube y vuelve al reposo (apoyado en el borde derecho, sin tapar). Dibuja tú el anillo y el botón hundido en el
  lienzo de la pantalla en ese mismo `t` (video 27: `ondas(...)` y `boton(..., pulsa)`). `persona.toqueEn(t)` → `{u, v, alza, presiona}`.
- El pulgar entra por la **derecha**: pon el texto importante a la izquierda o arriba, y toca los botones en su extremo
  derecho (p. ej. `u` 0,8–0,88) con la etiqueta corrida a la izquierda. Alcance cómodo: `v` ≥ 0,27 (más arriba se estira).
- Ajustes: `tamMano` (1), `agarre: { en: [x,y,z], dir: [dx,dy], dedos: [[nudillo, medio, punta] × 4], abre }` (marco del celular).
- Costo: 2 manos × (1 palma + 22 bolas + 15 falanges + 5 uñas + 1 puño) instancias por persona; nada perceptible (0,5 ms/cuadro en Node con 13 personas).
- Los videos 22, 23 y 24 tienen su propia copia en `lib/` y no usan la opción: no cambian (no se les corrió `lib`).
