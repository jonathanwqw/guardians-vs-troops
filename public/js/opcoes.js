// opcoes.js — configurações do jogador. (clone de jogo/opcoes.py)
// No original elas ficam em opcoes.json ao lado do main.py; no navegador o
// arquivo opcoes.json do kit dá os valores de partida e o que o jogador mudar
// fica guardado no próprio aparelho (localStorage).
//   * menu.js (opcoes) muda e salva
//   * main.js lê ao abrir: volume/música/efeitos vão para som.js (Som.aplicar),
//     tela cheia para a janela, fps para o contador no canto da tela
export const PADRAO = {
  volume: 0.85,      // 0..1, vale para tudo (som.js)
  musica: true,      // som de guerra do menu
  efeitos: true,     // sons do jogo
  tela_cheia: false, // só onde o navegador deixa
  fps: false,        // mostra quadros por segundo no canto
  tutorial: true,
  limite_tropas: 500, // tela de nova partida: tropas terrestres por jogador (250/500/750)
  modo: 'normal',     // tela de modo: 'normal' (versus IA) ou 'zumbi'
  horda: 1,           // tela de nova partida no modo zumbi: tamanho da horda (1, 2 ou 3)
  ia: 1,              // tela de nova partida: dificuldade da IA (1, 2 ou 3)    // mostra o tutorial em toda partida solo enquanto estiver ligado
};

const CHAVE = 'guardians_vs_troops_opcoes';

function juntar(op, lido) {
  if (!lido || typeof lido !== 'object') return;
  for (const k in PADRAO) {
    if (k in lido && typeof lido[k] === typeof PADRAO[k]) op[k] = lido[k];
  }
}

export async function carregar(pasta) {
  const op = Object.assign({}, PADRAO);
  try {
    const r = await fetch(pasta + 'opcoes.json', { cache: 'no-cache' });
    if (r.ok) juntar(op, await r.json());
  } catch (_) { /* sem o arquivo: usa o padrão */ }
  try {
    juntar(op, JSON.parse(localStorage.getItem(CHAVE)));
  } catch (_) { /* primeira vez (ou guardado estragado) */ }
  op.tela_cheia = false;   // o navegador só entra em tela cheia com um toque do jogador
  return op;
}

export function salvar(pasta, op) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(op));
  } catch (_) { /* navegador sem armazenamento: só não lembra da próxima vez */ }
}
