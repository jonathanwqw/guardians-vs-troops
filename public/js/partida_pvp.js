// partida_pvp.js — a BATALHA ENTRE JOGADORES, no aparelho.
//
// A partida de verdade roda no servidor (tropas_pvp.js). Aqui:
//   VistaPvP    guarda o que o servidor mandou e se comporta como o tropas.js
//               para a cena.js e a interface.js desenharem exatamente como
//               no jogo solo (soldados, tiros, explosões, cartas, loja...)
//   PartidaPvP  o laço da partida: os mesmos toques do main.js (arrastar,
//               pinça, roda, cartas, loja, QG), só que as ordens vão para o
//               servidor em vez de mexer nas regras direto
//
// Entre um retrato e outro (10 por segundo) as tropas andam suavemente da
// posição antiga para a nova; tiros, granadas, fumaça e explosões nascem de
// eventos e são animados aqui, do mesmo jeito que no tropas.js.
import * as C from './config.js';
import * as M from './mapa.js';
import * as pg from './pg.js';
import * as OP from './opcoes.js';
import { Interface } from './interface.js';
import { Efeitos } from './efeitos.js';
import { Esquadrao, Soldado, Traco, Granada, Obus, lugar_barricada, angulo_barricada } from './tropas.js';
import { _toast } from './menu.js';

const int = Math.trunc;
const TIMES = ['verde', 'vermelho'];
const TIPOS = C.ORDEM_CARTAS;
const _ESTADOS_CAM = ['parado', 'indo_carregar', 'carregando', 'indo_descarregar', 'descarregando', 'esperando'];
// sons gravados do ponto de vista do verde: o vermelho ouve o par trocado
const TROCA_VERMELHO = {
  destruida: 'destruida_amiga', destruida_amiga: 'destruida',
  pronta_amiga: 'pronta_inimiga', pronta_inimiga: 'pronta_amiga',
};
const EFEITOS_OK = new Set(['fumaca', 'disparo_tanque', 'explosao_tanque']);

function base_vazia(time, x, y, principal) {
  return {
    base: true, sold: [], time, x, y, principal,
    vida: principal ? C.VIDA_BASE : C.VIDA_BASE_EXTRA, vida_max: principal ? C.VIDA_BASE : C.VIDA_BASE_EXTRA,
    alt: principal && time === 'vermelho' ? 150 : 92, t_tropa: 0, tempo: C.BASE_TEMPO_TROPA, carta: 'pelotao', deck_base: 0, deck: null,
    o: { tipo: 'base', time, x, y, eixo: 'x' },
  };
}

export class VistaPvP {
  // o "tropas" do aparelho: o mesmo jeitão do tropas.js, preenchido pelo servidor.
  // Cada jogador se vê sempre VERDE, embaixo, atacando para cima. Quem é o
  // vermelho no servidor vê tudo girado meia-volta e com as cores trocadas
  // (virar = true): só muda o que aparece; as ordens voltam desviradas (P).
  constructor(lado, eu, oponente) {
    this.real = lado;                    // o lado de verdade no servidor
    this.virar = lado === 'vermelho';
    this.lado = 'verde';                 // o lado como aparece na tela
    this.k = this.virar ? -1 : 1;
    this.eu = eu;
    this.oponente = oponente;
    this.rodada = 0;
    this.limpar();
  }

  limpar() {
    this.esquadroes = [];
    this._sq = new Map();     // id -> Esquadrao
    this._s = new Map();      // id -> Soldado
    this.caidos = [];
    this.parafusos = { verde: 0, vermelho: 0 };   // o recurso das bases (só o meu vem do servidor)
    this.ganhos_pf = [];
    this.reparos = [];
    this.virada = 1;
    this.campo_invadido = { verde: [false, false, false], vermelho: [false, false, false] };
    this.tracos = [];
    this.granadas = [];
    this.obuses = [];
    this.foguetes = [];
    this.heli_granadas = [];
    this.tanque_tiros = [];
    this.explosoes = [];
    this.sopros = [];
    this.fogos = [];
    this.marcas = [];
    this.flutuantes = [];
    this.presos = []; this.fila_treino = { verde: [], vermelho: [] };   // fase 2
    { const z = { bvida: 0, tdano: 0, tvel: 0, tpf: 0 }; this.melh_base = { verde: z, vermelho: z }; }   // fase 3
    this.refinaria = { verde: [], vermelho: [] };   // fase 4
    this.caminhoes = [];   // fase 5
    this.pvp = true; this.modo = 'vale_tudo'; this.t_resta = null; this.placar = null;   // modo, relógio e placar
    this.resultado = null; this.curtiu = false;   // troféus no fim e o like no oponente
    this.desembarques = [];
    this.efeitos_tanque = new Efeitos();
    this.selecionado = null;
    this.fim = null;
    this.deu_ordem = false;
    this.moedas = C.MOEDAS_INICIAIS;
    this.nivel = {};
    for (const m of C.ORDEM_LOJA) this.nivel[m] = 0;
    this.nivel_qg = 0;
    this.bases_feitas = 0;
    this.hab_nivel = {};
    for (const tipo of TIPOS) {
      this.hab_nivel[tipo] = {};
      for (const m of C.ORDEM_HAB) this.hab_nivel[tipo][m] = 0;
    }
    this.soldados = 0;
    this.avanco = 0.0;
    this._bases = [base_vazia('vermelho', M.BASES.vermelho[0], M.BASES.vermelho[1], true),
      base_vazia('verde', M.BASES.verde[0], M.BASES.verde[1], true)];
    this.extras = [];
    this.torres = [];         // torres de defesa (as suas e as do oponente)
    this.barricadas = [];     // barricadas de arame farpado (as suas e as dele)
    this.zonas_fogo = [];     // círculos de fogo da bomba incendiária
    const minha = this._bases[this.lado === 'verde' ? 1 : 0];
    const dele = this._bases[this.lado === 'verde' ? 0 : 1];
    // a interface.js olha "bases.verde" como a base de quem joga
    this.bases = { verde: minha, vermelho: dele };
    this.minha_base = minha;
    this._a = 1.0;            // quanto já andou do retrato anterior para o atual (0..1)
    this._intervalo = 0.1;    // tempo médio entre retratos
    this._chegada = 0;
  }

