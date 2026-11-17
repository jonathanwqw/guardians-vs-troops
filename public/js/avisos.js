// avisos.js — NOTIFICAÇÕES na lateral e o GUIA "?" até a tropa.
//
// Duas coisas pequenas, no mesmo desenho da interface do jogo:
//
//  1. Caixinhas de aviso, sempre do mesmo tamanho, empilhadas na lateral
//     direita logo abaixo do minimapa. Entram deslizando devagar pelo lado
//     (só até aparecer a caixa inteira), ficam uns segundos e saem do mesmo
//     jeito. Avisos: "TROPA CONCLUÍDA" (uma base acabou de soltar um grupo)
//     e "TROPA TREINADA" (subiu de nível no campo de treino).
//
//  2. O guia "?": se a tropa do aviso está FORA da tela, aparece um marcador
//     na borda, do lado em que ela está (como ouvir passos vindo de um lado),
//     com uma luz pulsando atrás e uma setinha apontando. Quando você chega
//     nela, o "?" fica em cima da tropa por alguns segundos e some. Se a tropa
//     já estava na tela no momento do aviso, não há marcador: só a caixinha.
//     Selecionar a tropa ou dar uma ordem a ela também tira o "?".
//
// Tocar na caixinha ou no marcador leva a câmera até a tropa.
// Funciona igual no solo e no multiplayer: só observa as SUAS tropas.
import * as C from './config.js';
import * as M from './mapa.js';
import * as iso from './iso.js';
import * as pg from './pg.js';
import * as icones from './icones.js';

const int = Math.trunc;
const CINZA = [107, 114, 128];
const OURO = [244, 192, 58], OURO_ESC = [176, 124, 20];
const VERDE = C.TIMES.verde.base;
const VERDE_ESC = C.TIMES.verde.esq;
const VERMELHO = [226, 58, 46], VERMELHO_ESC = [150, 30, 24];
const LARANJA = [236, 128, 40], LARANJA_ESC = [170, 80, 16];
const AZUL = [86, 140, 220], AZUL_ESC = [40, 90, 170];
const COR = { drop: VERDE, treino: OURO, invasao: VERMELHO, ataque: LARANJA, limite: AZUL, deck: OURO, parafuso: LARANJA, campo: VERMELHO };
const COR_ESC = { drop: VERDE_ESC, treino: OURO_ESC, invasao: VERMELHO_ESC, ataque: LARANJA_ESC, limite: AZUL_ESC, deck: OURO_ESC, parafuso: LARANJA_ESC, campo: VERMELHO_ESC };
const ESPERA_INVASAO = 25;   // s entre um alarme de invasão e outro
const ESPERA_ATAQUE = 12;    // s entre avisos de tropa sob ataque (e 30 s para a mesma tropa)
const ALARME = 2.3;          // s do efeito de luz da sirene
const K = 0.86;              // tamanho das caixinhas (1 = original)

const ENTRA = 1.25;     // s: entrada em "câmera lenta"
const FICA = 6.0;       // s visível
const SAI = 0.7;        // s de saída
const MAX_CAIXAS = 4;
const GUIA_NA_TELA = 3.5;   // s com o "?" em cima da tropa depois de achá-la
const GUIA_MAX = 120;       // s: o guia desiste sozinho depois disso

const sai_lento = (t) => 1 - Math.pow(1 - t, 5);     // desacelera bem no fim
const entra_rapido = (t) => t * t * t;

export class Avisos {
  constructor(ui) {
    this.ui = ui;
    this.som = null;          // quem joga entrega o som
    this.caixas = [];         // [{tipo, titulo, linha, cor, tropa, t, y, r}]
    this.guias = [];          // [{tropa, tipo, t, na_tela, cor}]
    this._est = new WeakMap(); // tropa -> {drop, nivel}
    this._ultimo = 0;
    this._primeira = true;
    this._alvos = [];         // [rect, [cx, cy]] para o toque
    this.alarme = -1;         // s desde que a sirene tocou (-1 = desligada)
    this._t = 0;              // relógio dos avisos
    this._t_invasao = -99; this._t_ataque = -99;
    this._invasores = new WeakSet();
    this._cheio = {};         // tipo -> limite do QG cheio (para avisar só na virada)
    this._t_cheio = {};
    this._deck = new Map();   // base 2/3 sem deck -> a caixinha FIXA "ESCOLHA O DECK"
    this._campo = [false, false, false];   // campo de treino já avisado como invadido
    this._pf = new Map();     // base -> já avisou que faltam parafusos (até voltar a ter)
  }

