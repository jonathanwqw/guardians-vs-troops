// cena.js — desenha um quadro do jogo, nesta ordem:
//
//     1. terreno (imagem pronta: lotes, estradas, frente, sombras)
//     2. [mapa lógico, se ligado] + marcas de seleção/destino
//     3. tudo que tem altura, ordenado por profundidade (x + y)
//        (soldados, árvores, prédios e os mini foguinhos)
//     4. efeitos: traçantes, granadas no ar, explosões
//     5. emblemas (nº de soldados + barra de vida) e "+moedas"
//
// Terreno e sprites são pré-desenhados por nível de zoom em preparar().
// (clone de jogo/cena.py)
import { formas_caminhao } from './caminhao.js';
import * as C from './config.js';
import * as M from './mapa.js';
import * as terreno from './terreno.js';
import * as objetos from './objetos.js';
import * as soldado from './soldado.js';
import * as zv from './zumbi_visual.js';
import * as canhao from './canhao.js';
import * as helicoptero from './helicoptero.js';
import * as tanque from './tanque.js';
import * as iso from './iso.js';
import * as pg from './pg.js';
import { dir_de } from './tropas.js';
import { HW, HH, limitar } from './iso.js';
import { sprite, desenhar, poligono } from './raster.js';
import { Fx } from './fx.js';
import * as treino from './treino.js';
import * as torre from './torre.js';
import * as barricada from './barricada.js';
import * as icones from './icones.js';
import { empacotar } from './atlas.js';
import { Carimbos } from './carimbo.js';

const R2 = Math.sqrt(2);
const _SOMBRA_GRANADA = [C.SOMBRA[0], C.SOMBRA[1], C.SOMBRA[2], 110];
// o terreno só é cortado em blocos se passar do limite de textura comum das
// placas de vídeo de celular (4096 px); abaixo disso fica numa imagem só
const BLOCO = 4096;
// buffers reaproveitados pelo desenho de cada quadro (nada de listas novas)
const _B = new Float64Array(64);
const _P = [0.0, 0.0, 0.0];
const _TRACO_A = [232, 162, 58], _TRACO_B = [255, 243, 196], _RASTRO = [198, 204, 216], _BARRA_FUNDO = [201, 207, 219];
const _RISCOS_GRANADA = [8, -9, 10, -4, 4, -10];
const _ESC_EXPLOSAO = [1.0, 0.62, 0.3];
const _OURO_TREINO = [244, 192, 58];
function _pos_granada(g, t, out) {   // = Granada.pos(t), sem criar lista
  out[0] = g.x0 + (g.x1 - g.x0) * t; out[1] = g.y0 + (g.y1 - g.y0) * t;
  out[2] = 0.5 * (1 - t) + 4 * g.apice * t * (1 - t);
  return out;
}
function _pos_obus(o, t, out) {      // = Obus.pos(t), sem criar lista
  out[0] = o.x0 + (o.x1 - o.x0) * t; out[1] = o.y0 + (o.y1 - o.y0) * t;
  out[2] = 0.6 * (1 - t) + 0.3 * t + 2.4 * t * (1 - t);
  return out;
}
function _ordenar(a, aux, n) {
  // ordenação ESTÁVEL por .k (mesmo resultado do sort do navegador, que
  // também é estável), sem criar listas: blocos por inserção + intercalação
  const RUN = 24;
  for (let lo = 0; lo < n; lo += RUN) {
    const hi = Math.min(lo + RUN, n);
    for (let i = lo + 1; i < hi; i++) {
      const x = a[i], k = x.k;
      let j = i - 1;
      while (j >= lo && a[j].k > k) { a[j + 1] = a[j]; j--; }
      a[j + 1] = x;
    }
  }
  let src = a, dst = aux;
  for (let w = RUN; w < n; w *= 2) {
    for (let lo = 0; lo < n; lo += 2 * w) {
      const mid = Math.min(lo + w, n), hi = Math.min(lo + 2 * w, n);
      let i = lo, j = mid, k = lo;
      while (i < mid && j < hi) dst[k++] = src[j].k < src[i].k ? src[j++] : src[i++];
      while (i < mid) dst[k++] = src[i++];
      while (j < hi) dst[k++] = src[j++];
    }
    const t = src; src = dst; dst = t;
  }
  return src;
}

const _COR_MUN = [244, 192, 58], _COR_SEM_MUN = [214, 58, 46];
const _SEM_MOEDA = /^(TROPA PRESA|VOLTA PARA|VOLTOU AO|RESGATADA|SEM MUNIÇÃO|\+\d+ (BALAS|PÓLVORA|BOMBAS|BOLAS|FOGUETES|PEÇAS))/;

export class Cena {
  constructor() {
    this.zoom = null;
    this.terreno = null;
    this.sold = {};
    this.canhoes = {};
    this.helis = {};
    this.tanques = null;
    this.bases_img = {};
    this._donos = new Map();
    // objetos fixos com a profundidade já calculada: [k, tipo, objeto, imagem, ox, oy]
    this.fixos = [];
    this._fontes = new Map();
    this._textos = new Map();
    this._tiles = new Map();
    this.fx = new Fx();       // partículas, luz e sombra extras (só enfeite)
    this.blocos = null;
    this._lista = [];         // o que vai ser desenhado neste quadro (reaproveitada)
    this._aux = [];           // espaço da ordenação
    this._itens = [];         // reserva de itens da lista (evita lixo a cada quadro)
    this._usados = 0;
    this._fixos_it = [];      // árvores/montes/prédios já como itens da lista
    this._kx = 0; this._ky = 0; this._ox = 0; this._oy = 0; this._vw = 0; this._vh = 0;
    this._cache_txt = new Map();
    this.carimbos = new Carimbos();   // carimbo de esquadrão (tropa parada = 1 desenho)
    this.agenda = null;               // orçamento por quadro (main liga)
    this.medidas = { lista: 0, sprites: 0 };   // para o painel de desempenho
  }

  preparar(zoom) {
    // (re)desenha terreno e sprites para este zoom. Com o zoom fixo isso só
    // acontece no carregamento (ou se a janela mudar de tamanho).
    this.zoom = zoom;
    this.preparar_sprites();
    this.preparar_mapa();
  }

  preparar_sprites() {
    // soldados, canhões, helicópteros, tanques e a base extra: não dependem do mapa
    const zoom = this.zoom;
    const ajusta = (s) => [s[0], s[1] * zoom - 1, s[2] * zoom - 1];
    const sold = soldado.criar_sprites(zoom);
    Object.assign(sold.vermelho, zv.criar_sprites(zoom));   // modo zumbi: os zumbis entram no mesmo atlas
    for (const time in sold) for (const tipo in sold[time]) for (const quadros of sold[time][tipo]) {
      for (const q in quadros) quadros[q] = ajusta(quadros[q]);
    }
    // ATLAS: todos os quadros de soldado em poucas folhas grandes (desenho igual,
    // mas a placa de vídeo junta tudo em lotes). Cada quadro ganha um número (id)
    // que o carimbo de esquadrão usa na assinatura.
    const todos = [], onde = [];
    for (const time in sold) for (const tipo in sold[time]) for (const quadros of sold[time][tipo]) {
      for (const q in quadros) { todos.push(quadros[q]); onde.push([quadros, q]); }
    }
    const prontos = empacotar(todos);
    for (let i = 0; i < prontos.length; i++) { prontos[i].push(i); onde[i][0][onde[i][1]] = prontos[i]; }
    this.sold = sold;
    const can = canhao.criar_sprites(zoom);
    for (const time in can) for (const quadros of can[time]) for (const q in quadros) quadros[q] = ajusta(quadros[q]);
    this.canhoes = can;
    const hel = helicoptero.criar_sprites(zoom);
    for (const time in hel) hel[time] = hel[time].map(ajusta);
    this.helis = hel;
    this.tanques = new tanque.Sprites(zoom);
    // base extra (construída durante o jogo): mesmo desenho da base, com sombra própria
    this.bases_img = {};
    const L = 4.2, W = 3.0, a = 1.5 * 0.55;
    const sombra = [[C.SOMBRA[0], C.SOMBRA[1], C.SOMBRA[2], C.SOMBRA_ALFA],
      [[L / 2, -W / 2], [L / 2, W / 2], [L / 2 - a, W / 2 + a], [-L / 2 - a, W / 2 + a], [-L / 2 - a, -W / 2 + a], [-L / 2, -W / 2]]
        .map(([x, y]) => [iso.sx(x, y), iso.sy(x, y)])];
    for (const time of ['verde', 'vermelho']) {
      const formas = objetos.formas_construcao({ tipo: 'base', time, x: 0, y: 0, eixo: 'x' });
      const [img, x0, y0] = sprite(formas.slice(0, 3).concat([sombra]).concat(formas.slice(3)), zoom);   // sombra logo acima da plataforma
      this.bases_img[time] = [img, x0 * zoom - 1, y0 * zoom - 1];
    }
    // torre de defesa: a parte fixa vira imagem (o morteiro é desenhado por cima)
    this.torres_img = {};
    for (const time of ['verde', 'vermelho']) {
      const [img, x0, y0] = sprite(torre.formas_torre(time), zoom);
      this.torres_img[time] = [img, x0 * zoom - 1, y0 * zoom - 1];
    }
    this.barr_img = { verde: [], vermelho: [] };   // barricadas: imagem por direção (feita na 1ª vez)
    this.fantasma = null;        // barricada "na mão" (lugar ainda não confirmado)
    this.r_fantasma_ok = null; this.r_fantasma_x = null;   // botões V e X em cima dela
    this.mostrar_alcance = false;   // a interface liga enquanto a torre está "na mão"
    this._textos = new Map();
  }

  _alcance_treinada(tela, sq, z, ox, oy) {
    // tropa transformada selecionada: os anéis do alcance no chão.
    // Incendiário: amarelo por dentro (granada comum) e vermelho por fora (bomba
    // incendiária), como na torre. Atirador de elite: o anel do alcance dobrado.
    // (qualquer tropa sua selecionada mostra o círculo do alcance: é o mesmo
    // círculo que o jogo usa para decidir quando ela para e ataca)
    if (!sq || sq.time !== 'verde' || !sq.sold.length) return;
    const kx = HW * z, ky = HH * z;
    const cx = (sq.x - sq.y) * kx + ox, cy = (sq.x + sq.y) * ky + oy;
    const R = sq.alcance() * Math.SQRT2, r = sq.alcance_base() * Math.SQRT2;
    tela.save();
    tela.lineWidth = Math.max(1.5, 2.2 * z);
    tela.setLineDash([9 * z, 7 * z]);
    if (sq.tipo === 'granada' && sq.nivel_treino >= 1) {
      tela.beginPath();
      tela.ellipse(cx, cy, R * kx, R * ky, 0, 0, Math.PI * 2);
      tela.ellipse(cx, cy, r * kx, r * ky, 0, 0, Math.PI * 2, true);
      tela.fillStyle = 'rgba(226,58,46,0.10)';
      tela.fill();
      tela.beginPath(); tela.ellipse(cx, cy, R * kx, R * ky, 0, 0, Math.PI * 2);
      tela.strokeStyle = 'rgba(200,40,32,0.85)'; tela.stroke();
      tela.beginPath(); tela.ellipse(cx, cy, r * kx, r * ky, 0, 0, Math.PI * 2);
      tela.fillStyle = 'rgba(250,206,40,0.14)'; tela.fill();
      tela.strokeStyle = 'rgba(214,160,20,0.9)'; tela.stroke();
    } else {
      tela.beginPath(); tela.ellipse(cx, cy, R * kx, R * ky, 0, 0, Math.PI * 2);
      tela.fillStyle = 'rgba(250,206,40,0.10)'; tela.fill();
      tela.strokeStyle = 'rgba(214,160,20,0.9)'; tela.stroke();
    }
    tela.restore();
  }

