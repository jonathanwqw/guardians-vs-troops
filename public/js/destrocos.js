// destrocos.js — DESTROÇOS que ficam no chão por um tempo depois da destruição.
//
// Só enfeite (não muda regra nenhuma). Como o fx.js, olha o estado da batalha
// a cada quadro e reage; por isso vale igual no solo, no multiplayer (dos dois
// lados, meu e do inimigo) e na batalha do fundo do menu, sem nada pela rede.
//
//   * TANQUE: casco queimado; a torre às vezes fica torta em cima, às vezes é
//     arrancada e cai do lado; pedaço de esteira e lascas de aço.
//   * CANHÃO: uma roda em pé torta, a outra caída, cano no chão, escudo
//     amassado da cor do time, caixote de munição aberto.
//   * HELICÓPTERO: fuselagem caída, cauda quebrada, pás do rotor espalhadas.
//   * BASE: monte de concreto, pedaços do teto curvo desabado, vigas tortas
//     espetadas para cima e chapas da cor do time.
//   * TORRE e BARRICADA: base de concreto rachada, pernas tortas / troncos
//     partidos e arame solto.
//   * TROPAS (pelotão, granadeiro, fogueteiro/bazuqueiro, equipe do canhão):
//     destrocinhos no chão — capacete, fuzil, lança-granadas, tubo de bazuca,
//     caixote de munição.
// Cada destroço tem chão chamuscado embaixo, foguinhos tremendo em cima (no
// começo), fumaça subindo, brasas, luz quente e estalos. Depois o fogo apaga,
// sobra fumacinha, e tudo some devagar.
import * as C from './config.js';
import * as iso from './iso.js';
import * as tanque from './tanque.js';
import { sprite } from './raster.js';

const MAX_GRANDES = 28;         // destroços grandes ao mesmo tempo
const MAX_MIUDOS = 260;         // destrocinhos das tropas
const HW = iso.HW, HH = iso.HH, ZH = C.ZH;

// quanto tempo cada um fica (s), quanto do tempo pega fogo, quantos foguinhos
const VIDA = {
  tanque: [34, 0.62, 3], canhao: [28, 0.5, 2], heli: [34, 0.6, 3],
  base: [55, 0.62, 6], torre: [40, 0.55, 3], barricada: [26, 0.45, 2],
};

const QUEIMA = { topo: [74, 70, 66], dir: [56, 53, 50], esq: [40, 38, 36] };
const ACO_Q = { topo: [82, 86, 94], dir: [62, 66, 74], esq: [44, 47, 54] };
const CONCRETO = { topo: [158, 162, 170], dir: [124, 128, 137], esq: [96, 100, 109] };
const CONCRETO_Q = { topo: [118, 118, 120], dir: [92, 92, 95], esq: [70, 70, 73] };
const MADEIRA_Q = { topo: [96, 72, 52], dir: [76, 56, 40], esq: [56, 41, 30] };
const CARVAO = [34, 32, 32];
const PNEU = [36, 38, 44];
const CUBO = [110, 114, 122];

// aleatoriedade própria (sem mexer na das regras)
let _s = 0x2f6b3a1d;
function rnd() {
  _s ^= _s << 13; _s >>>= 0; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0;
  return _s / 4294967296;
}
const ent = (a, b) => a + rnd() * (b - a);
function semeado(seed) {   // gerador próprio de cada destroço (desenho estável)
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function mistura(a, b, k) {
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
}
function queimado(c) {
  // a cor do time chamuscada (ainda dá para saber de quem era)
  return { topo: mistura(c.topo, [46, 42, 40], 0.5), dir: mistura(c.dir, [38, 35, 33], 0.52), esq: mistura(c.esq, [28, 26, 25], 0.55) };
}
function cor_face(c, nx, ny) {
  let k = (nx - ny) / Math.SQRT2 * 0.5 + 0.5;
  k = Math.max(0, Math.min(1, (k - 0.146) / 0.708));
  return mistura(c.esq, c.dir, k);
}

// prisma de base convexa qualquer (pontos no chão, em ordem) de z0 a z1
function prisma(pts, z0, z1, c) {
  const out = [];
  const n = pts.length;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= n; cy /= n;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    let nx = b[1] - a[1], ny = -(b[0] - a[0]);
    const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }   // normal para fora
    if (nx + ny <= 0) continue;                          // de costas para a câmera
    const l = Math.hypot(nx, ny) || 1;
    out.push(iso.poli([[a[0], a[1], z1], [b[0], b[1], z1], [b[0], b[1], z0], [a[0], a[1], z0]], cor_face(c, nx / l, ny / l)));
  }
  out.push(iso.poli(pts.map(p => [p[0], p[1], z1]), c.topo));
  return out;
}
function ret_rot(cx, cy, ang, a0, a1, b0, b1) {
  // retângulo girado: a = ao longo de ang, b = de lado
  const ux = Math.cos(ang), uy = Math.sin(ang), lx = -uy, ly = ux;
  return [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => [cx + ux * a + lx * b, cy + uy * a + ly * b]);
}
function bloco(cx, cy, ang, L, W, z0, h, c) {
  return prisma(ret_rot(cx, cy, ang, -L / 2, L / 2, -W / 2, W / 2), z0, z0 + h, c);
}
function pedra(r, cx, cy, tam, z0, h, c) {
  // pedaço irregular (5 a 7 lados)
  const n = 5 + Math.floor(r() * 3), pts = [];
  const a0 = r() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = a0 + i / n * 6.2832, rr = tam * (0.65 + r() * 0.45);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9]);
  }
  return prisma(pts, z0, z0 + h, c);
}
function viga(p0, p1, larg, cor) {
  // viga/vergalhão em 3D: linha grossa entre dois pontos do mundo (x, y, z)
  return iso.linha([iso.sx(p0[0], p0[1]), iso.sy(p0[0], p0[1], p0[2])], [iso.sx(p1[0], p1[1]), iso.sy(p1[0], p1[1], p1[2])], larg, cor);
}
function roda_em_pe(cx, cy, ang, r, inclina) {
  // roda de pé no plano de 'ang', um pouco caída (inclina 0..1)
  const ux = Math.cos(ang), uy = Math.sin(ang), lx = -uy, ly = ux;
  const aro = [], cubo = [];
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * 6.2832;
    const h = r + Math.sin(a) * r;
    aro.push([cx + ux * Math.cos(a) * r + lx * h * inclina, cy + uy * Math.cos(a) * r + ly * h * inclina, h * (1 - inclina * 0.6)]);
  }
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * 6.2832, rr = r * 0.38;
    const h = r + Math.sin(a) * rr;
    cubo.push([cx + ux * Math.cos(a) * rr + lx * h * inclina, cy + uy * Math.cos(a) * rr + ly * h * inclina, h * (1 - inclina * 0.6)]);
  }
  return [iso.poli(aro, PNEU), iso.poli(cubo, CUBO)];
}
function roda_deitada(cx, cy, r) {
  const aro = [], cubo = [];
  for (let i = 0; i < 16; i++) { const a = i / 16 * 6.2832; aro.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.1]); }
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.2832; cubo.push([cx + Math.cos(a) * r * 0.38, cy + Math.sin(a) * r * 0.38, 0.13]); }
  return [iso.poli(aro.map(p => [p[0], p[1], 0.0]), [24, 25, 30]), iso.poli(aro, PNEU), iso.poli(cubo, CUBO)];
}

