# 4. Lecciones que ya costaron un video

Cada regla de aquí salió de un video que se vio mal. Cúmplelas todas; cuando la persona corrija algo nuevo, agrégalo
al final con la fecha y el porqué.

## Ritmo y cámara

- **Movimiento sí, mareo no.** Una escena o movimiento de cámara nuevo cada **2,5–4 s**; nunca más de ~5 s con la
  pantalla quieta (dentro de una escena larga, algo entra o se mueve suave). Cortes cada 1 s marean.
- Transiciones suaves (fundido, deslizamiento corto, travelling). Zooms bruscos y sacudidas solo en los golpes del
  guion, máximo uno cada 6–8 s y nunca dos seguidos.
- Voz ágil: acelerar ×1.05–1.14 y «aire» de 0,15–0,35 s entre frases.

## Mostrar, no hacer imaginar

- Todo lo que la voz nombra (un lugar, una empresa, un tipo de negocio, una app, un objeto) **se ve en ese momento**.
- 3D: escenas completas con lugar, gente y la acción hecha con el cuerpo. Nada de cursores ni tarjetas de texto solas.
- Apps y marcas con su logo real (glifos de [Simple Icons](https://simpleicons.org), CC0), nunca emojis.
- Un celular que sale como objeto se muestra **de espalda** con sus cámaras; de frente con cámaras dibujadas se ve raro.
- Fotos: primero lo propio o 3D; luego Pexels/Pixabay/Unsplash; Wikimedia solo dominio público/CC0, o CC BY/BY-SA con
  crédito en el texto del post. Nunca NC/ND. Sin retratos de personas reales como si recomendaran algo.
- Antes de entregar, repasa el guion palabra por palabra: cada sustantivo concreto, ¿se ve?

## Pantalla 9:16 (1080×1920)

- Subtítulos entre y = 250 y 470; contenido entre 500 y 1500; nada importante a la derecha por debajo de 1100 (botones
  de Reels) ni abajo de 1500 (descripción). Llenar el cuadro: nunca media pantalla vacía.
- **Subtítulos y títulos sin fondo** (ni píldora ni caja): se leen por un borde oscuro grueso
  (`-webkit-text-stroke: 12px #070c17; paint-order: stroke fill;` + sombra). Las cajas tapan la animación.
- Texto que no se salga de su tarjeta (grids con `minmax(0,1fr)`); `desbordes.py` en `TOTAL 0`.
- Estilo sobrio: oscuro elegante o claro. **Nada de neón** (brillos, bordes fosforescentes): se ve poco profesional.

## Sonido

- Voz + efectos suaves (pop, whoosh, tap, ding) en cada pieza que entra y cada cambio de escena, **parejos hasta el
  final**: los efectos llenan los silencios. Música opcional (muchas veces sobra).
- Voz ≥ 10 dB sobre los efectos. Mezcla final a −14 LUFS.
- Cortes de frase en el silencio real de la voz (si no, se oyen sílabas repetidas: «A-Así»).
- FFmpeg: `adelay` con `:all=1`.
- Si el guion tiene una cita entre comillas, la voz la «actúa» y luego el narrador ya no suena igual: lo que dice otro
  personaje va por tramos con otra voz, o «mudo» (solo escrito en pantalla, con tecleo y ding).
- Números y siglas siempre en `hablado`. Pronunciación de la marca revisada en cada toma.

## HyperFrames y 3D (técnico)

- Lo que **entra** va sin `immediateRender:false`; lo que **sale o se mueve después**, con él (si no, sale en blanco).
- Render siempre con `--page-motion-blur off`.
- `window.__timelines["<id>"] = fx.fin();` escrito literal en el HTML.
- Nada de `Math.random` ni `Date`: azar con semilla (`fx.azar`), canvas y 3D en función del tiempo (`fx.dibuja`). Mismo
  `t` → mismo cuadro (compruébalo con `ffmpeg -i x.mp4 -map 0:v -f framemd5 -` en dos renders).
- Una pantalla se anima una sola vez; si vuelve, es una copia.
- Girar algo dentro de un `<svg>`: GSAP con `svgOrigin`, nunca `transform-origin` en CSS (la pieza sale volando).
- Three.js local (`lib/vendor/`), no de un CDN.
- Fuentes del canvas/3D: usa una que ya cargue el HTML, para que HyperFrames la espere.
- `prueba.js` del video antes de renderizar: brazos contra la mesa, todo dentro del cuadro, saltos por cuadro.
- Si cambias `componentes/`, corre `lib` en el video (la copia no se actualiza sola).

## Revisión

- **Revisa tú en cuadros densos** (2 por segundo, todo el video) antes de dar algo por bueno. La calidad bajó cuando se
  confió solo en el juez automático.
- Las animaciones con movimiento se revisan en hojas densas del tramo (`fps=3,tile=4x2`), no en un cuadro suelto.
- Confirma con números lo que diga el juez antes de cambiarlo.

## Contenido

- Ningún dato, cliente, logo, testimonio ni cifra inventada. Ejemplos rotulados como ejemplo.
- Prometer solo lo que el producto hace de verdad.
- Lenguaje que no segmente por género: verbos en vez de adjetivos («estabas durmiendo», no «dormida/dormido»),
  «clientes», «tu equipo», nombres unisex (Alex, Sam, Noa, Dani).
- Nada aterrador en imágenes (calaveras, brujas) aunque sea temporada.
- Texto para redes **corto**: gancho, una idea, llamado a la acción. Nunca el guion entero.

## Privacidad

- Llaves solo en `.env.local`. Nunca en el chat, en un commit ni en un log.
- Al bajar fotos o llamar APIs, User-Agent genérico (`fabrica-videos/1.0`): nunca el correo ni datos personales en
  cabeceras, URLs o cuerpos.
