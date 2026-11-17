// tropas_pvp.js — as regras da BATALHA ENTRE JOGADORES.
//
// Roda no SERVIDOR (server.js). É o mesmo tropas.js do jogo solo, com o lado
// vermelho também nas mãos de um jogador:
//   * sem IA e sem ondas: cada jogador joga cartas, compra melhorias, sobe o QG
//     e constrói bases, cada um com as suas moedas
//   * as bases dos dois geram pelotões do mesmo jeito (como as suas no solo)
//   * derrubar tropa ou base do outro dá moedas, para os dois lados:
//     cada tropa vale o custo da carta dela + 10% (proporcional ao tamanho)
//   * +1 moeda sozinha a cada meio segundo para cada jogador
//   * cada base solta a carta que o dono escolheu para ela (das desbloqueadas
//     no nível do QG), 2x mais rápido que o tempo normal
//   * habilidades (dano, vida, velocidade, cadência) por tipo de tropa
//   * subir o QG empurra a linha de frente para o lado do outro
//   * vence quem destruir o QG / a base principal do outro
//
// Gravador: no lugar do som, grava tudo o que acontece (sons, tiros, explosões,
// fumaça do tanque) para o servidor mandar aos dois aparelhos.
// foto(lado): o retrato do jogo que vai para cada jogador, ~10 vezes por segundo.
import * as C from './config.js';
import * as M from './mapa.js';
import { Tropas, outro } from './tropas.js';
import { de_uv, limitar, hip } from './iso.js';

export const INICIO_VERMELHO = [de_uv(-7, -60), de_uv(7, -60)];
export const TIPOS = C.ORDEM_CARTAS;
const _ESTADOS_CAM = ['parado', 'indo_carregar', 'carregando', 'indo_descarregar', 'descarregando', 'esperando'];
const _SO_VERDE = new Set(['alarme', 'base_fraca', 'sob_ataque']);
const _FORA = new Set(['vitoria', 'derrota', 'inicio', 'carta_pronta', 'corneta_inimiga', 'contagem', 'preparo']);
const R1 = (v) => Math.round(v * 10) / 10;
const R2 = (v) => Math.round(v * 100) / 100;
const R3 = (v) => Math.round(v * 1000) / 1000;
const ti = (time) => (time === 'verde' ? 0 : 1);

export class Gravador {
  // faz o papel do som.js no servidor: grava os sons (com o mesmo limite de
  // repetição do jogo) para os aparelhos tocarem
  constructor(limites, grupos) {
    this.ev = [];
    this.limites = limites || {};
    this.grupos = grupos || {};
    this.relogio = 0.0;
    this._ultimo = {};
    this.ligado = true;
  }

  _livre(nome, para) {
    const g = this.grupos[nome] || nome;
    const l = this.limites[g];
    if (!l) return true;
    const k = g + '|' + (para || '');
    if (this.relogio - (this._ultimo[k] ?? -1e9) < l) return false;
    this._ultimo[k] = this.relogio;
    return true;
  }

  tocar(nome, x = null, y = null, vol = 1.0) {
    if (_FORA.has(nome)) return;
    const para = (x === null && _SO_VERDE.has(nome)) ? 'verde' : null;
    if (!this._livre(nome, para)) return;
    this.ev.push(['so', nome, x === null ? null : R2(x), y === null ? null : R2(y), R2(vol), para]);
  }

  para(time, nome, x = null, y = null, vol = 1.0) {
    // som só para um dos jogadores (comprou, errou, ganhou moeda...)
    if (!this._livre(nome, time)) return;
    this.ev.push(['so', nome, x === null ? null : R2(x), y === null ? null : R2(y), R2(vol), time]);
  }

  ambiente() {}
  alternar() { return false; }
}

class EfeitosGravados {
  // a fumaça e o clarão do tanque: grava a chamada; o aparelho faz as partículas
  constructor(ev) {
    this.ev = ev;
    this.particulas = [];
    this.claroes = [];
  }

  atualizar() {}
  fumaca(...a) { this.ev.push(['ef', 'fumaca', a.map(v => (typeof v === 'number' ? R3(v) : v))]); }
  disparo_tanque(...a) { this.ev.push(['ef', 'disparo_tanque', a.map(R3)]); }
  explosao_tanque(...a) { this.ev.push(['ef', 'explosao_tanque', a.map(R3)]); }
}

export class TropasPvP extends Tropas {
  constructor(gravador) {
    super(gravador);
  }