// ---------- formas de cada destroço (px de cena, origem = ponto do chão) ----
function formas_tanque(time, dir, r) {
  // casco queimado + torre (torta em cima ou arrancada do lado)
  const partes = [];
  const arrancada = r() < 0.55;
  const idx = Math.floor(r() * 16);
  let f = tanque.formas_casco('queimado', dir, 0);
  if (!arrancada) {
    f = f.concat(tanque.formas_torre('queimado', idx));
  }
  // esteira solta e lascas do lado de trás (desenhadas antes do casco)
  const ang = dir * Math.PI / 2;
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const tras = [];
  const esx = -ux * 1.7 + uy * 0.9, esy = -uy * 1.7 - ux * 0.9;
  for (let i = 0; i < 6; i++) {   // elos de esteira caídos em curva
    const a = ang + 0.5 + i * 0.22;
    tras.push(...bloco(esx + Math.cos(a) * i * 0.24, esy + Math.sin(a) * i * 0.24, a, 0.26, 0.5, 0, 0.07, { topo: [58, 60, 66], dir: [46, 48, 53], esq: [32, 34, 38] }));
  }
  for (let i = 0; i < 5; i++) tras.push(...pedra(r, -ux * (1.0 + r()) + (r() - 0.5) * 2.4, -uy * (1.0 + r()) + (r() - 0.5) * 2.4, 0.16, 0, 0.08, ACO_Q));
  partes.push(...tras, ...f);
  if (arrancada) {   // a torre caída no chão, ao lado
    const lado = r() < 0.5 ? 1 : -1;
    const tx = uy * 1.35 * lado - ux * 0.3, ty = -ux * 1.35 * lado - uy * 0.3;
    const desl = [iso.sx(tx, ty), iso.sy(tx, ty) + 0.62 * ZH * 0.95];   // desce a altura do casco
    for (const [cor, pts] of tanque.formas_torre('queimado', idx)) partes.push([cor, pts.map(p => [p[0] + desl[0], p[1] + desl[1]])]);
    // buraco do anel da torre no casco
    partes.push(iso.poli(Array.from({ length: 12 }, (_, i) => { const a = i / 12 * 6.2832; return [Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0.63]; }), [22, 20, 20]));
  }
  // lascas de aço na frente
  for (let i = 0; i < 4; i++) partes.push(...pedra(r, ux * (1.6 + r()) + (r() - 0.5) * 2.6, uy * (1.6 + r()) + (r() - 0.5) * 2.6, 0.13, 0, 0.06, ACO_Q));
  return partes;
}

function formas_canhao(time, dir, r) {
  const cores = queimado(C.TIMES[time]);
  const ang = dir * Math.PI / 2 + (r() - 0.5) * 0.8;
  const ux = Math.cos(ang), uy = Math.sin(ang), lx = -uy, ly = ux;
  const partes = [];
  const add = (prof, fs) => partes.push([prof, fs]);
  // roda caída no chão (de um lado), roda em pé torta (do outro)
  add(lx * -0.9 + ly * -0.9 - 0.4, roda_deitada(lx * -0.85 - ux * 0.3, ly * -0.85 - uy * 0.3, 0.36));
  add(0.1, bloco(-ux * 0.2, -uy * 0.2, ang + 0.25, 1.1, 0.3, 0.0, 0.2, ACO_Q));                 // carreta no chão
  add(0.2, bloco(ux * 0.75 + lx * 0.15, uy * 0.75 + ly * 0.15, ang - 0.18, 1.5, 0.18, 0.0, 0.17, ACO_Q));   // cano caído
  add(0.25, bloco(ux * 1.5 + lx * 0.28, uy * 1.5 + ly * 0.28, ang - 0.18, 0.18, 0.26, 0.0, 0.22, ACO_Q));  // boca do cano
  // escudo amassado deitado (dois pedaços da cor do time)
  add(0.3, prisma(ret_rot(lx * 0.75, ly * 0.75, ang + 0.6, -0.45, 0.2, -0.32, 0.3), 0.0, 0.08, cores));
  add(0.32, prisma(ret_rot(lx * 0.95 + ux * 0.55, ly * 0.95 + uy * 0.55, ang - 0.4, -0.25, 0.2, -0.2, 0.15), 0.0, 0.06, cores));
  add(lx + ly + 0.4, roda_em_pe(lx * 0.55, ly * 0.55, ang, 0.36, 0.45));
  // caixote de munição aberto e granadas espalhadas
  add(0.5, bloco(-ux * 1.1 + lx * 0.9, -uy * 1.1 + ly * 0.9, ang + 0.9, 0.5, 0.34, 0.0, 0.24, MADEIRA_Q));
  for (let i = 0; i < 4; i++) {
    add(0.55, bloco(-ux * (0.6 + r() * 0.8) + lx * (1.2 + r() * 0.5), -uy * (0.6 + r() * 0.8) + ly * (1.2 + r() * 0.5), r() * 3, 0.28, 0.09, 0, 0.09, { topo: [168, 146, 70], dir: [138, 118, 54], esq: [104, 88, 40] }));
  }
  partes.sort((a, b) => a[0] - b[0]);
  let f = [];
  for (const [, fs] of partes) f = f.concat(fs);
  return f;
}

