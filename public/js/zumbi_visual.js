// zumbi_visual.js — o DESENHO do modo versus zumbi.
//   * criar_sprites(zoom): os zumbis (3 tipos), com os mesmos quadros dos
//     soldados ('p', 'a0'..'a3', 't0', 't1', 'c0'..'c3'), um pouco maiores.
//   * formas_nave(nave): a nave caída (casco, aletas, motores, rasgo com fungo).
//   * pecas_fungo(nave): o que nasce em volta da nave: tapete de fungo, veios,
//     manchas, larvas paradas (chão) e talos de fungo e destroços (com altura).
//   * formas_anim_nave(nave, t): esporos subindo, gosma pulsando e larvas se
//     contorcendo (redesenhados a cada quadro, só quando a nave aparece na tela).
// Tudo feito com as mesmas formas do resto do jogo (iso.js): polígonos, caixas
// e elipses, desenhados uma vez como imagem (raster.js).
import * as C from './config.js';
import * as iso from './iso.js';
import * as pg from './pg.js';
import { sx, sy, tom, limitar } from './iso.js';
import { sprite } from './raster.js';

const ESCALA = 1.2;                         // um pouco maiores que os soldados
const _SOMBRA = [96, 116, 170, 97];
const LUZ = [0.5, -0.55, 0.67];

// ---------- cores ------------------------------------------------------------
const PELE = { claro: [158, 172, 140], medio: [132, 148, 118], escuro: [100, 114, 92] };
const SANGUE = [112, 38, 34], OLHO = [236, 232, 196], BOCA = [58, 22, 24];
const FUNGO = { claro: [214, 194, 148], medio: [184, 156, 104], escuro: [138, 108, 68], laranja: [206, 124, 58], fundo: [96, 78, 54] };
const VARIANTES = {
  // ex-soldado: farda verde desbotada e rasgada
  zumbi: { roupa: [104, 116, 88], roupa_e: [78, 88, 64], calca: [66, 70, 60], calca_e: [52, 56, 48], cabelo: null, fungo: 0 },
  // civil: camisa vermelha suja, cabelo escuro
  zumbi_b: { roupa: [142, 82, 70], roupa_e: [104, 58, 50], calca: [62, 66, 82], calca_e: [48, 52, 66], cabelo: [52, 44, 40], fungo: 0.4 },
  // estalador: a cabeça virou placas de fungo (o mais avançado da infecção)
  zumbi_c: { roupa: [96, 102, 112], roupa_e: [72, 78, 88], calca: [58, 56, 60], calca_e: [46, 44, 48], cabelo: null, fungo: 1 },
};

// ---------- o zumbi ------------------------------------------------------------
export function formas_zumbi(direcao, v, { passo = 0, sobe = 0, lado = 0, ataque = 0, queda = -1 } = {}) {
  // pés em (0, 0). ataque 0..1: avança os braços e a cabeça (mordida)
  const vira = direcao === 1 || direcao === 2;
  const costas = direcao === 2 || direcao === 3;
  const pa = vira ? PELE.claro : PELE.escuro, pb = vira ? PELE.escuro : PELE.claro;
  const ra = vira ? v.roupa : v.roupa_e, rb = vira ? v.roupa_e : v.roupa;
  const y0 = -sobe, cx = lado;                  // balanço de um lado para o outro
  const curva = 1.6 + ataque * 1.4;             // corcunda: o tronco vai para a frente
  let f = [];
  // braços estendidos para a frente (de costas, aparecem atrás do tronco)
  const braco = (dy, alcance, cor, mao) => {
    const ombro = [cx + 0.6 + curva * 0.5, -11.2 + y0 + dy];
    const pulso = [cx + alcance + curva, -10.2 + y0 + dy - ataque * 2.6];
    f.push(iso.linha(ombro, pulso, 2.3, cor));
    f.push(iso.elipse(pulso[0] + 0.6, pulso[1], 1.3, 1.1, mao, 8));
    f.push(iso.linha([pulso[0] + 0.8, pulso[1]], [pulso[0] + 2.0, pulso[1] + 0.9], 0.6, mao));   // dedos tortos
  };
  if (costas) { braco(-0.6, 5.2 + ataque * 2, v.roupa_e, PELE.escuro); braco(0.7, 4.6 + ataque * 2, v.roupa_e, PELE.escuro); }
  // pernas: uma arrasta (passo menor e mais baixa)
  f.push(iso.ret(cx - 3 + passo * 1.0, -5 - Math.max(0, passo) * 0.8, 2.8, 5, v.calca_e));
  f.push(iso.ret(cx + 0.2 - passo * 0.6, -4.6, 2.8, 4.6, v.calca));
  f.push(iso.ret(cx + 0.2 - passo * 0.6, -1.4, 2.8, 1.4, [40, 38, 40]));   // sapato
  f.push(iso.ret(cx - 3 + passo * 1.0, -1.4 - Math.max(0, passo) * 0.8, 2.8, 1.4, [40, 38, 40]));
  // tronco inclinado (paralelogramo), com rasgos e manchas
  const t0 = -12.6 + y0, t1 = -4.6 + y0;
  f.push([ra, [[cx - 3.6 + curva, t0], [cx + curva * 0.9, t0], [cx + 0.2, t1], [cx - 3.6, t1]]]);
  f.push([rb, [[cx + curva * 0.9, t0], [cx + 3.6 + curva, t0], [cx + 3.6, t1], [cx + 0.2, t1]]]);
  f.push([pb, [[cx + 0.8 + curva * 0.6, -9.2 + y0], [cx + 2.6 + curva * 0.6, -9.8 + y0], [cx + 2.2 + curva * 0.5, -7.4 + y0], [cx + 1.0 + curva * 0.5, -7.0 + y0]]]);   // rasgo na roupa
  f.push(iso.elipse(cx - 1.6 + curva * 0.7, -8.4 + y0, 1.1, 1.5, SANGUE, 8));
  f.push([tom(rb, 0.82), [[cx - 3.6, t1], [cx + 3.6, t1], [cx + 3.2, t1 + 1.6], [cx + 1.4, t1 + 0.6], [cx - 0.6, t1 + 1.8], [cx - 3.4, t1 + 0.8]]]);   // barra esfarrapada
  if (costas) f.push(iso.elipse(cx - 0.2 + curva * 0.8, -10.4 + y0, 2.0, 1.6, v.fungo ? FUNGO.medio : tom(rb, 0.86), 10));   // fungo nas costas
  // cabeça: mais baixa e para a frente
  const hx = cx + curva + 0.6 + ataque * 1.6, hy = -14.4 + y0 + ataque * 0.8;
  f.push(iso.elipse(hx - 0.6, hy + 2.6, 1.6, 1.4, pa, 8));   // pescoço
  f.push(iso.elipse(hx, hy, 3.0, 3.0, pb, 14));
  f.push(iso.elipse(hx - 0.9, hy + 0.3, 2.0, 2.6, pa, 10));
  if (v.fungo >= 1) {
    // estalador: placas de fungo cobrindo a cabeça inteira
    f.push(iso.elipse(hx, hy - 0.4, 3.5, 3.3, FUNGO.escuro, 14));
    for (const [ax, ay, r, cor] of [[-1.8, -1.6, 1.7, FUNGO.medio], [1.4, -2.0, 1.6, FUNGO.claro], [0.0, -3.2, 1.4, FUNGO.claro],
      [2.6, 0.2, 1.3, FUNGO.medio], [-2.4, 0.8, 1.2, FUNGO.laranja], [0.6, 1.4, 1.1, FUNGO.claro], [-0.4, -0.6, 1.0, FUNGO.laranja]]) {
      f.push(iso.elipse(hx + ax, hy + ay, r, r * 0.8, cor, 9));
      f.push(iso.elipse(hx + ax - r * 0.25, hy + ay - r * 0.25, r * 0.4, r * 0.3, tom(cor, 1.18), 6));
    }
    if (!costas) f.push(iso.elipse(hx + 1.6, hy + 2.2, 1.2, 0.8, BOCA, 8));
  } else {
    if (v.cabelo) {   // cabelo ralo e caído
      f.push(iso.elipse(hx, hy - 1.4, 3.1, 1.9, v.cabelo, 10, Math.PI, 2 * Math.PI));
      f.push(iso.linha([hx - 2.4, hy - 1.2], [hx - 3.0, hy + 1.8], 0.8, v.cabelo));
    } else {          // careca, com o capacete perdido
      f.push(iso.elipse(hx + 0.6, hy - 1.8, 1.0, 0.6, tom(pb, 1.12), 6));
    }
    if (v.fungo > 0) {   // começo da infecção: um tufo de fungo saindo da têmpora
      f.push(iso.elipse(hx - 2.2, hy - 1.4, 1.5, 1.2, FUNGO.medio, 8));
      f.push(iso.elipse(hx - 2.6, hy - 2.0, 0.8, 0.6, FUNGO.claro, 6));
    }
    if (!costas) {   // olhos vazios e boca aberta
      f.push(iso.elipse(hx + 1.4, hy - 0.4, 0.7, 0.6, OLHO, 6));
      f.push(iso.elipse(hx + 2.6, hy - 0.2, 0.55, 0.5, OLHO, 6));
      f.push(iso.elipse(hx + 2.0, hy + 1.8, 0.9 + ataque * 0.5, 0.6 + ataque * 0.7, BOCA, 8));
    }
  }
  if (!costas) { braco(-0.6, 5.0 + ataque * 2, rb, PELE.claro); braco(0.6, 4.4 + ataque * 2, ra, PELE.medio); }
  // tudo um pouco maior que o soldado
  f = f.map(([cor, pts]) => [cor, pts.map(([x, y]) => [x * ESCALA, y * ESCALA])]);
  if (vira) f = f.map(([cor, pts]) => [cor, pts.map(([x, y]) => [-x, y])]);
  if (queda >= 0) {   // cai de cara para a frente (e some na neve)
    const ang = (vira ? -1 : 1) * Math.min(1.0, queda * 2.2) * 1.45;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    f = f.map(([cor, pts]) => [cor, pts.map(([x, y]) => [x * cs - y * sn, x * sn + y * cs])]);
  } else {
    f.unshift(iso.elipse(-1.2, 0.5, 6.2, 2.8, _SOMBRA, 14));
  }
  return f;
}

