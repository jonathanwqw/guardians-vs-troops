// tanque.js — o tanque de guerra (só o DESENHO; as regras ficam em tropas.js).
// Sólido isométrico com o máximo de detalhe, no padrão do jogo (cores
// chapadas em 3 tons, sem brilho). Dividido em duas peças que se mexem
// separadas:
//   CASCO (4 direções x 4 quadros de esteira)
//   TORRE (16 ângulos x 3 posições de recuo do cano)
// Cada peça é um PRISMA (contorno no chão + altura, com topo que pode ser
// inclinado). As faces viradas para a câmera são pintadas num tom entre o
// lado claro (+x) e o escuro (+y) do time, conforme o ângulo.
// Os sprites são feitos sob demanda e guardados (classe Sprites).
// (clone de jogo/tanque.py)
import * as C from './config.js';
import * as iso from './iso.js';
import { sprite } from './raster.js';

export const N_ANGULOS = 16;
const ACO = { topo: [98, 106, 120], dir: [72, 80, 94], esq: [50, 57, 70] };
const ESTEIRA = { topo: [66, 69, 76], dir: [52, 55, 62], esq: [36, 39, 45] };
const GRADE = { topo: [58, 62, 72], dir: [46, 50, 58], esq: [36, 39, 46] };
const ESCAPE = { topo: [62, 58, 54], dir: [50, 46, 42], esq: [36, 33, 31] };
const LENTE = { topo: [236, 238, 242], dir: [214, 218, 226], esq: [180, 186, 198] };
const QUEIMADO = { base: [74, 70, 66], topo: [88, 84, 80], dir: [70, 66, 62], esq: [50, 47, 44], faixa: [62, 58, 54] };
const PNEU = [34, 36, 42];
const DISCO = [92, 98, 110];
const CUBO = [128, 134, 146];
const CENTRO = [160, 166, 178];
const GARRA = [28, 30, 35];

export function paleta(time) {
  // cores do time; 'queimado' = carcaça destruída
  return time === 'queimado' ? QUEIMADO : C.TIMES[time];
}

function _escuro(c) {
  return { topo: c.dir, dir: c.esq, esq: iso.tom(c.esq, 0.8) };
}

function _mistura(a, b, k) {
  return [Math.trunc(a[0] + (b[0] - a[0]) * k + 0.5), Math.trunc(a[1] + (b[1] - a[1]) * k + 0.5), Math.trunc(a[2] + (b[2] - a[2]) * k + 0.5)];
}

function _cor_face(c, nx, ny) {
  // tom da face pela direção da normal: +x = lado claro, +y = lado escuro
  let k = (nx - ny) / Math.sqrt(2) * 0.5 + 0.5;
  k = Math.max(0.0, Math.min(1.0, (k - 0.146) / 0.708));
  return _mistura(c.esq, c.dir, k);
}

export function ret(a0, a1, b0, b1) {
  return [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
}

export function octogono(ca, cb, r) {
  const o = [];
  for (let i = 0; i < 8; i++) o.push([ca + Math.cos(i * Math.PI / 4 + Math.PI / 8) * r, cb + Math.sin(i * Math.PI / 4 + Math.PI / 8) * r]);
  return o;
}

const _ordenado = (a, b) => (a <= b ? [a, b] : [b, a]);

export class Corpo {
  // monta peças num referencial girado: a = para a frente, b = para o lado
  constructor(ang) {
    this.fx = Math.cos(ang); this.fy = Math.sin(ang);
    this.lx = -this.fy; this.ly = this.fx;
    this.partes = [];   // [profundidade, [formas]]
  }

  w(a, b) {
    return [this.fx * a + this.lx * b, this.fy * a + this.ly * b];
  }

  p(a, b, z) {
    const [x, y] = this.w(a, b);
    return [iso.sx(x, y), iso.sy(x, y, z)];
  }

  prisma(pts, z0, z1, c, topo = null, bias = 0.0) {
    // contorno pts (a, b) extrudado de z0 a z1 (z1 pode ser uma lista: topo inclinado).
    // Devolve a lista de formas da peça (dá para acrescentar detalhes nela).
    const mund = pts.map(([a, b]) => this.w(a, b));
    const n = mund.length;
    const z1s = Array.isArray(z1) ? z1.slice() : new Array(n).fill(z1);
    let area = 0;
    for (let i = 0; i < n; i++) area += mund[i][0] * mund[(i + 1) % n][1] - mund[(i + 1) % n][0] * mund[i][1];
    const formas = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const [xi, yi] = mund[i], [xj, yj] = mund[j];
      const ex = xj - xi, ey = yj - yi;
      const l = Math.hypot(ex, ey) || 1.0;
      const nx = area > 0 ? ey / l : -ey / l;
      const ny = area > 0 ? -ex / l : ex / l;
      if (nx + ny <= 1e-6) continue;   // face de costas para a câmera
      formas.push([_cor_face(c, nx, ny), [
        [iso.sx(xi, yi), iso.sy(xi, yi, z0)], [iso.sx(xj, yj), iso.sy(xj, yj, z0)],
        [iso.sx(xj, yj), iso.sy(xj, yj, z1s[j])], [iso.sx(xi, yi), iso.sy(xi, yi, z1s[i])]]]);
    }
    formas.push([topo || c.topo, mund.map(([x, y], i) => [iso.sx(x, y), iso.sy(x, y, z1s[i])])]);
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < n; i++) { mx += mund[i][0]; my += mund[i][1]; mz += z1s[i]; }
    mx /= n; my /= n;
    this.partes.push([mx + my + (z0 + mz / n) / 2 + bias, formas]);
    return formas;
  }

  circulo(a, b, zc, r, cor, n = 14, giro = 0.0) {
    // círculo em pé no plano (frente, altura), deslocado b para o lado
    const pts = [];
    for (let i = 0; i < n; i++) {
      const g = giro + i * 2 * Math.PI / n;
      pts.push(this.p(a + Math.cos(g) * r, b, zc + Math.sin(g) * r));
    }
    return [cor, pts];
  }

  formas() {
    this.partes.sort((p, q) => p[0] - q[0]);
    let out = [];
    for (const [, f] of this.partes) out = out.concat(f);
    return out;
  }
}

