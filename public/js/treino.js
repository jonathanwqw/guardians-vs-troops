// treino.js — os CAMPOS DE TREINO desenhados no mapa (atrás de cada base).
//
// Cada campo vira um punhado de "peças" (cerca, alvos, pneus, muro, sacos de
// areia, torre, mastro, placa). A parte fixa de cada peça vira imagem pronta
// (como as árvores e os prédios) e entra na ordem de profundidade junto com os
// soldados; só o que mexe (alvos tombando quando levam tiro, bandeira) é
// redesenhado a cada quadro, e é pouca coisa.
//
// As peças usam o mesmo formato de FORMAS de objetos.js: [cor, pontos em px de
// cena no zoom 1].
import * as C from './config.js';
import * as iso from './iso.js';
import { sx, sy, tom, de_uv } from './iso.js';

const MADEIRA = { topo: [150, 112, 78], dir: [124, 90, 62], esq: [98, 70, 48] };
const MADEIRA_CLARA = { topo: [196, 160, 116], dir: [170, 134, 94], esq: [140, 108, 74] };
const SACO = { topo: [214, 196, 152], dir: [190, 170, 128], esq: [160, 142, 104] };
const PNEU = [44, 48, 58], PNEU_DENTRO = [210, 216, 228];
const ALVO_BRANCO = [246, 246, 240], ALVO_VERMELHO = [214, 66, 52], ALVO_PRETO = [40, 44, 54];
const TELHADO = { topo: [92, 102, 120], dir: [74, 82, 98], esq: [58, 64, 78] };

// ponto do campo em (u, v) -> mundo
const P = (u, v) => de_uv(u, v);

function poste(u, v, alt, cores = MADEIRA, l = 0.14) {
  const [x, y] = P(u, v);
  return iso.caixa(x - l / 2, y - l / 2, 0, l, l, alt, cores);
}

function trilho(u0, v0, u1, v1, z, larg = 2, cor = MADEIRA.dir) {
  const [x0, y0] = P(u0, v0), [x1, y1] = P(u1, v1);
  return iso.linha([sx(x0, y0), sy(x0, y0, z)], [sx(x1, y1), sy(x1, y1, z)], larg, cor);
}

function _cerca(a, lado) {
  // lado: 'fundo' (borda de cima + laterais) ou 'frente' (borda de baixo)
  const f = [];
  const portao_v = a.time === 'verde' ? a.v0 : a.v1;   // o portão fica virado para a base
  const uc = (a.u0 + a.u1) / 2;
  const trecho = (u0, v0, u1, v1, com_portao) => {
    const L = Math.hypot(u1 - u0, v1 - v0), n = Math.max(1, Math.round(L / 2.2));
    for (let i = 0; i <= n; i++) {
      const u = u0 + (u1 - u0) * i / n, v = v0 + (v1 - v0) * i / n;
      if (com_portao && Math.abs(u - uc) < 2.0) continue;
      f.push(...poste(u, v, 0.62));
    }
    for (let i = 0; i < n; i++) {
      const ua = u0 + (u1 - u0) * i / n, va = v0 + (v1 - v0) * i / n;
      const ub = u0 + (u1 - u0) * (i + 1) / n, vb = v0 + (v1 - v0) * (i + 1) / n;
      if (com_portao && Math.abs((ua + ub) / 2 - uc) < 2.4) continue;
      f.push(trilho(ua, va, ub, vb, 0.52));
      f.push(trilho(ua, va, ub, vb, 0.3, 2, MADEIRA.esq));
    }
  };
  if (lado === 'fundo') {
    trecho(a.u0, a.v0, a.u1, a.v0, portao_v === a.v0);
    trecho(a.u0, a.v0, a.u0, a.v1, false);
    trecho(a.u1, a.v0, a.u1, a.v1, false);
  } else {
    trecho(a.u0, a.v1, a.u1, a.v1, portao_v === a.v1);
  }
  return f;
}

function _alvo_fixo(u, v) {
  // dois postes e a trave do alvo (a placa redonda é animada)
  return [...poste(u, v - 0.55, 1.05, MADEIRA, 0.1), ...poste(u, v + 0.55, 1.05, MADEIRA, 0.1),
    trilho(u, v - 0.55, u, v + 0.55, 1.0, 3, MADEIRA.esq)];
}

function _pneus(u, v, cols, filas) {
  const f = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < filas; j++) {
      const [x, y] = P(u + i * 1.5 - (cols - 1) * 0.75, v + j * 1.5 - (filas - 1) * 0.75 + (i % 2) * 0.4);
      const px = sx(x, y), py = sy(x, y, 0.08);
      f.push(iso.elipse(px, py + 2, 11, 5.5, tom(PNEU, 0.8), 14));
      f.push(iso.elipse(px, py, 11, 5.5, PNEU, 14));
      f.push(iso.elipse(px, py, 5.5, 2.7, PNEU_DENTRO, 12));
    }
  }
  return f;
}

