// ia.js — o COMANDANTE do inimigo no modo solo.
//
// O inimigo joga com as MESMAS regras que você:
//   * o mesmo caixa: começa com as mesmas moedas e só ganha do mesmo jeito
//     (tropa sua derrubada vale o mesmo prêmio; base sua derrubada, o mesmo
//     prêmio de base) — sem ondas de graça e sem bônus escondido de dano;
//   * as mesmas cartas, pelos mesmos preços, desbloqueadas pelo nível do QG
//     dele, e o mesmo limite de soldados;
//   * a mesma loja (dano, vida, velocidade, cadência, produção), as mesmas
//     habilidades por tropa, até 2 bases novas, até 4 torres, a carta que
//     cada base solta e os campos de treino.
//
// O que muda é a cabeça. A cada ~0,8 s ele:
//   1. lê o campo (o seu exército por tipo, ameaças no território dele);
//   2. DEFENDE: chama as tropas livres para a ameaça, joga cartas de
//      contra-ataque entre a base e o invasor, ergue torre se você insiste;
//   3. INVESTE quando está calmo: QG, loja, habilidades, bases, torres, treino;
//   4. ATACA em turnos mais curtos: junta um grupo na frente do QG, compra
//      cartas que respondem ao seu exército e sai pela estrada MAIS FRACA da
//      sua defesa, às vezes em pinça por duas estradas; helicóptero vai
//      direto na sua base mais desprotegida;
//   5. MANOBRA: tropa muito ferida recua para casa (e volta na próxima onda),
//      e tropas que estão atacando voltam se a casa dele está caindo.
import * as C from './config.js';
import * as M from './mapa.js';
import { hip } from './iso.js';

const rnd = Math.random;
const ROTAS = ['centro', 'esquerda', 'direita'];
const NOME_ROTA = { centro: 'pelo centro', esquerda: 'pela esquerda', direita: 'pela direita' };
const LOJA = ['dano', 'vida', 'cad', 'prod', 'vel'];
const HABS = ['dano', 'vida', 'cad'];
const PENSAR = 0.8;          // segundos entre uma decisão e outra
const DESCANSO = [42, 20];   // espera entre ondas: começa em 42 s e cai até 20 s
const PODER_TORRE = 260;     // quanto uma torre "vale" na conta de forças
const PODER_BASE = { principal: 260, extra: 120 };

export class Comandante {
  constructor(T) {
    this.T = T;
    this.t = 0.0;
    this.t_pensar = 0.0;
    this.grupo = [];          // tropas separadas para a próxima onda
    this.alvo_poder = 0;      // força que ele quer juntar antes de atacar
    this.t_preparo = 0.0;
    this.contagem = 0.0;      // > 0: contagem regressiva do ataque
    this.t_calmo = 0.0;       // segundos sem ameaça no território dele
    this.alertas = 0;         // quantas vezes você já invadiu
    this._invadido = false;
    this.t_torre = 0.0;
    this.t_cartas_base = 0.0;
    this.ultimo_ataque = '';
    this.comp = {};           // o SEU exército, por tipo (em "moedas")
    this.poder_verde = 0;
    this.ameaca = 0;
    this.ameaca_x = 0; this.ameaca_y = 0;
    this.base_ameacada = null;
    T.onda = 0;
    T.fase = 'descanso';
    T.aviso_onda = 0.0;
    // ele começa como você: duas tropas perto da base
    for (const [x, y] of M.INICIO_VERDE) {
      const sq = T._criar('vermelho', -x, -y, C.PELOTOES.pelotao.soldados);
      T._organizar(sq, true);
      sq.hx = 0.7071; sq.hy = 0.7071;
    }
  }

  // ---------- contas ------------------------------------------------
  poder(sq) {
    // força da tropa em "moedas": o preço da carta x quanto da vida ainda resta
    const T = this.T, p = C.PELOTOES[sq.tipo];
    const hp = T.hp(sq.time, sq.tipo);
    const cheio = p.soldados * hp;
    const vida = sq.vida + sq.treinando * hp;
    return p.custo * vida / cheio * (1 + 0.1 * sq.nivel_treino);
  }

  _vivo(sq) { return this.T.esquadroes.includes(sq) && (sq.sold.length > 0 || sq.treinando > 0); }

  _bases(time) { return this.T.todas_bases().filter(b => b.time === time && b.vida > 0); }

  _livre(sq) {
    // tropa do inimigo sem tarefa (pode entrar numa onda ou defender)
    return sq.time === 'vermelho' && !sq.exclusa && !sq.atacando && !sq.fuga && sq.treino < 0 &&
      (sq.papel === '' || sq.papel === 'defesa') && sq.sold.length > 0 && !sq.treinando;
  }

