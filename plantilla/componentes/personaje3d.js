// Personajes 3D low-poly sentados frente a un computador (Three.js r158 UMD, archivo local lib/vendor/three-r158.min.js).
// Documentación completa: componentes/PERSONAJE3D.md.
//
//   const esc = Personaje3D.escena("#gl");                         // renderer + escena + cámara (fondo transparente)
//   const ana = esc.persona({ piel: 2, pelo: "#2b1d16", ropa: "#3d62f1", peinado: "rizado", equipo: "monitor" });
//   ana.pose("escribe", W(3), W(9)).pose("mira-celular", W(9), W(15)).pose("sorpresa", W(15));
//   ana.pantalla((ctx, w, h, t) => { ... });                       // lo que se ve en el monitor (canvas 2D → textura)
//   esc.camara([{ t: 0, angulo: 150, altura: 1.4, distancia: 2.4 }, { t: 3, angulo: 35, ... }]);
//   fx.dibuja((t) => esc.dibujar(t));                              // un solo reloj: mismo t → mismo cuadro
//
// Reglas: todo sale de t (nada de requestAnimationFrame, Math.random ni Date); el azar es con semilla (mulberry32);
// un solo renderer.render por cuadro; si no hay WebGL, esc.ok = false y las poses se siguen calculando (sin dibujar).
(function (raiz) {
  "use strict";
  const T3 = () => raiz.THREE || (typeof require === "function" ? require("three") : null);

  // ---------- Matemática ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const suave = (x) => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };   // smootherstep
  const tramo = (s, a, b) => (b <= a ? (s >= b ? 1 : 0) : suave((s - a) / (b - a)));
  const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const suma3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const azar = (semilla) => () => {
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rad = (g) => (g * Math.PI) / 180;

  // Interpolación cúbica monótona (Fritsch–Carlson) por canal: velocidad continua y sin pasarse de las claves
  // (dos claves iguales = la cámara se queda quieta entre ellas, sin rebote).
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

  // ---------- Paletas (cualquier combinación sirve para cualquiera: nada de «colores de niño/niña») ----------
  const PIELES = ["#f6d5b8", "#eabf98", "#d39b6e", "#b07a4f", "#8a5a36", "#5e3b24"];
  const PELOS = ["#1f1a17", "#3b2618", "#6b4226", "#a0522d", "#d9b26f", "#9aa0a6"];
  const ROPAS = ["#3d62f1", "#2a9d8f", "#e09f3e", "#c8553d", "#7a9e7e", "#8e7dbe", "#e5e7eb", "#334155"];

  // ---------- Medidas del puesto (metros; piso y = 0; la persona mira hacia −z) ----------
  const MESA = { y: 0.68, grosor: 0.035, ancho: 1.3, z0: -0.16, z1: -0.86 };   // z0 = borde de adelante (lado de la persona)
  const PELVIS = [0, 0.56, 0.06];              // pivote del torso dentro de «cuerpo»
  const HOMBRO = [0.185, 0.40, 0.0];           // en el torso (x se espeja)
  const CUELLO = 0.46, CABEZA_R = 0.14, CABEZA_Y = 0.17;
  const BRAZO = 0.27, ANTEBRAZO = 0.27;
  const ANCLA = {                              // puntos del puesto que usan las poses (marco «p» = puesto)
    tecI: [-0.125, MESA.y + 0.058, -0.32], tecD: [0.125, MESA.y + 0.058, -0.32],
    raton: [0.36, MESA.y + 0.05, -0.31], restoI: [-0.24, MESA.y + 0.045, -0.27],
    celular: [0.25, MESA.y + 0.006, -0.47],
  };

  // ---------- Poses ----------
  // Cada pose es (c) => {campos}. c = { t, v (t + desfase de la persona), s (segundos desde que empezó), d (duración),
  // tramo(a,b) (0→1 suave entre s=a y s=b), A (anclas) }. Lo que no se dice sale de BASE. Manos: { p: [x,y,z] } en el
  // marco del puesto (el teclado no se mueve aunque la silla ruede) o { t: [x,y,z] } en el del torso (cabeza, pecho).
  const BASE = {
    silla: 0, tI: -0.04, tG: 0, tL: 0, cX: 0.06, cY: 0, cZ: 0,
    ceja: 0, pena: 0, asim: 0, ojos: 1, feliz: 0, boca: 0.35, bocaO: 0,
    agarre: 0, alza: 0, codoI: [-0.6, -1, 0.1], codoD: [0.6, -1, 0.1],
  };
  const POSES = {
    respira: (c) => ({
      tI: -0.04 + 0.018 * Math.sin(c.v * 0.9), cX: 0.06 + 0.035 * Math.sin(c.v * 0.53 + 1), cY: 0.1 * Math.sin(c.v * 0.31),
      manoI: { p: suma3(c.A.restoI, [0.01 * Math.sin(c.v * 0.4), 0, 0]) },
      manoD: { p: suma3(c.A.raton, [0.012 * Math.sin(c.v * 0.8), 0, 0.01 * Math.sin(c.v * 0.6 + 2)]) },
      boca: 0.35,
    }),
    escribe: (c) => {
      const tec = (f) => 0.011 * Math.max(0, Math.sin(Math.PI * 2 * 4.3 * c.v + f));
      const deriva = 0.018 * Math.sin(c.v * 0.9);
      return {
        tI: -0.1 + 0.01 * Math.sin(c.v * 1.1), cX: 0.1 + 0.025 * Math.sin(c.v * 1.3), cY: 0.06 * Math.sin(c.v * 0.7),
        manoI: { p: suma3(c.A.tecI, [deriva + 0.008 * Math.sin(c.v * 3.1), tec(0), 0]) },
        manoD: { p: suma3(c.A.tecD, [deriva + 0.008 * Math.sin(c.v * 2.7 + 1), tec(2.1), 0]) },
        boca: 0.15,
      };
    },
    "mira-celular": (c) => {
      // Coreografía propia: alcanza el celular de la mesa, lo levanta, lo mira y al final lo deja donde estaba.
      const k = Math.min(1, c.d / 2.4);
      const alcanza = c.tramo(0, 0.4 * k), sube = c.tramo(0.45 * k, 0.95 * k);
      const baja = c.tramo(c.d - 0.95 * k, c.d - 0.5 * k), vuelve = c.tramo(c.d - 0.42 * k, c.d);
      const agarre = c.s >= 0.4 * k && c.s < c.d - 0.45 * k ? 1 : 0;
      const alza = sube * (1 - baja);
      const toma = suma3(c.A.celular, [0, 0.032, 0.0]);
      const mano = suma3([0.05, 1.0, -0.24], [0.006 * Math.sin(c.v * 1.7), 0.004 * Math.sin(c.v * 9) , 0]);
      let p = lerp3(c.A.tecD, toma, alcanza);
      p = lerp3(p, mano, alza);
      p = lerp3(p, c.A.tecD, vuelve);
      return {
        tI: -0.06, cX: 0.08 + 0.36 * alza, cY: 0.12 * alza, ceja: 0.25 * alza, boca: 0.25,
        manoI: { p: suma3(c.A.tecI, [0, 0.005 * Math.sin(c.v * 2), 0]) }, manoD: { p }, agarre, alza,
        codoD: [0.7, -1, 0.4],
      };
    },
    sorpresa: (c) => ({
      silla: 0.11, tI: 0.17 + 0.012 * Math.sin(c.v * 1.4), cX: -0.12, cY: 0.03 * Math.sin(c.v * 0.8),
      ceja: 1, ojos: 1.35, boca: 0, bocaO: 0.9,
      manoI: { t: [-0.25, 0.27 + 0.01 * Math.sin(c.v * 2.2), -0.23] }, manoD: { t: [0.25, 0.27 + 0.01 * Math.sin(c.v * 2.2 + 1), -0.23] },
      codoI: [-1, -1, 0.3], codoD: [1, -1, 0.3],
    }),
    preocupado: (c) => ({
      silla: 0.02, tI: -0.03, cX: 0.16 + 0.02 * Math.sin(c.v * 0.9), cY: -0.1, cZ: -0.07,
      ceja: 0.25, pena: 1, ojos: 0.92, boca: -0.55,
      manoI: { p: c.A.restoI },
      manoD: { t: [0.215, 0.72 + 0.012 * Math.sin(c.v * 2.6), 0.03 + 0.012 * Math.sin(c.v * 2.6 + 1.2)] },
      codoD: [1, -0.2, -0.25],
    }),
    piensa: (c) => ({
      tI: -0.02, cX: -0.06, cY: 0.22 + 0.03 * Math.sin(c.v * 0.7), cZ: 0.05,
      ceja: 0.45, asim: 0.6, boca: -0.1,
      manoI: { p: c.A.restoI },
      manoD: { t: [0.02, 0.515 + 0.006 * Math.sin(c.v * 3.2), -0.15] },
      codoD: [0.35, -1, -0.1],
    }),
    celebra: (c) => {
      const b = Math.sin(Math.PI * 2 * 1.8 * c.v);
      return {
        silla: 0.04, tI: 0.06 + 0.03 * b, cX: -0.13, cZ: 0.06 * Math.sin(Math.PI * 2 * 0.9 * c.v),
        ceja: 0.6, feliz: 1, boca: 1,
        manoI: { t: [-0.31, 0.86 + 0.04 * b, -0.06] }, manoD: { t: [0.31, 0.86 + 0.04 * b, -0.06] },
        codoI: [-1, -0.6, 0.2], codoD: [1, -0.6, 0.2],
      };
    },
    saluda: (c) => ({
      tI: 0.02, cX: 0, cY: -0.08, ceja: 0.4, boca: 0.85,
      manoI: { p: c.A.restoI },
      manoD: { t: [0.3 + 0.045 * Math.sin(Math.PI * 2 * 2 * c.v), 0.72, -0.12] },
      codoD: [1, -0.8, 0.3],
    }),
  };
  const ALIAS = { celular: "mira-celular", idle: "respira", quieto: "respira" };
  const TRANS = { sorpresa: 0.3, celebra: 0.55, respira: 0.8 };   // duración de la transición de entrada (s); por defecto 0.5

  // ---------- Texturas en canvas ----------
  const lienzo = (w, h) => { const cv = raiz.document.createElement("canvas"); cv.width = w; cv.height = h; return cv; };
  function texRadial(THREE, c0, c1) {
    const cv = lienzo(128, 128), ctx = cv.getContext("2d");
    if (ctx && ctx.createRadialGradient) {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }

  // Pantalla por defecto: un panel tranquilo (líneas que bajan despacio). La de cada video se pasa con persona.pantalla(fn).
  function pantallaBase(ctx, w, h, t) {
    ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1e293b"; ctx.fillRect(0, 0, w, 44);
    ["#f05252", "#f5a524", "#22c55e"].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(26 + i * 26, 22, 8, 0, 7); ctx.fill(); });
    const r = azar(5), filas = [];
    for (let i = 0; i < 40; i++) filas.push({ x: 30 + Math.floor(r() * 4) * 28, w: 80 + r() * 300, c: r() < 0.25 ? "#7b86f0" : r() < 0.4 ? "#22c55e" : "#475569" });
    const off = (t * 18) % 30, i0 = Math.floor((t * 18) / 30);
    for (let k = 0; k < 13; k++) {
      const f = filas[(i0 + k) % filas.length];
      ctx.fillStyle = f.c; ctx.fillRect(f.x, 70 + k * 30 - off, f.w, 12);
    }
  }
  function celularBase(ctx, w, h) {
    ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1e293b"; for (let i = 0; i < 4; i++) ctx.fillRect(12, 40 + i * 50, w - 24, 38);
  }

  // ---------- Escena ----------
  function escena(canvas, op = {}) {
    const THREE = T3();
    const ancho = op.ancho || 1080, alto = op.alto || 1920;
    const cv = typeof canvas === "string" ? raiz.document.querySelector(canvas) : canvas;
    const esc = { THREE, ok: false, personas: [], ancho, alto };
    let renderer = null;
    if (cv) {
      try {
        renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: !op.fondo, preserveDrawingBuffer: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(1); renderer.setSize(ancho, alto, false);
        renderer.setClearColor(op.fondo ? new THREE.Color(op.fondo) : 0x000000, op.fondo ? 1 : 0);
        esc.ok = true;
      } catch (e) { console.warn("Personaje3D: sin WebGL, no se dibuja el 3D", e); renderer = null; }
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(op.fov || 34, ancho / alto, 0.05, 60);
    Object.assign(esc, { renderer, scene, camera });

    // Luces suaves (nada de brillos): cielo/suelo + una principal cálida + un contraluz frío muy bajo.
    scene.add(new THREE.HemisphereLight(0xe8eefc, 0x2a3346, op.luzAmbiente ?? 1.5));
    const sol = new THREE.DirectionalLight(0xfff3e4, op.luzPrincipal ?? 2.3); sol.position.set(-1.6, 3.2, -2.2); scene.add(sol);
    const contra = new THREE.DirectionalLight(0x9aa6ff, op.contraluz ?? 0.7); contra.position.set(1.8, 2.0, 2.4); scene.add(contra);

    // Material plano «de ilustración»: toon de 3 tonos (cada color se crea una sola vez).
    const grad = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;
    const mats = new Map();
    esc.material = (color) => {
      const k = String(color);
      if (!mats.has(k)) mats.set(k, new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: grad }));
      return mats.get(k);
    };
    const malla = (geo, color, padre, pos, rot, esc_) => {
      const m = new THREE.Mesh(geo, typeof color === "object" && color.isMaterial ? color : esc.material(color));
      if (pos) m.position.set(pos[0], pos[1], pos[2]);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      if (esc_) m.scale.set(esc_[0], esc_[1], esc_[2]);
      if (padre) padre.add(m);
      return m;
    };
    esc.malla = malla;

    // Piso: un disco suave que se funde con el fondo del video (el canvas es transparente).
    if (op.piso !== false) {
      const piso = new THREE.Mesh(new THREE.CircleGeometry(op.radioPiso || 2.2, 48),
        new THREE.MeshBasicMaterial({ map: texRadial(THREE, op.colorPiso || "rgba(38,52,78,0.95)", "rgba(38,52,78,0)"), transparent: true, depthWrite: false }));
      piso.rotation.x = -Math.PI / 2; piso.position.set(0, 0, -0.3); piso.renderOrder = -2; scene.add(piso);
    }
    esc.sombraTex = texRadial(THREE, "rgba(3,7,18,0.55)", "rgba(3,7,18,0)");

    // ---------- Cámara ----------
    // claves: [{ t, angulo (grados; 0 = de frente a la persona, 90 = a su derecha, 180 = por detrás), altura, distancia,
    //            mira: [x,y,z], fov }] o [{ t, pos: [x,y,z], mira, fov }]. También sirve una función (t) => {pos, mira, fov}.
    let camFn = null, vaiven = op.vaiven ?? 0.01;
    esc.camara = (claves, opc = {}) => {
      if (opc.vaiven !== undefined) vaiven = opc.vaiven;
      if (typeof claves === "function") { camFn = claves; return esc; }
      const orbita = claves[0].pos === undefined;
      const prev = { angulo: 35, altura: 1.35, distancia: 2.6, mira: [0, 0.95, -0.25], fov: op.fov || 34, pos: [1.5, 1.4, -2] };
      const vals = claves.map((k) => {
        const v = Object.assign(prev, k);
        return orbita ? [v.angulo, v.altura, v.distancia, ...v.mira, v.fov] : [...v.pos, ...v.mira, v.fov];
      });
      const f = hermite(claves.map((k) => k.t), vals);
      camFn = (t) => {
        const v = f(t);
        if (!orbita) return { pos: v.slice(0, 3), mira: v.slice(3, 6), fov: v[6] };
        const a = rad(v[0]);
        return { pos: [v[3] + v[2] * Math.sin(a), v[1], v[5] - v[2] * Math.cos(a)], mira: v.slice(3, 6), fov: v[6] };
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

    esc.persona = (o) => { const p = crearPersona(esc, o, esc.personas.length); esc.personas.push(p); return p; };

    esc.actualizar = (t) => { esc.personas.forEach((p) => p.actualizar(t)); ponCamara(t); scene.updateMatrixWorld(true); };
    esc.dibujar = (t) => { esc.actualizar(t); if (renderer) renderer.render(scene, camera); };

    // Caja en pantalla (px) de cada persona con su puesto, para comprobar que nada se sale del cuadro.
    esc.caja = (t) => {
      esc.actualizar(t);
      const v = new THREE.Vector3();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      esc.personas.forEach((p) => p.grupo.traverse((m) => {
        if (!m.isMesh || m.userData.sinCaja || !m.visible) return;
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 3) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).project(camera);
          const x = (v.x + 1) / 2 * ancho, y = (1 - v.y) / 2 * alto;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }));
      return { x0, y0, x1, y1 };
    };
    return esc;
  }

  // ---------- Persona con su puesto ----------
  function crearPersona(esc, o, indice) {
    const { THREE, malla } = esc;
    const col = (v, lista, def) => (v === undefined ? lista[def % lista.length] : typeof v === "number" ? lista[v % lista.length] : v);
    const piel = col(o.piel, PIELES, indice * 2 + 1), pelo = col(o.pelo, PELOS, indice + 1), ropa = col(o.ropa, ROPAS, indice);
    const pantalon = o.pantalon || "#273449", zapatos = o.zapatos || "#111827";
    const peinado = o.peinado || ["corto", "rizado", "largo", "mono", "rapado"][indice % 5];
    const desfase = o.desfase ?? indice * 1.73;
    const A = ANCLA;
    const Y = new THREE.Vector3(0, 1, 0);

    const grupo = new THREE.Group();
    const en = o.en || [0, 0];
    grupo.position.set(en[0], 0, en[1]); grupo.rotation.y = rad(o.giro || 0);
    esc.scene.add(grupo);
    const mueble = new THREE.Group(); grupo.add(mueble);
    const cuerpo = new THREE.Group(); grupo.add(cuerpo);

    // Sombras de contacto (manchas suaves; no cuentan para la caja).
    const mancha = (w, d, x, z, padre) => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: esc.sombraTex, transparent: true, depthWrite: false }));
      s.rotation.x = -Math.PI / 2; s.position.set(x, 0.002, z); s.renderOrder = -1; s.userData.sinCaja = true; padre.add(s); return s;
    };
    mancha(1.7, 1.1, 0, (MESA.z0 + MESA.z1) / 2, mueble);
    mancha(0.8, 0.8, 0, 0.08, cuerpo);

    // --- Escritorio ---
    const madera = o.mesa || "#c89f74", patas = "#3a4356";
    const mz = (MESA.z0 + MESA.z1) / 2, md = MESA.z0 - MESA.z1;
    malla(new THREE.BoxGeometry(MESA.ancho, MESA.grosor, md), madera, mueble, [0, MESA.y - MESA.grosor / 2, mz]);
    for (const sx of [-1, 1]) {
      malla(new THREE.BoxGeometry(0.05, MESA.y - MESA.grosor, md - 0.1), patas, mueble, [sx * (MESA.ancho / 2 - 0.06), (MESA.y - MESA.grosor) / 2, mz]);
    }
    malla(new THREE.BoxGeometry(MESA.ancho - 0.16, 0.28, 0.02), patas, mueble, [0, MESA.y - 0.2, MESA.z1 + 0.06]);

    // --- Equipo: monitor o portátil, con la pantalla como CanvasTexture ---
    const equipo = o.equipo || "monitor";
    const pw = equipo === "laptop" ? 512 : 640, ph = equipo === "laptop" ? 320 : 390;
    const pcv = lienzo(pw, ph), pctx = pcv.getContext("2d");
    const ptex = new THREE.CanvasTexture(pcv); ptex.colorSpace = THREE.SRGBColorSpace; ptex.anisotropy = 4;
    const pmat = new THREE.MeshBasicMaterial({ map: ptex, toneMapped: false });
    const carcasa = o.carcasa || "#1f2937";
    if (equipo === "laptop") {
      const base = new THREE.Group(); base.position.set(0, MESA.y, -0.36); mueble.add(base);
      malla(new THREE.BoxGeometry(0.36, 0.016, 0.25), "#9aa3b2", base, [0, 0.008, 0]);
      malla(new THREE.BoxGeometry(0.31, 0.003, 0.11), "#475569", base, [0, 0.017, -0.035]);
      const tapa = new THREE.Group(); tapa.position.set(0, 0.016, -0.125); tapa.rotation.x = rad(-12); base.add(tapa);
      malla(new THREE.BoxGeometry(0.36, 0.23, 0.012), "#9aa3b2", tapa, [0, 0.115, -0.006]);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.206), pmat); scr.position.set(0, 0.117, 0.0008); tapa.add(scr);
    } else {
      malla(new THREE.BoxGeometry(0.22, 0.012, 0.16), carcasa, mueble, [0, MESA.y + 0.006, -0.72]);
      malla(new THREE.BoxGeometry(0.05, 0.2, 0.03), carcasa, mueble, [0, MESA.y + 0.1, -0.74]);
      const mon = new THREE.Group(); mon.position.set(0, MESA.y + 0.35, -0.73); mon.rotation.x = rad(-4); mueble.add(mon);
      malla(new THREE.BoxGeometry(0.6, 0.37, 0.03), carcasa, mon, [0, 0, -0.005]);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.565, 0.344), pmat); scr.position.set(0, 0, 0.0105); mon.add(scr);
      // Teclado y ratón (con el portátil, el teclado es el suyo).
      malla(new THREE.BoxGeometry(0.42, 0.018, 0.14), "#cbd5e1", mueble, [0, MESA.y + 0.009, -0.34]);
      malla(new THREE.BoxGeometry(0.39, 0.004, 0.11), "#64748b", mueble, [0, MESA.y + 0.019, -0.34]);
    }
    malla(new THREE.CapsuleGeometry(0.022, 0.03, 4, 8), "#cbd5e1", mueble, [A.raton[0], MESA.y + 0.012, A.raton[2] - 0.01], [Math.PI / 2, 0, 0], [1, 1, 0.55]);
    if (o.taza !== false) {
      const taza = new THREE.Group(); taza.position.set(-0.40, MESA.y, -0.46); mueble.add(taza);
      malla(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 16), o.colorTaza || "#e09f3e", taza, [0, 0.05, 0]);
      malla(new THREE.CylinderGeometry(0.034, 0.034, 0.004, 16), "#4a2c1d", taza, [0, 0.096, 0]);
      malla(new THREE.TorusGeometry(0.026, 0.008, 6, 12), o.colorTaza || "#e09f3e", taza, [0.045, 0.05, 0], [0, Math.PI / 2, 0]);
    }
    if (o.planta) {
      const pl = new THREE.Group(); pl.position.set(-0.54, MESA.y, -0.76); mueble.add(pl);
      malla(new THREE.CylinderGeometry(0.06, 0.05, 0.11, 12), "#e5e7eb", pl, [0, 0.055, 0]);
      const r = azar(17);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + r();
        const h = malla(new THREE.SphereGeometry(0.05, 8, 6), i % 2 ? "#5f8f5a" : "#7aa874", pl, [Math.cos(a) * 0.04, 0.16 + r() * 0.06, Math.sin(a) * 0.04], [r(), a, 0.6], [0.5, 1.4, 0.3]);
        h.rotation.z = Math.cos(a) * 0.5; h.rotation.x = -Math.sin(a) * 0.5;
      }
    }

    // --- Celular ---
    const celCv = lienzo(128, 256), celCtx = celCv.getContext("2d");
    const celTex = new THREE.CanvasTexture(celCv); celTex.colorSpace = THREE.SRGBColorSpace;
    const celular = new THREE.Group(); grupo.add(celular);
    malla(new THREE.BoxGeometry(0.076, 0.152, 0.009), "#111827", celular);
    const celScr = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.142), new THREE.MeshBasicMaterial({ map: celTex, toneMapped: false }));
    celScr.position.z = 0.0047; celular.add(celScr);
    celular.visible = o.celular !== false;
    const celMesa = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.25));

    // --- Silla de oficina (rueda con la pose: va dentro de «cuerpo») ---
    const silla = o.silla || "#334155", metal = "#4b5563";
    malla(new THREE.BoxGeometry(0.48, 0.07, 0.46), silla, cuerpo, [0, 0.475, 0.08]);
    const resp = new THREE.Group(); resp.position.set(0, 0.52, 0.3); resp.rotation.x = rad(8); cuerpo.add(resp);
    malla(new THREE.BoxGeometry(0.44, 0.48, 0.06), silla, resp, [0, 0.3, 0]);
    malla(new THREE.BoxGeometry(0.05, 0.12, 0.04), metal, resp, [0, 0.03, 0.01]);
    malla(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 10), metal, cuerpo, [0, 0.29, 0.08]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3, x = Math.sin(a) * 0.14, z = 0.08 + Math.cos(a) * 0.14;
      malla(new THREE.BoxGeometry(0.035, 0.03, 0.28), metal, cuerpo, [x, 0.11, z], [0, a, 0]);
      malla(new THREE.SphereGeometry(0.028, 8, 6), "#1f2937", cuerpo, [Math.sin(a) * 0.27, 0.03, 0.08 + Math.cos(a) * 0.27]);
    }

    // --- Cuerpo ---
    // Piernas (sentada, fijas): muslo hacia adelante, pierna abajo, zapato.
    for (const sx of [-1, 1]) {
      const cad = [sx * 0.1, 0.55, 0.08], rod = [sx * 0.12, 0.56, -0.33], tob = [sx * 0.13, 0.1, -0.38];
      hueso(malla(new THREE.CapsuleGeometry(0.075, 0.3, 4, 10), pantalon, cuerpo), cad, rod);
      hueso(malla(new THREE.CapsuleGeometry(0.062, 0.38, 4, 10), pantalon, cuerpo), rod, tob);
      malla(new THREE.BoxGeometry(0.1, 0.07, 0.2), zapatos, cuerpo, [tob[0], 0.035, tob[2] - 0.04]);
    }
    malla(new THREE.CapsuleGeometry(0.15, 0.06, 4, 12), pantalon, cuerpo, [0, 0.56, 0.08], [0, 0, Math.PI / 2], [1, 1, 0.9]);
    const torso = new THREE.Group(); torso.position.set(PELVIS[0], PELVIS[1], PELVIS[2]); cuerpo.add(torso);
    const pecho = malla(new THREE.CapsuleGeometry(0.155, 0.24, 6, 14), ropa, torso, [0, 0.25, 0], null, [1.12, 1, 0.72]);
    malla(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), piel, torso, [0, CUELLO + 0.02, 0]);
    // Cabeza
    const cabeza = new THREE.Group(); cabeza.position.set(0, CUELLO, 0); torso.add(cabeza);
    const cr = CABEZA_R, cy = CABEZA_Y;
    malla(new THREE.SphereGeometry(cr, 24, 18), piel, cabeza, [0, cy, 0], null, [1, 1.04, 1]);
    for (const sx of [-1, 1]) malla(new THREE.SphereGeometry(0.03, 10, 8), piel, cabeza, [sx * cr * 0.98, cy - 0.005, 0.01], null, [0.6, 1, 0.9]);
    malla(new THREE.SphereGeometry(0.018, 10, 8), piel, cabeza, [0, cy - 0.025, -cr * 0.98]);
    const tinta = o.ojos || "#1c2238";
    const sobre = (x, y, d = 0.004) => [x, cy + y, -Math.sqrt(Math.max(0, cr * cr - x * x - y * y)) - d];   // punto sobre la cara
    const ojos = [-1, 1].map((sx) => malla(new THREE.SphereGeometry(0.019, 12, 10), tinta, cabeza, sobre(sx * 0.05, 0.018), null, [0.85, 1.15, 0.5]));
    const cejas = [-1, 1].map((sx) => malla(new THREE.BoxGeometry(0.045, 0.009, 0.01), pelo, cabeza, sobre(sx * 0.052, 0.062, 0.006)));
    const mejillas = [-1, 1].map((sx) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.02, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color("#f08a7e"), transparent: true, opacity: 0.35, depthWrite: false }));
      const p = sobre(sx * 0.085, -0.03, 0.002); m.position.set(p[0], p[1], p[2]); m.lookAt(sx * 0.3, cy - 0.1, -1); cabeza.add(m); return m;
    });
    const sonrisa = malla(new THREE.TorusGeometry(0.03, 0.0065, 6, 18, Math.PI), "#7a2e2e", cabeza, sobre(0, -0.058, 0.003), [0, 0, Math.PI]);
    const bocaO = malla(new THREE.SphereGeometry(0.022, 12, 10), "#5b1f24", cabeza, sobre(0, -0.064, 0.0), null, [0.8, 1, 0.4]);
    // Pelo
    const capa = malla(new THREE.SphereGeometry(cr * (peinado === "rapado" ? 1.015 : 1.07), 24, 14, 0, Math.PI * 2, 0, Math.PI * (peinado === "rapado" ? 0.44 : 0.53)), pelo, cabeza, [0, cy + 0.005, 0.012], [rad(30), 0, 0]);
    capa.scale.set(1, 1.05, 1);
    if (peinado === "largo") {
      malla(new THREE.CapsuleGeometry(0.115, 0.16, 4, 12), pelo, cabeza, [0, cy - 0.08, 0.06], null, [1.12, 1, 0.75]);
      for (const sx of [-1, 1]) malla(new THREE.CapsuleGeometry(0.04, 0.14, 4, 8), pelo, cabeza, [sx * 0.125, cy - 0.06, 0.0]);
    } else if (peinado === "rizado") {
      const r = azar(31);
      for (let i = 0; i < 22; i++) {
        const y = 0.15 + 0.85 * (i / 21), rr = Math.sqrt(1 - y * y), a = i * 2.399 + r() * 0.3;
        if (Math.sin(a) > 0.05 && y < 0.88) continue;                      // despeja la frente (la cara mira a −z)
        malla(new THREE.SphereGeometry(0.045 + r() * 0.012, 10, 8), pelo, cabeza, [Math.cos(a) * rr * cr * 1.05, cy + 0.02 + y * cr * 1.05, -Math.sin(a) * rr * cr * 1.05 + 0.02]);
      }
    } else if (peinado === "mono") {
      malla(new THREE.SphereGeometry(0.06, 14, 10), pelo, cabeza, [0, cy + cr * 0.95, 0.07]);
    } else if (peinado === "corto") {
      malla(new THREE.SphereGeometry(cr * 0.75, 14, 10), pelo, cabeza, [0.02, cy + 0.085, -0.04], [0, 0, -0.3], [1.15, 0.45, 0.9]);
    }
    if (o.lentes) {
      for (const sx of [-1, 1]) malla(new THREE.TorusGeometry(0.03, 0.005, 6, 18), o.colorLentes || "#1f2937", cabeza, sobre(sx * 0.05, 0.018, 0.016));
      malla(new THREE.BoxGeometry(0.035, 0.005, 0.005), o.colorLentes || "#1f2937", cabeza, sobre(0, 0.022, 0.018));
    }
    // Brazos: huesos que se ubican cada cuadro con IK de dos huesos (hombro → codo → mano).
    const manga = o.manga === "corta" ? piel : ropa;
    const brazos = [-1, 1].map((sx) => ({
      sx,
      hombro: malla(new THREE.SphereGeometry(0.06, 12, 10), ropa, cuerpo),
      brazo: malla(new THREE.CapsuleGeometry(0.048, BRAZO - 0.05, 4, 10), ropa, cuerpo),
      antebrazo: malla(new THREE.CapsuleGeometry(0.042, ANTEBRAZO - 0.09, 4, 10), manga, cuerpo),
      mano: malla(new THREE.SphereGeometry(0.042, 12, 10), piel, cuerpo, null, null, [0.95, 0.8, 1.25]),
    }));

    // ---------- Línea de tiempo de poses ----------
    const segs = [];
    let lista = null;
    const persona = { grupo, cuerpo, torso, cabeza, celular, opciones: o };
    persona.pose = (nombre, desde, hasta = Infinity, opc = {}) => {
      nombre = ALIAS[nombre] || nombre;
      if (!POSES[nombre]) throw new Error("Personaje3D: no hay pose «" + nombre + "» (hay: " + Object.keys(POSES).join(", ") + ")");
      segs.push({ nombre, desde, hasta, trans: opc.trans ?? TRANS[nombre] ?? 0.5, opc });
      lista = null; return persona;
    };
    const armar = () => {
      const s = segs.slice().sort((a, b) => a.desde - b.desde);
      const out = [{ nombre: "respira", desde: -1e9, hasta: s.length ? s[0].desde : Infinity, trans: 0 }];
      s.forEach((g, i) => {
        const fin = Math.min(g.hasta, s[i + 1] ? s[i + 1].desde : Infinity);
        out.push({ ...g, hasta: fin });
        if (s[i + 1] ? fin < s[i + 1].desde : fin < Infinity) out.push({ nombre: "respira", desde: fin, hasta: s[i + 1] ? s[i + 1].desde : Infinity, trans: 0.8 });
      });
      lista = out;
    };

    // Matrices puras (sin tocar la escena) para pasar manos del marco «torso» al de «cuerpo».
    const mTorso = new THREE.Matrix4(), qT = new THREE.Quaternion(), eT = new THREE.Euler(), vT = new THREE.Vector3(), uno = new THREE.Vector3(1, 1, 1);
    const torsoMatriz = (q) => {
      eT.set(q.tI, q.tG, q.tL, "YXZ"); qT.setFromEuler(eT);
      return mTorso.compose(vT.set(PELVIS[0], PELVIS[1], PELVIS[2]), qT, uno);
    };
    const v3 = new THREE.Vector3();
    const aCuerpo = (mano, q) => {
      if (mano.t) { torsoMatriz(q); v3.set(mano.t[0], mano.t[1], mano.t[2]).applyMatrix4(mTorso); return [v3.x, v3.y, v3.z]; }
      return [mano.p[0], mano.p[1], mano.p[2] - q.silla];
    };
    const crudo = (k, t) => {
      const g = lista[k], s = t - g.desde, d = g.hasta - g.desde, v = t + desfase;
      const c = { t, v, s, d: isFinite(d) ? d : 1e6, A, opc: g.opc || {}, tramo: (a, b) => tramo(s, a, b) };
      const q = Object.assign({}, BASE, POSES.respira(c), POSES[g.nombre](c));
      q.tG += 0.02 * Math.sin(v * 0.37); q.cY += 0.025 * Math.sin(v * 0.23 + 0.5);    // vida: nunca del todo quieta
      q.mI = aCuerpo(q.manoI, q); q.mD = aCuerpo(q.manoD, q);
      return q;
    };
    const mezcla = (a, b, w) => {
      const r = {};
      for (const k in b) {
        const x = a[k], y = b[k];
        if (typeof y === "number") r[k] = lerp(x, y, w);
        else if (Array.isArray(y)) r[k] = lerp3(x, y, w);
        else r[k] = y;
      }
      r.agarre = w < 0.5 ? a.agarre : b.agarre;
      return r;
    };
    const evalua = (k, t, prof = 0) => {
      const g = lista[k], cur = crudo(k, t);
      const w = k === 0 || g.trans <= 0 ? 1 : suave((t - g.desde) / g.trans);
      if (w >= 1 || prof > 8) return cur;
      return mezcla(evalua(k - 1, t, prof + 1), cur, w);
    };
    persona.estado = (t) => {
      if (!lista) armar();
      let k = 0;
      while (k + 1 < lista.length && t >= lista[k + 1].desde) k++;
      return evalua(k, t);
    };

    // Parpadeo determinista: cada 2,4–5 s (azar con semilla), dura 0,16 s.
    const parpados = [];
    { const r = azar(101 + indice * 7); let tt = 0.8 + r() * 1.5; while (tt < 900) { parpados.push(tt); tt += 2.4 + r() * 2.6; } }
    const parpadeo = (t) => {
      let lo = 0, hi = parpados.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (parpados[mid] <= t) lo = mid; else hi = mid - 1; }
      const u = (t - parpados[lo]) / 0.16;
      return u < 0 || u > 1 ? 1 : 1 - 0.92 * Math.sin(u * Math.PI);
    };

    // ---------- Aplicar el estado a las mallas ----------
    function hueso(m, a, b) {
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      m.quaternion.setFromUnitVectors(Y, d.normalize());
    }
    const ik = (S, P, polo) => {
      const s = new THREE.Vector3(...S), p = new THREE.Vector3(...P);
      const dv = p.clone().sub(s); let d = dv.length();
      const n = dv.divideScalar(d || 1);
      d = clamp(d, Math.abs(BRAZO - ANTEBRAZO) + 0.02, BRAZO + ANTEBRAZO - 0.005);
      const h = new THREE.Vector3(...polo).normalize();
      const m = h.sub(n.clone().multiplyScalar(h.dot(n))).normalize();
      const cosA = clamp((BRAZO * BRAZO + d * d - ANTEBRAZO * ANTEBRAZO) / (2 * BRAZO * d), -1, 1);
      const E = s.clone().addScaledVector(n, BRAZO * cosA).addScaledVector(m, BRAZO * Math.sqrt(1 - cosA * cosA));
      const Pf = s.clone().addScaledVector(n, d);
      return { S: [s.x, s.y, s.z], E: [E.x, E.y, E.z], P: [Pf.x, Pf.y, Pf.z] };
    };
    const tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), cab = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let ultimo = null;
    persona.actualizar = (t) => {
      const q = persona.estado(t);
      cuerpo.position.set(0, 0, q.silla);
      torso.rotation.set(q.tI, q.tG, q.tL, "YXZ");
      const resp = 1 + 0.012 * Math.sin((t + desfase) * Math.PI * 2 / 3.6);
      pecho.scale.set(1.12 * resp, 1, 0.72 * resp);
      cabeza.rotation.set(q.cX, q.cY, q.cZ, "YXZ");
      // Cara
      const pp = parpadeo(t), abre = q.ojos * pp * (1 - 0.55 * q.feliz);
      ojos.forEach((m) => { m.scale.set(0.85 * q.ojos, Math.max(0.08, 1.15 * abre), 0.5); m.position.y = cy + 0.018 + 0.006 * q.feliz; });
      cejas.forEach((m, i) => {
        const sx = i ? 1 : -1;
        m.position.y = cy + 0.062 + 0.016 * q.ceja + (sx > 0 ? 0.012 * q.asim : 0);
        m.rotation.z = sx * (0.35 * q.pena) - sx * 0.08 * q.feliz;
      });
      const sb = Math.abs(q.boca) * (1 - q.bocaO);
      sonrisa.visible = sb > 0.02;
      sonrisa.rotation.z = q.boca >= 0 ? Math.PI : 0;
      sonrisa.scale.set(0.7 + 0.45 * Math.abs(q.boca), (0.25 + 0.75 * Math.abs(q.boca)) * (1 - q.bocaO), 1);
      sonrisa.position.y = cy - 0.058 + (q.boca < 0 ? -0.012 : 0);
      bocaO.visible = q.bocaO > 0.02; bocaO.scale.set(0.8 * q.bocaO, q.bocaO, 0.4);
      mejillas.forEach((m) => { m.material.opacity = 0.25 + 0.2 * q.feliz; });
      // Brazos (en el marco de «cuerpo»)
      torso.updateMatrix();
      const res = brazos.map((b) => {
        const S = new THREE.Vector3(b.sx * HOMBRO[0], HOMBRO[1], HOMBRO[2]).applyMatrix4(torso.matrix);
        const r = ik([S.x, S.y, S.z], b.sx < 0 ? q.mI : q.mD, b.sx < 0 ? q.codoI : q.codoD);
        b.hombro.position.set(...r.S);
        hueso(b.brazo, r.S, r.E);
        hueso(b.antebrazo, r.E, r.P);
        b.mano.position.set(...r.P);
        b.mano.quaternion.copy(b.antebrazo.quaternion);
        b.mano.rotateX(Math.PI / 2);
        return r;
      });
      // Celular: en la mesa, o en la mano derecha mirando a la cara.
      if (celular.visible) {
        const mesa = new THREE.Vector3(...A.celular);
        if (q.agarre) {
          const P = new THREE.Vector3(...res[1].P).add(new THREE.Vector3(0, 0, q.silla));     // a marco puesto
          cab.set(0, CUELLO + CABEZA_Y, 0).applyMatrix4(torso.matrix).add(new THREE.Vector3(0, 0, q.silla));
          const base = P.clone().add(new THREE.Vector3(0, -0.032, 0));
          const hacia = cab.clone().sub(P).normalize();
          const enMano = P.clone().addScaledVector(hacia, 0.035).add(new THREE.Vector3(0, 0.03, 0));
          celular.position.copy(base.lerp(enMano, q.alza));
          tmpM.lookAt(cab, celular.position, up); tmpQ.setFromRotationMatrix(tmpM);
          celular.quaternion.copy(celMesa).slerp(tmpQ, q.alza);
        } else { celular.position.copy(mesa); celular.quaternion.copy(celMesa); }
      }
      // Pantallas
      if (dibPantalla !== false) { (dibPantalla || pantallaBase)(pctx, pw, ph, t); ptex.needsUpdate = true; }
      if (dibCelular !== false) { (dibCelular || celularBase)(celCtx, 128, 256, t); celTex.needsUpdate = true; dibCelular = dibCelular || false; }
      ultimo = { q, brazos: res };
      return persona;
    };
    let dibPantalla = null, dibCelular = null;
    persona.pantalla = (fn) => { dibPantalla = fn; return persona; };
    persona.pantallaCelular = (fn) => { dibCelular = fn; return persona; };

    // Comprobación: ¿algún brazo o mano atraviesa la mesa (o el teclado) en el instante t? Devuelve [] si no.
    persona.revisa = (t) => {
      persona.actualizar(t);
      const q = ultimo.q, malos = [];
      const caja = { x0: -MESA.ancho / 2, x1: MESA.ancho / 2, y0: MESA.y - MESA.grosor, y1: MESA.y + 0.004, z0: MESA.z1, z1: MESA.z0 };
      const dentro = (p, r) => p[0] > caja.x0 - r && p[0] < caja.x1 + r && p[1] > caja.y0 - r && p[1] < caja.y1 + r && p[2] > caja.z0 - r && p[2] < caja.z1 + r;
      ultimo.brazos.forEach((b, i) => {
        const tramos = [["brazo", b.S, b.E, 0.044], ["antebrazo", b.E, b.P, 0.038], ["mano", b.P, b.P, 0.03]];
        for (const [nom, a, c, r] of tramos) {
          for (let k = 0; k <= 12; k++) {
            const p = lerp3(a, c, k / 12); p[2] += q.silla;              // a marco del puesto
            if (dentro(p, r)) { malos.push((i ? "derecho " : "izquierdo ") + nom); break; }
          }
        }
      });
      return malos;
    };
    persona.ultimo = () => ultimo;                 // { q (estado), brazos: [{S, E, P}] } del último cuadro
    persona.actualizar(0);
    return persona;
  }

  raiz.Personaje3D = { escena, POSES, BASE, ANCLA, MESA, PIELES, PELOS, ROPAS, suave, tramo, hermite, azar, version: "1.0" };
  if (typeof module !== "undefined") module.exports = raiz.Personaje3D;
})(typeof window !== "undefined" ? window : globalThis);
