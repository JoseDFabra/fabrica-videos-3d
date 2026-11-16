// Demo del componente Gente3D (10 s, sin voz). La usan index.html (render) y prueba.js (revisión en Node).
// Una fila de 40 personas fastidiadas sobre un piso que es una página web; la cámara arranca en una cara y sube como
// un dron; 3 cajas con barras que se llenan a rojo; aparece una 4.ª, el portero señala y la gente se reparte.
// En un video real los tiempos salen de W(i)/F[k]; aquí van en segundos porque no hay guion.
(function (raiz) {
  const DURACION = 10;
  const CARRIL = [-2.25, -0.75, 0.75, 2.25];       // x de cada caja (y de su fila)
  const CAJA_Z = 5.7, FRENTE = 4.85, SEP = 0.78;   // la gente mira a +z (hacia las cajas)
  const CUANTOS = [13, 13, 14];
  const ABRE = 5.5;                                // aparece la 4.ª caja
  const HEROE = { carril: 1, i: 4 };

  function armarDemo(esc, G) {
    const r = G.azar(42);
    esc.pagina({ ancho: 8.6, largo: 15, centro: [0.35, -0.2], url: "boletas.com/fila-virtual", titulo: "Preventa", boton: "COMPRAR" });

    // Cajas: tres desde el principio, la cuarta aparece con un pop.
    const barras = [
      [[0, 0.4], [2.4, 0.62], [4.5, 1], [6.6, 1], [9.5, 0.82]],
      [[0, 0.46], [2.4, 0.7], [4.3, 1], [6.6, 1], [9.5, 0.86]],
      [[0, 0.52], [2.4, 0.76], [4.1, 1], [6.2, 1], [8.6, 0.52], [10, 0.5]],
      [[ABRE, 0], [6.6, 0.12], [9.2, 0.46], [10, 0.48]],
    ];
    const cajas = CARRIL.map((x, k) => esc.caja({ en: [x, CAJA_Z], giro: 180, barra: barras[k], acento: "#3d62f1",
      cajero: { piel: [1, 4, 2, 5][k], peinado: ["corto", "mono", "rapado", "rizado"][k], ropa: "#334155" } }));
    cajas[3].aparece(ABRE);

    // La fila: 40 personas con un estado principal (mezcla con semilla) y un segundo estado más tarde.
    const ESTADOS = ["espera-fastidio", "espera-fastidio", "mira-reloj", "celular", "celular", "impaciente", "impaciente", "bosteza", "respira"];
    const filas = CUANTOS.map((n, c) => Array.from({ length: n }, (_, i) => {
      const x = CARRIL[c] + (r() - 0.5) * 0.12, z = FRENTE - i * SEP + (r() - 0.5) * 0.1;
      const heroe = c === HEROE.carril && i === HEROE.i;
      const p = esc.persona({ en: [x, z], giro: heroe ? 4 : (r() - 0.5) * 16, semilla: c * 100 + i, altura: heroe ? 1 : undefined, peinado: heroe ? "rizado" : undefined, pelo: heroe ? 1 : undefined, piel: heroe ? 2 : undefined, ropa: heroe ? "#2a9d8f" : undefined });
      const e1 = ESTADOS[Math.floor(r() * ESTADOS.length)], e2 = ESTADOS[Math.floor(r() * ESTADOS.length)];
      const cambio = 3 + r() * 3;
      p.estado(e1, 0, cambio).estado(e2, cambio);
      p.carril = c; p.puesto = i;
      return p;
    }));
    // Primer plano: la cara fastidiada del gancho y sus vecinos (estados elegidos a mano para que se lean).
    const heroe = filas[HEROE.carril][HEROE.i];
    heroe.limpiar().estado("espera-fastidio", -1, 6.2).estado("impaciente", 6.2, 8.4).estado("espera-fastidio", 8.4);
    filas[1][5].limpiar().estado("celular", -1, 7).globo("...", 1.7, 3.4);
    filas[2][4].limpiar().estado("mira-reloj", -1, 5.2).globo("reloj", 0.6, 3.4);
    filas[0][4].limpiar().estado("bosteza", -1, 6).globo("zzz", 0.9, 3.6);
    filas[0][7].globo("!", 3.6, 5.6); filas[1][9].globo("zzz", 3.8, 6); filas[2][10].globo("reloj", 4, 6.2);

    // Reparto: en la fila 3 los puestos 1–5 se pasan a la 4.ª caja y los de atrás avanzan; los últimos de la fila 2
    // se pasan a la cola de la fila 3. Las trayectorias son paralelas: nadie atraviesa a nadie.
    const zDe = (i) => FRENTE - i * SEP;
    const f3 = filas[2], f2 = filas[1];
    for (let i = 1; i <= 5; i++) {
      const p = f3[i], t0 = ABRE + 0.35 + (i - 1) * 0.18, t1 = t0 + 1.55;
      p.ir([CARRIL[3] + (r() - 0.5) * 0.1, zDe(i - 1)], t0, t1).gira(0, t1 + 0.05, 0.4);
      p.estado("feliz", t1 + 0.1, t1 + 2.4).estado(i < 3 ? "celebra" : "respira", t1 + 2.4);
      if (i === 1) p.globo("ok", t1 + 0.1, t1 + 1.8);
    }
    for (let i = 6; i < f3.length; i++) {
      const p = f3[i], t0 = ABRE + 1.6 + (i - 6) * 0.08, t1 = t0 + 1.8;
      p.ir([CARRIL[2] + (r() - 0.5) * 0.1, zDe(i - 5)], t0, t1).gira(0, t1 + 0.05, 0.4);
      p.estado("respira", t1 + 0.1, t1 + 1).estado("feliz", t1 + 1);
    }
    for (let i = 10; i < f2.length; i++) {
      const p = f2[i], k = i - 10, t0 = ABRE + 2.9 + k * 0.15, t1 = t0 + 1.5;
      const dest = zDe(f3.length - 5 + k);
      p.ir([[CARRIL[1] + 0.55, p.posicion(0)[1] + 0.25], [CARRIL[2] + (r() - 0.5) * 0.1, dest]], t0, t1).gira(0, t1 + 0.05, 0.4);
      p.estado("respira", t1 + 0.1);
    }

    // Portero: con chaleco, a la derecha de la fila; señala la caja 3 y, cuando abre la 4.ª, la señala a ella.
    const portero = esc.portero({ en: [3.7, 4.4], giro: -90, piel: 4, peinado: "corto", altura: 1.1 });
    portero.estado("impaciente", 0, ABRE + 0.2);
    portero.apunta([[ABRE, CARRIL[3], 0.9, 4.2], [DURACION, CARRIL[3], 0.9, 4.2]], ABRE + 0.2, DURACION);

    // Solicitudes: sobres que viajan de la primera persona de cada fila a su caja.
    for (let c = 0; c < 4; c++) {
      const desde = c < 3 ? 3.2 + c * 0.35 : ABRE + 1.2;
      for (let t = desde; t < DURACION - 0.9; t += c < 3 ? 1.25 : 0.8) {
        const quien = c < 3 ? filas[c][0] : f3[1];
        esc.paquete({ de: (tt) => quien.punto("pecho", tt), a: cajas[c].punto(0), desde: t, hasta: t + 0.85, arco: 0.6, tam: 1.5, icono: "sobre" });
      }
    }

    // Cámara: frente a la cara fastidiada (entre ella y quien va delante) → dron que sube a ver la página entera →
    // baja un poco hacia la 4.ª caja para ver el reparto.
    const h = heroe.posicion(0);
    esc.camara([
      { t: 0.0, angulo: -42, altura: 1.3, distancia: 1.12, mira: [h[0], 1.2, h[1]], fov: 40 },
      { t: 1.3, angulo: -36, altura: 1.42, distancia: 1.32, mira: [h[0], 1.18, h[1]] },
      { t: 2.2, angulo: -20, altura: 3.8, distancia: 2.7, mira: [h[0] * 0.6, 0.9, h[1] + 0.2] },
      { t: 3.8, angulo: 2, altura: 13.6, distancia: 8.2, mira: [0.6, 0, 0.9], fov: 48 },
      { t: 5.4, angulo: -3, altura: 13.3, distancia: 8.0, mira: [0.75, 0, 1.2] },
      { t: 7.6, angulo: -10, altura: 11.2, distancia: 7.6, mira: [1.0, 0.2, 1.6] },
      { t: 10, angulo: -14, altura: 10.2, distancia: 7.3, mira: [1.1, 0.3, 1.9] },
    ]);
    return { heroe, cajas, filas, portero };
  }
  raiz.DEMO = { DURACION, ABRE, armarDemo };
  if (typeof module !== "undefined") module.exports = raiz.DEMO;
})(typeof window !== "undefined" ? window : globalThis);
