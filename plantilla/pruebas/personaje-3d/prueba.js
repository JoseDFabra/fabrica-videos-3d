// Revisión de la demo sin navegador: brazos contra la mesa, caja en pantalla y saltos de posición, cuadro a cuadro (30 fps).
//   node pruebas/personaje-3d/prueba.js
const path = require("path");
const nada = new Proxy(function () {}, { get: (o, k) => (k === Symbol.toPrimitive ? () => 0 : nada), apply: () => nada, set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => nada, style: {} }), querySelector: () => null };
globalThis.THREE = require(path.join(__dirname, "lib/vendor/three-r158.min.js"));
const P = require(path.join(__dirname, "../../componentes/personaje3d.js"));
const D = require(path.join(__dirname, "demo.js"));

const esc = P.escena(null, { ancho: 1080, alto: 1920 });
const ana = D.armarDemo(esc, P);
const choques = [], fuera = [];
let caja = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }, maxMano = [0, 0], maxCel = [0, 0], antes = null;
for (let f = 0; f <= Math.round(D.DURACION * 30); f++) {
  const t = f / 30;
  const m = ana.revisa(t);
  if (m.length) choques.push(t.toFixed(2) + " " + m.join(", "));
  const b = esc.caja(t);
  ["x0", "y0"].forEach((k) => (caja[k] = Math.min(caja[k], b[k])));
  ["x1", "y1"].forEach((k) => (caja[k] = Math.max(caja[k], b[k])));
  if (b.x0 < 16 || b.x1 > 1064 || b.y0 < 380 || b.y1 > 1660) fuera.push(t.toFixed(2) + " " + JSON.stringify(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v)]))));
  ana.grupo.updateMatrixWorld(true);
  const w = (o) => o.getWorldPosition(new THREE.Vector3());
  const ahora = { mano: ana.cuerpo.children.filter((c) => c.geometry && c.geometry.type === "SphereGeometry").map(w), cel: w(ana.celular) };
  if (antes) {
    ahora.mano.forEach((p, i) => { const d = p.distanceTo(antes.mano[i]); if (d > maxMano[0]) maxMano = [d, t]; });
    const d = ahora.cel.distanceTo(antes.cel); if (d > maxCel[0]) maxCel = [d, t];
  }
  antes = ahora;
}
console.log("choques con la mesa:", choques.length ? choques.slice(0, 40).join("\n  ") : "ninguno");
console.log("cuadros fuera de la franja (x 16–1064, y 380–1660):", fuera.length ? fuera.slice(0, 20).join("\n  ") : "ninguno");
console.log("caja total px:", Object.fromEntries(Object.entries(caja).map(([k, v]) => [k, Math.round(v)])));
console.log("mayor salto por cuadro de una esfera del cuerpo: %s m en t=%s", maxMano[0].toFixed(3), maxMano[1].toFixed(2));
console.log("mayor salto por cuadro del celular: %s m en t=%s", maxCel[0].toFixed(3), maxCel[1].toFixed(2));
