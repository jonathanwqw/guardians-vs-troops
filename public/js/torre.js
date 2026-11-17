// torre.js — a TORRE DE DEFESA desenhada no mapa.
//
// A parte fixa (base de concreto, corpo com a faixa do time, plataforma e a
// roda de sacos de areia) vira imagem pronta, como as bases. O morteiro no
// topo é a única parte que mexe: vira para o alvo, dá o coice e solta o clarão
// a cada granada. São poucas formas por quadro.
//
// Formas no mesmo formato de objetos.js: [cor, pontos em px de cena no zoom 1].
import * as C from './config.js';
import * as iso from './iso.js';
import { sx, sy } from './iso.js';

const CONCRETO = { topo: [204, 208, 216], dir: [168, 174, 184], esq: [134, 140, 152] };
const CONCRETO_CLARO = { topo: [222, 226, 232], dir: [184, 190, 200], esq: [150, 156, 168] };
const SACO = { topo: [214, 196, 152], dir: [190, 170, 128], esq: [160, 142, 104] };
const ACO = [52, 58, 70], ACO_CLARO = [96, 104, 120], PORTA = [70, 76, 90];
const NEVE = { topo: [246, 249, 253], dir: [226, 232, 242], esq: [206, 214, 228] };

export const TOPO = 2.83;   // altura (em z) do piso da plataforma

function _sacos(x, y) {
  // anel de sacos de areia na borda da plataforma (fundo primeiro)
  const f = [];
  const z = TOPO, a = 0.95;
  const fila = (pts) => { for (const [px, py, w, d] of pts) f.push(...iso.caixa(x + px, y + py, z, w, d, 0.24, SACO)); };
  fila([[-a, -a, 0.5, 0.32], [-a + 0.55, -a, 0.5, 0.32], [-a + 1.1, -a, 0.5, 0.32], [a - 0.32, -a + 0.4, 0.32, 0.5]]);
  fila([[-a, -a + 0.4, 0.32, 0.5], [-a, -a + 0.95, 0.32, 0.5]]);
  fila([[a - 0.32, -a + 0.95, 0.32, 0.5], [-a, a - 0.32, 0.5, 0.32], [-a + 1.1, a - 0.32, 0.5, 0.32], [a - 0.32, a - 0.45, 0.32, 0.45]]);
  return f;
}

export function formas_torre(time, x = 0, y = 0) {
  // parte fixa da torre no ponto (x, y) do mundo
  const cor = C.TIMES[time];
  const f = [];
  // sombra no chão, puxada para o lado oposto ao da luz
  const sh = [[1.2, -1.1], [1.2, 1.2], [-0.3, 2.6], [-1.6, 2.6], [-1.6, 1.2], [-1.1, -1.1]];
  f.push([[C.SOMBRA[0], C.SOMBRA[1], C.SOMBRA[2], C.SOMBRA_ALFA], sh.map(([dx, dy]) => [sx(x + dx, y + dy), sy(x + dx, y + dy)])]);
  // base de concreto
  f.push(...iso.caixa(x - 1.15, y - 1.15, 0, 2.3, 2.3, 0.35, CONCRETO));
  f.push(...iso.caixa(x - 1.15, y - 1.15, 0.35, 2.3, 2.3, 0.05, NEVE));
  // corpo
  f.push(...iso.caixa(x - 0.72, y - 0.72, 0.35, 1.44, 1.44, 2.3, CONCRETO));
  f.push(...iso.caixa(x - 0.75, y - 0.75, 1.75, 1.5, 1.5, 0.42, { topo: cor.topo, dir: cor.dir, esq: cor.esq }));
  f.push(iso.face_y(y + 0.73, x - 0.24, x + 0.24, 0.35, 1.25, PORTA));      // porta
  f.push(iso.face_x(x + 0.73, y - 0.12, y + 0.12, 2.25, 2.48, ACO));        // seteira
  // plataforma com mísulas
  for (const [dx, dy] of [[-0.95, -0.95], [0.75, -0.95], [-0.95, 0.75], [0.75, 0.75]]) {
    f.push(...iso.caixa(x + dx, y + dy, 2.38, 0.2, 0.2, 0.28, CONCRETO));
  }
  f.push(...iso.caixa(x - 1.05, y - 1.05, 2.66, 2.1, 2.1, 0.17, CONCRETO_CLARO));
  f.push(..._sacos(x, y));
  return f;
}

export function formas_morteiro(tr, x = tr.x, y = tr.y) {
  // o morteiro em cima da torre, apontado para (hx, hy), com coice e clarão
  const f = [];
  const z = TOPO + 0.24;
  const r = tr.recuo;
  const k = 0.18 * r;                       // o tubo recua no disparo
  const hx = tr.hx, hy = tr.hy;
  // chapa de apoio
  f.push(iso.elipse(sx(x, y), sy(x, y, z), 13, 6.5, ACO, 12));
  f.push(iso.elipse(sx(x, y), sy(x, y, z) - 1.5, 10, 5, ACO_CLARO, 12));
  // tubo: de trás (baixo) para a boca (alto, para o alvo)
  const x0 = x - hx * (0.22 + k), y0 = y - hy * (0.22 + k), z0 = z + 0.12;
  const x1 = x + hx * (0.42 - k), y1 = y + hy * (0.42 - k), z1 = z + 0.95 - k * 0.6;
  // bipé
  const xm = x + hx * 0.2, ym = y + hy * 0.2;
  f.push(iso.linha([sx(xm, ym), sy(xm, ym, z + 0.55)], [sx(xm - hy * 0.3, ym + hx * 0.3), sy(xm - hy * 0.3, ym + hx * 0.3, z)], 2, ACO));
  f.push(iso.linha([sx(xm, ym), sy(xm, ym, z + 0.55)], [sx(xm + hy * 0.3, ym - hx * 0.3), sy(xm + hy * 0.3, ym - hx * 0.3, z)], 2, ACO));
  f.push(iso.linha([sx(x0, y0), sy(x0, y0, z0)], [sx(x1, y1), sy(x1, y1, z1)], 7, ACO));
  f.push(iso.linha([sx(x0, y0), sy(x0, y0, z0) - 2], [sx(x1, y1), sy(x1, y1, z1) - 2], 2.5, ACO_CLARO));
  f.push(iso.elipse(sx(x1, y1), sy(x1, y1, z1), 4.2, 3, ACO, 8));
  // clarão da boca logo depois do disparo
  if (r > 0.62) {
    const a = (r - 0.62) / 0.38;
    const bx = sx(x1, y1), by = sy(x1, y1, z1 + 0.15);
    const R = 7 + 9 * a;
    const est = [];
    for (let i = 0; i < 10; i++) {
      const ang = i * Math.PI / 5, rr = i % 2 ? R * 0.45 : R;
      est.push([bx + Math.cos(ang) * rr, by + Math.sin(ang) * rr * 0.8]);
    }
    f.push([[255, 150, 50, Math.round(200 * a)], est]);
    f.push(iso.elipse(bx, by, R * 0.42, R * 0.34, [255, 236, 170], 8));
  }
  return f;
}

export function formas_icone(time) {
  // a torre inteira (com o morteiro) para o botão de compra
  const tr = { hx: -0.7071, hy: -0.7071, recuo: 0 };
  return formas_torre(time).concat(formas_morteiro(tr, 0, 0));
}
