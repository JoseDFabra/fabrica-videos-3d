// Gente 3D de pie (Three.js r158 UMD, archivo local lib/vendor/three-r158.min.js): multitudes low-poly amables que
// esperan, se fastidian, miran el reloj o el celular, bostezan, caminan y celebran; y la utilería de una «fila»
// (caja con barra de carga, portero que señala, paquetes que viajan, carteles, piso-página web).
// Documentación completa: componentes/GENTE3D.md. Mismo estilo que componentes/personaje3d.js.
//
//   const esc = Gente3D.escena("#gl", { fov: 38 });                 // renderer + escena + cámara + luces
//   const ana = esc.persona({ piel: 2, ropa: 0, peinado: "rizado", en: [0, 0], giro: 0 });
//   ana.estado("espera-fastidio", 0, 3).estado("mira-reloj", 3, 6).estado("celebra", 6);
//   ana.ir([2, 1], 6, 8).globo("zzz", 1, 3);
//   const caja = esc.caja({ en: [0, 4], giro: 180, barra: [[0, 0.2], [4, 1]] }).aparece(0.5);
//   esc.camara([{ t: 0, angulo: 20, altura: 1.3, distancia: 0.7, mira: [0, 1.25, 0] }, { t: 3, altura: 12, distancia: 10 }]);
//   fx.dibuja((t) => esc.dibujar(t));                                // un solo reloj: mismo t → mismo cuadro
//
// Reglas: todo sale de t (nada de requestAnimationFrame, Math.random ni Date); el azar es con semilla (mulberry32);
// las personas se dibujan con InstancedMesh por parte del cuerpo (≈ 35 draw calls para 1 o 300 personas).
(function (raiz) {
  "use strict";
  const T3 = () => raiz.THREE || (typeof require === "function" ? require("three") : null);

  // ---------- Matemática ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const suave = (x) => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };   // smootherstep
  const tramo = (s, a, b) => (b <= a ? (s >= b ? 1 : 0) : suave((s - a) / (b - a)));
  const lerpN = (a, b, k) => a.map((x, i) => lerp(x, b[i], k));
  const rad = (g) => (g * Math.PI) / 180;
  const TAU = Math.PI * 2;
  const azar = (semilla) => () => {
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const backOut = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const backIn = (x) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * x * x * x - c1 * x * x; };
  // Escala de aparecer/desaparecer con rebote (0 antes de «a», 1 en medio, 0 después de «b»).
  const popEscala = (t, a, b, dIn = 0.45, dOut = 0.3) => {
    let k = 1;
    if (a != null) k = t < a ? 0 : t < a + dIn ? backOut((t - a) / dIn) : 1;
    if (b != null && t > b) k *= t >= b + dOut ? 0 : Math.max(0, 1 - backIn((t - b) / dOut));
    return Math.max(0, k);
  };
  // Pulso suave 0→1→0 entre a y b (sube rápido, baja lento).
  const pulso = (s, a, b) => (s < a || s > b ? 0 : Math.sin(Math.PI * Math.pow((s - a) / (b - a), 0.6)));
  // Rampa trapecio: acelera, velocidad constante, frena (para caminar a ritmo parejo).
  const trapecio = (u, a = 0.2) => {
    u = clamp(u, 0, 1); a = clamp(a, 0.01, 0.5);
    const v = 1 / (1 - a);
    if (u < a) return 0.5 * v * u * u / a;
    if (u > 1 - a) return 1 - 0.5 * v * (1 - u) * (1 - u) / a;
    return v * (u - a / 2);
  };

  // Interpolación cúbica monótona (Fritsch–Carlson) por canal (la misma de personaje3d).
  function hermite(ts, vals) {
    const n = ts.length, dim = vals[0].length;
    const m = vals.map(() => new Array(dim).fill(0));
    for (let c = 0; c < dim; c++) {
      const d = [];
      for (let i = 0; i < n - 1; i++) d.push((vals[i + 1][c] - vals[i][c]) / (ts[i + 1] - ts[i]));
      for (let i = 1; i < n - 1; i++) {
        if (d[i - 1] * d[i] <= 0) { m[i][c] = 0; continue; }
        const w1 = 2 * (ts[i + 1] - ts[i]) + (ts[i] - ts[i - 1]), w2 = (ts[i + 1] - ts[i]) + 2 * (ts[i] - ts[i - 1]);
        m[i][c] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
      }
    }
    return (t) => {
      if (t <= ts[0]) return vals[0].slice();
      if (t >= ts[n - 1]) return vals[n - 1].slice();
      let i = 0;
      while (t > ts[i + 1]) i++;
      const h = ts[i + 1] - ts[i], u = (t - ts[i]) / h, u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      return vals[i].map((v, c) => h00 * v + h10 * h * m[i][c] + h01 * vals[i + 1][c] + h11 * h * m[i + 1][c]);
    };
  }
  // Valor en el tiempo: número fijo | fn(t) | claves [[t, v...], ...] (interpolación monótona) | objeto con .punto(t).
  function porTiempo(x) {
    if (x == null) return () => null;
    if (typeof x === "function") return x;
    if (typeof x === "number") return () => x;
    if (x.punto) return (t) => x.punto(t);
    if (Array.isArray(x) && Array.isArray(x[0])) {
      if (x.length === 1) { const v = x[0].slice(1); return () => (v.length === 1 ? v[0] : v.slice()); }
      const f = hermite(x.map((k) => k[0]), x.map((k) => k.slice(1)));
      return (t) => { const v = f(t); return v.length === 1 ? v[0] : v; };
    }
    return () => x;
  }

  // ---------- Paletas (cualquier combinación sirve para cualquiera: nada de «colores de niño/niña») ----------
  const PIELES = ["#f6d5b8", "#eabf98", "#d39b6e", "#b07a4f", "#8a5a36", "#5e3b24"];
  const PELOS = ["#1f1a17", "#3b2618", "#6b4226", "#a0522d", "#d9b26f", "#9aa0a6"];
  const ROPAS = ["#3d62f1", "#2a9d8f", "#e09f3e", "#c8553d", "#7a9e7e", "#8e7dbe", "#e5e7eb", "#334155", "#5b8def", "#b5838d"];
  const PANTALONES = ["#273449", "#3b4a63", "#4a3f35", "#1f2937", "#56606e"];
  const PEINADOS = ["corto", "rizado", "largo", "mono", "rapado"];

  // ---------- Medidas (metros a altura 1; piso y = 0; con giro 0 la persona mira hacia +z; +x es su izquierda) ----------
  const CAD_Y = 0.62, CADERA_X = 0.09, MUSLO = 0.29, PIERNA = 0.29, TOBILLO = 0.08;
  const HOMBRO = [0.185, 0.4, 0], CUELLO = 0.46, CAB_R = 0.15, CAB_Y = 0.17;
  const BRAZO = 0.25, ANTEBRAZO = 0.25, PASO = 0.16;     // PASO: amplitud del pie al caminar (zancada = 4·PASO·altura)
  const ALTO = CAD_Y + CUELLO + CAB_Y + CAB_R;            // ≈ 1,40: coronilla a altura 1
  const REPOSO_I = [0.255, -0.075, 0.035], REPOSO_D = [-0.255, -0.075, 0.035];
  // v1.4 · mano de verdad (manos: "detalle"). Marco de la mano DERECHA: origen en la muñeca, +y hacia los dedos,
  // +z = lado de la palma, +x = lado del pulgar (la izquierda es el espejo en x). Metros a altura 1.
  const MANO_DEDOS = [   // [x, y del nudillo, largo de las 3 falanges, radio en la base, abre (rad)]: índice, medio, anular, meñique
    [0.0205, 0.057, [0.025, 0.016, 0.0135], 0.0072, 0.07],
    [0.0068, 0.0605, [0.028, 0.018, 0.0145], 0.0076, 0.01],
    [-0.0068, 0.0585, [0.026, 0.017, 0.014], 0.0071, -0.05],
    [-0.0195, 0.052, [0.020, 0.0135, 0.012], 0.0062, -0.12]];
  const MANO_PULGAR = { cmc: [0.019, 0.012, 0.006], largos: [0.03, 0.025, 0.021], radios: [0.0088, 0.0079, 0.0072] };
  // Agarre del celular con la mano derecha (marco del celular: +x derecha, +y arriba, +z hacia la cara; pantalla
  // 0,062 × 0,126): la palma por detrás del borde derecho, los cuatro dedos cruzan el dorso y asoman por el borde
  // izquierdo; el pulgar pasa por encima del borde derecho y toca la pantalla.
  const AGARRE = { en: [0.049, -0.071, -0.013], dir: [-1, 0.33],
    dedos: [[0.02, 1.2, 0.65], [0.0, 1.17, 0.72], [0.02, 1.2, 0.68], [0.08, 1.25, 0.62]], abre: 0.45 };

  // ---------- Estados ----------
  // Cada estado es (c) => {campos}. c = { t, v (t + desfase), s (segundos desde que empezó), d (duración), tramo(a,b),
  // r (4 azares fijos de la persona), opc (opciones del tramo), alt (altura), objetivo (señala: punto en el marco de la
  // persona), fase (caminar) }. Lo que no se dice sale de BASE. Manos: { t: [x,y,z] } en el marco del torso o
  // { l: [x,y,z] } en el de la persona (pies en el piso, mirando a +z). Pies: [x, alza, z, punta].
  const BASE = {
    cad: [0, 0, 0], cadG: 0, cadL: 0, tI: 0.03, tG: 0, tL: 0,
    cX: 0.03, cY: 0, cZ: 0, cuello: 0, hombros: 0,
    ceja: 0, pena: 0, enojo: 0, asim: 0, ojos: 1, cierra: 0, feliz: 0, boca: 0.3, bocaO: 0,
    codoI: [0.35, 0, -1], codoD: [-0.35, 0, -1], rodilla: [0, 0, 1],
    pieI: [0.1, 0, 0, 0], pieD: [-0.1, 0, 0.02, 0],
    celu: 0, pulgar: 0, brazosLibres: 1,
  };
  const caminar = (fase, k = 1) => {
    const s = Math.sin(fase), co = Math.cos(fase), A = PASO * k;
    return {
      pieI: [0.1, 0.075 * k * Math.max(0, co), A * s, 0.15 * k * Math.max(0, co)],
      pieD: [-0.1, 0.075 * k * Math.max(0, -co), -A * s, 0.15 * k * Math.max(0, -co)],
      cad: [0.012 * k * s, 0.02 * k * Math.abs(co) - 0.012 * k, 0], cadG: 0.09 * k * s, cadL: 0.03 * k * co,
      tI: 0.07, tG: -0.11 * k * s,
      manoI: { t: [0.25, -0.07, 0.04 - 0.17 * k * s] }, manoD: { t: [-0.25, -0.07, 0.04 + 0.17 * k * s] },
      codoI: [0.3, 0, -1], codoD: [-0.3, 0, -1],
    };
  };
  // manos apoyadas sobre una mesa delante (opc.mesa: alto de la mesa en m; opc.dz: distancia al borde)
  const manosMesa = (c) => {
    const y = (c.opc.mesa ?? 0.74) / c.alt + 0.03, z = (c.opc.dz ?? 0.3) / c.alt;
    return { manoI: { l: [0.15, y, z] }, manoD: { l: [-0.15, y, z + 0.02] }, codoI: [0.8, -1, -0.2], codoD: [-0.8, -1, -0.2], brazosLibres: 0 };
  };
  const ESTADOS = {
    respira: (c) => ({
      tL: 0.012 * Math.sin(c.v * 0.7), tI: 0.03 + 0.01 * Math.sin(c.v * 0.9),
      cX: 0.03 + 0.03 * Math.sin(c.v * 0.53 + 1), cY: 0.12 * Math.sin(c.v * 0.29), cZ: 0.02 * Math.sin(c.v * 0.41),
      cad: [0.012 * Math.sin(c.v * 0.35), 0, 0],
      manoI: { t: [REPOSO_I[0], REPOSO_I[1] + 0.006 * Math.sin(c.v * 0.9), REPOSO_I[2]] },
      manoD: { t: [REPOSO_D[0], REPOSO_D[1] + 0.006 * Math.sin(c.v * 0.9 + 0.5), REPOSO_D[2]] },
      boca: 0.25,
    }),
    "espera-fastidio": (c) => {
      const tap = Math.max(0, Math.sin(TAU * 2.2 * c.v));                     // zapateo con la punta (talón fijo)
      const P = 2.4 + 0.6 * c.r[0], k = (c.v + c.r[1] * 3) % P;               // resoplido cada 2,4–3 s
      const rs = pulso(k, 0, 0.9);
      return {
        tI: 0.01 - 0.03 * rs, tL: 0.025, cad: [0.025, 0, 0], hombros: 0.04 * rs,
        cX: 0.07 - 0.1 * rs, cY: 0.07 * Math.sin(c.v * 0.6), cZ: 0.06,
        enojo: 0.9, ojos: 0.92, cierra: 0.18, boca: -0.65, bocaO: 0.28 * rs,
        manoD: { t: [0.115, 0.235, 0.17] }, manoI: { t: [-0.12, 0.28, 0.205] },
        codoI: [1, -0.6, 0.25], codoD: [-1, -0.6, 0.25],
        pieI: [0.1, 0, 0, 0], pieD: [-0.11, 0, 0.05, 0.4 * tap],
        brazosLibres: 0,
      };
    },
    "mira-reloj": (c) => {
      const P = 3.4, k = c.s % P;
      const sube = tramo(k, 0, 0.45) * (1 - tramo(k, 2.5, 2.95));
      const env = tramo(k, 1.25, 1.45) * (1 - tramo(k, 2.1, 2.35));
      const sacude = 0.28 * env * Math.sin(TAU * 2.4 * (k - 1.25));
      return {
        manoI: { t: lerpN(REPOSO_I, [0.02, 0.43, 0.27], sube) }, codoI: lerpN([0.35, 0, -1], [1, -0.35, 0.1], sube),
        cX: 0.03 + 0.42 * sube - 0.15 * env, cY: 0.2 * sube * (1 - env) + sacude, tG: 0.08 * sube,
        enojo: 0.35 + 0.5 * env, boca: lerp(0.2, -0.55, sube), ojos: 1 + 0.08 * sube,
        brazosLibres: 0.5,
      };
    },
    celular: (c) => ({
      tI: 0.06, cX: 0.42 + 0.03 * Math.sin(c.v * 0.7), cY: 0.05 * Math.sin(c.v * 0.4), cZ: 0.04,
      manoD: { t: [-0.07, 0.33 + 0.005 * Math.sin(c.v * 1.3), 0.27] }, codoD: [-1, -0.6, -0.1],
      manoI: { t: [0.07, 0.29, 0.24] }, codoI: [1, -0.7, -0.1],
      ojos: 0.95, boca: 0.12, ceja: 0.1, celu: 1, pulgar: 1, brazosLibres: 0,
    }),
    bosteza: (c) => {
      const P = 4.2, k = c.s % P;
      const up = tramo(k, 0, 0.7) * (1 - tramo(k, 2.2, 2.9));
      const yawn = tramo(k, 0.3, 0.9) * (1 - tramo(k, 1.9, 2.5));
      return {
        manoI: { t: lerpN(REPOSO_I, [0.27, 0.97, -0.03], up) }, manoD: { t: lerpN(REPOSO_D, [-0.27, 0.97, -0.03], up) },
        codoI: lerpN([0.35, 0, -1], [1, 0.2, -0.3], up), codoD: lerpN([-0.35, 0, -1], [-1, 0.2, -0.3], up),
        tI: -0.08 * up, cX: 0.04 - 0.3 * yawn, hombros: 0.03 * up,
        bocaO: 1.0 * yawn, cierra: 0.85 * yawn, ceja: 0.4 * yawn, pena: 0.25, boca: 0.1,
        brazosLibres: 0,
      };
    },
    impaciente: (c) => {
      const w = Math.sin(TAU * 0.55 * c.v);
      const P = 2.8 + 0.5 * c.r[2], k = (c.v + c.r[3] * 4) % P, pk = pulso(k, 0.2, 1.5);
      return {
        cad: [0.045 * w, 0, 0], cadL: -0.05 * w, tL: 0.045 * w, tI: 0.04 + 0.1 * pk,
        pieI: [0.11, 0.025 * Math.max(0, -w), 0, 0.15 * Math.max(0, -w)], pieD: [-0.11, 0.025 * Math.max(0, w), 0.02, 0.15 * Math.max(0, w)],
        cuello: 0.015 + 0.05 * pk, cX: 0.02 - 0.18 * pk, cY: 0.12 * Math.sin(c.v * 0.8),
        manoI: { t: [0.205, 0.035, 0.0] }, manoD: { t: [-0.205, 0.035, 0.0] }, codoI: [1, 0, -0.4], codoD: [-1, 0, -0.4],
        enojo: 0.5, boca: -0.35, brazosLibres: 0,
      };
    },
    feliz: (c) => {
      const b = Math.abs(Math.sin(TAU * 0.9 * c.v));
      return {
        cad: [0, 0.012 * b, 0], cX: -0.05, cZ: 0.06 * Math.sin(TAU * 0.6 * c.v),
        feliz: 1, boca: 0.9, ceja: 0.35,
        manoI: { t: [0.1, 0.08, 0.19] }, manoD: { t: [-0.1, 0.08, 0.19] }, codoI: [1, -0.3, -0.4], codoD: [-1, -0.3, -0.4],
      };
    },
    celebra: (c) => {
      const hop = Math.max(0, Math.sin(TAU * 1.6 * c.v)), b = Math.sin(TAU * 1.6 * c.v);
      return {
        cad: [0, 0.055 * hop, 0], pieI: [0.1, 0.055 * hop, 0, 0], pieD: [-0.1, 0.055 * hop, 0.02, 0],
        tI: -0.04, cX: -0.14, cZ: 0.05 * Math.sin(TAU * 0.8 * c.v),
        manoI: { t: [0.31, 0.86 + 0.04 * b, 0.03] }, manoD: { t: [-0.31, 0.86 + 0.04 * b, 0.03] },
        codoI: [1, -0.5, 0.2], codoD: [-1, -0.5, 0.2],
        feliz: 1, boca: 1, ceja: 0.6, brazosLibres: 0,
      };
    },
    camina: (c) => Object.assign(caminar(c.fase), { boca: 0.25, cX: 0.0 }),
    señala: (c) => {
      const o = c.objetivo || [0, 0.65, 4];
      const ang = Math.atan2(o[0], o[2]);
      const tG = clamp(ang * 0.45, -0.75, 0.75);
      const L = c.lado || (ang >= 0 ? 1 : -1);                        // +1 mano izquierda, −1 derecha
      const sh = [L * HOMBRO[0] * Math.cos(tG), CAD_Y + HOMBRO[1], -L * HOMBRO[0] * Math.sin(tG)];
      let dx = o[0] - sh[0], dy = o[1] - sh[1], dz = o[2] - sh[2];
      const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      const ola = 0.035 * Math.sin(TAU * 1.4 * c.v);
      const mano = { l: [sh[0] + dx * 0.47, sh[1] + dy * 0.47 + ola, sh[2] + dz * 0.47] };
      const otra = { t: [-L * 0.205, 0.035, 0] };
      const q = {
        tG, cY: clamp(ang - tG, -0.7, 0.7) * 0.9, cX: -0.02, ceja: 0.3, boca: 0.55, brazosLibres: 0,
      };
      if (L > 0) { q.manoI = mano; q.codoI = [0.4, -1, 0]; q.manoD = otra; q.codoD = [-1, 0, -0.4]; }
      else { q.manoD = mano; q.codoD = [-0.4, -1, 0]; q.manoI = otra; q.codoI = [1, 0, -0.4]; }
      return q;
    },
    // ---------- Estados con manos en el mundo (v1.1) ----------
    // opc.teclado / opc.punto: [x,y,z] del mundo | fn(t) | objeto con .punto(t). crudo() los pasa al marco de la persona
    // como c.k (teclado) y c.p (punto). Alturas en metros; la persona mira a +z.
    teclea: (c) => {
      const o = c.opc, k = c.k || [0, (o.mesa ?? 0.88) / c.alt, 0.32];
      const f = o.ritmo ?? 5, des = o.desorden ?? 0.15, pa = o.pausa ? 1 : 0, half = (o.ancho ?? 0.26) / 2;
      const tapI = (1 - pa) * 0.016 * Math.max(0, Math.sin(TAU * f * c.v)), tapD = (1 - pa) * 0.016 * Math.max(0, Math.sin(TAU * f * c.v + 2.1));
      const jI = des * 0.06 * Math.sin(c.v * f * 0.71 + c.r[0] * 6), jD = des * 0.06 * Math.sin(c.v * f * 0.63 + c.r[1] * 6);
      const zI = des * 0.03 * Math.sin(c.v * f * 0.41 + 1), zD = des * 0.03 * Math.sin(c.v * f * 0.37 + 2);
      const sube = pa * 0.045;
      return {
        tI: 0.1, manoI: { l: [k[0] + half + jI, k[1] + 0.03 + tapI + sube, k[2] + zI] }, manoD: { l: [k[0] - half + jD, k[1] + 0.03 + tapD + sube, k[2] + zD] },
        codoI: [0.8, -1, -0.3], codoD: [-0.8, -1, -0.3],
        cX: clamp(0.28 + (o.miraAbajo ?? 0) + des * 0.12 * Math.sin(c.v * 1.7), -0.6, 0.8), cY: clamp(Math.atan2(k[0], k[2]) * 0.5, -0.6, 0.6) + des * 0.25 * Math.sin(c.v * 1.1),
        boca: o.sonrie ? 0.8 : 0.2, feliz: o.sonrie ? 0.6 : 0, brazosLibres: 0,
      };
    },
    presiona: (c) => {
      const o = c.opc, p = c.p || [0, 0.9, 0.4], u = c.t - (o.en ?? c.t);
      const baja = u < -0.05 ? lerp(0.13, 0.03, tramo(u, -0.45, -0.05)) : u < 0.22 ? 0.03 * (1 - tramo(u, -0.05, 0.03)) + 0.0 : lerp(0.0, 0.12, tramo(u, 0.22, 0.55));
      const izq = o.mano === "I";
      const mano = { l: [p[0], p[1] + 0.02 + baja, p[2] - 0.015] };
      const k = c.k;
      const otra = k ? { l: [k[0] + (izq ? -0.13 : 0.13), k[1] + 0.03, k[2]] } : { t: [izq ? -0.17 : 0.17, 0.08, 0.16] };
      const q = { tI: 0.14, cX: 0.4, cY: clamp(Math.atan2(p[0], p[2]) * 0.6, -0.6, 0.6), boca: 0.2, brazosLibres: 0, ceja: 0.2 };
      if (izq) { q.manoI = mano; q.codoI = [0.8, -1, -0.3]; q.manoD = otra; q.codoD = [-0.8, -1, -0.3]; }
      else { q.manoD = mano; q.codoD = [-0.8, -1, -0.3]; q.manoI = otra; q.codoI = [0.8, -1, -0.3]; }
      return q;
    },
    "escribe-pizarra": (c) => {
      const p = c.p || [0.3, 1.3, 0.5];
      const ang = Math.atan2(p[0], p[2]);
      return {
        tG: clamp(ang * 0.4, -0.6, 0.6), tI: 0.02, cY: clamp(ang * 0.5, -0.6, 0.6), cX: clamp(-(p[1] - 1.25) * 0.9, -0.5, 0.4),
        manoD: { l: [p[0], p[1], p[2] - 0.03] }, codoD: [-0.6, -1, -0.2], manoI: { t: [0.19, 0.04, 0.03] }, codoI: [1, 0, -0.4],
        boca: 0.3, ceja: 0.15, brazosLibres: 0,
      };
    },
    mira: (c) => {
      const p = c.p || [0, 1.3, 2];
      const ang = Math.atan2(p[0], p[2]), h = Math.hypot(p[0], p[2]) || 1;
      const q = { tG: clamp(ang * 0.35, -0.6, 0.6), cY: clamp(ang * 0.65, -0.8, 0.8), cX: clamp(-Math.atan2(p[1] - 1.25 * (c.opc.sentado ? 0.72 : 1), h) * 0.9, -0.5, 0.5), boca: 0.25 };
      if (c.opc.mesa) Object.assign(q, manosMesa(c));
      return q;
    },
    "reposo-mesa": (c) => Object.assign({ tI: 0.06, boca: 0.25 }, manosMesa(c)),
    piensa: (c) => ({
      tI: 0.04, cX: -0.18 + 0.04 * Math.sin(c.v * 0.8), cY: 0.3 + 0.08 * Math.sin(c.v * 0.5), cZ: 0.08,
      manoD: { t: [-0.03, 0.5, 0.19] }, codoD: [-0.5, -1, 0.4], manoI: { t: [0.02, 0.27, 0.2] }, codoI: [0.8, -1, 0.2],
      ceja: 0.2, asim: 0.8, boca: 0.0, ojos: 0.95, brazosLibres: 0,
    }),
    explica: (c) => {
      const a = Math.sin(TAU * 0.7 * c.v), b = Math.max(0, Math.sin(TAU * 1.6 * c.v));
      return {
        tG: 0.12 * Math.sin(TAU * 0.35 * c.v) + (c.opc.giroTorso ?? 0), tI: 0.04,
        manoI: { t: [0.19 + 0.05 * a, 0.2 + 0.03 * a, 0.26] }, manoD: { t: [-0.19 - 0.05 * a, 0.2 - 0.03 * a, 0.26] },
        codoI: [1, -0.8, -0.2], codoD: [-1, -0.8, -0.2], ceja: 0.35 + 0.2 * b, boca: 0.45, bocaO: 0.35 * b, brazosLibres: 0,
      };
    },
    discute: (c) => {
      const L = c.opc.lado ?? 1, a = Math.sin(TAU * 0.62 * c.v), b = Math.max(0, Math.sin(TAU * 1.9 * c.v + 1));
      return {
        tG: L * (0.28 + 0.06 * a), cY: L * (0.45 + 0.1 * a), tI: 0.08,
        manoI: { t: [0.17 + 0.04 * a, 0.18, 0.25] }, manoD: { t: [-0.17 + 0.04 * a, 0.18, 0.25] }, codoI: [1, -0.8, -0.2], codoD: [-1, -0.8, -0.2],
        ceja: 0.25, enojo: 0.2, boca: 0.1, bocaO: 0.3 * b, brazosLibres: 0,
      };
    },
    asiente: (c) => {
      const env = c.s < 0.9 ? 1 : 0.35;
      const q = { cX: 0.06 + 0.16 * env * Math.sin(TAU * 2 * c.s), feliz: 0.5, boca: 0.7, ceja: 0.2 };
      if (c.opc.mesa) Object.assign(q, manosMesa(c));
      return q;
    },
    niega: (c) => {
      const q = { cY: 0.42 * Math.sin(TAU * 1.8 * c.s) * (c.s < 1.4 ? 1 : 0.3), cX: 0.02, ceja: 0.3, enojo: 0.55, boca: -0.5 };
      if (c.opc.mesa) Object.assign(q, manosMesa(c));
      else { q.manoI = { t: [REPOSO_I[0], REPOSO_I[1], REPOSO_I[2]] }; q.manoD = { t: [REPOSO_D[0], REPOSO_D[1], REPOSO_D[2]] }; }
      return q;
    },
    "brazos-cruzados": (c) => ({
      tI: -0.1, tL: 0.02, cX: -0.05, cY: 0.08 * Math.sin(c.v * 0.5), enojo: 0.6, boca: -0.45, ojos: 0.95,
      manoD: { t: [0.115, 0.235, 0.17] }, manoI: { t: [-0.12, 0.28, 0.205] }, codoI: [1, -0.6, 0.25], codoD: [-1, -0.6, 0.25], brazosLibres: 0,
    }),
    sorpresa: (c) => {
      const k = tramo(c.s, 0, 0.25);
      return {
        tI: -0.14 * k, cX: -0.12 * k, ceja: 1 * k, ojos: 1 + 0.25 * k, bocaO: 0.75 * k, boca: 0,
        manoI: { t: lerpN(REPOSO_I, [0.08, 0.31, 0.2], k) }, manoD: { t: lerpN(REPOSO_D, [-0.08, 0.31, 0.2], k) },
        codoI: [1, -0.7, 0.2], codoD: [-1, -0.7, 0.2], brazosLibres: 0,
      };
    },
    "mira-camara": (c) => ({ cY: c.opc.cY ?? 0, cX: -0.04, feliz: 0.7, boca: 0.85, ceja: 0.3 }),
    atiende: (c) => {
      const mesa = (c.opc.mesa ?? 0.88) / c.alt;
      const carga = clamp(c.opc.carga ? c.opc.carga(c.t) || 0 : 0.3, 0, 1);
      const f = 3.2 + 3.5 * carga, tec = (ph) => 0.012 * Math.max(0, Math.sin(TAU * f * c.v + ph));
      const up = tramo((c.v + c.r[0] * 3) % 3.2, 1.6, 1.9) * (1 - tramo((c.v + c.r[0] * 3) % 3.2, 2.8, 3.1));
      return {
        tI: 0.1, manoI: { l: [0.13, mesa + 0.045 + tec(0), 0.3] }, manoD: { l: [-0.13, mesa + 0.045 + tec(2.1), 0.3] },
        codoI: [0.7, -1, -0.2], codoD: [-0.7, -1, -0.2],
        cX: 0.32 * (1 - up) - 0.04 * up, cY: 0.12 * Math.sin(c.v * 0.5),
        pena: 0.9 * tramo(carga, 0.55, 0.9), boca: 0.35 - 0.95 * carga, ceja: 0.25 * carga, brazosLibres: 0,
      };
    },
  };
  const ALIAS = { quieto: "respira", idle: "respira", fastidio: "espera-fastidio", "espera": "espera-fastidio",
    reloj: "mira-reloj", "mira-celular": "celular", senala: "señala", camino: "camina" };
  const TRANS = { respira: 0.7, celebra: 0.5, señala: 0.45, camina: 0.35, presiona: 0.3, sorpresa: 0.15, asiente: 0.25, niega: 0.25 };   // transición de entrada (s); por defecto 0.5

  // ---------- Geometría ----------
  function fusionar(THREE, partes) {
    const P = [], N = [];
    let n = 0;
    for (const [g0, m] of partes) {
      const g = g0.index ? g0.toNonIndexed() : g0.clone();
      if (m) g.applyMatrix4(m);
      P.push(g.attributes.position.array); N.push(g.attributes.normal.array); n += g.attributes.position.array.length;
    }
    const pa = new Float32Array(n), na = new Float32Array(n);
    let o = 0;
    P.forEach((a, i) => { pa.set(a, o); na.set(N[i], o); o += a.length; });
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pa, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(na, 3));
    return out;
  }
  function geometrias(THREE, lejos) {
    const n = (k) => Math.max(3, Math.round(lejos ? k * 0.5 : k));
    const M = (p, r, s) => new THREE.Matrix4().compose(new THREE.Vector3(...(p || [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r || [0, 0, 0]))), new THREE.Vector3(...(s || [1, 1, 1])));
    const F = (l) => fusionar(THREE, l);
    const cr = CAB_R, cy = CAB_Y;
    const sobre = (x, y, d = 0) => [x, cy + y, Math.sqrt(Math.max(0, cr * cr - x * x - y * y)) + d];
    const g = {};
    const cab = [[new THREE.SphereGeometry(cr, n(22), n(16)), M([0, cy, 0], null, [1, 1.04, 1])],
      [new THREE.SphereGeometry(0.019, n(10), n(8)), M(sobre(0, -0.026, -0.004))]];
    if (!lejos) for (const sx of [-1, 1]) cab.push([new THREE.SphereGeometry(0.032, 10, 8), M([sx * cr * 0.97, cy - 0.005, -0.01], null, [0.6, 1, 0.9])]);
    g.cabeza = F(cab);
    g.cuello = new THREE.CapsuleGeometry(0.05, 0.07, 2, n(10));
    g.pecho = new THREE.CapsuleGeometry(0.155, 0.24, n(6), n(14));
    g.chaleco = new THREE.CapsuleGeometry(0.164, 0.2, n(6), n(14));
    g.franja = new THREE.CylinderGeometry(0.17, 0.17, 0.035, n(16));
    g.cadera = F([[new THREE.CapsuleGeometry(0.15, 0.06, n(4), n(12)), M(null, [0, 0, Math.PI / 2], [1, 1, 0.85])]]);
    g.muslo = new THREE.CapsuleGeometry(0.07, MUSLO - 0.03, n(4), n(10));
    g.pierna = new THREE.CapsuleGeometry(0.058, PIERNA - 0.05, n(4), n(10));
    g.zapato = F([[new THREE.BoxGeometry(0.125, 0.075, 0.2), M([0, -TOBILLO + 0.0375, 0.045])],
      [new THREE.CylinderGeometry(0.0625, 0.0625, 0.075, n(10)), M([0, -TOBILLO + 0.0375, 0.145], null, [1, 1, 0.6])]]);
    g.hombro = new THREE.SphereGeometry(0.06, n(12), n(10));
    g.brazo = new THREE.CapsuleGeometry(0.047, BRAZO - 0.05, n(4), n(10));
    g.antebrazo = new THREE.CapsuleGeometry(0.041, ANTEBRAZO - 0.09, n(4), n(10));
    g.mano = F([[new THREE.SphereGeometry(0.043, n(12), n(10)), M(null, [Math.PI / 2, 0, 0], [0.95, 0.8, 1.25])]]);
    g.ojo = new THREE.SphereGeometry(0.021, n(12), n(10));
    g.ceja = new THREE.BoxGeometry(0.05, 0.012, 0.012);
    g.sonrisa = new THREE.TorusGeometry(0.032, 0.0075, n(6), n(18), Math.PI);
    g.bocaO = new THREE.SphereGeometry(0.025, n(12), n(10));
    g.mejilla = F([-1, 1].map((sx) => {
      const p = sobre(sx * 0.088, -0.032, 0.002), nrm = new THREE.Vector3(p[0], p[1] - cy, p[2]).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
      return [new THREE.CircleGeometry(0.023, n(14)), new THREE.Matrix4().compose(new THREE.Vector3(...p), q, new THREE.Vector3(1, 1, 1))];
    }));
    g.lentes = F([...[-1, 1].map((sx) => [new THREE.TorusGeometry(0.031, 0.005, 6, n(18)), M(sobre(sx * 0.052, 0.02, 0.016))]),
      [new THREE.BoxGeometry(0.036, 0.005, 0.005), M(sobre(0, 0.024, 0.02))]]);
    // Pelo (la cara mira a +z)
    g["pelo-capa"] = F([[new THREE.SphereGeometry(cr * 1.07, n(24), n(14), 0, TAU, 0, Math.PI * 0.53), M([0, cy + 0.005, -0.012], [rad(-30), 0, 0], [1, 1.05, 1])]]);
    g["pelo-rapado"] = F([[new THREE.SphereGeometry(cr * 1.015, n(24), n(14), 0, TAU, 0, Math.PI * 0.44), M([0, cy + 0.005, -0.012], [rad(-30), 0, 0], [1, 1.05, 1])]]);
    g["pelo-largo"] = F([[new THREE.CapsuleGeometry(0.12, 0.16, n(4), n(12)), M([0, cy - 0.08, -0.065], null, [1.12, 1, 0.75])],
      ...[-1, 1].map((sx) => [new THREE.CapsuleGeometry(0.04, 0.14, n(4), n(8)), M([sx * 0.132, cy - 0.06, -0.005])])]);
    {
      const r = azar(31), bolas = [];
      const cuantos = lejos ? 12 : 22;
      for (let i = 0; i < cuantos; i++) {
        const y = 0.15 + 0.85 * (i / (cuantos - 1)), rr = Math.sqrt(1 - y * y), a = i * 2.399 + r() * 0.3;
        if (Math.sin(a) > 0.05 && y < 0.88) continue;                      // despeja la frente
        const rad_ = (0.047 + r() * 0.012) * (lejos ? 1.25 : 1);
        bolas.push([new THREE.SphereGeometry(rad_, n(10), n(8)), M([Math.cos(a) * rr * cr * 1.05, cy + 0.02 + y * cr * 1.05, Math.sin(a) * rr * cr * 1.05 - 0.02])]);
      }
      g["pelo-rizado"] = F(bolas);
    }
    g["pelo-mono"] = new THREE.SphereGeometry(0.062, n(14), n(10)).translate(0, cy + cr * 0.95, -0.07);
    g["pelo-corto"] = F([[new THREE.SphereGeometry(cr * 0.75, n(14), n(10)), M([0.02, cy + 0.088, 0.045], [0, 0, -0.3], [1.15, 0.45, 0.9])]]);
    // Celular, pulgar, reloj
    g.celular = new THREE.BoxGeometry(0.07, 0.14, 0.01);
    g.pantallaCel = new THREE.PlaneGeometry(0.062, 0.126).translate(0, 0, 0.0056);
    g.pulgar = new THREE.CapsuleGeometry(0.015, 0.035, 2, 8);
    g.reloj = new THREE.CylinderGeometry(0.044, 0.044, 0.026, n(12));
    g.relojCara = F([[new THREE.CylinderGeometry(0.019, 0.019, 0.01, n(14)), M([0.044, 0, 0], [0, 0, Math.PI / 2])]]);
    g.sombra = new THREE.PlaneGeometry(0.85, 0.85).rotateX(-Math.PI / 2);
    // v1.4 · mano de verdad (opción de persona manos: "detalle"): palma redondeada, falanges que se afinan, nudillos,
    // uñas y puño de la manga. Piezas unitarias que se escalan por instancia (ver manoDetalle en crearPersona).
    g.hPalma = cajaRedonda(THREE, 0.34, lejos ? 3 : 6);
    g.hSeg = new THREE.CylinderGeometry(0.86, 1, 1, n(14), 1, true).translate(0, 0.5, 0);
    g.hBola = new THREE.SphereGeometry(1, n(20), n(14));
    g.hUna = new THREE.SphereGeometry(1, n(16), n(10));
    g.hPuno = new THREE.CylinderGeometry(1, 1, 1, n(18));
    return g;
  }

  // Caja de 1×1×1 con esquinas redondeadas (r relativo, 0–0,5) y normales exactas: la palma de la mano.
  function cajaRedonda(THREE, r, seg) {
    const g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg), p = g.attributes.position, nr = g.attributes.normal;
    const a = 0.5 - r, v = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); c.set(clamp(v.x, -a, a), clamp(v.y, -a, a), clamp(v.z, -a, a));
      v.sub(c); if (v.lengthSq() < 1e-12) v.set(0, 0, 1); v.normalize();
      nr.setXYZ(i, v.x, v.y, v.z); p.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r);
    }
    return g;
  }

  // ---------- Pool de instancias (una parte del cuerpo para toda la gente) ----------
  function crearPool(G, geo, mat, orden) {
    const THREE = G.THREE;
    const p = { colores: [], mesh: null, sucio: false };
    p.reservar = (color) => { p.colores.push(color); p.sucio = true; return p.colores.length - 1; };
    p.preparar = () => {
      if (!p.sucio) return;
      p.sucio = false;
      const n = p.colores.length;
      if (p.mesh) { G.grupo.remove(p.mesh); p.mesh.dispose(); }
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      m.frustumCulled = false; m.renderOrder = orden || 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const c = new THREE.Color();
      p.colores.forEach((k, i) => m.setColorAt(i, c.set(k)));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.count = n;
      p.arr = m.instanceMatrix.array;
      p.arr.fill(0);
      G.grupo.add(m);
      p.mesh = m;
    };
    p.pon = (i, M) => M.toArray(p.arr, i * 16);
    p.nada = (i) => p.arr.fill(0, i * 16, i * 16 + 16);
    return p;
  }

  // ---------- Texturas de canvas ----------
  const lienzo = (w, h) => { const cv = raiz.document.createElement("canvas"); cv.width = w; cv.height = h; return cv; };
  const FUENTE = "Archivo, system-ui, sans-serif";
  function fuentesListas() {
    const d = raiz.document;
    if (!d || !d.fonts || typeof d.fonts.check !== "function") return true;
    try { return d.fonts.check("800 40px Archivo"); } catch (e) { return true; }
  }
  function rRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  // Íconos de globo y de paquete (canvas 2D). Cualquier otro texto corto se escribe tal cual.
  function dibujaIcono(ctx, nombre, x, y, s, tinta) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = tinta; ctx.strokeStyle = tinta; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (nombre === "reloj") {
      ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(0, 0, 38, 0, TAU); ctx.stroke();
      ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -24); ctx.moveTo(0, 0); ctx.lineTo(17, 9); ctx.stroke();
    } else if (nombre === "..." || nombre === "…") {
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * 28, 4, 10, 0, TAU); ctx.fill(); }
    } else if (nombre === "sobre") {
      ctx.lineWidth = 7; rRect(ctx, -46, -32, 92, 64, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-42, -26); ctx.lineTo(0, 6); ctx.lineTo(42, -26); ctx.stroke();
    } else if (nombre === "tarjeta") {
      ctx.lineWidth = 7; rRect(ctx, -46, -32, 92, 64, 8); ctx.stroke();
      ctx.fillRect(-46, -16, 92, 12); ctx.fillRect(-32, 12, 30, 8);
    } else if (nombre === "ok") {
      ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(-26, 2); ctx.lineTo(-6, 22); ctx.lineTo(28, -20); ctx.stroke();
    } else if (nombre === "x") {
      ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(-22, -22); ctx.lineTo(22, 22); ctx.moveTo(22, -22); ctx.lineTo(-22, 22); ctx.stroke();
    } else if (nombre === "carrito") {
      ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-44, -30); ctx.lineTo(-30, -30); ctx.lineTo(-20, 14); ctx.lineTo(30, 14); ctx.lineTo(40, -16); ctx.lineTo(-26, -16); ctx.stroke();
      ctx.beginPath(); ctx.arc(-14, 30, 7, 0, TAU); ctx.arc(26, 30, 7, 0, TAU); ctx.fill();
    } else {
      const zzz = nombre === "zzz";
      ctx.font = `${zzz ? "italic " : ""}800 ${zzz ? 62 : nombre.length > 2 ? 46 : 84}px ${FUENTE}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(nombre, 0, 4);
    }
    ctx.restore();
  }

  // ======================================================================================================
  // Gente3D.en(scene, THREE, material): la gente y la utilería dentro de una escena que ya existe.
  // ======================================================================================================
  function en(scene, THREE_, material, op = {}) {
    const THREE = THREE_ || T3();
    const G = { THREE, scene, personas: [], op, detalle: op.detalle || "normal", cara: op.cara || 1 };
    const grupo = new THREE.Group(); grupo.name = "gente3d"; scene.add(grupo); G.grupo = grupo;

    // Material plano «de ilustración»: toon de 3 tonos, cacheado por color (o el del video, si lo pasa).
    const grad = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;
    const mats = new Map();
    G.material = material || ((color) => {
      const k = String(color);
      if (!mats.has(k)) mats.set(k, new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: grad }));
      return mats.get(k);
    });
    const basicos = new Map();
    G.plano = (color) => {           // color plano sin luz (barras, pantallas)
      const k = String(color);
      if (!basicos.has(k)) basicos.set(k, new THREE.MeshBasicMaterial({ color: new THREE.Color(color), toneMapped: false }));
      return basicos.get(k);
    };
    G.malla = (geo, color, padre, pos, rot, esc_) => {
      const m = new THREE.Mesh(geo, typeof color === "object" && color.isMaterial ? color : G.material(color));
      if (pos) m.position.set(pos[0], pos[1], pos[2]);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      if (esc_) m.scale.set(esc_[0], esc_[1], esc_[2]);
      (padre || grupo).add(m);
      return m;
    };
    function texRadial(c0, c1) {
      const cv = lienzo(128, 128), ctx = cv.getContext("2d");
      if (ctx && ctx.createRadialGradient) {
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, c0); g.addColorStop(1, c1);
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      }
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
    }
    G.texRadial = texRadial;

    // Texturas con texto: se repintan solas cuando la fuente (Archivo) termina de cargar.
    const textos = [];
    G.lienzoTexto = (w, h, dibuja) => {
      const cv = lienzo(w, h), ctx = cv.getContext("2d");
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const o = { cv, ctx, tex, w, h, dibuja, listo: false };
      o.repinta = () => { if (ctx && ctx.clearRect) { ctx.clearRect(0, 0, w, h); dibuja(ctx, w, h); } tex.needsUpdate = true; o.listo = fuentesListas(); };
      o.repinta(); textos.push(o);
      return o;
    };

    // Materiales y geometrías compartidas por detalle ("normal" | "lejos").
    const toonBlanco = G.material("#ffffff");
    const matPantalla = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const matMano = new THREE.MeshLambertMaterial({ color: 0xffffff });   // v1.4: mate y suave (se ven los volúmenes de la mano)
    const matMejilla = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false });
    const matSombra = new THREE.MeshBasicMaterial({ color: 0xffffff, map: texRadial("rgba(3,7,18,0.5)", "rgba(3,7,18,0)"), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const juegos = {};
    G.pools = (det) => {
      if (juegos[det]) return juegos[det];
      const geos = geometrias(THREE, det === "lejos");
      const P = {};
      for (const k in geos) {
        const mat = k === "mejilla" ? matMejilla : k === "sombra" ? matSombra : k === "pantallaCel" ? matPantalla : /^h[A-Z]/.test(k) ? matMano : toonBlanco;
        P[k] = crearPool(G, geos[k], mat, k === "sombra" ? -1 : 0);
      }
      juegos[det] = P;
      return P;
    };
    const preparar = () => { for (const d in juegos) for (const k in juegos[d]) juegos[d][k].preparar(); };

    // Globos (sprites) y cosas que se actualizan por cuadro.
    const actualizables = [];
    const texGlobos = new Map();
    G.texGlobo = (icono) => {
      if (!texGlobos.has(icono)) {
        const o = G.lienzoTexto(256, 224, (ctx, w) => {
          ctx.fillStyle = "#f8fafc"; ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 6;
          rRect(ctx, 14, 14, w - 28, 150, 52); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(108, 160); ctx.lineTo(128, 204); ctx.lineTo(150, 160); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(106, 163); ctx.lineTo(128, 207); ctx.lineTo(152, 163); ctx.stroke();
          ctx.fillStyle = "#f8fafc"; ctx.fillRect(104, 150, 50, 14);
          const tinta = icono === "!" ? "#e5484d" : "#1e293b";
          dibujaIcono(ctx, icono, w / 2, 90, 1, tinta);
        });
        texGlobos.set(icono, new THREE.SpriteMaterial({ map: o.tex, transparent: true, depthWrite: false }));
      }
      return texGlobos.get(icono);
    };

    // ---------- Escena por cuadro ----------
    const qPadre = new THREE.Quaternion(), qCam = new THREE.Quaternion();
    G.mirarCamara = (obj, camera) => {           // billboard: copia la orientación de la cámara (en el marco del grupo)
      if (!camera) return;
      camera.getWorldQuaternion(qCam); grupo.getWorldQuaternion(qPadre);
      obj.quaternion.copy(qPadre.invert().multiply(qCam));
    };
    G.actualizar = (t, camera) => {
      if (camera) { camera.updateMatrixWorld(true); }
      grupo.updateMatrixWorld(true);
      preparar();
      G.personas.forEach((p) => p.actualizar(t, camera));
      actualizables.forEach((f) => f(t, camera));
      for (const d in juegos) for (const k in juegos[d]) { const m = juegos[d][k].mesh; if (m) m.instanceMatrix.needsUpdate = true; }
      if (textos.some((o) => !o.listo) && fuentesListas()) textos.forEach((o) => { if (!o.listo) o.repinta(); });
      G.ultimoT = t;
    };

    G.persona = (o = {}) => { const p = crearPersona(G, o, G.personas.length); G.personas.push(p); return p; };
    // Varias personas de una vez: G.gente(n, (i, r) => opciones) con r = azar con semilla.
    G.gente = (n, fn, semilla = 7) => { const r = azar(semilla); return Array.from({ length: n }, (_, i) => G.persona(fn ? fn(i, r) : {})); };

    // ---------- Utilería ----------
    // Caja / taquilla con cajero sentado y barra de carga encima.
    G.caja = (o = {}) => {
      const g = new THREE.Group(); const p0 = o.en || [0, 0];
      g.position.set(p0[0], 0, p0[1]); g.rotation.y = rad(o.giro || 0); grupo.add(g);
      const cuerpo = new THREE.Group(); g.add(cuerpo);
      const AN = o.ancho || 1.2, AL = o.alto || 0.85, FO = 0.55;
      const claro = o.color || "#e2e8f0", acento = o.acento || "#3d62f1", oscuro = "#334155";
      G.malla(new THREE.BoxGeometry(AN, AL, FO), claro, cuerpo, [0, AL / 2, 0]);
      G.malla(new THREE.BoxGeometry(AN + 0.08, 0.05, FO + 0.08), "#cbd5e1", cuerpo, [0, AL + 0.025, 0]);
      G.malla(new THREE.BoxGeometry(AN + 0.02, AL * 0.5, 0.03), acento, cuerpo, [0, AL * 0.42, FO / 2 + 0.016]);
      // Monitor del cajero (de espaldas al público) y banquito.
      G.malla(new THREE.BoxGeometry(0.05, 0.14, 0.04), oscuro, cuerpo, [AN * 0.3, AL + 0.12, -0.02]);
      G.malla(new THREE.BoxGeometry(0.4, 0.26, 0.04), oscuro, cuerpo, [AN * 0.3, AL + 0.27, -0.02], [rad(8), 0, 0]);
      G.malla(new THREE.PlaneGeometry(0.36, 0.22), G.plano("#7b86f0"), cuerpo, [AN * 0.3, AL + 0.27, -0.043], [rad(8), Math.PI, 0]);
      G.malla(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16), "#475569", cuerpo, [0, 0.47, -0.5]);
      G.malla(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 8), "#64748b", cuerpo, [0, 0.23, -0.5]);
      G.malla(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16), "#475569", cuerpo, [0, 0.015, -0.5]);
      // Cajero (una persona más, sentada; su ánimo sigue a la barra).
      const gr = rad(o.giro || 0), cx = p0[0] - 0.5 * Math.sin(gr), cz = p0[1] - 0.5 * Math.cos(gr);
      const valor = porTiempo(o.barra ?? 0);
      const caja = { grupo: g, cuerpo, ancho: AN, alto: AL, en: p0, giro: o.giro || 0, valor: (t) => clamp(+valor(t) || 0, 0, 1) };
      const cajero = o.cajero === false ? null : G.persona(Object.assign({ en: [cx, cz], giro: o.giro || 0, sentado: 0.6, ropa: "#334155", reloj: false }, o.cajero || {}));
      if (cajero) cajero.estado("atiende", -1e6, Infinity, { mesa: AL + 0.05, carga: caja.valor });
      caja.cajero = cajero;
      // Barra de carga (siempre de cara a la cámara).
      const barra = new THREE.Group(); grupo.add(barra);
      const tb = o.tamBarra || 1;
      G.malla(new THREE.BoxGeometry(1.0, 0.24, 0.03), G.plano("#f1f5f9"), barra, [0, 0, -0.01]);
      G.malla(new THREE.BoxGeometry(0.92, 0.16, 0.03), G.plano("#1e293b"), barra, [0, 0, 0.002]);
      const matFill = new THREE.MeshBasicMaterial({ color: new THREE.Color("#22c55e"), toneMapped: false });
      const fill = G.malla(new THREE.BoxGeometry(1, 0.16, 0.03).translate(0.5, 0, 0), matFill, barra, [-0.46, 0, 0.012]);
      const cV = new THREE.Color("#22c55e"), cA = new THREE.Color("#f5a524"), cR = new THREE.Color("#f05252");
      const altoBarra = o.alturaBarra ?? AL + 1.15;
      let ap = o.aparece ?? null, des = o.desaparece ?? null;
      caja.aparece = (t, d) => { ap = t; if (cajero) cajero.aparece(t, d); return caja; };
      caja.desaparece = (t, d) => { des = t; if (cajero) cajero.desaparece(t, d); return caja; };
      if (ap != null && cajero) cajero.aparece(ap); if (des != null && cajero) cajero.desaparece(des);
      caja.barra = (x) => { const f = porTiempo(x); caja.valor = (t) => clamp(+f(t) || 0, 0, 1); return caja; };
      caja.punto = (t) => [p0[0] + (FO / 2 + 0.05) * Math.sin(gr), AL + 0.1, p0[1] + (FO / 2 + 0.05) * Math.cos(gr)];
      caja.puntoBarra = () => [p0[0], altoBarra + 0.2 * tb, p0[1]];
      actualizables.push((t, camera) => {
        const k = popEscala(t, ap, des);
        g.visible = barra.visible = k > 1e-4;
        g.scale.setScalar(Math.max(1e-4, k));
        const v = caja.valor(t);
        matFill.color.copy(v < 0.5 ? cV.clone().lerp(cA, v / 0.5) : cA.clone().lerp(cR, (v - 0.5) / 0.5));
        fill.scale.x = Math.max(0.001, v * 0.92);
        const lleno = tramo(v, 0.93, 1) * (0.5 + 0.5 * Math.sin(TAU * 3 * t));
        barra.position.set(p0[0], altoBarra * k, p0[1]);
        barra.scale.setScalar(Math.max(1e-4, k * tb * (1 + 0.07 * lleno)));
        G.mirarCamara(barra, camera);
      });
      return caja;
    };

    // Portero: persona con chaleco que señala un punto (fijo, claves, función o un objeto con .punto(t), p. ej. una caja).
    G.portero = (o = {}) => {
      const p = G.persona(Object.assign({ chaleco: "#f5a524", ropa: "#334155" }, o));
      p.apunta = (objetivo, desde = -1e6, hasta = Infinity, opc = {}) => p.estado("señala", desde, hasta, Object.assign({ objetivo }, opc));
      if (o.apunta) p.apunta(o.apunta, o.desde ?? -1e6, o.hasta ?? Infinity);
      return p;
    };

    // Paquete: una «solicitud» (sobre/tarjeta con ícono) que viaja de A a B por tiempo.
    const texPaquetes = new Map();
    G.paquete = (o = {}) => {
      const icono = o.icono || "sobre", fondo = o.color || "#f8fafc", tinta = o.tinta || "#3d62f1";
      const clave = icono + fondo + tinta;
      if (!texPaquetes.has(clave)) {
        const tx = G.lienzoTexto(256, 176, (ctx, w, h) => {
          ctx.fillStyle = fondo; rRect(ctx, 6, 6, w - 12, h - 12, 26); ctx.fill();
          dibujaIcono(ctx, icono, w / 2, h / 2, 1.25, tinta);
        });
        texPaquetes.set(clave, new THREE.MeshBasicMaterial({ map: tx.tex, transparent: true, toneMapped: false }));
      }
      const g = new THREE.Group(); grupo.add(g);
      const tam = o.tam || 1;
      const giroG = new THREE.Group(); g.add(giroG);
      G.malla(new THREE.BoxGeometry(0.34, 0.235, 0.025), o.borde || "#cbd5e1", giroG, [0, 0, -0.014]);
      G.malla(new THREE.PlaneGeometry(0.34, 0.235), texPaquetes.get(clave), giroG, [0, 0, 0.0]);
      const A = porTiempo(o.de || [0, 1, 0]), B = porTiempo(o.a || [0, 1, 2]);
      const t0 = o.desde ?? 0, t1 = o.hasta ?? t0 + 1, arco = o.arco ?? 0.5;
      const pq = { grupo: g };
      const pos = (t) => {
        const u = trapecio((t - t0) / (t1 - t0), 0.3), a = A(Math.min(t, t0)), b = B(Math.max(t, t1));
        const a3 = a.length === 2 ? [a[0], 1, a[1]] : a, b3 = b.length === 2 ? [b[0], 1, b[1]] : b;
        return [lerp(a3[0], b3[0], u), lerp(a3[1], b3[1], u) + arco * 4 * u * (1 - u), lerp(a3[2], b3[2], u)];
      };
      pq.punto = (t) => pos(t);
      actualizables.push((t, camera) => {
        const k = popEscala(t, t0 - 0.12, o.queda ? null : t1 + (o.espera ?? 0.05), 0.25, 0.2);
        g.visible = k > 1e-4;
        if (!g.visible) return;
        const p = pos(t); g.position.set(p[0], p[1], p[2]);
        g.scale.setScalar(k * tam);
        G.mirarCamara(g, camera);
        giroG.rotation.z = 0.12 * Math.sin(TAU * 1.3 * (t - t0));
      });
      return pq;
    };

    // Cartel: letrero 3D plano, legible (texto con \n para varias líneas).
    G.cartel = (texto, o = {}) => {
      const W = o.ancho || 1.6, H = o.alto || 0.55, px = 512, py = Math.round(512 * H / W);
      let actual = String(texto);
      const fondo = o.fondo || "#f8fafc", tinta = o.tinta || "#0f172a";
      const tx = G.lienzoTexto(px, py, (ctx, w, h) => {
        ctx.fillStyle = fondo; rRect(ctx, 4, 4, w - 8, h - 8, Math.min(40, h * 0.2)); ctx.fill();
        if (o.borde) { ctx.strokeStyle = o.borde; ctx.lineWidth = 10; rRect(ctx, 9, 9, w - 18, h - 18, Math.min(36, h * 0.18)); ctx.stroke(); }
        const lineas = actual.split("\n");
        let tamF = o.tam || Math.min(h * 0.62 / lineas.length, 200);
        ctx.font = `800 ${tamF}px ${FUENTE}`;
        if (ctx.measureText) {
          const ancho = Math.max(...lineas.map((l) => ctx.measureText(l).width || 0));
          if (ancho > w * 0.86) { tamF *= (w * 0.86) / ancho; ctx.font = `800 ${tamF}px ${FUENTE}`; }
        }
        ctx.fillStyle = tinta; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        lineas.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lineas.length - 1) / 2) * tamF * 1.12 + tamF * 0.04));
      });
      const g = new THREE.Group(); const p0 = o.en || [0, 1.5, 0];
      g.position.set(p0[0], p0.length === 2 ? 1.5 : p0[1], p0.length === 2 ? p0[1] : p0[2]); grupo.add(g);
      const tabla = new THREE.Group(); g.add(tabla);
      G.malla(new THREE.BoxGeometry(W, H, 0.04), o.marco || "#cbd5e1", tabla, [0, 0, -0.022]);
      G.malla(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tx.tex, transparent: true, toneMapped: false }), tabla, [0, 0, 0.0]);
      const y0 = g.position.y;
      if (o.poste) G.malla(new THREE.CylinderGeometry(0.03, 0.03, y0 - H / 2, 8), "#64748b", g, [0, -(y0 - H / 2) / 2 - H / 2, -0.03]);
      if (o.mira !== "camara") g.rotation.y = rad(o.giro || 0);
      const c = { grupo: g, texto: (s) => { if (String(s) !== actual) { actual = String(s); tx.repinta(); } return c; } };
      let ap = o.aparece ?? null, des = o.desaparece ?? null;
      c.aparece = (t) => { ap = t; return c; }; c.desaparece = (t) => { des = t; return c; };
      actualizables.push((t, camera) => {
        const k = popEscala(t, ap, des); g.visible = k > 1e-4; g.scale.setScalar(Math.max(1e-4, k));
        if (o.mira === "camara") { G.mirarCamara(tabla, camera); }
      });
      return c;
    };

    // Piso que parece una página web (ventana del navegador): barra con puntos, dirección, bloques y botón.
    G.pagina = (o = {}) => {
      const AN = o.ancho || 10, LA = o.largo || 14;
      const px = 1024, py = Math.min(2048, Math.round(1024 * LA / AN));
      const C = Object.assign({ fondo: "#16213a", barra: "#24324f", linea: "#1d2a45", acento: "#7b86f0", texto: "#cbd5e1", boton: "#22c55e" }, o.colores || {});
      const tx = G.lienzoTexto(px, py, (c, w, h) => {
        const u = w / 1000;
        c.fillStyle = C.fondo; c.fillRect(0, 0, w, h);
        c.fillStyle = C.barra; c.fillRect(0, 0, w, 120 * u);
        ["#f05252", "#f5a524", "#22c55e"].forEach((k, i) => { c.fillStyle = k; c.beginPath(); c.arc((50 + i * 44) * u, 60 * u, 15 * u, 0, TAU); c.fill(); });
        c.fillStyle = "#0f172a"; rRect(c, 200 * u, 26 * u, 740 * u, 68 * u, 34 * u); c.fill();
        c.fillStyle = C.texto; c.font = `700 ${38 * u}px ${FUENTE}`; c.textBaseline = "middle"; c.fillText(o.url || "tienda.com/fila", 240 * u, 61 * u);
        if (o.titulo) { c.fillStyle = "#f1f5f9"; c.font = `800 ${64 * u}px ${FUENTE}`; c.fillText(o.titulo, 50 * u, 210 * u); }
        c.fillStyle = C.linea;
        for (let y = (o.titulo ? 290 : 170) * u; y < h - 40 * u; y += 110 * u) c.fillRect(30 * u, y, w - 60 * u, 4 * u);
        if (o.boton) {
          c.fillStyle = C.boton; rRect(c, w - 330 * u, 160 * u, 280 * u, 90 * u, 22 * u); c.fill();
          c.fillStyle = "#052e16"; c.font = `800 ${44 * u}px ${FUENTE}`; c.textAlign = "center"; c.fillText(o.boton, w - 190 * u, 206 * u); c.textAlign = "left";
        }
      });
      const piso = new THREE.Mesh(new THREE.PlaneGeometry(AN, LA), new THREE.MeshBasicMaterial({ map: tx.tex }));
      piso.rotation.x = -Math.PI / 2; const c0 = o.centro || [0, 0];
      const g = new THREE.Group(); g.position.set(c0[0], 0, c0[1]); g.rotation.y = rad(o.giro || 0); grupo.add(g);
      g.add(piso); piso.renderOrder = -3;
      if (o.marco !== false) G.malla(new THREE.BoxGeometry(AN + 0.4, 0.24, LA + 0.4), o.marco || "#3d4ab8", g, [0, -0.125, 0]);
      return { grupo: g, malla: piso, textura: tx };
    };

    // ---------- Utilería de interiores (v1.1) ----------
    // Lienzo que se redibuja cada cuadro: dibuja(ctx, w, h, t).
    G.lienzoVivo = (w, h, dibuja) => {
      const cv = lienzo(w, h), ctx = cv.getContext("2d");
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      let ult = null;
      actualizables.push((t) => { if (t === ult) return; ult = t; if (ctx && ctx.clearRect) { ctx.clearRect(0, 0, w, h); dibuja(ctx, w, h, t); } tex.needsUpdate = true; });
      return { cv, ctx, tex };
    };
    const enMundo = (g, x, y, z) => { g.updateWorldMatrix(true, false); const v = new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld); return [v.x, v.y, v.z]; };
    // Plano con imagen dibujada por tiempo (ventana, pantalla, pizarra). Mira a +z local antes de girar.
    const plano = (o, wpx, hpx, dibuja, padre) => {
      const lv = G.lienzoVivo(wpx, hpx, dibuja);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(o.ancho, o.alto), new THREE.MeshBasicMaterial({ map: lv.tex, toneMapped: false }));
      (padre || grupo).add(m); return m;
    };
    // Sala: piso + pared del fondo + paredes laterales (el lado de la cámara, +z, queda abierto).
    G.sala = (o = {}) => {
      const c0 = o.centro || [0, 0], AN = o.ancho || 8, FO = o.fondo || 6, AL = o.alto || 2.8;
      const g = new THREE.Group(); g.position.set(c0[0], 0, c0[1]); g.rotation.y = rad(o.giro || 0); grupo.add(g);
      G.malla(new THREE.BoxGeometry(AN, 0.06, FO), o.piso || "#3b2f2a", g, [0, -0.03, 0]);
      if (o.vetas !== false) for (let i = 1; i < 10; i++) G.malla(new THREE.BoxGeometry(AN, 0.004, 0.02), o.veta || "#2e2420", g, [0, 0.002, -FO / 2 + i * FO / 10]);
      const pared = o.pared || "#cbd5c0", zoc = o.zocalo || "#475569";
      G.malla(new THREE.BoxGeometry(AN, AL, 0.12), pared, g, [0, AL / 2, -FO / 2]);
      G.malla(new THREE.BoxGeometry(AN, 0.14, 0.14), zoc, g, [0, 0.07, -FO / 2 + 0.04]);
      if (o.izquierda !== false) { G.malla(new THREE.BoxGeometry(0.12, AL, FO), o.paredLado || pared, g, [-AN / 2, AL / 2, 0]); G.malla(new THREE.BoxGeometry(0.14, 0.14, FO), zoc, g, [-AN / 2 + 0.04, 0.07, 0]); }
      if (o.derecha) { G.malla(new THREE.BoxGeometry(0.12, AL, FO), o.paredLado || pared, g, [AN / 2, AL / 2, 0]); }
      if (o.techo) G.malla(new THREE.BoxGeometry(AN, 0.08, FO), o.techo, g, [0, AL, 0]);
      if (o.lampara) { const L = o.lampara; G.malla(new THREE.CylinderGeometry(0.28, 0.4, 0.22, 20, 1, true), "#334155", g, [L[0], AL - 0.6, L[1]]); G.malla(new THREE.SphereGeometry(0.12, 12, 10), G.plano("#fde68a"), g, [L[0], AL - 0.68, L[1]]); G.malla(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6), "#475569", g, [L[0], AL - 0.25, L[1]]); }
      const sala = { grupo: g, ventanas: [] };
      (o.ventanas || (o.ventana ? [o.ventana] : [])).forEach((v) => sala.ventanas.push(G.ventana(Object.assign({ en: enMundo(g, v.x ?? 0, v.y ?? 1.6, -FO / 2 + 0.07), giro: o.giro || 0 }, v))));
      return sala;
    };
    // Ventana con marco: dibujo(ctx, w, h, t) o color.
    G.ventana = (o = {}) => {
      const g = new THREE.Group(); const p = o.en || [0, 1.6, 0]; g.position.set(p[0], p[1], p[2]); g.rotation.y = rad(o.giro || 0); grupo.add(g);
      const AN = o.ancho || 1.6, AL = o.alto || 1.0, mc = o.marco || "#e2e8f0";
      const m = plano({ ancho: AN, alto: AL }, o.px || 512, Math.round((o.px || 512) * AL / AN), o.dibujo || ((c, w, h) => { c.fillStyle = "#7ea6c9"; c.fillRect(0, 0, w, h); }), g);
      m.position.z = 0.005;
      const b = 0.06;
      G.malla(new THREE.BoxGeometry(AN + 2 * b, b, 0.06), mc, g, [0, AL / 2 + b / 2, 0.02]); G.malla(new THREE.BoxGeometry(AN + 2 * b, b, 0.06), mc, g, [0, -AL / 2 - b / 2, 0.02]);
      G.malla(new THREE.BoxGeometry(b, AL, 0.06), mc, g, [-AN / 2 - b / 2, 0, 0.02]); G.malla(new THREE.BoxGeometry(b, AL, 0.06), mc, g, [AN / 2 + b / 2, 0, 0.02]);
      if (o.cruz !== false) { G.malla(new THREE.BoxGeometry(0.03, AL, 0.03), mc, g, [0, 0, 0.03]); G.malla(new THREE.BoxGeometry(AN, 0.03, 0.03), mc, g, [0, 0, 0.03]); }
      return { grupo: g, malla: m };
    };
    // Pizarra (blanca o verde) con dibujo por tiempo. punto(u, v): u,v ∈ [0,1] desde la esquina superior izquierda → mundo.
    G.pizarra = (o = {}) => {
      const g = new THREE.Group(); const p = o.en || [0, 1.5, 0]; g.position.set(p[0], p[1], p[2]); g.rotation.y = rad(o.giro || 0); grupo.add(g);
      const AN = o.ancho || 2.2, AL = o.alto || 1.1;
      G.malla(new THREE.BoxGeometry(AN + 0.1, AL + 0.1, 0.04), o.marco || "#94a3b8", g, [0, 0, -0.02]);
      const fondo = o.fondo || "#f8fafc";
      const m = plano({ ancho: AN, alto: AL }, o.px || 1024, Math.round((o.px || 1024) * AL / AN), (c, w, h, t) => { c.fillStyle = fondo; c.fillRect(0, 0, w, h); if (o.dibujo) o.dibujo(c, w, h, t); }, g);
      m.position.z = 0.003;
      G.malla(new THREE.BoxGeometry(AN * 0.9, 0.04, 0.08), o.marco || "#94a3b8", g, [0, -AL / 2 - 0.05, 0.04]);
      return { grupo: g, malla: m, ancho: AN, alto: AL, punto: (u, v) => enMundo(g, (u - 0.5) * AN, (0.5 - v) * AL, 0.06) };
    };
    // Mesa y silla.
    G.mesa = (o = {}) => {
      const g = new THREE.Group(); const p = o.en || [0, 0]; g.position.set(p[0], 0, p[1]); g.rotation.y = rad(o.giro || 0); grupo.add(g);
      const LA = o.largo || 1.6, AN = o.ancho || 0.9, AL = o.alto || 0.74, c = o.color || "#7c5a3c";
      G.malla(new THREE.BoxGeometry(AN, 0.05, LA), c, g, [0, AL - 0.025, 0]);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => G.malla(new THREE.BoxGeometry(0.06, AL - 0.05, 0.06), o.patas || "#4b3626", g, [sx * (AN / 2 - 0.08), (AL - 0.05) / 2, sz * (LA / 2 - 0.08)]));
      return { grupo: g, alto: AL, punto: (x, z) => enMundo(g, x, AL, z) };
    };
    G.silla = (o = {}) => {
      const g = new THREE.Group(); const p = o.en || [0, 0]; g.position.set(p[0], 0, p[1]); g.rotation.y = rad(o.giro || 0); grupo.add(g);
      const AL = o.alto || 0.44, c = o.color || "#334155";
      G.malla(new THREE.BoxGeometry(0.46, 0.06, 0.44), c, g, [0, AL - 0.03, -0.02]);
      const resp = G.malla(new THREE.BoxGeometry(0.46, 0.5, 0.06), c, g, [0, AL + 0.27, -0.26]); resp.rotation.x = -(o.reclina || 0) * 0.5 - 0.06;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => G.malla(new THREE.BoxGeometry(0.04, AL - 0.06, 0.04), o.patas || "#1f2937", g, [sx * 0.19, (AL - 0.06) / 2, -0.02 + sz * 0.18]));
      return { grupo: g };
    };
    // Tablero (consola de nave / DSKY): panel inclinado con teclas 3D que se hunden e iluminan, pantalla dibujable y luces.
    // teclas: [[id, texto], ...] en filas de «columnas»; tecla(id) → punto del mundo sobre la tecla; pulsa(id, t, dur).
    G.tablero = (o = {}) => {
      const g = new THREE.Group(); const p = o.en || [0, 0.9, 0]; g.position.set(p[0], p[1], p[2]); g.rotation.y = rad(o.giro || 0); grupo.add(g);
      const inc = new THREE.Group(); inc.rotation.x = -rad(o.inclina ?? 35); g.add(inc);
      const AN = o.ancho || 1.6, AL = o.alto || 0.7;
      G.malla(new THREE.BoxGeometry(AN, AL, 0.06), o.color || "#5b6270", inc, [0, AL / 2, -0.03]);
      if (o.base !== false) G.malla(new THREE.BoxGeometry(AN, p[1], 0.5), o.colorBase || "#4b5563", g, [0, -p[1] / 2, -0.2]);
      // interruptores decorativos
      const nI = o.interruptores ?? 24, rr = azar(o.semilla || 17);
      const luces = [];
      for (let i = 0; i < nI; i++) {
        const lado = i % 2 ? 1 : -1, col = Math.floor(i / 2) % 4, fil = Math.floor(i / 8);
        const x = lado * (AN * 0.28 + col * AN * 0.05), y = AL * (0.25 + fil * 0.22);
        G.malla(new THREE.BoxGeometry(0.035, 0.035, 0.03), "#d1d5db", inc, [x, y, 0.015]);
        if (i % 3 === 0) { const l = G.malla(new THREE.SphereGeometry(0.016, 8, 6), G.plano(rr() > 0.5 ? "#f5a524" : "#22c55e"), inc, [x, y + 0.045, 0.012]); luces.push({ m: l, f: 0.5 + rr() * 2, ph: rr() * 6 }); }
      }
      [-1, 1].forEach((sx) => { G.malla(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 20), "#e5e7eb", inc, [sx * AN * 0.3, AL * 0.86, 0.01], [Math.PI / 2, 0, 0]); });
      // pantalla
      const PW = o.pantalla?.ancho || 0.42, PH = o.pantalla?.alto || 0.2;
      const pant = plano({ ancho: PW, alto: PH }, 512, Math.round(512 * PH / PW), (c, w, h, t) => { c.fillStyle = "#0a0f0a"; c.fillRect(0, 0, w, h); if (o.pantalla?.dibujo) o.pantalla.dibujo(c, w, h, t); }, inc);
      pant.position.set(0, AL * 0.74, 0.012);
      G.malla(new THREE.BoxGeometry(PW + 0.04, PH + 0.04, 0.02), "#1f2937", inc, [0, AL * 0.74, -0.008]);
      // teclas
      const teclas = {}, cols = o.columnas || 5, lista = o.teclas || [];
      const KW = o.tecla || 0.07, KG = 0.014, matT = new Map();
      const textura = (txt, color) => {
        const k = txt + color; if (matT.has(k)) return matT.get(k);
        const tx = G.lienzoTexto(128, 96, (c, w, h) => { c.fillStyle = color; rRect(c, 2, 2, w - 4, h - 4, 14); c.fill(); c.fillStyle = "#0f172a"; c.font = `800 ${txt.length > 3 ? 30 : 40}px ${FUENTE}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(txt, w / 2, h / 2 + 2); });
        const m = new THREE.MeshBasicMaterial({ map: tx.tex, toneMapped: false }); matT.set(k, m); return m;
      };
      const filas = Math.ceil(lista.length / cols);
      lista.forEach(([id, txt, color], i) => {
        const cI = i % cols, fI = Math.floor(i / cols);
        const x = (cI - (cols - 1) / 2) * (KW + KG), y = AL * 0.42 - fI * (KW * 0.75 + KG);
        const kg = new THREE.Group(); kg.position.set(x, y, 0.012); inc.add(kg);
        G.malla(new THREE.BoxGeometry(KW, KW * 0.75, 0.024), "#cbd5e1", kg, [0, 0, 0]);
        const cara = new THREE.Mesh(new THREE.PlaneGeometry(KW * 0.94, KW * 0.7), textura(txt, color || "#e2e8f0")); cara.position.z = 0.0125; kg.add(cara);
        const lit = textura(txt, "#ffe14d");
        teclas[id] = { g: kg, cara, normal: cara.material, lit, pulsos: [], x, y };
      });
      const tb = { grupo: g, teclas };
      tb.tecla = (id) => { const k = teclas[id]; return enMundo(inc, k.x, k.y, 0.03); };
      tb.punto = (n = "teclado") => n === "pantalla" ? enMundo(inc, 0, AL * 0.74, 0.02) : enMundo(inc, 0, AL * 0.42 - (filas - 1) * (KW * 0.75 + KG) / 2, 0.03);
      tb.pulsa = (id, t, dur = 0.25, ilumina = true) => { teclas[id].pulsos.push([t, dur, ilumina]); return tb; };
      // teclas que se hunden al ritmo de alguien que teclea (lista de [desde, hasta, ritmo])
      tb.tecleo = (desde, hasta, ritmo = 5, semilla = 3) => { (tb._tecleos = tb._tecleos || []).push([desde, hasta, ritmo, semilla]); return tb; };
      tb.colorPanel = null;
      actualizables.push((t) => {
        luces.forEach((l) => { l.m.visible = Math.sin(t * l.f + l.ph) > -0.3; });
        const ids = Object.keys(teclas);
        ids.forEach((id, i) => {
          const k = teclas[id]; let h = 0, on = false;
          k.pulsos.forEach(([t0, d, il]) => { if (t >= t0 && t < t0 + d) { h = 1; if (il) on = true; } if (il && t >= t0 + d && t < t0 + d + (o.luzDura ?? 0.8)) on = true; });
          (tb._tecleos || []).forEach(([a, b, f, se]) => { if (t >= a && t < b) { const ph = Math.floor((t - a) * f); if ((ph * 7 + se * 3) % ids.length === i) h = 1; } });
          k.g.position.z = 0.012 - 0.008 * h;
          k.cara.material = on ? k.lit : k.normal;
        });
      });
      return tb;
    };
    // Monitor de los 60 (caja con pantalla verde dibujable).
    G.monitor = (o = {}) => {
      const g = new THREE.Group(); const p = o.en || [0, 0.9, 0]; g.position.set(p[0], p[1], p[2]); g.rotation.y = rad(o.giro || 0); grupo.add(g);
      const AN = o.ancho || 0.44, AL = o.alto || 0.34;
      G.malla(new THREE.BoxGeometry(AN, AL, 0.34), o.color || "#9ca3af", g, [0, AL / 2, -0.17]);
      const pant = plano({ ancho: AN * 0.8, alto: AL * 0.72 }, 256, 200, (c, w, h, t) => { c.fillStyle = "#04160a"; c.fillRect(0, 0, w, h); if (o.dibujo) o.dibujo(c, w, h, t); }, g);
      pant.position.set(0, AL / 2, 0.004);
      return { grupo: g, punto: () => enMundo(g, 0, AL / 2, 0.02) };
    };
    G.actualizables = actualizables;
    G.preparar = preparar;
    return G;
  }

  // ======================================================================================================
  // Persona
  // ======================================================================================================
  function crearPersona(G, o, indice) {
    const THREE = G.THREE;
    const r = azar(1000 + (o.semilla ?? indice) * 7919);
    const col = (v, lista, def) => (v === undefined ? lista[def % lista.length] : typeof v === "number" ? lista[v % lista.length] : v);
    const piel = col(o.piel, PIELES, Math.floor(r() * 997)), pelo = col(o.pelo, PELOS, Math.floor(r() * 991));
    const ropa = col(o.ropa, ROPAS, Math.floor(r() * 983)), pantalon = col(o.pantalon, PANTALONES, Math.floor(r() * 977));
    const zapatos = o.zapatos || "#111827", tinta = o.ojos || "#1c2238";
    const peinado = o.peinado || PEINADOS[Math.floor(r() * 9973) % 5];
    const alt = o.altura ?? 0.92 + 0.16 * r();
    const Y0 = o.y ?? 0;   // v1.2: altura del piso donde está (gradas de un estadio)
    const desfase = o.desfase ?? r() * 40;
    const azares = [r(), r(), r(), r()];
    const cara = (o.cara ?? G.cara);
    const det = o.detalle || G.detalle;
    const P = G.pools(det);
    const Y = new THREE.Vector3(0, 1, 0);
    const XD = new THREE.Vector3(1, 0, 0), qD = new THREE.Quaternion();

    // Reserva de instancias (colores fijos por persona).
    const S = {};
    const res = (k, color, n = 1) => { S[k] = n === 1 ? P[k].reservar(color) : Array.from({ length: n }, () => P[k].reservar(color)); };
    res("cabeza", piel); res("cuello", piel); res("pecho", ropa); res("cadera", pantalon);
    res("muslo", pantalon, 2); res("pierna", pantalon, 2); res("zapato", zapatos, 2);
    res("hombro", ropa, 2); res("brazo", ropa, 2); res("mano", piel, 2);
    S.antebrazo = [P.antebrazo.reservar(o.manga === "corta" ? piel : ropa), P.antebrazo.reservar(o.manga === "corta" ? piel : ropa)];
    res("ojo", tinta, 2); res("ceja", pelo, 2); res("sonrisa", "#7a2e2e"); res("bocaO", "#5b1f24");
    if (det !== "lejos") res("mejilla", "#f08a7e");
    const pelos = peinado === "rapado" ? ["pelo-rapado"] : ["pelo-capa"].concat(peinado === "corto" ? ["pelo-corto"] : peinado === "largo" ? ["pelo-largo"] : peinado === "rizado" ? ["pelo-rizado"] : peinado === "mono" ? ["pelo-mono"] : []);
    pelos.forEach((k) => res(k, pelo));
    if (o.lentes) res("lentes", o.colorLentes || "#1f2937");
    if (o.chaleco) { res("chaleco", o.chaleco); res("franja", o.franja || "#e5e7eb"); }
    res("celular", "#111827"); res("pantallaCel", o.colorCelular || "#a5b4fc"); res("pulgar", piel);
    if (o.reloj !== false) { res("reloj", "#334155"); res("relojCara", "#cbd5e1"); }
    if (o.sombra !== false) res("sombra", "#ffffff");
    // v1.4 · manos de verdad: por mano 1 palma, 22 bolas (muñeca, eminencias, nudillos, articulaciones, yemas),
    // 15 falanges, 5 uñas claras y el puño de la manga (mismo tono de piel y de ropa que la persona).
    const DET = o.manos === "detalle";
    if (DET) {
      const cU = new THREE.Color(piel).lerp(new THREE.Color("#fde7e2"), 0.34), cP = new THREE.Color(ropa).multiplyScalar(0.84);
      res("hPalma", piel, 2); res("hBola", piel, 44); res("hSeg", piel, 30); res("hUna", "#" + cU.getHexString(), 10);
      res("hPuno", "#" + cP.getHexString(), 2);
    }

    const persona = { indice, opciones: o, altura: alt, piel, ropa, pelo, peinado };

    // ---------- Movimiento: posición, rumbo y caminar ----------
    let en0 = o.en || [0, 0], giro0 = rad(o.giro || 0);
    const caminos = [], giros = [];
    let tabla = null;
    const DT = 1 / 60;
    persona.en = (x, z) => { en0 = Array.isArray(x) ? x : [x, z]; tabla = null; return persona; };
    persona.giro = (g) => { giro0 = rad(g); tabla = null; return persona; };
    // gira(grados | [x,z] | persona/caja, t, dur): se voltea en el instante t (en ~dur s).
    persona.gira = (g, t, dur = 0.5) => { giros.push({ g, t, dur }); tabla = null; return persona; };
    // camino(fn(t) → [x,z] | claves [[t,x,z],...], desde, hasta): se mueve, mira hacia donde avanza y camina.
    persona.camino = (fn, desde, hasta) => {
      if (Array.isArray(fn)) { desde = desde ?? fn[0][0]; hasta = hasta ?? fn[fn.length - 1][0]; fn = porTiempo(fn); }
      caminos.push({ fn, desde: desde ?? 0, hasta: hasta ?? (G.op.duracion || 60) }); tabla = null; return persona;
    };
    // ir(destino [x,z] | lista de puntos [[x,z],...], desde, hasta): en línea (o quebrada) con velocidad pareja.
    persona.ir = (dest, desde, hasta, opc = {}) => {
      const puntos = Array.isArray(dest[0]) ? dest : [dest];
      caminos.push({ ir: puntos, desde, hasta, acel: opc.acel ?? 0.25 }); tabla = null; return persona;
    };
    const resolver = () => {
      caminos.sort((a, b) => a.desde - b.desde);
      let ult = en0;
      for (const c of caminos) {
        if (c.ir) {
          const pts = [ult.slice()].concat(c.ir.map((p) => p.slice()));
          const lens = [0];
          for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
          const L = lens[lens.length - 1] || 1e-6, a = c.acel * Math.min(1, 2.5 / Math.max(L, 0.01));
          c.fn = (t) => {
            const s = trapecio((t - c.desde) / Math.max(1e-6, c.hasta - c.desde), clamp(a, 0.08, 0.5)) * L;
            let i = 1; while (i < pts.length - 1 && lens[i] < s) i++;
            const u = (s - lens[i - 1]) / Math.max(1e-9, lens[i] - lens[i - 1]);
            return [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)];
          };
        }
        ult = c.fn(c.hasta);
      }
    };
    const posBruta = (t) => {
      let p = en0;
      for (const c of caminos) {
        if (t < c.desde) break;
        p = t <= c.hasta ? c.fn(t) : c.fn(c.hasta);
      }
      return p;
    };
    const construir = () => {
      resolver();
      if (!caminos.length && !giros.length) { tabla = { vacia: true }; return; }
      let t0 = Infinity, t1 = -Infinity;
      caminos.forEach((c) => { t0 = Math.min(t0, c.desde); t1 = Math.max(t1, c.hasta); });
      giros.forEach((g) => { t0 = Math.min(t0, g.t); t1 = Math.max(t1, g.t + g.dur); });
      t0 -= 0.25; t1 += 2;
      const N = Math.ceil((t1 - t0) / DT) + 1;
      const D = new Float64Array(N), H = new Float64Array(N);
      const ev = giros.slice().sort((a, b) => a.t - b.t);
      let [px, pz] = posBruta(t0), d = 0, h = giro0, hs = giro0, obj = giro0, rate = 6, k = 0;
      for (let i = 0; i < N; i++) {
        const t = t0 + i * DT, [x, z] = posBruta(t);
        const dd = Math.hypot(x - px, z - pz);
        d += dd;
        while (k < ev.length && ev[k].t <= t) {
          const e = ev[k++];
          const g = typeof e.g === "number" ? rad(e.g) : (() => { const q = Array.isArray(e.g) ? e.g : e.g.punto ? e.g.punto(t) : posOf(e.g, t); const qq = q.length === 3 ? [q[0], q[2]] : q; return Math.atan2(qq[0] - x, qq[1] - z); })();
          obj = g; rate = clamp(Math.abs(((g - h + Math.PI) % TAU + TAU) % TAU - Math.PI) / Math.max(0.1, e.dur), 1.5, 12);
        }
        if (dd / DT > 0.06) { obj = Math.atan2(x - px, z - pz); rate = 7; }
        let dif = obj - h; dif = ((dif + Math.PI) % TAU + TAU) % TAU - Math.PI;
        h += clamp(dif, -rate * DT, rate * DT);
        hs += (h - hs) * (1 - Math.exp(-DT / 0.09));
        D[i] = d; H[i] = hs; px = x; pz = z;
      }
      tabla = { t0, N, D, H };
    };
    const posOf = (otro, t) => (otro.posicion ? otro.posicion(t) : [0, 0]);
    const muestra = (A, t) => {
      const f = clamp((t - tabla.t0) / DT, 0, tabla.N - 1), i = Math.floor(f), u = f - i;
      return i + 1 < tabla.N ? lerp(A[i], A[i + 1], u) : A[i];
    };
    persona.posicion = (t) => posBruta(t);
    persona.rumbo = (t) => { if (!tabla) construir(); return tabla.vacia ? giro0 : muestra(tabla.H, t); };
    persona.distancia = (t) => { if (!tabla) construir(); return tabla.vacia ? 0 : muestra(tabla.D, t); };
    const velocidad = (t) => {
      if (!tabla) construir();
      if (tabla.vacia) return 0;
      return Math.abs(muestra(tabla.D, t + 0.1) - muestra(tabla.D, t - 0.1)) / 0.2;
    };
    persona.velocidad = velocidad;

    // Aparecer / desaparecer con rebote de escala.
    let ap = null, des = null, dAp = 0.45, dDes = 0.3;
    persona.aparece = (t, d = 0.45) => { ap = t; dAp = d; return persona; };
    persona.desaparece = (t, d = 0.3) => { des = t; dDes = d; return persona; };
    const escala = (t) => popEscala(t, ap, des, dAp, dDes);

    // ---------- Línea de tiempo de estados ----------
    const segs = [];
    let lista = null;
    persona.estado = (nombre, desde = -1e6, hasta = Infinity, opc = {}) => {
      nombre = ALIAS[nombre] || nombre;
      if (!ESTADOS[nombre]) throw new Error("Gente3D: no hay estado «" + nombre + "» (hay: " + Object.keys(ESTADOS).join(", ") + ")");
      segs.push({ nombre, desde, hasta, trans: opc.trans ?? TRANS[nombre] ?? 0.5, opc });
      lista = null; return persona;
    };
    persona.pose = persona.estado;
    persona.limpiar = () => { segs.length = 0; lista = null; return persona; };   // borra los estados puestos
    persona.señala = (objetivo, desde, hasta, opc = {}) => persona.estado("señala", desde, hasta, Object.assign({ objetivo }, opc));
    const armar = () => {
      const s = segs.slice().sort((a, b) => a.desde - b.desde);
      const out = [{ nombre: "respira", desde: -1e9, hasta: s.length ? s[0].desde : Infinity, trans: 0, opc: {} }];
      s.forEach((g, i) => {
        const fin = Math.min(g.hasta, s[i + 1] ? s[i + 1].desde : Infinity);
        out.push(Object.assign({}, g, { hasta: fin }));
        if (s[i + 1] ? fin < s[i + 1].desde : fin < Infinity) out.push({ nombre: "respira", desde: fin, hasta: s[i + 1] ? s[i + 1].desde : Infinity, trans: 0.7, opc: {} });
      });
      lista = out;
    };

    // Marco del torso (puro, sin escena) para pasar manos {t:[...]} al marco de la persona.
    const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), eA = new THREE.Euler(), vA = new THREE.Vector3();
    const marcoTorso = (q, out) => {
      out.makeRotationFromEuler(eA.set(0, q.cadG, q.cadL, "YXZ")).setPosition(q.cad[0], CAD_Y + q.cad[1], q.cad[2]);
      mB.makeRotationFromEuler(eA.set(q.tI, q.tG, q.tL, "YXZ"));
      return out.multiply(mB);
    };
    const aLocal = (mano, q) => {
      if (mano.l) return mano.l.slice();
      marcoTorso(q, mA); vA.set(mano.t[0], mano.t[1], mano.t[2]).applyMatrix4(mA); return [vA.x, vA.y, vA.z];
    };
    // Mundo (marco del grupo) → marco de la persona en t (unidades de altura 1).
    const aPersona = (w, t) => {
      const [x, z] = posBruta(t), h = persona.rumbo(t), c = Math.cos(h), s = Math.sin(h);
      const w3 = w.length === 2 ? [w[0], Y0 + 0.9 * alt, w[1]] : w;
      const dx = w3[0] - x, dz = w3[2] - z;
      return [(dx * c - dz * s) / alt, (w3[1] - Y0) / alt, (dx * s + dz * c) / alt];
    };
    const crudo = (g, t, extra) => {
      const s = t - g.desde, d = g.hasta - g.desde;
      const c = { t, v: t + desfase, s, d: isFinite(d) ? d : 1e6, r: azares, alt, opc: g.opc || {}, tramo: (a, b) => tramo(s, a, b), fase: 0 };
      if (g.nombre === "señala") {
        const ob = porTiempo(g.opc.objetivo);
        const w = ob(t);
        if (w) c.objetivo = aPersona(w, t);
        if (g.lado === undefined) { const w0 = ob(Math.max(g.desde, -1e5)); const l0 = w0 ? aPersona(w0, Math.max(g.desde, -1e5)) : [0, 0, 1]; g.lado = g.opc.mano === "I" ? 1 : g.opc.mano === "D" ? -1 : (Math.atan2(l0[0], l0[2]) >= 0 ? 1 : -1); }
        c.lado = g.lado;
      }
      if (g.opc && g.opc.teclado) { const w = porTiempo(g.opc.teclado)(t); if (w) c.k = aPersona(w, t); }
      if (g.opc && g.opc.punto && g.nombre !== "señala") { const w = porTiempo(g.opc.punto)(t); if (w) c.p = aPersona(w, t); }
      if (g.nombre === "camina") c.fase = TAU * (c.v * (g.opc.vel ?? 1.1)) / (4 * PASO * alt);
      if (extra) Object.assign(c, extra);
      const q = Object.assign({}, BASE, ESTADOS.respira(c), ESTADOS[g.nombre](c));
      q.tG += 0.02 * Math.sin(c.v * 0.37); q.cY += 0.03 * Math.sin(c.v * 0.23 + 0.5);    // vida: nunca del todo quieta
      q.mI = aLocal(q.manoI, q); q.mD = aLocal(q.manoD, q);
      return q;
    };
    const mezcla = (a, b, w) => {
      const out = {};
      for (const k in b) {
        const x = a[k], y = b[k];
        if (typeof y === "number") out[k] = lerp(x, y, w);
        else if (Array.isArray(y)) out[k] = lerpN(x, y, w);
        else out[k] = y;
      }
      return out;
    };
    const evalua = (k, t, prof = 0) => {
      const g = lista[k], cur = crudo(g, t);
      const w = k === 0 || g.trans <= 0 ? 1 : suave((t - g.desde) / g.trans);
      if (w >= 1 || prof > 8) return cur;
      return mezcla(evalua(k - 1, t, prof + 1), cur, w);
    };
    const PIERNAS = ["pieI", "pieD", "cad", "cadG", "cadL"], BRAZOS = ["mI", "mD", "codoI", "codoD"];
    persona.estadoEn = (t) => {
      if (!lista) armar();
      let k = 0;
      while (k + 1 < lista.length && t >= lista[k + 1].desde) k++;
      let q = evalua(k, t);
      // Capa de caminar (si se está moviendo por un camino): piernas siempre; brazos solo si el estado los deja libres.
      const v = velocidad(t);
      const w = suave(v / 0.35);
      if (w > 0.001) {
        const W = Object.assign({}, BASE, caminar(TAU * persona.distancia(t) / (4 * PASO * alt), clamp(v / 0.9, 0.35, 1.1)));
        W.mI = aLocal(W.manoI, W); W.mD = aLocal(W.manoD, W);
        q = Object.assign({}, q);
        PIERNAS.forEach((key) => { q[key] = Array.isArray(q[key]) ? lerpN(q[key], W[key], w) : lerp(q[key], W[key], w); });
        q.tI += 0.05 * w; q.tG = lerp(q.tG, W.tG, w);
        const wb = w * q.brazosLibres;
        BRAZOS.forEach((key) => { q[key] = lerpN(q[key], W[key], wb); });
      }
      if (o.sentado) {
        const asiento = typeof o.sentado === "number" ? o.sentado : 0.6;
        q.cad = [q.cad[0], q.cad[1] + asiento - CAD_Y, q.cad[2]];
        if (asiento <= 0.54) { q.pieI = [0.12, 0, 0.36, 0]; q.pieD = [-0.12, 0, 0.37, 0]; q.rodilla = [0, 1, 0.6]; }   // silla normal: pies en el piso
        else { q.pieI = [0.11, 0.2, 0.2, 0]; q.pieD = [-0.11, 0.2, 0.2, 0]; q.rodilla = [0, 0.4, 1]; }
        if (o.reclina) { q.tI -= 0.28 * o.reclina; q.cX += 0.12 * o.reclina; }
        // las manos {l:} del estado ya están en el marco de la persona; las {t:} siguen al torso bajado.
        const dy = asiento - CAD_Y;
        if (q.manoI && q.manoI.t) q.mI = [q.mI[0], q.mI[1] + dy, q.mI[2]];
        if (q.manoD && q.manoD.t) q.mD = [q.mD[0], q.mD[1] + dy, q.mD[2]];
      }
      return q;
    };

    // Parpadeo determinista: cada 2,4–5 s (azar con semilla), dura 0,16 s.
    const parpados = [];
    { const rr = azar(101 + indice * 7 + (o.semilla || 0)); let tt = 0.4 + rr() * 2.5; while (tt < 900) { parpados.push(tt); tt += 2.4 + rr() * 2.6; } }
    const parpadeo = (t) => {
      let lo = 0, hi = parpados.length - 1;
      if (t < parpados[0]) return 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (parpados[mid] <= t) lo = mid; else hi = mid - 1; }
      const u = (t - parpados[lo]) / 0.16;
      return u < 0 || u > 1 ? 1 : 1 - 0.92 * Math.sin(u * Math.PI);
    };

    // ---------- Globo sobre la cabeza ----------
    const globos = [];
    let sprite = null;
    persona.globo = (icono, desde, hasta = Infinity, opc = {}) => {
      globos.push({ icono: String(icono), desde, hasta, tam: opc.tam || 1 });
      if (!sprite) { sprite = new THREE.Sprite(G.texGlobo(String(icono))); sprite.renderOrder = 5; sprite.visible = false; G.grupo.add(sprite); }
      return persona;
    };

    // Pantalla del celular dibujable (si no, un color plano instanciado).
    let celCanvas = null;
    persona.pantallaCelular = (fn, res = 128) => {   // v1.2: res = ancho del lienzo en px (alto = 2·res)
      if (typeof fn !== "function") { P.pantallaCel.colores[S.pantallaCel] = fn; P.pantallaCel.sucio = true; return persona; }
      const cv = lienzo(res, res * 2), ctx = cv.getContext("2d");
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.062, 0.126), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      m.matrixAutoUpdate = false; m.visible = false; G.grupo.add(m);
      celCanvas = { fn, ctx, tex, m, res };
      return persona;
    };

    // v1.4 · el pulgar de la mano que sostiene el celular toca la pantalla: lista de [t, u, v] (u, v ∈ 0–1 desde arriba a
    // la izquierda de la pantalla, como el lienzo de pantallaCelular). Llega 0,45 s antes, baja en t, sube y vuelve al reposo.
    let toques = [], reposoT = [1.05, 0.45];
    persona.pulgarToca = (lista, opc = {}) => {
      toques = lista.map((x) => (Array.isArray(x) ? { en: x[0], u: x[1], v: x[2] } : x)).sort((a, b) => a.en - b.en);
      if (opc.reposo) reposoT = opc.reposo; return persona; };
    persona.toqueEn = (t) => {
      let u = reposoT[0], v = reposoT[1], cerca = 0, pr = 0;
      for (const k of toques) {
        const a = tramo(t, k.en - 0.45, k.en - 0.14) * (1 - tramo(t, k.en + 0.32, k.en + 0.75));
        u = lerp(u, k.u, a); v = lerp(v, k.v, a); cerca = Math.max(cerca, a);
        pr = Math.max(pr, tramo(t, k.en - 0.14, k.en - 0.01) * (1 - tramo(t, k.en + 0.09, k.en + 0.26)));
      }
      return { u, v, alza: lerp(lerp(0.006, 0.014, cerca), 0, pr), presiona: pr };
    };

    // ---------- Aplicar el estado a las instancias ----------
    const R = new THREE.Matrix4(), Lp = new THREE.Matrix4(), Lt = new THREE.Matrix4(), Lh = new THREE.Matrix4();
    const WH = new THREE.Matrix4(), tmp = new THREE.Matrix4(), tmp2 = new THREE.Matrix4(), Mw = new THREE.Matrix4();
    const qY = new THREE.Quaternion(), qB = new THREE.Quaternion(), vP = new THREE.Vector3(), vS = new THREE.Vector3(), vD = new THREE.Vector3();
    const e1 = new THREE.Euler();
    const pon = (k, i, local) => { Mw.multiplyMatrices(R, local); P[k].pon(i, Mw); };
    const ponW = (k, i, world) => P[k].pon(i, world);
    const nada = (k, i) => { if (i !== undefined) P[k].nada(i); };
    const hueso = (a, b, out) => {
      vD.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      qB.setFromUnitVectors(Y, vD.normalize());
      return out.compose(vP.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), qB, vS.set(1, 1, 1));
    };
    const ap3 = (M, x, y, z) => { vP.set(x, y, z).applyMatrix4(M); return [vP.x, vP.y, vP.z]; };
    const ik2 = (Sp, Pp, polo, L1, L2) => {
      let dx = Pp[0] - Sp[0], dy = Pp[1] - Sp[1], dz = Pp[2] - Sp[2];
      let d = Math.hypot(dx, dy, dz) || 1e-6;
      const nx = dx / d, ny = dy / d, nz = dz / d;
      d = clamp(d, Math.abs(L1 - L2) + 0.02, L1 + L2 - 0.005);
      let hx = polo[0], hy = polo[1], hz = polo[2];
      const hd = hx * nx + hy * ny + hz * nz; hx -= hd * nx; hy -= hd * ny; hz -= hd * nz;
      let hl = Math.hypot(hx, hy, hz);
      if (hl < 1e-5) { hx = 0; hy = 0; hz = -1; hl = 1; }
      hx /= hl; hy /= hl; hz /= hl;
      const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
      return {
        S: Sp, E: [Sp[0] + nx * L1 * cosA + hx * L1 * sinA, Sp[1] + ny * L1 * cosA + hy * L1 * sinA, Sp[2] + nz * L1 * cosA + hz * L1 * sinA],
        P: [Sp[0] + nx * d, Sp[1] + ny * d, Sp[2] + nz * d],
      };
    };
    const ocultar = () => {
      for (const k in S) (Array.isArray(S[k]) ? S[k] : [S[k]]).forEach((i) => P[k].nada(i));
      if (sprite) sprite.visible = false;
      if (celCanvas) celCanvas.m.visible = false;
    };
    let ultimo = null;
    const sobre = (x, y, d = 0) => [x, CAB_Y + y, Math.sqrt(Math.max(0, CAB_R * CAB_R - x * x - y * y)) + d];
    const OJO = [-1, 1].map((sx) => sobre(sx * 0.052, 0.02, 0.004));
    const CEJA = [-1, 1].map((sx) => sobre(sx * 0.054, 0.066, 0.006));
    const BOCA = sobre(0, -0.062, 0.004), BOCA_O = sobre(0, -0.068, 0.0);

    // ---------- v1.4 · manos de verdad ----------
    const V3 = THREE.Vector3, M4 = THREE.Matrix4;
    const celPose = { ok: false, cp: new V3(), q: new THREE.Quaternion() };
    const mH = new M4(), mL = new M4(), qH = new THREE.Quaternion(), vH = new V3(), vH2 = new V3(), sH = new V3(), UNO = new V3(1, 1, 1);
    const tamMano = o.tamMano ?? 1, AG = Object.assign({}, AGARRE, o.agarre || {});
    const agarre = (() => { const yh = new V3(AG.dir[0], AG.dir[1], 0).normalize(), zh = new V3(0, 0, 1), xh = new V3().crossVectors(yh, zh);
      const M = new M4().makeBasis(xh.multiplyScalar(tamMano), yh.multiplyScalar(tamMano), zh.multiplyScalar(tamMano)).setPosition(AG.en[0], AG.en[1], AG.en[2]);
      return { M, inv: M.clone().invert() }; })();
    const segH = (idx, a, b, r) => { vH.subVectors(b, a); const L = vH.length() || 1e-6; qH.setFromUnitVectors(Y, vH.multiplyScalar(1 / L)); mL.compose(a, qH, sH.set(r, L, r)); pon("hSeg", idx, mL); };
    const bolaH = (idx, p, r) => { mL.compose(p, qH.identity(), sH.set(r, r, r)); pon("hBola", idx, mL); };
    const enMano = (k, idx, Mh, c, rotZ, e) => { mL.compose(vH.set(c[0], c[1], c[2]), qH.setFromEuler(e1.set(0, 0, rotZ)), sH.set(e[0], e[1], e[2])); mH.multiplyMatrices(Mh, mL); pon(k, idx, mH); };
    const unaH = (idx, p, dir, dorso, r, L) => {     // uña: casquete plano en el dorso de la última falange
      const X = new V3().crossVectors(dir, dorso).normalize(), Z = new V3().crossVectors(X, dir).normalize();
      mL.makeBasis(X.multiplyScalar(r * 0.72), dir.clone().multiplyScalar(L * 0.4), Z.clone().multiplyScalar(r * 0.34));
      mL.setPosition(p.x + Z.x * r * 0.76, p.y + Z.y * r * 0.76, p.z + Z.z * r * 0.76); pon("hUna", idx, mL); };
    // Dibuja una mano (i: 0 izquierda, 1 derecha) con el marco Mh (muñeca → marco de la persona) y la pose
    // { curl: [[nudillo, medio, punta] × 4] (rad), abre, punta, polo (pulgar, en el marco de la mano), alza }.
    const manoDetalle = (i, Mh, pose) => {
      const m = i === 1 ? 1 : -1, s = vH2.setFromMatrixColumn(Mh, 0).length();
      let nb = i * 22, ng = i * 15, nu = i * 5;
      const B = (p, r) => bolaH(S.hBola[nb++], p, r * s), Sg = (a, b, r) => segH(S.hSeg[ng++], a, b, r * s);
      const H = (p) => p.clone().applyMatrix4(Mh), Hd = (d) => d.clone().transformDirection(Mh);
      enMano("hPalma", S.hPalma[i], Mh, [m * 0.0005, 0.034, 0], 0, [0.056, 0.054, 0.023]);
      enMano("hBola", S.hBola[nb++], Mh, [0, 0.0, -0.0005], 0, [0.0185, 0.028, 0.0118]);          // muñeca
      enMano("hBola", S.hBola[nb++], Mh, [-m * 0.019, 0.024, 0.005], m * 0.12, [0.0105, 0.022, 0.0095]);   // borde del meñique
      MANO_DEDOS.forEach(([x, y, L, r0, ab], f) => {
        const c = pose.curl[f], sp = ab * (pose.abre ?? 1), ux = m * Math.sin(sp), uy = Math.cos(sp);
        const rr = [r0, r0 * 0.9, r0 * 0.82];
        let p = new V3(m * x, y, 0.0005), th = 0, d = null; const pts = [p];
        for (let k = 0; k < 3; k++) { th += c[k]; d = new V3(ux * Math.cos(th), uy * Math.cos(th), Math.sin(th)); p = p.clone().addScaledVector(d, L[k]); pts.push(p); }
        const W = pts.map(H);
        B(H(new V3(m * x, y - 0.002, -0.0035)), r0 * 1.22);                   // nudillo (sobresale en el dorso)
        for (let k = 0; k < 3; k++) Sg(W[k], W[k + 1], rr[k]);
        B(W[1], rr[1] * 1.07); B(W[2], rr[2] * 1.04); B(W[3], rr[2] * 0.87);   // articulaciones y yema
        const dir = W[3].clone().sub(W[2]).normalize(), dorso = Hd(new V3(ux * Math.sin(th), uy * Math.sin(th), -Math.cos(th)));
        unaH(S.hUna[nu++], W[3].clone().addScaledVector(dir, -L[2] * 0.3 * s), dir, dorso, rr[2] * 0.87 * s, L[2] * s);
      });
      // pulgar: metacarpiano hacia la punta (con «alza» para pasar por encima de un borde) + IK de dos falanges
      const C = new V3(m * MANO_PULGAR.cmc[0], MANO_PULGAR.cmc[1], MANO_PULGAR.cmc[2]), Lp = MANO_PULGAR.largos, Rp = MANO_PULGAR.radios;
      const dm = pose.punta.clone().sub(C).add(new V3(0, 0, pose.alza || 0)).normalize();
      const J1 = C.clone().addScaledVector(dm, clamp(pose.punta.distanceTo(C) - 0.9 * (Lp[1] + Lp[2]), 0.008, Lp[0]));
      const k2 = ik2(J1.toArray(), pose.punta.toArray(), pose.polo.toArray(), Lp[1], Lp[2]);
      const J2 = new V3(...k2.E), Tp = new V3(...k2.P);
      { const Yt = J1.clone().sub(C).normalize(), Zt = new V3(0, 0, 1).addScaledVector(Yt, -Yt.z).normalize(), Xt = new V3().crossVectors(Yt, Zt);   // eminencia del pulgar
        const c0 = C.clone().lerp(J1, 0.42).add(new V3(-m * 0.005, -0.004, 0.003));
        mL.makeBasis(Xt.multiplyScalar(0.0135), Yt.multiplyScalar(0.025), Zt.multiplyScalar(0.0115)).setPosition(c0); mH.multiplyMatrices(Mh, mL); pon("hBola", S.hBola[nb++], mH); }
      const Cw = H(C), J1w = H(J1), J2w = H(J2), Tw = H(Tp);
      Sg(Cw, J1w, Rp[0]); Sg(J1w, J2w, Rp[1]); Sg(J2w, Tw, Rp[2]);
      B(J1w, Rp[0] * 1.02); B(J2w, Rp[1] * 1.02); B(Tw, Rp[2] * 0.87);
      const dirP = Tw.clone().sub(J2w).normalize(), dorP = Hd(pose.polo); dorP.addScaledVector(dirP, -dorP.dot(dirP)).normalize();
      unaH(S.hUna[nu++], Tw.clone().addScaledVector(dirP, -Lp[2] * 0.3 * s), dirP, dorP, Rp[2] * 0.87 * s, Lp[2] * s);
    };
    const pq0 = [new V3(), new THREE.Quaternion(), new V3()], pq1 = [new V3(), new THREE.Quaternion(), new V3()];
    const manosDetalle = (q, t, brazos) => {
      for (let i = 0; i < 2; i++) {
        const m = i === 1 ? 1 : -1;
        let rr = brazos[i];
        const E = new V3(...rr.E), Pw = new V3(...rr.P), d = Pw.clone().sub(E).normalize();
        // mano suelta: sigue al antebrazo, la palma mira hacia el cuerpo y un poco atrás, dedos algo doblados
        const z0 = new V3(m, 0, -0.35); z0.addScaledVector(d, -z0.dot(d)); if (z0.lengthSq() < 1e-6) z0.set(0, 0, 1); z0.normalize();
        const x0 = new V3().crossVectors(d, z0);
        let Mh = new M4().makeBasis(x0.multiplyScalar(tamMano), d.clone().multiplyScalar(tamMano), z0.clone().multiplyScalar(tamMano)).setPosition(Pw.clone().addScaledVector(d, 0.004));
        const dd = q.dedos ?? 0.35;
        let curl = MANO_DEDOS.map((_, f) => [dd * (0.85 + 0.12 * f), dd * (1.4 + 0.1 * f), dd * (0.9 + 0.05 * f)]);
        let punta = new V3(m * 0.031, 0.055, 0.021), polo = new V3(m, 0.1, -0.7), alza = 0, abre = 1;
        const w = i === 1 && celPose.ok ? tramo(q.celu, 0.35, 0.85) : 0;
        if (w > 0) {   // agarre del celular (mano derecha) y el pulgar que toca
          const Mg = new M4().compose(celPose.cp, celPose.q, UNO).multiply(agarre.M);
          Mh.decompose(pq0[0], pq0[1], pq0[2]); Mg.decompose(pq1[0], pq1[1], pq1[2]);
          Mh = new M4().compose(pq0[0].lerp(pq1[0], w), pq0[1].slerp(pq1[1], w), pq0[2].lerp(pq1[2], w));
          const tq = persona.toqueEn(t), rT = MANO_PULGAR.radios[2] * 0.87 * tamMano;
          const pG = new V3((tq.u - 0.5) * 0.062, (0.5 - tq.v) * 0.126, 0.0056 + rT + tq.alza).applyMatrix4(agarre.inv);
          const oG = new V3(0.3, 0.1, 1).transformDirection(agarre.inv);
          curl = curl.map((c, f) => c.map((x, k) => lerp(x, AG.dedos[f][k], w)));
          punta.lerp(pG, w); polo.lerp(oG, w).normalize(); alza = 0.016 * w; abre = lerp(1, AG.abre, w);
          // el antebrazo llega a la muñeca nueva
          const Wr = new V3().setFromMatrixPosition(Mh);
          rr = ik2(rr.S, [Wr.x, Wr.y, Wr.z], q.codoD, BRAZO, ANTEBRAZO); brazos[i] = rr;
          pon("brazo", S.brazo[i], hueso(rr.S, rr.E, tmp)); hueso(rr.E, rr.P, tmp2); pon("antebrazo", S.antebrazo[i], tmp2);
          d.set(rr.P[0] - rr.E[0], rr.P[1] - rr.E[1], rr.P[2] - rr.E[2]).normalize(); Pw.set(...rr.P);
        }
        manoDetalle(i, Mh, { curl, punta, polo, alza, abre });
        // puño de la manga
        if (o.manga === "corta") nada("hPuno", S.hPuno[i]);
        else { qH.setFromUnitVectors(Y, d); mL.compose(Pw.clone().addScaledVector(d, -0.008), qH, sH.set(0.037, 0.022, 0.037)); pon("hPuno", S.hPuno[i], mL); }
        // antebrazo un poco más delgado (la manga cae sobre una muñeca de verdad)
        hueso(rr.E, rr.P, tmp2); tmp2.multiply(mL.makeScale(0.82, 1, 0.82)); pon("antebrazo", S.antebrazo[i], tmp2);
      }
    };

    persona.actualizar = (t, camera) => {
      const k = escala(t);
      if (k < 1e-4) { ocultar(); ultimo = { t, oculto: true }; return persona; }
      const [x, z] = posBruta(t), yaw = persona.rumbo(t);
      const q = persona.estadoEn(t);
      const dsp = o.desplaza ? o.desplaza(t) : null;   // v1.3: [dx, dy, dz, giroX] (columpio, vehículo): corre y ladea a la persona
      qY.setFromAxisAngle(Y, yaw);
      if (dsp && dsp[3]) qY.premultiply(qD.setFromAxisAngle(XD, dsp[3]));
      R.compose(dsp ? vP.set(x + dsp[0], Y0 + dsp[1], z + dsp[2]) : vP.set(x, Y0, z), qY, vS.setScalar(alt * k));   // Y0: altura del piso de la persona (gradas)
      // Pelvis y torso
      Lp.makeRotationFromEuler(e1.set(0, q.cadG, q.cadL, "YXZ")).setPosition(q.cad[0], CAD_Y + q.cad[1], q.cad[2]);
      Lt.multiplyMatrices(Lp, tmp.makeRotationFromEuler(e1.set(q.tI, q.tG, q.tL, "YXZ")));
      pon("cadera", S.cadera, Lp);
      const resp = 1 + 0.014 * Math.sin((t + desfase) * TAU / 3.4);
      tmp.compose(vP.set(0, 0.25, 0), qB.identity(), vS.set(1.12 * resp, 1, 0.72 * resp)); tmp2.multiplyMatrices(Lt, tmp);
      pon("pecho", S.pecho, tmp2);
      if (S.chaleco !== undefined) {
        tmp.compose(vP.set(0, 0.24, 0), qB.identity(), vS.set(1.12 * resp, 1, 0.74 * resp)); tmp2.multiplyMatrices(Lt, tmp);
        pon("chaleco", S.chaleco, tmp2);
        tmp.compose(vP.set(0, 0.2, 0), qB.identity(), vS.set(1.12 * resp, 1, 0.74 * resp)); tmp2.multiplyMatrices(Lt, tmp);
        pon("franja", S.franja, tmp2);
      }
      // Brazos (IK de dos huesos en el marco de la persona)
      const brazos = [1, -1].map((sx, i) => {
        const Sp = ap3(Lt, sx * HOMBRO[0], HOMBRO[1] + q.hombros, HOMBRO[2]);
        const rr = ik2(Sp, sx > 0 ? q.mI : q.mD, sx > 0 ? q.codoI : q.codoD, BRAZO, ANTEBRAZO);
        tmp.makeTranslation(Sp[0], Sp[1], Sp[2]); pon("hombro", S.hombro[i], tmp);
        pon("brazo", S.brazo[i], hueso(rr.S, rr.E, tmp));
        hueso(rr.E, rr.P, tmp2); pon("antebrazo", S.antebrazo[i], tmp2);
        tmp.copy(tmp2).setPosition(rr.P[0], rr.P[1], rr.P[2]); pon("mano", S.mano[i], tmp);
        if (sx > 0 && S.reloj !== undefined) {
          const w = [lerp(rr.E[0], rr.P[0], 0.8), lerp(rr.E[1], rr.P[1], 0.8), lerp(rr.E[2], rr.P[2], 0.8)];
          tmp.copy(tmp2).setPosition(w[0], w[1], w[2]); pon("reloj", S.reloj, tmp); pon("relojCara", S.relojCara, tmp);
        }
        return rr;
      });
      // Piernas
      const piernas = [1, -1].map((sx, i) => {
        const pie = sx > 0 ? q.pieI : q.pieD;
        const H = ap3(Lp, sx * CADERA_X, -0.03, 0);
        const A = [pie[0], TOBILLO + pie[1], pie[2]];
        const rr = ik2(H, A, q.rodilla, MUSLO, PIERNA);
        pon("muslo", S.muslo[i], hueso(rr.S, rr.E, tmp));
        pon("pierna", S.pierna[i], hueso(rr.E, rr.P, tmp));
        // zapato: gira sobre el talón (punta arriba con pie[3] > 0)
        const pv = [0, -TOBILLO, -0.055];
        tmp.makeTranslation(rr.P[0], rr.P[1], rr.P[2]);
        tmp.multiply(tmp2.makeRotationY(sx * 0.07 + q.cadG * 0.3));
        tmp.multiply(tmp2.makeTranslation(pv[0], pv[1], pv[2]));
        tmp.multiply(tmp2.makeRotationX(-pie[3]));
        tmp.multiply(tmp2.makeTranslation(-pv[0], -pv[1], -pv[2]));
        pon("zapato", S.zapato[i], tmp);
        return rr;
      });
      // Cuello y cabeza
      Lh.multiplyMatrices(Lt, tmp.makeTranslation(0, CUELLO + 0.4 * q.cuello, q.cuello));
      Lh.multiply(tmp.makeRotationFromEuler(e1.set(q.cX, q.cY, q.cZ, "YXZ")));
      const base = ap3(Lt, 0, CUELLO - 0.06, 0), arriba = ap3(Lh, 0, 0.07, 0);
      pon("cuello", S.cuello, hueso(base, arriba, tmp));
      WH.multiplyMatrices(R, Lh);
      ponW("cabeza", S.cabeza, WH);
      pelos.forEach((kp) => ponW(kp, S[kp], WH));
      if (S.lentes !== undefined) ponW("lentes", S.lentes, WH);
      if (S.mejilla !== undefined) ponW("mejilla", S.mejilla, WH);
      // Cara
      const pp = parpadeo(t), abre = q.ojos * pp * (1 - 0.55 * q.feliz) * (1 - q.cierra);
      OJO.forEach((p, i) => {
        tmp.compose(vP.set(p[0], p[1] + 0.006 * q.feliz, p[2]), qB.identity(), vS.set(0.85 * q.ojos * cara, Math.max(0.08, 1.15 * abre) * cara, 0.5 * cara));
        Mw.multiplyMatrices(WH, tmp); ponW("ojo", S.ojo[i], Mw);
      });
      CEJA.forEach((p, i) => {
        const sx = i ? 1 : -1;
        const rz = sx * (0.42 * q.enojo - 0.36 * q.pena) - sx * 0.08 * q.feliz;
        const y = p[1] + 0.016 * q.ceja - 0.008 * q.enojo + (sx > 0 ? 0.012 * q.asim : 0);
        tmp.compose(vP.set(p[0], y, p[2]), qB.setFromEuler(e1.set(0, 0, rz)), vS.setScalar(cara));
        Mw.multiplyMatrices(WH, tmp); ponW("ceja", S.ceja[i], Mw);
      });
      const sb = Math.abs(q.boca) * (1 - q.bocaO);
      if (sb > 0.02) {
        tmp.compose(vP.set(BOCA[0], BOCA[1] + (q.boca < 0 ? -0.014 : 0), BOCA[2]), qB.setFromEuler(e1.set(0, 0, q.boca >= 0 ? Math.PI : 0)),
          vS.set((0.7 + 0.45 * Math.abs(q.boca)) * cara, (0.25 + 0.75 * Math.abs(q.boca)) * (1 - q.bocaO) * cara, cara));
        Mw.multiplyMatrices(WH, tmp); ponW("sonrisa", S.sonrisa, Mw);
      } else nada("sonrisa", S.sonrisa);
      if (q.bocaO > 0.02) {
        tmp.compose(vP.set(BOCA_O[0], BOCA_O[1] - 0.008 * q.bocaO, BOCA_O[2]), qB.identity(), vS.set(0.85 * q.bocaO * cara, (0.5 + 0.8 * q.bocaO) * q.bocaO * cara, 0.4 * cara));
        Mw.multiplyMatrices(WH, tmp); ponW("bocaO", S.bocaO, Mw);
      } else nada("bocaO", S.bocaO);
      // Celular en la mano derecha, con la pantalla hacia la cara
      const cabezaL = ap3(Lh, 0, CAB_Y, 0);
      celPose.ok = false;
      if (q.celu > 0.02) {
        const Pm = brazos[1].P;
        const hx = cabezaL[0] - Pm[0], hy = cabezaL[1] - Pm[1], hz = cabezaL[2] - Pm[2], hl = Math.hypot(hx, hy, hz) || 1;
        const cp = [Pm[0] + hx / hl * 0.035, Pm[1] + hy / hl * 0.035 + 0.035, Pm[2] + hz / hl * 0.035];
        tmp.lookAt(vD.set(cabezaL[0], cabezaL[1], cabezaL[2]), vP.set(cp[0], cp[1], cp[2]), Y);
        qB.setFromRotationMatrix(tmp);
        celPose.ok = true; celPose.cp.set(cp[0], cp[1], cp[2]); celPose.q.copy(qB);
        tmp.compose(vP.set(cp[0], cp[1], cp[2]), qB, vS.setScalar(suave(q.celu)));
        pon("celular", S.celular, tmp);
        if (celCanvas) {
          nada("pantallaCel", S.pantallaCel);
          tmp2.makeTranslation(0, 0, 0.0056); Mw.multiplyMatrices(R, tmp).multiply(tmp2);
          celCanvas.m.matrix.copy(Mw); celCanvas.m.visible = true;
          celCanvas.fn(celCanvas.ctx, celCanvas.res, celCanvas.res * 2, t); celCanvas.tex.needsUpdate = true;
        } else pon("pantallaCel", S.pantallaCel, tmp);
        if (q.pulgar > 0.02) {
          const tap = Math.max(0, Math.sin(TAU * 2.6 * (t + desfase)));
          tmp2.compose(vP.set(-0.018 + 0.012 * Math.sin((t + desfase) * 1.7), -0.03 + 0.02 * Math.sin((t + desfase) * 1.1), 0.014 + 0.012 * tap),
            qB.setFromEuler(e1.set(0, 0, 0.6)), vS.setScalar(q.pulgar));
          tmp.multiply(tmp2); pon("pulgar", S.pulgar, tmp);
        } else nada("pulgar", S.pulgar);
      } else { nada("celular", S.celular); nada("pantallaCel", S.pantallaCel); nada("pulgar", S.pulgar); if (celCanvas) celCanvas.m.visible = false; }
      if (DET) { nada("mano", S.mano[0]); nada("mano", S.mano[1]); nada("pulgar", S.pulgar); manosDetalle(q, t, brazos); }
      // Sombra de contacto (no sube con el salto: se achica)
      if (S.sombra !== undefined) {
        const alza = Math.min(q.pieI[1], q.pieD[1]);
        tmp.compose(vP.set(q.cad[0] * 0.5, 0.004 / alt, 0.02), qB.identity(), vS.setScalar(1 - 1.5 * clamp(alza, 0, 0.2)));
        pon("sombra", S.sombra, tmp);
      }
      // Globo
      const top = ap3(WH, 0, CAB_Y + CAB_R + 0.05, 0);
      if (sprite) {
        let gb = null;
        for (const g of globos) if (t >= g.desde - 0.01 && t < g.hasta + 0.3) gb = g;
        if (gb) {
          const kk = popEscala(t, gb.desde, isFinite(gb.hasta) ? gb.hasta : null, 0.35, 0.25);
          sprite.visible = kk > 1e-3;
          sprite.material = G.texGlobo(gb.icono);
          const s = 0.36 * alt * gb.tam * kk;
          sprite.scale.set(s * 256 / 224, s, 1);
          sprite.position.set(top[0], top[1] + 0.2 * alt + 0.025 * Math.sin(TAU * 0.8 * (t + desfase)), top[2]);
        } else sprite.visible = false;
      }
      ultimo = { t, q, R: R.clone(), WH: WH.clone(), brazos, piernas, cabeza: ap3(WH, 0, CAB_Y, 0), top,
        cara: ap3(WH, 0, CAB_Y - 0.01, CAB_R) };
      return persona;
    };

    // Puntos (en coordenadas del grupo de la gente = de la escena si no se movió): "cabeza" (coronilla), "cara",
    // "centro-cabeza", "mano" (derecha), "manoI", "pies", "pecho".
    persona.punto = (nombre = "cabeza", t) => {
      if (t !== undefined && (!ultimo || ultimo.t !== t)) {
        // otro instante: se calcula y luego se deja todo como estaba (las instancias del cuadro actual no cambian)
        const antes = ultimo && ultimo.t;
        persona.actualizar(t);
        const p = persona.punto(nombre);
        if (antes !== undefined && antes !== null) persona.actualizar(antes);
        return p;
      }
      if (!ultimo || ultimo.oculto) { const [x, z] = posBruta(t ?? 0); return [x, Y0, z]; }
      if (nombre === "cabeza") return ultimo.top;
      if (nombre === "cara") return ultimo.cara;
      if (nombre === "centro-cabeza") return ultimo.cabeza;
      const w = (p) => { vP.set(p[0], p[1], p[2]).applyMatrix4(ultimo.R); return [vP.x, vP.y, vP.z]; };
      if (nombre === "mano") return w(ultimo.brazos[1].P);
      if (nombre === "manoI") return w(ultimo.brazos[0].P);
      if (nombre === "pecho") return w([0, CAD_Y + 0.3, 0.1]);
      const [x, z] = posBruta(ultimo.t); return [x, Y0, z];
    };
    persona.ultimo = () => ultimo;
    return persona;
  }

  // ======================================================================================================
  // Gente3D.escena(canvas, opciones): renderer + escena + cámara + luces + la gente.
  // ======================================================================================================
  function escena(canvas, op = {}) {
    const THREE = T3();
    const ancho = op.ancho || 1080, alto = op.alto || 1920;
    const cv = typeof canvas === "string" ? raiz.document.querySelector(canvas) : canvas;
    let renderer = null, ok = false;
    if (cv) {
      try {
        renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: !op.fondo, preserveDrawingBuffer: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(1); renderer.setSize(ancho, alto, false);
        renderer.setClearColor(op.fondo ? new THREE.Color(op.fondo) : 0x000000, op.fondo ? 1 : 0);
        ok = true;
      } catch (e) { console.warn("Gente3D: sin WebGL, no se dibuja el 3D", e); renderer = null; }
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(op.fov || 38, ancho / alto, op.cerca || 0.05, op.lejos || 200);
    // Luces suaves (nada de brillos): cielo/suelo + una principal cálida de frente-arriba + un contraluz frío bajo.
    scene.add(new THREE.HemisphereLight(0xe8eefc, 0x2a3346, op.luzAmbiente ?? 1.5));
    const sol = new THREE.DirectionalLight(0xfff3e4, op.luzPrincipal ?? 2.2); sol.position.set(-2, 4, 3); scene.add(sol);
    const contra = new THREE.DirectionalLight(0x9aa6ff, op.contraluz ?? 0.6); contra.position.set(2.5, 2.5, -3); scene.add(contra);
    const G = en(scene, THREE, null, op);
    const esc = Object.assign(G, { ok, renderer, scene, camera, ancho, alto });

    if (op.piso !== false && !op.sinPiso) {
      const piso = new THREE.Mesh(new THREE.CircleGeometry(op.radioPiso || 5, 48),
        new THREE.MeshBasicMaterial({ map: G.texRadial(op.colorPiso || "rgba(38,52,78,0.95)", "rgba(38,52,78,0)"), transparent: true, depthWrite: false }));
      piso.rotation.x = -Math.PI / 2; piso.renderOrder = -2; scene.add(piso);
      esc.piso = piso;
    }

    // ---------- Cámara (como en personaje3d) ----------
    // Órbita: { t, angulo (grados; 0 = de frente a quien tiene giro 0, 90 = a su derecha, 180 = por detrás), altura,
    // distancia, mira: [x,y,z], fov } · cartesianas: { t, pos: [x,y,z], mira, fov } · o una función (t) => {pos, mira, fov}.
    let camFn = null, vaiven = op.vaiven ?? 0.01;
    esc.camara = (claves, opc = {}) => {
      if (opc.vaiven !== undefined) vaiven = opc.vaiven;
      if (typeof claves === "function") { camFn = claves; return esc; }
      const orbita = claves[0].pos === undefined;
      const prev = { angulo: 20, altura: 2.2, distancia: 5, mira: [0, 0.9, 0], fov: op.fov || 38, pos: [0, 2.5, 6] };
      const vals = claves.map((k) => {
        const v = Object.assign(prev, k);
        return orbita ? [v.angulo, v.altura, v.distancia, ...v.mira, v.fov] : [...v.pos, ...v.mira, v.fov];
      });
      const f = hermite(claves.map((k) => k.t), vals);
      camFn = (t) => {
        const v = f(t);
        if (!orbita) return { pos: v.slice(0, 3), mira: v.slice(3, 6), fov: v[6] };
        const a = rad(v[0]);
        return { pos: [v[3] - v[2] * Math.sin(a), v[1], v[5] + v[2] * Math.cos(a)], mira: v.slice(3, 6), fov: v[6] };
      };
      return esc;
    };
    esc.camara([{ t: 0 }]);
    const ponCamara = (t) => {
      const c = camFn(t);
      const vx = vaiven * Math.sin(t * 0.47), vy = vaiven * 0.6 * Math.sin(t * 0.31 + 1.3);
      camera.position.set(c.pos[0] + vx, c.pos[1] + vy, c.pos[2]);
      camera.up.set(0, 1, 0);
      camera.lookAt(c.mira[0], c.mira[1], c.mira[2]);
      if (c.fov && camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
      camera.updateMatrixWorld(true);
    };
    esc.ponCamara = ponCamara;
    esc.actualizarTodo = (t) => { ponCamara(t); G.actualizar(t, camera); };
    esc.dibujar = (t) => { esc.actualizarTodo(t); if (renderer) renderer.render(scene, camera); esc.t = t; };

    // Proyección a la pantalla (px del canvas) de un punto del grupo, para pegar rótulos HTML encima de algo 3D.
    const vp = new THREE.Vector3();
    esc.aPantalla = (p, t) => {
      if (t !== undefined && esc.t !== t) ponCamara(t);
      vp.set(p[0], p[1], p[2]).applyMatrix4(G.grupo.matrixWorld).project(camera);
      return { x: (vp.x + 1) / 2 * ancho, y: (1 - vp.y) / 2 * alto, z: vp.z, dentro: vp.z < 1 && Math.abs(vp.x) <= 1 && Math.abs(vp.y) <= 1 };
    };
    // Encuadre en px de toda la gente visible (cabezas, manos y pies) en el instante t.
    // esc.caja(t) con un número hace lo mismo (como en personaje3d); esc.caja({...}) crea una caja/taquilla.
    const cajaUtileria = G.caja;
    esc.caja = (x) => (typeof x === "number" ? esc.encuadre(x) : cajaUtileria(x));
    esc.encuadre = (t) => {
      if (esc.t !== t) esc.actualizarTodo(t);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      G.personas.forEach((p) => {
        const u = p.ultimo(); if (!u || u.oculto) return;
        ["cabeza", "mano", "manoI", "pies"].forEach((n) => {
          const s = esc.aPantalla(p.punto(n));
          if (s.z >= 1) return;
          x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
        });
      });
      return { x0, y0, x1, y1 };
    };
    return esc;
  }

  raiz.Gente3D = { escena, en, ESTADOS, BASE, ALIAS, TRANS, PIELES, PELOS, ROPAS, PANTALONES, PEINADOS, ALTO,
    suave, tramo, hermite, azar, popEscala, trapecio, porTiempo, version: "1.2" };
  if (typeof module !== "undefined") module.exports = raiz.Gente3D;
})(typeof window !== "undefined" ? window : globalThis);
