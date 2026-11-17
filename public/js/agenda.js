// agenda.js — AGENDA COM ORÇAMENTO (desempenho): nada pesado de uma vez só.
//
// 1. ORÇAMENTO DO QUADRO: trabalhos "de enfeite" que podem esperar (montar
//    carimbos de esquadrão, refazer caches de imagem) só rodam enquanto o
//    quadro ainda tem folga. O que não coube fica para o próximo quadro.
//
// 2. FATIADOR: um trabalho grande e periódico (o "pensar" da IA, que lia o
//    campo inteiro, defendia, manobrava, investia e treinava tudo no mesmo
//    passo) é cortado em fatias, uma por passo, na mesma ordem. As decisões
//    são as mesmas; só deixam de cair todas no mesmo quadro.

export class Agenda {
  constructor() {
    this.orcamento_ms = 2.0;   // folga por quadro para os trabalhos que podem esperar
    this.max_carimbos = 4;     // carimbos novos por quadro (no máximo)
    this._t0 = 0;
    this._carimbos = 0;
    this.adiados = 0;          // quantos ficaram para depois neste quadro (painel)
  }

  inicio_quadro() {
    this._t0 = performance.now();
    this._carimbos = 0;
    this.adiados = 0;
  }

  folga() { return this.orcamento_ms - (performance.now() - this._t0); }

  pode_carimbar() {
    if (this._carimbos >= this.max_carimbos) { this.adiados++; return false; }
    this._carimbos++;
    return true;
  }
}

export class Fatiador {
  // fatias: lista de funções; ciclo(): começa um ciclo novo; passo(): roda a
  // próxima fatia (devolve false quando o ciclo acabou)
  constructor(fatias) {
    this.fatias = fatias;
    this.i = fatias.length;   // parado
  }
  ciclo() { this.i = 0; }
  ocupado() { return this.i < this.fatias.length; }
  passo() {
    if (this.i >= this.fatias.length) return false;
    this.fatias[this.i++]();
    return true;
  }
}