export function criar_sprites(zoom) {
  // { zumbi: [dir][quadro], zumbi_b: ..., zumbi_c: ... } (mesmo formato do soldado.js)
  const out = {};
  for (const nome in VARIANTES) {
    const v = VARIANTES[nome];
    out[nome] = [];
    for (let d = 0; d < 4; d++) {
      const q = {};
      q.p = sprite(formas_zumbi(d, v, {}), zoom);
      for (let k = 0; k < 4; k++) {
        const fase = k * Math.PI / 2;
        q['a' + k] = sprite(formas_zumbi(d, v, { passo: Math.sin(fase), sobe: Math.abs(Math.cos(fase)) * 0.9, lado: Math.sin(fase) * 0.7 }), zoom);
      }
      q.t0 = sprite(formas_zumbi(d, v, { ataque: 1 }), zoom);
      q.t1 = sprite(formas_zumbi(d, v, { ataque: 0.45 }), zoom);
      for (let k = 0; k < 4; k++) {
        const qd = (k + 0.5) / 4;
        let [img, x0, y0] = sprite(formas_zumbi(d, v, { queda: qd }), zoom);
        if (qd >= 0.6) {
          const ctx = pg.superficie(img.width, img.height);
          ctx.globalAlpha = 1 - (qd - 0.6) / 0.4;
          ctx.drawImage(img, 0, 0);
          img = ctx.canvas;
        }
        q['c' + k] = [img, x0, y0];
      }
      out[nome].push(q);
    }
  }
  return out;
}

// ---------- a nave caída ---------------------------------------------------------
// Casco comprido deitado no eixo x, com o bico enterrado (lado -x) e a cauda no ar
// (lado +x, onde ficam os motores). O casco é um sólido convexo: as faces que dão
// para a câmera não se cobrem, então basta desenhar as visíveis.
const CASCO = [[180, 186, 194], [150, 156, 166]];   // metal claro / chapas mais escuras
const N_LADOS = 10;
const ESTACOES = [[-5.4, 0.9], [-3.6, 1.8], [-1.2, 2.25], [1.6, 2.2], [3.8, 1.9], [5.0, 1.55]];   // [x local, raio]
const ACHATA = 0.72;                                  // seção oval (mais larga que alta)
function z_eixo(xl) { return -0.55 + 0.2 * (xl + 5.4); }   // inclinação da queda

function _ponto(n, xl, ang, r) {
  return [n.x + xl, n.y + Math.cos(ang) * r, z_eixo(xl) + Math.sin(ang) * r * ACHATA];
}
function _area2d(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return a;
}
function _normal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const m = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / m, n[1] / m, n[2] / m];
}
function _luz(cor, n) { return tom(cor, limitar(0.66 + 0.5 * (n[0] * LUZ[0] + n[1] * LUZ[1] + n[2] * LUZ[2]), 0.5, 1.08)); }
function _face(f, pts3, cor) {
  // só entra se estiver virada para a câmera (pontos em sentido anti-horário por fora)
  const p2 = pts3.map(p => [sx(p[0], p[1]), sy(p[0], p[1], p[2])]);
  if (_area2d(p2) <= 0) return false;
  f.push([_luz(cor, _normal(pts3[0], pts3[1], pts3[2])), p2]);
  return true;
}
function _s(p) { return [sx(p[0], p[1]), sy(p[0], p[1], p[2])]; }

export const NAVE_K = 1.6;   // a nave é desenhada 1,6x maior que o tamanho de projeto
function _ampliar(f, n, k) {
  // as formas foram feitas com a nave na origem: amplia e leva para o ponto da nave
  const cx = sx(n.x, n.y), cy = sy(n.x, n.y);
  return f.map(([cor, pts]) => [cor, pts.map(([x, y]) => [cx + x * k, cy + y * k])]);
}

export function formas_nave(n0) {
  return _ampliar(_formas_nave({ x: 0, y: 0 }), n0, NAVE_K);
}

