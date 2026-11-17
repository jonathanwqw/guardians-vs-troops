// tutorial.js — o tutorial do MODO SOLO (no multiplayer ele não existe).
//
// Começa junto com a partida e para o jogo enquanto está na tela:
//   * a interface some devagar e a paisagem escurece e fica embaçada (sem
//     ficar preta);
//   * só o que a dica mostra fica claro (um "holofote" com borda macia);
//   * a câmera viaja até o assunto de cada dica;
//   * a caixa da dica sobe e o texto aparece letra por letra, como num
//     teclado, com o barulhinho das teclas;
//   * na dica do treinamento (e na da base 1) uma mãozinha mostra os toques.
// Um toque completa o texto; outro passa para a próxima dica. "PULAR" encerra.
// Aparece em toda partida solo enquanto "Ativar tutorial" (Configurações)
// estiver ligado.
import * as C from './config.js';
import * as M from './mapa.js';
import * as iso from './iso.js';
import * as pg from './pg.js';

const PILHA = `${pg.FAMILIA}, FreeSans, "Liberation Sans", Arial, Helvetica, sans-serif`;
function fonte(px) { return `${Math.round(px)}px ${PILHA}`; }

const VEL_TEXTO = 42;          // letras por segundo
const AMARELO = '#ffd45a';