  limpar() {
    this._cheio = {}; this._t_cheio = {}; this._deck = new Map(); this._pf = new Map(); this._campo = [false, false, false];
    this.caixas = []; this.guias = []; this._est = new WeakMap(); this._primeira = true;
    this.alarme = -1; this._t_invasao = -99; this._t_ataque = -99; this._invasores = new WeakSet();
  }

  // ---------- quem observa ---------------------------------------------
  _nome_base(b) {
    if (b.principal) return 'QG';
    const u = b.x - b.y;
    return Math.abs(u) < 12 ? 'Base Centro' : (u < 0 ? 'Base Oeste' : 'Base Leste');
  }

  _base_de(T, sq) {
    let melhor = null, md = Infinity;
    for (const b of T.todas_bases()) {
      if (b.time !== 'verde' || b.vida <= 0) continue;
      const d = Math.hypot(b.x - sq.x, b.y - sq.y);
      if (d < md) { md = d; melhor = b; }
    }
    if (!melhor) return 'Base';
    if (melhor.principal) return 'QG';
    const u = melhor.x - melhor.y;
    return Math.abs(u) < 12 ? 'Base Centro' : (u < 0 ? 'Base Oeste' : 'Base Leste');
  }

  _perto_de(T, sq) {
    const nome = this._base_de(T, sq);
    return 'perto ' + (nome === 'QG' ? 'do QG' : 'da ' + nome);
  }

