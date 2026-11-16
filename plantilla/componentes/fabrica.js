// Piezas reutilizables para composiciones HyperFrames 1080×1920 (sacadas de los videos 02–12 de Cocotienda).
//
//   const fx = Fabrica.crear("id-de-la-composicion");   // timeline + atajos, lee window.TIEMPOS (tiempos.js)
//   fx.entra("#foto", fx.W(12));  fx.sale("#foto", fx.F[3]);  fx.subtitulos();  fx.fin();
//
// Reglas de HyperFrames que esto ya respeta (ver README de la fábrica):
//  - lo que ENTRA va sin immediateRender:false; lo que SALE o se mueve después, con él (si no, sale en blanco).
//  - todo lo que se dibuja en canvas sale de fórmulas del tiempo con azar de semilla fija (cada cuadro se pide suelto).
//  - nada de Math.random ni Date: el render tiene que dar lo mismo cada vez.
(function () {
  const $ = (s) => (typeof s === "string" ? document.querySelector(s) : s);
  const $$ = (s) => document.querySelectorAll(s);

  // Azar con semilla (mulberry32).
  const azar = (semilla) => () => {
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ruido = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

  function crear(id, opciones = {}) {
    const T = window.TIEMPOS;
    const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
    const W = (i) => T.w[i].inicio;     // cuándo empieza la palabra i del guion
    const Wf = (i) => T.w[i].fin;       // cuándo termina
    const F = T.frases;                 // cuándo empieza cada frase/escena
    const relojes = [];                 // funciones (segundos) => dibujar, para canvas

    const fx = { tl, T, W, Wf, F, $, $$, azar, ruido };

    // ---------- Entradas y salidas ----------
    fx.entra = (sel, t, desde = { y: 40 }, d = 0.35, ease = "back.out(1.6)") =>
      tl.fromTo(sel, { opacity: 0, ...desde }, { opacity: 1, x: 0, y: 0, xPercent: 0, yPercent: 0, scale: 1, rotation: 0, duration: d, ease }, t);
    fx.sale = (sel, t, d = 0.2) =>
      tl.fromTo(sel, { opacity: 1 }, { opacity: 0, duration: d, ease: "power2.in", immediateRender: false }, t);
    // Ken Burns: zoom lento sobre una foto mientras está en pantalla.
    fx.kb = (sel, t, d, a = 1, b = 1.14, x = 0) =>
      tl.fromTo(sel, { scale: a, xPercent: 0 }, { scale: b, xPercent: x, duration: d, ease: "none", immediateRender: false }, t);
    // Sello: cae grande y golpea (años, «CASI IMPOSIBLE»).
    fx.sello = (sel, t, rot = -8) =>
      tl.fromTo(sel, { opacity: 0, scale: 2.3, rotation: rot }, { opacity: 1, scale: 1, rotation: rot, duration: 0.26, ease: "power4.in" }, t);
    // Sacudida corta de cámara (va con un «golpe» en el audio).
    fx.sacude = (t, sel = "#camara", f = 1) =>
      tl.fromTo(sel, { x: 0, y: 0 }, { keyframes: [{ x: 12 * f, y: -7 * f }, { x: -9 * f, y: 6 * f }, { x: 5 * f, y: -3 * f }, { x: 0, y: 0 }],
        duration: 0.16, ease: "none", immediateRender: false }, t);
    // Cambio de escena: la vieja se apaga, la nueva entra con zoom y sigue respirando.
    fx.escena = (vieja, nueva, t, dura = 2) => {
      if (vieja) fx.sale(vieja, t);
      if (nueva) tl.fromTo(nueva, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.32, ease: "expo.out" }, t + 0.08)
        .fromTo(nueva, { scale: 1 }, { scale: 1.05, duration: dura, ease: "sine.inOut", immediateRender: false }, t + 0.4);
    };
    // Empujón: se acerca de golpe y vuelve.
    fx.empuje = (sel, t, z = 1.22) =>
      tl.fromTo(sel, { scale: 1 }, { scale: z, duration: 0.45, ease: "expo.out", immediateRender: false }, t)
        .fromTo(sel, { scale: z }, { scale: 1, duration: 0.5, ease: "power2.inOut", immediateRender: false }, t + 0.5);
    // Rebote al aparecer (squash & stretch) desde la base.
    fx.brota = (sel, t, d = 0.5) =>
      tl.fromTo(sel, { opacity: 0, scaleX: 1.25, scaleY: 0.3, transformOrigin: "50% 100%" },
        { opacity: 1, scaleX: 1, scaleY: 1, duration: d, ease: "elastic.out(1, 0.45)" }, t);
    // Tecleo en un elemento de texto.
    fx.teclea = (sel, texto, t, d = 0.5, desde = 0, cursor = "|") => {
      const o = { c: desde };
      tl.fromTo(o, { c: desde }, { c: texto.length, duration: d, ease: "none", immediateRender: false,
        onUpdate() { $(sel).textContent = texto.slice(0, Math.round(o.c)) + cursor; } }, t);
    };
    // Contador numérico (de a hasta b) con formato.
    fx.cuenta = (sel, a, b, t, d = 0.8, fmt = (n) => Math.round(n).toLocaleString("es-CO")) => {
      const o = { n: a };
      tl.fromTo(o, { n: a }, { n: b, duration: d, ease: "power2.out", immediateRender: false,
        onUpdate() { $(sel).textContent = fmt(o.n); } }, t);
    };

    // ---------- Cámara sobre un lienzo grande (estilo «una sola toma») ----------
    // El lienzo (#lienzo) es más grande que el cuadro; la cámara viaja a un punto (x, y) del lienzo con un zoom.
    // fx.camara(t, { x: 540, y: 2400, z: 1.4 }, 0.8)  → centra ese punto en pantalla.
    fx.camara = (t, { x, y, z = 1 }, d = 0.8, ease = "power3.inOut", sel = "#lienzo") => {
      tl.to(sel, { x: 540 - x * z, y: 960 - y * z, scale: z, transformOrigin: "0 0", duration: d, ease }, t);
    };
    fx.camaraEn = (t, { x, y, z = 1 }, sel = "#lienzo") => tl.set(sel, { x: 540 - x * z, y: 960 - y * z, scale: z, transformOrigin: "0 0" }, t);

    // ---------- Rótulo técnico con línea (CLAVO, MAZA…) ----------
    // fx.rotulo("#r-pdf", t): el elemento lleva .rotulo con un <i class="linea"> y un <span>; la línea se dibuja y el texto aparece.
    fx.rotulo = (sel, t) => {
      const el = $(sel);
      tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.01 }, t)
        .fromTo(el.querySelector(".linea"), { scaleX: 0 }, { scaleX: 1, duration: 0.25, ease: "power2.out" }, t)
        .fromTo(el.querySelector("span"), { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.2, ease: "power2.out" }, t + 0.15);
    };

    // ---------- Subtítulos palabra por palabra ----------
    // estilo "color": la palabra dicha se pinta de acento (y se queda si es clave).
    // estilo "karaoke": las que vienen en gris, las dichas en blanco; las claves con caja de selección (estilo Figma).
    // cajas: false → en karaoke las palabras clave se pintan de color (claveColor) en vez de llevar la caja azul.
    fx.subtitulos = ({ sel = "#subs", hasta = Infinity, estilo = "color", acento = "#ff5a36", base = "#f8fafc", cajas = true, claveColor = "#ffd84d" } = {}) => {
      const subs = $(sel), fondo = $("#subs-fondo");
      T.subtitulos.forEach((g, gi) => {
        if (g.inicio >= hasta) return;
        const el = document.createElement("div");
        el.className = "grupo " + estilo;
        g.palabras.forEach((p) => {
          const s = document.createElement("span");
          s.textContent = p.t;
          if (estilo === "karaoke" && p.clave && cajas) s.innerHTML = `<b class="sel">${p.t}<i></i><i></i><i></i><i></i></b>`;
          el.appendChild(s);
        });
        subs.appendChild(el);
        const sigue = T.subtitulos[gi + 1];
        const entra = (k) => k === 0 ? 0 : T.subtitulos[k].inicio - 0.04;
        // Si la frase siguiente llega pronto, el texto se queda hasta que entre; si no, se va a los 0,4 s.
        const corto = sigue && entra(gi + 1) - (g.fin + 0.4) < 0.6;
        const fin = Math.min(sigue ? (corto ? entra(gi + 1) : g.fin + 0.4) : g.fin + 0.4, hasta);
        // La píldora (#subs-fondo) se esconde cuando no hay texto: si no, queda una barra negra vacía entre frases.
        // Va con visibility para no pelear con los videos que la apagan con opacity (sinSubs).
        if (fondo) {
          if (gi === 0 && g.inicio > 0.16) tl.set(fondo, { visibility: "hidden" }, 0).set(fondo, { visibility: "visible" }, g.inicio - 0.04);
          if (!sigue || sigue.inicio >= hasta) tl.set(fondo, { visibility: "hidden" }, fin);
          else if (!corto) tl.set(fondo, { visibility: "hidden" }, fin).set(fondo, { visibility: "visible" }, entra(gi + 1));
        }
        if (gi === 0) tl.set(el, { opacity: 1, y: 0 }, 0);
        else tl.fromTo(el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.12, ease: "expo.out", immediateRender: false }, g.inicio - 0.04);
        tl.set(el, { opacity: 0 }, fin);
        g.palabras.forEach((p, pi) => {
          const s = el.children[pi];
          if (estilo === "karaoke") {
            tl.set(s, p.clave && !cajas ? { opacity: 1, color: claveColor } : { opacity: 1 }, p.inicio);
            const caja = s.querySelector(".sel");
            if (caja) tl.fromTo(caja, { "--caja": 0 }, { "--caja": 1, duration: 0.18, ease: "power2.out", immediateRender: false }, p.inicio);
          } else {
            tl.set(s, { color: acento }, p.inicio).fromTo(s, { scale: 1.08 }, { scale: 1, duration: 0.14, ease: "expo.out", immediateRender: false }, p.inicio);
            if (!p.clave) tl.set(s, { color: base }, p.fin);
          }
        });
      });
    };

    // ---------- Fondos y efectos en canvas ----------
    // Reloj único: todo lo dibujado en canvas se actualiza desde aquí.
    fx.dibuja = (fn) => { relojes.push(fn); fn(0); };

    // Cielo con estrellas que titilan y bajan despacio.
    fx.cielo = (sel = "#cielo", n = 170) => {
      const c = $(sel).getContext("2d"), r = azar(7), estrellas = [];
      for (let i = 0; i < n; i++) estrellas.push({ x: r() * 1080, y: r() * 1920, t: 0.8 + r() * 2.2, f: r() * 6.28, v: 4 + r() * 10, c: r() < 0.15 });
      fx.dibuja((a) => {
        c.clearRect(0, 0, 1080, 1920);
        for (const e of estrellas) {
          c.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(a * e.t + e.f));
          c.fillStyle = e.c ? "#ffd8c8" : "#e2e8f0";
          c.beginPath(); c.arc(e.x, ((e.y - a * e.v) % 1920 + 1920) % 1920, e.c ? 2.4 : 1.6, 0, Math.PI * 2); c.fill();
        }
        c.globalAlpha = 1;
      });
    };

    // Fuegos artificiales con física (cohete, estallido esférico, gravedad con aire, estelas, chisporroteo).
    // caida = (v − G/K)(1 − e^(−Ks))/K + G·s/K  (y crece hacia abajo).
    const shows = [];
    let lienzoFuegos = null;
    fx.fuego = (x, y, t, n = 22, r = 240, pre = 0) => {
      if (!lienzoFuegos) {
        const cont = $("#fuegos") || document.body;
        const cv = document.createElement("canvas");
        cv.width = 1080; cv.height = 1920; cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
        cont.appendChild(cv);
        lienzoFuegos = cv.getContext("2d");
        fx.dibuja(dibujarFuegos);
      }
      const colores = opciones.colores || ["#ff5a36", "#ffb020", "#17a04a", "#0a84ff", "#e0457b", "#ffd84d"];
      const rnd = azar(Math.round(x * 7 + y * 13 + t * 1000));
      const c1 = colores[Math.floor(rnd() * colores.length)];
      const c2 = rnd() < 0.5 ? c1 : colores[Math.floor(rnd() * colores.length)];
      const estrellas = [];
      for (let i = 0, m = n * 4; i < m; i++) {
        const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, h = Math.sqrt(1 - z * z), v = r * K * (0.9 + rnd() * 0.2);
        estrellas.push({ vx: Math.cos(a) * h * v, vy: Math.sin(a) * h * v, vida: 1.3 + rnd() * 0.7 * Math.sqrt(r / 240),
          color: i % 3 === 0 ? c2 : c1, tam: 4.6 + rnd() * 2.6, semilla: rnd() * 1000 });
      }
      shows.push({ x, y, t, r, pre: pre * 0.55, estrellas, cohete: pre === 0, deriva: (rnd() - 0.5) * 90, crepita: rnd() < 0.6, semilla: rnd() * 1000 });
    };
    const G = 720, K = 2.3, SUBIDA = 0.7;
    const avance = (v, s) => v * (1 - Math.exp(-K * s)) / K;
    const caida = (v, s) => (v - G / K) * (1 - Math.exp(-K * s)) / K + G * s / K;
    function dibujarFuegos(ahora) {
      const ctx = lienzoFuegos;
      const punto = (px, py, rad, color, alfa) => { ctx.globalAlpha = alfa; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill(); };
      ctx.clearRect(0, 0, 1080, 1920);
      ctx.lineCap = "round";
      for (const f of shows) {
        const s = ahora - f.t + f.pre;
        if (f.cohete && s > -SUBIDA && s < 0.05) {
          const y0 = 2000, x0 = f.x + f.deriva;
          const sube = (u) => { const k = Math.min(Math.max(u / SUBIDA, 0), 1), e = 1 - (1 - k) * (1 - k); return [x0 + (f.x - x0) * e, y0 + (f.y - y0) * e]; };
          const u = s + SUBIDA;
          for (let j = 0; j < 26; j++) {
            const ue = u - j * 0.018;
            if (ue < 0) break;
            const [cx, cy] = sube(ue), edad = u - ue;
            punto(cx + (ruido(f.semilla, j) - 0.5) * 84 * edad, cy + 0.5 * G * edad * edad, 4.2 * (1 - edad / 0.5), j % 3 ? "#ffb020" : "#ff5a36", Math.max(0, 1 - edad / 0.47));
          }
          if (s < 0) { const [cx, cy] = sube(u); punto(cx, cy, 16, "#ffb020", 0.3); punto(cx, cy, 7, "#ff9a1f", 1); punto(cx, cy, 3.5, "#fff4c2", 1); }
        }
        if (s < 0 || s > 2.6) continue;
        if (s < 0.3) {
          const k = s / 0.3, rad = f.r * (0.35 + 0.5 * k);
          const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
          g.addColorStop(0, "rgba(255,246,210,1)"); g.addColorStop(0.35, "rgba(255,197,61,0.6)"); g.addColorStop(1, "rgba(255,197,61,0)");
          ctx.globalAlpha = 1 - k; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, rad, 0, Math.PI * 2); ctx.fill();
        }
        for (const e of f.estrellas) {
          if (s > e.vida) continue;
          const vida = s / e.vida;
          let alfa = vida < 0.6 ? 1 : 1 - (vida - 0.6) / 0.4;
          if (vida > 0.5) alfa *= ruido(e.semilla, Math.floor(ahora * 30)) > 0.35 ? 1 : 0.2;
          const at = (q) => [f.x + avance(e.vx, q), f.y + caida(e.vy, q)];
          const [hx, hy] = at(s);
          for (let k = 0; k < 9; k++) {
            const q1 = s - k * 0.035, q2 = s - (k + 1) * 0.035;
            if (q2 < 0) break;
            const [ax, ay] = at(q1), [bx, by] = at(q2);
            ctx.globalAlpha = alfa * (1 - k / 9) * 0.85; ctx.strokeStyle = e.color;
            ctx.lineWidth = e.tam * 1.1 * (1 - k / 10) * (1 - vida * 0.45);
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          }
          const tam = e.tam * (1 - vida * 0.55);
          punto(hx, hy, tam * 3, e.color, alfa * 0.22);
          punto(hx, hy, tam, s < 0.08 ? "#fff6d2" : e.color, alfa);
          if (f.crepita && vida > 0.7) for (let c = 0; c < 3; c++) {
            const ang = ruido(e.semilla, c) * Math.PI * 2, d = (vida - 0.7) * 90 * (0.5 + ruido(c, e.semilla));
            if (ruido(e.semilla + c, Math.floor(ahora * 24)) > 0.45) punto(hx + Math.cos(ang) * d, hy + Math.sin(ang) * d + (vida - 0.7) * 40, 2.6, "#f59e0b", alfa);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // ---------- Personaje vivo (PNG con movimiento secundario) ----------
    // Se mece desde la base, respira (squash leve) y puede saltar, celebrar o asustarse en un momento dado.
    // fx.personaje("#palmerita", { desde: 0, hasta: T.duracion });  fx.salta("#palmerita", t);
    fx.personaje = (sel, { desde = 0, hasta = T.duracion, mece = 3, ritmo = 1.1 } = {}) => {
      const el = $(sel), o = { s: 0 };
      gsap.set(el, { transformOrigin: "50% 100%" });
      tl.fromTo(o, { s: 0 }, { s: hasta - desde, duration: hasta - desde, ease: "none", immediateRender: false, onUpdate() {
        const a = o.s * Math.PI * 2 / ritmo;
        el.style.setProperty("--mece", (mece * Math.sin(a * 0.5)).toFixed(3) + "deg");
        el.style.setProperty("--respira", (1 + 0.025 * Math.sin(a)).toFixed(4));
      } }, desde);
    };
    // Saltos y temblores van sobre .salto (si existe), así no pelean con mover o escalar el personaje entero.
    const capa = (sel) => (typeof sel === "string" && $(sel) && $(sel).querySelector(".salto")) || sel;
    fx.salta = (sel, t, alto = 120) =>
      tl.fromTo(capa(sel), { y: 0 }, { keyframes: [{ y: 0, scaleY: 0.8, scaleX: 1.12, duration: 0.1 }, { y: -alto, scaleY: 1.12, scaleX: 0.92, duration: 0.22, ease: "power2.out" },
        { y: 0, scaleY: 1, scaleX: 1, duration: 0.22, ease: "power2.in" }, { scaleY: 0.88, scaleX: 1.08, duration: 0.07 }, { scaleY: 1, scaleX: 1, duration: 0.12 }],
        immediateRender: false }, t);
    fx.tiembla = (sel, t, d = 0.5) =>
      tl.fromTo(capa(sel), { x: 0 }, { keyframes: Array.from({ length: 10 }, (_, k) => ({ x: k % 2 ? -6 : 6 })).concat([{ x: 0 }]), duration: d, ease: "none", immediateRender: false }, t);
    // Cambia de pose: las poses son <img> hermanas dentro del personaje; se muestra solo la que toca.
    fx.pose = (sel, nombre, t) => {
      $$(sel + " [data-pose]").forEach((p) => tl.set(p, { opacity: p.dataset.pose === nombre ? 1 : 0 }, t));
    };

    // ---------- Cierre ----------
    fx.fin = () => {
      const o = { s: 0 };
      tl.fromTo(o, { s: 0 }, { s: T.duracion, duration: T.duracion, ease: "none", immediateRender: false,
        onUpdate() { relojes.forEach((fn) => fn(o.s)); } }, 0);
      tl.to("#root", { opacity: 1, duration: 0.01 }, T.duracion - 0.01);
      window.__timelines = window.__timelines || {};
      window.__timelines[id] = tl;
      return tl;
    };
    return fx;
  }

  window.Fabrica = { crear, azar, ruido };
})();
