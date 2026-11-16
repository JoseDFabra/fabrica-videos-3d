// Revisión de la demo sin navegador, cuadro a cuadro (30 fps): gente que se atraviesa, saltos por cuadro, encuadre
// de la cara del gancho y costo de CPU con 150 personas.   node pruebas/gente-3d/prueba.js
const path = require("path");
const nada = new Proxy(function () {}, { get: (o, k) => (k === Symbol.toPrimitive ? () => 0 : nada), apply: () => nada, set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => nada, style: {} }), querySelector: () => null };
globalThis.THREE = require(path.join(__dirname, "lib/vendor/three-r158.min.js"));
const G = require(path.join(__dirname, "../../componentes/gente3d.js"));
const D = require(path.join(__dirname, "demo.js"));

const esc = G.escena(null, { ancho: 1080, alto: 1920, piso: false });
const d = D.armarDemo(esc, G);
const gente = esc.personas.filter((p) => !p.opciones.sentado);
let minD = [9, 0, ""], salto = [0, 0, 0], antes = null, cara = null;
const choques = new Set();
for (let f = 0; f <= Math.round(D.DURACION * 30); f++) {
  const t = f / 30;
  esc.dibujar(t);
  const pos = gente.map((p) => p.posicion(t));
  for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
    const dd = Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]);
    if (dd < minD[0]) minD = [dd, t, i + "↔" + j];
    if (dd < 0.45) choques.add(t.toFixed(2) + " " + i + "↔" + j + " " + dd.toFixed(2));
  }
  const ahora = gente.map((p) => [p.punto("mano"), p.punto("manoI"), p.punto("cabeza")]);
  if (antes) ahora.forEach((ps, i) => ps.forEach((p, k) => {
    const dd = Math.hypot(p[0] - antes[i][k][0], p[1] - antes[i][k][1], p[2] - antes[i][k][2]);
    if (dd > salto[0]) salto = [dd, t, i + ["mano", "manoI", "cabeza"][k]];
  }));
  antes = ahora;
  if (f === 0) { const a = esc.aPantalla(d.heroe.punto("cara")), b = esc.aPantalla(d.heroe.punto("cabeza")); cara = { cara: [Math.round(a.x), Math.round(a.y)], coronilla: [Math.round(b.x), Math.round(b.y)] }; }
}
console.log("personas de pie: %d (+%d cajeros)", gente.length, esc.personas.length - gente.length);
console.log("menor distancia entre dos personas: %s m en t=%s (%s)", minD[0].toFixed(2), minD[1].toFixed(2), minD[2]);
console.log("cuadros con dos personas a < 0,45 m:", choques.size ? [...choques].slice(0, 15).join("\n  ") : "ninguno");
console.log("mayor salto por cuadro (mano/cabeza): %s m en t=%s (%s)", salto[0].toFixed(3), salto[1].toFixed(2), salto[2]);
console.log("cara del gancho en t=0 (px):", cara);

// Costo de CPU con 150 personas (sin GPU: solo estados + matrices).
const e2 = G.escena(null, { piso: false });
const E = ["espera-fastidio", "mira-reloj", "celular", "bosteza", "impaciente", "feliz", "celebra", "respira"];
e2.gente(150, (i) => ({ en: [(i % 15) - 7, Math.floor(i / 15) - 5] })).forEach((p, i) => { p.estado(E[i % 8], 0, 3).estado(E[(i + 3) % 8], 3); if (i % 5 === 0) p.ir([(i % 15) - 6, 4], 1, 4); });
e2.dibujar(0);
const t0 = process.hrtime.bigint();
for (let f = 0; f < 300; f++) e2.dibujar(f / 30);
console.log("150 personas: %s ms de CPU por cuadro; %d mallas/draw calls de gente", (Number(process.hrtime.bigint() - t0) / 1e6 / 300).toFixed(2),
  e2.grupo.children.filter((m) => m.isInstancedMesh).length);
