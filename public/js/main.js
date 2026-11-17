// main.js — Guardians vs Troops, versão web.  (Mercury Studios)
// (clone do main.py do kit)
//
// Ordem das telas (as quatro primeiras estão em menu.js):
//     0. toque_inicial()   só no navegador: o áudio precisa de um toque para ligar
//     1. splash()          "MERCURY STUDIOS"
//     2. carregamento()    barra clássica; aqui os sons são carregados (som.js),
//                          o campo é desenhado (cena.js) e a batalha do fundo
//                          do menu é montada (menu.FundoBatalha)
//     3. menu_principal()  INICIAR / MULTIPLAYER / CONFIGURAÇÕES / SAIR
//     4. opcoes()          configurações (salvas por opcoes.js)
//     5. Partida.rodar()   o jogo em si (este arquivo). O botão "Menu" ou o
//                          voltar/ESC trazem de volta para o menu.
//     6. PartidaPvP.rodar() a batalha entre jogadores (partida_pvp.js), aberta
//                          pela sala do MULTIPLAYER quando os dois ficam prontos.
//
// Este arquivo cuida da janela, dos toques (arrastar, tocar, pinça, roda do
// mouse) e do laço da partida. Regras: tropas.js. Desenho: cena.js.
// Interface da partida: interface.js. Sons: som.js.
import * as C from './config.js';
import * as M from './mapa.js';
import * as menu from './menu.js';
import * as OP from './opcoes.js';
import * as pg from './pg.js';
import { Camera } from './camera.js';
import { Cena } from './cena.js';
import { Interface } from './interface.js';
import { Som, Mudo } from './som.js';
import { Tropas } from './tropas.js';
import { Rede } from './multiplayer.js';
import { PartidaPvP } from './partida_pvp.js';
import { Tutorial, PASSOS_PARAFUSOS } from './tutorial.js';
import { PassoFixo } from './passo.js';
import { Agenda } from './agenda.js';
import { Qualidade } from './qualidade.js';
import { Painel } from './painel.js';

const PASTA = './';
const int = Math.trunc;

class Partida {
  // o jogo em si: câmera, regras (tropas.js), desenho (cena.js) e interface
  constructor(app) {
    this.app = app;
    this.som = app.som;
    this.cam = new Camera();
    this.cam.ajustar(app.vw, app.vh, true);
    this.tropas = new Tropas(new Mudo());   // o som de verdade entra quando a partida começa
    this.ui = new Interface(this.tropas);
    this.ui.organizar(this.cam.vw, this.cam.vh);
    this.cena = new Cena();
    this.cena.fx.som = this.som;   // os efeitos extras também fazem barulho
    // pontos do cenário que fazem som de fundo (só quando a câmera está perto)
    this.mastros = M.CONSTRUCOES.filter(c => c.bandeira || c.tipo === 'qg' || c.tipo === 'base' || c.tipo === 'posto').map(c => [c.x, c.y]);
    this.radar = M.BASES.vermelho;
    // desempenho: passo fixo, agenda com orçamento, gerente de qualidade e painel
    this.passo = new PassoFixo();
    this.agenda = new Agenda();
    this.cena.agenda = this.agenda;
    this.qualidade = new Qualidade(app);
    this.painel = new Painel();
  }

  *preparar() {
    // gerador para a barra de carregamento (menu.carregamento)
    yield 0.1;
    this.cena.preparar(this.cam.zoom);   // terreno grande + sprites: a parte mais pesada
    yield 1.0;
  }

