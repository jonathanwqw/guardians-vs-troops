// menu.js — tudo o que aparece ANTES da partida. (clone de jogo/menu.py)
//
//     splash()          "MERCURY STUDIOS" em texto grosso (como os números do jogo)
//     carregamento()    barra clássica em blocos + dicas. Faz o trabalho pesado de
//                       verdade, um pedaço por quadro: sons (som.js, Som.carregar),
//                       terreno e sprites (cena.js, Cena.preparar) e a batalha do fundo.
//                       Tem um tempo mínimo, para dar aquela demora de jogo grande.
//     FundoBatalha      uma partida DE VERDADE rodando sozinha atrás do menu:
//                       tropas.js (regras, com som mudo) + cena.js (desenho) em meia
//                       resolução, BORRADA, com tom frio, vinheta e neve caindo.
//                       O lado verde joga no automático (AutoVerde).
//     menu_principal()  nome grande do jogo + INICIAR / MULTIPLAYER /
//                       CONFIGURAÇÕES / SAIR, com som de guerra de fundo
//                       ('guerra_fundo', som.js).
//     opcoes()          volume, música de guerra, efeitos, tela cheia, FPS
//                       (salvos por opcoes.js).
//
// Quem chama: main.js, nesta ordem: splash -> carregamento -> menu_principal ->
// (partida) -> menu_principal ...
//
// ÚNICA diferença para o original: o botão MULTIPLAYER, que era "EM BREVE",
// agora abre a seção multiplayer (multiplayer.js).
import * as C from './config.js';
import * as icones from './icones.js';

// LOGO do jogo (imagem sem fundo) no lugar do nome escrito; enquanto não
// carrega, o nome em texto aparece como antes
const LOGO = new Image();
LOGO.src = 'img/logo_jogo.png';
const LOGO_STUDIO = new Image();   // logo do Mercury Studio (abertura)
LOGO_STUDIO.src = 'img/logo_mercury.png';
function _logo_pronto() { return LOGO.complete && LOGO.naturalWidth > 0; }
function _desenhar_logo(tela, cx, cy, w, h, alfa = 1) {
  // cabe no retângulo w x h (mantém a proporção), centrado em (cx, cy); devolve [larg, alt]
  const k = Math.min(w / LOGO.naturalWidth, h / LOGO.naturalHeight);
  const lw = LOGO.naturalWidth * k, lh = LOGO.naturalHeight * k;
  tela.save(); tela.globalAlpha = alfa;
  tela.imageSmoothingEnabled = true; tela.imageSmoothingQuality = 'high';
  tela.drawImage(LOGO, Math.round(cx - lw / 2), Math.round(cy - lh / 2), Math.round(lw), Math.round(lh));
  tela.restore();
  return [lw, lh];
}
import * as M from './mapa.js';
import * as iso from './iso.js';
import * as pg from './pg.js';
import * as OP from './opcoes.js';
import { Camera } from './camera.js';
import { Cena } from './cena.js';
import { Mudo } from './som.js';
import { Tropas } from './tropas.js';
import * as multiplayer from './multiplayer.js';
import { NIVEIS as NIVEIS_HORDA } from './zumbis.js';

export const VERSAO_JOGO = 'v1.1';
export const DICAS = [
  'Granadas e canhões não acertam helicópteros. Fuzis e bases acertam.',
  'Bala de fuzil ricocheteia no tanque: use canhão, foguete ou outro tanque.',
  'Cada base rende 10 moedas a cada meio minuto e 1 pelotão por minuto.',
  'O inimigo prepara a onda na frente do QG antes de atacar. Aproveite.',
  'Tropa junta sofre mais com granada: espalhe os pelotões.',
  'Na estrada as tropas andam mais rápido que na neve.',
  'Toque no minimapa para levar a câmera até lá.',
  'A melhoria Produção faz as suas bases gerarem tropa mais rápido.',
];

const int = Math.trunc;
const uniforme = (a, b) => a + (b - a) * Math.random();

// ======================================================================
// Utilidades de desenho
// ======================================================================
export class App {
  // o que todas as telas compartilham: janela, relógio, som e opções
  constructor(janela, som, opcoes, pasta) {
    this.janela = janela;
    this.tela = janela.ctx;
    this.som = som;
    this.op = opcoes;
    this.pasta = pasta;
    this._fontes = new Map();
    this._cache = new Map();
    this.no_android = false;   // true = este navegador não deixa trocar a tela cheia
    this.rede = null;          // conexão do multiplayer (multiplayer.js)
  }

  get vw() { return this.janela.canvas.width; }
  get vh() { return this.janela.canvas.height; }

  get u() {
    // escala da interface (a mesma conta da interface.js)
    return Math.max(1.0, Math.min(this.vw, this.vh) / 540);
  }

  async tick() {
    // como relogio.tick(): espera o quadro e devolve os segundos (no máximo 0,05)
    return Math.min(0.05, (await this.janela.tick()) / 1000.0);
  }

  eventos() { return this.janela.eventos(); }

  fonte(tam, negrito = true) {
    const k = int(tam) * 2 + (negrito ? 1 : 0);
    let f = this._fontes.get(k);
    if (f === undefined) {
      f = new pg.Fonte(Math.max(8, int(tam)), negrito);
      this._fontes.set(k, f);
    }
    return f;
  }

  texto_grosso(txt, tam, cor = C.BRANCO, contorno = null, cor_contorno = C.ESCURO, sombra = 0) {
    // texto branco com contorno escuro grosso (como os números do jogo) e,
    // se pedir, uma sombra chapada embaixo. Guardado em cache.
    tam = int(tam);
    contorno = contorno === null ? Math.max(2, int(tam * 0.07)) : int(contorno);
    const chave = `${txt}\u0001${tam}\u0001${cor}\u0001${contorno}\u0001${cor_contorno}\u0001${sombra}`;
    let img = this._cache.get(chave);
    if (img === undefined) {
      const passo = Math.max(1, Math.floor(contorno / 4));
      img = pg.texto_contorno(this.fonte(tam), txt, cor, cor_contorno, contorno, passo, sombra);
      if (this._cache.size > 200) this._cache.clear();
      this._cache.set(chave, img);
    }
    return img;
  }

  centro(img, cx, cy, alfa = 255) {
    pg.blit(this.tela, img, int(cx - img.width / 2), int(cy - img.height / 2), alfa);
  }
}

export function ret_arred(tela, cor, r, raio, borda = 0) {
  pg.ret(tela, cor, [int(r[0]), int(r[1]), int(r[2]), int(r[3])], int(borda), int(raio));
}

export function eventos_basicos(app, ev) {
  // trata o que toda tela trata igual; devolve 'sair', 'voltar', 'tamanho' ou null
  if (ev.type === 'QUIT') return 'sair';
  if (ev.type === 'KEYDOWN' && ev.key === 'escape') return 'voltar';
  if (ev.type === 'VIDEORESIZE') return 'tamanho';
  return null;
}

export class Neve {
  // flocos caindo por cima do menu (bolinhas brancas, sem brilho)
  constructor() {
    this.flocos = [];
  }

  atualizar(dt, vw, vh, u) {
    const alvo = int(70 * vw * vh / (540 * 960));
    while (this.flocos.length < alvo) {
      this.flocos.push([Math.random() * vw, Math.random() * vh - vh, 20 + Math.random() * 50,
        Math.random() * 6.28, 1.2 + Math.random() * 2.4]);
    }
    for (const f of this.flocos) {
      f[3] += dt;
      f[1] += f[2] * dt * u;
      f[0] += (Math.sin(f[3]) * 14 + 10) * dt * u;
      if (f[1] > vh + 5 || f[0] > vw + 5) {
        f[0] = Math.random() * vw - 30; f[1] = -5;
      }
    }
    if (this.flocos.length > alvo) this.flocos.length = alvo;
  }

  desenhar(tela, u) {
    tela.fillStyle = pg.css([246, 248, 252]);
    tela.beginPath();
    for (const f of this.flocos) {
      const r = Math.max(1, int(f[4] * u * 0.8));
      const x = int(f[0]), y = int(f[1]);
      tela.moveTo(x + r, y);
      tela.arc(x, y, r, 0, 6.283185307179586);
    }
    tela.fill();
  }
}

