// objetos.js — sólidos do cenário: pinheiros, montes de neve, QG, galpões,
// base e posto. Devolvem FORMAS em px de cena (zoom 1), já na posição final.
//     formas_arvore / formas_monte / formas_construcao -> parte fixa (vira sprite)
//     formas_animadas(o, t) -> bandeiras e radar, redesenhados a cada quadro
// (clone de jogo/objetos.py)
import * as C from './config.js';
import * as iso from './iso.js';
import { sx, sy, tom, limitar } from './iso.js';

const _ANDARES = [[0.0, 17, 27], [0.3, 13.5, 23], [0.57, 10, 21]];  // [altura, largura, alto]
const _LUZ = [0.5, -0.55, 0.67];

// ---------- PINHEIROS: 6 tipos ----------------------------------------
// 0 clássico · 1 alto e fino · 2 gordo · 3 novinho · 4 carregado de neve ·
// 5 seco (sem folhas, galhos com neve). Alguns ficam um pouco tortos, o verde
// varia de árvore para árvore, e todos têm montinho de neve no pé e bolotas
// de neve nas pontas dos galhos. Tudo vira sprite UMA vez (custo zero por quadro).
const _TIPOS_ARV = [
  { andares: _ANDARES, alt: 58 },
  { andares: [[0.0, 13, 24], [0.24, 11, 22], [0.46, 8.8, 20], [0.66, 6.4, 17]], alt: 74 },
  { andares: [[0.0, 21, 26], [0.3, 17, 23], [0.56, 12, 20]], alt: 56 },
  { andares: [[0.0, 11, 18], [0.34, 8, 15]], alt: 36 },
  { andares: _ANDARES, alt: 58, carregado: true },
  { seca: true, alt: 52 },
];
const _PESOS_ARV = [0.27, 0.2, 0.15, 0.14, 0.15, 0.09];