function _muro(u, v) {
  // muro de escalada de tábuas, com dois postes
  const [x, y] = P(u, v);
  const f = iso.caixa(x - 1.2, y - 0.1, 0, 2.4, 0.2, 1.5, MADEIRA_CLARA);
  for (let k = 1; k < 5; k++) {   // tábuas
    const z = k * 0.3;
    f.push(iso.linha([sx(x - 1.2, y + 0.1), sy(x - 1.2, y + 0.1, z)], [sx(x + 1.2, y + 0.1), sy(x + 1.2, y + 0.1, z)], 1, MADEIRA.esq));
  }
  f.push(...iso.caixa(x - 1.35, y - 0.15, 0, 0.18, 0.3, 1.75, MADEIRA));
  f.push(...iso.caixa(x + 1.17, y - 0.15, 0, 0.18, 0.3, 1.75, MADEIRA));
  return f;
}

function _sacos(u, v, n) {
  // fileira de sacos de areia em duas camadas
  const f = [];
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < n - c; i++) {
      const [x, y] = P(u + (i - (n - 1) / 2) * 0.95 + c * 0.47, v);
      f.push(...iso.caixa(x - 0.4, y - 0.28, c * 0.3, 0.8, 0.56, 0.3, SACO));
    }
  }
  return f;
}

function _torre(u, v) {
  // torre de vigia: 4 pernas, plataforma, guarda-corpo e telhado
  const [x, y] = P(u, v);
  const f = [];
  for (const [dx, dy] of [[-0.8, -0.8], [0.7, -0.8], [-0.8, 0.7], [0.7, 0.7]]) {
    f.push(...iso.caixa(x + dx, y + dy, 0, 0.14, 0.14, 2.6, MADEIRA));
  }
  f.push(...iso.caixa(x - 0.95, y - 0.95, 2.6, 1.9, 1.9, 0.14, MADEIRA_CLARA));
  f.push(iso.face_y(y + 0.95, x - 0.95, x + 0.95, 2.74, 3.15, MADEIRA.esq));
  f.push(iso.face_x(x + 0.95, y - 0.95, y + 0.95, 2.74, 3.15, MADEIRA.dir));
  for (const [dx, dy] of [[-0.9, -0.9], [0.8, -0.9], [-0.9, 0.8], [0.8, 0.8]]) {
    f.push(...iso.caixa(x + dx, y + dy, 2.74, 0.1, 0.1, 0.9, MADEIRA));
  }
  f.push(...iso.caixa(x - 1.1, y - 1.1, 3.64, 2.2, 2.2, 0.16, TELHADO));
  return f;
}

function _placa(u, v, n) {
  // placa com o número do campo em traços (I, II, III)
  const [x, y] = P(u, v);
  const f = [...iso.caixa(x - 0.06, y - 0.06, 0, 0.12, 0.12, 1.2, MADEIRA)];
  const px = sx(x, y), py = sy(x, y, 1.45);
  f.push(iso.ret(px - 13, py - 9, 26, 15, [236, 228, 206]));
  f.push(iso.ret(px - 13, py + 4, 26, 2, MADEIRA.esq));
  for (let i = 0; i <= n; i++) f.push(iso.ret(px - (n + 1) * 2.6 + i * 5.2, py - 6, 2.6, 9, C.JANELA));
  return f;
}

export function n_alvos(a) { return a.v1 - a.v0 > 12 ? 4 : 3; }

export function alvo_uv(a, j) {
  // (u, v) do alvo j do campo
  const ua = a.alvos < 0 ? a.u0 + 1.4 : a.u1 - 1.4;
  const vm = (a.v0 + a.v1) / 2, h = a.v1 - a.v0, nal = n_alvos(a);
  return [ua, vm + (j - (nal - 1) / 2) * (h / (nal + 0.6))];
}

export function pecas(a) {
  // todas as peças de um campo: [{k, formas, area, anim, ...}]
  const lista = [];
  const add = (k, formas, extra = {}) => lista.push(Object.assign({ k, formas, area: a, anim: null, x: 0, y: 0 }, extra));
  const ua = a.alvos < 0 ? a.u0 + 1.4 : a.u1 - 1.4;          // linha dos alvos
  const uo = a.alvos < 0 ? a.u1 - 3.0 : a.u0 + 3.0;          // lado oposto (pneus, muro)
  const vm = (a.v0 + a.v1) / 2, h = a.v1 - a.v0;
  const frente = a.time === 'verde' ? a.v1 : a.v0;           // borda longe da base
  const fundo = a.time === 'verde' ? a.v0 : a.v1;            // borda do portão (perto da base)
  add(a.v0 - 0.3, _cerca(a, 'fundo'));
  add(a.v1 + 0.3, _cerca(a, 'frente'));
  // alvos (4 ou 3 nos campos menores)
  const nal = n_alvos(a);
  for (let j = 0; j < nal; j++) {
    const v = alvo_uv(a, j)[1];
    const [x, y] = P(ua, v);
    add(v, _alvo_fixo(ua, v), { anim: 'alvo', j, x, y, u: ua, v });
  }
  if (h > 12) {
    add(vm, _pneus(uo, vm - h * 0.18, 4, 2));
    add(frente - Math.sign(frente - vm) * 1.6, _muro(uo, frente - Math.sign(frente - vm) * 1.6));
    add(fundo + Math.sign(vm - fundo) * 1.8, _sacos((a.u0 + a.u1) / 2 + (uo - ua) * 0.12, fundo + Math.sign(vm - fundo) * 1.8, 5));
    // torre de vigia num canto do lado de fora
    const ut = a.alvos < 0 ? a.u1 + 1.8 : a.u0 - 1.8, vt = frente;   // canto de fora, do lado do meio do mapa
    add(vt + 0.5, _torre(ut, vt));
  } else {
    add(vm, _pneus(uo, vm, 2, 2));
  }
  // mastro com a bandeira do time e a placa com o número, no portão
  const uc = (a.u0 + a.u1) / 2;
  const [mx, my] = P(uc + 2.8, fundo);
  add(fundo + 0.1, [...poste(uc + 2.8, fundo, 0.25, MADEIRA, 0.3)], { anim: 'bandeira', x: mx, y: my });
  add(fundo + 0.1, _placa(uc - 2.8, fundo, a.n));
  return lista;
}