export function vinheta(vw, vh, forca = 200) {
  // bordas escurecidas (calculada pequena e esticada: fica suave)
  const p = pg.superficie(48, 48);
  const dados = p.createImageData(48, 48);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      const dx = (x - 23.5) / 23.5, dy = (y - 23.5) / 23.5;
      const d = Math.min(1.0, Math.hypot(dx, dy) / 1.38);
      const i = (y * 48 + x) * 4;
      dados.data[i] = 14; dados.data[i + 1] = 20; dados.data[i + 2] = 32;
      dados.data[i + 3] = int(forca * d ** 2.2);
    }
  }
  p.putImageData(dados, 0, 0);
  const g = pg.superficie(vw, vh);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  // estica de centro a centro dos pixels da borda, como o smoothscale
  g.drawImage(p.canvas, 0.5, 0.5, 47, 47, 0, 0, vw, vh);
  return g.canvas;
}

// ======================================================================
// Abertura
// ======================================================================
export async function toque_inicial(app) {
  // SÓ NO NAVEGADOR: o áudio só é liberado depois de um toque do jogador,
  // então a abertura (que começa com o som do logo) espera esse toque.
  let vin = null, t = 0.0;
  for (;;) {
    const dt = await app.tick();
    t += dt;
    for (const ev of app.eventos()) {
      if (ev.type === 'VIDEORESIZE') vin = null;
      if (ev.type === 'MOUSEBUTTONDOWN' || (ev.type === 'KEYDOWN' && ev.key !== 'escape')) {
        await app.som.acordar();
        return;
      }
    }
    const vw = app.vw, vh = app.vh, u = app.u;
    if (vin === null) vin = vinheta(vw, vh, 150);
    const tela = app.tela;
    tela.fillStyle = pg.css(C.NEVE);
    tela.fillRect(0, 0, vw, vh);
    tela.drawImage(vin, 0, 0);
    const pulso = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.2));
    const img = app.texto_grosso('TOQUE PARA COMEÇAR', Math.min(46 * u, vw * 0.085), C.BRANCO, int(3 * u));
    app.centro(img, vw / 2, vh / 2, int(255 * pulso));
    const rodape = app.texto_grosso('MERCURY STUDIOS', 18 * u, C.BRANCO, int(2 * u));
    pg.blit(tela, rodape, int(10 * u), int(vh - rodape.height - 8 * u));
  }
}

export async function splash(app, duracao = 3.2) {
  // MERCURY STUDIOS: aparece, fica e some. Um toque pula.
  try {
    app.som.tocar_buffer('logo_0', 0.9);
  } catch (_) { /* sem som: segue */ }
  let t = 0.0;
  let vin = null;
  while (t < duracao) {
    const dt = await app.tick();
    t += dt;
    for (const ev of app.eventos()) {
      const r = eventos_basicos(app, ev);
      if (r === 'sair') return 'sair';
      if (r === 'tamanho') vin = null;
      if (ev.type === 'MOUSEBUTTONDOWN' && t > 0.6) t = Math.max(t, duracao - 0.4);
    }
    const vw = app.vw, vh = app.vh, u = app.u;
    if (vin === null) vin = vinheta(vw, vh, 150);
    const tela = app.tela;
    tela.fillStyle = pg.css(C.NEVE);
    tela.fillRect(0, 0, vw, vh);
    tela.drawImage(vin, 0, 0);
    // aparece (0,6 s), fica, some (0,6 s)
    let a = Math.min(1.0, t / 0.6, (duracao - t) / 0.6);
    a = Math.max(0.0, a);
    const sobe = (1 - Math.min(1.0, t / 0.6)) * 18 * u;
    const cx = vw / 2, cy = vh / 2 + sobe;
    if (LOGO_STUDIO.complete && LOGO_STUDIO.naturalWidth > 0) {   // logo do estúdio (imagem sem fundo)
      const k = Math.min(vw * 0.55 / LOGO_STUDIO.naturalWidth, vh * 0.62 / LOGO_STUDIO.naturalHeight);
      const lw = LOGO_STUDIO.naturalWidth * k, lh = LOGO_STUDIO.naturalHeight * k;
      tela.save(); tela.globalAlpha = a; tela.imageSmoothingEnabled = true; tela.imageSmoothingQuality = 'high';
      tela.drawImage(LOGO_STUDIO, Math.round(cx - lw / 2), Math.round(cy - lh / 2), Math.round(lw), Math.round(lh));
      tela.restore();
      continue;
    }
    // planeta Mercúrio: círculo cinza em 2 tons + anel de órbita
    const r = 34 * u;
    const cam = pg.superficie(int(r * 6), int(r * 3));
    const ox = cam.canvas.width / 2, oy = cam.canvas.height / 2;
    const orbita = [int(ox - r * 2.6), int(oy - r * 0.6), int(r * 5.2), int(r * 1.2)];
    pg.elipse(cam, [31, 41, 55], orbita, Math.max(2, int(3 * u)));
    pg.circulo(cam, C.ESCURO, int(ox), int(oy), int(r + 3 * u));
    pg.circulo(cam, [150, 156, 168], int(ox), int(oy), int(r));
    pg.circulo(cam, [184, 190, 202], int(ox + r * 0.22), int(oy - r * 0.22), int(r * 0.68));
    for (const [px, py, pr] of [[-0.35, 0.3, 0.16], [0.3, 0.42, 0.1], [0.1, -0.2, 0.12]]) {   // crateras
      pg.circulo(cam, [128, 134, 148], int(ox + px * r), int(oy + py * r), Math.max(1, int(pr * r)));
    }
    pg.arco(cam, C.ESCURO, orbita, Math.PI * 1.05, Math.PI * 1.95, Math.max(2, int(3 * u)));
    pg.blit(tela, cam.canvas, int(cx - ox), int(cy - 70 * u - oy), int(255 * a));
    const t1 = app.texto_grosso('MERCURY', 96 * u, C.BRANCO, null, C.ESCURO, int(5 * u));
    const t2 = app.texto_grosso('S T U D I O S', 40 * u, C.BRANCO, int(4 * u));
    app.centro(t1, cx, cy + 18 * u, int(255 * a));
    app.centro(t2, cx, cy + 78 * u, int(255 * a));
  }
  return null;
}

// ======================================================================
// Carregamento
// ======================================================================
export async function carregamento(app, passos, minimo = 5.5) {
  // passos = [[texto, peso, gerador]]; cada gerador devolve 0..1 conforme anda.
  // A barra mostra o menor entre o progresso real e o tempo (para a 'demora').
  const total = passos.reduce((s, p) => s + p[1], 0) || 1.0;
  let feito = 0.0, i = 0;
  let frac_passo = 0.0;
  let mostrado = 0.0, t = 0.0, t_dica = 0.0;
  let dica = Math.floor(Math.random() * DICAS.length);
  let vin = null;
  let pronto_em = null;
  for (;;) {
    const dt = await app.tick();
    t += dt;
    t_dica += dt;
    for (const ev of app.eventos()) {
      const r = eventos_basicos(app, ev);
      if (r === 'sair') return 'sair';
      if (r === 'tamanho') vin = null;
      if (ev.type === 'MOUSEBUTTONDOWN') {   // toque troca a dica
        dica = (dica + 1) % DICAS.length; t_dica = 0.0;
      }
    }
    // trabalho de verdade: um pedaço do passo atual por quadro
    if (i < passos.length) {
      const gen = passos[i][2], peso = passos[i][1];
      const r = gen.next();
      frac_passo = r.done ? 1.0 : r.value;
      if (frac_passo >= 1.0) {
        feito += peso;
        i += 1; frac_passo = 0.0;
      }
    }
    const real = (feito + (i < passos.length ? passos[i][1] * frac_passo : 0)) / total;
    const alvo = Math.min(real, t / minimo);
    mostrado += (alvo - mostrado) * Math.min(1.0, dt * 6);
    if (i >= passos.length && mostrado > 0.995) {
      pronto_em = pronto_em !== null ? pronto_em : t;
      if (t - pronto_em > 0.35) return null;
    }
    if (t_dica > 3.5) {
      dica = (dica + 1) % DICAS.length; t_dica = 0.0;
    }

    // ---- desenho ----
    const vw = app.vw, vh = app.vh, u = app.u;
    const tela = app.tela;
    if (vin === null) vin = vinheta(vw, vh, 170);
    tela.fillStyle = pg.css(C.NEVE);
    tela.fillRect(0, 0, vw, vh);
    tela.drawImage(vin, 0, 0);
    if (_logo_pronto()) {   // logo do jogo no lugar do nome
      const [lw, lh] = _desenhar_logo(tela, vw / 2, vh * 0.31, vw * 0.7, vh * 0.42);
      _faixa_frente(tela, vw / 2, vh * 0.31 + lh / 2 + 10 * u, lw * 0.62, 9 * u, t);
    } else {
      const titulo = app.texto_grosso('GUARDIANS VS TROOPS', Math.min(84 * u, vw * 0.11), C.BRANCO, null, C.ESCURO, int(4 * u));
      app.centro(titulo, vw / 2, vh * 0.36);
      _faixa_frente(tela, vw / 2, vh * 0.36 + titulo.height / 2 + 8 * u, titulo.width * 0.8, 9 * u, t);
    }
    // barra clássica: moldura escura, fundo cinza, blocos verdes, brilho nenhum
    const bw = Math.min(vw * 0.78, 520 * u), bh = 30 * u;
    const bx = vw / 2 - bw / 2, by = vh * 0.6;
    ret_arred(tela, C.ESCURO, [bx - 5 * u, by - 5 * u, bw + 10 * u, bh + 10 * u], 9 * u);
    ret_arred(tela, [201, 207, 219], [bx, by, bw, bh], 5 * u);
    const n_blocos = 24;
    const larg_bloco = bw / n_blocos;
    const cheios = mostrado * n_blocos;
    for (let k = 0; k < n_blocos; k++) {
      const f = Math.min(1.0, cheios - k);
      if (f <= 0) break;
      const x0 = bx + k * larg_bloco + 2 * u;
      const wb = (larg_bloco - 4 * u) * f;
      pg.ret(tela, C.TIMES.verde.base, [int(x0), int(by + 3 * u), Math.max(1, int(wb)), int(bh - 6 * u)]);
      pg.ret(tela, C.TIMES.verde.topo, [int(x0), int(by + 3 * u), Math.max(1, int(wb)), int(4 * u)]);
    }
    const pct = app.texto_grosso(int(mostrado * 100 + 0.5) + '%', 30 * u, C.BRANCO, int(3 * u));
    app.centro(pct, vw / 2, by + bh / 2);
    const etapa = i < passos.length ? passos[i][0] : 'Pronto!';
    const pontos = '.'.repeat(1 + int(t * 2.5) % 3);
    const txt = app.fonte(22 * u).render(etapa + (i < passos.length ? pontos : ''), C.ESCURO);
    pg.blit(tela, txt, int(bx), int(by + bh + 14 * u));
    // dica
    const f = app.fonte(19 * u, false);
    let linha = 'Dica: ' + DICAS[dica];
    while (f.size(linha)[0] > vw - 24 * u && linha.length > 12) linha = linha.slice(0, -4) + '...';
    const img = f.render(linha, [70, 78, 94]);
    app.centro(img, vw / 2, vh * 0.82);
    const rodape = app.texto_grosso('MERCURY STUDIOS', 18 * u, C.BRANCO, int(2 * u));
    pg.blit(tela, rodape, int(10 * u), int(vh - rodape.height - 8 * u));
  }
}

