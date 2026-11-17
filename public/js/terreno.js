// terreno.js — o chão: lotes de neve, estradas, linha de frente e sombras
// fixas. É desenhado UMA vez por nível de zoom numa imagem grande (a partir
// dos dados do mapa.js) e depois só copiado para a tela a cada quadro.
// (clone de jogo/terreno.py)
import * as C from './config.js';
import * as M from './mapa.js';
import * as pg from './pg.js';
import { HW, HH, de_uv } from './iso.js';
import { poligono } from './raster.js';
import * as treino from './treino.js';
import * as decor from './decor.js';
import { altura_arvore } from './objetos.js';

const R2 = Math.sqrt(2);

function _P(x, y) {
  return [(x - y) * HW, (x + y) * HH];
}

function _normais(pts) {
  // normal (no mundo) em cada ponto de uma polilinha
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1.0;
    out.push([-ty / l, tx / l]);
  }
  return out;
}

function _faixa(pts, nrm, o0, o1) {
  // faixa entre dois deslocamentos laterais de uma polilinha do mundo
  const a = pts.map((p, i) => _P(p[0] + nrm[i][0] * o0, p[1] + nrm[i][1] * o0));
  const b = pts.map((p, i) => _P(p[0] + nrm[i][0] * o1, p[1] + nrm[i][1] * o1));
  return a.concat(b.reverse());
}

function _elipse_mundo(x, y, r, n = 24) {
  // círculo no mundo = elipse na tela
  const c = _P(x, y);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push([c[0] + Math.cos(i / n * 2 * Math.PI) * r * HW * R2, c[1] + Math.sin(i / n * 2 * Math.PI) * r * HH * R2]);
  }
  return out;
}

function _formas_estradas() {
  const margem = [], borda = [], base = [], trilhas = [];
  for (const e of M.ESTRADAS) {
    const nrm = _normais(e.pts);
    for (const [lista, w] of [[margem, e.largura + 0.8], [borda, e.largura + 0.2], [base, e.largura]]) {
      lista.push(_faixa(e.pts, nrm, -w / 2, w / 2));
      for (const fim of [e.pts[0], e.pts[e.pts.length - 1]]) {   // pontas arredondadas
        lista.push(_elipse_mundo(fim[0], fim[1], w / 2));
      }
    }
    for (const o of [-0.36, 0.36]) {
      trilhas.push(e.pts.map((p, i) => _P(p[0] + nrm[i][0] * o, p[1] + nrm[i][1] * o)));
    }
  }
  return [margem, borda, base, trilhas];
}

function _formas_frente() {
  // Duas faixas coladas: verde do lado verde, vermelha do lado vermelho.
  // Cada uma: miolo sólido + duas abas mais claras (degraus, sem desfoque).
  const pts = [];
  let u = -C.CENA_U - 4.0;
  while (u <= C.CENA_U + 4) {
    pts.push(de_uv(u, M.F(u)));
    u += 0.4;
  }
  const nrm = _normais(pts);   // aponta para o lado verde (x + y maior)
  const larguras = [1.5, 0.95, 0.46];
  return [larguras.map(w => _faixa(pts, nrm, 0, w)), larguras.map(w => _faixa(pts, nrm, -w, 0))];
}

function _formas_lotes() {
  const fundo = [], topo = [], riscos = [];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (const l of M.LOTES) {
    const c = l.cantos;
    const tela = c.map(p => _P(p[0], p[1]));
    fundo.push(tela.map(p => [p[0], p[1] + 3.5]));
    topo.push(tela);
    const n = Math.max(3, Math.trunc((l.risco_x ? l.d : l.w) / 0.55 + 0.5));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const a = l.risco_x ? mix(c[0], c[3], t) : mix(c[0], c[1], t);
      const b = l.risco_x ? mix(c[1], c[2], t) : mix(c[3], c[2], t);
      const a2 = mix(a, b, 0.06), b2 = mix(a, b, 0.94);
      riscos.push([_P(a2[0], a2[1]), _P(b2[0], b2[1])]);
    }
  }
  return [fundo, topo, riscos];
}