function _formas_nave(n) {
  const f = [];
  // sombra do casco no chão (antes de tudo: cor com transparência substitui o que está embaixo)
  f.push([[C.SOMBRA[0], C.SOMBRA[1], C.SOMBRA[2], 70], [[sx(n.x - 4, n.y + 2.6), sy(n.x - 4, n.y + 2.6)],
    [sx(n.x + 6.4, n.y + 2.4), sy(n.x + 6.4, n.y + 2.4)], [sx(n.x + 7.4, n.y + 0.6), sy(n.x + 7.4, n.y + 0.6)],
    [sx(n.x + 5.2, n.y - 2.0), sy(n.x + 5.2, n.y - 2.0)], [sx(n.x - 4.5, n.y - 1.4), sy(n.x - 4.5, n.y - 1.4)]]]);
  // cratera: terra revirada e neve empurrada em volta do bico
  const bx = n.x - 4.6, by = n.y;
  f.push(iso.elipse(sx(bx, by), sy(bx, by), 120, 56, [196, 204, 218], 24));
  f.push(iso.elipse(sx(bx, by), sy(bx, by) + 4, 104, 46, [118, 96, 74], 24));
  f.push(iso.elipse(sx(bx, by), sy(bx, by) + 6, 82, 34, [86, 70, 56], 22));
  f.push(iso.elipse(sx(bx, by) + 10, sy(bx, by) + 8, 60, 22, [64, 54, 46], 20));
  // casco: faixas entre estações, com chapas alternando de tom
  const vis = [];   // faces visíveis [i estação, k lado]
  for (let i = 0; i < ESTACOES.length - 1; i++) {
    const [xa, ra] = ESTACOES[i], [xb, rb] = ESTACOES[i + 1];
    for (let k = 0; k < N_LADOS; k++) {
      const a0 = k / N_LADOS * 2 * Math.PI - Math.PI / 2, a1 = (k + 1) / N_LADOS * 2 * Math.PI - Math.PI / 2;
      const A = _ponto(n, xa, a0, ra), B = _ponto(n, xb, a0, rb), Cc = _ponto(n, xb, a1, rb), D = _ponto(n, xa, a1, ra);
      if (_face(f, [A, D, Cc, B], CASCO[(i + k) % 2])) vis.push([i, k]);
    }
  }
  // tampa de trás (cauda, lado +x) e os três motores
  const [xt, rt] = ESTACOES[ESTACOES.length - 1];
  const tampa = [];
  for (let k = N_LADOS - 1; k >= 0; k--) tampa.push(_ponto(n, xt, k / N_LADOS * 2 * Math.PI - Math.PI / 2, rt));
  if (!_face(f, tampa, [128, 134, 146])) _face(f, tampa.reverse(), [128, 134, 146]);
  for (const [dy, dz, r] of [[-0.75, -0.1, 0.55], [0.75, -0.1, 0.55], [0, 0.62, 0.48]]) {
    const anel = (rr, cor) => {
      const pts = [];
      for (let k = 0; k < 14; k++) { const a = k / 14 * 2 * Math.PI; pts.push(_s([n.x + xt + 0.02, n.y + dy + Math.cos(a) * rr, z_eixo(xt) + dz + Math.sin(a) * rr])); }
      f.push([cor, pts]);
    };
    anel(r, [70, 74, 86]); anel(r * 0.72, [34, 38, 48]); anel(r * 0.38, [78, 150, 120]);   // brasa verde lá no fundo
  }
  // costuras entre as chapas (anéis) nas faces visíveis
  for (const [i, k] of vis) {
    if (i === 0) continue;
    const [xa, ra] = ESTACOES[i];
    const a0 = k / N_LADOS * 2 * Math.PI - Math.PI / 2, a1 = (k + 1) / N_LADOS * 2 * Math.PI - Math.PI / 2;
    f.push(iso.linha(_s(_ponto(n, xa, a0, ra * 1.003)), _s(_ponto(n, xa, a1, ra * 1.003)), 1.2, [92, 98, 110]));
  }
  // faixa escura ao longo do casco e luzes (algumas apagadas)
  for (let i = 0; i < ESTACOES.length - 1; i++) {
    const [xa, ra] = ESTACOES[i], [xb, rb] = ESTACOES[i + 1];
    const ang = 0.55;   // um pouco acima do lado que dá para a câmera
    f.push(iso.linha(_s(_ponto(n, xa, ang, ra * 1.004)), _s(_ponto(n, xb, ang, rb * 1.004)), 4.5, [64, 70, 84]));
    const m = _s(_ponto(n, (xa + xb) / 2, ang, (ra + rb) / 2 * 1.006));
    f.push(iso.elipse(m[0], m[1], 2.6, 2.0, i % 2 ? [40, 46, 56] : [132, 236, 214], 8));
  }
  // aletas em cima (placas finas), uma delas quebrada ao meio
  for (const [x0, x1, alt, quebrada] of [[-0.6, 2.2, 1.9, false], [2.6, 4.6, 1.5, true]]) {
    const ra = 2.2, z0a = z_eixo(x0) + ra * ACHATA, z0b = z_eixo(x1) + ra * ACHATA * 0.9;
    const topo = quebrada ? [[n.x + x1 - 0.6, n.y, z0b + alt * 0.55], [n.x + x1 - 1.3, n.y, z0b + alt * 0.85]] : [[n.x + x1 - 0.3, n.y, z0b + alt]];
    const pts = [[n.x + x0, n.y, z0a], [n.x + x1, n.y, z0b]].concat(topo).concat([[n.x + x0 + 0.8, n.y, z0a + alt * 0.9]]);
    f.push([[138, 146, 160], pts.map(_s)]);
    f.push([[110, 118, 132], [pts[0], pts[1], [pts[1][0], pts[1][1] + 0.08, pts[1][2] + 0.25], [pts[0][0], pts[0][1] + 0.08, pts[0][2] + 0.25]].map(_s)]);
  }
  // antena torta
  const ab = _s([n.x + 0.6, n.y - 0.6, z_eixo(0.6) + 2.2 * ACHATA]);
  const am = _s([n.x + 1.1, n.y - 0.8, z_eixo(0.6) + 2.2 * ACHATA + 1.3]);
  const at = _s([n.x + 2.0, n.y - 0.6, z_eixo(0.6) + 2.2 * ACHATA + 1.5]);
  f.push(iso.linha(ab, am, 2.4, [72, 78, 90])); f.push(iso.linha(am, at, 2.0, [72, 78, 90]));
  f.push(iso.elipse(at[0], at[1], 2.6, 2.6, [196, 70, 60], 8));
  // chapas arrancadas, levantadas do casco
  for (const [xl, ang, w, h] of [[-2.4, 0.15, 1.1, 0.6], [0.4, 1.0, 0.9, 0.7], [3.2, 0.35, 0.8, 0.5]]) {
    const r = 2.1, p0 = _ponto(n, xl, ang, r), p1 = _ponto(n, xl + w, ang, r);
    const p2 = [p1[0] + 0.2, p1[1] + h * 0.7, p1[2] + h], p3 = [p0[0], p0[1] + h * 0.7, p0[2] + h * 0.8];
    f.push([[40, 44, 54], [p0, p1, [p1[0], p1[1] - 0.05, p1[2] - 0.2], [p0[0], p0[1] - 0.05, p0[2] - 0.2]].map(_s)]);
    f.push([[164, 170, 182], [p0, p1, p2, p3].map(_s)]);
  }
  // O RASGO: um buraco no lado que dá para as suas bases, com fungo saindo
  const rasgo = [];
  const R = (xl, ang) => _ponto(n, xl, ang, 2.24);
  for (const [xl, ang] of [[-2.0, -0.55], [-1.2, -0.95], [0.0, -0.75], [0.8, -1.05], [1.8, -0.6], [1.5, 0.1], [0.6, 0.35], [-0.6, 0.15], [-1.6, 0.3]]) rasgo.push(R(xl, ang));
  f.push([[30, 26, 24], rasgo.map(_s)]);
  f.push([[56, 44, 36], rasgo.slice(0, 5).map((p, i) => _s([p[0], p[1] - 0.25, p[2] + 0.18 + (i % 2) * 0.12]))
    .concat(rasgo.slice(0, 5).reverse().map(_s))]);
  // gosma e fungo transbordando do rasgo, descendo pelo casco até o chão
  const fungo = [[-1.4, -0.5, 0.5, FUNGO.fundo], [-0.4, -0.65, 0.55, FUNGO.escuro], [0.7, -0.6, 0.5, FUNGO.medio], [1.4, -0.4, 0.4, FUNGO.escuro],
    [-0.9, -0.2, 0.45, FUNGO.medio], [0.2, -0.1, 0.5, FUNGO.claro], [1.0, 0.05, 0.38, FUNGO.laranja], [-1.6, 0.05, 0.3, FUNGO.claro]];
  for (const [xl, ang, r, cor] of fungo) {
    const c = _s(R(xl, ang));
    f.push(iso.elipse(c[0], c[1], r * 22, r * 15, cor, 12));
    f.push(iso.elipse(c[0] - r * 5, c[1] - r * 4, r * 9, r * 6, tom(cor, 1.15), 8));
  }
  // escorrido até o chão (cortina de micélio)
  const c0 = _s(R(-1.0, -1.0)), c1 = _s(R(1.2, -1.0)), g0 = _s([n.x - 1.2, n.y + 2.9, 0]), g1 = _s([n.x + 1.6, n.y + 2.8, 0]);
  f.push([[110, 92, 62], [c0, c1, g1, [g1[0] - 8, g1[1] + 4], g0]]);
  f.push([[146, 122, 82], [[c0[0] + 6, c0[1] + 2], [c1[0] - 6, c1[1] + 2], [g1[0] - 10, g1[1]], [g0[0] + 8, g0[1]]]]);
  for (let k = 0; k < 7; k++) {   // fios de micélio pendurados
    const t = (k + 0.5) / 7, p = [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t];
    const q = [g0[0] + (g1[0] - g0[0]) * t + ((k * 37) % 9 - 4), g0[1] + (g1[1] - g0[1]) * t + 2];
    f.push(iso.linha(p, q, 1.1, k % 2 ? FUNGO.claro : FUNGO.escuro));
  }
  // talos de cordyceps crescendo em cima do casco
  for (const [xl, ang, h] of [[-3.0, 0.9, 1.2], [-2.6, 1.3, 0.8], [-0.2, 1.4, 1.0], [2.8, 1.2, 0.9], [3.4, 0.8, 0.7], [-4.4, 0.6, 0.6]]) {
    const r = ESTACOES.reduce((acc, e, i) => (i && xl <= e[0] && xl >= ESTACOES[i - 1][0]) ? ESTACOES[i - 1][1] + (e[1] - ESTACOES[i - 1][1]) * (xl - ESTACOES[i - 1][0]) / (e[0] - ESTACOES[i - 1][0]) : acc, 1.5);
    const b = _ponto(n, xl, ang, r);
    f.push(...talo(b, h));
  }
  return f;
}