function formas_heli(time, dir, r) {
  const cores = queimado(C.TIMES[time]);
  const escuro = { topo: cores.dir, dir: cores.esq, esq: iso.tom(cores.esq, 0.8) };
  const ang = dir * Math.PI / 2 + (r() - 0.5) * 0.7;
  const ux = Math.cos(ang), uy = Math.sin(ang), lx = -uy, ly = ux;
  const partes = [];
  const add = (prof, fs) => partes.push([prof, fs]);
  // cauda partida, caída torta atrás
  add(-1.0, bloco(-ux * 1.7 + lx * 0.35, -uy * 1.7 + ly * 0.35, ang + 0.55, 1.4, 0.2, 0.0, 0.18, escuro));
  add(-0.9, prisma(ret_rot(-ux * 2.35 + lx * 0.75, -uy * 2.35 + ly * 0.75, ang + 0.55, -0.12, 0.12, -0.05, 0.05), 0.0, 0.42, cores));   // deriva
  // fuselagem amassada no chão, cabine quebrada
  add(0.0, bloco(0, 0, ang, 1.35, 0.84, 0.0, 0.5, cores));
  add(0.1, bloco(-ux * 0.05, -uy * 0.05, ang, 0.75, 0.55, 0.5, 0.12, escuro));
  add(0.3, bloco(ux * 0.82, uy * 0.82, ang, 0.28, 0.62, 0.0, 0.34, { topo: [52, 62, 74], dir: [40, 48, 58], esq: [28, 34, 42] }));
  // esquis tortos para fora
  for (const b of [-0.5, 0.5]) add(0.05 + b, bloco(lx * b * 1.15, ly * b * 1.15, ang + b * 0.3, 1.5, 0.08, 0.0, 0.06, ACO_Q));
  // pás do rotor espalhadas
  for (let i = 0; i < 4; i++) {
    const a = r() * 6.28, d = 1.2 + r() * 1.4;
    add(0.6, bloco(Math.cos(a) * d, Math.sin(a) * d, r() * 6.28, 1.8 + r() * 0.6, 0.14, 0.0, 0.04, { topo: [60, 64, 72], dir: [46, 50, 56], esq: [34, 36, 42] }));
  }
  add(0.7, prisma(Array.from({ length: 8 }, (_, i) => { const a = i / 8 * 6.2832; return [Math.cos(a) * 0.12, Math.sin(a) * 0.12]; }), 0.62, 0.78, ACO_Q));   // mastro
  partes.sort((a, b) => a[0] - b[0]);
  let f = [];
  for (const [, fs] of partes) f = f.concat(fs);
  return f;
}

function formas_base(time, r) {
  // escombros da base: laje rachada, entulho, teto curvo desabado, vigas
  const cores = queimado(C.TIMES[time]);
  const L = 4.2, W = 3.0;
  const partes = [];
  const add = (prof, fs) => partes.push([prof, fs]);
  // lajes rachadas (o piso) com alturas diferentes
  for (let i = 0; i < 6; i++) {
    const cx = (r() - 0.5) * L * 0.9, cy = (r() - 0.5) * W * 0.9;
    add(cx + cy - 3, pedra(r, cx, cy, 0.9 + r() * 0.5, 0, 0.08 + r() * 0.1, r() < 0.5 ? CONCRETO : CONCRETO_Q));
  }
  // teto curvo desabado: pedaços da abóbada caídos meio de lado
  const pedacos = 3 + Math.floor(r() * 2);
  for (let k = 0; k < pedacos; k++) {
    const a0 = -L / 2 + k * L / pedacos + 0.12, a1 = a0 + L / pedacos - 0.25;
    const caida = 0.25 + r() * 0.35;          // achatado
    const torto = (r() - 0.5) * 0.7;
    const t0 = r() * 0.35, t1 = 0.65 + r() * 0.35;   // só um pedaço do arco
    const seg = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const th = Math.PI * (t0 + (t1 - t0) * i / n);
      seg.push([Math.cos(th) * W / 2, Math.sin(th) * 1.6 * caida]);
    }
    for (let i = 0; i < n; i++) {
      const [b0, z0] = seg[i], [b1, z1] = seg[i + 1];
      const tom = 0.75 + 0.25 * Math.cos((i / n) * Math.PI);
      const c = i % 3 === 1 ? [cores.esq[0] * 0.85, cores.esq[1] * 0.85, cores.esq[2] * 0.85].map(Math.round) : iso.tom(i < n / 2 ? cores.dir : cores.topo, tom);
      const p = [[a0, b0 + torto * z0], [a1, b0 + torto * z0], [a1, b1 + torto * z1], [a0, b1 + torto * z1]];
      add((a0 + a1) / 2 + (b0 + b1) / 2 + 0.2 + z0 * 0.3, [iso.poli([[p[0][0], p[0][1], z0 + 0.15], [p[1][0], p[1][1], z0 + 0.15], [p[2][0], p[2][1], z1 + 0.15], [p[3][0], p[3][1], z1 + 0.15]], c)]);
    }
    // nervuras (os arcos de aço) entortadas
    for (const a of [a0, a1]) {
      for (let i = 0; i < n; i += 2) {
        const [b0, z0] = seg[i], [b1, z1] = seg[Math.min(n, i + 2)];
        add(a + b0 + 0.3, [viga([a, b0 + torto * z0, z0 + 0.17], [a, b1 + torto * z1, z1 + 0.17], 2.2, [44, 46, 52])]);
      }
    }
  }
  // vigas tortas espetadas para cima
  for (let i = 0; i < 4; i++) {
    const x = (r() - 0.5) * L, y = (r() - 0.5) * W;
    const h = 0.9 + r() * 1.1;
    const ax = x + (r() - 0.5) * 1.0, ay = y + (r() - 0.5) * 1.0;
    add(x + y + 1, [viga([x, y, 0], [ax, ay, h], 3.2, [58, 60, 66]), viga([ax, ay, h], [ax + (r() - 0.5) * 0.9, ay + (r() - 0.5) * 0.9, h + 0.3 + r() * 0.4], 2.6, [52, 54, 60])]);
  }
  // entulho (blocos de concreto, tijolos) e chapas da cor do time
  for (let i = 0; i < 18; i++) {
    const x = (r() - 0.5) * (L + 2.2), y = (r() - 0.5) * (W + 2.0);
    add(x + y + 0.5, pedra(r, x, y, 0.14 + r() * 0.3, 0, 0.1 + r() * 0.28, r() < 0.6 ? CONCRETO : CONCRETO_Q));
  }
  for (let i = 0; i < 6; i++) {
    const x = (r() - 0.5) * (L + 1.5), y = (r() - 0.5) * (W + 1.5);
    add(x + y + 0.6, bloco(x, y, r() * 6.28, 0.5 + r() * 0.6, 0.3 + r() * 0.3, 0.0, 0.05, cores));
  }
  // a porta (escura) caída de cara no chão
  add(-1, bloco(L * 0.42, 0.2, 0.3, 0.12, 1.2, 0.0, 0.5, { topo: [36, 40, 50], dir: [28, 31, 40], esq: [20, 22, 30] }));
  partes.sort((a, b) => a[0] - b[0]);
  let f = [];
  for (const [, fs] of partes) f = f.concat(fs);
  return f;
}

