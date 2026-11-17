// helicoptero.js — o helicóptero de ataque.
// Sólido isométrico no padrão do jogo (cores chapadas em 3 tons, sem brilho):
// fuselagem na cor do time, cabine de vidro escuro na frente, cauda fina com
// deriva, esquis embaixo e casulos de foguete dos lados. 4 direções.
// O corpo é pré-desenhado (criar_sprites) já na altura de voo; a sombra no
// chão e o rotor girando são desenhados a cada quadro pela cena.js.
// (clone de jogo/helicoptero.py)
import * as C from './config.js';
import * as iso from './iso.js';
import { sprite } from './raster.js';

const _ACO = { topo: [86, 96, 114], dir: [62, 71, 89], esq: [43, 52, 70] };
const _VIDRO = { topo: [120, 146, 172], dir: [92, 118, 146], esq: [66, 88, 114] };
const _DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function formas(direcao, time) {
  // formas do helicóptero com o ponto do chão logo abaixo dele em (0, 0)
  const cores = C.TIMES[time];
  const escuro = { topo: cores.dir, dir: cores.esq, esq: iso.tom(cores.esq, 0.8) };
  const [fx, fy] = _DIRS[direcao];   // para onde o nariz aponta
  const lx = -fy, ly = fx;           // lado
  const A = C.ALT_HELI;
  const partes = [];

  const caixa = (a0, a1, b0, b1, z0, z1, c) => {
    // caixa em coordenadas do helicóptero: a = ao longo do corpo, b = de lado
    const xs = [fx * a0 + lx * b0, fx * a1 + lx * b1];
    const ys = [fy * a0 + ly * b0, fy * a1 + ly * b1];
    const x = Math.min(xs[0], xs[1]), y = Math.min(ys[0], ys[1]), w = Math.abs(xs[1] - xs[0]), d = Math.abs(ys[1] - ys[0]);
    partes.push([x + w / 2 + y + d / 2 + (z0 + z1) * 0.01, iso.caixa(x, y, A + z0, w, d, z1 - z0, c)]);
  };

  for (const b of [-0.42, 0.42]) {   // esquis e suportes
    caixa(-0.75, 0.8, b - 0.05, b + 0.05, -0.62, -0.55, _ACO);
    caixa(-0.3, -0.22, b - 0.03, b + 0.03, -0.55, -0.38, _ACO);
    caixa(0.35, 0.43, b - 0.03, b + 0.03, -0.55, -0.38, _ACO);
  }
  caixa(-1.95, -0.55, -0.1, 0.1, -0.05, 0.13, escuro);          // cauda
  caixa(-2.0, -1.8, -0.04, 0.04, 0.1, 0.55, cores);             // deriva
  caixa(-0.6, 0.75, -0.42, 0.42, -0.4, 0.25, cores);            // fuselagem
  caixa(-0.4, 0.35, -0.3, 0.3, 0.25, 0.4, escuro);              // teto / motor
  caixa(0.75, 1.02, -0.32, 0.32, -0.32, 0.14, _VIDRO);          // cabine de vidro
  for (const b of [-0.56, 0.56]) {                              // casulos de foguete
    caixa(-0.05, 0.42, b - 0.08, b + 0.08, -0.32, -0.18, _ACO);
  }
  caixa(-0.05, 0.05, -0.05, 0.05, 0.4, 0.62, _ACO);            // mastro do rotor
  partes.sort((p, q) => p[0] - q[0]);
  let f = [];
  for (const [, fs] of partes) f = f.concat(fs);
  return f;
}

export function criar_sprites(zoom) {
  // out[time][dir] = [imagem, x0, y0]
  const out = {};
  for (const time of ['verde', 'vermelho']) {
    out[time] = [];
    for (let d = 0; d < 4; d++) out[time].push(sprite(formas(d, time), zoom));
  }
  return out;
}
