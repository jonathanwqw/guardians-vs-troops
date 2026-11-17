// decor.js — os DETALHES do chão, desenhados UMA vez junto com o terreno
// (terreno.js), por isso não custam nada por quadro:
//
//   ESTRADAS: manchas de lama, neve suja nas beiradas, sulcos de pneu com
//   brilho, faixa de lama derretida no meio, poças congeladas com reflexo,
//   pedrinhas, montinhos de neve empurrada nas margens e pegadas na neve
//   pisada ao lado.
//
//   CHÃO: arbustos com neve, pedras com capa de neve, tocos, galhos caídos,
//   tufos de capim furando a neve e rastros de bichinhos.
//
// Tudo sai de um sorteio com semente própria (mesmo mapa toda vez) e é
// gerado no mundo inteiro: refazer só uma faixa (linha de frente) dá
// exatamente os mesmos pixels.
import * as C from './config.js';
import * as M from './mapa.js';
import { HW, HH, semente, hip } from './iso.js';
import { poligono } from './raster.js';

const R2 = Math.sqrt(2);
const _P = (x, y) => [(x - y) * HW, (x + y) * HH];

// mancha irregular (círculo do mundo com borda tremida) -> pontos de cena
function _mancha(x, y, r, rnd, n = 10, trem = 0.28, achata = 1) {
  const c = _P(x, y), out = [];
  const f0 = rnd() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = i / n * 2 * Math.PI;
    const k = r * (1 - trem / 2 + trem * (0.5 + 0.5 * Math.sin(a * 3 + f0)) * (0.7 + 0.6 * rnd()));
    out.push([c[0] + Math.cos(a) * k * HW * R2, c[1] + Math.sin(a) * k * HH * R2 * achata]);
  }
  return out;
}

function _normais(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    out.push([-ty / l, tx / l]);
  }
  return out;
}

function _ao_longo(pts, passo, fn) {
  // chama fn(x, y, nx, ny, s) a cada `passo` unidades ao longo da polilinha
  const nrm = _normais(pts);
  let s = 0, falta = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = hip(b[0] - a[0], b[1] - a[1]);
    let t = falta;
    while (t <= L) {
      const k = L ? t / L : 0;
      const nx = nrm[i - 1][0] + (nrm[i][0] - nrm[i - 1][0]) * k, ny = nrm[i - 1][1] + (nrm[i][1] - nrm[i - 1][1]) * k;
      const nl = Math.hypot(nx, ny) || 1;
      fn(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, nx / nl, ny / nl, s + t);
      t += passo;
    }
    falta = t - L;
    s += L;
  }
}