  // ---------- 1. ler o campo ------------------------------------------
  _ler() {
    const T = this.T;
    const comp = { pelotao: 0, granada: 0, canhao: 0, foguete: 0, heli: 0, tanque: 0 };
    let total = 0, am = 0, ax = 0, ay = 0;
    const minhas = this._bases('vermelho');
    for (const sq of T.esquadroes) {
      if (sq.time !== 'verde' || (!sq.sold.length && !sq.treinando)) continue;
      const p = this.poder(sq);
      comp[sq.tipo] += p; total += p;
      let db = Infinity;
      for (const b of minhas) db = Math.min(db, hip(b.x - sq.x, b.y - sq.y));
      if (M.dono(sq.x, sq.y) === 'vermelho' || db < 24) { am += p; ax += sq.x * p; ay += sq.y * p; }
    }
    this.comp = comp; this.poder_verde = total;
    this.torres_verdes = T.torres.filter(o => o.time === 'verde').length;
    this.ameaca = am;
    if (am > 0) {
      this.ameaca_x = ax / am; this.ameaca_y = ay / am;
      let md = Infinity;
      for (const b of minhas) { const d = hip(b.x - this.ameaca_x, b.y - this.ameaca_y); if (d < md) { md = d; this.base_ameacada = b; } }
    }
  }

  _pesos() {
    // que carta responde melhor ao SEU exército
    const c = this.comp, tot = Math.max(1, this.poder_verde);
    const w = { pelotao: 1.0, granada: 0.9, canhao: 0.5, foguete: 0.45, heli: 0.35, tanque: 0.55 };
    w.granada += 1.4 * c.pelotao / tot;                        // tropa junta: granada
    w.foguete += 1.6 * c.tanque / tot + 0.5 * c.canhao / tot;  // blindado: foguete
    w.canhao += 0.8 * c.tanque / tot + (this.torres_verdes ? 0.6 : 0);   // torre e prédio: canhão
    w.pelotao += 1.2 * c.heli / tot;                           // helicóptero: fuzil
    w.tanque += 0.6 * c.pelotao / tot + 0.3 * c.granada / tot;
    w.heli += 0.5 * c.canhao / tot + 0.5 * c.granada / tot;    // granada e canhão não pegam helicóptero
    return w;
  }

  _tipo(orcamento, sorteado = true) {
    const T = this.T, w = this._pesos();
    const ok = [];
    for (const tipo of C.ORDEM_CARTAS) {
      const p = C.PELOTOES[tipo];
      if (!T.ia_desbloqueada(tipo) || C.PF_CARTA[tipo] > orcamento) continue;   // (carta se paga em parafusos)
      if (T._soldados('vermelho') + C.vagas(tipo) > T.ia_limite_soldados()) continue;
      if (T.vivos_tipo('vermelho', tipo) >= C.limite_mapa(tipo)) continue;   // limite do mapa por tipo
      ok.push([tipo, w[tipo]]);
    }
    if (!ok.length) return null;
    if (!sorteado) { ok.sort((a, b) => b[1] - a[1]); return ok[0][0]; }
    let soma = 0;
    for (const [, p] of ok) soma += p;
    let r = rnd() * soma;
    for (const [tipo, p] of ok) { r -= p; if (r <= 0) return tipo; }
    return ok[ok.length - 1][0];
  }