function talo(b, h) {
  // talo de fungo curvo com a cabeça alaranjada (cordyceps)
  const p0 = _s(b), p1 = _s([b[0] + 0.12, b[1] - 0.05, b[2] + h * 0.55]), p2 = _s([b[0] + 0.05, b[1] + 0.1, b[2] + h]);
  return [
    iso.elipse(p0[0], p0[1], 5, 2.4, FUNGO.fundo, 8),
    iso.linha(p0, p1, 2.6, FUNGO.escuro), iso.linha(p1, p2, 2.0, FUNGO.medio),
    iso.elipse(p2[0], p2[1] - 1.5, 3.0, 3.6, FUNGO.laranja, 9),
    iso.elipse(p2[0] - 0.8, p2[1] - 2.5, 1.2, 1.3, [236, 176, 110], 6),
  ];
}

// ---------- o que cresce em volta ----------------------------------------------------
function _rng(a) { return iso.semente(a); }

export function pecas_fungo(n, cobrir = []) {
  // chao: [{formas}] sem altura (vão por baixo de tudo, logo depois do terreno)
  // altos: [{k, formas}] com altura (entram na ordem de profundidade)
  // cobrir: polígonos (px de cena) pintados de neve antes de tudo (o que era do QG vermelho)
  const r = _rng(66601), chao = [], altos = [];
  for (const pts of cobrir) chao.push({ x: 0, y: 0, formas: [[C.NEVE, pts]] });
  const perto = (raio) => {   // ponto em volta da nave, mais denso perto dela
    const a = r() * Math.PI * 2, d = 5.6 + Math.pow(r(), 1.5) * raio;
    return [n.x + Math.cos(a) * d * 1.55, n.y + Math.sin(a) * d];
  };
  // tapete de micélio (manchas grandes e irregulares, umas por cima das outras)
  for (let i = 0; i < 46; i++) {
    const [x, y] = perto(13), tam = 1.0 + r() * 2.2, cx = sx(x, y), cy = sy(x, y);
    const pts = [];
    for (let k = 0; k < 11; k++) { const a = k / 11 * Math.PI * 2, rr = tam * (0.7 + r() * 0.5); pts.push([cx + Math.cos(a) * rr * 32, cy + Math.sin(a) * rr * 16]); }
    const tons = [[150, 136, 104], [126, 112, 84], [168, 154, 120], [104, 92, 70]];
    const f = [[tons[i % 4], pts]];
    f.push([[tom(tons[i % 4], 1.12)[0], tom(tons[i % 4], 1.12)[1], tom(tons[i % 4], 1.12)[2]], pts.map(([px, py]) => [cx + (px - cx) * 0.55, cy + (py - cy) * 0.55 - 1])]);
    for (let k = 0; k < 6; k++) {   // bolinhas de fungo em cima
      const a = r() * Math.PI * 2, d = r() * tam * 0.8;
      f.push(iso.elipse(cx + Math.cos(a) * d * 30, cy + Math.sin(a) * d * 15, 2 + r() * 3.5, 1.4 + r() * 2, r() < 0.3 ? FUNGO.laranja : FUNGO.claro, 8));
    }
    chao.push({ x, y, formas: f });
  }
  // veios de micélio se espalhando pela neve, em direção às estradas
  for (let i = 0; i < 22; i++) {
    let a = r() * Math.PI * 2, x = n.x + Math.cos(a) * 8.0, y = n.y + Math.sin(a) * 4.6;
    const f = [], lx = x, ly = y;
    let px = sx(x, y), py = sy(x, y);
    const passos = 6 + Math.floor(r() * 10);
    for (let k = 0; k < passos; k++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * 1.1; y += Math.sin(a) * 1.1;
      const qx = sx(x, y), qy = sy(x, y);
      f.push(iso.linha([px, py], [qx, qy], Math.max(1.2, 4.2 - k * 0.35), k < 3 ? [96, 82, 60] : [128, 114, 88]));
      if (r() < 0.35) f.push(iso.elipse(qx, qy, 3, 1.6, FUNGO.medio, 6));
      px = qx; py = qy;
    }
    chao.push({ x: lx, y: ly, formas: f });
  }
  // poças de gosma escura
  for (let i = 0; i < 12; i++) {
    const [x, y] = perto(8), cx = sx(x, y), cy = sy(x, y), w = 14 + r() * 26;
    chao.push({ x, y, formas: [iso.elipse(cx, cy, w, w * 0.45, [58, 52, 40], 14), iso.elipse(cx - w * 0.2, cy - 2, w * 0.4, w * 0.15, [92, 104, 70], 10)] });
  }
  // larvas paradas no chão (as que se mexem são desenhadas a cada quadro)
  for (let i = 0; i < 70; i++) {
    const [x, y] = perto(11), cx = sx(x, y), cy = sy(x, y), a = r() * Math.PI * 2, f = [];
    for (let k = 0; k < 5; k++) f.push(iso.elipse(cx + Math.cos(a) * k * 2.2, cy + Math.sin(a) * k * 1.1 + Math.sin(k * 1.4) * 0.8, 2.0 - k * 0.22, 1.6 - k * 0.18, k === 0 ? [214, 196, 168] : [232, 222, 196], 7));
    chao.push({ x, y, formas: f });
  }
  // TALOS e cogumelos (com altura) em tufos
  for (let i = 0; i < 34; i++) {
    const [x, y] = perto(12), f = [];
    const n_t = 2 + Math.floor(r() * 4);
    for (let k = 0; k < n_t; k++) f.push(...talo([x + (r() - 0.5) * 0.7, y + (r() - 0.5) * 0.7, 0], 0.5 + r() * 0.9));
    if (r() < 0.6) {   // cogumelo de chapéu largo
      const cx = sx(x + 0.4, y + 0.3), cy = sy(x + 0.4, y + 0.3);
      f.push(iso.ret(cx - 1.5, cy - 13, 3, 13, FUNGO.claro));
      f.push(iso.elipse(cx, cy - 13, 9, 4.5, FUNGO.escuro, 12));
      f.push(iso.elipse(cx - 1, cy - 14.5, 6.5, 3, FUNGO.medio, 10));
    }
    altos.push({ k: x + y, formas: f });
  }
  // destroços do casco espalhados (com altura)
  for (let i = 0; i < 14; i++) {
    const [x, y] = perto(9), w = 0.35 + r() * 0.8, d = 0.3 + r() * 0.6, h = 0.1 + r() * 0.35;
    const f = iso.caixa(x, y, 0, w, d, h, { topo: [172, 178, 188], dir: [140, 146, 158], esq: [110, 116, 128] });
    if (r() < 0.5) f.push(iso.elipse(sx(x + w / 2, y + d / 2), sy(x + w / 2, y + d / 2, h) - 1, 4, 2.4, FUNGO.medio, 8));
    altos.push({ k: x + y + 0.3, formas: f });
  }
  return { chao, altos };
}

// ---------- partes animadas (esporos, gosma, larvas que se mexem) --------------------------
const _LARVAS = (() => {
  const r = _rng(31337), l = [];
  for (let i = 0; i < 44; i++) { const a = r() * Math.PI * 2, d = 5.2 + r() * 8; l.push([Math.cos(a) * d * 1.5, Math.sin(a) * d, r() * 6.28, r() * Math.PI * 2]); }
  return l;
})();
const _ESPOROS = (() => {
  const r = _rng(4242), e = [];
  for (let i = 0; i < 40; i++) e.push([(r() - 0.5) * 10, (r() - 0.5) * 6, r(), 0.4 + r() * 0.8]);
  return e;
})();

export function formas_anim_nave(n, t) {
  const f = [];
  // larvas se contorcendo e se arrastando devagar
  for (const [dx, dy, fase, a0] of _LARVAS) {
    const anda = (t * 0.25 + fase) % 1.6;
    const a = a0 + Math.sin(t * 0.4 + fase) * 0.6;
    const x = n.x + dx + Math.cos(a) * anda * 0.4, y = n.y + dy + Math.sin(a) * anda * 0.4;
    const cx = sx(x, y), cy = sy(x, y);
    for (let k = 0; k < 6; k++) {
      const onda = Math.sin(t * 7 + fase + k * 1.1) * 1.4;
      f.push(iso.elipse(cx - Math.cos(a) * k * 2.3 - Math.sin(a) * onda, cy - Math.sin(a) * k * 1.15 + Math.cos(a) * onda * 0.5,
        2.1 - k * 0.24, 1.7 - k * 0.2, k === 0 ? [206, 186, 156] : [236, 226, 200], 7));
    }
  }
  // gosma e esporos: feitos com a nave na origem e ampliados como o casco
  f.push(..._ampliar(_anim_rasgo({ x: 0, y: 0 }, t), n, NAVE_K));
  return f;
}