// ---------- ESTRADAS ----------------------------------------------------
let _cache_estradas = null;
function _formas_estradas() {
  if (_cache_estradas) return _cache_estradas;
  const rnd = semente(51077);
  const lama = [], neve_suja = [], pocas = [], pedras = [], margem = [], pegadas = [];
  const sulcos = [], brilhos = [], meio = [];
  for (const e of M.ESTRADAS) {
    const w = e.largura, mw = w / 2;
    // manchas de lama (mais escuras e mais claras) espalhadas na terra
    _ao_longo(e.pts, 0.9, (x, y, nx, ny) => {
      if (rnd() > 0.7) return;
      const o = (rnd() - 0.5) * w * 0.75;
      const escura = rnd() < 0.55;
      lama.push([escura ? [150, 116, 82, 70] : [222, 196, 160, 85], _mancha(x + nx * o, y + ny * o, 0.25 + rnd() * 0.45, rnd, 10, 0.5, 0.8)]);
    });
    // neve suja grudada nas beiradas da estrada (por dentro)
    _ao_longo(e.pts, 1.3, (x, y, nx, ny) => {
      if (rnd() > 0.55) return;
      const lado = rnd() < 0.5 ? -1 : 1, o = lado * (mw - 0.12 - rnd() * 0.3);
      const px = x + nx * o, py = y + ny * o;
      const r = 0.18 + rnd() * 0.3;
      neve_suja.push([[214, 212, 210, 210], _mancha(px, py, r, rnd, 9, 0.5)]);
      neve_suja.push([[238, 238, 236, 230], _mancha(px - 0.04, py - 0.06, r * 0.62, rnd, 8, 0.4)]);
      if (rnd() < 0.5) neve_suja.push([[230, 228, 224, 210], _mancha(px + nx * 0.25, py + ny * 0.25 + 0.2 * lado, r * 0.5, rnd, 7)]);
    });
    // sulcos de pneu: 2 pares que ondulam de leve, com borda iluminada
    for (const base of [-0.42, -0.24, 0.24, 0.42]) {
      const o0 = base * w / 2.4 * 2.0, fase = rnd() * 6.28, linha = [], luz = [];
      _ao_longo(e.pts, 0.35, (x, y, nx, ny, s) => {
        const o = o0 + Math.sin(s * 0.35 + fase) * 0.05;
        linha.push(_P(x + nx * o, y + ny * o));
        luz.push(_P(x + nx * (o + 0.07), y + ny * (o + 0.07)));
      });
      sulcos.push(linha); brilhos.push(luz);
    }
    // faixa do meio: lama derretida mais clara, em trechos
    {
      let trecho = [];
      _ao_longo(e.pts, 0.35, (x, y, nx, ny, s) => {
        if (Math.sin(s * 0.21 + w) > -0.35) {
          const o = Math.sin(s * 0.5) * 0.06;
          trecho.push(_P(x + nx * o, y + ny * o));
        } else if (trecho.length) { if (trecho.length > 2) meio.push(trecho); trecho = []; }
      });
      if (trecho.length > 2) meio.push(trecho);
    }
    // poças congeladas
    _ao_longo(e.pts, 5.5, (x, y, nx, ny) => {
      if (rnd() > 0.5) return;
      const o = (rnd() - 0.5) * w * 0.45, px = x + nx * o, py = y + ny * o;
      if (M.dist_estrada(px, py) > -0.45) return;
      const r = 0.2 + rnd() * 0.17;
      pocas.push({ x: px, y: py, r, a: _mancha(px, py, r * 1.12, rnd, 12, 0.35, 0.85), b: _mancha(px, py, r, rnd, 12, 0.3, 0.85),
        c: _mancha(px - r * 0.18, py - r * 0.1, r * 0.55, rnd, 10, 0.3) });
    });
    // pedrinhas
    _ao_longo(e.pts, 0.22, (x, y, nx, ny) => {
      for (let k = 0; k < 2; k++) {
        if (rnd() > 0.55) continue;
        const o = (rnd() - 0.5) * w * 0.92;
        const r = 0.03 + rnd() * 0.04;
        const cor = rnd() < 0.6 ? [124, 100, 78] : [234, 222, 204];
        pedras.push([cor, _mancha(x + nx * o + (rnd() - 0.5) * 0.2, y + ny * o + (rnd() - 0.5) * 0.2, r, rnd, 6, 0.3)]);
      }
    });
    // montinhos de neve empurrada nas margens (fora da estrada)
    _ao_longo(e.pts, 0.38, (x, y, nx, ny) => {
      for (const lado of [-1, 1]) {
        if (rnd() < 0.18) continue;
        const o = lado * (mw + 0.3 + rnd() * 0.16);
        const px = x + nx * o, py = y + ny * o;
        if (M.dist_estrada(px, py) < 0.1) continue;   // não invade outra estrada (cruzamentos)
        const r = 0.2 + rnd() * 0.2;
        margem.push({ x: px, y: py, r, s: _mancha(px + 0.05, py + 0.07, r, rnd, 9, 0.3, 0.9), l: _mancha(px - 0.03, py - 0.05, r * 0.78, rnd, 9, 0.3, 0.85) });
      }
    });
    // pegadas na neve pisada ao lado da estrada (trilhas curtas)
    let trilha = 0, lado_t = 1, passo_n = 0;
    _ao_longo(e.pts, 0.3, (x, y, nx, ny) => {
      if (trilha <= 0) { if (rnd() < 0.04) { trilha = 10 + Math.floor(rnd() * 14); lado_t = rnd() < 0.5 ? -1 : 1; } return; }
      trilha--; passo_n++;
      const o = lado_t * (mw + 0.85 + (passo_n % 2 ? 0.1 : -0.1));
      const px = x + nx * o, py = y + ny * o;
      if (M.dist_estrada(px, py) < 0.5 || !M.livre_decor(px, py)) return;
      pegadas.push(_mancha(px, py, 0.075, rnd, 6, 0.2, 0.7));
    });
  }
  _cache_estradas = { lama, neve_suja, pocas, pedras, margem, pegadas, sulcos, brilhos, meio };
  return _cache_estradas;
}