export function _faixa_frente(tela, cx, y, w, h, t) {
  // faixa verde | vermelho com a linha de frente ondulada no meio (tema do jogo)
  const x0 = cx - w / 2;
  const meio = [];
  for (let k = 0; k < 9; k++) {
    const yy = y + h * k / 8;
    meio.push([cx + Math.sin(k * 1.3 + t * 1.5) * h * 0.5, yy]);
  }
  pg.ret(tela, C.ESCURO, [int(x0 - 3), int(y - 3), int(w + 6), int(h + 6)]);
  pg.poligono(tela, C.TIMES.verde.base, [[x0, y], meio[0]].concat(meio).concat([[x0, y + h]]));
  pg.poligono(tela, C.TIMES.vermelho.base, [[x0 + w, y], meio[0]].concat(meio).concat([[x0 + w, y + h]]));
}

// ======================================================================
// Batalha borrada no fundo
// ======================================================================
export class AutoVerde {
  // joga pelo verde no fundo do menu: compra cartas e manda atacar
  constructor() {
    this.t = 0.0;
  }

  jogar(T, dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1.0;
    const tipo = C.ORDEM_CARTAS[Math.floor(Math.random() * C.ORDEM_CARTAS.length)];
    if (T.carta_pronta(tipo)) {
      const [bx, by] = M.BASES.verde;
      const k = 0.25 + Math.random() * 0.3;
      const x = bx * (1 - k) + uniforme(-6, 6), y = by * (1 - k) + uniforme(-6, 6);
      if (T.pode_posicionar(x, y)) T.posicionar(tipo, x, y);
    }
    const inimigos = T.esquadroes.filter(q => q.time === 'vermelho' && q.sold.length);
    for (const q of T.esquadroes) {
      if (q.time !== 'verde' || !q.sold.length || q.destino) continue;
      let a;
      if (inimigos.length) {
        a = inimigos[0];
        let md = Math.hypot(a.x - q.x, a.y - q.y);
        for (const e of inimigos) {
          const d = Math.hypot(e.x - q.x, e.y - q.y);
          if (d < md) { md = d; a = e; }
        }
      } else {
        a = T.bases.vermelho;
      }
      const d = Math.hypot(a.x - q.x, a.y - q.y) || 1.0;
      const fica = q.alcance() - 1.5;
      if (d > fica + 0.5) {
        q.destino = [q.x + (a.x - q.x) / d * (d - fica), q.y + (a.y - q.y) / d * (d - fica)];
      }
    }
  }
}

export class FundoBatalha {
  // partida de verdade (tropas.js + cena.js) desenhada pequena e borrada
  constructor() {
    this.tropas = new Tropas(new Mudo());
    this.auto = new AutoVerde();
    this.cena = new Cena();
    this.cena.fx.mostrar_neve = false;   // o menu já tem a neve dele
    this.cam = new Camera();
    this.tempo = 0.0;
    this.quadro = 0;
    this.img = null;
    this.pequeno = null;
    this.borrado = false;
    this.camada = null;
    this.tam = null;
  }

  *preparar(vw, vh) {
    // gerador para a barra de carregamento: desenha o terreno e adianta a batalha
    this._tamanho(vw, vh);
    yield 0.3;
    for (let k = 0; k < 30; k++) {          // adianta ~45 s de batalha, um pedaço por quadro
      for (let n = 0; n < 30; n++) this.atualizar(0.05, false);
      yield 0.3 + 0.7 * (k + 1) / 30;
    }
    yield 1.0;
  }

  _tamanho(vw, vh) {
    // meia resolução: barato de desenhar e o borrado esconde
    const w = Math.max(160, Math.floor(vw / 2)), h = Math.max(160, Math.floor(vh / 2));
    this.cam.ajustar(w, h, true);
    let z = this.cam.niveis[0];
    for (const n of this.cam.niveis) if (Math.abs(n - 0.8) < Math.abs(z - 0.8)) z = n;
    this.cam.zoom = z;
    this.cam.prender();
    this.cena.preparar(this.cam.zoom);
    this.img = pg.superficie(w, h);
    this.pequeno = pg.superficie(Math.max(8, Math.floor(w / 5)), Math.max(8, Math.floor(h / 5)));
    this.pequeno.imageSmoothingEnabled = true;
    this.pequeno.imageSmoothingQuality = 'high';
    this.camada = pg.superficie(vw, vh);
    this.camada.fillStyle = pg.css([22, 34, 56, 70]);            // tom frio por cima
    this.camada.fillRect(0, 0, vw, vh);
    this.camada.drawImage(vinheta(vw, vh, 215), 0, 0);
    this.borrado = false;
    this.tam = [vw, vh];
  }

  atualizar(dt, desenhar = true) {
    const T = this.tropas;
    this.auto.jogar(T, dt);
    T.atualizar(dt);
    this.tempo += dt;
    if (T.fim) T.iniciar();   // acabou: começa outra
    // câmera segue a briga: tropas com alvo; senão o meio do mapa
    let foco = T.esquadroes.filter(q => q.alvo !== null && q.sold.length);
    if (!foco.length) foco = T.esquadroes.filter(q => q.sold.length);
    if (foco.length) {
      let fx = 0, fy = 0;
      for (const q of foco) { fx += iso.sx(q.x, q.y); fy += iso.sy(q.x, q.y); }
      fx /= foco.length; fy /= foco.length;
      const k = Math.min(1.0, dt * 0.6);
      this.cam.x += (fx - this.cam.x) * k;
      this.cam.y += (fy - this.cam.y) * k;
      this.cam.prender();
    }
  }