function formas_torre(time, r) {
  const cores = queimado(C.TIMES[time]);
  const partes = [];
  const add = (prof, fs) => partes.push([prof, fs]);
  add(-1, pedra(r, 0, 0, 1.15, 0, 0.32, CONCRETO_Q));                       // base de concreto rachada
  add(-0.5, pedra(r, 0.25, -0.2, 0.6, 0.32, 0.18, CONCRETO));
  // pernas tortas (uma ainda de pé, dobrada)
  add(0, [viga([0.6, 0.6, 0.3], [0.8, 0.9, 1.2], 3, [58, 60, 66]), viga([0.8, 0.9, 1.2], [1.4, 1.1, 1.1], 3, [52, 54, 60])]);
  add(0.2, [viga([-0.6, 0.5, 0.3], [-1.6, 1.3, 0.05], 3, [58, 60, 66])]);
  // plataforma caída (cor do time) e sacos de areia rasgados
  add(0.5, bloco(1.0, -1.1, 0.5, 1.3, 1.0, 0.0, 0.12, cores));
  for (let i = 0; i < 5; i++) add(0.6, bloco(-1.2 + r() * 2.4, 1.0 + r() * 0.8, r() * 3, 0.42, 0.24, 0, 0.16, { topo: [176, 160, 126], dir: [148, 132, 100], esq: [118, 104, 78] }));
  for (let i = 0; i < 8; i++) { const x = (r() - 0.5) * 3.2, y = (r() - 0.5) * 3.2; add(x + y, pedra(r, x, y, 0.12 + r() * 0.18, 0, 0.1 + r() * 0.12, CONCRETO)); }
  partes.sort((a, b) => a[0] - b[0]);
  let f = [];
  for (const [, fs] of partes) f = f.concat(fs);
  return f;
}

function formas_barricada(time, ang, r) {
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const partes = [];
  const add = (prof, fs) => partes.push([prof, fs]);
  // tronco partido em dois, cavaletes caídos
  add(0, bloco(-ux * 0.8, -uy * 0.8, ang + 0.25, 1.4, 0.24, 0.0, 0.22, MADEIRA_Q));
  add(0.1, bloco(ux * 0.9, uy * 0.9, ang - 0.35, 1.2, 0.22, 0.0, 0.2, MADEIRA_Q));
  for (let i = 0; i < 3; i++) {
    const s = (i - 1) * 1.2;
    add(0.2 + i * 0.1, bloco(ux * s + (r() - 0.5) * 0.6, uy * s + (r() - 0.5) * 0.6, r() * 3, 1.0, 0.12, 0.0, 0.1, MADEIRA_Q));
  }
  // arame farpado solto, em voltas no chão
  const fios = [];
  let px = -ux * 1.6, py = -uy * 1.6;
  for (let i = 0; i < 14; i++) {
    const a = i * 1.3;
    const nx = px + ux * 0.25 + Math.cos(a) * 0.25, ny = py + uy * 0.25 + Math.sin(a) * 0.25;
    fios.push(viga([px, py, 0.05 + 0.12 * Math.abs(Math.sin(a))], [nx, ny, 0.05 + 0.12 * Math.abs(Math.sin(a + 1.3))], 1.4, [88, 92, 100]));
    px = nx; py = ny;
  }
  add(0.6, fios);
  partes.sort((a, b) => a[0] - b[0]);
  let f = [];
  for (const [, fs] of partes) f = f.concat(fs);
  return f;
}

// pontos (relativos) onde ficam os foguinhos de cada destroço: [dx, dy, z, tamanho]
function lugares_fogo(tipo, r, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (tipo === 'tanque') out.push([(r() - 0.5) * 1.6, (r() - 0.5) * 1.0, i === 0 ? 0.65 : 0.1 + r() * 0.5, 0.9 + r() * 0.5]);
    else if (tipo === 'base') out.push([(r() - 0.5) * 4.4, (r() - 0.5) * 3.0, 0.05 + r() * 0.4, 1.0 + r() * 0.8]);
    else if (tipo === 'heli') out.push([(r() - 0.5) * 1.6, (r() - 0.5) * 1.2, 0.2 + r() * 0.35, 0.9 + r() * 0.5]);
    else out.push([(r() - 0.5) * 1.6, (r() - 0.5) * 1.4, 0.05 + r() * 0.2, 0.7 + r() * 0.4]);
  }
  return out;
}

