// Demo del componente Personaje3D (12,5 s, sin voz). Lo usan index.html (render) y prueba.js (revisión en Node).
// En un video real los tiempos salen de W(i)/F[k]; aquí van en segundos porque no hay guion.
(function (raiz) {
  const SECUENCIA = [
    ["escribe", 0.0, 2.4],
    ["mira-celular", 2.4, 4.9],
    ["sorpresa", 4.9, 6.5],
    ["preocupado", 6.5, 8.1],
    ["piensa", 8.1, 9.6],
    ["celebra", 9.6, 11.4],
    ["respira", 11.4, 12.5],
  ];
  const DURACION = 12.5;

  function armarDemo(esc, P) {
    const ana = esc.persona({ piel: 2, pelo: P.PELOS[1], ropa: "#3d62f1", pantalon: "#273449", peinado: "rizado", planta: true });
    SECUENCIA.forEach(([n, a, b]) => ana.pose(n, a, b));

    // Monitor: saldo → alerta roja (desde la sorpresa) → resuelto (en la celebración). Fundido corto entre estados.
    const F = "Archivo, system-ui, sans-serif";
    const estado = (ctx, w, h, t, fondo, fn) => { ctx.fillStyle = fondo; ctx.fillRect(0, 0, w, h); fn(ctx, w, h, t); };
    const saldo = (ctx, w, h, t) => {
      ctx.fillStyle = "#1e293b"; ctx.fillRect(0, 0, w, 50);
      ctx.fillStyle = "#94a3b8"; ctx.font = `600 26px ${F}`; ctx.fillText("Mi cuenta", 24, 34);
      ctx.fillStyle = "#94a3b8"; ctx.font = `600 30px ${F}`; ctx.fillText("Saldo disponible", 36, 120);
      ctx.fillStyle = "#f1f5f9"; ctx.font = `800 92px ${F}`; ctx.fillText("$1,250.00", 32, 220);
      for (let i = 0; i < 9; i++) {
        const v = 40 + 30 * Math.sin(i * 1.3 + 0.6) + 12 * Math.sin(t * 1.5 + i);
        ctx.fillStyle = i === 8 ? "#7b86f0" : "#334155"; ctx.fillRect(40 + i * 62, 360 - v, 40, v);
      }
    };
    const alerta = (ctx, w, h, t) => {
      const lat = 0.75 + 0.25 * Math.sin(t * 6);
      ctx.fillStyle = `rgba(240,82,82,${0.2 * lat})`; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#f05252"; ctx.lineWidth = 10; ctx.strokeRect(14, 14, w - 28, h - 28);
      ctx.fillStyle = "#f05252"; ctx.beginPath(); ctx.moveTo(80, 150); ctx.lineTo(130, 62); ctx.lineTo(180, 150); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#0f172a"; ctx.font = `800 64px ${F}`; ctx.fillText("!", 118, 140);
      ctx.fillStyle = "#f05252"; ctx.font = `800 58px ${F}`; ctx.fillText("Alerta", 210, 128);
      ctx.fillStyle = "#f1f5f9"; ctx.font = `700 34px ${F}`; ctx.fillText("Movimiento no reconocido", 50, 230);
      ctx.fillStyle = "#f05252"; ctx.font = `800 86px ${F}`; ctx.fillText("−$0.01", 50, 336);
    };
    const resuelto = (ctx, w, h) => {
      ctx.fillStyle = "#22c55e"; ctx.beginPath(); ctx.arc(w / 2, 140, 76, 0, 7); ctx.fill();
      ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 18; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(w / 2 - 34, 142); ctx.lineTo(w / 2 - 6, 170); ctx.lineTo(w / 2 + 38, 112); ctx.stroke();
      ctx.fillStyle = "#f1f5f9"; ctx.font = `800 66px ${F}`; ctx.textAlign = "center"; ctx.fillText("Resuelto", w / 2, 290);
      ctx.fillStyle = "#94a3b8"; ctx.font = `600 32px ${F}`; ctx.fillText("Todo en orden", w / 2, 340); ctx.textAlign = "left";
    };
    const capas = [[-1, "#0f172a", saldo], [4.9, "#160d16", alerta], [9.6, "#0b1a14", resuelto]];
    ana.pantalla((ctx, w, h, t) => {
      let k = 0; while (k + 1 < capas.length && t >= capas[k + 1][0]) k++;
      estado(ctx, w, h, t, capas[k][1], capas[k][2]);
      const u = (t - capas[k][0]) / 0.25;
      if (k > 0 && u < 1) { ctx.globalAlpha = 1 - u; estado(ctx, w, h, t, capas[k - 1][1], capas[k - 1][2]); ctx.globalAlpha = 1; }
    });
    // Celular: llega una notificación del banco mientras lo mira.
    ana.pantallaCelular((ctx, w, h, t) => {
      ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, w, h);
      const u = P.tramo(t, 3.3, 3.6);
      if (u <= 0) return;
      ctx.globalAlpha = u;
      ctx.fillStyle = "#f1f5f9"; ctx.fillRect(8, 40 - 20 * (1 - u), w - 16, 92);
      ctx.fillStyle = "#f05252"; ctx.beginPath(); ctx.arc(30, 66 - 20 * (1 - u), 12, 0, 7); ctx.fill();
      ctx.fillStyle = "#0f172a"; ctx.font = `800 20px ${F}`; ctx.fillText("Banco", 50, 73 - 20 * (1 - u));
      ctx.fillStyle = "#f05252"; ctx.font = `800 30px ${F}`; ctx.fillText("−$0.01", 18, 114 - 20 * (1 - u));
      ctx.globalAlpha = 1;
    });

    // Cámara: por encima del hombro (se ve la pantalla) → 3/4 de frente para las caras → vuelve atrás en la celebración.
    const M = [-0.22, 0.66, -0.25];
    esc.camara([
      { t: 0.0, angulo: 158, altura: 2.27, distancia: 4.60, mira: [0, 0.66, -0.4], fov: 34 },
      { t: 1.4, angulo: 150, altura: 2.24, distancia: 4.75 },
      { t: 3.8, angulo: 40, altura: 1.95, distancia: 5.24, mira: M },
      { t: 5.2, angulo: 34, altura: 1.89, distancia: 4.92 },
      { t: 6.8, angulo: 30, altura: 1.82, distancia: 5.03, mira: [-0.22, 0.72, -0.2] },
      { t: 8.6, angulo: 48, altura: 1.89, distancia: 4.82, mira: M },
      { t: 9.6, angulo: 62, altura: 1.95, distancia: 5.14 },
      { t: 11.0, angulo: 138, altura: 2.27, distancia: 4.92, mira: [0, 0.68, -0.4] },
      { t: 12.5, angulo: 124, altura: 2.41, distancia: 5.46 },
    ]);
    return ana;
  }
  raiz.DEMO = { SECUENCIA, DURACION, armarDemo };
  if (typeof module !== "undefined") module.exports = raiz.DEMO;
})(typeof window !== "undefined" ? window : globalThis);