  _observar(T, cam) {
    const primeira = this._primeira;
    this._primeira = false;
    // LIMITE DO QG: uma base sua está com a carta escolhida, mas o limite
    // desse tipo de tropa no campo já está cheio (a base fica parada)
    const parados = {};
    for (const b of T.todas_bases()) {
      if (b.time !== 'verde' || b.vida <= 0) continue;
      let tipo = T.carta_desbloqueada(b.carta) ? b.carta : 'pelotao';
      if (b.deck_base) {   // base 2/3: só o que está no deck (e liberado)
        if (!b.deck) continue;
        tipo = b.deck.includes(b.carta) && T.carta_desbloqueada(b.carta) ? b.carta : b.deck.find(k => T.carta_desbloqueada(k));
        if (!tipo) continue;
      }
      if (T.drop_vivos('verde', tipo) >= T.limite_drop('verde', tipo)) (parados[tipo] = parados[tipo] || []).push(b);
    }
    // FALTAM PARAFUSOS: a base parou porque não tem parafuso para a tropa escolhida
    // (avisa uma vez; avisa de novo só depois que ela voltar a soltar tropa)
    for (const b of T.todas_bases()) {
      if (b.time !== 'verde' || b.vida <= 0) continue;
      if (!(b.falta_pf > 0)) { this._pf.delete(b); continue; }
      if (this._pf.has(b) || this.ui.tutorial_ativo) continue;
      this._pf.set(b, true);
      const nome = b.deck_base ? `Base ${b.deck_base}` : this._nome_base(b);
      this._novo('parafuso', 'FALTAM PARAFUSOS', `${nome} precisa de ${b.falta_pf} · treine tropas`, null, cam, b, null);
    }
    // CAMPO DE TREINO INVADIDO: inimigo dentro do seu campo, ele para de render parafusos
    const inv = T.campo_invadido && T.campo_invadido.verde;
    if (inv) {
      const nomes = ['da esquerda', 'do meio', 'da direita'];
      for (let n = 0; n < 3; n++) {
        if (!inv[n]) { this._campo[n] = false; continue; }
        if (this._campo[n] || this.ui.tutorial_ativo) continue;
        this._campo[n] = true;
        const a = M.area_de('verde', n);
        const foco = a ? { x: a.x, y: a.y, base: true, vida: 1 } : null;   // tocar leva a câmera até o campo
        this._novo('campo', 'CAMPO INVADIDO', `Campo ${nomes[n]} parou de render parafusos`, null, cam, foco, null);
      }
    }
    // ESCOLHA O DECK: as duas primeiras notificações da partida. Ficam presas
    // na tela até você escolher o deck da base 2 e da base 3
    const sem_deck = T.todas_bases().filter(b => b.time === 'verde' && b.deck_base && !b.deck && b.vida > 0)
      .sort((a, b) => a.deck_base - b.deck_base);
    for (const b of sem_deck) {
      if (this._deck.has(b) || this.ui.tutorial_ativo) continue;   // espera o tutorial acabar
      this._novo('deck', 'ESCOLHA O DECK', `Base ${b.deck_base} · toque para escolher 3 cartas`, null, cam, b, null);
      const c = this.caixas[this.caixas.length - 1];
      c.fixa = true; c.base_deck = b;
      this._deck.set(b, c);
    }
    for (const tipo of C.ORDEM_CARTAS) {
      const bases = parados[tipo];
      const cheio = !!bases;
      if (cheio && !this._cheio[tipo] && !primeira && this._t - (this._t_cheio[tipo] || -99) >= 20) {
        this._t_cheio[tipo] = this._t;
        const lim = T.limite_drop('verde', tipo);
        const nomes = bases.map(b => this._nome_base(b));
        const quem = nomes.length === 1 ? `${nomes[0]} parad${nomes[0] === 'QG' ? 'o' : 'a'}` : `${nomes.length} bases paradas`;
        this._novo('limite', 'LIMITE ATINGIDO', `${C.PELOTOES[tipo].nome} ${lim}/${lim} · ${quem}`, null, cam, bases[0], tipo);
      }
      this._cheio[tipo] = cheio;
    }
    // INVASÃO: tropa inimiga entrou no seu território
    for (const sq of T.esquadroes) {
      if (sq.time === 'verde' || !sq.sold.length || this._invasores.has(sq)) continue;
      if (M.dono(sq.x, sq.y) !== 'verde') continue;
      this._invasores.add(sq);
      if (primeira || this._t - this._t_invasao < ESPERA_INVASAO) continue;
      this._t_invasao = this._t;
      const nome = C.PELOTOES[sq.tipo] ? C.PELOTOES[sq.tipo].nome : 'Tropa';
      this._novo('invasao', 'INVASÃO!', `${nome} ×${sq.sold.length} · ${this._perto_de(T, sq)}`, sq, cam);
      this.alarme = 0;
    }
    for (const sq of T.esquadroes) {
      if (sq.time !== 'verde' || sq.exclusa) continue;
      let st = this._est.get(sq);
      if (!st) {
        // nasceu agora saindo de uma base (soldados ainda saindo, ou marcada como "da base")
        st = { drop: !primeira && (sq.treinando > 0 || sq.da_base), nivel: sq.nivel_treino || 0, visto_cheio: false };
        this._est.set(sq, st);
        continue;
      }
      if (sq.treinando > 0 && !st.visto_cheio) { st.drop = true; }
      if (st.drop && !sq.treinando && sq.sold.length) {
        st.drop = false;
        st.visto_cheio = true;
        const nome = C.PELOTOES[sq.tipo] ? C.PELOTOES[sq.tipo].nome : 'Tropa';
        this._novo('drop', 'TROPA CONCLUÍDA', `${nome} ×${sq.sold.length} · ${this._base_de(T, sq)}`, sq, cam);
      } else if (!sq.treinando) {
        st.visto_cheio = true;
      }
      const vida = sq.vida;
      st.vida = vida;
      const nv = sq.nivel_treino || 0;
      if (nv > st.nivel) {
        const nome = C.PELOTOES[sq.tipo] ? C.PELOTOES[sq.tipo].nome : 'Tropa';
        this._novo('treino', 'TROPA TREINADA', `${C.NOME_TREINADO[sq.tipo] || nome} ×${sq.sold.length} · 2V`, sq, cam);
      }
      st.nivel = nv;
    }
  }

  _na_tela(sq, cam, folga = 0) {
    const [px, py] = this._tela(sq, cam);
    return px > -folga && px < cam.vw + folga && py > -folga && py < cam.vh + folga;
  }

  _tela(sq, cam) {
    return [(iso.sx(sq.x, sq.y) - cam.x) * cam.zoom + cam.vw / 2, (iso.sy(sq.x, sq.y) - cam.y) * cam.zoom + cam.vh / 2];
  }

