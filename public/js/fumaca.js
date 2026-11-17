// fumaca.js — FUMAÇA VOLUMÉTRICA (utilização dos gráficos).
//
// Só enfeite, por cima do que já existe (fx.js continua igual):
//
//  * cada nuvem é uma textura pronta que parece ter volume: várias bolhas
//    sobrepostas ("couve-flor"), luz vindo de cima à esquerda, a base mais
//    escura (sombra própria) e a borda macia. Várias variações e tons;
//  * EXPLOSÃO: bola de fogo que vira fumaça + um CONE de nuvens subindo
//    (desaceleram lá em cima e abrem como um chapéu) + saia de poeira de neve
//    correndo pelo chão + fumaça que fica pairando;
//  * QUEIMADAS (fogo no chão, chão queimado ainda quente, base muito
//    danificada): coluna de fumaça escura subindo para o céu, alargando e
//    inclinando com o vento;
//  * desempenho: arrays fixos, texturas guardadas, nada nasce fora da tela e
//    a quantidade obedece ao governador do fx.js.
import * as C from './config.js';
import * as iso from './iso.js';
import * as pg from './pg.js';

const MAX = 520;                 // nuvens vivas no máximo
const HW = iso.HW, HH = iso.HH, ZH = C.ZH;
const S = 96;                    // tamanho das texturas (px)
const VARIACOES = 5;
const VENTO_X = 0.30, VENTO_Y = -0.14;   // deriva lá no alto (unidades do mundo por segundo)

// tons: luz (lado iluminado) e sombra (base)
const ESCURA = 0, CINZA = 1, CLARA = 2, QUENTE = 3, FIAPO = 4;
const TONS = [
  { luz: [104, 102, 104], sombra: [34, 34, 40] },     // fumaça preta de queimada
  { luz: [168, 166, 168], sombra: [72, 74, 84] },     // fumaça de explosão
  { luz: [246, 248, 252], sombra: [170, 180, 198] },  // poeira de neve
  { luz: [255, 236, 160], sombra: [214, 84, 28] },    // bola de fogo
  { luz: [206, 204, 206], sombra: [112, 114, 124] },  // fiapo do chão queimado
];

let _s = 0x2545f491;
function rnd() { _s ^= _s << 13; _s >>>= 0; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0; return _s / 4294967296; }
const ent = (a, b) => a + rnd() * (b - a);
const mistura = (a, b, k) => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];