function suave(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function sobe(t) { t = Math.max(0, Math.min(1, t)); return 1 - (1 - t) * (1 - t); }

function ret_arred(ctx, x, y, w, h, r) {
  // (raio nunca negativo: o canvas para o jogo se receber um)
  w = Math.max(1, w); h = Math.max(1, h);
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// textos: o que está entre *asteriscos* sai em amarelo
const PASSOS = [
  {
    id: 'bases', titulo: 'AS SUAS BASES',
    texto: 'Estas são as suas *bases*. Use as bases para *dropar unidades* no campo. ' +
      'Cada base tem *2 unidades*. Fique atento aos *limites de tropa*!',
  },
  {
    id: 'qg', titulo: 'BASE 1 · A PRINCIPAL',
    texto: 'Esta é a *base 1*, a principal. Toque nela e *melhore a base 1* para ' +
      '*desbloquear tropas melhores*.',
  },
  {
    id: 'treino', titulo: 'TREINAMENTO',
    texto: 'Aqui fica o *treinamento*. Você manda uma *tropa* treinar e ela volta *melhor*. Olha só:',
    texto2: 'Pronto! A tropa foi *treinar*. Em *3 minutos* ela vira *2V*. E com gente treinando, o *campo* rende ' +
      '*3 parafusos a cada 10 s*: são os *parafusos* que pagam as tropas que as *bases* soltam sozinhas!',
  },
  {
    // abre a tela de Habilidades de verdade e compra a primeira melhoria (grátis)
    id: 'melhorias', titulo: 'MELHORIAS',
    texto: 'Agora as *melhorias*. Em *Habilidades* você deixa cada tropa *mais forte*: ' +
      'dano, vida, velocidade e recarga. Olha só:',
    texto2: 'Pronto! O *pelotão* ganhou *+1 de dano* (essa foi *grátis*). Cada melhoria vale para ' +
      '*todas as tropas* daquele tipo, as que já estão no campo e as que vierem.',
  },
  {
    // a mais animada: a aba abre de verdade, a carta é escolhida e a tropa
    // (grátis) cai no campo; depois vem o texto final
    id: 'batalhao', titulo: 'BATALHÃO',
    texto: 'Agora o *Batalhão*! É ali embaixo que você *compra cartas* de tropa, com *parafusos*. ' +
      'Olha só como é:',
    texto2: 'Pronto! Você *escolheu a carta* e *posicionou a tropa*. Normalmente ela *chega em 1 minuto*; ' +
      'essa primeira foi *grátis* e na hora!',
  },
  {
    // a câmera vai até a base 2, abre a janela dela de verdade, depois pula
    // para a base 3 e mostra de novo: cada base tem o seu deck, 2 de cada
    id: 'base2', titulo: 'BASE 2 E BASE 3',
    texto: 'Esta é a *base 2*. Ela e a *base 3* têm um *deck* de *3 cartas*, escolhido ' +
      '*uma vez só*, no começo. Olha só:',
    texto2: 'As duas bases *não repetem cartas*. Depois, na janela da base, você escolhe *qual das 3 ela dropa* ' +
      '(as bloqueadas só depois de subir o QG). Só *2 de cada tropa* ficam no campo. ' +
      'As notificações levam você até lá. *Boa batalha*!',
  },
];

// dica curta que aparece na PRIMEIRA vez que os parafusos acabam (tutorial ligado)
export const PASSOS_PARAFUSOS = [
  {
    id: 'pf', titulo: 'PARAFUSOS',
    texto: 'Aqui você consegue mais *parafusos* colocando *tropas para treinar*.',
  },
  {
    id: 'pf', titulo: 'PARAFUSOS',
    texto: 'O seu *campo de treinamento* rende *parafusos* ao colocar tropas para treinar.',
  },
  {
    id: 'pf', titulo: 'PARAFUSOS',
    texto: 'Mantenha *tropas sempre treinando*!',
  },
];

export class Tutorial {
  constructor(tropas, som, ui = null, passos = PASSOS) {
    this.passos = passos;
    this.tropas = tropas;
    this.som = som;
    this.ui = ui;               // a interface de verdade (o Batalhão abre nela)
    this.fase = 'intro';        // no Batalhão: intro -> demo -> final
    this.deixa_atualizar = false;   // a tropa grátis precisa "cair" (o jogo anda um pouco)
    this._credito = 0;          // parafusos dados para a carta grátis (devolvidos se pular)
    this._ponto = null;         // onde a tropa grátis cai
    this._nova = null;          // a tropa grátis
    this.ativo = true;          // enquanto true, o jogo fica parado
    this.saindo = false;
    this.vis = 0.0;             // 0..1: escuro/embaçado e interface sumida
    this.i = -1;                // dica atual
    this.estado = 'camera';     // camera -> texto -> (toque) -> saida -> camera ...
    this.t = 0.0;               // tempo no estado
    this.td = 0.0;              // tempo da demonstração (mãozinha)
    this.caixa = 0.0;           // 0..1: caixa da dica entrando
    this.n = 0;                 // letras já "digitadas"
    this._n_som = 0;
    this._linhas = null;
    this.r_pular = null;
    this._cam0 = null; this._cam1 = null;
    this._tropa = null;         // tropa usada na demonstração do treino
    this.lado = 'baixo';        // onde a caixa da dica fica (baixo, cima, direita)
    this._proximo();
  }

  // ---------- passos ---------------------------------------------------
  _proximo() {
    this.i++;
    if (this.i >= this.passos.length) { this.fechar(); return; }
    this.estado = 'camera';
    this.t = 0.0; this.td = 0.0;
    this.n = 0; this._n_som = 0;
    this._linhas = null;
    this.fase = 'intro'; this.tdemo = 0.0; this._memo = {};
    this._cam0 = null;   // a viagem é calculada no próximo quadro (precisa da câmera)
  }

  fechar() {
    // pular ou terminar: a paisagem clareia e a interface volta
    if (this.saindo) return;
    this.saindo = true;
    if (this._credito) {   // pulou no meio: a carta grátis não fica de presente
      this.tropas.parafusos.verde = Math.max(0, this.tropas.parafusos.verde - this._credito);
      this._credito = 0;
    }
    if (this.ui) { this.ui.gaveta = null; this.ui.area_aberta = -1; this.ui.base_aberta = null; if (this.ui.carta_sel) this.ui.limpar_carta(); }
    this.estado = 'fim';
    this.t = 0.0;
  }

  passo_atual() { return this.passos[Math.max(0, Math.min(this.passos.length - 1, this.i))]; }

  // o que a dica mostra, em px de cena (sem câmera): elipses e retângulos
  _focos() {
    const T = this.tropas, p = this.passo_atual();
    const ze = (x, y, r, sobe_px = 14) => ({
      tipo: 'e', cx: iso.sx(x, y), cy: iso.sy(x, y) - sobe_px, rx: r * iso.HW * 1.42, ry: r * iso.HH * 1.42 + sobe_px * 0.6,
    });
    if (p.id === 'bases') {
      return T.todas_bases().filter(b => b.time === 'verde' && b.vida > 0).map(b => ze(b.x, b.y, 6.2, 18));
    }
    if (p.id === 'qg') {
      const b = T.bases.verde;
      return [ze(b.x, b.y, 7.2, 20)];
    }
    if (p.id === 'base2') {
      const b = this._bases_extras()[0] || T.bases.verde;
      return [ze(b.x, b.y, 6.2, 18)];
    }
    if (p.id === 'pf') {   // os 3 campos de treino
      const m = 1.2;
      return M.AREAS_TREINO.filter(q => q.time === 'verde').map(a => ({
        tipo: 'r', x: (a.u0 - m) * iso.HW, y: (a.v0 - m) * iso.HH - 24,
        w: (a.u1 - a.u0 + 2 * m) * iso.HW, h: (a.v1 - a.v0 + 2 * m) * iso.HH + 24,
      }));
    }
    if (p.id === 'melhorias') return [];   // a câmera fica onde está (o assunto é a tela de Habilidades)
    if (p.id === 'batalhao') {   // a câmera olha para onde a tropa grátis vai cair
      const [x, y] = this._ponto_drop();
      return [ze(x, y, 4.5, 6)];
    }
    // treino: o campo do meio + a tropa mais perto dele
    const a = M.area_de('verde', 1) || M.AREAS_TREINO.find(q => q.time === 'verde');
    const m = 1.2;
    const focos = [{
      tipo: 'r', x: (a.u0 - m) * iso.HW, y: (a.v0 - m) * iso.HH - 24,
      w: (a.u1 - a.u0 + 2 * m) * iso.HW, h: (a.v1 - a.v0 + 2 * m) * iso.HH + 24,
    }];
    const sq = this._tropa_demo();
    if (sq) focos.push(ze(sq.x, sq.y, sq.raio() + 1.6, 8));
    return focos;
  }

  _bases_extras() {
    // base 2 = a da esquerda, base 3 = a da direita (as que não são a principal)
    const T = this.tropas;
    const bs = T.todas_bases().filter(b => b.time === 'verde' && b.vida > 0 && !b.principal);
    bs.sort((a, b) => iso.sx(a.x, a.y) - iso.sx(b.x, b.y));
    return bs;
  }

  _ponto_drop() {
    // um lugar livre no seu território, na frente da base 1 e longe das outras tropas
    if (this._ponto) return this._ponto;
    const T = this.tropas;
    let melhor = null, md = -1;
    for (const [du, dv] of [[-22, -14], [22, -14], [-20, -20], [20, -20], [0, -26], [-14, -10], [14, -10]]) {
      const b = T.bases.verde;
      const u0 = b.x - b.y + du, v0 = b.x + b.y + dv;
      const [x, y] = iso.de_uv(u0, v0);
      if (!T.pode_posicionar(x, y) || M.area_em('verde', x, y)) continue;
      let perto = Infinity;
      for (const q of T.esquadroes) perto = Math.min(perto, Math.hypot(q.x - x, q.y - y));
      for (const o of T.todas_bases()) perto = Math.min(perto, Math.hypot(o.x - x, o.y - y) * 1.5);
      if (perto > md) { md = perto; melhor = [x, y]; }
    }
    this._ponto = melhor || [T.bases.verde.x - 8, T.bases.verde.y - 8];
    return this._ponto;
  }

  _buracos_cena() {
    // o que fica claro na paisagem (no Batalhão muda conforme a demonstração)
    const p = this.passo_atual();
    if (p.id === 'base2') {
      const bs = this._bases_extras();
      const b = (this.fase === 'final' || (this.fase === 'demo' && this.tdemo > 4.0)) ? (bs[1] || bs[0]) : bs[0];
      if (!b) return [];
      return [{ tipo: 'e', cx: iso.sx(b.x, b.y), cy: iso.sy(b.x, b.y) - 18, rx: 6.2 * iso.HW * 1.42, ry: 6.2 * iso.HH * 1.42 + 11 }];
    }
    if (p.id !== 'batalhao') return this._focos();
    const [x, y] = this._ponto_drop();
    const ze = (r) => ({ tipo: 'e', cx: iso.sx(x, y), cy: iso.sy(x, y) - 6, rx: r * iso.HW * 1.42, ry: r * iso.HH * 1.42 + 4 });
    if (this.fase === 'final') return [ze(this._nova ? this._nova.raio() + 1.8 : 4.5)];
    if (this.fase === 'demo' && this.tdemo > 2.95) return [ze(4.5)];
    return [];
  }

  _buracos_ui() {
    // retângulos da interface que aparecem por cima do escuro (só no Batalhão)
    const p = this.passo_atual(), ui = this.ui;
    const ret_de = (r) => ({ tipo: 'r', x: r[0], y: r[1], w: r[2], h: r[3] });
    if (p.id === 'treino') {   // a janela do campo de treino aberta
      if (!ui || this.fase !== 'demo' || ui.area_aberta < 0 || !ui.r_janela_treino) return [];
      return [ret_de(ui.r_janela_treino)];
    }
    if (p.id === 'melhorias') {   // a aba Habilidades e, aberta, a tela inteira
      if (!ui || this.fase === 'final' || this.estado === 'fim') return [];
      if (ui.gaveta === 'hab' && ui.anim_gaveta > 0.5 && ui.r_hab) return [ret_de(ui.r_hab)];
      return [ret_de(ui.aba_loja)];
    }
    if (p.id === 'base2') {   // a janela da base aberta
      if (!ui || this.estado === 'fim' || !ui.base_aberta || !ui.r_janela_base) return [];
      const r = ui.r_janela_base;
      return [{ tipo: 'r', x: r[0], y: r[1], w: r[2], h: r[3] }];
    }
    if (p.id !== 'batalhao' || !ui || this.fase === 'final' || this.estado === 'fim') return [];
    const fs = [];
    const a = ui.aba_cartas;
    if (this.fase === 'intro' || this.tdemo < 2.95) fs.push({ tipo: 'r', x: a[0], y: a[1], w: a[2], h: a[3] });
    if (this.fase === 'demo' && this.tdemo > 1.05 && this.tdemo < 3.05 && ui.cartas && ui.cartas.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [, r] of ui.cartas) { x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]); }
      fs.push({ tipo: 'r', x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    return fs;
  }

  _tropa_demo() {
    // a tropa verde mais perto do campo de treino do meio
    const T = this.tropas;
    if (this._tropa && this._tropa.sold.length && T.esquadroes.includes(this._tropa)) return this._tropa;
    const a = M.area_de('verde', 1);
    const ax = a ? a.x : T.bases.verde.x, ay = a ? a.y : T.bases.verde.y;
    let melhor = null, md = Infinity;
    for (const q of T.esquadroes) {
      if (q.time !== 'verde' || !q.sold.length || q.treino >= 0) continue;   // -1 = fora do treino
      const d = (q.x - ax) ** 2 + (q.y - ay) ** 2;
      if (d < md) { md = d; melhor = q; }
    }
    this._tropa = melhor;
    return melhor;
  }

  // ---------- quadro a quadro ------------------------------------------
  atualizar(dt, cam, u) {
    this.t += dt;
    if (this.estado === 'fim') {
      this.vis = Math.max(0, this.vis - dt / 0.55);
      this.caixa = Math.max(0, this.caixa - dt / 0.25);
      if (this.vis <= 0) this.ativo = false;
      return;
    }
    this.vis = Math.min(1, this.vis + dt / 0.7);

    if (this.estado === 'camera') {
      this.caixa = Math.max(0, this.caixa - dt / 0.22);
      if (!this._cam0) {
        this._cam0 = [cam.x, cam.y];
        this._cam1 = this._alvo_camera(cam, u);
        const d = Math.hypot(this._cam1[0] - cam.x, this._cam1[1] - cam.y);
        this._dur = Math.max(0.55, Math.min(1.2, d / 900));
        if (this.i === 0) this._dur = Math.max(this._dur, 0.75);   // dá tempo de escurecer
      }
      const k = suave(this.t / this._dur);
      cam.x = this._cam0[0] + (this._cam1[0] - this._cam0[0]) * k;
      cam.y = this._cam0[1] + (this._cam1[1] - this._cam0[1]) * k;
      if (this.t >= this._dur) {
        this.estado = 'texto'; this.t = 0.0;
        this.som.tocar('dica');
      }
    } else if (this.estado === 'texto') {
      this.caixa = Math.min(1, this.caixa + dt / 0.3);
      this.td += dt;
      if (this.t > 0.25) {   // a caixa já subiu: começa a "digitar"
        const total = this._total_letras();
        this.n = Math.min(total, this.n + dt * VEL_TEXTO);
        const ni = Math.floor(this.n);
        if (ni > this._n_som) {   // barulhinho de tecla (não toca em espaço)
          const txt = this._texto_plano();
          for (let k = this._n_som; k < ni; k++) {
            if (txt[k] && txt[k] !== ' ') { this.som.tocar('tecla'); break; }
          }
          this._n_som = ni;
        }
      }
    } else if (this.estado === 'saida') {
      this.caixa = Math.max(0, this.caixa - dt / 0.22);
      this.td += dt;
      if (this.caixa <= 0) this._proximo();
    } else if (this.estado === 'demo') {
      this.caixa = Math.max(0, this.caixa - dt / 0.22);
      this._passo_demo(dt, cam);
    }
  }

  _passo_demo(dt, cam) {
    const id = this.passo_atual().id;
    if (id === 'base2') { this._passo_demo_bases(dt, cam); return; }
    if (id === 'treino') { this._passo_demo_treino(dt); return; }
    if (id === 'melhorias') { this._passo_demo_melhorias(dt); return; }
    // O BATALHÃO DE VERDADE: a mão toca na aba, a gaveta abre, a carta do
    // pelotão é escolhida (grátis) e a tropa cai no ponto tocado
    const t0 = this.tdemo, t1 = (this.tdemo += dt);
    const passou = (t) => t0 < t && t1 >= t;
    const ui = this.ui, T = this.tropas;
    if (!ui) { this._fim_demo(); return; }
    if (passou(1.05)) {             // 1º toque: abre o Batalhão
      ui.gaveta = 'cartas'; ui.base_aberta = null; ui.area_aberta = -1;
      this.som.tocar('menu_clique');
    }
    if (passou(2.95)) {             // 2º toque: escolhe a carta (por nossa conta)
      const custo = C.PF_CARTA.pelotao;   // (carta se paga em parafusos)
      T.parafusos.verde += custo; this._credito = custo;
      if (T.carta_pronta('pelotao')) { ui.selecionar_carta('pelotao'); this.som.tocar('carta_pega'); }
      else { T.parafusos.verde -= custo; this._credito = 0; ui.gaveta = null; }
    }
    if (passou(4.45)) {             // 3º toque: a tropa cai no campo
      const [x, y] = this._ponto_drop();
      const antes = new Set(T.esquadroes);
      if (this._credito && T.posicionar('pelotao', x, y)) {
        this._nova = T.esquadroes.find(q => !antes.has(q)) || null;
        if (this._nova) this._nova.chega = 0.01;   // a do tutorial chega na hora
        this.deixa_atualizar = true;   // deixa a tropa chegar (a onda continua parada)
      } else if (this._credito) {
        T.parafusos.verde -= this._credito;
      }
      this._credito = 0;
      if (ui.carta_sel) ui.limpar_carta();
      ui.gaveta = null;
    }
    if (this.tdemo >= 6.3) this._fim_demo();
  }

  _passo_demo_bases(dt, cam) {
    // base 2: toca, a escolha do deck abre, a mão marca 3 cartas e mostra o
    // CONFIRMAR (sem confirmar: quem escolhe de verdade é você). Fecha, a
    // câmera pula para a base 3 e mostra o mesmo com as outras 3 cartas
    const t0 = this.tdemo, t1 = (this.tdemo += dt);
    const passou = (t) => t0 < t && t1 >= t;
    const ui = this.ui;
    const bs = this._bases_extras();
    if (!ui || !bs.length) { this._fim_demo(); return; }
    const b2 = bs[0], b3 = bs[1] || bs[0];
    const cartas = (b) => (b === b2 ? C.ORDEM_CARTAS.slice(0, 3) : C.ORDEM_CARTAS.slice(3, 6));
    for (const [o, b] of [[0, b2], [5.1, b3]]) {
      if (passou(o + 0.95)) { ui.abrir_base(b); this.som.tocar('menu_clique'); }
      const ks = cartas(b);
      for (let k = 0; k < 3; k++) {
        if (passou(o + 1.85 + k * 0.6) && ui.base_aberta === b && !b.deck) { if (ui.alternar_deck(ks[k])) this.som.tocar('carta_pega'); }
      }
      if (passou(o + 3.9)) { ui.base_aberta = null; ui.deck_sel = []; this.som.tocar('desselecionar'); }
    }
    if (this.tdemo > 4.0 && this.tdemo <= 5.1) {               // a câmera pula para a base 3
      if (!this._cam_b3) {
        const mx = Math.max(0.0, C.LX - cam.vw / 2 / cam.zoom), my = Math.max(0.0, C.LY - cam.vh / 2 / cam.zoom);
        this._cam_b2 = [cam.x, cam.y];
        this._cam_b3 = [iso.limitar(cam.x + iso.sx(b3.x, b3.y) - iso.sx(b2.x, b2.y), -mx, mx),
          iso.limitar(cam.y + iso.sy(b3.x, b3.y) - iso.sy(b2.x, b2.y), -my, my)];
        this.som.tocar('zoom');
      }
      const k = suave((this.tdemo - 4.0) / 1.1);
      cam.x = this._cam_b2[0] + (this._cam_b3[0] - this._cam_b2[0]) * k;
      cam.y = this._cam_b2[1] + (this._cam_b3[1] - this._cam_b2[1]) * k;
    }
    if (this.tdemo >= 9.3) { this._cam_b3 = null; this._fim_demo(); }
  }

  _lembra(chave, r) {
    // guarda o último retângulo visto de um botão (a janela pode fechar antes da mão sair)
    this._memo = this._memo || {};
    if (r) this._memo[chave] = r.slice();
    else if (this.tdemo < 0.1) this._memo[chave] = null;
    return this._memo[chave] || null;
  }

  _passo_demo_treino(dt) {
    // 1 toca na tropa (seleciona) -> 2 toca no campo (a janela real abre)
    // -> 3 ENVIAR PARA O TREINO (vai de verdade) -> a tropa anda até o campo
    const t0 = this.tdemo, t1 = (this.tdemo += dt);
    const passou = (t) => t0 < t && t1 >= t;
    const ui = this.ui, T = this.tropas;
    const sq = this._tropa_demo();
    const a = M.area_de('verde', 1);
    if (!ui || !sq || !a) { this._fim_demo(); return; }
    if (passou(0.95)) { T.selecionado = sq; this.som.tocar('selecionar'); }
    if (passou(2.25)) { ui.abrir_treino(a.n, sq); T.selecionado = null; this.som.tocar('menu_clique'); }
    if (passou(3.45)) {
      const ok = ui.area_aberta >= 0 && T.enviar_treino('verde', ui.area_aberta, ui.treino_sel, ui.treino_qtd);
      this.som.tocar(ok ? 'ordem' : 'erro');
      if (ok) { ui.area_aberta = -1; T.deu_ordem = true; this.deixa_atualizar = true; }
      else ui.area_aberta = -1;
    }
    if (this.tdemo >= 6.2) this._fim_demo();
  }

  _demo_treino_real(tela, cam, u) {
    const ui = this.ui, t = this.tdemo;
    const sq = this._tropa_demo(), a = M.area_de('verde', 1);
    if (!ui || !a) return;
    const z = cam.zoom, ox = cam.vw / 2 - cam.x * z, oy = cam.vh / 2 - cam.y * z;
    const na_tela = (x, y, h = 0) => [iso.sx(x, y) * z + ox, iso.sy(x, y, h) * z + oy];
    const P_tropa = sq ? na_tela(sq.x, sq.y, 0.6) : na_tela(a.x, a.y);
    const P_area = na_tela(a.x, a.y);
    const al = (ui._alvos_treino || []).find(([k]) => k === 'tr_enviar');
    const r_env = this._lembra('env', ui.area_aberta >= 0 && al ? al[1] : null);   // (fica no lugar depois que a janela fecha)
    const P_env = r_env ? [r_env[0] + r_env[2] / 2, r_env[1] + r_env[3] / 2] : [cam.vw / 2, cam.vh * 0.6];
    const inicio = [P_tropa[0] + 100 * u, P_tropa[1] + 80 * u];
    const saida = [P_env[0] + 120 * u, P_env[1] + 70 * u];
    const roteiro = [[0.0, 0.9, inicio, P_tropa], [1.3, 2.2, P_tropa, P_area], [2.6, 3.4, P_area, P_env], [3.8, 4.6, P_env, saida]];
    let pos = inicio;
    for (const [t0, t1, de, para] of roteiro) {
      if (t >= t0) { const k = suave((t - t0) / (t1 - t0)); pos = [de[0] + (para[0] - de[0]) * k, de[1] + (para[1] - de[1]) * k]; }
    }
    const fade = (a0, b0) => Math.min((t - a0) / 0.25, (b0 - t) / 0.25);
    this._legenda(tela, u, cam, '1 · Toque na tropa', P_tropa, fade(0.2, 1.3));
    this._legenda(tela, u, cam, '2 · Toque no campo de treino', P_area, fade(1.4, 2.5));
    if (r_env) this._legenda(tela, u, cam, '3 · Enviar para o treino', [P_env[0], r_env[1] + r_env[3]], fade(2.5, 3.6), true, 8);
    if (sq && t > 3.6) this._legenda(tela, u, cam, 'Campo com tropa: +3 parafusos a cada 10 s', na_tela(sq.x, sq.y, 1.0), fade(3.7, 6.1));
    const toques = [[0.95, P_tropa, 1], [2.25, P_area, 2], [3.45, P_env, 3]];
    tela.save();
    tela.globalAlpha = Math.min(1, t / 0.3, (6.2 - t) / 0.4);
    this._toques_e_mao(tela, u, t, pos, toques, 6.2, true);
    tela.restore();
  }

  _passo_demo_melhorias(dt) {
    // 1 toca em Habilidades (a tela abre) -> 2 escolhe o Pelotão -> 3 "+"
    // no Dano (a primeira é grátis) -> mostra o "+" da Vida e fecha
    const t0 = this.tdemo, t1 = (this.tdemo += dt);
    const passou = (t) => t0 < t && t1 >= t;
    const ui = this.ui, T = this.tropas;
    if (!ui) { this._fim_demo(); return; }
    if (passou(1.05)) { ui.gaveta = 'hab'; ui.base_aberta = null; ui.area_aberta = -1; ui.hab_tipo = 'pelotao'; this.som.tocar('menu_clique'); }
    if (passou(2.85)) { ui.hab_tipo = 'pelotao'; this.som.tocar('clique'); }
    if (passou(4.05)) {
      const custo = T.custo_hab('pelotao', 'dano');
      T.moedas += custo;   // por nossa conta
      if (!T.comprar_hab('pelotao', 'dano')) T.moedas -= custo;
      else this._comprou = true;
    }
    if (passou(6.0)) { ui.gaveta = null; this.som.tocar('desselecionar'); }
    if (this.tdemo >= 6.4) this._fim_demo();
  }

  _demo_melhorias(tela, cam, u) {
    const ui = this.ui, t = this.tdemo;
    if (!ui) return;
    const alvo = (nome) => { const a = (ui._alvos_hab || []).find(([k]) => k === nome); return a ? a[1] : null; };
    const aberta = ui.gaveta === 'hab' && ui.anim_gaveta > 0.5;
    const centro = (r, fx = 0.5) => r ? [r[0] + r[2] * fx, r[1] + r[3] / 2] : [cam.vw / 2, cam.vh / 2];
    const a = ui.aba_loja;
    const P_aba = [a[0] + a[2] / 2, a[1] + a[3] / 2];
    const r_tp = this._lembra('tp', aberta ? alvo('hab_tipo:pelotao') : null);
    const r_dano = this._lembra('dano', aberta ? alvo('hab:pelotao:dano') : null);
    const r_vida = this._lembra('vida', aberta ? alvo('hab:pelotao:vida') : null);
    const P_tp = centro(r_tp, 0.4), P_dano = centro(r_dano), P_vida = centro(r_vida);
    const inicio = [cam.vw * 0.45, cam.vh + 40 * u];
    const roteiro = [[0.0, 1.0, inicio, P_aba], [2.0, 2.8, P_aba, P_tp], [3.2, 4.0, P_tp, P_dano], [4.6, 5.3, P_dano, P_vida],
      [5.6, 6.2, P_vida, [P_vida[0] + 60 * u, cam.vh + 40 * u]]];
    let pos = inicio;
    for (const [t0, t1, de, para] of roteiro) {
      if (t >= t0) { const k = suave((t - t0) / (t1 - t0)); pos = [de[0] + (para[0] - de[0]) * k, de[1] + (para[1] - de[1]) * k]; }
    }
    const fade = (a0, b0) => Math.min((t - a0) / 0.25, (b0 - t) / 0.25);
    this._legenda(tela, u, cam, '1 · Toque em Habilidades', [Math.min(P_aba[0], cam.vw - 140 * u), a[1]], fade(0.3, 1.6));
    if (r_tp) this._legenda(tela, u, cam, '2 · Escolha a tropa', [P_tp[0], r_tp[1] + r_tp[3]], fade(2.0, 3.2), true, 6);
    if (r_dano) this._legenda(tela, u, cam, '3 · Toque no + para melhorar', [P_dano[0] - 80 * u, r_dano[1] + r_dano[3]], fade(3.2, 4.5), true, 6);
    if (r_vida) this._legenda(tela, u, cam, 'Cada nível custa moedas', [P_vida[0] - 80 * u, r_vida[1] + r_vida[3]], fade(4.6, 5.9), true, 6);
    if (r_dano && t > 4.05 && t < 5.3 && this._comprou) {   // "+1 DANO GRÁTIS!" saltando do botão
      const k = (t - 4.05) / 1.25;
      tela.save();
      tela.globalAlpha *= Math.min(1, (1 - k) * 3);
      tela.font = fonte(22 * u); tela.textAlign = 'center'; tela.textBaseline = 'middle';
      tela.lineWidth = 6 * u; tela.strokeStyle = '#1f2937';
      const y = P_dano[1] - 30 * u - 40 * u * sobe(k * 1.6);
      tela.strokeText('+1 DANO · GRÁTIS!', P_dano[0] - 60 * u, y);
      tela.fillStyle = '#7ee08f'; tela.fillText('+1 DANO · GRÁTIS!', P_dano[0] - 60 * u, y);
      tela.restore();
    }
    const toques = [[1.05, P_aba, 1], [2.85, P_tp, 2], [4.05, P_dano, 3]];
    tela.save();
    tela.globalAlpha = Math.min(1, t / 0.3, (6.4 - t) / 0.4);
    this._toques_e_mao(tela, u, t, pos, toques, 6.4, true);
    tela.restore();
  }

  _fim_demo() {
    this.fase = 'final';
    this.estado = 'texto'; this.t = 0.0; this.td = 0.0;
    this.n = 0; this._n_som = 0; this._linhas = null;
    this.som.tocar('dica');
  }

  _alvo_camera(cam, u) {
    // escolhe onde a caixa fica (embaixo, em cima ou do lado) para não cobrir
    // o que a dica mostra, e leva a câmera para centralizar o assunto no espaço livre
    const fs = this._focos();
    if (!fs.length) { this.lado = 'baixo'; return [cam.x, cam.y]; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of fs) {
      if (f.tipo === 'e') { x0 = Math.min(x0, f.cx - f.rx); x1 = Math.max(x1, f.cx + f.rx); y0 = Math.min(y0, f.cy - f.ry); y1 = Math.max(y1, f.cy + f.ry); }
      else { x0 = Math.min(x0, f.x); x1 = Math.max(x1, f.x + f.w); y0 = Math.min(y0, f.y); y1 = Math.max(y1, f.y + f.h); }
    }
    const z = cam.zoom, W = cam.vw, H = cam.vh;
    const mx = Math.max(0.0, C.LX - W / 2 / z), my = Math.max(0.0, C.LY - H / 2 / z);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let melhor = null;
    const so_cima = ['batalhao', 'melhorias'].includes(this.passo_atual().id);   // as abas ficam embaixo
    for (const lado of (so_cima ? ['cima'] : ['baixo', 'cima', 'direita'])) {
      const cx_ = this._caixa_ret(cam, u, lado);   // [x, y, w, h] estimado
      // espaço livre (o que sobra da tela fora da caixa e da faixa do PULAR)
      let fx0 = 0, fy0 = 56 * u, fx1 = W, fy1 = H;
      if (lado === 'baixo') fy1 = cx_[1] - 10 * u;
      else if (lado === 'cima') { fy0 = cx_[1] + cx_[3] + 10 * u; }
      else fx1 = cx_[0] - 10 * u;
      const px = (fx0 + fx1) / 2, py = (fy0 + fy1) / 2;
      const tx = iso.limitar(cx - (px - W / 2) / z, -mx, mx);
      const ty = iso.limitar(cy - (py - H / 2) / z, -my, my);
      // onde o assunto fica na tela com essa câmera, e quanto a caixa cobre dele
      const sx0 = (x0 - tx) * z + W / 2, sx1 = (x1 - tx) * z + W / 2;
      const sy0 = (y0 - ty) * z + H / 2, sy1 = (y1 - ty) * z + H / 2;
      const ix = Math.max(0, Math.min(sx1, cx_[0] + cx_[2]) - Math.max(sx0, cx_[0]));
      const iy = Math.max(0, Math.min(sy1, cx_[1] + cx_[3]) - Math.max(sy0, cx_[1]));
      const fora = Math.max(0, -sx0) + Math.max(0, sx1 - W) + Math.max(0, -sy0) + Math.max(0, sy1 - H);
      const custo = ix * iy + fora * 40 + (lado === 'baixo' ? 0 : lado === 'cima' ? 1 : 2);
      if (!melhor || custo < melhor[0]) melhor = [custo, lado, tx, ty];
    }
    this.lado = melhor[1];
    return [melhor[2], melhor[3]];
  }

  // ---------- toques ---------------------------------------------------
  clique(pos) {
    // devolve sempre true: durante o tutorial o toque é só dele
    if (this.saindo) return true;
    const r = this.r_pular;
    if (r && pos[0] >= r[0] && pos[0] <= r[0] + r[2] && pos[1] >= r[1] && pos[1] <= r[1] + r[3]) {
      this.som.tocar('menu_voltar');
      this.fechar();
      return true;
    }
    if (this.estado === 'texto') {
      const total = this._total_letras();
      if (this.n < total) {           // ainda digitando: mostra tudo de uma vez
        this.n = total; this._n_som = total;
        this.som.tocar('clique');
      } else if (this.passo_atual().texto2 && this.fase === 'intro') {
        this.som.tocar('menu_clique');   // "olha só como é": começa a demonstração
        this.fase = 'demo'; this.estado = 'demo'; this.tdemo = 0.0; this.t = 0.0;
      } else {                        // próxima dica
        this.som.tocar('menu_clique');
        this.estado = 'saida'; this.t = 0.0;
      }
    }
    return true;
  }

  // ---------- texto ----------------------------------------------------
  _texto_bruto() {
    const p = this.passo_atual();
    return this.fase === 'final' && p.texto2 ? p.texto2 : p.texto;
  }
  _texto_plano() { return this._texto_bruto().replace(/\*/g, ''); }
  _total_letras() { return this._texto_plano().length; }

  _quebrar(ctx, fonte, largura) {
    // quebra em linhas guardando o destaque de cada palavra
    const pal = [];
    let real = false;
    for (const bruto of this._texto_bruto().split(' ')) {
      let txt = '', partes = [];
      for (const ch of bruto) {
        if (ch === '*') { if (txt) partes.push([txt, real]); txt = ''; real = !real; continue; }
        txt += ch;
      }
      if (txt) partes.push([txt, real]);
      pal.push(partes);
    }
    ctx.font = fonte;
    const linhas = [];
    let atual = [], larg = 0;
    const esp = ctx.measureText(' ').width;
    for (const partes of pal) {
      const w = partes.reduce((s, [t]) => s + ctx.measureText(t).width, 0);
      if (atual.length && larg + esp + w > largura) { linhas.push(atual); atual = []; larg = 0; }
      if (atual.length) larg += esp;
      atual.push(partes);
      larg += w;
    }
    if (atual.length) linhas.push(atual);
    return linhas;
  }

  _medidas(cam, u, lado = this.lado) {
    const bw = lado === 'direita' ? Math.min(cam.vw * 0.4, 440 * u) : Math.min(cam.vw - 24 * u, 660 * u);
    const pad = 18 * u;
    const corpo = Math.round(17 * u);
    return { bw, pad, corpo, lh: Math.round(corpo * 1.38), titulo: Math.round(14 * u) };
  }

  _altura_caixa(m, n_linhas, u) {
    return m.pad + 16 * u + n_linhas * m.lh + 30 * u + m.pad * 0.6;
  }

  _caixa_ret(cam, u, lado) {
    // retângulo da caixa (com o número de linhas estimado pela largura)
    const m = this._medidas(cam, u, lado);
    const chars_linha = Math.max(14, (m.bw - 2 * m.pad) / (m.corpo * 0.56));
    const n = Math.ceil(this._total_letras() / chars_linha) + (lado === 'direita' ? 1 : 0);
    return this._pos_caixa(cam, u, lado, m.bw, this._altura_caixa(m, n, u));
  }

  _pos_caixa(cam, u, lado, bw, bh) {
    if (lado === 'cima') return [cam.vw / 2 - bw / 2, 64 * u, bw, bh];
    if (lado === 'direita') return [cam.vw - bw - 14 * u, Math.max(64 * u, cam.vh / 2 - bh / 2), bw, bh];
    return [cam.vw / 2 - bw / 2, cam.vh - bh - 14 * u, bw, bh];
  }

  // ---------- desenho: paisagem escura e embaçada + holofote -----------
  fundo(tela, cam, u) {
    const k = sobe(this.vis);
    if (k <= 0.002) return;
    const W = tela.canvas.width, H = tela.canvas.height;
    if (!this._snap || this._snap.width !== W || this._snap.height !== H) {
      this._snap = document.createElement('canvas'); this._snap.width = W; this._snap.height = H;
      this._nit = document.createElement('canvas'); this._nit.width = W; this._nit.height = H;
      this._peq = document.createElement('canvas');
      this._peq.width = Math.ceil(W / 2); this._peq.height = Math.ceil(H / 2);
    }
    const sc = this._snap.getContext('2d');
    sc.drawImage(tela.canvas, 0, 0);
    // embaçado: a paisagem em meia resolução com desfoque (onde o navegador deixa)
    const pc = this._peq.getContext('2d');
    pc.filter = 'filter' in pc ? `blur(${(2.6 * k).toFixed(2)}px)` : 'none';
    pc.drawImage(this._snap, 0, 0, this._peq.width, this._peq.height);
    pc.filter = 'none';
    tela.save();
    tela.imageSmoothingEnabled = true;
    tela.globalAlpha = Math.min(1, k * 1.15);
    tela.drawImage(this._peq, 0, 0, W, H);
    tela.globalAlpha = 1;
    // escurece (nunca preto) com um tom frio
    tela.fillStyle = `rgba(16, 24, 38, ${(0.46 * k).toFixed(3)})`;
    tela.fillRect(0, 0, W, H);
    tela.restore();

    // holofote: o que a dica mostra volta nítido e claro, com borda macia
    const fs = this._formas(cam);
    if (!fs.length || this.estado === 'fim' && this.vis < 0.05) return;   // (sem buraco: tudo escuro)
    const nc = this._nit.getContext('2d');
    nc.globalCompositeOperation = 'source-over';
    nc.clearRect(0, 0, W, H);
    const pena = 26 * u;
    nc.save();
    nc.shadowColor = '#fff';
    nc.shadowBlur = pena;
    nc.fillStyle = '#fff';
    for (const f of fs) { this._caminho(nc, f, -pena * 0.35); nc.fill(); }
    nc.restore();
    nc.globalCompositeOperation = 'source-in';
    nc.drawImage(this._snap, 0, 0);
    nc.globalCompositeOperation = 'source-over';
    tela.save();
    tela.globalAlpha = Math.min(1, k * 1.3);
    tela.drawImage(this._nit, 0, 0);
    // contorno brilhante pulsando
    const pulso = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    tela.globalAlpha = k * (0.55 + 0.35 * pulso);
    tela.lineWidth = Math.max(2, 2.6 * u);
    tela.strokeStyle = 'rgba(255, 236, 170, 0.95)';
    tela.shadowColor = 'rgba(255, 214, 90, 0.9)';
    tela.shadowBlur = 14 * u;
    tela.setLineDash([10 * u, 7 * u]);
    tela.lineDashOffset = -performance.now() / 40;
    for (const f of fs) { this._caminho(tela, f, 4 * u); tela.stroke(); }
    tela.restore();
  }

  _formas(cam) {
    // os focos na tela (com a câmera de agora)
    const z = cam.zoom, ox = cam.vw / 2 - cam.x * z, oy = cam.vh / 2 - cam.y * z;
    return this._buracos_cena().map(f => f.tipo === 'e'
      ? { tipo: 'e', cx: f.cx * z + ox, cy: f.cy * z + oy, rx: f.rx * z, ry: f.ry * z }
      : { tipo: 'r', x: f.x * z + ox, y: f.y * z + oy, w: f.w * z, h: f.h * z });
  }

  _caminho(ctx, f, folga) {
    if (f.tipo === 'e') {
      ctx.beginPath();
      ctx.ellipse(f.cx, f.cy, Math.max(4, f.rx + folga), Math.max(3, f.ry + folga * 0.6), 0, 0, Math.PI * 2);
    } else {
      ret_arred(ctx, f.x - folga, f.y - folga, f.w + 2 * folga, f.h + 2 * folga, Math.max(6, 18 + folga));
    }
  }

  // ---------- desenho: caixa da dica, mãozinha e PULAR ------------------
  frente(tela, cam, u, camada = null) {
    const k = sobe(this.vis);
    if (k <= 0.002) return;
    const W = cam.vw, H = cam.vh;
    this._vw = W;
    // pedaços da interface que a dica mostra (a aba do Batalhão, as cartas)
    if (camada) this._ui_holofote(tela, u, camada, k);
    if (this.estado === 'demo') {
      const id = this.passo_atual().id;
      if (id === 'base2') this._demo_bases(tela, cam, u);
      else if (id === 'treino') this._demo_treino_real(tela, cam, u);
      else if (id === 'melhorias') this._demo_melhorias(tela, cam, u);
      else this._demo_batalhao(tela, cam, u);
    }
    // mãozinha (antes da caixa, para a caixa ficar por cima se encostar)
    if (this.estado !== 'fim' && this.estado !== 'camera') this._demo(tela, cam, u);

    // botão PULAR no canto (onde ficava o Menu)
    if (!this.saindo) {
      tela.save();
      tela.globalAlpha = k;
      tela.font = fonte(15 * u);
      const tw = tela.measureText('PULAR TUTORIAL').width;
      const r = [W - tw - 60 * u - 12 * u, 12 * u, tw + 60 * u, 38 * u];
      this.r_pular = r;
      ret_arred(tela, r[0], r[1] + 3 * u, r[2], r[3], r[3] / 2);
      tela.fillStyle = 'rgba(10,16,26,0.45)'; tela.fill();
      ret_arred(tela, r[0], r[1], r[2], r[3], r[3] / 2);
      tela.fillStyle = 'rgba(255,255,255,0.94)'; tela.fill();
      tela.lineWidth = 2 * u; tela.strokeStyle = '#1f2937'; tela.stroke();
      tela.fillStyle = '#1f2937'; tela.textBaseline = 'middle';
      tela.fillText('PULAR TUTORIAL', r[0] + 18 * u, r[1] + r[3] / 2 + 1 * u);
      // setinha >>
      const sx = r[0] + r[2] - 22 * u, sy = r[1] + r[3] / 2;
      tela.lineWidth = 2.4 * u; tela.lineCap = 'round'; tela.lineJoin = 'round';
      tela.beginPath();
      for (const d of [0, 6 * u]) { tela.moveTo(sx + d - 3 * u, sy - 5 * u); tela.lineTo(sx + d + 2 * u, sy); tela.lineTo(sx + d - 3 * u, sy + 5 * u); }
      tela.stroke();
      tela.restore();
    }

    const c = sobe(this.caixa);
    if (c <= 0.01) return;
    const m = this._medidas(cam, u);
    const fonte_corpo = fonte(m.corpo);
    if (!this._linhas || this._linhas_w !== m.bw) {
      this._linhas = this._quebrar(tela, fonte_corpo, m.bw - 2 * m.pad);
      this._linhas_w = m.bw;
    }
    const linhas = this._linhas;
    const topo_txt = m.pad + 16 * u;
    const bh = this._altura_caixa(m, linhas.length, u);
    let [bx, by] = this._pos_caixa(cam, u, this.lado, m.bw, bh);
    this._r_caixa = [bx, by, m.bw, bh];
    if (this.lado === 'direita') bx += (1 - c) * 30 * u;   // entra deslizando
    else by += (this.lado === 'cima' ? -1 : 1) * (1 - c) * 26 * u;
    tela.save();
    tela.globalAlpha = c;
    // sombra + caixa escura translúcida
    ret_arred(tela, bx, by + 6 * u, m.bw, bh, 18 * u);
    tela.fillStyle = 'rgba(5,10,18,0.35)'; tela.fill();
    ret_arred(tela, bx, by, m.bw, bh, 18 * u);
    tela.fillStyle = 'rgba(20,29,43,0.93)'; tela.fill();
    tela.lineWidth = 2.5 * u; tela.strokeStyle = 'rgba(255,255,255,0.16)'; tela.stroke();
    // faixa do título (pílula verde saindo do topo da caixa)
    tela.font = fonte(m.titulo);
    const p = this.passo_atual();
    const tw = tela.measureText(p.titulo).width + 30 * u;
    const th = 28 * u, tx = bx + m.pad, ty = by - th / 2;
    ret_arred(tela, tx, ty + 3 * u, tw, th, th / 2); tela.fillStyle = 'rgba(5,10,18,0.4)'; tela.fill();
    ret_arred(tela, tx, ty, tw, th, th / 2); tela.fillStyle = '#3c9a52'; tela.fill();
    tela.lineWidth = 2 * u; tela.strokeStyle = '#1f6b34'; tela.stroke();
    tela.fillStyle = '#fff'; tela.textBaseline = 'middle';
    tela.fillText(p.titulo, tx + 15 * u, ty + th / 2 + 1 * u);
    // texto digitado
    tela.font = fonte_corpo;
    tela.textBaseline = 'alphabetic';
    const esp = tela.measureText(' ').width;
    let resta = Math.floor(this.n), cursor = null;
    let y = by + topo_txt + m.corpo;
    for (let li = 0; li < linhas.length && resta > 0; li++) {
      let x = bx + m.pad;
      for (let wi = 0; wi < linhas[li].length && resta > 0; wi++) {
        if (wi > 0) { x += esp; resta--; if (resta <= 0) break; }
        for (const [t, real] of linhas[li][wi]) {
          if (resta <= 0) break;
          const parte = t.slice(0, resta);
          resta -= parte.length;
          tela.fillStyle = real ? AMARELO : '#eef2f7';
          tela.fillText(parte, x, y);
          x += tela.measureText(parte).width;
        }
      }
      cursor = [x, y];
      if (li < linhas.length - 1 && resta > 0) { resta--; }   // o espaço da quebra de linha
      y += m.lh;
    }
    const digitando = this.n < this._total_letras();
    if (cursor && digitando && Math.floor(performance.now() / 260) % 2 === 0) {   // cursor piscando
      tela.fillStyle = AMARELO;
      tela.fillRect(cursor[0] + 2 * u, cursor[1] - m.corpo * 0.8, 2.5 * u, m.corpo * 0.95);
    }
    // rodapé: bolinhas do progresso e "toque para continuar"
    const ry = by + bh - m.pad * 0.6 - 10 * u;
    for (let j = 0; j < this.passos.length; j++) {
      tela.beginPath();
      tela.arc(bx + m.pad + 6 * u + j * 18 * u, ry, (j === this.i ? 5.5 : 4) * u, 0, Math.PI * 2);
      tela.fillStyle = j === this.i ? AMARELO : (j < this.i ? 'rgba(255,212,90,0.55)' : 'rgba(255,255,255,0.25)');
      tela.fill();
    }
    if (!digitando) {
      const a = 0.55 + 0.45 * Math.sin(performance.now() / 230);
      tela.globalAlpha = c * a;
      tela.font = fonte(13 * u);
      tela.textBaseline = 'middle';
      const ver = !!this.passo_atual().texto2 && this.fase === 'intro';
      const txt = ver ? 'TOQUE PARA VER  ›' : (this.i < this.passos.length - 1 ? 'TOQUE PARA CONTINUAR  ›' : 'TOQUE PARA JOGAR  ›');
      const lw = tela.measureText(txt).width;
      tela.fillStyle = '#ffffff';
      tela.fillText(txt, bx + m.bw - m.pad - lw, ry);
    }
    tela.restore();
  }

  _ui_holofote(tela, u, camada, k) {
    // a interface aparece nítida só dentro dos retângulos da dica
    const fs = this._buracos_ui();
    if (!fs.length) return;
    const W = tela.canvas.width, H = tela.canvas.height;
    if (!this._ui_buf || this._ui_buf.width !== W || this._ui_buf.height !== H) {
      this._ui_buf = document.createElement('canvas'); this._ui_buf.width = W; this._ui_buf.height = H;
    }
    const bc = this._ui_buf.getContext('2d');
    bc.globalCompositeOperation = 'source-over';
    bc.clearRect(0, 0, W, H);
    bc.save();
    bc.shadowColor = '#fff'; bc.shadowBlur = 18 * u; bc.fillStyle = '#fff';
    for (const f of fs) { ret_arred(bc, f.x - 8 * u, f.y - 8 * u, f.w + 16 * u, f.h + 16 * u, 16 * u); bc.fill(); }
    bc.restore();
    bc.globalCompositeOperation = 'source-in';
    bc.drawImage(camada, 0, 0);
    bc.globalCompositeOperation = 'source-over';
    tela.save();
    tela.globalAlpha = k;
    tela.drawImage(this._ui_buf, 0, 0);
    const pulso = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    tela.globalAlpha = k * (0.55 + 0.35 * pulso);
    tela.lineWidth = Math.max(2, 2.6 * u);
    tela.strokeStyle = 'rgba(255, 236, 170, 0.95)';
    tela.shadowColor = 'rgba(255, 214, 90, 0.9)'; tela.shadowBlur = 14 * u;
    tela.setLineDash([10 * u, 7 * u]); tela.lineDashOffset = -performance.now() / 40;
    for (const f of fs) { ret_arred(tela, f.x - 10 * u, f.y - 10 * u, f.w + 20 * u, f.h + 20 * u, 16 * u); tela.stroke(); }
    tela.restore();
  }

  _legenda(tela, u, cam, txt, p, al, embaixo = false, folga = 34) {
    if (al <= 0) return;
    tela.save();
    tela.globalAlpha *= Math.min(1, al);
    tela.font = fonte(15 * u);
    const w = tela.measureText(txt).width + 28 * u, h = 32 * u;
    const x = Math.max(8 * u, Math.min(cam.vw - w - 8 * u, p[0] - w / 2));
    const y = Math.min(cam.vh - h - 4 * u, Math.max(54 * u, embaixo ? p[1] + folga * u : p[1] - h - folga * u));
    ret_arred(tela, x, y + 3 * u, w, h, h / 2); tela.fillStyle = 'rgba(5,10,18,0.45)'; tela.fill();
    ret_arred(tela, x, y, w, h, h / 2); tela.fillStyle = AMARELO; tela.fill();
    tela.lineWidth = 2 * u; tela.strokeStyle = '#1f2937'; tela.stroke();
    tela.fillStyle = '#1f2937'; tela.textBaseline = 'middle';
    tela.fillText(txt, x + 14 * u, y + h / 2 + 1 * u);
    tela.restore();
  }

  _demo_bases(tela, cam, u) {
    const ui = this.ui, bs = this._bases_extras();
    if (!ui || !bs.length) return;
    const t = this.tdemo;
    const z = cam.zoom, ox = cam.vw / 2 - cam.x * z, oy = cam.vh / 2 - cam.y * z;
    const na_tela = (b) => [iso.sx(b.x, b.y) * z + ox, iso.sy(b.x, b.y, 1.2) * z + oy];
    const b2 = bs[0], b3 = bs[1] || bs[0];
    const segunda = t > 4.0;
    const b = segunda ? b3 : b2, o = segunda ? 5.1 : 0.0;
    const ks = segunda ? C.ORDEM_CARTAS.slice(3, 6) : C.ORDEM_CARTAS.slice(0, 3);
    const alvo = (nome) => { const a = (ui._alvos_base || []).find(([k]) => k === nome); return a ? a[1] : null; };
    const centro = (r, dy = 0.45) => r ? [r[0] + r[2] / 2, r[1] + r[3] * dy] : [cam.vw / 2, cam.vh / 2];
    const P_base = na_tela(b);
    const aberta = ui.base_aberta === b;
    const P = ks.map(k => centro(aberta ? alvo('deck_sel:' + k) : null));
    const r_ok = aberta ? (alvo('deck_ok') || null) : null;
    const P_ok = r_ok ? centro(r_ok, 0.5) : [cam.vw / 2, cam.vh * 0.7];
    const inicio = [P_base[0] + 110 * u, P_base[1] + 80 * u];
    const tl = t - o;
    const roteiro = [[0.0, 0.9, inicio, P_base], [1.3, 1.8, P_base, P[0]], [2.0, 2.4, P[0], P[1]], [2.6, 3.0, P[1], P[2]],
      [3.15, 3.5, P[2], [P_ok[0] + 70 * u, P_ok[1] + 40 * u]]];
    let pos = inicio;
    for (const [t0, t1, de, para] of roteiro) {
      if (tl >= t0) { const k = suave((tl - t0) / (t1 - t0)); pos = [de[0] + (para[0] - de[0]) * k, de[1] + (para[1] - de[1]) * k]; }
    }
    const fade = (a, b) => Math.min((tl - a) / 0.25, (b - tl) / 0.25);
    this._legenda(tela, u, cam, `Toque na base ${segunda ? 3 : 2}`, P_base, fade(0.2, 1.2));
    if (aberta) {
      const r_jan = ui.r_janela_base;
      const baixo = r_jan ? [r_jan[0] + r_jan[2] / 2, r_jan[1] + r_jan[3]] : [cam.vw / 2, cam.vh * 0.8];   // logo abaixo da janela
      this._legenda(tela, u, cam, segunda ? 'Sem repetir as cartas da base 2' : 'Escolha 3 cartas para o deck', baixo, fade(1.2, 3.2), true, 8);
      if (r_ok) {
        this._legenda(tela, u, cam, 'Confirma uma vez só', baixo, fade(3.1, 3.9), true, 8);
        if (tl > 3.1 && tl < 3.9) {
          const pul = 0.5 + 0.5 * Math.sin(performance.now() / 120);
          tela.save();
          tela.lineWidth = 3 * u; tela.strokeStyle = `rgba(255,212,90,${0.6 + 0.4 * pul})`;
          tela.shadowColor = 'rgba(255,214,90,0.9)'; tela.shadowBlur = 10 * u;
          ret_arred(tela, r_ok[0] - 4 * u, r_ok[1] - 4 * u, r_ok[2] + 8 * u, r_ok[3] + 8 * u, 12 * u); tela.stroke();
          tela.restore();
        }
      }
    }
    if (tl < 0 || tl > 4.0) return;   // (a câmera está viajando)
    const toques = [[0.95, P_base, 1], [1.85, P[0], 2], [2.45, P[1], 3], [3.05, P[2], 4]];
    tela.save();
    tela.globalAlpha = Math.min(1, tl / 0.3, (4.0 - tl) / 0.3);
    this._toques_e_mao(tela, u, tl, pos, toques, 4.0, true);
    tela.restore();
  }

  _demo_batalhao(tela, cam, u) {
    // a mão que abre o Batalhão, escolhe a carta e posiciona a tropa
    const ui = this.ui;
    if (!ui) return;
    const t = this.tdemo;
    const z = cam.zoom, ox = cam.vw / 2 - cam.x * z, oy = cam.vh / 2 - cam.y * z;
    const a = ui.aba_cartas;
    const P_aba = [a[0] + a[2] / 2, a[1] + a[3] / 2];
    const rc = (ui.cartas.find(([k]) => k === 'pelotao') || ui.cartas[0] || [null, [cam.vw / 2, cam.vh / 2, 0, 0]])[1];
    const P_carta = [rc[0] + rc[2] / 2, rc[1] + rc[3] * 0.55];
    const [dx, dy] = this._ponto_drop();
    const P_campo = [iso.sx(dx, dy) * z + ox, iso.sy(dx, dy) * z + oy];
    const inicio = [cam.vw * 0.55, cam.vh + 40 * u];
    const saida = [P_campo[0] + 110 * u, P_campo[1] + 90 * u];
    const roteiro = [[0.0, 1.0, inicio, P_aba], [2.0, 2.9, P_aba, P_carta], [3.4, 4.4, P_carta, P_campo], [4.8, 5.6, P_campo, saida]];
    let pos = inicio;
    for (const [t0, t1, de, para] of roteiro) {
      if (t >= t0) { const k = suave((t - t0) / (t1 - t0)); pos = [de[0] + (para[0] - de[0]) * k, de[1] + (para[1] - de[1]) * k]; }
    }
    // legendas (o que a mão vai fazer)
    const legenda = (txt, p, de, ate, embaixo = false) => {
      if (t < de || t > ate) return;
      const al = Math.min(1, (t - de) / 0.25, (ate - t) / 0.25);
      tela.save();
      tela.globalAlpha *= al;
      tela.font = fonte(15 * u);
      const w = tela.measureText(txt).width + 28 * u, h = 32 * u;
      let x = Math.max(8 * u, Math.min(cam.vw - w - 8 * u, p[0] - w / 2));
      const y = embaixo ? p[1] + 34 * u : p[1] - h - 34 * u;
      ret_arred(tela, x, y + 3 * u, w, h, h / 2); tela.fillStyle = 'rgba(5,10,18,0.45)'; tela.fill();
      ret_arred(tela, x, y, w, h, h / 2); tela.fillStyle = AMARELO; tela.fill();
      tela.lineWidth = 2 * u; tela.strokeStyle = '#1f2937'; tela.stroke();
      tela.fillStyle = '#1f2937'; tela.textBaseline = 'middle';
      tela.fillText(txt, x + 14 * u, y + h / 2 + 1 * u);
      tela.restore();
    };
    legenda('1 · Toque no Batalhão', [Math.max(P_aba[0], 120 * u), a[1]], 0.3, 1.6);
    legenda('2 · Escolha a carta', [P_carta[0], rc[1]], 2.0, 3.3);
    legenda('3 · Toque no campo', P_campo, 3.5, 4.9);
    // "GRÁTIS!" saltando da carta escolhida
    if (t > 2.95 && t < 4.4) {
      const k = (t - 2.95) / 1.45;
      tela.save();
      tela.globalAlpha *= Math.min(1, (1 - k) * 3);
      tela.font = fonte(26 * u); tela.textAlign = 'center'; tela.textBaseline = 'middle';
      tela.lineWidth = 6 * u; tela.strokeStyle = '#1f2937';
      const y = P_carta[1] - 60 * u * sobe(k * 1.6);
      tela.strokeText('GRÁTIS!', P_carta[0], y);
      tela.fillStyle = '#7ee08f'; tela.fillText('GRÁTIS!', P_carta[0], y);
      tela.restore();
    }
    // ponto de queda marcado enquanto a carta está na mão
    if (t > 2.95 && t < 4.6) {
      const pul = 0.5 + 0.5 * Math.sin(performance.now() / 140);
      tela.save();
      tela.lineWidth = 3 * u; tela.strokeStyle = `rgba(126,224,143,${0.6 + 0.4 * pul})`;
      tela.setLineDash([8 * u, 6 * u]); tela.lineDashOffset = -performance.now() / 30;
      tela.beginPath(); tela.ellipse(P_campo[0], P_campo[1], 46 * u * z, 23 * u * z, 0, 0, Math.PI * 2); tela.stroke();
      tela.restore();
    }
    const toques = [[1.05, P_aba, 1], [2.95, P_carta, 2], [4.45, P_campo, 3]];
    tela.save();
    tela.globalAlpha = Math.min(1, t / 0.3);
    this._toques_e_mao(tela, u, t, pos, toques, 6.3, true);
    tela.restore();
  }

  // ---------- mãozinha mostrando os toques ------------------------------
  _demo(tela, cam, u) {
    const id = this.passo_atual().id;
    if (id !== 'qg') return;   // (o treino agora mostra a janela de verdade, na demonstração)
    const z = cam.zoom, ox = cam.vw / 2 - cam.x * z, oy = cam.vh / 2 - cam.y * z;
    this._zoom = z;
    const na_tela = (x, y, h = 0) => [iso.sx(x, y) * z + ox, iso.sy(x, y, h) * z + oy];
    const alfa = this.estado === 'saida' ? sobe(this.caixa) : Math.min(1, this.td / 0.4);
    if (alfa <= 0.01) return;
    tela.save();
    tela.globalAlpha = alfa;
    if (id === 'treino') this._demo_treino(tela, u, na_tela);
    else this._demo_base(tela, u, na_tela);
    tela.restore();
  }

  _demo_treino(tela, u, na_tela) {
    // 1 toca na tropa -> 2 toca no campo de treino -> 3 ENVIAR PARA O TREINO -> vira 2V
    const sq = this._tropa_demo();
    const a = M.area_de('verde', 1);
    if (!a) return;
    const P_area = na_tela(a.x, a.y);
    const P_tropa = sq ? na_tela(sq.x, sq.y, 0.6) : [P_area[0] - 160 * u, P_area[1] - 120 * u];
    const P_botao = this._dentro_livre(tela, u, [P_area[0], P_area[1] - 54 * u], 'ENVIAR PARA O TREINO');
    const ciclo = 6.0;
    const t = (this.td % ciclo);
    const inicio = [P_tropa[0] + 90 * u, P_tropa[1] + 80 * u];
    const roteiro = [
      // [t0, t1, de, para]
      [0.0, 0.9, inicio, P_tropa],
      [1.3, 2.3, P_tropa, P_area],
      [2.9, 3.6, P_area, P_botao],
      [3.95, 4.7, P_botao, [P_botao[0] + 90 * u, P_botao[1] + 60 * u]],   // sai da frente
    ];
    let pos = inicio;
    for (const [t0, t1, de, para] of roteiro) {
      if (t >= t0) { const k = suave((t - t0) / (t1 - t0)); pos = [de[0] + (para[0] - de[0]) * k, de[1] + (para[1] - de[1]) * k]; }
    }
    const toques = [[0.95, P_tropa, 1], [2.35, P_area, 2], [3.65, P_botao, 3]];
    // tropa selecionada (anel verde) depois do 1º toque
    if (sq && t > 1.0) {
      const p = na_tela(sq.x, sq.y);
      const rr = (sq.raio() + 0.6) * iso.HW * 1.42;
      tela.save();
      tela.lineWidth = 3 * u; tela.strokeStyle = 'rgba(80,230,120,0.95)';
      tela.setLineDash([8 * u, 5 * u]); tela.lineDashOffset = -performance.now() / 30;
      tela.beginPath(); tela.ellipse(p[0], p[1], rr * this._zoom, rr * this._zoom / 2, 0, 0, Math.PI * 2); tela.stroke();
      tela.restore();
    }
    // botão ENVIAR PARA O TREINO depois do 2º toque
    if (t > 2.4 && t < 5.4) {
      const pop = sobe((t - 2.4) / 0.25);
      const brilho = t > 3.65 && t < 3.95;
      this._pilula(tela, u, P_botao[0], P_botao[1], 'ENVIAR PARA O TREINO', pop, brilho);
    }
    // depois do 3º toque: a tropa "vira 2V"
    if (t > 3.8 && t < 5.6 && sq) {
      const k = (t - 3.8) / 1.8;
      const p = na_tela(sq.x, sq.y, 2.2);
      tela.save();
      tela.globalAlpha *= Math.min(1, (1 - k) * 2.5);
      tela.font = fonte(22 * u);
      tela.textAlign = 'center'; tela.textBaseline = 'middle';
      tela.lineWidth = 5 * u; tela.strokeStyle = '#1f2937';
      const y = p[1] - 30 * u * sobe(k * 2);
      tela.strokeText('★ 2V', p[0], y);
      tela.fillStyle = AMARELO; tela.fillText('★ 2V', p[0], y);
      tela.restore();
    }
    this._toques_e_mao(tela, u, t, pos, toques, ciclo);
  }

  _demo_base(tela, u, na_tela) {
    // 1 toca na base 1 -> 2 MELHORAR -> sobe de nível
    const b = this.tropas.bases.verde;
    const P_base = na_tela(b.x, b.y, 1.2);
    const P_botao = this._dentro_livre(tela, u, [P_base[0], P_base[1] - 78 * u], 'MELHORAR');
    const ciclo = 4.6;
    const t = this.td % ciclo;
    const inicio = [P_base[0] + 110 * u, P_base[1] + 70 * u];
    const roteiro = [[0.0, 0.9, inicio, P_base], [1.4, 2.1, P_base, P_botao], [2.45, 3.2, P_botao, inicio]];
    let pos = inicio;
    for (const [t0, t1, de, para] of roteiro) {
      if (t >= t0) { const k = suave((t - t0) / (t1 - t0)); pos = [de[0] + (para[0] - de[0]) * k, de[1] + (para[1] - de[1]) * k]; }
    }
    const toques = [[0.95, P_base, 1], [2.15, P_botao, 2]];
    if (t > 1.0 && t < 2.75) {   // o botão aparece, leva o toque e some
      const pop = t < 2.45 ? sobe((t - 1.0) / 0.25) : 1 - sobe((t - 2.45) / 0.3);
      this._pilula(tela, u, P_botao[0], P_botao[1], 'MELHORAR', pop, t > 2.15 && t < 2.45);
    }
    if (t > 2.5 && t < 4.4) {    // e a base sobe de nível
      const k = (t - 2.5) / 1.9;
      tela.save();
      tela.globalAlpha *= Math.min(1, (1 - k) * 2.5);
      tela.font = fonte(20 * u);
      tela.textAlign = 'center'; tela.textBaseline = 'middle';
      tela.lineWidth = 5 * u; tela.strokeStyle = '#1f2937';
      const y = P_base[1] - 30 * u - 40 * u * sobe(k * 1.5);
      tela.strokeText('▲ TROPAS NOVAS', P_base[0], y);
      tela.fillStyle = AMARELO; tela.fillText('▲ TROPAS NOVAS', P_base[0], y);
      tela.restore();
    }
    this._toques_e_mao(tela, u, t, pos, toques, ciclo);
  }

  _toques_e_mao(tela, u, t, pos, toques, ciclo, some = false) {
    // ondinhas dos toques + número de cada passo + a mão
    let aperto = 0;
    for (let ti = 0; ti < toques.length; ti++) {
      const [tt, p, num] = toques[ti];
      const d = t - tt;
      // some=true: o número some quando vem o toque seguinte (a tela mudou)
      const ate = some && ti + 1 < toques.length ? toques[ti + 1][0] - tt : ciclo - tt - 0.3;
      if (d > -0.12 && d < 0.18) aperto = Math.max(aperto, 1 - Math.abs(d - 0.03) / 0.15);
      if (d > 0 && d < 0.7) {
        const k = d / 0.7;
        tela.save();
        tela.globalAlpha *= 1 - k;
        tela.lineWidth = 3.5 * u * (1 - k) + 1;
        tela.strokeStyle = '#ffffff';
        tela.beginPath(); tela.arc(p[0], p[1], (8 + 34 * sobe(k)) * u, 0, Math.PI * 2); tela.stroke();
        tela.restore();
      }
      if (d > 0 && d < ate) {   // número do passo
        tela.save();
        const r = 11 * u;
        const nx = p[0] - 26 * u, ny = p[1] - 22 * u;
        tela.globalAlpha *= Math.min(1, d / 0.2);
        tela.beginPath(); tela.arc(nx, ny + 2 * u, r, 0, Math.PI * 2); tela.fillStyle = 'rgba(10,16,26,0.45)'; tela.fill();
        tela.beginPath(); tela.arc(nx, ny, r, 0, Math.PI * 2); tela.fillStyle = AMARELO; tela.fill();
        tela.lineWidth = 2 * u; tela.strokeStyle = '#1f2937'; tela.stroke();
        tela.fillStyle = '#1f2937'; tela.font = fonte(14 * u);
        tela.textAlign = 'center'; tela.textBaseline = 'middle';
        tela.fillText(String(num), nx, ny + 1 * u);
        tela.restore();
      }
    }
    const fim = Math.min(1, Math.max(0, (ciclo - t) / 0.4));   // some no fim do ciclo
    tela.save();
    tela.globalAlpha *= fim;
    mao(tela, pos[0], pos[1], u * (1 - 0.1 * aperto), aperto);
    tela.restore();
  }

  _dentro_livre(tela, u, p, txt) {
    // o botão de mentira não pode ficar escondido atrás da caixa nem fora da tela
    tela.save(); tela.font = fonte(14 * u);
    const w = tela.measureText(txt).width + 36 * u;
    tela.restore();
    let x1 = this._vw - 8 * u;
    const r = this._r_caixa;
    if (r && this.lado === 'direita') x1 = r[0] - 8 * u;
    const x = Math.max(8 * u + w / 2, Math.min(x1 - w / 2, p[0]));
    return [x, p[1]];
  }

  _pilula(tela, u, cx, cy, txt, pop, brilho) {
    tela.save();
    tela.font = fonte(14 * u);
    const w = tela.measureText(txt).width + 36 * u, h = 34 * u;
    const s = 0.6 + 0.4 * pop;
    tela.translate(cx, cy); tela.scale(s, s);
    tela.globalAlpha *= Math.min(1, pop * 1.5);
    ret_arred(tela, -w / 2, -h / 2 + 4 * u, w, h, 10 * u); tela.fillStyle = 'rgba(10,16,26,0.45)'; tela.fill();
    ret_arred(tela, -w / 2, -h / 2, w, h, 10 * u); tela.fillStyle = brilho ? '#5fd17a' : '#2f7d45'; tela.fill();
    tela.lineWidth = 2.5 * u; tela.strokeStyle = '#1f2937'; tela.stroke();
    tela.fillStyle = '#fff'; tela.textAlign = 'center'; tela.textBaseline = 'middle';
    tela.fillText(txt, 0, 1 * u);
    tela.restore();
  }
}

export function mao(ctx, x, y, s, aperto = 0) {
  // mãozinha apontando: a ponta do dedo fica em (x, y)
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.38);
  ctx.scale(s, s);
  const contorno = '#1f2937', pele = '#ffffff', sombra = 'rgba(10,16,26,0.35)';
  const desenhar = (cor, linha) => {
    ctx.fillStyle = cor;
    // dedo indicador
    ret_arred(ctx, -7, -2, 14, 36, 7); ctx.fill(); if (linha) ctx.stroke();
    // dedos dobrados
    for (const [dx, dy] of [[11, 30], [19, 33], [26, 38]]) {
      ctx.beginPath(); ctx.arc(dx, dy, 7.5, 0, Math.PI * 2); ctx.fill(); if (linha) ctx.stroke();
    }
    // palma
    ret_arred(ctx, -9, 24, 38, 36, 13); ctx.fill(); if (linha) ctx.stroke();
    // polegar
    ctx.save(); ctx.translate(-8, 40); ctx.rotate(-0.7);
    ret_arred(ctx, -6, -14, 12, 26, 6); ctx.fill(); if (linha) ctx.stroke();
    ctx.restore();
    // punho (manga)
    ret_arred(ctx, -5, 56, 32, 14, 4); ctx.fillStyle = linha ? '#3c9a52' : cor; ctx.fill(); if (linha) ctx.stroke();
  };
  ctx.lineWidth = 2.6; ctx.strokeStyle = contorno; ctx.lineJoin = 'round';
  ctx.save(); ctx.translate(4, 5 - aperto * 2); desenhar(sombra, false); ctx.restore();
  desenhar(pele, true);
  // unha / brilho
  ctx.fillStyle = 'rgba(31,41,55,0.12)';
  ret_arred(ctx, -4, 1, 8, 9, 4); ctx.fill();
  ctx.restore();
}