  _alcance_torres(tela, torres, z, ox, oy) {
    // os dois anéis no chão: vermelho por fora (granadas) e amarelo por dentro (tiro comum)
    // aparecem logo depois de construir e enquanto a torre está "na mão"
    const kx = HW * z, ky = HH * z;
    const R = C.ALCANCE_TORRE * Math.SQRT2, r = C.ALCANCE_TORRE_TIRO * Math.SQRT2;
    for (let i = 0; i < torres.length; i++) {
      const tr = torres[i];
      if (tr.time !== 'verde') continue;
      let a = this.mostrar_alcance ? 0.8 : 0;
      if (tr.idade < 4) a = Math.max(a, tr.idade < 3 ? 1 : 4 - tr.idade);
      if (a <= 0.02) continue;
      const cx = (tr.x - tr.y) * kx + ox, cy = (tr.x + tr.y) * ky + oy;
      // anel vermelho de fora: só a faixa entre a borda amarela e a vermelha
      tela.beginPath();
      tela.ellipse(cx, cy, R * kx, R * ky, 0, 0, Math.PI * 2);
      tela.ellipse(cx, cy, r * kx, r * ky, 0, 0, Math.PI * 2, true);
      tela.fillStyle = `rgba(226,58,46,${(0.14 * a).toFixed(3)})`;
      tela.fill();
      tela.lineWidth = Math.max(1.5, 2.5 * z);
      tela.setLineDash([10 * z, 7 * z]);
      tela.beginPath();
      tela.ellipse(cx, cy, R * kx, R * ky, 0, 0, Math.PI * 2);
      tela.strokeStyle = `rgba(200,40,32,${(0.9 * a).toFixed(3)})`;
      tela.stroke();
      // anel amarelo de dentro
      tela.beginPath();
      tela.ellipse(cx, cy, r * kx, r * ky, 0, 0, Math.PI * 2);
      tela.fillStyle = `rgba(250,206,40,${(0.2 * a).toFixed(3)})`;
      tela.fill();
      tela.strokeStyle = `rgba(214,160,20,${(0.95 * a).toFixed(3)})`;
      tela.stroke();
      tela.setLineDash([]);
    }
  }


  preparar_mapa() {
    // o chão (em blocos) e o que é fixo no mapa (árvores, montes, prédios)
    const zoom = this.zoom;
    this._terreno_blocos(terreno.construir(zoom));
    this._avanco_terreno = M.AVANCO_FRENTE;
    this.fixos = [];
    for (const a of M.ARVORES) this._fixo(a.x + a.y, 'a', a, objetos.formas_arvore(a));
    for (const m of M.MONTES) this._fixo(m.x + m.y, 'm', m, objetos.formas_monte(m));
    for (const c of M.CONSTRUCOES) this._fixo(objetos.profundidade(c), 'c', c, objetos.formas_construcao(c));
    // campos de treino: cerca, alvos, pneus, muro, sacos de areia, torre, mastro e placa
    for (const a of M.AREAS_TREINO) for (const p of treino.pecas(a)) this._fixo(p.k, 'tr', p, p.formas);
    this.fixos.sort((p, q) => p[0] - q[0]);   // já em ordem de profundidade (a lista do quadro sai quase ordenada)
    this._fixos_it = this.fixos.map(f => ({ k: f[0], tp: f[1], o: f }));
    this._z = null;   // modo zumbi: nave, fungo e larvas (feitos na primeira vez que precisar)
    this._donos = new Map();
    this._donos_v = new Map();
    this._tiles = new Map();
  }

  _terreno_blocos(img) {
    // imagens maiores que BLOCO passam do limite de textura da placa de vídeo
    // de muitos celulares/tablets (e o navegador cai para a CPU): nesse caso o
    // terreno é cortado em blocos. Cabendo, fica numa imagem só.
    for (const b of (this.blocos || [])) { b.c.canvas.width = 1; b.c.canvas.height = 1; }
    this.ter_w = img.width; this.ter_h = img.height;
    this.blocos = [];
    if (img.width <= BLOCO && img.height <= BLOCO) {
      this.blocos.push({ x: 0, y: 0, w: img.width, h: img.height, c: img.getContext('2d') });
      this.terreno = { width: this.ter_w, height: this.ter_h };
      return;
    }
    for (let y = 0; y < img.height; y += BLOCO) {
      for (let x = 0; x < img.width; x += BLOCO) {
        const w = Math.min(BLOCO, img.width - x), h = Math.min(BLOCO, img.height - y);
        const c = pg.superficie(w, h);
        c.drawImage(img, x, y, w, h, 0, 0, w, h);
        this.blocos.push({ x, y, w, h, c });
      }
    }
    img.width = 1; img.height = 1;   // solta a imagem inteira
    this.terreno = { width: this.ter_w, height: this.ter_h };
  }

  redesenhar_frente() {
    // a linha de frente andou (nível do QG): refaz SÓ a faixa do chão por onde
    // ela passa (antes e depois), em vez do mapa inteiro + todos os sprites
    if (!this.blocos || this._avanco_terreno === undefined) { this.preparar_mapa(); return; }
    const d = M.AVANCO_FRENTE - this._avanco_terreno;   // F antigo = F atual + d
    if (d === 0) return;
    let fmin = Infinity, fmax = -Infinity;
    for (let u = -C.CENA_U - 4; u <= C.CENA_U + 4; u += 0.4) {
      const f = M.F(u);
      if (f < fmin) fmin = f;
      if (f > fmax) fmax = f;
    }
    const z = this.zoom;
    const y0 = Math.floor(((fmin + Math.min(0, d) - 4) * HH + C.LY) * z);
    const y1 = Math.ceil(((fmax + Math.max(0, d) + 4) * HH + C.LY) * z);
    const faixa = terreno.construir(z, y0, y1);
    const a0 = Math.max(0, y0), a1 = Math.min(this.ter_h, y1);
    for (const b of this.blocos) {
      const r0 = Math.max(a0, b.y), r1 = Math.min(a1, b.y + b.h);
      if (r1 <= r0) continue;
      b.c.drawImage(faixa, b.x, r0 - a0, b.w, r1 - r0, 0, r0 - b.y, b.w, r1 - r0);
    }
    faixa.width = 1; faixa.height = 1;
    this._avanco_terreno = M.AVANCO_FRENTE;
    this._donos = new Map();
    this._donos_v = new Map();
    this._tiles = new Map();
  }

  _preparar_zumbi() {
    // MODO ZUMBI: o lado vermelho perde o QG, os galpões e os campos de treino;
    // no lugar entram a nave caída, os talos de fungo e os destroços (com
    // profundidade) e o tapete de fungo, veios, poças e larvas (no chão)
    const zoom = this.zoom;
    const nave = { tipo: 'nave', x: M.BASES.vermelho[0], y: M.BASES.vermelho[1] };
    const ent = (k, tipo, o, formas) => { const [img, x0, y0] = sprite(formas, zoom); return [k, tipo, o, img, x0 * zoom - 1, y0 * zoom - 1]; };
    const fixos = this.fixos.filter(f => !(f[1] === 'c' && f[2].time === 'vermelho') && !(f[1] === 'tr' && f[2].area && f[2].area.time === 'vermelho'));
    fixos.push(ent(nave.x + nave.y + 1.5, 'nv', nave, zv.formas_nave(nave)));
    // o chão do que era do QG vermelho (piso dos campos de treino e sombras dos prédios) volta a ser neve
    const cobrir = [];
    const P = (x, y) => [iso.sx(x, y), iso.sy(x, y)];
    for (const a of M.AREAS_TREINO) {
      if (a.time !== 'vermelho') continue;
      const m = 1.2;
      cobrir.push([[a.u0 - m, a.v0 - m], [a.u1 + m, a.v0 - m], [a.u1 + m, a.v1 + m], [a.u0 - m, a.v1 + m]].map(([u, v]) => [u * iso.HW, v * iso.HH]));
    }
    for (const o of M.CONSTRUCOES) {
      if (o.time !== 'vermelho') continue;
      const qg = o.tipo === 'qg', w = qg ? 4 : (o.eixo === 'x' ? 4.2 : 3), d = qg ? 4 : (o.eixo === 'x' ? 3 : 4.2), h = qg ? 3.3 : 1.5;
      const x0 = o.x - w / 2 - 0.4, y0 = o.y - d / 2 - 0.4, x1 = o.x + w / 2 + 0.4, y1 = o.y + d / 2 + 0.4, a = h * 0.55 + 0.4;
      cobrir.push([P(x1, y0), P(x1, y1), P(x1 - a, y1 + a), P(x0 - a, y1 + a), P(x0 - a, y0 + a), P(x0, y0)]);
    }
    const { chao, altos } = zv.pecas_fungo(nave, cobrir);
    for (const a of altos) fixos.push(ent(a.k, 'fu', a, a.formas));
    fixos.sort((p, q) => p[0] - q[0]);
    this._z = {
      nave,
      it: fixos.map(f => ({ k: f[0], tp: f[1], o: f })),
      chao: chao.map(c => { const e = ent(0, 'ch', c, c.formas); return [e[3], e[4], e[5]]; }),
    };
  }

  _fixo(k, tipo, o, formas) {
    const [img, x0, y0] = sprite(formas, this.zoom);
    this.fixos.push([k, tipo, o, img, x0 * this.zoom - 1, y0 * this.zoom - 1]);
  }

  // ---------- texto com contorno (guardado em cache) -----------------
  _fonte(tam) {
    let f = this._fontes.get(tam);
    if (f === undefined) {
      f = new pg.Fonte(tam, true);
      this._fontes.set(tam, f);
    }
    return f;
  }

  texto(txt, tam, cor, contorno = 2) {
    // cache em níveis (tamanho+contorno -> cor -> texto): achar uma imagem
    // pronta não monta nenhuma string nova a cada quadro
    let m1 = this._cache_txt.get(tam * 16 + contorno);
    if (m1 === undefined) { m1 = new Map(); this._cache_txt.set(tam * 16 + contorno, m1); }
    let m2 = m1.get(cor);
    if (m2 === undefined) { m2 = new Map(); m1.set(cor, m2); }
    let img = m2.get(txt);
    if (img === undefined) {
      const chave = `${txt}\u0001${tam}\u0001${cor}\u0001${contorno}`;
      img = this._textos.get(chave);
      if (img === undefined) {
        img = pg.texto_contorno(this._fonte(tam), txt, cor, C.ESCURO, contorno, 1);
        if (this._textos.size > 400) pg.podar(this._textos, 400);   // tira só os mais velhos (sem apagar tudo de uma vez)
        this._textos.set(chave, img);
      }
      if (m2.size > 400) pg.podar(m2, 400);
      m2.set(txt, img);
    }
    return img;
  }

  // ---------- mapa lógico (o que o código "entende") -----------------
  _classe(i, j) {
    const k = i * 100000 + j;
    let v = this._tiles.get(k);
    if (v === undefined) {
      v = M.eh_estrada(i + 0.5, j + 0.5) ? 0 : (M.dono(i + 0.5, j + 0.5) === 'verde' ? 1 : 2);
      this._tiles.set(k, v);
    }
    return v;
  }

