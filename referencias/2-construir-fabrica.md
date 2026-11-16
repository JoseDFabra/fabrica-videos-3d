# 2. Construir la fábrica

## Estructura

```
mi-fabrica/
  .env.local                 llaves (fuera de git)
  .gitignore                 .env*, .venv/, node_modules/, salida/, audio/, *.mp4
  fabrica.config.json        respuestas de la entrevista (agente, voz, marca), sin llaves
  gastos.json                cada llamada que costó: fecha, proveedor, modelo, caracteres, costo
  marcas/<marca>/
    marca.json               nombre, qué hace, público, voz, colores, fuentes, cierre (CTA + contacto), reglas
    marca.css                variables de color y @font-face
    logo.svg, fuentes, sfx/  (pop, whoosh, tap, ding… en WAV)
  componentes/               ← copia de plantilla/componentes/ de esta skill
  formatos/<formato>/        README con la estructura + guion.json e index.html de partida
  motor/                     los scripts (abajo)
  pruebas/                   ← copia de plantilla/pruebas/ (demos 3D)
  videos/<marca>/<nn-nombre>/
    guion.json  storyboard.md  index.html  mundo.js  prueba.js  tiempos.js
    lib/                     copia congelada de componentes/ (cambiar componentes no rompe videos viejos)
    audio/pruebas/           tomas de voz (v-1.wav + v-1.tiempos.json)
    audio/                   voz-original.wav, mezcla.wav
    assets/                  imágenes del video
    salida/                  mp4, cuadros.jpg, portada.png, revision.md
  tendencias/reels/<id>/     reels analizados (ficha.md)
```

`marca.json`, voz con ElevenLabs:

```json
{ "voz": { "proveedor": "elevenlabs", "voice_id": "XXXX", "modelo": "eleven_v4", "acelerar": 1.08,
           "estabilidad": 0.5, "idioma": "es" } }
```

Con Voicebox u otra: `{ "proveedor": "wav", "nombre": "Mi voz (Voicebox)", "acelerar": 1.05, "idioma": "es" }`.
Usa el modelo de ElevenLabs más nuevo que tenga `convert_with_timestamps` y soporte etiquetas de emoción
(`[excited]`, `[curious]`); confírmalo en su documentación.

## `guion.json` (lo único que se escribe a mano además de las escenas)

```json
{
  "marca": "mi-marca", "formato": "historia", "nombre": "01-mi-primer-video",
  "texto": "Lunes, *8:00* de la mañana. Alguien de tu equipo abre dos ventanas…",
  "hablado": { "8:00": "ocho", "PDF": "pe de efe" },
  "etiquetas": { "0": "[curious]" },
  "cortes": [0, 4, 15],
  "aire": { "Lunes,": 0.15 },
  "corte": "silencio",
  "cola": 1.8,
  "efectos": [ { "s": "whoosh", "en": "cortes", "vol": 0.3 }, { "s": "pop", "en": "w12" } ],
  "efectos_ganancia": 6,
  "voz": { "archivo": "audio/voz-original.wav", "tiempos": "audio/voz-original.tiempos.json" }
}
```

- `texto`: lo que se ve en subtítulos. `*palabra*` = resaltada.
- `hablado`: lo que se lee distinto de como se escribe (números, siglas).
- `etiquetas`: emoción antes de la palabra i (solo a la voz, nunca a subtítulos).
- `cortes`: índice de la palabra donde empieza cada frase/escena → `F[k]`.
- `aire`: silencio antes de una frase (por defecto 0,25 s).
- `efectos`: `en` = `w38` (palabra 38), `f3` (frase 3), `f-1` (última) o `cortes` (cada cambio de frase).

## El motor (`motor/fabrica.py`, subcomandos)

Constrúyelo en Python con funciones pequeñas y un `comun.py` (leer `.env.local`, `guion.json`, `gastos.json`, tope).