  P(v) { return v * this.k; }                                     // tela <-> servidor (girar meia-volta)
  T(i) { return TIMES[this.virar ? 1 - i : i]; }                // time do servidor -> cor na tela
  D(d) { return this.virar ? (d + 2) % 4 : d; }                 // vista do soldado girada

  // ---------- o que a interface.js pergunta ----------------------------
  custo(m) { return int(C.MELHORIAS[m].custo * C.CUSTO_FATOR ** this.nivel[m] + 0.5); }
  custo_hab(tipo, m) { return C.custo_hab(m, this.hab_nivel[tipo][m]); }
  // treino de tropa (o servidor manda o campo e o nível de cada tropa)
  ocupante_treino(time, n) {
    for (const sq of this.esquadroes) if (sq.time === time && sq.treino === n && sq.sold.length) return sq;
    return null;
  }
  pode_treinar(sq) {
    return !!sq && C.TREINO_TIPOS.includes(sq.tipo) && sq.sold.length > 0 && !sq.treinando && sq.treino < 0 &&
      !(sq.nivel_treino >= C.TREINO_MAX);   // 2V não volta para o treino
  }
  drop_vivos(time, tipo) { return this._drop ? this._drop[TIPOS.indexOf(tipo)] || 0 : 0; }
  carta_vivos(time, tipo) { return this._cartas_vivas ? this._cartas_vivas[TIPOS.indexOf(tipo)] || 0 : 0; }
  limite_carta() { return C.LIMITE_CARTA; }
  limite_drop(time, tipo) { return C.limite_drop(tipo, this.nivel_qg); }
  limite_soldados() { return C.LIMITE_INICIAL + this.nivel_qg * C.LIMITE_POR_NIVEL; }
  custo_qg() { return int(C.CUSTO_QG * 1.65 ** this.nivel_qg); }
  carta_desbloqueada(tipo) { return (tipo in C.PELOTOES) && this.nivel_qg >= C.DESBLOQUEIO_CARTAS[tipo]; }
  deck_ocupado(b, tipo) {
    for (const o of this.todas_bases()) if (o !== b && o.time === b.time && o.deck && o.deck.includes(tipo)) return o;
    return null;
  }
  vivos_tipo(time, tipo) { return this._vivos_tipo ? this._vivos_tipo[TIPOS.indexOf(tipo)] || 0 : 0; }
  limite_mapa(tipo) { return C.limite_mapa(tipo); }
  pode_soltar(b) { return !!b && (b.principal || !!b.deck_base || !!b.inicial); }
  caminhoes_de(time) { return this.caminhoes.filter(c => c.time === time).length; }
  pode_comprar_caminhao(time) { return !this.fim && this.caminhoes_de('verde') < C.MAX_CAMINHOES && this.moedas >= C.CUSTO_CAMINHAO; }
  // fase 4: refinaria (o servidor confere o pedido)
  pode_ref(time, item) {
    const r = C.REFINARIA[item], qg = this._bases.find(b => b.time === 'verde');
    return !!r && !this.fim && this.refinaria.verde.length < C.REF_FILA && this.parafusos.verde >= r.pf &&
      (!r.polvora || (qg && qg.estoque && qg.estoque.polvora >= r.polvora));
  }
  // fase 3: melhorias da base (o servidor confere a compra)
  custo_mb(time, m) { const n = this.melh_base.verde[m]; return n >= C.MELH_BASE_MAX ? Infinity : C.MELHORIAS_BASE[m].custos[n]; }
  pode_mb(time, m) { return !this.fim && this.melh_base.verde[m] < C.MELH_BASE_MAX && this.moedas >= this.custo_mb(time, m); }
  tempo_treino(time) { return C.TREINO_TEMPO * (1 - C.MELHORIAS_BASE.tvel.passo * this.melh_base.verde.tvel); }
  ganho_treino(time) { return C.PARAFUSO_GANHO + C.MELHORIAS_BASE.tpf.passo * this.melh_base.verde.tpf; }
  carta_pronta(tipo) {
    return (this.carta_desbloqueada(tipo) && this.parafusos.verde >= C.PF_CARTA[tipo] &&
      this.soldados + C.vagas(tipo) <= this.limite_soldados() &&
      this.vivos_tipo('verde', tipo) < C.limite_mapa(tipo));
  }
  custo_base() { return int(C.CUSTO_BASE * C.CUSTO_BASE_FATOR ** this.bases_feitas + 0.5); }
  torres_de(time) { let n = 0; for (const o of this.torres) if (o.time === time) n++; return n; }
  custo_torre() { return C.PF_TORRE; }   // em parafusos
  fator_virada(t) { return t === 'verde' ? this.virada : 1; }
  barricadas_de(time) { let n = 0; for (const o of this.barricadas) if (o.time === time) n++; return n; }
  lugar_barricada(time, x, y) { return lugar_barricada(this, time, x, y); }
  angulo_barricada(time, x, y) { return angulo_barricada(this, time, x, y); }
  pode_pagar(tipo) {
    if (tipo === 'torre') return this.parafusos.verde >= C.PF_TORRE && this.torres_de('verde') < C.MAX_TORRES;
    if (tipo === 'barricada') return this.parafusos.verde >= C.PF_BARRICADA && this.barricadas_de('verde') < C.MAX_BARRICADAS;
    if (tipo === 'base') {
      return this.moedas >= this.custo_base() && this.bases_feitas < C.MAX_BASES_EXTRA;
    }
    return this.carta_pronta(tipo);
  }
  tempo_tropa(b) { return b.tempo || C.BASE_TEMPO_TROPA; }
  _soldados() { return this.soldados; }
  todas_bases() { return this._bases.concat(this.extras); }
  status_onda() {
    if (this.oponente_saiu) return [`${this.oponente} saiu da batalha`, true];
    return [`Você vs ${this.oponente}`, false];
  }

