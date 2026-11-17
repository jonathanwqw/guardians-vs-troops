// efeitos.js — partículas e o projétil do tanque. (clone de jogo/efeitos.py)
//     Efeitos.fumaca / poeira / faiscas / clarao   cria partículas
//     Efeitos.disparo_tanque(...)                    a grande nuvem do tiro
//     Efeitos.atualizar(dt)                          move tudo
//     Efeitos.desenhar(tela, z, ox, oy)              desenha
//     ProjetilTanque                                 o projétil: arco, fogo, rastro
// Partícula = [tipo, x, y, z, vx, vy, vz, t, dur, r0, r1, cor, alfa]
//     tipo 0 fumaça  (sobe, freia, cresce e some; o vento empurra para +x)
//     tipo 1 poeira  (neve levantada: espalha baixo, cresce e some)
//     tipo 2 faísca  (risco curto que cai com gravidade)
// Raios em tiles. Visual chapado: cada baforada é um círculo em 2 tons.
import * as C from './config.js';
import * as iso from './iso.js';
import * as pg from './pg.js';

export const VENTO = 0.35;   // tiles/s para +x

const PUFF_MAX = 2048;          // baforadas guardadas (imagens prontas)
const PUFF_MAX_PX = 3000000;    // ~12 MB no máximo

export class Efeitos {
  constructor() {
    this.particulas = [];
    this.claroes = [];   // [x, y, z, t, mira] clarão da boca do cano
    this._puffs = new Map();
    this._puffs_px = 0;
  }

  // ---------- criação ------------------------------------------------
  _add(tipo, x, y, z, vx, vy, vz, dur, r0, r1, cor, alfa = 190) {
    // só números dentro da lista (a cor fica num campo à parte): lista de números
    // puros é guardada direto, sem criar um objeto novo a cada conta do quadro
    const p = [tipo, x, y, z, vx, vy, vz, 0.0, dur, r0, r1, 0, alfa];
    p.cor = cor;
    this.particulas.push(p);
  }

  fumaca(x, y, z, { vx = 0.0, vy = 0.0, vz = 0.6, dur = 1.6, r0 = 0.15, r1 = 0.8, cor = [150, 156, 166], alfa = 190 } = {}) {
    this._add(0, x, y, z, vx, vy, vz, dur, r0, r1, cor, alfa);
  }

  poeira(x, y, vx, vy, dur = 1.0, r0 = 0.2, r1 = 0.7, cor = [236, 240, 246]) {
    this._add(1, x, y, 0.08, vx, vy, 0.25, dur, r0, r1, cor, 220);
  }