export class Destrocos {
  constructor() {
    this.grandes = [];          // {tipo, time, x, y, dir, ang, idade, dur, queima, fogos, raio, seed}
    this.max_grandes = MAX_GRANDES;   // tetos (o gerente de qualidade baixa quando o FPS cai)
    this.max_miudos = MAX_MIUDOS;
    this.miudos = [];           // {tipo, time, x, y, ang, idade, dur, var}
    this._cache = new Map();    // sprites por zoom
    this._z_cache = 0;
    this._esq = new Map();      // veículos vistos no quadro anterior
    this._vistos = new WeakSet();
    this._predios = new Map();  // bases/torres/barricadas do quadro anterior (por posição)
    this._recentes = [];        // soldados que caíram há pouco (para confirmar veículo destruído)
    this._sumidos = [];         // veículos que sumiram há pouco (esperando confirmação)
    this._t_estalo = 0;
    this._marca_img = new Map();
  }

  limpar() {
    this.grandes.length = 0; this.miudos.length = 0;
    this._esq.clear(); this._predios.clear();
    this._vistos = new WeakSet();
    this._recentes.length = 0; this._sumidos.length = 0;
  }

  // ---------- quem foi destruído? ---------------------------------------
  observar(T, dt, fx) {
    // 1) veículos que sumiram neste quadro (canhão espera a confirmação)
    const es = T.esquadroes;
    const vivos = this._vivos || (this._vivos = new Set());
    vivos.clear();
    for (let i = 0; i < es.length; i++) {
      const sq = es[i];
      if (sq.tipo !== 'canhao' && sq.tipo !== 'tanque' && sq.tipo !== 'heli') continue;
      vivos.add(sq);
      let e = this._esq.get(sq);
      if (!e) { e = { x: 0, y: 0, hx: 1, hy: 0, tipo: sq.tipo, time: sq.time }; this._esq.set(sq, e); }
      e.x = sq.x; e.y = sq.y; e.hx = sq.hx || e.hx; e.hy = sq.hy || e.hy; e.time = sq.time;
      if (sq.tipo === 'canhao' && sq.peca) { const p = sq.peca(); e.px = p[0]; e.py = p[1]; }
    }
    for (const [sq, e] of this._esq) {
      if (vivos.has(sq)) continue;
      this._esq.delete(sq);
      if (e.tipo === 'canhao') this._sumidos.push([e, 0.0]);
      else this._ultima_dir = e;   // tanque/heli: a direção vem daqui
    }
    // 2) soldados caindo: destrocinhos e confirmação de veículo destruído
    const ca = T.caidos || [];
    for (let i = 0; i < ca.length; i++) {
      const s = ca[i];
      if (this._vistos.has(s)) continue;
      this._vistos.add(s);
      const tp = s.tipo;
      if (tp === 'tanque' || tp === 'heli') { this._grande(tp, s.time, s.x, s.y, this._direcao_de(s), 0); continue; }
      this._recentes.push([s.x, s.y, tp, s.time, 0.0]);
      if (fx._na_tela(s.x, s.y, 120)) this._miudos_de(s);
    }
    // confirma: canhão sumido + equipe caindo perto = destruído (não foi juntar com outro)
    for (let i = this._sumidos.length - 1; i >= 0; i--) {
      const [e] = this._sumidos[i];
      const caiu = this._recentes.some(r => r[2] === 'canhao' && Math.hypot(r[0] - e.x, r[1] - e.y) < 5);
      if (caiu) {
        this._sumidos.splice(i, 1);
        this._grande('canhao', e.time, e.px !== undefined ? e.px : e.x, e.py !== undefined ? e.py : e.y, tanque.indice(Math.atan2(e.hy, e.hx)) >> 2, 0);
      } else if ((this._sumidos[i][1] += dt) > 1.0) this._sumidos.splice(i, 1);
    }
    for (let i = this._recentes.length - 1; i >= 0; i--) if ((this._recentes[i][4] += dt) > 1.0) this._recentes.splice(i, 1);
    // 3) bases, torres e barricadas que sumiram depois de perder a vida
    const agora = this._agora || (this._agora = new Map());
    agora.clear();
    const marca = (tipo, o) => {
      const k = tipo + ':' + Math.round(o.x * 2) + ',' + Math.round(o.y * 2);
      agora.set(k, [tipo, o.x, o.y, o.time, o.vida_max ? o.vida / o.vida_max : 1, o.ang || 0]);
    };
    const bs = T.todas_bases ? T.todas_bases() : [];
    for (let i = 0; i < bs.length; i++) if (!bs[i].principal) marca('base', bs[i]);
    const to = T.torres || [];
    for (let i = 0; i < to.length; i++) marca('torre', to[i]);
    const ba = T.barricadas || [];
    for (let i = 0; i < ba.length; i++) marca('barricada', ba[i]);
    for (const [k, d] of this._predios) {
      if (agora.has(k)) continue;
      this._grande(d[0], d[3], d[1], d[2], 0, d[5]);   // base/torre/barricada só some quando é destruída
    }
    const tmp = this._predios; this._predios = agora; this._agora = tmp;
  }

  _direcao_de(s) {
    // tanque/helicóptero: direção do casco pelo esquadrão que sumiu (ou do boneco)
    const e = this._ultima_dir;
    if (e && Math.hypot(e.x - s.x, e.y - s.y) < 3) return tanque.indice(Math.atan2(e.hy, e.hx)) >> 2;
    return (s.dir || 0) & 3;
  }

  _grande(tipo, time, x, y, dir, ang) {
    while (this.grandes.length && this.grandes.length >= this.max_grandes) {   // tira o mais velho
      let iv = 0;
      for (let i = 1; i < this.grandes.length; i++) if (this.grandes[i].idade / this.grandes[i].dur > this.grandes[iv].idade / this.grandes[iv].dur) iv = i;
      this.grandes.splice(iv, 1);
    }
    const [dur, queima, nf] = VIDA[tipo];
    const seed = (Math.round(x * 97) * 7919 + Math.round(y * 89) * 104729 + Math.floor(rnd() * 3)) >>> 0;
    const r = semeado(seed ^ 0x5bd1e995);
    const fogos = lugares_fogo(tipo, r, nf).map(([dx, dy, z, tam]) => ({ dx, dy, z, tam, t: rnd() * 2, dur: ent(1.6, 3.8), fase: rnd() * 6.28, aceso: rnd() < 0.85 }));
    const raio = { tanque: 2.3, canhao: 1.7, heli: 2.4, base: 4.4, torre: 2.0, barricada: 1.8 }[tipo];
    this.grandes.push({ tipo, time: time === 'vermelho' ? 'vermelho' : 'verde', x, y, dir: dir & 3, ang, idade: 0, dur: dur * ent(0.9, 1.1), queima, fogos, raio, seed, var: seed % 3 });
  }