function _anim_rasgo(n, t) {
  const f = [];
  // gosma verde pulsando no fundo do rasgo
  const pul = 0.5 + 0.5 * Math.sin(t * 2.3);
  const g = [sx(n.x + 0.1, n.y + 1.95), sy(n.x + 0.1, n.y + 1.95, z_eixo(0.1) - 0.2)];
  f.push(iso.elipse(g[0], g[1], 14 + pul * 3, 6 + pul * 1.5, [62, 128, 92, 160], 12));
  f.push(iso.elipse(g[0] - 3, g[1] - 1, 6 + pul * 2, 2.5 + pul, [150, 230, 170, 200], 10));
  // esporos subindo do rasgo e do casco
  for (const [dx, dy, fase, vel] of _ESPOROS) {
    const k = (t * 0.12 * vel + fase) % 1;
    const x = n.x + dx * 0.6 + Math.sin(t * 0.7 + fase * 9) * 0.5, y = n.y + 1.6 + dy * 0.4;
    const px = sx(x, y), py = sy(x, y, 1.0 + k * 5.5);
    const alfa = Math.round(200 * Math.sin(k * Math.PI));
    if (alfa > 8) f.push(iso.elipse(px, py, 1.6 + k * 1.6, 1.6 + k * 1.6, [226, 214, 172, alfa], 6));
  }
  return f;
}

// ======================================================================
// ESPECIAIS: desenhados a cada quadro (são poucos), com esqueleto de verdade:
// cada membro é uma cadeia de ossos; pernas e braços acham a junta do meio
// sozinhos (cinemática inversa de dois ossos), então pé e mão vão para onde
// precisam (chão, pedra, alvo) e joelho e cotovelo dobram do lado certo.
// ======================================================================
const T_PEGAR = 1.0, T_MIRAR = 0.55, T_LANCAR = 0.45, T_INSPIRAR = 0.7, T_GRITAR = 1.1;
export const K_ESP = 3;     // monstros e grandões: 3x o tamanho de projeto
export const K_PEDRA = 5;   // pedras: 5x o tamanho de projeto