  // ---------- retrato do servidor --------------------------------------
  aplicar(q, som) {
    // devolve true se a linha de frente mudou (precisa redesenhar o terreno)
    let reinicio = false;
    if (q.r !== this.rodada) {   // revanche: começa do zero
      if (this.rodada) reinicio = true;
      this.rodada = q.r;
      const op = this.oponente_saiu;
      this.limpar();
      this.oponente_saiu = op;
    }
    const agora = performance.now() / 1000;
    if (this._chegada) {
      const d = agora - this._chegada;
      this._intervalo += (Math.min(0.3, Math.max(0.05, d)) - this._intervalo) * 0.2;
    }
    this._chegada = agora;
    this._a = 0.0;

    this.moedas = q.eco.m;
    this.nivel = q.eco.n;
    if (q.eco.mb) this.melh_base = { verde: q.eco.mb, vermelho: q.eco.mb };   // fase 3 (só a sua vem)
    { const rf = (q.eco.rf || []).map(o => ({ item: C.ITENS[o[0]], t: o[1] })); this.refinaria = { verde: rf, vermelho: rf }; }   // fase 4
    this.nivel_qg = q.eco.q;
    this.bases_feitas = q.eco.b;
    if (q.eco.h) this.hab_nivel = q.eco.h;
    this._drop = q.eco.d || null;
    this._cartas_vivas = q.eco.c || null;
    this._vivos_tipo = q.eco.v || null;
    this.parafusos.verde = q.eco.pf || 0;
    this.virada = q.eco.vr || 1;
    this.campo_invadido.verde = (q.eco.ci || [0, 0, 0]).map(v => !!v);
    this.soldados = q.s;
    const av = q.av * this.k;   // girado, a frente anda para o outro lado
    const mudou_frente = av !== this.avanco;
    this.avanco = av;
    if (q.fim && !this.fim) som.tocar(q.fim === 'empate' ? 'menu_voltar' : q.fim);
    this.fim = q.fim;
    this.modo = q.modo || 'vale_tudo';          // modo da partida
    this.t_resta = q.tl ?? null;                 // segundos que faltam (15 min)
    this.placar = q.pl || null;                  // [minhas bases de pé, as dele, % do meu QG, % do QG dele]

    // bases: as duas principais sempre nas posições 0 e 1, depois as extras
    const extras = [];
    q.bases.forEach((b, i) => {
      const time = this.T(b[0]);
      const bx = this.P(b[1]), by = this.P(b[2]);
      let o;
      if (i < 2) {
        o = this._bases.find(e => e.time === time);
        o.x = bx; o.y = by;
        o.alt = b[0] === 1 ? 150 : 92;   // o QG (prédio alto) é sempre o do vermelho do servidor
      } else {
        o = this.extras.find(e => e.x === bx && e.y === by && e.time === time) || base_vazia(time, bx, by, false);
        extras.push(o);
      }
      o.vida = b[3]; o.vida_max = b[4]; o.t_tropa = b[6]; o.tempo = b[7];
      o.carta = TIPOS[b[8]] || 'pelotao';
      o.deck_base = b[9] || 0;
      o.falta_pf = b[11] || 0;
      if (Array.isArray(b[12])) { o.estoque = o.estoque || {}; C.ITENS.forEach((k, j) => { o.estoque[k] = b[12][j]; }); } else o.estoque = null;   // fase 4
      o.inicial = !!b[13];
      if (Array.isArray(b[10])) o.deck = b[10].map(k => TIPOS[k]);
      else if (!o._deck_local) o.deck = null;   // (o que eu acabei de escolher vale até o servidor confirmar)
      if (Array.isArray(b[10])) o._deck_local = false;
    });
    this.extras = extras;
    // círculos de fogo (só desenho aqui; quem queima é o servidor)
    this.zonas_fogo = (q.zf || []).map(d => ({ x: this.P(d[0]), y: this.P(d[1]), r: d[2], t: d[3], dur: d[4] }));
    // fase 5: caminhões (o mesmo objeto por id, para a seleção não se perder)
    { const vivos = new Map(this.caminhoes.map(c => [c.id, c]));
      this.caminhoes = (q.cam || []).map(d => {
        const c = vivos.get(d[0]) || { id: d[0], base: true, caminhao: true, sold: [], x: this.P(d[2]), y: this.P(d[3]), carga: {} };
        c.time = this.T(d[1]); c._bx = this.P(d[2]); c._by = this.P(d[3]); c.hx = this.P(d[4]); c.hy = this.P(d[5]);
        c.vida = d[6]; c.vida_max = d[7]; c.carga_total = d[8]; c.estado = _ESTADOS_CAM[d[9]] || 'parado';
        const acha = (p) => p ? this.todas_bases().find(b => Math.abs(b.x - this.P(p[0])) < 0.3 && Math.abs(b.y - this.P(p[1])) < 0.3) || null : null;
        c.de = acha(d[10]); c.para = acha(d[11]);
        return c;
      }); }
    this.presos = (q.pr || []).map(d => ({ time: this.T(d[0]), tipo: TIPOS[d[1]], x: this.P(d[2]), y: this.P(d[3]), t: d[4], n: d[5] }));   // fase 2
    { const f = new Array(q.ft || 0).fill(null); this.fila_treino = { verde: f, vermelho: f }; }   // (só a sua fila vem; vale para o lado de quem joga)
    // torres de defesa
    const tor = q.tor || [];
    for (let i = 0; i < tor.length; i++) {
      const d = tor[i];
      const o = this.torres[i] || (this.torres[i] = { time: 'verde', x: 0, y: 0, hx: 0, hy: 0, recuo: 0, idade: 0, vida: 1, vida_max: 1 });
      o.time = this.T(d[0]); o.x = this.P(d[1]); o.y = this.P(d[2]);
      o.hx = this.P(d[3]); o.hy = this.P(d[4]); o.recuo = d[5]; o.idade = d[6];
      o.vida = d[7] ?? 1; o.vida_max = d[8] ?? 1;
    }
    this.torres.length = tor.length;
    // barricadas (o desenho é simétrico em meia volta: o ângulo vale dos dois lados)
    const bar = q.bar || [];
    for (let i = 0; i < bar.length; i++) {
      const d = bar[i];
      const o = this.barricadas[i] || (this.barricadas[i] = { time: 'verde', x: 0, y: 0, ang: 0, vida: 1, vida_max: 1, barreira: true, base: true });
      o.time = this.T(d[0]); o.x = this.P(d[1]); o.y = this.P(d[2]); o.ang = d[3];
      o.vida = d[4]; o.vida_max = d[5]; o.id = d[6];
    }
    this.barricadas.length = bar.length;

    // eventos: o que nasceu desde o retrato anterior
    for (const e of q.ev) this._evento(e, som);

    // tropas e soldados
    const vistos = new Set();
    const lista = [];
    for (const d of q.esq) {
      const [id, ti, tp, x0, y0, hx0, hy0, vida, vida_max, cols, movendo, recuo, treinando, destino, sold, excl, nv_tr, n_tr, t_tr, chega, mun] = d;
      const x = this.P(x0), y = this.P(y0), hx = this.P(hx0), hy = this.P(hy0);
      let sq = this._sq.get(id);
      const novo = !sq;
      if (novo) {
        sq = new Esquadrao(this.T(ti), x, y, TIPOS[tp]);
        sq.id = id;
        sq.ia = false;
        this._sq.set(id, sq);
      }
      sq._ax = novo ? x : sq.x; sq._ay = novo ? y : sq.y;
      sq._bx = x; sq._by = y;
      sq._ahx = novo ? hx : sq.hx; sq._ahy = novo ? hy : sq.hy;
      sq._bhx = hx; sq._bhy = hy;
      sq.vida = vida; sq.vida_max = vida_max; sq.cols = cols;
      sq.exclusa = !!excl;
      sq.nivel_treino = nv_tr || 0; sq.treino = n_tr === undefined ? -1 : n_tr; sq.t_treino = t_tr || 0;
      sq.movendo = !!movendo; sq.recuo = recuo; sq.treinando = treinando; sq.chega = chega || 0; sq.mun = mun === undefined ? 1 : mun;
      sq.destino = destino ? [this.P(destino[0]), this.P(destino[1])] : null;
      const nova = [];
      for (let k = 0; k < sold.length; k += 4) {
        const sid = sold[k], sx = this.P(sold[k + 1] / 100), sy = this.P(sold[k + 2] / 100), pk = sold[k + 3];
        let s = this._s.get(sid);
        if (!s) {
          s = new Soldado(sx, sy, sq.time, sq.tipo);
          s._ax = sx; s._ay = sy;
          this._s.set(sid, s);
        } else {
          s._ax = s.x; s._ay = s.y;
        }
        s.tipo = sq.tipo;
        s._bx = sx; s._by = sy;
        s.dir = this.D(pk & 3);
        s.andando = (pk & 4) !== 0;
        if (pk & 8) s.tiro = 1.0;
        vistos.add(sid);
        nova.push(s);
      }
      sq.sold = nova;
      lista.push(sq);
    }
    const na_lista = new Set(lista);
    for (const [id, sq] of this._sq) if (!na_lista.has(sq)) this._sq.delete(id);
    for (const sid of this._s.keys()) if (!vistos.has(sid)) this._s.delete(sid);
    this.esquadroes = lista;
    if (this.selecionado && !this._sq.has(this.selecionado.id)) this.selecionado = null;
    return mudou_frente || reinicio;
  }