  _miudos_de(s) {
    // destrocinhos de um soldado: capacete, arma, caixote
    const tp = s.tipo;
    const n = this.miudos;
    const sobra = this.max_miudos - n.length;
    if (sobra < 3) n.splice(0, 3 - sobra);
    const time = s.time === 'vermelho' ? 'vermelho' : 'verde';
    const dur = ent(16, 24);
    const prob_arma = tp === 'foguete' ? 0.9 : tp === 'granada' ? 0.6 : tp === 'canhao' ? 0.5 : 0.32;
    if (rnd() < (tp === 'pelotao' ? 0.38 : 0.7)) n.push({ tipo: 'capacete', time, x: s.x + ent(-0.3, 0.3), y: s.y + ent(-0.3, 0.3), ang: rnd() * 6.28, idade: 0, dur, var: rnd() });
    if (rnd() < prob_arma) {
      const arma = tp === 'foguete' ? 'bazuca' : tp === 'granada' ? 'lanca' : tp === 'canhao' ? 'caixote' : 'fuzil';
      n.push({ tipo: arma, time, x: s.x + ent(-0.5, 0.5), y: s.y + ent(-0.5, 0.5), ang: rnd() * 6.28, idade: 0, dur, var: rnd() });
    }
    if (rnd() < 0.18) n.push({ tipo: 'cartucheira', time, x: s.x + ent(-0.6, 0.6), y: s.y + ent(-0.6, 0.6), ang: rnd() * 6.28, idade: 0, dur, var: rnd() });
  }

  // ---------- passo: fogo, fumaça, brasas, luz e estalos -----------------
  passo(dt, fx) {
    const gs = this.grandes;
    let perto = null;
    for (let i = gs.length - 1; i >= 0; i--) {
      const w = gs[i];
      w.idade += dt;
      if (w.idade >= w.dur) { gs.splice(i, 1); continue; }
      const u = w.idade / w.dur;
      const fogo = u < w.queima ? Math.min(1, (w.queima - u) / 0.12) : 0;   // apaga devagar no fim da queima
      w.fogo = fogo;
      const na_tela = fx._na_tela(w.x, w.y, 200);
      for (const f of w.fogos) {   // cada foguinho acende e apaga no seu ritmo
        f.t += dt;
        if (f.t >= f.dur) { f.t = 0; f.dur = ent(1.6, 3.8); f.aceso = rnd() < 0.82 * fogo + 0.05; f.fase = rnd() * 6.28; }
      }
      if (!na_tela) continue;
      const k = w.tipo === 'base' ? 1.25 : w.tipo === 'torre' || w.tipo === 'barricada' ? 0.7 : 1.0;
      if (fogo > 0) {
        perto = w;
        for (const f of w.fogos) {
          if (!f.aceso) continue;
          const x = w.x + f.dx, y = w.y + f.dy;
          if (rnd() < 5 * dt * fx.escala * fogo) fx.brasa_em(x, y, f.z + 0.3);
          fx._luz(x, y, f.z + 0.4, 34 * f.tam * k, 2, (0.42 + 0.16 * Math.sin(fx._t * 17 + f.fase)) * fogo);
        }
        fx.vol.queimada(w.x + ent(-0.4, 0.4), w.y + ent(-0.4, 0.4), Math.min(1.3, 0.75 * k * fogo + 0.15), dt, true);   // coluna escura
      } else {
        // fogo apagado: fiapo de fumaça clara saindo da carcaça
        fx.vol.queimada(w.x, w.y, 0.35 * k * (1 - u), dt, false);
      }
    }
    // estalos do fogo perto da câmera
    this._t_estalo -= dt;
    if (perto && this._t_estalo <= 0) { this._t_estalo = ent(0.6, 1.4); fx._tocar('brasa', perto.x, perto.y, 0.45); }
    const ms = this.miudos;
    for (let i = ms.length - 1; i >= 0; i--) if ((ms[i].idade += dt) >= ms[i].dur) ms.splice(i, 1);
  }

  // ---------- desenho -------------------------------------------------
  _sprite(w, z) {
    if (this._z_cache !== z) { this._cache.clear(); this._z_cache = z; }
    const chave = w.tipo + ':' + w.time + ':' + w.dir + ':' + w.var + ':' + (w.tipo === 'barricada' ? Math.round(w.ang * 4) : 0);
    let sp = this._cache.get(chave);
    if (!sp) {
      const r = semeado((w.var + 1) * 2654435761 + w.dir * 97 + (w.time === 'verde' ? 13 : 29));
      let formas;
      if (w.tipo === 'tanque') formas = formas_tanque(w.time, w.dir, r);
      else if (w.tipo === 'canhao') formas = formas_canhao(w.time, w.dir, r);
      else if (w.tipo === 'heli') formas = formas_heli(w.time, w.dir, r);
      else if (w.tipo === 'base') formas = formas_base(w.time, r);
      else if (w.tipo === 'torre') formas = formas_torre(w.time, r);
      else formas = formas_barricada(w.time, w.ang, r);
      const [img, x0, y0] = sprite(formas, z);
      sp = [img, x0 * z - 1, y0 * z - 1];
      this._cache.set(chave, sp);
    }
    return sp;
  }

  _alfa(o, fim = 4.0) {
    const resta = o.dur - o.idade;
    return Math.max(0, Math.min(1, resta / fim, o.idade / 0.25));
  }

