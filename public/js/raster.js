// raster.js — transforma FORMAS [cor, pontos] em imagem. (clone de jogo/raster.py)
// Dois caminhos:
//   * sprite(): desenha num quadro 3x maior e reduz. As bordas ficam lisas e
//     nítidas sem nenhum brilho. Usado para tudo que é pré-desenhado:
//     soldados, árvores, prédios.
//   * desenhar(): desenha direto numa superfície (terreno, partes animadas).
import * as pg from './pg.js';

export const SUPER = 3;  // fator de superamostragem dos sprites

export function poligono(surf, cor, pts, liso = false) {
  // polígono preenchido; cor com alfa < 255 é misturada de verdade
  if (pts.length < 3) return;
  pg.poligono(surf, cor, pts);
}

export function desenhar(surf, formas, escala, ox, oy, liso = false) {
  // desenha formas (px de cena) em surf: tela = ponto * escala + (ox, oy)
  for (const [cor, pts] of formas) {
    surf.beginPath();
    surf.moveTo(pts[0][0] * escala + ox, pts[0][1] * escala + oy);
    for (let i = 1; i < pts.length; i++) surf.lineTo(pts[i][0] * escala + ox, pts[i][1] * escala + oy);
    surf.closePath();
    surf.fillStyle = pg.css(cor);
    surf.fill();
  }
}

export function sprite(formas, escala) {
  // formas -> [imagem com transparência, x0, y0].
  // (x0, y0) é o canto da imagem em px de cena (zoom 1): para desenhar,
  // coloque a imagem em (x0 * escala - 1, y0 * escala - 1) a partir da
  // origem das formas.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of formas) {
    for (const p of f[1]) {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
    }
  }
  const w = Math.max(1, Math.ceil((x1 - x0) * escala) + 2);
  const h = Math.max(1, Math.ceil((y1 - y0) * escala) + 2);
  const grande = pg.superficie(w * SUPER, h * SUPER);
  const k = escala * SUPER;
  grande.lineJoin = 'round';
  grande.lineWidth = 1;
  for (const [cor, pts] of formas) {
    if (pts.length < 3) continue;
    grande.beginPath();
    grande.moveTo((pts[0][0] - x0) * k + SUPER, (pts[0][1] - y0) * k + SUPER);
    for (let i = 1; i < pts.length; i++) grande.lineTo((pts[i][0] - x0) * k + SUPER, (pts[i][1] - y0) * k + SUPER);
    grande.closePath();
    const s = pg.css(cor);
    if (cor.length > 3 && cor[3] < 255) {
      // no pygame, desenhar com alfa numa superfície transparente SUBSTITUI
      // o que está embaixo (não mistura): recorta, limpa e pinta
      grande.save();
      grande.clip();
      grande.clearRect(0, 0, w * SUPER, h * SUPER);
      grande.fillStyle = s;
      grande.fillRect(0, 0, w * SUPER, h * SUPER);
      grande.restore();
    } else {
      grande.fillStyle = s;
      grande.fill();
      grande.strokeStyle = s;   // fecha as frestas entre faces vizinhas
      grande.stroke();
    }
  }
  const img = pg.superficie(w, h);
  img.imageSmoothingEnabled = true;
  img.imageSmoothingQuality = 'high';
  img.drawImage(grande.canvas, 0, 0, w * SUPER, h * SUPER, 0, 0, w, h);
  grande.canvas.width = 1;   // libera a memória do quadro grande
  grande.canvas.height = 1;
  return [img.canvas, x0, y0];
}