  desenhar(tela) {
    const vw = tela.canvas.width, vh = tela.canvas.height;
    if (!this.tam || this.tam[0] !== vw || this.tam[1] !== vh) this._tamanho(vw, vh);
    this.quadro += 1;
    if (!this.borrado || this.quadro % 2 === 0) {   // borra a cada 2 quadros
      this.cena.desenhar(this.img, this.cam, this.tropas, this.tempo, false);
      const w = this.img.canvas.width, h = this.img.canvas.height;
      this.pequeno.drawImage(this.img.canvas, 0, 0, w, h, 0, 0, this.pequeno.canvas.width, this.pequeno.canvas.height);
      this.borrado = true;
    }
    tela.imageSmoothingEnabled = true;
    tela.imageSmoothingQuality = 'high';
    const pw = this.pequeno.canvas.width, ph = this.pequeno.canvas.height;
    tela.drawImage(this.pequeno.canvas, 0.5, 0.5, pw - 1, ph - 1, 0, 0, vw, vh);
    tela.drawImage(this.camada.canvas, 0, 0);
  }
}

// ======================================================================
// Botões
// ======================================================================
export class Botao {
  constructor(ident, texto, icone, { principal = false, desligado = false, etiqueta = null } = {}) {
    this.ident = ident; this.texto = texto; this.icone = icone;
    this.principal = principal; this.desligado = desligado; this.etiqueta = etiqueta;
    this.r = [0, 0, 1, 1];
    this.sobre = false;
    this.aperto = 0.0;
  }

  dentro(pos) {
    const [x, y, w, h] = this.r;
    return x <= pos[0] && pos[0] < x + w && y <= pos[1] && pos[1] < y + h;
  }

  desenhar(app, tela, t) {
    const u = app.u;
    let [x, y, w, h] = this.r;
    const sobe = (this.sobre && !this.desligado ? -3 * u : 0) + this.aperto * 4 * u;
    y += sobe;
    const verde = C.TIMES.verde;
    let fundo, borda, cor_txt, cor_ic;
    if (this.desligado) {
      fundo = [214, 219, 228]; borda = [107, 116, 133]; cor_txt = [107, 116, 133]; cor_ic = [107, 116, 133];
    } else if (this.principal) {
      fundo = verde.base; borda = C.ESCURO; cor_txt = C.BRANCO; cor_ic = C.BRANCO;
    } else {
      fundo = C.BRANCO; borda = C.ESCURO; cor_txt = C.ESCURO; cor_ic = C.ESCURO;
    }
    // sombra chapada embaixo (o botão "em pé")
    ret_arred(tela, C.ESCURO, [x, y + 6 * u - sobe * 0.6, w, h], 12 * u);
    ret_arred(tela, fundo, [x, y, w, h], 12 * u);
    if (this.principal && !this.desligado) {   // faixa mais escura embaixo
      pg.ret(tela, verde.esq, [int(x + 10 * u), int(y + h - 9 * u), int(w - 20 * u), int(4 * u)]);
    }
    const cor_b = (this.sobre && !this.principal && !this.desligado) ? verde.esq : borda;
    ret_arred(tela, cor_b, [x, y, w, h], 12 * u, Math.max(3, int(3 * u)));
    // ícone
    const ix = x + 34 * u, iy = y + h / 2, s = 11 * u;
    _icone(tela, this.icone, ix, iy, s, cor_ic, fundo, t);
    // texto
    const img = app.fonte(30 * u).render(this.texto, cor_txt);
    pg.blit(tela, img, int(x + 64 * u), int(y + h / 2 - img.height / 2));
    if (this.etiqueta) {   // pílula vermelha à direita ("EM BREVE" no original; aqui avisa de convites)
      const f = app.fonte(15 * u);
      const et = f.render(this.etiqueta, C.BRANCO);
      const ew = et.width + 14 * u, eh = et.height + 6 * u;
      const ex = x + w - ew - 12 * u, ey = y + h / 2 - eh / 2;
      ret_arred(tela, C.TIMES.vermelho.emblema, [ex, ey, ew, eh], eh / 2);
      pg.blit(tela, et, int(ex + 7 * u), int(ey + 3 * u));
    }
  }
}

export function _icone(tela, nome, cx, cy, s, cor, fundo, t) {
  // ícones chapados desenhados por código
  if (nome === 'jogar') {
    pg.poligono(tela, cor, [[cx - s * 0.7, cy - s], [cx + s, cy], [cx - s * 0.7, cy + s]]);
  } else if (nome === 'multi') {
    for (const dx of [-0.55, 0.55]) {
      pg.circulo(tela, cor, int(cx + dx * s), int(cy - s * 0.45), int(s * 0.42));
      ret_arred(tela, cor, [cx + dx * s - s * 0.6, cy + s * 0.1, s * 1.2, s * 0.85], s * 0.4);
    }
  } else if (nome === 'config') {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8 + t * 0.4;
      const rr = i % 2 === 0 ? s : s * 0.72;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    pg.poligono(tela, cor, pts);
    pg.circulo(tela, fundo, int(cx), int(cy), Math.max(2, int(s * 0.35)));
  } else if (nome === 'sair') {
    pg.ret(tela, cor, [int(cx - s * 0.9), int(cy - s), int(s * 1.1), int(s * 2)], Math.max(2, int(s * 0.22)));
    pg.linha(tela, cor, [cx - s * 0.1, cy], [cx + s * 1.05, cy], Math.max(2, int(s * 0.28)));
    pg.poligono(tela, cor, [[cx + s * 1.25, cy], [cx + s * 0.6, cy - s * 0.5], [cx + s * 0.6, cy + s * 0.5]]);
  } else if (nome === 'voltar') {
    pg.linha(tela, cor, [cx - s * 0.8, cy], [cx + s, cy], Math.max(2, int(s * 0.28)));
    pg.poligono(tela, cor, [[cx - s * 1.1, cy], [cx - s * 0.3, cy - s * 0.6], [cx - s * 0.3, cy + s * 0.6]]);
  }
}

export function _passar_e_clicar(app, botoes, ev) {
  // hover (com som) e clique; devolve o ident do botão clicado
  if (ev.type === 'MOUSEMOTION') {
    for (const b of botoes) {
      const novo = b.dentro(ev.pos);
      if (novo && !b.sobre && !b.desligado) app.som.tocar('menu_passar');
      b.sobre = novo;
    }
  }
  if (ev.type === 'MOUSEBUTTONDOWN' && ev.button === 1) {
    for (const b of botoes) {
      if (b.dentro(ev.pos)) {
        b.aperto = 1.0;
        return b.ident;
      }
    }
  }
  return null;
}

