// passo.js — PASSO FIXO COM INTERPOLAÇÃO (desempenho e estabilidade).
//
// A batalha passa a andar SEMPRE em passos iguais de 1/60 s, não importa o
// FPS: com 60 quadros por segundo é 1 passo por quadro (igual a antes); com
// 35, alguns quadros fazem 2 passos. As regras recebem sempre o mesmo dt
// (velocidades, recargas e timers dão sempre a mesma conta).
//
// Como os passos não caem exatamente em cima dos quadros, o desenho mostra
// as tropas no ponto certo ENTRE o passo anterior e o atual (interpolação):
// o movimento fica liso mesmo quando o FPS oscila. Isso é só do desenho: logo
// depois de desenhar, as posições verdadeiras voltam.
//
// O teto de 0,05 s por quadro continua (o jogo não "pula" tempo quando o
// aparelho engasga muito; fica mais lento, como antes).

export const H = 1 / 60;

export class PassoFixo {
  constructor() {
    this.acc = 0.0;
    this.alfa = 1.0;     // onde o desenho fica entre o passo anterior (0) e o atual (1)
    this.id = 0;         // número do passo (marca quem tem posição anterior válida)
    this.passos_quadro = 0;
  }

  avancar(dt, tropas, rodar) {
    // rodar(h) faz um passo das regras; devolve quantos passos rodou
    this.acc = Math.min(this.acc + dt, 0.1);
    let n = 0;
    while (this.acc >= H - 1e-9) {
      this.acc -= H;
      this.lembrar(tropas);
      rodar(H);
      n++;
    }
    this.alfa = Math.max(0, Math.min(1, this.acc / H));
    this.passos_quadro = n;
    return n;
  }

  parado() { this.alfa = 1.0; this.passos_quadro = 0; }   // pausa/tutorial: mostra o estado exato

  lembrar(tropas) {
    // guarda onde cada tropa e cada soldado estavam antes do passo
    const id = ++this.id;
    const esq = tropas.esquadroes;
    for (let q = 0; q < esq.length; q++) {
      const sq = esq[q];
      sq._px = sq.x; sq._py = sq.y; sq._pid = id;
      const so = sq.sold;
      for (let i = 0; i < so.length; i++) { const s = so[i]; s._px = s.x; s._py = s.y; s._pid = id; }
    }
    if (tropas.horda) {   // modo zumbi: cada zumbi também guarda onde estava
      const zs = tropas.horda.vivos;
      for (let i = 0; i < zs.length; i++) { const s = zs[i]; s._px = s.x; s._py = s.y; s._pid = id; }
    }
  }

  interpolar(tropas) {
    // põe as posições "do desenho" (entre o passo anterior e o atual)
    const a = this.alfa, id = this.id;
    this._mexidos = this._mexidos || [];
    const lista = this._mexidos;
    lista.length = 0;
    if (a >= 0.999) return;
    const b = 1 - a;
    const esq = tropas.esquadroes;
    for (let q = 0; q < esq.length; q++) {
      const sq = esq[q];
      if (sq._pid === id) { sq._rx = sq.x; sq._ry = sq.y; sq.x = sq._px * b + sq.x * a; sq.y = sq._py * b + sq.y * a; lista.push(sq); }
      const so = sq.sold;
      for (let i = 0; i < so.length; i++) {
        const s = so[i];
        if (s._pid !== id) continue;
        s._rx = s.x; s._ry = s.y;
        s.x = s._px * b + s.x * a; s.y = s._py * b + s.y * a;
        lista.push(s);
      }
    }
    if (tropas.horda) {
      const zs = tropas.horda.vivos;
      for (let i = 0; i < zs.length; i++) {
        const s = zs[i];
        if (s._pid !== id || s.morto) continue;
        s._rx = s.x; s._ry = s.y;
        s.x = s._px * b + s.x * a; s.y = s._py * b + s.y * a;
        lista.push(s);
      }
    }
  }

  restaurar() {
    // devolve as posições verdadeiras (as regras nunca veem as do desenho)
    const lista = this._mexidos;
    if (!lista) return;
    for (let i = 0; i < lista.length; i++) { const o = lista[i]; o.x = o._rx; o.y = o._ry; }
    lista.length = 0;
  }
}