  _novo(tipo, titulo, linha, sq, cam, foco = null, tipo_tropa = null) {
    const cor = COR[tipo];
    // tira a mais antiga se já tem muitas
    const vivas = this.caixas.filter(c => c.t < ENTRA + FICA && !c.fixa);   // as fixas nunca saem por isso
    if (vivas.length >= MAX_CAIXAS) vivas[0].t = Math.max(vivas[0].t, ENTRA + FICA);
    // TROPA PRONTA e LIMITE não vão mais para a caixinha lateral: ficam só
    // os marcadores na tela (o "GPSzinho" da borda e os sinais em cima das bases)
    if (tipo !== 'drop' && tipo !== 'limite')
      this.caixas.push({ tipo, titulo, linha, cor, tropa: sq, foco: foco || sq, tipo_tropa: tipo_tropa || (sq && sq.tipo), t: 0, y: null });
    // o "?" só quando a tropa não está na tela agora
    if (sq && !this._na_tela(sq, cam, -20)) {
      this.guias = this.guias.filter(g => g.tropa !== sq);
      this.guias.push({ tropa: sq, tipo, cor, t: 0, na_tela: 0 });
    }
    if (this.som) {
      if (tipo === 'invasao') this.som.tocar('sirene');
      else if (tipo === 'treino') this.som.tocar('aviso_treino');
      else if (tipo === 'drop' || tipo === 'limite' || tipo === 'deck' || tipo === 'parafuso' || tipo === 'campo') this.som.tocar('aviso');
      // tropa sob ataque: o jogo já toca o aviso de "sob ataque"
    }
  }

  // ---------- desenho ----------------------------------------------------
  desenhar(tela, cam) {
    const agora = performance.now() / 1000;
    const dt = this._ultimo ? Math.min(0.1, agora - this._ultimo) : 0;
    this._ultimo = agora;
    const T = this.ui.tropas;
    this._t += dt;
    this._observar(T, cam);
    this._alvos = [];
    if (this.alarme >= 0) {
      this._luz_alarme(tela, cam, this.alarme);
      this.alarme += dt;
      if (this.alarme > ALARME) this.alarme = -1;
    }
    this._desenhar_caixas(tela, cam, dt, agora);
    this._desenhar_guias(tela, cam, dt, agora, T);   // o "?" fica por cima das caixinhas
  }

  _desenhar_caixas(tela, cam, dt, agora) {
    const ui = this.ui, u = ui.u * K;
    const W = int(236 * u), H = int(62 * u), vao = int(8 * u);
    const xf = ui.vw - int(10 * u) - W;                 // posição final (encostada na lateral)
    const y0 = ui.r_mini[1] + ui.r_mini[3] + int(12 * u);
    this.caixas = this.caixas.filter(c => c.t < ENTRA + FICA + SAI);
    let i = 0;
    for (const c of this.caixas) {
      c.t += dt;
      if (c.fixa) {   // caixinha fixa: fica até o deck ser escolhido (ou a base cair)
        const b = c.base_deck;
        if (b.deck || b.vida <= 0 || !this.ui.tropas.todas_bases().includes(b)) { c.fixa = false; c.t = Math.max(c.t, ENTRA + FICA); this._deck.delete(b); }
        else c.t = Math.min(c.t, ENTRA + 0.5);
      }
      const alvo_y = y0 + i * (H + vao);
      c.y = c.y === null ? alvo_y : c.y + (alvo_y - c.y) * Math.min(1, dt * 7);   // as de baixo sobem com calma
      let k;   // 0 = fora da tela, 1 = no lugar
      if (c.t < ENTRA) k = sai_lento(c.t / ENTRA);
      else if (c.t < ENTRA + FICA) k = 1;
      else k = 1 - entra_rapido((c.t - ENTRA - FICA) / SAI);
      const x = xf + (1 - k) * (W + int(24 * u));
      this._caixa(tela, c, int(x), int(c.y), W, H, agora);
      const foco = c.foco;
      if (c.t < ENTRA + FICA && foco && (foco.base ? foco.vida > 0 : T_vivo(ui.tropas, foco))) {
        this._alvos.push([[int(x), int(c.y), W, H], foco]);
      }
      if (c.t < ENTRA + FICA) i++;
    }
  }