function _formas_sombras() {
  const s = [];
  const caixa = (x0, y0, w, d, h) => {
    // casco do "pé" + "pé" deslocado na direção da sombra (-x, +y)
    const a = h * 0.55, x1 = x0 + w, y1 = y0 + d;
    s.push([_P(x1, y0), _P(x1, y1), _P(x1 - a, y1 + a), _P(x0 - a, y1 + a), _P(x0 - a, y0 + a), _P(x0, y0)]);
  };
  for (const o of M.CONSTRUCOES) {
    if (o.tipo === 'qg') {
      caixa(o.x - 2, o.y - 2, 4, 4, 3.3);
    } else if (o.tipo === 'galpao' || o.tipo === 'base') {
      const L = 4.2, W = 3;
      if (o.eixo === 'x') caixa(o.x - L / 2, o.y - W / 2, L, W, 1.5);
      else caixa(o.x - W / 2, o.y - L / 2, W, L, 1.5);
    }
  }
  for (const a of M.ARVORES) {
    const p = _P(a.x, a.y), k = a.s;
    const H = altura_arvore(a);   // cada tipo de árvore tem a sua altura
    s.push([[6 * k, 2 * k], [-0.25 * H, 7 * k], [-0.6 * H, 6.5 * k], [-0.86 * H, 3.5 * k],
      [-0.6 * H, 0], [-0.25 * H, -4 * k], [6 * k, -2.5 * k]].map(([dx, dy]) => [p[0] + dx, p[1] + dy]));
  }
  for (const m of M.MONTES) {
    const p = _P(m.x, m.y), k = m.s;
    const pts = [];
    for (let i = 0; i < 12; i++) {
      pts.push([p[0] - 13 * k + Math.cos(i / 12 * 2 * Math.PI) * 27 * k, p[1] + 1 * k + Math.sin(i / 12 * 2 * Math.PI) * 9 * k]);
    }
    s.push(pts);
  }
  return s;
}

export function tamanho(zoom) {
  // largura e altura (px) do terreno inteiro neste zoom
  return [Math.trunc(2 * C.LX * zoom) + 1, Math.trunc(2 * C.LY * zoom) + 1];
}

export function construir(zoom, y0 = 0, y1 = null) {
  // devolve a imagem do terreno neste zoom. Com y0/y1 (linhas de px), desenha
  // só essa faixa horizontal (usado para refazer a linha de frente sem refazer
  // o mapa inteiro): o resultado é idêntico ao mesmo pedaço do terreno inteiro.
  const [larg, alt_total] = tamanho(zoom);
  if (y1 === null) y1 = alt_total;
  y0 = Math.max(0, Math.trunc(y0)); y1 = Math.min(alt_total, Math.ceil(y1));
  const alt = Math.max(1, y1 - y0);
  const surf = pg.superficie(larg, alt);
  surf.translate(0, -y0);
  surf.fillStyle = pg.css(C.NEVE);
  surf.fillRect(0, y0, larg, alt);

  const T = (pts) => pts.map(p => [(p[0] + C.LX) * zoom, (p[1] + C.LY) * zoom]);
  const pintar = (lista, cor) => { for (const pts of lista) poligono(surf, cor, T(pts)); };

  // lotes: uma "laje" baixa de neve com riscos tracejados
  const [fundo, topo, riscos] = _formas_lotes();
  pintar(fundo, C.LOTE_BORDA);
  pintar(topo, C.LOTE);
  const esp = Math.max(1, Math.trunc(1.4 * zoom + 0.5));
  surf.strokeStyle = pg.css(C.LOTE_RISCO);
  surf.lineWidth = esp;
  surf.lineCap = 'butt';
  surf.setLineDash([7 * zoom, 5 * zoom]);
  for (const [a, b] of riscos) {
    const [[ax, ay], [bx, by]] = T([a, b]);
    if (Math.hypot(bx - ax, by - ay) < 1) continue;
    surf.beginPath();
    surf.moveTo(ax, ay);
    surf.lineTo(bx, by);
    surf.stroke();
  }
  surf.setLineDash([]);

  // campos de treino atrás das bases: terra batida, raias e linha de tiro
  for (const a of M.AREAS_TREINO) for (const [cor, pts] of treino.formas_chao(a)) poligono(surf, cor, T(pts));

  // estradas: margem de neve pisada -> borda -> terra -> trilhas
  const [margem, borda, base, trilhas] = _formas_estradas();
  pintar(margem, C.ESTRADA_MARGEM);
  pintar(borda, C.ESTRADA_BORDA);
  pintar(base, C.ESTRADA);
  void trilhas;   // os sulcos agora vêm do decor (com ondulação e brilho)
  decor.estradas(surf, T, zoom);   // lama, neve suja, sulcos, poças, pedrinhas, margens e pegadas

  // enfeites do chão: arbustos, pedras, tocos, galhos, capim e rastros
  decor.chao(surf, T);

  // linha de frente (por cima da estrada, como marcação de território)
  const [verde, vermelho] = _formas_frente();
  const cv = C.TIMES.verde.linha, cr = C.TIMES.vermelho.linha;
  [41, 87, 255].forEach((alfa, i) => {
    poligono(surf, [cv[0], cv[1], cv[2], alfa], T(verde[i]));
    poligono(surf, [cr[0], cr[1], cr[2], alfa], T(vermelho[i]));
  });

  // sombras fixas: camada única (sobreposições não escurecem em dobro)
  const camada = pg.superficie(larg, alt);
  camada.translate(0, -y0);
  for (const pts of _formas_sombras()) poligono(camada, C.SOMBRA, T(pts));
  surf.setTransform(1, 0, 0, 1, 0, 0);
  surf.globalAlpha = C.SOMBRA_ALFA / 255;
  surf.drawImage(camada.canvas, 0, 0);
  surf.globalAlpha = 1;
  camada.canvas.width = 1;
  camada.canvas.height = 1;
  return surf.canvas;
}
