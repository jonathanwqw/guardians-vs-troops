// zumbis.js — MODO VERSUS ZUMBI: as regras da horda.
//
// Do outro lado não há base inimiga: há uma NAVE CAÍDA (no lugar do QG
// vermelho) de onde saem zumbis em hordas. O seu lado joga igual ao modo
// normal (moedas, parafusos, cartas, bases, torres, barricadas, treino).
// Vitória: destruir a nave. Derrota: perder a sua base principal.
//
// COMO OS ZUMBIS ANDAM
//   * Cada zumbi é uma unidade sozinha (não existe grupo, formação nem canhão).
//   * 90% seguem as estradas: cada um tem uma estrada (centro, esquerda ou
//     direita) e uma faixa fixa dentro dela, e anda SEMPRE em linha reta até um
//     ponto pouco à frente na estrada (a "cenoura"). A cenoura só avança quando
//     o zumbi está perto dela, então ninguém corta o mapa nem fica para trás.
//   * 10% vão pela neve: linha reta da nave até uma das suas bases.
//   * Quem enxerga uma tropa, torre ou base sua por perto larga o caminho e vai
//     reto nela para morder; quando o alvo cai, volta para o caminho.
//   * Um empurra o outro de leve para não ficarem empilhados (separação).
//   * O passo manca: a velocidade sobe e desce junto com a passada.
//
// POR QUE NÃO PESA (muitos zumbis ao mesmo tempo)
//   * Caminho sem busca: seguir a estrada é andar numa lista de pontos já
//     pronta, com um índice guardado por zumbi (custo fixo, sem procurar).
//   * Grade de células de 1x1: "quem está perto?" olha só as células vizinhas.
//     A mesma grade serve para a separação, para a mira das suas tropas e para
//     as explosões.
//   * Pensar em fatias: procurar alvo é o mais caro, então só 1 em cada FATIAS
//     zumbis pensa por passo (cada um pensa a cada ~1/3 s).
//   * Separação em metades: metade dos zumbis se separa num passo, a outra
//     metade no seguinte.
//   * Quem morre só é tirado da lista no começo do passo seguinte, de uma vez
//     (a lista não é remexida no meio das contas).
//
// Este arquivo não desenha nada (o desenho fica em zumbi_visual.js e cena.js)
// e só é usado quando a partida é do modo zumbi: o modo normal não passa aqui.
import * as C from './config.js';
import * as M from './mapa.js';

const rnd = Math.random;

export const Z = {
  VIDA: 9,                  // um fuzileiro tira 2 por tiro
  VEL_ESTRADA: 1.45,        // suas tropas andam a 1,9 na estrada: dá para se reposicionar
  VEL_NEVE: 0.95,
  VAR_VEL: 0.18,            // cada zumbi é até 18% mais rápido ou mais lento
  DANO: 3,                  // por mordida em tropa (um soldado tem 10 de vida)
  DANO_PREDIO: 1.2,         // por mordida em base, torre e barricada
  MORDIDA: 0.85,            // segundos entre mordidas
  VISAO: 5.5,               // enxerga tropa, torre e base até aqui
  DESISTE: 9.0,             // larga a perseguição se o alvo fugir para além disso
  PELA_NEVE: 0.10,          // 10% vão pela neve; o resto, pelas estradas
  ESPACO: 0.46,             // distância mínima entre dois zumbis
  PREMIO: 0.35,             // moedas por zumbi (a fração junta até virar moeda)
  NAVE_VIDA: 9000,          // a base principal tem 6000
  MAX: [700, 1100, 1500],             // zumbis vivos ao mesmo tempo (horda 1, 2, 3)
  ONDA_BASE: [150, 250, 400],         // tamanho da primeira horda
  ONDA_CRESCE: 0.35,                  // cada horda é 35% da primeira maior que a anterior
  ONDA_SEGUNDOS: 20,                  // tempo que a horda leva para sair da nave
  DESCANSO: [32, 18],                 // pausa entre hordas: começa em 32 s e cai até 18 s
  PRIMEIRA: 30,                       // segundos até a primeira horda
  GOTA: 0.6,                          // entre hordas, um zumbi solto a cada 0,6 s
  DANO_GRANADA: 9, DANO_FOGO: 1.5, DANO_TANQUE_AREA: 40, RAIO_TANQUE: 1.4,
};
export const NIVEIS = {
  1: { nome: 'Horda 1', titulo: 'Leve', linha: 'Hordas menores. Até 700 zumbis no campo.' },
  2: { nome: 'Horda 2', titulo: 'Pesada', linha: 'Hordas maiores. Até 1100 zumbis no campo.' },
  3: { nome: 'Horda 3', titulo: 'Infestação', linha: 'O máximo: até 1500 zumbis no campo.' },
};
// ESPECIAIS: poucos por horda, cada um com 2 versões (var 0 e 1)
//   MONSTRO: alto, de membros compridos. Para longe da linha, arranca uma pedra
//     do chão e arremessa: a pedra faz um arco e fere tudo onde cai (dano local).
//     Resolve o problema de a horda só morder: ele castiga quem fica parado e
//     aglomerado atrás da linha, mesmo sem chegar perto.
//   GRANDÃO: zumbi enorme e lento. Morde forte e solta o SUPER GRITO: uma onda
//     em leque que sai da boca, fere e atordoa (os soldados param de atirar por
//     um tempo). Resolve o problema de a linha de tiro segurar a horda para
//     sempre: o grito abre buracos na linha para os zumbis comuns passarem.
export const ESP = {
  monstro: [
    { vida: 70, vel: 1.15, premio: 6, pedra_dano: 12, pedra_predio: 35, pedra_raio: 1.3, alcance: 8.5, recarga: 4.5, distancia: 6.0 },
    { vida: 95, vel: 0.95, premio: 8, pedra_dano: 14, pedra_predio: 45, pedra_raio: 1.6, alcance: 9.5, recarga: 5.5, distancia: 6.5 },
  ],
  grandao: [
    { vida: 150, vel: 0.62, premio: 8, dano: 7, dano_predio: 4, grito_dano: 3, grito_alc: 6.5, grito_abre: 0.66, atordoa: 1.8, recarga: 10 },
    { vida: 200, vel: 0.52, premio: 10, dano: 9, dano_predio: 5, grito_dano: 4, grito_alc: 7.5, grito_abre: 0.55, atordoa: 2.2, recarga: 12 },
  ],
};
// DISCO VOADOR: sai da nave caída a partir da 2ª horda e flutua até as suas
// tropas. Parado em cima de uma tropa, o raio puxa um soldado de cada vez
// (veículo e canhão demoram mais). Fica 1 minuto no mapa e depois vai embora.
// Resolve o problema de tropa parada e entrincheirada longe da horda: o disco
// vai buscar. Suas tropas atiram nele (granada e canhão não pegam no céu).
export const OVNI = { vida: 160, premio: 20, vel: 3.6, vel_puxando: 1.1, altura: 7.0, dura: 60, puxa_soldado: 0.9, puxa_veiculo: 3.5, cadencia: 5 };
const T_PEGAR = 1.0, T_MIRAR = 0.55, T_LANCAR = 0.45, T_INSPIRAR = 0.7, T_GRITAR = 1.1, T_ONDA = 0.9, T_MORRER = 1.3;
const VARIANTES = ['zumbi', 'zumbi_b', 'zumbi_c'];
const FATIAS = 20;            // pensar: cada zumbi a cada 20 passos (1/3 s)
const GL = 256, GOFF = 128;   // grade de 1x1 cobrindo de -128 a +128

