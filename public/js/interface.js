// interface.js — tudo que fica "colado" na tela: moedas, botões (Menu, Som,
// Mapa, Pausar, zoom), aviso da ONDA inimiga, MINIMAPA (toque nele para
// levar a câmera até lá), CARTAS de pelotão, loja de melhorias, dica e a tela
// de fim.
//
// Cartas no estilo dos jogos de cartas de batalha, com MOEDAS no lugar de
// elixir: cada carta mostra o custo numa moeda no canto. Com moedas
// suficientes ela acende ("JOGAR"); tocar nela a levanta (carta na mão) e o
// próximo toque no SEU território posiciona a tropa.
//
//     desenhar(tela)  -> pinta a interface
//     clique(pos)     -> devolve a ação do botão tocado (ou null se o toque
//                        não foi na interface e deve ir para o jogo)
// (clone de jogo/interface.py)
import * as C from './config.js';
import * as helicoptero from './helicoptero.js';
import * as tanque from './tanque.js';
import * as soldado from './soldado.js';
import * as canhao from './canhao.js';
import * as iso from './iso.js';
import * as M from './mapa.js';
import * as pg from './pg.js';
import { sprite } from './raster.js';
import { posicionar_gavetas } from './layout_gavetas.js';
import * as torre from './torre.js';
import * as barricada from './barricada.js';
import * as icones from './icones.js';
import { Avisos } from './avisos.js';

const OURO_DECK = [244, 192, 58], OURO_DECK_ESC = [176, 124, 20];   // escolha do deck
const CINZA = [107, 116, 133];
const FUNDO_APAGADO = [223, 227, 234];
const VERDE_ESCURO = [31, 138, 69];
const int = Math.trunc;
// tela de HABILIDADES (estilo "subir atributos" de RPG sombrio): preto, ouro e azul
const ER = {
  fundo: [10, 10, 12, 226], painel: [18, 17, 15, 238], ouro: [201, 170, 110], ouro_esc: [122, 102, 66],
  ouro_sel: [201, 170, 110, 46], texto: [232, 226, 208], apagado: [146, 139, 122], azul: [128, 178, 236],
  linha: [201, 170, 110, 110], bloq: [92, 88, 80],
};
const NOMES_HAB = { dano: 'Dano', vida: 'Vida', vel: 'Velocidade', cad: 'Recarga' };

export function dentro(r, pos) {
  return r[0] <= pos[0] && pos[0] < r[0] + r[2] && r[1] <= pos[1] && pos[1] < r[1] + r[3];
}

// get_bounding_rect() do pygame: a imagem de um sprite é o desenho + 1 px de folga em volta
function limites_de(img) {
  const w = img.width - 2, h = img.height - 2;
  return { w, h, centerx: 1 + Math.floor(w / 2), centery: 1 + Math.floor(h / 2) };
}

const _NOME_CURTO = { balas: 'Balas', polvora: 'Pólvora', bombas: 'Bombas', bolas: 'Bolas', foguetes: 'Foguetes', pecas: 'Peças' };   // (nomes cabem no quadro)

export class Interface {
  constructor(tropas) {
    this.tropas = tropas;
    this.avisos = new Avisos(this);   // notificações na lateral + guia "?" até a tropa
    this.som_ligado = true;
    this.depurar = false;
    this.pausado = false;
    this._fontes = new Map();
    this.botoes = [];     // [id, retângulo, texto]
    this.loja = [];       // [melhoria, retângulo]
    this.cartas = [];     // [tipo de pelotão, retângulo]
    this._bonecos = {};
    this.carta_sel = null;   // carta na mão, esperando o toque no território
    this._carta_anim_inicio = null;
    this._carta_anim_tipo = null;
    this._carta_anim_origem = null;
    this._carta_recolhida_rect = null;
    this._camada_carta = null;
    this.gaveta = null;
    this.anim_gaveta = 0.0;
    this.qg_aberto = false;   // (antigo) ainda aceito: abre a janela da base principal
    this.base_aberta = null;  // base cuja janela está aberta (níveis/produção/carta)
    this.area_aberta = -1;    // campo de treino com a janela "i" aberta
    this.mb_aberta = false;   // fase 3: janela das melhorias da base (moedas)
    this.ref_aberta = false;  // fase 4: janela da refinaria e do estoque (fase 5: LOGÍSTICA, com abas)
    this.log_aba = 'cam';     // fase 5: 'ref' (refinaria) ou 'cam' (caminhões e estoque)
    this.cam_passo = null;    // fase 5: caminhão escolhido no mapa: 'de' (falta a base de carga) ou 'para'
    this._alvos_ref = [];
    this._alvos_mb = [];
    this.treino_sel = null;   // tropa escolhida para treinar
    this.treino_qtd = 0;      // quantos soldados vão
    this._alvos_treino = [];
    this._cand = [];
    this._alvos_base = [];
    this.hab_tipo = 'pelotao';   // tropa escolhida na tela de habilidades
    this.hab_m = 'dano';         // atributo destacado
    this._alvos_hab = [];
    this._mini_fundo = null;
    this.r_fim = null;
    this.organizar(600, 900);
  }

  fonte(tam, negrito = true) {
    const k = tam * 2 + (negrito ? 1 : 0);
    let f = this._fontes.get(k);
    if (f === undefined) {
      f = new pg.Fonte(Math.max(8, int(tam * this.u)), negrito);
      this._fontes.set(k, f);
    }
    return f;
  }

  _bateria_nivel(tela, r, nivel, maximo) {
    const u = this.u;
    const largura = Math.max(4, int((r[2] - 16 * u) / Math.max(1, maximo)));
    const y = int(r[1] - 19 * u);
    for (let i = 0; i < maximo; i++) {
      const caixa = [int(r[0] + 8 * u + i * largura), y, Math.max(2, largura - int(3 * u)), int(11 * u)];
      pg.ret(tela, i < nivel ? VERDE_ESCURO : FUNDO_APAGADO, caixa, 0, Math.max(1, int(2 * u)));
      pg.ret(tela, C.ESCURO, caixa, Math.max(1, int(u)), Math.max(1, int(2 * u)));
    }
  }

  organizar(vw, vh) {
    // calcula a posição de tudo para este tamanho de tela
    this.vw = vw; this.vh = vh;
    const u = this.u = Math.max(1.0, Math.min(vw, vh) / 540);   // escala da interface
    this._fontes = new Map();
    const m = int(8 * u), alt = int(36 * u);
    this.r_titulo = [0, 0, 0, 0];  // sem faixa/titulo no jogo

    // botões do topo, da direita para a esquerda
    // (o zoom agora é fixo: sem botões + e -)
    const itens = [['menu', 'Menu']];   // som, mapa e pausa ficam só nas Configurações
    const fb = this.fonte(20);
    const larguras = itens.map(([i, txt]) => Math.max(alt, fb.size(i === 'pausa' ? 'Continuar' : txt)[0] + int(20 * u)));
    const l_moedas = int(84 * u);
    const total = larguras.reduce((a, b) => a + b, 0) + l_moedas + m * (itens.length + 1);
    const y = total + m <= vw ? m : m + alt + int(6 * u);
    let x = vw - m;
    this.botoes = [];
    itens.forEach(([ident, txt], k) => {
      const w = larguras[k];
      x -= w;
      this.botoes.push([ident, [x, y, w, alt], txt]);
      x -= int(6 * u);
    });
    this.r_moedas = [x - l_moedas, y, l_moedas, alt];
    this.r_parafusos = [x - 2 * l_moedas - int(6 * u), y, l_moedas, alt];   // parafusos: mesma caixinha, do lado

    // abaixo dos botões: minimapa (direita)
    const y2 = y + alt + int(6 * u);
    this.y_status = y2;
    const mw = int(100 * u);
    const mh = int(mw * C.LY / C.LX);
    this.r_mini = [vw - m - mw, y2, mw, mh];
    this._mini_estradas = M.ESTRADAS.map(e => {
      const pts = [];
      for (let i = 0; i < e.pts.length; i += 3) pts.push(this._mini(iso.sx(e.pts[i][0], e.pts[i][1]), iso.sy(e.pts[i][0], e.pts[i][1])));
      return pts;
    });
    const frente = [];
    for (let uu = -C.CENA_U; uu < C.CENA_U + 1; uu += 4) frente.push(iso.de_uv(uu, M.F(uu)));
    this._mini_frente = frente.map(([px, py]) => this._mini(iso.sx(px, py), iso.sy(px, py)));

    // Gavetas centralizadas, com checagem geométrica independente.
    this.aba_cartas = [m, vh - int(95 * u), int(104 * u), int(38 * u)];
    this.aba_loja = [vw - m - int(104 * u), vh - int(95 * u), int(104 * u), int(38 * u)];
    this.aba_mb = [this.aba_loja[0] - int(112 * u), this.aba_loja[1], int(104 * u), int(38 * u)];   // fase 3: melhorias da base
    this.aba_ref = [this.aba_mb[0] - int(112 * u), this.aba_loja[1], int(104 * u), int(38 * u)];   // fase 4: refinaria
    [this.cartas, this.loja, this.r_base] = posicionar_gavetas(
      vw, vh, u, C.ORDEM_CARTAS, [], [this.aba_cartas, this.aba_loja]);
    // SEÇÃO DE CONSTRUÇÃO, logo abaixo das 6 cartas: três caixas iguais
    // (Base, Torre, Barricada). A compra da base saiu da faixa de cima.
    {
      let fundo = 0, topo = Infinity, x0 = Infinity, x1 = -Infinity;
      for (const [, r] of this.cartas) { fundo = Math.max(fundo, r[1] + r[3]); topo = Math.min(topo, r[1]); x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[0] + r[2]); }
      // sem a faixa da base em cima, as cartas sobem um pouco
      const sobe0 = Math.max(0, Math.min(int(40 * u), topo - int(56 * u)));
      for (const c of this.cartas) c[1] = [c[1][0], c[1][1] - sobe0, c[1][2], c[1][3]];
      fundo -= sobe0; topo -= sobe0;
      const vao = int(12 * u), gap = int(8 * u);
      const limite = Math.min(this.aba_cartas[1] - int(40 * u), this.aba_loja[1] - int(8 * u));   // acima do contador de soldados
      let h = int(84 * u);
      let sobra = fundo + vao + h - limite;
      const folga = Math.max(0, topo - int(48 * u));
      const esq = x0 - int(22 * u), dir = vw - x1 - int(22 * u);
      this.obras_coluna = false;
      const tipos = ['base', 'torre', 'barricada'];
      this.r_obras = {};
      if (sobra > folga + int(22 * u) && Math.max(esq, dir) >= int(118 * u)) {
        // tela baixa (celular deitado): as três empilhadas ao lado das cartas
        const esquerda = esq >= int(118 * u);   // a direita tem o minimapa: só se não couber
        const tw = Math.min(int(170 * u), esquerda ? esq : dir);
        const tx = esquerda ? x0 - int(14 * u) - tw : x1 + int(14 * u);
        const total = Math.min(limite, Math.max(fundo, topo + int(3 * 60 * u))) - topo;
        const th = Math.floor((total - 2 * gap) / 3);
        tipos.forEach((k, i) => { this.r_obras[k] = [tx, topo + i * (th + gap), tw, th]; });
        this.obras_coluna = true;
      } else {
        if (sobra > 0) {   // sobe as cartas o que der; o resto, a caixa encolhe
          const sobe = Math.min(sobra, folga);
          for (const c of this.cartas) c[1] = [c[1][0], c[1][1] - sobe, c[1][2], c[1][3]];
          fundo -= sobe; topo -= sobe; sobra -= sobe;
          if (sobra > 0) h = Math.max(int(58 * u), h - sobra);
        }
        const tw = Math.floor((x1 - x0 - 2 * gap) / 3);
        tipos.forEach((k, i) => { this.r_obras[k] = [x0 + i * (tw + gap), fundo + vao, tw, h]; });
      }
      this.r_base = this.r_obras.base;
      this.r_torre = this.r_obras.torre;
      this.r_barricada = this.r_obras.barricada;
      this.torre_vertical = false;
      this._topo_cartas = topo;
    }
    this.y_dica = Math.max(int(95 * u), this._topo_cartas - int(42 * u));
    this._torre_icone = sprite(torre.formas_icone('verde'), 0.62 * u);
    this._barr_icone = sprite(barricada.formas('verde', -Math.PI / 4), 0.95 * u);
    this._barr_icone_cinza = null;
    this.r_qg = [Math.floor(vw / 2) - int(115 * u), Math.floor(vh / 2) - int(52 * u), int(230 * u), int(104 * u)];
    // bonecos das cartas: o mesmo desenho do campo, ampliado
    const cores = C.TIMES.verde.soldado;
    this._bonecos = {};
    for (const tipo of C.ORDEM_CARTAS) {
      if (tipo !== 'tanque') this._bonecos[tipo] = sprite(soldado.formas(0, cores, { tipo }), 2.3 * u);
    }
    this._tanque_carta = sprite(tanque.formas_completo('verde', 0, 1), 0.62 * u);
    this._peca = sprite(canhao.formas(0, 'verde'), 0.95 * u);
    this._heli_carta = sprite(helicoptero.formas(0, 'verde'), 0.80 * u);
    // os mesmos ícones em vermelho (avisos de invasão mostram a tropa inimiga)
    this._bonecos_inimigo = {};
    for (const tipo of C.ORDEM_CARTAS) {
      if (tipo !== 'tanque') this._bonecos_inimigo[tipo] = sprite(soldado.formas(0, C.TIMES.vermelho.soldado, { tipo }), 2.3 * u);
    }
    this._tanque_inimigo = sprite(tanque.formas_completo('vermelho', 0, 1), 0.62 * u);
    this._heli_inimigo = sprite(helicoptero.formas(0, 'vermelho'), 0.80 * u);