export function estradas(surf, T, zoom) {
  // por cima da terra das estradas (antes da linha de frente e das sombras)
  const F = _formas_estradas();
  const pinta = (cor, pts) => poligono(surf, cor, T(pts));
  for (const [cor, pts] of F.lama) pinta(cor, pts);
  // sulcos: escuro + filete claro do lado (a luz vem de cima)
  surf.lineJoin = 'round'; surf.lineCap = 'round';
  const traco = (lista, cor, larg) => {
    surf.strokeStyle = `rgba(${cor[0]},${cor[1]},${cor[2]},${(cor[3] ?? 255) / 255})`;
    surf.lineWidth = Math.max(1, larg * zoom);
    for (const l of lista) {
      const p = T(l);
      surf.beginPath(); surf.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) surf.lineTo(p[i][0], p[i][1]);
      surf.stroke();
    }
  };
  traco(F.meio, [224, 204, 172, 150], 7);
  traco(F.brilhos, [226, 204, 172, 200], 1.6);
  traco(F.sulcos, [150, 116, 84, 235], 2.6);
  for (const [cor, pts] of F.pedras) pinta(cor, pts);
  for (const [cor, pts] of F.neve_suja) pinta(cor, pts);
  // poças congeladas: borda de lama molhada, gelo azulado, miolo claro e reflexo
  for (const p of F.pocas) {
    pinta([132, 102, 74], p.a);
    pinta([176, 198, 218], p.b);
    pinta([208, 224, 238], p.c);
    const c = _P(p.x, p.y), k = p.r * HW * R2;
    const [[ax, ay], [bx, by]] = T([[c[0] - k * 0.5, c[1] - k * 0.12], [c[0] + k * 0.05, c[1] - k * 0.32]]);
    surf.strokeStyle = 'rgba(255,255,255,0.9)'; surf.lineWidth = Math.max(1, 1.8 * zoom);
    surf.beginPath(); surf.moveTo(ax, ay); surf.lineTo(bx, by); surf.stroke();
    const [[cx2, cy2]] = T([[c[0] + k * 0.25, c[1] + k * 0.15]]);
    surf.fillStyle = 'rgba(255,255,255,0.85)';
    surf.beginPath(); surf.arc(cx2, cy2, Math.max(0.8, 1.3 * zoom), 0, 6.283); surf.fill();
  }
  // margens: montinhos com sombra azulada embaixo e topo claro
  for (const m of F.margem) pinta(C.NEVE_SOMBRA, m.s);
  for (const m of F.margem) pinta(C.NEVE_CLARA, m.l);
  for (const pts of F.pegadas) pinta([196, 204, 222], pts);
}

