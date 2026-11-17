// soldado.js — o bonequinho. Sólido simples em 3 tons do time: pernas,
// tronco (metade clara / metade escura), cabeça, capacete e fuzil.
// 4 vistas isométricas:
//     dir 0: +x  frente, virado p/ direita     dir 1: +y  frente, virado p/ esquerda
//     dir 3: -y  costas, virado p/ direita     dir 2: -x  costas, virado p/ esquerda
// Quadros de animação (pré-desenhados por zoom em criar_sprites):
//     'p'        parado
//     'a0'..'a3' andando (pernas + balanço)
//     't0', 't1' atirando (recuo + clarão chapado, depois só recuo)
//     'c0'..'c3' caindo (gira para trás e some na neve)
// (clone de jogo/soldado.py)
import * as C from './config.js';
import * as iso from './iso.js';
import * as pg from './pg.js';
import { sprite } from './raster.js';

const _SOMBRA = [96, 116, 170, 97];

export function formas(direcao, cores, { passo = 0.0, sobe = 0.0, recuo = 0.0, clarao = false, anda = false, queda = -1.0, tipo = 'pelotao' } = {}) {
  // formas do boneco com os pés em (0, 0). tipo 'granada' = lançador no lugar do fuzil
  const gran = tipo === 'granada';
  const servente = tipo === 'canhao';   // equipe do canhão: sem arma na mão, faixa clara no capacete
  const vira = direcao === 1 || direcao === 2;
  const costas = direcao === 2 || direcao === 3;
  // luz vem sempre da direita da TELA: se espelhado, troca os tons
  const lado_a = vira ? cores.claro : cores.escuro;
  const lado_b = vira ? cores.escuro : cores.claro;
  const y0 = -sobe;
  let f = [];
  if (costas && gran) {   // tubo lançador atrás do corpo, apontado para o alto
    f.push(iso.linha([0.5, -8 + y0 + recuo], [6.5, -18.5 + y0 + recuo], 3.2, cores.arma));
  } else if (costas && !servente) {   // fuzil atrás do corpo
    f.push(iso.linha([1.5 - recuo, -9 + y0], [8 - recuo, -14.5 + y0], 1.8, cores.arma));
  }
  // pernas
  f.push(iso.ret(-3 + passo * 1.3, -5 - Math.max(0, passo) * 1.2, 2.7, 5, cores.escuro));
  f.push(iso.ret(0.3 - passo * 1.3, -5 - Math.max(0, -passo) * 1.2, 2.7, 5, cores.medio));
  // tronco + cinto (+ mochila de costas)
  f.push(iso.ret(-3.6 - recuo * 0.4, -13.2 + y0, 3.8, 8.6, lado_a));
  f.push(iso.ret(0 - recuo * 0.4, -13.2 + y0, 3.6, 8.6, lado_b));
  f.push(iso.ret(-3.6 - recuo * 0.4, -7 + y0, 7.2, 1.4, cores.capacete));
  if (costas) f.push(iso.ret(-2.6 - recuo * 0.4, -12.4 + y0, 5.2, 4.6, cores.capacete));
  // cabeça + capacete
  const hx = -recuo * 0.5, hy = -15.6 + y0;
  f.push(iso.elipse(hx, hy, 2.9, 2.9, cores.medio, 14));
  f.push(iso.elipse(hx, hy - 0.5, 3.4, 3.4, cores.capacete, 10, Math.PI, 2 * Math.PI));
  f.push(iso.ret(hx - 3.9, hy - 1.0, 7.8, 1.3, cores.capacete));
  if (gran) {   // faixa amarela no capacete: dá para reconhecer de longe
    f.push(iso.ret(hx - 3.2, hy - 2.7, 6.4, 1.2, C.FAIXA_GRANADEIRO));
  }
  if (servente) {
    f.push(iso.ret(hx - 3.2, hy - 2.7, 6.4, 1.2, C.CONCRETO_CLARO.topo));
    if (!costas) {   // braço para a frente, carregando munição
      f.push(iso.ret(1.6, -11 + y0, 3.2, 2.4, lado_b));
      f.push(iso.ret(4.2, -11.6 + y0, 2.4, 3.6, C.JANELA));
    }
  } else if (gran && !costas) {   // tubo lançador na frente
    if (anda) {
      f.push(iso.linha([-3.5, -11 + y0], [6.5, -15.5 + y0], 3.2, cores.arma));                    // no ombro
    } else {
      f.push(iso.linha([-0.5, -7.5 + y0 + recuo], [6.5, -18.5 + y0 + recuo], 3.2, cores.arma));   // apontado p/ o alto
      f.push(iso.linha([5.6, -17 + y0 + recuo], [6.5, -18.5 + y0 + recuo], 4.2, C.MASTRO));       // boca do tubo
    }
    f.push(iso.ret(0.6, -11 + y0, 2.6, 2.4, lado_b));
  } else if (!costas) {   // fuzil na frente
    if (anda) {
      f.push(iso.linha([-2.5, -6.5 + y0], [5.5, -13 + y0], 1.9, cores.arma));            // no ombro
    } else {
      f.push(iso.linha([-1 - recuo, -10 + y0], [8.5 - recuo, -8.2 + y0], 1.9, cores.arma));  // apontado
    }
    f.push(iso.ret(1.6 - recuo, -10.6 + y0, 2.6, 2.4, lado_b));
  }
  if (clarao && servente) {
    // nada
  } else if (clarao && gran) {   // disparo do tubo: baforada de fumaça chapada
    f.push(iso.elipse(8.0, -21.5 + y0, 3.4, 3.0, [214, 219, 228], 10));
    f.push(iso.elipse(9.5, -23.5 + y0, 2.2, 2.0, [236, 239, 244], 8));
  } else if (clarao) {   // clarão do tiro: losango chapado, sem brilho
    const fx = costas ? 9.5 : 10.5, fy = (costas ? -15.8 : -8) + y0;
    f.push([[255, 210, 74], [[fx - 2, fy], [fx + 1, fy - 2.4], [fx + 5, fy], [fx + 1, fy + 2.4]]]);
    f.push(iso.ret(fx - 0.5, fy - 0.9, 2.6, 1.8, [255, 246, 208]));
  }
  if (vira) {   // espelha
    f = f.map(([cor, pts]) => [cor, pts.map(([x, y]) => [-x, y])]);
  }
  if (queda >= 0) {   // cai para trás
    const ang = (vira ? 1 : -1) * Math.min(1.0, queda * 2.2) * 1.45;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    f = f.map(([cor, pts]) => [cor, pts.map(([x, y]) => [x * cs - y * sn, x * sn + y * cs])]);
  } else {
    f.unshift(iso.elipse(-1.5, 0.5, 5.5, 2.6, _SOMBRA, 14));
  }
  return f;
}