  _caixa(tela, c, x, y, W, H, agora) {
    const ui = this.ui, u = ui.u * K;
    const escura = COR_ESC[c.tipo];
    // sombra + corpo
    pg.ret(tela, [31, 41, 55, 70], [x + int(3 * u), y + int(5 * u), W, H], 0, int(12 * u));
    ui._pilula(tela, [x, y, W, H], C.BRANCO, C.ESCURO, 12);
    // faixa colorida à esquerda (com um brilho que corre na chegada)
    const fw = int(54 * u);
    pg.ret(tela, c.cor, [x + int(3 * u), y + int(3 * u), fw, H - int(6 * u)], 0, int(10 * u));
    pg.ret(tela, c.cor, [x + fw - int(6 * u), y + int(3 * u), int(9 * u), H - int(6 * u)]);
    if (c.t < ENTRA + 0.6) {
      const p = Math.min(1, c.t / (ENTRA + 0.6));
      const bx = x + int(3 * u) + p * (fw + int(40 * u));
      pg.ret(tela, [255, 255, 255, int(110 * (1 - p))], [int(bx), y + int(3 * u), int(10 * u), H - int(6 * u)]);
    }
    // ícone da tropa num círculo
    const cx = x + int(3 * u) + fw / 2, cy = y + H / 2;
    pg.circulo(tela, C.ESCURO, int(cx), int(cy), int(20 * u));
    pg.circulo(tela, C.BRANCO, int(cx), int(cy), int(17.5 * u));
    if (c.tipo === 'deck') this._icone_deck(tela, cx, cy, u, agora);
    else if (c.tipo === 'parafuso' || c.tipo === 'campo') icones.parafuso(tela, cx, cy, 12 * u);
    else if (c.tipo_tropa) ui._icone_tropa(tela, c.tipo_tropa, cx, cy + 1 * u, int(28 * u), false, c.tropa ? c.tropa.time : 'verde');
    if (c.tipo === 'limite') {   // plaquinha "MÁX" embaixo do ícone
      const pw = int(30 * u), ph = int(13 * u), px = int(cx - pw / 2), py = int(cy + 12 * u);
      pg.ret(tela, C.ESCURO, [px - 1, py - 1, pw + 2, ph + 2], 0, int(5 * u));
      pg.ret(tela, AZUL, [px, py, pw, ph], 0, int(4 * u));
      ui._texto(tela, 'MÁX', ui.fonte(9), C.BRANCO, [cx, py + ph / 2]);
    }
    if ((c.tipo === 'invasao' || c.tipo === 'ataque') && c.tropa) {   // selo "!" no canto do ícone
      const sx = int(cx + 9 * u), sy = int(cy + 9 * u);
      pg.circulo(tela, C.ESCURO, sx, sy, int(9.5 * u));
      pg.circulo(tela, c.cor, sx, sy, int(7.5 * u));
      ui._texto(tela, '!', ui.fonte(10), C.BRANCO, [sx, sy]);
    }
    if (c.tipo === 'treino' && c.tropa) {   // selo do nível no canto do ícone
      const L = (c.tropa.nivel_treino || 0) + 1;
      const sx = int(cx + 9 * u), sy = int(cy + 9 * u);
      pg.circulo(tela, C.ESCURO, sx, sy, int(9.5 * u));
      pg.circulo(tela, OURO, sx, sy, int(7.5 * u));
      ui._texto(tela, String(L), ui.fonte(10), C.ESCURO, [sx, sy]);
    }
    // textos
    const tx = x + fw + int(14 * u);
    const pisca = c.tipo === 'invasao' && c.t < ENTRA + 2.5 && Math.floor(c.t * 4) % 2 === 0;
    pg.blit(tela, ui.fonte(13).render(c.titulo, pisca ? VERMELHO : C.ESCURO), tx, y + int(11 * u));
    const f2 = ui.fonte(11, false);
    let linha = c.linha;
    const lim = W - (tx - x) - int(36 * u);
    while (linha.length > 4 && f2.size(linha)[0] > lim) linha = linha.slice(0, -2);
    if (linha !== c.linha) linha = linha.trimEnd() + '…';
    pg.blit(tela, f2.render(linha, CINZA), tx, y + int(33 * u));
    // à direita: "?" se a tropa está fora da tela, senão um visto
    const rx = int(x + W - 20 * u), ry = int(y + H / 2);
    const guia = !!c.tropa && this.guias.some(g => g.tropa === c.tropa && g.na_tela === 0);
    pg.circulo(tela, C.ESCURO, rx, ry, int(11 * u));
    pg.circulo(tela, guia || c.tipo === 'limite' || c.tipo === 'deck' ? c.cor : [236, 242, 252], rx, ry, int(9 * u));
    if (c.tipo === 'deck') ui._texto(tela, '!', ui.fonte(11), C.ESCURO, [rx, ry]);
    else if (guia) ui._texto(tela, c.tipo === 'invasao' ? '!' : '?', ui.fonte(11), c.tipo === 'invasao' ? C.BRANCO : C.ESCURO, [rx, ry]);
    else if (c.tipo === 'limite') {   // seta para cima: suba o QG para liberar mais
      pg.poligono(tela, C.BRANCO, [[rx, ry - 5 * u], [rx + 4.5 * u, ry + 0.5 * u], [rx + 1.6 * u, ry + 0.5 * u], [rx + 1.6 * u, ry + 4.5 * u], [rx - 1.6 * u, ry + 4.5 * u], [rx - 1.6 * u, ry + 0.5 * u], [rx - 4.5 * u, ry + 0.5 * u]]);
    }
    else pg.linhas(tela, escura, false, [[rx - 4 * u, ry], [rx - 1 * u, ry + 3.5 * u], [rx + 4.5 * u, ry - 3.5 * u]], Math.max(2, int(2.2 * u)));
    if (c.fixa) {   // borda dourada pulsando: está esperando você
      const a = 0.45 + 0.45 * Math.sin(agora * 4);
      pg.ret(tela, [244, 192, 58, int(255 * a)], [x - int(2 * u), y - int(2 * u), W + int(4 * u), H + int(4 * u)], Math.max(2, int(3 * u)), int(13 * u));
    }
    // barrinha do tempo que falta
    if (c.t >= ENTRA && c.t < ENTRA + FICA && !c.fixa) {
      const resta = 1 - (c.t - ENTRA) / FICA;
      const bw = W - fw - int(30 * u);
      pg.ret(tela, [229, 231, 235], [tx, y + H - int(10 * u), bw, int(3 * u)], 0, int(2 * u));
      pg.ret(tela, c.cor, [tx, y + H - int(10 * u), Math.max(1, int(bw * resta)), int(3 * u)], 0, int(2 * u));
    }
  }