  _toque_fantasma(pos, cam, ui, cena, tropas) {
    // V: constrói ali; X: desiste; perto da barricada: começa a arrastar
    const dentro = (r) => r && pos[0] >= r[0] && pos[0] <= r[0] + r[2] && pos[1] >= r[1] && pos[1] <= r[1] + r[3];
    const f = ui.fantasma;
    if (dentro(cena.r_fantasma_ok)) {
      if (f.valido && tropas.construir_barricada(f.x, f.y, f.ang)) { ui.limpar_carta(); this.som.tocar('ordem'); }
      else this.som.tocar('erro');
      return true;
    }
    if (dentro(cena.r_fantasma_x)) { ui.limpar_carta(); this.som.tocar('carta_solta'); return true; }
    const [wx, wy] = cam.mundo(pos[0], pos[1]);
    if (Math.hypot(wx - f.x, wy - f.y) < 2.4) { this._arr_fantasma = [f.x - wx, f.y - wy]; return true; }
    return false;
  }

  nova() {
    this.qualidade.nova_partida();
    this.passo = new PassoFixo();
    // começa uma partida nova (a cada INICIAR)
    this.tropas.som = this.som;
    this.tropas.iniciar();
    // o que foi escolhido na tela de NOVA PARTIDA (limite de tropas e IA 1/2/3)
    const zumbi = this.app.op.modo === 'zumbi';
    this.tropas.configurar({ limite: this.app.op.limite_tropas, ia: zumbi ? this.app.op.horda : this.app.op.ia, modo: zumbi ? 'zumbi' : 'normal' });
    this.cena.fx.limpar();   // efeitos da partida anterior somem
    this.ui.limpar_carta();
    this.ui.avisos.limpar();
    this.ui.avisos.som = this.som;
    this.ui.pausado = false;
    this.ui.som_ligado = this.som.ligado && this.som.ok;
    this.cam.x = 0.0; this.cam.y = 1000.0;   // olhando para a sua base
    this.cam.prender();
    // TUTORIAL (só no solo): toda partida solo, enquanto "Ativar tutorial" estiver ligado
    // (no modo zumbi o tutorial fica de fora: ele ensina as ondas do inimigo, que lá não existem)
    this.tut = this.app.op.tutorial && !zumbi ? new Tutorial(this.tropas, this.som, this.ui) : null;
    this._dica_pf = false;   // a dica dos parafusos só aparece uma vez por partida
  }

  _checar_dica_parafusos() {
    // a PRIMEIRA vez que faltam parafusos (com o tutorial ligado): a câmera
    // vai até os campos de treino e explica como conseguir mais
    if (this._dica_pf || this.tut || !this.app.op.tutorial) return;
    const T = this.tropas;
    if (T.fim || !T.todas_bases().some(b => b.time === 'verde' && b.vida > 0 && b.falta_pf > 0)) return;
    this._dica_pf = true;
    const ui = this.ui;
    ui.gaveta = null; ui.area_aberta = -1; ui.base_aberta = null; if (ui.carta_sel) ui.limpar_carta();
    this.tut = new Tutorial(T, this.som, ui, PASSOS_PARAFUSOS);
  }

  _fim_tutorial() {
    // visto (ou pulado): o jogo segue. A opção continua como está: ligada,
    // ele volta na próxima partida solo (desliga em Configurações)
    this.tut = null;
  }

  _tamanho() {
    const app = this.app, cam = this.cam;
    if (cam.vw !== app.vw || cam.vh !== app.vh) {
      cam.ajustar(app.vw, app.vh);
      this.ui.organizar(cam.vw, cam.vh);
      if (this.cena.zoom !== cam.zoom) this.cena.preparar(cam.zoom);   // mesmo zoom: nada a redesenhar
    }
  }