function _sorteio(x, y, k) {
  const v = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

export function variante_arvore(a) {
  if (a._v) return a._v;
  let r = _sorteio(a.x, a.y, 1), tipo = 0;
  for (; tipo < _PESOS_ARV.length - 1; tipo++) { if (r < _PESOS_ARV[tipo]) break; r -= _PESOS_ARV[tipo]; }
  const torta = _sorteio(a.x, a.y, 2) < 0.35;
  a._v = {
    tipo,
    inclina: torta ? (_sorteio(a.x, a.y, 3) - 0.5) * 0.22 : 0,   // px de lado por px de altura
    verde: 0.9 + _sorteio(a.x, a.y, 4) * 0.2,
  };
  return a._v;
}

export function altura_arvore(a) { return _TIPOS_ARV[variante_arvore(a).tipo].alt * a.s; }

export function formas_arvore(a) {
  // pinheiro com capa de neve: lado esquerdo na sombra, direito claro
  const px = sx(a.x, a.y), py = sy(a.x, a.y), s = a.s;
  const v = variante_arvore(a), T = _TIPOS_ARV[v.tipo];
  const H = T.alt * s;
  const lado = (y) => px + (py - y) * v.inclina;   // centro torto na altura y
  const f = [];
  if (T.seca) {
    // árvore seca: tronco afinando, galhos para os lados com neve por cima
    const topo = py - H, cx = lado(topo);
    f.push([[84, 62, 48], [[px - 2.6 * s, py], [cx - 0.6 * s, topo], [cx + 0.6 * s, topo], [px + 2.6 * s, py]]]);
    f.push([[118, 90, 70], [[px, py], [cx, topo], [cx + 0.6 * s, topo], [px + 2.6 * s, py]]]);
    for (const [h, d, L, sobe] of [[0.32, -1, 15, 9], [0.42, 1, 14, 10], [0.56, -1, 11, 9], [0.66, 1, 10, 8], [0.78, -1, 7, 6], [0.86, 1, 6, 6]]) {
      const y0 = py - h * H, x0 = lado(y0);
      const p1 = [x0 + d * L * s, y0 - sobe * s];
      f.push(iso.linha([x0, y0], p1, 1.6 * s, [92, 68, 52]));
      f.push(iso.linha([x0 + d * 2 * s, y0 - 2.2 * s], [p1[0], p1[1] - 1.2 * s], 1.3 * s, C.NEVE_CLARA));
      const q = [x0 + d * L * 0.55 * s, y0 - sobe * 0.55 * s];   // galhinho
      f.push(iso.linha(q, [q[0] + d * 4 * s, q[1] - 5 * s], 1.0 * s, [92, 68, 52]));
    }
    f.push(iso.elipse(cx, topo - 1 * s, 2.2 * s, 1.4 * s, C.NEVE_CLARA, 8));
  } else {
    f.push(iso.ret(px - 2.2 * s, py - 9 * s, 4.4 * s, 9 * s, C.TRONCO));
    const esc = tom(C.PINHEIRO_ESCURO, v.verde), cla = tom(C.PINHEIRO, v.verde);
    for (const [ty, tw, th] of T.andares) {
      const by = py - 6 * s - ty * H;
      const cx = lado(by);
      const ap = by - th * s, w = tw * s, ax = lado(ap);
      // saia verde aparecendo por baixo da neve
      f.push([esc, iso.curva([cx - w, by], [cx, by + w * 0.5], [cx + w, by]).concat([[ax, ap + 5 * s]])]);
      f.push([cla, iso.curva([cx, by + w * 0.25], [cx + w * 0.6, by + w * 0.2], [cx + w, by]).concat([[ax, ap + 5 * s]])]);
      const k = T.carregado ? 1.02 : 0.93;
      const ny = by - (T.carregado ? 1.4 : 3.2) * s, nw = w * k;
      f.push([C.NEVE_SOMBRA, iso.curva([cx - nw, ny], [cx, ny + nw * 0.44], [cx + nw, ny]).concat([[ax, ap]])]);
      f.push([C.NEVE_CLARA, iso.curva([cx - nw * 0.12, ny + nw * 0.2], [cx + nw * 0.55, ny + nw * 0.24], [cx + nw, ny]).concat([[ax, ap]])]);
      // bolotas de neve nas pontas dos galhos
      f.push(iso.elipse(cx - nw * 0.86, ny + 0.6 * s, 2.1 * s, 1.5 * s, C.NEVE_SOMBRA, 8));
      f.push(iso.elipse(cx + nw * 0.88, ny + 0.4 * s, 2.3 * s, 1.6 * s, C.NEVE_CLARA, 8));
      if (T.carregado) {   // neve pingando para baixo da saia
        for (const t of [-0.55, -0.1, 0.4]) f.push(iso.elipse(cx + nw * t, ny + nw * 0.3 * (1 - Math.abs(t)) + 1.2 * s, 1.6 * s, 2.2 * s, C.NEVE_CLARA, 8));
      }
    }
  }
  // montinho de neve no pé (o tronco "afunda" na neve): logo depois do tronco,
  // para a saia verde ficar por cima dele
  f.splice(T.seca ? 2 : 1, 0,
    iso.elipse(px, py + 0.8 * s, 9 * s, 3.4 * s, C.NEVE_SOMBRA, 14),
    iso.elipse(px + 1 * s, py, 7.4 * s, 2.6 * s, C.NEVE_CLARA, 14));
  return f;
}

export function formas_monte(m) {
  const px = sx(m.x, m.y), py = sy(m.x, m.y);
  const w = 20 * m.s, h = 27 * m.s;
  const topo = [px, py - h], dir_ = [px + w, py], esq = [px - w, py];
  const escuro = iso.curva(esq, [px - w * 0.9, py - h * 0.92], topo)
    .concat(iso.curva(topo, [px + w * 0.9, py - h * 0.92], dir_).slice(1))
    .concat(iso.curva(dir_, [px, py + w * 0.44], esq).slice(1));
  const meio = [px + w * 0.02, py + w * 0.2];
  const claro = iso.curva(topo, [px + w * 0.9, py - h * 0.92], dir_)
    .concat(iso.curva(dir_, [px + w * 0.55, py + w * 0.3], meio).slice(1))
    .concat(iso.curva(meio, [px - w * 0.28, py - h * 0.5], topo).slice(1));
  return [[[205, 214, 232], escuro], [[245, 247, 251], claro]];
}

// ---------- galpão de teto curvo --------------------------------------
// eixo 'x': comprido em x, porta na face +x (direita da tela)
// eixo 'y': comprido em y, porta na face +y (esquerda da tela)
function _galpao(cx, cy, eixo, cores) {
  const L = 4.2, W = 3.0, H = 1.45, base = 0.28, N = 8;
  const ex = eixo === 'x';
  const x0 = cx - (ex ? L : W) / 2, y0 = cy - (ex ? W : L) / 2;
  const m = (a, b, z) => ex ? [x0 + a, y0 + b, z] : [x0 + b, y0 + a, z];
  const f = iso.caixa(x0 - 0.12, y0 - 0.12, 0, (ex ? L : W) + 0.24, (ex ? W : L) + 0.24, base, C.CONCRETO);
  const perfil = [];
  for (let k = 0; k <= N; k++) perfil.push([W / 2 - Math.cos(Math.PI * k / N) * W / 2, base + Math.sin(Math.PI * k / N) * H]);
  const tiras = (a0, a1, cor) => {
    for (let k = 0; k < N; k++) {
      const am = Math.PI * (k + 0.5) / N;
      const cs = -Math.cos(am), sn = Math.sin(am);
      const d = ex ? cs * _LUZ[1] + sn * _LUZ[2] : cs * _LUZ[0] + sn * _LUZ[2];
      const p = perfil[k], q = perfil[k + 1];
      f.push(iso.poli([m(a0, p[0], p[1]), m(a1, p[0], p[1]), m(a1, q[0], q[1]), m(a0, q[0], q[1])],
        tom(cor, limitar(0.66 + 0.5 * d, 0.62, 1.02))));
    }
  };
  tiras(0, L, cores.base);
  tiras(L * 0.2, L * 0.32, cores.faixa);
  tiras(L * 0.68, L * 0.8, cores.faixa);
  // tampa da frente + porta
  f.push(iso.poli([m(L, 0, 0)].concat(perfil.map(p => m(L, p[0], p[1]))).concat([m(L, W, 0)]), ex ? cores.dir : cores.esq));
  const hp = base + H * 0.66;
  f.push(iso.poli([m(L, W * 0.27, 0), m(L, W * 0.27, hp), m(L, W * 0.73, hp), m(L, W * 0.73, 0)], C.JANELA));
  f.push(iso.poli([m(L, W * 0.27, hp), m(L, W * 0.73, hp), m(L, W * 0.73, base + H * 0.74), m(L, W * 0.27, base + H * 0.74)],
    C.CONCRETO_CLARO.topo));
  return f;
}

// ---------- plataforma com cantoneiras (ponto de captura) -------------
function _plataforma(cx, cy, w, d) {
  const x0 = cx - w / 2, y0 = cy - d / 2;
  const x1 = x0 + w, y1 = y0 + d;
  const f = iso.caixa(x0, y0, 0, w, d, 0.1, { topo: [244, 246, 250], dir: [201, 209, 226], esq: [179, 189, 210] });
  const g = 0.45, b = 1.25, z = 0.1;
  const canto = (x, y, dx, dy) => {
    const pa = [sx(x + dx * b, y), sy(x + dx * b, y, z)];
    const pm = [sx(x, y), sy(x, y, z)];
    const pb = [sx(x, y + dy * b), sy(x, y + dy * b, z)];
    f.push(iso.linha(pa, pm, 5, C.ESCURO));
    f.push(iso.linha(pm, pb, 5, C.ESCURO));
    for (const p of [pa, pm, pb]) {   // pontas e quina arredondadas
      f.push(iso.elipse(p[0], p[1], 2.5, 2.5, C.ESCURO, 10));
    }
  };
  canto(x0 - g, y0 - g, 1, 1);
  canto(x1 + g, y0 - g, -1, 1);
  canto(x1 + g, y1 + g, -1, -1);
  canto(x0 - g, y1 + g, 1, -1);
  return f;
}

function _qg(o) {
  const c = C.TIMES[o.time];
  const x0 = o.x - 2, y0 = o.y - 2;
  let f = iso.caixa(x0, y0, 0, 4, 4, 0.35, C.CONCRETO);
  f = f.concat(iso.caixa(x0 + 0.4, y0 + 0.4, 0.35, 3.2, 3.2, 1.6, c));
  const fy = y0 + 3.6, fx = x0 + 3.6;
  f.push(iso.face_y(fy, x0 + 1.45, x0 + 2.55, 0.35, 1.35, C.JANELA));          // porta
  f.push(iso.face_y(fy, x0 + 1.45, x0 + 2.55, 1.35, 1.47, C.CONCRETO_CLARO.esq));
  f.push(iso.face_x(fx, y0 + 0.9, y0 + 1.7, 1.0, 1.55, C.JANELA));
  f.push(iso.face_x(fx, y0 + 2.3, y0 + 3.1, 1.0, 1.55, C.JANELA));
  f = f.concat(iso.caixa(x0 + 0.25, y0 + 0.25, 1.95, 3.5, 3.5, 0.28, C.CONCRETO_CLARO));
  f = f.concat(iso.caixa(x0 + 1.1, y0 + 1.1, 2.23, 1.8, 1.8, 0.95, c));
  f.push(iso.face_x(x0 + 2.9, y0 + 1.35, y0 + 2.65, 2.6, 2.95, C.JANELA));
  f.push(iso.face_y(y0 + 2.9, x0 + 1.35, x0 + 2.65, 2.6, 2.95, C.JANELA));
  f = f.concat(iso.caixa(x0 + 0.98, y0 + 0.98, 3.18, 2.04, 2.04, 0.18, C.CONCRETO));
  return f;
}

function _posto(o) {
  const x = o.x, y = o.y;
  let f = _plataforma(x, y, 3.6, 3.6);
  f = f.concat(iso.caixa(x - 1.2, y - 0.9, 0.1, 0.9, 0.9, 0.6, C.CONCRETO));
  f = f.concat(iso.caixa(x - 1.0, y + 0.2, 0.1, 0.7, 0.7, 0.45, C.CONCRETO_CLARO));
  f = f.concat(iso.caixa(x - 0.2, y - 0.2, 0.1, 0.5, 0.5, 0.18, C.CONCRETO));
  return f;
}

export function formas_construcao(o) {
  // parte FIXA do prédio (vira sprite pré-desenhado)
  if (o.tipo === 'qg') return _qg(o);
  if (o.tipo === 'posto') return _posto(o);
  const f = o.tipo === 'base' ? _plataforma(o.x, o.y, 6.2, 5) : [];
  return f.concat(_galpao(o.x, o.y, o.eixo, C.TIMES[o.time]));
}

// ---------- partes animadas -------------------------------------------
function _bandeira(x, y, z0, alt, cor, t) {
  const bx = sx(x, y), by = sy(x, y, z0), ty = sy(x, y, z0 + alt);
  const a = Math.sin(t * 3.2) * 1.8, b = Math.sin(t * 3.2 + 1.4) * 1.8;
  return [
    iso.linha([bx, by], [bx, ty], 2, C.MASTRO),
    [cor, [[bx, ty], [bx + 8, ty + 1.5 + a], [bx + 16, ty + 1 + b], [bx + 16, ty + 10 + b], [bx + 8, ty + 10.5 + a], [bx, ty + 9]]],
    [tom(cor, 0.78), [[bx + 8, ty + 1.5 + a], [bx + 16, ty + 1 + b], [bx + 16, ty + 10 + b], [bx + 8, ty + 10.5 + a]]],
  ];
}

export function formas_animadas(o, t) {
  // bandeiras tremulando e radar girando (desenhados a cada quadro)
  const c = C.TIMES[o.time];
  if (o.tipo === 'qg') {
    const x0 = o.x - 2, y0 = o.y - 2;
    const mx = sx(o.x, o.y), my = sy(o.x, o.y, 3.36);
    const topo = my - 20;
    const giro = Math.cos(t * 0.9);
    const rx = 3 + Math.abs(giro) * 13;   // o disco "afina" conforme vira de lado
    const f = [iso.linha([mx, my], [mx, topo], 3, C.MASTRO),
      iso.elipse(mx, topo - 6, rx, 12, giro > 0 ? [213, 218, 227] : [142, 151, 168]),
      iso.elipse(mx, topo - 6, rx * 0.55, 7, giro > 0 ? [174, 182, 196] : [111, 120, 139])];
    return f.concat(_bandeira(x0 + 0.5, y0 + 3.5, 2.23, 1.5, c.base, t));
  }
  if (o.tipo === 'posto') {
    return _bandeira(o.x + 0.05, o.y + 0.05, 0.28, 2.3, C.TIMES.neutro.base, t);
  }
  if (o.bandeira || o.tipo === 'base') {
    const ex = o.eixo === 'x';   // bandeira ao lado da porta
    return _bandeira(o.x + (ex ? 2.6 : -1.9), o.y + (ex ? -1.9 : 2.6), 0, 2.4, c.base, t + o.x);
  }
  return [];
}

export function profundidade(o) {
  // para ordenar: quem tem x + y maior fica na frente
  return o.x + o.y + (o.tipo === 'qg' ? 1.5 : 1.0);
}
