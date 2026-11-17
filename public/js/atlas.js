// atlas.js — ATLAS DE SPRITES (desempenho).
//
// Cada quadro de soldado era uma imagem separada: com 1.500 soldados na tela
// o navegador trocava de imagem a cada desenho e não conseguia juntar nada.
// Aqui todos os quadros vão para poucas folhas grandes; o desenho continua
// pixel por pixel o mesmo (mesmo recorte, mesma posição), só que saindo da
// mesma folha, e a placa de vídeo junta os desenhos em lotes.
//
// empacotar(lista) recebe sprites [imagem, x0, y0] e devolve, para cada um,
// [folha, x0, y0, sx, sy, w, h]: desenhe com drawImage(folha, sx, sy, w, h, X, Y, w, h).
import * as pg from './pg.js';

const LARG = 2048, ALT_MAX = 2048, FOLGA = 1;   // 1 px vazio entre sprites (sem sangrar no vizinho)

export function empacotar(lista) {
  // ordena por altura (prateleiras mais cheias), mas devolve na ordem pedida
  const ordem = lista.map((s, i) => i).sort((a, b) => lista[b][0].height - lista[a][0].height);
  const lugares = new Array(lista.length);
  const folhas = [];
  let x = 0, y = 0, alt_prat = 0, folha = 0, alt_folha = [0];
  for (const i of ordem) {
    const img = lista[i][0], w = img.width, h = img.height;
    if (x + w + FOLGA > LARG) { x = 0; y += alt_prat + FOLGA; alt_prat = 0; }
    if (y + h + FOLGA > ALT_MAX) { folha++; alt_folha.push(0); x = 0; y = 0; alt_prat = 0; }
    lugares[i] = [folha, x, y];
    x += w + FOLGA;
    if (h > alt_prat) alt_prat = h;
    alt_folha[folha] = Math.max(alt_folha[folha], y + h + FOLGA);
  }
  for (let f = 0; f < alt_folha.length; f++) {
    const c = pg.superficie(LARG, Math.max(1, alt_folha[f]));
    folhas.push(c);
  }
  const out = new Array(lista.length);
  for (let i = 0; i < lista.length; i++) {
    const [f, sx, sy] = lugares[i];
    const [img, x0, y0] = lista[i];
    folhas[f].drawImage(img, sx, sy);
    out[i] = [folhas[f].canvas, x0, y0, sx, sy, img.width, img.height];
  }
  // as imagens soltas não são mais usadas: solta a memória delas
  for (const s of lista) { s[0].width = 1; s[0].height = 1; }
  return out;
}