export function formas_animadas(p, t) {
  // o que mexe: placa dos alvos (tomba para trás quando leva tiro e volta) e bandeira
  const a = p.area;
  if (p.anim === 'alvo') {
    const desde = t - (a.hits[p.j] || -99);
    let tomba = 0;   // 0 = em pé, 1 = deitado
    if (desde >= 0 && desde < 1.2) tomba = desde < 0.12 ? desde / 0.12 : Math.max(0, 1 - (desde - 0.5) / 0.7);
    const px = sx(p.x, p.y), base = sy(p.x, p.y, 1.0);
    const alt = 15 * (1 - 0.85 * tomba), cy = base - alt;
    const rx = 11, ry = Math.max(1.5, 11 * (1 - 0.85 * tomba));
    return [
      iso.elipse(px, cy, rx + 1.5, ry + 1.5, ALVO_PRETO, 16),
      iso.elipse(px, cy, rx, ry, ALVO_BRANCO, 16),
      iso.elipse(px, cy, rx * 0.68, ry * 0.68, ALVO_VERMELHO, 14),
      iso.elipse(px, cy, rx * 0.38, ry * 0.38, ALVO_BRANCO, 12),
      iso.elipse(px, cy, rx * 0.16, ry * 0.16, ALVO_VERMELHO, 10),
    ];
  }
  if (p.anim === 'bandeira') {
    const cor = C.TIMES[a.time].base;
    const bx = sx(p.x, p.y), by = sy(p.x, p.y, 0.25), ty = sy(p.x, p.y, 3.0);
    const fa = Math.sin(t * 3.4 + a.n) * 2.0, fb = Math.sin(t * 3.4 + a.n + 1.5) * 2.0;
    return [
      iso.linha([bx, by], [bx, ty], 2, C.MASTRO),
      [cor, [[bx, ty], [bx + 9, ty + 1.5 + fa], [bx + 18, ty + 1 + fb], [bx + 18, ty + 11 + fb], [bx + 9, ty + 11.5 + fa], [bx, ty + 10]]],
      [tom(cor, 0.78), [[bx + 9, ty + 1.5 + fa], [bx + 18, ty + 1 + fb], [bx + 18, ty + 11 + fb], [bx + 9, ty + 11.5 + fa]]],
    ];
  }
  return [];
}

// ---------- chão do campo (vai no terreno) ------------------------------
export function formas_chao(a) {
  // [cor, pontos em px de cena] — terra batida com neve, borda, raias e linha de tiro
  const Q = (u, v) => [u * iso.HW, v * iso.HH];
  const ret = (u0, v0, u1, v1, cor) => [cor, [Q(u0, v0), Q(u1, v0), Q(u1, v1), Q(u0, v1)]];
  const f = [];
  const m = 0.7;
  f.push(ret(a.u0 - m, a.v0 - m, a.u1 + m, a.v1 + m, [196, 202, 216]));        // borda pisada
  f.push(ret(a.u0, a.v0, a.u1, a.v1, [222, 216, 202]));                         // terra batida
  f.push(ret(a.u0 + 0.6, a.v0 + 0.6, a.u1 - 0.6, a.v1 - 0.6, [230, 226, 216])); // neve rala por cima
  // raias de tiro (do lado dos alvos) e linha de disparo
  const ua = a.alvos < 0 ? a.u0 + 1.4 : a.u1 - 1.4;
  const ul = ua - a.alvos * (a.u1 - a.u0) * 0.42;
  const h = a.v1 - a.v0, nal = h > 12 ? 4 : 3;
  for (let j = 0; j <= nal; j++) {
    const v = a.v0 + 0.8 + j * (h - 1.6) / nal;
    f.push(ret(Math.min(ua, ul), v - 0.07, Math.max(ua, ul), v + 0.07, [246, 244, 238]));
  }
  f.push(ret(ul - 0.12, a.v0 + 0.8, ul + 0.12, a.v1 - 0.8, [208, 84, 66]));
  return f;
}