  iniciar() {
    this._prox = 1;     // ids das tropas
    this.t_partida = 0; this.como_fim = null; this.margem_fim = 0;   // relógio dos 15 min (o modo vem do servidor)
    this._prox_s = 1;   // ids dos soldados
    super.iniciar();
    this._marcar_decks(['vermelho']);   // no PvP os dois jogadores escolhem deck (o verde já foi)
    this.efeitos_tanque = new EfeitosGravados(this.som.ev);
    this.eco = { verde: this._eco(), vermelho: this._eco() };
    this.avanco = 0.0;
    this.t_renda = 0.0;
    M.definir_avanco(0.0);
    // o vermelho também começa com duas tropas perto do QG
    for (const [x, y] of INICIO_VERMELHO) this._organizar(this._criar('vermelho', x, y, 40), true);
    this.rodada = (this.rodada || 0) + 1;
  }

  _eco() {
    const nivel = {};
    for (const m of C.ORDEM_LOJA) nivel[m] = 0;
    const hab = {};
    for (const tipo of C.ORDEM_CARTAS) {
      hab[tipo] = {};
      for (const m of C.ORDEM_HAB) hab[tipo][m] = 0;
    }
    return { moedas: C.MOEDAS_INICIAIS, nivel, nivel_qg: 0, bases_feitas: 0, hab };
  }

  aplicar_avanco() {
    // a linha de frente é guardada no mapa.js (um valor só): cada sala põe o dela
    M.definir_avanco(this.avanco);
  }

  _criar(time, x, y, n, tipo = 'pelotao') {
    const sq = super._criar(time, x, y, n, tipo);
    sq.id = this._prox++;
    sq.valor = this._valor(tipo, n);   // moedas que a tropa custou (vira prêmio de quem derrubar)
    sq.ia = false;   // os dois lados são jogadores
    return sq;
  }

  _valor(tipo, n) {
    // custo da carta, proporcional ao nº de soldados (40 fuzileiros = 1 carta de Pelotão)
    const p = C.PELOTOES[tipo];
    return p.custo * n / p.soldados;
  }

  _fundir(sq, amigo) {
    const ok = this.esquadroes.includes(sq) && this.esquadroes.includes(amigo) && sq !== amigo &&
      this._pode_fundir(sq, amigo);
    const v = sq.valor || 0;
    super._fundir(sq, amigo);
    if (ok) amigo.valor = (amigo.valor || 0) + v;   // tropa fundida vale a soma
  }

  // ---------- MODO e RELÓGIO da partida (15 min) ----------
  bases_tres(t) {
    // as 3 bases que contam no SOBREVIVENTE: o QG e as bases 2 e 3 do começo
    const lista = [this.bases[t]];
    for (const b of this.extras) if (b.time === t && b.inicial) lista.push(b);
    return lista;
  }
  _placar(t) {
    const tres = this.bases_tres(t);
    const de_pe = tres.filter(b => b.vida > 0).length;
    const vida = tres.reduce((s, b) => s + Math.max(0, b.vida) / b.vida_max, 0) / tres.length;
    const qg = Math.max(0, this.bases[t].vida) / this.bases[t].vida_max;
    return { de_pe, vida, qg };
  }
  _fim_do_tempo() {
    // acabou o relógio: decide pelo modo (o 'verde' do servidor é a referência de this.fim)
    const v = this._placar('verde'), r = this._placar('vermelho');
    let dif, margem;
    if (this.modo_pvp === 'sobrevivente') {
      dif = v.de_pe - r.de_pe;
      if (!dif) dif = Math.abs(v.vida - r.vida) < 0.005 ? 0 : v.vida - r.vida;
      margem = Math.abs(v.de_pe - r.de_pe) / 3 + Math.abs(v.vida - r.vida) * 0.5;
    } else {
      dif = Math.abs(v.qg - r.qg) < 0.005 ? 0 : v.qg - r.qg;
      margem = Math.abs(v.qg - r.qg);
    }
    this.fim = dif > 0 ? 'vitoria' : dif < 0 ? 'derrota' : 'empate';
    this.como_fim = 'tempo';
    this.margem_fim = margem;
  }