  chao(tela, z, ox, oy, W, A) {
    // camada do chão: mancha chamuscada embaixo dos destroços + destrocinhos das tropas
    const kx = HW * z, ky = HH * z;
    for (let i = 0; i < this.grandes.length; i++) {
      const w = this.grandes[i];
      const px = (w.x - w.y) * kx + ox, py = (w.x + w.y) * ky + oy;
      const rx = w.raio * HW * 1.42 * z * 1.05, ry = rx / 2;
      if (px + rx < 0 || px - rx > W || py + ry < 0 || py - ry > A) continue;
      const a = this._alfa(w, 6.0);
      const img = this._mancha(Math.round(rx));
      tela.globalAlpha = a * 0.85;
      tela.drawImage(img, px - img.width / 2, py - img.height / 4, img.width, img.height / 2);
      if (w.fogo > 0) {   // brasa acesa no chão: brilho laranja suave pulsando (somado à luz)
        const g = this._brilho || (this._brilho = (() => {
          const cv = document.createElement('canvas'); cv.width = cv.height = 64;
          const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
          gr.addColorStop(0, 'rgba(255,150,60,0.9)'); gr.addColorStop(0.45, 'rgba(255,110,40,0.35)'); gr.addColorStop(1, 'rgba(255,90,30,0)');
          c.fillStyle = gr; c.fillRect(0, 0, 64, 64); return cv;
        })());
        tela.globalCompositeOperation = 'lighter';
        tela.globalAlpha = a * w.fogo * (0.32 + 0.12 * Math.sin(w.idade * 7 + w.seed));
        tela.drawImage(g, px - rx * 0.5, py - ry * 0.5, rx, ry);
        tela.globalCompositeOperation = 'source-over';
      }
    }
    tela.globalAlpha = 1;
    // destrocinhos (chatos no chão: desenho direto, bem leve)
    const ms = this.miudos;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      const px = (m.x - m.y) * kx + ox, py = (m.x + m.y) * ky + oy;
      if (px < -20 || px > W + 20 || py < -20 || py > A + 20) continue;
      tela.globalAlpha = this._alfa(m, 3.0);
      this._miudo(tela, m, px, py, z);
    }
    tela.globalAlpha = 1;
  }

  _mancha(rx) {
    // chão chamuscado: borrão escuro irregular com borda de fuligem (imagem pronta)
    const k = Math.max(8, rx - (rx % 4));
    let img = this._marca_img.get(k);
    if (img) return img;
    img = document.createElement('canvas');
    img.width = img.height = k * 2 + 8;
    const c = img.getContext('2d'), m = k + 4;
    const r = semeado(k * 7 + 3);
    for (let i = 0; i < 9; i++) {
      const a = r() * 6.28, d = r() * k * 0.45, rr = k * (0.35 + r() * 0.4);
      const gx = m + Math.cos(a) * d, gy = m + Math.sin(a) * d;
      const g = c.createRadialGradient(gx, gy, 0, gx, gy, rr);
      g.addColorStop(0, 'rgba(26,22,22,0.55)');
      g.addColorStop(0.6, 'rgba(40,36,38,0.32)');
      g.addColorStop(1, 'rgba(60,58,64,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(gx, gy, rr, 0, 6.2832); c.fill();
    }
    // respingos de fuligem em volta
    for (let i = 0; i < 26; i++) {
      const a = r() * 6.28, d = k * (0.6 + r() * 0.4);
      c.fillStyle = `rgba(34,30,32,${0.15 + r() * 0.25})`;
      c.beginPath(); c.arc(m + Math.cos(a) * d, m + Math.sin(a) * d, 1 + r() * k * 0.06, 0, 6.2832); c.fill();
    }
    this._marca_img.set(k, img);
    return img;
  }

  _miudo(tela, m, px, py, z) {
    const s = Math.max(0.6, z);
    const ca = Math.cos(m.ang), sa = Math.sin(m.ang);
    // direção no chão vira direção na tela (achatada)
    const dx = (ca - sa) * HW / 2, dy = (ca + sa) * HH / 2;
    const l = Math.hypot(dx, dy) || 1, ex = dx / l, ey = dy / l;
    const time = C.TIMES[m.time];
    tela.lineCap = 'round';
    if (m.tipo === 'capacete') {
      const cor = time.esq;
      tela.fillStyle = 'rgba(30,34,44,0.35)';
      tela.beginPath(); tela.ellipse(px + 1 * s, py + 1.2 * s, 4.2 * s, 2.2 * s, 0, 0, 6.2832); tela.fill();
      tela.fillStyle = `rgb(${cor[0]},${cor[1]},${cor[2]})`;
      tela.beginPath(); tela.ellipse(px, py - 1 * s, 3.6 * s, 2.6 * s, 0, Math.PI, 0); tela.lineTo(px + 3.6 * s, py); tela.lineTo(px - 3.6 * s, py); tela.fill();
      tela.fillStyle = `rgb(${time.dir[0]},${time.dir[1]},${time.dir[2]})`;
      tela.beginPath(); tela.ellipse(px, py, 4.2 * s, 1.3 * s, 0, 0, 6.2832); tela.fill();   // aba
      tela.fillStyle = 'rgba(255,255,255,0.25)';
      tela.beginPath(); tela.ellipse(px - 1.2 * s, py - 2.3 * s, 1.2 * s, 0.6 * s, -0.4, 0, 6.2832); tela.fill();
    } else if (m.tipo === 'fuzil') {
      tela.strokeStyle = 'rgba(30,34,44,0.3)'; tela.lineWidth = 2.2 * s;
      tela.beginPath(); tela.moveTo(px - ex * 6 * s + 1, py - ey * 6 * s + 1.5); tela.lineTo(px + ex * 6 * s + 1, py + ey * 6 * s + 1.5); tela.stroke();
      tela.strokeStyle = '#2b2f38'; tela.lineWidth = 1.5 * s;
      tela.beginPath(); tela.moveTo(px - ex * 2 * s, py - ey * 2 * s); tela.lineTo(px + ex * 6.5 * s, py + ey * 6.5 * s); tela.stroke();
      tela.strokeStyle = '#6b4a30'; tela.lineWidth = 2.4 * s;   // coronha de madeira
      tela.beginPath(); tela.moveTo(px - ex * 6 * s, py - ey * 6 * s); tela.lineTo(px - ex * 1.5 * s, py - ey * 1.5 * s); tela.stroke();
    } else if (m.tipo === 'bazuca') {
      tela.strokeStyle = 'rgba(30,34,44,0.3)'; tela.lineWidth = 4 * s;
      tela.beginPath(); tela.moveTo(px - ex * 8 * s + 1, py - ey * 8 * s + 2); tela.lineTo(px + ex * 8 * s + 1, py + ey * 8 * s + 2); tela.stroke();
      tela.strokeStyle = '#4f5a3e'; tela.lineWidth = 3.4 * s;   // tubo verde-oliva
      tela.beginPath(); tela.moveTo(px - ex * 8 * s, py - ey * 8 * s); tela.lineTo(px + ex * 8 * s, py + ey * 8 * s); tela.stroke();
      tela.strokeStyle = '#2e3426'; tela.lineWidth = 4.2 * s;   // bocal e cinta
      tela.beginPath(); tela.moveTo(px + ex * 6.5 * s, py + ey * 6.5 * s); tela.lineTo(px + ex * 8.5 * s, py + ey * 8.5 * s); tela.stroke();
      tela.beginPath(); tela.moveTo(px - ex * 0.5 * s, py - ey * 0.5 * s); tela.lineTo(px + ex * 0.8 * s, py + ey * 0.8 * s); tela.stroke();
    } else if (m.tipo === 'lanca') {
      tela.strokeStyle = '#3a3f4a'; tela.lineWidth = 2.6 * s;
      tela.beginPath(); tela.moveTo(px - ex * 5 * s, py - ey * 5 * s); tela.lineTo(px + ex * 5 * s, py + ey * 5 * s); tela.stroke();
      tela.fillStyle = '#4a5160';
      tela.beginPath(); tela.arc(px + ex * 1 * s, py + ey * 1 * s, 2.4 * s, 0, 6.2832); tela.fill();   // tambor
      tela.fillStyle = '#56603c';   // granada caída do lado
      tela.beginPath(); tela.ellipse(px - ey * 4 * s, py + ex * 3 * s, 1.6 * s, 1.2 * s, 0, 0, 6.2832); tela.fill();
    } else if (m.tipo === 'caixote') {
      tela.fillStyle = 'rgba(30,34,44,0.3)'; tela.fillRect(px - 4 * s + 1, py - 2 * s + 1.5, 8 * s, 4 * s);
      tela.fillStyle = '#7a5838'; tela.fillRect(px - 4 * s, py - 3 * s, 8 * s, 4 * s);
      tela.fillStyle = '#5c4129'; tela.fillRect(px - 4 * s, py + 1 * s, 8 * s, 1.2 * s);
      tela.fillStyle = '#c9a94a';   // munição espalhada
      for (let k = 0; k < 3; k++) tela.fillRect(px + (5 + k * 1.6) * s, py + (k - 1) * 1.4 * s, 1.6 * s, 0.9 * s);
    } else {   // cartucheira (cinto de munição)
      tela.strokeStyle = '#5a4a2e'; tela.lineWidth = 1.6 * s;
      tela.beginPath(); tela.moveTo(px - ex * 4 * s, py - ey * 4 * s); tela.quadraticCurveTo(px + ey * 3 * s, py - ex * 3 * s, px + ex * 4 * s, py + ey * 4 * s); tela.stroke();
      tela.fillStyle = '#d8b450';
      for (let k = -2; k <= 2; k++) tela.fillRect(px + ex * k * 1.6 * s - 0.5 * s, py + ey * k * 1.6 * s - 1.2 * s, 1 * s, 1.4 * s);
    }
  }

  desenhar(tela, w, z, ox, oy, t) {
    // o destroço (sprite) e os foguinhos em cima dele
    const sp = this._sprite(w, z);
    const px = (w.x - w.y) * HW * z + ox, py = (w.x + w.y) * HH * z + oy;
    const a = this._alfa(w);
    tela.globalAlpha = a;
    tela.drawImage(sp[0], Math.trunc(px + sp[1]), Math.trunc(py + sp[2] + (1 - a) * 4 * z));   // afunda um tiquinho ao sumir
    tela.globalAlpha = 1;
    if (!(w.fogo > 0)) return;
    for (const f of w.fogos) {
      if (!f.aceso) continue;
      const k = Math.min(1, f.t / 0.2) * Math.min(1, (f.dur - f.t) / 0.5) * w.fogo * a;
      if (k < 0.06) continue;
      const fx = iso.sx(w.x + f.dx, w.y + f.dy) * z + ox, fy = iso.sy(w.x + f.dx, w.y + f.dy, f.z) * z + oy;
      chama(tela, fx, fy, f.tam * z * k, t, f.fase);
    }
  }
}

