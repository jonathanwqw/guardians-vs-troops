// canhao.js — a peça de artilharia do pelotão de canhão.
// Sólido isométrico no padrão do jogo: duas rodas, carreta, escudo na cor do
// time e o cano. 4 direções (as mesmas do soldado) e 2 quadros:
//     'p' parado      'r' recuo do disparo (cano para trás + clarão e fumaça)
// (clone de jogo/canhao.py)
import * as C from './config.js';
import * as iso from './iso.js';
import { sprite } from './raster.js';

const _ACO = { topo: [86, 96, 114], dir: [62, 71, 89], esq: [43, 52, 70] };
const _RODA = [43, 52, 70];
const _CUBO = [142, 151, 168];
const _DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function formas(direcao, time, recuo = false) {
  // formas da peça com o eixo das rodas em (0, 0)
  const cores = C.TIMES[time];
  // vetor para onde o cano aponta e o lado
  const [fx, fy] = _DIRS[direcao];
  const lx = -fy, ly = fx;
  const partes = [];   // [profundidade, [formas]]

  const caixa = (a0, a1, b0, b1, z0, z1, c) => {
    // caixa em coordenadas da peça: a = ao longo do cano, b = de lado
    const xs = [fx * a0 + lx * b0, fx * a1 + lx * b1];
    const ys = [fy * a0 + ly * b0, fy * a1 + ly * b1];
    const x = Math.min(xs[0], xs[1]), y = Math.min(ys[0], ys[1]), w = Math.abs(xs[1] - xs[0]), d = Math.abs(ys[1] - ys[0]);
    partes.push([x + w / 2 + y + d / 2 + (z0 + z1) * 0.01, iso.caixa(x, y, z0, w, d, z1 - z0, c)]);
  };

  const roda = (b) => {
    // roda em pé, no plano do cano, deslocada de lado
    const cx = lx * b, cy = ly * b, r = 0.36;
    const aro = [], cubo = [];
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * 2 * Math.PI;
      aro.push([cx + fx * Math.cos(a) * r, cy + fy * Math.cos(a) * r, r + Math.sin(a) * r]);
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 2 * Math.PI;
      cubo.push([cx + fx * Math.cos(a) * r * 0.4, cy + fy * Math.cos(a) * r * 0.4, r + Math.sin(a) * r * 0.4]);
    }
    partes.push([cx + cy + ((lx * b + ly * b) > 0 ? 0.05 : -0.05), [iso.poli(aro, _RODA), iso.poli(cubo, _CUBO)]]);
  };

  const rec = recuo ? -0.2 : 0.0;
  roda(-0.46);
  roda(0.46);
  caixa(-0.75, 0.15, -0.16, 0.16, 0.22, 0.42, _ACO);            // carreta (rabicho para trás)
  caixa(0.1, 0.2, -0.5, 0.5, 0.18, 0.86, cores);                 // escudo na cor do time
  caixa(-0.35 + rec, 1.15 + rec, -0.09, 0.09, 0.5, 0.68, _ACO);  // cano
  caixa(1.05 + rec, 1.2 + rec, -0.12, 0.12, 0.47, 0.71, _ACO);   // boca do cano
  partes.sort((p, q) => p[0] - q[0]);
  let f = [iso.elipse(-10, 4, 26, 9, [C.SOMBRA[0], C.SOMBRA[1], C.SOMBRA[2], 97], 14)];   // sombra no chão
  for (const [, fs] of partes) f = f.concat(fs);
  if (recuo) {   // clarão chapado e baforada de fumaça na boca do cano
    const mx = iso.sx(fx * 1.35, fy * 1.35), my = iso.sy(fx * 1.35, fy * 1.35, 0.59);
    const estrela = [];
    for (let i = 0; i < 10; i++) {
      estrela.push([mx + Math.cos(i * Math.PI / 5) * (i % 2 === 0 ? 9 : 4), my + Math.sin(i * Math.PI / 5) * (i % 2 === 0 ? 7 : 3)]);
    }
    f.push([[255, 210, 74], estrela]);
    f.push(iso.elipse(mx, my, 3.5, 3, [255, 246, 208], 8));
    f.push(iso.elipse(mx + fx * 6 - fy * 6, my - 7, 6, 5, [214, 219, 228], 10));
  }
  return f;
}

export function criar_sprites(zoom) {
  // out[time][dir][quadro] = [imagem, x0, y0]
  const out = {};
  for (const time of ['verde', 'vermelho']) {
    out[time] = [];
    for (let d = 0; d < 4; d++) {
      out[time].push({ p: sprite(formas(d, time), zoom), r: sprite(formas(d, time, true), zoom) });
    }
  }
  return out;
}
