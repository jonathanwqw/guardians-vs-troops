// fx.js — efeitos visuais EXTRAS: partículas, luz, sombra e sons de reação.
//
// É só enfeite: não muda nenhuma regra. A cada quadro olha o estado da
// batalha (o MESMO que a cena desenha: tiros, granadas, explosões, fogo,
// quedas, bases, tropas andando...) e reage com partículas, luz e som.
// Por isso funciona igual no solo, no multiplayer e na batalha do fundo do
// menu, sem mandar nada a mais pela rede.
//
// Desempenho (o jogo acabou de ser otimizado, isto não pode estragar):
//   * todas as partículas vivem em arrays numéricos fixos (sem lixo por quadro)
//   * nada nasce fora da tela; tudo fora da tela não é desenhado
//   * imagens prontas (fumaça, brasa, luz) guardadas por tamanho e cor
//   * "governador": se os quadros ficarem lentos, solta menos partículas
//     sozinho; quando voltar a ficar liso, volta ao normal
//   * aleatoriedade própria (não mexe na sorte usada pelas regras)
import * as C from './config.js';
import * as iso from './iso.js';
import * as pg from './pg.js';
import * as M from './mapa.js';
import * as treino from './treino.js';
import { Fumaca } from './fumaca.js';
import { Destrocos } from './destrocos.js';

const MAX = 1600;               // partículas vivas no máximo
const MAX_LUZES = 96;           // luzes por quadro
const HW = iso.HW, HH = iso.HH, ZH = C.ZH;

// tipos de partícula
const FUMACA = 0, BRASA = 1, DETRITO = 2, NEVE = 3, CARTUCHO = 4, ANEL = 5, BRILHO = 6, POEIRA = 7;

// paleta (índice -> cor)
const PALETA = [
  [123, 132, 148],   // 0 fumaça cinza
  [70, 76, 90],      // 1 fumaça escura
  [236, 240, 247],   // 2 neve
  [250, 200, 70],    // 3 brasa amarela
  [236, 110, 40],    // 4 brasa laranja
  [96, 86, 74],      // 5 terra
  [150, 158, 172],   // 6 concreto
  [214, 170, 64],    // 7 latão (cartucho)
  [255, 236, 150],   // 8 brilho dourado
  [196, 204, 218],   // 9 fumaça clara
  [58, 62, 72],      // 10 metal escuro
  [255, 250, 230],   // 11 faísca branca
];
// luz: cores
const LUZ_FOGO = 0, LUZ_CLARAO = 1, LUZ_BRASA = 2;
const COR_LUZ = [[255, 140, 50], [255, 214, 140], [255, 110, 30]];

// aleatoriedade própria (xorshift)
let _s = 0x9e3779b9;
function rnd() {
  _s ^= _s << 13; _s >>>= 0;
  _s ^= _s >>> 17;
  _s ^= _s << 5; _s >>>= 0;
  return _s / 4294967296;
}
const ent = (a, b) => a + rnd() * (b - a);

export class Fx {
  constructor() {
    this.som = null;            // a partida liga (o fundo do menu fica mudo)
    // partículas (estrutura de arrays)
    this.n = 0;
    this.x = new Float32Array(MAX); this.y = new Float32Array(MAX); this.z = new Float32Array(MAX);
    this.vx = new Float32Array(MAX); this.vy = new Float32Array(MAX); this.vz = new Float32Array(MAX);
    this.idade = new Float32Array(MAX); this.dur = new Float32Array(MAX);
    this.t0 = new Float32Array(MAX); this.t1 = new Float32Array(MAX);   // tamanho inicial/final (px a zoom 1)
    this.g = new Float32Array(MAX); this.arr = new Float32Array(MAX);   // gravidade / arrasto
    this.giro = new Float32Array(MAX); this.alfa = new Float32Array(MAX);
    this.tipo = new Uint8Array(MAX); this.cor = new Uint8Array(MAX); this.quica = new Uint8Array(MAX);
    // luzes do quadro: x, y, z, raio(px zoom 1), cor, força
    this.nl = 0;
    this.lx = new Float32Array(MAX_LUZES); this.ly = new Float32Array(MAX_LUZES); this.lz = new Float32Array(MAX_LUZES);
    this.lr = new Float32Array(MAX_LUZES); this.lc = new Uint8Array(MAX_LUZES); this.lf = new Float32Array(MAX_LUZES);
    // clarões de curta duração (tiros, disparos, explosões): [x, y, z, raio, cor, força, idade, dur]
    this.clx = new Float32Array(64); this.cly = new Float32Array(64); this.clz = new Float32Array(64);
    this.clr = new Float32Array(64); this.clc = new Uint8Array(64); this.clf = new Float32Array(64);
    this.cli = new Float32Array(64); this.cld = new Float32Array(64); this.ncl = 0;
    // o que já foi visto (para reagir só uma vez)
    this.dest = new Destrocos();   // carcaças e escombros (ficam um tempo no chão)
    this._visto = new WeakSet();
    this._impacto = new WeakSet();
    this._vida_base = new WeakMap();
    this._t = null;
    this.escala = 1.0;          // governador de quantidade (0,3 .. 1)
    this.teto = 1.0;            // teto vindo do gerente de qualidade (qualidade.js)
    this._lento = 0.0;
    // imagens prontas
    this._puffs = new Map();
    this._brilhos = new Map();
    this._luzes = new Map();
    // neve caindo (na tela): x, y (0..1), velocidade, tamanho, fase
    this.flocos = 110;
    this.fx_ = new Float32Array(this.flocos); this.fy_ = new Float32Array(this.flocos);
    this.fv_ = new Float32Array(this.flocos); this.fr_ = new Float32Array(this.flocos); this.ff_ = new Float32Array(this.flocos);
    for (let i = 0; i < this.flocos; i++) this._floco(i, true);
    this._cam_x = null; this._cam_y = null;
    this.mostrar_neve = true;   // o fundo do menu já tem a neve dele
    this._t_motor = 0; this._t_rotor = 0; this._t_brasa = 0;
    // tela atual (para não criar nada fora dela)
    this._ox = 0; this._oy = 0; this._z = 1; this._vw = 1; this._vh = 1;
    this.vol = new Fumaca();    // fumaça volumétrica (cone das explosões, colunas das queimadas)
  }

  // ---------- partículas -----------------------------------------------
  _add(tipo, x, y, z, vx, vy, vz, dur, t0, t1, cor, g = 0, arr = 0, alfa = 1) {
    if (this.n >= MAX * this.escala) return;   // teto acompanha o governador
    const i = this.n++;
    this.tipo[i] = tipo; this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.idade[i] = 0; this.dur[i] = dur; this.t0[i] = t0; this.t1[i] = t1;
    this.cor[i] = cor; this.g[i] = g; this.arr[i] = arr; this.alfa[i] = alfa;
    this.giro[i] = rnd() * 6.283; this.quica[i] = 0;
  }

