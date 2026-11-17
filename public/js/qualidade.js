// qualidade.js — GERENTE DE QUALIDADE (desempenho).
//
// Mede o tempo de cada quadro (média móvel). Quando o aparelho começa a
// penar, tira ENFEITE — nunca regra do jogo:
//
//   nível 0  tudo no máximo
//   nível 1  partículas/fumaça/neve até 70%, destroços até 75%
//   nível 2  partículas até 45%, destroços até 50%, carimbo mais cedo
//   nível 3  partículas até 25%, destroços até 30%, e se ainda assim o jogo
//            ficar abaixo de ~25 FPS por um tempo, baixa a RESOLUÇÃO interna
//            (3x -> 2,5x -> 2x ... dos pixels da página; nunca menos de 1x)
//
// Voltou a sobrar folga, devolve o enfeite aos poucos. A resolução só baixa
// no meio da partida (uma vez a cada 20 s no máximo, porque refazer o terreno
// leva um instante); para SUBIR ela espera a próxima partida: o que funcionou
// fica guardado neste aparelho.
//
// Mecânica, regras, IA, tamanhos e posições: nada muda.

const TETO_FX = [1.0, 0.7, 0.45, 0.25];
const TETO_DEST = [1.0, 0.75, 0.5, 0.3];
const ESTAVEL_CARIMBO = [10, 8, 5, 3];
const RES = [1, 0.85, 0.7, 0.6, 0.5];   // frações dos pixels reais
const CHAVE = 'gvt_resolucao';

export class Qualidade {
  constructor(app) {
    this.app = app;
    this.nivel = 0;
    this.ms = 16.7;          // média móvel do tempo de quadro
    this.t_ruim = 0;         // há quanto tempo está pesado
    this.t_bom = 0;          // há quanto tempo está com folga
    this.t_critico = 0;      // há quanto tempo abaixo de ~25 FPS no nível 3
    this.t_res = 99;         // desde a última troca de resolução
    this.t_otimo = 0;        // partida inteira leve: dá para tentar mais resolução na próxima
    this.trocas = 0;
  }

  get resolucao() { return this.app.janela.escala_render || 1; }

  nova_partida() {
    this.nivel = 0; this.ms = 16.7; this.t_ruim = 0; this.t_bom = 0; this.t_critico = 0; this.t_res = 99; this.t_otimo = 0;
  }

  quadro(dt, partida) {
    const ms = dt * 1000;   // (o relógio já corta em 50 ms)
    this.ms += (ms - this.ms) * 0.05;
    this.t_res += dt;
    if (this.ms > 21) { this.t_ruim += dt; this.t_bom = 0; }
    else if (this.ms < 17.8) { this.t_bom += dt; this.t_ruim = 0; }
    else { this.t_ruim = Math.max(0, this.t_ruim - dt); this.t_bom = Math.max(0, this.t_bom - dt); }

    if (this.t_ruim > 1.5 && this.nivel < 3) { this.nivel++; this.t_ruim = 0; }
    if (this.t_bom > 6 && this.nivel > 0) { this.nivel--; this.t_bom = 0; }

    // nível 3 e ainda abaixo de ~25 FPS: menos pixels
    if (this.nivel === 3 && this.ms > 38) this.t_critico += dt; else this.t_critico = Math.max(0, this.t_critico - dt * 2);
    if (this.t_critico > 6 && this.t_res > 20) this._baixar_resolucao(partida);

    // muito tempo leve no máximo de enfeite: na próxima partida tenta um degrau acima
    if (this.nivel === 0 && this.ms < 17.2) this.t_otimo += dt; else this.t_otimo = Math.max(0, this.t_otimo - dt);
    if (this.t_otimo > 45 && this.resolucao < 1) { this._guardar(this._degrau(+1)); this.t_otimo = -1e9; }

    this._aplicar(partida);
  }

  _degrau(d) {
    const r = this.resolucao;
    let i = 0;
    for (let k = 0; k < RES.length; k++) if (Math.abs(RES[k] - r) < Math.abs(RES[i] - r)) i = k;
    return RES[Math.max(0, Math.min(RES.length - 1, i - d))];
  }

  _baixar_resolucao(partida) {
    const nova = this._degrau(-1);
    const j = this.app.janela;
    if (nova >= this.resolucao - 1e-6) { this.t_critico = 0; return; }
    const dpr = window.devicePixelRatio || 1;
    if (dpr * nova < 1 - 1e-6 && dpr * this.resolucao <= 1 + 1e-6) { this.t_critico = 0; return; }   // já está em 1x
    j.escala_render = nova;
    j.ajustar();
    if (partida && partida._tamanho) partida._tamanho();   // refaz o que depende do tamanho (uma vez)
    this._guardar(nova);
    this.t_res = 0; this.t_critico = 0; this.trocas++;
  }

  _guardar(v) { try { localStorage.setItem(CHAVE, String(v)); } catch (_) { /* ok */ } }

  _aplicar(partida) {
    const cena = partida.cena, n = this.nivel;
    cena.fx.teto = TETO_FX[n];
    const d = cena.fx.dest;
    if (d) { d.max_grandes = Math.max(6, Math.round(28 * TETO_DEST[n])); d.max_miudos = Math.max(40, Math.round(260 * TETO_DEST[n])); }
    if (cena.carimbos) cena.carimbos.estavel = ESTAVEL_CARIMBO[n];
    if (cena.agenda) cena.agenda.max_carimbos = 4 + n * 2;
  }
}
