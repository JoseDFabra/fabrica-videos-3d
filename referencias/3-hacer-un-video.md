# 3. Hacer un video 3D

## 1. Idea y guion

- Un video = **una historia**, no una lista de beneficios. Estructura que mejor ha funcionado:
  escena concreta del problema («Lunes, 8:00 de la mañana…») → cómo empeora (con un número de ejemplo) → «¿Y cómo se
  soluciona esto?» → «Imagina un sistema que…» → **la MISMA escena del inicio, ahora resuelta** (marcando la
  continuidad: «El mismo lunes, a las 8:00…») → la marca en una sola frase sobria → cierre.
- Otro formato fuerte para casos reales: «Viaje al pasado»: historia real → «Si estuvieras en <empresa>, ¿qué harías?»
  → quiz A/B con cuenta regresiva → «viajemos a <año> y solucionémoslo juntos» → 3 pasos sin tecnicismos → la misma
  escena arreglada.
- Gancho en el primer segundo (imagen + frase). Una idea por frase. La duración la pone la idea: nunca recortes una
  frase si con eso se entiende menos.
- La marca no se vende en el cuerpo del video («nosotros lo arreglamos», «somos expertos»): aparece al final.
- Cada dato, cifra o caso real con fuente verificable. Si es un ejemplo, dilo («con un ejemplo»).
- Revisa adjetivos: lenguaje que sirva para todos («estabas durmiendo», «tu equipo», «quien vende»).

Escribe `guion.json` (ver `2-construir-fabrica.md`): números y siglas en `hablado`, una etiqueta de emoción al inicio
y pocas más.

## 2. Storyboard 3D (antes de una línea de código)

`storyboard.md` con una tabla: **frase → lo que dice la voz → la escena exacta**. Regla: **escenas completas, nada a la
imaginación.**

- Un lugar concreto con contexto: oficina con puestos, reloj y ventanas; sala de reuniones con mesa y gente sentada;
  bodega; calle; fila de una taquilla.
- Personas haciendo la acción **con el cuerpo**: manos en el teclado, levantan el celular, señalan la pizarra,
  voltean, se sorprenden, celebran.
- Lo que la voz dice pasa **en esa palabra**: «Copia» → la mano hunde Ctrl+C y la celda se marca; «cinco» → un globo
  1…5 sobre cada cabeza; «horas» → las manecillas del reloj corren.
- **Nada de cursores** haciendo lo que haría una persona, ni tarjetas de texto como único visual.
- Mismos personajes todo el video (colores de piel, pelo y ropa fijos), con nombres unisex.
- Lugares separados en el espacio (p. ej. OFICINA en x≈0, SALA en x≈40) para mover la cámara entre ellos.

Ejemplo de fila:

| Frase | Voz | Escena |
|---|---|---|
| F2 | «Copia el número del pedido. Lo pega.» | Plano alto del teclado: la mano izquierda en Ctrl y la derecha hunde la C (la tecla se ilumina) → la celda PED-1041 se marca; en «pega» hunde la V → el campo PEDIDO se llena. Sin cursor: son sus manos. |

## 3. Construir las escenas

Separa el mundo de la página:

- `mundo.js`: arma la escena con `gente3d.js`/`personaje3d.js` y Three.js (puestos, pizarra, reloj, pantallas,
  cámara) y lo ata a `W(i)`/`F[k]`. Exporta `armar(esc, G, T)` para que lo usen `index.html` **y** `prueba.js`.
- `index.html`: el canvas 3D a pantalla completa (1080×1920), subtítulos, rótulos y el cierre en HTML encima.
- Si a los componentes les falta una pose, un objeto o un gesto, **constrúyelo** (en el video o en `componentes/`,
  y luego `lib`). Así crecen.

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<script src="lib/vendor/three-r158.min.js"></script>
<script src="tiempos.js"></script>
<script src="lib/fabrica.js"></script>
<script src="lib/gente3d.js"></script>
<script src="mundo.js"></script>
...
<canvas id="gl" width="1080" height="1920" style="position:absolute;left:0;top:0;width:1080px;height:1920px"></canvas>
<script>
  const fx = Fabrica.crear("mi-marca-01-nombre");
  try {
    const esc = Gente3D.escena("#gl", { fov: 38 });
    Mundo.armar(esc, Gente3D, window.TIEMPOS);
    fx.dibuja((t) => esc.dibujar(t));          // un solo reloj, un render por cuadro
  } catch (e) { console.warn("3D apagado:", e); }
  fx.subtitulos();
  window.__timelines["mi-marca-01-nombre"] = fx.fin();   // literal: el lint de HyperFrames lo busca
</script>
```

Antes de tener voz: `fabrica.py mezclar --provisional` y trabaja con tiempos estimados.

Cámara: un movimiento nuevo cada 2,5–4 s, órbita lenta (≤ ~60°/s). Por encima del hombro (130–160°) se lee la
pantalla; de 3/4 (30–60°) se ve la cara; nunca de frente exacto a la altura de la cara (el monitor la tapa).

Iterar rápido sin renderizar: `npx hyperframes snapshot --at 1,3.6,5.5` (cuadros sueltos en segundos).

## 4. Voz

```sh
python3 ../../../motor/fabrica.py voz --toma=v-1          # ElevenLabs (pide confirmación y muestra el costo)
python3 ../../../motor/fabrica.py voz --toma=v-2
python3 ../../../motor/fabrica.py oir v-1 v-2             # si hay OpenRouter: un Gemini las califica
python3 ../../../motor/fabrica.py elegir v-1
```

Con Voicebox: `voz --texto` → pegar en Voicebox → exportar `audio/pruebas/v-1.wav` → `voz --toma=v-1 --desde-wav`.

Escucha tú también la toma elegida: pronunciación de la marca, siglas, que no cambie de voz en una cita.

## 5. Mezclar, renderizar, mirar

```sh
python3 ../../../motor/fabrica.py mezclar        # corrige todo «OJO:» antes de seguir
node prueba.js                                   # 3D: 0 choques, todo dentro del cuadro
python3 ../../../motor/fabrica.py render --borrador
python3 ../../../motor/fabrica.py cuadros --fps=2
python3 ../../../motor/desbordes.py .            # TOTAL 0
```

**Mira tú la hoja densa completa (2 cuadros por segundo)**, escena por escena contra el storyboard: ¿lo que se ve es lo
que se dice en ese instante? Huecos con media pantalla vacía, piezas que llegan tarde, manos que atraviesan la mesa,
caras tapadas, texto bajo los botones de Reels. Los errores de movimiento solo se ven en cuadros densos.

## 6. Render final y revisión

```sh
python3 ../../../motor/fabrica.py render
python3 ../../../motor/fabrica.py revisar        # juez Gemini (opcional)
```

El juez se equivoca a veces (dijo «sin efectos» con efectos sonando): confirma cada punto mirando los cuadros o
midiendo el audio antes de cambiar algo. No acortes el video solo porque diga «es largo».

## 7. Portada y publicación

- `portada.json` → `salida/portada.png` (9:16, lo importante dentro del recorte 3:4 del perfil). Lo que promete la
  portada tiene que pasar en el video. La hoja de cuadros nunca es la portada.
- `publicacion.json` → `publicar.md`: gancho en la primera línea, una idea en 1–2 frases, el llamado a la acción,
  ≤ 5 hashtags. Créditos de fotos CC BY en el texto, nunca en pantalla.