  atualizar(dt) {
    if (!this.fim) {
      this.t_partida = (this.t_partida || 0) + dt;
      if (this.t_partida >= (this.duracao || C.PVP_DURACAO)) { this._fim_do_tempo(); super.atualizar(dt); return; }
    }
    if (!this.fim) {
      // renda automática: 1 moeda a cada meio segundo, para os dois
      this.t_renda += dt;
      while (this.t_renda >= C.PVP_RENDA_INTERVALO - 1e-9) {
        this.t_renda -= C.PVP_RENDA_INTERVALO;
        for (const t of ['verde', 'vermelho']) {   // só até o teto
          const e = this.eco[t];
          if (e.moedas < C.PVP_RENDA_TETO) e.moedas = Math.min(C.PVP_RENDA_TETO, e.moedas + 1);
        }
      }
    }
    super.atualizar(dt);
  }

  // ---------- o que o jogo solo faz pela IA: aqui não existe ----------
  _ia() {}
  carta_pronta() { return false; }

  // ---------- os dois lados ganham e produzem igual -----------------
  _premio_tropa(sq) {
    // quem derrubou ganha o custo da tropa + 10%
    const ganha = outro(sq.time);
    const premio = Math.max(1, Math.round((sq.valor || 0) * C.PVP_PREMIO_FATOR * C.PREMIO_ABATE_FATOR * this.fator_virada(ganha)));   // a metade (+ virada)
    this.eco[ganha].moedas += premio;
    const f = [sq.x, sq.y, '+' + premio, 0.0];
    f._para = ganha;
    this.flutuantes.push(f);
    this.som.para(ganha, 'moeda');
  }

  moedas_de(t) { return this.eco[t].moedas; }
  _dar_moedas(t, v) { this.eco[t].moedas += v; }

  _vaga_desembarque(time, n) {
    return Math.min(n, Math.max(0, this.limite(time) - this._soldados(time)));
  }

  _ferir(alvo, dano, perto = null, origem = null, arma = 'tiro') {
    // os avisos de "sob ataque" do jogo solo são só do verde: o vermelho ganha os dele
    if (alvo.vida > 0 && alvo.time === 'vermelho') {
      if (alvo.torre) { /* torre: sem alarme */ }
      else if (alvo.base) this.som.para('vermelho', alvo.vida - dano < alvo.vida_max * 0.3 ? 'base_fraca' : 'alarme');
      else this.som.para('vermelho', 'sob_ataque');
    }
    super._ferir(alvo, dano, perto, origem, arma);
  }

  tempo_tropa(b) {
    // no multiplayer as bases soltam cartas 2x mais rápido
    return super.tempo_tropa(b) / C.PVP_BASE_VELOCIDADE;
  }

  _produzir(b) {
    // a base solta de graça, à frente dela, a carta que o dono escolheu para ela
    // (se ainda não estiver desbloqueada no nível do QG, solta pelotão)
    const t = b.time;
    const tipo = this._tipo_da_base(b, k => this.desbloqueada(t, k));
    if (!tipo) return false;   // base 2/3 sem deck (ou deck só com cartas bloqueadas)
    if (!this.pode_soltar(b)) return false;   // base construída depois não solta tropa
    if (this.vivos_tipo(t, tipo) >= C.limite_mapa(tipo)) { b.falta_pf = 0; return false; }   // limite do mapa
    const n = C.PELOTOES[tipo].soldados;
    if (this._soldados(t) + C.vagas(tipo) > this.limite(t)) return false;
    if (this.drop_vivos(t, tipo) >= this.limite_drop(t, tipo)) { b.falta_pf = 0; return false; }   // limite de tropas da base
    const d = t === 'verde' ? -0.7071 : 0.7071;
    let lugar = null;
    for (const k of [0, 1, -1, 2, -2]) {
      const x = b.x + d * 5 + 0.7071 * k * 4.6, y = b.y + d * 5 - 0.7071 * k * 4.6;
      if (!this.esquadroes.some(q => q.time === t && hip(q.x - x, q.y - y) < 3.2)) {
        lugar = [x, y];
        break;
      }
    }
    if (!lugar) return false;
    if (!this._pagar_parafusos(b, tipo)) return false;   // só paga quando a tropa vai sair mesmo (sem parafusos: espera com "?")
    const sq = this._criar(t, lugar[0], lugar[1], 0, tipo);
    sq.da_base = true;
    sq.base_origem = b;   // GPS: quando terminar de sair, vai para o ponto de reunião
    sq.hx = d; sq.hy = d;
    sq.porta = [b.x + d * 2.2, b.y + d * 2.2];
    sq.treinando = n;
    sq.vida_max = n * this.hp(t, tipo);
    sq.valor = this._valor(tipo, n);
    return true;
  }