function chama(tela, px, py, s, t, fase) {
  // chama em 3 tons que treme e balança (mais cheia que o foguinho do chão)
  const h = (14 + 4 * Math.sin(fase + t * 15)) * s, w = 4.8 * s;
  const puxa = 2.0 * Math.sin(fase * 2 + t * 8) * s;
  const cores = ['#d9481e', '#ec6e28', '#fac846'];
  for (let c = 0; c < 3; c++) {
    const e = [1.0, 0.72, 0.42][c];
    tela.fillStyle = cores[c];
    tela.beginPath();
    tela.moveTo(px - w * e, py);
    tela.quadraticCurveTo(px - w * e, py - h * 0.5 * e, px + puxa * e, py - h * e);
    tela.quadraticCurveTo(px + w * e, py - h * 0.5 * e, px + w * e, py);
    tela.quadraticCurveTo(px, py + w * 0.5 * e, px - w * e, py);
    tela.fill();
  }
  // linguinha extra de vez em quando
  if (Math.sin(t * 6 + fase * 3) > 0.4) {
    tela.fillStyle = '#ec6e28';
    tela.beginPath();
    const lx = px + w * 0.6, ly = py - h * 0.35;
    tela.moveTo(lx - w * 0.3, ly); tela.quadraticCurveTo(lx + puxa, ly - h * 0.45, lx + w * 0.3, ly); tela.fill();
  }
}
