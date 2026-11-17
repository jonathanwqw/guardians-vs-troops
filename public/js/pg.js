// pg.js — a pequena camada que faz o <canvas> se comportar como o pygame.
// O jogo original desenha tudo com pygame.draw / pygame.font / Surface.blit;
// aqui ficam os equivalentes, com as mesmas regras (borda do retângulo para
// dentro, fonte padrão do pygame = FreeSansBold a 68,75% do tamanho pedido,
// negrito "engordado" para a direita, etc.). Também cuida da janela, dos
// eventos (mouse, toque, pinça, roda, voltar) e do relógio.

// ---------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------
const _css = new Map();
// CACHE SEM ENGASGO: quando um cache passa do limite, em vez de apagar tudo
// (e redesenhar centenas de textos no mesmo quadro) tira só o quarto mais velho
export function podar(mapa, limite) {
  const alvo = Math.floor(limite * 0.75);
  for (const k of mapa.keys()) { if (mapa.size <= alvo) break; mapa.delete(k); }
}

export function css(c) {
  // [r, g, b] ou [r, g, b, a] (a de 0 a 255, como no pygame)
  const a = c.length > 3 ? c[3] : 255;
  const k = (c[0] * 65536 + c[1] * 256 + c[2]) * 256 + a;
  let s = _css.get(k);
  if (s === undefined) {
    s = a >= 255 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a / 255})`;
    if (_css.size > 4000) _css.clear();
    _css.set(k, s);
  }
  return s;
}

// ---------------------------------------------------------------------
// Superfícies
// ---------------------------------------------------------------------
export function superficie(w, h) {
  // devolve o CONTEXTO 2D; a imagem em si é ctx.canvas
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.trunc(w));
  c.height = Math.max(1, Math.trunc(h));
  return c.getContext('2d');
}

export function blit(ctx, img, x, y, alfa = 255) {
  if (alfa < 255) {
    if (alfa <= 0) return;
    ctx.globalAlpha = alfa / 255;
    ctx.drawImage(img, Math.trunc(x), Math.trunc(y));
    ctx.globalAlpha = 1;
  } else {
    ctx.drawImage(img, Math.trunc(x), Math.trunc(y));
  }
}

// ---------------------------------------------------------------------
// pygame.draw
// ---------------------------------------------------------------------
function _caminho(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

export function poligono(ctx, cor, pts, larg = 0) {
  if (pts.length < 3) return;
  _caminho(ctx, pts);
  if (larg > 0) {
    ctx.strokeStyle = css(cor);
    ctx.lineWidth = larg;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  } else {
    ctx.fillStyle = css(cor);
    ctx.fill();
  }
}

function _caminho_ret(ctx, x, y, w, h, raio) {
  ctx.beginPath();
  if (raio > 0) {
    const r = Math.min(raio, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  } else {
    ctx.rect(x, y, w, h);
  }
}

export function ret(ctx, cor, r, larg = 0, raio = 0) {
  // pygame.draw.rect(surf, cor, r, larg, raio): com larg > 0 a borda fica
  // do lado de DENTRO do retângulo
  const x = Math.trunc(r[0]), y = Math.trunc(r[1]), w = Math.trunc(r[2]), h = Math.trunc(r[3]);
  if (w <= 0 || h <= 0) return;
  larg = Math.trunc(larg);
  raio = Math.trunc(raio);
  if (larg > 0) {
    if (larg * 2 >= w || larg * 2 >= h) {   // borda mais grossa que a peça: preenche
      _caminho_ret(ctx, x, y, w, h, raio);
      ctx.fillStyle = css(cor);
      ctx.fill();
      return;
    }
    const m = larg / 2;
    _caminho_ret(ctx, x + m, y + m, w - larg, h - larg, Math.max(0, raio - m));
    ctx.strokeStyle = css(cor);
    ctx.lineWidth = larg;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  } else {
    _caminho_ret(ctx, x, y, w, h, raio);
    ctx.fillStyle = css(cor);
    ctx.fill();
  }
}

export function circulo(ctx, cor, cx, cy, r) {
  // pygame.draw.circle com centro e raio inteiros
  r = Math.trunc(r);
  if (r < 1) return;
  ctx.beginPath();
  ctx.arc(Math.trunc(cx), Math.trunc(cy), r, 0, 6.283185307179586);
  ctx.fillStyle = css(cor);
  ctx.fill();
}

export function linha(ctx, cor, a, b, larg = 1) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.strokeStyle = css(cor);
  ctx.lineWidth = Math.max(1, Math.trunc(larg));
  ctx.lineCap = 'butt';
  ctx.stroke();
}

export function linhas(ctx, cor, fechado, pts, larg = 1) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (fechado) ctx.closePath();
  ctx.strokeStyle = css(cor);
  ctx.lineWidth = Math.max(1, Math.trunc(larg));
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export function elipse(ctx, cor, r, larg = 0) {
  // pygame.draw.ellipse(surf, cor, r, larg): borda para dentro
  const x = Math.trunc(r[0]), y = Math.trunc(r[1]), w = Math.trunc(r[2]), h = Math.trunc(r[3]);
  if (w <= 0 || h <= 0) return;
  larg = Math.trunc(larg);
  ctx.beginPath();
  if (larg > 0 && larg * 2 < w && larg * 2 < h) {
    ctx.ellipse(x + w / 2, y + h / 2, (w - larg) / 2, (h - larg) / 2, 0, 0, 6.283185307179586);
    ctx.strokeStyle = css(cor);
    ctx.lineWidth = larg;
    ctx.stroke();
  } else {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 6.283185307179586);
    ctx.fillStyle = css(cor);
    ctx.fill();
  }
}

export function arco(ctx, cor, r, a0, a1, larg = 1) {
  // pygame.draw.arc: ângulos em radianos, sentido anti-horário, y para cima
  const x = Math.trunc(r[0]), y = Math.trunc(r[1]), w = Math.trunc(r[2]), h = Math.trunc(r[3]);
  larg = Math.max(1, Math.trunc(larg));
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, Math.max(0.5, (w - larg) / 2), Math.max(0.5, (h - larg) / 2), 0, -a0, -a1, true);
  ctx.strokeStyle = css(cor);
  ctx.lineWidth = larg;
  ctx.lineCap = 'butt';
  ctx.stroke();
}

// ---------------------------------------------------------------------
// pygame.font.Font(None, tam)
// ---------------------------------------------------------------------
// A fonte padrão do pygame é a FreeSansBold, aberta a 68,75% do tamanho
// pedido. set_bold(True) nela "engorda" cada letra para a direita em
// (tamanho // 10) pixels e aumenta o avanço na mesma medida (SDL_ttf).
export const FAMILIA = 'FonteJogo';
let _pilha = `${FAMILIA}, FreeSans, "Liberation Sans", Arial, Helvetica, sans-serif`;
let _peso = '';   // a FreeSansBold já é negrito; sem a fonte, pede negrito ao sistema

export async function carregar_fonte(url) {
  try {
    const face = new FontFace(FAMILIA, `url(${url})`);
    await face.load();
    document.fonts.add(face);
  } catch (e) {
    console.warn('Fonte do jogo não carregou, usando a do sistema:', e);
    _peso = 'bold ';
  }
}

const _medidor = (typeof document !== 'undefined') ? document.createElement('canvas').getContext('2d') : null;
const _TEM_ESPACO = _medidor ? ('letterSpacing' in _medidor) : false;

export class Fonte {
  constructor(tam, negrito = true) {
    this.tam = Math.max(1, Math.trunc(tam));
    this.em = Math.max(1, Math.trunc(this.tam * 0.6875));
    this.negrito = negrito;
    this.gordura = negrito ? Math.trunc(this.em / 10) : 0;
    this.css = `${_peso}${this.em}px ${_pilha}`;
    this.sobe = Math.ceil(this.em * 0.8);                 // linha de base
    this.altura = this.sobe + Math.ceil(this.em * 0.2) + 1;
    this._larg = new Map();
    this._imgs = new Map();
  }

  _preparar(ctx) {
    ctx.font = this.css;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    if (_TEM_ESPACO) ctx.letterSpacing = this.gordura + 'px';
  }

  largura(txt) {
    let w = this._larg.get(txt);
    if (w === undefined) {
      this._preparar(_medidor);
      w = _medidor.measureText(txt).width;
      if (!_TEM_ESPACO) w += this.gordura * txt.length;
      w = Math.ceil(w);
      if (this._larg.size > 600) this._larg.clear();
      this._larg.set(txt, w);
    }
    return w;
  }

  size(txt) { return [this.largura(txt), this.altura]; }

  _escrever(ctx, txt, x, y) {
    // escreve com a linha de base em y, "engordando" para a direita
    if (_TEM_ESPACO || !this.gordura) {
      for (let k = 0; k <= this.gordura; k++) ctx.fillText(txt, x + k, y);
    } else {
      let px = x;
      for (const ch of txt) {
        for (let k = 0; k <= this.gordura; k++) ctx.fillText(ch, px + k, y);
        px += ctx.measureText(ch).width + this.gordura;
      }
    }
  }

  render(txt, cor) {
    // como font.render(txt, True, cor): devolve uma imagem (canvas)
    const chave = css(cor) + '\u0001' + txt;
    let img = this._imgs.get(chave);
    if (img === undefined) {
      const ctx = superficie(this.largura(txt) + 1, this.altura);
      this._preparar(ctx);
      ctx.fillStyle = css(cor);
      this._escrever(ctx, txt, 0, this.sobe);
      img = ctx.canvas;
      if (this._imgs.size > 300) podar(this._imgs, 300);   // tira só os mais velhos
      this._imgs.set(chave, img);
    }
    return img;
  }
}

// texto com contorno (o mesmo algoritmo do Cena.texto / App.texto_grosso):
// carimba o texto escuro em volta e o texto da cor por cima
export function texto_contorno(fonte, txt, cor, cor_contorno, contorno, passo = 1, sombra = 0) {
  const frente = fonte.render(txt, cor);
  const tras = fonte.render(txt, cor_contorno);
  const c = contorno;
  const ctx = superficie(frente.width + 2 * c, frente.height + 2 * c + sombra);
  for (let dx = -c; dx <= c; dx += passo) {
    for (let dy = -c; dy <= c; dy += passo) {
      if (dx * dx + dy * dy <= c * c + 1) {
        if (sombra) ctx.drawImage(tras, c + dx, c + dy + sombra);
        ctx.drawImage(tras, c + dx, c + dy);
      }
    }
  }
  ctx.drawImage(frente, c, c);
  return ctx.canvas;
}

// ---------------------------------------------------------------------
// Janela, eventos e relógio
// ---------------------------------------------------------------------
export class Janela {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.fila = [];
    this.mouse = [0, 0];
    this._ultimo = performance.now();
    this._fps = 60;
    this._apertado = false;
    // celular/tablet: o jogo é SEMPRE horizontal. Se o navegador não travar a
    // tela deitada e o aparelho estiver em pé, o palco gira 90° (ver ajustar)
    this.palco = canvas.parentElement && canvas.parentElement.id === 'palco' ? canvas.parentElement : null;
    const mm = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
    this.movel = mm('(pointer: coarse)') || ((navigator.maxTouchPoints || 0) > 1 && !mm('(pointer: fine)'));
    this.girado = false;
    // RESOLUÇÃO INTERNA (gerente de qualidade): fração dos pixels reais do
    // aparelho. 1 = todos. Começa com o que deu certo na última partida neste aparelho
    this.escala_render = 1;
    try { const v = parseFloat(localStorage.getItem('gvt_resolucao')); if (v >= 0.5 && v <= 1) this.escala_render = v; } catch (_) { /* sem armazenamento */ }
    this.ajustar();
    const empurra = (ev) => this.fila.push(ev);

    window.addEventListener('resize', () => { this.ajustar(); empurra({ type: 'VIDEORESIZE' }); });
    window.addEventListener('orientationchange', () => { this.ajustar(); empurra({ type: 'VIDEORESIZE' }); });

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const pos = this._pos(e);
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ok */ }
      if (e.pointerType === 'touch') empurra({ type: 'FINGERDOWN', finger_id: e.pointerId, x: pos[0] / canvas.width, y: pos[1] / canvas.height });
      if (e.isPrimary && (e.button === 0 || e.pointerType !== 'mouse')) {
        this.mouse = pos;
        this._apertado = true;
        empurra({ type: 'MOUSEBUTTONDOWN', button: 1, pos });
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const pos = this._pos(e);
      if (e.pointerType === 'touch') empurra({ type: 'FINGERMOTION', finger_id: e.pointerId, x: pos[0] / canvas.width, y: pos[1] / canvas.height });
      if (e.isPrimary) {
        const rel = [pos[0] - this.mouse[0], pos[1] - this.mouse[1]];
        this.mouse = pos;
        empurra({ type: 'MOUSEMOTION', pos, rel });
      }
    });
    const solta = (e) => {
      const pos = this._pos(e);
      if (e.pointerType === 'touch') empurra({ type: 'FINGERUP', finger_id: e.pointerId, x: pos[0] / canvas.width, y: pos[1] / canvas.height });
      if (e.isPrimary && this._apertado) {
        this._apertado = false;
        this.mouse = pos;
        empurra({ type: 'MOUSEBUTTONUP', button: 1, pos });
      }
    };
    canvas.addEventListener('pointerup', solta);
    canvas.addEventListener('pointercancel', solta);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.mouse = this._pos(e);
      if (e.deltaY !== 0) empurra({ type: 'MOUSEWHEEL', y: e.deltaY < 0 ? 1 : -1 });
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      const alvo = e.target && e.target.tagName;
      if (e.key === 'Escape') { empurra({ type: 'KEYDOWN', key: 'escape' }); return; }
      if (alvo === 'INPUT') return;
      empurra({ type: 'KEYDOWN', key: e.key });
    });
    // botão "voltar" do Android (K_AC_BACK no pygame): vira ESC
    try {
      history.pushState({ jogo: 1 }, '');
      window.addEventListener('popstate', () => {
        empurra({ type: 'KEYDOWN', key: 'escape' });
        history.pushState({ jogo: 1 }, '');
      });
    } catch (_) { /* sem histórico: só não tem o voltar */ }
  }

  _pos(e) {
    if (this.girado) {
      // palco girado 90° no sentido horário: x do jogo = y da tela; y do jogo = (largura - x) da tela
      const W = window.innerWidth, H = window.innerHeight;
      return [e.clientY * this.canvas.width / (H || 1), (W - e.clientX) * this.canvas.height / (W || 1)];
    }
    const r = this.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * this.canvas.width / (r.width || 1), (e.clientY - r.top) * this.canvas.height / (r.height || 1)];
  }

  _girar() {
    // aparelho em pé (e sem trava de orientação): gira o palco para ficar deitado
    const W = window.innerWidth, H = window.innerHeight;
    const girar = this.movel && H > W;
    this.girado = girar;
    if (!this.palco) return;
    const s = this.palco.style;
    if (girar) {
      s.width = H + 'px'; s.height = W + 'px';
      s.transform = `translateX(${W}px) rotate(90deg)`;
    } else {
      s.width = '100%'; s.height = '100%';
      s.transform = 'none';
    }
  }

  ajustar() {
    // a tela do jogo tem os pixels DE VERDADE do aparelho (como a tela cheia do pygame)
    this._girar();
    const dpr_real = window.devicePixelRatio || 1;
    // nunca menos de 1 pixel por pixel da página (abaixo disso fica borrado demais)
    const dpr = Math.max(Math.min(1, dpr_real), dpr_real * (this.escala_render || 1));
    const lw = this.girado ? window.innerHeight : window.innerWidth;
    const lh = this.girado ? window.innerWidth : window.innerHeight;
    const w = Math.max(160, Math.round(lw * dpr));
    const h = Math.max(160, Math.round(lh * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
  }

  get_width() { return this.canvas.width; }
  get_height() { return this.canvas.height; }

  eventos() {
    const e = this.fila;
    this.fila = [];
    return e;
  }

  tick() {
    // espera o próximo quadro; devolve os milissegundos desde o anterior.
    // Em telas de 120 Hz ou mais pula quadros (o original roda a 60 por segundo).
    return new Promise((resolve) => {
      const quadro = () => {
        const agora = performance.now();
        const ms = agora - this._ultimo;
        if (ms < 10) { requestAnimationFrame(quadro); return; }
        this._ultimo = agora;
        this._fps += (1000 / ms - this._fps) * 0.1;
        resolve(ms);
      };
      requestAnimationFrame(quadro);
    });
  }

  get_fps() { return this._fps; }
}

// ---------------------------------------------------------------------
// Versões "sem lixo" para o desenho de cada quadro: recebem números soltos
// (ou um buffer reaproveitado) em vez de listas novas. Fazem exatamente as
// mesmas chamadas no canvas que linha/poligono/ret/css acima, então o desenho
// sai idêntico; só não criam objetos que o coletor de lixo depois recolhe.
// ---------------------------------------------------------------------
export function css4(r, g, b, a = 255) {
  const k = (r * 65536 + g * 256 + b) * 256 + a;
  let s = _css.get(k);
  if (s === undefined) {
    s = a >= 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a / 255})`;
    if (_css.size > 4000) _css.clear();
    _css.set(k, s);
  }
  return s;
}

export function linha_xy(ctx, cor, ax, ay, bx, by, larg = 1) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.strokeStyle = typeof cor === 'string' ? cor : css(cor);
  ctx.lineWidth = Math.max(1, Math.trunc(larg));
  ctx.lineCap = 'butt';
  ctx.stroke();
}

export function poligono_buf(ctx, cor, buf, n) {
  // polígono preenchido com os n pontos de buf = [x0, y0, x1, y1, ...]
  if (n < 3) return;
  ctx.beginPath();
  ctx.moveTo(buf[0], buf[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(buf[2 * i], buf[2 * i + 1]);
  ctx.closePath();
  ctx.fillStyle = typeof cor === 'string' ? cor : css(cor);
  ctx.fill();
}

export function ret_xywh(ctx, cor, x, y, w, h) {
  // = ret(ctx, cor, [x, y, w, h]) (preenchido, sem borda nem canto)
  x = Math.trunc(x); y = Math.trunc(y); w = Math.trunc(w); h = Math.trunc(h);
  if (w <= 0 || h <= 0) return;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fillStyle = typeof cor === 'string' ? cor : css(cor);
  ctx.fill();
}