// ======================================================================
// Menu principal
// ======================================================================
export async function menu_principal(app, fundo) {
  // devolve 'iniciar' ou 'sair'
  app.som.musica('guerra_fundo', 0.6);
  const botoes = [
    new Botao('iniciar', 'INICIAR', 'jogar', { principal: true }),
    new Botao('multi', 'MULTIPLAYER', 'multi'),
    new Botao('config', 'CONFIGURAÇÕES', 'config'),
    new Botao('sair', 'SAIR', 'sair'),
  ];
  const neve = new Neve();
  let t = 0.0, saindo = null, entrada = 0.0, quando = 0.0;
  let r_conta = null;   // cartão da conta (topo): toque abre o multiplayer
  for (;;) {
    const dt = await app.tick();
    t += dt;
    entrada = Math.min(1.0, entrada + dt / 0.6);
    const vw = app.vw, vh = app.vh, u = app.u;
    _layout_menu(app, botoes);
    botoes[1].etiqueta = multiplayer.etiqueta_menu(app);   // avisa de convite esperando
    if (app.rede && app.rede.partida && !saindo) {   // a batalha começou enquanto estava no menu
      app.som.parar_musica(900);
      return 'pvp';
    }
    // chegou convite ou abriu sala com a pessoa fora da tela MULTIPLAYER:
    // abre a tela sozinha, para os dois verem o convite / os botões PRONTO
    if (multiplayer.chamando(app) && !saindo) {
      const r_multi = await multiplayer.secao(app, fundo, neve);
      if (r_multi === 'sair') return 'sair';
      if (r_multi === 'batalha') {
        app.som.parar_musica(900);
        return 'pvp';
      }
      continue;
    }
    for (const ev of app.eventos()) {
      const r = eventos_basicos(app, ev);
      if (r === 'sair') return 'sair';
      if (r === 'voltar' && saindo === null) {   // voltar no menu = sair
        app.som.tocar('menu_voltar');
        saindo = 'sair'; quando = 0.0;
      }
      if (saindo) continue;
      let clicou = _passar_e_clicar(app, botoes, ev);
      if (!clicou && r_conta && ev.type === 'MOUSEBUTTONUP' && ev.button === 1 &&
          ev.pos[0] >= r_conta[0] && ev.pos[0] <= r_conta[0] + r_conta[2] && ev.pos[1] >= r_conta[1] && ev.pos[1] <= r_conta[1] + r_conta[3]) clicou = 'multi';
      if (clicou === 'iniciar') {
        // primeiro o MODO (versus IA ou versus zumbi), depois a NOVA PARTIDA
        // (tropas e dificuldade) e o carregamento. VOLTAR na nova partida volta ao modo.
        app.som.tocar('menu_clique');
        let r_np = null;
        for (;;) {
          const r_modo = await escolher_modo(app, fundo, neve);
          if (r_modo === 'sair') return 'sair';
          if (!r_modo) break;
          r_np = await nova_partida(app, fundo, neve);
          if (r_np !== null) break;
        }
        if (r_np === 'sair') return 'sair';
        if (r_np === 'jogar') { app.som.parar_musica(900); return 'iniciar'; }   // (o carregamento já escureceu a tela)
      } else if (clicou === 'multi') {
        app.som.tocar('menu_clique');
        const r_multi = await multiplayer.secao(app, fundo, neve);
        if (r_multi === 'sair') return 'sair';
        if (r_multi === 'batalha') {   // batalha entre jogadores (partida_pvp.js)
          app.som.parar_musica(900);
          return 'pvp';
        }
      } else if (clicou === 'config') {
        app.som.tocar('menu_clique');
        if (await opcoes(app, fundo, neve) === 'sair') return 'sair';
      } else if (clicou === 'sair') {
        app.som.tocar('menu_clique');
        saindo = 'sair'; quando = 0.0;
      }
    }
    for (const b of botoes) b.aperto = Math.max(0.0, b.aperto - dt * 5);
    fundo.atualizar(dt);
    neve.atualizar(dt, vw, vh, u);

    const tela = app.tela;
    fundo.desenhar(tela);
    neve.desenhar(tela, u);
    _titulo(app, tela, t, entrada);
    botoes.forEach((b, k) => {   // botões entram um depois do outro
      const e = Math.max(0.0, Math.min(1.0, entrada * 1.6 - k * 0.15));
      if (e < 1) {
        const [x, y, w, h] = b.r;
        b.r = [x, y + (1 - e) ** 2 * 60 * u, w, h];
      }
      b.desenhar(app, tela, t);
    });
    r_conta = _cartao_menu(app, tela, entrada);
    const rodape = app.texto_grosso('MERCURY STUDIOS', 20 * u, C.BRANCO, int(3 * u));
    pg.blit(tela, rodape, int(12 * u), int(vh - rodape.height - 10 * u));
    const ver = app.texto_grosso(VERSAO_JOGO, 18 * u, C.BRANCO, int(3 * u));
    pg.blit(tela, ver, int(vw - ver.width - 12 * u), int(vh - ver.height - 10 * u));
    if (saindo) {   // escurece e vai
      quando += dt;
      const cor = saindo === 'sair' ? C.ESCURO : C.NEVE;
      tela.fillStyle = pg.css([cor[0], cor[1], cor[2], int(255 * Math.min(1.0, quando / 0.7))]);
      tela.fillRect(0, 0, vw, vh);
      if (quando >= 0.75) {
        if (saindo === 'iniciar') app.som.parar_musica(900);
        return saindo;
      }
    }
  }
}

function _layout_menu(app, botoes) {
  const vw = app.vw, vh = app.vh, u = app.u;
  const w = Math.min(380 * u, vw * 0.84);
  const h = 62 * u;
  const vao = 16 * u;
  const total = botoes.length * h + (botoes.length - 1) * vao;
  const y0 = vh > vw ? Math.max(vh * 0.5, vh - total - 70 * u) : vh * 0.46;
  botoes.forEach((b, k) => {
    b.r = [vw / 2 - w / 2, y0 + k * (h + vao), w, h];
  });
}

function _cartao_menu(app, tela, entrada) {
  // CONTA no menu: deitado fica no canto de cima; em pé, entre o logo e os botões.
  // Logado: ícone, nome, troféus e likes. Sem conta: convite para entrar/criar.
  const u = app.u, vw = app.vw, vh = app.vh;
  const deitado = vw > vh * 1.15;
  const h = int(46 * u), alfa = Math.min(1, entrada * 1.5);
  const eu = app.rede && app.rede.eu;
  tela.save(); tela.globalAlpha = alfa;
  let r;
  if (eu) {
    const wmax = deitado ? Math.min(260 * u, vw * 0.2 + 60 * u) : Math.min(vw - 24 * u, 300 * u);
    const w = multiplayer.largura_cartao(app, eu, wmax);
    const x = deitado ? int(12 * u) : int(vw / 2 - w / 2), y = deitado ? int(12 * u) : int(vh * 0.37);
    r = multiplayer.cartao_conta(app, tela, eu, x, y, wmax, h);
  } else {
    const txt = 'ENTRAR COM O GOOGLE', f = app.fonte(15 * u);
    const w = f.size(txt)[0] + int(70 * u);
    const x = deitado ? int(12 * u) : int(vw / 2 - w / 2), y = deitado ? int(12 * u) : int(vh * 0.37);
    pg.ret(tela, C.ESCURO, [x, y + int(4 * u), w, h], 0, int(12 * u));
    pg.ret(tela, C.BRANCO, [x, y, w, h], 0, int(12 * u));
    pg.ret(tela, C.ESCURO, [x, y, w, h], Math.max(2, int(2 * u)), int(12 * u));
    icones.avatar(tela, 0, x + 25 * u, y + h / 2, 17 * u);
    const im = f.render(txt, C.ESCURO);
    pg.blit(tela, im, int(x + 50 * u), int(y + h / 2 - im.height / 2));
    r = [x, y, w, h];
  }
  tela.restore();
  return r;
}

function _titulo(app, tela, t, entrada) {
  // nome do jogo bem grande (duas linhas em pé, uma deitado) + faixa da frente
  const vw = app.vw, vh = app.vh, u = app.u;
  const em_pe = vh > vw;
  const linhas = em_pe ? ['GUARDIANS', 'VS TROOPS'] : ['GUARDIANS VS TROOPS'];
  const alvo_w = vw * (em_pe ? 0.86 : 0.7);
  let tam = 160 * u;
  const f = app.fonte(100);
  const larg = Math.max(...linhas.map(l => f.size(l)[0])) || 1;
  tam = Math.min(tam, 100 * alvo_w / larg);
  let y = vh * (em_pe ? 0.15 : 0.17);
  const queda = (1 - entrada) ** 2 * -40 * u;
  if (_logo_pronto()) {   // logo do jogo no lugar do nome (cabe acima dos botões)
    const topo = vh * 0.025, limite = em_pe ? vh * 0.36 : vh * 0.46 - 64 * u;
    const hmax = Math.max(40 * u, limite - topo), wmax = vw * (em_pe ? 0.9 : 0.6);
    const k = Math.min(wmax / LOGO.naturalWidth, hmax / LOGO.naturalHeight);
    const lh = LOGO.naturalHeight * k, cy = topo + lh / 2 + queda;
    const [lw] = _desenhar_logo(tela, vw / 2, cy, wmax, hmax, Math.min(1, 0.3 + entrada));
    _faixa_frente(tela, vw / 2, cy + lh / 2 + 10 * u, lw * 0.6, 11 * u, t);
    const sub = app.texto_grosso('BATALHA NA NEVE', 26 * u, C.BRANCO, int(3 * u));
    app.centro(sub, vw / 2, cy + lh / 2 + 42 * u);
    return;
  }
  const imgs = linhas.map(l => app.texto_grosso(l, tam, C.BRANCO, Math.max(4, int(tam * 0.075)), C.ESCURO, Math.max(3, int(tam * 0.06))));
  for (const img of imgs) {
    app.centro(img, vw / 2, y + queda + img.height / 2);
    y += img.height * 0.82;
  }
  _faixa_frente(tela, vw / 2, y + queda + 14 * u, imgs[0].width * 0.7, 11 * u, t);
  const sub = app.texto_grosso('BATALHA NA NEVE', 26 * u, C.BRANCO, int(3 * u));
  app.centro(sub, vw / 2, y + queda + 52 * u);
}

export function _toast(app, tela, txt, resta, yfrac = 0.42) {
  const u = app.u;
  const f = app.fonte(21 * u);
  const img = f.render(txt, C.BRANCO);
  const w = img.width + 30 * u, h = img.height + 18 * u;
  const x = app.vw / 2 - w / 2, y = app.vh * yfrac - h / 2;
  tela.globalAlpha = Math.max(0, Math.min(1.0, resta / 0.4));
  ret_arred(tela, [C.ESCURO[0], C.ESCURO[1], C.ESCURO[2], 235], [x, y, w, h], h / 2);
  pg.blit(tela, img, int(x + 15 * u), int(y + 9 * u));
  tela.globalAlpha = 1;
}

