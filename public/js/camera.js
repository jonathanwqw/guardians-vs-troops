// camera.js — o que da cena aparece na tela: posição, zoom em degraus e
// conversões tela <-> cena <-> mundo. (clone de jogo/camera.py)
// O zoom anda em níveis fixos porque o terreno e os sprites são
// pré-desenhados para cada nível (é isso que mantém tudo nítido).
import * as C from './config.js';
import * as iso from './iso.js';

export class Camera {
  constructor() {
    this.x = 0.0; this.y = 1000.0;   // começa olhando para a SUA base (px de cena, zoom 1)
    this.zoom = 1.0;
    this.niveis = [1.0];
    this.vw = 1; this.vh = 1;
  }

  ajustar(vw, vh, primeira = false) {
    // chame quando a janela muda de tamanho
    this.vw = vw; this.vh = vh;
    // ZOOM FIXO: uma distância só, calculada pelo tamanho da tela (mostra sempre
    // a mesma porção do mapa em qualquer aparelho). Trocar de zoom obrigava a
    // redesenhar o terreno e todos os sprites, e era isso que travava.
    const zmin = Math.max(vw / (2 * C.LX), vh / (2 * C.LY));   // a cena sempre cobre a tela
    const zmax = Math.sqrt(C.MAX_PIXELS_TERRENO / (4 * C.LX * C.LY));
    let z = Math.max(zmin, Math.min(vw / C.ZOOM_LARGURA, vh / C.ZOOM_ALTURA, zmax));
    z = Math.round(z * 100) / 100;   // valor estável (não muda por 1 px de diferença)
    this.niveis = [z];
    this.zoom = z;
    this.prender();
  }

  prender() {
    const mx = Math.max(0.0, C.LX - this.vw / 2 / this.zoom);
    const my = Math.max(0.0, C.LY - this.vh / 2 / this.zoom);
    this.x = iso.limitar(this.x, -mx, mx);
    this.y = iso.limitar(this.y, -my, my);
  }

  mover(dx_tela, dy_tela) {
    this.x -= dx_tela / this.zoom;
    this.y -= dy_tela / this.zoom;
    this.prender();
  }

  passo_zoom(delta, sx = null, sy = null) {
    // (zoom fixo: só existe um nível, então nunca muda)
    const i = this.niveis.indexOf(this.zoom) + delta;
    if (i < 0 || i >= this.niveis.length) return false;
    sx = sx === null ? this.vw / 2 : sx;
    sy = sy === null ? this.vh / 2 : sy;
    const [cx, cy] = this.cena(sx, sy);
    this.zoom = this.niveis[i];
    this.x = cx - (sx - this.vw / 2) / this.zoom;
    this.y = cy - (sy - this.vh / 2) / this.zoom;
    this.prender();
    return true;
  }

  cena(sx, sy) {
    // tela -> px de cena
    return [this.x + (sx - this.vw / 2) / this.zoom, this.y + (sy - this.vh / 2) / this.zoom];
  }

  mundo(sx, sy) {
    // tela -> ponto do mundo no chão
    const [cx, cy] = this.cena(sx, sy);
    return iso.para_mundo(cx, cy);
  }

  posicao_som(x, y) {
    // mundo -> [esquerda/direita -1..1, volume 0..1] para o som.js
    const dx = (iso.sx(x, y) - this.x) * this.zoom / (this.vw / 2);
    const dy = (iso.sy(x, y) - this.y) * this.zoom / (this.vh / 2);
    const vol = iso.limitar(1.15 - Math.sqrt(dx * dx + dy * dy) * 0.42, 0.1, 1.0) * iso.limitar(this.zoom, 0.6, 1.2);
    return [iso.limitar(dx * 0.8, -1.0, 1.0), vol];
  }
}
