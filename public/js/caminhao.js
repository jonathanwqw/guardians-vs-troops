// caminhao.js — o CAMINHÃO de logística desenhado no mapa (fase 5).
//
// Caixas orientadas pela direção (hx, hy): chassi, carroceria com lona da cor
// do time, cabine na frente e rodas. Com carga, aparecem caixotes na carroceria.
// Formas no mesmo formato de objetos.js: [cor, pontos em px de cena no zoom 1].
import * as C from './config.js';
import * as iso from './iso.js';

const ESCURO = [44, 50, 62], PNEU = [30, 34, 42], VIDRO = [150, 186, 220], CAIXOTE = [176, 132, 82];

function _caixa_or(f, x, y, z, hx, hy, a0, a1, l0, l1, h, cor) {
  // caixa orientada: ao longo de (hx, hy) de a0 a a1, de lado de l0 a l1, altura z..z+h
  const rx = -hy, ry = hx;
  const P = (a, l, zz) => [x + hx * a + rx * l, y + hy * a + ry * l, zz];
  const z1 = z + h;
  const faces = [
    { n: [hx, hy], pts: [P(a1, l0, z1), P(a1, l1, z1), P(a1, l1, z), P(a1, l0, z)] },
    { n: [-hx, -hy], pts: [P(a0, l1, z1), P(a0, l0, z1), P(a0, l0, z), P(a0, l1, z)] },
    { n: [rx, ry], pts: [P(a0, l1, z1), P(a1, l1, z1), P(a1, l1, z), P(a0, l1, z)] },
    { n: [-rx, -ry], pts: [P(a1, l0, z1), P(a0, l0, z1), P(a0, l0, z), P(a1, l0, z)] },
  ];
  for (const fc of faces) {
    if (fc.n[0] + fc.n[1] <= 0) continue;   // só as faces viradas para a câmera
    const k = fc.n[0] >= fc.n[1] ? 0.86 : 0.72;
    f.push(iso.poli(fc.pts, iso.tom(cor, k)));
  }
  f.push(iso.poli([P(a0, l0, z1), P(a1, l0, z1), P(a1, l1, z1), P(a0, l1, z1)], cor));
}

export function formas_caminhao(c) {
  const f = [];
  const x = c.x, y = c.y;
  const n = Math.hypot(c.hx, c.hy) || 1, hx = c.hx / n, hy = c.hy / n;
  const time = C.TIMES[c.time];
  // sombra
  const sh = [];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    const px = x + Math.cos(a) * 1.25 + 0.25, py = y + Math.sin(a) * 1.25 + 0.25;
    sh.push([iso.sx(px, py), iso.sy(px, py)]);
  }
  f.push([[C.SOMBRA[0], C.SOMBRA[1], C.SOMBRA[2], C.SOMBRA_ALFA], sh]);
  // rodas (atrás primeiro)
  for (const a of [-0.75, 0.15, 0.85]) for (const l of [-0.5, 0.42]) _caixa_or(f, x, y, 0, hx, hy, a - 0.18, a + 0.18, l, l + 0.08, 0.32, PNEU);
  // chassi
  _caixa_or(f, x, y, 0.22, hx, hy, -1.05, 1.1, -0.45, 0.45, 0.14, ESCURO);
  // carroceria + lona
  _caixa_or(f, x, y, 0.36, hx, hy, -1.05, 0.38, -0.47, 0.47, 0.22, ESCURO);
  const carga = c.carga_total || 0;
  if (carga > 0) {   // caixotes aparecendo
    const nc = Math.min(4, Math.ceil(carga / (C.CAMINHAO_CAP / 4)));
    for (let i = 0; i < nc; i++) {
      const a = -0.95 + (i % 2) * 0.62, l = i < 2 ? -0.38 : 0.02;
      _caixa_or(f, x, y, 0.58, hx, hy, a, a + 0.5, l, l + 0.36, 0.3, CAIXOTE);
    }
  }
  _caixa_or(f, x, y, 0.58, hx, hy, -1.05, -0.95, -0.47, 0.47, 0.42, time.dir);   // tampa traseira
  // cabine
  _caixa_or(f, x, y, 0.36, hx, hy, 0.45, 1.1, -0.45, 0.45, 0.66, time.base);
  _caixa_or(f, x, y, 0.72, hx, hy, 1.0, 1.12, -0.36, 0.36, 0.22, VIDRO);   // para-brisa
  return f;
}