export function criar_sprites(zoom) {
  // out[time][tipo][dir][quadro] = [imagem, x0, y0] para este zoom
  const out = {};
  for (const time of ['verde', 'vermelho']) {
    const cores = C.TIMES[time].soldado;
    out[time] = {};
    for (const tipo of C.ORDEM_CARTAS) {
      out[time][tipo] = [];
      for (let d = 0; d < 4; d++) {
        const q = {};
        q.p = sprite(formas(d, cores, { tipo }), zoom);
        for (let k = 0; k < 4; k++) {
          const fase = k * Math.PI / 2;
          q['a' + k] = sprite(formas(d, cores, { passo: Math.sin(fase), sobe: Math.abs(Math.cos(fase)) * 1.3, anda: true, tipo }), zoom);
        }
        q.t0 = sprite(formas(d, cores, { recuo: 1.6, clarao: true, tipo }), zoom);
        q.t1 = sprite(formas(d, cores, { recuo: 0.8, tipo }), zoom);
        for (let k = 0; k < 4; k++) {
          const qd = (k + 0.5) / 4;
          let [img, x0, y0] = sprite(formas(d, cores, { queda: qd, tipo }), zoom);
          if (qd >= 0.6) {   // some na neve: a transparência já fica na imagem
            const alfa = Math.trunc(255 * (1 - (qd - 0.6) / 0.4));
            const ctx = pg.superficie(img.width, img.height);
            ctx.globalAlpha = alfa / 255;
            ctx.drawImage(img, 0, 0);
            img = ctx.canvas;
          }
          q['c' + k] = [img, x0, y0];
        }
        out[time][tipo].push(q);
      }
    }
  }
  return out;
}

const _ANDA = ['a0', 'a1', 'a2', 'a3'];
const _CAI = ['c0', 'c1', 'c2', 'c3'];
const _MEIO_PI = Math.PI / 2;

export function quadro(s) {
  // escolhe o quadro de animação pelo estado do soldado
  if (s.caindo >= 0) return _CAI[Math.min(3, Math.trunc(s.caindo * 4))];
  if (s.andando) return _ANDA[Math.trunc(s.fase / _MEIO_PI) % 4];
  if (s.tiro > 0.45) return 't0';
  if (s.tiro > 0) return 't1';
  return 'p';
}
