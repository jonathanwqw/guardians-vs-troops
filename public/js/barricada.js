// barricada.js — a BARRICADA (cavalo de frisa com arame farpado), desenhada no código.
//
// Um tronco no meio, ao longo do comprimento, com cavaletes em X de madeira
// (cintas de metal nas juntas e pés fincados na neve), a faixa na cor do time e
// o arame farpado: uma espiral enrolada em volta (o lado de trás mais apagado,
// o da frente com brilho) e fios esticados de ponta a ponta dos X. Nas linhas
// de arame, as FARPAS: estrelinhas de quatro pontas.
//
// Tudo vira imagem pronta (uma por time e por direção, 16 direções), como as
// torres; o "fantasma" da colocação usa as mesmas formas.
import * as C from './config.js';
import * as iso from './iso.js';
import { sx, sy } from './iso.js';

const MADEIRA = [120, 82, 52], MADEIRA_CLARA = [158, 112, 72], MADEIRA_ESC = [82, 54, 34];
const METAL = [92, 98, 112];
const ARAME_TRAS = [96, 102, 116], ARAME = [64, 70, 84], ARAME_BRILHO = [196, 204, 218];
const FARPA = [70, 76, 92];
const NEVE = [246, 249, 253];
const SOMBRA = [C.SOMBRA[0], C.SOMBRA[1], C.SOMBRA[2], Math.round(C.SOMBRA_ALFA * 0.5)];

export const COMPRIMENTO = 3.2;   // ao longo do eixo (unidades do mundo)
export const ALTURA = 1.35;       // até onde sobem as pontas dos X

function P(x, y, z) { return [sx(x, y), sy(x, y, z)]; }

function _estrela(f, x, y, z, r, cor) {
  // farpa: estrelinha de 4 pontas (dois tracinhos cruzados + um ponto)
  const [px, py] = P(x, y, z);
  f.push(iso.linha([px - r, py - r * 0.6], [px + r, py + r * 0.6], 1.3, cor));
  f.push(iso.linha([px - r, py + r * 0.6], [px + r, py - r * 0.6], 1.3, cor));
  f.push(iso.elipse(px, py, 1.1, 1.1, cor, 6));
}

