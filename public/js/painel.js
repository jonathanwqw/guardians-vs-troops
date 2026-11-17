// painel.js — PAINEL DE DESEMPENHO (F3, ou 3 toques rápidos na caixa das
// moedas/parafusos). Mostra ao vivo, em milissegundos, quanto cada parte do
// quadro custa no SEU aparelho, para achar o que pesa de verdade:
//
//   FPS, média e pior quadro (com gráfico dos últimos quadros)
//   lógica (passos das regras por quadro), desenho do campo, interface
//   sprites desenhados, carimbos usados e desenhos poupados
//   nível do gerente de qualidade, resolução interna, teto de partículas
//   soldados e esquadrões em campo, memória (quando o navegador informa)

const N_HIST = 120;

export class Painel {
  constructor() {
    this.visivel = false;
    this._t = {};            // início de cada medida
    this.ms = {};            // média móvel de cada medida
    this.hist = new Float32Array(N_HIST);
    this.hi = 0;
    this._ult = performance.now();
    this._toques = [];
    window.addEventListener('keydown', (e) => { if (e.key === 'F3') { e.preventDefault(); this.alternar(); } });
  }

  alternar() { this.visivel = !this.visivel; }

  toque_recursos() {
    // 3 toques em menos de 1 s na caixa das moedas/parafusos
    const agora = performance.now();
    this._toques = this._toques.filter(t => agora - t < 1000);
    this._toques.push(agora);
    if (this._toques.length >= 3) { this._toques.length = 0; this.alternar(); }
  }

  inicio(nome) { this._t[nome] = performance.now(); }
  fim(nome) {
    const d = performance.now() - (this._t[nome] || performance.now());
    this.ms[nome] = this.ms[nome] === undefined ? d : this.ms[nome] + (d - this.ms[nome]) * 0.1;
  }

  desenhar(tela, partida) {
    const agora = performance.now();
    const q = agora - this._ult;
    this._ult = agora;
    this.hist[this.hi] = q; this.hi = (this.hi + 1) % N_HIST;
    if (!this.visivel) return;
    const app = partida.app, ui = partida.ui, T = partida.tropas, cena = partida.cena;
    const u = ui.u || 1;
    let pior = 0, soma = 0;
    for (let i = 0; i < N_HIST; i++) { soma += this.hist[i]; if (this.hist[i] > pior) pior = this.hist[i]; }
    const media = soma / N_HIST;
    let sold_v = 0, sold_r = 0;
    for (const sq of T.esquadroes) { if (sq.time === 'verde') sold_v += sq.sold.length; else sold_r += sq.sold.length; }
    const Q = partida.qualidade, cb = cena.carimbos, ag = cena.agenda, j = app.janela;
    const f = (v) => (v === undefined ? '-' : v.toFixed(2));
    const linhas = [
      `FPS ${Math.round(j.get_fps ? j.get_fps() : 1000 / media)}   média ${media.toFixed(1)} ms   pior ${pior.toFixed(1)} ms`,
      `lógica ${f(this.ms.logica)} ms  (${partida.passo.passos_quadro} passo/quadro)`,
      `desenho do campo ${f(this.ms.desenho)} ms   interface ${f(this.ms.interface)} ms`,
      `sprites ${cena.medidas.sprites}/${cena.medidas.lista}   carimbos ${cb.usados} (-${cb.economia} desenhos)   novos ${cb.feitos}  adiados ${ag ? ag.adiados : 0}`,
      `qualidade nível ${Q.nivel}   resolução ${j.canvas.width}x${j.canvas.height} (${Math.round(Q.resolucao * 100)}%)   partículas ${Math.round(cena.fx.escala * 100)}%`,
      `soldados ${sold_v} x ${sold_r}   esquadrões ${T.esquadroes.length}` +
        (performance.memory ? `   memória ${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB` : ''),
    ];
    const fs = Math.round(12 * u), lh = Math.round(16 * u), pad = Math.round(8 * u);
    tela.save();
    tela.font = `bold ${fs}px monospace`;
    let w = 0;
    for (const l of linhas) w = Math.max(w, tela.measureText(l).width);
    const gh = Math.round(40 * u);
    const W = w + 2 * pad, H = linhas.length * lh + gh + 3 * pad;
    const x = Math.round(8 * u), y = Math.round(ui.y_status ? ui.y_status + 60 * u : 80 * u);
    tela.fillStyle = 'rgba(15,20,30,0.82)';
    tela.fillRect(x, y, W, H);
    tela.fillStyle = '#e6ecf5';
    tela.textBaseline = 'top';
    linhas.forEach((l, i) => tela.fillText(l, x + pad, y + pad + i * lh));
    // gráfico: cada barra é um quadro (verde < 17 ms, amarelo < 33 ms, vermelho acima)
    const gy = y + pad * 2 + linhas.length * lh, bw = W - 2 * pad;
    const passo_x = bw / N_HIST;
    for (let i = 0; i < N_HIST; i++) {
      const v = this.hist[(this.hi + i) % N_HIST];
      const hh = Math.min(gh, v / 50 * gh);
      tela.fillStyle = v < 17.5 ? '#4cc36b' : v < 34 ? '#f0c040' : '#e5533f';
      tela.fillRect(x + pad + i * passo_x, gy + gh - hh, Math.max(1, passo_x - 0.5), hh);
    }
    tela.fillStyle = 'rgba(255,255,255,0.35)';
    tela.fillRect(x + pad, gy + gh - 16.7 / 50 * gh, bw, 1);   // linha dos 60 FPS
    tela.restore();
  }
}
