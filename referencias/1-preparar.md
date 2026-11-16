# 1. Preparar el computador

Guía a la persona paso a paso y verifica cada cosa con un comando antes de seguir. Ajusta los comandos al sistema
operativo que respondió en la entrevista.

## Herramientas

| Herramienta | Para qué | macOS | Windows | Linux |
|---|---|---|---|---|
| Node.js LTS (20 o más) | Corre HyperFrames (`npx hyperframes`) y las pruebas 3D | `brew install node` | `winget install OpenJS.NodeJS.LTS` | gestor de paquetes o [nodejs.org](https://nodejs.org) |
| Python 3.10+ | El motor: voz, mezcla, portada | `brew install python` | `winget install Python.Python.3.12` | `apt install python3 python3-venv` |
| FFmpeg | Mezclar audio, acelerar la voz, hojas de cuadros | `brew install ffmpeg` | `winget install Gyan.FFmpeg` | `apt install ffmpeg` |
| Google Chrome | HyperFrames renderiza con él | el normal | el normal | `google-chrome` o `chromium` |
| Git | Guardar versiones del proyecto | viene con Xcode CLT | `winget install Git.Git` | `apt install git` |
| yt-dlp (opcional) | Bajar reels para analizarlos | `brew install yt-dlp` | `winget install yt-dlp` | `pip install yt-dlp` |

Si en macOS no hay Homebrew: [brew.sh](https://brew.sh).

Entorno de Python del proyecto (no instales paquetes en el Python del sistema):

```sh
python3 -m venv .venv
.venv/bin/pip install python-dotenv elevenlabs requests      # Windows: .venv\Scripts\pip ...
# Solo si la voz no es ElevenLabs (Voicebox u otra): tiempos por palabra
.venv/bin/pip install faster-whisper
```

Verificación (todo debe responder sin error):

```sh
node -v && python3 --version && ffmpeg -version | head -1 && npx -y hyperframes --help
```

---

## Las llaves (API keys)

Una llave es una contraseña que deja a los scripts usar un servicio y cobrar. Reglas que le explicas a la persona:

- **Nunca** pegarla en el chat de la IA, ni subirla a GitHub, ni mandarla a nadie.
- Va solo en `.env.local`, en la raíz del proyecto, que está en `.gitignore`.
- Siempre con **tope de gasto** en el servicio. Y en `.env.local`, `LIMITE_USD`: el motor suma lo gastado en
  `gastos.json` y se niega a seguir si una llamada pasaría ese tope.

```
ELEVENLABS_API_KEY=sk_...
OPENROUTER_API_KEY=sk-or-v1-...
LIMITE_USD=10
```

### ElevenLabs (voz) — la recomendada

Además del audio, devuelve **el segundo exacto de cada letra**, y con eso los subtítulos y cada escena entran justo
cuando la voz nombra algo.

1. Crear cuenta en [elevenlabs.io](https://elevenlabs.io).
2. Plan: el gratis sirve para probar, pero las voces de la *Voice Library* (las mejores en español latino) solo se usan
   por API con plan de pago (*Starter* basta). Que revise los precios vigentes.
3. Elegir voz: *Voices → Explore*, filtrar *Spanish* y el acento (Latin American, Colombian, Mexican…), escuchar,
   **Add to my voices**.
4. Copiar el **voice ID**: *My voices* → la voz → *Copy voice ID*.
5. Crear la llave: perfil → *Developers / API Keys* → *Create API Key*, nombre `fabrica-videos`. Si deja restringir:
   Text to Speech + Voices (lectura); Sound Effects si quiere efectos generados. **Ponerle límite de créditos.**
6. Copiar la llave (`sk_…`) en ese momento: no la vuelven a mostrar.

Referencia: un video de ~60 s son ~900 caracteres; con dos tomas para elegir, ~2.000.

### Si no tiene ElevenLabs: Voicebox (gratis, en su computador)

[Voicebox](https://voicebox.sh) ([código](https://github.com/jamiepine/voicebox)) es un estudio de voz de código
abierto que corre local: sin suscripción, sin llaves, el audio no sale del computador. Clona una voz con unos 30 s de
audio limpio y habla varios idiomas, incluido español.

1. Descargarlo de [voicebox.sh](https://voicebox.sh) (o de *Releases* en GitHub) e instalarlo. La primera vez baja el
   modelo de voz (pesa varios GB; mejor con GPU o un Mac con chip M).
2. Crear o clonar una voz (grabar 30–60 s leyendo un texto en el acento que quiere, sin ruido ni música).
3. Para cada toma: pegar el texto que imprime `motor/fabrica.py voz --texto` y exportar el audio como WAV a
   `videos/<video>/audio/pruebas/<toma>.wav`. Si la versión instalada trae API local, el motor puede llamarla
   directamente; revisa su documentación antes de suponerlo.
4. `motor/fabrica.py voz --toma=v-1 --desde-wav` saca los tiempos de cada palabra con `faster-whisper` (ver
   `2-construir-fabrica.md`).

Avísale con honestidad: suena bien, pero ElevenLabs suele quedar más natural y estable en español; Voicebox es
perfecto para empezar sin gastar.

Cualquier otra voz que entregue un WAV (OpenAI TTS, Azure, Google, Piper, Kokoro) entra por el mismo camino de
`--desde-wav`. Si el proveedor da tiempos por palabra, úsalos directamente y sáltate whisper.

### OpenRouter (juez, análisis de reels e ilustraciones) — opcional

Una sola cuenta para modelos de muchas empresas. En la fábrica sirve para:

- **El juez:** un Gemini **oye** cada toma de voz y **ve** el MP4 terminado, y devuelve nota y arreglos con el segundo
  exacto.
- **Analizar reels** que le gustaron (estructura, gancho, ritmo).
- **Imágenes** (texturas, carteles, fotos de fondo) cuando hagan falta.

Pasos: [openrouter.ai](https://openrouter.ai) → *Sign in* → *Credits* → recargar poco → *Keys* → *Create Key* con
**credit limit** (p. ej. US$5) → copiar `sk-or-v1-…`. En *Settings*, desactivar que guarden los prompts.

Alternativa: una llave de Gemini directa ([aistudio.google.com](https://aistudio.google.com)). Sin ninguna de las dos
también se puede: la revisión la haces tú con hojas de cuadros y midiendo el audio.

### Fotos libres (opcional, gratis)

[Pexels](https://www.pexels.com/api/), [Pixabay](https://pixabay.com/api/docs/) y
[Unsplash](https://unsplash.com/developers): fotos y videos sin crédito en pantalla.

### Probar las llaves sin gastar

- ElevenLabs: `GET https://api.elevenlabs.io/v1/voices` con la cabecera `xi-api-key`.
- OpenRouter: `GET https://openrouter.ai/api/v1/key` con `Authorization: Bearer …` (devuelve saldo y límite).

Hazlo con un script que lea `.env.local`; nunca imprimas la llave.