// ---------------------------------------------------------------------
// CASCO
// ---------------------------------------------------------------------
function _roda(k, a, b, zc, r, fase) {
  // roda de apoio: pneu, disco, cubo e 4 parafusos que giram com a fase
  const giro = -fase * Math.PI / 8;   // 4 quadros = 90 graus (o desenho dos parafusos se repete)
  const f = [k.circulo(a, b, zc, r, PNEU, 16), k.circulo(a, b, zc, r * 0.8, DISCO, 16),
    k.circulo(a, b, zc, r * 0.42, CUBO, 12), k.circulo(a, b, zc, r * 0.18, CENTRO, 8)];
  for (let i = 0; i < 4; i++) {
    const ang = giro + i * Math.PI / 2;
    f.push(k.circulo(a + Math.cos(ang) * r * 0.3, b, zc + Math.sin(ang) * r * 0.3, r * 0.07, PNEU, 6));
  }
  return f;
}

function _motriz(k, a, b, zc, r, fase) {
  // roda motriz (dentada) da frente
  const giro = -fase * Math.PI / 16;
  const dentes = [];
  for (let i = 0; i < 16; i++) {
    const ang = giro + i * 2 * Math.PI / 16;
    const rr = i % 2 === 0 ? r : r * 0.8;
    dentes.push(k.p(a + Math.cos(ang) * rr, b, zc + Math.sin(ang) * rr));
  }
  return [[PNEU, dentes], k.circulo(a, b, zc, r * 0.62, DISCO, 12), k.circulo(a, b, zc, r * 0.28, CENTRO, 8)];
}