  _na_tela(x, y, folga = 160) {
    const px = (x - y) * HW * this._z + this._ox, py = (x + y) * HH * this._z + this._oy;
    return px > -folga && px < this._vw + folga && py > -folga && py < this._vh + folga;
  }

  _quantos(n) {
    // quantidade ajustada pelo governador (com sorteio da sobra)
    const q = n * this.escala;
    return Math.floor(q) + (rnd() < q - Math.floor(q) ? 1 : 0);
  }

  _clarao(x, y, z, raio, cor, forca, dur) {
    if (this.ncl >= 64) return;
    const i = this.ncl++;
    this.clx[i] = x; this.cly[i] = y; this.clz[i] = z; this.clr[i] = raio; this.clc[i] = cor;
    this.clf[i] = forca; this.cli[i] = 0; this.cld[i] = dur;
  }

  _luz(x, y, z, raio, cor, forca) {
    if (this.nl >= MAX_LUZES || forca <= 0.02) return;
    const i = this.nl++;
    this.lx[i] = x; this.ly[i] = y; this.lz[i] = z; this.lr[i] = raio; this.lc[i] = cor; this.lf[i] = forca;
  }

  _tocar(nome, x, y, vol = 1.0) {
    if (this.som && this.som.tocar) this.som.tocar(nome, x, y, vol, true);
  }

  // ---------- receitas -------------------------------------------------
  tiro(x0, y0, z0, x1, y1) {
    // boca do fuzil: faíscas para a frente, fiapo de fumaça e o cartucho voando de lado
    const dx = x1 - x0, dy = y1 - y0, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const fx = dx / d, fy = dy / d;
    const n = this._quantos(3);
    for (let k = 0; k < n; k++) {
      const v = ent(2.5, 5.5), la = ent(-0.8, 0.8);
      this._add(BRASA, x0 + fx * 0.25, y0 + fy * 0.25, z0, fx * v - fy * la, fy * v + fx * la, ent(-0.3, 0.9), ent(0.08, 0.16), 2, 1, 11, 0, 3);
    }
    if (rnd() < 0.6 * this.escala) this._add(FUMACA, x0 + fx * 0.3, y0 + fy * 0.3, z0, fx * 0.6, fy * 0.6, 0.5, ent(0.35, 0.6), 2.5, 7, 9, 0, 1.6, 0.55);
    if (rnd() < 0.35 * this.escala) {   // cartucho sai pela direita da arma
      this._add(CARTUCHO, x0, y0, z0, -fy * ent(0.9, 1.6), fx * ent(0.9, 1.6), ent(1.4, 2.2), ent(1.2, 2.0), 2, 2, 7, 9.0, 0.4);
      this.quica[this.n - 1] = 1;
    }
    this._clarao(x0 + fx * 0.3, y0 + fy * 0.3, z0, 26, LUZ_CLARAO, 0.55, 0.07);
    if (rnd() < 0.18) this._tocar('cartucho', x0, y0, 0.35);
  }