// ======================================================================
// Configurações
// ======================================================================
// ======================================================================
// MODO DE JOGO (ao tocar em INICIAR): versus IA ou versus zumbi
// ======================================================================
export async function escolher_modo(app, fundo, neve) {
  // devolve 'normal' / 'zumbi' (já salvo em op.modo), null (voltou) ou 'sair'
  const op = app.op;
  const voltar = new Botao('voltar', 'VOLTAR', 'voltar');
  const MODOS = [
    { id: 'normal', titulo: 'MODO NORMAL', sub: 'VERSUS IA', cor: C.TIMES.verde.base,
      linhas: ['O comandante inimigo constrói bases,', 'treina tropas e ataca em ondas.', 'Destrua o QG vermelho.'] },
    { id: 'zumbi', titulo: 'VERSUS ZUMBI', sub: 'HORDA', cor: [132, 118, 70],
      linhas: ['Uma nave caída solta hordas de zumbis', 'pelas estradas e pela neve.', 'Segure a linha e destrua a nave.'] },
  ];
  let t = 0.0, passa = -1;
  for (;;) {
    const dt = await app.tick();
    t += dt;
    const vw = app.vw, vh = app.vh, u = app.u;
    const pw = Math.min(720 * u, vw * 0.95), pad = 22 * u, cab = 62 * u, gap = 16 * u;
    const kv = Math.max(0.6, Math.min(1, (vh - 10 * u - cab) / (300 * u)));
    const ph = cab + 300 * u * kv;
    const px = vw / 2 - pw / 2, py = Math.max(4 * u, vh / 2 - ph / 2);
    const cw = (pw - 2 * pad - gap) / 2, chh = 200 * u * kv;
    const r_modos = MODOS.map((m, i) => [px + pad + i * (cw + gap), py + cab + 16 * u * kv, cw, chh]);
    const bw = Math.min(250 * u, pw - 2 * pad);
    voltar.r = [vw / 2 - bw / 2, py + cab + 16 * u * kv + chh + 18 * u * kv, bw, 56 * u * kv];
    if (multiplayer.chamando(app)) return null;
    for (const ev of app.eventos()) {
      const r = eventos_basicos(app, ev);
      if (r === 'sair') return 'sair';
      if (r === 'voltar') { app.som.tocar('menu_voltar'); return null; }
      const clicou = _passar_e_clicar(app, [voltar], ev);
      if (clicou === 'voltar') { app.som.tocar('menu_voltar'); return null; }
      if (ev.type === 'MOUSEMOTION' || ev.type === 'MOUSEBUTTONDOWN') {
        const [mx, my] = ev.pos;
        passa = r_modos.findIndex(rr => rr[0] <= mx && mx < rr[0] + rr[2] && rr[1] <= my && my < rr[1] + rr[3]);
        if (ev.type === 'MOUSEBUTTONDOWN' && ev.button === 1 && passa >= 0) {
          op.modo = MODOS[passa].id;
          OP.salvar(app.pasta, op);
          app.som.tocar('menu_iniciar');
          return op.modo;
        }
      }
    }
    voltar.aperto = Math.max(0.0, voltar.aperto - dt * 5);
    fundo.atualizar(dt);
    neve.atualizar(dt, vw, vh, u);
    const tela = app.tela;
    fundo.desenhar(tela);
    neve.desenhar(tela, u);
    painel(app, tela, px, py, pw, ph, 'ESCOLHA O MODO');
    const f_tit = app.fonte(24 * u), f_sub = app.fonte(15 * u), f_txt = app.fonte(14 * u, false);
    MODOS.forEach((m, i) => {
      const rr = r_modos[i], sel = op.modo === m.id, sobre = passa === i;
      const sobe = sobre ? 3 * u : 0;
      const r2 = [rr[0], rr[1] - sobe, rr[2], rr[3]];
      ret_arred(tela, C.ESCURO, [rr[0], rr[1] + 5 * u, rr[2], rr[3]], 14 * u);
      ret_arred(tela, sel ? [255, 250, 236] : C.BRANCO, r2, 14 * u);
      ret_arred(tela, m.cor, [r2[0], r2[1], r2[2], 64 * u * kv], 14 * u);
      pg.ret(tela, m.cor, [int(r2[0]), int(r2[1] + 32 * u * kv), int(r2[2]), int(32 * u * kv)]);
      ret_arred(tela, sel || sobre ? m.cor : C.ESCURO, r2, 14 * u, Math.max(2, int((sel || sobre ? 4 : 2.5) * u)));
      app.centro(f_tit.render(m.titulo, C.BRANCO), r2[0] + r2[2] / 2, r2[1] + 24 * u * kv);
      app.centro(f_sub.render(m.sub, [240, 244, 236]), r2[0] + r2[2] / 2, r2[1] + 48 * u * kv);
      _icone_modo(tela, m.id, r2[0] + r2[2] / 2, r2[1] + 92 * u * kv, u * kv, t);
      m.linhas.forEach((l, k) => app.centro(f_txt.render(l, C.ESCURO), r2[0] + r2[2] / 2, r2[1] + (128 + k * 19) * u * kv));
      if (sel) app.centro(app.fonte(12 * u).render('ÚLTIMO ESCOLHIDO', m.cor), r2[0] + r2[2] / 2, r2[1] + r2[3] - 12 * u * kv);
    });
    voltar.desenhar(app, tela, t);
  }
}

function _icone_modo(tela, modo, cx, cy, k, t) {
  // desenho pequeno no cartão: duas bandeiras (versus IA) ou uma cabeça de fungo (zumbi)
  if (modo === 'normal') {
    for (const [dx, cor] of [[-22, C.TIMES.verde.base], [22, C.TIMES.vermelho.base]]) {
      pg.linha(tela, C.ESCURO, [cx + dx * k, cy + 18 * k], [cx + dx * k, cy - 18 * k], Math.max(2, int(3 * k)));
      const b = Math.sin(t * 3 + dx) * 2 * k;
      pg.poligono(tela, cor, [[cx + dx * k, cy - 18 * k], [cx + (dx + (dx < 0 ? 18 : -18)) * k, cy - 13 * k + b], [cx + dx * k, cy - 6 * k]]);
    }
    return;
  }
  pg.circulo(tela, [132, 148, 118], cx, cy + 2 * k, int(16 * k));
  for (const [ax, ay, r, cor] of [[-8, -8, 8, [184, 156, 104]], [6, -10, 7, [214, 194, 148]], [10, 2, 6, [206, 124, 58]], [-11, 4, 5, [214, 194, 148]], [0, -16, 6, [138, 108, 68]]]) {
    pg.circulo(tela, cor, cx + ax * k, cy + ay * k + Math.sin(t * 2 + ax) * 0.8 * k, int(r * k));
  }
  pg.circulo(tela, [58, 22, 24], cx + 4 * k, cy + 9 * k, int(4 * k));
}