  _evento(e, som) {
    const tipo = e[0];
    const P = (v) => (v === null ? null : this.P(v));
    if (tipo === 'so') {
      let nome = e[1];
      if (!e[5] && this.real === 'vermelho' && TROCA_VERMELHO[nome]) nome = TROCA_VERMELHO[nome];
      som.tocar(nome, P(e[2]), P(e[3]), e[4]);
    } else if (tipo === 'tr') {
      const tr = new Traco(P(e[1]), P(e[2]), P(e[3]), P(e[4]), null, 0, e[5], e[6]);
      tr.t = e[7];
      this.tracos.push(tr);
    } else if (tipo === 'gr') {
      const g = new Granada(P(e[1]), P(e[2]), P(e[3]), P(e[4]), null, 0, e[6] || 0.5);
      g.t = e[5];
      this.granadas.push(g);
    } else if (tipo === 'ob') {
      const o = new Obus(P(e[1]), P(e[2]), P(e[3]), P(e[4]), null, null, 0);
      o.t = e[5];
      this.obuses.push(o);
    } else if (tipo === 'fo') {
      this.foguetes.push({ x0: P(e[1]), y0: P(e[2]), x1: P(e[3]), y1: P(e[4]), dur: e[5], t: e[6] });
    } else if (tipo === 'hg') {
      this.heli_granadas.push({ x0: P(e[1]), y0: P(e[2]), x1: P(e[3]), y1: P(e[4]), dur: e[5], t: e[6] });
    } else if (tipo === 'tt') {
      this.tanque_tiros.push({ x0: P(e[1]), y0: P(e[2]), x1: P(e[3]), y1: P(e[4]), dur: e[5], t: e[6] });
    } else if (tipo === 'ex') {
      this.explosoes.push([P(e[1]), P(e[2]), e[5], e[3], e[4]]);
    } else if (tipo === 'sp') {
      this.sopros.push([P(e[1]), P(e[2]), e[3], e[4]]);
    } else if (tipo === 'fg') {
      this.fogos.push([P(e[1]), P(e[2]), e[3], e[4], e[5], e[6]]);
    } else if (tipo === 'mc') {
      this.marcas.push([P(e[1]), P(e[2]), e[3]]);
    } else if (tipo === 'fl') {
      this.flutuantes.push([P(e[1]), P(e[2]), e[3], e[4]]);
    } else if (tipo === 'de') {
      // a escada fica presa ao helicóptero (a cena procura pela posição dele)
      const d = [P(e[1]), P(e[2]), e[3]];
      let melhor = null, md = 1.5;
      for (const sq of this.esquadroes) {
        if (sq.tipo !== 'heli') continue;
        const dd = Math.hypot(sq._bx - d[0], sq._by - d[1]);
        if (dd < md) { md = dd; melhor = sq; }
      }
      d._sq = melhor;
      this.desembarques.push(d);
    } else if (tipo === 'ca') {
      // soldado caindo: sai de onde ele estava sendo desenhado
      let s = this._s.get(e[1]);
      if (!s) {
        s = new Soldado(P(e[2]), P(e[3]), this.T(e[4]), TIPOS[e[5]]);
      }
      this._s.delete(e[1]);
      s.dir = this.D(e[6]);
      s.caindo = e[7];
      s.andando = false;
      s.tiro = 0;
      this.caidos.push(s);
    } else if (tipo === 'ef' && EFEITOS_OK.has(e[1])) {
      const a = e[2].slice();
      if (this.virar) {   // fumaça e clarão do tanque, girados junto
        if (e[1] === 'fumaca') {
          a[0] = -a[0]; a[1] = -a[1];
          if (a[3] && typeof a[3] === 'object') a[3] = Object.assign({}, a[3], { vx: -(a[3].vx || 0), vy: -(a[3].vy || 0) });
        } else if (e[1] === 'disparo_tanque') {
          for (const i of [0, 1, 2, 3]) a[i] = -a[i];
          a[5] = a[5] + Math.PI;
        } else {
          a[0] = -a[0]; a[1] = -a[1];
        }
      }
      this.efeitos_tanque[e[1]](...a);
    }
  }