function _ik(ax, ay, bx, by, l1, l2, frente) {
  // junta do meio de uma cadeia de 2 ossos (a -> junta -> b); frente: +1 dobra para a frente, -1 para trás
  let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1e-6;
  const dmax = l1 + l2 - 0.01;
  if (d > dmax) { bx = ax + dx / d * dmax; by = ay + dy / d * dmax; dx = bx - ax; dy = by - ay; d = dmax; }
  const base = Math.atan2(dy, dx), cs = limitar((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), off = Math.acos(cs);
  const a1 = base - off, a2 = base + off;
  const j1 = [ax + Math.cos(a1) * l1, ay + Math.sin(a1) * l1], j2 = [ax + Math.cos(a2) * l1, ay + Math.sin(a2) * l1];
  const j = (j1[0] - j2[0]) * frente > 0 ? j1 : j2;
  return [j, [bx, by]];
}
function _osso(f, a, b, w0, w1, cor) {
  // osso afinado (largura w0 na origem, w1 na ponta) com as pontas arredondadas
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1e-6, nx = -dy / d, ny = dx / d;
  f.push([cor, [[a[0] + nx * w0 / 2, a[1] + ny * w0 / 2], [b[0] + nx * w1 / 2, b[1] + ny * w1 / 2], [b[0] - nx * w1 / 2, b[1] - ny * w1 / 2], [a[0] - nx * w0 / 2, a[1] - ny * w0 / 2]]]);
  f.push(iso.elipse(a[0], a[1], w0 / 2, w0 / 2, cor, 8));
  f.push(iso.elipse(b[0], b[1], w1 / 2, w1 / 2, cor, 8));
}
function _alfa(cor, a) { return [cor[0], cor[1], cor[2], Math.round(255 * a)]; }

const MONSTRO = [
  { pele: [178, 150, 146], escura: [126, 96, 98], osso: [222, 206, 188], olho: [246, 196, 92], mancha: [150, 112, 112] },     // pálido, de tendão à mostra
  { pele: [82, 88, 74], escura: [54, 58, 50], osso: [184, 168, 132], olho: [140, 236, 160], mancha: [206, 124, 58] },         // queimado e tomado de fungo
];
const GRANDAO = [
  { pele: [146, 158, 120], escura: [104, 116, 86], roupa: [96, 84, 72], bolha: [196, 186, 112] },      // inchado
  { pele: [124, 132, 112], escura: [86, 94, 78], roupa: [70, 76, 86], bolha: [184, 156, 104] },        // brutamontes com couraça de fungo
];

export function formas_especial(z, t) {
  if (z.voa) return formas_ovni(z, t, { queda: z.vida <= 0 ? z.morte : -1 });
  // formas em px de cena (zoom 1) com os pés no ponto do zumbi
  const px = sx(z.x, z.y), py = sy(z.x, z.y);
  const vira = z.dir === 1 || z.dir === 2, costas = z.dir === 2 || z.dir === 3;
  let f = z.esp === 'monstro' ? _monstro(z, t, costas) : _grandao(z, t, costas);
  const morte = z.vida <= 0 ? z.morte : -1;
  if (morte >= 0) {   // tomba para a frente e some
    const ang = Math.min(1, morte * 1.8) * 1.5, cs = Math.cos(ang), sn = Math.sin(ang), a = morte < 0.6 ? 1 : 1 - (morte - 0.6) / 0.4;
    f = f.map(([cor, pts]) => [a < 1 ? _alfa(cor, (cor[3] === undefined ? 1 : cor[3] / 255) * a) : cor, pts.map(([x, y]) => [x * cs - y * sn, x * sn + y * cs])]);
  }
  if (vira) f = f.map(([cor, pts]) => [cor, pts.map(([x, y]) => [-x, y])]);
  const sombra = iso.elipse(0, 1, z.esp === 'monstro' ? 13 : 15, z.esp === 'monstro' ? 4.5 : 5.5, [96, 116, 170, morte >= 0 ? 50 : 97], 14);
  return [sombra].concat(f).map(([cor, pts]) => [cor, pts.map(([x, y]) => [px + x * K_ESP, py + y * K_ESP])]);
}

function _monstro(z, t, costas) {
  // alto, magro, curvado; pernas de bicho (calcanhar alto), braços até o chão
  const c = MONSTRO[z.var], f = [];
  const ph = z.fase, anda = z.andando ? 1 : 0, e = z.estado, k = z.t_est;
  const resp = Math.sin(t * 2.1 + z.n) * 0.8;
  // quanto o corpo abaixa (pegar a pedra) e para onde o tronco inclina
  let agacha = 0, inclina = 0;
  if (e === 'pegar') agacha = Math.sin(Math.min(1, k / T_PEGAR) * Math.PI) * 11;
  if (e === 'mirar') inclina = -5 * Math.min(1, k / T_MIRAR);
  if (e === 'lancar') inclina = -5 + 13 * Math.min(1, k / (T_LANCAR * 0.5));
  const bob = anda ? Math.abs(Math.sin(ph)) * 2.2 : resp * 0.4;
  const quadril = [0, -24 + agacha - bob];
  const peito = [quadril[0] + 9 + inclina * 0.6 + agacha * 0.5, quadril[1] - 12 + agacha * 0.35 + (e === 'mirar' ? -3 : 0)];
  const meio = [(quadril[0] + peito[0]) / 2 - 2.5, (quadril[1] + peito[1]) / 2 - 2.5];   // corcunda
  const cab = [peito[0] + 7 + inclina * 0.4, peito[1] + 2 + agacha * 0.2 + resp * 0.3];
  // pernas: o pé vai para a frente e para trás no chão; o calcanhar fica no alto
  const perna = (lado) => {
    const p = ph + (lado ? Math.PI : 0);
    const passo = anda ? Math.sin(p) * 8 : (lado ? -3 : 3);
    const ergue = anda ? Math.max(0, Math.cos(p)) * 5 : 0;
    const pe = [passo + 2, -ergue];
    const calc = [pe[0] - 5, pe[1] - 8];
    const [joelho] = _ik(quadril[0], quadril[1], calc[0], calc[1], 11, 11, 1);
    return { pe, calc, joelho };
  };
  // braços: a mão vai para onde a ação manda
  const braco = (lado) => {
    const om = [peito[0] - 1, peito[1] + 1];
    let mao;
    if (e === 'pegar' && !lado) mao = [peito[0] + 9, -1];                                       // mão no chão
    else if (e === 'mirar' && !lado) { const q = Math.min(1, k / T_MIRAR); mao = [peito[0] - 8 * q, peito[1] - 14 * q - 4]; }   // pedra para trás da cabeça
    else if (e === 'lancar' && !lado) { const q = Math.min(1, k / (T_LANCAR * 0.6)); mao = [peito[0] - 8 + 30 * q, peito[1] - 18 + 22 * q]; }
    else {
      const p = ph + (lado ? 0 : Math.PI);
      mao = [peito[0] + 7 + (anda ? Math.sin(p) * 7 : 0) + resp * 0.3, -3 - (anda ? Math.max(0, Math.cos(p)) * 4 : 0) - (lado ? 1 : 0)];
    }
    const [cot, m] = _ik(om[0], om[1], mao[0], mao[1], 13, 14, -1);
    return { om, cot, mao: m };
  };
  const pl = perna(1), pp = perna(0), bl = braco(1), bp = braco(0);
  const desenha_perna = (p, cor) => {
    _osso(f, quadril, p.joelho, 5, 3.4, cor); _osso(f, p.joelho, p.calc, 3.4, 2.4, cor); _osso(f, p.calc, p.pe, 2.4, 2.0, cor);
    for (const dx of [-0.5, 1.5, 3.5]) f.push(iso.linha(p.pe, [p.pe[0] + dx + 1.5, p.pe[1] + 0.8], 0.9, c.osso));   // garras do pé
  };
  const desenha_braco = (b, cor, pedra) => {
    _osso(f, b.om, b.cot, 4.2, 3.0, cor); _osso(f, b.cot, b.mao, 3.0, 2.2, cor);
    const d = [b.mao[0] - b.cot[0], b.mao[1] - b.cot[1]], m = Math.hypot(d[0], d[1]) || 1;
    for (const a of [-0.5, 0, 0.5]) {   // três garras compridas
      const cs = Math.cos(a), sn = Math.sin(a), ux = (d[0] * cs - d[1] * sn) / m, uy = (d[0] * sn + d[1] * cs) / m;
      f.push(iso.linha(b.mao, [b.mao[0] + ux * 5.5, b.mao[1] + uy * 5.5 + 1], 0.9, c.osso));
    }
    if (pedra) f.push(..._pedra_formas(b.mao[0], b.mao[1] - 2 * K_PEDRA / K_ESP, (1 + z.var * 0.25) * K_PEDRA / K_ESP, 0));   // na mão já é ampliada pelo K_ESP
  };
  // o que fica longe primeiro (mais escuro), depois o corpo, depois o que fica perto
  const longe = costas ? c.pele : c.escura, perto = costas ? c.escura : c.pele;
  desenha_perna(pl, longe); desenha_braco(bl, longe, false);
  // tronco: espinha arqueada, costelas e espinhos nas costas
  _osso(f, quadril, meio, 8, 9, c.escura); _osso(f, meio, peito, 9, 8.5, perto);
  for (let i = 0; i < 4; i++) {
    const q = 0.2 + i * 0.2, x = meio[0] + (peito[0] - meio[0]) * q, y = meio[1] + (peito[1] - meio[1]) * q;
    f.push(iso.linha([x + 1, y + 2.5], [x + 3, y + 4.2], 0.9, c.osso));   // costela
  }
  for (const q of [0.15, 0.35, 0.55, 0.75, 0.9]) {
    const a = q < 0.5 ? quadril : meio, b = q < 0.5 ? meio : peito, w = (q < 0.5 ? q : q - 0.5) * 2;
    const x = a[0] + (b[0] - a[0]) * w, y = a[1] + (b[1] - a[1]) * w;
    f.push([c.osso, [[x - 1.6, y - 3.2], [x - 0.8, y - 7.5 - (z.var ? 0 : 1.5)], [x + 1.4, y - 3.6]]]);   // espinho
  }
  if (z.var) for (const [ax, ay, r] of [[-2, -3, 2.4], [3, -5, 2.0], [7, -4, 1.6]]) f.push(iso.elipse(meio[0] + ax, meio[1] + ay, r, r * 0.8, c.mancha, 8));   // fungo nas costas
  // pescoço e cabeça comprida, sem rosto: boca grande, fileira de olhos pequenos
  _osso(f, peito, [cab[0] - 2, cab[1] + 0.5], 5, 3.8, perto);
  const abre = e === 'lancar' ? 1 : e === 'mirar' ? 0.4 : (Math.sin(t * 1.3 + z.n) > 0.92 ? 0.6 : 0.12);
  f.push([c.pele, [[cab[0] - 3, cab[1] - 3.2], [cab[0] + 5, cab[1] - 3.8], [cab[0] + 9.5, cab[1] - 1.4], [cab[0] + 9, cab[1] + 0.4], [cab[0] - 2.5, cab[1] + 1.2]]]);
  f.push([c.escura, [[cab[0] - 2.4, cab[1] + 1.2], [cab[0] + 8.6, cab[1] + 0.6 + abre * 1.2], [cab[0] + 6.8, cab[1] + 2.4 + abre * 4.5], [cab[0] - 1.4, cab[1] + 3.0]]]);
  if (abre > 0.3) {
    f.push([[64, 20, 26], [[cab[0] - 0.5, cab[1] + 1.4], [cab[0] + 8, cab[1] + 0.8], [cab[0] + 6.4, cab[1] + 1.8 + abre * 3.6]]]);
    for (let i = 0; i < 4; i++) f.push([c.osso, [[cab[0] + 1 + i * 1.8, cab[1] + 0.9], [cab[0] + 1.9 + i * 1.8, cab[1] + 2.3], [cab[0] + 2.8 + i * 1.8, cab[1] + 0.8]]]);
  }
  if (!costas) for (let i = 0; i < 3; i++) f.push(iso.elipse(cab[0] + 3 + i * 1.6, cab[1] - 2.2 + i * 0.3, 0.7, 0.6, c.olho, 6));
  if (z.var) f.push(iso.elipse(cab[0] + 1, cab[1] - 3.6, 2.2, 1.4, c.mancha, 8));
  // a pedra fica na mão de trás enquanto pega e mira
  desenha_perna(pp, perto); desenha_braco(bp, perto, z.pedra_mao);
  return f;
}

function _grandao(z, t, costas) {
  // enorme, lento, barrigudo: o grito sai da boca com o peito estufado
  const c = GRANDAO[z.var], f = [];
  const ph = z.fase * 0.8, anda = z.andando ? 1 : 0, e = z.estado, k = z.t_est;
  let estufa = 0, cabeca_tras = 0, boca = 0.15, treme = 0;
  if (e === 'inspirar') { const q = Math.min(1, k / T_INSPIRAR); estufa = q * 3; cabeca_tras = q * 5; boca = 0.3; }
  if (e === 'gritar') { const q = Math.min(1, k / 0.15); estufa = 3 - 2 * Math.min(1, k / T_GRITAR); cabeca_tras = 5 - 11 * q; boca = 1; treme = Math.sin(t * 60) * 0.8; }
  const pancada = z.tiro;   // mordida: tranco para a frente
  const bob = anda ? Math.abs(Math.sin(ph)) * 2.6 : Math.sin(t * 1.6 + z.n) * 0.5;
  const base_y = -2 - bob;
  // pernas grossas e curtas
  const perna = (lado, cor) => {
    const p = ph + (lado ? Math.PI : 0), dx = anda ? Math.sin(p) * 5 : 0, sobe = anda ? Math.max(0, Math.cos(p)) * 3 : 0;
    f.push(iso.ret(-4 + dx + (lado ? -2 : 2), -12 + base_y + 2 - sobe, 6, 12 - base_y * 0.2, cor));
    f.push(iso.elipse(-1 + dx + (lado ? -2 : 2) + 2, -0.5 - sobe, 4.6, 2.2, [52, 48, 46], 10));
  };
  const braco = (lado, cor) => {
    const p = ph + (lado ? 0 : Math.PI), ombro = [3 + treme, -26 + base_y - estufa * 0.4];
    let mao = [6 + (anda ? Math.sin(p) * 6 : 0) + pancada * 9, -6 + base_y - pancada * 8 - (lado ? 1 : 0)];
    if (e === 'inspirar' || e === 'gritar') mao = [lado ? -6 : 10, -14 + base_y - (e === 'gritar' ? 6 : 0)];   // braços abertos
    const [cot, m] = _ik(ombro[0], ombro[1], mao[0], mao[1], 11, 11, -1);
    _osso(f, ombro, cot, 6.5, 5.5, cor); _osso(f, cot, m, 5.5, 5, cor);
    f.push(iso.elipse(m[0] + 1, m[1] + 1, 3.6, 3.2, cor, 10));
  };
  const longe = costas ? c.pele : c.escura, perto = costas ? c.escura : c.pele;
  perna(1, c.roupa); braco(1, longe);
  // corpo: barriga enorme, peito que estufa no grito
  f.push(iso.elipse(1 + treme, -17 + base_y, 11 + estufa, 12 + estufa * 0.6, c.roupa, 18));
  f.push(iso.elipse(3 + treme, -15 + base_y, 9.5 + estufa, 10 + estufa * 0.5, perto, 18));
  f.push(iso.elipse(-2 + treme, -24 + base_y, 8, 6.5, longe, 14));   // ombros
  f.push([c.roupa, [[-9, -9 + base_y], [11, -9 + base_y], [9, -5 + base_y], [4, -7 + base_y], [-1, -4 + base_y], [-8, -6 + base_y]]]);   // roupa rasgada
  if (z.var === 0) {   // inchado: bolhas na barriga
    for (const [ax, ay, r] of [[6, -16, 2.2], [2, -11, 1.8], [8, -10, 1.5], [-1, -19, 1.4]]) {
      f.push(iso.elipse(ax + treme, ay + base_y, r, r, c.bolha, 8));
      f.push(iso.elipse(ax - r * 0.3 + treme, ay - r * 0.3 + base_y, r * 0.4, r * 0.35, [236, 230, 190], 6));
    }
  } else {             // brutamontes: placas de fungo nas costas e ombros
    for (const [ax, ay, r, cor] of [[-6, -27, 4.2, FUNGO.escuro], [-1, -30, 3.6, FUNGO.medio], [-9, -21, 3.4, FUNGO.medio], [3, -28, 2.6, FUNGO.claro], [-4, -16, 2.6, FUNGO.laranja]]) {
      f.push(iso.elipse(ax + treme, ay + base_y, r, r * 0.8, cor, 10));
      f.push(iso.elipse(ax - r * 0.25 + treme, ay - r * 0.25 + base_y, r * 0.45, r * 0.3, tom(cor, 1.15), 6));
    }
  }
  // cabeça pequena afundada nos ombros; no grito ela vem para a frente com a boca escancarada
  const hx = 7 + cabeca_tras * -0.6 + pancada * 3 + treme, hy = -30 + base_y - cabeca_tras * 0.4 - estufa * 0.3;
  f.push(iso.elipse(hx, hy, 4.6, 4.4, perto, 14));
  if (!costas) {
    const bw = 1.4 + boca * 3.0, bh = 0.8 + boca * 4.2;
    f.push(iso.elipse(hx + 2, hy + 2 + boca, bw, bh, [52, 18, 22], 12));
    if (boca > 0.5) {
      for (let i = 0; i < 4; i++) f.push([[232, 222, 196], [[hx + 2 - bw + 0.4 + i * bw * 0.5, hy + 2 + boca - bh * 0.9], [hx + 2 - bw + 0.9 + i * bw * 0.5, hy + 2 + boca - bh * 0.4], [hx + 2 - bw + 1.4 + i * bw * 0.5, hy + 2 + boca - bh * 0.9]]]);
    }
    f.push(iso.elipse(hx + 1.2, hy - 1.6, 0.8, 0.7, OLHO, 6));
    f.push(iso.elipse(hx + 3.2, hy - 1.4, 0.7, 0.6, OLHO, 6));
  }
  perna(0, tom(c.roupa, 1.12)); braco(0, perto);
  return f;
}

function _pedra_formas(cx, cy, k, giro) {
  // pedra irregular com face de cima mais clara
  const pts = [], cima = [];
  for (let i = 0; i < 7; i++) {
    const a = giro + i / 7 * Math.PI * 2, r = (2.6 + ((i * 37) % 5) * 0.25) * k;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85]);
    cima.push([cx + Math.cos(a) * r * 0.55 - 0.6 * k, cy + Math.sin(a) * r * 0.45 - 1.0 * k]);
  }
  return [[[102, 98, 96], pts], [[138, 134, 130], cima]];
}