  _atualizar_bases(dt) {
    for (const b of this.todas_bases()) {
      if (b.vida <= 0) continue;
      const tempo = this.tempo_tropa(b);
      b.t_tropa = Math.min(tempo, b.t_tropa + dt);
      if (b.t_tropa >= tempo && this._produzir(b)) b.t_tropa = 0.0;
      // renda da base: 35 moedas por minuto para o dono
      b.t_moeda += dt;
      if (b.t_moeda >= C.BASE_TEMPO_MOEDAS) {
        b.t_moeda -= C.BASE_TEMPO_MOEDAS;
        const e = this.eco[b.time];
        const ganho = Math.max(0, Math.min(C.BASE_MOEDAS, C.BASE_MOEDAS_TETO - e.moedas));   // só até 1000
        if (ganho <= 0) continue;
        e.moedas += ganho;
        const f = [b.x, b.y, '+' + Math.round(ganho), 0.0];
        f._para = b.time;
        this.flutuantes.push(f);
        this.som.para(b.time, 'moeda');
      }
    }
    for (const b of this.extras.filter(b => b.vida <= 0)) {
      this.extras.splice(this.extras.indexOf(b), 1);
      this.explosoes.push([b.x, b.y, 0.0, Math.random() * 6.28, 1.6]);
      this.marcas.push([b.x, b.y, 0.0]);
      this.som.tocar('base_destruida', b.x, b.y, 0.7);
      this._tropa_da_base(b);   // saem 200 fuzileiros de quem destruiu
      const ganha = outro(b.time);
      this.eco[ganha].moedas += C.PREMIO_BASE;
      const f = [b.x, b.y, '+' + C.PREMIO_BASE, 0.0];
      f._para = ganha;
      this.flutuantes.push(f);
      this.som.para(ganha, 'moeda');
    }
  }

  // ---------- comandos de cada jogador ------------------------------
  _lim_soldados(t) { return this.limite(t); }

  // fase 5: ordens de caminhão vindas do jogador (a base é achada pela posição)
  caminhao_t(t, id, papel, x, y) {
    const c = this.caminhoes.find(o => o.id === id && o.time === t);
    if (!c) return false;
    if (papel === 'parar') return this.ordem_caminhao(c, 'parar', null);
    let b = null, md = 1.5;
    for (const o of this.todas_bases()) { if (o.time !== t) continue; const d = Math.hypot(o.x - x, o.y - y); if (d < md) { md = d; b = o; } }
    return this.ordem_caminhao(c, papel, b);
  }   // fase 2: a conta de vaga do resgate e da fila

  limite(t) {
    return C.LIMITE_INICIAL + this.eco[t].nivel_qg * C.LIMITE_POR_NIVEL;
  }

  custo_m(t, m) {
    return Math.trunc(C.MELHORIAS[m].custo * C.CUSTO_FATOR ** this.eco[t].nivel[m] + 0.5);
  }

  comprar_m(t, m) {
    const e = this.eco[t];
    if (m !== 'prod') return false;   // dano/vida/vel/cad agora são habilidades por tropa (comprar_hab_t)
    if (this.fim || e.nivel[m] >= C.NIVEL_MAX || e.moedas < this.custo_m(t, m)) {
      this.som.para(t, 'erro');
      return false;
    }
    e.moedas -= this.custo_m(t, m);
    e.nivel[m] += 1;
    if (e.nivel[m] >= C.NIVEL_MAX) this.som.para(t, 'nivel_max');
    const n = e.nivel[m], passo = C.MELHORIAS[m].passo, mv = this.mult[t];
    const antes = mv[m];
    mv[m] = (m === 'cad' || m === 'prod') ? (1 - passo) ** n : 1 + passo * n;
    if (m === 'vida') {
      for (const sq of this.esquadroes) {
        if (sq.time === t) {
          sq.vida *= mv.vida / antes;
          sq.vida_max *= mv.vida / antes;
        }
      }
    }
    this.som.para(t, 'compra');
    return true;
  }

  custo_qg_t(t) {
    return Math.trunc(C.CUSTO_QG * 1.65 ** this.eco[t].nivel_qg);
  }

  melhorar_qg_t(t) {
    const e = this.eco[t];
    if (this.fim || e.nivel_qg >= C.NIVEL_QG_MAX || e.moedas < this.custo_qg_t(t)) {
      this.som.para(t, 'erro');
      return false;
    }
    e.moedas -= this.custo_qg_t(t);
    e.nivel_qg += 1;
    // cada nível empurra a fronteira 10% para o lado do outro (os dois se anulam)
    this.avanco = (this.eco.verde.nivel_qg - this.eco.vermelho.nivel_qg) * (C.CENA_U * 0.10);
    M.definir_avanco(this.avanco);
    this.som.para(t, 'compra');
    return true;
  }

