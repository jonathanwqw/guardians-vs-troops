// icones.js — ícones desenhados em código, usados em vários lugares.

export function parafuso(ctx, cx, cy, s, apagado = false) {
  // PARAFUSO de cabeça sextavada, inclinado: corpo com rosca + cabeça hexagonal
  // (s = meio tamanho do ícone, em px)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.72);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const contorno = '#1f2937';
  const aco = apagado ? ['#c9ced8', '#9aa3b0', '#7a8392'] : ['#eef2f7', '#b4bfcc', '#7f8b9c'];
  // corpo (haste) com rosca
  const hw = s * 0.26, y0 = -s * 0.15, y1 = s * 1.05;
  ctx.fillStyle = contorno;
  ctx.beginPath(); ctx.rect(-hw - s * 0.07, y0, 2 * hw + s * 0.14, y1 - y0 + s * 0.05); ctx.fill();
  const g = ctx.createLinearGradient(-hw, 0, hw, 0);
  g.addColorStop(0, aco[1]); g.addColorStop(0.45, aco[0]); g.addColorStop(1, aco[2]);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.rect(-hw, y0, 2 * hw, y1 - y0); ctx.fill();
  ctx.strokeStyle = contorno; ctx.lineWidth = Math.max(1, s * 0.07);
  for (let y = y0 + s * 0.16; y < y1 - s * 0.02; y += s * 0.17) {   // filetes da rosca (inclinados)
    ctx.beginPath(); ctx.moveTo(-hw, y + s * 0.05); ctx.lineTo(hw, y - s * 0.05); ctx.stroke();
  }
  // ponta
  ctx.fillStyle = aco[2];
  ctx.beginPath(); ctx.moveTo(-hw, y1); ctx.lineTo(hw, y1); ctx.lineTo(0, y1 + s * 0.2); ctx.closePath(); ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.1); ctx.stroke();
  // cabeça SEXTAVADA (vista meio de cima: hexágono + espessura)
  const R = s * 0.62, hy = -s * 0.42, esp = s * 0.2;
  const hex = (dy) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; ctx.lineTo(Math.cos(a) * R, hy + dy + Math.sin(a) * R * 0.55); } ctx.closePath(); };
  hex(esp); ctx.fillStyle = contorno; ctx.fill();
  ctx.fillStyle = aco[2];   // lado (espessura)
  ctx.beginPath();
  for (const i of [0, 1, 2, 3]) { const a = Math.PI / 6 + i * Math.PI / 3; ctx.lineTo(Math.cos(a) * R, hy + esp + Math.sin(a) * R * 0.55); }
  for (const i of [3, 2, 1, 0]) { const a = Math.PI / 6 + i * Math.PI / 3; ctx.lineTo(Math.cos(a) * R, hy + Math.sin(a) * R * 0.55); }
  ctx.closePath(); ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.09); ctx.strokeStyle = contorno; ctx.stroke();
  const gt = ctx.createLinearGradient(-R, hy - R * 0.5, R, hy + R * 0.5);
  gt.addColorStop(0, aco[0]); gt.addColorStop(1, aco[1]);
  hex(0); ctx.fillStyle = gt; ctx.fill(); ctx.stroke();
  // arestas do hexágono e o círculo da face
  ctx.strokeStyle = 'rgba(31,41,55,0.35)'; ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath(); ctx.ellipse(0, hy, R * 0.55, R * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(-R * 0.3, hy - R * 0.15, R * 0.22, R * 0.09, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ---------- fase 4/5: MATERIAIS DA REFINARIA ---------------------------------
// item(ctx, k, cx, cy, s): desenho do material k ('balas', 'polvora', 'bombas',
// 'bolas', 'foguetes', 'pecas') com contorno escuro e luz de cima/esquerda,
// no estilo do parafuso. s = meio tamanho do ícone, em px.
const _CONT = '#1f2937';
function _grad(ctx, x0, y0, x1, y1, cores) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  cores.forEach((c, i) => g.addColorStop(i / (cores.length - 1), c));
  return g;
}
function _rad(ctx, x, y, r, cores) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  cores.forEach((c, i) => g.addColorStop(i / (cores.length - 1), c));
  return g;
}
function _faisca(ctx, x, y, r) {
  ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#e8590c'; ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function _balas(ctx, s) {
  // três cartuchos de pé: estojo de latão + projétil de cobre
  for (const [dx, dy, k] of [[-0.48, 0.12, 0.92], [0.48, 0.12, 0.92], [0, -0.02, 1]]) {
    const x = dx * s, w = 0.32 * s * k, yb = 0.86 * s + dy * s, yc = -0.05 * s + dy * s, yt = -0.82 * s * k + dy * s;
    ctx.lineWidth = Math.max(1, s * 0.09); ctx.strokeStyle = _CONT;
    // projétil
    ctx.fillStyle = _grad(ctx, x - w, 0, x + w, 0, ['#f2a76b', '#c4642b', '#8f4419']);
    ctx.beginPath(); ctx.moveTo(x - w * 0.86, yc); ctx.quadraticCurveTo(x - w * 0.9, yt + w * 0.6, x, yt); ctx.quadraticCurveTo(x + w * 0.9, yt + w * 0.6, x + w * 0.86, yc); ctx.closePath(); ctx.fill(); ctx.stroke();
    // estojo
    ctx.fillStyle = _grad(ctx, x - w, 0, x + w, 0, ['#ffe9a3', '#e0b24a', '#a87a1c']);
    ctx.beginPath(); ctx.rect(x - w, yc, 2 * w, yb - yc); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - w, yb - s * 0.14); ctx.lineTo(x + w, yb - s * 0.14); ctx.stroke();   // aro
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.beginPath(); ctx.moveTo(x - w * 0.45, yc + s * 0.12); ctx.lineTo(x - w * 0.45, yb - s * 0.24); ctx.stroke();   // brilho
  }
}