export function formas_casco(time, direcao, fase = 0) {
  // casco virado para a direção 0..3, quadro de esteira 0..3
  const c = paleta(time);
  const esc = _escuro(c);
  const k = new Corpo(direcao * Math.PI / 2);
  const perto = (k.lx + k.ly) > 0 ? 1 : -1;   // lado cujas rodas a câmera vê
  // sombra no chão, puxada para o lado oposto à luz (-x, +y)
  const sombra = [[-1.3, -0.82], [1.3, -0.82], [1.3, 0.82], [-1.3, 0.82]];
  const sw = sombra.map(([a, b]) => k.w(a, b));
  k.partes.push([-99, [[[C.SOMBRA[0], C.SOMBRA[1], C.SOMBRA[2], C.SOMBRA_ALFA + 10],
    sw.map(([x, y]) => [iso.sx(x - 0.32, y + 0.32), iso.sy(x - 0.32, y + 0.32)])]]]);
  const passo = 0.14;
  const desloc = (fase % 4) * passo / 4;
  for (const lado of [-1, 1]) {
    const [b0, b1] = _ordenado(lado * 0.48, lado * 0.77);
    const trilho = k.prisma(ret(-1.2, 1.2, b0, b1), 0.03, 0.42, ESTEIRA);
    if (lado === perto) {   // garras, rodas e roda motriz no lado visível
      const bf = lado * 0.775;
      let a = -1.2 + desloc;
      while (a < 1.2) {   // garras de cima (andam para a frente) e de baixo (para trás)
        const a2 = Math.min(1.2, a + passo * 0.5);
        trilho.push([GARRA, [k.p(a, bf, 0.36), k.p(a2, bf, 0.36), k.p(a2, bf, 0.42), k.p(a, bf, 0.42)]]);
        const ab = -a, ab2 = Math.max(-1.2, -a2);
        trilho.push([GARRA, [k.p(ab, bf, 0.03), k.p(ab2, bf, 0.03), k.p(ab2, bf, 0.09), k.p(ab, bf, 0.09)]]);
        a += passo;
      }
      const bw = lado * 0.79;
      for (const ar of [-0.78, -0.39, 0.0, 0.39, 0.78]) {
        for (const forma of _roda(k, ar, bw, 0.19, 0.155, fase)) trilho.push(forma);
      }
      for (const forma of _motriz(k, 1.04, bw, 0.25, 0.14, fase)) trilho.push(forma);
      trilho.push(k.circulo(-1.05, bw, 0.25, 0.12, PNEU, 12), k.circulo(-1.05, bw, 0.25, 0.08, DISCO, 10),
        k.circulo(-1.05, bw, 0.25, 0.035, CENTRO, 6));
      // rolete de retorno em cima, entre as rodas
      for (const ar of [-0.4, 0.4]) trilho.push(k.circulo(ar, bw, 0.37, 0.045, CUBO, 8));
    }
    // para-lama, caixa de ferramentas e elos de reserva
    const [bm0, bm1] = _ordenado(lado * 0.46, lado * 0.8);
    k.prisma(ret(-0.98, 1.0, bm0, bm1), 0.42, 0.46, c);
    const [bc0, bc1] = _ordenado(lado * 0.54, lado * 0.76);
    k.prisma(ret(-0.85, -0.38, bc0, bc1), 0.46, 0.58, esc, null, 0.02);
    k.prisma(ret(0.5, 0.8, bc0, bc1), 0.46, 0.5, ESTEIRA, null, 0.02);
    // farol na ponta do para-lama
    const [bl0, bl1] = _ordenado(lado * 0.6, lado * 0.7);
    k.prisma(ret(0.94, 1.04, bl0, bl1), 0.46, 0.55, ACO, null, 0.03);
    k.prisma(ret(1.04, 1.06, bl0 + 0.015, bl1 - 0.015), 0.475, 0.535, LENTE, null, 0.04);
    // gancho de reboque e escapamento
    const [bg0, bg1] = _ordenado(lado * 0.26, lado * 0.34);
    k.prisma(ret(1.14, 1.24, bg0, bg1), 0.12, 0.21, ACO);
    const [be0, be1] = _ordenado(lado * 0.22, lado * 0.36);
    k.prisma(ret(-1.22, -1.1, be0, be1), 0.36, 0.5, ESCAPE);
  }
  // corpo, glacis inclinado e convés
  k.prisma(ret(-1.12, 0.78, -0.48, 0.48), 0.1, 0.58, c);
  k.prisma(ret(0.78, 1.16, -0.48, 0.48), 0.1, [0.58, 0.28, 0.28, 0.58], c, iso.tom(c.topo, 0.93));
  k.prisma(ret(-1.1, 0.78, -0.5, 0.5), 0.58, 0.63, c, null, 0.01);
  for (let i = 0; i < 6; i++) {   // grade do motor
    const a = -1.02 + i * 0.1;
    k.prisma(ret(a, a + 0.05, -0.36, 0.36), 0.63, 0.645, GRADE, null, 0.05);
  }
  k.prisma(ret(0.5, 0.72, -0.34, -0.08), 0.63, 0.66, esc, null, 0.05);   // escotilha do motorista
  k.prisma(ret(0.86, 0.98, -0.12, 0.12), 0.5, 0.56, ACO, null, 0.06);   // metralhadora do casco
  return k.formas();
}