  _nivel_qg_de(t) { return this.eco[t].nivel_qg; }

  comprar_hab_t(t, tipo, m) {
    const e = this.eco[t], nv = e.hab[tipo];
    if (this.fim || !nv || !(m in nv) || !this.desbloqueada(t, tipo) || nv[m] >= C.NIVEL_MAX ||
      e.moedas < C.custo_hab(m, nv[m])) {
      this.som.para(t, 'erro');
      return false;
    }
    e.moedas -= C.custo_hab(m, nv[m]);
    nv[m] += 1;
    this._aplicar_hab(t, tipo, m, nv[m]);
    this.som.para(t, nv[m] >= C.NIVEL_MAX ? 'nivel_max' : 'compra');
    return true;
  }

  escolher_carta_t(t, x, y, tipo) {
    // a base de t mais perto de (x, y) passa a soltar 'tipo'
    let b = null, md = 3.0;
    for (const o of this.todas_bases()) {
      if (o.time !== t || o.vida <= 0) continue;
      const d = hip(o.x - x, o.y - y);
      if (d < md) { md = d; b = o; }
    }
    if (!b || !(tipo in C.PELOTOES) || !this.desbloqueada(t, tipo) || (b.deck_base && !(b.deck && b.deck.includes(tipo)))) {
      this.som.para(t, 'erro');
      return false;
    }
    b.carta = tipo;
    this.som.para(t, 'carta_pega');
    return true;
  }

  deck_t(t, x, y, cartas) {
    // o jogador t escolhe (uma vez só) o deck da base dele mais perto de (x, y)
    let b = null, md = 3.0;
    for (const o of this.todas_bases()) {
      if (o.time !== t || o.vida <= 0) continue;
      const d = hip(o.x - x, o.y - y);
      if (d < md) { md = d; b = o; }
    }
    if (!this._deck_valido(b, cartas)) { this.som.para(t, 'erro'); return false; }
    this._aplicar_deck(b, cartas, k => this.desbloqueada(t, k));
    this.som.para(t, 'compra');
    return true;
  }

  desbloqueada(t, tipo) {
    return (tipo in C.PELOTOES) && this.eco[t].nivel_qg >= C.DESBLOQUEIO_CARTAS[tipo];
  }

  pronta(t, tipo) {
    // carta só com parafusos, dentro do limite do mapa por tipo
    return (this.desbloqueada(t, tipo) && this.parafusos[t] >= C.PF_CARTA[tipo] &&
      this._soldados(t) + C.vagas(tipo) <= this.limite(t) &&
      this.vivos_tipo(t, tipo) < C.limite_mapa(tipo));
  }

  reuniao_t(t, bx, by, x, y) {
    // GPS da base (x, y da base vêm do cliente): ponto de reunião das tropas que ela soltar
    let b = null, md = 16;
    for (const o of this.todas_bases()) { if (o.time !== t || o.vida <= 0) continue; const d = (o.x - bx) ** 2 + (o.y - by) ** 2; if (d < md) { md = d; b = o; } }
    if (!b || !this.pode_soltar(b) || this.fim || Math.abs(x - y) >= C.CENA_U - 2 || Math.abs(x + y) >= C.CENA_V - 3) { this.som.para(t, 'erro'); return false; }
    b.reuniao = [x, y];
    this.som.para(t, 'ordem');
    return true;
  }

  pode_pos(t, x, y) {
    return (M.dono(x, y) === t && Math.abs(x - y) < C.CENA_U - 2 && Math.abs(x + y) < C.CENA_V - 3);
  }

  posicionar_t(t, tipo, x, y) {
    if (this.fim || !(tipo in C.PELOTOES) || !this.pronta(t, tipo) || !this.pode_pos(t, x, y)) {
      this.som.para(t, 'erro');
      return false;
    }
    this.parafusos[t] -= C.PF_CARTA[tipo];
    const sq = this._chegando(t, tipo, x, y);   // aparece ali daqui a 1 minuto
    sq.valor = this._valor(tipo, C.PELOTOES[tipo].soldados);
    this.som.para(t, 'carta');
    this.som.tocar('posicionar', x, y);
    return true;
  }