function dir_de(hx, hy) {     // a mesma conta do tropas.js (4 vistas)
  if (Math.abs(hx) > Math.abs(hy)) return hx > 0 ? 0 : 2;
  return hy > 0 ? 1 : 3;
}
function dist_seg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1e-9;
  let t = ((px - ax) * vx + (py - ay) * vy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

export class Zumbi {
  // tem o formato de um "alvo" (como um esquadrão de 1) e de um "soldado" (para
  // o desenho): assim as armas e a tela que já existem servem sem mudança
  constructor() {
    this.zumbi = true; this.base = false; this.time = 'vermelho'; this.tipo = 'zumbi';
    this.x = 0; this.y = 0; this.vida = 0; this.vida_max = 0;
    this.sold = [this]; this.cols = 1;
    this.dir = 0; this.fase = 0; this.andando = false; this.tiro = 0; this.caindo = -1;
    this.morto = false; this.pend = 0;          // pend: dano de balas que já estão a caminho
    this.neve = false; this.rota = null; this.s = 0; this.seg = 1; this.lat = 0;
    this.vel = 1; this.alvo = null; this.final = null; this.alcance = 0;
    this.t_morde = 0; this.na_estrada = true; this.n = 0;
    this.esp = null; this.var = 0; this.st = null; this.estado = 'livre'; this.t_est = 0; this.recarga = 0;
    this.pedra_mao = false; this.morte = 0;
    this._px = 0; this._py = 0; this._pid = -1; this._rx = 0; this._ry = 0;   // passo.js (movimento liso)
  }
  raio() { return this.esp === 'grandao' ? 0.55 : this.esp === 'monstro' ? 0.45 : 0.3; }
}

export class Horda {
  constructor(T, nivel) {
    this.T = T;
    this.nivel = [1, 2, 3].includes(nivel) ? nivel : 1;
    this.max = Z.MAX[this.nivel - 1];
    this.vivos = [];
    this.cabeca = new Int32Array(GL * GL).fill(-1);
    this.prox = new Int32Array(this.max + 8);
    this.onda = 0; this.fila = 0; this._ritmo = 0; this._acc = 0; this._gota = 0;
    this.abatidos = 0; this._moedas = 0; this._t_moeda = 0; this._pos_moeda = null;
    this._passo = 0; this._n = 0; this._ha_mortos = false;
    this.rotas = [M.ROTAS.centro, M.ROTAS.esquerda, M.ROTAS.direita];
    this.pedras = [];       // pedras no ar (arremessadas pelos monstros)
    this.ondas = [];        // ondas do super grito
    this.impactos = [];     // poeira das pedras que caíram (só desenho)
    this.morrendo = [];     // especiais caindo (a queda deles é mais lenta)
    this.levados = [];      // soldados subindo no raio do disco voador (só desenho)
    this.partindo = [];     // discos indo embora depois de 1 minuto (só desenho)
    this._fila_ovni = 0; this._t_ovni = 0;
    this._esp = [];         // especiais que ainda vão sair nesta horda
    this.nave = T.bases.vermelho;
    T.espera = Z.PRIMEIRA;
    T.fase = 'descanso';
  }

  // ---------- nascer ---------------------------------------------------
  _nascer(esp = null) {
    const T = this.T, nave = this.nave;
    const z = new Zumbi();
    // sai pelo rasgo do casco (o lado que dá para as suas bases)
    z.x = nave.x + (rnd() - 0.5) * 4.6; z.y = nave.y + 4.4 + rnd() * 1.6;
    z.vida = z.vida_max = Z.VIDA;
    z.tipo = VARIANTES[(rnd() * VARIANTES.length) | 0];
    z.morto = false; z.pend = 0; z.caindo = -1; z.tiro = 0; z.andando = true;
    z.fase = rnd() * 6.28; z.dir = 1; z.alvo = null; z.t_morde = rnd() * Z.MORDIDA;
    z.vel = 1 + (rnd() * 2 - 1) * Z.VAR_VEL;
    z.neve = rnd() < Z.PELA_NEVE;
    if (esp) {   // especial: sempre pela estrada, com a ficha da sua versão
      z.esp = esp; z.var = rnd() < 0.5 ? 0 : 1; z.st = ESP[esp][z.var];
      z.tipo = esp; z.vida = z.vida_max = z.st.vida; z.vel = z.st.vel * (0.95 + rnd() * 0.1);
      z.neve = false; z.recarga = 2 + rnd() * 2;
    }
    z.na_estrada = !z.neve;
    z.n = this._n++;
    z._pid = -1;
    if (z.neve) {
      z.rota = null; z.final = this._base_para_neve();
    } else {
      const k = rnd();
      z.rota = this.rotas[k < 0.4 ? 0 : k < 0.7 ? 1 : 2];
      // a cenoura começa no ponto da estrada mais perto (à frente da nave), não no meio dela
      z.s = Math.min(z.rota.comprimento, z.rota.s_perto(z.x, z.y) + 1.0); z.seg = 1;
      z.lat = (rnd() * 2 - 1) * 0.8; z.final = T.bases.verde;
    }
    this.vivos.push(z);
  }

  _base_para_neve() {
    // quem vai pela neve escolhe uma base sua: as extras têm mais chance (flanco)
    const T = this.T, extras = [];
    for (let i = 0; i < T.extras.length; i++) { const b = T.extras[i]; if (b.time === 'verde' && b.vida > 0) extras.push(b); }
    if (extras.length && rnd() < 0.7) return extras[(rnd() * extras.length) | 0];
    return T.bases.verde;
  }

  // ---------- o passo --------------------------------------------------
  passo(dt) {
    const T = this.T;
    if (this._ha_mortos) this._compactar();
    this._hordas(dt);
    this._soltar_ovnis(dt);
    const v = this.vivos, n = v.length, fatia = this._passo % FATIAS;
    for (let i = 0; i < n; i++) {
      const z = v[i];
      if (z.voa) { if (!z.morto) this._ovni(z, dt); continue; }
      if ((z.n % FATIAS) === fatia) this._pensar(z);
      this._andar(z, dt);
    }
    this._montar_grade();
    this._separar(this._passo & 1);
    this._passo_pedras(dt);
    this._passo_ondas(dt);
    for (let i = this.impactos.length - 1; i >= 0; i--) { const p = this.impactos[i]; p[2] += dt; if (p[2] > 1.4) this.impactos.splice(i, 1); }
    for (let i = this.morrendo.length - 1; i >= 0; i--) {
      const m = this.morrendo[i]; m.morte += dt / T_MORRER;
      if (m.morte >= 1) {
        this.morrendo.splice(i, 1);
        if (m.voa) { this.T.explosoes.push([m.x, m.y, 0.0, rnd() * 6.28, 1.4]); this.T.som.tocar('explosao', m.x, m.y); }   // o disco bate no chão
      }
    }
    for (let i = this.levados.length - 1; i >= 0; i--) { const l = this.levados[i]; l.t += dt; if (l.t > 1.3) this.levados.splice(i, 1); }
    for (let i = this.partindo.length - 1; i >= 0; i--) { const p = this.partindo[i]; p.t += dt; p.fase += dt; if (p.t > 2.5) this.partindo.splice(i, 1); }
    this._premiar(dt);
    this._passo++;
  }

  _compactar() {
    const v = this.vivos;
    let w = 0;
    for (let i = 0; i < v.length; i++) { const z = v[i]; if (!z.morto) v[w++] = z; }
    v.length = w;
    this._ha_mortos = false;
  }

  _hordas(dt) {
    const T = this.T;
    if (T.fim || this.nave.vida <= 0) return;
    if (this.fila > 0) {
      this._acc += this._ritmo * dt;
      while (this._acc >= 1 && this.fila > 0) {
        this._acc -= 1;
        if (this.vivos.length >= this.max) { this._acc = 0; break; }   // campo cheio: espera abrir espaço
        if (this._esp.length && rnd() * this.fila < this._esp.length) this._nascer(this._esp.pop());   // especiais espalhados pela horda
        else this._nascer();
        this.fila--;
      }
      if (this.fila <= 0) T.espera = Math.max(Z.DESCANSO[1], Z.DESCANSO[0] - this.onda);
      return;
    }
    T.espera -= dt;
    if (this.onda >= 1) {   // entre hordas, sempre tem algum zumbi solto chegando
      this._gota -= dt;
      if (this._gota <= 0) { this._gota = Z.GOTA; if (this.vivos.length < this.max) this._nascer(); }
    }
    if (T.espera <= 0) {
      this.onda++; T.onda = this.onda;
      this.fila = Math.round(Z.ONDA_BASE[this.nivel - 1] * (1 + Z.ONDA_CRESCE * (this.onda - 1)));
      this._ritmo = this.fila / Z.ONDA_SEGUNDOS; this._acc = 0;
      // especiais desta horda: monstros desde a 1ª, grandões a partir da 2ª
      const n_mon = Math.min(1 + this.nivel, Math.ceil(this.onda / 2));
      const n_gra = this.onda >= 2 ? Math.min(this.nivel, Math.max(1, Math.floor(this.onda / 2))) : 0;
      this._fila_ovni += this.onda >= 2 ? Math.min(this.nivel, Math.ceil((this.onda - 1) / 2)) : 0;
      this._esp = [];
      for (let i = 0; i < n_mon; i++) this._esp.push('monstro');
      for (let i = 0; i < n_gra; i++) this._esp.push('grandao');
      for (let i = this._esp.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const q = this._esp[i]; this._esp[i] = this._esp[j]; this._esp[j] = q; }
      T.aviso_onda = 5.0;
      T.som.tocar('alarme');
    }
  }

  _soltar_ovnis(dt) {
    // os discos saem da nave um de cada vez
    if (this._fila_ovni <= 0 || this.T.fim || this.nave.vida <= 0) return;
    this._t_ovni -= dt;
    if (this._t_ovni > 0) return;
    this._t_ovni = OVNI.cadencia;
    this._fila_ovni--;
    const z = new Zumbi(), nave = this.nave;
    z.esp = 'ovni'; z.tipo = 'ovni'; z.st = OVNI; z.vida = z.vida_max = OVNI.vida;
    z.x = nave.x + (rnd() - 0.5) * 2; z.y = nave.y + 1.5; z.voa = 0.6;
    z.estado = 'subindo'; z.t_est = 0; z.n = this._n++; z.fase = rnd() * 6.28; z._pid = -1;
    z.vida_t = 0; z.presa = null; z.puxa = 0; z.luz = 0;
    this.vivos.push(z);
    this.T.som.tocar('chiar', z.x, z.y);
  }

  _ovni(z, dt) {
    const T = this.T;
    z.vida_t += dt; z.fase += dt;
    if (z.vida_t >= OVNI.dura || T.fim) {   // 1 minuto no mapa: vai embora (sem prêmio)
      z.morto = true; this._ha_mortos = true; z.alvo = null;
      this.partindo.push({ x: z.x, y: z.y, voa: z.voa, t: 0, fase: z.fase, luz: z.luz });
      return;
    }
    if (z.estado === 'subindo') {           // sai da nave e sobe até a altura de voo
      z.voa = Math.min(OVNI.altura, z.voa + dt * 1.4); z.y += dt * 0.8;
      z.luz = Math.max(0, z.luz - dt * 3);
      if (z.voa >= OVNI.altura) { z.estado = 'cacando'; z.t_est = 0; }
      return;
    }
    // escolhe a tropa sua mais perto (de novo a cada meio segundo)
    z.t_est -= dt;
    let q = z.presa;
    if (!q || !q.sold.length || q.vida <= 0 || z.t_est <= 0) {
      z.t_est = 0.5;
      let md = Infinity, melhor = null;
      for (const o of T.esquadroes) {
        if (o.time !== 'verde' || !o.sold.length || o.tipo === 'heli' || o.vida <= 0) continue;
        const d = (o.x - z.x) * (o.x - z.x) + (o.y - z.y) * (o.y - z.y);
        if (d < md) { md = d; melhor = o; }
      }
      if (melhor !== q) { z.presa = q = melhor; z.puxa = 0; }
    }
    if (!q) { z.estado = 'cacando'; z.luz = Math.max(0, z.luz - dt * 3); return; }
    const dx = q.x - z.x, dy = q.y - z.y, d = Math.hypot(dx, dy);
    const em_cima = d < 0.45;
    const vel = em_cima ? OVNI.vel_puxando : OVNI.vel;
    if (d > 1e-4) { const p = Math.min(d, vel * dt); z.x += dx / d * p; z.y += dy / d * p; }
    z.dir = d > 1e-4 ? dir_de(dx, dy) : z.dir;
    if (!em_cima) { z.estado = 'cacando'; z.luz = Math.max(0, z.luz - dt * 3); z.puxa = 0; return; }
    z.estado = 'puxando'; z.luz = Math.min(1, z.luz + dt * 4);
    const veiculo = q.tipo === 'tanque' || q.tipo === 'canhao';
    z.puxa += dt;
    if (z.puxa < (veiculo ? OVNI.puxa_veiculo : OVNI.puxa_soldado) || z.luz < 1) return;
    z.puxa = 0;
    this._abduzir(z, q, veiculo);
  }

  _abduzir(z, q, veiculo) {
    // o soldado mais perto do centro do raio sobe para dentro do disco
    const T = this.T;
    let i = 0, md = Infinity;
    for (let k = 0; k < q.sold.length; k++) { const s = q.sold[k], d = (s.x - z.x) ** 2 + (s.y - z.y) ** 2; if (d < md) { md = d; i = k; } }
    const hp = T.hp('verde', q.tipo);
    q.vida = Math.max(0, q.vida - hp);
    q.levou_dano = T.t_jogo;
    const n0 = T.caidos.length;
    T._derrubar(q, i);
    if (T.caidos.length > n0) {
      const s = T.caidos.pop();
      s.caindo = -1;
      this.levados.push({ s, tipo: q.tipo, veiculo, x: s.x, y: s.y, t: 0, ate: z.voa, ovni: z });
    }
    T._ferir(q, 1e-9, [z.x, z.y]);   // acerta o resto da tropa com a vida nova (e o alarme de ataque)
    T.som.tocar('chiar', z.x, z.y);
  }

  status() {
    const T = this.T;
    if (this.fila > 0) return [`Horda ${this.onda} saindo da nave`, true];
    return [`Próxima horda em ${Math.ceil(Math.max(0, T.espera))}s`, false];
  }

  // ---------- pensar: achar o que morder (em fatias) ---------------------
  _pensar(z) {
    const T = this.T, x = z.x, y = z.y;
    z.na_estrada = M.dist_estrada(x, y) <= 0.25;
    const a = z.alvo;
    if (a) {   // já tem alvo: confere se ainda vale
      const d = Math.hypot(a.x - x, a.y - y);
      if (a.vida <= 0 || (!a.base && !a.sold.length) || d > Z.DESISTE + z.alcance) this._soltar(z);
      else if (a.barreira || a.base) { /* construção não foge: mantém */ return; }
    }
    const visao = z.esp === 'monstro' ? z.st.alcance + 1.5 : Z.VISAO;
    let melhor = null, md = visao, alcance = 0;
    // 1. suas tropas (pela grade de esquadrões que o jogo já monta a cada passo)
    const esq = T.esquadroes, g = T._grade, usa = g && g.valida(T._esq_ver);
    const k = usa ? g.perto(x, y, visao) : esq.length, buf = usa ? g._buf : null;
    for (let i = 0; i < k; i++) {
      const o = esq[usa ? buf[i] : i];
      if (o.time !== 'verde' || !o.sold.length || o.tipo === 'heli') continue;   // helicóptero está no céu
      const r = o.raio() * 0.85, d = Math.hypot(o.x - x, o.y - y) - r;
      if (d < md) { md = d; melhor = o; alcance = Math.max(0.45, r); }
    }
    // 2. torres e bases suas
    const torres = T.torres;
    for (let i = 0; i < torres.length; i++) {
      const o = torres[i];
      if (o.time !== 'verde' || o.vida <= 0) continue;
      const d = Math.hypot(o.x - x, o.y - y) - 1.0;
      if (d < md) { md = d; melhor = o; alcance = 1.0; }
    }
    const pb = T.bases.verde;
    if (pb.vida > 0) { const d = Math.hypot(pb.x - x, pb.y - y) - 2.8; if (d < md) { md = d; melhor = pb; alcance = 2.8; } }
    for (let i = 0; i < T.extras.length; i++) {
      const o = T.extras[i];
      if (o.time !== 'verde' || o.vida <= 0) continue;
      const d = Math.hypot(o.x - x, o.y - y) - 2.2;
      if (d < md) { md = d; melhor = o; alcance = 2.2; }
    }
    // 3. barricada sua no caminho: só quando encosta nela
    const barrs = T.barricadas;
    for (let i = 0; i < barrs.length; i++) {
      const b = barrs[i];
      if (b.time !== 'verde' || b.vida <= 0 || Math.abs(b.x - x) + Math.abs(b.y - y) > 4.5) continue;
      const p = b.pontas(), d = dist_seg(x, y, p[0], p[1], p[2], p[3]) - C.BARRICADA_RAIO;
      if (d < 0.45 && d < md) { md = d; melhor = b; alcance = -1; }
    }
    if (melhor && melhor !== z.alvo) { z.alvo = melhor; z.alcance = alcance; }
    // quem vai pela neve e perdeu a base que queria escolhe outra
    if (z.neve && (!z.final || z.final.vida <= 0)) z.final = this._base_para_neve();
  }

  _soltar(z) {
    // larga o alvo e volta para o caminho (a estrada, no ponto mais perto à frente)
    z.alvo = null;
    if (!z.neve && z.rota && z.s < z.rota.comprimento) {
      const s = z.rota.s_perto(z.x, z.y);
      if (s > z.s) { z.s = s; z.seg = 1; }
    }
  }

  // ---------- andar e morder (todo passo, para todos) ---------------------
  _andar(z, dt) {
    if (z.tiro > 0) z.tiro = Math.max(0, z.tiro - dt * 3.2);
    if (z.esp && this._especial(z, dt)) return;   // ocupado: arremessando ou gritando
    const T = this.T;
    let tx, ty, parar = -1;
    const a = z.alvo;
    if (a) {
      if (a.vida <= 0 || (!a.base && !a.sold.length)) { this._soltar(z); }
      else if (z.alcance < 0) {   // barricada: morde encostado nela
        z.andando = false;
        this._morder(z, a, dt);
        return;
      } else {
        tx = a.x; ty = a.y; parar = z.alcance + 0.5;
        if (z.esp === 'monstro') parar = Math.max(parar, z.st.distancia);   // o monstro fica longe e arremessa
      }
    }
    if (parar < 0) {
      const rota = z.rota;
      if (rota && z.s < rota.comprimento) {
        // a cenoura: ponto da estrada em s, deslocado para a faixa deste zumbi
        const acum = rota.acum, pts = rota.pts;
        let i = z.seg;
        while (i < acum.length - 1 && acum[i] < z.s) i++;
        z.seg = i;
        const p = pts[i - 1], q = pts[i], seg = (acum[i] - acum[i - 1]) || 1;
        const t = (z.s - acum[i - 1]) / seg, dx = (q[0] - p[0]) / seg, dy = (q[1] - p[1]) / seg;
        tx = p[0] + (q[0] - p[0]) * t - dy * z.lat;
        ty = p[1] + (q[1] - p[1]) * t + dx * z.lat;
        const d2 = (tx - z.x) * (tx - z.x) + (ty - z.y) * (ty - z.y);
        if (d2 < 4.8) z.s += Z.VEL_ESTRADA * z.vel * dt * 1.15;   // só avança com o zumbi por perto (folga para a multidão não travar)
      } else {
        const f = z.final;
        if (!f || f.vida <= 0) { z.andando = false; return; }
        tx = f.x; ty = f.y; parar = (f.principal ? 2.8 : 2.2) + 0.5;
        if (!z.alvo && Math.hypot(tx - z.x, ty - z.y) <= parar) { z.alvo = f; z.alcance = parar - 0.5; }
      }
    }
    const dx = tx - z.x, dy = ty - z.y, d = Math.sqrt(dx * dx + dy * dy);
    if (parar >= 0 && d <= parar) {   // chegou no alvo: para e morde
      z.andando = false;
      if (d > 1e-4) z.dir = dir_de(dx, dy);
      if (z.alvo && z.esp !== 'monstro') this._morder(z, z.alvo, dt);
      return;
    }
    if (d < 1e-4) return;
    z.fase += dt * 9 * z.vel;
    // passo manco: acelera e freia junto com a passada (a média continua a mesma)
    const manca = 0.72 + 0.56 * Math.max(0, Math.sin(z.fase));
    const passo = Math.min(d, (z.na_estrada ? Z.VEL_ESTRADA : Z.VEL_NEVE) * z.vel * (z.esp ? 1 : manca) * dt);
    z.x += dx / d * passo; z.y += dy / d * passo;
    z.andando = true;
    z.dir = dir_de(dx, dy);
  }

  _morder(z, a, dt) {
    z.t_morde -= dt;
    if (z.t_morde > 0) return;
    z.t_morde = Z.MORDIDA * (0.85 + rnd() * 0.3);
    z.tiro = 1.0;
    const T = this.T;
    if (T.fim) return;
    const forte = z.esp === 'grandao';
    T._ferir(a, a.base || a.torre || a.barreira ? (forte ? z.st.dano_predio : Z.DANO_PREDIO) : (forte ? z.st.dano : Z.DANO), [z.x, z.y], null, 'tiro');
  }

  // ---------- grade de células e separação -------------------------------
  _montar_grade() {
    const v = this.vivos, cab = this.cabeca, prox = this.prox;
    cab.fill(-1);
    for (let i = 0; i < v.length; i++) {
      const z = v[i];
      let ci = (z.x + GOFF) | 0, cj = (z.y + GOFF) | 0;
      if (ci < 0) ci = 0; else if (ci >= GL) ci = GL - 1;
      if (cj < 0) cj = 0; else if (cj >= GL) cj = GL - 1;
      const c = cj * GL + ci;
      prox[i] = cab[c]; cab[c] = i;
    }
  }

  _separar(par) {
    const v = this.vivos, cab = this.cabeca, prox = this.prox;
    for (let i = par; i < v.length; i += 2) {
      const z = v[i], rz = z.esp ? 0.5 : Z.ESPACO / 2;   // especiais (bem maiores) abrem mais espaço
      if (z.voa) continue;   // o disco voa por cima
      const ci = (z.x + GOFF) | 0, cj = (z.y + GOFF) | 0;
      if (ci < 1 || cj < 1 || ci >= GL - 1 || cj >= GL - 1) continue;
      let px = 0, py = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const linha = (cj + dj) * GL + ci;
        for (let di = -1; di <= 1; di++) {
          for (let q = cab[linha + di]; q !== -1; q = prox[q]) {
            if (q === i || v[q].voa) continue;
            const o = v[q], dx = z.x - o.x, dy = z.y - o.y, d2 = dx * dx + dy * dy, R = rz + (o.esp ? 0.5 : Z.ESPACO / 2);
            if (d2 >= R * R) continue;
            if (d2 < 1e-6) { px += (z.n & 1) ? 0.05 : -0.05; py += (z.n & 2) ? 0.05 : -0.05; continue; }   // exatamente um em cima do outro
            const d = Math.sqrt(d2), f = (R - d) / d * 0.5;
            px += dx * f; py += dy * f;
          }
        }
      }
      if (px !== 0 || py !== 0) {
        const m = Math.hypot(px, py), k = m > 0.12 ? 0.12 / m : 1;   // empurrão curto: não atravessa ninguém
        z.x += px * k; z.y += py * k;
      }
    }
  }

  // ---------- especiais: arremesso e super grito ------------------------
  _especial(z, dt) {
    // devolve true quando está no meio de uma ação (não anda neste passo)
    z.recarga -= dt;
    const a = z.alvo, st = z.st;
    const vivo = a && a.vida > 0 && (a.base || a.sold.length);
    if (z.estado !== 'livre') {
      z.t_est += dt; z.andando = false;
      if (vivo) z.dir = dir_de(a.x - z.x, a.y - z.y);
      if (z.esp === 'monstro') {
        if (z.estado === 'pegar') {
          if (z.t_est >= T_PEGAR * 0.6) z.pedra_mao = true;   // a mão sai do chão com a pedra
          if (z.t_est >= T_PEGAR) { z.estado = 'mirar'; z.t_est = 0; }
        } else if (z.estado === 'mirar') {
          if (z.t_est >= T_MIRAR) {
            z.estado = 'lancar'; z.t_est = 0; z.pedra_mao = false;
            this._arremessar(z, vivo ? a : null);
          }
        } else if (z.t_est >= T_LANCAR) { z.estado = 'livre'; z.recarga = st.recarga * (0.85 + rnd() * 0.3); }
      } else {
        if (z.estado === 'inspirar') {
          if (z.t_est >= T_INSPIRAR) { z.estado = 'gritar'; z.t_est = 0; this._gritar(z, vivo ? a : null); }
        } else if (z.t_est >= T_GRITAR) { z.estado = 'livre'; z.recarga = st.recarga * (0.85 + rnd() * 0.3); }
      }
      return true;
    }
    if (!vivo || z.recarga > 0) return false;
    const d = Math.hypot(a.x - z.x, a.y - z.y) - Math.max(0, z.alcance);
    if (z.esp === 'monstro' && d <= st.alcance) { z.estado = 'pegar'; z.t_est = 0; return true; }
    if (z.esp === 'grandao' && d <= st.grito_alc * 0.8 && !a.base) { z.estado = 'inspirar'; z.t_est = 0; return true; }
    return false;
  }

  _arremessar(z, a) {
    // a pedra sai da mão e faz um arco até onde o alvo está (com um pouco de erro)
    const tx = a ? a.x : z.x + (z.dir === 0 ? 4 : z.dir === 2 ? -4 : 0), ty = a ? a.y : z.y + (z.dir === 1 ? 4 : z.dir === 3 ? -4 : 0);
    const d = Math.hypot(tx - z.x, ty - z.y), erro = 0.25 + d * 0.06, an = rnd() * 6.28;
    const x1 = tx + Math.cos(an) * erro * rnd(), y1 = ty + Math.sin(an) * erro * rnd();
    this.pedras.push({ x0: z.x, y0: z.y, x1, y1, x: z.x, y: z.y, h: 3.6, t: 0, dur: 0.5 + d / 8, pico: 2.4 + d * 0.25,
      raio: z.st.pedra_raio, dano: z.st.pedra_dano, predio: z.st.pedra_predio, giro: rnd() * 6.28, tam: 0.8 + z.var * 0.3 });
    this.T.som.tocar('assobio', z.x, z.y);
  }

  _passo_pedras(dt) {
    for (let i = this.pedras.length - 1; i >= 0; i--) {
      const p = this.pedras[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.x = p.x0 + (p.x1 - p.x0) * k; p.y = p.y0 + (p.y1 - p.y0) * k;
      p.h = 3.6 * (1 - k) + p.pico * 4 * k * (1 - k);   // sai da mão do monstro (alto) e cai no chão
      p.giro += dt * 9;
      if (k >= 1) { this.pedras.splice(i, 1); this._impacto(p); }
    }
  }

  _impacto(p) {
    // dano local onde a pedra cai: soldados dentro do raio, torres, barricadas e bases
    const T = this.T, x = p.x1, y = p.y1, R = p.raio;
    this.impactos.push([x, y, 0, p.tam]);
    T.som.tocar('explosao', x, y);
    if (T.fim) return;
    const esq = T.esquadroes, g = T._grade, usa = g && g.valida(T._esq_ver);
    const k = usa ? g.perto(x, y, R + 3) : esq.length, buf = usa ? g._buf : null;
    for (let i = 0; i < k; i++) {
      const o = esq[usa ? buf[i] : i];
      if (o.time !== 'verde' || !o.sold.length || o.tipo === 'heli') continue;
      if (o.tipo === 'tanque') { if (Math.hypot(o.x - x, o.y - y) <= R + 0.8) T._ferir(o, p.predio, [x, y], null, 'granada'); continue; }
      let n = 0;
      for (const s of o.sold) if ((s.x - x) * (s.x - x) + (s.y - y) * (s.y - y) <= R * R) n++;
      if (n) T._ferir(o, n * p.dano, [x, y], null, 'granada');
    }
    this._ferir_construcoes(x, y, R, p.predio, null);
  }

  _ferir_construcoes(x, y, R, dano, leque) {
    // torres, barricadas e bases suas dentro do raio (leque: só as que estão na frente do grito)
    const T = this.T, dentro = (ox, oy, r) => {
      const dx = ox - x, dy = oy - y, d = Math.hypot(dx, dy);
      if (d > R + r) return false;
      return !leque || d < r + 0.5 || (dx * leque[0] + dy * leque[1]) / d >= leque[2];
    };
    for (const o of T.torres) if (o.time === 'verde' && o.vida > 0 && dentro(o.x, o.y, 0.9)) T._ferir(o, dano, [x, y], null, 'granada');
    for (const o of T.barricadas) if (o.time === 'verde' && o.vida > 0 && dentro(o.x, o.y, 1.2)) T._ferir(o, dano, [x, y], null, 'granada');
    if (leque) return;   // o grito não derruba prédio
    const pb = T.bases.verde;
    if (pb.vida > 0 && dentro(pb.x, pb.y, 2.8)) T._ferir(pb, dano, [x, y], null, 'granada');
    for (const o of T.extras) if (o.time === 'verde' && o.vida > 0 && dentro(o.x, o.y, 2.2)) T._ferir(o, dano, [x, y], null, 'granada');
  }

  _gritar(z, a) {
    // a onda sai da boca, em leque, na direção do alvo
    let ux = a ? a.x - z.x : 1, uy = a ? a.y - z.y : 1;
    const m = Math.hypot(ux, uy) || 1; ux /= m; uy /= m;
    this.ondas.push({ x: z.x + ux * 0.5, y: z.y + uy * 0.5, ux, uy, t: 0, r: 0, alc: z.st.grito_alc, cos: Math.cos(z.st.grito_abre),
      abre: z.st.grito_abre, dano: z.st.grito_dano, atordoa: z.st.atordoa, ja: new Set() });
    this.T.som.tocar('chiar', z.x, z.y);
  }

  _passo_ondas(dt) {
    const T = this.T;
    for (let i = this.ondas.length - 1; i >= 0; i--) {
      const o = this.ondas[i];
      o.t += dt;
      if (o.t > T_ONDA + 0.4) { this.ondas.splice(i, 1); continue; }
      if (o.t > T_ONDA || T.fim) continue;
      o.r = o.alc * o.t / T_ONDA;
      // a frente da onda pega cada tropa uma vez: fere quem está no leque e trava os tiros
      const esq = T.esquadroes, g = T._grade, usa = g && g.valida(T._esq_ver);
      const k = usa ? g.perto(o.x, o.y, o.r + 1) : esq.length, buf = usa ? g._buf : null;
      for (let j = 0; j < k; j++) {
        const q = esq[usa ? buf[j] : j];
        if (q.time !== 'verde' || !q.sold.length || q.tipo === 'heli' || o.ja.has(q)) continue;
        let n = 0, alcancou = false;
        for (const s of q.sold) {
          const dx = s.x - o.x, dy = s.y - o.y, d = Math.hypot(dx, dy);
          if (d > o.r || (d > 0.4 && (dx * o.ux + dy * o.uy) / d < o.cos)) continue;
          alcancou = true; n++;
          s.cool = Math.max(s.cool, o.atordoa);   // atordoado: sem atirar por um tempo
        }
        if (!alcancou) continue;
        o.ja.add(q);
        if (q.tipo !== 'tanque') T._ferir(q, n * o.dano, [o.x, o.y], null, 'tiro');
        else q.cool_arma = Math.max(q.cool_arma || 0, o.atordoa);
      }
      if (!o.ja.has('predios') && o.t > T_ONDA * 0.5) { o.ja.add('predios'); this._ferir_construcoes(o.x, o.y, o.alc, 15, [o.ux, o.uy, o.cos]); }
    }
  }

  // ---------- o que as suas armas perguntam ------------------------------
  mais_perto(x, y, alcance) {
    // o zumbi vivo mais perto de (x, y) dentro do alcance (ou null)
    const v = this.vivos, cab = this.cabeca, prox = this.prox;
    const i0 = Math.max(0, (x - alcance + GOFF) | 0), i1 = Math.min(GL - 1, (x + alcance + GOFF) | 0);
    const j0 = Math.max(0, (y - alcance + GOFF) | 0), j1 = Math.min(GL - 1, (y + alcance + GOFF) | 0);
    let melhor = null, md = alcance * alcance;
    for (let j = j0; j <= j1; j++) {
      const linha = j * GL;
      for (let i = i0; i <= i1; i++) {
        for (let q = cab[linha + i]; q !== -1; q = prox[q]) {
          const z = v[q];
          if (z === undefined || z.morto) continue;
          const d2 = (z.x - x) * (z.x - x) + (z.y - y) * (z.y - y);
          if (d2 <= md) { md = d2; melhor = z; }
        }
      }
    }
    return melhor;
  }

  espalhar(z0, dano) {
    // quem atira não desperdiça bala: escolhe, perto do alvo principal, um zumbi
    // que as balas já a caminho ainda não vão derrubar
    if (z0.voa) { z0.pend += dano; return z0; }   // mirou no disco: a bala vai nele
    const v = this.vivos, cab = this.cabeca, prox = this.prox;
    const ci = (z0.x + GOFF) | 0, cj = (z0.y + GOFF) | 0;
    let escolhido = null, vistos = 0;
    for (let dj = -2; dj <= 2; dj++) {
      const j = cj + dj; if (j < 0 || j >= GL) continue;
      for (let di = -2; di <= 2; di++) {
        const i = ci + di; if (i < 0 || i >= GL) continue;
        for (let q = cab[j * GL + i]; q !== -1; q = prox[q]) {
          const z = v[q];
          if (z === undefined || z.morto || z.voa || z.pend >= z.vida) continue;
          vistos++;
          if (rnd() * vistos < 1) escolhido = z;   // sorteio justo sem montar lista
        }
      }
    }
    const z = escolhido || z0;
    z.pend += dano;
    return z;
  }

  area(x, y, raio, dano, ja = null) {
    // explosão, fogo, bala de canhão: fere todo zumbi dentro do raio
    const v = this.vivos, cab = this.cabeca, prox = this.prox, R2 = raio * raio;
    const i0 = Math.max(0, (x - raio + GOFF) | 0), i1 = Math.min(GL - 1, (x + raio + GOFF) | 0);
    const j0 = Math.max(0, (y - raio + GOFF) | 0), j1 = Math.min(GL - 1, (y + raio + GOFF) | 0);
    let n = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        for (let q = cab[j * GL + i]; q !== -1; q = prox[q]) {
          const z = v[q];
          if (z === undefined || z.morto || z.voa || (ja && ja.has(z))) continue;
          if ((z.x - x) * (z.x - x) + (z.y - y) * (z.y - y) > R2) continue;
          if (ja) ja.add(z);
          this.ferir(z, dano);
          n++;
        }
      }
    }
    return n;
  }

  perfurar(tr, maximo) {
    // a bala do atirador de elite segue reto depois do alvo e acerta mais zumbis na linha
    const dx = tr.x1 - tr.x0, dy = tr.y1 - tr.y0, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const fx = tr.x1 + ux * tr.sobra, fy = tr.y1 + uy * tr.sobra;
    const v = this.vivos, cab = this.cabeca, prox = this.prox;
    const i0 = Math.max(0, (Math.min(tr.x1, fx) - 1 + GOFF) | 0), i1 = Math.min(GL - 1, (Math.max(tr.x1, fx) + 1 + GOFF) | 0);
    const j0 = Math.max(0, (Math.min(tr.y1, fy) - 1 + GOFF) | 0), j1 = Math.min(GL - 1, (Math.max(tr.y1, fy) + 1 + GOFF) | 0);
    const achados = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      for (let q = cab[j * GL + i]; q !== -1; q = prox[q]) {
        const z = v[q];
        if (z === undefined || z.morto || z.voa || z === tr.alvo) continue;
        const px = z.x - tr.x1, py = z.y - tr.y1, ao_longo = px * ux + py * uy;
        if (ao_longo <= 0 || ao_longo > tr.sobra || Math.abs(px * uy - py * ux) > 0.45) continue;
        achados.push([ao_longo, z]);
      }
    }
    achados.sort((p, q) => p[0] - q[0]);
    for (let k = 0; k < achados.length && k < maximo; k++) this.ferir(achados[k][1], tr.dano);
    return achados.length ? achados[Math.min(achados.length, maximo) - 1][0] + 0.5 : tr.sobra;
  }

  ferir(z, dano) {
    if (z.morto) return;
    z.pend = Math.max(0, z.pend - dano);
    z.vida -= dano;
    if (z.vida > 0) return;
    // caiu: some da horda (a animação da queda é a mesma dos soldados)
    const T = this.T;
    z.vida = 0; z.morto = true; z.alvo = null; z.andando = false; z.tiro = 0; z.caindo = 0.0;
    this._ha_mortos = true;
    this.abatidos++;
    if (z.esp) {   // especial: queda lenta (desenho próprio), prêmio maior
      z.caindo = -1; z.morte = 0; z.pedra_mao = false; this.morrendo.push(z);
      T.som.tocar('queda', z.x, z.y);
      this._moedas += z.st.premio;
      this._pos_moeda = [z.x, z.y];
      return;
    }
    T.caidos.push(z);
    if (rnd() < 0.35) T.som.tocar('queda', z.x, z.y);
    this._moedas += Z.PREMIO;
    this._pos_moeda = [z.x, z.y];
  }

  _premiar(dt) {
    // as moedas dos abates entram juntas, uma vez por segundo (um "+N" só)
    this._t_moeda += dt;
    if (this._t_moeda < 1.0 || this._moedas < 1) return;
    this._t_moeda = 0;
    const T = this.T, n = Math.floor(this._moedas);
    this._moedas -= n;
    T.moedas += n;
    if (this._pos_moeda) T.flutuantes.push([this._pos_moeda[0], this._pos_moeda[1], '+' + n, 0.0]);
    T.som.tocar('moeda');
  }
}
