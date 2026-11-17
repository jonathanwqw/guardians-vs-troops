// tropas.js — as REGRAS do jogo (não desenha nada). (clone de jogo/tropas.py)
//
// VIDA: cada esquadrão tem uma vida única (a tropa como um todo). Cada
// soldado representa VIDA_SOLDADO pontos; quando a vida cai, soldados caem
// junto. Vida zero = esquadrão destruído.
//
// TIRO: soldados das 3 primeiras fileiras, parados, atiram no alvo (inimigo
// mais próximo dentro do ALCANCE). O dano entra quando o traçante chega.
// Sem esquadrão inimigo por perto, atiram na base.
//
// VERDE (você): toque numa tropa para selecionar, toque no chão para mandar
// andar, toque num inimigo para avançar até o alcance.
// VERMELHO (IA): não ataca de imediato. Prepara uma ONDA de pelotões na
// frente do QG e só então ataca, por até três caminhos.
//
// CARTAS, BASES, MOEDAS: ver o cabeçalho do arquivo original.
// Fim: destrua o QG vermelho. Se a base verde cair, você perde.
import { Horda, Z as ZUMBI } from './zumbis.js';
import * as C from './config.js';
import * as M from './mapa.js';
import * as efeitos_tanque from './efeitos.js';
import { Comandante } from './ia.js';
import { de_uv, limitar, hip } from './iso.js';
import { GradeEsquadroes } from './grade.js';

const HP = C.VIDA_SOLDADO;
const rnd = Math.random;
const sorteio = (n) => Math.floor(rnd() * n);          // random.randrange(n)
const escolha = (lista) => lista[sorteio(lista.length)]; // random.choice

export function outro(time) {
  return time === 'verde' ? 'vermelho' : 'verde';
}

export function dir_de(hx, hy) {
  // vetor -> uma das 4 vistas isométricas (ver soldado.js)
  if (Math.abs(hx) > Math.abs(hy)) return hx > 0 ? 0 : 2;
  return hy > 0 ? 1 : 3;
}

export class Soldado {
  constructor(x, y, time, tipo = 'pelotao') {
    this.tipo = tipo;
    this.x = x; this.y = y; this.tx = x; this.ty = y;
    this.dir = 0;
    this.fase = rnd() * 6.28;
    this.andando = false;
    this.tiro = 0.0;            // 1 = acabou de atirar, cai até 0
    this.cool = rnd() * 2;
    this.caindo = -1.0;         // -1 = de pé; 0..1 = caindo
    this.time = time;
    // Campos usados depois (multiplayer: servidor e aparelho). Declarados aqui
    // para todo soldado ter o MESMO formato interno desde o início: o motor do
    // navegador otimiza o código quente e não precisa desotimizar a cada objeto
    // novo. Os valores iniciais se comportam igual a "não existe" nas checagens.
    this.id = undefined;
    this._e = 0;
    this._fx = 0;
    this._tv = 0;
    this._ax = x; this._ay = y; this._bx = x; this._by = y;
  }
}

export class Esquadrao {
  constructor(time, x, y, tipo = 'pelotao') {
    this.base = false;
    this.time = time;
    this.tipo = tipo;
    this.x = x; this.y = y;
    this.hx = 0.0; this.hy = (time === 'verde' ? -1.0 : 1.0);
    this.sold = [];
    this.cols = 1;
    this.vida = 0.0;
    this.vida_max = 1.0;
    this.ia = time === 'vermelho';
    this.mun = 1.0;             // fase 4: munição (1 = cheia)
    this.s = 0.0;               // IA: distância já andada na rota
    this.destino = null;        // jogador: para onde andar
    this.caminho = [];          // pontos intermediários, inclusive estrada
    this.perseguir = null;      // inimigo selecionado como alvo da ordem
    this.fundir = null;         // esquadrão amigo da mesma classe
    this._estrada_t = 0.0;
    this._na_estrada = false;
    this.alvo = null;
    this.movendo = false;
    this.treinando = 0;         // soldados que ainda vão sair da base
    this.relogio = 0.0;
    this.porta = null;          // de onde saem os soldados em treino
    this.rota = null;           // IA: caminho de ataque
    this.atacando = false;      // IA: false = ainda no ponto de preparo
    this.reforco_vida = 1.0;    // IA: vida extra das ondas avançadas (canhão)
    this.cool_arma = 1.5;       // canhão: tempo até o próximo disparo
    this.recuo = 0.0;           // canhão: 1 = acabou de atirar
    this.tempo_desembarque = C.INTERVALO_DESEMBARQUE;
    this.recarregou = false;    // canhão: já tocou o som de recarga deste tiro
    // Campos usados depois (limite das bases, tropa de base destruída,
    // multiplayer). Declarados aqui pelo mesmo motivo do Soldado: formato
    // interno único -> o código quente fica otimizado (sem "wrong map").
    this.da_base = false;       // saiu de uma base (conta no limite de drop)
    this.da_carta = false;      // comprada por carta (conta no limite de 3 por tipo)
    this.exclusa = false;       // tropa de base destruída (não junta, não conta no limite)
    this.valor = 0;             // multiplayer: moedas que a tropa vale
    this.id = undefined;        // multiplayer: identificação
    this._ax = x; this._ay = y; this._bx = x; this._by = y;   // aparelho: interpolação
    this._ahx = this.hx; this._ahy = this.hy; this._bhx = this.hx; this._bhy = this.hy;
    // treino de tropa
    this.nivel_treino = 0;      // 0 = comum; 1 = transformada pelo treino (mostra "2V")
    this.t_treino = 0.0;        // segundos treinados rumo ao próximo nível
    this.treino = -1;           // nº do campo onde está treinando (-1 = nenhum)
    this._drill = 0.0;          // relógio do exercício dentro do campo
    this._perna = 0;            // qual parte do exercício (marcha / tiro ao alvo)
    // IA do solo
    this.papel = '';            // '', 'grupo', 'ataque', 'defesa', 'fuga', 'treino', 'raide'
    this.fuga = false;          // recuando: não para para lutar até chegar em casa
    this.reacao = false;        // está indo até quem atirou nela (reação automática)
    this.bloqueio = null;       // barricada inimiga que barra o caminho (ataca ela)
    this.t_reacao = 0.0;        // relógio da última reação (para não refazer a ordem a cada tiro)
    this.levou_dano = 0.0;      // último instante (tempo de jogo) em que perdeu vida
  }

  peca() {
    // onde fica o canhão: à frente da equipe
    return [this.x + this.hx * 0.9, this.y + this.hy * 0.9];
  }

  raio() {
    return this.cols * C.ESPACO * 0.72 + 0.6;
  }

  alcance() {
    // treinada: atirador de elite e incendiário alcançam o dobro
    const a = C.PELOTOES[this.tipo].alcance;
    if (this.nivel_treino >= 1) {
      if (this.tipo === 'pelotao') return a * C.ELITE_ALCANCE;
      if (this.tipo === 'granada') return a * C.INCENDIO_ALCANCE;
    }
    return a;
  }

  alcance_base() { return C.PELOTOES[this.tipo].alcance; }
}

const _SEM_SOLDADOS = Object.freeze([]);

export class Base {
  constructor(time, x, y, alt, principal = true) {
    this.base = true;
    this.sold = _SEM_SOLDADOS;
    this.time = time; this.x = x; this.y = y;
    this.principal = principal;  // a principal decide o jogo; as extras só produzem
    this.vida = this.vida_max = principal ? C.VIDA_BASE : C.VIDA_BASE_EXTRA;
    this.alt = alt;             // altura (px) onde fica a barra de vida
    this.cool = 0.0;
    this.t_moeda = 0.0;
    this.t_tropa = 0.0;
    this.carta = 'pelotao';     // a carta que esta base solta (o jogador escolhe)
    // DECK (só a base 2 e a base 3 de quem joga): 3 cartas escolhidas uma vez
    // no começo; a base só solta uma delas (e só depois de liberada pelo QG)
    this.deck_base = 0;         // 0 = sem deck (QG, bases compradas, IA); 2 ou 3 = número da base
    this.deck = null;           // [tipo, tipo, tipo] depois de escolhido
    // descrição para o objetos.js desenhar as bases extras
    this.o = { tipo: 'base', time, x, y, eixo: 'x' };
  }
}

export class Caminhao {
  // fase 5: caminhão de logística. Para o inimigo é um "prédio" que anda
  // (alvo como as torres); leva caixas de uma base para outra sozinho.
  constructor(time, x, y, id = 0) {
    this.time = time; this.x = x; this.y = y; this.id = id;
    this.base = true; this.caminhao = true; this.principal = false;
    this.sold = _SEM_SOLDADOS;
    this.vida = this.vida_max = C.CAMINHAO_VIDA;
    this.hx = time === 'verde' ? -0.7071 : 0.7071; this.hy = this.hx;
    this.carga = {}; for (const k of C.ITENS) this.carga[k] = 0;
    this.carga_total = 0;
    this.de = null;      // base onde carrega
    this.para = null;    // base onde descarrega
    this.alvo_b = null;  // para qual base está indo agora
    this.caminho = []; this.destino = null;
    this.t_op = 0;       // relógio de carga/descarga
    this.estado = 'parado';   // parado | indo_carregar | carregando | indo_descarregar | descarregando | esperando
  }
}

export class Traco {
  // traçante: o tiro viajando até o alvo
  constructor(x0, y0, x1, y1, alvo, dano, z0, z1) {
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.t = 0.0;
    this.dur = (hip(x1 - x0, y1 - y0) || 1.0) / 24;
    this.alvo = alvo; this.dano = dano; this.z0 = z0; this.z1 = z1;
    this.zuniu = false;
    this.fura = false;   // fura a blindagem do tanque (só o tiro da torre)
    this.perfura = false; // bala do atirador de elite: atravessa e acerta quem está atrás
    this.sobra = 0.0;     // até onde a bala ainda vai depois do alvo
    this.so_visual = false;
  }
}

export class Torre {
  // torre de defesa: fica parada e lança granadas em série no inimigo
  constructor(time, x, y, id = 0) {
    this.time = time; this.x = x; this.y = y; this.id = id;
    this.base = true;   // para o inimigo, é um prédio: mira e dano de base
    this.torre = true;
    this.principal = false;
    this.vida = this.vida_max = C.VIDA_TORRE;
    this.cd = 0.0;      // espera até a próxima granada
    this.cd_tiro = 0.0; // espera até o próximo tiro comum (anel vermelho)
    this.n = 0;         // quantas granadas já saíram nesta série
    this.hx = time === 'verde' ? -0.7071 : 0.7071;   // para onde o morteiro aponta
    this.hy = time === 'verde' ? -0.7071 : 0.7071;
    this.recuo = 0.0;   // coice do disparo (só animação)
    this.idade = 0.0;   // segundos desde que foi construída (mostra o alcance no começo)
  }
}

export class Barricada {
  // obstáculo de madeira e arame farpado; para o inimigo, é um "prédio" que ele
  // só ataca quando ela barra a estrada ou não há como dar a volta
  constructor(time, x, y, ang, id = 0) {
    this.time = time; this.x = x; this.y = y; this.id = id;
    this.ang = ang;
    this.ux = Math.cos(ang); this.uy = Math.sin(ang);
    this.base = true; this.barreira = true; this.principal = false;
    this.vida = this.vida_max = C.VIDA_BARRICADA;
    this.estrada = M.dist_estrada(x, y) <= 2.2;   // em cima de estrada: quem vem pela estrada ataca
    this.idade = 0.0;
  }
  pontas() {
    const m = C.BARRICADA_COMP / 2;
    return [this.x - this.ux * m, this.y - this.uy * m, this.x + this.ux * m, this.y + this.uy * m];
  }
}

// tira da lista (no lugar, mesma ordem) quem não passa no teste: o mesmo que
// "lista = lista.filter(teste)", mas sem criar lista nova a cada passo
function _compactar(lista, fica) {
  let w = 0;
  for (let r = 0; r < lista.length; r++) { const v = lista[r]; if (fica(v)) lista[w++] = v; }
  lista.length = w;
}