  custo_base_t(t) {
    return Math.trunc(C.CUSTO_BASE * C.CUSTO_BASE_FATOR ** this.eco[t].bases_feitas + 0.5);
  }

  pode_base(t) {
    return this.eco[t].moedas >= this.custo_base_t(t) && this.eco[t].bases_feitas < C.MAX_BASES_EXTRA;   // além das 3 do começo, só mais 2
  }

  pode_construir_t(t, x, y) {
    return (this.pode_pos(t, x, y) && M.dist_estrada(x, y) > 1.5 &&
      this.todas_bases().every(b => hip(b.x - x, b.y - y) >= C.DISTANCIA_BASES));
  }

  construir_t(t, x, y) {
    const e = this.eco[t];
    if (this.fim || !this.pode_base(t) || !this.pode_construir_t(t, x, y)) {
      this.som.para(t, 'erro');
      return false;
    }
    e.moedas -= this.custo_base_t(t);
    e.bases_feitas += 1;
    this._nova_base(t, x, y);
    for (const sq of this.esquadroes) {
      if (sq.time === t) {
        sq.vida *= (1 + .1 * e.bases_feitas) / (1 + .1 * (e.bases_feitas - 1));
        sq.vida_max *= (1 + .1 * e.bases_feitas) / (1 + .1 * (e.bases_feitas - 1));
      }
    }
    return true;
  }

  torre_t(t, x, y) {
    // o jogador t compra uma torre de defesa em (x, y)
    const e = this.eco[t];
    if (this.fim || this.parafusos[t] < C.PF_TORRE || this.torres_de(t) >= C.MAX_TORRES ||
      !this.pode_pos(t, x, y) || !this.lugar_torre(t, x, y)) {
      this.som.para(t, 'erro');
      return false;
    }
    this.parafusos[t] -= C.PF_TORRE;   // torre se paga com parafusos
    this._nova_torre(t, x, y);
    return true;
  }

  barricada_t(t, x, y, ang) {
    // o jogador t põe uma barricada em (x, y) com o ângulo que ele viu
    const e = this.eco[t];
    if (this.fim || this.parafusos[t] < C.PF_BARRICADA || this.barricadas_de(t) >= C.MAX_BARRICADAS ||
      !Number.isFinite(ang) || !this.lugar_barricada(t, x, y)) {
      this.som.para(t, 'erro');
      return false;
    }
    this.parafusos[t] -= C.PF_BARRICADA;
    this._nova_barricada(t, x, y, ang);
    return true;
  }

  treino_t(t, n, id, q) {
    // manda q soldados da tropa id para o campo de treino n do jogador t
    if (!(n >= 0 && n < 3)) return false;
    const sq = this.esquadroes.find(o => o.id === id && o.time === t);
    if (!sq || !this.enviar_treino(t, n, sq, q)) { this.som.para(t, 'erro'); return false; }
    this.som.para(t, 'ordem');
    return true;
  }

  treino_sair_t(t, n) {
    if (!(n >= 0 && n < 3) || !this.sair_treino(t, n)) { this.som.para(t, 'erro'); return false; }
    this.som.para(t, 'desselecionar');
    return true;
  }

  ordem_t(t, id, wx, wy) {
    // a tropa 'id' (já selecionada no aparelho) recebe uma ordem no ponto tocado:
    // funde com amiga igual, persegue inimigo ou anda (pela estrada se tocou nela)
    if (this.fim) return;
    const sel = this.esquadroes.find(q => q.id === id && q.time === t && q.sold.length);
    if (!sel) return;
    let perto = null, md = Infinity;
    for (const sq of this.esquadroes) {
      if (!sq.sold.length) continue;
      const d2 = (sq.x - wx) ** 2 + (sq.y - wy) ** 2;
      if (d2 < (sq.raio() + 0.4) ** 2 && d2 < md) { md = d2; perto = sq; }
    }
    if (perto === sel) return;
    if (perto && perto.time === t && !this._pode_fundir(sel, perto)) return;
    sel.perseguir = null;
    sel.fundir = null;
    sel.caminho = [];
    if (perto && perto.time === t) {
      sel.fundir = perto;
      this._ordem(sel, perto.x, perto.y);
    } else if (perto) {
      sel.perseguir = perto;
      this._ordem(sel, perto.x, perto.y);
    } else {
      const u = limitar(wx - wy, -C.CENA_U + 2, C.CENA_U - 2);
      const v = limitar(wx + wy, -C.CENA_V + 3, C.CENA_V - 3);
      const [x, y] = de_uv(u, v);
      this._ordem(sel, x, y, M.eh_estrada(wx, wy));
    }
  }