  faiscas(x, y, z, n, cor = [255, 214, 110], forca = 2.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const v = forca * (0.5 + Math.random());
      const vz = 1.0 + Math.random() * 2.0;
      const dur = 0.25 + Math.random() * 0.25;
      this._add(2, x, y, z, Math.cos(a) * v, Math.sin(a) * v, vz, dur, 0, 0, cor, 255);
    }
  }

  clarao(x, y, z, mira) {
    this.claroes.push([x, y, z, 0.0, mira]);
  }

  disparo_tanque(tx, ty, mx, my, mz, mira) {
    // o tiro do tanque: clarão, nuvem grande de fumaça na boca e neve levantada em volta
    this.clarao(mx, my, mz, mira);
    const fx = Math.cos(mira), fy = Math.sin(mira);
    for (let i = 0; i < 18; i++) {   // nuvem da boca, empurrada para a frente
      const v = 1.0 + Math.random() * 3.2;
      const la = (Math.random() - 0.5) * 1.6;
      const cinza = 150 + Math.trunc(Math.random() * 60);
      const vz = 0.3 + Math.random() * 0.9;
      const dur = 1.4 + Math.random() * 1.6;
      const r1 = 0.8 + Math.random() * 0.7;
      this._add(0, mx, my, mz, fx * v - fy * la, fy * v + fx * la, vz, dur, 0.18, r1, [cinza, cinza + 4, cinza + 12], 190);
    }
    for (let i = 0; i < 6; i++) {    // fumaça escura de pólvora, mais perto
      const vx = fx * 0.8 + (Math.random() - 0.5);
      const vy = fy * 0.8 + (Math.random() - 0.5);
      this._add(0, mx, my, mz, vx, vy, 0.5, 1.0 + Math.random(), 0.12, 0.5, [96, 100, 108], 210);
    }
    for (let i = 0; i < 14; i++) {   // anel de neve levantada pelo sopro
      const a = i * 6.283 / 14 + Math.random() * 0.3;
      const v = 1.2 + Math.random() * 1.4;
      const dur = 0.8 + Math.random() * 0.8;
      const r1 = 0.6 + Math.random() * 0.5;
      this.poeira(tx + Math.cos(a) * 1.0, ty + Math.sin(a) * 0.8, Math.cos(a) * v, Math.sin(a) * v, dur, 0.2, r1);
    }
  }

  explosao_tanque(x, y) {
    // impacto do projétil: coluna de fumaça, faíscas e neve
    for (let i = 0; i < 12; i++) {
      const cinza = 90 + Math.trunc(Math.random() * 70);
      const px = x + (Math.random() - 0.5) * 1.2;
      const py = y + (Math.random() - 0.5) * 1.2;
      const vx = (Math.random() - 0.5) * 0.8;
      const vy = (Math.random() - 0.5) * 0.8;
      const vz = 0.8 + Math.random() * 1.6;
      const dur = 1.6 + Math.random() * 1.6;
      const r1 = 1.0 + Math.random() * 0.6;
      this._add(0, px, py, 0.2, vx, vy, vz, dur, 0.3, r1, [cinza, cinza + 4, cinza + 10], 190);
    }
    this.faiscas(x, y, 0.3, 10, [250, 170, 70], 3.5);
    for (let i = 0; i < 10; i++) {
      const a = i * 0.628;
      this.poeira(x, y, Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0.9, 0.25, 0.8);
    }
  }

  // ---------- atualização --------------------------------------------
  atualizar(dt) {
    let vivas = [];
    const freio = Math.max(0.0, 1.0 - 1.6 * dt);
    const freio_z = Math.max(0.0, 1.0 - 0.8 * dt);
    for (const p of this.particulas) {
      p[7] += dt;
      if (p[0] === 2) {   // faísca: gravidade
        p[6] -= 7.0 * dt;
        p[1] += p[4] * dt;
        p[2] += p[5] * dt;
        p[3] += p[6] * dt;
        if (p[3] <= 0) continue;
      } else {
        p[4] = p[4] * freio + (p[0] === 0 ? VENTO * dt : 0.0);
        p[5] *= freio;
        p[6] *= freio_z;
        p[1] += p[4] * dt;
        p[2] += p[5] * dt;
        p[3] += p[6] * dt;
      }
      if (p[7] < p[8]) vivas.push(p);
    }
    if (vivas.length > C.MAX_PARTICULAS) vivas = vivas.slice(vivas.length - C.MAX_PARTICULAS);
    this.particulas = vivas;
    for (const c of this.claroes) c[3] += dt / 0.14;
    this.claroes = this.claroes.filter(c => c[3] < 1);
  }

  // ---------- desenho -------------------------------------------------
  _puff(r, cor) {
    // baforada chapada em 2 tons (sem brilho), guardada por tamanho e cor
    r = Math.max(2, Math.trunc(r / 2) * 2);
    const chave = r * 16777216 + cor[0] * 65536 + cor[1] * 256 + cor[2];
    let s = this._puffs.get(chave);
    if (s === undefined) {
      // cache que descarta só as mais antigas (antes apagava tudo a cada 300 e
      // recriava centenas de imagens por segundo numa batalha grande: criar
      // canvas é caro e enche a memória da página -> coletas de lixo longas)
      while (this._puffs.size >= PUFF_MAX || (this._puffs_px > PUFF_MAX_PX && this._puffs.size)) {
        const velha = this._puffs.keys().next().value;
        const img = this._puffs.get(velha);
        this._puffs_px -= img.width * img.height;
        this._puffs.delete(velha);
      }
      const ctx = pg.superficie(2 * r + 2, 2 * r + 2);
      pg.circulo(ctx, cor, r + 1, r + 1, r);
      const claro = [Math.min(255, Math.trunc(cor[0] * 1.12) + 8), Math.min(255, Math.trunc(cor[1] * 1.12) + 8), Math.min(255, Math.trunc(cor[2] * 1.12) + 8)];
      pg.circulo(ctx, claro, Math.trunc(r + 1 + r * 0.22), Math.trunc(r + 1 - r * 0.22), Math.max(1, Math.trunc(r * 0.62)));
      s = ctx.canvas;
      this._puffs.set(chave, s);
      this._puffs_px += s.width * s.height;
    }
    return s;
  }

  desenhar(tela, z, ox, oy) {
    const L = tela.canvas.width, A = tela.canvas.height;
    const kx = iso.HW * z;
    for (let i = 0; i < this.particulas.length; i++) {
      const p = this.particulas[i];
      const tipo = p[0], x = p[1], y = p[2], zz = p[3];
      const px = (x - y) * kx + ox, py = iso.sy(x, y, zz) * z + oy;
      if (px < -80 || px > L + 80 || py < -80 || py > A + 80) continue;
      if (tipo === 2) {
        pg.linha_xy(tela, p.cor, (x - p[4] * 0.04 - (y - p[5] * 0.04)) * kx + ox, iso.sy(x - p[4] * 0.04, y - p[5] * 0.04, zz - p[6] * 0.04) * z + oy,
          px, py, Math.max(1, Math.trunc(2 * z)));
        continue;
      }
      const u = p[7] / p[8];
      const r = (p[9] + (p[10] - p[9]) * (1 - (1 - u) ** 2)) * kx;
      const s = this._puff(r, p.cor);
      pg.blit(tela, s, Math.trunc(px - s.width / 2), Math.trunc(py - s.height / 2), Math.trunc(p[12] * (1 - u) ** 1.3));
    }
    for (let i = 0; i < this.claroes.length; i++) {
      const c = this.claroes[i];
      Efeitos._clarao(tela, c[0], c[1], c[2], c[3], c[4], z, ox, oy);
    }
  }

  static _clarao(tela, x, y, zz, t, mira, z, ox, oy) {
    // clarão chapado em 3 camadas, comprido na direção do tiro
    const cx = iso.sx(x, y) * z + ox, cy = iso.sy(x, y, zz) * z + oy;
    let ex = iso.sx(Math.cos(mira), Math.sin(mira)), ey = iso.sy(Math.cos(mira), Math.sin(mira));
    const l = Math.hypot(ex, ey) || 1.0;
    ex /= l; ey /= l;
    const nx = -ey, ny = ex;
    const tam = (1.0 - t * 0.6) * 46 * z;
    for (const [esc, cor] of [[1.0, [236, 110, 40]], [0.66, [250, 200, 70]], [0.32, [255, 248, 214]]]) {
      const pts = [];
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        const raio = (i % 2 === 0 ? 1.0 : 0.45) * esc * tam;
        const frente = Math.cos(a);
        const alongar = frente > 0 ? 1.6 : 0.55;   // comprido para a frente
        pts.push([cx + (ex * frente * alongar + nx * Math.sin(a) * 0.55) * raio,
          cy + (ey * frente * alongar + ny * Math.sin(a) * 0.55) * raio]);
      }
      pg.poligono(tela, cor, pts);
    }
  }
}

