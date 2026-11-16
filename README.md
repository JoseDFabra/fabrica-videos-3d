# Fábrica de videos 3D

Una skill para que tu IA te arme una «fábrica» de Reels, TikToks y Shorts con **escenas 3D**, voz en off y subtítulos
amarrados a cada palabra, y después te haga cada video casi sin editar a mano.

El video no lo inventa una IA de video: es una página HTML animada (GSAP + Three.js) que
[HyperFrames](https://hyperframes.heygen.com) convierte en MP4. Por eso volver a renderizar es gratis, el texto y los
logos salen exactos y cada cuadro sale igual cada vez.

> Hecha por **José Daniel Fabra** (Fabra Studios). Yo la uso con **Claude Code**, **OpenRouter** (el juez que ve y oye
> el video) y **ElevenLabs** (la voz). Pero funciona con la IA que tú uses.

## ¿Qué IA necesito?

Cualquiera. La skill te pregunta primero con qué trabajas y se adapta:

| Tu herramienta | Qué tan bien va |
|---|---|
| Claude Code, Cursor, Codex, Windsurf, Cline, Gemini CLI | Lo ideal: la IA corre los comandos en tu computador. |
| ChatGPT, DeepSeek, Gemini o Claude en la web | Funciona, pero tú corres los comandos y le pegas los resultados. Más lento. |

## ¿Qué voz?

- **ElevenLabs** (recomendada, de pago): la mejor voz en español latino y te dice el segundo exacto de cada palabra.
- **¿No tienes ElevenLabs?** Descarga **[Voicebox](https://voicebox.sh)**: gratis, de código abierto, corre en tu
  computador. La fábrica saca los tiempos de cada palabra con Whisper.
- Cualquier otra voz que te dé un WAV también sirve.

OpenRouter (o una llave de Gemini) es opcional: sirve para que un modelo revise el video y analice reels virales.

## Instalar

Clona este repo y copia la carpeta donde tu herramienta busca skills o reglas:

**Claude Code**

```sh
mkdir -p mi-fabrica/.claude/skills
cp -r fabrica-videos-3d mi-fabrica/.claude/skills/
cd mi-fabrica && claude
```

Luego escribe: «Quiero armar mi fábrica de videos 3D».

**Cursor** — abre una carpeta vacía, copia `fabrica-videos-3d/` adentro y en el chat (modo Agent) escribe:
«Lee `fabrica-videos-3d/SKILL.md` y sigue sus pasos». La skill le pedirá crear su regla en `.cursor/rules/`.

**Codex (app o CLI)** — igual: copia la carpeta a tu proyecto, abre un hilo **local** y pide: «Lee
`fabrica-videos-3d/SKILL.md` y sigue sus pasos». Creará un `AGENTS.md` para los siguientes hilos.

**ChatGPT, DeepSeek u otro chat web** — sube `SKILL.md` y los archivos de `referencias/` (o pega su contenido) y escribe:
«Sigue estas instrucciones conmigo paso a paso». Ten a mano la terminal.

## Qué trae

```
SKILL.md                     el paso a paso que sigue la IA (empieza con una entrevista)
referencias/
  1-preparar.md              herramientas, llaves, ElevenLabs o Voicebox
  2-construir-fabrica.md     estructura del proyecto y el motor
  3-hacer-un-video.md        de la idea al MP4, con storyboard 3D
  4-lecciones.md             reglas aprendidas a punta de videos malos
plantilla/
  componentes/               fabrica.js, personaje3d.js, gente3d.js, Three.js r158 (MIT) y sus manuales
  pruebas/                   dos demos 3D sin voz para comprobar que todo funciona
```

## Lo que necesitas en tu computador

Node.js 20+, Python 3.10+, FFmpeg y Google Chrome. La skill te guía a instalarlos en macOS, Windows o Linux.

## Consejos

- Empieza con la demo 3D y luego un video corto (20–30 s).
- Mira tú la hoja de cuadros de cada video: el revisor automático ayuda, tu ojo manda.
- Cuando algo no te guste, dile a la IA **por qué** y pídele que lo agregue a las lecciones. Así no lo repite.
- Nunca pegues tus llaves en el chat: van en `.env.local`.

Three.js se incluye bajo su licencia MIT (`plantilla/componentes/vendor/three-LICENSE.txt`).