  // ---------- o que vai para os aparelhos ---------------------------
  coletar() {
    // depois de cada passo: grava o que NASCEU neste passo (tiros, explosões...)
    const ev = this.som.ev;
    for (const tr of this.tracos) if (!tr._e) { tr._e = 1; ev.push(['tr', R2(tr.x0), R2(tr.y0), R2(tr.x1), R2(tr.y1), R2(tr.z0), R2(tr.z1), R3(tr.t)]); }
    for (const g of this.granadas) if (!g._e) { g._e = 1; ev.push(['gr', R2(g.x0), R2(g.y0), R2(g.x1), R2(g.y1), R3(g.t), R2(g.z0)]); }
    for (const o of this.obuses) if (!o._e) { o._e = 1; ev.push(['ob', R2(o.x0), R2(o.y0), R2(o.x1), R2(o.y1), R3(o.t)]); }
    for (const f of this.foguetes) if (!f._e) { f._e = 1; ev.push(['fo', R2(f.x0), R2(f.y0), R2(f.x1), R2(f.y1), R3(f.dur), R3(f.t)]); }
    for (const g of this.heli_granadas) if (!g._e) { g._e = 1; ev.push(['hg', R2(g.x0), R2(g.y0), R2(g.x1), R2(g.y1), R3(g.dur), R3(g.t)]); }
    for (const g of this.tanque_tiros) if (!g._e) { g._e = 1; ev.push(['tt', R2(g.x0), R2(g.y0), R2(g.x1), R2(g.y1), R3(g.dur), R3(g.t)]); }
    for (const e of this.explosoes) if (!e._e) { e._e = 1; ev.push(['ex', R2(e[0]), R2(e[1]), R2(e[3]), R2(e[4]), R3(e[2])]); }
    for (const s of this.sopros) if (!s._e) { s._e = 1; ev.push(['sp', R2(s[0]), R2(s[1]), R2(s[2]), R3(s[3])]); }
    for (const f of this.fogos) if (!f._e) { f._e = 1; ev.push(['fg', R2(f[0]), R2(f[1]), R3(f[2]), R2(f[3]), R2(f[4]), R2(f[5])]); }
    for (const m of this.marcas) if (!m._e) { m._e = 1; ev.push(['mc', R2(m[0]), R2(m[1]), R3(m[2])]); }
    for (const f of this.flutuantes) if (!f._e) { f._e = 1; ev.push(['fl', R2(f[0]), R2(f[1]), f[2], R3(f[3]), f._para || 'verde']); }
    for (const d of this.desembarques) if (!d._e) { d._e = 1; ev.push(['de', R2(d[0]), R2(d[1]), R3(d[2])]); }
    for (const s of this.caidos) {
      if (!s._e) {
        s._e = 1;
        if (s.id === undefined) s.id = this._prox_s++;
        ev.push(['ca', s.id, R2(s.x), R2(s.y), ti(s.time), TIPOS.indexOf(s.tipo), s.dir, R3(s.caindo)]);
      }
    }
    for (const sq of this.esquadroes) {
      for (const s of sq.sold) {
        if (s.id === undefined) s.id = this._prox_s++;
        if (s.tiro > (s._tv || 0)) s._fx = 1;   // atirou neste passo: o aparelho mostra o clarão
        s._tv = s.tiro;
      }
    }
  }

  limpar_disparos() {
    for (const sq of this.esquadroes) for (const s of sq.sold) s._fx = 0;
  }

  vencedor() {
    if (this.fim === 'vitoria') return 'verde';
    if (this.fim === 'derrota') return 'vermelho';
    if (this.fim === 'empate') return 'empate';
    return null;
  }
  resumo_fim() {
    // como acabou, para o servidor calcular os troféus
    if (!this.fim) return null;
    if (!this.como_fim) {   // caiu um QG
      const v = this._placar('verde'), r = this._placar('vermelho');
      this.como_fim = 'qg';
      this.margem_fim = Math.abs(v.de_pe - r.de_pe) / 3;
    }
    return { como: this.como_fim, margem: this.margem_fim || 0, t: this.t_partida || 0 };
  }