function _textura(tom, semente) {
  // uma nuvem "couve-flor" com volume, numa superfície S x S
  let s = (semente * 2654435761) >>> 0 || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const { luz, sombra } = TONS[tom];
  const ctx = pg.superficie(S, S);
  const c = S / 2;
  // bolhas: as de baixo primeiro (as de cima ficam por cima e pegam a luz)
  const bolhas = [];
  const nb = 7 + Math.floor(r() * 4);
  for (let i = 0; i < nb; i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * S * 0.2;
    const rr = S * (0.15 + r() * 0.13) * (1 - d / (S * 0.5));
    bolhas.push([c + Math.cos(a) * d, c + Math.sin(a) * d * 0.8 + S * 0.02, rr]);
  }
  bolhas.push([c, c, S * 0.27]);
  bolhas.sort((p, q) => q[1] - p[1]);
  for (const [bx, by, br] of bolhas) {
    const g = ctx.createRadialGradient(bx - br * 0.38, by - br * 0.45, br * 0.05, bx, by, br);
    const meio = mistura(luz, sombra, 0.45);
    g.addColorStop(0, `rgba(${luz[0]},${luz[1]},${luz[2]},1)`);
    g.addColorStop(0.5, `rgba(${meio[0]},${meio[1]},${meio[2]},0.97)`);
    g.addColorStop(0.78, `rgba(${sombra[0]},${sombra[1]},${sombra[2]},0.8)`);
    g.addColorStop(1, `rgba(${sombra[0]},${sombra[1]},${sombra[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.2832); ctx.fill();
  }
  // sombra própria: a parte de baixo da nuvem mais escura
  ctx.globalCompositeOperation = 'source-atop';
  const gb = ctx.createLinearGradient(0, S * 0.3, 0, S * 0.85);
  gb.addColorStop(0, `rgba(${sombra[0]},${sombra[1]},${sombra[2]},0)`);
  gb.addColorStop(1, `rgba(${sombra[0]},${sombra[1]},${sombra[2]},${tom === QUENTE ? 0.35 : 0.55})`);
  ctx.fillStyle = gb; ctx.fillRect(0, 0, S, S);
  // brilho da borda de cima (luz do céu)
  const gl = ctx.createRadialGradient(c - S * 0.14, c - S * 0.2, 0, c - S * 0.14, c - S * 0.2, S * 0.36);
  gl.addColorStop(0, `rgba(255,255,255,${tom === ESCURA ? 0.16 : 0.24})`);
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl; ctx.fillRect(0, 0, S, S);
  // contorno esfumaçado: a nuvem inteira some macio na borda
  ctx.globalCompositeOperation = 'destination-in';
  const gf = ctx.createRadialGradient(c, c, S * 0.2, c, c, S * 0.5);
  gf.addColorStop(0, 'rgba(0,0,0,1)');
  gf.addColorStop(0.7, 'rgba(0,0,0,0.85)');
  gf.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gf; ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  return ctx.canvas;
}

export class Fumaca {
  constructor() {
    this.n = 0;
    this.x = new Float32Array(MAX); this.y = new Float32Array(MAX); this.z = new Float32Array(MAX);
    this.vx = new Float32Array(MAX); this.vy = new Float32Array(MAX); this.vz = new Float32Array(MAX);
    this.idade = new Float32Array(MAX); this.dur = new Float32Array(MAX);
    this.r0 = new Float32Array(MAX); this.r1 = new Float32Array(MAX);
    this.alfa = new Float32Array(MAX); this.empuxo = new Float32Array(MAX); this.arr = new Float32Array(MAX);
    this.quente = new Float32Array(MAX);    // 0..1: brilho de fogo por baixo no começo
    this.tom = new Uint8Array(MAX); this.var = new Uint8Array(MAX); this.vira = new Uint8Array(MAX);
    this._tex = null;
    this._ordem = new Uint16Array(MAX);
    this._marcas = new WeakMap();
    this.escala = 1.0;
    this._z = 1; this._ox = 0; this._oy = 0; this._vw = 1; this._vh = 1;
  }

  _texturas() {
    if (!this._tex) {
      this._tex = [];
      for (let t = 0; t < TONS.length; t++) {
        const lista = [];
        for (let v = 0; v < VARIACOES; v++) lista.push(_textura(t, t * 31 + v * 7 + 3));
        this._tex.push(lista);
      }
    }
    return this._tex;
  }

  limpar() { this.n = 0; this._marcas = new WeakMap(); }

  _na_tela(x, y, folga = 220) {
    const px = (x - y) * HW * this._z + this._ox, py = (x + y) * HH * this._z + this._oy;
    return px > -folga && px < this._vw + folga && py > -folga && py < this._vh + folga * 2;
  }

  _quantos(n) {
    const q = n * this.escala;
    return Math.floor(q) + (rnd() < q - Math.floor(q) ? 1 : 0);
  }

  // nuvem nova. atraso: começa com idade negativa (aparece depois)
  _add(tom, x, y, z, vx, vy, vz, dur, r0, r1, alfa, empuxo, arr, quente = 0, atraso = 0) {
    if (this.n >= MAX * Math.max(0.35, this.escala)) return;
    const i = this.n++;
    this.tom[i] = tom; this.var[i] = Math.floor(rnd() * VARIACOES); this.vira[i] = rnd() < 0.5 ? 1 : 0;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.idade[i] = -atraso; this.dur[i] = dur; this.r0[i] = r0; this.r1[i] = r1;
    this.alfa[i] = alfa; this.empuxo[i] = empuxo; this.arr[i] = arr; this.quente[i] = quente;
  }

  // ---------- quem cria fumaça ------------------------------------------
  explosao(x, y, e) {
    // o cone de fumaça da explosão
    e = Math.max(0.6, Math.min(2.6, e));
    // 1) bola de fogo: sobe rápido e apaga em fumaça
    let n = this._quantos(4 * e);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, d = ent(0, 0.5) * e;
      this._add(QUENTE, x + Math.cos(a) * d, y + Math.sin(a) * d, ent(0.3, 1.0), Math.cos(a) * 0.6, Math.sin(a) * 0.6, ent(2.5, 4.5) * Math.sqrt(e),
        ent(0.45, 0.7), ent(14, 20) * e, ent(32, 44) * e, 0.95, 0, 2.5);
    }
    // 2) o CONE: nuvens lançadas para cima num cone estreito; o arrasto as
    //    segura lá no alto e elas abrem em chapéu
    n = this._quantos(13 * e);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, abre = ent(0, 0.42);           // ~25° em volta da vertical
      const v = ent(3.5, 7.5) * Math.sqrt(e);
      const vz = v * Math.cos(abre), vh = v * Math.sin(abre);
      this._add(k % 3 === 0 ? ESCURA : CINZA, x + ent(-0.3, 0.3), y + ent(-0.3, 0.3), ent(0.4, 1.0),
        Math.cos(a) * vh, Math.sin(a) * vh, vz, ent(3.4, 5.6) * Math.sqrt(e), ent(13, 18) * e, ent(44, 64) * e,
        ent(0.62, 0.86), 0.18, 1.35, 1.0, ent(0.02, 0.12));
    }
    // 3) saia de poeira de neve correndo rente ao chão
    n = this._quantos(9 * e);
    for (let k = 0; k < n; k++) {
      const a = (k / Math.max(1, n)) * 6.283 + ent(-0.2, 0.2), v = ent(2.5, 4.5) * e;
      this._add(CLARA, x, y, ent(0.15, 0.4), Math.cos(a) * v, Math.sin(a) * v, ent(0.1, 0.4), ent(1.6, 2.6), ent(12, 16) * e, ent(34, 46) * e,
        ent(0.55, 0.75), 0.05, 2.4);
    }
    // 4) o que fica pairando e subindo devagar depois
    n = this._quantos(3 * e);
    for (let k = 0; k < n; k++) {
      this._add(CINZA, x + ent(-0.6, 0.6), y + ent(-0.6, 0.6), ent(1.5, 3.0) * e, ent(-0.2, 0.2), ent(-0.2, 0.2), ent(0.4, 0.8),
        ent(5, 7), ent(28, 38) * e, ent(56, 76) * e, 0.45, 0.12, 0.5, 0, ent(0.5, 1.2));
    }
  }

  queimada(x, y, forca, dt, escura = true) {
    // coluna subindo para o céu (fogo no chão, base em chamas)
    if (rnd() > (escura ? 3.2 : 1.4) * dt * forca * this.escala) return;
    this._add(escura ? ESCURA : FIAPO, x + ent(-0.25, 0.25), y + ent(-0.25, 0.25), ent(0.3, 0.7),
      ent(-0.15, 0.15), ent(-0.15, 0.15), ent(1.0, 1.6), ent(4.5, 6.5), (escura ? ent(9, 13) : ent(6, 9)) * (0.7 + 0.3 * forca),
      (escura ? ent(40, 56) : ent(26, 36)) * (0.6 + 0.4 * forca),
      (escura ? ent(0.5, 0.68) : ent(0.24, 0.36)) * Math.min(1, forca + 0.2), 0.35, 0.35, escura && rnd() < 0.35 ? 0.6 : 0);
  }

  // ---------- passo -----------------------------------------------------
  passo(dt, T) {
    // chão queimado ainda quente solta fiapos
    const ma = T.marcas;
    if (ma) {
      for (let i = 0; i < ma.length; i++) {
        const m = ma[i];
        const idade = m[2];                  // 0..1 (o chão queimado dura ~9 s)
        if (idade > 0.92 || !this._na_tela(m[0], m[1])) continue;
        this.queimada(m[0], m[1], Math.max(0.15, 1 - idade), dt, false);
      }
    }
    let i = 0;
    while (i < this.n) {
      this.idade[i] += dt;
      if (this.idade[i] >= this.dur[i]) {
        const u = --this.n;
        if (i !== u) this._copiar(u, i);
        continue;
      }
      if (this.idade[i] < 0) { i++; continue; }   // ainda não apareceu
      const arr = this.arr[i];
      if (arr) {
        const f = Math.max(0, 1 - arr * dt);
        this.vx[i] *= f; this.vy[i] *= f; this.vz[i] *= f;
      }
      this.vz[i] += this.empuxo[i] * dt;         // ar quente sobe
      const alto = Math.min(1, this.z[i] / 4);    // lá em cima o vento leva
      this.x[i] += (this.vx[i] + VENTO_X * alto) * dt;
      this.y[i] += (this.vy[i] + VENTO_Y * alto) * dt;
      this.z[i] += this.vz[i] * dt;
      if (this.z[i] < 0.05) { this.z[i] = 0.05; if (this.vz[i] < 0) this.vz[i] = 0; }
      i++;
    }
  }

  _copiar(de, p) {
    this.tom[p] = this.tom[de]; this.var[p] = this.var[de]; this.vira[p] = this.vira[de];
    this.x[p] = this.x[de]; this.y[p] = this.y[de]; this.z[p] = this.z[de];
    this.vx[p] = this.vx[de]; this.vy[p] = this.vy[de]; this.vz[p] = this.vz[de];
    this.idade[p] = this.idade[de]; this.dur[p] = this.dur[de]; this.r0[p] = this.r0[de]; this.r1[p] = this.r1[de];
    this.alfa[p] = this.alfa[de]; this.empuxo[p] = this.empuxo[de]; this.arr[p] = this.arr[de]; this.quente[p] = this.quente[de];
  }

  // ---------- desenho ---------------------------------------------------
  sombra(tela) {
    // sombra macia no chão embaixo das nuvens grandes e baixas
    const z = this._z, ox = this._ox, oy = this._oy, kx = HW * z, ky = HH * z;
    let tem = false;
    tela.fillStyle = 'rgba(60,72,110,0.06)';
    tela.beginPath();
    for (let i = 0; i < this.n; i++) {
      if (this.idade[i] < 0 || this.z[i] > 6 || this.tom[i] === QUENTE || this.tom[i] === FIAPO) continue;
      const u = this.idade[i] / this.dur[i];
      const r = (this.r0[i] + (this.r1[i] - this.r0[i]) * (1 - (1 - u) * (1 - u))) * z * 0.55 * (1 - u);
      if (r < 3) continue;
      const px = (this.x[i] - this.y[i]) * kx + ox + this.z[i] * 6 * z, py = (this.x[i] + this.y[i]) * ky + oy;
      if (px < -r || px > this._vw + r || py < -r || py > this._vh + r) continue;
      tela.moveTo(px + r, py);
      tela.ellipse(px, py, r, r * 0.45, 0, 0, 6.2832);
      tem = true;
    }
    if (tem) tela.fill();
  }

  desenhar(tela) {
    if (!this.n) return;
    const tex = this._texturas();
    const z = this._z, ox = this._ox, oy = this._oy, kx = HW * z, ky = HH * z, kz = ZH * z;
    const W = this._vw, A = this._vh;
    // de trás para a frente: as mais velhas (lá no alto, maiores) primeiro
    const ord = this._ordem;
    let m = 0;
    for (let i = 0; i < this.n; i++) if (this.idade[i] >= 0) ord[m++] = i;
    for (let a = 1; a < m; a++) {   // inserção (a lista já vem quase em ordem)
      const v = ord[a], k = this.idade[v] / this.dur[v];
      let b = a - 1;
      while (b >= 0 && this.idade[ord[b]] / this.dur[ord[b]] < k) { ord[b + 1] = ord[b]; b--; }
      ord[b + 1] = v;
    }
    for (let q = 0; q < m; q++) {
      const i = ord[q];
      const u = this.idade[i] / this.dur[i];
      const r = (this.r0[i] + (this.r1[i] - this.r0[i]) * (1 - (1 - u) * (1 - u))) * z;
      const px = (this.x[i] - this.y[i]) * kx + ox, py = (this.x[i] + this.y[i]) * ky - this.z[i] * kz + oy;
      if (px + r < 0 || px - r > W || py + r < 0 || py - r > A) continue;
      // entra macio, some devagar no fim
      const a = this.alfa[i] * Math.min(1, u * 9) * (u > 0.45 ? 1 - (u - 0.45) / 0.55 : 1);
      if (a < 0.015) continue;
      const lado = 2 * r * 1.12;
      const img = tex[this.tom[i]][this.var[i]];
      tela.globalAlpha = a;
      if (this.vira[i]) {
        tela.save();
        tela.translate(px, py); tela.scale(-1, 1);
        tela.drawImage(img, -lado / 2, -lado / 2, lado, lado);
        tela.restore();
      } else {
        tela.drawImage(img, px - lado / 2, py - lado / 2, lado, lado);
      }
      // brilho de fogo por baixo da nuvem nova (vai apagando)
      const qn = this.quente[i] * (1 - Math.min(1, u / 0.18));
      if (qn > 0.03 && this.tom[i] !== QUENTE) {
        tela.globalAlpha = a * qn * 0.85;
        tela.drawImage(tex[QUENTE][this.var[i]], px - lado / 2, py - lado / 2 + lado * 0.06, lado, lado);
      }
    }
    tela.globalAlpha = 1;
  }
}