function _polvora(ctx, s) {
  // barril de madeira com cintas de ferro, pólvora preta derramando e o pavio
  ctx.lineWidth = Math.max(1, s * 0.09); ctx.strokeStyle = _CONT;
  const w = 0.62 * s, top = -0.6 * s, bot = 0.82 * s;
  ctx.fillStyle = _grad(ctx, -w, 0, w, 0, ['#8a5a2b', '#c58a4e', '#9c6532', '#6b4220']);
  ctx.beginPath();
  ctx.moveTo(-w * 0.86, top); ctx.quadraticCurveTo(-w * 1.12, (top + bot) / 2, -w * 0.86, bot);
  ctx.lineTo(w * 0.86, bot); ctx.quadraticCurveTo(w * 1.12, (top + bot) / 2, w * 0.86, top); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // tábuas
  ctx.strokeStyle = 'rgba(60,36,16,0.55)'; ctx.lineWidth = Math.max(1, s * 0.05);
  for (const k of [-0.42, 0, 0.42]) { ctx.beginPath(); ctx.moveTo(k * w, top + s * 0.05); ctx.quadraticCurveTo(k * w * 1.15, (top + bot) / 2, k * w, bot - s * 0.03); ctx.stroke(); }
  // cintas
  ctx.strokeStyle = '#3d4452'; ctx.lineWidth = Math.max(1.5, s * 0.13);
  for (const y of [top + s * 0.28, bot - s * 0.28]) { ctx.beginPath(); ctx.moveTo(-w * 1.0, y); ctx.lineTo(w * 1.0, y); ctx.stroke(); }
  // tampa aberta com pólvora
  ctx.fillStyle = '#2b2f38'; ctx.strokeStyle = _CONT; ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.beginPath(); ctx.ellipse(0, top, w * 0.86, s * 0.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#4a505c';
  ctx.beginPath(); ctx.moveTo(-w * 0.6, top); ctx.quadraticCurveTo(0, top - s * 0.34, w * 0.6, top); ctx.closePath(); ctx.fill();
  // pavio + faísca
  ctx.strokeStyle = '#c9b48a'; ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.beginPath(); ctx.moveTo(w * 0.2, top - s * 0.12); ctx.quadraticCurveTo(w * 0.7, top - s * 0.5, w * 1.05, top - s * 0.38); ctx.stroke();
  _faisca(ctx, w * 1.1, top - s * 0.4, s * 0.26);
}

function _bombas(ctx, s) {
  // bomba redonda preta com tampa de metal, pavio e faísca
  const r = 0.66 * s, y = 0.18 * s;
  ctx.lineWidth = Math.max(1, s * 0.09); ctx.strokeStyle = _CONT;
  ctx.fillStyle = _rad(ctx, -0.04 * s, y, r, ['#6b7484', '#363c48', '#14171d']);
  ctx.beginPath(); ctx.arc(0, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(-r * 0.38, y - r * 0.42, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2); ctx.fill();
  // tampa
  ctx.fillStyle = _grad(ctx, -s * 0.2, 0, s * 0.2, 0, ['#9aa3b0', '#d5dbe3', '#7f8b9c']);
  ctx.save(); ctx.translate(r * 0.42, y - r * 0.78); ctx.rotate(0.6);
  ctx.beginPath(); ctx.rect(-s * 0.17, -s * 0.12, s * 0.34, s * 0.22); ctx.fill(); ctx.stroke();
  ctx.restore();
  // pavio
  ctx.strokeStyle = '#c9b48a'; ctx.lineWidth = Math.max(1, s * 0.09);
  ctx.beginPath(); ctx.moveTo(r * 0.55, y - r * 0.95); ctx.quadraticCurveTo(r * 0.6, -s * 0.95, r * 1.0, -s * 0.85); ctx.stroke();
  _faisca(ctx, r * 1.05, -s * 0.86, s * 0.27);
}

function _bolas(ctx, s) {
  // pirâmide de bolas de canhão (2 embaixo, 1 em cima)
  const r = 0.4 * s;
  ctx.lineWidth = Math.max(1, s * 0.08); ctx.strokeStyle = _CONT;
  for (const [x, y] of [[-0.42 * s, 0.46 * s], [0.42 * s, 0.46 * s], [0, -0.22 * s]]) {
    ctx.fillStyle = _rad(ctx, x, y, r, ['#c6ccd6', '#6d7686', '#2f3540']);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.38, r * 0.2, r * 0.12, -0.6, 0, Math.PI * 2); ctx.fill();
  }
}

function _foguetes(ctx, s) {
  // foguete inclinado: corpo vermelho, ogiva clara, aletas e chama
  ctx.save(); ctx.rotate(0.62);
  ctx.lineWidth = Math.max(1, s * 0.08); ctx.strokeStyle = _CONT;
  const w = 0.24 * s, y0 = -0.95 * s, y1 = 0.62 * s;
  // chama
  ctx.fillStyle = '#ffb02e';
  ctx.beginPath(); ctx.moveTo(-w * 0.8, y1); ctx.quadraticCurveTo(0, y1 + s * 0.75, w * 0.8, y1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff1a8';
  ctx.beginPath(); ctx.moveTo(-w * 0.4, y1); ctx.quadraticCurveTo(0, y1 + s * 0.42, w * 0.4, y1); ctx.closePath(); ctx.fill();
  // aletas
  ctx.fillStyle = '#9b2c1f';
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * w, y1 - s * 0.42); ctx.lineTo(sx * w * 2.3, y1 + s * 0.06); ctx.lineTo(sx * w, y1); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  // corpo
  ctx.fillStyle = _grad(ctx, -w, 0, w, 0, ['#f0705a', '#e2533a', '#a93524']);
  ctx.beginPath(); ctx.rect(-w, y0 + s * 0.42, 2 * w, y1 - y0 - s * 0.42); ctx.fill(); ctx.stroke();
  // ogiva
  ctx.fillStyle = _grad(ctx, -w, 0, w, 0, ['#ffffff', '#dfe4ec', '#a9b1c0']);
  ctx.beginPath(); ctx.moveTo(-w, y0 + s * 0.42); ctx.quadraticCurveTo(-w, y0 + s * 0.05, 0, y0); ctx.quadraticCurveTo(w, y0 + s * 0.05, w, y0 + s * 0.42); ctx.closePath(); ctx.fill(); ctx.stroke();
  // faixa e janelinha
  ctx.fillStyle = '#f3ece8'; ctx.beginPath(); ctx.rect(-w, y1 - s * 0.32, 2 * w, s * 0.1); ctx.fill();
  ctx.fillStyle = '#7fb3e6'; ctx.beginPath(); ctx.arc(0, y0 + s * 0.68, w * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function _pecas(ctx, s) {
  // engrenagem de aço com uma chave inglesa cruzada
  ctx.lineWidth = Math.max(1, s * 0.08); ctx.strokeStyle = _CONT;
  const R = 0.62 * s, Ri = 0.47 * s, n = 8, gx = -0.12 * s, gy = 0.08 * s;
  ctx.fillStyle = _rad(ctx, gx, gy, R, ['#dbe7f6', '#6f97c9', '#36557f']);
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a0 = i * Math.PI / n, r = i % 2 ? Ri : R;
    ctx.lineTo(gx + Math.cos(a0 - 0.13) * r, gy + Math.sin(a0 - 0.13) * r);
    ctx.lineTo(gx + Math.cos(a0 + 0.13) * r, gy + Math.sin(a0 + 0.13) * r);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2b2f38';
  ctx.beginPath(); ctx.arc(gx, gy, R * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // chave inglesa
  ctx.save(); ctx.translate(0.2 * s, 0.05 * s); ctx.rotate(-0.8);
  ctx.fillStyle = _grad(ctx, -s * 0.12, 0, s * 0.12, 0, ['#eef2f7', '#b4bfcc', '#7f8b9c']);
  ctx.beginPath(); ctx.rect(-s * 0.1, -s * 0.55, s * 0.2, s * 1.05); ctx.fill(); ctx.stroke();
  ctx.beginPath();   // boca
  ctx.arc(0, -s * 0.66, s * 0.26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2b2f38';   // a boca aberta da chave
  ctx.beginPath(); ctx.rect(-s * 0.09, -s * 0.94, s * 0.18, s * 0.3); ctx.fill();
  ctx.restore();
}

const _DESENHO = { balas: _balas, polvora: _polvora, bombas: _bombas, bolas: _bolas, foguetes: _foguetes, pecas: _pecas };

export function item(ctx, k, cx, cy, s, apagado = false) {
  const f = _DESENHO[k];
  if (!f) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (apagado) ctx.globalAlpha *= 0.45;
  f(ctx, s);
  ctx.restore();
}

// ---------- PERFIL: 10 ÍCONES DE CONTA ----------------------------------------
// avatar(ctx, i, cx, cy, r): medalha redonda (fundo colorido, aro branco,
// contorno escuro) com um desenho do jogo dentro. i = 0..9.
export const AVATARES = ['Soldado', 'Tanque', 'Helicóptero', 'Canhão', 'Foguete', 'Granada', 'Pinheiro', 'Escudo', 'Caveira', 'Floco de neve'];
const _FUNDO_AV = [
  ['#7ddc9a', '#2fa457'], ['#9cc4f0', '#3f78c4'], ['#ffd27a', '#e09a1e'], ['#c9ced8', '#6d7686'], ['#ff9b86', '#d2452f'],
  ['#b8e07a', '#5e9a2a'], ['#d9f0ff', '#7fb3e6'], ['#f6a5c0', '#c2416e'], ['#c5b3f0', '#6b4fc2'], ['#a6ecf0', '#2aa7b8'],
];
function _soldado(c, s) {
  c.fillStyle = '#f0c9a0'; c.beginPath(); c.arc(0, s * 0.18, s * 0.42, 0, Math.PI * 2); c.fill(); c.stroke();   // rosto
  c.fillStyle = _CONT; c.beginPath(); c.arc(-s * 0.15, s * 0.16, s * 0.06, 0, Math.PI * 2); c.arc(s * 0.15, s * 0.16, s * 0.06, 0, Math.PI * 2); c.fill();
  c.strokeStyle = _CONT; c.beginPath(); c.arc(0, s * 0.3, s * 0.13, 0.2, Math.PI - 0.2); c.stroke();
  c.fillStyle = _grad(c, -s * 0.6, 0, s * 0.6, 0, ['#5fbf7a', '#2f8a4d', '#1f6a3a']);   // capacete
  c.beginPath(); c.moveTo(-s * 0.62, s * 0.02); c.quadraticCurveTo(-s * 0.6, -s * 0.62, 0, -s * 0.64); c.quadraticCurveTo(s * 0.6, -s * 0.62, s * 0.62, s * 0.02); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#1f6a3a'; c.beginPath(); c.rect(-s * 0.7, -s * 0.04, s * 1.4, s * 0.12); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(-s * 0.22, -s * 0.38, s * 0.16, s * 0.08, -0.4, 0, Math.PI * 2); c.fill();
}
function _tanque(c, s) {
  c.fillStyle = '#2b2f38'; c.beginPath(); c.roundRect(-s * 0.72, s * 0.12, s * 1.44, s * 0.36, s * 0.18); c.fill(); c.stroke();   // esteira
  c.fillStyle = '#6b7484'; for (let i = -2; i <= 2; i++) { c.beginPath(); c.arc(i * s * 0.26, s * 0.3, s * 0.09, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = _grad(c, 0, -s * 0.2, 0, s * 0.14, ['#7fb0e8', '#3f78c4']);
  c.beginPath(); c.moveTo(-s * 0.62, s * 0.12); c.lineTo(-s * 0.5, -s * 0.12); c.lineTo(s * 0.55, -s * 0.12); c.lineTo(s * 0.66, s * 0.12); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#4d86d0'; c.beginPath(); c.roundRect(-s * 0.32, -s * 0.42, s * 0.6, s * 0.32, s * 0.12); c.fill(); c.stroke();   // torre
  c.fillStyle = '#3f78c4'; c.beginPath(); c.rect(s * 0.26, -s * 0.33, s * 0.5, s * 0.12); c.fill(); c.stroke();   // cano
}
function _heli(c, s) {
  c.strokeStyle = _CONT; c.lineWidth = Math.max(1.5, s * 0.1);
  c.beginPath(); c.moveTo(-s * 0.75, -s * 0.42); c.lineTo(s * 0.75, -s * 0.42); c.stroke();   // hélice
  c.beginPath(); c.moveTo(0, -s * 0.42); c.lineTo(0, -s * 0.24); c.stroke();
  c.lineWidth = Math.max(1, s * 0.08);
  c.fillStyle = '#e09a1e'; c.beginPath(); c.moveTo(s * 0.1, -s * 0.02); c.lineTo(s * 0.78, -s * 0.12); c.lineTo(s * 0.78, s * 0.02); c.lineTo(s * 0.1, s * 0.12); c.closePath(); c.fill(); c.stroke();   // cauda
  c.fillStyle = _grad(c, 0, -s * 0.25, 0, s * 0.3, ['#ffd27a', '#e8a73a']);
  c.beginPath(); c.ellipse(-s * 0.12, s * 0.04, s * 0.42, s * 0.3, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = '#9fd0f5'; c.beginPath(); c.ellipse(-s * 0.3, -s * 0.02, s * 0.17, s * 0.15, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-s * 0.45, s * 0.46); c.lineTo(s * 0.2, s * 0.46); c.stroke();   // esqui
}
function _canhao(c, s) {
  c.save(); c.rotate(-0.45);
  c.fillStyle = _grad(c, 0, -s * 0.2, 0, s * 0.2, ['#8e97a6', '#4b5361']);
  c.beginPath(); c.roundRect(-s * 0.55, -s * 0.18, s * 1.25, s * 0.36, s * 0.16); c.fill(); c.stroke();
  c.fillStyle = '#2b2f38'; c.beginPath(); c.arc(s * 0.7, 0, s * 0.12, 0, Math.PI * 2); c.fill();
  c.restore();
  c.fillStyle = '#8a5a2b'; c.beginPath(); c.arc(-s * 0.1, s * 0.34, s * 0.3, 0, Math.PI * 2); c.fill(); c.stroke();   // roda
  c.strokeStyle = '#5c3a1a'; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; c.beginPath(); c.moveTo(-s * 0.1 - Math.cos(a) * s * 0.26, s * 0.34 - Math.sin(a) * s * 0.26); c.lineTo(-s * 0.1 + Math.cos(a) * s * 0.26, s * 0.34 + Math.sin(a) * s * 0.26); c.stroke(); }
  c.fillStyle = '#2b2f38'; c.beginPath(); c.arc(-s * 0.1, s * 0.34, s * 0.07, 0, Math.PI * 2); c.fill();
}
function _granada(c, s) {
  c.fillStyle = _rad(c, 0, s * 0.12, s * 0.48, ['#a8d977', '#5e9a2a', '#3c6a19']);
  c.beginPath(); c.ellipse(0, s * 0.14, s * 0.4, s * 0.5, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(31,41,55,0.55)';
  for (const y of [-0.05, 0.18, 0.4]) { c.beginPath(); c.moveTo(-s * 0.36, y * s); c.lineTo(s * 0.36, y * s); c.stroke(); }
  c.beginPath(); c.moveTo(0, -s * 0.34); c.lineTo(0, s * 0.62); c.stroke();
  c.strokeStyle = _CONT;
  c.fillStyle = '#9aa3b0'; c.beginPath(); c.rect(-s * 0.16, -s * 0.52, s * 0.32, s * 0.18); c.fill(); c.stroke();   // tampa
  c.beginPath(); c.moveTo(s * 0.16, -s * 0.44); c.quadraticCurveTo(s * 0.5, -s * 0.5, s * 0.36, -s * 0.12); c.stroke();   // alavanca
  c.beginPath(); c.arc(-s * 0.28, -s * 0.52, s * 0.12, 0, Math.PI * 2); c.stroke();   // pino
}
function _pinheiro(c, s) {
  c.fillStyle = '#6b4a2c'; c.beginPath(); c.rect(-s * 0.08, s * 0.4, s * 0.16, s * 0.24); c.fill(); c.stroke();
  for (const [y, w, h] of [[0.45, 0.62, 0.5], [0.12, 0.5, 0.46], [-0.2, 0.36, 0.44]]) {
    c.fillStyle = '#1f6f4a'; c.beginPath(); c.moveTo(-w * s, y * s); c.lineTo(0, (y - h) * s); c.lineTo(w * s, y * s); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(-w * s * 0.5, (y - h * 0.5) * s); c.lineTo(0, (y - h) * s); c.lineTo(w * s * 0.5, (y - h * 0.5) * s); c.quadraticCurveTo(0, (y - h * 0.35) * s, -w * s * 0.5, (y - h * 0.5) * s); c.fill();
  }
}
function _escudo(c, s) {
  c.fillStyle = _grad(c, -s * 0.5, 0, s * 0.5, 0, ['#ff8fb3', '#c2416e']);
  c.beginPath(); c.moveTo(0, -s * 0.62); c.lineTo(s * 0.52, -s * 0.42); c.quadraticCurveTo(s * 0.5, s * 0.3, 0, s * 0.66); c.quadraticCurveTo(-s * 0.5, s * 0.3, -s * 0.52, -s * 0.42); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#ffd34d';
  c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * 0.14 : s * 0.32; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr - s * 0.02); } c.closePath(); c.fill(); c.stroke();
}
function _caveira(c, s) {
  c.fillStyle = '#f4f1ea';
  c.beginPath(); c.arc(0, -s * 0.1, s * 0.48, Math.PI * 0.85, Math.PI * 2.15); c.lineTo(s * 0.3, s * 0.42); c.lineTo(-s * 0.3, s * 0.42); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#2b2440';
  c.beginPath(); c.ellipse(-s * 0.19, -s * 0.06, s * 0.13, s * 0.15, 0, 0, Math.PI * 2); c.ellipse(s * 0.19, -s * 0.06, s * 0.13, s * 0.15, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(0, s * 0.1); c.lineTo(-s * 0.07, s * 0.22); c.lineTo(s * 0.07, s * 0.22); c.closePath(); c.fill();
  c.strokeStyle = _CONT; for (const x of [-0.15, 0, 0.15]) { c.beginPath(); c.moveTo(x * s, s * 0.3); c.lineTo(x * s, s * 0.42); c.stroke(); }
}
function _floco(c, s) {
  c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(2, s * 0.13);
  for (let k = 0; k < 3; k++) {
    c.save(); c.rotate(k * Math.PI / 3);
    c.beginPath(); c.moveTo(0, -s * 0.62); c.lineTo(0, s * 0.62); c.stroke();
    for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(0, sg * s * 0.36); c.lineTo(-s * 0.16, sg * s * 0.52); c.moveTo(0, sg * s * 0.36); c.lineTo(s * 0.16, sg * s * 0.52); c.stroke(); }
    c.restore();
  }
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, s * 0.12, 0, Math.PI * 2); c.fill();
}
const _AV = [_soldado, _tanque, _heli, _canhao, (c, s) => _foguetes(c, s * 0.9), _granada, _pinheiro, _escudo, _caveira, _floco];

export function avatar(ctx, i, cx, cy, r, selecionado = false) {
  i = ((i | 0) % 10 + 10) % 10;
  ctx.save(); ctx.translate(cx, cy); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // sombra + contorno
  ctx.fillStyle = 'rgba(31,41,55,0.35)'; ctx.beginPath(); ctx.arc(r * 0.06, r * 0.12, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = _CONT; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2); ctx.fill();
  const [a, b] = _FUNDO_AV[i];
  ctx.fillStyle = _rad(ctx, 0, 0, r * 0.8, [a, b]);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.clip();
  ctx.strokeStyle = _CONT; ctx.lineWidth = Math.max(1, r * 0.06);
  _AV[i](ctx, r * 0.7);
  ctx.restore();
  // brilho
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.45, r * 0.32, r * 0.14, -0.5, 0, Math.PI * 2); ctx.fill();
  if (selecionado) {
    ctx.strokeStyle = '#2fa457'; ctx.lineWidth = Math.max(3, r * 0.14); ctx.beginPath(); ctx.arc(0, 0, r + r * 0.12, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#2fa457'; ctx.strokeStyle = _CONT; ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.beginPath(); ctx.arc(r * 0.72, r * 0.72, r * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath(); ctx.moveTo(r * 0.6, r * 0.72); ctx.lineTo(r * 0.69, r * 0.82); ctx.lineTo(r * 0.86, r * 0.6); ctx.stroke();
  }
  ctx.restore();
}