export function formas(time, ang, x = 0, y = 0) {
  // ang: direção do comprimento (radianos no mundo)
  const ux = Math.cos(ang), uy = Math.sin(ang);   // ao longo
  const px = -uy, py = ux;                        // de lado
  const L = COMPRIMENTO, meia = L / 2, H = ALTURA, ab = 0.58;
  // o plano de cada X fica sempre de frente para quem olha (eixo horizontal
  // da tela): assim o X aparece inteiro em qualquer direção da barricada
  const dx_ = 0.7071, dy_ = -0.7071;
  const cor_time = C.TIMES[time].base;
  const f = [];
  // sombra no chão (faixa ao longo, puxada para a direita da luz)
  const sh = [[-meia - 0.2, -0.45], [meia + 0.2, -0.45], [meia + 0.45, 0.7], [-meia + 0.05, 0.7]]
    .map(([a, b]) => { const wx = x + ux * a + px * b + 0.35, wy = y + uy * a + py * b + 0.35; return [sx(wx, wy), sy(wx, wy)]; });
  f.push([SOMBRA, sh]);
  // os X (do fundo para a frente: quem tem x+y menor vem antes)
  const nX = 3;
  const xs = [];
  for (let i = 0; i < nX; i++) xs.push(-meia + 0.35 + i * ((L - 0.7) / (nX - 1)));
  const ordem = xs.slice().sort((a, b) => (ux + uy) * a - (ux + uy) * b);
  const pontas = [];   // pontas de cima dos X (para os fios esticados)
  // espiral do arame: o trecho de TRÁS primeiro (fica atrás do tronco)
  const espiral = [];
  const voltas = 7, passos = 140;
  for (let k = 0; k <= passos; k++) {
    const s = -meia + (k / passos) * L;
    const a = (k / passos) * voltas * 6.2832;
    const r = 0.5;
    const wx = x + ux * s + px * Math.cos(a) * r, wy = y + uy * s + py * Math.cos(a) * r;
    const wz = 0.6 + Math.sin(a) * r * 0.85;
    espiral.push([wx, wy, wz, Math.cos(a)]);
  }
  const tras = (p) => (p[3] * (px + py)) < 0;   // lado de lá do tronco (longe de quem olha)
  for (let k = 0; k < espiral.length - 1; k++) {
    const a = espiral[k], b = espiral[k + 1];
    if (!tras(a)) continue;
    f.push(iso.linha(P(a[0], a[1], a[2]), P(b[0], b[1], b[2]), 1.3, ARAME_TRAS));
  }
  // tronco do meio (dois tons: cima e lado)
  const t0 = P(x - ux * meia, y - uy * meia, 0.62), t1 = P(x + ux * meia, y + uy * meia, 0.62);
  f.push(iso.linha(t0, t1, 7.5, MADEIRA_ESC));
  f.push(iso.linha([t0[0], t0[1] - 1.5], [t1[0], t1[1] - 1.5], 4.5, MADEIRA));
  f.push(iso.linha([t0[0], t0[1] - 2.6], [t1[0], t1[1] - 2.6], 1.6, MADEIRA_CLARA));
  // faixa na cor do time, no meio do tronco
  const fa = P(x - ux * 0.22, y - uy * 0.22, 0.62), fb = P(x + ux * 0.22, y + uy * 0.22, 0.62);
  f.push(iso.linha(fa, fb, 8, cor_time));
  // os cavaletes em X
  for (const s of ordem) {
    const cx = x + ux * s, cy = y + uy * s;
    const A1 = [cx + dx_ * ab, cy + dy_ * ab], A2 = [cx - dx_ * ab, cy - dy_ * ab];
    // pés fincados (montinho de neve)
    for (const [qx, qy] of [A1, A2]) {
      const [mx, my] = P(qx, qy, 0);
      f.push(iso.elipse(mx, my, 6, 2.8, NEVE, 10));
    }
    // as duas pernas do X
    for (const [p0, p1] of [[A1, A2], [A2, A1]]) {
      const b0 = P(p0[0], p0[1], 0), b1 = P(p1[0], p1[1], H);
      f.push(iso.linha(b0, b1, 5.2, MADEIRA_ESC));
      f.push(iso.linha([b0[0] - 0.8, b0[1] - 0.6], [b1[0] - 0.8, b1[1] - 0.6], 2.6, MADEIRA));
      pontas.push([p1[0], p1[1], H]);
    }
    // cinta de metal na junta
    const [jx, jy] = P(cx, cy, 0.62);
    f.push(iso.elipse(jx, jy, 4.2, 3.2, METAL, 10));
    f.push(iso.elipse(jx - 1, jy - 1, 1.6, 1.2, ARAME_BRILHO, 6));
    // neve em cima das pontas
    for (const [qx, qy] of [A1, A2]) {
      const [nx, ny] = P(qx, qy, H);
      f.push(iso.elipse(nx, ny - 1, 3.2, 1.8, NEVE, 8));
    }
  }
  // fios esticados entre as pontas (de um X ao outro, dos dois lados)
  const lado = (sgn) => xs.map(s => [x + ux * s + dx_ * ab * sgn, y + uy * s + dy_ * ab * sgn, H - 0.05]);
  for (const sgn of [-1, 1]) {
    const lp = lado(sgn);
    for (let i = 0; i < lp.length - 1; i++) {
      const a = lp[i], b = lp[i + 1];
      const pa = P(a[0], a[1], a[2]), pb = P(b[0], b[1], b[2]);
      // o fio cede um pouco no meio
      const pm = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2 + 3];
      f.push(iso.linha(pa, pm, 1.4, ARAME));
      f.push(iso.linha(pm, pb, 1.4, ARAME));
      for (let k = 1; k <= 3; k++) {   // farpas no fio
        const t = k / 4, qx = a[0] + (b[0] - a[0]) * t, qy = a[1] + (b[1] - a[1]) * t;
        const [ex, ey] = P(qx, qy, a[2]);
        const ceder = 3 * (1 - Math.abs(2 * t - 1));
        f.push(iso.linha([ex - 2.4, ey - 1.4 + ceder], [ex + 2.4, ey + 1.4 + ceder], 1.2, FARPA));
        f.push(iso.linha([ex - 2.4, ey + 1.4 + ceder], [ex + 2.4, ey - 1.4 + ceder], 1.2, FARPA));
      }
    }
  }
  // espiral do arame: o trecho da FRENTE, com brilho, e as farpas
  for (let k = 0; k < espiral.length - 1; k++) {
    const a = espiral[k], b = espiral[k + 1];
    if (tras(a)) continue;
    const pa = P(a[0], a[1], a[2]), pb = P(b[0], b[1], b[2]);
    f.push(iso.linha(pa, pb, 1.6, ARAME));
    if (a[2] > 0.75) f.push(iso.linha([pa[0], pa[1] - 0.7], [pb[0], pb[1] - 0.7], 0.7, ARAME_BRILHO));
    if (k % 7 === 3) _estrela(f, a[0], a[1], a[2], 2.4, FARPA);
  }
  return f;
}

export function direcoes() { return 16; }
export function indice_dir(ang) {
  // o desenho é simétrico em meia volta: 16 direções cobrem 180°
  let a = ang % Math.PI; if (a < 0) a += Math.PI;
  return Math.round(a / (Math.PI / 16)) % 16;
}
export function ang_de(i) { return i * (Math.PI / 16); }