// ---------- CHÃO: arbustos, pedras, tocos, galhos, capim e rastros -------
let _cache_chao = null;
function _formas_chao() {
  if (_cache_chao) return _cache_chao;
  const rnd = semente(90311);
  const itens = [];
  const ok = (x, y) => M.dist_estrada(x, y) > 0.7 && M.livre_decor(x, y, 0.3) &&
    Math.abs(x - y) < C.CENA_U + 2 && Math.abs(x + y) < C.CENA_V + C.FUNDO_CENA &&
    !M.ARVORES.some(a => hip(a.x - x, a.y - y) < 0.7);
  const tipos = ['arbusto', 'arbusto', 'pedra', 'pedra', 'toco', 'galho', 'capim', 'capim'];
  // em volta das árvores (bosques ficam mais "cheios")
  for (const a of M.ARVORES) {
    const n = rnd() < 0.55 ? 1 : (rnd() < 0.5 ? 2 : 0);
    for (let k = 0; k < n; k++) {
      const ang = rnd() * 6.28, d = 1.0 + rnd() * 1.6;
      const x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
      if (ok(x, y)) itens.push({ tipo: tipos[Math.floor(rnd() * tipos.length)], x, y, s: 0.7 + rnd() * 0.6, r: rnd });
    }
  }
  // soltos pelo mapa
  let n = 0, tent = 0;
  while (n < 260 && tent < 4000) {
    tent++;
    const u = (rnd() * 2 - 1) * C.CENA_U, v = (rnd() * 2 - 1) * (C.CENA_V + 8);
    const x = (u + v) / 2, y = (v - u) / 2;
    if (!ok(x, y)) continue;
    const t = rnd() < 0.12 ? 'rastro' : tipos[Math.floor(rnd() * tipos.length)];
    itens.push({ tipo: t, x, y, s: 0.7 + rnd() * 0.6, ang: rnd() * 6.28 });
    n++;
  }
  // cada item vira formas de cena já prontas
  const formas = [];   // [cor, pts]
  const elip = (cx, cy, rx, ry, n2 = 12) => {
    const o = [];
    for (let i = 0; i < n2; i++) { const a = i / n2 * 6.283; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return o;
  };
  for (const it of itens) {
    const [px, py] = _P(it.x, it.y), s = it.s;
    const sombra = (rx, ry) => formas.push([[150, 160, 188, 90], elip(px - rx * 0.35, py + ry * 0.25, rx, ry)]);
    if (it.tipo === 'arbusto') {
      sombra(11 * s, 4 * s);
      const g = rnd() < 0.5 ? [52, 98, 92] : [70, 112, 84];
      for (const [dx, dy, r] of [[-5, -3, 5], [4, -3, 5.5], [0, -6, 5.5], [-1, -1, 4]]) {
        formas.push([g, elip(px + dx * s, py + dy * s, r * s, r * 0.8 * s, 10)]);
      }
      for (const [dx, dy, r] of [[-5, -6, 3.6], [4, -6.5, 4], [0, -9.5, 3.6]]) {
        formas.push([C.NEVE_SOMBRA, elip(px + dx * s, py + dy * s + 0.8 * s, r * s, r * 0.55 * s, 10)]);
        formas.push([C.NEVE_CLARA, elip(px + dx * s + 0.6 * s, py + dy * s, r * 0.82 * s, r * 0.45 * s, 10)]);
      }
    } else if (it.tipo === 'pedra') {
      sombra(10 * s, 3.6 * s);
      const w = 8 * s, h = 6 * s;
      formas.push([[104, 112, 128], [[px - w, py], [px - w * 0.7, py - h], [px + w * 0.1, py - h * 1.25], [px + w * 0.85, py - h * 0.6], [px + w, py], [px, py + h * 0.35]]]);
      formas.push([[138, 146, 162], [[px + w * 0.1, py - h * 1.25], [px + w * 0.85, py - h * 0.6], [px + w, py], [px + w * 0.15, py + h * 0.1]]]);
      formas.push([C.NEVE_CLARA, [[px - w * 0.75, py - h * 0.85], [px - w * 0.1, py - h * 1.35], [px + w * 0.75, py - h * 0.75], [px + w * 0.2, py - h * 0.55], [px - w * 0.3, py - h * 0.6]]]);
    } else if (it.tipo === 'toco') {
      sombra(8 * s, 3 * s);
      const r = 4.5 * s;
      formas.push([[96, 66, 46], [[px - r, py - 7 * s], [px - r, py], [px + r, py], [px + r, py - 7 * s]]]);
      formas.push([[96, 66, 46], elip(px, py, r, r * 0.45)]);
      formas.push([[198, 160, 112], elip(px, py - 7 * s, r, r * 0.45)]);
      formas.push([[160, 120, 80], elip(px, py - 7 * s, r * 0.55, r * 0.25)]);
      formas.push([C.NEVE_CLARA, elip(px - r * 0.25, py - 7.6 * s, r * 0.6, r * 0.3)]);
      formas.push([C.NEVE_CLARA, elip(px, py + 0.6 * s, r * 1.5, r * 0.45)]);
    } else if (it.tipo === 'galho') {
      const a = it.ang || 0, L = 12 * s;
      const dx = Math.cos(a) * L, dy = Math.sin(a) * L * 0.5;
      const t = 1.4 * s;
      formas.push([[150, 160, 188, 80], [[px - dx + 2, py - dy + 2], [px + dx + 2, py + dy + 2], [px + dx + 2, py + dy + 2 + t], [px - dx + 2, py - dy + 2 + t]]]);
      formas.push([[104, 72, 50], [[px - dx, py - dy - t], [px + dx, py + dy - t], [px + dx, py + dy + t], [px - dx, py - dy + t]]]);
      formas.push([[104, 72, 50], [[px + dx * 0.2, py + dy * 0.2], [px + dx * 0.2 + 4 * s, py + dy * 0.2 - 5 * s], [px + dx * 0.2 + 5 * s, py + dy * 0.2 - 4 * s], [px + dx * 0.2 + 1.5 * s, py + dy * 0.2 + 0.5]]]);
      formas.push([C.NEVE_CLARA, [[px - dx * 0.8, py - dy * 0.8 - t * 1.6], [px + dx * 0.6, py + dy * 0.6 - t * 1.6], [px + dx * 0.6, py + dy * 0.6 - t * 0.6], [px - dx * 0.8, py - dy * 0.8 - t * 0.6]]]);
    } else if (it.tipo === 'capim') {
      for (let k = 0; k < 6; k++) {
        const bx = px + (k - 2.5) * 2.2 * s + (rnd() - 0.5) * 2, h = (4 + rnd() * 5) * s, inc = (rnd() - 0.5) * 4 * s;
        formas.push([rnd() < 0.5 ? [112, 122, 96] : [140, 132, 96], [[bx - 0.7 * s, py], [bx + inc, py - h], [bx + 0.7 * s, py]]]);
      }
      formas.push([C.NEVE_SOMBRA, elip(px, py + 0.5 * s, 8 * s, 2 * s)]);
    } else if (it.tipo === 'rastro') {
      // pegadinhas de coelho atravessando a neve
      const a = it.ang || 0;
      for (let k = 0; k < 9; k++) {
        const t = (k - 4) * 0.42;
        const x = it.x + Math.cos(a) * t, y = it.y + Math.sin(a) * t;
        if (!ok(x, y)) continue;
        const [qx, qy] = _P(x, y);
        formas.push([[192, 200, 220], elip(qx - 2, qy, 1.5, 1, 6)]);
        formas.push([[192, 200, 220], elip(qx + 2, qy + 1, 1.5, 1, 6)]);
        if (k % 2) formas.push([[192, 200, 220], elip(qx + 0.5, qy - 3, 1.2, 0.8, 6)]);
      }
    }
  }
  _cache_chao = formas;
  return formas;
}

export function chao(surf, T) {
  for (const [cor, pts] of _formas_chao()) poligono(surf, cor, T(pts));
}