// ======================================================================
// NOVA PARTIDA (solo): tropas terrestres por jogador e dificuldade da IA
// ======================================================================
export async function nova_partida(app, fundo, neve) {
  // devolve 'jogar', null (voltou) ou 'sair'. As escolhas ficam salvas.
  const op = app.op;
  if (!C.LIMITES_TROPA.includes(op.limite_tropas)) op.limite_tropas = 500;
  if (![1, 2, 3].includes(op.ia)) op.ia = 1;
  if (![1, 2, 3].includes(op.horda)) op.horda = 1;
  const zumbi = op.modo === 'zumbi';
  const voltar = new Botao('voltar', 'VOLTAR', 'voltar');
  const jogar = new Botao('jogar', 'JOGAR', 'jogar', { principal: true });
  let t = 0.0, carregando = -1;   // >= 0: tela de carregamento (segundos)
  const DICAS = zumbi ? ['Preparando o campo de batalha...', 'Cavando trincheiras na neve...', 'Algo caiu do céu...', 'Os esporos estão se espalhando...']
    : ['Preparando o campo de batalha...', 'Cavando trincheiras na neve...', 'Abastecendo os tanques...', 'Chamando o comandante inimigo...'];
  for (;;) {
    const dt = await app.tick();
    t += dt;
    const vw = app.vw, vh = app.vh, u = app.u;
    // medidas (cabe até em celular deitado)
    const pw = Math.min(680 * u, vw * 0.95);
    const pad = 22 * u, cab = 62 * u;
    // tela baixa: o miolo encolhe na vertical para tudo caber
    const precisa = 14 + 26 + 50 + 26 + 34 + 98 + 14 + 58 + 18;
    const kv = Math.max(0.62, Math.min(1, (vh - 10 * u - cab) / (precisa * u)));
    const V = (n) => n * u * kv;
    const ph = cab + V(precisa);
    const px = vw / 2 - pw / 2, py = Math.max(4 * u, vh / 2 - ph / 2);
    let y = py + cab + V(14);
    const y_tit1 = y; y += V(26);
    const n = C.LIMITES_TROPA.length, gap = 12 * u;
    const ow = (pw - 2 * pad - gap * (n - 1)) / n;
    const r_lim = C.LIMITES_TROPA.map((v, i) => [px + pad + i * (ow + gap), y, ow, V(46)]);
    y += V(50);
    const y_aviso = y; y += V(26);
    const y_tit2 = y + V(6); y += V(34);
    const r_ia = [1, 2, 3].map((v, i) => [px + pad + i * (ow + gap), y, ow, V(92)]);
    y += V(98) + V(14);
    const bw = Math.min(250 * u, (pw - 2 * pad - gap) / 2);
    voltar.r = [vw / 2 - gap / 2 - bw, y, bw, V(56)];
    jogar.r = [vw / 2 + gap / 2, y, bw, V(56)];
    if (multiplayer.chamando(app)) return null;
    for (const ev of app.eventos()) {
      const r = eventos_basicos(app, ev);
      if (r === 'sair') return 'sair';
      if (carregando >= 0) continue;
      if (r === 'voltar') { app.som.tocar('menu_voltar'); return null; }
      const clicou = _passar_e_clicar(app, [voltar, jogar], ev);
      if (clicou === 'voltar') { app.som.tocar('menu_voltar'); return null; }
      if (clicou === 'jogar') { app.som.tocar('menu_iniciar'); OP.salvar(app.pasta, op); carregando = 0; continue; }
      if (ev.type === 'MOUSEBUTTONDOWN' && ev.button === 1) {
        const [mx, my] = ev.pos;
        const dentro = (rr) => rr[0] <= mx && mx < rr[0] + rr[2] && rr[1] <= my && my < rr[1] + rr[3];
        C.LIMITES_TROPA.forEach((v, i) => { if (dentro(r_lim[i])) { op.limite_tropas = v; app.som.tocar(v === 750 ? 'erro' : 'menu_clique'); OP.salvar(app.pasta, op); } });
        [1, 2, 3].forEach((v, i) => { if (dentro(r_ia[i])) { if (zumbi) op.horda = v; else op.ia = v; app.som.tocar('menu_clique'); OP.salvar(app.pasta, op); } });
      }
    }
    voltar.aperto = Math.max(0.0, voltar.aperto - dt * 5);
    jogar.aperto = Math.max(0.0, jogar.aperto - dt * 5);
    fundo.atualizar(dt);
    neve.atualizar(dt, vw, vh, u);
    const tela = app.tela;
    fundo.desenhar(tela);
    neve.desenhar(tela, u);
    if (carregando >= 0) {   // TELA DE CARREGAMENTO
      carregando += dt;
      _carregamento(app, tela, carregando, DICAS[Math.min(DICAS.length - 1, Math.floor(carregando / 0.45))]);
      if (carregando >= 1.9) return 'jogar';
      continue;
    }
    painel(app, tela, px, py, pw, ph, zumbi ? 'NOVA PARTIDA · ZUMBI' : 'NOVA PARTIDA');
    const f_tit = app.fonte(19 * u), f_txt = app.fonte(15 * u, false), f_peq = app.fonte(13 * u, false);
    pg.blit(tela, f_tit.render('TROPAS TERRESTRES POR JOGADOR', C.ESCURO), int(px + pad), int(y_tit1));
    C.LIMITES_TROPA.forEach((v, i) => {
      const sel = op.limite_tropas === v, rr = r_lim[i];
      ret_arred(tela, C.ESCURO, [rr[0], rr[1] + 4 * u, rr[2], rr[3]], 11 * u);
      ret_arred(tela, sel ? (v === 750 ? [236, 128, 40] : C.TIMES.verde.base) : C.BRANCO, rr, 11 * u);
      ret_arred(tela, C.ESCURO, rr, 11 * u, Math.max(2, int(2.5 * u)));
      app.centro(app.fonte(24 * u).render(String(v), sel ? C.BRANCO : C.ESCURO), rr[0] + rr[2] / 2, rr[1] + rr[3] / 2);
    });
    if (op.limite_tropas === 750) {
      const pul = 0.75 + 0.25 * Math.sin(t * 5);
      const img = f_txt.render('⚠ Pode ter quedas de FPS e travadas, dependendo do aparelho.', [Math.round(196 * pul), Math.round(84 * pul), 20]);
      pg.blit(tela, img, int(px + pad), int(y_aviso + 2 * u));
    } else {
      pg.blit(tela, f_peq.render(op.limite_tropas === 250 ? 'Leve: bom para aparelhos mais simples.' : 'Recomendado.', [107, 116, 133]), int(px + pad), int(y_aviso + 4 * u));
    }
    pg.blit(tela, f_tit.render(zumbi ? 'TAMANHO DA HORDA' : 'DIFICULDADE DA IA', C.ESCURO), int(px + pad), int(y_tit2));
    [1, 2, 3].forEach((v, i) => {
      const d = zumbi ? NIVEIS_HORDA[v] : C.DIFICULDADES[v], sel = (zumbi ? op.horda : op.ia) === v, rr = r_ia[i];
      const cor = [C.TIMES.verde.base, [236, 128, 40], C.TIMES.vermelho.base][i];
      ret_arred(tela, C.ESCURO, [rr[0], rr[1] + 4 * u, rr[2], rr[3]], 12 * u);
      ret_arred(tela, sel ? [255, 250, 236] : C.BRANCO, rr, 12 * u);
      ret_arred(tela, cor, [rr[0], rr[1], rr[2], 30 * u], 12 * u);
      pg.ret(tela, cor, [int(rr[0]), int(rr[1] + 15 * u), int(rr[2]), int(15 * u)]);
      ret_arred(tela, sel ? cor : C.ESCURO, rr, 12 * u, Math.max(2, int((sel ? 4 : 2.5) * u)));
      app.centro(app.fonte(17 * u).render(`${d.nome} · ${d.titulo.toUpperCase()}`, C.BRANCO), rr[0] + rr[2] / 2, rr[1] + 15 * u);
      // texto em até 3 linhas
      const palavras = d.linha.split(' '), linhas = [];
      let atual = '';
      for (const p of palavras) {
        const tst = atual ? atual + ' ' + p : p;
        if (f_peq.size(tst)[0] > rr[2] - 16 * u && atual) { linhas.push(atual); atual = p; } else atual = tst;
      }
      if (atual) linhas.push(atual);
      linhas.slice(0, 3).forEach((l, k) => { const yy = rr[1] + 36 * u + k * 17 * u; if (yy + 12 * u < rr[1] + rr[3]) pg.blit(tela, f_peq.render(l, C.ESCURO), int(rr[0] + 8 * u), int(yy)); });
      if (sel) {   // visto no canto
        const cx = rr[0] + rr[2] - 13 * u, cy = rr[1] + rr[3] - 13 * u;
        pg.circulo(tela, cor, cx, cy, int(9 * u));
        pg.linha(tela, C.BRANCO, [cx - 4 * u, cy], [cx - 1 * u, cy + 3 * u], Math.max(2, int(2 * u)));
        pg.linha(tela, C.BRANCO, [cx - 1 * u, cy + 3 * u], [cx + 4 * u, cy - 3 * u], Math.max(2, int(2 * u)));
      }
    });
    voltar.desenhar(app, tela, t);
    jogar.desenhar(app, tela, t);
  }
}

function _carregamento(app, tela, tc, dica) {
  // tela de carregamento: escurece, barra enchendo e uma dica
  const vw = app.vw, vh = app.vh, u = app.u;
  const k = Math.min(1, tc / 0.35);
  tela.fillStyle = pg.css([31, 41, 55, int(235 * k)]);
  tela.fillRect(0, 0, vw, vh);
  if (k < 1) return;
  app.centro(app.texto_grosso('GUARDIANS VS TROOPS', 40 * u, C.BRANCO, int(3 * u)), vw / 2, vh / 2 - 60 * u);
  const bw = Math.min(420 * u, vw * 0.7), bh = 18 * u, bx = vw / 2 - bw / 2, by = vh / 2 - bh / 2;
  const p = Math.min(1, (tc - 0.35) / 1.45);
  ret_arred(tela, [55, 65, 81], [bx, by, bw, bh], bh / 2);
  if (p > 0.02) ret_arred(tela, C.TIMES.verde.base, [bx, by, bw * p, bh], bh / 2);
  ret_arred(tela, C.BRANCO, [bx, by, bw, bh], bh / 2, Math.max(2, int(2 * u)));
  app.centro(app.fonte(18 * u, false).render(`${dica}  ${Math.round(p * 100)}%`, [201, 207, 219]), vw / 2, by + bh + 26 * u);
  const op = app.op, zb = op.modo === 'zumbi', d = zb ? NIVEIS_HORDA[op.horda] || NIVEIS_HORDA[1] : C.DIFICULDADES[op.ia];
  app.centro(app.fonte(15 * u, false).render(`${zb ? 'Versus zumbi · ' : ''}${op.limite_tropas} tropas por jogador · ${d.nome} ${d.titulo}`, [150, 160, 176]), vw / 2, by + bh + 54 * u);
}