  _desenhar_guias(tela, cam, dt, agora, T) {
    const ui = this.ui, u = ui.u;
    const vivos = [];
    for (const g of this.guias) {
      const sq = g.tropa;
      g.t += dt;
      if (!T_vivo(T, sq) || g.t > GUIA_MAX) continue;
      // você já mexeu nela: o guia some
      // (no campo de treino ela anda sozinha no exercício: aí só conta sair do campo)
      if (g.tipo === 'invasao') {
        if (M.dono(sq.x, sq.y) !== 'verde') continue;   // saiu do seu território
      } else {
        if (T.selecionado === sq) continue;
        if (g.tipo === 'treino' ? sq.treino < 0 : !!sq.destino) continue;
      }
      const [px, py] = this._tela(sq, cam);
      const dentro = px > 30 * u && px < cam.vw - 30 * u && py > 60 * u && py < cam.vh - 40 * u;
      if (dentro) {
        g.na_tela += dt;
        if (g.na_tela > GUIA_NA_TELA) continue;
        // em cima da tropa: o "?" balançando, apagando no final
        const a = Math.min(1, (GUIA_NA_TELA - g.na_tela) / 0.6);
        const e = iso.limitar(cam.zoom, 0.8, 1.25);
        const by = py - (74 + Math.sin(agora * 4) * 4) * e;
        this._marcador(tela, px, by, null, g, agora, a, false);
        this._alvos.push([[int(px - 20 * u), int(by - 20 * u), int(40 * u), int(40 * u)], sq]);
      } else {
        g.na_tela = 0;
        // na borda, do lado em que ela está
        const m = 26 * u;
        const x0 = m, x1 = cam.vw - m, y0 = (ui.y_status || 60 * u) + 44 * u, y1 = cam.vh - 92 * u;
        const cx = cam.vw / 2, cy = (y0 + y1) / 2;
        let dx = px - cx, dy = py - cy;
        let k = Infinity;
        if (dx > 0) k = Math.min(k, (x1 - cx) / dx); else if (dx < 0) k = Math.min(k, (x0 - cx) / dx);
        if (dy > 0) k = Math.min(k, (y1 - cy) / dy); else if (dy < 0) k = Math.min(k, (y0 - cy) / dy);
        const mx = cx + dx * k, my = cy + dy * k;
        const l = Math.hypot(dx, dy) || 1;
        // chega deslizando da borda no começo
        const a = Math.min(1, g.t / 0.5);
        this._marcador(tela, mx, my, [dx / l, dy / l], g, agora, a, true);
        this._alvos.push([[int(mx - 24 * u), int(my - 24 * u), int(48 * u), int(48 * u)], sq]);
      }
      vivos.push(g);
    }
    this.guias = vivos;
  }