  // ---------- 2. defender -----------------------------------------------
  _defender() {
    const T = this.T;
    if (this.ameaca <= 0) {
      this.t_calmo += PENSAR;
      if (this._invadido && this.t_calmo > 6) this._invadido = false;
      for (const sq of T.esquadroes) if (sq.time === 'vermelho' && sq.papel === 'defesa' && !sq.destino) sq.papel = '';
      return;
    }
    this.t_calmo = 0;
    if (!this._invadido) { this._invadido = true; this.alertas++; }
    const cx = this.ameaca_x, cy = this.ameaca_y, b = this.base_ameacada;
    // quanto ele já tem ali
    let def = 0;
    for (const sq of T.esquadroes) {
      if (sq.time !== 'vermelho' || !sq.sold.length) continue;
      if (hip(sq.x - cx, sq.y - cy) < 30) def += this.poder(sq);
    }
    for (const o of T.torres) if (o.time === 'vermelho' && hip(o.x - cx, o.y - cy) < C.ALCANCE_TORRE + 4) def += PODER_TORRE * o.vida / o.vida_max;
    if (b && hip(b.x - cx, b.y - cy) < 16) def += b.principal ? PODER_BASE.principal : PODER_BASE.extra;
    // chama quem está livre (e o grupo que ainda não saiu) para a briga
    const chamar = this.ameaca > def * 0.7;
    for (const sq of T.esquadroes) {
      if (sq.time !== 'vermelho' || !sq.sold.length || sq.treinando || sq.fuga || sq.exclusa) continue;
      const d = hip(sq.x - cx, sq.y - cy);
      let vai = false;
      if ((this._livre(sq) || sq.papel === 'grupo') && d < 48) vai = true;
      else if (sq.treino >= 0 && chamar && d < 40) vai = true;   // tira do treino se a coisa está feia
      else if (sq.atacando && this.ameaca > def * 1.4 && M.dono(sq.x, sq.y) === 'vermelho' && d < 45) {
        sq.atacando = false; sq.rota = null; vai = true;          // volta para salvar a casa
      }
      if (!vai) continue;
      if (sq.papel === 'grupo') this.grupo.splice(this.grupo.indexOf(sq), 1);
      sq.papel = 'defesa';
      if (d > sq.alcance() * 0.8) {
        const k = Math.max(0, (d - sq.alcance() * 0.7) / d);
        T._ordem(sq, sq.x + (cx - sq.x) * k, sq.y + (cy - sq.y) * k, d > 25);
      }
    }
    // faltou força: joga cartas entre a base e o invasor
    let compras = 0;
    while (this.ameaca * 1.15 > def && compras < 2) {
      const tipo = this._tipo(T.parafusos.vermelho, false);
      if (!tipo) break;
      const bx = b ? b.x : T.bases.vermelho.x, by = b ? b.y : T.bases.vermelho.y;
      let sq = null;
      for (const f of [0.45, 0.3, 0.15, 0.6]) {
        const x = bx + (cx - bx) * f + (rnd() - 0.5) * 3, y = by + (cy - by) * f + (rnd() - 0.5) * 3;
        sq = T.ia_carta(tipo, x, y);
        if (sq) break;
      }
      if (!sq) break;
      sq.papel = 'defesa';
      def += this.poder(sq);
      compras++;
    }
    // você insiste em invadir: ele ergue torre perto da base atacada
    this.t_torre -= PENSAR;
    if (b && this.t_torre <= 0 && (this.alertas >= 2 || this.ameaca > 300) && T.parafusos.vermelho >= C.PF_TORRE + 8) {
      if (this._torre_perto(b.x, b.y, cx, cy)) this.t_torre = 25;
    }
  }

  _torre_perto(bx, by, cx, cy) {
    const T = this.T;
    const d = hip(cx - bx, cy - by) || 1;
    for (const r of [5, 7, 9, 4]) {
      for (const lado of [0, 1, -1, 2, -2]) {
        const x = bx + (cx - bx) / d * r - (cy - by) / d * lado * 2.5;
        const y = by + (cy - by) / d * r + (cx - bx) / d * lado * 2.5;
        if (T.ia_torre(x, y)) return true;
      }
    }
    return false;
  }