export async function opcoes(app, fundo, neve) {
  // painel por cima do mesmo fundo; tudo muda na hora e é salvo
  const op = app.op;
  const voltar = new Botao('voltar', 'VOLTAR', 'voltar', { principal: true });
  const linhas = [['volume', 'Volume'], ['musica', 'Som de guerra'], ['efeitos', 'Efeitos sonoros'],
    ['tela_cheia', 'Tela cheia'], ['fps', 'Mostrar FPS'], ['tutorial', 'Ativar tutorial']];
  let t = 0.0;
  for (;;) {
    const dt = await app.tick();
    t += dt;
    const vw = app.vw, vh = app.vh, u = app.u;
    // as linhas encolhem um pouco se o painel não couber na altura da tela
    const lh = Math.max(46 * u, Math.min(66 * u, (vh * 0.97 - 7 * u - 182 * u) / linhas.length));
    const pw = Math.min(470 * u, vw * 0.9), ph = 86 * u + linhas.length * lh + 96 * u;
    const px = vw / 2 - pw / 2, py = Math.max(2 * u, vh / 2 - ph / 2 - 3 * u);
    const alvos = {};
    let y = py + 80 * u;
    for (const [chave] of linhas) {
      alvos[chave] = y;
      y += lh;
    }
    voltar.r = [vw / 2 - 130 * u, y + 10 * u, 260 * u, 58 * u];
    if (multiplayer.chamando(app)) return null;   // convite/sala: volta ao menu, que abre o MULTIPLAYER
    for (const ev of app.eventos()) {
      const r = eventos_basicos(app, ev);
      if (r === 'sair') return 'sair';
      if (r === 'voltar') {
        app.som.tocar('menu_voltar');
        return null;
      }
      if (_passar_e_clicar(app, [voltar], ev) === 'voltar') {
        app.som.tocar('menu_voltar');
        return null;
      }
      if (ev.type === 'MOUSEBUTTONDOWN' && ev.button === 1) {
        const [mx, my] = ev.pos;
        for (const chave in alvos) {
          const yy = alvos[chave];
          if (!(yy <= my && my < yy + lh - 4 * u && px <= mx && mx < px + pw)) continue;
          if (chave === 'volume') {
            const menos = mx < px + pw - 186 * u;   // botão [-]
            const mais = mx > px + pw - 60 * u;     // botão [+]
            if (menos || mais) {
              op.volume = Math.round(Math.max(0.0, Math.min(1.0, op.volume + (menos ? -0.1 : 0.1))) * 100) / 100;
            }
          } else if (chave === 'tela_cheia' && app.movel) {
            op.tela_cheia = true;   // no celular é sempre tela cheia
          } else if (chave === 'tela_cheia' && app.no_android) {
            app.som.tocar('erro');
            break;
          } else {
            op[chave] = !op[chave];
          }
          app.som.aplicar({ volume: op.volume, efeitos: op.efeitos, musica: op.musica });
          if (chave === 'tela_cheia') _tela_cheia(app, op.tela_cheia);
          app.som.tocar('menu_clique');
          OP.salvar(app.pasta, op);
        }
      }
    }
    voltar.aperto = Math.max(0.0, voltar.aperto - dt * 5);
    fundo.atualizar(dt);
    neve.atualizar(dt, vw, vh, u);

    const tela = app.tela;
    fundo.desenhar(tela);
    neve.desenhar(tela, u);
    // painel
    painel(app, tela, px, py, pw, ph, 'CONFIGURAÇÕES');
    for (const [chave, nome] of linhas) {
      const yy = alvos[chave];
      const desl = chave === 'tela_cheia' && app.no_android;
      const img = app.fonte(25 * u).render(nome, desl ? [107, 116, 133] : C.ESCURO);
      const meio = yy + (lh - 6 * u) / 2;   // centro da linha
      pg.blit(tela, img, int(px + 24 * u), int(meio - img.height / 2));
      if (chave === 'volume') _controle_volume(app, tela, px + pw - 224 * u, meio - 19 * u, op.volume);
      else _chave(app, tela, px + pw - 100 * u, meio - 18 * u, chave === 'tela_cheia' && app.movel ? true : op[chave], desl);
      pg.linha(tela, [226, 230, 237], [px + 18 * u, yy + lh - 6 * u], [px + pw - 18 * u, yy + lh - 6 * u], Math.max(1, int(u)));
    }
    voltar.desenhar(app, tela, t);
  }
}

export function painel(app, tela, px, py, pw, ph, titulo) {
  // o painel das CONFIGURAÇÕES: branco, borda escura, sombra chapada e
  // cabeçalho verde-escuro com o título em texto grosso
  const u = app.u;
  ret_arred(tela, C.ESCURO, [px, py + 7 * u, pw, ph], 16 * u);
  ret_arred(tela, C.BRANCO, [px, py, pw, ph], 16 * u);
  ret_arred(tela, C.ESCURO, [px, py, pw, ph], 16 * u, Math.max(3, int(3 * u)));
  const cab = 62 * u;
  ret_arred(tela, C.TIMES.verde.esq, [px, py, pw, cab], 16 * u);
  pg.ret(tela, C.TIMES.verde.esq, [int(px), int(py + cab / 2), int(pw), int(cab / 2)]);
  app.centro(app.texto_grosso(titulo, 38 * u, C.BRANCO, int(3 * u)), px + pw / 2, py + cab / 2);
}

export function _chave(app, tela, x, y, ligado, desligado = false) {
  // interruptor liga/desliga no estilo do jogo
  const u = app.u;
  const w = 76 * u, h = 36 * u;
  const cor = desligado ? [190, 196, 208] : (ligado ? C.TIMES.verde.base : [201, 207, 219]);
  ret_arred(tela, C.ESCURO, [x - 3, y - 3, w + 6, h + 6], h);
  ret_arred(tela, cor, [x, y, w, h], h);
  const bx = x + (ligado ? w - h / 2 - 3 * u : h / 2 + 3 * u);
  pg.circulo(tela, C.ESCURO, int(bx), int(y + h / 2 + 2 * u), int(h / 2 - 2 * u));
  pg.circulo(tela, C.BRANCO, int(bx), int(y + h / 2), int(h / 2 - 4 * u));
  const txt = app.fonte(15 * u).render(ligado ? 'SIM' : 'NÃO', ligado ? C.BRANCO : C.ESCURO);
  const tx = ligado ? x + 10 * u : x + w - txt.width - 10 * u;
  pg.blit(tela, txt, int(tx), int(y + h / 2 - txt.height / 2));
}

function _controle_volume(app, tela, x, y, vol) {
  // [-] barra em 10 blocos [+]
  const u = app.u;
  for (const [k, sinal] of [[0, '-'], [1, '+']]) {
    const bx = x + k * (170 * u);
    ret_arred(tela, C.ESCURO, [bx - 2, y - 2, 34 * u + 4, 38 * u + 4], 8 * u);
    ret_arred(tela, C.BRANCO, [bx, y, 34 * u, 38 * u], 8 * u);
    app.centro(app.fonte(30 * u).render(sinal, C.ESCURO), bx + 17 * u, y + 19 * u);
  }
  const n = Math.round(vol * 10);
  for (let i = 0; i < 10; i++) {
    const bx = x + 42 * u + i * 12.2 * u;
    const hb = (10 + i * 2.6) * u;
    const cor = i < n ? C.TIMES.verde.base : [201, 207, 219];
    pg.ret(tela, C.ESCURO, [int(bx - 1), int(y + 38 * u - hb - 1), int(9 * u + 2), int(hb + 2)]);
    pg.ret(tela, cor, [int(bx), int(y + 38 * u - hb), int(9 * u), int(hb)]);
  }
}

function _tela_cheia(app, sim) {
  // liga/desliga tela cheia (onde o navegador deixa)
  try {
    if (sim) {
      const p = document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(() => { app.op.tela_cheia = false; });
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  } catch (_) {
    app.op.tela_cheia = false;
  }
}