  foto(t, eventos, vencedor, ts) {
    // o retrato do jogo para o jogador do lado t
    const e = this.eco[t];
    const esq = [];
    for (const sq of this.esquadroes) {
      const sold = [];
      for (const s of sq.sold) {
        sold.push(s.id, Math.round(s.x * 100), Math.round(s.y * 100), s.dir | (s.andando ? 4 : 0) | (s._fx ? 8 : 0));
      }
      esq.push([sq.id, ti(sq.time), TIPOS.indexOf(sq.tipo), R3(sq.x), R3(sq.y), R3(sq.hx), R3(sq.hy),
        R1(sq.vida), R1(sq.vida_max), sq.cols, sq.movendo ? 1 : 0, R2(sq.recuo), sq.treinando,
        (sq.time === t && sq.destino) ? [R2(sq.destino[0]), R2(sq.destino[1])] : 0, sold, sq.exclusa ? 1 : 0,
        sq.nivel_treino, sq.treino, sq.time === t ? R1(sq.t_treino) : 0, Math.ceil(sq.chega || 0), sq.time === t ? R2(sq.mun) : 1]);
    }
    const bases = this.todas_bases().map(b => [ti(b.time), R2(b.x), R2(b.y), R1(b.vida), R1(b.vida_max),
      b.principal ? 1 : 0, R2(b.t_tropa), R2(this.tempo_tropa(b)), TIPOS.indexOf(b.carta),
      b.deck_base || 0, b.deck ? b.deck.map(k => TIPOS.indexOf(k)) : 0, b.falta_pf || 0,
      (b.time === t && b.estoque) ? C.ITENS.map(k => R1(b.estoque[k] || 0)) : 0, b.inicial ? 1 : 0]);   // fase 4: estoque (só o seu)
    const venceu = vencedor || this.vencedor();
    const ev = eventos.filter(x => !((x[0] === 'so' || x[0] === 'fl') && x[5] && x[5] !== t));
    return {
      t: 'q', r: this.rodada, ts: R3(ts),
      eco: { pf: this.parafusos[t], vr: R2(this.fator_virada(t)), ci: this.campo_invadido[t].map(q => (q ? 1 : 0)), m: R2(e.moedas), n: e.nivel, q: e.nivel_qg, b: e.bases_feitas, h: e.hab, d: TIPOS.map(k => this.drop_vivos(t, k)), c: TIPOS.map(k => this.carta_vivos(t, k)), v: TIPOS.map(k => this.vivos_tipo(t, k)), mb: this.melh_base[t], rf: this.refinaria[t].map(o => [C.ITENS.indexOf(o.item), R1(o.t)]) },
      av: R3(this.avanco), s: this._soldados(t),
      fim: venceu ? (venceu === 'empate' ? 'empate' : venceu === t ? 'vitoria' : 'derrota') : null,
      modo: this.modo_pvp || 'vale_tudo', tl: Math.max(0, Math.ceil((this.duracao || C.PVP_DURACAO) - (this.t_partida || 0))),   // modo e tempo que falta
      pl: (() => { const a = this._placar(t), b = this._placar(outro(t)); return [a.de_pe, b.de_pe, Math.round(a.qg * 100), Math.round(b.qg * 100)]; })(),
      esq, bases, ev,
      tor: this.torres.map(o => [ti(o.time), R2(o.x), R2(o.y), R2(o.hx), R2(o.hy), R2(o.recuo), R1(o.idade), R1(o.vida), R1(o.vida_max)]),
      bar: this.barricadas.map(o => [ti(o.time), R2(o.x), R2(o.y), R2(o.ang), R1(o.vida), R1(o.vida_max), o.id]),
      zf: this.zonas_fogo.map(z => [R2(z.x), R2(z.y), R2(z.r), R1(z.t), R1(z.dur)]),   // círculos de fogo
      cam: this.caminhoes.map(c => {   // fase 5: caminhões (rota e carga só dos seus)
        const meu = c.time === t;
        return [c.id, ti(c.time), R2(c.x), R2(c.y), R2(c.hx), R2(c.hy), R1(c.vida), R1(c.vida_max), c.carga_total,
          _ESTADOS_CAM.indexOf(c.estado), meu && c.de ? [R2(c.de.x), R2(c.de.y)] : 0, meu && c.para ? [R2(c.para.x), R2(c.para.y)] : 0];
      }),
      pr: this.presos.map(p => [ti(p.time), TIPOS.indexOf(p.tipo), R2(p.x), R2(p.y), R1(p.t), p.n]),   // fase 2: tropas presas
      ft: this.fila_treino[t].length,   // fase 2: quantas suas esperam campo de treino
    };
  }
}