// ---------------------------------------------------------------------
// TORRE
// ---------------------------------------------------------------------
export function formas_torre(time, idx, recuo = 0) {
  // torre apontada para o ângulo idx (0..15, 0 = +x), recuo 0/1/2 do cano
  const c = paleta(time);
  const esc = _escuro(c);
  const k = new Corpo(idx * 2 * Math.PI / N_ANGULOS);
  const r = [0.0, 0.14, 0.28][recuo];
  const corpo = [[0.56, 0.24], [0.46, 0.46], [-0.34, 0.52], [-0.6, 0.4], [-0.6, -0.4], [-0.34, -0.52], [0.46, -0.46], [0.56, -0.24]];
  k.prisma(corpo, 0.62, corpo.map(([a]) => (a > 0.3 ? 0.92 : 0.99)), c);
  k.prisma(ret(-0.9, -0.58, -0.36, 0.36), 0.68, 0.92, esc);                 // cesto traseiro
  k.prisma(ret(0.5, 0.74, -0.2, 0.2), 0.7, 0.92, ACO, null, 0.01);           // mantelete
  k.prisma(ret(0.74 - r, 2.1 - r, -0.055, 0.055), 0.78, 0.865, ACO, null, 0.02);       // cano
  k.prisma(ret(1.25 - r, 1.48 - r, -0.085, 0.085), 0.755, 0.89, ACO, null, 0.03);      // extrator de fumaça
  k.prisma(ret(1.98 - r, 2.18 - r, -0.1, 0.1), 0.745, 0.9, GRADE, null, 0.04);         // freio de boca
  k.prisma(ret(2.04 - r, 2.12 - r, -0.105, 0.105), 0.79, 0.855,                         // janela do freio de boca
    { topo: [24, 26, 30], dir: [24, 26, 30], esq: [24, 26, 30] }, null, 0.05);
  for (const lado of [-1, 1]) {   // lançadores de fumígeno
    const [b0, b1] = _ordenado(lado * 0.47, lado * 0.57);
    for (let j = 0; j < 3; j++) {
      k.prisma(ret(0.12 + j * 0.1, 0.19 + j * 0.1, b0, b1), 0.84, 0.92, ACO, null, 0.01);
    }
  }
  // em cima da torre (sempre depois do corpo)
  k.prisma(ret(-0.2, 0.0, -0.47, 0.47), 0.99, 1.0, c, c.faixa, 2.0);           // faixa do time
  k.prisma(octogono(-0.28, -0.24, 0.17), 0.99, 1.13, esc, null, 2.1);          // cúpula
  k.prisma(octogono(-0.28, -0.24, 0.13), 1.13, 1.16, c, null, 2.2);            // tampa da cúpula
  k.prisma(ret(-0.36, -0.06, 0.08, 0.34), 0.99, 1.02, esc, null, 2.1);         // escotilha do municiador
  k.prisma(ret(-0.12, 0.3, -0.27, -0.21), 1.16, 1.2, GRADE, null, 2.3);        // metralhadora do teto
  const a0 = k.p(-0.66, 0.3, 0.99), a1 = k.p(-0.66, 0.3, 1.95);               // antena
  k.partes.push([99, [iso.linha(a0, a1, 1.2, [44, 48, 56])]]);
  return k.formas();
}

export function formas_completo(time, direcao, idx, fase = 0) {
  // casco + torre juntos (cartas, carcaça)
  return formas_casco(time, direcao, fase).concat(formas_torre(time, idx));
}

export function ponta_do_cano(x, y, mira, recuo = 0.0) {
  // [x, y, z] da boca do cano no mundo
  const d = 2.18 - 0.28 * recuo;
  return [x + Math.cos(mira) * d, y + Math.sin(mira) * d, 0.82];
}

export function indice(mira) {
  // ângulo (rad) -> índice 0..15 do sprite da torre
  const v = mira / (2 * Math.PI / N_ANGULOS);
  // round() do Python: metade vai para o par
  let r = Math.round(v);
  if (Math.abs(v - Math.trunc(v)) === 0.5) r = 2 * Math.round(v / 2);
  return ((r % N_ANGULOS) + N_ANGULOS) % N_ANGULOS;
}

export class Sprites {
  // sprites do tanque num zoom, feitos na primeira vez que são pedidos
  constructor(zoom) {
    this.zoom = zoom;
    this._c = new Map();
  }

  _obter(chave, fazer) {
    let s = this._c.get(chave);
    if (s === undefined) {
      const [img, x0, y0] = sprite(fazer(), this.zoom);
      s = [img, x0 * this.zoom - 1, y0 * this.zoom - 1];
      this._c.set(chave, s);
    }
    return s;
  }

  casco(time, direcao, fase) {
    return this._obter(`c|${time}|${direcao}|${fase}`, () => formas_casco(time, direcao, fase));
  }

  torre(time, idx, recuo) {
    return this._obter(`t|${time}|${idx}|${recuo}`, () => formas_torre(time, idx, recuo));
  }
}