  // ---------- animação entre retratos (o mesmo ritmo do tropas.js) -----
  atualizar(dt) {
    this._a = Math.min(1.0, this._a + dt / this._intervalo);
    const a = this._a;
    for (const sq of this.esquadroes) {
      sq.x = sq._ax + (sq._bx - sq._ax) * a;
      sq.y = sq._ay + (sq._by - sq._ay) * a;
      const hx = sq._ahx + (sq._bhx - sq._ahx) * a, hy = sq._ahy + (sq._bhy - sq._ahy) * a;
      const l = Math.hypot(hx, hy) || 1.0;
      sq.hx = hx / l; sq.hy = hy / l;
      for (const s of sq.sold) {
        s.x = s._ax + (s._bx - s._ax) * a;
        s.y = s._ay + (s._by - s._ay) * a;
        if (s.andando) s.fase += dt * 13;
        if (s.tiro > 0) s.tiro = Math.max(0.0, s.tiro - dt * 5);
      }
    }
    this.efeitos_tanque.atualizar(dt);
    for (const s of this.caidos) s.caindo += dt / (1.0 / 9.0);
    this.caidos = this.caidos.filter(s => s.caindo < 1);
    for (const tr of this.tracos) tr.t += dt / tr.dur;
    this.tracos = this.tracos.filter(tr => tr.t < 1);
    for (const g of this.granadas) g.t += dt / g.dur;
    this.granadas = this.granadas.filter(g => g.t < 1);
    for (const o of this.obuses) o.t += dt / o.dur;
    this.obuses = this.obuses.filter(o => o.t < 1);
    for (const lista of [this.foguetes, this.heli_granadas, this.tanque_tiros]) for (const f of lista) f.t += dt / f.dur;
    this.foguetes = this.foguetes.filter(f => f.t < 1);
    this.heli_granadas = this.heli_granadas.filter(f => f.t < 1);
    this.tanque_tiros = this.tanque_tiros.filter(f => f.t < 1);
    for (const d of this.desembarques) {
      d[2] += dt;
      if (d._sq) { d[0] = d._sq.x; d[1] = d._sq.y; }
    }
    this.desembarques = this.desembarques.filter(d => d[2] < 1.1);
    for (const e of this.explosoes) e[2] += dt / 0.5;
    this.explosoes = this.explosoes.filter(e => e[2] < 1);
    for (const f of this.fogos) f[2] += dt;
    this.fogos = this.fogos.filter(f => f[2] < f[3]);
    for (const m of this.marcas) m[2] += dt / 9.0;
    this.marcas = this.marcas.filter(m => m[2] < 1);
    for (const sp of this.sopros) sp[3] += dt / 0.28;
    this.sopros = this.sopros.filter(sp => sp[3] < 1);
    for (const f of this.flutuantes) f[3] += dt / 1.6;
    for (const c of this.caminhoes) { const k = Math.min(1, dt * 8); c.x += (c._bx - c.x) * k; c.y += (c._by - c.y) * k; }   // fase 5: caminhão suave
    this.flutuantes = this.flutuantes.filter(f => f[3] < 1);
  }

  tocar_local(wx, wy, som) {
    // a parte de SELECIONAR do Tropas.tocar roda aqui (resposta na hora);
    // a ORDEM vai para o servidor. Devolve a ordem a mandar, ou null.
    if (this.fim) return null;
    let perto = null, md = Infinity;
    for (const sq of this.esquadroes) {
      if (!sq.sold.length) continue;
      const d2 = (sq.x - wx) ** 2 + (sq.y - wy) ** 2;
      if (d2 < (sq.raio() + 0.4) ** 2 && d2 < md) { md = d2; perto = sq; }
    }
    const sel = this.selecionado;
    if (perto && perto.time === this.lado && (sel === null || perto === sel)) {
      this.selecionado = sel === perto ? null : perto;
      som.tocar(this.selecionado ? 'selecionar' : 'desselecionar');
      return null;
    }
    if (sel === null) return null;
    if (perto && perto.time === this.lado && (perto.tipo !== sel.tipo || perto.exclusa || sel.exclusa)) {
      this.selecionado = perto;   // classes diferentes (ou tropa de base destruída) não se fundem
      som.tocar('selecionar');
      return null;
    }
    this.deu_ordem = true;
    this.selecionado = null;
    som.tocar('ordem');
    return { c: 'ordem', id: sel.id, x: this.P(wx), y: this.P(wy) };
  }
}

export class PartidaPvP {
  // usa a MESMA câmera e a MESMA cena da partida solo (o terreno grande é
  // desenhado uma vez só); no fim devolve tudo como estava
  constructor(app, partida) {
    this.app = app;
    this.p = partida;
  }

  _redesenhar_terreno(so_frente = false) {
    // só o chão (e árvores/prédios quando o mapa gira): os sprites das tropas
    // não dependem do mapa, então não são refeitos (era isso que travava)
    const cena = this.p.cena;
    if (so_frente) cena.redesenhar_frente();
    else cena.preparar_mapa();
    cena._donos = new Map();
    cena._donos_v = new Map();
    cena._tiles = new Map();
  }