  _marcador(tela, x, y, dir, g, agora, alfa, borda) {
    // o ícone "?" no estilo do jogo: luz pulsando ATRÁS (o ícone fica parado)
    const ui = this.ui, u = ui.u;
    const R = 17 * u;
    const ciclo = (agora * 0.9 + (g.tipo === 'treino' ? 0.5 : 0)) % 1;   // ~1,1 s por pulso
    const cor = g.cor;
    tela.save();
    tela.globalAlpha = alfa;
    // halo: dois anéis de luz crescendo e sumindo
    for (const fase of [ciclo, (ciclo + 0.5) % 1]) {
      const rr = R * (1.15 + fase * 1.7);
      const grad = tela.createRadialGradient(x, y, R * 0.6, x, y, rr);
      grad.addColorStop(0, `rgba(${cor[0]},${cor[1]},${cor[2]},${(0.8 * (1 - fase)).toFixed(3)})`);
      grad.addColorStop(0.55, `rgba(255,255,255,${(0.35 * (1 - fase)).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${cor[0]},${cor[1]},${cor[2]},0)`);
      tela.fillStyle = grad;
      tela.beginPath(); tela.arc(x, y, rr, 0, Math.PI * 2); tela.fill();
    }
    // setinha apontando para a tropa (na borda)
    if (dir) {
      const [ux, uy] = dir, px = -uy, py = ux;
      const p0 = [x + ux * (R + 11 * u), y + uy * (R + 11 * u)];
      const p1 = [x + ux * (R - 1 * u) + px * 9 * u, y + uy * (R - 1 * u) + py * 9 * u];
      const p2 = [x + ux * (R - 1 * u) - px * 9 * u, y + uy * (R - 1 * u) - py * 9 * u];
      pg.poligono(tela, C.ESCURO, [[p0[0] + ux * 2.5 * u, p0[1] + uy * 2.5 * u], [p1[0] + px * 2 * u, p1[1] + py * 2 * u], [p2[0] - px * 2 * u, p2[1] - py * 2 * u]]);
      pg.poligono(tela, cor, [p0, p1, p2]);
    }
    // corpo: contorno escuro, anel da cor do aviso, miolo branco e o "?"
    pg.circulo(tela, [31, 41, 55, 80], int(x + 2 * u), int(y + 3 * u), int(R + 2 * u));
    pg.circulo(tela, C.ESCURO, int(x), int(y), int(R + 2 * u));
    pg.circulo(tela, cor, int(x), int(y), int(R));
    pg.circulo(tela, C.BRANCO, int(x), int(y), int(R - 4 * u));
    pg.circulo(tela, [255, 255, 255], int(x - 3 * u), int(y - 4 * u), int(3 * u));
    const inv = g.tipo === 'invasao';
    ui._texto(tela, inv ? '!' : '?', ui.fonte(inv ? 21 : 19), inv ? VERMELHO_ESC : C.ESCURO, [x, y + 1 * u]);
    // na borda: o ícone da tropa num selinho embaixo
    if (borda && g.tropa) {
      // do lado oposto ao da setinha, para não tapar a ponta
      const [ux, uy] = dir || [-0.7071, -0.7071];
      const sx = int(x - ux * R * 0.95 + uy * R * 0.35), sy = int(y - uy * R * 0.95 - ux * R * 0.35);
      pg.circulo(tela, C.ESCURO, sx, sy, int(9.5 * u));
      pg.circulo(tela, C.BRANCO, sx, sy, int(8 * u));
      ui._icone_tropa(tela, g.tropa.tipo, sx, sy, int(13 * u), false, g.tropa.time);
    }
    tela.restore();
  }

