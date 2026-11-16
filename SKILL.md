---
name: fabrica-videos-3d
description: Arma una «fábrica» de videos verticales (Reels, TikTok, Shorts) con escenas 3D, voz en off y subtítulos amarrados a cada palabra, y luego hace cada video. Úsala cuando el usuario quiera montar la fábrica por primera vez, hacer un video nuevo, arreglar uno, o pegue el enlace de un reel para analizarlo. Funciona con cualquier agente o IA (Claude Code, Cursor, Codex, ChatGPT, DeepSeek, Gemini…).
---

# Fábrica de videos 3D

Videos 9:16 hechos como **una página HTML animada** (GSAP + Three.js) que [HyperFrames](https://hyperframes.heygen.com)
convierte en MP4. No es una IA de video: volver a renderizar es gratis, el texto y los logos salen exactos y el 3D es
determinista (mismo segundo → mismo cuadro). Lo único que se paga, si quieres, es la voz y un «juez» que ve el video.

Creada por José Daniel Fabra (Fabra Studios). Él la usa con **Claude Code**, **OpenRouter** y **ElevenLabs**, pero la
skill no depende de ninguna IA en particular.

Archivos de esta skill:

- `referencias/1-preparar.md` — instalar herramientas, sacar llaves, elegir voz (ElevenLabs o Voicebox gratis).
- `referencias/2-construir-fabrica.md` — la estructura del proyecto y qué hace cada script del motor.
- `referencias/3-hacer-un-video.md` — el flujo de un video, de la idea al MP4, con el 3D.
- `referencias/4-lecciones.md` — reglas que ya costaron videos. **Léelas antes de escribir el primer guion.**
- `plantilla/componentes/` — piezas listas: `fabrica.js`/`.css` (timeline, subtítulos, entradas), `personaje3d.js`
  (gente sentada frente a un computador), `gente3d.js` (gente de pie, filas, multitudes), Three.js r158 (MIT) y sus
  manuales `PERSONAJE3D.md` y `GENTE3D.md`.
- `plantilla/pruebas/` — dos demos 3D sin voz y sus `prueba.js` (revisan choques y encuadre sin navegador).

---

## Paso 0 — Entrevista (siempre, la primera vez)

Antes de tocar nada, pregunta esto **en un solo mensaje**, con opciones numeradas para que la persona responda rápido.
Si ya hay un `fabrica.config.json` en el proyecto, léelo y sáltate lo que ya esté respondido.

1. **¿Con qué agente o IA vas a trabajar?**
   a) Claude Code · b) Cursor · c) Codex (app o CLI) · d) Otro agente que corre comandos en tu computador (Windsurf,
   Cline, Gemini CLI, Aider…) · e) Un chat sin acceso a tu computador (ChatGPT, DeepSeek, Gemini o Claude en la web).
2. **¿Qué sistema operativo?** macOS · Windows · Linux.
3. **¿Tienes cuenta de ElevenLabs con plan de pago?** Sí · Solo la gratis · No.
4. **¿Tienes OpenRouter (o una llave de Gemini)?** Sí · No (se puede sin eso).
5. **Tu marca:** nombre, qué hace (solo lo que de verdad hace), a quién le habla, qué debe hacer la gente al final
   (escribir por WhatsApp, descargar la app, comprar en un link), colores, fuentes y logo.
6. **Idioma y acento de la voz** (p. ej. español colombiano, tuteando).
7. **¿Quieres empezar con la demo 3D** (sin voz, para ver que todo funciona) **o directo con tu primer video?**

Guarda las respuestas en `fabrica.config.json` en la raíz (sin llaves: las llaves van solo en `.env.local`).

## Paso 1 — Adáptate al agente

