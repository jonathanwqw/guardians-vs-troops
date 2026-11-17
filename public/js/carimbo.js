// carimbo.js — CARIMBO DE ESQUADRÃO (desempenho).
//
// Um pelotão parado em formação são 40 desenhos iguais quadro após quadro.
// O carimbo junta esses 40 numa imagem só e desenha 1 vez.
//
// O RESULTADO NA TELA É O MESMO:
//   * na lista ordenada por profundidade, os soldados de uma tropa podem vir
//     misturados com outros objetos (outra tropa ao lado, uma árvore). O
//     carimbo só é usado se NENHUM desses objetos do meio encosta na área da
//     tropa na tela — aí desenhar a tropa inteira de uma vez, no lugar do
//     primeiro soldado, dá exatamente o mesmo desenho. Objeto sem área
//     conhecida (tanque, prédio com bandeira, fogo...) no meio: desenho normal;
//   * a "assinatura" é cada soldado com a posição em pixels (relativa ao
//     primeiro) e o quadro de animação, NA ORDEM em que seriam desenhados;
//     mudou um pixel ou um quadro, a assinatura muda e volta o desenho normal;
//   * a imagem é montada com os mesmos recortes do atlas, nas mesmas posições.
//
// Só carimba depois de alguns quadros sem mudar (quem está atirando ou
// andando muda toda hora e fica no desenho normal) e respeita um orçamento de
// carimbos novos por quadro (agenda), para não pesar de uma vez. Cada tropa é
// avaliada UMA vez por quadro.
import * as pg from './pg.js';

const ESTAVEL = 10;     // quadros com a mesma assinatura antes de carimbar
const MIN_SOLD = 6;     // tropa pequena não compensa

export class Carimbos {
  constructor() {
    this._est = new WeakMap();   // esquadrão -> estado do carimbo
    this.ativo = true;
    this.estavel = ESTAVEL;      // o gerente de qualidade encurta quando o aparelho pena
    this.q = 0;                  // número do quadro
    this.usados = 0;             // carimbos desenhados neste quadro (painel)
    this.feitos = 0;             // carimbos montados neste quadro (painel)
    this.economia = 0;           // desenhos poupados neste quadro (painel)
    this._meus = [];             // itens da tropa avaliada (reaproveitado)
    this._caixa = [0, 0, 0, 0];
  }

  quadro(ord, n) {
    // começo do desenho: conta, para cada tropa, quantos soldados dela estão
    // na lista e onde está o último (depois da ordenação)
    this.q++;
    this.usados = 0; this.feitos = 0; this.economia = 0;
    if (!this.ativo) return;
    const q = this.q;
    for (let i = 0; i < n; i++) {
      const it = ord[i], sq = it.sq;
      if (!sq) continue;
      if (sq._cq !== q) { sq._cq = q; sq._cn = 0; sq._cfeito = 0; }
      sq._cn++; sq._cult = i;
    }
  }

  // 0 = ainda não avaliada neste quadro, 1 = desenhada pelo carimbo, 2 = desenho normal
  estado(sq) { return sq._cq === this.q ? sq._cfeito : 0; }

  tentar(tela, ord, idx, agenda, area_de) {
    // ord[idx] é o PRIMEIRO soldado desta tropa na lista. Devolve true se a
    // tropa inteira foi desenhada pelo carimbo (os outros soldados dela serão
    // pulados); false = desenho normal neste quadro.
    const it0 = ord[idx], sq = it0.sq;
    sq._cfeito = 2;   // avaliada neste quadro (não tenta de novo)
    if (!this.ativo) return false;
    const n = sq.sold.length;
    if (n < MIN_SOLD || sq._cn !== n) return false;   // tem soldado fora da tela: desenho normal
    // 1) os itens da tropa (na ordem do desenho), a área dela e a assinatura
    const meus = this._meus;
    meus.length = 0;
    const X0 = it0.X, Y0 = it0.Y;
    let h1 = 0x811c9dc5 | 0, h2 = n | 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const fim = sq._cult;
    for (let i = idx; i <= fim; i++) {
      const it = ord[i];
      if (it.sq !== sq) continue;
      meus.push(it);
      const dx = it.X - X0, dy = it.Y - Y0, id = it.sp[7];
      h1 = Math.imul(h1 ^ (dx + 4096), 16777619); h1 = Math.imul(h1 ^ (dy + 4096), 16777619); h1 = Math.imul(h1 ^ id, 16777619);
      h2 = (Math.imul(h2, 31) + dx * 7 + dy * 131 + id * 8191) | 0;
      if (it.X < x0) x0 = it.X;
      if (it.Y < y0) y0 = it.Y;
      if (it.X + it.sp[5] > x1) x1 = it.X + it.sp[5];
      if (it.Y + it.sp[6] > y1) y1 = it.Y + it.sp[6];
    }
    let st = this._est.get(sq);
    if (!st) { st = { h1: 0, h2: 0, n: -1, estavel: 0, img: null, ok: false, dx: 0, dy: 0 }; this._est.set(sq, st); }
    if (st.h1 !== h1 || st.h2 !== h2 || st.n !== n) {
      st.h1 = h1; st.h2 = h2; st.n = n; st.estavel = 0; st.ok = false;
      return false;
    }
    if (st.estavel < this.estavel) { st.estavel++; return false; }
    // 2) quem está no meio dos soldados na lista não pode encostar na tropa
    const caixa = this._caixa;
    for (let i = idx + 1; i < fim; i++) {
      const it = ord[i];
      if (it.sq === sq) continue;
      if (!area_de(it, caixa)) return false;   // objeto sem área conhecida: não arrisca
      if (caixa[0] < x1 && caixa[0] + caixa[2] > x0 && caixa[1] < y1 && caixa[1] + caixa[3] > y0) return false;
    }
    // 3) monta a imagem (uma vez, dentro do orçamento do quadro)
    if (!st.ok) {
      if (agenda && !agenda.pode_carimbar()) return false;
      const w = x1 - x0, h = y1 - y0;
      if (!st.img || st.img.canvas.width < w || st.img.canvas.height < h || st.img.canvas.width > w * 2 + 64) {
        st.img = pg.superficie(Math.max(1, w), Math.max(1, h));
      } else {
        st.img.clearRect(0, 0, st.img.canvas.width, st.img.canvas.height);
      }
      const c = st.img;
      for (let j = 0; j < meus.length; j++) {
        const it = meus[j], sp = it.sp;
        c.drawImage(sp[0], sp[3], sp[4], sp[5], sp[6], it.X - x0, it.Y - y0, sp[5], sp[6]);
      }
      st.dx = x0 - X0; st.dy = y0 - Y0; st.ok = true;
      this.feitos++;
    }
    // 4) um desenho no lugar de n
    tela.drawImage(st.img.canvas, X0 + st.dx, Y0 + st.dy);
    sq._cfeito = 1;
    this.usados++;
    this.economia += n - 1;
    return true;
  }
}