  // ---------- luz da sirene ---------------------------------------------------
  // Feito como nos jogos de ação: um clarão vermelho curto nas BORDAS (entra
  // forte em ~0,1 s e some rápido), duas vezes, e uma faixa larga de luz
  // vermelha atravessando a tela, como a luz de uma sirene girando passando
  // por você. A tela não fica vermelha: o meio quase não muda.
  _luz_alarme(tela, cam, t) {
    const W = cam.vw, H = cam.vh;
    tela.save();
    tela.globalCompositeOperation = 'lighter';
    // 1) clarão nas bordas: dois pulsos (0 s e 1,1 s), ataque rápido e queda curta
    for (const t0 of [0, 1.1]) {
      const q = t - t0;
      if (q < 0 || q > 0.75) continue;
      const a = q < 0.08 ? q / 0.08 : Math.exp(-(q - 0.08) * 5.5);
      const g = tela.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      g.addColorStop(0, 'rgba(255,30,20,0)');
      g.addColorStop(0.7, `rgba(255,40,24,${(0.22 * a).toFixed(3)})`);
      g.addColorStop(1, `rgba(255,24,16,${(0.62 * a).toFixed(3)})`);
      tela.fillStyle = g;
      tela.fillRect(0, 0, W, H);
    }
    // 2) a faixa de luz da sirene: vai da esquerda para a direita e volta
    for (const [t0, ida] of [[0.05, true], [1.15, false]]) {
      const q = (t - t0) / 0.95;
      if (q < 0 || q > 1) continue;
      const p = q * q * (3 - 2 * q);                       // suave nas pontas
      const larg = W * 0.5;
      const cx = ida ? -larg + p * (W + 2 * larg) : W + larg - p * (W + 2 * larg);
      const inclina = H * 0.35;                            // faixa inclinada, como um feixe girando
      const forca = Math.sin(Math.PI * q);
      const g = tela.createLinearGradient(cx - larg / 2 - inclina, 0, cx + larg / 2 + inclina, H);
      g.addColorStop(0, 'rgba(255,40,30,0)');
      g.addColorStop(0.38, `rgba(255,46,30,${(0.16 * forca).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(255,150,120,${(0.30 * forca).toFixed(3)})`);
      g.addColorStop(0.62, `rgba(255,46,30,${(0.16 * forca).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,40,30,0)');
      tela.fillStyle = g;
      tela.fillRect(0, 0, W, H);
    }
    tela.restore();
  }

  _icone_deck(tela, cx, cy, u, agora) {
    // três cartinhas em leque (o deck)
    const ang = [-0.32, 0, 0.32];
    for (let i = 0; i < 3; i++) {
      tela.save();
      tela.translate(cx, cy + 4 * u);
      tela.rotate(ang[i] + Math.sin(agora * 3 + i) * 0.04);
      const w = 11 * u, h = 16 * u;
      tela.fillStyle = '#1f2937';
      tela.beginPath(); tela.roundRect ? tela.roundRect(-w / 2 - 1, -h - 1, w + 2, h + 2, 3 * u) : tela.rect(-w / 2 - 1, -h - 1, w + 2, h + 2); tela.fill();
      tela.fillStyle = i === 1 ? '#f4c03a' : '#ffffff';
      tela.beginPath(); tela.roundRect ? tela.roundRect(-w / 2, -h, w, h, 2.5 * u) : tela.rect(-w / 2, -h, w, h); tela.fill();
      tela.fillStyle = i === 1 ? '#b07c14' : '#3c9a52';
      tela.beginPath(); tela.arc(0, -h * 0.58, 2.6 * u, 0, 6.2832); tela.fill();
      tela.restore();
    }
  }

  // ---------- toque ---------------------------------------------------------
  clique(pos) {
    // tocou numa caixinha ou num marcador: devolve o ponto da cena da tropa
    for (let i = this._alvos.length - 1; i >= 0; i--) {
      const [r, sq] = this._alvos[i];
      if (pos[0] >= r[0] && pos[0] <= r[0] + r[2] && pos[1] >= r[1] && pos[1] <= r[1] + r[3]) {
        // 3º valor: a base 2/3 cuja escolha de deck deve abrir
        return [iso.sx(sq.x, sq.y), iso.sy(sq.x, sq.y), sq.base && sq.deck_base && !sq.deck ? sq : null];
      }
    }
    return null;
  }
}

function T_vivo(T, sq) { return !!sq && sq.sold.length > 0 && T.esquadroes.includes(sq); }