  async rodar() {
    // laço da partida; devolve 'menu' ou 'sair'
    const app = this.app, cam = this.cam, tropas = this.tropas, ui = this.ui, cena = this.cena, som = this.som;
    this._tamanho();
    let tempo = 0.0;
    let arrastando = false;     // dedo/botão apertado no campo
    let toque = null;           // candidato a "toque curto" (não arrasto)
    const dedos = new Map();    // dedos na tela (dois dedos = não é toque nem arrasto)
    let fps_txt = '', fps_t = 0.0;

    for (;;) {
      const dt = await app.tick();

      for (const ev of app.eventos()) {
        if (ev.type === 'QUIT') return 'sair';
        if (ev.type === 'KEYDOWN' && ev.key === 'escape') {
          som.tocar('menu_voltar');
          return 'menu';
        } else if (ev.type === 'VIDEORESIZE') {
          this._tamanho();
        } else if (this.tut && this.tut.ativo && ev.type.startsWith('MOUSE')) {
          // durante o tutorial o toque é só dele (sem arrastar a câmera, sem cartas)
          if (ev.type === 'MOUSEBUTTONDOWN' && ev.button === 1) this.tut.clique(ev.pos);
          arrastando = false; toque = null;
        } else if (ev.type === 'MOUSEBUTTONDOWN' && ev.button === 1 && ui.fantasma && this._toque_fantasma(ev.pos, cam, ui, cena, tropas)) {
          // tocou no V / X da barricada, ou pegou ela para arrastar
        } else if (ev.type === 'MOUSEBUTTONDOWN' && ev.button === 1) {
          const naCaixa = (r) => r && ev.pos[0] >= r[0] && ev.pos[0] <= r[0] + r[2] && ev.pos[1] >= r[1] && ev.pos[1] <= r[1] + r[3];
          if (naCaixa(ui.r_moedas) || naCaixa(ui.r_parafusos)) this.painel.toque_recursos();   // 3 toques: painel de desempenho
          const acao = ui.clique(ev.pos);
          if (acao === null) {              // tocou no campo
            arrastando = true; toque = ev.pos;
          } else if (acao === 'menu') {
            som.tocar('menu_voltar');
            return 'menu';
          } else if (acao.startsWith('ir:')) {           // aviso / "?": leva a câmera até a tropa
            const [px, py] = acao.slice(3).split(',').map(Number);
            cam.x = px; cam.y = py;
            cam.prender();
            som.tocar('clique');
          } else if (acao === 'mini') {                  // tocou no minimapa: leva a câmera
            [cam.x, cam.y] = ui.mini_para_cena(ev.pos);
            cam.prender();
            som.tocar('clique');
          } else if (acao === 'som') {
            ui.som_ligado = som.alternar() && som.ok;
            app.op.efeitos = som.ligado;
            OP.salvar(app.pasta, app.op);
            som.tocar('clique');
          } else if (acao === 'mapa') {
            ui.depurar = !ui.depurar;
            som.tocar('clique');
          } else if (acao === 'pausa') {
            ui.pausado = !ui.pausado;
            som.tocar(ui.pausado ? 'pausa' : 'continua');
          } else if (acao === 'cancelar_carta') {
            ui.limpar_carta();
          } else if (acao.startsWith('carta:')) {
            const tipo = acao.slice(6);
            ui.gps_base = null;
            if (!tropas.pode_pagar(tipo)) {
              ui.limpar_carta();
              som.tocar('erro');             // faltam moedas (ou já tem bases demais)
            } else {                             // pega (ou devolve) a carta
              if (ui.carta_sel === tipo) ui.limpar_carta(); else ui.selecionar_carta(tipo);
              som.tocar(ui.carta_sel ? 'carta_pega' : 'carta_solta');
              if (ui.carta_sel === 'barricada') {   // aparece no meio da tela, pronta para arrastar
                const [wx, wy] = cam.mundo(cam.vw / 2, cam.vh / 2);
                ui.fantasma = { x: wx, y: wy, ang: 0, valido: false };
              }
            }
          } else if (acao.startsWith('compra:')) {
            tropas.comprar(acao.slice(7));
          } else if (acao.startsWith('hab:')) {          // habilidade de uma tropa
            const [, tipo, m] = acao.split(':');
            tropas.comprar_hab(tipo, m);
          } else if (acao.startsWith('base_carta:')) {   // a carta que a base solta
            tropas.escolher_carta(ui.base_aberta, acao.slice(11));
          } else if (acao === 'cam_comprar') {           // fase 5: caminhão novo (moedas)
            tropas.comprar_caminhao('verde');
          } else if (acao.startsWith('cam_parar:')) {
            tropas.ordem_caminhao(tropas.caminhoes.find(c => c.id === +acao.slice(10)), 'parar');
          } else if (acao.startsWith('ref:')) {           // fase 4: pedido na refinaria
            tropas.pedir_ref('verde', acao.slice(4));
          } else if (acao.startsWith('mb:')) {            // fase 3: melhoria da base com moedas
            tropas.comprar_mb('verde', acao.slice(3));
          } else if (acao === 'gps') {                  // GPS da base: o próximo toque no mapa marca o ponto
            ui.gps_base = ui.base_aberta; ui.base_aberta = null; ui.limpar_carta();
            som.tocar('carta_pega');
          } else if (acao.startsWith('deck_sel:')) {     // escolhendo o deck da base 2/3
            som.tocar(ui.alternar_deck(acao.slice(9)) ? 'carta_pega' : 'erro');
          } else if (acao === 'deck_ok') {               // confirma o deck (uma vez só)
            if (tropas.definir_deck(ui.base_aberta, ui.deck_sel)) ui.deck_sel = [];
          } else if (acao === 'tr_enviar') {            // manda a tropa para o campo de treino
            const ok = tropas.enviar_treino('verde', ui.area_aberta, ui.treino_sel, ui.treino_qtd);
            this.som.tocar(ok ? 'ordem' : 'erro');
            if (ok) { ui.area_aberta = -1; tropas.deu_ordem = true; }
          } else if (acao === 'tr_liberar') {
            this.som.tocar(tropas.sair_treino('verde', ui.area_aberta) ? 'desselecionar' : 'erro');
          } else if (acao === 'tr_selecionar') {
            const oc = tropas.ocupante_treino('verde', ui.area_aberta);
            if (oc) { tropas.selecionado = oc; this.som.tocar('selecionar'); }
            ui.area_aberta = -1;
          } else if (acao === 'melhorar_qg') {
            if (tropas.melhorar_qg()) {
              cena.redesenhar_frente();   // só a faixa da linha de frente (sem travar)
              ui.organizar(cam.vw, cam.vh);
            }
          } else if (acao === 'reiniciar') {
            this.nova();
          }
        } else if (ev.type === 'MOUSEMOTION' && this._arr_fantasma && ui.fantasma) {
          const [wx, wy] = cam.mundo(ev.pos[0], ev.pos[1]);   // a barricada segue o dedo
          ui.fantasma.x = wx + this._arr_fantasma[0]; ui.fantasma.y = wy + this._arr_fantasma[1];
        } else if (ev.type === 'MOUSEBUTTONUP' && ev.button === 1 && this._arr_fantasma) {
          this._arr_fantasma = null;
        } else if (ev.type === 'MOUSEMOTION' && arrastando && dedos.size < 2) {
          if (toque && Math.abs(ev.pos[0] - toque[0]) + Math.abs(ev.pos[1] - toque[1]) > 10 * ui.u) {
            toque = null;              // andou demais: é arrasto, não toque
          }
          if (toque === null) cam.mover(ev.rel[0], ev.rel[1]);
        } else if (ev.type === 'MOUSEBUTTONUP' && ev.button === 1) {
          if (arrastando && toque && dedos.size < 2) {
            const [wx, wy] = cam.mundo(ev.pos[0], ev.pos[1]);   // tela -> mundo
            if (tropas.cam_sel) {                          // fase 5: caminhão escolhido: base de carga, depois de descarga
              const bc = tropas.todas_bases().find(b => b.time === 'verde' && b.vida > 0 && Math.hypot(b.x - wx, b.y - wy) < 4);
              if (bc) {
                const papel = ui.cam_passo === 'para' ? 'para' : 'de';
                if (!tropas.ordem_caminhao(tropas.cam_sel, papel, bc)) som.tocar('erro');
                else if (papel === 'de') ui.cam_passo = 'para';
                else { tropas.cam_sel = null; ui.cam_passo = null; }
              } else { tropas.cam_sel = null; ui.cam_passo = null; }
            } else if (ui.gps_base) {                             // GPS: ponto de reunião da base
              tropas.definir_reuniao(ui.gps_base, wx, wy);
              ui.gps_base = null;
            } else if (ui.carta_sel === 'barricada' && ui.fantasma) {   // toque no mapa: a barricada vai para lá
              ui.fantasma.x = wx; ui.fantasma.y = wy;
              som.tocar('clique');
            } else if (ui.carta_sel === 'torre') {       // torre de defesa no ponto tocado
              tropas.construir_torre(wx, wy);
              ui.limpar_carta();
            } else if (ui.carta_sel === 'base') {        // construir base no ponto tocado
              tropas.construir_base(wx, wy);
              ui.limpar_carta();
            } else if (ui.carta_sel) {                // carta na mão: posiciona a tropa
              tropas.posicionar(ui.carta_sel, wx, wy);
              ui.limpar_carta();
            } else if ((tropas.caminhoes || []).some(c => c.time === 'verde' && Math.hypot(c.x - wx, c.y - wy) < 1.8)) {
              // fase 5: tocou num caminhão seu: escolhe a rota (base de carga, depois de descarga)
              tropas.cam_sel = tropas.caminhoes.find(c => c.time === 'verde' && Math.hypot(c.x - wx, c.y - wy) < 1.8);
              ui.cam_passo = 'de'; ui.base_aberta = null; ui.area_aberta = -1;
              som.tocar('menu_clique');
            } else {
              // tocou numa base sua? abre a janela dela
              const base = tropas.todas_bases().find(b => b.time === 'verde' && b.vida > 0 &&
                Math.sqrt((b.x - wx) ** 2 + (b.y - wy) ** 2) < 4);
              // tocou num campo de treino seu (fora de uma tropa)? abre a janela "i"
              const area = M.area_em('verde', wx, wy);
              const na_tropa = tropas.esquadroes.some(q => q.time === 'verde' && q.sold.length &&
                (q.x - wx) ** 2 + (q.y - wy) ** 2 < (q.raio() + 0.4) ** 2);
              if (base) {
                ui.abrir_base(base);
              } else if (area && !na_tropa) {
                ui.base_aberta = null;
                ui.abrir_treino(area.n, tropas.selecionado);
                tropas.selecionado = null;
                this.som.tocar('menu_clique');
              } else {
                ui.base_aberta = null;
                ui.area_aberta = -1;
                tropas.tocar(wx, wy);
              }
            }
          }
          arrastando = false; toque = null;
        } else if (ev.type === 'FINGERDOWN') {
          // zoom fixo: dois dedos só cancelam o toque (sem pinça)
          dedos.set(ev.finger_id, 1);
          if (dedos.size >= 2) toque = null;
        } else if (ev.type === 'FINGERUP') {
          dedos.delete(ev.finger_id);
        }
      }

      this._checar_dica_parafusos();
      ui.tutorial_ativo = !!this.tut;
      if (this.tut) {   // tutorial na tela: o jogo espera (a neve continua caindo)
        this.tut.atualizar(dt, cam, ui.u);
        if (!this.tut.ativo) this._fim_tutorial();
      }
      // PASSO FIXO: as regras andam em passos iguais de 1/60 s (o painel mede o tempo)
      const passo = this.passo, painel = this.painel;
      painel.inicio('logica');
      if (this.tut) {
        tempo += dt;
        if (this.tut.deixa_atualizar) {   // a tropa grátis do tutorial chegando (a onda não anda)
          passo.avancar(dt, tropas, (h) => { const espera = tropas.espera; tropas.atualizar(h); tropas.espera = espera; });
        } else passo.parado();
      } else if (!ui.pausado) {
        tempo += dt;
        passo.avancar(dt, tropas, (h) => tropas.atualizar(h));
        som.ambiente(dt, this.mastros, this.radar);
      } else passo.parado();
      painel.fim('logica');

      const tela = app.tela;
      if (tropas.frente_versao !== this._frente_v) {   // a linha de frente andou (QG seu ou do inimigo)
        if (this._frente_v !== undefined) { cena.redesenhar_frente(); ui.organizar(cam.vw, cam.vh); }
        this._frente_v = tropas.frente_versao;
      }
      cena.mostrar_alcance = ui.carta_sel === 'torre';   // anel do alcance das suas torres
      if (ui.fantasma && ui.carta_sel !== 'barricada') ui.fantasma = null;
      if (ui.fantasma) {   // barricada na mão: ângulo automático e se dá para pôr ali
        const f = ui.fantasma;
        f.ang = tropas.angulo_barricada('verde', f.x, f.y);
        f.valido = tropas.lugar_barricada('verde', f.x, f.y) && tropas.pode_pagar('barricada');
      }
      cena.fantasma = ui.fantasma || null;
      this.agenda.inicio_quadro();
      passo.interpolar(tropas);   // posições do desenho (entre o passo anterior e o atual)
      painel.inicio('desenho');
      cena.desenhar(tela, cam, tropas, tempo, ui.depurar, ui.carta_sel !== null);
      painel.fim('desenho');
      painel.inicio('interface');
      if (this.tut) {
        // paisagem escura e embaçada, interface sumindo e a dica por cima
        this.tut.fundo(tela, cam, ui.u);
        const a = 1 - this.tut.vis;
        const W = tela.canvas.width, H = tela.canvas.height;
        if (!this._camada || this._camada.width !== W || this._camada.height !== H) {
          this._camada = document.createElement('canvas');
          this._camada.width = W; this._camada.height = H;
        }
        const cc = this._camada.getContext('2d');
        cc.clearRect(0, 0, W, H);
        ui.desenhar(cc, cam);   // (o tutorial mostra pedaços dela, como a aba do Batalhão)
        if (a > 0.01) { tela.save(); tela.globalAlpha = a * a; tela.drawImage(this._camada, 0, 0); tela.restore(); }
        this.tut.frente(tela, cam, ui.u, this._camada);
      } else {
        ui.desenhar(tela, cam);
      }
      painel.fim('interface');
      passo.restaurar();          // as regras voltam a ver as posições verdadeiras
      this.qualidade.quadro(dt, this);   // FPS caiu? menos enfeite (e, se precisar, menos resolução)
      painel.desenhar(tela, this);
      if (app.op.fps) {   // contador (opção em Configurações)
        fps_t -= dt;
        if (fps_t <= 0) {
          fps_t = 0.5; fps_txt = 'FPS ' + int(app.janela.get_fps() + 0.5);
        }
        const img = app.texto_grosso(fps_txt, 20 * ui.u, C.BRANCO, 2);
        pg.blit(tela, img, int(8 * ui.u), int(ui.y_status + 36 * ui.u));
      }
    }
  }
}