export function formas_pedra(p) {
  // pedra no ar + a sombra dela no chão (a sombra encolhe quanto mais alto)
  const gx = sx(p.x, p.y), gy = sy(p.x, p.y), h = p.h * C.ZH;
  const s = Math.max(0.35, 1 - p.h / 14), k = p.tam * K_PEDRA;
  return [iso.elipse(gx, gy, 4 * s * k, 1.8 * s * k, [96, 116, 170, 90], 12)].concat(_pedra_formas(gx, gy - h, k, p.giro));
}

export function formas_impacto(im) {
  // poeira subindo, pedaços voando e a pedra quebrada no chão
  const [x, y, t, tam0] = im, f = [], cx = sx(x, y), cy = sy(x, y), tam = tam0 * K_PEDRA * 0.5;   // poeira 2,5x, pedra 5x
  const q = Math.min(1, t / 1.4), a = 1 - q;
  f.push(iso.elipse(cx, cy, (10 + q * 30) * tam, (4 + q * 12) * tam, [150, 140, 128, Math.round(150 * a)], 16));
  f.push(iso.elipse(cx - 2, cy - 4 - q * 10, (6 + q * 16) * tam, (4 + q * 9) * tam, [190, 182, 170, Math.round(120 * a)], 14));
  for (let i = 0; i < 6; i++) {   // lascas
    const ang = i / 6 * Math.PI * 2 + 0.4, d = q * 22 * tam, alt = Math.max(0, 14 * q * (1 - q) * 4) * tam;
    if (q < 0.7) f.push(iso.elipse(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d * 0.5 - alt, 1.6 * tam, 1.3 * tam, [110, 104, 100], 6));
  }
  f.push(..._pedra_formas(cx + 1, cy - 2, tam0 * K_PEDRA * 0.75, 1.3).map(([cor, pts]) => [[cor[0], cor[1], cor[2], Math.round(255 * Math.min(1, a * 2))], pts]));
  return f;
}

export function formas_onda(o) {
  // o super grito: três frentes de onda em leque, de neve e ar, saindo da boca
  const f = [], a0 = Math.atan2(o.uy, o.ux), fim = Math.min(1, o.t / 0.9), some = o.t > 0.9 ? 1 - (o.t - 0.9) / 0.4 : 1;
  const leque = (r, w, alfa, cor) => {
    if (r <= 0.05) return;
    const ext = [], int = [];
    for (let i = 0; i <= 12; i++) {
      const a = a0 - o.abre + 2 * o.abre * i / 12;
      ext.push([sx(o.x + Math.cos(a) * (r + w), o.y + Math.sin(a) * (r + w)), sy(o.x + Math.cos(a) * (r + w), o.y + Math.sin(a) * (r + w), zb)]);
      int.push([sx(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r), sy(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r, zb)]);
    }
    f.push([[cor[0], cor[1], cor[2], Math.round(alfa * some)], ext.concat(int.reverse())]);
  };
  const r = o.alc * fim, zb = 2.6 - 1.9 * fim;   // a onda sai da boca (alto) e desce para o chão
  leque(Math.max(0.1, r * 0.35), 0.5, 40, [214, 232, 226]);     // ar deformado atrás
  leque(r - 1.4, 0.35, 80, [226, 240, 236]);
  leque(r - 0.7, 0.4, 120, [236, 246, 242]);
  leque(r - 0.25, 0.3, 190, [255, 255, 255]);                    // a frente da onda
  for (let i = 0; i < 9; i++) {   // neve arrancada do chão pela onda
    const a = a0 - o.abre + 2 * o.abre * ((i * 0.618) % 1), rr = r - 0.3 - (i % 3) * 0.3;
    if (rr > 0.3) f.push(iso.elipse(sx(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr), sy(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr, zb * 0.4 + (i % 3) * 0.25), 1.6, 1.4, [255, 255, 255, Math.round(200 * some)], 6));
  }
  return f;
}