    // caixa de fim de jogo
    const bw = int(300 * u), bh = int(190 * u);
    this.r_caixa = [Math.floor((vw - bw) / 2), Math.floor((vh - bh) / 2), bw, bh];
    this.r_fim = [this.r_caixa[0] + int(50 * u), this.r_caixa[1] + bh - int(66 * u), bw - int(100 * u), int(46 * u)];
    this._mini_fundo = null;   // o fundo do minimapa é refeito no próximo quadro
    this._alt_base = {};
  }

  // ---------- minimapa ------------------------------------------------
  _mini(cx, cy) {
    // px de cena -> ponto dentro do minimapa
    const [x, y, w, h] = this.r_mini;
    return [int(x + (cx + C.LX) / (2 * C.LX) * w), int(y + (cy + C.LY) / (2 * C.LY) * h)];
  }

  mini_para_cena(pos) {
    // ponto tocado no minimapa -> px de cena (para centralizar a câmera)
    const [x, y, w, h] = this.r_mini;
    return [(pos[0] - x) / w * 2 * C.LX - C.LX, (pos[1] - y) / h * 2 * C.LY - C.LY];
  }

  _minimapa(tela, cam) {
    const u = this.u, T = this.tropas;
    const [x, y, w, h] = this.r_mini;
    // fundo fixo (território, estradas, linha de frente): desenhado uma vez numa
    // imagem e só copiado a cada quadro (refeito quando organizar() roda)
    if (!this._mini_fundo) {
      const c = pg.superficie(w + 6, h + 6);
      c.translate(3 - x, 3 - y);
      pg.ret(c, C.ESCURO, [x - 3, y - 3, w + 6, h + 6]);
      // território: vermelho em cima da linha de frente, verde embaixo
      const fr = this._mini_frente;
      pg.ret(c, [245, 222, 217], [x, y, w, h]);
      const preso = fr.map(([px, py]) => [Math.max(x, Math.min(x + w, px)), py]);
      pg.poligono(c, [217, 238, 224], [[x, y + h]].concat(preso).concat([[x + w, y + h]]));
      for (const pts of this._mini_estradas) pg.linhas(c, C.ESTRADA, false, pts, Math.max(1, int(2 * u)));
      pg.linhas(c, C.ESCURO, false, preso, Math.max(1, int(u)));
      this._mini_fundo = c.canvas;
    }
    tela.drawImage(this._mini_fundo, x - 3, y - 3);
    // bases (quadrados) e tropas (bolinhas; especiais um pouco maiores)
    for (const b of T.todas_bases()) {
      const [bx, by] = this._mini(iso.sx(b.x, b.y), iso.sy(b.x, b.y));
      const t = int((b.principal ? 5 : 3.5) * u);
      pg.ret(tela, C.ESCURO, [bx - t - 1, by - t - 1, 2 * t + 2, 2 * t + 2]);
      pg.ret(tela, b.vida > 0 ? C.TIMES[b.time].base : CINZA, [bx - t + 1, by - t + 1, 2 * t - 2, 2 * t - 2]);
    }
    // torres de defesa: triângulos laranja com a borda do time
    const torres = T.torres || [];
    for (let i = 0; i < torres.length; i++) {
      const o = torres[i];
      const [tx, ty] = this._mini(iso.sx(o.x, o.y), iso.sy(o.x, o.y));
      const t = 4.2 * u;
      pg.poligono(tela, C.TIMES[o.time].esq, [[tx, ty - t - 1.5], [tx + t + 1.5, ty + t * 0.8 + 1], [tx - t - 1.5, ty + t * 0.8 + 1]]);
      pg.poligono(tela, [236, 128, 40], [[tx, ty - t + 1], [tx + t - 1, ty + t * 0.8 - 0.5], [tx - t + 1, ty + t * 0.8 - 0.5]]);
    }
    for (let i = 0; i < T.esquadroes.length; i++) {
      const sq = T.esquadroes[i];
      if (sq.sold.length) {
        // = this._mini(...), sem criar lista (roda para cada tropa em todo quadro)
        const px = int(x + (iso.sx(sq.x, sq.y) + C.LX) / (2 * C.LX) * w), py = int(y + (iso.sy(sq.x, sq.y) + C.LY) / (2 * C.LY) * h);
        const r = int((sq.tipo === 'pelotao' ? 3.2 : 2.4) * u);
        pg.circulo(tela, C.ESCURO, px, py, r + 1);
        pg.circulo(tela, C.TIMES[sq.time].base, px, py, r);
      }
    }
    if (T.horda) {   // modo zumbi: cada zumbi é um pontinho (um desenho só para todos)
      const zs = T.horda.vivos, k = Math.max(2, int(2 * u));
      tela.fillStyle = 'rgb(126,142,104)';
      for (let i = 0; i < zs.length; i++) {
        const z = zs[i];
        tela.fillRect(int(x + (iso.sx(z.x, z.y) + C.LX) / (2 * C.LX) * w) - 1, int(y + (iso.sy(z.x, z.y) + C.LY) / (2 * C.LY) * h) - 1, k, k);
      }
    }
    // o que a câmera está vendo
    let [ax, ay] = this._mini(...cam.cena(0, 0));
    let [bx, by] = this._mini(...cam.cena(cam.vw, cam.vh));
    ax = Math.max(x, ax); ay = Math.max(y, ay); bx = Math.min(x + w, bx); by = Math.min(y + h, by);
    if (bx - ax > 2 && by - ay > 2) {
      pg.ret(tela, C.BRANCO, [ax, ay, bx - ax, by - ay], Math.max(2, int(2 * u)));
      pg.ret(tela, C.ESCURO, [ax - 1, ay - 1, bx - ax + 2, by - ay + 2], 1);
    }
  }

  // ---------- desenho -------------------------------------------------
  _pilula(tela, r, fundo, borda = null, raio = 8) {
    const rr = int(raio * this.u);
    pg.ret(tela, fundo, r, 0, rr);
    if (borda) pg.ret(tela, borda, r, Math.max(2, int(2 * this.u)), rr);
  }

  _texto(tela, txt, fonte, cor, centro) {
    const img = fonte.render(txt, cor);
    pg.blit(tela, img, int(centro[0] - img.width / 2), int(centro[1] - img.height / 2));
    return img;
  }

  _moeda(tela, cx, cy, r) {
    pg.circulo(tela, C.MOEDA_ESCURA, int(cx), int(cy), int(r));
    pg.circulo(tela, C.MOEDA, int(cx), int(cy), Math.max(1, int(r * 0.68)));
  }

  desenhar(tela, cam) {
    const u = this.u, T = this.tropas;
    this._minimapa(tela, cam);

    let txt, f, r;

    // moedas
    r = this.r_moedas;
    this._pilula(tela, r, C.ESCURO);
    this._moeda(tela, r[0] + 18 * u, r[1] + r[3] / 2, 9 * u);
    this._texto(tela, String(int(T.moedas)), this.fonte(22), C.MOEDA_TEXTO, [r[0] + r[2] / 2 + 10 * u, r[1] + r[3] / 2]);

    // parafusos (o recurso das bases): pisca verde quando entra, vermelho quando falta
    if (T.parafusos) {
      r = this.r_parafusos;
      const pf = T.parafusos.verde | 0;
      if (this._pf_ant !== undefined && pf > this._pf_ant) this._pf_pulso = 1;
      this._pf_ant = pf;
      this._pf_pulso = Math.max(0, (this._pf_pulso || 0) - 0.04);
      const falta = T.todas_bases().some(b => b.time === 'verde' && b.vida > 0 && b.falta_pf > 0);
      this._pilula(tela, r, C.ESCURO);
      if (this._pf_pulso > 0 || falta) {
        const a = falta ? 0.35 + 0.25 * Math.sin(performance.now() / 160) : this._pf_pulso * 0.6;
        this._pilula(tela, r, falta ? [220, 60, 50, int(255 * a)] : [60, 200, 100, int(255 * a)]);
      }
      icones.parafuso(tela, r[0] + 18 * u, r[1] + r[3] / 2, 11 * u * (1 + 0.15 * this._pf_pulso));
      const cheio = pf >= C.PARAFUSOS_TETO;   // armazém cheio: número dourado (o campo para de render)
      this._texto(tela, String(pf), this.fonte(22), cheio ? C.MOEDA_TEXTO : [214, 222, 232], [r[0] + r[2] / 2 + 10 * u, r[1] + r[3] / 2]);
    }

    // VIRADA: com menos soldados que o inimigo, cada abate rende mais
    const vr = T.fator_virada_vista ? T.fator_virada_vista('verde') : (T.fator_virada ? T.fator_virada('verde') : 1);
    if (vr >= 1.05 && !T.fim) {
      const txt = `VIRADA · abate +${Math.round((vr - 1) * 100)}%`;
      const fv = this.fonte(12);
      const w = fv.size(txt)[0] + int(20 * u), h = int(20 * u);
      const xr = this.r_mini ? Math.min(this.r_moedas[0] + this.r_moedas[2], this.r_mini[0] - int(6 * u)) : this.r_moedas[0] + this.r_moedas[2];
      const rv = [xr - w, this.r_moedas[1] + this.r_moedas[3] + int(5 * u), w, h];
      const pul = 0.5 + 0.5 * Math.sin(performance.now() / 300);
      this._pilula(tela, rv, [236, 158, 30, int(200 + 55 * pul)], C.ESCURO);
      this._texto(tela, txt, fv, C.BRANCO, [rv[0] + w / 2, rv[1] + h / 2]);
    }

    // botões do topo
    const ativos = { som: this.som_ligado, mapa: this.depurar, pausa: this.pausado };
    for (const [ident, rb, t0] of this.botoes) {
      const ativo = ativos[ident] || false;
      const rotulo = (ident === 'pausa' && this.pausado) ? 'Continuar' : t0;
      this._pilula(tela, rb, ativo ? C.ESCURO : C.BRANCO, C.ESCURO);
      this._texto(tela, rotulo, this.fonte(20), ativo ? C.BRANCO : C.ESCURO, [rb[0] + rb[2] / 2, rb[1] + rb[3] / 2]);
    }

    // notificações (abaixo do minimapa) e o guia "?" na borda da tela
    if (!T.fim) this.avisos.desenhar(tela, cam);

    // dica (some depois da primeira ordem)
    if ((this.carta_sel || this.gps_base || T.cam_sel || !T.deu_ordem) && !T.fim && !this.base_aberta && !this.mb_aberta && !this.ref_aberta && this.gaveta !== 'hab' && this.area_aberta < 0) {
      txt = 'Cartas custam parafusos e chegam em 1 min. Toque na tropa verde, depois no destino';
      if (this.gps_base) txt = 'GPS: toque no mapa onde as tropas desta base vão ficar';
      if (T.cam_sel) txt = this.cam_passo === 'para' ? 'Caminhão: agora toque na base de DESCARGA (toque fora para sair)' : 'Caminhão: toque na base de CARGA (toque fora para sair)';
      if (this.carta_sel === 'base') txt = 'Toque no seu território, fora da estrada e longe de outra base';
      else if (this.carta_sel === 'torre') txt = 'Toque no seu território, fora da estrada, para erguer a torre';
      else if (this.carta_sel === 'barricada') txt = 'Arraste a barricada (pode na estrada) e confirme no V';
      else if (this.carta_sel && !this.gps_base) txt = 'Toque no seu território (verde): a tropa chega ali em 1 min';
      f = this.fonte(18);
      let w = f.size(txt)[0] + int(24 * u);
      if (w > this.vw - 8) {
        txt = T.cam_sel ? (this.cam_passo === 'para' ? 'Toque na base de DESCARGA' : 'Toque na base de CARGA') : this.gps_base ? 'GPS: toque no ponto de reunião' : (this.carta_sel ? 'Toque no lado verde (chega em 1 min)' : 'Toque na tropa verde, depois no destino');
        w = f.size(txt)[0] + int(24 * u);
      }
      r = [Math.floor((this.vw - w) / 2), this.y_dica, w, int(30 * u)];
      this._pilula(tela, r, C.ESCURO);
      this._texto(tela, txt, f, C.BRANCO, [r[0] + r[2] / 2, r[1] + r[3] / 2]);
    }

    // Gavetas: utilizam as próprias cartas, botões e paleta originais.
    this.anim_gaveta += ((this.gaveta ? 1.0 : 0.0) - this.anim_gaveta) * 0.20;
    this._pilula(tela, this.aba_cartas, C.BRANCO, C.ESCURO);
    this._texto(tela, 'Batalhão', this.fonte(17), C.ESCURO, [this.aba_cartas[0] + this.aba_cartas[2] / 2, this.aba_cartas[1] + this.aba_cartas[3] / 2]);
    this._pilula(tela, this.aba_loja, C.BRANCO, C.ESCURO);
    this._texto(tela, 'Habilidades', this.fonte(17), C.ESCURO, [this.aba_loja[0] + this.aba_loja[2] / 2, this.aba_loja[1] + this.aba_loja[3] / 2]);
    if (this.aba_mb && !this.gaveta && T.melh_base) {   // fase 3: melhorias da base (moedas)
      this._pilula(tela, this.aba_mb, this.mb_aberta ? C.MOEDA : C.BRANCO, C.ESCURO);
      this._texto(tela, 'Melhorias', this.fonte(17), C.ESCURO, [this.aba_mb[0] + this.aba_mb[2] / 2, this.aba_mb[1] + this.aba_mb[3] / 2]);
    }
    if (this.aba_ref && !this.gaveta && T.refinaria && !T.horda) {   // fase 4: refinaria (fase 5: logística)
      this._pilula(tela, this.aba_ref, this.ref_aberta ? C.MOEDA : C.BRANCO, C.ESCURO);
      this._texto(tela, 'Logística', this.fonte(17), C.ESCURO, [this.aba_ref[0] + this.aba_ref[2] / 2, this.aba_ref[1] + this.aba_ref[3] / 2]);
      if (T.refinaria.verde.length) pg.circulo(tela, C.TIMES.verde.base, this.aba_ref[0] + this.aba_ref[2] - int(6 * u), this.aba_ref[1] + int(6 * u), int(6 * u));
    }
    if (this.gaveta === 'cartas' && !this.carta_sel) {
      const progresso = Math.min(1.0, this.anim_gaveta * 1.5);
      this.cartas.forEach(([tipo, rc], i) => {
        // Entrada em cascata, preservando o desenho original das cartas.
        const fase = Math.max(0.0, Math.min(1.0, progresso * 1.45 - i * 0.12));
        if (fase > 0.02) this._carta(tela, tipo, rc);
      });
      ['base', 'torre', 'barricada'].forEach((k, i) => {   // e a seção de construção, por último
        if (progresso * 1.45 - 0.72 - i * 0.08 > 0.02) this._caixa_obra(tela, k, this.r_obras[k]);
      });
    }
    // indicador do limite de tropas
    this._pilula(tela, [int(8 * u), this.aba_cartas[1] - int(32 * u), int(155 * u), int(27 * u)], C.BRANCO, C.ESCURO);
    this._texto(tela, `Soldados ${T.contar_soldados ? T.contar_soldados('verde') : T._soldados('verde')}/${T.limite_soldados()}`, this.fonte(16), C.ESCURO, [int(85 * u), this.aba_cartas[1] - int(18 * u)]);

    // janela da base tocada (níveis do QG, produção e a carta que ela solta)
    if (this.qg_aberto && !this.base_aberta) this.base_aberta = T.bases.verde;
    this.qg_aberto = false;
    if (this.base_aberta && !T.fim) this._janela_base(tela);
    else this._alvos_base = [];
    // janela "i" do campo de treino
    if (this.area_aberta >= 0 && !T.fim) this._janela_treino(tela);
    else this._alvos_treino = [];

    // tela de habilidades por tropa
    if (this.mb_aberta && !T.fim && !this.base_aberta && this.area_aberta < 0) this._janela_mb(tela);
    else this._alvos_mb = [];
    if (this.ref_aberta && !T.fim && !this.base_aberta && this.area_aberta < 0 && !this.mb_aberta) this._janela_ref(tela);
    else this._alvos_ref = [];
    if (this.gaveta === 'hab' && !T.fim) this._tela_habilidades(tela);
    else this._alvos_hab = [];

    // PvP: modo, relógio dos 15 min e placar (no topo, no meio)
    if (T.pvp && T.t_resta !== null && !T.fim) this._relogio_pvp(tela);
    // fim de jogo
    if (T.fim && T.pvp) { this._fim_pvp(tela); }
    else if (T.fim) {
      tela.fillStyle = pg.css([31, 41, 55, 140]);
      tela.fillRect(0, 0, this.vw, this.vh);
      r = this.r_caixa;
      const vitoria = T.fim === 'vitoria';
      this._pilula(tela, r, C.BRANCO, C.ESCURO, 12);
      this._texto(tela, vitoria ? 'Vitória!' : 'Derrota', this.fonte(44),
        vitoria ? VERDE_ESCURO : C.TIMES.vermelho.emblema, [r[0] + r[2] / 2, r[1] + 44 * u]);
      const txt_fim = T.horda ? (vitoria ? `A nave caiu de vez. ${T.horda.abatidos} zumbis abatidos.` : `A horda tomou sua base. ${T.horda.abatidos} zumbis abatidos.`)
        : (vitoria ? 'O QG inimigo foi destruído.' : 'Sua base foi destruída.');
      this._texto(tela, txt_fim,
        this.fonte(19, false), C.ESCURO, [r[0] + r[2] / 2, r[1] + 88 * u]);
      const b = this.r_fim;
      this._pilula(tela, b, C.ESCURO);
      this._texto(tela, 'Jogar de novo', this.fonte(22), C.BRANCO, [b[0] + b[2] / 2, b[1] + b[3] / 2]);
    }

    if (this.carta_sel && !T.fim) this._desenhar_carta_recolhida(tela);
  }

  // ---------- janela "i" do CAMPO DE TREINO ------------------------------
  abrir_treino(n, preferida = null) {
    // toque num campo de treino seu: abre (ou fecha) a janela dele
    if (this.area_aberta === n) { this.area_aberta = -1; return; }
    this.area_aberta = n;
    this.base_aberta = null;
    this.gaveta = null;
    this.treino_sel = preferida && this.tropas.pode_treinar(preferida) ? preferida : null;
    this.treino_qtd = this.treino_sel ? this.treino_sel.sold.length : 0;
  }

  _candidatas_treino(a) {
    // suas tropas a pé que podem ir treinar, das mais perto para as mais longe
    const T = this.tropas, lista = [];
    for (const sq of T.esquadroes) if (sq.time === 'verde' && T.pode_treinar(sq)) lista.push(sq);
    lista.sort((p, q) => ((p.x - a.x) ** 2 + (p.y - a.y) ** 2) - ((q.x - a.x) ** 2 + (q.y - a.y) ** 2));
    return lista.slice(0, 6);
  }

  _selo_nivel(tela, x, cy, L, e) {
    // o mesmo selo "3V" que aparece em cima das tropas
    const u = e, w = int(30 * u), h = int(20 * u);
    pg.ret(tela, C.ESCURO, [int(x - 1), int(cy - h / 2 - 1), w + 2, h + 2], 0, int(6 * u));
    pg.ret(tela, [244, 192, 58], [int(x), int(cy - h / 2), w, h], 0, int(5 * u));
    const f = this.fonte(14);
    const t = String(L);
    pg.blit(tela, f.render(t, C.ESCURO), int(x + 4 * u), int(cy - f.altura / 2));
    const vx = x + 5 * u + f.size(t)[0];
    pg.linhas(tela, C.ESCURO, false, [[vx, cy - 4 * u], [vx + 4.5 * u, cy + 4 * u], [vx + 9 * u, cy - 4 * u]], Math.max(2, int(2.6 * u)));
  }

  _relogio_pvp(tela) {
    // pílula no topo: MODO · 14:32 · placar (QG % no vale tudo, bases de pé no sobrevivente)
    const u = this.u, T = this.tropas;
    const s = Math.max(0, T.t_resta), mm = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
    const pouco = s <= 60;
    const p = T.placar || [3, 3, 100, 100];
    const placar = T.modo === 'sobrevivente' ? `Bases ${p[0]} x ${p[1]}` : `QG ${p[2]}% x ${p[3]}%`;
    const f1 = this.fonte(13), f2 = this.fonte(20), f3 = this.fonte(13, false);
    const t1 = C.NOME_MODO[T.modo] || '', t2 = `${mm}:${ss}`;
    const w = Math.max(f1.size(t1)[0], f3.size(placar)[0]) + f2.size(t2)[0] + int(42 * u), h = int(38 * u);
    const r = [Math.floor((this.vw - w) / 2), int(8 * u), w, h];
    this._pilula(tela, r, pouco && Math.floor(performance.now() / 400) % 2 ? C.TIMES.vermelho.base : C.ESCURO, null, 12);
    pg.blit(tela, f1.render(t1, [201, 207, 219]), r[0] + int(14 * u), r[1] + int(3 * u));
    pg.blit(tela, f3.render(placar, C.BRANCO), r[0] + int(14 * u), r[1] + int(19 * u));
    const im = f2.render(t2, C.BRANCO);
    pg.blit(tela, im, r[0] + r[2] - im.width - int(14 * u), Math.trunc(r[1] + r[3] / 2 - im.height / 2));
  }

  _fim_pvp(tela) {
    // fim do PvP: resultado, troféus ganhos/perdidos, total e o like no oponente
    const u = this.u, T = this.tropas, res = T.resultado;
    tela.fillStyle = pg.css([31, 41, 55, 150]);
    tela.fillRect(0, 0, this.vw, this.vh);
    const bw = Math.min(this.vw - int(16 * u), int(340 * u)), bh = int(282 * u);
    // um pouco abaixo do meio: o aviso do topo ("fulano saiu") não cobre o título
    const r = [Math.floor((this.vw - bw) / 2), Math.max(int(6 * u), Math.min(this.vh - bh - int(6 * u), Math.floor((this.vh - bh) / 2) + int(40 * u))), bw, bh];
    const cx = r[0] + r[2] / 2;
    this._pilula(tela, r, C.BRANCO, C.ESCURO, 12);
    const tit = T.fim === 'vitoria' ? 'Vitória!' : T.fim === 'empate' ? 'Empate' : 'Derrota';
    const cor = T.fim === 'vitoria' ? VERDE_ESCURO : T.fim === 'empate' ? C.ESCURO : C.TIMES.vermelho.emblema;
    this._texto(tela, tit, this.fonte(40), cor, [cx, r[1] + 36 * u]);
    let motivo;
    const como = res ? res.como : null;
    if (como === 'saiu') motivo = T.fim === 'vitoria' ? 'O oponente saiu da batalha.' : 'Você saiu da batalha.';
    else if (T.fim === 'empate') motivo = 'O tempo acabou empatado.';
    else if (como === 'tempo') motivo = T.modo === 'sobrevivente' ? 'Tempo! Contaram as bases de pé.' : 'Tempo! Ganhou o QG mais inteiro.';
    else motivo = T.fim === 'vitoria' ? 'O QG inimigo foi destruído.' : 'Seu QG foi destruído.';
    this._texto(tela, motivo, this.fonte(16, false), C.ESCURO, [cx, r[1] + 72 * u]);
    this._texto(tela, C.NOME_MODO[T.modo] || '', this.fonte(13), CINZA, [cx, r[1] + 94 * u]);
    // troféus
    const rt = [r[0] + int(20 * u), r[1] + int(108 * u), bw - int(40 * u), int(58 * u)];
    pg.ret(tela, [236, 242, 252], rt, 0, int(10 * u));
    if (!res) this._texto(tela, 'Contando troféus…', this.fonte(16, false), CINZA, [cx, rt[1] + rt[3] / 2]);
    else {
      const d = res.delta, txt = d > 0 ? `+${d} troféus` : d < 0 ? `${d} troféus` : 'Troféus iguais';
      this._trofeu(tela, rt[0] + int(30 * u), rt[1] + rt[3] / 2, int(15 * u));
      this._texto(tela, txt, this.fonte(22), d > 0 ? VERDE_ESCURO : d < 0 ? C.TIMES.vermelho.emblema : C.ESCURO, [cx + int(10 * u), rt[1] + int(20 * u)]);
      this._texto(tela, `Você tem ${res.trofeus} troféus · ${res.likes} likes`, this.fonte(13, false), CINZA, [cx + int(10 * u), rt[1] + int(42 * u)]);
    }
    // curtir o oponente
    const nome = String(T.oponente || 'oponente').slice(0, 14);
    const rc = [r[0] + int(20 * u), r[1] + int(176 * u), bw - int(40 * u), int(40 * u)];
    this._pilula(tela, rc, T.curtiu ? FUNDO_APAGADO : [255, 228, 232], T.curtiu ? CINZA : [214, 58, 90], 10);
    this._coracao(tela, rc[0] + int(24 * u), rc[1] + rc[3] / 2, int(10 * u), !T.curtiu);
    this._texto(tela, T.curtiu ? `Você curtiu ${nome} ✓` : `CURTIR ${nome.toUpperCase()}`, this.fonte(16), T.curtiu ? CINZA : [176, 32, 62], [cx + int(10 * u), rc[1] + rc[3] / 2]);
    this.r_curtir = T.curtiu ? null : rc;
    const b = [r[0] + int(50 * u), r[1] + bh - int(56 * u), bw - int(100 * u), int(42 * u)];
    this._pilula(tela, b, C.ESCURO);
    this._texto(tela, 'Jogar de novo', this.fonte(20), C.BRANCO, [b[0] + b[2] / 2, b[1] + b[3] / 2]);
    this.r_fim_pvp = b;
  }

  _trofeu(tela, cx, cy, r) {
    // taça dourada simples
    tela.save(); tela.translate(cx, cy); tela.lineJoin = 'round';
    tela.strokeStyle = '#1f2937'; tela.lineWidth = Math.max(2, r * 0.16);
    tela.fillStyle = '#f5c242';
    tela.beginPath(); tela.arc(-r * 0.62, -r * 0.35, r * 0.32, Math.PI * 0.5, Math.PI * 1.5); tela.stroke();
    tela.beginPath(); tela.arc(r * 0.62, -r * 0.35, r * 0.32, -Math.PI * 0.5, Math.PI * 0.5); tela.stroke();
    tela.beginPath(); tela.moveTo(-r * 0.62, -r * 0.8); tela.lineTo(r * 0.62, -r * 0.8); tela.quadraticCurveTo(r * 0.6, r * 0.25, 0, r * 0.3); tela.quadraticCurveTo(-r * 0.6, r * 0.25, -r * 0.62, -r * 0.8); tela.closePath(); tela.fill(); tela.stroke();
    tela.fillRect(-r * 0.12, r * 0.3, r * 0.24, r * 0.35); tela.strokeRect(-r * 0.12, r * 0.3, r * 0.24, r * 0.35);
    tela.beginPath(); tela.rect(-r * 0.45, r * 0.62, r * 0.9, r * 0.24); tela.fill(); tela.stroke();
    tela.fillStyle = 'rgba(255,255,255,0.6)'; tela.beginPath(); tela.ellipse(-r * 0.25, -r * 0.45, r * 0.1, r * 0.25, 0, 0, Math.PI * 2); tela.fill();
    tela.restore();
  }

  _coracao(tela, cx, cy, r, cheio) {
    tela.save(); tela.translate(cx, cy);
    tela.beginPath(); tela.moveTo(0, r * 0.9);
    tela.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.7, -r * 1.2, 0, -r * 0.45);
    tela.bezierCurveTo(r * 0.7, -r * 1.2, r * 1.4, -r * 0.1, 0, r * 0.9); tela.closePath();
    tela.fillStyle = cheio ? '#e0335a' : '#c7ccd6'; tela.fill();
    tela.strokeStyle = '#1f2937'; tela.lineWidth = Math.max(1.5, r * 0.18); tela.stroke();
    tela.restore();
  }

  _icone_item(tela, item, cx, cy, r) {
    // fase 4: caixinha colorida com a letra do item
    // azulejo claro na cor do material + o desenho dele (icones.item)
    const cor = C.COR_ITEM[item], claro = cor.map(v => Math.trunc(v + (255 - v) * 0.72));
    pg.ret(tela, cor, [Math.trunc(cx - r - 1.5), Math.trunc(cy - r - 1.5), Math.trunc(2 * r + 3), Math.trunc(2 * r + 3)], 0, Math.trunc(r * 0.5));
    pg.ret(tela, claro, [Math.trunc(cx - r), Math.trunc(cy - r), Math.trunc(2 * r), Math.trunc(2 * r)], 0, Math.trunc(r * 0.45));
    icones.item(tela, item, cx, cy, r * 0.8);
  }

  _janela_ref(tela) {
    // fase 4: REFINARIA (parafusos -> caixas de munição no QG) e ESTOQUE das bases
    const u = this.u, T = this.tropas, alvos = this._alvos_ref = [];
    const W = Math.min(this.vw - int(16 * u), int(420 * u));
    const H = this._alt_ref || int(380 * u);
    let y = Math.max(int(44 * u), Math.floor((this.vh - H) / 2) - int(20 * u));
    if (y + H > this.vh - int(4 * u)) y = Math.max(int(4 * u), this.vh - H - int(4 * u));   // tela baixa: sobe por cima da barra de cima
    const x = Math.floor((this.vw - W) / 2);
    const pad = int(12 * u);
    this.r_janela_ref = [x, y, W, H];
    pg.ret(tela, [31, 41, 55, 70], [x + int(4 * u), y + int(6 * u), W, H], 0, int(14 * u));
    pg.ret(tela, C.BRANCO, [x, y, W, H], 0, int(14 * u));
    pg.ret(tela, C.ESCURO, [x, y, W, H], Math.max(2, int(3 * u)), int(14 * u));
    const cab = int(46 * u);
    pg.ret(tela, C.ESCURO, [x, y, W, cab], 0, int(14 * u));
    pg.ret(tela, C.ESCURO, [x, y + Math.floor(cab / 2), W, cab - Math.floor(cab / 2)]);
    pg.ret(tela, [120, 124, 134], [x, y + cab - int(4 * u), W, int(4 * u)]);
    pg.blit(tela, this.fonte(19).render('LOGÍSTICA', C.BRANCO), x + pad, y + int(6 * u));
    pg.blit(tela, this.fonte(12, false).render(this.log_aba === 'ref' ? 'Parafusos viram munição · sai no QG · toque para pedir' : 'Caminhões levam o estoque de uma base para outra', [201, 207, 219]), x + pad, y + int(27 * u));
    const rx = [x + W - int(38 * u), y + int(9 * u), int(28 * u), int(28 * u)];
    this._pilula(tela, rx, [55, 65, 81], null, 14);
    this._texto(tela, '×', this.fonte(22), C.BRANCO, [rx[0] + rx[2] / 2, rx[1] + rx[3] / 2 - u]);
    alvos.push(['ref_fechar', rx]);
    let cy = y + cab + int(8 * u);
    // ---- abas (fase 5)
    {
      const tw = Math.floor((W - 2 * pad - int(8 * u)) / 2), th = int(30 * u);
      [['cam', 'CAMINHÕES E ESTOQUE'], ['ref', 'REFINARIA']].forEach(([k, nome], i) => {
        const r = [x + pad + i * (tw + int(8 * u)), cy, tw, th], on = this.log_aba === k;
        this._pilula(tela, r, on ? C.ESCURO : [236, 242, 252], C.ESCURO, 9);
        this._texto(tela, nome, this.fonte(13), on ? C.BRANCO : C.ESCURO, [r[0] + r[2] / 2, r[1] + r[3] / 2]);
        alvos.push(['log_aba:' + k, r]);
      });
      cy += th + int(10 * u);
    }
    if (this.log_aba === 'cam') { this._aba_caminhoes(tela, alvos, x, cy, W, pad, y); return; }
    // ---- 6 itens (3 x 2)
    const qg = T.bases.verde, est = qg.estoque || {};
    const cw = Math.floor((W - 2 * pad - 2 * int(6 * u)) / 3), chh = int(54 * u);
    C.ITENS.forEach((k, i) => {
      const r = [x + pad + (i % 3) * (cw + int(6 * u)), cy + Math.floor(i / 3) * (chh + int(6 * u)), cw, chh];
      const info = C.REFINARIA[k], pode = T.pode_ref('verde', k);
      this._pilula(tela, r, pode ? [236, 242, 252] : FUNDO_APAGADO, pode ? C.ESCURO : CINZA, 8);
      this._icone_item(tela, k, r[0] + int(21 * u), r[1] + Math.floor(chh / 2), int(15 * u));   // ícone grande à esquerda
      const tx = r[0] + int(42 * u);
      pg.blit(tela, this.fonte(12).render(_NOME_CURTO[k], C.ESCURO), tx, r[1] + int(5 * u));
      pg.blit(tela, this.fonte(11, false).render(`QG: ${Math.floor(est[k] || 0)}  (+${info.lote})`, CINZA), tx, r[1] + int(21 * u));
      icones.parafuso(tela, tx + int(5 * u), r[1] + int(41 * u), int(5 * u), !pode);
      pg.blit(tela, this.fonte(11, false).render(`${info.pf}${info.polvora ? ' + 1' : ''} · ${info.tempo}s`, pode ? C.ESCURO : CINZA), tx + int(13 * u), r[1] + int(34 * u));
      if (info.polvora) this._icone_item(tela, 'polvora', tx + int(13 * u) + this.fonte(11, false).size(`${info.pf} + 1`)[0] + int(9 * u), r[1] + int(41 * u), int(6 * u));   // + 1 pólvora
      alvos.push(['ref:' + k, r]);
    });
    cy += 2 * (chh + int(6 * u)) + int(4 * u);
    // ---- fila
    const fila = T.refinaria.verde;
    const ff = this.fonte(12, false);
    pg.blit(tela, this.fonte(12).render(`FILA ${fila.length}/${C.REF_FILA}`, CINZA), x + pad, cy + int(4 * u));
    let fx = x + pad + int(70 * u);
    fila.forEach((o, i) => {
      this._icone_item(tela, o.item, fx + int(10 * u), cy + int(10 * u), int(10 * u));
      if (i === 0) {
        const tot = C.REFINARIA[o.item].tempo, fr = Math.max(0, Math.min(1, 1 - o.t / tot));
        pg.ret(tela, C.ESCURO, [fx, cy + int(24 * u), int(20 * u), int(4 * u)]);
        pg.ret(tela, C.TIMES.verde.base, [fx, cy + int(24 * u), Math.max(1, int(20 * u * fr)), int(4 * u)]);
      }
      fx += int(26 * u);
    });
    if (!fila.length) pg.blit(tela, ff.render('vazia', CINZA), fx, cy + int(4 * u));
    cy += int(34 * u);
    this._alt_ref = cy + pad - y;
  }

  _aba_caminhoes(tela, alvos, x, cy, W, pad, y) {
    // fase 5: lista dos caminhões, compra e ESTOQUE DAS BASES
    const u = this.u, T = this.tropas, ff = this.fonte(12, false);
    const nome_b = (b) => !b ? '—' : b.principal ? 'QG' : (b.deck_base ? `Base ${b.deck_base}` : (b.inicial ? 'Base' : 'Construída'));
    const EST = { parado: 'parado', indo_carregar: 'indo carregar', carregando: 'carregando', indo_descarregar: 'levando carga', descarregando: 'descarregando', esperando: 'esperando' };
    const meus = (T.caminhoes || []).filter(c => c.time === 'verde');
    const bw = int(62 * u), bh = int(30 * u);
    meus.forEach((c, i) => {
      pg.ret(tela, [236, 242, 252], [x + pad, cy, W - 2 * pad, int(38 * u)], 0, int(8 * u));
      pg.blit(tela, this.fonte(13).render(`Caminhão ${i + 1} · ${nome_b(c.de)} → ${nome_b(c.para)}`, C.ESCURO), x + pad + int(8 * u), cy + int(4 * u));
      pg.blit(tela, ff.render(`${EST[c.estado] || c.estado} · carga ${c.carga_total || 0}/${C.CAMINHAO_CAP} · vida ${Math.round(100 * c.vida / c.vida_max)}%`, CINZA), x + pad + int(8 * u), cy + int(22 * u));
      const r1 = [x + W - pad - 2 * bw - int(10 * u), cy + int(5 * u), bw, bh], r2 = [x + W - pad - bw - int(4 * u), cy + int(5 * u), bw, bh];
      this._pilula(tela, r1, [86, 140, 220], C.ESCURO, 8);
      this._texto(tela, 'ROTA', this.fonte(13), C.BRANCO, [r1[0] + r1[2] / 2, r1[1] + r1[3] / 2]);
      this._pilula(tela, r2, C.BRANCO, C.ESCURO, 8);
      this._texto(tela, 'PARAR', this.fonte(13), C.ESCURO, [r2[0] + r2[2] / 2, r2[1] + r2[3] / 2]);
      alvos.push(['cam_rota:' + i, r1], ['cam_parar:' + i, r2]);
      cy += int(42 * u);
    });
    if (!meus.length) { pg.blit(tela, ff.render('Nenhum caminhão: compre um para levar estoque.', CINZA), x + pad, cy); cy += int(20 * u); }
    if (meus.length < C.MAX_CAMINHOES) {   // (no máximo o botão some: a janela cabe no celular)
      const r = [x + pad, cy, W - 2 * pad, int(36 * u)], pode = T.pode_comprar_caminhao('verde'), cheio = meus.length >= C.MAX_CAMINHOES;
      this._pilula(tela, r, pode ? VERDE_ESCURO : FUNDO_APAGADO, pode ? C.ESCURO : CINZA, 9);
      const t1 = cheio ? `Máximo de ${C.MAX_CAMINHOES} caminhões` : `COMPRAR CAMINHÃO (${meus.length}/${C.MAX_CAMINHOES})`;
      const im = this.fonte(14).render(t1, pode ? C.BRANCO : CINZA);
      const larg = im.width + (cheio ? 0 : int(44 * u));
      pg.blit(tela, im, Math.trunc(r[0] + r[2] / 2 - larg / 2), Math.trunc(r[1] + r[3] / 2 - im.height / 2));
      if (!cheio) {
        const mx = r[0] + r[2] / 2 - larg / 2 + im.width + int(14 * u);
        this._moeda(tela, mx, r[1] + r[3] / 2, 6 * u);
        this._texto(tela, String(C.CUSTO_CAMINHAO), this.fonte(14), pode ? C.MOEDA_TEXTO : CINZA, [mx + int(20 * u), r[1] + r[3] / 2]);
        alvos.push(['cam_comprar', r]);
      }
      cy += int(44 * u);
    }
    // ---- estoque das bases
    const im = this.fonte(12).render('ESTOQUE DAS BASES', CINZA);
    pg.blit(tela, im, x + pad, cy);
    pg.linha(tela, FUNDO_APAGADO, [x + pad + im.width + 8 * u, cy + im.height / 2], [x + W - pad, cy + im.height / 2], Math.max(1, int(u)));
    cy += im.height + int(6 * u);
    const col0 = x + pad + int(70 * u), cwi = Math.floor((W - 2 * pad - int(70 * u)) / C.ITENS.length);
    C.ITENS.forEach((k, j) => this._icone_item(tela, k, col0 + j * cwi + cwi / 2, cy + int(10 * u), int(10 * u)));
    cy += int(24 * u);
    const minhas = T.todas_bases().filter(b => b.time === 'verde' && b.vida > 0 && b.estoque);
    minhas.forEach((b) => {
      const nome = b.principal ? 'QG' : (b.deck_base ? `Base ${b.deck_base}` : (b.inicial ? 'Base' : 'Construída'));
      pg.blit(tela, ff.render(nome, C.ESCURO), x + pad, cy);
      C.ITENS.forEach((k, j) => {
        const n = Math.floor(b.estoque[k] || 0);
        this._texto(tela, String(n), this.fonte(13), n ? C.ESCURO : CINZA, [col0 + j * cwi + cwi / 2, cy + int(8 * u)]);
      });
      cy += int(minhas.length > 3 ? 17 : 19) * u;
    });
    if (meus.length < 2) {
      pg.blit(tela, this.fonte(11, false).render('Toque no caminhão no mapa, depois na base de carga e na de descarga.', CINZA), x + pad, cy + int(2 * u));
      cy += int(16 * u);
    }
    this._alt_ref = cy + pad - y;
  }

  _janela_mb(tela) {
    // fase 3: MELHORIAS DA BASE, pagas com moedas (3 níveis cada)
    const u = this.u, T = this.tropas, alvos = this._alvos_mb = [];
    const W = Math.min(this.vw - int(16 * u), int(380 * u));
    const H = this._alt_mb || int(360 * u);
    const x = Math.floor((this.vw - W) / 2), y = Math.max(int(48 * u), Math.floor((this.vh - H) / 2) - int(20 * u));
    const pad = int(14 * u);
    this.r_janela_mb = [x, y, W, H];
    pg.ret(tela, [31, 41, 55, 70], [x + int(4 * u), y + int(6 * u), W, H], 0, int(14 * u));
    pg.ret(tela, C.BRANCO, [x, y, W, H], 0, int(14 * u));
    pg.ret(tela, C.ESCURO, [x, y, W, H], Math.max(2, int(3 * u)), int(14 * u));
    const cab = int(52 * u);
    pg.ret(tela, C.ESCURO, [x, y, W, cab], 0, int(14 * u));
    pg.ret(tela, C.ESCURO, [x, y + Math.floor(cab / 2), W, cab - Math.floor(cab / 2)]);
    pg.ret(tela, C.MOEDA, [x, y + cab - int(4 * u), W, int(4 * u)]);
    pg.blit(tela, this.fonte(20).render('MELHORIAS DA BASE', C.BRANCO), x + pad, y + int(8 * u));
    pg.blit(tela, this.fonte(13, false).render('Moedas melhoram a base · tropa só com parafusos', [201, 207, 219]), x + pad, y + int(31 * u));
    const rx = [x + W - int(42 * u), y + int(11 * u), int(30 * u), int(30 * u)];
    this._pilula(tela, rx, [55, 65, 81], null, 15);
    this._texto(tela, '×', this.fonte(24), C.BRANCO, [rx[0] + rx[2] / 2, rx[1] + rx[3] / 2 - u]);
    alvos.push(['mb_fechar', rx]);
    let cy = y + cab + int(12 * u);
    const bw = int(96 * u), bh = int(44 * u), f = this.fonte(15), fp = this.fonte(13, false);
    for (const k of C.ORDEM_MELH_BASE) {
      const info = C.MELHORIAS_BASE[k], n = T.melh_base.verde[k], max = n >= C.MELH_BASE_MAX;
      pg.blit(tela, f.render(info.nome, C.ESCURO), x + pad, cy);
      this._pips(tela, x + pad, cy + int(22 * u), n, C.MELH_BASE_MAX, W - 2 * pad - bw - int(12 * u), int(9 * u), C.MOEDA, FUNDO_APAGADO, C.ESCURO);
      pg.blit(tela, fp.render(max ? info.txt(n) : `${n ? info.txt(n) : (k === 'tvel' ? `2V em ${C.TREINO_TEMPO}s` : k === 'tpf' ? `${C.PARAFUSO_GANHO} parafusos/${C.PARAFUSO_TREINO}s` : 'normal')} → ${info.txt(n + 1)}`, CINZA), x + pad, cy + int(36 * u));
      const r = [x + W - pad - bw, cy, bw, bh];
      this._botao_moeda(tela, r, max ? 'MÁXIMO' : 'MELHORAR', max ? null : T.custo_mb('verde', k), !max && T.pode_mb('verde', k));
      if (!max) alvos.push(['mb:' + k, r]);
      cy += int(62 * u);
    }
    this._alt_mb = cy + pad - y;
  }

  _janela_treino(tela) {
    const u = this.u, T = this.tropas, n = this.area_aberta;
    const a = M.area_de('verde', n);
    const alvos = this._alvos_treino = [];
    if (!a) { this.area_aberta = -1; return; }
    const ocup = T.ocupante_treino('verde', n);
    const cand = ocup ? [] : this._candidatas_treino(a);
    if (this.treino_sel && (!T.esquadroes.includes(this.treino_sel) || !T.pode_treinar(this.treino_sel))) this.treino_sel = null;
    if (!ocup && !this.treino_sel && cand.length) { this.treino_sel = cand[0]; this.treino_qtd = Math.min(cand[0].sold.length, a.cap); }
    const W = Math.min(this.vw - int(16 * u), int(380 * u));
    const H = this._alt_treino || int(330 * u);
    const x = Math.floor((this.vw - W) / 2), y = Math.max(int(48 * u), Math.floor((this.vh - H) / 2) - int(20 * u));
    const pad = int(14 * u);
    this.r_janela_treino = [x, y, W, H];
    pg.ret(tela, [31, 41, 55, 70], [x + int(4 * u), y + int(6 * u), W, H], 0, int(14 * u));
    this._pilula(tela, [x, y, W, H], C.BRANCO, C.ESCURO, 14);
    // cabeçalho: "i" + título + capacidade
    const cab = int(52 * u);
    pg.ret(tela, C.ESCURO, [x, y, W, cab], 0, int(14 * u));
    pg.ret(tela, C.ESCURO, [x, y + Math.floor(cab / 2), W, cab - Math.floor(cab / 2)]);
    pg.ret(tela, [244, 192, 58], [x, y + cab - int(4 * u), W, int(4 * u)]);
    const ci = [x + pad + int(13 * u), y + int(25 * u)];
    pg.circulo(tela, [86, 140, 220], ci[0], ci[1], int(13 * u));
    this._texto(tela, 'i', this.fonte(20), C.BRANCO, ci);
    pg.blit(tela, this.fonte(20).render('CAMPO DE TREINO ' + (n + 1), C.BRANCO), x + pad + int(34 * u), y + int(8 * u));
    const t_tr = T.tempo_treino ? T.tempo_treino('verde') : C.TREINO_TEMPO, g_tr = T.ganho_treino ? T.ganho_treino('verde') : C.PARAFUSO_GANHO;
    pg.blit(tela, this.fonte(13, false).render(`Até ${a.cap} soldados · ${Math.round(t_tr)}s p/ 2V · +${g_tr} parafusos/${C.PARAFUSO_TREINO}s`, [201, 207, 219]), x + pad + int(34 * u), y + int(31 * u));
    const rx = [x + W - int(42 * u), y + int(11 * u), int(30 * u), int(30 * u)];
    this._pilula(tela, rx, [55, 65, 81], null, 15);
    this._texto(tela, '×', this.fonte(24), C.BRANCO, [rx[0] + rx[2] / 2, rx[1] + rx[3] / 2 - u]);
    alvos.push(['tr_fechar', rx]);
    let cy = y + cab + int(10 * u);
    // como funciona
    const fi = this.fonte(13, false);
    const info = [`Treino completo (${Math.round(t_tr)}s): vira 2V, +${Math.round(C.TREINO_BONUS * 100)}% de vida e dano.`, 'Pelotão: elite (15, alcance x2). Granadeiro: fogo.', '2V não rende parafusos: libere para dar a vez.'];
    const nf = T.fila_treino ? T.fila_treino.verde.length : 0;
    if (nf) info.push(`Fila do treino: ${nf} tropa${nf > 1 ? 's' : ''} caída${nf > 1 ? 's' : ''} esperando campo.`);
    const hi = int((8 + 18 * info.length) * u);
    pg.ret(tela, [236, 242, 252], [x + pad, cy, W - 2 * pad, hi], 0, int(8 * u));
    info.forEach((t, i) => pg.blit(tela, fi.render(t, [55, 65, 81]), x + pad + int(10 * u), cy + int(5 * u) + i * int(18 * u)));
    cy += hi + int(10 * u);
    const secao = (txt) => {
      const im = this.fonte(14).render(txt, CINZA);
      pg.blit(tela, im, x + pad, cy);
      pg.linha(tela, FUNDO_APAGADO, [x + pad + im.width + 8 * u, cy + im.height / 2], [x + W - pad, cy + im.height / 2], Math.max(1, int(u)));
      cy += im.height + int(8 * u);
    };
    if (ocup) {
      // ---- quem está treinando
      secao('TREINANDO AGORA');
      const L = ocup.nivel_treino;
      this._icone_tropa(tela, ocup.tipo, x + pad + int(24 * u), cy + int(22 * u), int(40 * u));
      pg.blit(tela, this.fonte(18).render(`${C.PELOTOES[ocup.tipo].nome} ×${ocup.sold.length}`, C.ESCURO), x + pad + int(54 * u), cy + int(4 * u));
      if (L > 0) this._selo_nivel(tela, x + W - pad - int(32 * u), cy + int(14 * u), L + 1, u);
      const dentro = M.area_em('verde', ocup.x, ocup.y);
      let estado;
      if (L >= C.TREINO_MAX) estado = `${C.NOME_TREINADO[ocup.tipo] || 'Treinada'} 2V · não rende mais: libere`;
      else if (!dentro) estado = 'A caminho do campo...';
      else if (ocup.alvo) estado = 'Em combate: treino pausado';
      else {
        const falta = Math.max(0, t_tr - ocup.t_treino);
        estado = `${C.NOME_TREINADO[ocup.tipo] || 'Nível 2V'} em ${Math.floor(falta / 60)}:${String(Math.floor(falta % 60)).padStart(2, '0')}`;
      }
      pg.blit(tela, this.fonte(13, false).render(estado, CINZA), x + pad + int(54 * u), cy + int(27 * u));
      cy += int(50 * u);
      const frac = L >= C.TREINO_MAX ? 1 : Math.min(1, ocup.t_treino / t_tr);
      const bw = W - 2 * pad;
      pg.ret(tela, C.ESCURO, [x + pad - 2, cy - 2, bw + 4, int(14 * u) + 4], 0, int(5 * u));
      pg.ret(tela, [201, 207, 219], [x + pad, cy, bw, int(14 * u)], 0, int(4 * u));
      if (frac > 0) pg.ret(tela, [244, 192, 58], [x + pad, cy, Math.max(1, int(bw * frac)), int(14 * u)], 0, int(4 * u));
      cy += int(26 * u);
      const bh = int(42 * u), b2 = Math.floor((W - 2 * pad - int(10 * u)) / 2);
      const r1 = [x + pad, cy, b2, bh], r2 = [x + pad + b2 + int(10 * u), cy, b2, bh];
      this._pilula(tela, r1, C.BRANCO, C.ESCURO, 9);
      this._texto(tela, 'SELECIONAR', this.fonte(15), C.ESCURO, [r1[0] + r1[2] / 2, r1[1] + r1[3] / 2]);
      this._pilula(tela, r2, [214, 96, 80], C.ESCURO, 9);
      this._texto(tela, 'LIBERAR', this.fonte(15), C.BRANCO, [r2[0] + r2[2] / 2, r2[1] + r2[3] / 2]);
      alvos.push(['tr_selecionar', r1], ['tr_liberar', r2]);
      cy += bh + pad;
    } else {
      // ---- escolher tropa e quantidade
      secao('ESCOLHA A TROPA');
      if (!cand.length) {
        pg.blit(tela, this.fonte(13, false).render('Nenhuma tropa a pé livre agora.', CINZA), x + pad, cy);
        pg.blit(tela, this.fonte(13, false).render('Jogue uma carta ou libere uma tropa.', CINZA), x + pad, cy + int(18 * u));
        cy += int(44 * u);
      } else {
        const vao = int(6 * u), nc = 6;
        const cw = Math.floor((W - 2 * pad - vao * (nc - 1)) / nc), ch = int(70 * u);
        cand.forEach((sq, i) => {
          const r = [x + pad + i * (cw + vao), cy, cw, ch];
          const sel = sq === this.treino_sel;
          this._pilula(tela, r, sel ? [255, 246, 222] : C.BRANCO, sel ? [214, 160, 40] : C.ESCURO, 8);
          this._icone_tropa(tela, sq.tipo, r[0] + cw / 2, r[1] + int(25 * u), int(32 * u));
          this._texto(tela, '×' + sq.sold.length, this.fonte(13), C.ESCURO, [r[0] + cw / 2, r[1] + ch - int(14 * u)]);
          if (sq.nivel_treino > 0) this._selo_nivel(tela, r[0] + cw - int(31 * u), r[1] + int(12 * u), sq.nivel_treino + 1, u * 0.8);
          alvos.push(['tr_sel:' + i, r]);
        });
        this._cand = cand;
        cy += ch + int(12 * u);
        // quantidade
        const sq = this.treino_sel;
        const maxq = sq ? Math.min(sq.sold.length, a.cap) : 0;
        if (sq && sq.tipo === 'canhao') this.treino_qtd = sq.sold.length;
        this.treino_qtd = Math.max(sq ? 1 : 0, Math.min(this.treino_qtd, maxq));
        secao('QUANTOS SOLDADOS VÃO TREINAR');
        const bh = int(38 * u);
        if (sq && sq.tipo === 'canhao') {
          pg.blit(tela, this.fonte(14, false).render(`Canhão vai inteiro (${sq.sold.length} soldados)`, C.ESCURO), x + pad, cy + int(10 * u));
        } else {
          const bs = int(44 * u), vao2 = int(6 * u);
          const passos = [['-10', -10], ['-1', -1], null, ['+1', 1], ['+10', 10]];
          const meio = W - 2 * pad - 4 * bs - 4 * vao2 - int(70 * u);
          let bx = x + pad;
          for (const p of passos) {
            if (p === null) {
              const r = [bx, cy, meio, bh];
              this._pilula(tela, r, [236, 242, 252], C.ESCURO, 9);
              this._texto(tela, `${this.treino_qtd} / ${maxq}`, this.fonte(17), C.ESCURO, [r[0] + r[2] / 2, r[1] + r[3] / 2]);
              bx += meio + vao2;
              continue;
            }
            const r = [bx, cy, bs, bh];
            this._pilula(tela, r, C.BRANCO, C.ESCURO, 9);
            this._texto(tela, p[0], this.fonte(15), C.ESCURO, [r[0] + r[2] / 2, r[1] + r[3] / 2]);
            alvos.push(['tr_q:' + p[1], r]);
            bx += bs + vao2;
          }
          const rt = [x + W - pad - int(64 * u), cy, int(64 * u), bh];
          this._pilula(tela, rt, C.BRANCO, C.ESCURO, 9);
          this._texto(tela, 'TUDO', this.fonte(14), C.ESCURO, [rt[0] + rt[2] / 2, rt[1] + rt[3] / 2]);
          alvos.push(['tr_tudo', rt]);
        }
        cy += bh + int(12 * u);
        const re = [x + pad, cy, W - 2 * pad, int(44 * u)];
        const pode = !!sq && this.treino_qtd >= 1;
        this._pilula(tela, re, pode ? VERDE_ESCURO : FUNDO_APAGADO, pode ? C.ESCURO : CINZA, 10);
        this._texto(tela, 'ENVIAR PARA O TREINO', this.fonte(17), pode ? C.BRANCO : CINZA, [re[0] + re[2] / 2, re[1] + re[3] / 2]);
        if (pode) alvos.push(['tr_enviar', re]);
        cy += re[3];
      }
      cy += pad;
    }
    this._alt_treino = cy - y;
  }

  // ---------- janela da BASE -------------------------------------------
  abrir_base(b) {
    // toque numa base sua: abre (ou fecha, se já estava aberta) a janela dela
    this.base_aberta = this.base_aberta === b ? null : b;
    if (this.base_aberta) { this.gaveta = null; this.area_aberta = -1; this.mb_aberta = false; this.ref_aberta = false; }
    this.deck_sel = [];   // escolha do deck começa vazia a cada abertura
  }

  _icone_tropa(tela, tipo, cx, cy, alt, apagado = false, time = 'verde') {
    // o boneco da carta, reduzido para caber numa caixa de altura 'alt'
    let img;
    const inim = time !== 'verde';
    if (tipo === 'heli') img = (inim ? this._heli_inimigo : this._heli_carta)[0];
    else if (tipo === 'tanque') img = (inim ? this._tanque_inimigo : this._tanque_carta)[0];
    else img = (inim ? this._bonecos_inimigo : this._bonecos)[tipo][0];
    const k = Math.min(alt / img.height, (alt * 1.25) / img.width, 1.0);
    const w = Math.max(1, int(img.width * k)), h = Math.max(1, int(img.height * k));
    if (apagado) tela.globalAlpha = 0.35;
    tela.drawImage(img, int(cx - w / 2), int(cy - h / 2), w, h);
    tela.globalAlpha = 1;
  }

  _pips(tela, x, y, n, maximo, larg, alt, cor_cheia, cor_vazia, borda) {
    // segmentos de nível (como a bateria das melhorias)
    const u = this.u, vao = Math.max(2, int(3 * u));
    const w = Math.max(3, Math.floor((larg - vao * (maximo - 1)) / maximo));
    for (let i = 0; i < maximo; i++) {
      const r = [int(x + i * (w + vao)), int(y), w, int(alt)];
      pg.ret(tela, i < n ? cor_cheia : cor_vazia, r, 0, Math.max(1, int(2 * u)));
      if (borda) pg.ret(tela, borda, r, Math.max(1, int(u)), Math.max(1, int(2 * u)));
    }
  }

  _botao_moeda(tela, r, txt, custo, pode) {
    // botão verde com a moeda e o preço (ou cinza quando não dá)
    const u = this.u;
    this._pilula(tela, r, pode ? VERDE_ESCURO : FUNDO_APAGADO, pode ? C.ESCURO : CINZA, 9);
    if (custo === null) {
      this._texto(tela, txt, this.fonte(15), pode ? C.BRANCO : CINZA, [r[0] + r[2] / 2, r[1] + r[3] / 2]);
      return;
    }
    this._texto(tela, txt, this.fonte(13), pode ? C.BRANCO : CINZA, [r[0] + r[2] / 2, r[1] + 11 * u]);
    const f = this.fonte(16), t = String(custo), tw = f.size(t)[0];
    const cx = r[0] + r[2] / 2 - (tw + 16 * u) / 2 + 6 * u, cy = r[1] + r[3] - 12 * u;
    this._moeda(tela, cx, cy, 6 * u);
    this._texto(tela, t, f, pode ? C.MOEDA_TEXTO : CINZA, [cx + 10 * u + tw / 2, cy]);
  }

  _janela_base(tela) {
    const u = this.u, T = this.tropas, b = this.base_aberta;
    if (!T.todas_bases().includes(b) || b.vida <= 0) { this.base_aberta = null; this._alvos_base = []; return; }
    if (b.deck_base && !b.deck) { this._janela_deck(tela); return; }   // base 2/3: primeiro o deck
    const alvos = this._alvos_base = [];
    const principal = b.principal;
    const W = Math.min(this.vw - int(16 * u), int(360 * u));
    // altura: a do conteúdo medido no quadro anterior (estimativa no primeiro)
    const chave_h = principal ? 'p' : 'e';
    this._alt_base = this._alt_base || {};
    const H = this._alt_base[chave_h] || int((principal ? 350 : 206) * u);
    const x = Math.floor((this.vw - W) / 2), y = Math.max(int(48 * u), Math.floor((this.vh - H) / 2) - int(20 * u));
    const pad = int(14 * u);
    this.r_janela_base = [x, y, W, H];
    // sombra + corpo
    pg.ret(tela, [31, 41, 55, 70], [x + int(4 * u), y + int(6 * u), W, H], 0, int(14 * u));
    this._pilula(tela, [x, y, W, H], C.BRANCO, C.ESCURO, 14);
    // cabeçalho escuro com nome, vida e fechar
    const cab = int(50 * u);
    pg.ret(tela, C.ESCURO, [x, y, W, cab], 0, int(14 * u));
    pg.ret(tela, C.ESCURO, [x, y + Math.floor(cab / 2), W, cab - Math.floor(cab / 2)]);
    pg.ret(tela, C.TIMES.verde.base, [x, y + cab - int(4 * u), W, int(4 * u)]);
    const titulo = principal ? 'QG PRINCIPAL' : (b.deck_base ? 'BASE ' + b.deck_base : 'BASE AVANÇADA');
    let img = this.fonte(21).render(titulo, C.BRANCO);
    pg.blit(tela, img, x + pad, y + int(9 * u));
    img = this.fonte(13, false).render(`Vida ${int(b.vida)}/${int(b.vida_max)}`, [201, 207, 219]);
    pg.blit(tela, img, x + pad, y + int(31 * u));
    if (principal) {   // selo do nível
      const sr = [x + W - int(124 * u), y + int(12 * u), int(74 * u), int(26 * u)];
      this._pilula(tela, sr, C.TIMES.verde.base, null, 13);
      this._texto(tela, `NÍVEL ${T.nivel_qg}/${C.NIVEL_QG_MAX}`, this.fonte(14), C.BRANCO, [sr[0] + sr[2] / 2, sr[1] + sr[3] / 2]);
    }
    const rx = [x + W - int(42 * u), y + int(10 * u), int(30 * u), int(30 * u)];
    this._pilula(tela, rx, [55, 65, 81], null, 15);
    this._texto(tela, '×', this.fonte(24), C.BRANCO, [rx[0] + rx[2] / 2, rx[1] + rx[3] / 2 - u]);
    alvos.push(['fechar_base', rx]);

    let cy = y + cab + int(12 * u);
    const secao = (txt) => {
      const im = this.fonte(14).render(txt, CINZA);
      pg.blit(tela, im, x + pad, cy);
      pg.linha(tela, FUNDO_APAGADO, [x + pad + im.width + 8 * u, cy + im.height / 2], [x + W - pad, cy + im.height / 2], Math.max(1, int(u)));
      cy += im.height + int(6 * u);
    };
    const bw = int(96 * u), bh = int(44 * u);
    if (principal) {
      // ---- nível do QG
      secao('NÍVEL DO QG');
      const max_qg = T.nivel_qg >= C.NIVEL_QG_MAX;
      const lim = T.limite_soldados();
      const prox = C.ORDEM_CARTAS.filter(k => C.DESBLOQUEIO_CARTAS[k] === T.nivel_qg + 1).map(k => C.PELOTOES[k].nome);
      this._pips(tela, x + pad, cy + 2 * u, T.nivel_qg, C.NIVEL_QG_MAX, W - 2 * pad - bw - int(12 * u), int(10 * u),
        VERDE_ESCURO, FUNDO_APAGADO, C.ESCURO);
      const f = this.fonte(14, false);
      const fixo = !!T.limite_tropas;   // escolhido na tela de nova partida: não sobe com o QG
      pg.blit(tela, f.render(max_qg || fixo ? `Capacidade: ${lim} soldados` : `Capacidade: ${lim} → ${lim + C.LIMITE_POR_NIVEL}`, C.ESCURO), x + pad, cy + int(18 * u));
      pg.blit(tela, f.render(max_qg ? 'Todas as cartas liberadas' : (prox.length ? 'Libera: ' + prox.join(', ') : 'Empurra a linha de frente'), CINZA), x + pad, cy + int(35 * u));
      const r = [x + W - pad - bw, cy, bw, bh];
      const pode = !max_qg && T.moedas >= T.custo_qg();
      this._botao_moeda(tela, r, max_qg ? 'MÁXIMO' : 'MELHORAR', max_qg ? null : T.custo_qg(), pode);
      if (!max_qg) alvos.push(['melhorar_qg', r]);
      cy += bh + int(14 * u);
      // ---- produção
      secao('PRODUÇÃO DAS BASES');
      const np = T.nivel.prod, max_p = np >= C.NIVEL_MAX;
      const agora = T.tempo_tropa(b);
      const depois = agora * C.mult_hab('prod', np + 1) / C.mult_hab('prod', np);
      this._pips(tela, x + pad, cy + 2 * u, np, C.NIVEL_MAX, W - 2 * pad - bw - int(12 * u), int(10 * u),
        C.TIMES.verde.base, FUNDO_APAGADO, C.ESCURO);
      pg.blit(tela, f.render(max_p ? `Uma carta a cada ${agora.toFixed(1)}s` : `Uma carta a cada ${agora.toFixed(1)}s → ${depois.toFixed(1)}s`, C.ESCURO), x + pad, cy + int(18 * u));
      pg.blit(tela, f.render('Vale para as 3 bases', CINZA), x + pad, cy + int(35 * u));
      const r2 = [x + W - pad - bw, cy, bw, bh];
      const pode2 = !max_p && T.moedas >= T.custo('prod');
      this._botao_moeda(tela, r2, max_p ? 'MÁXIMO' : 'ACELERAR', max_p ? null : T.custo('prod'), pode2);
      if (!max_p) alvos.push(['compra:prod', r2]);
      cy += bh + int(14 * u);
    }
    const f_info = this.fonte(14, false);
    if (!T.pode_soltar(b)) {   // base construída: não solta tropa
      secao('ESTA BASE NÃO SOLTA TROPAS');
      pg.blit(tela, f_info.render('Só o QG, a base 2 e a base 3 soltam tropas.', C.ESCURO), x + pad, cy);
      pg.blit(tela, f_info.render('Ela segura território e aumenta a vida das tropas.', CINZA), x + pad, cy + int(18 * u));
      pg.blit(tela, f_info.render('Veio com uma torre de graça: dano x2, metade da vida.', CINZA), x + pad, cy + int(36 * u));
      cy += int(18 * u);
      cy += int(44 * u);
      this._alt_base[chave_h] = cy + pad - y;
      return;
    }
    // ---- GPS: ponto de reunião das tropas que esta base solta (selo no cabeçalho,
    // para a janela não crescer na tela do celular)
    {
      const gw = int(58 * u), gr = [x + W - (principal ? int(124 * u) : int(42 * u)) - int(8 * u) - gw, y + int(12 * u), gw, int(26 * u)];
      this._pilula(tela, gr, b.reuniao ? C.TIMES.verde.base : [86, 140, 220], null, 13);
      this._texto(tela, b.reuniao ? 'GPS ✓' : 'GPS', this.fonte(14), C.BRANCO, [gr[0] + gr[2] / 2, gr[1] + gr[3] / 2]);
      alvos.push(['gps', gr]);
    }
    // ---- carta que esta base solta
    const lista = b.deck_base && b.deck ? b.deck : C.ORDEM_CARTAS;   // base 2/3: só as 3 do deck
    secao(b.deck_base ? 'DECK · CARTA QUE ESTA BASE SOLTA' : 'CARTA QUE ESTA BASE SOLTA');
    const n = lista.length, vao = int(6 * u);
    const cw = Math.floor((W - 2 * pad - vao * (n - 1)) / n), ch = int(78 * u);
    lista.forEach((tipo, i) => {
      const r = [x + pad + i * (cw + vao), cy, cw, ch];
      const livre = T.carta_desbloqueada(tipo), sel = b.carta === tipo;
      this._pilula(tela, r, sel ? [232, 245, 236] : (livre ? C.BRANCO : FUNDO_APAGADO), sel ? VERDE_ESCURO : (livre ? C.ESCURO : CINZA), 8);
      this._icone_tropa(tela, tipo, r[0] + cw / 2, r[1] + int(28 * u), int(36 * u), !livre);
      let fn = this.fonte(12);
      const nome = C.PELOTOES[tipo].nome;
      if (fn.size(nome)[0] > cw - 4) fn = this.fonte(10);
      this._texto(tela, nome, fn, livre ? C.ESCURO : CINZA, [r[0] + cw / 2, r[1] + ch - int(22 * u)]);
      const vivos = T.drop_vivos('verde', tipo), lim = T.limite_drop('verde', tipo);
      const rodape = livre ? `${vivos}/${lim} no campo` : (b.deck_base ? 'dropa no QG ' : 'QG ') + C.DESBLOQUEIO_CARTAS[tipo];
      const cheio_d = livre && vivos >= lim;
      this._texto(tela, rodape, this.fonte(10, !livre || sel || cheio_d), cheio_d ? C.TIMES.vermelho.emblema : (sel ? VERDE_ESCURO : CINZA),
        [r[0] + cw / 2, r[1] + ch - int(9 * u)]);
      // custo em PARAFUSOS (canto de cima, à esquerda)
      const pf = C.PARAFUSO_CUSTO[tipo] || 0, tem = (T.parafusos ? T.parafusos.verde : 99) >= pf;
      icones.parafuso(tela, r[0] + int(9 * u), r[1] + int(10 * u), int(6 * u), !livre);
      this._texto(tela, String(pf), this.fonte(11), tem ? C.ESCURO : C.TIMES.vermelho.emblema, [r[0] + int(20 * u), r[1] + int(10 * u)]);
      if (sel) {   // selo de "escolhida"
        pg.circulo(tela, VERDE_ESCURO, r[0] + cw - int(7 * u), r[1] + int(7 * u), int(8 * u));
        pg.linhas(tela, C.BRANCO, false, [[r[0] + cw - 11 * u, r[1] + 7 * u], [r[0] + cw - 8 * u, r[1] + 10 * u], [r[0] + cw - 3 * u, r[1] + 4 * u]], Math.max(2, int(2 * u)));
      }
      alvos.push(['base_carta:' + tipo, r]);
    });
    cy += ch + int(10 * u);
    // próxima tropa saindo
    const tempo = T.tempo_tropa(b), frac = Math.min(1, b.t_tropa / Math.max(0.01, tempo));
    const bx = x + pad, bwid = W - 2 * pad;
    pg.ret(tela, C.ESCURO, [bx - 2, cy - 2, bwid + 4, int(16 * u) + 4], 0, int(5 * u));
    pg.ret(tela, [201, 207, 219], [bx, cy, bwid, int(16 * u)], 0, int(4 * u));
    if (frac > 0) pg.ret(tela, [86, 140, 220], [bx, cy, Math.max(1, int(bwid * frac)), int(16 * u)], 0, int(4 * u));
    const falta = Math.max(0, tempo - b.t_tropa);
    const livre = b.deck_base ? (b.deck && (b.deck.includes(b.carta) && T.carta_desbloqueada(b.carta) ? b.carta : b.deck.find(k => T.carta_desbloqueada(k)))) || null
      : (T.carta_desbloqueada(b.carta) ? b.carta : 'pelotao');
    const no_limite = livre && T.drop_vivos('verde', livre) >= T.limite_drop('verde', livre);
    let aviso;
    if (!livre) aviso = `Deck bloqueado: suba o QG para liberar`;
    else if (b.falta_pf > 0 && frac >= 1) aviso = `Faltam parafusos: precisa de ${b.falta_pf} (treine tropas)`;
    else if (frac < 1) aviso = `${C.PELOTOES[livre].nome} em ${Math.ceil(falta)}s`;
    else if (no_limite) aviso = `Limite de ${C.PELOTOES[livre].nome}: ${T.limite_drop('verde', livre)} soltas pelas bases`;
    else if (T.vivos_tipo('verde', livre) >= C.limite_mapa(livre)) aviso = `Limite do mapa: ${C.limite_mapa(livre)} ${C.PELOTOES[livre].nome}`;
    else aviso = `${C.PELOTOES[livre].nome}: esperando espaço/vaga`;
    this._texto(tela, aviso,
      this.fonte(12), C.ESCURO, [bx + bwid / 2, cy + int(8 * u)]);
    this._alt_base[chave_h] = cy + int(16 * u) + pad - y;   // altura certa para o próximo quadro
  }

  // ---------- DECK da base 2 / base 3 (escolhido uma vez só) ----------------
  alternar_deck(tipo) {
    // toque numa carta da escolha do deck: marca/desmarca (no máximo 3).
    // devolve false se não pode (já está no deck da outra base, ou já tem 3)
    const b = this.base_aberta, T = this.tropas;
    if (!b || !b.deck_base || b.deck) return false;
    this.deck_sel = this.deck_sel || [];
    const i = this.deck_sel.indexOf(tipo);
    if (i >= 0) { this.deck_sel.splice(i, 1); return true; }
    if (this.deck_sel.length >= 3 || T.deck_ocupado(b, tipo)) return false;
    this.deck_sel.push(tipo);
    return true;
  }

  _janela_deck(tela) {
    const u = this.u, T = this.tropas, b = this.base_aberta;
    const alvos = this._alvos_base = [];
    const sel = this.deck_sel = this.deck_sel || [];
    const W = Math.min(this.vw - int(16 * u), int(430 * u));
    this._alt_base = this._alt_base || {};
    const H = this._alt_base.d || int(330 * u);
    const x = Math.floor((this.vw - W) / 2), y = Math.max(int(48 * u), Math.floor((this.vh - H) / 2) - int(14 * u));
    const pad = int(14 * u);
    this.r_janela_base = [x, y, W, H];
    pg.ret(tela, [31, 41, 55, 70], [x + int(4 * u), y + int(6 * u), W, H], 0, int(14 * u));
    this._pilula(tela, [x, y, W, H], C.BRANCO, C.ESCURO, 14);
    // cabeçalho
    const cab = int(54 * u);
    pg.ret(tela, C.ESCURO, [x, y, W, cab], 0, int(14 * u));
    pg.ret(tela, C.ESCURO, [x, y + Math.floor(cab / 2), W, cab - Math.floor(cab / 2)]);
    pg.ret(tela, OURO_DECK, [x, y + cab - int(4 * u), W, int(4 * u)]);
    pg.blit(tela, this.fonte(21).render(`BASE ${b.deck_base} · DECK`, C.BRANCO), x + pad, y + int(8 * u));
    pg.blit(tela, this.fonte(13, false).render('Escolha 3 cartas · uma vez só, no começo', [201, 207, 219]), x + pad, y + int(32 * u));
    const rx = [x + W - int(42 * u), y + int(12 * u), int(30 * u), int(30 * u)];
    this._pilula(tela, rx, [55, 65, 81], null, 15);
    this._texto(tela, '×', this.fonte(24), C.BRANCO, [rx[0] + rx[2] / 2, rx[1] + rx[3] / 2 - u]);
    alvos.push(['fechar_base', rx]);
    // as 6 cartas (3 por linha)
    let cy = y + cab + int(12 * u);
    const cols = 3, vao = int(8 * u);
    const cw = Math.floor((W - 2 * pad - vao * (cols - 1)) / cols), ch = int(96 * u);
    C.ORDEM_CARTAS.forEach((tipo, i) => {
      const r = [x + pad + (i % cols) * (cw + vao), cy + Math.floor(i / cols) * (ch + vao), cw, ch];
      const outra = T.deck_ocupado(b, tipo);
      const ordem = sel.indexOf(tipo);
      const marcada = ordem >= 0;
      const livre = T.carta_desbloqueada(tipo);
      const cheio = !marcada && sel.length >= 3;
      const fundo = outra ? FUNDO_APAGADO : (marcada ? [255, 246, 214] : C.BRANCO);
      const borda = outra ? CINZA : (marcada ? OURO_DECK_ESC : C.ESCURO);
      if (marcada) pg.ret(tela, OURO_DECK, [r[0] - int(3 * u), r[1] - int(3 * u), r[2] + int(6 * u), r[3] + int(6 * u)], 0, int(11 * u));
      this._pilula(tela, r, fundo, borda, 9);
      this._icone_tropa(tela, tipo, r[0] + cw / 2, r[1] + int(34 * u), int(44 * u), !!outra || cheio);
      let fn = this.fonte(13);
      const nome = C.PELOTOES[tipo].nome;
      if (fn.size(nome)[0] > cw - 6) fn = this.fonte(11);
      this._texto(tela, nome, fn, outra ? CINZA : C.ESCURO, [r[0] + cw / 2, r[1] + ch - int(28 * u)]);
      // etiqueta embaixo: na outra base / dropa no QG n / liberada
      let tag, cor_tag, cor_txt = C.BRANCO;
      if (outra) { tag = `NA BASE ${outra.deck_base}`; cor_tag = CINZA; }
      else if (!livre) { tag = `dropa no QG ${C.DESBLOQUEIO_CARTAS[tipo]}`; cor_tag = [236, 128, 40]; }
      else { tag = 'LIBERADA'; cor_tag = VERDE_ESCURO; }
      const ft = this.fonte(10);
      const tw = ft.size(tag)[0] + int(12 * u);
      const rt = [Math.floor(r[0] + cw / 2 - tw / 2), r[1] + ch - int(17 * u), tw, int(14 * u)];
      this._pilula(tela, rt, cor_tag, null, 7);
      this._texto(tela, tag, ft, cor_txt, [rt[0] + rt[2] / 2, rt[1] + rt[3] / 2]);
      if (marcada) {   // número da ordem no canto
        const sx = r[0] + cw - int(10 * u), sy = r[1] + int(10 * u);
        pg.circulo(tela, C.ESCURO, sx, sy, int(10 * u));
        pg.circulo(tela, OURO_DECK, sx, sy, int(8 * u));
        this._texto(tela, String(ordem + 1), this.fonte(11), C.ESCURO, [sx, sy]);
      }
      if (outra) {   // risquinho de "indisponível"
        pg.linha(tela, CINZA, [r[0] + int(8 * u), r[1] + int(8 * u)], [r[0] + cw - int(8 * u), r[1] + ch - int(36 * u)], Math.max(2, int(2 * u)));
      }
      alvos.push(['deck_sel:' + tipo, r]);
    });
    cy += 2 * ch + vao + int(12 * u);
    const f = this.fonte(12, false);
    pg.blit(tela, f.render('A base solta só uma das 3 (você escolhe qual).', CINZA), x + pad, cy);
    cy += f.altura + int(2 * u);
    pg.blit(tela, f.render('As outras cartas, só comprando no Batalhão.', CINZA), x + pad, cy);
    cy += f.altura + int(10 * u);
    // confirmar
    const pode = sel.length === 3;
    const rb = [x + pad, cy, W - 2 * pad, int(44 * u)];
    this._pilula(tela, rb, pode ? VERDE_ESCURO : FUNDO_APAGADO, pode ? C.ESCURO : CINZA, 10);
    this._texto(tela, pode ? 'CONFIRMAR DECK' : `ESCOLHA ${3 - sel.length} ${3 - sel.length === 1 ? 'CARTA' : 'CARTAS'}  ·  ${sel.length}/3`, this.fonte(17), pode ? C.BRANCO : CINZA, [rb[0] + rb[2] / 2, rb[1] + rb[3] / 2]);
    if (pode) alvos.push(['deck_ok', rb]);
    cy += rb[3];
    this._alt_base.d = cy + pad - y;
  }

  // ---------- tela de HABILIDADES (estilo subir atributos) -------------
  _losango(tela, cor, cx, cy, r, larg = 0) {
    const pts = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
    if (larg) pg.linhas(tela, cor, true, pts, larg); else pg.poligono(tela, cor, pts);
  }

  _filete(tela, x0, x1, y, cor = ER.linha) {
    // linha fina dourada com um losango no meio
    const u = this.u;
    pg.linha(tela, cor, [x0, y], [x1, y], Math.max(1, int(u)));
    this._losango(tela, ER.ouro, (x0 + x1) / 2, y, 3.5 * u);
  }

  _tela_habilidades(tela) {
    const u = this.u, T = this.tropas, alvos = this._alvos_hab = [];
    const vw = this.vw, vh = this.vh;
    tela.fillStyle = pg.css(ER.fundo);
    tela.fillRect(0, 0, vw, vh);
    const W = Math.min(vw - int(16 * u), int(640 * u)), H = Math.min(vh - int(16 * u), int(430 * u));
    const x = Math.floor((vw - W) / 2), y = Math.floor((vh - H) / 2);
    this.r_hab = [x, y, W, H];
    pg.ret(tela, ER.painel, [x, y, W, H]);
    pg.ret(tela, ER.ouro_esc, [x, y, W, H], Math.max(1, int(u)));
    pg.ret(tela, [201, 170, 110, 50], [x + int(4 * u), y + int(4 * u), W - int(8 * u), H - int(8 * u)], Math.max(1, int(u)));
    const pad = int(16 * u);
    // título
    const ft = this.fonte(22);
    pg.blit(tela, ft.render('SUBIR HABILIDADES', ER.ouro), x + pad, y + int(12 * u));
    pg.blit(tela, this.fonte(13, false).render('Cada tropa evolui separado', ER.apagado), x + pad, y + int(36 * u));
    // caixa de moedas (mantidas / necessárias)
    const tipo = this.hab_tipo, m = this.hab_m;
    const nv = T.hab_nivel[tipo];
    const max_m = nv[m] >= C.NIVEL_MAX;
    const custo = max_m ? null : T.custo_hab(tipo, m);
    const cxw = int(170 * u), cx0 = x + W - pad - cxw - int(40 * u);
    const fr = this.fonte(13, false), fv = this.fonte(16);
    pg.blit(tela, fr.render('Moedas', ER.apagado), cx0, y + int(12 * u));
    pg.blit(tela, fr.render('Necessárias', ER.apagado), cx0, y + int(32 * u));
    let t = String(int(T.moedas));
    pg.blit(tela, fv.render(t, ER.texto), cx0 + cxw - fv.size(t)[0], y + int(10 * u));
    t = custo === null ? '—' : String(custo);
    pg.blit(tela, fv.render(t, custo !== null && T.moedas < custo ? [214, 96, 80] : ER.texto), cx0 + cxw - fv.size(t)[0], y + int(30 * u));
    // fechar
    const rx = [x + W - pad - int(28 * u), y + int(14 * u), int(28 * u), int(28 * u)];
    pg.ret(tela, ER.ouro_esc, rx, Math.max(1, int(u)));
    this._texto(tela, '×', this.fonte(22), ER.ouro, [rx[0] + rx[2] / 2, rx[1] + rx[3] / 2 - u]);
    alvos.push(['fechar_hab', rx]);
    const ytopo = y + int(58 * u);
    this._filete(tela, x + pad, x + W - pad, ytopo);

    // coluna da esquerda: as tropas
    const lw = Math.min(int(176 * u), Math.floor(W * 0.36));
    const lh = Math.floor((H - (ytopo - y) - int(44 * u)) / C.ORDEM_CARTAS.length);
    C.ORDEM_CARTAS.forEach((tp, i) => {
      const r = [x + pad, ytopo + int(10 * u) + i * lh, lw, lh - int(2 * u)];
      const livre = T.carta_desbloqueada(tp), sel = tp === tipo;
      if (sel) {
        pg.ret(tela, ER.ouro_sel, r);
        pg.linha(tela, ER.ouro, [r[0], r[1]], [r[0] + r[2], r[1]], Math.max(1, int(u)));
        pg.linha(tela, ER.ouro, [r[0], r[1] + r[3]], [r[0] + r[2], r[1] + r[3]], Math.max(1, int(u)));
      }
      this._losango(tela, sel ? ER.ouro : ER.ouro_esc, r[0] + int(10 * u), r[1] + r[3] / 2, 4 * u, sel ? 0 : Math.max(1, int(u)));
      const soma = C.ORDEM_HAB.reduce((a, k) => a + T.hab_nivel[tp][k], 0);
      const fn = this.fonte(15);
      pg.blit(tela, fn.render(C.PELOTOES[tp].nome, livre ? (sel ? ER.texto : [196, 190, 172]) : ER.bloq), r[0] + int(22 * u), r[1] + r[3] / 2 - fn.altura / 2);
      const dir = livre ? 'Nv ' + soma : 'QG ' + C.DESBLOQUEIO_CARTAS[tp];
      const fd = this.fonte(13, false);
      pg.blit(tela, fd.render(dir, livre ? ER.ouro : ER.bloq), r[0] + r[2] - fd.size(dir)[0] - int(6 * u), r[1] + r[3] / 2 - fd.altura / 2);
      alvos.push(['hab_tipo:' + tp, r]);
    });
    // separador vertical
    const xd = x + pad + lw + int(14 * u);
    pg.linha(tela, ER.linha, [xd, ytopo + int(10 * u)], [xd, y + H - int(40 * u)], Math.max(1, int(u)));

    // direita: retrato + atributos
    const rx0 = xd + int(14 * u), rw = x + W - pad - rx0;
    const livre = T.carta_desbloqueada(tipo);
    const info = C.PELOTOES[tipo];
    const ry = ytopo + int(12 * u);
    const quad = int(64 * u);
    pg.ret(tela, [28, 26, 22], [rx0, ry, quad, quad]);
    pg.ret(tela, ER.ouro_esc, [rx0, ry, quad, quad], Math.max(1, int(u)));
    this._icone_tropa(tela, tipo, rx0 + quad / 2, ry + quad / 2, int(50 * u), !livre);
    pg.blit(tela, this.fonte(21).render(info.nome.toUpperCase(), livre ? ER.texto : ER.bloq), rx0 + quad + int(12 * u), ry + int(4 * u));
    pg.blit(tela, this.fonte(13, false).render(`${info.linha1} · ${info.linha2}`, ER.apagado), rx0 + quad + int(12 * u), ry + int(30 * u));
    pg.blit(tela, this.fonte(13, false).render(livre ? `Carta: ${C.PF_CARTA[tipo]} parafusos · chega em 1 min` : `Bloqueada até o QG nível ${C.DESBLOQUEIO_CARTAS[tipo]}`,
      livre ? ER.ouro : [214, 96, 80]), rx0 + quad + int(12 * u), ry + int(46 * u));
    let ya = ry + quad + int(14 * u);
    pg.blit(tela, this.fonte(14).render('ATRIBUTOS', ER.ouro), rx0, ya);
    pg.linha(tela, ER.linha, [rx0 + int(84 * u), ya + int(8 * u)], [rx0 + rw, ya + int(8 * u)], Math.max(1, int(u)));
    ya += int(24 * u);
    const linha_h = Math.max(int(36 * u), Math.floor((y + H - int(44 * u) - ya) / C.ORDEM_HAB.length));
    for (const k of C.ORDEM_HAB) {
      const n = T.hab_nivel[tipo][k], cheio = n >= C.NIVEL_MAX, sel = k === m;
      const r = [rx0, ya, rw, linha_h - int(4 * u)];
      if (sel) {
        pg.ret(tela, ER.ouro_sel, r);
        pg.linha(tela, ER.ouro, [r[0], r[1] + r[3]], [r[0] + r[2], r[1] + r[3]], Math.max(1, int(u)));
      }
      const meio = r[1] + r[3] / 2;
      const fl = this.fonte(16);
      pg.blit(tela, fl.render(NOMES_HAB[k], livre ? ER.texto : ER.bloq), r[0] + int(6 * u), meio - fl.altura / 2 - int(6 * u));
      // nível em losangos
      for (let i = 0; i < C.NIVEL_MAX; i++) {
        this._losango(tela, i < n ? ER.ouro : ER.ouro_esc, r[0] + int(11 * u) + i * int(12 * u), meio + int(10 * u), 4 * u, i < n ? 0 : Math.max(1, int(u)));
      }
      // valor atual -> próximo
      const a = Math.round(C.mult_hab(k, n) * 100), d = Math.round(C.mult_hab(k, n + 1) * 100);
      const fvv = this.fonte(18), xv = r[0] + Math.floor(r[2] * 0.42);
      pg.blit(tela, fvv.render(a + '%', ER.texto), xv, meio - fvv.altura / 2);
      if (!cheio) {
        pg.blit(tela, this.fonte(16).render('→', ER.apagado), xv + int(52 * u), meio - fvv.altura / 2);
        pg.blit(tela, fvv.render(d + '%', ER.azul), xv + int(72 * u), meio - fvv.altura / 2);
      } else {
        pg.blit(tela, this.fonte(14).render('MÁX', ER.ouro), xv + int(60 * u), meio - fvv.altura / 2 + int(2 * u));
      }
      // botão "+"
      const bs = Math.min(int(32 * u), r[3] - int(4 * u));
      const rb = [r[0] + r[2] - bs - int(4 * u), meio - bs / 2, bs, bs];
      const pode = livre && !cheio && T.moedas >= T.custo_hab(tipo, k);
      pg.ret(tela, pode ? [58, 48, 30] : [30, 29, 26], rb);
      pg.ret(tela, pode ? ER.ouro : ER.bloq, rb, Math.max(1, int(u)));
      this._texto(tela, '+', this.fonte(24), pode ? ER.ouro : ER.bloq, [rb[0] + rb[2] / 2, rb[1] + rb[3] / 2 - u]);
      if (!cheio) {
        const fc = this.fonte(12, false), tc = String(T.custo_hab(tipo, k));
        pg.blit(tela, fc.render(tc, pode ? ER.texto : ER.bloq), rb[0] - fc.size(tc)[0] - int(8 * u), meio - fc.altura / 2);
      }
      alvos.push(['hab:' + tipo + ':' + k, rb]);
      alvos.push(['hab_m:' + k, r]);
      ya += linha_h;
    }
    // rodapé
    const yb = y + H - int(30 * u);
    this._filete(tela, x + pad, x + W - pad, yb - int(6 * u));
    this._texto(tela, 'Toque em + para melhorar   ·   Recarga menor = atira mais rápido', this.fonte(12, false), ER.apagado, [x + W / 2, yb + int(10 * u)]);
  }

  _obra_info(tipo) {
    // o que cada caixa de construção mostra
    const T = this.tropas;
    if (tipo === 'base') {
      const feitas = T.bases_feitas, max = C.MAX_BASES_EXTRA;
      return { nome: 'BASE', cor: [70, 150, 82], esc: [34, 98, 48], fundo: [232, 246, 234], preco: T.custo_base(),
        pode: T.pode_pagar('base'), cheio: feitas >= max,
        linhas: [`tropa/${T.tempo_tropa(T.bases.verde).toFixed(0)}s`, `${feitas}/${max} feitas`] };
    }
    if (tipo === 'torre') {
      const feitas = T.torres_de('verde'), max = C.MAX_TORRES;
      return { nome: 'TORRE', cor: [236, 128, 40], esc: [176, 84, 20], fundo: [255, 240, 222], preco: C.PF_TORRE, pf: true,
        pode: T.pode_pagar('torre'), cheio: feitas >= max, img: this._torre_icone,
        linhas: [`${C.TORRE_SERIE} granadas/${C.TORRE_CICLO}s`, `${feitas}/${max} torres`] };
    }
    const feitas = T.barricadas_de ? T.barricadas_de('verde') : 0, max = C.MAX_BARRICADAS;
    return { nome: 'BARRICADA', cor: [134, 96, 62], esc: [84, 56, 34], fundo: [244, 236, 226], preco: C.PF_BARRICADA, pf: true,
      pode: T.pode_pagar('barricada'), cheio: feitas >= max, img: this._barr_icone,
      linhas: ['barra o inimigo', `${feitas}/${max} postas`] };
  }

  _icone_base(tela, ix, iy, s, cor) {
    // galpãozinho de teto curvo (o mesmo da faixa antiga)
    pg.poligono(tela, cor, [[ix - 15 * s, iy], [ix - 15 * s, iy - 9 * s], [ix - 10 * s, iy - 18 * s], [ix, iy - 22 * s],
      [ix + 10 * s, iy - 18 * s], [ix + 15 * s, iy - 9 * s], [ix + 15 * s, iy]]);
    pg.ret(tela, C.JANELA, [int(ix - 5 * s), int(iy - 11 * s), int(10 * s), int(11 * s)]);
    pg.ret(tela, [255, 255, 255, 70], [int(ix - 13 * s), int(iy - 9 * s), int(26 * s), int(2 * s)]);
  }

  _caixa_obra(tela, tipo, r) {
    // CAIXA DE CONSTRUÇÃO (mesmo molde para base, torre e barricada):
    // faixa colorida com o nome e o preço, o desenho à esquerda, duas linhas
    // de informação e o botão embaixo (COMPRAR / faltam N / MÁXIMO / CANCELAR)
    if (!r) return;
    const u = this.u, T = this.tropas, I = this._obra_info(tipo);
    let [x, y, w, h] = r;
    const na_mao = this.carta_sel === tipo;
    const ativo = I.pode || na_mao;
    if (na_mao) y -= int(8 * u);
    const cor = ativo ? I.cor : CINZA;
    pg.ret(tela, [31, 41, 55, 60], [x + int(3 * u), y + int(5 * u), w, h], 0, int(12 * u));
    this._pilula(tela, [x, y, w, h], ativo ? I.fundo : FUNDO_APAGADO, null, 12);
    // faixa de cima
    const fh = Math.max(int(20 * u), Math.min(int(26 * u), Math.floor(h * 0.3)));
    this._pilula(tela, [x, y, w, fh], cor, null, 12);
    pg.ret(tela, cor, [x, y + fh - int(10 * u), w, int(10 * u)]);
    let f1 = this.fonte(14);
    const nome = na_mao ? 'ONDE?' : I.nome;
    if (f1.size(nome)[0] > w - int(40 * u)) f1 = this.fonte(12);
    pg.blit(tela, f1.render(nome, C.BRANCO), x + int(9 * u), int(y + fh / 2 - f1.altura / 2));
    // preço na moeda (canto da faixa)
    const pr = String(I.preco);
    const cr = Math.min(int(13 * u), Math.floor(fh * 0.55));
    const cx = int(x + w - cr - 5 * u), cy = int(y + fh / 2 + 1 * u);
    if (I.pf) {   // torre e barricada: preço em PARAFUSOS (selo escuro com o parafuso)
      const fp = this.fonte(12);
      const wp = fp.size(pr)[0] + int(26 * u), hp = Math.min(fh - int(6 * u), int(20 * u));
      const rp = [int(x + w - wp - 4 * u), int(y + fh / 2 - hp / 2), wp, hp];
      this._pilula(tela, rp, C.ESCURO);
      icones.parafuso(tela, rp[0] + int(10 * u), rp[1] + hp / 2, 6.5 * u);
      this._texto(tela, pr, fp, [214, 222, 232], [rp[0] + int(16 * u) + (wp - int(16 * u)) / 2, rp[1] + hp / 2]);
    } else {
      pg.circulo(tela, C.ESCURO, cx, cy, cr + int(2 * u));
      pg.circulo(tela, C.MOEDA_ESCURA, cx, cy, cr);
      pg.circulo(tela, C.MOEDA, cx, cy, int(cr * 0.8));
      this._texto(tela, pr, this.fonte(pr.length > 2 ? 10 : 12), C.ESCURO, [cx, cy]);
    }
    // botão embaixo
    const bh = Math.min(int(24 * u), Math.max(int(18 * u), Math.floor(h * 0.27)));
    const rb = [x + int(6 * u), y + h - bh - int(6 * u), w - int(12 * u), bh];
    // meio: desenho + linhas
    const my0 = y + fh + int(3 * u), my1 = rb[1] - int(3 * u), mh = my1 - my0;
    const iw_max = Math.min(Math.floor(w * 0.4), int(58 * u));
    if (mh > 8 * u) {
      if (tipo === 'base') {
        const s = Math.min(1, mh / (24 * u)) * u;
        this._icone_base(tela, x + int(6 * u) + iw_max / 2, my1 - 1 * u, s, ativo ? C.TIMES.verde.base : CINZA);
      } else if (I.img) {
        const [img] = I.img;
        const esc = Math.min(1, mh / img.height, iw_max / img.width);
        const iw = img.width * esc, ih = img.height * esc;
        if (!ativo) tela.globalAlpha = 0.45;
        tela.drawImage(img, int(x + int(6 * u) + iw_max / 2 - iw / 2), int(my1 - ih), int(iw), int(ih));
        tela.globalAlpha = 1;
      }
      const f2 = this.fonte(w < 120 * u ? 10 : 11, false);
      const linhas = na_mao ? (tipo === 'barricada' ? ['arraste e', 'confirme no V'] : ['toque no seu', 'território']) : I.linhas;
      const tx = x + int(8 * u) + iw_max;
      const lmax = x + w - tx - int(4 * u);
      let ty = my0 + Math.max(0, (mh - linhas.length * (f2.altura + 1)) / 2);
      for (const t of linhas) {
        if (ty + f2.altura > my1 + 2 * u) break;
        let im = f2.render(t, na_mao ? I.esc : (ativo ? C.ESCURO : CINZA));
        if (im.width > lmax) im = this.fonte(9, false).render(t, na_mao ? I.esc : (ativo ? C.ESCURO : CINZA));
        pg.blit(tela, im, int(tx), int(ty));
        ty += im.height + int(1 * u);
      }
    }
    const pode_btn = I.pode && !na_mao;
    this._pilula(tela, rb, pode_btn ? cor : FUNDO_APAGADO, ativo ? I.esc : CINZA, 8);
    const rot = na_mao ? 'CANCELAR' : (I.cheio ? 'MÁXIMO' : (I.pode ? 'COMPRAR' : 'faltam ' + Math.ceil(I.preco - (I.pf ? (T.parafusos ? T.parafusos.verde : 0) : T.moedas))));
    this._texto(tela, rot, this.fonte(rot.length > 8 ? 11 : 13), pode_btn ? C.BRANCO : C.ESCURO, [rb[0] + rb[2] / 2, rb[1] + rb[3] / 2]);
    pg.ret(tela, na_mao ? C.ESCURO : (ativo ? I.esc : CINZA), [x, y, w, h], Math.max(2, int((na_mao ? 4 : 3) * u)), int(12 * u));
  }

  _carta(tela, tipo, r) {
    const u = this.u, T = this.tropas, info = C.PELOTOES[tipo];
    const desbloqueada = T.carta_desbloqueada(tipo);
    const pode = T.carta_pronta(tipo);
    const na_mao = this.carta_sel === tipo;
    let [x, y, w, h] = r;
    if (na_mao) {   // carta na mão sobe um pouco
      y -= int(12 * u);
      r = [x, y, w, h];
    }
    const cab = int(26 * u);
    const verde = C.TIMES.verde;
    const cor_cab = pode ? verde.esq : CINZA;
    // corpo e cabeçalho
    this._pilula(tela, r, pode ? C.BRANCO : FUNDO_APAGADO, null, 10);
    this._pilula(tela, [x, y, w, cab], cor_cab, null, 10);
    pg.ret(tela, cor_cab, [x, y + Math.floor(cab / 2), w, cab - Math.floor(cab / 2)]);
    let f = this.fonte(17);
    if (f.size(info.nome)[0] > w - int(30 * u)) f = this.fonte(14);
    this._texto(tela, info.nome, f, C.BRANCO, [x + w / 2 + 9 * u, y + cab / 2]);

    // desenho da tropa
    const [img, x0, y0] = this._bonecos[tipo] || this._tanque_carta;
    const chao = y + cab + int(54 * u);
    const esc = 2.3 * u;
    let lugares;
    if (tipo === 'heli') {
      lugares = [];
      let hi = this._heli_carta[0];
      // Centralização por pixels efetivamente desenhados, não pela origem
      // geométrica do helicóptero (que pode ser assimétrica).
      let lim = limites_de(hi);
      const max_w = Math.max(1, int(w * 0.82)), max_h = Math.max(1, int(66 * u));
      const fator = Math.min(1.0, max_w / Math.max(1, lim.w), max_h / Math.max(1, lim.h));
      let lw = hi.width, lh = hi.height, k = 1;
      if (fator < 1.0) {
        lw = Math.max(1, int(hi.width * fator)); lh = Math.max(1, int(hi.height * fator));
        k = fator;
        lim = { centerx: 1 + Math.floor((lw - 2) / 2), centery: 1 + Math.floor((lh - 2) / 2) };
      }
      const centro_x = x + w / 2;
      const centro_y = y + cab + int(52 * u);
      tela.drawImage(hi, int(centro_x - lim.centerx), int(centro_y - lim.centery), lw, lh);
      // Hélices exclusivas da ilustração da carta, preservando o corpo.
      const rx = int(centro_x), ry = int(centro_y - 24 * u);
      const raio = int(Math.min(w * 0.29, 24 * u));
      pg.linha(tela, C.ESCURO, [rx - raio, ry], [rx + raio, ry], Math.max(1, int(2 * u)));
      pg.linha(tela, C.ESCURO, [rx, ry - int(raio * .32)], [rx, ry + int(raio * .32)], Math.max(1, int(2 * u)));
      pg.circulo(tela, C.JANELA, rx, ry, Math.max(2, int(3 * u)));
    } else if (tipo === 'tanque') {
      lugares = [];
      const ti = this._tanque_carta[0];
      let lim = limites_de(ti);
      const fator = Math.min(1.0, Math.max(1, w * .80) / Math.max(1, lim.w), Math.max(1, 65 * u) / Math.max(1, lim.h));
      let lw = ti.width, lh = ti.height;
      if (fator < 1) {
        lw = Math.max(1, int(ti.width * fator)); lh = Math.max(1, int(ti.height * fator));
        lim = { centerx: 1 + Math.floor((lw - 2) / 2), centery: 1 + Math.floor((lh - 2) / 2) };
      }
      tela.drawImage(ti, int(x + w / 2 - lim.centerx), int(y + cab + 52 * u - lim.centery), lw, lh);
    } else if (tipo === 'granada') {     // um lançador + foguinho
      lugares = [[-12, 0]];
      const fx = x + w / 2 + 20 * u, fy = chao, s = 1.5 * u;
      for (const [e, cor] of [[1.0, C.FOGO], [0.55, C.FOGO_CLARO]]) {
        pg.poligono(tela, cor, [[fx - 4.2 * s * e, fy], [fx - 3.4 * s * e, fy - 6 * s * e], [fx + 1 * s * e, fy - 13 * s * e],
          [fx + 3.4 * s * e, fy - 6 * s * e], [fx + 4.2 * s * e, fy], [fx, fy + 2 * s * e]]);
      }
    } else if (tipo === 'canhao') {    // a peça + um servente atrás
      lugares = [[-26, -6]];
      const [pimg, px0, py0] = this._peca;
      pg.blit(tela, pimg, int(x + w / 2 + 6 * u + px0 * 0.95 * u), int(chao - 4 * u + py0 * 0.95 * u));
    } else if (tipo === 'foguete') {
      lugares = [[-22, -5], [0, 0]];
    } else {                     // três fuzileiros em linha
      lugares = [[-22, -5], [0, 0], [22, -5]];
    }
    for (const [dx, dy] of lugares.slice().sort((a, b) => a[1] - b[1])) {
      pg.blit(tela, img, int(x + w / 2 + dx * u + x0 * esc), int(chao + dy * u + y0 * esc));
    }

    // descrição
    this._texto(tela, info.linha1, this.fonte(14), pode ? C.ESCURO : CINZA, [x + w / 2, y + h - 52 * u]);
    this._texto(tela, info.linha2, this.fonte(13, false), CINZA, [x + w / 2, y + h - 38 * u]);

    // barra: enche com as moedas até dar o custo
    // (fase 1: carta se paga em PARAFUSOS e chega em 1 minuto)
    const custo = C.PF_CARTA[tipo], tenho = T.parafusos ? T.parafusos.verde : 0;
    const lim = C.limite_mapa(tipo), no_mapa = T.vivos_tipo ? T.vivos_tipo('verde', tipo) : 0;
    const bx = x + int(8 * u), by = y + h - int(26 * u), bw = w - int(16 * u), bh = int(18 * u);
    pg.ret(tela, C.ESCURO, [bx - 2, by - 2, bw + 4, bh + 4]);
    pg.ret(tela, [201, 207, 219], [bx, by, bw, bh]);
    pg.ret(tela, pode ? verde.base : [150, 156, 168], [bx, by, Math.max(1, int(bw * Math.min(1.0, tenho / custo))), bh]);
    let rotulo;
    if (!desbloqueada) rotulo = 'QG N' + C.DESBLOQUEIO_CARTAS[tipo];
    else if (na_mao) rotulo = 'ONDE? (1 min)';
    else if (no_mapa >= lim) rotulo = `LIMITE ${lim}/${lim}`;
    else if (pode) rotulo = `JOGAR ${no_mapa}/${lim}`;
    else if (tenho >= custo) rotulo = 'SEM VAGAS';   // limite de soldados
    else rotulo = 'faltam ' + Math.ceil(custo - tenho);
    this._texto(tela, rotulo, this.fonte(15), pode ? C.BRANCO : C.ESCURO, [bx + bw / 2, by + bh / 2]);

    if (!desbloqueada) {
      this._texto(tela, 'BLOQUEADA', this.fonte(14), C.ESCURO, [x + w / 2, y + cab + 12 * u]);
    }

    // borda por cima de tudo (escura e grossa quando a carta está na mão)
    const rr = int(10 * u);
    const cor_b = na_mao ? C.ESCURO : (pode ? VERDE_ESCURO : CINZA);
    const esp = Math.max(2, int((na_mao ? 4 : pode ? 3 : 2) * u));
    pg.ret(tela, cor_b, r, esp, rr);

    // custo em moedas no canto, como a gota de elixir das cartas
    const cx = int(x + 13 * u), cy = int(y + 13 * u);
    pg.circulo(tela, C.ESCURO, cx, cy, int(17 * u));
    pg.circulo(tela, [112, 118, 130], cx, cy, int(14.5 * u));
    pg.circulo(tela, [196, 202, 212], cx, cy, int(11.5 * u));
    this._texto(tela, String(custo), this.fonte(custo >= 100 ? 14 : 17), C.ESCURO, [cx, cy]);
    icones.parafuso(tela, cx + int(13 * u), cy + int(12 * u), int(6 * u));   // o preço é em parafusos
  }

  selecionar_carta(tipo) {
    // Mantém a carta original e inicia seu recolhimento, sem alterar a loja.
    this.carta_sel = tipo;
    this.gaveta = null;
    this._carta_anim_inicio = performance.now();
    this._carta_anim_tipo = tipo;
    const achada = this.cartas.find(([k]) => k === tipo);
    this._carta_anim_origem = achada ? achada[1] : (this.r_obras && this.r_obras[tipo]) || this.r_base;
    this._carta_recolhida_rect = null;
  }

  limpar_carta() {
    this.carta_sel = null;
    this.fantasma = null;   // barricada que estava sendo posicionada
    this._carta_recolhida_rect = null;
    this._carta_anim_inicio = null;
  }

  _desenhar_carta_recolhida(tela) {
    const tipo = this.carta_sel;
    const achada = this.cartas.find(([k]) => k === tipo);
    const origem = this._carta_anim_origem || (achada ? achada[1] : (this.r_obras && this.r_obras[tipo]) || this.r_base);
    const [x, y, w, h] = origem;
    const duracao = 420.0;
    let t = Math.min(1.0, Math.max(0.0, (performance.now() - (this._carta_anim_inicio || 0)) / duracao));
    t = 1.0 - (1.0 - t) ** 3;
    const destino_w = Math.max(1, int(w * .5)), destino_h = Math.max(1, int(h * .5));
    // Próximo ao contador da onda, mas sem cobri-lo.
    const destino_x = int(8 * this.u);
    const destino_y = int(this.y_status + 35 * this.u);
    const atual_w = Math.max(1, Math.round(w + (destino_w - w) * t));
    const atual_h = Math.max(1, Math.round(h + (destino_h - h) * t));
    const atual_x = Math.round(x + (destino_x - x) * t);
    const atual_y = Math.round(y + (destino_y - y) * t);
    this._carta_recolhida_rect = [atual_x, atual_y, atual_w, atual_h];
    // Renderiza o desenho ORIGINAL da carta em superfície temporária.
    const cw = Math.max(1, int(w + 4 * this.u)), ch = Math.max(1, int(h + 4 * this.u));
    let camada = this._camada_carta;
    if (!camada || camada.canvas.width !== cw || camada.canvas.height !== ch) {
      camada = this._camada_carta = pg.superficie(cw, ch);
    } else {
      camada.clearRect(0, 0, cw, ch);
    }
    const anterior = this.carta_sel;
    this.carta_sel = null;  // evita o deslocamento da carta "na mão" na textura
    try {
      if (tipo === 'torre' || tipo === 'base' || tipo === 'barricada') {
        this._caixa_obra(camada, tipo, [0, 0, w, h]);
      } else {
        this._carta(camada, tipo, [0, 0, w, h]);
      }
    } finally {
      this.carta_sel = anterior;
    }
    tela.imageSmoothingEnabled = true;
    tela.imageSmoothingQuality = 'high';
    tela.drawImage(camada.canvas, 0, 0, w, h, atual_x, atual_y, atual_w, atual_h);
  }

  // ---------- toque ---------------------------------------------------
  clique(pos) {
    // ação do botão tocado; 'nada' = tocou na interface sem botão; null = fora dela
    if (this.carta_sel && this._carta_recolhida_rect && dentro(this._carta_recolhida_rect, pos)) return 'cancelar_carta';
    if (this.tropas.fim && this.tropas.pvp) {   // fim do PvP: curtir ou jogar de novo
      if (this.r_curtir && dentro(this.r_curtir, pos)) return 'curtir';
      return this.r_fim_pvp && dentro(this.r_fim_pvp, pos) ? 'reiniciar' : 'nada';
    }
    if (this.tropas.fim) return dentro(this.r_fim, pos) ? 'reiniciar' : 'nada';
    // tela de habilidades aberta: ela pega todos os toques
    if (this.gaveta === 'hab') {
      for (const [acao, r] of this._alvos_hab) {
        if (!dentro(r, pos)) continue;
        if (acao === 'fechar_hab') { this.gaveta = null; return 'nada'; }
        if (acao.startsWith('hab_tipo:')) { this.hab_tipo = acao.slice(9); return 'nada'; }
        if (acao.startsWith('hab_m:')) { this.hab_m = acao.slice(6); return 'nada'; }
        if (acao.startsWith('hab:')) { this.hab_m = acao.split(':')[2]; return acao; }
      }
      if (this.r_hab && !dentro(this.r_hab, pos)) this.gaveta = null;   // tocou fora: fecha
      return 'nada';
    }
    for (const [ident, r] of this.botoes) if (dentro(r, pos)) return ident;
    if (dentro(this.r_mini, pos)) return 'mini';
    if (!this.gaveta && !this.base_aberta && this.area_aberta < 0) {   // caixinha de aviso ou marcador "?"
      const p = this.avisos.clique(pos);
      if (p && p[2]) { this.base_aberta = p[2]; this.deck_sel = []; this.gaveta = null; this.area_aberta = -1; }   // abre a escolha do deck
      if (p) return 'ir:' + p[0].toFixed(1) + ',' + p[1].toFixed(1);
    }
    // fase 3: janela das melhorias da base
    if (this.ref_aberta) {   // fase 4: janela da refinaria
      if (!this.r_janela_ref || !dentro(this.r_janela_ref, pos)) { this.ref_aberta = false; return 'nada'; }   // toque fora fecha
      for (const [acao, r] of this._alvos_ref) {
        if (!dentro(r, pos)) continue;
        if (acao === 'ref_fechar') { this.ref_aberta = false; return 'nada'; }
        if (acao.startsWith('log_aba:')) { this.log_aba = acao.slice(8); return 'nada'; }
        if (acao.startsWith('cam_rota:')) {   // escolhe o caminhão e passa para o mapa
          const c = (this.tropas.caminhoes || []).filter(o => o.time === 'verde')[+acao.slice(9)];
          if (c) { this.tropas.cam_sel = c; this.cam_passo = 'de'; this.ref_aberta = false; }
          return 'nada';
        }
        if (acao.startsWith('cam_parar:')) {
          const c = (this.tropas.caminhoes || []).filter(o => o.time === 'verde')[+acao.slice(10)];
          return c ? 'cam_parar:' + c.id : 'nada';
        }
        return acao;   // ref:<item>: quem joga pede
      }
      return 'nada';
    }
    if (this.mb_aberta) {
      if (!this.r_janela_mb || !dentro(this.r_janela_mb, pos)) { this.mb_aberta = false; return 'nada'; }   // toque fora fecha
      for (const [acao, r] of this._alvos_mb) {
        if (!dentro(r, pos)) continue;
        if (acao === 'mb_fechar') { this.mb_aberta = false; return 'nada'; }
        return acao;   // mb:<melhoria>: quem joga compra
      }
      return 'nada';
    }
    // janela do campo de treino aberta
    if (this.area_aberta >= 0 && this.r_janela_treino && dentro(this.r_janela_treino, pos)) {
      for (const [acao, r] of this._alvos_treino) {
        if (!dentro(r, pos)) continue;
        if (acao === 'tr_fechar') { this.area_aberta = -1; return 'nada'; }
        if (acao.startsWith('tr_sel:')) {
          const sq = this._cand[+acao.slice(7)];
          if (sq) { this.treino_sel = sq; this.treino_qtd = sq.sold.length; }
          return 'nada';
        }
        if (acao.startsWith('tr_q:')) { this.treino_qtd += +acao.slice(5); return 'nada'; }
        if (acao === 'tr_tudo') { if (this.treino_sel) this.treino_qtd = this.treino_sel.sold.length; return 'nada'; }
        return acao;   // tr_enviar / tr_liberar / tr_selecionar: quem joga decide
      }
      return 'nada';
    }
    // janela da base aberta
    if (this.base_aberta && this.r_janela_base && dentro(this.r_janela_base, pos)) {
      for (const [acao, r] of this._alvos_base) {
        if (!dentro(r, pos)) continue;
        if (acao === 'fechar_base') { this.base_aberta = null; return 'nada'; }
        if (acao === 'mb_abrir') { this.base_aberta = null; this.mb_aberta = true; return 'nada'; }
        return acao;
      }
      return 'nada';
    }
    if (dentro(this.aba_cartas, pos)) {
      this.gaveta = this.gaveta === 'cartas' ? null : 'cartas';
      this.base_aberta = null;
      return 'nada';
    }
    if (this.aba_ref && !this.gaveta && !this.tropas.horda && dentro(this.aba_ref, pos)) {   // fase 4
      this.ref_aberta = !this.ref_aberta; this.mb_aberta = false; this.base_aberta = null; this.area_aberta = -1;
      return 'nada';
    }
    if (this.aba_mb && !this.gaveta && dentro(this.aba_mb, pos)) {   // fase 3
      this.mb_aberta = !this.mb_aberta; this.ref_aberta = false; this.base_aberta = null; this.area_aberta = -1;
      return 'nada';
    }
    if (dentro(this.aba_loja, pos)) {
      this.gaveta = this.gaveta === 'hab' ? null : 'hab';
      this.base_aberta = null;
      if (!this.tropas.carta_desbloqueada(this.hab_tipo)) this.hab_tipo = 'pelotao';
      return 'nada';
    }
    if (this.gaveta === 'cartas' && this.anim_gaveta > 0.62 && this.r_obras) {
      for (const k of ['base', 'torre', 'barricada']) if (dentro(this.r_obras[k], pos)) return 'carta:' + k;
    }
    for (const [tipo, r] of (this.gaveta === 'cartas' && this.anim_gaveta > 0.62 ? this.cartas : [])) {
      if (dentro(r, pos)) return 'carta:' + tipo;
    }
    if (dentro(this.r_titulo, pos) || dentro(this.r_moedas, pos) || (this.r_parafusos && dentro(this.r_parafusos, pos))) return 'nada';
    return null;
  }
}