| Comando | Qué hace |
|---|---|
| `nuevo <marca> <formato> <nn-nombre>` | Crea `videos/<marca>/<nn-nombre>/` desde `formatos/<formato>/` y corre `lib`. |
| `lib` | Copia `componentes/` y `marcas/<marca>/marca.css` a `lib/`. `personaje3d.js`, `gente3d.js` y `vendor/three` **solo si `index.html` los menciona**. |
| `voz --toma=v-1 [--si]` | Arma el texto (aplica `hablado` y `etiquetas`), muestra caracteres y costo, **pide confirmación**, revisa el tope. ElevenLabs: `text_to_speech.convert_with_timestamps` → mp3 + alineación por letra. Acelera con `ffmpeg atempo=<acelerar>` y **divide los tiempos por ese factor**. Guarda `audio/pruebas/v-1.wav` y `v-1.tiempos.json`. Anota el gasto. |
| `voz --toma=v-1 --desde-wav` | Para Voicebox u otra voz: toma `audio/pruebas/v-1.wav` ya exportado, saca tiempos por palabra con `faster-whisper` (`word_timestamps=True`, modelo `small` o `medium`, `language` de la marca), **empareja las palabras de whisper con las del guion** (alineación por secuencia: whisper puede escribir «8» donde el guion dice «8:00») y escribe el mismo formato de tiempos que ElevenLabs (repartiendo cada palabra entre sus letras), para que el resto del motor no cambie. Aplica `acelerar` igual. |
| `voz --texto` | Solo imprime el texto que va a la voz (para pegarlo en Voicebox). |
| `oir v-1 v-2` | (Con OpenRouter) Un Gemini oye cada toma: pronunciación, acento, ritmo, palabras raras; nota de 1 a 10. |
| `elegir v-1` | Copia la toma a `audio/voz-original.*` y la anota en `guion.json`. |
| `mezclar [--provisional]` | Calcula `W(i)` (inicio/fin de cada palabra) desde los tiempos, parte frases en el **silencio real** entre palabras, inserta el `aire`, pone los efectos, normaliza a **−14 LUFS**, escribe `audio/mezcla.wav`, `tiempos.js` (`window.TIEMPOS = {duracion, frases, w:[{inicio,fin}], subtitulos}`) y la duración en `index.html`. `--provisional`: tiempos estimados (~0,33 s por palabra) para armar escenas sin voz. Imprime cuántos dB queda la voz sobre los efectos y avisa «OJO:» si hay más de 1,2 s sin voz ni efecto o si los efectos se callan antes del final. |
| `render [--borrador]` | `npx hyperframes lint` y luego `npx hyperframes render --quality draft|high --page-motion-blur off --output salida/<nombre>.mp4`. |
| `cuadros [--fps=2]` | Hoja de control: `ffmpeg -i x.mp4 -vf "fps=2,scale=270:-1,tile=9x3" salida/cuadros-%02d.jpg`. |
| `revisar` | (Con OpenRouter/Gemini) baja el MP4 a 640 px y 12 fps, se lo manda a un Gemini con video+audio con la pauta de revisión (nota, gancho, voz, problemas con segundo exacto, 3 mejoras) y guarda `salida/<nombre>.revision.md`. |
| `reel <enlace>` | yt-dlp baja el reel → Gemini lo ve con audio → `tendencias/reels/<id>/ficha.md`. |

Extras que valen la pena:

- `motor/desbordes.py <video>`: abre el `index.html` en Chrome sin ventana, recorre la línea de tiempo cada 0,1 s y
  avisa si un texto se sale de su tarjeta. `TOTAL 0` antes del render final.
- `motor/portada.py`: portada 9:16 desde `portada.json` (gancho de 3–6 palabras, persona con emoción, objeto del tema),
  todo dentro del recorte 3:4 del perfil (y 240–1680). Captura con Chrome sin ventana.
- `motor/publicacion.py`: texto por red desde `publicacion.json`, validado (Instagram/TikTok/Facebook ≤ 2.200
  caracteres y ≤ 5 hashtags; gancho en la primera línea; corto).
- `motor/voz_tramos.py`: cuando otro personaje habla, ese tramo con otra voz (o «mudo»: silencio + texto en pantalla).

Mezcla con FFmpeg, detalles que importan: `adelay=<ms>:all=1` (si no, un canal suena desfasado);
`asetpts=PTS-STARTPTS` antes de `volume` en cada efecto; limitador al final; confirmar que el audio del MP4 cambió
tras re-mezclar (`ffmpeg -i x.mp4 -map 0:a -c copy -f md5 -`).

## Los componentes (ya hechos, en `plantilla/componentes/`)

- **`fabrica.js`**: `const fx = Fabrica.crear("id")` → timeline GSAP pausado + atajos. `fx.W(i)`, `fx.F[k]`,
  `fx.entra(sel, t)`, `fx.sale(sel, t)`, `fx.kb(sel, t, d)` (Ken Burns), `fx.subtitulos()` (karaoke con la palabra
  resaltada), `fx.dibuja((t) => …)` (canvas en función del tiempo), `fx.azar(semilla)`, `fx.fin()`.
- **`personaje3d.js`** (`PERSONAJE3D.md`): gente low-poly sentada en un puesto con monitor o portátil. Poses
  `respira`, `escribe`, `mira-celular`, `sorpresa`, `preocupado`, `piensa`, `celebra`, `saluda`; la pantalla del
  monitor y del celular se dibuja con canvas 2D; brazos con IK; cámara en órbita; `revisa(t)` detecta brazos que
  atraviesan la mesa.
- **`gente3d.js`** (`GENTE3D.md`): gente de pie (estados: espera, mira el reloj, bosteza, camina, celebra), filas,
  cajas con barra de carga, porteros, paquetes que viajan, carteles, globos; multitudes de cientos con InstancedMesh.
  Cámara por llaves (`esc.camara([...])`).
- **`vendor/three-r158.min.js`** + licencia MIT: local, el 3D no depende de internet.

Todo es **función pura del tiempo**: nada de `Math.random` ni `Date`; mismo `t` → mismo cuadro. HyperFrames pide los
cuadros sueltos y en cualquier orden.

Fase de prueba: copia `plantilla/pruebas/` a `pruebas/`, corre `lib` en cada demo (necesitan `lib/vendor/`,
`lib/fabrica.js`, `lib/personaje3d.js`/`gente3d.js` y un `lib/marca.css` con la fuente) y renderiza. Si sale el MP4 con
la persona moviéndose, la base está lista. `node pruebas/personaje-3d/prueba.js` debe terminar con 0 choques.