// ======================================================================
// DISCO VOADOR: disco de metal com cúpula, luzes piscando em volta, brilho
// embaixo e o raio que desce até o chão quando está puxando alguém
// ======================================================================
const K_OVNI = 3;
export function formas_ovni(z, t, { sobe = 0, alfa = 1, queda = -1 } = {}) {
  // casco escuro e torto, sem cúpula nem luz colorida: um disco de metal negro
  // com nervuras, chapas soltas, fungo na borda, cabos pendurados balançando
  // e um rasgo vermelho fraco no meio, pulsando devagar
  const gx = sx(z.x, z.y), gy = sy(z.x, z.y);
  let voa = z.voa + sobe;
  if (queda >= 0) voa *= 1 - queda * queda;
  const bob = Math.sin(t * 1.3 + z.fase) * 2.2 * (queda >= 0 ? 0 : 1);
  const cy = gy - voa * C.ZH + bob, f = [];
  const A = (cor, a = 1) => [cor[0], cor[1], cor[2], Math.round((cor[3] === undefined ? 255 : cor[3]) * a * alfa)];
  const pulso = 0.5 + 0.5 * Math.sin(t * 1.1 + z.fase);
  const inc = queda >= 0 ? queda * 0.55 : Math.sin(t * 0.7 + z.fase) * 0.04;   // balança de leve; caindo, tomba
  const P = (dx, dy) => [gx + dx * K_OVNI, cy + dy * K_OVNI + dx * K_OVNI * inc];
  const contorno = (raios, dy, achata) => raios.map((r, k) => { const a = k / raios.length * Math.PI * 2; return P(Math.cos(a) * r, dy + Math.sin(a) * r * achata); });
  // sombra larga e escura
  const s = Math.max(0.3, 1 - voa / 16);
  f.push(iso.elipse(gx, gy, 30 * s * K_OVNI, 10 * s * K_OVNI, A([30, 34, 48, 110]), 18));
  // o raio: luz fria e fraca, quase cinza, com poeira subindo
  const luz = (z.luz || 0) * (queda >= 0 ? 0 : 1);
  if (luz > 0.02) {
    const topo = 5 * K_OVNI, base = 16 * K_OVNI, y0 = cy + 5 * K_OVNI;
    f.push([A([196, 204, 214, 34], luz), [[gx - topo, y0], [gx + topo, y0], [gx + base, gy], [gx - base, gy]]]);
    f.push([A([226, 230, 236, 30], luz), [[gx - topo * 0.4, y0], [gx + topo * 0.4, y0], [gx + base * 0.45, gy], [gx - base * 0.45, gy]]]);
    f.push(iso.elipse(gx, gy, base, base * 0.36, A([210, 216, 226, 46], luz), 20));
    f.push(iso.elipse(gx, gy, base * 0.6, base * 0.2, A([150, 40, 40, 40], luz * pulso), 16));
    for (let k = 0; k < 10; k++) {   // poeira e neve subindo pelo raio
      const q = ((t * 0.35 + k * 0.137) % 1), yy = gy + (y0 - gy) * q, xx = gx + Math.sin(k * 2.3 + t * 0.8) * base * (1 - q) * 0.6;
      f.push(iso.elipse(xx, yy, 1.4, 1.4, A([220, 224, 230, 150], luz * (1 - q)), 6));
    }
  }
  // cabos e tentáculos pendurados por baixo (balançando)
  for (let k = 0; k < 7; k++) {
    const ax = -14 + k * 4.6, comp = 7 + ((k * 37) % 5) * 1.6, bal = Math.sin(t * 1.6 + k * 1.3 + z.fase) * 2.2;
    const a = P(ax, 3.2), m = P(ax + bal * 0.5, 3.2 + comp * 0.5), b = P(ax + bal, 3.2 + comp);
    f.push(iso.linha(a, m, 1.4, A([20, 20, 24])));
    f.push(iso.linha(m, b, 1.0, A([28, 26, 30])));
  }
  // barriga: chapas escuras, com o núcleo vermelho fraco
  f.push([A([16, 16, 20]), contorno([17, 15, 16.5, 13, 15.5, 17, 14, 16, 15, 16.5, 13.5, 15.5], 3.2, 0.3)]);
  f.push(iso.elipse(P(0, 4)[0], P(0, 4)[1], 4.5 * K_OVNI, 1.4 * K_OVNI, A([90 + 60 * pulso, 22, 24]), 14));
  f.push(iso.elipse(P(0, 4)[0], P(0, 4)[1], 2 * K_OVNI, 0.6 * K_OVNI, A([200, 70 + 30 * pulso, 60]), 10));
  // casco: borda torta e quebrada (sem simetria de brinquedo)
  const borda = [27, 25.5, 28, 24, 26.5, 28.5, 23, 27, 25, 28, 22.5, 26.5, 27.5, 24.5];
  f.push([A([30, 31, 36]), contorno(borda, 1.2, 0.27)]);
  f.push([A([44, 46, 52]), contorno(borda.map(r => r - 1.6), 0, 0.26)]);
  f.push([A([58, 60, 66]), contorno(borda.map(r => r * 0.72), -1.4, 0.25)]);
  // nervuras do casco (do centro para a borda)
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * Math.PI * 2 + 0.2, r1 = borda[k % borda.length] - 2.5;
    f.push(iso.linha(P(Math.cos(a) * 6, -1.6 + Math.sin(a) * 1.6), P(Math.cos(a) * r1, Math.sin(a) * r1 * 0.26), 1.3, A([24, 25, 30])));
  }
  // chapa solta levantada e um rombo na borda
  f.push([A([66, 68, 74]), [P(14, -2.2), P(21, -1.2), P(22, -4.6), P(15, -5.2)]]);
  f.push([A([12, 12, 14]), [P(-23, 0.4), P(-18, 1.8), P(-15, 0.2), P(-19, -1.2)]]);
  // fungo grudado na borda (da mesma infecção da nave caída)
  for (const [dx, dy, r] of [[-20, -0.6, 2.6], [-17, 0.8, 1.8], [9, 2.2, 2.2], [18, 1.4, 1.6], [-4, 2.8, 1.5]]) {
    f.push(iso.elipse(P(dx, dy)[0], P(dx, dy)[1], r * K_OVNI, r * 0.6 * K_OVNI, A([78, 66, 46]), 9));
    f.push(iso.elipse(P(dx - 0.4, dy - 0.4)[0], P(dx - 0.4, dy - 0.4)[1], r * 0.45 * K_OVNI, r * 0.26 * K_OVNI, A([126, 104, 70]), 7));
  }
  // corcova do centro, baixa e fosca, com a fenda vermelha que pulsa
  f.push([A([38, 40, 46]), contorno([9, 8, 9.5, 7.5, 8.5, 9, 7.8, 8.6], -2.6, 0.45)]);
  f.push([A([50, 52, 58]), contorno([6.5, 5.8, 7, 5.5, 6.2, 6.8], -4.0, 0.42)]);
  f.push([A([80 + 120 * pulso, 18, 20]), [P(-4.2, -4.4), P(4.2, -4.6), P(3.6, -3.6), P(-3.8, -3.5)]]);
  // três luzes vermelhas fracas, que só acendem de vez em quando
  for (const [dx, dy, k] of [[-24, 0.6, 0], [25, 0.4, 1.7], [2, 6.4, 3.1]]) {
    const liga = Math.max(0, Math.sin(t * 0.9 + k + z.fase)) ** 6;
    f.push(iso.elipse(P(dx, dy)[0], P(dx, dy)[1], 1.2 * K_OVNI * 0.6, 1.0 * K_OVNI * 0.6, A([60 + 170 * liga, 16, 16]), 8));
  }
  if (queda >= 0) {   // fumaça preta saindo enquanto cai
    for (let k = 0; k < 5; k++) f.push(iso.elipse(gx - 12 * K_OVNI + k * 4, cy - 10 - k * 11 - queda * 24, 7 + k * 3.5, 6 + k * 2.4, A([28, 28, 32, 180 - k * 30]), 10));
  }
  return f;
}

export function formas_levado(l, voa_ovni) {
  // veículo puxado pelo raio (soldado usa o próprio sprite, na cena)
  const q = Math.min(1, l.t / 1.2), h = q * voa_ovni * C.ZH, k = 1 - q * 0.6, a = Math.round(255 * Math.min(1, (1.3 - l.t) * 3));
  const gx = sx(l.x, l.y), gy = sy(l.x, l.y) - h, gira = Math.sin(l.t * 7) * 0.4;
  const pts = [[-9, -4], [9, -4], [9, 4], [-9, 4]].map(([x, y]) => [gx + (x * Math.cos(gira) - y * Math.sin(gira)) * k, gy - 6 * k + (x * Math.sin(gira) + y * Math.cos(gira)) * k]);
  return [[[78, 104, 70, a], pts], iso.elipse(gx - 5 * k, gy + 1, 3 * k, 3 * k, [40, 40, 44, a], 8), iso.elipse(gx + 5 * k, gy + 1, 3 * k, 3 * k, [40, 40, 44, a], 8)];
}