  _mapa_logico(tela, cam, ox, oy, so_verde = false) {
    // pinta cada tile visível: marrom = estrada, verde = seu, vermelho = inimigo.
    // so_verde=true: só o SEU território (onde dá para posicionar uma carta)
    const vw = cam.vw, vh = cam.vh, z = cam.zoom;
    const cantos = [cam.mundo(0, 0), cam.mundo(vw, 0), cam.mundo(0, vh), cam.mundo(vw, vh)];
    const i0 = Math.floor(Math.min(...cantos.map(p => p[0]))), i1 = Math.ceil(Math.max(...cantos.map(p => p[0])));
    const j0 = Math.floor(Math.min(...cantos.map(p => p[1]))), j1 = Math.ceil(Math.max(...cantos.map(p => p[1])));
    const cores = [[122, 78, 30, 140], [47, 164, 87, 56], [226, 83, 58, 56]];
    const lado = this._lado || 'verde';
    if (lado !== 'verde' && !this._donos_v) this._donos_v = new Map();
    const donos = lado === 'verde' ? this._donos : this._donos_v;
    const borda = [31, 41, 55, 60];
    const w = HW * z, h = HH * z;
    // os tiles não se sobrepõem: junta todos os de uma mesma cor num caminho só
    const caminhos = so_verde ? [new Path2D()] : [new Path2D(), new Path2D(), new Path2D()];
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const px = (i - j) * HW * z + ox, py = (i + j) * HH * z + oy;
        if (px < -w || px > vw + w || py < -2 * h || py > vh) continue;
        let p;
        if (so_verde) {
          const k = i * 100000 + j;
          let verde = donos.get(k);
          if (verde === undefined) {
            verde = M.dono(i + 0.5, j + 0.5) === lado;
            donos.set(k, verde);
          }
          if (!verde) continue;
          p = caminhos[0];
        } else {
          p = caminhos[this._classe(i, j)];
        }
        p.moveTo(px, py);
        p.lineTo(px + w, py + h);
        p.lineTo(px, py + 2 * h);
        p.lineTo(px - w, py + h);
        p.closePath();
      }
    }
    if (so_verde) {
      tela.fillStyle = pg.css(lado === 'verde' ? [47, 164, 87, 64] : [226, 83, 58, 64]);
      tela.fill(caminhos[0]);
      return;
    }
    tela.lineWidth = 1;
    tela.strokeStyle = pg.css(borda);
    for (let k = 0; k < 3; k++) {
      tela.fillStyle = pg.css(cores[k]);
      tela.fill(caminhos[k]);
      tela.stroke(caminhos[k]);
    }
  }

  // ---------- quadro --------------------------------------------------
  desenhar(tela, cam, tropas, t, depurar, territorio = false) {
    const z = cam.zoom, vw = cam.vw, vh = cam.vh;
    const ox = vw / 2 - cam.x * z, oy = vh / 2 - cam.y * z;   // tela = cena * z + (ox, oy)
    this._lado = tropas.lado || 'verde';   // de que lado está quem joga (multiplayer: pode ser o vermelho)

    // 1. terreno
    tela.fillStyle = pg.css(C.NEVE);
    tela.fillRect(0, 0, vw, vh);
    {
      // só os blocos do chão que aparecem na tela, cada um cortado no pedaço visível
      const fx = Math.trunc((cam.x + C.LX) * z - vw / 2), fy = Math.trunc((cam.y + C.LY) * z - vh / 2);
      for (const b of this.blocos) {
        const x0 = Math.max(fx, b.x), y0 = Math.max(fy, b.y);
        const x1 = Math.min(fx + vw, b.x + b.w), y1 = Math.min(fy + vh, b.y + b.h);
        if (x1 <= x0 || y1 <= y0) continue;
        tela.drawImage(b.c.canvas, x0 - b.x, y0 - b.y, x1 - x0, y1 - y0, x0 - fx, y0 - fy, x1 - x0, y1 - y0);
      }
    }

    // 2. mapa lógico e marcas no chão
    if (depurar) this._mapa_logico(tela, cam, ox, oy);
    else if (territorio) this._mapa_logico(tela, cam, ox, oy, true);   // carta na mão: mostra onde pode posicionar
    const zmodo = tropas.modo === 'zumbi';
    if (zmodo) {   // modo zumbi: fungo, veios, poças e larvas por cima da neve
      if (!this._z) this._preparar_zumbi();
      const ch = this._z.chao;
      for (let i = 0; i < ch.length; i++) {
        const c = ch[i], x = c[1] + ox, y = c[2] + oy;
        if (x > vw || y > vh || x + c[0].width < 0 || y + c[0].height < 0) continue;
        tela.drawImage(c[0], Math.trunc(x), Math.trunc(y));
      }
    }
    this._marcas(tela, tropas, z, ox, oy);
    // efeitos extras: reagem ao que aconteceu e desenham as sombras/anéis no chão
    const t_real = performance.now();
    const dt_real = this._t_real === undefined ? 0 : (t_real - this._t_real) / 1000;
    this._t_real = t_real;
    this.fx.atualizar(tropas, t, z, ox, oy, vw, vh);
    this.fx.chao(tela);
    if (tropas.torres && tropas.torres.length) this._alcance_torres(tela, tropas.torres, z, ox, oy);
    if (tropas.selecionado) this._alcance_treinada(tela, tropas.selecionado, z, ox, oy);

    // 3. tudo que tem altura, do fundo para a frente. Só entra na lista o
    //    que aparece na tela (com folga), e os itens da lista são reaproveitados
    //    de um quadro para o outro: menos para ordenar e nada de lixo na memória.
    const lista = this._lista;
    let n = 0;
    this._usados = 0;
    const kx = HW * z, ky = HH * z;
    this._kx = kx; this._ky = ky; this._ox = ox; this._oy = oy; this._vw = vw; this._vh = vh;
    const fit = zmodo ? this._z.it : this._fixos_it;
    for (let i = 0; i < fit.length; i++) {   // já com a caixa na tela: corta antes de ordenar
      const f = fit[i].o;
      const x = f[4] + ox, y = f[5] + oy;
      if (x > vw || y > vh || x + f[3].width < 0 || y + f[3].height < -60 * z) continue;
      lista[n++] = fit[i];
    }
    const sprites = this.sold;
    const esq = tropas.esquadroes;
    for (let q = 0; q < esq.length; q++) {
      const sq = esq[q];
      if (sq.tipo === 'tanque' && sq.sold.length) {
        if (this._visivel(sq.x, sq.y, 140)) lista[n++] = this._item(sq.x + sq.y + 0.1, 't', sq);
        continue;
      }
      if (sq.tipo === 'heli' && sq.sold.length) {
        if (this._visivel(sq.x, sq.y, 220)) lista[n++] = this._item(sq.x + sq.y + 50, 'h', sq);
        continue;
      }
      const so = sq.sold;
      for (let i = 0; i < so.length; i++) {
        const s = so[i];
        const px = (s.x - s.y) * kx + ox, py = (s.x + s.y) * ky + oy;
        if (px < -20 || px > vw + 20 || py < -10 || py > vh + 40) continue;
        const it = lista[n++] = this._item(s.x + s.y, 's', s);
        // já escolhe o quadro e a posição em pixels (o desenho e o carimbo usam)
        const sp = sprites[s.time][s.tipo][s.dir][soldado.quadro(s)];
        it.sq = sq; it.sp = sp; it.X = Math.trunc(px + sp[1]); it.Y = Math.trunc(py + sp[2]);
      }
      if (sq.tipo === 'canhao' && sq.sold.length) {   // a peça de artilharia (= sq.peca())
        const cx_ = sq.x + sq.hx * 0.9, cy_ = sq.y + sq.hy * 0.9;
        if (this._visivel(cx_, cy_, 120)) lista[n++] = this._item(cx_ + cy_, 'k', sq);
      }
    }
    if (tropas.horda) {   // modo zumbi: cada zumbi entra na lista como um soldado solto
      const zs = tropas.horda.vivos;
      for (let i = 0; i < zs.length; i++) {
        const s = zs[i];
        if (s.morto) continue;
        const px = (s.x - s.y) * kx + ox, py = (s.x + s.y) * ky + oy;
        if (s.voa) continue;   // disco voador: desenhado por cima de tudo (está no céu)
        if (s.esp) {   // monstro e grandão: desenhados osso por osso a cada quadro
          if (px > -260 && px < vw + 260 && py > -30 && py < vh + 400) lista[n++] = this._item(s.x + s.y, 'mo', s);
          continue;
        }
        if (px < -24 || px > vw + 24 || py < -10 || py > vh + 48) continue;
        const it = lista[n++] = this._item(s.x + s.y, 's', s);
        const sp = sprites.vermelho[s.tipo][s.dir][soldado.quadro(s)];
        it.sp = sp; it.X = Math.trunc(px + sp[1]); it.Y = Math.trunc(py + sp[2]);
      }
    }
    if (tropas.horda) {
      const hm = tropas.horda.morrendo, hp = tropas.horda.pedras;
      for (let i = 0; i < hm.length; i++) { const s = hm[i]; if (!s.voa && this._visivel(s.x, s.y, 380)) lista[n++] = this._item(s.x + s.y - 0.2, 'mo', s); }
      for (let i = 0; i < hp.length; i++) { const p = hp[i]; if (this._visivel(p.x, p.y, 260)) lista[n++] = this._item(p.x + p.y + 0.5, 'pd', p); }
    }
    for (let i = 0; i < tropas.caidos.length; i++) { const s = tropas.caidos[i]; if (this._visivel(s.x, s.y, 40)) lista[n++] = this._item(s.x + s.y - 0.2, 's', s); }
    const dest = this.fx.dest.grandes;   // destroços (carcaças, escombros) com fogo em cima
    for (let i = 0; i < dest.length; i++) { const w = dest[i]; if (this._visivel(w.x, w.y, 220)) lista[n++] = this._item(w.x + w.y - 0.3, 'w', w); }
    for (let i = 0; i < tropas.fogos.length; i++) { const f = tropas.fogos[i]; if (this._visivel(f[0], f[1], 60)) lista[n++] = this._item(f[0] + f[1], 'f', f); }
    for (let i = 0; i < tropas.extras.length; i++) { const b = tropas.extras[i]; if (this._visivel(b.x, b.y, 200)) lista[n++] = this._item(b.x + b.y + 1.0, 'b', b); }
    const torres = tropas.torres;
    if (torres) for (let i = 0; i < torres.length; i++) { const o = torres[i]; if (this._visivel(o.x, o.y, 160)) lista[n++] = this._item(o.x + o.y + 0.9, 'o', o); }
    const barrs = tropas.barricadas;
    if (barrs) for (let i = 0; i < barrs.length; i++) { const o = barrs[i]; if (this._visivel(o.x, o.y, 120)) lista[n++] = this._item(o.x + o.y + 0.4, 'r', o); }
    const cams = tropas.caminhoes;   // fase 5: caminhões de logística
    if (cams) for (let i = 0; i < cams.length; i++) { const o = cams[i]; if (this._visivel(o.x, o.y, 120)) lista[n++] = this._item(o.x + o.y + 0.6, 'cm', o); }
    if (this._aux.length < n) this._aux.length = n;
    const ord = _ordenar(lista, this._aux, n);
    const cb = this.carimbos;
    cb.quadro(ord, n);
    const area = this._area_item || (this._area_item = (it, c) => this._area(it, c));
    this.medidas.lista = n;
    let n_sprites = 0;
    for (let idx = 0; idx < n; idx++) {
      const item = ord[idx];
      const tp = item.tp;
      if (tp === 's' && item.sq) {   // soldado de tropa: carimbo (tropa parada inteira de uma vez) ou desenho normal
        const est = cb.estado(item.sq);
        if (est === 1) continue;   // já saiu no carimbo
        if (est === 0 && cb.tentar(tela, ord, idx, this.agenda, area)) { n_sprites++; continue; }
        const sp = item.sp;
        tela.drawImage(sp[0], sp[3], sp[4], sp[5], sp[6], item.X, item.Y, sp[5], sp[6]);
        n_sprites++;
        continue;
      }
      n_sprites++;
      if (tp === 'h') {
        const sq = item.o;
        const px = iso.sx(sq.x, sq.y) * z + ox, py = iso.sy(sq.x, sq.y) * z + oy;
        if (-120 < px && px < vw + 120 && -180 < py && py < vh + 120) {
          // Sombra no chão; sprite isométrico do kit original.
          pg.elipse(tela, C.SOMBRA, [Math.trunc(px - 22 * z), Math.trunc(py - 8 * z), Math.trunc(44 * z), Math.trunc(16 * z)]);
          const hs = this.helis[sq.time][dir_de(sq.hx, sq.hy)];
          const bob = Math.sin(t * 2.2 + sq.x) * 3 * z;
          pg.blit(tela, hs[0], Math.trunc(px + hs[1]), Math.trunc(py + hs[2] + bob));
          // Rotor em movimento, no mesmo traço do modelo.
          const ry = py - (C.ALT_HELI + 0.65) * C.ZH * z + bob;
          const ang = t * 26;
          for (let r = 0; r < 2; r++) {
            const a = r === 0 ? ang : ang + Math.PI / 2;
            const dx = Math.cos(a) * 31 * z, dy = Math.sin(a) * 12 * z;
            pg.linha_xy(tela, C.JANELA, px - dx, ry - dy, px + dx, ry + dy, Math.max(1, Math.trunc(2 * z)));
          }
          // Escada de desembarque: cabos e degraus alinhados.
          let desce = false;
          for (let i = 0; i < tropas.desembarques.length; i++) {
            const d = tropas.desembarques[i];
            if (Math.hypot(d[0] - sq.x, d[1] - sq.y) < 0.1) { desce = true; break; }
          }
          if (desce) {
            const y0_ = py - C.ALT_HELI * C.ZH * z;
            pg.linha_xy(tela, C.JANELA, px + -7 * z, y0_, px + -7 * z, py, Math.max(1, Math.trunc(2 * z)));
            pg.linha_xy(tela, C.JANELA, px + 7 * z, y0_, px + 7 * z, py, Math.max(1, Math.trunc(2 * z)));
            for (let j = 1; j < 7; j++) {
              const yy = y0_ + (py - y0_) * j / 7;
              pg.linha_xy(tela, C.JANELA, px - 7 * z, yy, px + 7 * z, yy, Math.max(1, Math.trunc(2 * z)));
            }
          }
        }
      } else if (tp === 't') {
        const sq = item.o;
        const px = iso.sx(sq.x, sq.y) * z + ox, py = iso.sy(sq.x, sq.y) * z + oy;
        if (-110 < px && px < vw + 110 && -110 < py && py < vh + 110) {
          // Sombra elíptica de contato sob o casco (não sobre o sprite).
          const largura = Math.max(2, Math.trunc(39 * z)), altura = Math.max(2, Math.trunc(13 * z));
          pg.elipse(tela, C.SOMBRA, [Math.trunc(px - largura / 2), Math.trunc(py - altura / 2 + 3 * z), largura, altura]);
          const direcao = dir_de(sq.hx, sq.hy);
          const fase = sq.movendo ? Math.trunc(t * 5) % 4 : 0;
          let sp = this.tanques.casco(sq.time, direcao, fase);
          pg.blit(tela, sp[0], Math.trunc(px + sp[1]), Math.trunc(py + sp[2]));
          const idx_t = tanque.indice(Math.atan2(sq.hy, sq.hx));
          sp = this.tanques.torre(sq.time, idx_t, Math.trunc(sq.recuo * 2));
          pg.blit(tela, sp[0], Math.trunc(px + sp[1]), Math.trunc(py + sp[2]));
        }
      } else if (tp === 's') {
        const s = item.o;
        const px = (s.x - s.y) * kx + ox, py = (s.x + s.y) * ky + oy;
        const sp = sprites[s.time][s.tipo][s.dir][soldado.quadro(s)];
        tela.drawImage(sp[0], sp[3], sp[4], sp[5], sp[6], Math.trunc(px + sp[1]), Math.trunc(py + sp[2]), sp[5], sp[6]);
      } else if (tp === 'mo') {
        desenhar(tela, zv.formas_especial(item.o, t), z, ox, oy);
      } else if (tp === 'pd') {
        desenhar(tela, zv.formas_pedra(item.o), z, ox, oy);
      } else if (tp === 'f') {
        Cena._fogo(tela, item.o, t, z, ox, oy);
      } else if (tp === 'b') {   // base construída: sprite + bandeira animada
        const b = item.o;
        const bi = this.bases_img[b.time];
        pg.blit(tela, bi[0], Math.trunc((b.x - b.y) * kx + ox + bi[1]), Math.trunc((b.x + b.y) * ky + oy + bi[2]));
        desenhar(tela, objetos.formas_animadas(b.o, t), z, ox, oy);
      } else if (tp === 'w') {   // destroço
        this.fx.dest.desenhar(tela, item.o, z, ox, oy, t);
      } else if (tp === 'r') {   // barricada de arame farpado
        const o = item.o;
        const bi = this._barr(o.time, o.ang);
        pg.blit(tela, bi[0], Math.trunc((o.x - o.y) * kx + ox + bi[1]), Math.trunc((o.x + o.y) * ky + oy + bi[2]));
      } else if (tp === 'cm') {   // fase 5: caminhão
        desenhar(tela, formas_caminhao(item.o), z, ox, oy);
      } else if (tp === 'o') {   // torre de defesa: imagem + morteiro
        const o = item.o;
        const ti = this.torres_img[o.time];
        pg.blit(tela, ti[0], Math.trunc((o.x - o.y) * kx + ox + ti[1]), Math.trunc((o.x + o.y) * ky + oy + ti[2]));
        desenhar(tela, torre.formas_morteiro(o), z, ox, oy);
      } else if (tp === 'k') {
        const sq = item.o;
        const cx_ = sq.x + sq.hx * 0.9, cy_ = sq.y + sq.hy * 0.9;
        const ci = this.canhoes[sq.time][dir_de(sq.hx, sq.hy)][sq.recuo > 0.55 ? 'r' : 'p'];
        pg.blit(tela, ci[0], Math.trunc((cx_ - cy_) * kx + ox + ci[1]), Math.trunc((cx_ + cy_) * ky + oy + ci[2]));
      } else {
        const f = item.o;
        const x = f[4] + ox, y = f[5] + oy;
        tela.drawImage(f[3], Math.trunc(x), Math.trunc(y));
        if (tp === 'c') {   // bandeiras e radar por cima do prédio
          desenhar(tela, objetos.formas_animadas(f[2], t), z, ox, oy);
        } else if (tp === 'nv') {   // nave: esporos, gosma e larvas se mexendo
          desenhar(tela, zv.formas_anim_nave(f[2], t), z, ox, oy);
        } else if (tp === 'tr' && f[2].anim) {   // campo de treino: alvos tombando, bandeira
          desenhar(tela, treino.formas_animadas(f[2], t), z, ox, oy);
        }
      }
    }

    // 4 e 5
    this._efeitos(tela, tropas, z, ox, oy, t);
    this.fx.ar(tela);                 // fumaça, detritos, neve chutada, brasas
    this.fx.luz(tela);                // luz quente dos clarões e do fogo
    if (this.fx.mostrar_neve) this.fx.neve(tela, cam.x, cam.y, t === this._t_ant ? 0 : dt_real);   // flocos caindo
    this._t_ant = t;
    this.medidas.sprites = n_sprites;
    this._emblemas(tela, tropas, z, ox, oy);
    this._fantasma(tela, z, ox, oy);
  }

  _barr(time, ang) {
    const i = barricada.indice_dir(ang);
    const lista = this.barr_img[time];
    if (!lista[i]) {
      const zoom = this.zoom;
      const [img, x0, y0] = sprite(barricada.formas(time, barricada.ang_de(i)), zoom);
      lista[i] = [img, x0 * zoom - 1, y0 * zoom - 1];
    }
    return lista[i];
  }

  _fantasma(tela, z, ox, oy) {
    // a barricada "na mão": desenho meio transparente, a faixa no chão verde
    // (pode) ou vermelha (não pode) e, em cima, o V (confirmar) e o X (cancelar)
    const f = this.fantasma;
    this.r_fantasma_ok = this.r_fantasma_x = null;
    if (!f) return;
    const kx = HW * z, ky = HH * z;
    const ux = Math.cos(f.ang), uy = Math.sin(f.ang), m = C.BARRICADA_COMP / 2 + 0.5, l = 1.0;
    const cant = [[-m, -l], [m, -l], [m, l], [-m, l]].map(([a, b]) => {
      const wx = f.x + ux * a - uy * b, wy = f.y + uy * a + ux * b;
      return [(wx - wy) * kx + ox, (wx + wy) * ky + oy];
    });
    const pulso = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    tela.save();
    tela.beginPath();
    cant.forEach(([px, py], k) => k ? tela.lineTo(px, py) : tela.moveTo(px, py));
    tela.closePath();
    tela.fillStyle = f.valido ? `rgba(60,200,90,${0.22 + 0.12 * pulso})` : `rgba(230,60,50,${0.24 + 0.12 * pulso})`;
    tela.fill();
    tela.lineWidth = Math.max(2, 2.5 * z);
    tela.setLineDash([8 * z, 5 * z]);
    tela.strokeStyle = f.valido ? 'rgba(40,170,70,0.95)' : 'rgba(210,40,40,0.95)';
    tela.stroke();
    tela.setLineDash([]);
    // o desenho: a versão do seu time, meio apagada
    const bi = this._barr('verde', f.ang);
    const esc = z / this.zoom;
    tela.globalAlpha = f.valido ? 0.78 : 0.5;
    tela.drawImage(bi[0], (f.x - f.y) * kx + ox + bi[1] * esc, (f.x + f.y) * ky + oy + bi[2] * esc, bi[0].width * esc, bi[0].height * esc);
    tela.restore();
    // botões em cima
    const e = limitar(z, 0.85, 1.3);
    const px = iso.sx(f.x, f.y) * z + ox, py = iso.sy(f.x, f.y, 2.2) * z + oy - 26 * e;
    const r = 17 * e, vao = 24 * e;
    const botao = (cx, cor, cor_esc, ok) => {
      tela.save();
      tela.beginPath(); tela.arc(cx, py + 2.5 * e, r, 0, Math.PI * 2); tela.fillStyle = 'rgba(31,41,55,0.35)'; tela.fill();
      tela.beginPath(); tela.arc(cx, py, r, 0, Math.PI * 2); tela.fillStyle = pg.css(cor); tela.fill();
      tela.lineWidth = 2.5 * e; tela.strokeStyle = pg.css(cor_esc); tela.stroke();
      tela.lineCap = 'round'; tela.lineJoin = 'round'; tela.lineWidth = 4.2 * e; tela.strokeStyle = '#fff';
      tela.beginPath();
      if (ok) { tela.moveTo(cx - 7 * e, py + 0.5 * e); tela.lineTo(cx - 2 * e, py + 6 * e); tela.lineTo(cx + 8 * e, py - 6 * e); }
      else { tela.moveTo(cx - 6 * e, py - 6 * e); tela.lineTo(cx + 6 * e, py + 6 * e); tela.moveTo(cx + 6 * e, py - 6 * e); tela.lineTo(cx - 6 * e, py + 6 * e); }
      tela.stroke();
      tela.restore();
      return [cx - r - 4 * e, py - r - 4 * e, 2 * r + 8 * e, 2 * r + 8 * e];
    };
    this.r_fantasma_x = botao(px - vao, [222, 64, 56], [150, 30, 26], false);
    const ok_cor = f.valido ? [52, 176, 84] : [150, 160, 170], ok_esc = f.valido ? [26, 110, 50] : [100, 108, 118];
    this.r_fantasma_ok = botao(px + vao, ok_cor, ok_esc, true);
  }

  _item(k, tp, o) {
    // item reaproveitado da reserva (a lista do quadro não cria objetos novos)
    let it = this._itens[this._usados];
    if (it === undefined) { it = { k: 0.0, tp: '', o: null, sq: null, sp: null, X: 0, Y: 0 }; this._itens.push(it); }
    this._usados++;
    it.k = k; it.tp = tp; it.o = o; it.sq = null; it.sp = null;
    return it;
  }

  _area(it, c) {
    // área na tela (x, y, w, h) de um item da lista, para o carimbo saber se
    // encosta numa tropa. false = não sei (o carimbo não arrisca)
    const tp = it.tp;
    if (tp === 's') {
      let sp = it.sp, X = it.X, Y = it.Y;
      if (!sp) {   // soldado caindo
        const s = it.o;
        sp = this.sold[s.time][s.tipo][s.dir][soldado.quadro(s)];
        X = Math.trunc((s.x - s.y) * this._kx + this._ox + sp[1]); Y = Math.trunc((s.x + s.y) * this._ky + this._oy + sp[2]);
      }
      c[0] = X; c[1] = Y; c[2] = sp[5]; c[3] = sp[6];
      return true;
    }
    if (tp === 'a' || tp === 'm') {   // árvore, monte: imagem pronta
      const f = it.o;
      c[0] = Math.trunc(f[4] + this._ox); c[1] = Math.trunc(f[5] + this._oy); c[2] = f[3].width; c[3] = f[3].height;
      return true;
    }
    return false;
  }

  _visivel(x, y, folga) {
    const px = (x - y) * this._kx + this._ox, py = (x + y) * this._ky + this._oy;
    return px > -folga && px < this._vw + folga && py > -folga && py < this._vh + folga;
  }

  static _fogo(tela, f, t, z, ox, oy) {
    // mini foguinho: chama chapada em 2 tons que treme, nasce rápido e apaga devagar
    const x = f[0], y = f[1], idade = f[2], dur = f[3], fase = f[4], tam = f[5];
    const k = Math.min(1.0, idade / 0.15) * Math.min(1.0, (dur - idade) / 0.5);
    if (k < 0.08) return;
    const px = iso.sx(x, y) * z + ox, py = iso.sy(x, y) * z + oy;
    const s = tam * z * k;
    const h = (12 + 3 * Math.sin(fase + t * 16)) * s, w = 4.2 * s;
    const puxa = 1.6 * Math.sin(fase * 2 + t * 9) * s;   // a ponta balança
    for (let c = 0; c < 2; c++) {
      const e = c === 0 ? 1.0 : 0.55, cor = c === 0 ? C.FOGO : C.FOGO_CLARO;
      const B = _B;
      B[0] = px - w * e; B[1] = py;
      B[2] = px - w * 0.8 * e; B[3] = py - h * 0.45 * e;
      B[4] = px + puxa * e; B[5] = py - h * e;
      B[6] = px + w * 0.8 * e; B[7] = py - h * 0.45 * e;
      B[8] = px + w * e; B[9] = py;
      B[10] = px; B[11] = py + w * 0.45 * e;
      pg.poligono_buf(tela, cor, B, 6);
    }
  }

  _marcas(tela, tropas, z, ox, oy) {
    // chão queimado, anel da tropa selecionada e losango do destino
    const L = tela.canvas.width, A = tela.canvas.height;
    let r = C.RAIO_GRANADA * 0.75;
    for (let i = 0; i < tropas.marcas.length; i++) {
      const m = tropas.marcas[i], x = m[0], y = m[1], t = m[2];
      const cx = iso.sx(x, y) * z + ox, cy = iso.sy(x, y) * z + oy;
      if (-200 < cx && cx < L + 200 && -200 < cy && cy < A + 200) {
        const np = iso.elipse_buf(_B, cx, cy, r * HW * R2 * z, r * HH * R2 * z, 16);
        pg.poligono_buf(tela, pg.css4(60, 66, 80, Math.trunc(120 * (1 - t))), _B, np);
      }
    }
    const sel = tropas.selecionado;
    if (sel) {
      // Campo de detecção: círculo isométrico discreto, somente ao selecionar.
      const alcance = sel.alcance();
      const cx0 = iso.sx(sel.x, sel.y) * z + ox, cy0 = iso.sy(sel.x, sel.y) * z + oy;
      const rx0 = Math.max(1, Math.trunc(alcance * HW * R2 * z)), ry0 = Math.max(1, Math.trunc(alcance * HH * R2 * z));
      if (rx0 < 2200 && ry0 < 2200) {
        const bx = Math.trunc(cx0 - rx0 - 2) + 2, by = Math.trunc(cy0 - ry0 - 2) + 2;
        pg.elipse(tela, [56, 180, 105, 24], [bx, by, rx0 * 2, ry0 * 2]);
        pg.elipse(tela, [65, 188, 112, 130], [bx, by, rx0 * 2, ry0 * 2], Math.max(1, Math.trunc(z * 2)));
      }
      r = sel.raio() - 0.2;
      const rx = r * HW * R2 * z, ry = r * HH * R2 * z;
      const cx = iso.sx(sel.x, sel.y) * z + ox, cy = iso.sy(sel.x, sel.y) * z + oy;
      const caixa = [Math.trunc(cx - rx), Math.trunc(cy - ry), Math.trunc(rx * 2), Math.trunc(ry * 2)];
      if (caixa[2] > 8 && caixa[3] > 8) {
        pg.elipse(tela, C.ESCURO, caixa, Math.max(3, Math.trunc(6 * z)));
        pg.elipse(tela, C.BRANCO, [caixa[0] + 2, caixa[1] + 2, caixa[2] - 4, caixa[3] - 4], Math.max(1, Math.trunc(3 * z)));
      }
    }
    for (let i = 0; i < tropas.esquadroes.length; i++) {
      const sq = tropas.esquadroes[i];
      if (!sq.destino) continue;
      const px = iso.sx(sq.destino[0], sq.destino[1]) * z + ox, py = iso.sy(sq.destino[0], sq.destino[1]) * z + oy;
      for (let c = 0; c < 2; c++) {
        const tam = c === 0 ? 15 : 10, cor = c === 0 ? C.ESCURO : (sq === sel ? C.BRANCO : C.TIMES[this._lado].topo);
        const a = tam * z;
        _B[0] = px - a; _B[1] = py; _B[2] = px; _B[3] = py - a / 2; _B[4] = px + a; _B[5] = py; _B[6] = px; _B[7] = py + a / 2;
        pg.poligono_buf(tela, cor, _B, 4);
      }
    }
  }

  _efeitos(tela, tropas, z, ox, oy, t = 0) {
    const L = tela.canvas.width, A = tela.canvas.height;
    const sprites = this.sold, kx = this._kx, ky = this._ky;
    // traçantes: risco curto e nítido que viaja até o alvo
    const l1 = Math.max(2, Math.trunc(2.6 * z + 0.5)), l2 = Math.max(1, Math.trunc(1.2 * z + 0.5));
    for (let i = 0; i < tropas.tracos.length; i++) {
      const tr = tropas.tracos[i];
      const a = Math.max(0.0, tr.t - 0.22), b = tr.t;
      const za = tr.z0 + (tr.z1 - tr.z0) * a, zb = tr.z0 + (tr.z1 - tr.z0) * b;
      const ax = tr.x0 + (tr.x1 - tr.x0) * a, ay = tr.y0 + (tr.y1 - tr.y0) * a;
      const bx = tr.x0 + (tr.x1 - tr.x0) * b, by = tr.y0 + (tr.y1 - tr.y0) * b;
      const pax = iso.sx(ax, ay) * z + ox, pay = iso.sy(ax, ay, za) * z + oy;
      const pbx = iso.sx(bx, by) * z + ox, pby = iso.sy(bx, by, zb) * z + oy;
      pg.linha_xy(tela, _TRACO_A, pax, pay, pbx, pby, l1);
      pg.linha_xy(tela, _TRACO_B, pax, pay, pbx, pby, l2);
    }
    // granadas no ar: sombra no chão, rastro de fumaça e o projétil virado na direção do voo
    for (let i = 0; i < tropas.granadas.length; i++) {
      const g = tropas.granadas[i];
      _pos_granada(g, g.t, _P);
      const x = _P[0], y = _P[1], alt = _P[2];
      const px = iso.sx(x, y) * z + ox, py = iso.sy(x, y, alt) * z + oy;
      if (px < -50 || px > L + 50 || py < -400 || py > A + 50) continue;
      const np = iso.elipse_buf(_B, iso.sx(x, y) * z + ox, iso.sy(x, y) * z + oy, 5 * z, 2.5 * z, 10);
      pg.poligono_buf(tela, _SOMBRA_GRANADA, _B, np);
      for (let k = 1; k < 5; k++) {
        const tk = g.t - k * 0.035;
        if (tk > 0) {
          _pos_granada(g, tk, _P);
          pg.circulo(tela, _RASTRO, iso.sx(_P[0], _P[1]) * z + ox, iso.sy(_P[0], _P[1], _P[2]) * z + oy,
            Math.max(1, Math.trunc((2.6 - k * 0.45) * z)));
        }
      }
      _pos_granada(g, Math.max(0.0, g.t - 0.03), _P);
      let vx = px - (iso.sx(_P[0], _P[1]) * z + ox), vy = py - (iso.sy(_P[0], _P[1], _P[2]) * z + oy);
      const l = Math.hypot(vx, vy) || 1.0;
      vx = vx / l * 4.5 * z; vy = vy / l * 4.5 * z;
      pg.linha_xy(tela, C.JANELA, px - vx, py - vy, px + vx, py + vy, Math.max(2, Math.trunc(3.4 * z)));
      pg.circulo(tela, C.FAIXA_GRANADEIRO, px + vx, py + vy, Math.max(1, Math.trunc(1.8 * z)));
    }

    // Efeitos originais do kit: fumaça, neve, faíscas e clarão do tanque.
    tropas.efeitos_tanque.desenhar(tela, z, ox, oy);

    // Granadas aéreas: seguem em linha reta, com rastro curto.
    for (let i = 0; i < tropas.tanque_tiros.length; i++) {
      const tiro = tropas.tanque_tiros[i];
      const q = Math.min(1.0, tiro.t);
      const x = tiro.x0 + (tiro.x1 - tiro.x0) * q;
      const y = tiro.y0 + (tiro.y1 - tiro.y0) * q;
      const px = iso.sx(x, y) * z + ox, py = iso.sy(x, y) * z + oy - 0.6 * C.ZH * z;
      pg.circulo(tela, C.ESCURO, px, py, Math.max(2, Math.trunc(3 * z)));
    }

    for (let i = 0; i < tropas.heli_granadas.length; i++) {
      const g = tropas.heli_granadas[i];
      const q = Math.min(1, g.t);
      const x = g.x0 + (g.x1 - g.x0) * q;
      const y = g.y0 + (g.y1 - g.y0) * q;
      const h = C.ALT_HELI * (1 - q) + 0.3 * q;
      const px = iso.sx(x, y) * z + ox, py = iso.sy(x, y, h) * z + oy;
      const qa = Math.max(0, q - 0.09);
      const ax = g.x0 + (g.x1 - g.x0) * qa;
      const ay = g.y0 + (g.y1 - g.y0) * qa;
      const ah = C.ALT_HELI * (1 - qa) + 0.3 * qa;
      pg.linha_xy(tela, C.FUMACA, iso.sx(ax, ay) * z + ox, iso.sy(ax, ay, ah) * z + oy, px, py, Math.max(1, Math.trunc(3 * z)));
      pg.circulo(tela, C.JANELA, px, py, Math.max(2, Math.trunc(3 * z)));
    }
    // obuses do canhão: bola escura rápida com rastro curto
    for (let i = 0; i < tropas.obuses.length; i++) {
      const o = tropas.obuses[i];
      _pos_obus(o, o.t, _P);
      const px = iso.sx(_P[0], _P[1]) * z + ox, py = iso.sy(_P[0], _P[1], _P[2]) * z + oy;
      _pos_obus(o, Math.max(0.0, o.t - 0.12), _P);
      pg.linha_xy(tela, _RASTRO, iso.sx(_P[0], _P[1]) * z + ox, iso.sy(_P[0], _P[1], _P[2]) * z + oy, px, py, Math.max(2, Math.trunc(2.6 * z)));
      pg.circulo(tela, C.JANELA, px, py, Math.max(2, Math.trunc(3.4 * z)));
    }

    // Foguete: traços de fumaça, corpo escuro e ponta de fogo.
    for (let i = 0; i < tropas.foguetes.length; i++) {
      const f = tropas.foguetes[i];
      const q = Math.min(1.0, f.t);
      const x = f.x0 + (f.x1 - f.x0) * q;
      const y = f.y0 + (f.y1 - f.y0) * q;
      const alt = 1.0 + 5.0 * Math.sin(Math.PI * q);
      const px = iso.sx(x, y) * z + ox, py = iso.sy(x, y, alt) * z + oy;
      if (!(-50 < px && px < L + 50 && -80 < py && py < A + 50)) continue;
      const ant = Math.max(0.0, q - 0.035);
      const ax = f.x0 + (f.x1 - f.x0) * ant;
      const ay = f.y0 + (f.y1 - f.y0) * ant;
      const apx = iso.sx(ax, ay) * z + ox, apy = iso.sy(ax, ay, 1.0 + 5.0 * Math.sin(Math.PI * ant)) * z + oy;
      pg.linha_xy(tela, C.FUMACA, apx, apy, px, py, Math.max(2, Math.trunc(5 * z)));
      let dx = px - apx, dy = py - apy;
      const norm = Math.hypot(dx, dy) || 1;
      dx /= norm; dy /= norm;
      pg.linha_xy(tela, C.FOGO, px - 9 * z * dx, py - 9 * z * dy, px - 3 * z * dx, py - 3 * z * dy, Math.max(2, Math.trunc(4 * z)));
      pg.linha_xy(tela, C.JANELA, px - 3 * z * dx, py - 3 * z * dy, px + 5 * z * dx, py + 5 * z * dy, Math.max(2, Math.trunc(3 * z)));
      pg.circulo(tela, C.FOGO_CLARO, px + 5 * z * dx, py + 5 * z * dy, Math.max(1, Math.trunc(2 * z)));
    }

    if (tropas.horda) {   // modo zumbi: poeira das pedras e o super grito, por cima de tudo
      const H = tropas.horda;
      for (let i = 0; i < H.impactos.length; i++) { const im = H.impactos[i]; if (this._visivel(im[0], im[1], 300)) desenhar(tela, zv.formas_impacto(im), z, ox, oy); }
      for (let i = 0; i < H.ondas.length; i++) { const o = H.ondas[i]; if (this._visivel(o.x, o.y, 420)) desenhar(tela, zv.formas_onda(o), z, ox, oy); }
      // discos voadores: raio, soldados subindo, o disco; os que caem e os que vão embora
      for (let i = 0; i < H.vivos.length; i++) { const o = H.vivos[i]; if (o.voa && !o.morto && o.estado !== 'puxando' && this._visivel(o.x, o.y, 260)) desenhar(tela, zv.formas_ovni(o, t), z, ox, oy); }
      for (let i = 0; i < H.levados.length; i++) {
        const l = H.levados[i];
        if (!this._visivel(l.x, l.y, 200)) continue;
        if (l.veiculo || !sprites.verde[l.tipo]) { desenhar(tela, zv.formas_levado(l, l.ate), z, ox, oy); continue; }
        const q = Math.min(1, l.t / 1.2), k = 1 - q * 0.6, sp = sprites.verde[l.tipo][l.s.dir || 0].p;
        const px = (l.x - l.y) * kx + ox, py = (l.x + l.y) * ky + oy - q * l.ate * C.ZH * z;
        tela.globalAlpha = Math.max(0, Math.min(1, (1.3 - l.t) * 3));
        tela.drawImage(sp[0], sp[3], sp[4], sp[5], sp[6], Math.trunc(px + sp[1] * k), Math.trunc(py + sp[2] * k), sp[5] * k, sp[6] * k);
        tela.globalAlpha = 1;
      }
      for (let i = 0; i < H.vivos.length; i++) { const o = H.vivos[i]; if (o.voa && o.estado === 'puxando' && !o.morto && this._visivel(o.x, o.y, 260)) desenhar(tela, zv.formas_ovni(o, t), z, ox, oy); }
      for (let i = 0; i < H.morrendo.length; i++) { const o = H.morrendo[i]; if (o.voa && this._visivel(o.x, o.y, 260)) desenhar(tela, zv.formas_ovni(o, t, { queda: o.morte }), z, ox, oy); }
      for (let i = 0; i < H.partindo.length; i++) { const p = H.partindo[i]; if (this._visivel(p.x, p.y, 400)) desenhar(tela, zv.formas_ovni(p, t, { sobe: p.t * p.t * 2.5, alfa: Math.max(0, 1 - p.t / 2.5) }), z, ox, oy); }
    }
    // explosões: estouro em estrela chapada, fumaça subindo e neve voando (sem brilho)
    for (let ie = 0; ie < tropas.explosoes.length; ie++) {
      const ex = tropas.explosoes[ie], x = ex[0], y = ex[1], t = ex[2], sem = ex[3], esc0 = ex[4];
      const rx = C.RAIO_GRANADA * HW * R2 * z * 0.8 * esc0, ry = C.RAIO_GRANADA * HH * R2 * z * 0.8 * esc0;
      const cx = iso.sx(x, y) * z + ox, cy = iso.sy(x, y) * z + oy;
      if (cx < -rx * 2 || cx > L + rx * 2 || cy < -rx * 2 || cy > A + rx * 2) continue;
      if (t < 0.5) {
        const tt = t / 0.5;
        for (let c = 0; c < 3; c++) {
          const esc = _ESC_EXPLOSAO[c];
          const cor = c === 0 ? C.FOGO : (c === 1 ? C.FOGO_CLARO : (tt < 0.4 ? C.BRANCO : C.FOGO_CLARO));
          for (let i = 0; i < 14; i++) {
            const raio = (0.35 + 0.75 * tt) * esc * (i % 2 === 0 ? 1.0 : 0.55);
            const a = sem + i * Math.PI / 7;
            _B[2 * i] = cx + Math.cos(a) * rx * raio; _B[2 * i + 1] = cy - 8 * z * tt + Math.sin(a) * ry * raio * 1.3;
          }
          pg.poligono_buf(tela, cor, _B, 14);
        }
      }
      const cor_fumaca = pg.css4(C.FUMACA[0], C.FUMACA[1], C.FUMACA[2], Math.trunc(210 * (1 - t)));
      for (let i = 0; i < 5; i++) {   // fumaça
        const a = sem + i * 1.2566;
        const np = iso.elipse_buf(_B, cx + Math.cos(a) * rx * 0.55 * t, cy + Math.sin(a) * ry * 0.55 * t - 34 * z * t,
          (6 + 11 * t) * z, (5 + 9 * t) * z, 10);
        pg.poligono_buf(tela, cor_fumaca, _B, np);
      }
      for (let i = 0; i < 8; i++) {   // torrões de neve
        const a = sem * 2 + i * 0.7854;
        const nx = cx + Math.cos(a) * rx * 1.15 * t;
        const ny = cy + Math.sin(a) * ry * 1.15 * t - 30 * z * 4 * t * (1 - t);
        const d = 2.6 * z;
        _B[0] = nx - d; _B[1] = ny; _B[2] = nx; _B[3] = ny - d * 0.7; _B[4] = nx + d; _B[5] = ny; _B[6] = nx; _B[7] = ny + d * 0.7;
        pg.poligono_buf(tela, C.BRANCO, _B, 4);
      }
    }

    // sopro de neve no impacto: losango branco que abre e some
    for (let i = 0; i < tropas.sopros.length; i++) {
      const sp = tropas.sopros[i], x = sp[0], y = sp[1], zz = sp[2], t = sp[3];
      const px = iso.sx(x, y) * z + ox, py = iso.sy(x, y, zz) * z + oy;
      const r = (2 + t * 5) * z;
      _B[0] = px - r; _B[1] = py; _B[2] = px; _B[3] = py - r * 0.6; _B[4] = px + r; _B[5] = py; _B[6] = px; _B[7] = py + r * 0.6;
      pg.poligono_buf(tela, pg.css4(255, 255, 255, Math.trunc(255 * (1 - t))), _B, 4);
    }
  }

  static _barra(tela, x, y, w, h, frac, cor) {
    // barra de vida chapada: contorno escuro, fundo cinza, cor do time
    const x0 = Math.trunc(x - w / 2);
    pg.ret_xywh(tela, C.ESCURO, x0 - 2, Math.trunc(y) - 2, Math.trunc(w) + 4, Math.trunc(h) + 4);
    pg.ret_xywh(tela, _BARRA_FUNDO, x0, Math.trunc(y), Math.trunc(w), Math.trunc(h));
    const cheio = Math.trunc(w * limitar(frac, 0.0, 1.0));
    if (cheio > 0) pg.ret_xywh(tela, cor, x0, Math.trunc(y), cheio, Math.trunc(h));
  }

  _medalha(time, tipo, e) {
    const chave = time + '|' + tipo + '|' + e.toFixed(3);
    const m = this._medalhas || (this._medalhas = new Map());
    let r = m.get(chave);
    if (r) return r;
    const R = Math.ceil(19 * e) + 2;
    const tela = pg.superficie(2 * R, 2 * R);
    const px = R, py = R, cx = R, cy = R;
    const sq = { time, tipo };
    pg.circulo(tela, C.BRANCO, cx, cy, Math.trunc(17 * e));
    pg.circulo(tela, C.TIMES[sq.time].emblema, cx, cy, Math.trunc(14 * e));
    if (sq.tipo === 'granada') {
      // granada: corpo redondo, bico e três riscos de estouro
      pg.circulo(tela, C.BRANCO, Math.trunc(px - 2 * e), Math.trunc(py + 3 * e), Math.trunc(5.5 * e));
      pg.linha_xy(tela, C.BRANCO, px + 1 * e, py, px + 5 * e, py - 4 * e, Math.max(2, Math.trunc(3 * e)));
      for (let r = 0; r < 6; r += 2) {
        const dx = _RISCOS_GRANADA[r], dy = _RISCOS_GRANADA[r + 1];
        pg.linha_xy(tela, C.FAIXA_GRANADEIRO, px + dx * 0.72 * e, py + dy * 0.72 * e, px + dx * e, py + dy * e, Math.max(2, Math.trunc(2 * e)));
      }
    } else if (sq.tipo === 'canhao') {
      // canhão: cano grosso apontado para cima-direita + roda
      pg.linha_xy(tela, C.BRANCO, px - 6 * e, py + 2 * e, px + 9 * e, py - 6 * e, Math.max(3, Math.trunc(5 * e)));
      pg.circulo(tela, C.BRANCO, Math.trunc(px - 4 * e), Math.trunc(py + 5 * e), Math.trunc(5 * e));
      pg.circulo(tela, C.TIMES[sq.time].emblema, Math.trunc(px - 4 * e), Math.trunc(py + 5 * e), Math.max(1, Math.trunc(2 * e)));
    } else {
      // fuzil: cano, coronha e punho
      pg.linha_xy(tela, C.BRANCO, px - 8 * e, py + 5 * e, px + 9 * e, py - 6 * e, Math.max(2, Math.trunc(3 * e)));
      pg.linha_xy(tela, C.BRANCO, px - 8.5 * e, py + 5.5 * e, px - 3.5 * e, py + 2.2 * e, Math.max(3, Math.trunc(5.5 * e)));
      pg.linha_xy(tela, C.BRANCO, px + 0.5 * e, py + 0.5 * e, px + 1.8 * e, py + 4.2 * e, Math.max(2, Math.trunc(2.4 * e)));
    }
    r = [tela.canvas, R];
    if (m.size > 64) pg.podar(m, 64);
    m.set(chave, r);
    return r;
  }

  _emblemas(tela, tropas, z, ox, oy) {
    const L = tela.canvas.width, A = tela.canvas.height;
    const e = limitar(z, 0.8, 1.25);   // tamanho estável na tela

    // torres de defesa: barra de vida em cima (some quando está cheia)
    const torres = tropas.torres || [];
    for (let i = 0; i < torres.length; i++) {
      const o = torres[i];
      if (!(o.vida < o.vida_max)) continue;
      const px = iso.sx(o.x, o.y) * z + ox, py = iso.sy(o.x, o.y, C.TORRE_ALTURA + 1.6) * z + oy;
      if (px < -60 || px > L + 60 || py < -30 || py > A + 30) continue;
      Cena._barra(tela, px, py, 60 * e, 8 * e, o.vida / o.vida_max, C.TIMES[o.time].base);
    }

    // "+1" PARAFUSO subindo de quem está treinando (só os seus)
    const gp = tropas.ganhos_pf || [];
    for (let i = 0; i < gp.length; i++) {
      const [x, y, time, tt] = gp[i];
      if (time !== this._lado) continue;
      const px = iso.sx(x, y) * z + ox, py = iso.sy(x, y, 1.5) * z + oy - tt * 30 * e;
      tela.save();
      tela.globalAlpha = Math.min(1, (1.6 - tt) / 0.5);
      icones.parafuso(tela, px - 10 * e, py, 8 * e);
      const n = this.texto('+' + C.PARAFUSO_GANHO, Math.trunc(17 * e), [214, 236, 255]);
      pg.blit(tela, n, Math.trunc(px + 2 * e), Math.trunc(py - n.height / 2));
      tela.restore();
    }

    // REPARO: "-1 parafuso" verdinho subindo da construção que se conserta (só as suas)
    const rps = tropas.reparos || [];
    for (let i = 0; i < rps.length; i++) {
      const [x, y, time, tt] = rps[i];
      if (time !== this._lado) continue;
      const px = iso.sx(x, y) * z + ox + Math.sin(i * 2.3) * 10 * e, py = iso.sy(x, y, 2.6) * z + oy - tt * 26 * e;
      if (px < -40 || px > L + 40 || py < -40 || py > A + 40) continue;
      tela.save();
      tela.globalAlpha = Math.min(1, (1.0 - tt) / 0.4);
      pg.circulo(tela, C.ESCURO, Math.trunc(px), Math.trunc(py), Math.trunc(8 * e));
      pg.circulo(tela, [70, 196, 110], Math.trunc(px), Math.trunc(py), Math.trunc(6.5 * e));
      const k = 3.5 * e;   // cruzinha de conserto
      pg.ret(tela, C.BRANCO, [Math.trunc(px - k), Math.trunc(py - 1 * e), Math.trunc(2 * k), Math.max(2, Math.trunc(2 * e))]);
      pg.ret(tela, C.BRANCO, [Math.trunc(px - 1 * e), Math.trunc(py - k), Math.max(2, Math.trunc(2 * e)), Math.trunc(2 * k)]);
      tela.restore();
    }

    // barricadas: barra de vida pequena (só quando já levou dano)
    const barrs = tropas.barricadas || [];
    for (let i = 0; i < barrs.length; i++) {
      const o = barrs[i];
      if (!(o.vida < o.vida_max)) continue;
      const px = iso.sx(o.x, o.y) * z + ox, py = iso.sy(o.x, o.y, 2.4) * z + oy;
      if (px < -60 || px > L + 60 || py < -30 || py > A + 30) continue;
      Cena._barra(tela, px, py, 44 * e, 6 * e, o.vida / o.vida_max, C.TIMES[o.time].base);
    }

    // bases: nome, barra de vida e barrinha azul do próximo pelotão gerado
    for (const b of tropas.todas_bases()) {
      const time = b.time;
      const px = iso.sx(b.x, b.y) * z + ox, py = (iso.sy(b.x, b.y) - b.alt) * z + oy;
      if (px < -100 || px > L + 100 || py < -40 || py > A + 40) continue;
      Cena._barra(tela, px, py, 84 * e, 9 * e, b.vida / b.vida_max, C.TIMES[time].base);
      if (b.vida > 0) {
        Cena._barra(tela, px, py + 13 * e, 84 * e, 5 * e, b.t_tropa / tropas.tempo_tropa(b), [86, 140, 220]);
      }
      const meu = time === this._lado;
      let nome;
      if (b.vida <= 0) nome = 'DESTRUÍDA';
      else if (b.principal) nome = meu ? 'SUA BASE' : (b.nave ? 'NAVE CAÍDA' : 'QG INIMIGO');
      else nome = meu ? 'BASE' : 'BASE INIMIGA';
      // Evolução do QG verde: reforços desenhados sobre a construção
      // original, sem trocar sua silhueta nem reconstruir os sprites.
      if (b.principal && meu && b.vida > 0) {
        const nivel = tropas.nivel_qg;
        for (let k = 0; k < nivel; k++) {
          const altura = (19 + k * 7) * z;
          const largura = (21 + k * 3) * z;
          pg.linha_xy(tela, C.CONCRETO_CLARO.topo, px - largura, py - altura, px + largura, py - altura, Math.max(2, Math.trunc(3 * z)));
          pg.linha_xy(tela, C.TIMES[time].base, px - largura, py - altura + 3 * z, px + largura, py - altura + 3 * z, Math.max(1, Math.trunc(2 * z)));
        }
        if (nivel) {
          const badge = this.texto('QG ' + nivel, Math.trunc(16 * e), C.BRANCO);
          pg.blit(tela, badge, Math.trunc(px - badge.width / 2), Math.trunc(py - (50 + nivel * 7) * z));
        }
      }
      const img = this.texto(nome, Math.trunc(20 * e), C.BRANCO);
      pg.blit(tela, img, Math.trunc(px - img.width / 2), Math.trunc(py - img.height - 2));
      if (meu && b.vida > 0 && b.falta_pf > 0) {   // sem PARAFUSOS para a tropa escolhida: "?" vermelho em cima
        const pul = 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 6 + b.x);
        const qy = py - img.height - 26 * e - pul * 4 * e, qr = 14 * e;
        tela.save();
        tela.globalAlpha = 0.35 + 0.3 * pul;   // brilho pulsando atrás
        tela.fillStyle = '#ff5a4a';
        tela.beginPath(); tela.arc(px, qy, qr * (1.5 + 0.3 * pul), 0, Math.PI * 2); tela.fill();
        tela.restore();
        pg.circulo(tela, C.ESCURO, Math.trunc(px), Math.trunc(qy), Math.trunc(qr + 2.5 * e));
        pg.circulo(tela, [222, 60, 48], Math.trunc(px), Math.trunc(qy), Math.trunc(qr));
        const q = this.texto('?', Math.trunc(20 * e), C.BRANCO);
        pg.blit(tela, q, Math.trunc(px - q.width / 2), Math.trunc(qy - q.height / 2));
        // ao lado: o parafuso e quanto precisa
        icones.parafuso(tela, px + qr + 12 * e, qy, 7 * e);
        const n = this.texto(String(b.falta_pf), Math.trunc(15 * e), [255, 220, 210]);
        pg.blit(tela, n, Math.trunc(px + qr + 21 * e), Math.trunc(qy - n.height / 2));
      } else if (meu && b.vida > 0 && b.carta && (!b.deck_base || b.deck) && tropas.drop_vivos && tropas.limite_drop &&
                 tropas.drop_vivos(this._lado, b.carta) >= tropas.limite_drop(this._lado, b.carta)) {
        // LIMITE da tropa escolhida atingido: bolinha azul "MÁX" em cima da base
        const qy = py - img.height - 24 * e, qr = 13 * e;
        pg.circulo(tela, C.ESCURO, Math.trunc(px), Math.trunc(qy), Math.trunc(qr + 2.5 * e));
        pg.circulo(tela, [52, 120, 220], Math.trunc(px), Math.trunc(qy), Math.trunc(qr));
        const q = this.texto('MÁX', Math.trunc(10 * e), C.BRANCO);
        pg.blit(tela, q, Math.trunc(px - q.width / 2), Math.trunc(qy - q.height / 2));
      }
    }

    // "+moedas" subindo de onde a tropa inimiga caiu
    for (let i = 0; i < tropas.flutuantes.length; i++) {
      const fl = tropas.flutuantes[i], x = fl[0], y = fl[1], txt = fl[2], t = fl[3];
      const px = iso.sx(x, y) * z + ox, py = iso.sy(x, y) * z + oy - (20 + t * 70) * e;
      const img = this.texto(txt, Math.trunc(34 * e), C.MOEDA_TEXTO, 3);
      const cx = Math.trunc(px - img.width / 2 - 12 * e), cy = Math.trunc(py);
      if (_SEM_MOEDA.test(txt)) { pg.blit(tela, img, Math.trunc(px - img.width / 2), Math.trunc(py - img.height / 2)); continue; }   // (fase 2: aviso de tropa, não é dinheiro)
      pg.circulo(tela, C.ESCURO, cx, cy, Math.trunc(12 * e));
      pg.circulo(tela, C.MOEDA, cx, cy, Math.trunc(9.5 * e));
      pg.circulo(tela, C.MOEDA_ESCURA, cx, cy, Math.trunc(5.5 * e));
      pg.blit(tela, img, Math.trunc(px - img.width / 2 + 6 * e), Math.trunc(py - img.height / 2));
    }

    // esquadrões: nº de soldados + barra de VIDA da tropa + círculo do time
    for (let i = 0; i < tropas.esquadroes.length; i++) {
      const sq = tropas.esquadroes[i];
      const n = sq.sold.length;
      if (!n) continue;
      const px = iso.sx(sq.x, sq.y) * z + ox;
      const py = iso.sy(sq.x, sq.y) * z + oy - (26 + Math.sqrt(n) * 2.6) * z;
      if (px < -60 || px > L + 60 || py < -20 || py > A + 90) continue;
      // MEDALHA do esquadrão (círculo do time + ícone): imagem pronta por
      // time/tipo/tamanho, 1 desenho em vez de 5 a 8 (desempenho)
      const md = this._medalha(sq.time, sq.tipo, e);
      tela.drawImage(md[0], Math.trunc(px) - md[1], Math.trunc(py) - md[1]);
      Cena._barra(tela, px, py - 30 * e, 50 * e, 7 * e, sq.vida / sq.vida_max, C.TIMES[sq.time].base);
      if (sq.time === this._lado && sq.mun !== undefined && sq.mun < 1) {   // fase 4: munição (só as suas)
        Cena._barra(tela, px, py - 21 * e, 50 * e, 4 * e, sq.mun, sq.mun > 0 ? _COR_MUN : _COR_SEM_MUN);
        if (sq.mun <= 0) { const sm = this.texto('SEM MUNIÇÃO', Math.trunc(12 * e), [255, 214, 200], 2); pg.blit(tela, sm, Math.trunc(px - sm.width / 2), Math.trunc(py + 20 * e)); }
      }
      const img = this.texto(String(n), Math.trunc(36 * e), C.BRANCO, 3);
      pg.blit(tela, img, Math.trunc(px - img.width / 2), Math.trunc(py - 34 * e - img.height));
      if (sq.nivel_treino > 0) {   // tropa transformada pelo treino: "2V" ao lado do número
        const L = sq.nivel_treino + 1;
        const ty = py - 34 * e - img.height / 2, bx = px + img.width / 2 + 5 * e;
        const w = 34 * e, h = 24 * e;
        pg.ret(tela, C.ESCURO, [Math.trunc(bx - 2), Math.trunc(ty - h / 2 - 2), Math.trunc(w + 4), Math.trunc(h + 4)], 0, Math.trunc(8 * e));
        pg.ret(tela, _OURO_TREINO, [Math.trunc(bx), Math.trunc(ty - h / 2), Math.trunc(w), Math.trunc(h)], 0, Math.trunc(7 * e));
        const num = this.texto(String(L), Math.trunc(19 * e), C.BRANCO, 2);
        pg.blit(tela, num, Math.trunc(bx + 4 * e), Math.trunc(ty - num.height / 2));
        const vx = bx + 4 * e + num.width + 1 * e;
        pg.linha_xy(tela, C.ESCURO, vx, ty - 5 * e, vx + 5 * e, ty + 5 * e, Math.max(2, Math.trunc(3.2 * e)));
        pg.linha_xy(tela, C.ESCURO, vx + 5 * e, ty + 5 * e, vx + 10 * e, ty - 5 * e, Math.max(2, Math.trunc(3.2 * e)));
      }
    }
    // TROPA CHEGANDO (carta comprada): marca no chão com o relógio de 1 minuto
    const agora = performance.now() / 1000;
    for (let i = 0; i < tropas.esquadroes.length; i++) {
      const sq = tropas.esquadroes[i];
      if (!(sq.chega > 0) || sq.sold.length) continue;
      const px = iso.sx(sq.x, sq.y) * z + ox, py = iso.sy(sq.x, sq.y) * z + oy;
      if (px < -80 || px > L + 80 || py < -60 || py > A + 80) continue;
      const cor = C.TIMES[sq.time].base, rx = 30 * e, ry = 15 * e, frac = Math.max(0, Math.min(1, 1 - sq.chega / C.CHEGADA));
      tela.save();
      tela.lineWidth = Math.max(2, 3 * e);
      tela.setLineDash([6 * e, 5 * e]);
      tela.lineDashOffset = -agora * 12;
      tela.strokeStyle = 'rgba(31,41,55,0.75)';
      tela.beginPath(); tela.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); tela.stroke();
      tela.setLineDash([]);
      tela.lineWidth = Math.max(3, 5 * e);
      tela.strokeStyle = `rgb(${cor[0]},${cor[1]},${cor[2]})`;
      tela.beginPath(); tela.ellipse(px, py, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); tela.stroke();
      tela.restore();
      const md = this._medalha(sq.time, sq.tipo, e * 0.8);
      tela.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(agora * 2));
      tela.drawImage(md[0], Math.trunc(px) - md[1], Math.trunc(py - 30 * e) - md[1]);
      tela.globalAlpha = 1;
      const seg = Math.ceil(sq.chega), txt = this.texto(`${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`, Math.trunc(20 * e), C.BRANCO, 3);
      pg.blit(tela, txt, Math.trunc(px - txt.width / 2), Math.trunc(py - 30 * e - md[1] - txt.height - 2 * e));
    }
    // FASE 5: CAMINHÕES — vida (se levou dano), carga e rota dos seus
    const cms = tropas.caminhoes || [];
    for (let i = 0; i < cms.length; i++) {
      const c = cms[i];
      const px = iso.sx(c.x, c.y) * z + ox, py = iso.sy(c.x, c.y) * z + oy;
      const meu = c.time === this._lado, sel = tropas.cam_sel === c;
      if (meu && c.de && c.para) {   // rota: carga -> descarga
        const ax = iso.sx(c.de.x, c.de.y) * z + ox, ay = iso.sy(c.de.x, c.de.y) * z + oy;
        const bx = iso.sx(c.para.x, c.para.y) * z + ox, by = iso.sy(c.para.x, c.para.y) * z + oy;
        tela.save();
        tela.setLineDash([10 * e, 8 * e]); tela.lineDashOffset = -agora * 20;
        tela.lineWidth = Math.max(2, (sel ? 4 : 2.5) * e);
        tela.strokeStyle = sel ? 'rgba(86,140,220,0.95)' : 'rgba(86,140,220,0.45)';
        tela.beginPath(); tela.moveTo(ax, ay); tela.lineTo(bx, by); tela.stroke();
        tela.restore();
      }
      if (px < -80 || px > L + 80 || py < -80 || py > A + 60) continue;
      if (sel) {
        tela.save(); tela.lineWidth = Math.max(2, 3 * e); tela.strokeStyle = 'rgba(255,255,255,0.95)';
        tela.setLineDash([6 * e, 4 * e]); tela.lineDashOffset = -agora * 14;
        tela.beginPath(); tela.ellipse(px, py, 38 * e, 19 * e, 0, 0, Math.PI * 2); tela.stroke(); tela.restore();
      }
      if (c.vida < c.vida_max) Cena._barra(tela, px, py - 48 * e, 44 * e, 6 * e, c.vida / c.vida_max, C.TIMES[c.time].base);
      if (meu) {
        const txt = this.texto(`${c.carga_total || 0}/${C.CAMINHAO_CAP}`, Math.trunc(13 * e), C.BRANCO, 2);
        pg.blit(tela, txt, Math.trunc(px - txt.width / 2), Math.trunc(py - 40 * e - txt.height));
      }
    }
    // FASE 2: TROPAS PRESAS no campo inimigo (90 s para resgatar com uma do mesmo tipo)
    const presos = tropas.presos || [];
    for (let i = 0; i < presos.length; i++) {
      const p = presos[i];
      const px = iso.sx(p.x, p.y) * z + ox, py = iso.sy(p.x, p.y) * z + oy;
      if (px < -80 || px > L + 80 || py < -90 || py > A + 60) continue;
      const meu = p.time === this._lado, cor = C.TIMES[p.time].base;
      // grade da "cela" no chão
      tela.save();
      tela.globalAlpha = 0.85;
      tela.fillStyle = 'rgba(31,41,55,0.35)';
      tela.beginPath(); tela.ellipse(px, py, 22 * e, 11 * e, 0, 0, Math.PI * 2); tela.fill();
      tela.restore();
      const md = this._medalha(p.time, p.tipo, e * 0.8);
      tela.globalAlpha = 0.6;
      tela.drawImage(md[0], Math.trunc(px) - md[1], Math.trunc(py - 30 * e) - md[1]);
      tela.globalAlpha = 1;
      const cx = px, cy = py - 30 * e, rr = md[1];
      for (let k = -2; k <= 2; k++) pg.linha_xy(tela, C.ESCURO, cx + k * rr * 0.38, cy - rr, cx + k * rr * 0.38, cy + rr, Math.max(2, Math.trunc(2.6 * e)));
      // anel do tempo que falta
      tela.save();
      tela.lineWidth = Math.max(2, 4 * e);
      tela.strokeStyle = `rgb(${cor[0]},${cor[1]},${cor[2]})`;
      tela.beginPath(); tela.arc(cx, cy, rr + 4 * e, -Math.PI / 2, -Math.PI / 2 + Math.max(0, p.t / C.PRESO_TEMPO) * Math.PI * 2); tela.stroke();
      tela.restore();
      const txt = this.texto(meu ? `RESGATE ${Math.ceil(p.t)}s` : `PRESA ${Math.ceil(p.t)}s`, Math.trunc(14 * e), C.BRANCO, 3);
      pg.blit(tela, txt, Math.trunc(px - txt.width / 2), Math.trunc(cy - rr - 8 * e - txt.height));
    }
    // FASE 2: FILA DO TREINO (suas tropas que caíram no seu campo esperando um campo livre)
    const nfila = tropas.fila_treino && tropas.fila_treino[this._lado] ? tropas.fila_treino[this._lado].length : 0;
    if (nfila > 0) {
      const a = M.area_de(this._lado, 1) || M.area_de(this._lado, 0);
      if (a) {
        const [tx, ty] = iso.de_uv((a.u0 + a.u1) / 2, a.v1);
        const px = iso.sx(tx, ty) * z + ox, py = iso.sy(tx, ty) * z + oy + 20 * e;
        if (px > -120 && px < L + 120 && py > -60 && py < A + 60) {
          const txt = this.texto(`FILA DO TREINO: ${nfila}`, Math.trunc(13 * e), C.BRANCO);
          const w = txt.width + 20 * e, h = 24 * e;
          pg.ret(tela, C.ESCURO, [Math.trunc(px - w / 2 - 2 * e), Math.trunc(py - h / 2 - 2 * e), Math.trunc(w + 4 * e), Math.trunc(h + 4 * e)], 0, Math.trunc(9 * e));
          pg.ret(tela, [86, 140, 220], [Math.trunc(px - w / 2), Math.trunc(py - h / 2), Math.trunc(w), Math.trunc(h)], 0, Math.trunc(8 * e));
          pg.blit(tela, txt, Math.trunc(px - txt.width / 2), Math.trunc(py - txt.height / 2));
        }
      }
    }
    // GPS das suas bases: linha tracejada da base até a bandeira do ponto de reunião
    const bs = tropas.todas_bases();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b.reuniao || b.time !== 'verde' || b.vida <= 0) continue;
      const [rx0, ry0] = b.reuniao;
      const bx = iso.sx(b.x, b.y) * z + ox, by = iso.sy(b.x, b.y) * z + oy;
      const px = iso.sx(rx0, ry0) * z + ox, py = iso.sy(rx0, ry0) * z + oy;
      tela.save();
      tela.setLineDash([8 * e, 7 * e]);
      tela.lineDashOffset = -agora * 16;
      tela.lineWidth = Math.max(2, 2.5 * e);
      tela.strokeStyle = 'rgba(47,163,90,0.7)';
      tela.beginPath(); tela.moveTo(bx, by); tela.lineTo(px, py); tela.stroke();
      tela.restore();
      if (px < -60 || px > L + 60 || py < -80 || py > A + 40) continue;
      tela.fillStyle = 'rgba(31,41,55,0.35)';
      tela.beginPath(); tela.ellipse(px, py, 12 * e, 6 * e, 0, 0, Math.PI * 2); tela.fill();
      pg.linha_xy(tela, C.ESCURO, px, py, px, py - 40 * e, Math.max(2, Math.trunc(3 * e)));
      const ond = Math.sin(agora * 4) * 3 * e;
      pg.poligono(tela, C.TIMES.verde.base, [[px, py - 40 * e], [px + 22 * e, py - 34 * e + ond], [px, py - 26 * e]]);
      const t2 = this.texto('GPS', Math.trunc(12 * e), C.BRANCO, 2);
      pg.blit(tela, t2, Math.trunc(px + 3 * e), Math.trunc(py - 38 * e));
    }
    // CAMPO DE TREINO INVADIDO (os seus): placa vermelha pulsando "PARADO" em cima
    const inv = tropas.campo_invadido && tropas.campo_invadido.verde;
    if (inv) {
      for (let n = 0; n < 3; n++) {
        if (!inv[n]) continue;
        const a = M.area_de('verde', n);
        if (!a) continue;
        const [tx, ty] = iso.de_uv((a.u0 + a.u1) / 2, a.v0);   // a ponta de cima do campo
        const px = iso.sx(tx, ty) * z + ox, py = iso.sy(tx, ty) * z + oy - 26 * e;
        if (px < -120 || px > L + 120 || py < -60 || py > A + 60) continue;
        const pul = 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 7);
        const txt = this.texto('INVADIDO · SEM PARAFUSOS', Math.trunc(13 * e), C.BRANCO);
        const w = txt.width + 34 * e, h = 24 * e;
        tela.save();
        tela.globalAlpha = 0.85 + 0.15 * pul;
        pg.ret(tela, C.ESCURO, [Math.trunc(px - w / 2 - 2 * e), Math.trunc(py - h / 2 - 2 * e), Math.trunc(w + 4 * e), Math.trunc(h + 4 * e)], 0, Math.trunc(9 * e));
        pg.ret(tela, [214 + 30 * pul, 58, 46], [Math.trunc(px - w / 2), Math.trunc(py - h / 2), Math.trunc(w), Math.trunc(h)], 0, Math.trunc(8 * e));
        icones.parafuso(tela, px - w / 2 + 13 * e, py, 6.5 * e);
        pg.blit(tela, txt, Math.trunc(px - w / 2 + 24 * e), Math.trunc(py - txt.height / 2));
        tela.restore();
      }
    }
  }
}
