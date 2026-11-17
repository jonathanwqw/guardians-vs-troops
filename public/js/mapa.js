// mapa.js — os DADOS do cenário e as perguntas que o jogo faz (clone de jogo/mapa.py):
//     eh_estrada(x, y)   -> true/false
//     dist_estrada(x, y) -> distância até a borda da estrada
//     dono(x, y)         -> 'verde' | 'vermelho'
//     dist_frente(x, y)  -> + dentro do verde, - dentro do vermelho
//     tipo(x, y)         -> 'estrada' | 'lote' | 'neve'
// Nada aqui desenha. O terreno.js lê estes mesmos dados.
import * as C from './config.js';
import { de_uv, limitar, semente, hip } from './iso.js';

const _rnd = semente(20261111);

// ---------- curvas --------------------------------------------------
export function suavizar(p, passos) {
  // Catmull-Rom: passa por todos os pontos de controle, suave.
  const out = [];
  const n = p.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(n - 1, i + 2)];
    for (let k = 0; k < passos; k++) {
      const t = k / passos;
      const t2 = t * t, t3 = t * t * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([p[n - 1][0], p[n - 1][1]]);
  return out;
}

export class Rota {
  // lista de pontos + comprimento acumulado, para andar por ela
  constructor(pts) {
    this.pts = pts;
    this.acum = [0.0];
    for (let i = 1; i < pts.length; i++) {
      this.acum.push(this.acum[this.acum.length - 1] + hip(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    this.comprimento = this.acum[this.acum.length - 1];
  }

  em(s) {
    // [x, y, dx, dy]: posição e direção a uma distância s do início
    s = limitar(s, 0.0, this.comprimento);
    const acum = this.acum, pts = this.pts;
    let i = 1;
    while (i < acum.length - 1 && acum[i] < s) i++;
    const a = pts[i - 1], b = pts[i];
    const seg = (acum[i] - acum[i - 1]) || 1.0;
    const t = (s - acum[i - 1]) / seg;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
  }

  s_perto(x, y) {
    // distância ao longo da rota do ponto mais próximo de (x, y)
    let melhor = 0.0, md = 1e18;
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      const d = hip(p[0] - x, p[1] - y);
      if (d < md) { md = d; melhor = this.acum[i]; }
    }
    return melhor;
  }
}

// ---------- ESTRADAS ------------------------------------------------
function _uv(lista) { return lista.map(([u, v]) => de_uv(u, v)); }

const _CENTRO = [[0, -70], [-7, -58], [5, -44], [-4, -28], [3, -12], [0, 0], [-5, 14], [5, 30], [-5, 46], [4, 60], [0, 70]];
const _ESQUERDA = [[0, -70], [-7, -58], [-18, -46], [-28, -28], [-30, -8], [-27, 10], [-20, 26], [-12, 38], [-5, 46], [4, 60], [0, 70]];
const _DIREITA = [[0, -70], [-7, -58], [5, -44], [19, -34], [28, -16], [29, 4], [24, 22], [13, 34], [-5, 46], [4, 60], [0, 70]];
const _TRAVESSA = [[-47, -2], [-30, -8], [-14, -3], [0, 0], [14, 5], [29, 4], [47, -3]];

export const ESTRADAS = [
  { id: 'centro', largura: 2.4, controle: _uv(_CENTRO) },
  { id: 'esquerda', largura: 2.0, controle: _uv(_ESQUERDA) },
  { id: 'direita', largura: 2.0, controle: _uv(_DIREITA) },
  { id: 'travessa', largura: 1.9, controle: _uv(_TRAVESSA) },
];
for (const e of ESTRADAS) e.pts = suavizar(e.controle, 10);

// segmentos pré-calculados: [ax, ay, vx, vy, comprimento², meia largura]
const _SEGS = [];
for (const e of ESTRADAS) {
  const p = e.pts;
  for (let i = 1; i < p.length; i++) {
    const vx = p[i][0] - p[i - 1][0], vy = p[i][1] - p[i - 1][1];
    _SEGS.push([p[i - 1][0], p[i - 1][1], vx, vy, vx * vx + vy * vy, e.largura / 2]);
  }
}

// GRADE DE CANDIDATOS (desempenho): para cada célula de 2x2 do mundo guarda
// só os trechos de estrada que PODEM ser o mais perto de algum ponto dela.
// A conta continua exatamente a mesma (mesma fórmula, nos mesmos trechos que
// podem ganhar), mas em vez de olhar ~360 trechos olha só uns poucos.
// Prova: dentro da célula, a distância de cada trecho muda no máximo meia
// diagonal (hd) em relação ao centro; quem passa de (menor no centro + 2·hd)
// nunca é o menor ali.
const _G = 2.0, _G0 = -120, _GN = 120;   // células de 2 unidades, de -120 a +120
let _cand = null;
function _f_seg(s, x, y) {
  const l2 = s[4];
  let t = l2 ? ((x - s[0]) * s[2] + (y - s[1]) * s[3]) / l2 : 0.0;
  t = t < 0 ? 0.0 : t > 1 ? 1.0 : t;
  return hip(x - (s[0] + s[2] * t), y - (s[1] + s[3] * t)) - s[5];
}
const _fbuf = new Float64Array(_SEGS.length);
function _celula(i, j) {
  // monta a lista da célula só quando ela é usada pela primeira vez
  const hd = _G * Math.SQRT2 / 2 + 1e-6;
  const cx = _G0 + (i + 0.5) * _G, cy = _G0 + (j + 0.5) * _G;
  let m = 1e18;
  for (let k = 0; k < _SEGS.length; k++) { _fbuf[k] = _f_seg(_SEGS[k], cx, cy); if (_fbuf[k] < m) m = _fbuf[k]; }
  const lim = m + 2 * hd, lista = [];
  for (let k = 0; k < _SEGS.length; k++) if (_fbuf[k] <= lim) lista.push(k);
  return (_cand[j * _GN + i] = Int16Array.from(lista));
}

export function dist_estrada(x, y) {
  // distância até a BORDA da estrada mais próxima (<= 0 = em cima dela)
  const gi = Math.floor((x - _G0) / _G), gj = Math.floor((y - _G0) / _G);
  if (gi >= 0 && gj >= 0 && gi < _GN && gj < _GN) {
    if (_cand === null) _cand = new Array(_GN * _GN);
    const lista = _cand[gj * _GN + gi] || _celula(gi, gj);
    let melhor = 1e18;
    for (let n = 0; n < lista.length; n++) {
      const s = _SEGS[lista[n]];
      const l2 = s[4];
      let t = l2 ? ((x - s[0]) * s[2] + (y - s[1]) * s[3]) / l2 : 0.0;
      t = t < 0 ? 0.0 : t > 1 ? 1.0 : t;
      const d = hip(x - (s[0] + s[2] * t), y - (s[1] + s[3] * t)) - s[5];
      if (d < melhor) melhor = d;
    }
    return melhor;
  }
  return _dist_estrada_toda(x, y);   // fora da grade: conta em todos os trechos
}

function _dist_estrada_toda(x, y) {
  let melhor = 1e18;
  for (let k = 0; k < _SEGS.length; k++) {
    const s = _SEGS[k];
    const l2 = s[4];
    let t = l2 ? ((x - s[0]) * s[2] + (y - s[1]) * s[3]) / l2 : 0.0;
    t = t < 0 ? 0.0 : t > 1 ? 1.0 : t;
    const d = hip(x - (s[0] + s[2] * t), y - (s[1] + s[3] * t)) - s[5];
    if (d < melhor) melhor = d;
  }
  return melhor;
}

export function eh_estrada(x, y) { return dist_estrada(x, y) <= 0; }

// ---------- LINHA DE FRENTE -----------------------------------------
export const FRENTE = [
  [-50, -6], [-36, -2], [-22, 4], [-9, 1], [3, -3], [15, 2], [30, 5], [50, 0],
];
export let AVANCO_FRENTE = 0.0;  // atualizado pelas melhorias do QG
export function definir_avanco(v) { AVANCO_FRENTE = v; }

export function F(u) {
  const c = FRENTE;
  const n = c.length;
  if (u <= c[0][0]) return c[0][1] - AVANCO_FRENTE;
  if (u >= c[n - 1][0]) return c[n - 1][1] - AVANCO_FRENTE;
  let i = 0;
  while (u > c[i + 1][0]) i++;
  const a = c[i], b = c[i + 1];
  const h = b[0] - a[0];
  const t = (u - a[0]) / h;
  const ant = c[Math.max(0, i - 1)], dep = c[Math.min(n - 1, i + 2)];
  const m0 = (b[1] - ant[1]) / (b[0] - ant[0]);   // tangentes (Hermite)
  const m1 = (dep[1] - a[1]) / (dep[0] - a[0]);
  const t2 = t * t, t3 = t * t * t;
  return -AVANCO_FRENTE + ((2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * h * m0 +
    (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * h * m1);
}

export function dist_frente(x, y) { return (x + y) - F(x - y); }
export function dono(x, y) { return dist_frente(x, y) > 0 ? 'verde' : 'vermelho'; }

// ---------- CONSTRUÇÕES ---------------------------------------------
export const BASES = { vermelho: de_uv(0, -78), verde: de_uv(0, 78) };
export const PORTA = {
  vermelho: [BASES.vermelho[0], BASES.vermelho[1] + 1.9],
  verde: [BASES.verde[0] - 2.4, BASES.verde[1]],
};

function _predio(tipo, time, u, v, extra = {}) {
  const [x, y] = de_uv(u, v);
  return Object.assign({ tipo, time, x, y }, extra);
}

export const CONSTRUCOES = [
  _predio('qg', 'vermelho', 0, -78),
  _predio('galpao', 'vermelho', -14, -84, { eixo: 'x', bandeira: true }),
  _predio('galpao', 'vermelho', 14, -84, { eixo: 'y', bandeira: true }),
  _predio('galpao', 'vermelho', -23, -74, { eixo: 'y' }),
  _predio('galpao', 'vermelho', 23, -74, { eixo: 'x' }),
  _predio('base', 'verde', 0, 78, { eixo: 'x' }),
  _predio('galpao', 'verde', -14, 85, { eixo: 'y', bandeira: true }),
  _predio('galpao', 'verde', 14, 85, { eixo: 'x', bandeira: true }),
  _predio('posto', 'neutro', -39, -6),
  _predio('posto', 'neutro', 39, 3),
];

// onde o inimigo junta as tropas de uma onda antes de atacar (na frente do QG)
export const PREPARO = _uv([[-6, -64], [6, -64], [-18, -62], [18, -62], [-12, -55], [12, -55], [-25, -54], [25, -54]]);
// onde o inimigo constrói as bases extras dele (longe das estradas)
// cada lado já começa com 2 bases extras (3 com a principal), mais perto do centro
export const BASES_INICIAIS = {
  vermelho: _uv([[-35, -50], [31, -47]]),
  verde: _uv([[35, 50], [-31, 47]]),
};
export const BASES_IA = _uv([[-12, -36], [40, -36], [-40, -30], [-35, -50], [31, -47]]);
// onde as suas duas primeiras tropas começam
export const INICIO_VERDE = _uv([[-7, 60], [7, 60]]);

// CAMPOS DE TREINO: 3 retângulos atrás de cada base (no sentido da borda do mapa,
// longe das estradas). Medidas em (u, v); cap = soldados que cabem com o dobro
// de espaço da formação. 'alvos' = de que lado (u) ficam os alvos de tiro.
function _area(time, n, u0, u1, v0, v1, cap, alvos) {
  const [x, y] = de_uv((u0 + u1) / 2, (v0 + v1) / 2);
  return { time, n, u0, u1, v0, v1, cap, alvos, x, y, hits: [0, 0, 0, 0] };
}
export const AREAS_TREINO = [
  _area('verde', 0, -40, -20, 83.5, 98.5, 400, -1),
  _area('verde', 1, -8.5, 8.5, 89.5, 99, 220, -1),
  _area('verde', 2, 20, 40, 83.5, 98.5, 400, 1),
  _area('vermelho', 0, 20, 40, -98.5, -83.5, 400, 1),
  _area('vermelho', 1, -8.5, 8.5, -99, -89.5, 220, 1),
  _area('vermelho', 2, -40, -20, -98.5, -83.5, 400, -1),
];
export function area_em(time, x, y) {
  // a área de treino do time que contém o ponto (x, y), ou null
  const u = x - y, v = x + y;
  for (const a of AREAS_TREINO) if (a.time === time && u >= a.u0 && u <= a.u1 && v >= a.v0 && v <= a.v1) return a;
  return null;
}
export function area_de(time, n) {
  for (const a of AREAS_TREINO) if (a.time === time && a.n === n) return a;
  return null;
}

// áreas que devem ficar livres de árvores e lotes: [x, y, raio]
const _ZONAS = CONSTRUCOES.map(c => [c.x, c.y, (c.tipo === 'qg' || c.tipo === 'base') ? 9 : 4.5]);
_ZONAS.push([...de_uv(0, -60), 15], [...de_uv(0, 62), 10], [0, 0, 6]);
for (const p of BASES_IA) _ZONAS.push([p[0], p[1], 6]);
for (const p of BASES_INICIAIS.verde) _ZONAS.push([p[0], p[1], 6]);

function _em_zona(x, y, folga = 0.0) {
  for (const [zx, zy, r] of _ZONAS) if (hip(x - zx, y - zy) < r + folga) return true;
  // campos de treino também ficam livres (com uma margem)
  const u = x - y, v = x + y, m = 2.5 + folga * 1.42;
  for (const a of AREAS_TREINO) if (u > a.u0 - m && u < a.u1 + m && v > a.v0 - m && v < a.v1 + m) return true;
  return false;
}

// lugar livre para enfeite do chão (fora de bases, campos de treino e lotes)
export function livre_decor(x, y, folga = 0.0) { return !_em_zona(x, y, folga) && !em_lote(x, y, 0.3); }

function _na_cena(x, y, m) {
  return Math.abs(x - y) < C.CENA_U + m && Math.abs(x + y) < C.CENA_V + m;
}

// ---------- LOTES (os "campos" de neve marcada) ---------------------
export const LOTES = [];

function _gerar_lotes() {
  const passo = 6.6;
  for (let ix = 0; ix < 29; ix++) {
    const gx = -92 + ix * passo;
    for (let iy = 0; iy < 29; iy++) {
      const gy = -92 + iy * passo;
      if (_rnd() > 0.66) continue;
      const cx = gx + (_rnd() - 0.5) * 1.6;
      const cy = gy + (_rnd() - 0.5) * 1.6;
      if (!_na_cena(cx, cy, 4)) continue;
      const w = 3.4 + _rnd() * 2.4;
      const d = 3.4 + _rnd() * 2.4;
      const j = () => (_rnd() - 0.5) * 0.9;
      // a ordem das chamadas de j() é a mesma do Python (esquerda para a direita)
      const c0x = cx - w / 2 + j(), c0y = cy - d / 2 + j();
      const c1x = cx + w / 2 + j(), c1y = cy - d / 2 + j();
      const c2x = cx + w / 2 + j(), c2y = cy + d / 2 + j();
      const c3x = cx - w / 2 + j(), c3y = cy + d / 2 + j();
      const cantos = [[c0x, c0y], [c1x, c1y], [c2x, c2y], [c3x, c3y]];
      const teste = [[cx, cy]];
      for (let i = 0; i < 4; i++) {
        const a = cantos[i], b = cantos[(i + 1) % 4];
        teste.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      }
      if (teste.some(p => dist_estrada(p[0], p[1]) < 0.8 || _em_zona(p[0], p[1], -1.5))) continue;
      LOTES.push({ cx, cy, w, d, cantos, risco_x: _rnd() < 0.5 });
    }
  }
}

export function em_lote(x, y, folga = 0.0) {
  for (const l of LOTES) {
    if (Math.abs(x - l.cx) < l.w / 2 + folga && Math.abs(y - l.cy) < l.d / 2 + folga) return true;
  }
  return false;
}

// ---------- ÁRVORES E MONTES ----------------------------------------
export const ARVORES = [];
export const MONTES = [];

function _espalhar(lista, u0, v0, raio, qtd, min_dist, e0, e1) {
  let tent = 0;
  while (qtd > 0 && tent < 600) {
    tent += 1;
    const ang = _rnd() * Math.PI * 2;
    const r = Math.sqrt(_rnd()) * raio;
    const [x, y] = de_uv(u0 + Math.cos(ang) * r, v0 + Math.sin(ang) * r * 2);
    if (dist_estrada(x, y) < 1.3 || _em_zona(x, y) || em_lote(x, y, 0.4)) continue;
    if (lista.some(o => hip(o.x - x, o.y - y) < min_dist)) continue;
    lista.push({ x, y, s: e0 + _rnd() * (e1 - e0) });
    qtd -= 1;
  }
}

_gerar_lotes();
// bosques (posições em u, v — ou seja, "onde na tela")
for (const [u, v, r, n] of [[-36, -84, 7, 12], [36, -86, 7, 12], [0, -94, 8, 8], [-40, -44, 5, 9], [40, -52, 5, 9],
  [-13, -18, 4, 5], [15, -24, 4, 5], [-41, 30, 5, 9], [41, 26, 5, 9], [-16, 20, 4, 5],
  [17, 50, 4, 5], [-36, 72, 7, 12], [36, 78, 7, 12], [0, 94, 8, 8]]) {
  _espalhar(ARVORES, u, v, r, n, 2.0, 0.8, 1.3);
}
_espalhar(ARVORES, 0, 0, 46, 34, 5, 0.75, 1.05);   // soltas pelo mapa
// montes de neve
for (const [u, v, r, n] of [[-39, -64, 4, 7], [39, -22, 4, 7], [-41, 54, 4, 7], [40, 60, 4, 7], [21, 92, 5, 7], [-21, -93, 5, 7]]) {
  _espalhar(MONTES, u, v, r, n, 1.7, 0.8, 1.35);
}

// pinheiros na faixa de neve além do campo de jogo (atrás dos campos de treino).
// Sorteio próprio: não muda nenhuma árvore que já existia.
{
  const r = semente(8812);
  for (const lado of [1, -1]) {
    let n = 0, tent = 0;
    while (n < 46 && tent < 900) {
      tent++;
      const u = (r() * 2 - 1) * (C.CENA_U - 1), v = lado * (100.5 + r() * (C.FUNDO_CENA - 2));
      const [x, y] = de_uv(u, v);
      if (_em_zona(x, y, 0.6)) continue;
      if (ARVORES.some(o => hip(o.x - x, o.y - y) < 2.1)) continue;
      ARVORES.push({ x, y, s: 0.75 + r() * 0.5 });
      n++;
    }
  }
}

// ---------- ROTAS DE ATAQUE DO INIMIGO ------------------------------
export const ROTAS = {
  centro: new Rota(ESTRADAS[0].pts),
  esquerda: new Rota(ESTRADAS[1].pts),
  direita: new Rota(ESTRADAS[2].pts),
};

// ---------- VISÃO GIRADA (só a batalha entre jogadores usa) -----------
// Quem joga do lado vermelho vê o mapa girado meia-volta: a base dele embaixo
// e o inimigo em cima, como o verde vê. Gira os dados no lugar (estradas,
// lotes, árvores, prédios, linha de frente); chamar de novo desfaz exatamente.
// As regras do jogo nunca rodam com o mapa girado (elas ficam no servidor).
export let VIRADO = false;

function _negar(p) { p[0] = -p[0]; p[1] = -p[1]; }

export function virar() {
  VIRADO = !VIRADO;
  for (const e of ESTRADAS) {
    for (const p of e.controle) _negar(p);
    for (const p of e.pts) _negar(p);   // as ROTAS usam estes mesmos pontos
  }
  let k = 0;
  for (const e of ESTRADAS) {
    const p = e.pts;
    for (let i = 1; i < p.length; i++) {
      const vx = p[i][0] - p[i - 1][0], vy = p[i][1] - p[i - 1][1];
      _SEGS[k++] = [p[i - 1][0], p[i - 1][1], vx, vy, vx * vx + vy * vy, e.largura / 2];
    }
  }
  const frente = FRENTE.map(([u, v]) => [-u, -v]).reverse();
  FRENTE.splice(0, FRENTE.length, ...frente);
  for (const l of LOTES) {
    l.cx = -l.cx; l.cy = -l.cy;
    for (const c of l.cantos) _negar(c);
  }
  for (const a of ARVORES) { a.x = -a.x; a.y = -a.y; }
  for (const m of MONTES) { m.x = -m.x; m.y = -m.y; }
  for (const c of CONSTRUCOES) {
    c.x = -c.x; c.y = -c.y;
    if (c.time === 'verde') c.time = 'vermelho';
    else if (c.time === 'vermelho') c.time = 'verde';
  }
  for (const a of AREAS_TREINO) {   // campos de treino giram junto (e trocam de dono)
    [a.u0, a.u1] = [-a.u1, -a.u0];
    [a.v0, a.v1] = [-a.v1, -a.v0];
    a.x = -a.x; a.y = -a.y; a.alvos = -a.alvos;
    a.time = a.time === 'verde' ? 'vermelho' : 'verde';
  }
}

export function tipo(x, y) {
  if (dist_estrada(x, y) <= 0) return 'estrada';
  return em_lote(x, y) ? 'lote' : 'neve';
}