export class ProjetilTanque {
  // projétil do canhão do tanque: sai da boca, arco baixo, explode no alvo
  constructor(x0, y0, z0, x1, y1, alvo, time, dano) {
    this.x0 = x0; this.y0 = y0; this.z0 = z0; this.x1 = x1; this.y1 = y1;
    this.t = 0.0;
    this.dur = Math.max(0.12, Math.hypot(x1 - x0, y1 - y0) / C.VEL_PROJETIL_TANQUE);
    this.alvo = alvo; this.time = time; this.dano = dano;
    this.zuniu = false;
    this.rastro = 0.0;
  }

  pos(t = null) {
    t = t === null ? this.t : t;
    return [this.x0 + (this.x1 - this.x0) * t, this.y0 + (this.y1 - this.y0) * t,
      this.z0 * (1 - t) + 0.35 * t + 1.2 * t * (1 - t)];
  }

  soltar_rastro(ef, dt) {
    // fumaça clara e escura saindo de trás, várias por quadro
    this.rastro += dt;
    const [x, y, z] = this.pos();
    const [ax, ay, az] = this.pos(Math.max(0.0, this.t - 0.05));
    while (this.rastro > 0.012) {
      this.rastro -= 0.012;
      const k = Math.random();
      const px = ax + (x - ax) * k, py = ay + (y - ay) * k, pz = az + (z - az) * k;
      ef.fumaca(px, py, pz, { vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, vz: 0.15,
        dur: 0.7 + Math.random() * 0.9, r0: 0.06, r1: 0.38, cor: [196, 200, 208], alfa: 170 });
      if (Math.random() < 0.35) {
        ef.fumaca(px, py, pz, { vx: 0, vy: 0, vz: 0.2, dur: 0.45, r0: 0.05, r1: 0.22, cor: [100, 102, 108], alfa: 200 });
      }
    }
  }

  desenhar(tela, z, ox, oy, t_jogo) {
    // corpo escuro com ponta dourada e FOGO tremendo atrás
    const [x, y, zz] = this.pos();
    const [ax, ay, az] = this.pos(Math.max(0.0, this.t - 0.03));
    const px = iso.sx(x, y) * z + ox, py = iso.sy(x, y, zz) * z + oy;
    const bx = iso.sx(ax, ay) * z + ox, by = iso.sy(ax, ay, az) * z + oy;
    let dx = px - bx, dy = py - by;
    const l = Math.hypot(dx, dy) || 1.0;
    dx /= l; dy /= l;
    const nx = -dy, ny = dx;
    const comp = 11 * z;
    const cauda = [px - dx * comp, py - dy * comp];
    const tremor = 0.75 + 0.25 * Math.sin(t_jogo * 60 + x * 7);
    for (const [esc, cor] of [[1.0, [236, 110, 40]], [0.6, [250, 200, 70]]]) {
      const fl = 14 * z * tremor * esc;
      const w = 4.2 * z * esc;
      pg.poligono(tela, cor, [[cauda[0] + nx * w, cauda[1] + ny * w],
        [cauda[0] - dx * fl, cauda[1] - dy * fl],
        [cauda[0] - nx * w, cauda[1] - ny * w]]);
    }
    pg.linha(tela, [58, 60, 68], cauda, [px, py], Math.max(3, Math.trunc(4 * z)));
    pg.circulo(tela, [206, 172, 90], px, py, Math.max(2, Math.trunc(2.6 * z)));
  }
}
