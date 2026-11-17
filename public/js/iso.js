// iso.js — projeção isométrica e construção de sólidos. (clone de jogo/iso.py)
// Mundo: (x, y) em tiles, z = altura.
//     +x -> desce para a DIREITA na tela
//     +y -> desce para a ESQUERDA na tela
// Luz vem da direita/cima: face +x clara, face +y escura, topo mais claro.
// Nada aqui desenha. As funções devolvem FORMAS: [cor, [[x, y], ...]] em
// pixels de cena (zoom 1). Quem transforma formas em imagem é o raster.js.
import * as C from './config.js';

export const HW = C.TW / 2;
export const HH = C.TH / 2;

export function sx(x, y) { return (x - y) * HW; }
export function sy(x, y, z = 0.0) { return (x + y) * HH - z * C.ZH; }

export function para_mundo(px, py) {
  // pixel de cena (zoom 1) -> ponto do mundo no chão
  const a = px / HW, b = py / HH;
  return [(a + b) / 2, (b - a) / 2];
}

export function de_uv(u, v) {
  // (u, v) = (x - y, x + y) -> mundo
  return [(u + v) / 2, (v - u) / 2];
}

export function limitar(v, a, b) { return v < a ? a : v > b ? b : v; }

export function tom(cor, f) {
  // escurece/clareia multiplicando o RGB por f
  return [Math.min(255, Math.trunc(cor[0] * f + 0.5)), Math.min(255, Math.trunc(cor[1] * f + 0.5)), Math.min(255, Math.trunc(cor[2] * f + 0.5))];
}

export function poli(pts3, cor) {
  // polígono 3D -> forma 2D
  return [cor, pts3.map(p => [sx(p[0], p[1]), sy(p[0], p[1], p[2])])];
}

export function caixa(x, y, z, w, d, h, c) {
  // caixa sólida: 3 faces visíveis. c = {topo, dir, esq}
  const x1 = x + w, y1 = y + d, z1 = z + h;
  return [
    poli([[x, y1, z1], [x1, y1, z1], [x1, y1, z], [x, y1, z]], c.esq),   // face +y
    poli([[x1, y, z1], [x1, y1, z1], [x1, y1, z], [x1, y, z]], c.dir),   // face +x
    poli([[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]], c.topo),  // topo
  ];
}

export function face_x(x, y0, y1, z0, z1, cor) {
  return poli([[x, y0, z1], [x, y1, z1], [x, y1, z0], [x, y0, z0]], cor);
}

export function face_y(y, x0, x1, z0, z1, cor) {
  return poli([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], cor);
}

// ---------- formas 2D auxiliares (em px) ---------------------------
export function ret(x, y, w, h, cor) {
  return [cor, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]];
}

export function linha(p0, p1, larg, cor) {
  // linha grossa como quadrilátero
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const l = Math.hypot(dx, dy) || 1.0;
  const nx = -dy / l * larg / 2, ny = dx / l * larg / 2;
  return [cor, [[p0[0] + nx, p0[1] + ny], [p1[0] + nx, p1[1] + ny],
    [p1[0] - nx, p1[1] - ny], [p0[0] - nx, p0[1] - ny]]];
}

export function elipse(cx, cy, rx, ry, cor, n = 18, a0 = 0.0, a1 = 2 * Math.PI) {
  // elipse (ou arco fechado) como polígono
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return [cor, pts];
}

export function curva(p0, c, p1, n = 7) {
  // curva quadrática (Bezier) de p0 a p1 com controle c -> pontos
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
    out.push([a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]]);
  }
  return out;
}

export function semente(a) {
  // gerador pseudoaleatório com semente (mulberry32): mesmo mapa toda vez
  let estado = a >>> 0;
  return function proximo() {
    estado = (estado + 0x6D2B79F5) >>> 0;
    const v = estado;
    let t = Math.imul(v ^ (v >>> 15), 1 | v) >>> 0;
    t = (((t + (Math.imul(t ^ (t >>> 7), 61 | t) >>> 0)) >>> 0) ^ t) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// math.hypot do Python arredonda certo; o Math.hypot do navegador erra o
// último dígito em 1 de cada 3 contas. Nas regras isso muda desempates
// (qual ponto da estrada é "o mais perto"), então as regras usam esta versão,
// que dá o mesmo resultado do Python (produtos exatos + um passo de correção).
const _PARTE = 134217729;   // 2^27 + 1
export function hip(x, y) {
  x = Math.abs(x); y = Math.abs(y);
  if (x === 0) return y;
  if (y === 0) return x;
  let t = _PARTE * x;
  const xh = t - (t - x), xl = x - xh;
  const px = x * x, ex = ((xh * xh - px) + 2 * xh * xl) + xl * xl;
  t = _PARTE * y;
  const yh = t - (t - y), yl = y - yh;
  const py = y * y, ey = ((yh * yh - py) + 2 * yh * yl) + yl * yl;
  const s = px + py, bb = s - px;
  const e = ((px - (s - bb)) + (py - bb)) + ex + ey;
  const r = Math.sqrt(s + e);
  t = _PARTE * r;
  const rh = t - (t - r), rl = r - rh;
  const pr = r * r, er = ((rh * rh - pr) + 2 * rh * rl) + rl * rl;
  return r + (((s - pr) - er) + e) / (2 * r);
}

export function elipse_buf(buf, cx, cy, rx, ry, n = 18, a0 = 0.0, a1 = 2 * Math.PI) {
  // mesmos pontos de elipse(), escritos num buffer reaproveitado; devolve quantos
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    buf[2 * i] = cx + Math.cos(a) * rx;
    buf[2 * i + 1] = cy + Math.sin(a) * ry;
  }
  return n + 1;
}