  async rodar(info) {
    // devolve 'menu' ou 'sair'
    const app = this.app, rede = app.rede, som = app.som, cam = this.p.cam, cena = this.p.cena;
    const lado = info.lado;
    const outro = lado === 'verde' ? info.sala.vermelho : info.sala.verde;
    const vista = new VistaPvP(lado, rede.eu ? rede.eu.nome : '', outro.nome);
    const ui = new Interface(vista);
    ui.avisos.som = som;
    ui.som_ligado = som.ligado && som.ok;
    const antes = [cam.x, cam.y];
    let mexeu_terreno = false;
    const ajustar = () => {
      if (cam.vw !== app.vw || cam.vh !== app.vh || cena.zoom !== cam.zoom) {
        cam.ajustar(app.vw, app.vh);
        this.p.ui.organizar(cam.vw, cam.vh);
        if (cena.zoom !== cam.zoom) cena.preparar(cam.zoom); else this._redesenhar_terreno();
      }
      ui.organizar(cam.vw, cam.vh);
    };
    const olhar_minha_base = () => {
      cam.x = 0.0; cam.y = 1000.0;   // a sua base fica sempre embaixo
      cam.prender();
    };
    const avanco_antes = M.AVANCO_FRENTE;
    M.definir_avanco(0.0);
    if (avanco_antes !== 0.0) mexeu_terreno = true;
    if (vista.virar && !M.VIRADO) {   // lado vermelho: o mapa gira meia-volta só na tela
      M.virar();
      mexeu_terreno = true;
    }
    ajustar();
    if (mexeu_terreno) this._redesenhar_terreno();
    olhar_minha_base();
    som.tocar('inicio');

    let tempo = 0.0;
    let arrastando = false, toque = null;
    let arr_fantasma = null;   // barricada sendo arrastada (folga entre o dedo e o centro)
    const dedos = new Map();
    let fps_txt = '', fps_t = 0.0;
    let toast = null;
    let desistir_ate = 0;   // toque em Menu duas vezes para sair no meio
    const avisar = (txt) => { toast = [txt, 3.2]; };
    const mandar = (m) => { m.t = 'cmd'; rede.enviar(m); };
    const sair = (motivo) => {
      rede.enviar({ t: 'partida_sair' });
      rede.partida = null;
      rede.sala = null;
      rede.fotos = [];
      return motivo;
    };

    try {
      for (;;) {
        const dt = await app.tick();
        tempo += dt;

        // conexão: se caiu, o religador (conexao.js) tenta voltar para a MESMA
        // batalha sozinho; a tela segue com o aviso por cima. Desistiu: menu.
        const sem_rede = rede.estado !== 'ligado' || !rede.eu;
        if (sem_rede && !rede.reconectando) {
          som.tocar('erro');
          return 'menu';
        }
        if (!sem_rede && rede.partida_confirmar && Date.now() > rede.partida_confirmar) {   // voltou, mas a batalha já tinha acabado
          rede.partida_confirmar = 0; rede.partida = null;
          rede.avisos.push(['A batalha acabou enquanto você estava fora.', 'menu_voltar']);
          return 'menu';
        }
        this._reconectando = sem_rede ? rede.texto_conexao : null;
        if (rede.resultado && vista.resultado !== rede.resultado) vista.resultado = rede.resultado;   // troféus do fim
        // retratos do servidor
        while (rede.fotos.length) {
          const q = rede.fotos.shift();
          const r0 = vista.rodada;
          if (vista.aplicar(q, som)) {
            M.definir_avanco(vista.avanco);
            this._redesenhar_terreno(true);
            ui.organizar(cam.vw, cam.vh);
            mexeu_terreno = true;
          }
          if (r0 && r0 !== vista.rodada) {   // revanche
            vista.resultado = null; vista.curtiu = false; rede.resultado = null;
            ui.limpar_carta();
            ui.base_aberta = null;
            ui.gaveta = null;
            olhar_minha_base();
          }
        }
        vista.oponente_saiu = rede.oponente_saiu;
        while (rede.avisos.length) {
          const [txt, nome_som] = rede.avisos.shift();
          if (txt) avisar(txt);
          if (nome_som) som.tocar(nome_som);
        }

        for (const ev of app.eventos()) {
          if (ev.type === 'QUIT') return sair('sair');
          if (ev.type === 'KEYDOWN' && ev.key === 'escape') {
            if (vista.fim || performance.now() < desistir_ate) {
              som.tocar('menu_voltar');
              return sair('menu');
            }
            desistir_ate = performance.now() + 3000;
            avisar('Toque em Menu de novo para desistir da batalha.');
            som.tocar('erro');
          } else if (ev.type === 'VIDEORESIZE') {
            ajustar();
          } else if (ev.type === 'MOUSEBUTTONDOWN' && ev.button === 1 && ui.fantasma && (() => {
            // V: manda construir; X: desiste; perto da barricada: começa a arrastar
            const pos = ev.pos, f = ui.fantasma;
            const dentro = (r) => r && pos[0] >= r[0] && pos[0] <= r[0] + r[2] && pos[1] >= r[1] && pos[1] <= r[1] + r[3];
            if (dentro(cena.r_fantasma_ok)) {
              if (f.valido) {
                mandar({ c: 'barricada', x: vista.P(f.x), y: vista.P(f.y), ang: f.ang });
                vista.deu_ordem = true;
                ui.limpar_carta();
                som.tocar('ordem');
              } else som.tocar('erro');
              return true;
            }
            if (dentro(cena.r_fantasma_x)) { ui.limpar_carta(); som.tocar('carta_solta'); return true; }
            const [wx, wy] = cam.mundo(pos[0], pos[1]);
            if (Math.hypot(wx - f.x, wy - f.y) < 2.4) { arr_fantasma = [f.x - wx, f.y - wy]; return true; }
            return false;
          })()) {
            // tratado acima
          } else if (ev.type === 'MOUSEBUTTONDOWN' && ev.button === 1) {
            { const r1 = ui.r_moedas, r2 = ui.r_parafusos, pp = ev.pos, na = (r) => r && pp[0] >= r[0] && pp[0] <= r[0] + r[2] && pp[1] >= r[1] && pp[1] <= r[1] + r[3]; if (na(r1) || na(r2)) this.p.painel.toque_recursos(); }   // 3 toques: painel
            const acao = ui.clique(ev.pos);
            if (acao === null) {
              arrastando = true; toque = ev.pos;
            } else if (acao === 'menu') {
              if (vista.fim || performance.now() < desistir_ate) {
                som.tocar('menu_voltar');
                return sair('menu');
              }
              desistir_ate = performance.now() + 3000;
              avisar('Toque em Menu de novo para desistir da batalha.');
              som.tocar('erro');
            } else if (acao.startsWith('ir:')) {   // aviso / "?": leva a câmera até a tropa
              const [px, py] = acao.slice(3).split(',').map(Number);
              cam.x = px; cam.y = py;
              cam.prender();
              som.tocar('clique');
            } else if (acao === 'mini') {
              [cam.x, cam.y] = ui.mini_para_cena(ev.pos);
              cam.prender();
              som.tocar('clique');
            } else if (acao === 'som') {
              ui.som_ligado = som.alternar() && som.ok;
              app.op.efeitos = som.ligado;
              OP.salvar(app.pasta, app.op);
              som.tocar('clique');
            } else if (acao === 'mapa') {
              ui.depurar = !ui.depurar;
              som.tocar('clique');
            } else if (acao === 'pausa') {   // a batalha é dos dois: não dá para pausar
              avisar('Não dá para pausar uma batalha entre jogadores.');
              som.tocar('erro');
            } else if (acao === 'cancelar_carta') {
              ui.limpar_carta();
            } else if (acao.startsWith('carta:')) {
              const tipo = acao.slice(6);
              ui.gps_base = null;
              if (!vista.pode_pagar(tipo)) {
                ui.limpar_carta();
                som.tocar('erro');
              } else {
                if (ui.carta_sel === tipo) ui.limpar_carta(); else ui.selecionar_carta(tipo);
                som.tocar(ui.carta_sel ? 'carta_pega' : 'carta_solta');
                if (ui.carta_sel === 'barricada') {   // aparece no meio da tela, pronta para arrastar
                  const [wx, wy] = cam.mundo(cam.vw / 2, cam.vh / 2);
                  ui.fantasma = { x: wx, y: wy, ang: 0, valido: false };
                }
              }
            } else if (acao.startsWith('compra:')) {
              mandar({ c: 'compra', m: acao.slice(7) });
            } else if (acao.startsWith('hab:')) {
              const [, tipo, m] = acao.split(':');
              mandar({ c: 'hab', tipo, m });
            } else if (acao.startsWith('deck_sel:')) {   // escolhendo o deck da base 2/3
              som.tocar(ui.alternar_deck(acao.slice(9)) ? 'carta_pega' : 'erro');
            } else if (acao === 'deck_ok') {             // confirma o deck (o servidor confere)
              const b = ui.base_aberta;
              if (b && b.deck_base && !b.deck && ui.deck_sel && ui.deck_sel.length === 3) {
                b.deck = ui.deck_sel.slice(); b._deck_local = true;   // mostra na hora
                b.carta = b.deck.find(k => vista.carta_desbloqueada(k)) || b.deck[0];
                mandar({ c: 'deck', x: vista.P(b.x), y: vista.P(b.y), cartas: b.deck });
                ui.deck_sel = [];
                som.tocar('compra');
              } else som.tocar('erro');
            } else if (acao === 'cam_comprar') {          // fase 5: caminhão novo (o servidor confere)
              if (vista.pode_comprar_caminhao('verde')) { mandar({ c: 'cam_comprar' }); som.tocar('construir'); } else som.tocar('erro');
            } else if (acao.startsWith('cam_parar:')) {
              mandar({ c: 'cam', id: +acao.slice(10), p: 'parar', x: 0, y: 0 });
            } else if (acao.startsWith('ref:')) {         // fase 4: refinaria (o servidor confere)
              if (vista.pode_ref('verde', acao.slice(4))) { mandar({ c: 'ref', m: acao.slice(4) }); som.tocar('compra'); } else som.tocar('erro');
            } else if (acao.startsWith('mb:')) {          // fase 3: melhoria da base (o servidor confere)
              if (vista.pode_mb('verde', acao.slice(3))) { mandar({ c: 'mb', m: acao.slice(3) }); som.tocar('compra'); } else som.tocar('erro');
            } else if (acao === 'gps') {                  // GPS da base: o próximo toque no mapa marca o ponto
              ui.gps_base = ui.base_aberta; ui.base_aberta = null; ui.limpar_carta();
              som.tocar('carta_pega');
            } else if (acao.startsWith('base_carta:')) {
              const b = ui.base_aberta, tipo = acao.slice(11);
              if (b && vista.carta_desbloqueada(tipo) && (!b.deck_base || (b.deck && b.deck.includes(tipo)))) {
                b.carta = tipo;   // mostra na hora; o servidor confirma no próximo retrato
                mandar({ c: 'base_carta', x: vista.P(b.x), y: vista.P(b.y), tipo });
              } else {
                som.tocar('erro');
              }
            } else if (acao === 'tr_enviar') {
              const sq = ui.treino_sel;
              if (sq && sq.id !== undefined) {
                mandar({ c: 'treino', a: ui.area_aberta, id: sq.id, q: ui.treino_qtd });
                ui.area_aberta = -1;
              } else {
                som.tocar('erro');
              }
            } else if (acao === 'tr_liberar') {
              mandar({ c: 'treino_sair', a: ui.area_aberta });
            } else if (acao === 'tr_selecionar') {
              const oc = vista.ocupante_treino('verde', ui.area_aberta);
              if (oc) { vista.selecionado = oc; som.tocar('selecionar'); }
              ui.area_aberta = -1;
            } else if (acao === 'melhorar_qg') {
              mandar({ c: 'qg' });
            } else if (acao === 'curtir') {             // like no oponente (uma vez por partida)
              if (!vista.curtiu) { rede.enviar({ t: 'curtir' }); vista.curtiu = true; som.tocar('compra'); }
            } else if (acao === 'reiniciar') {
              if (vista.oponente_saiu) {
                som.tocar('menu_voltar');
                return sair('menu');
              }
              mandar({ c: 'revanche' });
              som.tocar('clique');
            }
          } else if (ev.type === 'MOUSEMOTION' && arr_fantasma && ui.fantasma) {
            const [wx, wy] = cam.mundo(ev.pos[0], ev.pos[1]);   // a barricada segue o dedo
            ui.fantasma.x = wx + arr_fantasma[0]; ui.fantasma.y = wy + arr_fantasma[1];
          } else if (ev.type === 'MOUSEBUTTONUP' && ev.button === 1 && arr_fantasma) {
            arr_fantasma = null;
          } else if (ev.type === 'MOUSEMOTION' && arrastando && dedos.size < 2) {
            if (toque && Math.abs(ev.pos[0] - toque[0]) + Math.abs(ev.pos[1] - toque[1]) > 10 * ui.u) toque = null;
            if (toque === null) cam.mover(ev.rel[0], ev.rel[1]);
          } else if (ev.type === 'MOUSEBUTTONUP' && ev.button === 1) {
            if (arrastando && toque && dedos.size < 2) {
              const [wx, wy] = cam.mundo(ev.pos[0], ev.pos[1]);
              if (vista.cam_sel) {                           // fase 5: caminhão: base de carga, depois de descarga
                const bc = vista.todas_bases().find(b => b.time === 'verde' && b.vida > 0 && Math.hypot(b.x - wx, b.y - wy) < 4);
                const cs = vista.cam_sel;
                if (bc) {
                  const papel = ui.cam_passo === 'para' ? 'para' : 'de';
                  if (papel === 'para' && cs.de === bc) som.tocar('erro');
                  else {
                    mandar({ c: 'cam', id: cs.id, p: papel, x: vista.P(bc.x), y: vista.P(bc.y) });
                    if (papel === 'de') { cs.de = bc; ui.cam_passo = 'para'; } else { cs.para = bc; vista.cam_sel = null; ui.cam_passo = null; }
                    som.tocar('ordem');
                  }
                } else { vista.cam_sel = null; ui.cam_passo = null; }
              } else if (ui.gps_base) {                             // GPS: ponto de reunião (o servidor confere)
                const gb = ui.gps_base;
                gb.reuniao = [wx, wy];
                mandar({ c: 'gps', x: vista.P(gb.x), y: vista.P(gb.y), px: vista.P(wx), py: vista.P(wy) });
                som.tocar('ordem');
                ui.gps_base = null;
              } else if (ui.carta_sel === 'barricada' && ui.fantasma) {   // toque no mapa: a barricada vai para lá
                ui.fantasma.x = wx; ui.fantasma.y = wy;
                som.tocar('clique');
              } else if (ui.carta_sel === 'torre') {
                mandar({ c: 'torre', x: vista.P(wx), y: vista.P(wy) });
                vista.deu_ordem = true;
                ui.limpar_carta();
              } else if (ui.carta_sel === 'base') {
                mandar({ c: 'base', x: vista.P(wx), y: vista.P(wy) });
                vista.deu_ordem = true;
                ui.limpar_carta();
              } else if (ui.carta_sel) {
                mandar({ c: 'carta', tipo: ui.carta_sel, x: vista.P(wx), y: vista.P(wy) });
                vista.deu_ordem = true;
                ui.limpar_carta();
              } else if (vista.caminhoes.some(c => c.time === 'verde' && Math.hypot(c.x - wx, c.y - wy) < 1.8)) {
                vista.cam_sel = vista.caminhoes.find(c => c.time === 'verde' && Math.hypot(c.x - wx, c.y - wy) < 1.8);   // fase 5
                ui.cam_passo = 'de'; ui.base_aberta = null; ui.area_aberta = -1;
                som.tocar('menu_clique');
              } else {
                const base = vista.todas_bases().find(b => b.time === 'verde' && b.vida > 0 &&
                  Math.sqrt((b.x - wx) ** 2 + (b.y - wy) ** 2) < 4);
                const area = M.area_em('verde', wx, wy);
                const na_tropa = vista.esquadroes.some(q => q.time === 'verde' && q.sold.length &&
                  (q.x - wx) ** 2 + (q.y - wy) ** 2 < (q.raio() + 0.4) ** 2);
                if (base) {
                  ui.abrir_base(base);
                } else if (area && !na_tropa) {
                  ui.base_aberta = null;
                  ui.abrir_treino(area.n, vista.selecionado);
                  vista.selecionado = null;
                  som.tocar('menu_clique');
                } else {
                  ui.base_aberta = null;
                  ui.area_aberta = -1;
                  const ordem = vista.tocar_local(wx, wy, som);
                  if (ordem) mandar(ordem);
                }
              }
            }
            arrastando = false; toque = null;
          } else if (ev.type === 'FINGERDOWN') {
            dedos.set(ev.finger_id, 1);   // zoom fixo: dois dedos só cancelam o toque
            if (dedos.size >= 2) toque = null;
          } else if (ev.type === 'FINGERUP') {
            dedos.delete(ev.finger_id);
          }
        }

        vista.atualizar(dt);
        som.ambiente(dt, this.p.mastros, this.p.radar);
        if (toast) { toast[1] -= dt; if (toast[1] <= 0) toast = null; }

        const tela = app.tela;
        cena.mostrar_alcance = ui.carta_sel === 'torre';   // anel do alcance das suas torres
        if (ui.fantasma && ui.carta_sel !== 'barricada') ui.fantasma = null;
        if (ui.fantasma) {   // barricada na mão: ângulo automático e se dá para pôr ali
          const f = ui.fantasma;
          f.ang = vista.angulo_barricada('verde', f.x, f.y);
          f.valido = vista.lugar_barricada('verde', f.x, f.y) && vista.pode_pagar('barricada');
        }
        cena.fantasma = ui.fantasma || null;
        // desempenho (os mesmos módulos do jogo solo): orçamento, painel e qualidade
        const P = this.p, painel = P.painel;
        if (P.agenda) P.agenda.inicio_quadro();
        painel.inicio('desenho');
        cena.desenhar(tela, cam, vista, tempo, ui.depurar, ui.carta_sel !== null);
        painel.fim('desenho');
        painel.inicio('interface');
        ui.desenhar(tela, cam);
        painel.fim('interface');
        const fachada = this._fachada || (this._fachada = { app, cena, passo: { passos_quadro: 0 } });
        fachada.ui = ui; fachada.tropas = vista; fachada.qualidade = P.qualidade; fachada._tamanho = ajustar;
        P.qualidade.quadro(dt, fachada);
        painel.desenhar(tela, fachada);
        if (app.op.fps) {
          fps_t -= dt;
          if (fps_t <= 0) { fps_t = 0.5; fps_txt = 'FPS ' + int(app.janela.get_fps() + 0.5); }
          const img = app.texto_grosso(fps_txt, 20 * ui.u, C.BRANCO, 2);
          pg.blit(tela, img, int(8 * ui.u), int(ui.y_status + 36 * ui.u));
        }
        if (toast) _toast(app, tela, toast[0], toast[1], vista.fim ? 0.07 : 0.3);
        if (this._reconectando) {   // aviso da reconexão por cima de tudo
          tela.fillStyle = pg.css([31, 41, 55, 120]); tela.fillRect(0, 0, app.vw, app.vh);
          _toast(app, tela, this._reconectando, 1.0, 0.45);
        }   // no fim vai para o alto da tela (não cobre a caixa)
      }
    } finally {
      // devolve a câmera e o terreno do jogo solo como estavam
      M.definir_avanco(avanco_antes);
      if (M.VIRADO) M.virar();   // o mapa volta ao normal para o jogo solo e o menu
      if (mexeu_terreno) {
        this._redesenhar_terreno();
        this.p.ui.organizar(cam.vw, cam.vh);
      }
      cam.x = antes[0]; cam.y = antes[1];
      cam.prender();
    }
  }
}
