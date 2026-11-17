// Layout mensurável das gavetas, sem alterar o estilo de desenho das cartas.
// (clone de jogo/layout_gavetas.py)
const int = Math.trunc;

export function sobreposicao(a, b) {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

export function triangulo_carta(r) {
  // Triângulo de referência inscrito no retângulo real da carta.
  const [x, y, w, h] = r;
  return [[x + w / 2, y], [x, y + h], [x + w, y + h]];
}

export function ampliar(r, fator) {
  const [x, y, w, h] = r;
  return [x - (fator - 1) * w / 2, y - (fator - 1) * h / 2, w * fator, h * fator];
}

export function validar_cartas(cartas, abas, fator = 1.25) {
  // Confere triângulos e margens de segurança de 25% entre cartas.
  for (let i = 0; i < cartas.length; i++) {
    const r = cartas[i][1];
    const t = triangulo_carta(r);
    if (!(Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) > 0)) {
      throw new Error('Triângulo de carta degenerado');
    }
    for (let k = i + 1; k < cartas.length; k++) {
      if (sobreposicao(ampliar(r, fator), ampliar(cartas[k][1], fator))) throw new Error('Cartas invadem margem de 25%');
    }
    for (const aba of abas) {
      if (sobreposicao(r, aba)) throw new Error('Carta cobre botão de abertura');
    }
  }
  return true;
}

export function validar_colunas(cartas, colunas = 3) {
  // Testa a grade: cada linha reutiliza os mesmos centros horizontais.
  for (let i = 0; i < cartas.length; i++) {
    if (i >= colunas) {
      const r = cartas[i][1], acima = cartas[i - colunas][1];
      if (r[0] !== acima[0] || r[2] !== acima[2]) throw new Error('Coluna desalinhada: carta ' + i);
    }
  }
  return true;
}

export function posicionar_gavetas(vw, vh, u, tipos, melhorias, abas) {
  const margem = int(8 * u);
  const quantidade = tipos.length;
  const colunas = Math.min(3, Math.max(1, quantidade));
  const linhas = Math.ceil(quantidade / colunas);
  // Espaço de 25% do tamanho em cada eixo (superior aos 10% solicitados).
  const cw = Math.min(int(98 * u), Math.max(int(28 * u), int((vw - 2 * margem) / (colunas + 0.28 * (colunas - 1)))));
  const ch = int(132 * u);
  const passo_x = Math.ceil(cw * 1.28);
  const passo_y = Math.ceil(ch * 1.28);
  const largura = (colunas - 1) * passo_x + cw;
  const altura = (linhas - 1) * passo_y + ch;
  const x0 = Math.floor((vw - largura) / 2);
  // Prioriza a região central, deixando espaço para o botão inferior.
  const y_max = (abas.length ? Math.min(...abas.map(a => a[1])) : vh) - int(12 * u) - altura;
  let y0 = Math.min(Math.max(int(115 * u), int(vh * 0.34) - Math.floor(altura / 2)), y_max);
  y0 = Math.max(int(48 * u), y0);
  const colunas_x = [];
  for (let c = 0; c < colunas; c++) colunas_x.push(x0 + c * passo_x);
  const cartas = tipos.map((tipo, i) => [tipo, [colunas_x[i % colunas], y0 + Math.floor(i / colunas) * passo_y, cw, ch]]);
  const base = [x0, Math.max(int(4 * u), y0 - int(52 * u)), largura, int(44 * u)];
  const vao = int(6 * u);
  const nl = melhorias.length;
  const lw = Math.min(int(150 * u), Math.max(int(48 * u), Math.floor((vw - 2 * margem - vao * (nl - 1)) / Math.max(1, nl))));
  const larg = nl * lw + Math.max(0, nl - 1) * vao;
  const lx = Math.floor((vw - larg) / 2);
  const ly = Math.max(int(95 * u), Math.min(int(vh * 0.53), vh - int(130 * u) - int(62 * u)));
  const loja = melhorias.map((mel, i) => [mel, [lx + i * (lw + vao), ly, lw, int(62 * u)]]);
  // No original estas checagens derrubam o jogo se falharem; aqui só avisam
  // (uma janela de navegador pode ter qualquer formato).
  try {
    validar_cartas(cartas, abas);
    validar_colunas(cartas);
    for (const aba of abas) {
      if (sobreposicao(base, aba) || loja.some(([, r]) => sobreposicao(r, aba))) throw new Error('Gaveta sobrepõe botão de abertura');
    }
  } catch (e) {
    console.warn('layout_gavetas:', e.message);
  }
  return [cartas, loja, base];
}