  impacto_neve(x, y) {
    const n = this._quantos(4);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, v = ent(0.4, 1.4);
      this._add(NEVE, x, y, 0.05, Math.cos(a) * v, Math.sin(a) * v, ent(1.0, 2.2), ent(0.35, 0.6), 2.2, 1.2, 2, 7.5, 1.2);
    }
    if (rnd() < 0.5 * this.escala) this._add(POEIRA, x, y, 0.05, 0, 0, 0.25, 0.45, 3, 9, 2, 0, 2, 0.7);
  }

  impacto_duro(x, y, z, concreto) {
    // bala batendo em prédio ou blindagem: faíscas brancas + pó
    const n = this._quantos(6);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, v = ent(1.5, 4.5);
      this._add(BRASA, x, y, z, Math.cos(a) * v, Math.sin(a) * v, ent(0.5, 3.0), ent(0.12, 0.3), 2, 1, k % 2 ? 3 : 11, 7, 1.5);
    }
    if (concreto) {
      const m = this._quantos(3);
      for (let k = 0; k < m; k++) {
        const a = rnd() * 6.283, v = ent(0.6, 1.8);
        this._add(DETRITO, x, y, z, Math.cos(a) * v, Math.sin(a) * v, ent(0.8, 2.0), ent(1.0, 1.8), 3, 3, 6, 9.0, 0.3);
        this.quica[this.n - 1] = 1;
      }
      this._add(POEIRA, x, y, z, 0, 0, 0.3, 0.6, 4, 12, 6, 0, 1.5, 0.6);
    }
    this._clarao(x, y, z, 18, LUZ_CLARAO, 0.5, 0.06);
    if (rnd() < 0.35) this._tocar('ricochete', x, y, 0.55);
  }

  explosao(x, y, esc) {
    // estouro: detritos de terra e gelo, brasas, anel de choque, fumaça e um clarão forte
    const e = Math.max(0.6, esc);
    let n = this._quantos(8 * e);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, v = ent(1.5, 4.0) * e;
      this._add(DETRITO, x, y, 0.2, Math.cos(a) * v, Math.sin(a) * v, ent(3, 6.5) * Math.sqrt(e), ent(1.3, 2.4), ent(2.5, 4.5), 3, k % 4 ? 5 : 10, 9.5, 0.2);
      this.quica[this.n - 1] = 1;
    }
    n = this._quantos(14 * e);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, v = ent(1, 3.5) * e;
      this._add(NEVE, x, y, 0.2, Math.cos(a) * v, Math.sin(a) * v, ent(2.5, 5.5), ent(0.8, 1.5), ent(2, 3.5), 1.5, 2, 9.0, 0.6);
    }
    n = this._quantos(12 * e);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, v = ent(1.5, 5) * e;
      this._add(BRASA, x, y, 0.4, Math.cos(a) * v, Math.sin(a) * v, ent(2, 6), ent(0.5, 1.2), 2.5, 1, k % 2 ? 3 : 4, 6.0, 0.8);
    }
    n = this._quantos(5 * e);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, v = ent(0.2, 0.9);
      this._add(FUMACA, x + Math.cos(a) * 0.4, y + Math.sin(a) * 0.4, ent(0.3, 1.2), Math.cos(a) * v, Math.sin(a) * v, ent(0.6, 1.3),
        ent(1.6, 2.8), ent(6, 10) * e, ent(16, 26) * e, k % 2 ? 1 : 0, 0, 0.9, 0.7);
    }
    this._add(ANEL, x, y, 0.02, 0, 0, 0, 0.45, 6 * e, 46 * e, 2, 0, 0, 0.9);
    this._add(POEIRA, x, y, 0.05, 0, 0, 0.1, 1.2, 10 * e, 34 * e, 9, 0, 0, 0.4);
    this._clarao(x, y, 0.6, 120 * e, LUZ_FOGO, 1.0, 0.45);
    this._clarao(x, y, 0.6, 60 * e, LUZ_CLARAO, 0.9, 0.16);
    this.vol.explosao(x, y, e);   // o cone de fumaça volumétrica
    this._tocar('estilhaco', x, y, 0.7);
    if (e >= 1.4) this._tocar('eco', x, y, 0.8);
    else if (rnd() < 0.35) this._tocar('gelo', x, y, 0.6);
  }

  queda(x, y) {
    // soldado caindo na neve: baforada branca
    const n = this._quantos(5);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, v = ent(0.3, 1.0);
      this._add(NEVE, x, y, 0.1, Math.cos(a) * v, Math.sin(a) * v, ent(0.8, 1.6), ent(0.4, 0.7), 2, 1, 2, 7.5, 1.0);
    }
    this._add(POEIRA, x, y, 0.05, 0, 0, 0.15, 0.6, 3, 10, 2, 0, 1, 0.75);
    if (rnd() < 0.5) this._tocar('neve_fofa', x, y, 0.6);
  }

  disparo_grande(x, y, z, fx, fy, forte) {
    // boca do canhão / lançador: bola de fumaça para a frente e clarão
    const n = this._quantos(forte ? 9 : 6);
    for (let k = 0; k < n; k++) {
      const v = ent(0.6, 2.4), la = ent(-0.9, 0.9);
      this._add(FUMACA, x, y, z, fx * v - fy * la, fy * v + fx * la, ent(0.2, 0.7), ent(0.8, 1.5), 5, ent(12, 18), k % 3 ? 9 : 0, 0, 1.4, 0.8);
    }
    const m = this._quantos(6);
    for (let k = 0; k < m; k++) {
      const v = ent(3, 7), la = ent(-1, 1);
      this._add(BRASA, x, y, z, fx * v - fy * la, fy * v + fx * la, ent(0, 1.5), ent(0.12, 0.25), 2.5, 1, 3, 0, 2);
    }
    this._clarao(x, y, z, forte ? 80 : 60, LUZ_CLARAO, 0.9, 0.12);
  }

  moedas(x, y) {
    const n = this._quantos(8);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, v = ent(0.3, 1.2);
      this._add(BRILHO, x, y, ent(0.6, 1.4), Math.cos(a) * v, Math.sin(a) * v, ent(0.8, 2.0), ent(0.5, 0.9), ent(4, 7), 1, 8, 0, 1.2);
    }
    this._tocar('brilho', x, y, 0.5);
  }

  // ---------- observar a batalha ---------------------------------------
  _observar(T, dt) {
    const v = this._visto;
    // tiros (traçantes): nascimento = boca da arma; fim = impacto
    const tr = T.tracos;
    for (let i = 0; i < tr.length; i++) {
      const o = tr[i];
      if (!v.has(o)) {
        v.add(o);
        if (o.t < 0.3 && this._na_tela(o.x0, o.y0)) this.tiro(o.x0, o.y0, o.z0, o.x1, o.y1);
      }
      if (o.t >= 0.86 && !this._impacto.has(o)) {
        this._impacto.add(o);
        if (this._na_tela(o.x1, o.y1)) {
          const a = o.alvo;
          if (a && a.base) this.impacto_duro(o.x1, o.y1, o.z1, true);
          else if (a && a.tipo === 'tanque') this.impacto_duro(o.x1, o.y1, 0.5, false);
          else this.impacto_neve(o.x1, o.y1);
        }
      }
    }
    // granadas no ar: fiapo de fumaça
    const gr = T.granadas;
    for (let i = 0; i < gr.length; i++) {
      const g = gr[i];
      const t = g.t;
      const x = g.x0 + (g.x1 - g.x0) * t, y = g.y0 + (g.y1 - g.y0) * t, z = 0.5 * (1 - t) + 4 * g.apice * t * (1 - t);
      if (rnd() < 10 * dt * this.escala && this._na_tela(x, y)) this._add(FUMACA, x, y, z, 0, 0, 0.2, 0.5, 2, 5, 9, 0, 1, 0.6);
    }
    // obuses: disparo na boca + rastro
    const ob = T.obuses;
    for (let i = 0; i < ob.length; i++) {
      const o = ob[i];
      if (!v.has(o)) {
        v.add(o);
        const dx = o.x1 - o.x0, dy = o.y1 - o.y0, d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (this._na_tela(o.x0, o.y0)) this.disparo_grande(o.x0, o.y0, 0.6, dx / d, dy / d, true);
      }
      const t = o.t;
      const x = o.x0 + (o.x1 - o.x0) * t, y = o.y0 + (o.y1 - o.y0) * t, z = 0.6 * (1 - t) + 0.3 * t + 2.4 * t * (1 - t);
      if (rnd() < 18 * dt * this.escala && this._na_tela(x, y)) this._add(FUMACA, x, y, z, 0, 0, 0.15, 0.6, 2.5, 6, 9, 0, 1.2, 0.55);
    }
    // foguetes: lançamento, rastro grosso de fumaça e faíscas, chama acesa
    const fo = T.foguetes;
    for (let i = 0; i < fo.length; i++) {
      const f = fo[i];
      const q = Math.min(1.0, f.t);
      const x = f.x0 + (f.x1 - f.x0) * q, y = f.y0 + (f.y1 - f.y0) * q, z = 1.0 + 5.0 * Math.sin(Math.PI * q);
      if (!v.has(f)) {
        v.add(f);
        const dx = f.x1 - f.x0, dy = f.y1 - f.y0, d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (this._na_tela(f.x0, f.y0)) this.disparo_grande(f.x0, f.y0, 1.0, -dx / d, -dy / d, false);
        this._tocar('foguete_voo', f.x0, f.y0, 0.8);
      }
      if (!this._na_tela(x, y)) continue;
      if (rnd() < 30 * dt * this.escala) this._add(FUMACA, x, y, z, ent(-0.2, 0.2), ent(-0.2, 0.2), 0.1, ent(1.0, 1.7), 3, ent(9, 13), 9, 0, 0.8, 0.75);
      if (rnd() < 20 * dt * this.escala) this._add(BRASA, x, y, z, ent(-1, 1), ent(-1, 1), ent(-1.5, 0.5), 0.25, 2, 1, 4, 3, 1);
      this._luz(x, y, z, 46, LUZ_FOGO, 0.6);
    }
    // projéteis do helicóptero e do tanque: rastro
    const hg = T.heli_granadas;
    for (let i = 0; i < hg.length; i++) {
      const g = hg[i], q = Math.min(1, g.t);
      const x = g.x0 + (g.x1 - g.x0) * q, y = g.y0 + (g.y1 - g.y0) * q, h = C.ALT_HELI * (1 - q) + 0.3 * q;
      if (rnd() < 16 * dt * this.escala && this._na_tela(x, y)) this._add(FUMACA, x, y, h, 0, 0, 0.1, 0.5, 2, 5, 0, 0, 1, 0.6);
    }
    const tt = T.tanque_tiros;
    for (let i = 0; i < tt.length; i++) {
      const o = tt[i];
      if (!v.has(o)) { v.add(o); if (this._na_tela(o.x0, o.y0)) this._clarao(o.x0, o.y0, 0.9, 90, LUZ_CLARAO, 1.0, 0.14); }
    }
    // explosões
    const ex = T.explosoes;
    for (let i = 0; i < ex.length; i++) {
      const e = ex[i];
      if (!v.has(e)) {
        v.add(e);
        if (e[2] < 0.3 && this._na_tela(e[0], e[1], 260)) this.explosao(e[0], e[1], e[4] || 1.0);
      }
    }
    // fogo no chão: brasas subindo, fumaça e luz tremendo
    const fg = T.fogos;
    let fogo_perto = null;
    for (let i = 0; i < fg.length; i++) {
      const f = fg[i];
      const k = Math.min(1.0, f[2] / 0.15) * Math.min(1.0, (f[3] - f[2]) / 0.5);
      if (k < 0.08 || !this._na_tela(f[0], f[1])) continue;
      fogo_perto = f;
      if (rnd() < 7 * dt * this.escala * k) this._add(BRASA, f[0] + ent(-0.2, 0.2), f[1] + ent(-0.2, 0.2), 0.3, ent(-0.3, 0.3), ent(-0.3, 0.3), ent(1.0, 2.2), ent(0.6, 1.2), 2, 1, rnd() < 0.5 ? 3 : 4, -0.4, 0.5);
      if (rnd() < 2.5 * dt * this.escala * k) this._add(FUMACA, f[0], f[1], 0.6, ent(0.1, 0.3), ent(-0.1, 0.1), ent(0.6, 1.0), ent(1.4, 2.2), 3, ent(10, 15), 1, 0, 0.4, 0.5);
      this._luz(f[0], f[1], 0.4, 40 * (f[5] || 1), LUZ_BRASA, (0.45 + 0.15 * Math.sin(this._t * 19 + i)) * k);
      this.vol.queimada(f[0], f[1], k * Math.min(1.2, f[5] || 1), dt, true);   // coluna subindo para o céu
    }
    this._t_brasa -= dt;
    if (fogo_perto && this._t_brasa <= 0) { this._t_brasa = ent(0.35, 0.8); this._tocar('brasa', fogo_perto[0], fogo_perto[1], 0.6); }
    // soldados caindo
    const ca = T.caidos;
    for (let i = 0; i < ca.length; i++) {
      const s = ca[i];
      if (!v.has(s)) { v.add(s); if (this._na_tela(s.x, s.y)) this.queda(s.x, s.y); }
    }
    // moedas ganhas
    const fl = T.flutuantes;
    for (let i = 0; i < fl.length; i++) {
      const f = fl[i];
      if (!v.has(f)) { v.add(f); if (f[3] < 0.3 && this._na_tela(f[0], f[1])) this.moedas(f[0], f[1]); }
    }
    // helicóptero descendo tropa: anel de neve no chão
    const de = T.desembarques;
    for (let i = 0; i < de.length; i++) {
      const d = de[i];
      if (!v.has(d)) { v.add(d); if (this._na_tela(d[0], d[1])) this._sopro_rotor(d[0], d[1], 3); }
    }
    // tropas andando (neve chutada), tanques (neve das esteiras + motor), helicópteros (vento do rotor)
    const es = T.esquadroes;
    let tanque_perto = null, heli_perto = null;
    for (let i = 0; i < es.length; i++) {
      const sq = es[i], so = sq.sold;
      if (!so.length || !this._na_tela(sq.x, sq.y, 60)) continue;
      if (sq.tipo === 'heli') {
        heli_perto = sq;
        if (rnd() < 6 * dt * this.escala) this._sopro_rotor(sq.x, sq.y, 1);
        continue;
      }
      if (sq.tipo === 'tanque') {
        if (sq.movendo) {
          tanque_perto = sq;
          if (rnd() < 14 * dt * this.escala) {
            const lado = rnd() < 0.5 ? -1 : 1;
            const bx = sq.x - sq.hx * 0.9 - sq.hy * 0.6 * lado, by = sq.y - sq.hy * 0.9 + sq.hx * 0.6 * lado;
            this._add(NEVE, bx, by, 0.1, -sq.hx * ent(0.4, 1.0) + ent(-0.3, 0.3), -sq.hy * ent(0.4, 1.0) + ent(-0.3, 0.3), ent(0.8, 1.6), ent(0.4, 0.7), 2, 1.2, 2, 7, 1);
          }
        }
        continue;
      }
      // treino: parada na linha de tiro, virada para os alvos -> tiro ao alvo
      if (sq.treino >= 0 && !sq.movendo) this._tiro_ao_alvo(sq, dt);
      // soldados andando chutam neve (bem pouco por soldado)
      let andando = 0;
      for (let j = 0; j < so.length; j += 4) if (so[j].andando) andando++;
      if (!andando) continue;
      const taxa = Math.min(16, andando * 1.6) * dt * this.escala;
      let n = Math.floor(taxa) + (rnd() < taxa - Math.floor(taxa) ? 1 : 0);
      while (n-- > 0) {
        const s = so[Math.floor(rnd() * so.length)];
        if (!s.andando) continue;
        this._add(NEVE, s.x, s.y, 0.02, ent(-0.4, 0.4), ent(-0.4, 0.4), ent(0.5, 1.0), ent(0.25, 0.45), 1.6, 1, 2, 6, 1, 0.9);
      }
    }
    this._t_motor -= dt;
    if (tanque_perto && this._t_motor <= 0) { this._t_motor = 0.6; this._tocar('motor', tanque_perto.x, tanque_perto.y, 0.5); }
    this._t_rotor -= dt;
    if (heli_perto && this._t_rotor <= 0) { this._t_rotor = 0.5; this._tocar('rotor', heli_perto.x, heli_perto.y, 0.45); }
    // bases: tiros na parede, fumaça e fogo quando muito danificada, estouro ao cair
    const nb = 2 + T.extras.length;
    for (let i = 0; i < nb; i++) {
      const b = i === 0 ? T.bases.vermelho : (i === 1 ? T.bases.verde : T.extras[i - 2]);
      if (!b) continue;
      const antes = this._vida_base.get(b);
      this._vida_base.set(b, b.vida);
      if (!this._na_tela(b.x, b.y, 220)) continue;
      if (antes !== undefined && b.vida < antes) {
        if (b.vida <= 0 && antes > 0) {
          this.explosao(b.x, b.y, 2.2); this.explosao(b.x + 1, b.y - 0.6, 1.6);
          this._tocar('eco', b.x, b.y, 1.0);
        } else if (rnd() < 0.5) {
          this.impacto_duro(b.x + ent(-1.6, 1.6), b.y + ent(-1.2, 1.2), ent(0.4, 2.0), true);
        }
      }
      const frac = b.vida_max ? b.vida / b.vida_max : 1;
      if (b.vida > 0 && frac < 0.55) {
        const dano = (0.55 - frac) / 0.55;   // 0..1
        if (rnd() < (1.5 + 6 * dano) * dt * this.escala) {
          this._add(FUMACA, b.x + ent(-1, 1), b.y + ent(-0.8, 0.8), ent(1.4, 2.4), ent(0.15, 0.35), ent(-0.1, 0.1), ent(0.7, 1.2),
            ent(2.2, 3.4), 5, ent(16, 26), 1, 0, 0.3, 0.6 + 0.3 * dano);
        }
        if (dano > 0.3) this.vol.queimada(b.x + ent(-0.9, 0.9), b.y + ent(-0.7, 0.7), 0.5 + dano, dt, true);   // base em chamas
        if (dano > 0.45) {
          if (rnd() < 8 * dt * this.escala * dano) this._add(BRASA, b.x + ent(-1, 1), b.y + ent(-0.8, 0.8), ent(1.0, 2.0), ent(-0.3, 0.3), ent(-0.3, 0.3), ent(1, 2.4), ent(0.6, 1.1), 2, 1, rnd() < 0.5 ? 3 : 4, -0.3, 0.5);
          this._luz(b.x, b.y, 1.6, 70, LUZ_BRASA, (0.35 + 0.15 * Math.sin(this._t * 13 + i)) * dano);
        }
      }
    }
  }

  _tiro_ao_alvo(sq, dt) {
    const a = M.area_de(sq.time, sq.treino);
    if (!a) return;
    if (sq.hx * a.alvos * 0.7071 - sq.hy * a.alvos * 0.7071 < 0.9) return;   // não está virada para os alvos
    const taxa = Math.min(4, 1 + sq.sold.length * 0.05) * dt * this.escala;
    let n = Math.floor(taxa) + (rnd() < taxa - Math.floor(taxa) ? 1 : 0);
    while (n-- > 0) {
      const s = sq.sold[Math.floor(rnd() * sq.sold.length)];
      const j = Math.floor(rnd() * treino.n_alvos(a));
      const [ua, va] = treino.alvo_uv(a, j);
      const tx = (ua + va) / 2 + ent(-0.15, 0.15), ty = (va - ua) / 2 + ent(-0.15, 0.15);
      this.tiro(s.x, s.y, 0.45, tx, ty);
      // traçante rápido até o alvo; o alvo tomba quando a bala chega
      const dx = tx - s.x, dy = ty - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1, v = 26;
      this._add(BRASA, s.x, s.y, 0.5, dx / d * v, dy / d * v, 0.45, d / v, 2.2, 1, 3, 0, 0);
      a.hits[j] = this._t + d / v;
      if (rnd() < 0.25) this._tocar('tiro', s.x, s.y, 0.3);
    }
  }

  _sopro_rotor(x, y, forca) {
    const n = this._quantos(5 * forca);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, v = ent(1.2, 2.6) * forca ** 0.3;
      this._add(NEVE, x + Math.cos(a) * 0.6, y + Math.sin(a) * 0.6, 0.05, Math.cos(a) * v, Math.sin(a) * v, ent(0.2, 0.6), ent(0.5, 0.9), 2, 1.4, 2, 3, 1.5, 0.85);
    }
    if (forca > 1) this._add(ANEL, x, y, 0.02, 0, 0, 0, 0.7, 10, 40, 2, 0, 0, 0.7);
  }

  // ---------- passo ----------------------------------------------------
  _passo(dt) {
    let i = 0;
    while (i < this.n) {
      this.idade[i] += dt;
      if (this.idade[i] >= this.dur[i]) {   // morreu: o último toma o lugar
        const u = --this.n;
        if (i !== u) this._copiar(u, i);
        continue;
      }
      const g = this.g[i], arr = this.arr[i];
      if (arr) {
        const f = Math.max(0, 1 - arr * dt);
        this.vx[i] *= f; this.vy[i] *= f;
        if (g <= 0) this.vz[i] *= f;
      }
      this.vz[i] -= g * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
      if (this.z[i] < 0) {
        this.z[i] = 0;
        if (this.quica[i]) {   // quica uma vez e para no chão
          this.quica[i] = 0;
          this.vz[i] = -this.vz[i] * 0.3;
          this.vx[i] *= 0.4; this.vy[i] *= 0.4;
        } else if (g > 0) {
          this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0;
          // caiu no chão: some logo (não vira "pimenta" espalhada no mapa)
          const resta = this.tipo[i] === NEVE ? 0.25 : 0.45;
          if (this.dur[i] - this.idade[i] > resta) this.dur[i] = this.idade[i] + resta;
        }
      }
      this.giro[i] += dt * 9;
      i++;
    }
    // clarões
    let k = 0;
    while (k < this.ncl) {
      this.cli[k] += dt;
      if (this.cli[k] >= this.cld[k]) {
        const u = --this.ncl;
        if (k !== u) {
          this.clx[k] = this.clx[u]; this.cly[k] = this.cly[u]; this.clz[k] = this.clz[u]; this.clr[k] = this.clr[u];
          this.clc[k] = this.clc[u]; this.clf[k] = this.clf[u]; this.cli[k] = this.cli[u]; this.cld[k] = this.cld[u];
        }
        continue;
      }
      k++;
    }
  }

  _copiar(de, para) {
    this.tipo[para] = this.tipo[de]; this.x[para] = this.x[de]; this.y[para] = this.y[de]; this.z[para] = this.z[de];
    this.vx[para] = this.vx[de]; this.vy[para] = this.vy[de]; this.vz[para] = this.vz[de];
    this.idade[para] = this.idade[de]; this.dur[para] = this.dur[de]; this.t0[para] = this.t0[de]; this.t1[para] = this.t1[de];
    this.cor[para] = this.cor[de]; this.g[para] = this.g[de]; this.arr[para] = this.arr[de]; this.alfa[para] = this.alfa[de];
    this.giro[para] = this.giro[de]; this.quica[para] = this.quica[de];
  }

  // ---------- chamado pela cena a cada quadro ---------------------------
  atualizar(T, t, z, ox, oy, vw, vh) {
    this._T = T;
    let dt = this._t === null ? 0 : t - this._t;
    this._t = t;
    if (!(dt > 0)) dt = 0;          // pausado: tudo parado
    if (dt > 0.05) dt = 0.05;
    this._z = z; this._ox = ox; this._oy = oy; this._vw = vw; this._vh = vh;
    const vol = this.vol;
    vol._z = z; vol._ox = ox; vol._oy = oy; vol._vw = vw; vol._vh = vh; vol.escala = this.escala;
    this.nl = 0;
    if (dt > 0) {
      this._governar(dt);
      this._observar(T, dt);
      this.dest.observar(T, dt, this);   // destroços que ficam no chão
      this.dest.passo(dt, this);
      this._passo(dt);
      this.vol.passo(dt, T);
    }
  }

  _governar(dt) {
    // tempo real entre quadros: se o aparelho está penando, menos partículas
    // média móvel do tempo de quadro: passou de ~19 ms (perto de cair dos 60
    // por segundo), corta partículas; com folga, devolve aos poucos
    const agora = performance.now();
    if (this._ultimo_q !== undefined) {
      const ms = Math.min(100, agora - this._ultimo_q);
      this._lento += (ms - this._lento) * 0.08;
      if (this._lento > 19) this.escala = Math.max(0.3, this.escala - 0.03);
      else if (this._lento < 17.5) this.escala = Math.min(1.0, this.escala + 0.004);
      if (this.escala > this.teto) this.escala = this.teto;   // teto do gerente de qualidade
    } else {
      this._lento = 16.7;
    }
    this._ultimo_q = agora;
  }

  // ---------- desenho --------------------------------------------------
  _puff(r, ci) {
    // bola de fumaça chapada em 2 tons (mesmo estilo dos efeitos do jogo)
    r = Math.max(2, Math.round(r / 2) * 2);
    const chave = r * 32 + ci;
    let s = this._puffs.get(chave);
    if (s === undefined) {
      const cor = PALETA[ci];
      const ctx = pg.superficie(2 * r + 2, 2 * r + 2);
      pg.circulo(ctx, cor, r + 1, r + 1, r);
      const claro = [Math.min(255, Math.trunc(cor[0] * 1.12) + 8), Math.min(255, Math.trunc(cor[1] * 1.12) + 8), Math.min(255, Math.trunc(cor[2] * 1.12) + 8)];
      pg.circulo(ctx, claro, Math.trunc(r + 1 + r * 0.22), Math.trunc(r + 1 - r * 0.22), Math.max(1, Math.trunc(r * 0.62)));
      s = ctx.canvas;
      if (this._puffs.size > 600) this._puffs.delete(this._puffs.keys().next().value);
      this._puffs.set(chave, s);
    }
    return s;
  }

  _imagem_luz(r, ci) {
    // brilho redondo que esmaece (luz quente sobre a neve)
    r = Math.max(4, Math.round(r / 6) * 6);
    const chave = r * 8 + ci;
    let s = this._luzes.get(chave);
    if (s === undefined) {
      const ctx = pg.superficie(2 * r, 2 * r);
      const c = COR_LUZ[ci];
      const gr = ctx.createRadialGradient(r, r, 0, r, r, r);
      gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.85)`);
      gr.addColorStop(0.35, `rgba(${c[0]},${c[1]},${c[2]},0.35)`);
      gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 2 * r, 2 * r);
      s = ctx.canvas;
      if (this._luzes.size > 300) this._luzes.delete(this._luzes.keys().next().value);
      this._luzes.set(chave, s);
    }
    return s;
  }

  _zonas_fogo(tela) {
    // os CÍRCULOS DE FOGO como BOLHAS: onde dois se encostam, a borda entre eles
    // some ("vaza") e eles se juntam, mas cada um continua do seu tamanho.
    //  * chão chamuscado e brasa: pintados numa camada à parte como UNIÃO dos
    //    círculos (a sobreposição não fica mais escura nem mais clara);
    //  * borda acesa: só os trechos de cada círculo que ficam FORA dos outros.
    const T = this._T, zs = T && T.zonas_fogo;
    if (!zs || !zs.length) return;
    const z = this._z, ox = this._ox, oy = this._oy, kx = HW * z, ky = HH * z;
    const W = this._vw, A = this._vh;
    const vis = [];
    for (let i = 0; i < zs.length; i++) {
      const f = zs[i];
      const cx = (f.x - f.y) * kx + ox, cy = (f.x + f.y) * ky + oy;
      const rx = f.r * Math.SQRT2 * kx, ry = f.r * Math.SQRT2 * ky;
      if (cx + rx * 1.2 < 0 || cx - rx * 1.2 > W || cy + ry * 1.2 < 0 || cy - ry * 1.2 > A) continue;
      const a = Math.min(1, f.t / 0.35) * Math.min(1, (f.dur - f.t) / 2.5);
      vis.push([f, cx, cy, rx, ry, a, i]);
    }
    if (!vis.length) return;
    // camada à parte do tamanho da tela
    if (!this._buf_fogo || this._buf_fogo.canvas.width !== W || this._buf_fogo.canvas.height !== A) {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, W); cv.height = Math.max(1, A);
      this._buf_fogo = cv.getContext('2d');
    }
    const b = this._buf_fogo;
    // 1) chão chamuscado (união)
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, W, A);
    b.globalCompositeOperation = 'lighten';   // sobreposição: fica o mais forte, não soma
    for (const [, cx, cy, rx, ry, a] of vis) {
      b.save(); b.translate(cx, cy); b.scale(1, ry / rx);
      const g = b.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx * 1.1);
      g.addColorStop(0, `rgba(44,28,22,${(0.58 * a).toFixed(3)})`);
      g.addColorStop(0.82, `rgba(52,34,26,${(0.5 * a).toFixed(3)})`);
      g.addColorStop(1, 'rgba(60,40,30,0)');
      b.fillStyle = g;
      b.beginPath(); b.arc(0, 0, rx * 1.1, 0, 6.2832); b.fill();
      b.restore();
    }
    tela.drawImage(b.canvas, 0, 0);
    // 2) brasa (união, somada à cena como luz)
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, W, A);
    b.globalCompositeOperation = 'lighten';
    for (const [, cx, cy, rx, ry, a, i] of vis) {
      const pulso = 0.85 + 0.15 * Math.sin(this._t * 9 + i * 1.7) + 0.08 * Math.sin(this._t * 23 + i);
      b.save(); b.translate(cx, cy); b.scale(1, ry / rx);
      const g = b.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(255,150,40,${(0.45 * a * pulso).toFixed(3)})`);
      g.addColorStop(0.65, `rgba(255,100,22,${(0.32 * a * pulso).toFixed(3)})`);
      g.addColorStop(1, `rgba(255,120,30,${(0.2 * a * pulso).toFixed(3)})`);
      b.fillStyle = g;
      b.beginPath(); b.arc(0, 0, rx, 0, 6.2832); b.fill();
      b.restore();
    }
    tela.save();
    tela.globalCompositeOperation = 'lighter';
    tela.drawImage(b.canvas, 0, 0);
    // 3) borda acesa: só onde o círculo não está dentro de outro (a junção fica aberta)
    tela.lineWidth = Math.max(1.5, 2.4 * z);
    tela.setLineDash([6 * z, 5 * z]);
    tela.lineDashOffset = -this._t * 18 * z;
    tela.lineCap = 'round';
    const N = 64;
    for (const [f, , , , , a, i] of vis) {
      const pulso = 0.85 + 0.15 * Math.sin(this._t * 9 + i * 1.7);
      tela.strokeStyle = `rgba(255,190,80,${(0.6 * a * pulso).toFixed(3)})`;
      tela.beginPath();
      let aberto = false;
      for (let k = 0; k <= N; k++) {
        const ang = (k / N) * 6.2832;
        const wx = f.x + Math.cos(ang) * f.r, wy = f.y + Math.sin(ang) * f.r;
        let dentro = false;
        for (let j = 0; j < zs.length; j++) {
          const o = zs[j];
          if (o === f) continue;
          if ((wx - o.x) ** 2 + (wy - o.y) ** 2 < (o.r * 0.995) ** 2) { dentro = true; break; }
        }
        if (dentro) { aberto = false; continue; }
        const px = (wx - wy) * kx + ox, py = (wx + wy) * ky + oy;
        if (!aberto) { tela.moveTo(px, py); aberto = true; } else tela.lineTo(px, py);
      }
      tela.stroke();
    }
    tela.restore();
  }

  chao(tela) {
    // camada do chão (antes das tropas): sombras das partículas no ar e anéis
    const z = this._z, ox = this._ox, oy = this._oy, kx = HW * z, ky = HH * z;
    const W = this._vw, A = this._vh;
    this.dest.chao(tela, z, ox, oy, W, A);   // chão chamuscado + destrocinhos das tropas
    this._zonas_fogo(tela);
    tela.fillStyle = 'rgba(70,84,128,0.2)';
    tela.beginPath();
    let tem = false;
    for (let i = 0; i < this.n; i++) {
      const tp = this.tipo[i];
      if (tp !== DETRITO && tp !== CARTUCHO) continue;
      if (this.z[i] < 0.15) continue;
      const px = (this.x[i] - this.y[i]) * kx + ox, py = (this.x[i] + this.y[i]) * ky + oy;
      if (px < -10 || px > W + 10 || py < -10 || py > A + 10) continue;
      const r = Math.max(1, this.t0[i] * z * 0.8 / (1 + this.z[i] * 0.4));
      tela.moveTo(px + r, py);
      tela.ellipse(px, py, r, r * 0.5, 0, 0, 6.2832);
      tem = true;
    }
    if (tem) tela.fill();
    this.vol.sombra(tela);   // sombra das nuvens de fumaça no chão
    // anéis de choque no chão
    for (let i = 0; i < this.n; i++) {
      if (this.tipo[i] !== ANEL) continue;
      const u = this.idade[i] / this.dur[i];
      const px = (this.x[i] - this.y[i]) * kx + ox, py = (this.x[i] + this.y[i]) * ky + oy;
      const r = (this.t0[i] + (this.t1[i] - this.t0[i]) * (1 - (1 - u) * (1 - u))) * z;
      if (px + r < 0 || px - r > W || py + r < 0 || py - r > A) continue;
      tela.globalAlpha = this.alfa[i] * (1 - u);
      tela.strokeStyle = 'rgb(255,255,255)';
      tela.lineWidth = Math.max(1, 4 * z * (1 - u) + 1);
      tela.beginPath();
      tela.ellipse(px, py, r, r * 0.5, 0, 0, 6.2832);
      tela.stroke();
    }
    tela.globalAlpha = 1;
  }

  ar(tela) {
    // camada de cima: fumaça, poeira, detritos, neve, cartuchos, brasas e brilhos
    const z = this._z, ox = this._ox, oy = this._oy, kx = HW * z, ky = HH * z, kz = ZH * z;
    const W = this._vw, A = this._vh;
    // 0) fumaça volumétrica (cone das explosões, colunas das queimadas)
    this.vol.desenhar(tela);
    // 1) fumaça e poeira (por baixo das faíscas)
    for (let i = 0; i < this.n; i++) {
      const tp = this.tipo[i];
      if (tp !== FUMACA && tp !== POEIRA) continue;
      const u = this.idade[i] / this.dur[i];
      const px = (this.x[i] - this.y[i]) * kx + ox, py = (this.x[i] + this.y[i]) * ky - this.z[i] * kz + oy;
      const r = (this.t0[i] + (this.t1[i] - this.t0[i]) * (1 - (1 - u) * (1 - u))) * z;
      if (px + r < 0 || px - r > W || py + r < 0 || py - r > A) continue;
      const a = this.alfa[i] * (1 - u) * (tp === POEIRA ? 0.8 : 1) * Math.min(1, u * 8);
      if (a < 0.02) continue;
      const s = this._puff(r, this.cor[i]);
      tela.globalAlpha = a;
      tela.drawImage(s, Math.trunc(px - s.width / 2), Math.trunc(py - s.height / 2));
    }
    tela.globalAlpha = 1;
    // 2) detritos, neve e cartuchos (pedacinhos chapados)
    let ult_a = -1, ult_c = -1;
    for (let i = 0; i < this.n; i++) {
      const tp = this.tipo[i];
      if (tp !== DETRITO && tp !== NEVE && tp !== CARTUCHO) continue;
      const px = (this.x[i] - this.y[i]) * kx + ox, py = (this.x[i] + this.y[i]) * ky - this.z[i] * kz + oy;
      if (px < -8 || px > W + 8 || py < -8 || py > A + 8) continue;
      const u = this.idade[i] / this.dur[i];
      const fim = u > 0.75 ? (1 - u) / 0.25 : 1;
      const r = Math.max(0.8, (this.t0[i] + (this.t1[i] - this.t0[i]) * u) * z * 0.5);
      const a = Math.round(this.alfa[i] * fim * 8) / 8;   // 8 níveis: troca o estado bem menos vezes
      if (a !== ult_a) { tela.globalAlpha = a; ult_a = a; }
      if (this.cor[i] !== ult_c) { tela.fillStyle = pg.css(PALETA[this.cor[i]]); ult_c = this.cor[i]; }
      if (tp === NEVE) {
        tela.fillRect(Math.trunc(px - r), Math.trunc(py - r), Math.max(1, Math.trunc(2 * r)), Math.max(1, Math.trunc(2 * r)));
      } else {   // pedaço girando (losango) / cartucho (barrinha)
        const c = Math.cos(this.giro[i]) * r, s = Math.sin(this.giro[i]) * r;
        tela.beginPath();
        if (tp === CARTUCHO) {
          tela.moveTo(px - c, py - s * 0.5); tela.lineTo(px + c, py + s * 0.5);
          tela.lineWidth = Math.max(1, r * 0.9); tela.strokeStyle = pg.css(PALETA[this.cor[i]]); tela.stroke();
        } else {
          tela.moveTo(px + c, py + s * 0.6); tela.lineTo(px - s, py + c * 0.6);
          tela.lineTo(px - c, py - s * 0.6); tela.lineTo(px + s, py - c * 0.6);
          tela.closePath(); tela.fill();
        }
      }
    }
    // 3) brasas/faíscas (riscos curtos na direção do movimento) e brilhos
    for (let i = 0; i < this.n; i++) {
      const tp = this.tipo[i];
      if (tp !== BRASA && tp !== BRILHO) continue;
      const px = (this.x[i] - this.y[i]) * kx + ox, py = (this.x[i] + this.y[i]) * ky - this.z[i] * kz + oy;
      if (px < -10 || px > W + 10 || py < -10 || py > A + 10) continue;
      const u = this.idade[i] / this.dur[i];
      tela.globalAlpha = this.alfa[i] * (u > 0.6 ? (1 - u) / 0.4 : 1);
      const cor = pg.css(PALETA[this.cor[i]]);
      if (tp === BRASA) {
        const ex = (this.vx[i] - this.vy[i]) * kx * 0.035, ey = (this.vx[i] + this.vy[i]) * ky * 0.035 - this.vz[i] * kz * 0.035;
        tela.strokeStyle = cor;
        tela.lineWidth = Math.max(1, this.t0[i] * z * 0.7);
        tela.beginPath();
        tela.moveTo(px - ex, py - ey);
        tela.lineTo(px + 0.5, py + 0.5);
        tela.stroke();
      } else {   // estrelinha de 4 pontas
        const r = this.t0[i] * z * (1 - u * 0.5) * (0.75 + 0.25 * Math.sin(this.giro[i] * 2));
        tela.fillStyle = cor;
        tela.beginPath();
        tela.moveTo(px, py - r); tela.lineTo(px + r * 0.25, py - r * 0.25); tela.lineTo(px + r, py);
        tela.lineTo(px + r * 0.25, py + r * 0.25); tela.lineTo(px, py + r); tela.lineTo(px - r * 0.25, py + r * 0.25);
        tela.lineTo(px - r, py); tela.lineTo(px - r * 0.25, py - r * 0.25);
        tela.closePath(); tela.fill();
      }
    }
    tela.globalAlpha = 1;
  }

  luz(tela) {
    // luz quente sobre a neve: fogo, clarões de tiro e de explosão, brasas grandes
    const z = this._z, ox = this._ox, oy = this._oy, kx = HW * z, ky = HH * z, kz = ZH * z;
    const W = this._vw, A = this._vh;
    for (let i = 0; i < this.ncl; i++) {
      const u = this.cli[i] / this.cld[i];
      this._luz(this.clx[i], this.cly[i], this.clz[i], this.clr[i] * (0.7 + 0.3 * u), this.clc[i], this.clf[i] * (1 - u) * (1 - u));
    }
    for (let i = 0; i < this.nl; i++) {
      const r = this.lr[i] * z;
      const px = (this.lx[i] - this.ly[i]) * kx + ox, py = (this.lx[i] + this.ly[i]) * ky - this.lz[i] * kz * 0.5 + oy;
      if (px + r < 0 || px - r > W || py + r < 0 || py - r > A) continue;
      const s = this._imagem_luz(r, this.lc[i]);
      tela.globalAlpha = Math.min(1, this.lf[i]);
      tela.drawImage(s, Math.trunc(px - s.width / 2), Math.trunc(py - s.height / 2));
    }
    // brasas e faíscas brilham um pouco (luz pequena)
    let usadas = 0;
    for (let i = 0; i < this.n && usadas < 60; i++) {
      if (this.tipo[i] !== BRASA) continue;
      const u = this.idade[i] / this.dur[i];
      const px = (this.x[i] - this.y[i]) * kx + ox, py = (this.x[i] + this.y[i]) * ky - this.z[i] * kz + oy;
      if (px < -20 || px > W + 20 || py < -20 || py > A + 20) continue;
      const s = this._imagem_luz(Math.max(6, 10 * z), LUZ_BRASA);
      tela.globalAlpha = 0.35 * (1 - u);
      tela.drawImage(s, Math.trunc(px - s.width / 2), Math.trunc(py - s.height / 2));
      usadas++;
    }
    tela.globalAlpha = 1;
  }

  // ---------- neve caindo (na tela) -------------------------------------
  _floco(i, qualquer) {
    this.fx_[i] = rnd();
    this.fy_[i] = qualquer ? rnd() : -0.02;
    this.fv_[i] = ent(0.04, 0.09);
    this.fr_[i] = ent(0.8, 2.2);
    this.ff_[i] = rnd() * 6.283;
  }

  neve(tela, cam_x, cam_y, dt_real) {
    // flocos que caem devagar, com vento; andam um pouco junto com a câmera
    const W = this._vw, A = this._vh, u = Math.min(W, A) / 540;
    let dxc = 0, dyc = 0;
    if (this._cam_x !== null) { dxc = (cam_x - this._cam_x) * this._z / W; dyc = (cam_y - this._cam_y) * this._z / A; }
    this._cam_x = cam_x; this._cam_y = cam_y;
    const dt = Math.min(0.05, Math.max(0, dt_real));
    const quantos = Math.floor(this.flocos * (0.4 + 0.6 * this.escala));
    tela.fillStyle = 'rgb(255,255,255)';
    for (let i = 0; i < quantos; i++) {
      this.ff_[i] += dt * 1.3;
      this.fy_[i] += this.fv_[i] * dt - dyc * 0.6;
      this.fx_[i] += (0.012 + Math.sin(this.ff_[i]) * 0.01) * dt - dxc * 0.6;
      if (this.fy_[i] > 1.02 || this.fy_[i] < -0.05 || this.fx_[i] < -0.05 || this.fx_[i] > 1.05) {
        this._floco(i, false);
        if (this.fx_[i] < 0) this.fx_[i] += 1;
      }
      const r = this.fr_[i] * u;
      tela.globalAlpha = 0.55 + 0.3 * (this.fr_[i] / 2.2);
      tela.fillRect(Math.trunc(this.fx_[i] * W), Math.trunc(this.fy_[i] * A), Math.max(1, Math.trunc(r * 1.5)), Math.max(1, Math.trunc(r * 1.5)));
    }
    tela.globalAlpha = 1;
  }

  brasa_em(x, y, z) {
    // brasa subindo de um destroço em chamas (destrocos.js)
    this._add(BRASA, x + ent(-0.25, 0.25), y + ent(-0.25, 0.25), z, ent(-0.3, 0.3), ent(-0.3, 0.3), ent(1.0, 2.4), ent(0.6, 1.3), 2, 1, rnd() < 0.5 ? 3 : 4, -0.4, 0.5);
  }

  limpar() {
    this.dest.limpar();
    this.vol.limpar();
    this.n = 0; this.ncl = 0; this.nl = 0; this._t = null;
    this._visto = new WeakSet(); this._impacto = new WeakSet(); this._vida_base = new WeakMap();
  }
}
