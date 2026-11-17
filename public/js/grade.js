// grade.js — GRADE ESPACIAL dos esquadrões (desempenho).
//
// O mapa é dividido em células; cada esquadrão fica anotado na célula onde
// está. "Quem está perto de (x, y)?" passa a olhar só as células vizinhas em
// vez da lista inteira (com 150 tropas por lado: de ~300 comparações por
// pergunta para umas poucas dezenas).
//
// A RESPOSTA É A MESMA DE ANTES: a grade só devolve candidatos (um pouco a
// mais, nunca a menos) e quem pergunta faz a mesma conta exata de antes, na
// MESMA ORDEM da lista original (os índices saem ordenados), então até o
// desempate entre dois alvos à mesma distância continua igual.
//
// A grade é refeita a cada passo da batalha. Entre a montagem e a pergunta as
// tropas andam no máximo um passo: a folga (MARGEM) cobre isso. Se a lista de
// esquadrões mudar no meio (tropa nova, tropa que sumiu), a versão muda e quem
// pergunta volta para a busca completa até a próxima montagem.

const CEL = 6.0;          // tamanho da célula (unidades do mundo)
const MARGEM = 4.0;       // folga para o quanto uma tropa anda dentro de um passo
const OFF = 64;           // células de -384 a +384 (o mapa cabe com sobra)
const LADO = 128;

export class GradeEsquadroes {
  constructor() {
    this.cabeca = new Int32Array(LADO * LADO).fill(-1);   // primeiro índice de cada célula
    this.prox = new Int32Array(1024);                       // próximo índice na mesma célula
    this.celulas_usadas = [];                               // para limpar rápido
    this.versao = -1;
    this.n = 0;
    this._buf = new Int32Array(1024);
  }

  montar(esq, versao) {
    for (const c of this.celulas_usadas) this.cabeca[c] = -1;
    this.celulas_usadas.length = 0;
    const n = esq.length;
    if (this.prox.length < n) { this.prox = new Int32Array(n * 2); this._buf = new Int32Array(n * 2); }
    // de trás para a frente: cada célula fica com os índices em ordem crescente
    for (let i = n - 1; i >= 0; i--) {
      const o = esq[i];
      const ci = Math.floor(o.x / CEL) + OFF, cj = Math.floor(o.y / CEL) + OFF;
      if (ci < 0 || cj < 0 || ci >= LADO || cj >= LADO) { this.versao = -1; return; }   // fora: sem grade neste passo
      const c = cj * LADO + ci;
      if (this.cabeca[c] === -1) this.celulas_usadas.push(c);
      this.prox[i] = this.cabeca[c];
      this.cabeca[c] = i;
    }
    this.n = n;
    this.versao = versao;
  }

  valida(versao) { return this.versao === versao && versao >= 0; }

  perto(x, y, raio) {
    // índices (ordenados) dos esquadrões que PODEM estar a até `raio` de (x, y).
    // Devolve [buffer, quantidade] (o buffer é reaproveitado: use antes da próxima chamada)
    const r = raio + MARGEM;
    const i0 = Math.max(0, Math.floor((x - r) / CEL) + OFF), i1 = Math.min(LADO - 1, Math.floor((x + r) / CEL) + OFF);
    const j0 = Math.max(0, Math.floor((y - r) / CEL) + OFF), j1 = Math.min(LADO - 1, Math.floor((y + r) / CEL) + OFF);
    const buf = this._buf;
    let k = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        for (let q = this.cabeca[j * LADO + i]; q !== -1; q = this.prox[q]) buf[k++] = q;
      }
    }
    // ordena (inserção: poucos itens, quase sempre já em ordem por célula)
    for (let a = 1; a < k; a++) {
      const v = buf[a];
      let b = a - 1;
      while (b >= 0 && buf[b] > v) { buf[b + 1] = buf[b]; b--; }
      buf[b + 1] = v;
    }
    return k;
  }
}