| Respuesta | Cómo trabajas |
|---|---|
| a) Claude Code | La skill vive en `.claude/skills/fabrica-videos-3d/`. Puedes crear subagentes en `.claude/agents/` (guionista, verificador de datos, director de movimiento, revisor). Corre los comandos tú. |
| b) Cursor | Copia el contenido esencial de esta skill a `.cursor/rules/fabrica-videos.mdc` (con `alwaysApply: true`) y deja los archivos de `referencias/` en el proyecto para leerlos cuando haga falta. Trabaja en modo Agent; corre los comandos en su terminal. |
| c) Codex | Crea `AGENTS.md` en la raíz con el paso a paso y las lecciones (Codex lo lee al empezar cada hilo); si su versión soporta skills, deja esta carpeta en `.codex/skills/`. Hilo **local**, no en la nube: el render necesita Chrome y FFmpeg del computador. Aprueba internet y comandos cuando los pida. |
| d) Otro agente con terminal | Igual que Codex: un `AGENTS.md` (o el archivo de reglas que lea ese agente) con el paso a paso y las lecciones. |
| e) Chat sin terminal | Tú no puedes correr nada. Escribe archivos completos (no fragmentos), dile a la persona exactamente dónde guardarlos y qué comando correr, y pídele que te pegue la salida o una captura. Pide las hojas de cuadros (`salida/cuadros.jpg`) como imagen para revisar. Avanza en pasos cortos. Recomiéndale pasarse a un agente con terminal (Claude Code, Cursor o Codex): el trabajo es 5–10 veces más rápido. |

Sea cual sea el agente: **nunca pidas que te peguen una llave en el chat.** Crea `.env.local` vacío, agrégalo a
`.gitignore` y que la persona pegue ahí sus llaves.

## Paso 2 — Prepara el computador

Sigue `referencias/1-preparar.md`. Al final verifica con comandos (no de palabra): `node -v`, `python3 --version`,
`ffmpeg -version`, `npx hyperframes --help`, Chrome instalado, y una consulta gratis a cada llave que haya.

**Voz:** si tiene ElevenLabs de pago, úsala (da los tiempos de cada letra y suena mejor en español latino). Si no,
recomiéndale **Voicebox** (gratis, local, de código abierto: [voicebox.sh](https://voicebox.sh) ·
[github.com/jamiepine/voicebox](https://github.com/jamiepine/voicebox)) y saca los tiempos de cada palabra con
`faster-whisper`. También sirve cualquier otra voz que entregue un WAV (OpenAI, Azure, Google, Piper, Kokoro…): el
motor solo necesita **audio + inicio y fin de cada palabra**.

## Paso 3 — Construye la fábrica

Sigue `referencias/2-construir-fabrica.md`. Copia `plantilla/componentes/` a `componentes/` del proyecto y construye el
motor (`motor/fabrica.py`, `mezclar.py`, `voz.py`…). Muestra cada fase funcionando antes de seguir:

1. **Demo 3D sin voz**: renderiza `pruebas/personaje-3d/` y `pruebas/gente-3d/` → MP4. Si esto sale, el 3D funciona.
2. **Voz**: una frase de prueba → WAV + tiempos por palabra.
3. **Video corto de punta a punta** (20–30 s): guion → voz → mezcla → render → cuadros.

## Paso 4 — Cada video

Sigue `referencias/3-hacer-un-video.md` y cumple `referencias/4-lecciones.md`. Resumen:

```text
idea → guion.json → storyboard 3D (una escena concreta por frase) → index.html con tiempos provisionales
→ voz (2 tomas, elegir la mejor) → mezclar → render --borrador → hoja de cuadros densa → arreglos
→ render final → revisión (tú + juez) → portada + texto para cada red
```

Nunca uses segundos fijos en las animaciones: todo se amarra a la palabra `W(i)` o a la frase `F[k]` del guion.

## Paso 5 — Que aprenda

Cada vez que a la persona algo no le guste, pregúntale el porqué y agrégalo a `referencias/4-lecciones.md` (o al
archivo de reglas de su agente) con la fecha. Así se armó la lista de lecciones: cada regla de ahí viene de un video
que salió mal.

## Si pegan el enlace de un reel

Bájalo con `yt-dlp` y, si hay OpenRouter o llave de Gemini, que un Gemini lo vea **con audio** y saque: gancho (primeros
2 s), estructura escena por escena, ritmo, por qué funciona y 3 ideas para la marca que copien **la estructura, no el
tema**. Guárdalo en `tendencias/reels/<id>/ficha.md`. Sin Gemini: saca cuadros con ffmpeg y la transcripción con
faster-whisper, y analízalo tú.