function _dist_seg(px, py, ax, ay, bx, by) {
  // distância de um ponto ao segmento AB
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy || 1e-9;
  let t = ((px - ax) * vx + (py - ay) * vy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

function _segs_perto(a0x, a0y, a1x, a1y, b0x, b0y, b1x, b1y) {
  // distância entre dois segmentos (0 se cruzam)
  const cruza = (ax, ay, bx, by, cx, cy, dx, dy) => {
    const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  if (cruza(a0x, a0y, a1x, a1y, b0x, b0y, b1x, b1y)) return 0;
  return Math.min(_dist_seg(a0x, a0y, b0x, b0y, b1x, b1y), _dist_seg(a1x, a1y, b0x, b0y, b1x, b1y),
    _dist_seg(b0x, b0y, a0x, a0y, a1x, a1y), _dist_seg(b1x, b1y, a0x, a0y, a1x, a1y));
}

export function angulo_barricada(J, time, x, y) {
  // perto de uma estrada: atravessada nela (barra a passagem); longe: de frente para o inimigo
  let melhor = null, md = Infinity;
  for (const nome in M.ROTAS) {
    const r = M.ROTAS[nome];
    const p = r.em(r.s_perto(x, y));
    const d = hip(p[0] - x, p[1] - y);
    if (d < md) { md = d; melhor = p; }
  }
  if (melhor && md <= 4) return Math.atan2(melhor[3], melhor[2]) + Math.PI / 2;
  const alvo = time === 'verde' ? J.bases.vermelho : J.bases.verde;
  return Math.atan2(alvo.y - y, alvo.x - x) + Math.PI / 2;
}

export function lugar_barricada(J, time, x, y) {
  // no seu território (pode em cima de estrada), fora dos campos de treino e
  // sem encostar em base, torre ou outra barricada
  if (M.dono(x, y) !== time || Math.abs(x - y) > C.CENA_U - 3 || Math.abs(x + y) > C.CENA_V - 4) return false;
  if (M.area_em(time, x, y)) return false;
  for (const b of J.todas_bases()) if (b.vida > 0 && hip(b.x - x, b.y - y) < 3.2) return false;
  for (const o of J.torres) if (hip(o.x - x, o.y - y) < 2.2) return false;
  for (const o of J.barricadas) if (hip(o.x - x, o.y - y) < 1.4) return false;
  return true;
}

export class Granada {
  // projétil em arco, como munição de morteiro: sobe, desce e explode
  constructor(x0, y0, x1, y1, time, dano, z0 = 0.5) {
    const d = hip(x1 - x0, y1 - y0);
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.t = 0.0;
    this.dur = 1.1 + d * 0.07;        // quanto mais longe, mais tempo no ar
    this.apice = 2.5 + d * 0.22;      // e mais alto o arco
    this.time = time; this.dano = dano;
    this.assobiou = false;
    this.z0 = z0;                     // altura de onde saiu (0.5 = da mão; mais alto = da torre)
  }

  pos(t = null) {
    t = t === null ? this.t : t;
    return [this.x0 + (this.x1 - this.x0) * t, this.y0 + (this.y1 - this.y0) * t,
      this.z0 * (1 - t) + 4 * this.apice * t * (1 - t)];
  }
}

export class Obus {
  // tiro do canhão: rápido e quase reto
  constructor(x0, y0, x1, y1, alvo, time, dano) {
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.t = 0.0;
    this.dur = Math.max(0.15, hip(x1 - x0, y1 - y0) / C.VEL_OBUS);
    this.alvo = alvo; this.time = time; this.dano = dano;
    this.zuniu = false;
    this.atingidos = new Set();
    this.incendio = false;   // bomba incendiária (granadeiro treinado, anel de fora)
    this.dono = null;        // a tropa que jogou (limite de círculos acesos)
  }

  pos(t = null) {
    t = t === null ? this.t : t;
    return [this.x0 + (this.x1 - this.x0) * t, this.y0 + (this.y1 - this.y0) * t,
      0.6 * (1 - t) + 0.3 * t + 2.4 * t * (1 - t)];
  }
}

// fila de prioridade mínima (heapq) para o caminho pelas estradas
class Monte {
  constructor() { this.h = []; }
  get tamanho() { return this.h.length; }
  static menor(a, b) { return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]); }
  por(item) {
    const h = this.h;
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!Monte.menor(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }
  tirar() {
    const h = this.h;
    const topo = h[0];
    const ult = h.pop();
    if (h.length) {
      h[0] = ult;
      let i = 0;
      for (;;) {
        const e = 2 * i + 1, d = e + 1;
        let m = i;
        if (e < h.length && Monte.menor(h[e], h[m])) m = e;
        if (d < h.length && Monte.menor(h[d], h[m])) m = d;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return topo;
  }
}

export class Tropas {
  constructor(som) {
    this.som = som;
    this.iniciar();
  }

  // ---------- início ------------------------------------------------
  iniciar() {
    this.t_jogo = 0.0;          // relógio da partida (reação, avisos)
    this.modo = 'normal';       // 'normal' (versus IA) ou 'zumbi' (configurar liga)
    this.horda = null;          // modo zumbi: a horda (zumbis.js)
    this.esquadroes = [];
    this._esq_ver = (this._esq_ver || 0) + 1;   // muda sempre que a lista de esquadrões muda (grade espacial)
    this._grade = this._grade || new GradeEsquadroes();
    this.treino_ocup = { verde: [null, null, null], vermelho: [null, null, null] };   // quem treina em cada campo
    this.torres = [];           // torres de defesa (dos dois times)
    this.zonas_fogo = [];       // círculos de fogo da bomba incendiária
    this.barricadas = [];       // barricadas de arame farpado (dos dois times)
    this.ganhos_pf = [];        // "+3 parafusos" subindo do campo de treino: [x, y, time, t]
    this.t_pf_campo = { verde: [0, 0, 0], vermelho: [0, 0, 0] };   // relógio de parafusos de cada campo de treino
    this.melh_base = { verde: { bvida: 0, tdano: 0, tvel: 0, tpf: 0 }, vermelho: { bvida: 0, tdano: 0, tvel: 0, tpf: 0 } };   // fase 3: melhorias da base (moedas)
    this.presos = [];           // fase 2: tropas abatidas no campo inimigo, esperando resgate {time, tipo, x, y, n, t}
    this.fila_treino = { verde: [], vermelho: [] };   // fase 2: tropas que caíram no próprio campo e esperam um campo de treino {tipo, n}
    this.campo_invadido = { verde: [null, null, null], vermelho: [null, null, null] };   // tropa inimiga dentro do campo (ele para de render)
    this.reparos = [];          // chavinha "+" subindo da construção consertada: [x, y, time, t]
    this._t_avanco = 0.0;       // relógio da renda de avanço
    this._resto_avanco = { verde: 0, vermelho: 0 };   // frações de moeda guardadas
    this._id_barr = 0;
    this._id_torre = 0;
    this._tempo_autofusao = 0.0;
    this.caidos = [];       // soldados caindo (só animação)
    this.tracos = [];
    this.sopros = [];       // [x, y, z, t] sopro de neve no impacto
    this.flutuantes = [];   // [x, y, texto, t] "+moedas" subindo
    this.granadas = [];     // projéteis de morteiro no ar
    this.obuses = [];       // tiros de canhão no ar
    this.heli_granadas = [];  // munições aéreas retas
    this.tanque_tiros = [];  // projéteis do tanque em voo
    this.efeitos_tanque = new efeitos_tanque.Efeitos();
    this._tanques_anteriores = new Map();
    this.desembarques = [];
    this.foguetes = [];     // foguetes em voo; impacto somente na chegada
    this.explosoes = [];    // [x, y, t, semente, escala]
    this.fogos = [];        // [x, y, t, duração, fase, tamanho] mini foguinhos
    this.marcas = [];       // [x, y, t] chão queimado
    this._podia = [];       // quais cartas dava para pagar no quadro anterior
    this.selecionado = null;
    this.fim = null;        // 'vitoria' | 'derrota'
    this.deu_ordem = false;
    // economia
    this.moedas = C.MOEDAS_INICIAIS;   // use Math.trunc(moedas) para mostrar
    this.moedas_ia = C.MOEDAS_INICIAIS;   // o caixa do inimigo: começa igual ao seu
    this.parafusos = { verde: C.PARAFUSOS_INICIAIS, vermelho: C.PARAFUSOS_INICIAIS };   // o recurso das bases
    this.nivel_qg_ia = 0;
    this.nivel_ia = {};                   // melhorias da loja do inimigo
    for (const m of C.ORDEM_LOJA) this.nivel_ia[m] = 0;
    this.hab_nivel_ia = {};               // habilidades por tropa do inimigo
    for (const tipo of C.ORDEM_CARTAS) {
      this.hab_nivel_ia[tipo] = {};
      for (const m of C.ORDEM_HAB) this.hab_nivel_ia[tipo][m] = 0;
    }
    this.bases_feitas_ia = 0;
    this.frente_versao = 0;               // muda quando a linha de frente anda (a tela redesenha)
    this.cmd = null;                      // o comandante do inimigo (só no solo)
    this.limite_tropas = 0;               // 0 = conta antiga (QG); senão, o escolhido na tela de partida
    this.dificuldade = 1;                 // IA 1, 2 ou 3
    this.defesa_extra = { verde: 0, vermelho: 0 };
    this.nivel = {};
    for (const m of C.ORDEM_LOJA) this.nivel[m] = 0;
    this.onda = 0;
    // multiplicadores por time (as melhorias mexem só no verde)
    this.mult = {
      verde: { dano: 1.0, vida: 1.0, vel: 1.0, cad: 1.0, prod: 1.0 },
      vermelho: { dano: 1.0, vida: 1.0, vel: 1.0, cad: 1.0, prod: 1.0 },
    };
    // habilidades por tipo de tropa: multiplicadores e níveis
    this.hab = {};
    for (const time of ['verde', 'vermelho']) {
      this.hab[time] = {};
      for (const tipo of C.ORDEM_CARTAS) this.hab[time][tipo] = { dano: 1.0, vida: 1.0, vel: 1.0, cad: 1.0 };
    }
    this.hab_nivel = {};   // do jogador (verde)
    for (const tipo of C.ORDEM_CARTAS) {
      this.hab_nivel[tipo] = {};
      for (const m of C.ORDEM_HAB) this.hab_nivel[tipo][m] = 0;
    }
    this.bases = {
      vermelho: new Base('vermelho', M.BASES.vermelho[0], M.BASES.vermelho[1], 150),
      verde: new Base('verde', M.BASES.verde[0], M.BASES.verde[1], 92),
    };
    this.extras = [];           // bases extras (dos dois times)
    // cada lado já começa com 2 bases extras (3 contando a principal)
    for (const time of ['vermelho', 'verde']) {
      for (const [x, y] of M.BASES_INICIAIS[time]) { const bi = new Base(time, x, y, 92, false); bi.inicial = true; this.extras.push(bi); }   // base 2 e 3 (soltam tropa)
    }
    this._marcar_decks(['verde']);   // no solo só você escolhe deck (a IA segue como era)
    // fase 4: ESTOQUE das bases e fila da REFINARIA
    for (const b of this.todas_bases()) b.estoque = Object.assign({}, b.principal ? C.ESTOQUE_QG : C.ESTOQUE_BASE);
    this.refinaria = { verde: [], vermelho: [] };
    // fase 5: caminhões (começam ao lado do QG)
    this.caminhoes = []; this._id_cam = 0;
    for (const time of ['verde', 'vermelho']) for (let i = 0; i < C.CAMINHAO_INICIAIS; i++) this._novo_caminhao(time);
    this.nivel_qg = 0;
    M.definir_avanco(0.0);
    this.bases_feitas = 0;      // quantas você já construiu (o preço sobe)
    this.reservas = [];         // pelotões gerados pelas bases inimigas, esperando a próxima onda
    // você começa com duas tropas perto da base; o inimigo começa sem nada no campo
    for (const [x, y] of M.INICIO_VERDE) {
      this._organizar(this._criar('verde', x, y, 40), true);
    }
    // ondas do inimigo
    this.fase = 'descanso';     // 'descanso' -> 'preparando' -> (lança) -> 'descanso' ...
    this.espera = 40;           // a primeira onda do inimigo: dá tempo de você se arrumar
    this.onda_fila = [];        // pelotões que ainda faltam treinar nesta onda
    this.onda_sq = [];          // tropas desta onda já no ponto de preparo
    this.onda_total = 0;
    this.aviso_onda = 0.0;      // s mostrando "onda a caminho"
    this._tique = 0;            // último segundo da contagem que já tocou
    this.som.tocar('inicio');
  }

  hp(time, tipo = 'pelotao') {
    // vida que cada soldado representa
    return HP * this.mx(time, tipo, 'vida') * this._bonus_base(time) * C.PELOTOES[tipo].vida;
  }

  _criar(time, x, y, n, tipo = 'pelotao') {
    const sq = new Esquadrao(time, x, y, tipo);
    sq.vida = n * this.hp(time, tipo);
    sq.vida_max = Math.max(1.0, sq.vida);
    for (let i = 0; i < n; i++) sq.sold.push(new Soldado(x, y, time, tipo));
    this.esquadroes.push(sq);
    this._esq_ver++;
    return sq;
  }

  mx(time, tipo, k) {
    // multiplicador do time (dificuldade da IA, produção) x habilidade do tipo de tropa
    const h = this.hab[time][tipo];
    return this.mult[time][k] * (h ? h[k] : 1.0);
  }

  _mtr(sq, k, com_bonus) {
    // multiplicador da tropa com o TREINO: cada nível soma 10% do VALOR BASE
    // (não 10% do valor já melhorado). Sem treino, é exatamente o de antes.
    const base = com_bonus ? this.mx(sq.time, sq.tipo, k) * this._bonus_base(sq.time) : this.mx(sq.time, sq.tipo, k);
    const L = sq.nivel_treino;
    if (k === 'dano') return this._mtr_sem_mun(sq, k, com_bonus, base, L) * this._fator_mun(sq);   // fase 4: sem munição, dano menor
    if (!L) return base;
    const time = this.mult[sq.time][k];
    if (k === 'cad') return 1 / (1 / base + C.TREINO_BONUS * L / time);   // recarga: +10% de ritmo por nível
    return base + time * C.TREINO_BONUS * L;
  }

  _vida_treino(sq, L) {
    // fator de vida da tropa no nível L (mesma conta do _mtr para 'vida')
    const base = this.mx(sq.time, sq.tipo, 'vida') * this._bonus_base(sq.time);
    return L ? base + this.mult[sq.time].vida * C.TREINO_BONUS * L : base;
  }

  // ---------- habilidades por tipo de tropa ---------------------------
  custo_hab(tipo, m) { return C.custo_hab(m, this.hab_nivel[tipo][m]); }

  _aplicar_hab(time, tipo, m, n) {
    const h = this.hab[time][tipo];
    const antes = h[m];
    h[m] = C.mult_hab(m, n);
    if (m === 'vida') {   // tropas desse tipo que já existem ganham a vida extra na hora
      for (let _i1 = 0, _a1 = this.esquadroes; _i1 < _a1.length; _i1++) {
        const sq = _a1[_i1];
        if (sq.time === time && sq.tipo === tipo) {
          if (sq.nivel_treino) {   // treinada: o treino soma no valor base, então a conta é outra
            const b = this._bonus_base(time), t = this.mult[time].vida, L = sq.nivel_treino * C.TREINO_BONUS;
            const f = (t * h.vida * b + t * L) / (t * antes * b + t * L);
            sq.vida *= f;
            sq.vida_max *= f;
          } else {
            sq.vida *= h.vida / antes;
            sq.vida_max *= h.vida / antes;
          }
        }
      }
    }
  }

  comprar_hab(tipo, m) {
    const nv = this.hab_nivel[tipo];
    if (this.fim || !nv || !(m in nv) || !this.carta_desbloqueada(tipo) || nv[m] >= C.NIVEL_MAX ||
      this.moedas < this.custo_hab(tipo, m)) {
      this.som.tocar('erro');
      return false;
    }
    this.moedas -= this.custo_hab(tipo, m);
    nv[m] += 1;
    this._aplicar_hab('verde', tipo, m, nv[m]);
    this.som.tocar(nv[m] >= C.NIVEL_MAX ? 'nivel_max' : 'compra');
    return true;
  }

  // ---------- limite do que as bases soltam ---------------------------
  _nivel_qg_de(time) { return time === 'verde' ? this.nivel_qg : this.nivel_qg_ia; }

  drop_vivos(time, tipo) {
    // tropas desse tipo, soltas pelas bases, ainda vivas (ou saindo da base)
    let n = 0;
    for (let _i2 = 0, _a2 = this.esquadroes; _i2 < _a2.length; _i2++) {
      const q = _a2[_i2];
      if (q.da_base && q.time === time && q.tipo === tipo && (q.vida > 0 || q.treinando)) n++;
    }
    return n;
  }

  limite_drop(time, tipo) { return C.limite_drop(tipo, this._nivel_qg_de(time)); }

  carta_vivos(time, tipo) {
    // tropas desse tipo compradas por carta, ainda vivas
    let n = 0;
    for (let i = 0; i < this.esquadroes.length; i++) {
      const q = this.esquadroes[i];
      if (q.da_carta && q.time === time && q.tipo === tipo && (q.vida > 0 || q.treinando)) n++;
    }
    return n;
  }
  limite_carta() { return C.LIMITE_CARTA; }

  vivos_tipo(time, tipo) {
    // tropas desse tipo no mapa (soltas pelas bases, compradas, treinando ou ainda chegando).
    // Conta pelo número de soldados (tropa cheia = 1): juntar duas tropas não abre vaga nova
    const cheia = C.PELOTOES[tipo].soldados;
    let n = 0;
    for (let i = 0; i < this.esquadroes.length; i++) {
      const q = this.esquadroes[i];
      if (q.time !== time || q.tipo !== tipo || q.exclusa) continue;
      const s = q.sold.length + q.treinando;
      if (s > 0) n += Math.ceil(s / cheia - 1e-9);
    }
    return n;
  }
  limite_mapa(tipo) { return C.limite_mapa(tipo); }

  // ---------- GPS da base: ponto de reunião ------------------------------
  pode_soltar(b) { return !!b && (b.principal || !!b.deck_base || !!b.inicial); }   // só o QG, a base 2 e a base 3 soltam tropa
  definir_reuniao(b, x, y) {
    // as tropas que esta base soltar vão sozinhas até (x, y) e ficam defendendo ali
    if (!b || b.time !== 'verde' || !this.pode_soltar(b) || Math.abs(x - y) >= C.CENA_U - 2 || Math.abs(x + y) >= C.CENA_V - 3) {
      this.som.tocar('erro');
      return false;
    }
    b.reuniao = [x, y];
    this.som.tocar('ordem');
    return true;
  }

  // ---------- PARAFUSOS (o recurso das bases) ------------------------------
  _pagar_parafusos(b, tipo) {
    const custo = C.PARAFUSO_CUSTO[tipo] || 0;
    if (this.parafusos[b.time] < custo) { b.falta_pf = custo; return false; }
    this.parafusos[b.time] -= custo;
    b.falta_pf = 0;
    return true;
  }

  // ---------- deck da base 2 e da base 3 ----------------------------------
  _marcar_decks(times) {
    // as duas bases iniciais de cada time viram "base 2" (esquerda de quem
    // joga) e "base 3" (direita); o vermelho vê o mapa girado
    for (const time of times) {
      const bs = this.extras.filter(b => b.time === time);
      bs.sort((a, b) => (a.x - a.y) - (b.x - b.y));
      if (time === 'vermelho') bs.reverse();
      bs.forEach((b, i) => { if (i < 2) b.deck_base = 2 + i; });
    }
  }

  deck_ocupado(b, tipo) {
    // a carta já está no deck da outra base do mesmo time?
    for (const o of this.todas_bases()) {
      if (o !== b && o.time === b.time && o.deck && o.deck.includes(tipo)) return o;
    }
    return null;
  }

  _deck_valido(b, cartas) {
    if (!b || !b.deck_base || b.deck || !Array.isArray(cartas) || cartas.length !== 3) return false;
    if (new Set(cartas).size !== 3) return false;
    return cartas.every(k => (k in C.PELOTOES) && !this.deck_ocupado(b, k));
  }

  _aplicar_deck(b, cartas, liberada) {
    b.deck = cartas.slice();
    b.carta = cartas.find(liberada) || cartas[0];   // começa pela primeira já liberada
    b.t_tropa = 0.0;
  }

  definir_deck(b, cartas) {
    // escolhe (uma vez só) as 3 cartas do deck da base 2 / base 3
    if (!b || b.time !== 'verde' || !this._deck_valido(b, cartas)) {
      this.som.tocar('erro');
      return false;
    }
    this._aplicar_deck(b, cartas, k => this.carta_desbloqueada(k));
    this.som.tocar('compra');
    return true;
  }

  _tipo_da_base(b, liberada) {
    // o que a base solta agora (null = nada: sem deck ainda, ou deck todo bloqueado)
    if (!b.deck_base) return liberada(b.carta) ? b.carta : 'pelotao';
    if (!b.deck) return null;
    if (b.deck.includes(b.carta) && liberada(b.carta)) return b.carta;
    return b.deck.find(liberada) || null;
  }

  escolher_carta(b, tipo) {
    // o jogador escolhe a carta que uma base dele solta
    if (!b || b.time !== 'verde' || !this.carta_desbloqueada(tipo) || (b.deck_base && !(b.deck && b.deck.includes(tipo)))) {
      this.som.tocar('erro');
      return false;
    }
    b.carta = tipo;
    this.som.tocar('carta_pega');
    return true;
  }

  // ---------- loja --------------------------------------------------
  custo(m) {
    return Math.trunc(C.MELHORIAS[m].custo * C.CUSTO_FATOR ** this.nivel[m] + 0.5);
  }

  comprar(m) {
    if (this.fim || this.nivel[m] >= C.NIVEL_MAX || this.moedas < this.custo(m)) {
      this.som.tocar('erro');
      return false;
    }
    this.moedas -= this.custo(m);
    this.nivel[m] += 1;
    if (this.nivel[m] >= C.NIVEL_MAX) this.som.tocar('nivel_max');
    const n = this.nivel[m], passo = C.MELHORIAS[m].passo, mv = this.mult.verde;
    const antes = mv[m];
    mv[m] = (m === 'cad' || m === 'prod') ? (1 - passo) ** n : 1 + passo * n;   // cad/prod = tempo menor
    if (m === 'vida') {   // tropas que já existem ganham a vida extra na hora
      for (let _i3 = 0, _a3 = this.esquadroes; _i3 < _a3.length; _i3++) {
        const sq = _a3[_i3];
        if (sq.time === 'verde') {
          sq.vida *= mv.vida / antes;
          sq.vida_max *= mv.vida / antes;
        }
      }
    }
    this.som.tocar('compra');
    return true;
  }

  // ---------- cartas de pelotão -------------------------------------
  limite_soldados() {
    if (this.limite_tropas) return this.limite_tropas;   // escolhido na tela de nova partida
    return C.LIMITE_INICIAL + this.nivel_qg * C.LIMITE_POR_NIVEL;
  }

  configurar({ limite = 0, ia = 1, modo = 'normal' } = {}) {
    // a tela de NOVA PARTIDA (solo): limite de tropas e dificuldade da IA
    this.limite_tropas = C.LIMITES_TROPA.includes(limite) ? limite : 0;
    this.dificuldade = [1, 2, 3].includes(ia) ? ia : 1;
    if (modo === 'zumbi') { this._ligar_modo_zumbi(); return; }
    if (this.dificuldade >= 2) this.moedas_ia = C.IA2_MOEDAS;   // IA 2: caixa grande e gasta bem
    if (this.dificuldade >= 3) {                              // IA 3: tropas já melhoradas
      this.mult.vermelho.dano *= C.IA3_DANO;
      this.defesa_extra.vermelho = C.IA3_DEFESA;
    }
  }

  _ligar_modo_zumbi() {
    // VERSUS ZUMBI: o seu lado fica igual; do outro lado somem as bases e o
    // comandante, e o QG vermelho vira a NAVE CAÍDA de onde sai a horda
    this.modo = 'zumbi';
    this.extras = this.extras.filter(b => b.time !== 'vermelho');
    const nave = this.bases.vermelho;
    nave.nave = true;
    nave.vida = nave.vida_max = ZUMBI.NAVE_VIDA;
    nave.alt = 150;
    this.reservas = [];
    this.caminhoes = [];   // fase 4/5: sem munição no modo zumbi, sem logística
    this.horda = new Horda(this, this.dificuldade);
  }

  defesa_de(sq) {
    return Math.min(C.DEFESA_MAX, (C.DEFESA[sq.tipo] || 0) + (this.defesa_extra[sq.time] || 0));
  }

  custo_qg() {
    return Math.trunc(C.CUSTO_QG * 1.65 ** this.nivel_qg);
  }

  melhorar_qg() {
    if (this.nivel_qg >= C.NIVEL_QG_MAX || this.moedas < this.custo_qg()) {
      this.som.tocar('erro');
      return false;
    }
    this.moedas -= this.custo_qg();
    this.nivel_qg += 1;
    this._avanco();
    this.som.tocar('compra');
    return true;
  }

  _avanco() {
    // Cada nível do QG empurra a fronteira 10% da profundidade inicial do
    // território adversário. O QG do inimigo empurra de volta: vale a diferença.
    M.definir_avanco((this.nivel_qg - this.nivel_qg_ia) * (C.CENA_U * 0.10));
    this.frente_versao++;
  }

  // ---------- a mesma loja, as mesmas cartas e os mesmos preços para a IA ----------
  ia_desbloqueada(tipo) { return (tipo in C.PELOTOES) && this.nivel_qg_ia >= C.DESBLOQUEIO_CARTAS[tipo]; }
  ia_limite_soldados() { return this.limite_tropas || C.LIMITE_INICIAL + this.nivel_qg_ia * C.LIMITE_POR_NIVEL; }
  ia_custo_qg() { return Math.trunc(C.CUSTO_QG * 1.65 ** this.nivel_qg_ia); }
  ia_custo(m) { return Math.trunc(C.MELHORIAS[m].custo * C.CUSTO_FATOR ** this.nivel_ia[m] + 0.5); }
  ia_custo_hab(tipo, m) { return C.custo_hab(m, this.hab_nivel_ia[tipo][m]); }

  ia_pode_por(x, y) {
    return (M.dono(x, y) === 'vermelho' && Math.abs(x - y) < C.CENA_U - 2 && Math.abs(x + y) < C.CENA_V - 3);
  }

  ia_carta_pronta(tipo) {
    return this.ia_desbloqueada(tipo) && this.parafusos.vermelho >= C.PF_CARTA[tipo] &&
      this._soldados('vermelho') + C.vagas(tipo) <= this.ia_limite_soldados() &&
      this.vivos_tipo('vermelho', tipo) < C.limite_mapa(tipo);
  }

  ia_carta(tipo, x, y) {
    // o inimigo joga uma carta, como você: paga em parafusos e a tropa chega em (x, y) depois de 1 minuto
    if (this.fim || !this.ia_carta_pronta(tipo) || !this.ia_pode_por(x, y)) return null;
    this.parafusos.vermelho -= C.PF_CARTA[tipo];
    const sq = this._chegando('vermelho', tipo, x, y);
    sq.hx = 0.7071; sq.hy = 0.7071;
    return sq;
  }

  _chegando(time, tipo, x, y) {
    // tropa comprada: fica marcada no chão e só aparece depois de C.CHEGADA segundos
    const sq = this._criar(time, x, y, 0, tipo);
    const n = C.PELOTOES[tipo].soldados;
    sq.da_carta = true;
    sq.treinando = n;
    sq.chega = C.CHEGADA;
    sq.porta = [x, y];
    sq.vida_max = n * this.hp(time, tipo);
    return sq;
  }

  ia_qg() {
    if (this.fim || this.nivel_qg_ia >= C.NIVEL_QG_MAX || this.moedas_ia < this.ia_custo_qg()) return false;
    this.moedas_ia -= this.ia_custo_qg();
    this.nivel_qg_ia += 1;
    this._avanco();
    const fl = [this.bases.vermelho.x, this.bases.vermelho.y, 'QG INIMIGO N' + this.nivel_qg_ia, 0.0];
    this.flutuantes.push(fl);
    this.som.tocar('preparo', this.bases.vermelho.x, this.bases.vermelho.y);
    return true;
  }

  ia_melhoria(m) {
    if (this.fim || this.nivel_ia[m] >= C.NIVEL_MAX || this.moedas_ia < this.ia_custo(m)) return false;
    this.moedas_ia -= this.ia_custo(m);
    this.nivel_ia[m] += 1;
    const n = this.nivel_ia[m], passo = C.MELHORIAS[m].passo, mv = this.mult.vermelho;
    const antes = mv[m];
    mv[m] = (m === 'cad' || m === 'prod') ? (1 - passo) ** n : 1 + passo * n;
    if (m === 'vida') {
      for (const sq of this.esquadroes) if (sq.time === 'vermelho') { sq.vida *= mv.vida / antes; sq.vida_max *= mv.vida / antes; }
    }
    return true;
  }

  ia_hab(tipo, m) {
    const nv = this.hab_nivel_ia[tipo];
    if (this.fim || !nv || !(m in nv) || !this.ia_desbloqueada(tipo) || nv[m] >= C.NIVEL_MAX ||
      this.moedas_ia < this.ia_custo_hab(tipo, m)) return false;
    this.moedas_ia -= this.ia_custo_hab(tipo, m);
    nv[m] += 1;
    this._aplicar_hab('vermelho', tipo, m, nv[m]);
    return true;
  }

  ia_base(x, y) {
    if (this.fim || this.bases_feitas_ia >= C.MAX_BASES_EXTRA || this.moedas_ia < this.custo_base('vermelho') ||
      !this.ia_pode_por(x, y) || M.dist_estrada(x, y) <= 2.4 ||
      !this.todas_bases().every(b => hip(b.x - x, b.y - y) >= C.DISTANCIA_BASES)) return false;
    this.moedas_ia -= this.custo_base('vermelho');
    this.bases_feitas_ia += 1;
    this._nova_base('vermelho', x, y);
    return true;
  }

  ia_torre(x, y) {
    if (this.fim || this.parafusos.vermelho < C.PF_TORRE || this.torres_de('vermelho') >= C.MAX_TORRES ||
      !this.ia_pode_por(x, y) || !this.lugar_torre('vermelho', x, y)) return false;
    this.parafusos.vermelho -= C.PF_TORRE;
    this._nova_torre('vermelho', x, y);
    return true;
  }

  _bonus_base(time) {
    let extras = 0;
    for (let _i4 = 0, _a4 = this.extras; _i4 < _a4.length; _i4++) { const b = _a4[_i4]; if (b.time === time && b.vida > 0) extras++; }
    return 1 + 0.10 * extras;
  }

  carta_desbloqueada(tipo) {
    // Níveis do QG: pelotão 0, granada 1, canhão 2, foguete 3.
    return (tipo in C.PELOTOES) && this.nivel_qg >= C.DESBLOQUEIO_CARTAS[tipo];
  }

  custo_carta(tipo) {
    return C.PELOTOES[tipo].custo;
  }

  carta_pronta(tipo) {
    // tem parafusos para esta carta e ainda cabe no limite do mapa?
    return (this.carta_desbloqueada(tipo) && this.parafusos.verde >= C.PF_CARTA[tipo] &&
      this._soldados('verde') + C.vagas(tipo) <= this.limite_soldados() &&
      this.vivos_tipo('verde', tipo) < C.limite_mapa(tipo));
  }

  pode_posicionar(x, y) {
    // só no SEU território (lado verde da linha de frente) e dentro do mapa
    return (M.dono(x, y) === 'verde' && Math.abs(x - y) < C.CENA_U - 2 && Math.abs(x + y) < C.CENA_V - 3);
  }

  posicionar(tipo, x, y) {
    // joga a carta: paga o custo e a tropa aparece em (x, y)
    const cheio = false;  // sem bloqueio artificial de quantidade de esquadrões
    if (this.fim || cheio || !this.carta_pronta(tipo) || !this.pode_posicionar(x, y)) {
      this.som.tocar('erro');
      return false;
    }
    this.parafusos.verde -= C.PF_CARTA[tipo];
    this._chegando('verde', tipo, x, y);   // aparece ali daqui a 1 minuto
    this.deu_ordem = true;
    this.som.tocar('carta');
    this.som.tocar('posicionar', x, y);
    return true;
  }

  // ---------- bases ---------------------------------------------------
  _soldados(time) {
    let n = 0;
    for (let _i5 = 0, _a5 = this.esquadroes; _i5 < _a5.length; _i5++) { const q = _a5[_i5]; if (q.time === time && !q.exclusa && q.tipo !== 'heli') n += (q.sold.length + q.treinando) * (C.PESO_SOLDADO[q.tipo] || 1); }   // tropa TERRESTRE: helicóptero não conta; a da base destruída também não; tanque vale 10
    return n;
  }

  todas_bases() {
    // (mesma lista e ordem de antes; montada sem iterador)
    const r = [this.bases.vermelho, this.bases.verde];
    for (let i = 0; i < this.extras.length; i++) r.push(this.extras[i]);
    return r;
  }

  tempo_tropa(b) {
    // segundos que esta base leva para gerar um pelotão
    return C.BASE_TEMPO_TROPA * this.mult[b.time].prod;
  }

  custo_base(time = 'verde') {
    const feitas = time === 'verde' ? this.bases_feitas : this.bases_feitas_ia;
    return Math.trunc(C.CUSTO_BASE * C.CUSTO_BASE_FATOR ** feitas + 0.5);
  }

  // ---------- torres de defesa -------------------------------------
  torres_de(time) {
    let n = 0;
    for (let i = 0; i < this.torres.length; i++) if (this.torres[i].time === time && !this.torres[i].graca) n++;   // a de graça não ocupa vaga
    return n;
  }

  custo_torre() { return C.PF_TORRE; }   // em PARAFUSOS

  lugar_torre(time, x, y) {
    // fora da estrada, fora dos campos de treino e longe de bases e de outras torres
    if (M.dist_estrada(x, y) <= 1.2 || M.area_em(time, x, y)) return false;
    for (let i = 0; i < this.torres.length; i++) {
      const o = this.torres[i];
      if (hip(o.x - x, o.y - y) < C.DISTANCIA_TORRES) return false;
    }
    return this.todas_bases().every(b => hip(b.x - x, b.y - y) >= C.DISTANCIA_TORRES + 0.5);
  }

  _nova_torre(time, x, y) {
    const t = new Torre(time, x, y, ++this._id_torre);
    this.torres.push(t);
    for (let i = 0; i < 6; i++) this.sopros.push([x + (rnd() - 0.5) * 2.5, y + (rnd() - 0.5) * 2.0, 0.1, 0.0]);
    this.som.tocar('construir', x, y);
    return t;
  }

  construir_torre(x, y) {
    if (this.fim || !this.pode_pagar('torre') || !this.pode_posicionar(x, y) || !this.lugar_torre('verde', x, y)) {
      this.som.tocar('erro');
      return false;
    }
    this.parafusos.verde -= C.PF_TORRE;
    this._nova_torre('verde', x, y);
    this.deu_ordem = true;
    return true;
  }

  _passo_torres(dt) {
    // anel amarelo (alcance 13): série de 3 granadas, uma por segundo, a cada 5 s.
    // anel vermelho (metade): tiro comum de soldado; em tanque, 25% de crítico (+50%).
    // Acerta também helicóptero. Com vida zero, a torre desaba.
    const torres = this.torres;
    for (let i = torres.length - 1; i >= 0; i--) {
      const tr = torres[i];
      if (tr.vida > 0) continue;
      torres.splice(i, 1);
      this.explosoes.push([tr.x, tr.y, 0.0, rnd() * 6.28, 1.4]);
      this.marcas.push([tr.x, tr.y, 0.0]);
      for (let k = 0; k < 8; k++) this.sopros.push([tr.x + (rnd() - 0.5) * 2.5, tr.y + (rnd() - 0.5) * 2.0, 0.3, 0.0]);
      this.som.tocar('base_destruida', tr.x, tr.y, 0.6);
    }
    for (let i = 0; i < torres.length; i++) {
      const tr = torres[i];
      tr.idade += dt;
      if (tr.recuo > 0) tr.recuo = Math.max(0, tr.recuo - dt * 3.0);
      if (this.fim) continue;
      if (tr.cd > 0) tr.cd -= dt;
      if (tr.cd_tiro > 0) tr.cd_tiro -= dt;
      if (tr.cd > 0 && tr.cd_tiro > 0) continue;
      const a = this._escolher_alvo(tr.time, tr.x, tr.y, C.ALCANCE_TORRE);
      if (!a || a.base || !a.sold.length) { if (tr.cd < 0) tr.cd = 0; continue; }   // ninguém no alcance: fica de olho
      const da = hip(a.x - tr.x, a.y - tr.y);
      if (da <= C.ALCANCE_TORRE_TIRO) {
        // ---- anel vermelho: tiro comum
        if (tr.cd_tiro > 0) continue;
        const v = a.sold[sorteio(Math.min(a.sold.length, a.cols * 2))];
        const x1 = v.x + (rnd() - 0.5) * 0.5, y1 = v.y + (rnd() - 0.5) * 0.5;
        const d = hip(x1 - tr.x, y1 - tr.y) || 1.0;
        tr.hx = (x1 - tr.x) / d; tr.hy = (y1 - tr.y) / d;
        let dano = C.DANO_TIRO * this.mult[tr.time].dano * this.mult_torre(tr);
        if (a.tipo === 'tanque' && rnd() < C.CRITICO_TORRE) {
          dano *= C.CRITICO_TORRE_MULT;
          const fl = [a.x, a.y, 'CRÍTICO!', 0.0];
          fl._para = tr.time;
          this.flutuantes.push(fl);
        }
        const bala = new Traco(tr.x + tr.hx * 0.5, tr.y + tr.hy * 0.5, x1, y1, a, dano, C.TORRE_ALTURA + 0.4, a.tipo === 'heli' ? 2.2 : 0.42);
        bala.fura = true;
        this.tracos.push(bala);
        tr.recuo = Math.max(tr.recuo, 0.7);
        tr.cd_tiro = C.CADENCIA[0] + rnd() * (C.CADENCIA[1] - C.CADENCIA[0]);
        this.som.tocar('tiro', tr.x, tr.y);
        continue;
      }
      // ---- anel amarelo: granadas em série
      if (tr.cd > 0) continue;
      const e = C.ERRO_GRANADA;
      const x1 = a.x + (rnd() - 0.5) * 2 * e, y1 = a.y + (rnd() - 0.5) * 2 * e;
      const d = hip(x1 - tr.x, y1 - tr.y) || 1.0;
      tr.hx = (x1 - tr.x) / d; tr.hy = (y1 - tr.y) / d;
      const bx = tr.x + tr.hx * 0.5, by = tr.y + tr.hy * 0.5;
      this.granadas.push(new Granada(bx, by, x1, y1, tr.time, this.mult[tr.time].dano * this.mult_torre(tr), C.TORRE_ALTURA + 0.6));
      tr.recuo = 1.0;
      this.som.tocar('morteiro', tr.x, tr.y);
      tr.n += 1;
      if (tr.n >= C.TORRE_SERIE) { tr.n = 0; tr.cd = C.TORRE_CICLO - (C.TORRE_SERIE - 1) * C.TORRE_INTERVALO; }
      else tr.cd = C.TORRE_INTERVALO;
    }
  }

  pode_pagar(tipo) {
    // tem moedas para esta carta (ou para a base)?
    // torre e barricada se pagam com PARAFUSOS
    if (tipo === 'torre') return this.parafusos.verde >= C.PF_TORRE && this.torres_de('verde') < C.MAX_TORRES;
    if (tipo === 'barricada') return this.parafusos.verde >= C.PF_BARRICADA && this.barricadas_de('verde') < C.MAX_BARRICADAS;
    if (tipo === 'base') {
      return this.moedas >= this.custo_base() && this.bases_feitas < C.MAX_BASES_EXTRA;   // só mais 2
    }
    return this.carta_pronta(tipo);
  }

  pode_construir(x, y) {
    // no seu território, fora da estrada e longe das outras bases
    return (this.pode_posicionar(x, y) && M.dist_estrada(x, y) > 1.5 &&
      this.todas_bases().every(b => hip(b.x - x, b.y - y) >= C.DISTANCIA_BASES));
  }

  construir_base(x, y) {
    if (this.fim || !this.pode_pagar('base') || !this.pode_construir(x, y)) {
      this.som.tocar('erro');
      return false;
    }
    this.moedas -= this.custo_base();
    this.bases_feitas += 1;
    this._nova_base('verde', x, y);
    for (let _i6 = 0, _a6 = this.esquadroes; _i6 < _a6.length; _i6++) {
      const sq = _a6[_i6];
      if (sq.time === 'verde') {
        sq.vida *= (1 + .1 * this.bases_feitas) / (1 + .1 * (this.bases_feitas - 1));
        sq.vida_max *= (1 + .1 * this.bases_feitas) / (1 + .1 * (this.bases_feitas - 1));
      }
    }
    this.deu_ordem = true;
    return true;
  }

  _nova_base(time, x, y) {
    const nb = new Base(time, x, y, 92, false);
    nb.estoque = {}; for (const k of C.ITENS) nb.estoque[k] = 0;   // fase 4: base nova começa vazia
    nb.vida *= this.mult_vida_base(time); nb.vida_max *= this.mult_vida_base(time);   // fase 3: vida das bases
    this.extras.push(nb);
    // fase 3: TORRE DE GRAÇA ao lado (dano x2, metade da vida), virada para o inimigo
    const s = time === 'verde' ? -1 : 1;
    let tx = x + s * C.TORRE_GRACA_DIST * 0.7071, ty = y + s * C.TORRE_GRACA_DIST * 0.7071;
    if (M.dist_estrada(tx, ty) <= 1.2) { tx = x - s * C.TORRE_GRACA_DIST * 0.7071; ty = y + s * C.TORRE_GRACA_DIST * 0.7071; }
    const tg = this._nova_torre(time, tx, ty);
    tg.graca = true; tg.base_dona = nb;
    tg.vida = tg.vida_max = C.VIDA_TORRE * C.TORRE_GRACA_VIDA;
    for (let i = 0; i < 8; i++) {
      this.sopros.push([x + (rnd() - 0.5) * 4, y + (rnd() - 0.5) * 3, 0.1, 0.0]);
    }
    this.som.tocar('construir', x, y);
  }

  _produzir(b) {
    // a base gera um pelotão de graça, num lugar livre à frente dela
    const verde = b.time === 'verde';
    const tipo = this._tipo_da_base(b, k => (verde ? this.carta_desbloqueada(k) : this.ia_desbloqueada(k)));   // a carta escolhida para a base
    if (!tipo) return false;   // base 2/3 sem deck (ou só com cartas ainda bloqueadas): espera
    if (!this.pode_soltar(b)) return false;   // base construída depois não solta tropa
    if (this.vivos_tipo(b.time, tipo) >= C.limite_mapa(tipo)) { b.falta_pf = 0; return false; }   // limite do mapa
    if (this._soldados(b.time) + C.vagas(tipo) > (verde ? this.limite_soldados() : this.ia_limite_soldados())) return false;
    if (this.drop_vivos(b.time, tipo) >= this.limite_drop(b.time, tipo)) { b.falta_pf = 0; return false; }   // limite de tropas da base
    const d = verde ? -0.7071 : 0.7071;   // "frente" = na direção do inimigo
    let lugar = null;
    for (const k of [0, 1, -1, 2, -2]) {
      const x = b.x + d * 5 + 0.7071 * k * 4.6, y = b.y + d * 5 - 0.7071 * k * 4.6;
      if (!this.esquadroes.some(q => q.time === b.time && hip(q.x - x, q.y - y) < 3.2)) {
        lugar = [x, y];
        break;
      }
    }
    if (!lugar) return false;
    if (!this._pagar_parafusos(b, tipo)) return false;   // só paga quando a tropa vai sair mesmo (sem parafusos: espera com "?")
    const sq = this._criar(b.time, lugar[0], lugar[1], 0, tipo);
    sq.da_base = true;   // conta no limite do que as bases soltam
    sq.base_origem = b;  // (GPS: quando terminar de sair, vai para o ponto de reunião desta base)
    sq.hx = d; sq.hy = d;
    sq.porta = [b.x + d * 2.2, b.y + d * 2.2];
    const n = C.PELOTOES[tipo].soldados;
    sq.treinando = n;
    sq.vida_max = n * this.hp(b.time, tipo);
    return true;
  }

  _atualizar_bases(dt) {
    // moedas, pelotões gerados e bases extras destruídas
    for (let _i7 = 0, _a7 = this.todas_bases(); _i7 < _a7.length; _i7++) {
      const b = _a7[_i7];
      if (b.vida <= 0 || b.nave) continue;   // (a nave não produz tropa nem rende moeda)
      const tempo = this.tempo_tropa(b);
      b.t_tropa = Math.min(tempo, b.t_tropa + dt);
      if (b.t_tropa >= tempo && this._produzir(b)) b.t_tropa = 0.0;
      // renda da base: BASE_MOEDAS a cada BASE_TEMPO_MOEDAS segundos, para o dono
      b.t_moeda += dt;
      if (b.t_moeda >= C.BASE_TEMPO_MOEDAS) {
        b.t_moeda -= C.BASE_TEMPO_MOEDAS;
        // só até o caixa chegar a BASE_MOEDAS_TETO (1000); depois a base não rende
        const caixa = b.time === 'verde' ? this.moedas : this.moedas_ia;
        const ganho = Math.max(0, Math.min(C.BASE_MOEDAS, C.BASE_MOEDAS_TETO - caixa));
        if (ganho > 0 && b.time === 'verde') {
          this.moedas += ganho;
          this.flutuantes.push([b.x, b.y, '+' + Math.round(ganho), 0.0]);
          this.som.tocar('moeda', b.x, b.y, 0.5);
        } else if (ganho > 0) {
          this.moedas_ia += ganho;
        }
      }
    }
    for (const b of this.extras.filter(b => b.vida <= 0)) {
      this.extras.splice(this.extras.indexOf(b), 1);
      this.explosoes.push([b.x, b.y, 0.0, rnd() * 6.28, 1.6]);
      this.marcas.push([b.x, b.y, 0.0]);
      this.som.tocar('base_destruida', b.x, b.y, 0.7);
      this._tropa_da_base(b);
      if (b.time === 'vermelho') {
        this.moedas += C.PREMIO_BASE;
        this.flutuantes.push([b.x, b.y, '+' + C.PREMIO_BASE, 0.0]);
        this.som.tocar('moeda');
      } else {
        this.moedas_ia += C.PREMIO_BASE;   // o inimigo também ganha por derrubar a sua
      }
    }
  }

  _tropa_da_base(b) {
    // base extra destruída: de dentro dela saem 200 fuzileiros de QUEM DESTRUIU,
    // de uma vez, fora do limite de soldados e sem se juntar com outra tropa
    const time = outro(b.time);
    const sq = this._criar(time, b.x, b.y, C.TROPA_DA_BASE, 'pelotao');
    sq.exclusa = true;
    const d = time === 'verde' ? -0.7071 : 0.7071;   // virada para o inimigo
    sq.hx = d; sq.hy = d;
    this._organizar(sq, true);
    for (let i = 0; i < sq.sold.length; i += 6) this.sopros.push([sq.sold[i].x, sq.sold[i].y, 0.1, 0.0]);
    this.som.tocar('posicionar', b.x, b.y);
    if (sq.ia) {
      // no solo, a do inimigo já sai atacando pela estrada mais próxima
      let melhor = null, md = Infinity;
      for (const r of Object.values(M.ROTAS)) {
        const p = r.em(r.s_perto(b.x, b.y));
        const dd = hip(p[0] - b.x, p[1] - b.y);
        if (dd < md) { md = dd; melhor = r; }
      }
      sq.rota = melhor;
      sq.s = Math.max(6.0, melhor.s_perto(b.x, b.y));
      sq.destino = melhor.em(sq.s).slice(0, 2);
      sq.atacando = true;
    }
    return sq;
  }

  _pode_fundir(a, b) {
    // mesma classe, mesmo time, e nenhuma das duas é tropa de base destruída
    // (e com o mesmo nível de treino: tropa treinada não se mistura com novata)
    return a.tipo === b.tipo && a.time === b.time && !a.exclusa && !b.exclusa && a.nivel_treino === b.nivel_treino;
  }

  // ---------- formação em quadrado ----------------------------------
  _organizar(sq, teleporta = false) {
    const n = sq.sold.length;
    if (!n) return;
    // só muda o nº de colunas quando o quadrado ficou bem torto
    // (evita a formação inteira se embaralhar a cada baixa)
    if (n > sq.cols * (sq.cols + 1) || (sq.cols > 1 && n <= (sq.cols - 1) ** 2)) {
      sq.cols = Math.ceil(Math.sqrt(n));
    }
    const cols = sq.cols;
    const filas = Math.floor((n + cols - 1) / cols);
    const E = C.ESPACO;
    const rx = -sq.hy, ry = sq.hx, hx = sq.hx, hy = sq.hy;
    let cx = sq.x, cy = sq.y;
    if (sq.tipo === 'heli' || sq.tipo === 'tanque') {
      for (let _i8 = 0, _a8 = sq.sold; _i8 < _a8.length; _i8++) {
        const s = _a8[_i8];
        s.tx = sq.x; s.ty = sq.y;
        if (teleporta) { s.x = sq.x; s.y = sq.y; }
      }
      return;
    }
    if (sq.tipo === 'canhao') {   // a equipe fica atrás da peça
      cx = cx - hx * 0.7; cy = cy - hy * 0.7;
    }
    const meio_c = (cols - 1) / 2, meio_f = (filas - 1) / 2;
    for (let i = 0; i < n; i++) {
      const s = sq.sold[i];
      const lat = (i % cols - meio_c) * E;
      const prof = (meio_f - Math.floor(i / cols)) * E;   // fila 0 = frente
      s.tx = cx + rx * lat + hx * prof;
      s.ty = cy + ry * lat + hy * prof;
      if (teleporta) { s.x = s.tx; s.y = s.ty; }
    }
  }

  static _virar(sq, tx, ty, dt) {
    if (sq.tipo === 'tanque') {
      // Giro contínuo limitado em radianos/s: sem saltos de direção,
      // inclusive na passagem de +pi para -pi.
      const atual = Math.atan2(sq.hy, sq.hx);
      const desejado = Math.atan2(ty, tx);
      const dois_pi = 2 * Math.PI;
      const delta = ((((desejado - atual + Math.PI) % dois_pi) + dois_pi) % dois_pi) - Math.PI;
      const limite = 2.45 * Math.max(0.0, dt);
      const angulo = atual + Math.max(-limite, Math.min(limite, delta));
      sq.hx = Math.cos(angulo); sq.hy = Math.sin(angulo);
      return;
    }
    const k = Math.min(1.0, dt * 4);
    const hx = sq.hx + (tx - sq.hx) * k, hy = sq.hy + (ty - sq.hy) * k;
    const l = hip(hx, hy) || 1.0;
    sq.hx = hx / l; sq.hy = hy / l;
  }

  // ---------- combate -----------------------------------------------
  _escolher_alvo(time, x, y, alcance, atacante = null) {
    let melhor = null, md = alcance;
    const alcance2 = alcance * alcance;
    // grade espacial: só os candidatos por perto, na mesma ordem da lista
    const g = this._grade, usa = g && g.valida(this._esq_ver);
    const k = usa ? g.perto(x, y, alcance) : this.esquadroes.length;
    const buf = usa ? g._buf : null;
    for (let _n = 0; _n < k; _n++) {
      const o = this.esquadroes[usa ? buf[_n] : _n];
      if (o.time === time || !o.sold.length) continue;
      if (o.tipo === 'heli' && (atacante === 'granada' || atacante === 'canhao')) continue;
      const d2 = (o.x - x) ** 2 + (o.y - y) ** 2;
      if (d2 <= alcance2 && d2 <= md * md) {
        md = Math.sqrt(d2); melhor = o;
      }
    }
    if (this.horda && time === 'verde') {   // modo zumbi: o zumbi mais perto dentro do alcance
      const zb = this.horda.mais_perto(x, y, md);
      if (zb) return zb;
    }
    if (melhor) return melhor;
    // sem tropa inimiga por perto: bases secundárias têm prioridade; sem
    // nenhuma, as principais. A base inimiga mais próxima no alcance.
    // (mesma ordem e mesmas contas de antes, só que sem montar listas novas
    // a cada chamada: isto roda para cada tropa em todo quadro)
    let tem_extra = false;
    for (let i = 0; i < this.extras.length; i++) { const b = this.extras[i]; if (b.time !== time && b.vida > 0) { tem_extra = true; break; } }
    this._alvo_base = null;
    this._alvo_md = alcance + 1;
    const cams = this.caminhoes;   // fase 5: caminhão inimigo no alcance também é alvo
    if (cams) for (let i = 0; i < cams.length; i++) this._candidata_base(cams[i], time, x, y);
    const torres = this.torres;   // torres inimigas no alcance também são alvo
    if (torres) for (let i = 0; i < torres.length; i++) this._candidata_base(torres[i], time, x, y);
    if (tem_extra) {
      for (let i = 0; i < this.extras.length; i++) this._candidata_base(this.extras[i], time, x, y);
    } else {
      this._candidata_base(this.bases.vermelho, time, x, y);
      this._candidata_base(this.bases.verde, time, x, y);
    }
    return this._alvo_base;
  }

  _candidata_base(b, time, x, y) {
    if (b.time !== time && b.vida > 0) {
      const d = hip(b.x - x, b.y - y);
      if (d <= this._alvo_md) { this._alvo_md = d; this._alvo_base = b; }
    }
  }

  _derrubar(sq, i) {
    // baixa: o de trás dá um passo à frente e fecha o buraco
    const s = sq.sold[i], n = sq.sold.length, cols = sq.cols;
    s.caindo = 0.0; s.andando = false; s.tiro = 0.0;
    this.caidos.push(s);
    this.som.tocar('queda', s.x, s.y);
    let j = i;
    while (j + cols < n) {
      sq.sold[j] = sq.sold[j + cols];
      j += cols;
    }
    if (j !== n - 1) sq.sold[j] = sq.sold[n - 1];
    sq.sold.pop();
  }

  _reagir(sq, ox, oy) {
    // REAÇÃO PADRÃO (você e o inimigo): a tropa que leva tiro de quem ela não
    // alcança vai até o atacante. Só quando está livre ou já reagindo: uma
    // ordem dada (sua ou do comandante) continua valendo.
    if (sq.base || !sq.sold.length || sq.treinando || sq.treino >= 0 || sq.fuga || sq.perseguir || sq.fundir) return;
    if (sq.alvo) return;                         // já tem em quem atirar
    if (sq.destino && !sq.reacao) return;        // está cumprindo uma ordem
    const d = hip(ox - sq.x, oy - sq.y);
    if (d > 36 || d < sq.alcance() * 0.9) return;
    if (sq.reacao && this.t_jogo - sq.t_reacao < 1.5) return;
    // para um pouco antes do atacante, já dentro do alcance
    const k = (d - sq.alcance() * 0.8) / d;
    const x = sq.x + (ox - sq.x) * k, y = sq.y + (oy - sq.y) * k;
    const volta = sq.ia && sq.atacando && sq.rota ? sq.rota.em(sq.s).slice(0, 2) : null;   // IA na estrada: depois volta a ela
    sq.caminho = volta ? [volta] : [];
    sq.destino = [x, y];
    sq.reacao = true;
    sq.t_reacao = this.t_jogo;
  }

  _ferir(alvo, dano, perto = null, origem = null, arma = 'tiro') {
    // tira vida do alvo; perto=[x, y] faz cair quem está mais perto da explosão;
    // origem=[x, y] = de onde veio o tiro (a tropa atingida reage indo até lá);
    // arma = o que acertou (a DEFESA da tropa segura parte, a arma fura um tanto)
    if (alvo.vida <= 0) return;
    if (alvo.zumbi) { this.horda.ferir(alvo, dano); return; }
    if (!alvo.base && alvo.sold) dano *= 1 - this.defesa_de(alvo) * (1 - (C.PERFURA[arma] || 0));
    alvo.vida = Math.max(0.0, alvo.vida - dano);
    alvo.levou_dano = this.t_jogo;
    if (origem && !alvo.base && alvo.vida > 0) this._reagir(alvo, origem[0], origem[1]);
    if (alvo.torre || alvo.barreira || alvo.caminhao) return;   // torre/barricada/caminhão: só perde vida (caem nos passos deles)
    if (alvo.base) {
      if (alvo.time === 'verde') {   // alarme normal; urgente quando a base está quase caindo
        this.som.tocar(alvo.vida < alvo.vida_max * 0.3 ? 'base_fraca' : 'alarme');
      }
      if (alvo.vida <= 0 && alvo.principal && !this.fim) {
        this.fim = alvo.time === 'vermelho' ? 'vitoria' : 'derrota';
        this.som.tocar('base_destruida', alvo.x, alvo.y);
        if (alvo.time === 'vermelho') {
          this.moedas += C.PREMIO_BASE;
          this.flutuantes.push([alvo.x, alvo.y, '+' + C.PREMIO_BASE, 0.0]);
        } else {
          this.moedas_ia += C.PREMIO_BASE;
        }
        this.som.tocar(this.fim);
      }
      return;
    }
    if (alvo.time === 'verde') this.som.tocar('sob_ataque');   // aviso (no máximo 1 a cada 8 s)
    // a vida da tropa decide quantos soldados ficam de pé
    const devem = Math.ceil(alvo.vida / this.hp(alvo.time, alvo.tipo));
    while (alvo.sold.length > devem) {
      let i;
      if (perto) {
        i = 0;
        let md = Infinity;
        for (let k = 0; k < alvo.sold.length; k++) {
          const d = (alvo.sold[k].x - perto[0]) ** 2 + (alvo.sold[k].y - perto[1]) ** 2;
          if (d < md) { md = d; i = k; }
        }
      } else {
        i = sorteio(Math.min(alvo.sold.length, alvo.cols * 2));
      }
      this._derrubar(alvo, i);
    }
  }

  _atirar(sq, s) {
    let a = sq.alvo;
    if (a.zumbi) a = this.horda.espalhar(a, C.DANO_TIRO);   // cada soldado num zumbi que ainda não está condenado
    let x1, y1;
    if (a.base) {
      const j = a.barreira ? 0.8 : 2.4;
      x1 = a.x + (rnd() - 0.5) * j; y1 = a.y + (rnd() - 0.5) * j;
    } else {
      if (!a.sold.length) return;
      const v = a.sold[sorteio(Math.min(a.sold.length, a.cols * 2))];
      x1 = v.x + (rnd() - 0.5) * 0.5; y1 = v.y + (rnd() - 0.5) * 0.5;
    }
    const d = hip(x1 - s.x, y1 - s.y) || 1.0;
    const elite = sq.nivel_treino >= 1 && sq.tipo === 'pelotao';
    const tr = new Traco(s.x + (x1 - s.x) / d * 0.35, s.y + (y1 - s.y) / d * 0.35, x1, y1, a,
      (sq.nivel_treino ? C.DANO_TIRO * this._mtr(sq, 'dano', true) : C.DANO_TIRO * this.mx(sq.time, sq.tipo, 'dano') * this._bonus_base(sq.time) * this._fator_mun(sq)) * (elite ? C.ELITE_DANO : 1),
      0.42, a.base ? 1.2 : (a.voa || 0.42));   // (a.voa: disco voador, o tiro sobe até ele)
    if (elite) tr.fura = true;   // atirador de elite (2V) também fere tanque
    if (elite && !a.base) { tr.perfura = true; tr.sobra = Math.max(2.5, sq.alcance() - d); }
    this.tracos.push(tr);
    s.tiro = 1.0;
    this.som.tocar('tiro', s.x, s.y);
  }

  _lancar(sq, s) {
    // granadeiro dispara: o projétil mira o meio da tropa inimiga, com erro
    const a = sq.alvo;
    const e = C.ERRO_GRANADA;
    const x1 = a.x + (rnd() - 0.5) * 2 * e, y1 = a.y + (rnd() - 0.5) * 2 * e;
    const g = new Granada(s.x, s.y, x1, y1, sq.time, this._mtr(sq, 'dano', false));
    // incendiário: alvo além do alcance comum -> bomba incendiária
    if (sq.nivel_treino >= 1 && sq.tipo === 'granada' && hip(a.x - sq.x, a.y - sq.y) > sq.alcance_base()) { g.incendio = true; g.dono = sq; }
    this.granadas.push(g);
    s.tiro = 1.0;
    this.som.tocar('morteiro', s.x, s.y);
  }

  _explodir(g) {
    // a granada caiu: dano em área + fogo, fumaça e chão queimado
    const x = g.x1, y = g.y1, R = C.RAIO_GRANADA;
    const k_imp = g.incendio ? C.INCENDIO_IMPACTO : 1;   // bomba incendiária: impacto de 10%
    if (g.incendio) this._acender(x, y, C.INCENDIO_RAIO, g.time, g.dano, g.dono);
    for (let _i9 = 0, _a9 = this.esquadroes.slice(); _i9 < _a9.length; _i9++) {
      const sq = _a9[_i9];
      if (sq.time === g.time || !sq.sold.length || sq.tipo === 'heli') continue;   // granada não pega no céu
      let n = 0;
      for (let _i10 = 0, _a10 = sq.sold; _i10 < _a10.length; _i10++) { const s = _a10[_i10]; if ((s.x - x) ** 2 + (s.y - y) ** 2 <= R * R) n++; }
      if (n) {   // tropa junta sofre mais: dano fixo + um tanto por soldado no raio
        this._ferir(sq, (C.DANO_GRANADA + n * C.DANO_GRANADA_SOLDADO) * g.dano * k_imp, [x, y], [g.x0, g.y0], 'granada');
      }
    }
    if (this.horda && g.time === 'verde') this.horda.area(x, y, R, ZUMBI.DANO_GRANADA * g.dano * k_imp);
    for (let _i11 = 0, _a11 = this.todas_bases(); _i11 < _a11.length; _i11++) {
      const b = _a11[_i11];
      if (b.time !== g.time && b.vida > 0 && hip(b.x - x, b.y - y) <= R + 2) {
        this._ferir(b, C.DANO_GRANADA_BASE * g.dano * k_imp);
      }
    }
    for (let i = 0; i < this.torres.length; i++) {
      const b = this.torres[i];
      if (b.time !== g.time && b.vida > 0 && hip(b.x - x, b.y - y) <= R + 1.2) this._ferir(b, C.DANO_GRANADA_BASE * g.dano * k_imp);
    }
    for (let i = 0; i < this.barricadas.length; i++) {
      const b = this.barricadas[i], p = b.pontas();
      if (b.time !== g.time && b.vida > 0 && _dist_seg(x, y, p[0], p[1], p[2], p[3]) <= R + 0.4) this._ferir(b, C.DANO_GRANADA_BASE * g.dano * k_imp);
    }
    this.explosoes.push([x, y, 0.0, rnd() * 6.28, g.incendio ? 0.7 : 1.0]);
    this.marcas.push([x, y, 0.0]);
    for (let i = 0; i < C.FOGOS_POR_EXPLOSAO; i++) {   // mini foguinhos espalhados na área
      const ang = rnd() * 6.28, r = Math.sqrt(rnd()) * R * 0.9;
      this.fogos.push([x + Math.cos(ang) * r, y + Math.sin(ang) * r, 0.0,
        C.DURACAO_FOGO * (0.6 + rnd() * 0.6), rnd() * 6.28, 0.7 + rnd() * 0.6]);
    }
    this.som.tocar('explosao', x, y);
  }

  _disparar_canhao(sq) {
    // a peça atira um obus reto no alvo
    const a = sq.alvo;
    let x1, y1;
    if (a.base) {
      x1 = a.x + (rnd() - 0.5) * 1.6; y1 = a.y + (rnd() - 0.5) * 1.6;
    } else {
      if (!a.sold.length) return;
      const v = a.sold[sorteio(a.sold.length)];
      x1 = (v.x + a.x) / 2; y1 = (v.y + a.y) / 2;
    }
    const [px, py] = sq.peca();
    // O projetil atravessa o primeiro alvo e continua na mesma direcao.
    const dx = x1 - px, dy = y1 - py;
    const d = Math.max(0.001, hip(dx, dy));
    const extra = 14.0;
    const ob = new Obus(px + sq.hx * 1.2, py + sq.hy * 1.2,
      x1 + dx / d * extra, y1 + dy / d * extra, a, sq.time, this._mtr(sq, 'dano', false));
    ob.atingidos = new Set();
    this.obuses.push(ob);
    sq.recuo = 1.0;
    this.som.tocar('canhao', px, py);
  }

  _impacto_obus(o) {
    // Efeito final leve: a colisao ja ocorreu ao longo do voo.
    const [x, y] = o.pos(1.0);
    this.explosoes.push([x, y, 0.0, rnd() * 6.28, 0.35]);
    this.marcas.push([x, y, 0.45]);
  }

  _colisao_obus(o) {
    const [x, y] = o.pos(Math.min(1.0, o.t));
    const raio2 = Math.max(1.2, C.RAIO_CANHAO * 0.5) ** 2;
    for (let _i12 = 0, _a12 = this.esquadroes; _i12 < _a12.length; _i12++) {
      const sq = _a12[_i12];
      if (sq.time === o.time || !sq.sold.length || o.atingidos.has(sq) || sq.tipo === 'heli') continue;   // bala de canhão não pega no céu
      const atingidos = sq.sold.filter(s => (s.x - x) ** 2 + (s.y - y) ** 2 <= raio2);
      if (!atingidos.length) continue;
      o.atingidos.add(sq);
      // Recuo fisico dos atingidos, sem sprites novos.
      const dx = o.x1 - o.x0, dy = o.y1 - o.y0;
      const mag = Math.max(0.01, hip(dx, dy));
      for (const sold of atingidos) {
        sold.x += dx / mag * 0.7;
        sold.y += dy / mag * 0.7;
      }
      this._ferir(sq, C.DANO_CANHAO * o.dano, [x, y], [o.x0, o.y0], 'canhao');
      this.explosoes.push([x, y, 0.0, rnd() * 6.28, 0.35]);
      this.som.tocar('pancada', x, y);
    }
    if (this.horda && o.time === 'verde') this.horda.area(x, y, Math.sqrt(raio2), C.DANO_CANHAO * o.dano, o.atingidos);
    for (let _i13 = 0, _a13 = this.todas_bases(); _i13 < _a13.length; _i13++) {
      const b = _a13[_i13];
      if (b.time !== o.time && !o.atingidos.has(b) && (b.x - x) ** 2 + (b.y - y) ** 2 <= raio2) {
        o.atingidos.add(b);
        this._ferir(b, C.DANO_CANHAO_BASE * o.dano);
      }
    }
    for (let i = 0; i < this.torres.length; i++) {
      const b = this.torres[i];
      if (b.time !== o.time && b.vida > 0 && !o.atingidos.has(b) && (b.x - x) ** 2 + (b.y - y) ** 2 <= raio2 + 1.5) {
        o.atingidos.add(b);
        this._ferir(b, C.DANO_CANHAO_BASE * o.dano);
      }
    }
    for (let i = 0; i < this.barricadas.length; i++) {
      const b = this.barricadas[i], p = b.pontas();
      if (b.time !== o.time && b.vida > 0 && !o.atingidos.has(b) && _dist_seg(x, y, p[0], p[1], p[2], p[3]) ** 2 <= raio2 + 0.5) {
        o.atingidos.add(b);
        this._ferir(b, C.DANO_CANHAO_BASE * o.dano);
      }
    }
  }

  // ---------- o inimigo ---------------------------------------------
  // Quem decide tudo do lado vermelho é o Comandante (ia.js). Ele joga com as
  // mesmas regras, preços e ganhos que você: caixa de moedas, cartas que
  // desbloqueiam com o nível do QG, loja, habilidades, bases, torres e treino.
  _ia(dt) {
    if (!this.cmd) { this.cmd = new Comandante(this); this.cmd.esperta = this.dificuldade >= 2; }
    this.cmd.passo(dt);
  }

  status_onda() {
    // texto curto para a interface
    if (this.horda) return this.horda.status();
    if (!this.cmd) return [`Próxima onda em ${Math.ceil(Math.max(0.0, this.espera))}s`, false];
    return this.cmd.status();
  }

  // ---------- comandos do jogador -----------------------------------
  static _grafo_estradas() {
    // o grafo das estradas é sempre o mesmo: monta UMA vez (antes era montado
    // a cada ordem, com ~66 mil comparações, e travava quando a IA dava
    // muitas ordens de uma vez). Mesmo grafo, mesmas contas, mesma ordem.
    if (Tropas._grafo) return Tropas._grafo;
    const pontos = [], adj = [];
    for (const estrada of M.ESTRADAS) {
      let anterior = null;
      for (const pt of estrada.pts) {
        const idx = pontos.length;
        pontos.push(pt);
        adj.push([]);
        if (anterior !== null) {
          const d = hip(pt[0] - pontos[anterior][0], pt[1] - pontos[anterior][1]);
          adj[idx].push([anterior, d]);
          adj[anterior].push([idx, d]);
        }
        anterior = idx;
      }
    }
    // Pontes entre estradas que realmente se encontram.
    for (let i = 0; i < pontos.length; i++) {
      const a = pontos[i];
      for (let j = i + 1; j < pontos.length; j++) {
        if (Math.abs(i - j) < 2) continue;
        const d2 = (a[0] - pontos[j][0]) ** 2 + (a[1] - pontos[j][1]) ** 2;
        if (d2 < 1.2 ** 2) {
          const d = Math.sqrt(d2);
          adj[i].push([j, d]);
          adj[j].push([i, d]);
        }
      }
    }
    Tropas._grafo = { pontos, adj, rotas: new Map() };   // rotas: caminhos já calculados (início -> fim)
    return Tropas._grafo;
  }

  static _rota_estrada(x, y, tx, ty) {
    // Caminho por estradas existentes; conexões entre vias que se cruzam.
    // Calculado apenas ao dar uma ordem, nunca a cada quadro.
    const { pontos, adj, rotas } = Tropas._grafo_estradas();
    const mais_perto = (px, py) => {
      let m = 0, md = Infinity;
      for (let i = 0; i < pontos.length; i++) {
        const d = (pontos[i][0] - px) ** 2 + (pontos[i][1] - py) ** 2;
        if (d < md) { md = d; m = i; }
      }
      return m;
    };
    const inicio = mais_perto(x, y);
    const fim = mais_perto(tx, ty);
    const chave = inicio * 4096 + fim;
    const pronta = rotas.get(chave);   // o mesmo par já foi calculado: mesma resposta
    if (pronta !== undefined) {
      if (pronta === null) return [[tx, ty]];
      const rota = pronta.map(i => pontos[i]);
      rota.push([tx, ty]);
      return rota;
    }
    const distancias = new Map([[inicio, 0.0]]);
    const anterior = new Map();
    const fila = new Monte();
    fila.por([0.0, inicio]);
    while (fila.tamanho) {
      const [d, i] = fila.tirar();
      if (d > distancias.get(i)) continue;
      if (i === fim) break;
      for (const [j, custo] of adj[i]) {
        const nd = d + custo;
        const dj = distancias.get(j);
        if (nd < (dj === undefined ? Infinity : dj)) {
          distancias.set(j, nd);
          anterior.set(j, i);
          fila.por([nd, j]);
        }
      }
    }
    if (!distancias.has(fim)) { rotas.set(chave, null); return [[tx, ty]]; }
    const indices = [fim];
    while (indices[indices.length - 1] !== inicio) indices.push(anterior.get(indices[indices.length - 1]));
    indices.reverse();
    rotas.set(chave, indices);
    // Amostra todos os pontos da rota para não cortar curvas.
    const rota = indices.map(i => pontos[i]);
    rota.push([tx, ty]);
    return rota;
  }

  _ordem(sq, x, y, estrada = false) {
    if (sq.treino >= 0) this._liberar_treino(sq);   // mandou sair do campo: o campo fica livre
    sq.reacao = false;   // ordem nova (sua ou do comandante) manda mais que a reação
    sq.bloqueio = null; sq._desvio_de = null;
    sq.caminho = estrada ? Tropas._rota_estrada(sq.x, sq.y, x, y) : [[x, y]];
    sq.destino = sq.caminho.length ? sq.caminho.shift() : null;
  }

  _fundir(sq, amigo) {
    if (!this.esquadroes.includes(sq) || !this.esquadroes.includes(amigo) || sq === amigo) return;
    if (!this._pode_fundir(sq, amigo)) return;
    for (let _i15 = 0, _a15 = sq.sold; _i15 < _a15.length; _i15++) { const s = _a15[_i15]; amigo.sold.push(s); }
    amigo.vida += sq.vida;
    amigo.vida_max += sq.vida_max;
    amigo.treinando += sq.treinando;
    amigo.da_base = amigo.da_base || sq.da_base;
    { const na = amigo.sold.length - sq.sold.length, ns = sq.sold.length;   // fase 4: munição média
      amigo.mun = (amigo.mun * na + sq.mun * ns) / Math.max(1, na + ns); }
    amigo.da_carta = amigo.da_carta || sq.da_carta;
    amigo.cols = Math.max(1, Math.ceil(Math.sqrt(amigo.sold.length)));
    this._organizar(amigo);
    this.esquadroes.splice(this.esquadroes.indexOf(sq), 1);
    this._esq_ver++;
    if (this.selecionado === sq) this.selecionado = amigo;
    sq.fundir = null;
  }

  // ---------- TREINO DE TROPA -------------------------------------------
  ocupante_treino(time, n) {
    // a tropa que está no campo n do time (ou null)
    const sq = this.treino_ocup[time][n];
    if (sq && sq.treino === n && sq.sold.length && this.esquadroes.includes(sq)) return sq;
    return null;
  }

  pode_treinar(sq) {
    // tropa já transformada (2V) não volta para o treino
    return !!sq && C.TREINO_TIPOS.includes(sq.tipo) && sq.sold.length > 0 && !sq.treinando && sq.treino < 0 &&
      !(sq.nivel_treino >= C.TREINO_MAX);
  }

  enviar_treino(time, n, sq, qtd) {
    // manda 'qtd' soldados da tropa 'sq' para o campo n (divide a tropa se for parte dela)
    const a = M.area_de(time, n);
    if (this.fim || !a || !sq || sq.time !== time || !this.esquadroes.includes(sq) || !this.pode_treinar(sq) ||
      this.ocupante_treino(time, n)) return null;
    qtd = Math.trunc(qtd);
    if (sq.tipo === 'canhao') qtd = sq.sold.length;   // canhão vai inteiro (a peça não se divide)
    qtd = Math.max(1, Math.min(qtd, sq.sold.length, a.cap));
    if (sq.tipo === 'canhao' && qtd < sq.sold.length) return null;
    const parte = qtd < sq.sold.length ? this._dividir(sq, qtd) : sq;
    parte.perseguir = null;
    parte.fundir = null;
    this._ordem(parte, a.x, a.y);
    parte.treino = n;
    parte._drill = 0.0;
    parte._perna = 2;
    this.treino_ocup[time][n] = parte;
    if (this.selecionado === sq) this.selecionado = null;
    return parte;
  }

  sair_treino(time, n) {
    const sq = this.ocupante_treino(time, n);
    if (!sq) return false;
    this._liberar_treino(sq);
    sq.caminho = [];
    sq.destino = null;
    return true;
  }

  _liberar_treino(sq) {
    const o = this.treino_ocup && this.treino_ocup[sq.time];
    if (o && o[sq.treino] === sq) o[sq.treino] = null;
    sq.treino = -1;
  }

  _perfurar(tr) {
    // a bala do atirador de elite atravessa o alvo e segue reto: acerta até
    // ELITE_PERFURA tropas inimigas que estejam na linha, atrás dele
    const dx = tr.x1 - tr.x0, dy = tr.y1 - tr.y0, d = hip(dx, dy) || 1;
    const ux = dx / d, uy = dy / d, inimigo = tr.alvo.time;
    if (tr.alvo.zumbi) {   // modo zumbi: a bala segue reto pela horda
      const ate = this.horda.perfurar(tr, C.ELITE_PERFURA);
      const r2 = new Traco(tr.x1, tr.y1, tr.x1 + ux * ate, tr.y1 + uy * ate, null, 0, tr.z1, 0.42);
      r2.so_visual = true;
      this.tracos.push(r2);
      return;
    }
    const achados = [];
    for (let i = 0; i < this.esquadroes.length; i++) {
      const q = this.esquadroes[i];
      if (q === tr.alvo || q.time !== inimigo || !q.sold.length || (q.tipo === 'tanque' && !tr.fura)) continue;
      const px = q.x - tr.x1, py = q.y - tr.y1;
      const ao_longo = px * ux + py * uy;
      if (ao_longo <= 0 || ao_longo > tr.sobra) continue;
      const lado = Math.abs(px * uy - py * ux);
      if (lado <= 0.9 + Math.min(1.6, q.raio() * 0.45)) achados.push([ao_longo, q]);
    }
    achados.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < achados.length && k < C.ELITE_PERFURA; k++) this._ferir(achados[k][1], tr.dano, null, [tr.x0, tr.y0], 'elite');
    // o risco da bala continuando depois do alvo (só desenho)
    const fim = Math.min(tr.sobra, achados.length ? achados[Math.min(achados.length, C.ELITE_PERFURA) - 1][0] + 0.5 : tr.sobra);
    const resto = new Traco(tr.x1, tr.y1, tr.x1 + ux * fim, tr.y1 + uy * fim, null, 0, tr.z1, 0.42);
    resto.so_visual = true;
    this.tracos.push(resto);
  }

  // ---------- barricadas ---------------------------------------------
  barricadas_de(time) {
    let n = 0;
    for (let i = 0; i < this.barricadas.length; i++) if (this.barricadas[i].time === time) n++;
    return n;
  }

  angulo_barricada(time, x, y) { return angulo_barricada(this, time, x, y); }
  lugar_barricada(time, x, y) { return lugar_barricada(this, time, x, y); }

  _nova_barricada(time, x, y, ang) {
    const b = new Barricada(time, x, y, ang, ++this._id_barr);
    this.barricadas.push(b);
    for (let i = 0; i < 4; i++) this.sopros.push([x + (rnd() - 0.5) * 2.5, y + (rnd() - 0.5) * 1.5, 0.1, 0.0]);
    this.som.tocar('construir', x, y);
    return b;
  }
  construir_barricada(x, y, ang) {
    if (this.fim || this.parafusos.verde < C.PF_BARRICADA || this.barricadas_de('verde') >= C.MAX_BARRICADAS ||
      !this.lugar_barricada('verde', x, y)) {
      this.som.tocar('erro');
      return false;
    }
    this.parafusos.verde -= C.PF_BARRICADA;
    this._nova_barricada('verde', x, y, ang);
    this.deu_ordem = true;
    return true;
  }

  _barreira_no_passo(sq, nx, ny) {
    // a tropa vai encostar numa barricada INIMIGA neste passo? (as suas ela atravessa)
    const m = C.BARRICADA_RAIO + 0.7 + Math.min(1.2, sq.raio() * 0.3);
    for (let i = 0; i < this.barricadas.length; i++) {
      const b = this.barricadas[i];
      if (b.time === sq.time || b.vida <= 0) continue;
      const p = b.pontas();
      const d1 = _dist_seg(nx, ny, p[0], p[1], p[2], p[3]);
      if (b === sq._desvio_de) {   // contornando esta: só barra se for encostar no arame mesmo
        if (d1 < C.BARRICADA_RAIO + 0.35 || _segs_perto(sq.x, sq.y, nx, ny, p[0], p[1], p[2], p[3]) === 0) return b;
        continue;
      }
      if (d1 >= m) continue;
      const d0 = _dist_seg(sq.x, sq.y, p[0], p[1], p[2], p[3]);
      if (d1 < d0 || _segs_perto(sq.x, sq.y, nx, ny, p[0], p[1], p[2], p[3]) === 0) return b;   // chegando perto ou atravessando
    }
    return null;
  }

  _caminho_livre(sq, x0, y0, x1, y1, m) {
    for (let i = 0; i < this.barricadas.length; i++) {
      const b = this.barricadas[i];
      if (b.time === sq.time || b.vida <= 0) continue;
      const p = b.pontas();
      if (_segs_perto(x0, y0, x1, y1, p[0], p[1], p[2], p[3]) < m) return false;
    }
    return true;
  }

  _desvio(sq, b) {
    // procura a volta pela ponta da barricada (a que der o caminho mais curto e livre)
    if (!sq.destino) return false;
    const m = C.BARRICADA_RAIO + 0.7 + Math.min(1.2, sq.raio() * 0.3);
    const [dx0, dy0] = sq.destino;
    const p = b.pontas();
    let melhor = null, ml = Infinity;
    for (const [ex, ey, sgn] of [[p[0], p[1], -1], [p[2], p[3], 1]]) {
      for (const lado of [1, -1]) {
        // um pouco além da ponta e um pouco para o lado (contorna o arame)
        const wx = ex + b.ux * sgn * (m + 0.6) - b.uy * lado * 0.6, wy = ey + b.uy * sgn * (m + 0.6) + b.ux * lado * 0.6;
        if (!this._caminho_livre(sq, sq.x, sq.y, wx, wy, C.BARRICADA_RAIO + 0.45) || !this._caminho_livre(sq, wx, wy, dx0, dy0, m * 0.85)) continue;
        const l = hip(wx - sq.x, wy - sq.y) + hip(dx0 - wx, dy0 - wy);
        if (l < ml) { ml = l; melhor = [wx, wy]; }
      }
    }
    if (!melhor) return false;   // sem outra rota: vai ter que atacar
    sq.caminho.unshift(sq.destino);
    sq.destino = melhor;
    sq._desvio_de = b;
    return true;
  }

  _passo_barricadas(dt) {
    const bs = this.barricadas;
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      b.idade += dt;
      if (b.vida > 0) continue;
      bs.splice(i, 1);
      this.explosoes.push([b.x, b.y, 0.0, rnd() * 6.28, 0.8]);
      for (let k = 0; k < 6; k++) this.sopros.push([b.x + (rnd() - 0.5) * 3, b.y + (rnd() - 0.5) * 1.5, 0.2, 0.0]);
      this.som.tocar('predio', b.x, b.y);
    }
  }

  _acender(x, y, r, time, dano, dono) {
    // círculo de fogo onde a bomba caiu AGORA, se a tropa ainda não tem 4 acesos
    // (com 4 acesos, a bomba só dá o impacto; quando um apaga, a próxima que cair acende)
    let acesos = 0;
    for (let i = 0; i < this.zonas_fogo.length; i++) if (this.zonas_fogo[i].dono === dono) acesos++;
    if (dono && acesos >= C.INCENDIO_MAX) return false;
    this.zonas_fogo.push({ x, y, r, time, dano, dono,
      t: 0.0, tick: 0.0, t_chama: 0.0, dur: C.INCENDIO_DURACAO[0] + rnd() * (C.INCENDIO_DURACAO[1] - C.INCENDIO_DURACAO[0]) });
    this.som.tocar('fogo', x, y);
    return true;
  }

  _passo_zonas_fogo(dt) {
    // círculos de fogo da bomba incendiária: queimam metade do impacto a cada meio segundo
    const zs = this.zonas_fogo;
    for (let i = zs.length - 1; i >= 0; i--) {
      const z = zs[i];
      z.t += dt;
      if (z.t >= z.dur) { zs.splice(i, 1); continue; }
      // foguinhos espalhados no círculo (o desenho e a fumaça vêm deles)
      z.t_chama -= dt;
      if (z.t_chama <= 0 && z.t < z.dur - 1.2) {
        z.t_chama = 0.22 * (C.INCENDIO_RAIO / z.r) ** 2;   // círculo maior, mais foguinhos
        const ang = rnd() * 6.28, r = Math.sqrt(rnd()) * z.r * 0.92;
        this.fogos.push([z.x + Math.cos(ang) * r, z.y + Math.sin(ang) * r, 0.0, 1.0 + rnd() * 0.9, rnd() * 6.28, 0.8 + rnd() * 0.6]);
      }
      z.tick += dt;
      while (z.tick >= C.INCENDIO_TICK) {
        z.tick -= C.INCENDIO_TICK;
        const R2 = z.r * z.r;
        for (let k = 0; k < this.esquadroes.length; k++) {
          const sq = this.esquadroes[k];
          if (sq.time === z.time || !sq.sold.length || sq.tipo === 'heli') continue;
          let n = 0;
          for (let j = 0; j < sq.sold.length; j++) { const s = sq.sold[j]; if ((s.x - z.x) ** 2 + (s.y - z.y) ** 2 <= R2) n++; }
          if (n) this._ferir(sq, (C.DANO_GRANADA + n * C.DANO_GRANADA_SOLDADO) * z.dano * C.INCENDIO_IMPACTO * C.INCENDIO_QUEIMA, [z.x, z.y], null, 'fogo');
        }
        if (this.horda && z.time === 'verde') this.horda.area(z.x, z.y, z.r, ZUMBI.DANO_FOGO * z.dano);
      }
    }
  }

  _dividir(sq, qtd) {
    // separa 'qtd' soldados numa tropa nova (mesmo tipo, nível e vida por soldado)
    const novo = this._criar(sq.time, sq.x, sq.y, 0, sq.tipo);
    const tirados = sq.sold.splice(sq.sold.length - qtd, qtd);
    for (let i = 0; i < tirados.length; i++) novo.sold.push(tirados[i]);
    const frac = qtd / (qtd + sq.sold.length);
    novo.vida = sq.vida * frac; sq.vida -= novo.vida;
    novo.vida_max = sq.vida_max * frac; sq.vida_max -= novo.vida_max;
    novo.valor = sq.valor * frac; sq.valor -= novo.valor;
    novo.nivel_treino = sq.nivel_treino;
    novo.mun = sq.mun;
    novo.t_treino = sq.t_treino;
    novo.exclusa = sq.exclusa;
    novo.da_base = sq.da_base; novo.da_carta = sq.da_carta;
    novo.hx = sq.hx; novo.hy = sq.hy;
    novo.cols = Math.max(1, Math.ceil(Math.sqrt(novo.sold.length)));
    sq.cols = Math.max(1, Math.ceil(Math.sqrt(sq.sold.length)));
    this._organizar(novo);
    this._organizar(sq);
    return novo;
  }

  _subir_treino(sq) {
    // fim do treino: a tropa se TRANSFORMA (nível 2V)
    const L = sq.nivel_treino;
    if (sq.tipo === 'pelotao' && sq.sold.length > C.ELITE_SOLDADOS) {
      // atirador de elite: ficam só 15; o resto sai do campo como pelotão comum
      const resto = this._dividir(sq, sq.sold.length - C.ELITE_SOLDADOS);
      resto.nivel_treino = 0; resto.t_treino = 0.0; resto.treino = -1;
      const a = M.area_de(sq.time, sq.treino);
      if (a) {
        const d = hip(a.x, a.y) || 1;
        this._ordem(resto, a.x - a.x / d * 9, a.y - a.y / d * 9);   // para a frente do campo (lado do mapa)
      }
    }
    sq.nivel_treino = L + 1;
    const fl = [sq.x, sq.y, (C.NOME_TREINADO[sq.tipo] || 'TROPA TREINADA').toUpperCase() + ' 2V', 0.0];
    fl._para = sq.time;
    this.flutuantes.push(fl);
    const nome = L + 1 >= C.TREINO_MAX ? 'nivel_max' : 'compra';
    if (this.som.para) this.som.para(sq.time, nome); else if (sq.time === 'verde') this.som.tocar(nome);
  }

  _invasor_do_campo(time, n) {
    // a primeira tropa INIMIGA (viva, no chão) dentro do campo de treino n de time
    const a = M.area_de(time, n);
    if (!a) return null;
    // grade espacial: só quem pode estar dentro do campo (mesma ordem da lista)
    if (a._raio === undefined) { const du = (a.u1 - a.u0) / 2 + 1, dv = (a.v1 - a.v0) / 2 + 1; a._raio = Math.sqrt((du * du + dv * dv) / 2) + 0.5; }
    const g = this._grade, usa = g && g.valida(this._esq_ver);
    const k = usa ? g.perto(a.x, a.y, a._raio) : this.esquadroes.length;
    for (let _n = 0; _n < k; _n++) {
      const q = this.esquadroes[usa ? g._buf[_n] : _n];
      if (q.time === time || !q.sold.length || q.treinando) continue;
      const u = q.x - q.y, v = q.x + q.y;
      if (u >= a.u0 - 1 && u <= a.u1 + 1 && v >= a.v0 - 1 && v <= a.v1 + 1) return q;
    }
    return null;
  }

  // ---------- ECONOMIA: virada, renda de avanço e reparo -------------------
  moedas_de(time) { return time === 'verde' ? this.moedas : this.moedas_ia; }
  _dar_moedas(time, v) {
    if (time === 'verde') this.moedas += v; else this.moedas_ia += v;
  }

  // CONTADORES (desempenho): a interface e os avisos leem a contagem várias
  // vezes por quadro; aqui ela é feita no máximo uma vez por passo/quadro
  // (as regras continuam usando a conta ao vivo, _soldados)
  contar_soldados(time) {
    const c = this._contagem || (this._contagem = { t: -1, v: -1, verde: 0, vermelho: 0 });
    if (c.t !== this.t_jogo || c.v !== this._esq_ver) {
      c.t = this.t_jogo; c.v = this._esq_ver;
      c.verde = this._soldados('verde'); c.vermelho = this._soldados('vermelho');
    }
    return c[time];
  }
  fator_virada_vista(time) {
    // a mesma conta do fator_virada, com a contagem do quadro (só para mostrar)
    const meus = this.contar_soldados(time), dele = this.contar_soldados(outro(time));
    if (dele <= 0 || meus >= dele) return 1;
    return 1 + Math.min(C.VIRADA_MAX, (dele - meus) / dele);
  }

  fator_virada(time) {
    // quem tem MENOS soldados que o adversário ganha mais por abate:
    // com metade (ou menos) dos soldados do outro, +50%; com o mesmo tanto, nada
    const meus = this._soldados(time), dele = this._soldados(outro(time));
    if (dele <= 0 || meus >= dele) return 1;
    return 1 + Math.min(C.VIRADA_MAX, (dele - meus) / dele);
  }

  _passo_economia(dt) {
    // RENDA DE AVANÇO: a cada 10 s, soldados seus no território inimigo rendem moedas
    this._t_avanco += dt;
    if (this._t_avanco >= C.AVANCO_INTERVALO) {
      this._t_avanco -= C.AVANCO_INTERVALO;
      for (const time of ['verde', 'vermelho']) {
        let n = 0, frente = null;
        for (const q of this.esquadroes) {
          if (q.time !== time || !q.sold.length || q.treinando || q.exclusa || q.tipo === 'heli') continue;
          if (M.dono(q.x, q.y) === time) continue;
          n += q.sold.length;
          if (!frente || q.sold.length > frente.sold.length) frente = q;
        }
        if (!n) continue;
        const caixa = this.moedas_de(time);
        let g = Math.min(C.AVANCO_TETO, n * C.AVANCO_POR_SOLDADO) + this._resto_avanco[time];
        g = Math.min(g, Math.max(0, C.BASE_MOEDAS_TETO - caixa));   // o mesmo teto do caixa das bases
        const inteiro = Math.floor(g);
        this._resto_avanco[time] = g - inteiro;
        if (inteiro <= 0) continue;
        this._dar_moedas(time, inteiro);
        const f = [frente.x, frente.y, '+' + inteiro, 0.0];
        f._para = time;
        if (time === 'verde' || this.eco) this.flutuantes.push(f);
      }
    }
    // REPARO: construções paradas (sem levar dano) se consertam com parafusos
    for (const o of [...this.todas_bases(), ...this.torres, ...this.barricadas]) {
      if (o.vida <= 0 || o.vida >= o.vida_max) continue;
      if (this.t_jogo - (o.levou_dano ?? -1e9) < C.REPARO_ESPERA) continue;
      o._t_reparo = (o._t_reparo || 0) + dt;
      if (o._t_reparo < C.REPARO_INTERVALO) continue;
      o._t_reparo = 0;
      if (this.parafusos[o.time] <= C.REPARO_RESERVA) continue;   // a reserva é das bases
      this.parafusos[o.time] -= 1;
      o.vida = Math.min(o.vida_max, o.vida + o.vida_max * C.REPARO_PASSO);
      this.reparos.push([o.x, o.y, o.time, 0.0]);
    }
    for (let i = 0; i < this.reparos.length; i++) this.reparos[i][3] += dt;
    _compactar(this.reparos, r => r[3] <= 1.0);
  }

  _passo_treino(dt) {
    for (const time of ['verde', 'vermelho']) {
      const ocup = this.treino_ocup[time];
      const inv = this.campo_invadido[time];
      for (let n = 0; n < 3; n++) inv[n] = this._invasor_do_campo(time, n);
      for (let n = 0; n < 3; n++) {
        const sq = ocup[n];
        const relogio = this.t_pf_campo[time];
        if (!sq) { relogio[n] = 0; continue; }   // campo vazio: não conta
        if (sq.treino !== n || !sq.sold.length || !this.esquadroes.includes(sq)) {   // saiu ou morreu
          ocup[n] = null; relogio[n] = 0;
          if (sq.treino === n) sq.treino = -1;
          continue;
        }
        const a = M.area_de(time, n);
        const u = sq.x - sq.y, v = sq.x + sq.y;
        if (u < a.u0 || u > a.u1 || v < a.v0 || v > a.v1 || sq.treinando) continue;   // ainda chegando
        if (sq.alvo) continue;   // inimigo por perto: luta, o treino espera
        // CAMPO com gente treinando rende PARAFUSOS: 3 a cada 10 s (cada campo conta o seu).
        // Inimigo dentro do campo: para de render. Armazém cheio: também.
        // tropa já 2V não rende mais parafusos (fase 2): tem de ser tirada à mão para dar a vez
        if (!inv[n] && this.parafusos[time] < C.PARAFUSOS_TETO && sq.nivel_treino < C.TREINO_MAX) relogio[n] += dt;
        if (relogio[n] >= C.PARAFUSO_TREINO) {
          relogio[n] -= C.PARAFUSO_TREINO;
          this.parafusos[time] = Math.min(C.PARAFUSOS_TETO, this.parafusos[time] + this.ganho_treino(time));
          this.ganhos_pf.push([a.x, a.y, time, 0.0]);
        }
        if (sq.nivel_treino < C.TREINO_MAX) {
          sq.t_treino += dt;
          if (sq.t_treino >= this.tempo_treino(time)) {
            sq.t_treino -= this.tempo_treino(time);
            this._subir_treino(sq);
            if (sq.nivel_treino >= C.TREINO_MAX) sq.t_treino = 0.0;
          }
        }
        this._exercicio(sq, a, dt);
      }
    }
  }

  // ---------- FASE 2: tropa abatida (presa ou de volta ao treino) ----------
  // ---------- FASE 3: melhorias da base (moedas) ----------
  mult_torre(tr) { return (1 + C.MELHORIAS_BASE.tdano.passo * this.melh_base[tr.time].tdano) * (tr.graca ? C.TORRE_GRACA_DANO : 1); }
  mult_vida_base(time) { return 1 + C.MELHORIAS_BASE.bvida.passo * this.melh_base[time].bvida; }
  tempo_treino(time) { return C.TREINO_TEMPO * (1 - C.MELHORIAS_BASE.tvel.passo * this.melh_base[time].tvel); }
  ganho_treino(time) { return C.PARAFUSO_GANHO + C.MELHORIAS_BASE.tpf.passo * this.melh_base[time].tpf; }
  custo_mb(time, m) { const n = this.melh_base[time][m]; return n >= C.MELH_BASE_MAX ? Infinity : C.MELHORIAS_BASE[m].custos[n]; }
  pode_mb(time, m) { return !this.fim && this.melh_base[time][m] < C.MELH_BASE_MAX && this.moedas_de(time) >= this.custo_mb(time, m); }
  comprar_mb(time, m) {
    if (!(m in C.MELHORIAS_BASE) || !this.pode_mb(time, m)) {
      if (this.som.para) this.som.para(time, 'erro'); else if (time === 'verde') this.som.tocar('erro');
      return false;
    }
    this._dar_moedas(time, -this.custo_mb(time, m));
    const antes = this.mult_vida_base(time);
    this.melh_base[time][m] += 1;
    if (m === 'bvida') {   // o QG e as bases ganham a vida extra na hora
      const k = this.mult_vida_base(time) / antes;
      for (const b of this.todas_bases()) if (b.time === time && !b.nave) { b.vida *= k; b.vida_max *= k; }
    }
    const nome = this.melh_base[time][m] >= C.MELH_BASE_MAX ? 'nivel_max' : 'compra';
    if (this.som.para) this.som.para(time, nome); else if (time === 'verde') this.som.tocar(nome);
    return true;
  }

  // ---------- FASE 4: munição, estoque e refinaria ----------
  _mtr_sem_mun(sq, k, com_bonus, base, L) {
    if (!L) return base;
    return base + this.mult[sq.time][k] * C.TREINO_BONUS * L;
  }
  _fator_mun(sq) { return sq.mun > 0 || this.horda ? 1 : C.MUN_SEM_DANO; }

  base_perto(time, x, y) {
    // a base viva do time mais perto de (x, y) e a distância até ela
    let melhor = null, md = Infinity;
    const bs = this.todas_bases();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.time !== time || b.vida <= 0 || b.nave) continue;
      const d = hip(b.x - x, b.y - y);
      if (d < md) { md = d; melhor = b; }
    }
    return [melhor, md];
  }

  _passo_mun(sq, dt) {
    if (!sq.sold.length || sq.treinando) return;
    const [b, d] = this.base_perto(sq.time, sq.x, sq.y);
    if (sq.alvo) {
      if (d <= C.MUN_RAIO_LIVRE || sq.mun <= 0) return;   // perto de casa: tiro de graça
      const taxa = Math.min(3, 1 + (d - C.MUN_RAIO_LIVRE) / C.MUN_LONGE) / C.MUN_TEMPO;
      sq.mun = Math.max(0, sq.mun - taxa * dt);
      if (sq.mun <= 0) {
        const fl = [sq.x, sq.y, 'SEM MUNIÇÃO', 0.0]; fl._para = sq.time;
        this.flutuantes.push(fl);
        if (this.som.para) this.som.para(sq.time, 'erro'); else if (sq.time === 'verde') this.som.tocar('erro', sq.x, sq.y);
      }
      return;
    }
    if (sq.mun >= 1 || !b || d > C.MUN_RAIO_RECARGA || !b.estoque) return;
    const item = C.MUN_ITEM[sq.tipo], tem = b.estoque[item] || 0;
    if (tem <= 0) return;
    const add = Math.min(1 - sq.mun, dt / C.MUN_RECARGA, tem);
    sq.mun += add; b.estoque[item] = tem - add;
    if (sq.mun >= 0.999) sq.mun = 1;
  }

  pode_ref(time, item) {
    const r = Object.prototype.hasOwnProperty.call(C.REFINARIA, item) ? C.REFINARIA[item] : null, qg = this.bases[time];
    return !!r && !this.fim && this.refinaria[time].length < C.REF_FILA && this.parafusos[time] >= r.pf &&
      (!r.polvora || (qg.estoque && qg.estoque.polvora >= r.polvora));
  }
  pedir_ref(time, item) {
    // REFINARIA: paga agora (parafusos e, se precisar, pólvora do QG) e entra na fila
    if (!this.pode_ref(time, item)) {
      if (this.som.para) this.som.para(time, 'erro'); else if (time === 'verde') this.som.tocar('erro');
      return false;
    }
    const r = C.REFINARIA[item];
    this.parafusos[time] -= r.pf;
    if (r.polvora) this.bases[time].estoque.polvora -= r.polvora;
    this.refinaria[time].push({ item, t: r.tempo });
    if (this.som.para) this.som.para(time, 'compra'); else if (time === 'verde') this.som.tocar('compra');
    return true;
  }
  _passo_refinaria(dt) {
    for (const time of ['verde', 'vermelho']) {
      const fila = this.refinaria[time];
      if (!fila.length || this.fim) continue;
      fila[0].t -= dt;
      if (fila[0].t > 0) continue;
      const o = fila.shift(), qg = this.bases[time], r = C.REFINARIA[o.item];
      qg.estoque[o.item] = Math.min(C.ESTOQUE_MAX, (qg.estoque[o.item] || 0) + r.lote);
      const fl = [qg.x, qg.y, `+${r.lote} ${C.NOME_ITEM[o.item].toUpperCase()}`, 0.0]; fl._para = time;
      this.flutuantes.push(fl);
    }
  }

  // ---------- FASE 5: caminhões de logística ----------
  _novo_caminhao(time) {
    const qg = this.bases[time], s = time === 'verde' ? 1 : -1;
    const n = this.caminhoes.filter(c => c.time === time).length;
    const c = new Caminhao(time, qg.x + s * (3.2 + n * 1.4), qg.y - s * (1.0 + n * 1.4), ++this._id_cam);
    this.caminhoes.push(c);
    return c;
  }
  caminhoes_de(time) { let n = 0; for (const c of this.caminhoes) if (c.time === time) n++; return n; }
  pode_comprar_caminhao(time) { return !this.fim && this.caminhoes_de(time) < C.MAX_CAMINHOES && this.moedas_de(time) >= C.CUSTO_CAMINHAO; }
  comprar_caminhao(time) {
    if (!this.pode_comprar_caminhao(time)) {
      if (this.som.para) this.som.para(time, 'erro'); else if (time === 'verde') this.som.tocar('erro');
      return null;
    }
    this._dar_moedas(time, -C.CUSTO_CAMINHAO);
    const c = this._novo_caminhao(time);
    if (this.som.para) this.som.para(time, 'construir'); else if (time === 'verde') this.som.tocar('construir', c.x, c.y);
    return c;
  }
  ordem_caminhao(c, papel, b) {
    // papel: 'de' (base de carga), 'para' (base de descarga) ou 'parar'
    if (!c || !this.caminhoes.includes(c) || this.fim) return false;
    if (papel === 'parar') { c.de = null; c.para = null; c.alvo_b = null; c.caminho = []; c.destino = null; c.estado = 'parado'; return true; }
    if (!b || b.time !== c.time || b.vida <= 0 || b.nave || !b.estoque) return false;
    if (papel === 'de') { c.de = b; if (c.para === b) c.para = null; }
    else if (papel === 'para') { if (c.de === b) return false; c.para = b; }
    else return false;
    c.alvo_b = null;   // repensa no próximo passo
    if (this.som.para) this.som.para(c.time, 'ordem'); else if (c.time === 'verde') this.som.tocar('ordem');
    return true;
  }
  _carregar(c) {
    // leva o que FALTA no destino e SOBRA na origem, uma caixa por vez
    const A = c.de.estoque, B = c.para ? c.para.estoque : null;
    const res = c.de.principal ? C.CAMINHAO_RESERVA_QG : 0;
    while (c.carga_total < C.CAMINHAO_CAP) {
      let melhor = null, ms = 0;
      for (const k of C.ITENS) {
        if (k === 'polvora') continue;   // pólvora é matéria-prima da refinaria (fica no QG)
        const sobra = (A[k] || 0) - res - 1;
        if (sobra < 0) continue;
        const sc = B ? (A[k] || 0) - res - (B[k] || 0) - c.carga[k] : sobra + 1;
        if (sc > ms) { ms = sc; melhor = k; }
      }
      if (!melhor) break;
      A[melhor] -= 1; c.carga[melhor] += 1; c.carga_total += 1;
    }
  }
  _descarregar(c) {
    const B = c.para.estoque;
    for (const k of C.ITENS) {
      const cabe = Math.max(0, Math.min(c.carga[k], C.ESTOQUE_MAX - (B[k] || 0)));
      B[k] = (B[k] || 0) + cabe; c.carga[k] -= cabe; c.carga_total -= cabe;
    }
    const fl = [c.para.x, c.para.y, 'CARGA ENTREGUE', 0.0]; fl._para = c.time;
    this.flutuantes.push(fl);
  }
  _ir(c, b) {
    if (c.alvo_b === b && (c.destino || c.caminho.length)) return;
    c.alvo_b = b;
    // para ao lado da base, do lado de onde vem
    const d = hip(c.x - b.x, c.y - b.y) || 1;
    const tx = b.x + (c.x - b.x) / d * (C.CAMINHAO_CHEGOU - 0.6), ty = b.y + (c.y - b.y) / d * (C.CAMINHAO_CHEGOU - 0.6);
    c.caminho = Tropas._rota_estrada(c.x, c.y, tx, ty);
    c.destino = c.caminho.length ? c.caminho.shift() : [tx, ty];
  }
  _passo_caminhoes(dt) {
    const cams = this.caminhoes;
    for (let i = cams.length - 1; i >= 0; i--) {
      const c = cams[i];
      if (c.vida <= 0) {   // destruído: a carga se perde
        cams.splice(i, 1);
        this.explosoes.push([c.x, c.y, 0.0, rnd() * 6.28, 1.1]);
        this.marcas.push([c.x, c.y, 0.0]);
        const fl = [c.x, c.y, 'CAMINHÃO DESTRUÍDO', 0.0]; fl._para = c.time;
        this.flutuantes.push(fl);
        this.som.tocar('base_destruida', c.x, c.y, 0.5);
        continue;
      }
      if (this.fim) continue;
      if (c.de && (c.de.vida <= 0 || !this.todas_bases().includes(c.de))) c.de = null;
      if (c.para && (c.para.vida <= 0 || !this.todas_bases().includes(c.para))) c.para = null;
      // para onde ir agora
      let b = null, op = null;
      if (c.carga_total > 0 && c.para) { b = c.para; op = 'descarregar'; }
      else if (c.de) { b = c.de; op = 'carregar'; }
      if (!b) { c.estado = c.carga_total > 0 ? 'esperando' : 'parado'; c.alvo_b = null; this._andar_caminhao(c, dt); continue; }
      if (hip(c.x - b.x, c.y - b.y) <= C.CAMINHAO_CHEGOU) {
        c.caminho = []; c.destino = null; c.alvo_b = b;
        c.estado = op === 'carregar' ? 'carregando' : 'descarregando';
        c.t_op += dt;
        if (c.t_op < C.CAMINHAO_TEMPO_CARGA) continue;
        c.t_op = 0;
        if (op === 'carregar') {
          this._carregar(c);
          if (!c.carga_total) { c.estado = 'esperando'; c.t_op = -4; }   // nada para levar: espera e tenta de novo
          else if (!c.para) c.estado = 'esperando';
        } else this._descarregar(c);
        continue;
      }
      c.t_op = 0;
      c.estado = op === 'carregar' ? 'indo_carregar' : 'indo_descarregar';
      this._ir(c, b);
      this._andar_caminhao(c, dt);
    }
  }
  _andar_caminhao(c, dt) {
    if (!c.destino) return;
    const vel = (M.dist_estrada(c.x, c.y) <= 1.6 ? C.VEL_ESTRADA : C.VEL_NEVE) * C.CAMINHAO_VEL;
    const dx = c.destino[0] - c.x, dy = c.destino[1] - c.y, d = hip(dx, dy);
    if (d < 0.05) { c.destino = c.caminho.length ? c.caminho.shift() : null; return; }
    const p = Math.min(d, vel * dt);
    c.x += dx / d * p; c.y += dy / d * p;
    const k = Math.min(1, dt * 6);   // vira suave
    c.hx += (dx / d - c.hx) * k; c.hy += (dy / d - c.hy) * k;
    if (d - p < 0.05) c.destino = c.caminho.length ? c.caminho.shift() : null;
  }

  _ao_cair(sq) {
    if (this.fim || this.horda || sq.exclusa || !C.PRESO_TIPOS.includes(sq.tipo)) return;
    const n = C.metade_tropa(sq.tipo);
    if (M.dono(sq.x, sq.y) !== sq.time) {
      // campo inimigo: fica presa ali esperando resgate
      this.presos.push({ time: sq.time, tipo: sq.tipo, x: sq.x, y: sq.y, n, t: C.PRESO_TEMPO });
      const fl = [sq.x, sq.y, 'TROPA PRESA · 90s P/ RESGATAR', 0.0]; fl._para = sq.time;
      this.flutuantes.push(fl);
    } else if (C.TREINO_TIPOS.includes(sq.tipo)) {
      // seu campo: metade volta para o treino (ou para a fila)
      this.fila_treino[sq.time].push({ tipo: sq.tipo, n });
      const fl = [sq.x, sq.y, 'VOLTA PARA O TREINO', 0.0]; fl._para = sq.time;
      this.flutuantes.push(fl);
    }
  }

  _cabe(time, tipo, n, sq = null) {
    // n soldados a mais deste tipo cabem no limite de soldados e no limite do mapa?
    const lim = this._lim_soldados(time);
    if (tipo !== 'heli' && this._soldados(time) + n * (C.PESO_SOLDADO[tipo] || 1) > lim) return false;
    const T = C.PELOTOES[tipo].soldados;
    const antes = sq ? Math.ceil((sq.sold.length + sq.treinando) / T) : 0;
    const depois = sq ? Math.ceil((sq.sold.length + sq.treinando + n) / T) : Math.ceil(n / T);
    return this.vivos_tipo(time, tipo) - antes + depois <= C.limite_mapa(tipo);
  }

  _lim_soldados(time) { return time === 'verde' ? this.limite_soldados() : this.ia_limite_soldados(); }   // (PvP troca)

  _passo_abatidas(dt) {
    // PRESAS: relógio de 90 s; tropa sua do mesmo tipo encostando resgata
    for (let i = this.presos.length - 1; i >= 0; i--) {
      const p = this.presos[i];
      p.t -= dt;
      if (p.t <= 0 || this.fim) { this.presos.splice(i, 1); continue; }
      for (let k = 0; k < this.esquadroes.length; k++) {
        const sq = this.esquadroes[k];
        if (sq.time !== p.time || sq.tipo !== p.tipo || !sq.sold.length || sq.exclusa || sq.nivel_treino || sq.treino >= 0) continue;
        const r = sq.raio() + C.PRESO_RAIO;
        if ((sq.x - p.x) ** 2 + (sq.y - p.y) ** 2 > r * r || !this._cabe(p.time, p.tipo, p.n, sq)) continue;
        const hp = this.hp(p.time, p.tipo);
        for (let j = 0; j < p.n; j++) sq.sold.push(new Soldado(p.x + (rnd() - 0.5), p.y + (rnd() - 0.5), p.time, p.tipo));
        sq.vida += hp * p.n; sq.vida_max += hp * p.n;
        sq.cols = Math.max(1, Math.ceil(Math.sqrt(sq.sold.length)));
        this._organizar(sq);
        this._esq_ver++;
        const fl = [p.x, p.y, `RESGATADA +${p.n}`, 0.0]; fl._para = p.time;
        this.flutuantes.push(fl);
        if (this.som.para) this.som.para(p.time, 'pronta_amiga'); else if (p.time === 'verde') this.som.tocar('pronta_amiga', p.x, p.y);
        this.presos.splice(i, 1);
        break;
      }
    }
    // FILA do treino: a primeira entra no primeiro campo livre (sem inimigo dentro)
    for (const time of ['verde', 'vermelho']) {
      const fila = this.fila_treino[time];
      if (!fila.length || this.fim) continue;
      const f = fila[0];
      if (!this._cabe(time, f.tipo, f.n)) continue;   // sem vaga no mapa: espera
      for (let n = 0; n < 3; n++) {
        const a = M.area_de(time, n);
        if (!a || this.treino_ocup[time][n] || this.ocupante_treino(time, n) || (this.campo_invadido[time] && this.campo_invadido[time][n])) continue;
        const sq = this._criar(time, a.x, a.y, Math.min(f.n, a.cap), f.tipo);
        this._organizar(sq, true);
        sq.treino = n; sq._drill = 0.0; sq._perna = 2;
        if (sq.ia) sq.papel = 'treino';
        this.treino_ocup[time][n] = sq;
        fila.shift();
        const fl = [a.x, a.y, 'VOLTOU AO TREINO', 0.0]; fl._para = time;
        this.flutuantes.push(fl);
        break;
      }
    }
  }

  _exercicio(sq, a, dt) {
    // dentro do campo a tropa não fica parada: marcha de um lado ao outro e
    // para na linha de tiro, virada para os alvos
    sq._drill += dt;
    if (sq.destino) return;   // ainda andando para o ponto do exercício
    if (sq._perna === 2 && sq._drill < 9.0) {
      const hx = a.alvos * 0.7071, hy = -a.alvos * 0.7071;
      if (sq.hx !== hx || sq.hy !== hy) { sq.hx = hx; sq.hy = hy; this._organizar(sq); }
      return;
    }
    const forma = Math.ceil(Math.sqrt(sq.sold.length)) * C.ESPACO * 1.4142;   // largura da formação em (u)
    const folga = Math.max(0, (a.u1 - a.u0 - forma) / 2 - 1.2);
    const uc = (a.u0 + a.u1) / 2, vc = (a.v0 + a.v1) / 2;
    sq._perna = (sq._perna + 1) % 3;
    sq._drill = 0.0;
    let u = uc;
    if (sq._perna === 0) u = uc - folga * 0.85;
    else if (sq._perna === 1) u = uc + folga * 0.85;
    else u = uc - a.alvos * folga * 0.4;   // linha de tiro: um pouco longe dos alvos
    sq.caminho = [];
    sq.destino = de_uv(u, vc);
    if (Math.abs(u - (sq.x - sq.y)) < 0.3) sq.destino = null;   // já está lá
  }

  tocar(wx, wy) {
    // Seleciona, funde tropas iguais, persegue inimigos ou anda no terreno.
    if (this.fim) return;
    let perto = null, md = Infinity;
    for (let _i16 = 0, _a16 = this.esquadroes; _i16 < _a16.length; _i16++) {
      const sq = _a16[_i16];
      if (!sq.sold.length) continue;
      const d2 = (sq.x - wx) ** 2 + (sq.y - wy) ** 2;
      if (d2 < (sq.raio() + 0.4) ** 2 && d2 < md) { md = d2; perto = sq; }
    }
    const sel = this.selecionado;
    if (perto && perto.time === 'verde' && (sel === null || perto === sel)) {
      this.selecionado = sel === perto ? null : perto;
      this.som.tocar(this.selecionado ? 'selecionar' : 'desselecionar');
      return;
    }
    if (sel === null) return;
    if (perto && perto.time === 'verde' && !this._pode_fundir(sel, perto)) {
      this.selecionado = perto;  // classes diferentes (ou tropa de base destruída) não se fundem
      this.som.tocar('selecionar');
      return;
    }
    sel.perseguir = null;
    sel.fundir = null;
    sel.caminho = [];
    if (perto && perto.time === 'verde') {
      sel.fundir = perto;
      this._ordem(sel, perto.x, perto.y);
    } else if (perto && perto.time !== 'verde') {
      sel.perseguir = perto;
      this._ordem(sel, perto.x, perto.y);
    } else {
      const u = limitar(wx - wy, -C.CENA_U + 2, C.CENA_U - 2);
      const v = limitar(wx + wy, -C.CENA_V + 3, C.CENA_V - 3);
      const [x, y] = de_uv(u, v);
      this._ordem(sel, x, y, M.eh_estrada(wx, wy));
    }
    this.deu_ordem = true;
    this.selecionado = null;
    this.som.tocar('ordem');
    this.selecionado = null;  // ordem executada: toque seguinte nao reutiliza o grupo
  }

  static _chave_fusao(time, tipo, gx, gy) {
    const t = (time === 'verde' ? 0 : 1) * 16 + (C.ORDEM_CARTAS.indexOf(tipo) + 1);
    return (t * 4096 + (gx + 2048)) * 4096 + (gy + 2048);
  }

  _autofundir_proximos() {
    // Funde aliados da mesma classe automaticamente, com margem curta.
    // Grade espacial evita comparar todos os esquadrões com todos.
    const celula = 8.0;
    const grade = new Map();
    for (let _i17 = 0, _a17 = this.esquadroes; _i17 < _a17.length; _i17++) {
      const sq = _a17[_i17];
      if (sq.vida <= 0 || !sq.sold.length || sq.tipo === 'heli' || sq.tipo === 'tanque' || sq.exclusa || sq.treino >= 0) continue;
      const chave = Tropas._chave_fusao(sq.time, sq.tipo, Math.floor(sq.x / celula), Math.floor(sq.y / celula));   // número (sem montar texto)
      let lista = grade.get(chave);
      if (!lista) { lista = []; grade.set(chave, lista); }
      lista.push(sq);
    }
    const removidos = new Set();
    for (let _i18 = 0, _a18 = this.esquadroes.slice(); _i18 < _a18.length; _i18++) {
      const sq = _a18[_i18];
      if (removidos.has(sq) || sq.vida <= 0 || !sq.sold.length || sq.tipo === 'heli' || sq.tipo === 'tanque' || sq.exclusa || sq.treino >= 0) continue;
      const gx = Math.floor(sq.x / celula), gy = Math.floor(sq.y / celula);
      for (const dx of [-1, 0, 1]) {
        for (const dy of [-1, 0, 1]) {
          const lista = grade.get(Tropas._chave_fusao(sq.time, sq.tipo, gx + dx, gy + dy));
          if (!lista) continue;
          for (let _i19 = 0, _a19 = lista; _i19 < _a19.length; _i19++) {
            const amigo = _a19[_i19];
            if (amigo === sq || removidos.has(amigo) || amigo.vida <= 0 || !amigo.sold.length) continue;
            // Margem moderada além do raio físico, sem fusões à distância.
            const margem = 1.15;
            const distancia = sq.raio() + amigo.raio() + margem;
            if ((sq.x - amigo.x) ** 2 + (sq.y - amigo.y) ** 2 <= distancia ** 2) {
              this._fundir(amigo, sq);
              removidos.add(amigo);
            }
          }
        }
      }
    }
    return removidos.size;
  }

  _premio_tropa(sq) {
    if (sq.time === 'vermelho') {   // prêmio: moedas pelo tamanho da tropa vencida
      let premio = Math.max(C.PREMIO_MIN, Math.trunc(sq.vida_max / this.hp('vermelho') * C.PREMIO_POR_SOLDADO + 0.5));
      if (sq.tipo !== 'pelotao') premio += 10;   // tropas especiais valem mais
      premio = Math.max(1, Math.round(premio * C.PREMIO_ABATE_FATOR * this.fator_virada('verde')));   // a metade (+ virada)
      this.moedas += premio;
      this.flutuantes.push([sq.x, sq.y, '+' + premio, 0.0]);
      this.som.tocar('moeda');
    } else if (!sq.exclusa) {   // o inimigo ganha pelas suas tropas do mesmo jeito
      let premio = Math.max(C.PREMIO_MIN, Math.trunc(sq.vida_max / this.hp('verde') * C.PREMIO_POR_SOLDADO + 0.5));
      if (sq.tipo !== 'pelotao') premio += 10;
      this.moedas_ia += Math.max(1, Math.round(premio * C.PREMIO_ABATE_FATOR * this.fator_virada('vermelho')));   // a metade para a IA também
    }
  }

  _vaga_desembarque(time, n) {
    // Não ultrapassar a capacidade de soldados do jogador.
    if (time === 'verde') n = Math.min(n, Math.max(0, this.limite_soldados() - this._soldados('verde')));
    return n;
  }

  // ---------- atualização -------------------------------------------
  // A atualização foi dividida em partes menores (mesma ordem, mesma conta).
  // Uma função gigante o otimizador do navegador não consegue compilar bem, e
  // aí cada número com vírgula vira um objeto novo na memória: era a maior
  // fonte de lixo -> pausas do coletor -> engasgos.
  atualizar(dt) {
    const som = this.som;
    this._grade.montar(this.esquadroes, this._esq_ver);   // grade espacial deste passo
    this._passo_inicio(dt);
    if (!this.fim) this._passo_economia(dt);
    for (let q = this.esquadroes.length - 1; q >= 0; q--) this._passo_esquadrao(this.esquadroes[q], q, dt, som);
    this._passo_projeteis(dt, som);
    if (this.treino_ocup) this._passo_treino(dt);
    if (this.presos) this._passo_abatidas(dt);
    if (this.refinaria) this._passo_refinaria(dt);
    if (this.caminhoes) this._passo_caminhoes(dt);
    if (this.torres.length) this._passo_torres(dt);
    if (this.zonas_fogo.length) this._passo_zonas_fogo(dt);
    if (this.barricadas.length) this._passo_barricadas(dt);
  }

  _passo_inicio(dt) {
    for (let i = 0; i < this.ganhos_pf.length; i++) this.ganhos_pf[i][3] += dt;
    _compactar(this.ganhos_pf, g => g[3] <= 1.6);
    this.t_jogo += dt;
    this.efeitos_tanque.atualizar(dt);
    // Escapamentos emitem fumaça enquanto o motor estiver ligado.
    for (let _i20 = 0, _a20 = this.esquadroes; _i20 < _a20.length; _i20++) {
      const veiculo = _a20[_i20];
      if (veiculo.tipo === 'tanque' && veiculo.vida > 0) {
        const intervalo = veiculo.movendo ? 0.12 : 0.45;
        let restante = (this._tanques_anteriores.get(veiculo) || 0.0) - dt;
        if (restante <= 0) {
          this.efeitos_tanque.fumaca(veiculo.x - veiculo.hx * 0.8,
            veiculo.y - veiculo.hy * 0.8, 0.7, { dur: 1.5, r0: 0.12, r1: 0.6, cor: [90, 94, 102] });
          restante = intervalo;
        }
        this._tanques_anteriores.set(veiculo, restante);
      }
    }
    this._tempo_autofusao += dt;
    if (this._tempo_autofusao >= 0.30) {
      this._tempo_autofusao = 0.0;
      this._autofundir_proximos();
    }
    const som = this.som;
    if (!this.fim) {
      // moedas entram sozinhas (como o elixir); avisa quando uma carta fica pagável
      const podia = C.ORDEM_CARTAS.map(t => this.carta_pronta(t));
      for (let i = 0; i < Math.min(podia.length, this._podia.length); i++) {
        if (podia[i] && !this._podia[i]) { som.tocar('carta_pronta'); break; }
      }
      this._podia = podia;
      if (this.horda) this.horda.passo(dt);   // modo zumbi: a horda anda, morde e nasce
      else this._ia(dt);   // o inimigo prepara e lança as ondas
      this._atualizar_bases(dt);

      // as bases se defendem: atiram na tropa inimiga mais próxima
      for (let _i21 = 0, _a21 = this.todas_bases(); _i21 < _a21.length; _i21++) {
        const b = _a21[_i21];
        const time = b.time;
        if (b.vida <= 0 || b.nave) continue;   // (a nave caída não atira)
        b.cool -= dt;
        if (b.cool > 0) continue;
        b.cool = C.CADENCIA_BASE * (b.principal ? 1 : 3);   // base extra atira mais devagar
        let a = this._escolher_alvo(time, b.x, b.y, C.ALCANCE + 2);
        if (!a || a.base || !a.sold.length) continue;
        if (a.zumbi) a = this.horda.espalhar(a, C.DANO_TIRO);
        const v = a.sold[sorteio(a.sold.length)];
        this.tracos.push(new Traco(b.x, b.y, v.x, v.y, a, C.DANO_TIRO * this.mult[time].dano, 1.4, 0.42));
        som.tocar('tiro_base', b.x, b.y);
      }
    }
  }

  _passo_esquadrao(sq, q, dt, som) {

    // destruído: todo mundo cai
    if (sq.vida <= 0 && !sq.treinando) {
      while (sq.sold.length) this._derrubar(sq, sq.sold.length - 1);
      this.esquadroes.splice(q, 1);
      this._esq_ver++;
      if (this.selecionado === sq) this.selecionado = null;
      som.tocar(sq.time === 'verde' ? 'destruida_amiga' : 'destruida', sq.x, sq.y);
      this._premio_tropa(sq);
      this._ao_cair(sq);   // fase 2: presa no campo inimigo ou volta para o treino
      return;
    }

    // IA em fila atrás de um amigo dá tiro de apoio por cima dele (alcance maior)
    const fila = (sq.ia && sq.atacando && !sq.destino &&
      this.esquadroes.some(o => o !== sq && o.rota === sq.rota && o.atacando && !o.destino && 0 < o.s - sq.s && o.s - sq.s < 5.2));
    sq.alvo = this.fim ? null : this._escolher_alvo(sq.time, sq.x, sq.y, sq.alcance() * (fila ? C.APOIO : 1), sq.tipo);
    if (this.refinaria && !this.horda) this._passo_mun(sq, dt);   // fase 4: gasta longe da base, recarrega com estoque
    if (sq.bloqueio) {   // uma barricada inimiga barra o caminho (sem desvio, ou na estrada): ataca ela
      const b = sq.bloqueio;
      if (b.vida <= 0 || !this.barricadas.includes(b) || this.fim) sq.bloqueio = null;
      else if (!sq.alvo || sq.alvo.base) sq.alvo = b;
    }
    if (!sq.ia && sq.fundir) {
      const amigo = sq.fundir;
      if (!this.esquadroes.includes(amigo) || amigo.vida <= 0) {
        sq.fundir = null;
      } else if (hip(sq.x - amigo.x, sq.y - amigo.y) <= Math.max(0.8, amigo.raio() * 0.65)) {
        this._fundir(sq, amigo);
        return;
      } else {
        sq.destino = [amigo.x, amigo.y];
      }
    }
    if (!sq.ia && sq.perseguir) {
      const inimigo = sq.perseguir;
      if (inimigo.vida <= 0 || (!inimigo.base && !this.esquadroes.includes(inimigo))) {
        sq.perseguir = null;
        sq.destino = null;
      } else {
        const dx = inimigo.x - sq.x, dy = inimigo.y - sq.y;
        const distancia = hip(dx, dy);
        if (distancia <= sq.alcance() * 0.90) {
          sq.destino = null;
          sq.caminho = [];
        } else {
          sq.destino = [inimigo.x, inimigo.y];
        }
      }
    }
    // Combate automático avaliado em TODOS os quadros, mesmo com
    // ambos os grupos imóveis. Ao detectar inimigo, interrompe
    // deslocamento normal para atirar dentro da bolha de alcance.
    // A tropa que recebeu ordem de andar pode parar para defender-se,
    // sem perder os pontos restantes do caminho.
    sq.movendo = false;
    const veiculo = sq.tipo === 'heli' || sq.tipo === 'tanque';

    if (sq.treinando > 0 && sq.chega > 0) {
      // tropa comprada a caminho: só a marca no chão; depois de 1 minuto aparece inteira ali
      sq.chega -= dt;
      if (sq.chega <= 0) {
        sq.chega = 0;
        const n = sq.treinando;
        sq.treinando = 0;
        for (let i = 0; i < n; i++) {
          sq.sold.push(new Soldado(sq.x + (rnd() - 0.5) * 0.5, sq.y + (rnd() - 0.5) * 0.5, sq.time, sq.tipo));
          sq.vida += this.hp(sq.time, sq.tipo) * sq.reforco_vida;
        }
        this._organizar(sq, true);
        for (let i = 0; i < sq.sold.length; i += 3) this.sopros.push([sq.sold[i].x, sq.sold[i].y, 0.1, 0.0]);
        this._esq_ver++;
        som.tocar(sq.time === 'verde' ? 'pronta_amiga' : 'pronta_inimiga', sq.x, sq.y, 0.6);
      }
    } else if (sq.treinando > 0) {
      // soldados saem da base um a um; a vida cresce junto
      sq.relogio += dt;
      while (sq.relogio >= C.INTERVALO_SOLDADO && sq.treinando > 0) {
        sq.relogio -= C.INTERVALO_SOLDADO;
        sq.treinando -= 1;
        const [px, py] = sq.porta || M.PORTA[sq.time];
        sq.sold.push(new Soldado(px + (rnd() - 0.5) * 0.5, py + (rnd() - 0.5) * 0.3, sq.time, sq.tipo));
        sq.vida += this.hp(sq.time, sq.tipo) * sq.reforco_vida;
        if (!sq.treinando) {
          som.tocar(sq.time === 'verde' ? 'pronta_amiga' : 'pronta_inimiga', sq.x, sq.y);
          const ro = sq.base_origem && sq.base_origem.reuniao;   // GPS da base: vai sozinha para o ponto
          if (ro && !sq.ia) this._ordem(sq, ro[0], ro[1]);
        }
      }
    } else if (sq.ia && !sq.fuga && (sq.alvo || this.fim)) {
      // IA com inimigo no alcance: para e luta (todas as tropas, veículos também);
      // o destino e o resto do caminho ficam guardados e ela continua depois
    } else if (!sq.ia && sq.alvo && !sq.fundir && (!sq.perseguir || sq.destino === null)) {
      // inimigo entrou no círculo no meio do caminho: PARA, ataca e depois segue
      // (vale para todas as tropas: a pé, tanque e helicóptero)
    } else if (sq.ia && sq.atacando && !sq.destino) {
      // IA: segue a rota; para se há um amigo logo à frente
      if (!fila && sq.s < sq.rota.comprimento) {
        const s2 = sq.s + C.VEL_ESTRADA * C.PELOTOES[sq.tipo].vel * dt;
        const [x, y, dx, dy] = sq.rota.em(s2);
        const b = this.barricadas.length && sq.tipo !== 'heli' ? this._barreira_no_passo(sq, x, y) : null;
        if (b) {
          sq.bloqueio = b;   // barricada em cima da estrada: não dá para passar, ataca
        } else {
          sq.s = s2;
          sq.x = x; sq.y = y;
          Tropas._virar(sq, dx, dy, dt);
          sq.movendo = true;
        }
      }
    } else if (sq.destino) {
      // anda reto até o destino (mais rápido na estrada): ordens do
      // jogador, e a IA indo do ponto de preparo até a estrada
      const dx = sq.destino[0] - sq.x, dy = sq.destino[1] - sq.y;
      const d = hip(dx, dy);
      sq._estrada_t -= dt;
      if (sq._estrada_t <= 0) {
        sq._na_estrada = M.eh_estrada(sq.x, sq.y);
        sq._estrada_t = 0.30;
      }
      const passo = ((sq.nivel_treino ? (sq.tipo === 'heli' ? C.VEL_HELI : (sq._na_estrada ? C.VEL_ESTRADA : C.VEL_NEVE)) * this._mtr(sq, 'vel', true) :
        (sq.tipo === 'heli' ? C.VEL_HELI : (sq._na_estrada ? C.VEL_ESTRADA : C.VEL_NEVE)) * this.mx(sq.time, sq.tipo, 'vel') * this._bonus_base(sq.time)) *
        C.PELOTOES[sq.tipo].vel * dt);
      let parar = false;
      if (this.barricadas.length && sq.tipo !== 'heli' && d > 1e-6) {
        const k = Math.min(1, passo / d);
        const barrada = this._barreira_no_passo(sq, sq.x + dx * k, sq.y + dy * k);
        if (barrada) {
          parar = true;
          if (barrada.estrada || !this._desvio(sq, barrada)) sq.bloqueio = barrada;   // sem volta (ou estrada): para e ataca
          // (achou a volta: o destino mudou, anda no próximo quadro)
        }
      }
      if (parar) {
        // parada na frente da barricada
      } else if (d <= passo) {
        sq.x = sq.destino[0]; sq.y = sq.destino[1];
        sq.destino = sq.caminho.length ? sq.caminho.shift() : null;
        if (sq.destino === null) {
          if (!sq.ia && !sq.reacao) som.tocar('chegou', sq.x, sq.y);
          sq.reacao = false;
        }
      } else if (sq.tipo === 'tanque') {
        // Vira antes de acelerar: elimina o deslizamento lateral
        // enquanto o casco aponta para outra direção.
        Tropas._virar(sq, dx / d, dy / d, dt);
        const alinhamento = Math.max(-1.0, Math.min(1.0, (sq.hx * dx + sq.hy * dy) / d));
        const fator = Math.max(0.0, (alinhamento - 0.18) / 0.82);
        const avanco = Math.min(passo * fator, d);
        sq.x += dx / d * avanco;
        sq.y += dy / d * avanco;
        sq.movendo = avanco > 0.0001 || alinhamento < 0.995;
      } else {
        sq.x += dx / d * passo;
        sq.y += dy / d * passo;
        Tropas._virar(sq, dx / d, dy / d, dt);
        sq.movendo = true;
      }
    }

    if (!sq.movendo && sq.alvo) {
      const dx = sq.alvo.x - sq.x, dy = sq.alvo.y - sq.y;
      const l = hip(dx, dy) || 1.0;
      Tropas._virar(sq, dx / l, dy / l, dt);
    }

    this._organizar(sq);
    if (sq.movendo && !veiculo) {
      som.tocar('passos', sq.x, sq.y, 0.06 + Math.min(1.0, sq.sold.length / 80) * 0.14);
      if (sq.tipo === 'canhao') som.tocar('rodas', sq.x, sq.y, 0.5);
    }

    // cada soldado anda até o seu lugar; os da frente atiram
    // (granadeiros atiram todos: o projétil passa por cima dos colegas)
    const gran = sq.tipo === 'granada';
    const cadencia = gran ? C.CADENCIA_GRANADA : C.CADENCIA;
    let linha_fogo = (sq.alvo && !sq.movendo) ? (gran ? sq.sold.length : sq.cols * 3) : 0;
    if (sq.tipo === 'heli') {
      linha_fogo = 0;
      sq.cool_arma -= dt;
      sq.tempo_desembarque -= dt;
      // Helicóptero atira projétil direto quando há inimigo no alcance.
      if (sq.alvo && sq.cool_arma <= 0 && !this.fim) {
        sq.cool_arma = C.CADENCIA_HELI_GRANADA;
        const alvo = sq.alvo;
        const dist = hip(alvo.x - sq.x, alvo.y - sq.y);
        this.heli_granadas.push({ x0: sq.x, y0: sq.y,
          x1: alvo.x, y1: alvo.y, t: 0.0,
          dur: Math.max(0.12, dist / 18), time: sq.time });
      }
      if (sq.tempo_desembarque <= 0 && !this.fim) {
        sq.tempo_desembarque += C.INTERVALO_DESEMBARQUE;
        const n = this.vivos_tipo(sq.time, 'pelotao') < C.limite_mapa('pelotao') ? this._vaga_desembarque(sq.time, C.QUANTIDADE_DESEMBARQUE) : 0;   // (limite do mapa)
        if (n) {
          const dx = -sq.hx * 2.0, dy = -sq.hy * 2.0;
          const novo = this._criar(sq.time, sq.x + dx, sq.y + dy, n, 'pelotao');
          this._organizar(novo, true);
          this.desembarques.push([sq.x, sq.y, 0.0]);
        }
      }
    }
    if (sq.tipo === 'tanque') {
      linha_fogo = 0;
      sq.cool_arma -= dt;
      if (sq.alvo && !sq.movendo && sq.cool_arma <= 0) {
        sq.cool_arma = C.CADENCIA_TANQUE;
        const alvo = sq.alvo;
        const mira = Math.atan2(alvo.y - sq.y, alvo.x - sq.x);
        this.efeitos_tanque.disparo_tanque(sq.x, sq.y,
          sq.x + Math.cos(mira) * 1.7, sq.y + Math.sin(mira) * 1.7, 0.9, mira);
        this.tanque_tiros.push({ x0: sq.x, y0: sq.y, x1: alvo.x, y1: alvo.y,
          t: 0.0, dur: Math.max(0.16, hip(alvo.x - sq.x, alvo.y - sq.y) / 21),
          alvo, time: sq.time, dano: this._mtr(sq, 'dano', false) });
        sq.recuo = 1.0;
        som.tocar('canhao', sq.x, sq.y);
      }
      sq.recuo = Math.max(0.0, sq.recuo - dt * 3);
    }
    if (sq.tipo === 'foguete') {
      linha_fogo = 0;
      sq.cool_arma -= dt;
      if (sq.alvo && !sq.movendo && sq.cool_arma <= 0) {
        sq.cool_arma = 30.0;
        const a = sq.alvo;
        // Dois foguetes por minuto: projétil real, com trajetória
        // e impacto atrasado. O alvo é a posição vista no disparo.
        const missil = sq.nivel_treino >= 1;   // 2V: míssil incendiário
        const alvos = [a];
        if (missil) {   // o segundo míssil vai SEMPRE num alvo diferente (se houver)
          let outro = null, md = Infinity;
          for (let i = 0; i < this.esquadroes.length; i++) {
            const q = this.esquadroes[i];
            if (q === a || q.time === sq.time || !q.sold.length) continue;
            const d = hip(q.x - sq.x, q.y - sq.y);
            if (d <= sq.alcance() && d < md) { md = d; outro = q; }
          }
          if (outro) alvos.push(outro);
        }
        for (let k = 0; k < alvos.length; k++) {
          const b = alvos[k];
          this.foguetes.push({
            x0: sq.x + k * 0.6, y0: sq.y - k * 0.6, x1: b.x, y1: b.y,
            t: 0.0, dur: Math.max(0.45, hip(b.x - sq.x, b.y - sq.y) / 16.0),
            time: sq.time, missil, dono: sq, dano: this._mtr(sq, 'dano', false),
          });
        }
      }
    }
    if (sq.tipo === 'canhao') {   // quem atira é a peça, não os soldados
      linha_fogo = 0;
      sq.recuo = Math.max(0.0, sq.recuo - dt * 3);
      sq.cool_arma -= dt;
      if (sq.alvo && !sq.movendo && !sq.recarregou && sq.cool_arma <= 0.7) {
        sq.recarregou = true;   // estalos da recarga pouco antes do tiro
        som.tocar('recarga', sq.x, sq.y);
      }
      if (sq.alvo && !sq.movendo && !sq.treinando && sq.cool_arma <= 0) {
        sq.cool_arma = C.CADENCIA_CANHAO * this._mtr(sq, 'cad', false);
        sq.recarregou = false;
        this._disparar_canhao(sq);
      }
    }
    this._mover_soldados(sq, dt, gran, cadencia, linha_fogo);
  }

  _mover_soldados(sq, dt, gran, cadencia, linha_fogo) {
    const passo_max = C.VEL_SOLDADO * dt;
    const dir_sq = dir_de(sq.hx, sq.hy);
    const cad = this._mtr(sq, 'cad', false);
    for (let i = 0; i < sq.sold.length; i++) {
      const s = sq.sold[i];
      const dx = s.tx - s.x, dy = s.ty - s.y;
      const d = hip(dx, dy);
      if (d > 0.03) {
        const k = Math.min(1.0, passo_max / d);
        s.x += dx * k;
        s.y += dy * k;
        s.andando = true;
        s.fase += dt * 13;
        s.dir = d > 0.12 ? dir_de(dx, dy) : dir_sq;
      } else {
        s.andando = false;
        s.dir = dir_sq;
        if (i < linha_fogo) {
          s.cool -= dt;
          if (s.cool <= 0) {
            s.cool = (cadencia[0] + rnd() * (cadencia[1] - cadencia[0])) * cad;
            if (gran) this._lancar(sq, s);
            else this._atirar(sq, s);
          }
        }
      }
      if (s.tiro > 0) s.tiro = Math.max(0.0, s.tiro - dt * 5);
    }
  }

  _passo_projeteis(dt, som) {
    // Tanque: projétil visível, dano forte em construções.
    const em_voo = [];
    for (let _i1 = 0; _i1 < this.tanque_tiros.length; _i1++) {
      const tiro = this.tanque_tiros[_i1];
      tiro.t += dt / tiro.dur;
      // Rastro original de fumaça e pólvora do kit-tanque.
      if (0 < tiro.t && tiro.t < 1) {
        const q = tiro.t;
        this.efeitos_tanque.fumaca(tiro.x0 + (tiro.x1 - tiro.x0) * q,
          tiro.y0 + (tiro.y1 - tiro.y0) * q, 0.6 + 0.8 * q * (1 - q),
          { dur: 0.75, r0: 0.06, r1: 0.35, cor: [196, 200, 208] });
      }
      if (tiro.t >= 1.0) {
        const alvo = tiro.alvo;
        if (alvo.vida > 0) {
          const dano = (alvo.base ? C.DANO_TANQUE_BASE : C.DANO_TANQUE) * tiro.dano;
          this._ferir(alvo, dano, [tiro.x1, tiro.y1], [tiro.x0, tiro.y0], 'tanque');
        }
        if (this.horda && tiro.time === 'verde') this.horda.area(tiro.x1, tiro.y1, ZUMBI.RAIO_TANQUE, ZUMBI.DANO_TANQUE_AREA);
        this.explosoes.push([tiro.x1, tiro.y1, 0.0, rnd() * 6.28, 1.0]);
        this.efeitos_tanque.explosao_tanque(tiro.x1, tiro.y1);
      } else {
        em_voo.push(tiro);
      }
    }
    this.tanque_tiros = em_voo;

    // Projéteis do helicóptero: linha reta, explosão de granada no impacto.
    const pendentes = [];
    for (let _i2 = 0; _i2 < this.heli_granadas.length; _i2++) {
      const g = this.heli_granadas[_i2];
      g.t += dt / g.dur;
      if (g.t >= 1) {
        const x = g.x1, y = g.y1;
        const _l3 = this.esquadroes.slice();
        for (let _i3 = 0; _i3 < _l3.length; _i3++) {
          const alvo = _l3[_i3];
          if (alvo.time !== g.time && alvo.vida > 0 && hip(alvo.x - x, alvo.y - y) <= C.RAIO_HELI_GRANADA) {
            this._ferir(alvo, C.DANO_HELI_GRANADA, [x, y], [g.x0, g.y0], 'granada');
          }
        }
        if (this.horda && g.time === 'verde') this.horda.area(x, y, C.RAIO_HELI_GRANADA, C.DANO_HELI_GRANADA);
        this.explosoes.push([x, y, 0.0, rnd() * 6.28, 0.85]);
        som.tocar('explosao', x, y);
      } else {
        pendentes.push(g);
      }
    }
    this.heli_granadas = pendentes;
    for (let _i22 = 0, _a22 = this.desembarques; _i22 < _a22.length; _i22++) { const d = _a22[_i22]; d[2] += dt; }
    _compactar(this.desembarques, d => d[2] < 1.1);
    // efeitos
    for (let _i23 = 0, _a23 = this.caidos; _i23 < _a23.length; _i23++) { const s = _a23[_i23]; s.caindo += dt / (1.0 / 9.0); }
    _compactar(this.caidos, s => s.caindo < 1);

    let _w4 = 0;   // compactação no lugar: os que continuam voando vão para o começo
    for (let _i4 = 0; _i4 < this.tracos.length; _i4++) {
      const tr = this.tracos[_i4];
      tr.t += dt / tr.dur;
      if (!tr.zuniu && tr.t >= 0.45) {   // bala no ar, no meio do caminho
        tr.zuniu = true;
        som.tocar('bala', (tr.x0 + tr.x1) / 2, (tr.y0 + tr.y1) / 2);
      }
      if (tr.t >= 1) {
        if (tr.so_visual) { this.sopros.push([tr.x1, tr.y1, tr.z1 - 0.15, 0.0]); continue; }   // resto da bala que atravessou
        som.tocar(tr.alvo.base ? 'predio' : 'neve', tr.x1, tr.y1);
        // fuzil agora fere o tanque também, mas a blindagem (defesa) segura a maior parte
        this._ferir(tr.alvo, tr.dano, null, [tr.x0, tr.y0], tr.fura ? 'elite' : 'tiro');
        if (tr.perfura) this._perfurar(tr);
        this.sopros.push([tr.x1, tr.y1, tr.z1 - 0.15, 0.0]);
      } else {
        this.tracos[_w4++] = tr;
      }
    }
    this.tracos.length = _w4;

    // granadas no ar: assobiam na descida e explodem ao tocar o chão
    let _w5 = 0;
    for (let _i5 = 0; _i5 < this.granadas.length; _i5++) {
      const g = this.granadas[_i5];
      g.t += dt / g.dur;
      if (!g.assobiou && g.t >= 0.55) {
        g.assobiou = true;
        som.tocar('assobio', g.x1, g.y1);
      }
      if (g.t >= 1) this._explodir(g);
      else this.granadas[_w5++] = g;
    }
    this.granadas.length = _w5;
    let _w6 = 0;
    for (let _i6 = 0; _i6 < this.obuses.length; _i6++) {
      const o = this.obuses[_i6];
      o.t += dt / o.dur;
      if (!o.zuniu && o.t >= 0.4) {   // sopro do obus passando
        o.zuniu = true;
        const [x_, y_] = o.pos();
        som.tocar('obus', x_, y_);
      }
      this._colisao_obus(o);
      if (o.t >= 1) this._impacto_obus(o);
      else this.obuses[_w6++] = o;
    }
    this.obuses.length = _w6;
    const ainda_voando = [];
    for (let _i7 = 0; _i7 < this.foguetes.length; _i7++) {
      const f = this.foguetes[_i7];
      f.t += dt / f.dur;
      if (f.t >= 1.0) {
        const x = f.x1, y = f.y1;
        const _l8 = this.esquadroes.slice();
        for (let _i8 = 0; _i8 < _l8.length; _i8++) {
          const alvo = _l8[_i8];
          if (alvo.time !== f.time && alvo.vida > 0 && hip(alvo.x - x, alvo.y - y) <= 2.5) {
            if (f.missil) this._ferir(alvo, C.DANO_CANHAO * C.MISSIL_DANO * (f.dano || 1), [x, y], [f.x0, f.y0], 'foguete');
            else this._ferir(alvo, alvo.vida * 0.70, [x, y], [f.x0, f.y0], 'foguete');
          }
        }
        for (let i = 0; i < this.barricadas.length; i++) {   // foguete/míssil também quebra barricada
          const b = this.barricadas[i], p = b.pontas();
          if (b.time !== f.time && b.vida > 0 && _dist_seg(x, y, p[0], p[1], p[2], p[3]) <= 2.5) this._ferir(b, C.DANO_CANHAO_BASE * (f.missil ? C.MISSIL_DANO : 1));
        }
        if (this.horda && f.time === 'verde') this.horda.area(x, y, 2.5, C.DANO_CANHAO * (f.missil ? C.MISSIL_DANO : 1));
        if (f.missil) this._acender(x, y, C.INCENDIO_RAIO * C.MISSIL_RAIO_FOGO, f.time, f.dano || 1, f.dono);
        this.explosoes.push([x, y, 0.0, rnd() * 6.28, 2.0]);
        som.tocar('explosao', x, y);
      } else {
        ainda_voando.push(f);
      }
    }
    this.foguetes = ainda_voando;
    for (let _i24 = 0, _a24 = this.explosoes; _i24 < _a24.length; _i24++) { const e = _a24[_i24]; e[2] += dt / 0.5; }
    _compactar(this.explosoes, e => e[2] < 1);
    for (let _i25 = 0, _a25 = this.fogos; _i25 < _a25.length; _i25++) { const f = _a25[_i25]; f[2] += dt; }
    let apagou = null;   // o primeiro fogo que apagou (sem montar lista)
    for (let i = 0; i < this.fogos.length; i++) { const f = this.fogos[i]; if (f[2] >= f[3]) { apagou = f; break; } }
    if (apagou) som.tocar('chiar', apagou[0], apagou[1]);   // chiado do fogo apagando na neve
    _compactar(this.fogos, f => f[2] < f[3]);
    if (this.fogos.length) {
      const u = this.fogos[this.fogos.length - 1];
      som.tocar('fogo', u[0], u[1]);
    }
    for (let _i26 = 0, _a26 = this.marcas; _i26 < _a26.length; _i26++) { const m = _a26[_i26]; m[2] += dt / 9.0; }
    _compactar(this.marcas, m => m[2] < 1);

    for (let _i27 = 0, _a27 = this.sopros; _i27 < _a27.length; _i27++) { const sp = _a27[_i27]; sp[3] += dt / 0.28; }
    _compactar(this.sopros, sp => sp[3] < 1);
    for (let _i28 = 0, _a28 = this.flutuantes; _i28 < _a28.length; _i28++) { const f = _a28[_i28]; f[3] += dt / 1.6; }
    _compactar(this.flutuantes, f => f[3] < 1);
  }
}