async function tela_final(app) {
  // SAIR: o pygame fecha a janela; uma página não se fecha sozinha, então
  // fica a tela escura do fim e um toque volta para o começo
  app.som.parar_musica(400);
  if (app.rede && app.rede.ws) { try { app.rede.ws.close(); } catch (_) { /* ok */ } }
  try { window.close(); } catch (_) { /* a maioria dos navegadores não deixa */ }
  let t = 0.0;
  for (;;) {
    t += await app.tick();
    for (const ev of app.eventos()) {
      if (ev.type === 'MOUSEBUTTONDOWN' && t > 0.5) { location.reload(); return; }
    }
    const vw = app.vw, vh = app.vh, u = app.u;
    const tela = app.tela;
    tela.fillStyle = pg.css(C.ESCURO);
    tela.fillRect(0, 0, vw, vh);
    app.centro(app.texto_grosso('GUARDIANS VS TROOPS', Math.min(60 * u, vw * 0.085), C.BRANCO, null, [12, 17, 26], int(4 * u)), vw / 2, vh * 0.42);
    const img = app.fonte(21 * u, false).render('Você saiu do jogo. Toque para abrir de novo.', [201, 207, 219]);
    app.centro(img, vw / 2, vh * 0.56);
  }
}

async function main() {
  const janela = new pg.Janela(document.getElementById('tela'));
  await pg.carregar_fonte('fontes/FreeSansBold.ttf');
  const op = await OP.carregar(PASTA);

  // som: abre o áudio agora; os sons em si são carregados na barra de carregamento
  const som = new Som(PASTA + 'sons/', () => [0.0, 1.0]);
  som.aplicar({ volume: op.volume, efeitos: op.efeitos, musica: op.musica });
  const app = new menu.App(janela, som, op, PASTA);
  app.no_android = !document.fullscreenEnabled;   // sem tela cheia neste navegador (ex.: iPhone)
  app.rede = new Rede();
  app.rede.entrar_sozinho();   // tem recibo da conta no aparelho: já entra sozinho
  document.addEventListener('fullscreenchange', () => { op.tela_cheia = !!document.fullscreenElement; });
  // CELULAR: sempre tela cheia e sempre na horizontal. O navegador só deixa
  // pedir isso num toque, então todo toque confere (se saiu da tela cheia,
  // o próximo toque volta). Onde não existe (iPhone), o palco gira sozinho.
  app.movel = janela.movel;
  if (janela.movel) {
    op.tela_cheia = true;
    const deitar = () => {
      const o = screen.orientation;
      if (o && o.lock && !/^landscape/.test(o.type || '')) o.lock('landscape').catch(() => {});
    };
    const sempre = () => {
      try {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) {
          const p = el.requestFullscreen({ navigationUI: 'hide' });
          if (p && p.then) p.then(deitar, () => {}); else deitar();
        } else if (document.fullscreenElement) {
          deitar();
        } else if (!document.fullscreenElement && el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        }
      } catch (_) { /* navegador sem tela cheia: o palco girado resolve a horizontal */ }
    };
    window.addEventListener('pointerup', sempre, true);
    window.addEventListener('touchend', sempre, true);
    document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) deitar(); janela.ajustar(); });
  }
  // qualquer toque religa o áudio se o navegador o tiver adormecido (troca de aba, tela apagada)
  window.addEventListener('pointerdown', () => { som.acordar(); }, true);
  window.__jogo = app;

  await som.carregar_um('logo_0');
  await menu.toque_inicial(app);
  if (await menu.splash(app) === 'sair') return tela_final(app);

  const partida = new Partida(app);
  som.posicao = (x, y) => partida.cam.posicao_som(x, y);   // som com esquerda/direita pela câmera da partida
  const fundo = new menu.FundoBatalha();
  const passos = [
    ['Sintetizando os sons de batalha', 5, som.carregar()],
    ['Desenhando o campo de batalha', 3, partida.preparar()],
    ['Mobilizando as tropas', 3, fundo.preparar(app.vw, app.vh)],
  ];
  if (await menu.carregamento(app, passos, 5.5) === 'sair') return tela_final(app);

  const pvp = new PartidaPvP(app, partida);
  for (;;) {
    app.rede.definir_status('menu');
    const escolha = await menu.menu_principal(app, fundo);
    if (escolha === 'sair') break;
    if (escolha === 'pvp') {   // batalha entre jogadores
      const info = app.rede.partida;
      app.rede.partida = null;
      som.posicao = (x, y) => partida.cam.posicao_som(x, y);
      if (info && await pvp.rodar(info) === 'sair') break;
      som.parar_musica(0);
      continue;
    }
    app.rede.definir_status('jogando');
    partida.nova();
    if (await partida.rodar() === 'sair') break;
    som.parar_musica(0);
  }
  return tela_final(app);
}

main().catch((e) => {
  console.error(e);
  const d = document.getElementById('erro');
  if (d) { d.style.display = 'block'; d.textContent = 'O jogo parou com um erro: ' + (e && e.message ? e.message : e); }
});