  // ---------- 3. investir ------------------------------------------------
  _investir() {
    const T = this.T;
    if (this.esperta) { this._investir_esperto(); return; }
    if (this.ameaca > 60 || T.fase !== 'descanso') return;
    const m = T.moedas_ia;
    // QG primeiro: destrava cartas, aumenta o limite e empurra a fronteira
    if (T.nivel_qg_ia < C.NIVEL_QG_MAX && (T.onda >= 1 || this.t > 45) && m >= T.ia_custo_qg()) { T.ia_qg(); return; }
    // base nova (até 2)
    if (T.onda >= 2 && T.bases_feitas_ia < C.MAX_BASES_EXTRA && m >= T.custo_base('vermelho') + 60) {
      const lugares = M.BASES_IA.slice().sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));   // mais longe da frente primeiro
      for (const [x, y] of lugares) if (T.ia_base(x, y)) return;
    }
    // fase 3: melhorias da base (treino primeiro: parafusos pagam as cartas)
    if (T.onda >= 1 && this._melh_base(m, 90)) return;
    // loja: o mais barato entre dano, vida, cadência, produção, velocidade
    if (T.onda >= 2) {
      let melhor = null, mc = Infinity;
      for (const k of LOJA) {
        if (T.nivel_ia[k] >= C.NIVEL_MAX) continue;
        const c = T.ia_custo(k) * (k === 'vel' ? 1.4 : 1);
        if (c < mc) { mc = c; melhor = k; }
      }
      if (melhor && m >= T.ia_custo(melhor) + 90) { T.ia_melhoria(melhor); return; }
    }
    // habilidades da tropa que ele mais usa
    if (T.onda >= 3) {
      const uso = {};
      for (const sq of T.esquadroes) if (sq.time === 'vermelho') uso[sq.tipo] = (uso[sq.tipo] || 0) + this.poder(sq);
      const tipo = Object.keys(uso).sort((a, b) => uso[b] - uso[a])[0];
      if (tipo && T.ia_desbloqueada(tipo)) {
        let hm = null, hc = Infinity;
        for (const k of HABS) {
          if (T.hab_nivel_ia[tipo][k] >= C.NIVEL_MAX) continue;
          const c = T.ia_custo_hab(tipo, k);
          if (c < hc) { hc = c; hm = k; }
        }
        if (hm && m >= hc + 140) { T.ia_hab(tipo, hm); return; }
      }
    }
    // torre na frente do QG, virada para a estrada que você mais usa
    if (T.onda >= 3 && T.torres_de('vermelho') < 2 && T.parafusos.vermelho >= C.PF_TORRE + 15 && this.ultimo_ataque) {
      const b = T.bases.vermelho;
      const r = M.ROTAS[this.ultimo_ataque];
      const p = r.em(Math.min(r.comprimento, r.s_perto(b.x, b.y) + 14));
      this._torre_perto(b.x, b.y, p[0], p[1]);
    }
  }

  _melh_base(m, reserva) {
    // fase 3: a melhoria da base mais barata (peso: treino > vida > torres, se tiver torre)
    const T = this.T;
    if (!T.melh_base) return false;
    let melhor = null, mc = Infinity;
    for (const k of C.ORDEM_MELH_BASE) {
      if (T.melh_base.vermelho[k] >= C.MELH_BASE_MAX) continue;
      if (k === 'tdano' && !T.torres.some(o => o.time === 'vermelho')) continue;
      const c = T.custo_mb('vermelho', k) * (k === 'tpf' ? 0.7 : k === 'tvel' ? 0.85 : 1);
      if (c < mc) { mc = c; melhor = k; }
    }
    return !!melhor && m >= T.custo_mb('vermelho', melhor) + reserva && T.comprar_mb('vermelho', melhor);
  }

  _investir_esperto() {
    // IA 2 e 3: caixa grande e boas escolhas. Sob ataque, guarda dinheiro para
    // cartas (defesa); calmo, investe na ordem que mais rende:
    //   QG (libera cartas e empurra a frente) > Dano/Vida da tropa mais usada >
    //   base nova > torre na estrada que você mais usa > loja geral
    const T = this.T;
    const m = T.moedas_ia;
    const reserva = this.ameaca > 60 ? 260 : 120;   // sempre sobra para responder com cartas
    if (this.ameaca > 140) return;
    if (T.nivel_qg_ia < C.NIVEL_QG_MAX && m >= T.ia_custo_qg() + reserva * 0.5) { T.ia_qg(); return; }
    // habilidades: as tropas que ele mais tem no campo, dano e vida primeiro
    const uso = {};
    for (const sq of T.esquadroes) if (sq.time === 'vermelho') uso[sq.tipo] = (uso[sq.tipo] || 0) + this.poder(sq);
    const tipos = Object.keys(uso).filter(t => T.ia_desbloqueada(t)).sort((a, b) => uso[b] - uso[a]).slice(0, 2);
    for (const tipo of tipos) {
      let hm = null, hc = Infinity;
      for (const k of HABS) {
        if (T.hab_nivel_ia[tipo][k] >= C.NIVEL_MAX) continue;
        const c = T.ia_custo_hab(tipo, k) * (k === 'dano' ? 0.7 : k === 'vida' ? 0.8 : 1.15);   // prefere dano e vida
        if (c < hc) { hc = c; hm = k; }
      }
      if (hm && m >= T.ia_custo_hab(tipo, hm) + reserva) { T.ia_hab(tipo, hm); return; }
    }
    if (T.bases_feitas_ia < C.MAX_BASES_EXTRA && (T.onda >= 1 || this.t > 50) && m >= T.custo_base('vermelho') + reserva) {
      const lugares = M.BASES_IA.slice().sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
      for (const [x, y] of lugares) if (T.ia_base(x, y)) return;
    }
    if (T.torres_de('vermelho') < 3 && T.parafusos.vermelho >= C.PF_TORRE + 15) {
      const b = T.bases.vermelho;
      const nome = this.ultimo_ataque || 'centro';
      const r = M.ROTAS[nome];
      if (r) {
        const p = r.em(Math.min(r.comprimento, r.s_perto(b.x, b.y) + 12 + T.torres_de('vermelho') * 8));
        if (this._torre_perto(b.x, b.y, p[0], p[1])) return;
      }
    }
    if (this._melh_base(m, reserva)) return;   // fase 3: melhorias da base
    let melhor = null, mc = Infinity;
    for (const k of LOJA) {
      if (T.nivel_ia[k] >= C.NIVEL_MAX) continue;
      const c = T.ia_custo(k) * (k === 'prod' ? 0.8 : k === 'vel' ? 1.5 : 1);   // produção rende muito
      if (c < mc) { mc = c; melhor = k; }
    }
    if (melhor && m >= T.ia_custo(melhor) + reserva) T.ia_melhoria(melhor);
  }

  _cartas_das_bases() {
    // cada base dele solta a carta que melhor responde ao seu exército
    const T = this.T, w = this._pesos();
    const ok = C.ORDEM_CARTAS.filter(t => T.ia_desbloqueada(t)).sort((a, b) => w[b] - w[a]);
    if (!ok.length) return;
    const bases = this._bases('vermelho');
    bases.forEach((b, i) => { b.carta = b.principal ? ok[0] : ok[(i + 1) % Math.min(ok.length, 2)]; });
  }

  _logistica(dt) {
    // fase 5: cada caminhão dele faz QG -> a base com MENOS estoque (sem repetir
    // base entre caminhões); repensa a cada 30 s quando está vazio
    const T = this.T;
    if (!T.caminhoes || T.horda) return;
    this._t_log = (this._t_log || 0) + dt;
    if (this._t_log < 3) return;
    this._t_log = 0;
    if (T.caminhoes_de('vermelho') < 2 && T.onda >= 1 && T.moedas_ia >= C.CUSTO_CAMINHAO + 150 && this.ameaca <= 0) T.comprar_caminhao('vermelho');
    const qg = T.bases.vermelho;
    const outras = T.todas_bases().filter(b => b.time === 'vermelho' && b !== qg && b.vida > 0 && b.estoque && !b.nave);
    if (!outras.length) return;
    const total = b => C.ITENS.reduce((s, k) => s + (b.estoque[k] || 0), 0);
    const usadas = new Set();
    for (const c of T.caminhoes) {
      if (c.time !== 'vermelho') continue;
      c._t_ia = (c._t_ia || 0) + 3;
      const repensa = !c.de || !c.para || (c.carga_total === 0 && c._t_ia > 30);
      if (!repensa) { if (c.para) usadas.add(c.para); continue; }
      const livres = outras.filter(b => !usadas.has(b));
      const alvo = (livres.length ? livres : outras).slice().sort((a, b) => total(a) - total(b))[0];
      if (c.de !== qg) T.ordem_caminhao(c, 'de', qg);
      if (c.para !== alvo) T.ordem_caminhao(c, 'para', alvo);
      usadas.add(alvo); c._t_ia = 0;
    }
  }

  _refinar(dt) {
    // fase 4: a cada 4 s, pede na refinaria o item que as tropas dele mais usam
    // e que está acabando no QG (pólvora antes, se o item precisar dela)
    const T = this.T;
    if (!T.refinaria || T.horda) return;
    this._t_ref = (this._t_ref || 0) + dt;
    if (this._t_ref < 4) return;
    this._t_ref = 0;
    if (T.refinaria.vermelho.length >= 3) return;
    const qg = T.bases.vermelho;
    if (!qg.estoque) return;
    const uso = {};
    for (const sq of T.esquadroes) if (sq.time === 'vermelho' && sq.sold.length) { const k = C.MUN_ITEM[sq.tipo]; uso[k] = (uso[k] || 0) + 1; }
    const itens = Object.keys(uso).sort((a, b) => uso[b] - uso[a]);
    for (const k of itens) {
      if (qg.estoque[k] >= 6) continue;
      const r = C.REFINARIA[k];
      if (r.polvora && qg.estoque.polvora < r.polvora) { T.pedir_ref('vermelho', 'polvora'); return; }
      if (T.pedir_ref('vermelho', k)) return;
    }
  }

  _treinar() {
    // calmo: manda uma tropa parada para o campo de treino (deixa um campo livre)
    const T = this.T;
    // com poucos parafusos as bases param: treina mais cedo (treino rende parafuso)
    // (fase 1: carta só com parafusos, então o treino é a fonte das cartas: treina cedo e sempre)
    const precisa = T.parafusos && T.parafusos.vermelho < 60;
    if (precisa ? (this.t_calmo < 6) : (this.t_calmo < 20 || T.onda < 1)) return;
    let ocupados = 0, livre = -1;
    for (let n = 0; n < 3; n++) { if (T.ocupante_treino('vermelho', n)) ocupados++; else if (livre < 0) livre = n; }
    if (ocupados >= 2 || livre < 0) return;
    const a = M.area_de('vermelho', livre);
    for (const sq of T.esquadroes) {
      if (!this._livre(sq) || !C.TREINO_TIPOS.includes(sq.tipo) || sq.sold.length < 10 || !T.pode_treinar(sq)) continue;
      if (T.enviar_treino('vermelho', livre, sq, Math.min(sq.sold.length, a.cap))) {
        const oc = T.ocupante_treino('vermelho', livre);
        if (oc) oc.papel = 'treino';
        return;
      }
    }
  }

  // ---------- 4. ondas de ataque ------------------------------------------
  _ponto(i) { const p = M.PREPARO[i % M.PREPARO.length]; return [p[0] + (rnd() - 0.5) * 2, p[1] + (rnd() - 0.5) * 2]; }

  _defesa_na_rota(nome) {
    // quanto da SUA defesa a tropa vai encontrar por esta estrada
    const T = this.T, r = M.ROTAS[nome], L = r.comprimento;
    const vistos = new Set();
    let soma = 0;
    for (let s = L * 0.35; s <= L; s += 4) {
      const [x, y] = r.em(s);
      for (const sq of T.esquadroes) {
        if (sq.time !== 'verde' || vistos.has(sq) || !sq.sold.length) continue;
        if (hip(sq.x - x, sq.y - y) < 12) { vistos.add(sq); soma += this.poder(sq); }
      }
      for (const o of T.torres) {
        if (o.time !== 'verde' || vistos.has(o)) continue;
        if (hip(o.x - x, o.y - y) < C.ALCANCE_TORRE) { vistos.add(o); soma += PODER_TORRE * o.vida / o.vida_max; }
      }
      for (const b of T.todas_bases()) {
        if (b.time !== 'verde' || b.vida <= 0 || vistos.has(b)) continue;
        if (hip(b.x - x, b.y - y) < 12) { vistos.add(b); soma += b.principal ? PODER_BASE.principal : PODER_BASE.extra; }
      }
    }
    return soma;
  }

  _nova_onda() {
    const T = this.T;
    // sem tropa livre e sem moeda para uma carta: espera um pouco em vez de anunciar onda vazia
    const livres = T.esquadroes.some(sq => this._livre(sq));
    if (!livres && T.parafusos.vermelho < C.PF_CARTA.pelotao) { T.espera = 10; return; }
    T.onda += 1;
    T.fase = 'preparando';
    this.t_preparo = 0;
    this.contagem = 0;
    // a força que ele quer juntar: cresce a cada onda e acompanha a sua defesa
    let defesa = 0;
    for (const sq of T.esquadroes) if (sq.time === 'verde' && sq.sold.length && M.dono(sq.x, sq.y) === 'verde') defesa += this.poder(sq);
    defesa += this.torres_verdes * PODER_TORRE;
    this.alvo_poder = Math.min(2400, Math.max(90 + 70 * T.onda, defesa * 0.8));
    this.grupo = this.grupo.filter(sq => this._vivo(sq));
    this._recrutar();
    this.T.som.tocar('preparo', T.bases.vermelho.x, T.bases.vermelho.y);
  }

  _recrutar() {
    // tropas livres entram no grupo e vão para a frente do QG
    const T = this.T;
    for (const sq of T.esquadroes) {
      if (!this._livre(sq) || sq.papel === 'defesa' && this.ameaca > 0) continue;
      sq.papel = 'grupo';
      this.grupo.push(sq);
      const [x, y] = this._ponto(this.grupo.length - 1);
      if (hip(sq.x - x, sq.y - y) > 4) T._ordem(sq, x, y, hip(sq.x - x, sq.y - y) > 20);
    }
    // tropa veterana (nível 2+ no treino) vai junto
    for (let n = 0; n < 3; n++) {
      const oc = T.ocupante_treino('vermelho', n);
      if (oc && oc.nivel_treino >= C.TREINO_MAX && this.ameaca <= 0) {
        oc.papel = 'grupo';
        this.grupo.push(oc);
        const [x, y] = this._ponto(this.grupo.length - 1);
        T._ordem(oc, x, y, true);   // sai do campo (libera)
      }
    }
  }

  _preparar(dt) {
    const T = this.T;
    this.t_preparo += dt;
    this.grupo = this.grupo.filter(sq => this._vivo(sq) && sq.papel === 'grupo');
    if (this.ameaca > 0 && this.t_preparo < 3) return;
    this._recrutar();
    let poder = 0;
    for (const sq of this.grupo) poder += this.poder(sq);
    // compra cartas até chegar na força que quer (pode gastar tudo: é hora de atacar)
    let compras = 0;
    while (poder < this.alvo_poder && compras < 3 && this.ameaca <= 0) {
      const tipo = this._tipo(T.parafusos.vermelho);
      if (!tipo) break;
      const [x, y] = this._ponto(this.grupo.length);
      const sq = T.ia_carta(tipo, x, y);
      if (!sq) break;
      sq.papel = 'grupo';
      this.grupo.push(sq);
      poder += this.poder(sq);
      compras++;
    }
    this.poder_grupo = poder;
    if (this.contagem > 0) {
      const antes = Math.ceil(this.contagem);
      this.contagem -= dt;
      const seg = Math.ceil(this.contagem);
      if (seg !== antes && seg > 0 && seg <= 3) T.som.tocar('contagem');
      if (this.contagem <= 0) this._lancar();
      return;
    }
    const chegaram = this.grupo.every(sq => !sq.destino || hip(sq.destino[0] - sq.x, sq.destino[1] - sq.y) < 6);
    const forte = poder >= this.alvo_poder;
    const pronto = (forte && (chegaram || this.t_preparo > 18)) ||
      (this.t_preparo > 22 && poder >= this.alvo_poder * 0.5) || (this.t_preparo > 34 && poder > 0);
    if (pronto && this.grupo.length) this.contagem = C.ESPERA_ATAQUE;
    else if (this.t_preparo > 40 && !this.grupo.length) {   // sem tropa nem moeda: pula esta vez
      T.fase = 'descanso';
      T.espera = 12;
    }
  }

  _lancar() {
    // sai pela estrada mais fraca da sua defesa; às vezes em pinça
    const T = this.T;
    const notas = ROTAS.map(r => [r, this._defesa_na_rota(r) * (0.9 + rnd() * 0.2)]).sort((a, b) => a[1] - b[1]);
    const helis = this.grupo.filter(sq => sq.tipo === 'heli');
    const chao = this.grupo.filter(sq => sq.tipo !== 'heli');
    // os pesados no grupo principal, os leves no flanco
    chao.sort((a, b) => (C.PELOTOES[b.tipo].vida * this.poder(b)) - (C.PELOTOES[a.tipo].vida * this.poder(a)));
    let planos;
    if (chao.length <= 2) planos = chao.map(() => notas[0][0]);
    else if (T.onda % 3 === 0) planos = chao.map((_, i) => notas[i % 2][0]);                    // pinça
    else planos = chao.map((_, i) => (i < Math.ceil(chao.length * 0.7) ? notas[0][0] : notas[1][0]));   // principal + flanco
    const usadas = new Set();
    chao.forEach((sq, i) => {
      const nome = planos[i];
      usadas.add(nome);
      sq.rota = M.ROTAS[nome];
      sq.s = Math.max(6.0, sq.rota.s_perto(sq.x, sq.y)) + i * 0.01;
      sq.caminho = [];
      sq.destino = sq.rota.em(sq.s).slice(0, 2);
      sq.atacando = true;
      sq.papel = 'ataque';
    });
    // helicóptero: direto na sua base mais desprotegida (ou, a cada 2 ondas,
    // no seu CAMPO DE TREINO ocupado: corta os seus parafusos)
    const campo = T.onda % 2 === 0 ? this._campo_alvo() : null;
    for (const sq of helis) {
      if (campo) { sq.papel = 'raide'; T._ordem(sq, campo.x, campo.y); continue; }
      const alvo = this._base_fraca();
      if (!alvo) { sq.papel = ''; continue; }
      sq.papel = 'raide';
      T._ordem(sq, alvo.x - 1.5, alvo.y - 1.5);
    }
    this.ultimo_ataque = notas[0][0];
    this.grupo = [];
    T.fase = 'descanso';
    T.espera = Math.max(DESCANSO[1], DESCANSO[0] - 2 * (T.onda - 1));
    T.aviso_onda = 6.0;
    this.texto_onda = [...usadas].map(n => NOME_ROTA[n]).join(' e ') + (helis.length ? ' e pelo ar' : '');
    T.som.tocar('corneta_inimiga');
  }

  _base_alvo(sq) {
    // a base sua que a regra de mira deixa atacar (extras primeiro), a mais perto
    const vivas = this._bases('verde');
    const extras = vivas.filter(b => !b.principal);
    const lista = extras.length ? extras : vivas;
    let melhor = null, md = Infinity;
    for (const b of lista) { const d = hip(b.x - sq.x, b.y - sq.y); if (d < md) { md = d; melhor = b; } }
    return melhor;
  }

  _campo_alvo() {
    // o campo de treino seu que está rendendo parafusos (tem tropa treinando)
    const T = this.T;
    for (const n of [1, 0, 2]) {
      if (!T.ocupante_treino('verde', n)) continue;
      return M.area_de('verde', n);
    }
    return null;
  }

  _base_fraca() {
    const T = this.T;
    let melhor = null, nota = Infinity;
    for (const b of this._bases('verde')) {
      let def = b.principal ? PODER_BASE.principal : 0;
      for (const sq of T.esquadroes) if (sq.time === 'verde' && sq.sold.length && hip(sq.x - b.x, sq.y - b.y) < 15) def += this.poder(sq);
      for (const o of T.torres) if (o.time === 'verde' && hip(o.x - b.x, o.y - b.y) < C.ALCANCE_TORRE) def += PODER_TORRE;
      if (def < nota) { nota = def; melhor = b; }
    }
    return melhor;
  }

  // ---------- 5. manobras ---------------------------------------------------
  _manobrar() {
    const T = this.T;
    for (const sq of T.esquadroes) {
      if (sq.time !== 'vermelho' || !sq.sold.length) continue;
      if (sq.papel === 'fuga') {   // chegou em casa: volta a ficar livre
        if (!sq.destino) { sq.fuga = false; sq.papel = ''; }
        continue;
      }
      if (sq.papel === 'raide' && !sq.destino && !sq.alvo) {   // base caiu: procura outra
        const b = this._base_fraca();
        if (b) T._ordem(sq, b.x - 1.5, b.y - 1.5); else sq.papel = '';
        continue;
      }
      // chegou ao fim da estrada sem alvo: vai até a sua base mais perto
      // (as bases extras vêm primeiro, como a regra de mira manda)
      if (sq.atacando && !sq.destino && !sq.alvo && sq.rota && sq.s >= sq.rota.comprimento - 1.5) {
        // nas ondas ímpares, parte da tropa vai primeiro no seu CAMPO DE TREINO ocupado
        if (sq._mira_campo === undefined) sq._mira_campo = T.onda % 2 === 1 && rnd() < 0.5;
        const campo = sq._mira_campo ? this._campo_alvo() : null;
        if (campo && hip(campo.x - sq.x, campo.y - sq.y) > 3) {
          T._ordem(sq, campo.x, campo.y, hip(campo.x - sq.x, campo.y - sq.y) > 20);
          continue;
        }
        if (campo) sq._mira_campo = false;   // chegou e o campo está limpo: segue para a base
        const b = this._base_alvo(sq);
        if (b) T._ordem(sq, b.x + (sq.x - b.x) * 0.15 - 1.5, b.y + (sq.y - b.y) * 0.15 - 1.5, hip(b.x - sq.x, b.y - sq.y) > 20);
        continue;
      }
      if (!sq.atacando || sq.exclusa || sq.tipo === 'heli' || sq.tipo === 'tanque' || sq.sold.length < 3) continue;
      // muito ferida e apanhando: recua para casa e volta na próxima onda
      if (sq.vida < sq.vida_max * 0.25) {
        let perigo = 0;
        for (const o of T.esquadroes) if (o.time === 'verde' && o.sold.length && hip(o.x - sq.x, o.y - sq.y) < 14) perigo += this.poder(o);
        if (perigo > this.poder(sq) * 1.5) {
          sq.atacando = false; sq.rota = null;
          sq.fuga = true; sq.papel = 'fuga';
          const [x, y] = this._ponto(Math.floor(rnd() * 8));
          T._ordem(sq, x, y, true);
        }
      }
    }
  }

  // ---------- passo e texto ------------------------------------------------
  passo(dt) {
    const T = this.T;
    this.t += dt;
    T.aviso_onda = Math.max(0.0, T.aviso_onda - dt);
    if (T.fim || T.bases.vermelho.vida <= 0) return;
    if (T.fase === 'descanso') {
      T.espera -= dt;
      if (T.espera <= 0) this._nova_onda();
    }
    this.t_pensar -= dt;
    if (this.t_pensar > 0) return;
    this.t_pensar = PENSAR;
    this._ler();
    this._defender();
    this._manobrar();
    if (T.fase === 'preparando') this._preparar(PENSAR);
    else this._investir();
    this.t_cartas_base -= PENSAR;
    if (this.t_cartas_base <= 0) { this.t_cartas_base = 8; this._cartas_das_bases(); }
    this._treinar();
    this._refinar(PENSAR);   // fase 4: munição pela refinaria
    this._logistica(PENSAR);   // fase 5: caminhões levam estoque do QG para as bases
  }

  status() {
    const T = this.T;
    if (T.aviso_onda > 0) return [`Onda ${T.onda} atacando ${this.texto_onda || ''}!`, true];
    if (T.fase === 'preparando') {
      if (this.contagem > 0) return [`Onda ${T.onda} sai em ${Math.ceil(this.contagem)}s`, true];
      const pct = Math.min(100, Math.round(100 * (this.poder_grupo || 0) / Math.max(1, this.alvo_poder)));
      return [`Onda ${T.onda}: inimigo reunindo tropas ${pct}%`, false];
    }
    if (this.ameaca > 0) return ['Inimigo defendendo o território', false];
    return [`Próxima onda em ${Math.ceil(Math.max(0.0, T.espera))}s · QG inimigo N${T.nivel_qg_ia}`, false];
  }
}
