// multiplayer.js — a seção MULTIPLAYER (o que é NOVO em relação ao kit).
//
//     Rede      conversa com o servidor (server.js) por WebSocket
//     secao()   as telas, abertas pelo botão MULTIPLAYER do menu:
//                 1. ENTRAR / CRIAR CONTA (sempre com e-mail)
//                 2. duas metades: AMIGOS (pedir amizade, convidar para
//                    batalha) e GLOBAL (quem está on agora)
//
// Nada é guardado: a conta só serve para entrar e ficar on. Quem fica off
// some das listas. O visual é o do próprio jogo: o painel das CONFIGURAÇÕES
// (branco, borda escura, cabeçalho verde), os botões do menu, as pílulas da
// interface da partida e o texto grosso com contorno.
import * as C from './config.js';
import * as pg from './pg.js';
import * as icones from './icones.js';
import { Recibo, Vigia, Religador } from './conexao.js';
import * as google from './google.js';
import { Botao, painel, ret_arred, _toast, eventos_basicos, _passar_e_clicar } from './menu.js';

const int = Math.trunc;
const CINZA = [107, 116, 133];
const FUNDO_APAGADO = [223, 227, 234];
const VERDE_ESCURO = [31, 138, 69];
const LINHA = [226, 230, 237];
const ROTULO_STATUS = { menu: 'NO MENU', jogando: 'JOGANDO', sala: 'EM SALA', batalha: 'EM BATALHA' };

// ======================================================================
// Rede
// ======================================================================
export class Rede {
  constructor() {
    this.ws = null;
    this.estado = 'fora';        // 'fora' | 'ligando' | 'ligado'
    this.tentou = false;
    this.eu = null;              // {id, nome, email} depois de entrar
    this.online = [];            // [{id, nome, status}] quem está on
    this.todos = [];             // quem já entrou: on e off, com tempos (GLOBAL)
    this.recebido = 0;           // hora (do aparelho) em que chegou o último estado
    this.abertos = new Set();    // ids com a abinha de tempos aberta
    this.amigos = new Set();     // ids dos amigos
    this.pedidos = [];           // [{id, nome}] pedidos de amizade recebidos
    this.enviados = new Set();   // ids para quem pedi amizade
    this.convites = [];          // [{id, nome}] convites de batalha recebidos
    this.convite_para = null;    // id de quem eu convidei (esperando resposta)
    this.sala = null;            // {id, verde:{id,nome}, vermelho:{id,nome}}
    this.erro_login = '';
    this.esperando_login = false;
    this.avisos = [];            // [[texto, som]] para a tela mostrar
    this.status = 'menu';
    this.partida = null;         // {lado, sala}: batalha começando (main.js abre a partida)
    this.fotos = [];             // retratos da batalha que chegaram do servidor
    this.oponente_saiu = null;   // nome de quem saiu no meio da batalha
    // os 3 módulos de conexão (conexao.js): recibo, vigia e religador
    this.vigia = new Vigia(this);
    this.religador = new Religador(this);
    this.partida_confirmar = 0;  // voltou durante uma batalha: espera o servidor confirmar
  }

  get reconectando() { return this.religador.ativo; }
  get texto_conexao() { return this.religador.texto; }

  entrar_sozinho() {
    // abre o jogo já logado, se o aparelho tem o recibo da conta
    if (Recibo.ler() && !this.eu && this.estado === 'fora') this.ligar();
  }

  _caiu(motivo) {
    // o vigia viu a conexão morrer: fecha e deixa o religador cuidar
    if (this.ws) { const ws = this.ws; this.ws = null; try { ws.close(); } catch (_) { /* já fechado */ } this._fechou(motivo); }
    else if (this.eu) this.religador.comecar(motivo);
  }

  _fechou(motivo) {
    this.estado = 'fora';
    this.vigia.parar();
    if (this.eu && !this._saiu_de_vez && this.religador.comecar(motivo)) return;   // tenta voltar sozinho (mantém a tela)
    const estava = this.eu !== null;
    this._limpar();
    if (estava && !this._saiu_de_vez) this.avisos.push(['Conexão perdida. Entre de novo.', 'erro']);
  }

  _desistir() {
    this.religador.parar();
    const estava = this.eu !== null;
    this._limpar();
    if (estava) this.avisos.push(['Não deu para reconectar. Entre de novo.', 'erro']);
  }

  ligar() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    this.tentou = true;
    this.estado = 'ligando';
    let ws;
    try {
      ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    } catch (_) {
      this.estado = 'fora';
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.estado = 'ligado';
      this._saiu_de_vez = false;
      this.vigia.ligar();
      const rc = Recibo.ler();
      if (rc) this.enviar({ t: 'retomar', rc });   // entra sozinho (e recupera a conta se o servidor esqueceu)
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (_) { return; }
      this.vigia.chegou();
      this._receber(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this._fechou('caiu');
    };
    ws.onerror = () => { /* o onclose vem em seguida */ };
  }

  _limpar() {
    this.eu = null;
    this.google_novo = null;
    this.online = [];
    this.todos = [];
    this.recebido = 0;
    this.amigos = new Set();
    this.pedidos = [];
    this.enviados = new Set();
    this.convites = [];
    this.convite_para = null;
    this.sala = null;
    this.esperando_login = false;
    this.partida = null;
    this.fotos = [];
    this.oponente_saiu = null;
  }

  enviar(m) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(m));
      return true;
    }
    return false;
  }

  definir_status(s) {
    this.status = s;
    if (this.eu) this.enviar({ t: 'status', status: s });
  }

  nome_de(id) {
    const p = this.online.find(o => o.id === id);
    return p ? p.nome : '?';
  }

  _receber(m) {
    switch (m.t) {
      case 'logado': {
        const voltando = this.religador.ativo;
        this.religador.parar();
        Recibo.guardar(m.rc); google.guardar_recibo(m.rc);
        if (voltando && this.partida) this.partida_confirmar = Date.now() + 4000;   // a batalha ainda existe?
        if (voltando) {
          this.eu = m.eu;
          this.erro_login = '';
          this.esperando_login = false;
          this.enviar({ t: 'status', status: this.status });
          this.avisos.push([m.restaurou ? 'O servidor reiniciou: sua conta foi recuperada!' : 'Conexão de volta!', 'pronta_amiga']);
          break;
        }
        if (m.restaurou) this.avisos.push(['O servidor reiniciou: sua conta foi recuperada!', null]);
      }
        this.eu = m.eu;
        this.perfil = !!m.eu.nova;   // conta nova: abre a escolha do ícone
        this.erro_login = '';
        this.esperando_login = false;
        this.enviar({ t: 'status', status: this.status });
        this.avisos.push([`Você está on, ${m.eu.nome}!`, 'pronta_amiga']);
        break;
      case 'google_novo':   // conta Google confirmada e e-mail novo: falta só nome e senha
        this.google_novo = { email: m.email, nome: m.nome || '' };
        this.esperando_login = false;
        this.erro_login = '';
        this.avisos.push([null, 'menu_clique']);
        break;
      case 'erro_login':
        this.erro_login = m.msg;
        this.esperando_login = false;
        this.avisos.push([null, 'erro']);
        break;
      case 'estado': {
        const antes = this.pedidos.length;
        this.online = m.online;
        this.todos = m.todos || [];
        this.recebido = Date.now();
        this.amigos = new Set(m.amigos);
        this.pedidos = m.pedidos;
        this.enviados = new Set(m.enviados);
        this.convite_para = m.convite_para;
        Recibo.guardar(m.rc); google.guardar_recibo(m.rc);   // recibo atualizado: no celular e no Drive
        if (this.eu) {   // troféus e likes da sua conta vêm na lista
          const eu = this.todos.find(o => o.id === this.eu.id);
          if (eu) { this.eu.trofeus = eu.trofeus || 0; this.eu.likes = eu.likes || 0; this.eu.vitorias = eu.vitorias || 0; this.eu.derrotas = eu.derrotas || 0; if (!this._avatar_local) this.eu.avatar = eu.avatar || 0; }
          this._avatar_local = false;
        }
        this.convites = this.convites.filter(c => m.online.some(o => o.id === c.id));
        if (m.pedidos.length > antes) this.avisos.push([null, 'carta_pronta']);
        break;
      }
      case 'convite':
        if (!this.convites.some(c => c.id === m.de.id)) this.convites.push(m.de);
        this.avisos.push([null, 'corneta_inimiga']);
        break;
      case 'convite_fim':
        this.convites = this.convites.filter(c => c.id !== m.de);
        break;
      case 'sala':
        if (!this.sala) this.avisos.push([null, 'menu_iniciar']);
        else if (m.sala.prontos.length > this.sala.prontos.length) this.avisos.push([null, 'carta_pronta']);
        this.sala = m.sala;
        this.convites = [];
        break;
      case 'resultado':   // fim da partida: quantos troféus ganhou/perdeu
        this.resultado = m;
        if (this.eu) { this.eu.trofeus = m.trofeus; this.eu.likes = m.likes; }
        break;
      case 'partida':
        this.partida_confirmar = 0;
        if (m.volta && this.partida) {   // voltou para a MESMA batalha: segue de onde estava
          this.sala = m.sala;
          this.partida = { lado: m.lado, sala: m.sala };
          this.avisos.push(['Você voltou para a batalha!', 'menu_iniciar']);
          break;
        }
        this.sala = m.sala;
        this.resultado = null;
        this.partida = { lado: m.lado, sala: m.sala };
        this.fotos = [];
        this.oponente_saiu = null;
        break;
      case 'q':
        this.fotos.push(m);
        if (this.fotos.length > 40) this.fotos.splice(0, this.fotos.length - 40);
        break;
      case 'oponente_saiu':
        this.oponente_saiu = m.nome;
        this.avisos.push([`${m.nome} saiu da batalha.`, 'menu_voltar']);
        break;
      case 'sala_fim':
        this.sala = null;
        if (m.msg) this.avisos.push([m.msg, 'menu_voltar']);
        break;
      case 'aviso':
        this.avisos.push([m.msg, m.som || null]);
        break;
      case 'saiu':
        this._saiu_de_vez = true;   // saiu da conta / entrou em outro aparelho: não reconecta sozinho
        this.religador.parar();
        if (m.outro || m.outro === undefined) { /* recibo fica: pode entrar de novo depois */ }
        this._limpar();
        break;
      case 'rc':   // recibo novo (tempos de jogo a cada 1 min)
        Recibo.guardar(m.rc); google.guardar_recibo(m.rc);
        break;
      case 'recibo_ruim':   // recibo vencido ou de outro servidor: pede o login normal
        Recibo.apagar();
        this.religador.parar();
        if (this.eu) { this._limpar(); this.avisos.push(['Entre de novo na sua conta.', 'erro']); }
        break;
    }
  }
}

export function chamando(app) {
  // tem alguém esperando resposta: sala aberta ou convite de batalha
  const r = app.rede;
  return !!(r && r.eu && (r.sala || r.convites.length));
}

export function etiqueta_menu(app) {
  // pílula vermelha no botão MULTIPLAYER do menu quando tem alguém chamando
  const r = app.rede;
  if (!r || !r.eu) return null;
  if (r.sala) return 'EM SALA';
  if (r.convites.length) return 'CONVITE';
  if (r.pedidos.length) return 'PEDIDO';
  return 'ON';
}

// ======================================================================
// Campos de texto (o canvas não tem teclado: usa <input> de verdade,
// transparente, em cima da caixa desenhada pelo jogo)
// ======================================================================
class Campo {
  constructor(tipo, dica, maximo) {
    const el = document.createElement('input');
    el.type = tipo;
    el.placeholder = dica;
    el.maxLength = maximo;
    el.autocomplete = 'off';
    el.autocapitalize = tipo === 'text' ? 'words' : 'off';
    el.spellcheck = false;
    el.className = 'campo-jogo';
    el.style.display = 'none';
    (document.getElementById('palco') || document.body).appendChild(el);   // gira junto com o jogo
    this.el = el;
    this.enter = false;
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { this.enter = true; el.blur(); } });
  }

  get valor() { return this.el.value; }
  set valor(v) { this.el.value = v; }

  mostrar(app, r, u) {
    // r = caixa em pixels do jogo -> pixels da página
    const k = (app.janela.canvas.clientWidth || 1) / app.janela.canvas.width;   // tamanho no palco (vale girado)
    const s = this.el.style;
    s.display = 'block';
    s.left = (r[0] + 12 * u) * k + 'px';
    s.top = r[1] * k + 'px';
    s.width = Math.max(10, (r[2] - 24 * u) * k) + 'px';
    s.height = r[3] * k + 'px';
    s.fontSize = Math.max(11, int(24 * u * 0.6875) * k) + 'px';
  }

  esconder() {
    if (this.el.style.display !== 'none') {
      this.el.style.display = 'none';
      this.el.blur();
    }
  }
}

function caixa_campo(app, tela, r, foco) {
  // a caixa onde se escreve: branca, borda escura (verde quando está em uso)
  const u = app.u;
  ret_arred(tela, C.ESCURO, [r[0] - 2, r[1] - 2, r[2] + 4, r[3] + 4], 8 * u);
  ret_arred(tela, C.BRANCO, r, 8 * u);
  if (foco) ret_arred(tela, C.TIMES.verde.base, r, 8 * u, Math.max(2, int(2 * u)));
}

// pílula da interface da partida (Interface._pilula) com texto
function pilula(app, tela, r, txt, estilo, tam = 17) {
  const u = app.u;
  let fundo, borda, cor;
  if (estilo === 'verde') { fundo = C.TIMES.verde.base; borda = C.ESCURO; cor = C.BRANCO; }
  else if (estilo === 'escuro') { fundo = C.ESCURO; borda = C.ESCURO; cor = C.BRANCO; }
  else if (estilo === 'apagado') { fundo = FUNDO_APAGADO; borda = CINZA; cor = CINZA; }
  else if (estilo === 'amigo') { fundo = [232, 245, 236]; borda = VERDE_ESCURO; cor = VERDE_ESCURO; }
  else if (estilo === 'vermelho') { fundo = C.TIMES.vermelho.emblema; borda = C.ESCURO; cor = C.BRANCO; }
  else { fundo = C.BRANCO; borda = C.ESCURO; cor = C.ESCURO; }
  const rr = int(8 * u);
  pg.ret(tela, fundo, r, 0, rr);
  pg.ret(tela, borda, r, Math.max(2, int(2 * u)), rr);
  const img = app.fonte(tam * u).render(txt, cor);
  pg.blit(tela, img, int(r[0] + r[2] / 2 - img.width / 2), int(r[1] + r[3] / 2 - img.height / 2));
}

function largura_pilula(app, txt, tam = 17) {
  return app.fonte(tam * app.u).size(txt)[0] + int(22 * app.u);
}

function icone_trofeu(tela, cx, cy, r) {
  // taça dourada (troféus)
  tela.save(); tela.translate(cx, cy); tela.lineJoin = 'round';
  tela.strokeStyle = '#1f2937'; tela.lineWidth = Math.max(1.5, r * 0.18); tela.fillStyle = '#f5c242';
  tela.beginPath(); tela.arc(-r * 0.62, -r * 0.35, r * 0.32, Math.PI * 0.5, Math.PI * 1.5); tela.stroke();
  tela.beginPath(); tela.arc(r * 0.62, -r * 0.35, r * 0.32, -Math.PI * 0.5, Math.PI * 0.5); tela.stroke();
  tela.beginPath(); tela.moveTo(-r * 0.62, -r * 0.8); tela.lineTo(r * 0.62, -r * 0.8); tela.quadraticCurveTo(r * 0.6, r * 0.25, 0, r * 0.3); tela.quadraticCurveTo(-r * 0.6, r * 0.25, -r * 0.62, -r * 0.8); tela.closePath(); tela.fill(); tela.stroke();
  tela.beginPath(); tela.rect(-r * 0.45, r * 0.55, r * 0.9, r * 0.3); tela.fill(); tela.stroke();
  tela.restore();
}
function icone_coracao(tela, cx, cy, r) {
  tela.save(); tela.translate(cx, cy);
  tela.beginPath(); tela.moveTo(0, r * 0.9);
  tela.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.7, -r * 1.2, 0, -r * 0.45);
  tela.bezierCurveTo(r * 0.7, -r * 1.2, r * 1.4, -r * 0.1, 0, r * 0.9); tela.closePath();
  tela.fillStyle = '#e0335a'; tela.fill(); tela.strokeStyle = '#1f2937'; tela.lineWidth = Math.max(1.5, r * 0.2); tela.stroke();
  tela.restore();
}

function logo_google(tela, cx, cy, r, cores = true) {
  // o "G" colorido do Google (4 arcos)
  tela.save(); tela.translate(cx, cy); tela.lineWidth = r * 0.42; tela.lineCap = 'butt';
  const arcos = [['#ea4335', -2.6, -0.75], ['#4285f4', -0.75, 0.0], ['#34a853', 0.0, 1.9], ['#fbbc05', 1.9, 2.75], ['#ea4335', 2.75, 3.68]];
  for (const [cor, a0, a1] of arcos) { tela.strokeStyle = cores ? cor : '#b8bec9'; tela.beginPath(); tela.arc(0, 0, r * 0.78, a0, a1); tela.stroke(); }
  tela.fillStyle = cores ? '#4285f4' : '#b8bec9'; tela.fillRect(0, -r * 0.2, r * 0.98, r * 0.4);
  tela.restore();
}

function dentro(r, pos) {
  return r[0] <= pos[0] && pos[0] < r[0] + r[2] && r[1] <= pos[1] && pos[1] < r[1] + r[3];
}

function cortar(fonte, txt, larg) {
  if (fonte.size(txt)[0] <= larg) return txt;
  while (txt.length > 1 && fonte.size(txt + '…')[0] > larg) txt = txt.slice(0, -1);
  return txt + '…';
}

// ======================================================================
// A seção
// ======================================================================
let _campos = null;

export async function secao(app, fundo, neve) {
  // devolve null (voltou para o menu) ou 'sair'
  if (!app.rede) app.rede = new Rede();
  const rede = app.rede;
  if (!_campos) {
    _campos = {
      nome: new Campo('text', 'como você quer ser chamado', 16),
      email: new Campo('email', 'voce@email.com', 60),
      senha: new Campo('password', 'mínimo 4 letras ou números', 40),
      amigo: new Campo('email', 'e-mail do amigo', 60),
    };
  }
  const campos = _campos;
  rede.ligar();
  google.preparar(async (token, erro) => {   // a pessoa escolheu a conta do Google
    if (!token) { rede.erro_login = erro && /closed|cancel/i.test(String(erro)) ? '' : 'O Google não confirmou. Tente de novo.'; return; }
    if (rede.estado !== 'ligado') { rede.ligar(); rede.erro_login = 'Sem conexão com o servidor.'; return; }
    rede.erro_login = ''; rede.esperando_login = true;
    const rc_drive = await google.ler_recibo();   // o progresso salvo no Drive dela
    rede.enviar({ t: 'google', token, rc: google.mais_novo(Recibo.ler(), rc_drive) });
  });

  const voltar = new Botao('voltar', 'VOLTAR', 'voltar', { principal: true });
  const acao_login = new Botao('login', 'ENTRAR', 'jogar', { principal: true });
  let aba = 'entrar';            // 'entrar' | 'criar'
  let t = 0.0;
  let toast = null;              // [texto, tempo que resta]
  let alvos = [];                // [[retângulo, ação]] do último quadro (o de cima por último)
  let paineis = [];              // [[retângulo, chave]] áreas que rolam
  const rolagem = { amigos: 0, global: 0 };
  const maximo = { amigos: 0, global: 0 };
  let apertou = null;            // [pos, painel] onde o dedo desceu
  let arrastou = false;

  const avisar = (txt) => { toast = [txt, 3.2]; };
  const fechar = () => { for (const k in campos) campos[k].esconder(); google.esconder(); };

  const enviar_login = () => {
    const email = campos.email.valor.trim(), senha = campos.senha.valor, nome = campos.nome.valor.trim();
    if (rede.estado !== 'ligado') { rede.ligar(); rede.erro_login = 'Sem conexão com o servidor.'; app.som.tocar('erro'); return; }
    if (rede.google_novo) {   // conta nova pelo Google: só nome e ícone
      if (nome.length < 2) { rede.erro_login = 'Escreva um nome (2 a 16 letras).'; app.som.tocar('erro'); return; }
      rede.erro_login = ''; rede.esperando_login = true;
      rede.enviar({ t: 'google_criar', nome, avatar: rede.google_novo.icone || 0 });
      app.som.tocar('menu_clique');
      return;
    }
    return;   // (não há mais entrar com e-mail e senha)
    if (aba === 'criar' && nome.length < 2) { rede.erro_login = 'Escreva um nome (2 a 16 letras).'; app.som.tocar('erro'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { rede.erro_login = 'Escreva um e-mail válido.'; app.som.tocar('erro'); return; }
    if (senha.length < 4) { rede.erro_login = 'A senha precisa de 4 ou mais caracteres.'; app.som.tocar('erro'); return; }
    rede.erro_login = '';
    rede.esperando_login = true;
    const rc = Recibo.ler();   // se o servidor esqueceu a conta, o recibo do aparelho recupera
    rede.enviar(aba === 'criar' ? { t: 'criar', nome, email, senha, rc } : { t: 'entrar', email, senha, rc });
    app.som.tocar('menu_clique');
  };

  const fazer = (acao) => {
    const [o, id] = acao;
    if (o === 'aba') { aba = id; rede.erro_login = ''; app.som.tocar('menu_clique'); }
    else if (o === 'icone_novo') { if (rede.google_novo) rede.google_novo.icone = id; app.som.tocar('selecionar'); }
    else if (o === 'google_off') { avisar(google.estado() === 'carregando' ? 'Carregando o Google…' : 'O login com o Google ainda não foi ligado no servidor.'); app.som.tocar('erro'); }
    else if (o === 'google_cancelar') { rede.google_novo = null; rede.erro_login = ''; app.som.tocar('menu_voltar'); }
    else if (o === 'religar') { rede.ligar(); app.som.tocar('menu_clique'); }
    else if (o === 'sair_conta') { rede._saiu_de_vez = true; Recibo.apagar(); google.sair(); rede.religador.parar(); rede.enviar({ t: 'sair' }); rede._limpar(); campos.senha.valor = ''; app.som.tocar('menu_voltar'); }
    else if (o === 'pedir') { rede.enviar({ t: 'amigo_pedir', id }); app.som.tocar('menu_clique'); }
    else if (o === 'pedir_email') {
      const email = campos.amigo.valor.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { avisar('Escreva o e-mail do amigo.'); app.som.tocar('erro'); return; }
      rede.enviar({ t: 'amigo_pedir', email });
      campos.amigo.valor = '';
      app.som.tocar('menu_clique');
    }
    else if (o === 'aceitar_amigo') { rede.enviar({ t: 'amigo_responder', id, aceitar: true }); app.som.tocar('compra'); }
    else if (o === 'recusar_amigo') { rede.enviar({ t: 'amigo_responder', id, aceitar: false }); app.som.tocar('menu_voltar'); }
    else if (o === 'remover') { rede.enviar({ t: 'amigo_remover', id }); app.som.tocar('menu_voltar'); }
    else if (o === 'ver') { if (rede.abertos.has(id)) rede.abertos.delete(id); else rede.abertos.add(id); app.som.tocar('menu_clique'); }
    else if (o === 'convidar') { rede.enviar({ t: 'convidar', id }); app.som.tocar('ordem'); }
    else if (o === 'cancelar_convite') { rede.enviar({ t: 'convite_cancelar' }); app.som.tocar('menu_voltar'); }
    else if (o === 'aceitar_batalha') { rede.enviar({ t: 'convite_responder', de: id, aceitar: true }); rede.convites = rede.convites.filter(c => c.id !== id); }
    else if (o === 'recusar_batalha') { rede.enviar({ t: 'convite_responder', de: id, aceitar: false }); rede.convites = rede.convites.filter(c => c.id !== id); app.som.tocar('menu_voltar'); }
    else if (o === 'sair_sala') { rede.enviar({ t: 'sala_sair' }); rede.sala = null; app.som.tocar('menu_voltar'); }
    else if (o === 'pronto') { rede.enviar({ t: 'pronto' }); app.som.tocar('menu_clique'); }
    else if (o === 'perfil') { rede.perfil = true; app.som.tocar('menu_clique'); }
    else if (o === 'fechar_perfil') { rede.perfil = false; app.som.tocar('menu_clique'); }
    else if (o === 'avatar') { if (rede.eu.avatar !== id) { rede.enviar({ t: 'avatar', avatar: id }); rede.eu.avatar = id; rede._avatar_local = true; app.som.tocar('selecionar'); } }
    else if (o === 'modo') { if (rede.sala && rede.sala.modo !== id) { rede.enviar({ t: 'modo', modo: id }); app.som.tocar('menu_clique'); } }
    else if (o === 'ocupado') { avisar('Só dá para convidar quem está NO MENU.'); app.som.tocar('erro'); }
    else if (o === 'nada') { /* tocou num painel: não passa adiante */ }
  };

  for (;;) {
    const dt = await app.tick();
    t += dt;
    const vw = app.vw, vh = app.vh, u = app.u;
    const logado = rede.eu !== null;
    const modal = logado && (rede.sala || rede.convites.length || rede.perfil);

    if (rede.partida) {   // os dois ficaram prontos: a batalha começa
      fechar();
      return 'batalha';
    }

    // avisos que chegaram do servidor
    while (rede.avisos.length) {
      const [txt, som] = rede.avisos.shift();
      if (txt) avisar(txt);
      if (som) app.som.tocar(som);
    }
    for (const k in campos) {
      if (campos[k].enter) {
        campos[k].enter = false;
        if (k === 'amigo') fazer(['pedir_email']); else if (!logado) enviar_login();
      }
    }

    // ---- eventos ----
    for (const ev of app.eventos()) {
      const r = eventos_basicos(app, ev);
      if (r === 'sair') { fechar(); return 'sair'; }
      if (r === 'voltar') {
        // com a sala aberta o "voltar" do aparelho não tira ninguém da sala
        // (senão a caixa com PRONTO some da tela de quem saiu)
        if (logado && rede.sala) {
          avisar('Toque em PRONTO ou em Sair da sala.');
          app.som.tocar('erro');
          continue;
        }
        if (logado && rede.perfil && !rede.sala && !rede.convites.length) { rede.perfil = false; app.som.tocar('menu_voltar'); continue; }   // fecha o perfil
        if (logado && rede.convites.length) {   // com convite na tela: voltar = recusar
          fazer(['recusar_batalha', rede.convites[0].id]);
          continue;
        }
        app.som.tocar('menu_voltar');
        fechar();
        return null;
      }
      if (!modal) {
        const b = _passar_e_clicar(app, logado || !rede.google_novo ? [voltar] : [voltar, acao_login], ev);
        if (b === 'voltar' && rede.google_novo && !logado) { rede.google_novo = null; rede.erro_login = ''; app.som.tocar('menu_voltar'); continue; }
        if (b === 'voltar') {
          app.som.tocar('menu_voltar');
          fechar();
          return null;
        }
        if (b === 'login') enviar_login();
      }
      if (ev.type === 'MOUSEBUTTONDOWN' && ev.button === 1) {
        google.renovar_se_precisar();   // acesso ao Drive venceu e há progresso para salvar: renova num toque
        const p = paineis.find(([r0]) => dentro(r0, ev.pos));
        apertou = [ev.pos, p ? p[1] : null];
        arrastou = false;
        if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur();
      } else if (ev.type === 'MOUSEMOTION' && apertou) {
        if (!arrastou && Math.abs(ev.pos[1] - apertou[0][1]) + Math.abs(ev.pos[0] - apertou[0][0]) > 10 * u) arrastou = true;
        if (arrastou && apertou[1]) {
          const k = apertou[1];
          rolagem[k] = Math.max(0, Math.min(maximo[k], rolagem[k] - ev.rel[1]));
        }
      } else if (ev.type === 'MOUSEBUTTONUP' && ev.button === 1) {
        if (apertou && !arrastou) {
          for (let i = alvos.length - 1; i >= 0; i--) {
            if (dentro(alvos[i][0], ev.pos)) { fazer(alvos[i][1]); break; }
          }
        }
        apertou = null;
      } else if (ev.type === 'MOUSEWHEEL') {
        const p = paineis.find(([r0]) => dentro(r0, app.janela.mouse));
        if (p) rolagem[p[1]] = Math.max(0, Math.min(maximo[p[1]], rolagem[p[1]] - ev.y * 60 * u));
      }
    }
    for (const b of [voltar, acao_login]) b.aperto = Math.max(0.0, b.aperto - dt * 5);
    fundo.atualizar(dt);
    neve.atualizar(dt, vw, vh, u);
    if (toast) { toast[1] -= dt; if (toast[1] <= 0) toast = null; }

    // ---- desenho ----
    // de novo: um toque neste quadro pode ter aceitado/recusado o convite
    const logado_agora = rede.eu !== null;
    const modal_agora = logado_agora && (rede.sala || rede.convites.length || rede.perfil);
    const tela = app.tela;
    fundo.desenhar(tela);
    neve.desenhar(tela, u);
    alvos = [];
    paineis = [];
    const foco = document.activeElement;

    if (!logado_agora) {
      // ---------------- ENTRAR (só com o Google) ----------------
      campos.amigo.esconder(); campos.email.esconder(); campos.senha.esconder();
      const gn = rede.google_novo;   // conta Google nova: escolhe nome e ícone
      if (gn && !gn.preenchido) { campos.nome.valor = gn.nome || ''; gn.icone = Math.floor(Math.random() * 10); gn.preenchido = true; }
      if (!gn) campos.nome.esconder();
      const deitado_b = vw > vh;
      const pw = gn && deitado_b ? Math.min(900 * u, vw - 16 * u) : Math.min(470 * u, vw * 0.92);
      const duas = gn && deitado_b;   // nome+ícones à esquerda, botões à direita
      const col = duas ? (pw - 72 * u) / 2 : pw - 48 * u;
      const ph = gn ? (duas ? Math.min(vh - 16 * u, 62 * u + 290 * u) : 62 * u + 16 * u + 54 * u + 84 * u + 150 * u + 34 * u + 76 * u + 16 * u)
        : 62 * u + 16 * u + 70 * u + 54 * u + 22 * u + (rede.erro_login || rede.esperando_login || rede.estado !== 'ligado' ? 34 * u : 0) + 12 * u;
      const px = vw / 2 - pw / 2;
      const py = duas ? Math.max(8 * u, vh / 2 - ph / 2) : Math.max(8 * u, Math.min(vh / 2 - (ph + 84 * u) / 2, vh - ph - 92 * u));
      painel(app, tela, px, py, pw, ph, 'MULTIPLAYER');
      const xc = px + 24 * u, xb = duas ? px + 48 * u + col : xc, cxb = xb + col / 2;
      let y = py + 62 * u + 16 * u;
      // linha de estado
      let msg = rede.erro_login, cor = C.TIMES.vermelho.emblema;
      if (!msg) {
        cor = CINZA;
        if (rede.esperando_login) msg = 'Entrando' + '.'.repeat(1 + int(t * 2.5) % 3);
        else if (rede.estado === 'ligando') msg = 'Conectando ao servidor' + '.'.repeat(1 + int(t * 2.5) % 3);
        else if (rede.estado === 'fora') { msg = 'Servidor fora do ar. Toque aqui para tentar de novo.'; cor = C.TIMES.vermelho.emblema; }
        else msg = gn ? 'Escolha seu nome e o ícone da conta.' : '';
      }
      const fm = app.fonte(17 * u, false);
      if (gn) {
        // e-mail confirmado pelo Google
        const rg = [int(xc), int(y), int(col), int(40 * u)];
        pg.ret(tela, [232, 245, 236], rg, 0, int(10 * u));
        pg.ret(tela, VERDE_ESCURO, rg, Math.max(2, int(2 * u)), int(10 * u));
        logo_google(tela, rg[0] + 22 * u, rg[1] + rg[3] / 2, 10 * u);
        const fe = app.fonte(16 * u);
        const ie = fe.render(cortar(fe, '✓ ' + gn.email, rg[2] - 50 * u), VERDE_ESCURO);
        pg.blit(tela, ie, int(rg[0] + 40 * u), int(rg[1] + rg[3] / 2 - ie.height / 2));
        y += 54 * u;
        const img = app.fonte(20 * u).render('Nome no jogo', C.ESCURO);
        pg.blit(tela, img, int(xc + 2 * u), int(y));
        const rn = [int(xc), int(y + 24 * u), int(col), int(46 * u)];
        caixa_campo(app, tela, rn, foco === campos.nome.el);
        campos.nome.mostrar(app, rn, u);
        y += 84 * u;
        // ícone da conta (5 x 2)
        const passo = col / 5, rr = Math.min(22 * u, passo * 0.4), alt_i = Math.min(64 * u, passo);
        for (let i = 0; i < 10; i++) {
          const x = xc + passo * (i % 5) + passo / 2, yy = y + alt_i / 2 + Math.floor(i / 5) * alt_i;
          icones.avatar(tela, i, x, yy, rr, gn.icone === i);
          alvos.push([[int(x - passo / 2), int(yy - alt_i / 2), int(passo), int(alt_i)], ['icone_novo', i]]);
        }
        y = duas ? py + 62 * u + 16 * u : y + 2 * alt_i + 8 * u;
        const im = fm.render(cortar(fm, msg, col + 8 * u), cor);
        pg.blit(tela, im, int(cxb - im.width / 2), int(y + 4 * u));
        const bwl = Math.min(260 * u, col);
        acao_login.texto = 'CRIAR CONTA';
        acao_login.r = [cxb - bwl / 2, y + 38 * u, bwl, 58 * u];
        acao_login.desenhar(app, tela, t);
        google.esconder();
        voltar.principal = false;
        voltar.r = duas ? [cxb - bwl / 2, y + 38 * u + 72 * u, bwl, 54 * u] : [vw / 2 - 130 * u, Math.min(py + ph + 22 * u, vh - 62 * u), 260 * u, 58 * u];
        voltar.desenhar(app, tela, t);
      } else {
        // convite + o botão do Google
        const f1 = app.fonte(19 * u), f2 = app.fonte(15 * u, false);
        const l1 = f1.render('Jogue online com sua conta Google', C.ESCURO);
        pg.blit(tela, l1, int(vw / 2 - l1.width / 2), int(y));
        const l2 = f2.render(cortar(f2, 'Seu progresso fica salvo no seu Google Drive.', col), CINZA);
        pg.blit(tela, l2, int(vw / 2 - l2.width / 2), int(y + 28 * u));
        y += 70 * u;
        const gw = Math.min(320 * u, col), rg = [int(vw / 2 - gw / 2), int(y), int(gw), int(54 * u)];
        const ativo = google.estado() === 'pronto' && rede.estado === 'ligado' && !rede.esperando_login;
        pg.ret(tela, C.ESCURO, [rg[0], rg[1] + int(4 * u), rg[2], rg[3]], 0, int(27 * u));
        pg.ret(tela, C.BRANCO, rg, 0, int(27 * u));
        pg.ret(tela, ativo ? C.ESCURO : LINHA, rg, Math.max(2, int(2 * u)), int(27 * u));
        logo_google(tela, rg[0] + 32 * u, rg[1] + rg[3] / 2, 13 * u, google.estado() !== 'desligado');
        const ig = app.fonte(19 * u).render('Continuar com o Google', ativo ? C.ESCURO : CINZA);
        pg.blit(tela, ig, int(rg[0] + rg[2] / 2 - ig.width / 2 + 16 * u), int(rg[1] + rg[3] / 2 - ig.height / 2));
        if (ativo) google.mostrar(app, rg);   // o toque de verdade vai para o <button> por cima
        else { google.esconder(); alvos.push([rg, ['google_off']]); }
        y += 54 * u + 22 * u;
        if (msg) {
          const im = fm.render(cortar(fm, msg, col + 8 * u), cor);
          pg.blit(tela, im, int(vw / 2 - im.width / 2), int(y));
          if (rede.estado === 'fora') alvos.push([[int(px), int(y - 8 * u), int(pw), int(30 * u)], ['religar']]);
        }
        voltar.principal = false;
        voltar.r = [vw / 2 - 130 * u, Math.min(py + ph + 22 * u, vh - 62 * u), 260 * u, 58 * u];
        voltar.desenhar(app, tela, t);
      }
    } else {
      // ---------------- AMIGOS | GLOBAL ----------------
      campos.nome.esconder(); campos.email.esconder(); campos.senha.esconder(); google.esconder();
      const m = int(8 * u), alt = int(46 * u);
      // barra de cima: o CARTÃO DA CONTA (ícone, nome, troféus, likes) e "Sair da conta"
      const ls = largura_pilula(app, 'Sair da conta', 20);
      const rs = [vw - m - ls, m + int(5 * u), ls, int(36 * u)];
      const rp = cartao_conta(app, tela, rede.eu, m, m, rs[0] - 2 * m, alt);
      if (!modal_agora) alvos.push([rp, ['perfil']]);
      pilula(app, tela, rs, 'Sair da conta', 'claro', 20);
      if (!modal_agora) alvos.push([rs, ['sair_conta']]);

      // as duas metades: lado a lado deitado, uma em cima da outra em pé
      const topo = m + alt + 12 * u;
      const base = vh - 58 * u - 30 * u;
      const deitado = vw > vh * 1.15;
      const vao = 14 * u;
      let ra, rg;
      if (deitado) {
        const w = Math.min(560 * u, (vw - 3 * vao) / 2);
        const x0 = vw / 2 - (2 * w + vao) / 2;
        ra = [x0, topo, w, base - topo - 8 * u];
        rg = [x0 + w + vao, topo, w, base - topo - 8 * u];
      } else {
        const w = Math.min(560 * u, vw - 16 * u);
        const h = (base - topo - vao - 16 * u) / 2;
        ra = [vw / 2 - w / 2, topo, w, h];
        rg = [vw / 2 - w / 2, topo + h + vao + 8 * u, w, h];
      }
      const sobre = modal_agora ? [] : alvos;
      metade_amigos(app, tela, rede, ra, rolagem, maximo, sobre, paineis, campos.amigo, foco, modal_agora);
      metade_global(app, tela, rede, rg, rolagem, maximo, sobre, paineis);

      voltar.principal = true;
      voltar.r = [vw / 2 - 130 * u, vh - 58 * u - 20 * u, 260 * u, 58 * u];
      voltar.desenhar(app, tela, t);

      if (modal_agora) {
        campos.amigo.esconder();
        tela.fillStyle = pg.css([31, 41, 55, 140]);   // o mesmo véu da tela de fim da partida
        tela.fillRect(0, 0, vw, vh);
        if (rede.sala) caixa_sala(app, tela, rede, alvos, t);
        else if (rede.convites.length) caixa_convite(app, tela, rede, alvos);
        else if (rede.perfil) caixa_perfil(app, tela, rede, alvos);
      }
    }
    if (toast) _toast(app, tela, toast[0], toast[1], 0.12);
    if (rede.reconectando) _toast(app, tela, rede.texto_conexao, 1.0, 0.5);   // conexao.js: reconectando sozinho
  }
}

// ---------- cabeçalho e moldura de cada metade ---------------------------
function moldura(app, tela, r, titulo, etiqueta) {
  const u = app.u;
  const [px, py, pw, ph] = r;
  ret_arred(tela, C.ESCURO, [px, py + 7 * u, pw, ph], 16 * u);
  ret_arred(tela, C.BRANCO, [px, py, pw, ph], 16 * u);
  const cab = 50 * u;
  ret_arred(tela, C.TIMES.verde.esq, [px, py, pw, cab], 16 * u);
  pg.ret(tela, C.TIMES.verde.esq, [int(px), int(py + cab / 2), int(pw), int(cab / 2)]);
  const img = app.texto_grosso(titulo, 32 * u, C.BRANCO, int(3 * u));
  pg.blit(tela, img, int(px + 18 * u), int(py + cab / 2 - img.height / 2));
  if (etiqueta) {   // pílula à direita do cabeçalho (a etiqueta do botão do menu)
    const et = app.fonte(15 * u).render(etiqueta, C.ESCURO);
    const ew = et.width + 14 * u, eh = et.height + 6 * u;
    const ex = px + pw - ew - 14 * u, ey = py + cab / 2 - eh / 2;
    ret_arred(tela, C.BRANCO, [ex, ey, ew, eh], eh / 2);
    pg.blit(tela, et, int(ex + 7 * u), int(ey + 3 * u));
  }
  return cab;
}

function borda_moldura(app, tela, r) {
  // a borda escura vai por último, por cima da lista que rola
  const u = app.u;
  ret_arred(tela, C.ESCURO, r, 16 * u, Math.max(3, int(3 * u)));
}

function linha_pessoa(app, tela, x, y, w, nome, sub, cor_bolinha, botoes, alvos, recorte, perfil = null) {
  // uma linha da lista: bolinha, nome, situação e os botões à direita.
  // botoes = [[texto, estilo, ação]] da direita para a esquerda
  // perfil = { avatar, trofeus, likes, vitorias, derrotas }: vira um cartãozinho com ícone e números
  const u = app.u;
  if (perfil) return linha_perfil(app, tela, x, y, w, nome, sub, cor_bolinha, botoes, alvos, recorte, perfil);
  const h = 54 * u;
  let bx = x + w - 12 * u;
  for (const [txt, estilo, acao] of botoes) {
    const bw = largura_pilula(app, txt, 16);
    bx -= bw;
    const r = [int(bx), int(y + h / 2 - 17 * u), bw, int(34 * u)];
    pilula(app, tela, r, txt, estilo, 16);
    if (acao && r[1] + r[3] > recorte[0] && r[1] < recorte[1]) {
      alvos.push([[r[0], Math.max(r[1], recorte[0]), r[2], Math.min(r[1] + r[3], recorte[1]) - Math.max(r[1], recorte[0])], acao]);
    }
    bx -= 6 * u;
  }
  pg.circulo(tela, C.ESCURO, x + 22 * u, y + h / 2, 8 * u);
  pg.circulo(tela, cor_bolinha, x + 22 * u, y + h / 2, 6 * u);
  const fn = app.fonte(24 * u);
  const larg = bx - (x + 40 * u) - 4 * u;
  const img = fn.render(cortar(fn, nome, Math.max(20 * u, larg)), C.ESCURO);
  pg.blit(tela, img, int(x + 40 * u), int(y + (sub ? 8 * u : h / 2 - img.height / 2)));
  if (sub) {
    const fs = app.fonte(14 * u, false);
    const is = fs.render(cortar(fs, sub, Math.max(20 * u, larg)), CINZA);
    pg.blit(tela, is, int(x + 40 * u), int(y + 32 * u));
  }
  pg.linha(tela, LINHA, [x + 14 * u, y + h], [x + w - 14 * u, y + h], Math.max(1, int(u)));
  return h;
}

function botoes_linha(app, tela, x, y, w, h, botoes, alvos, recorte) {
  const u = app.u;
  let bx = x + w - 12 * u;
  for (const [txt, estilo, acao] of botoes) {
    const bw = largura_pilula(app, txt, 15);
    bx -= bw;
    const r = [int(bx), int(y + h / 2 - 16 * u), bw, int(32 * u)];
    pilula(app, tela, r, txt, estilo, 15);
    if (acao && r[1] + r[3] > recorte[0] && r[1] < recorte[1]) {
      alvos.push([[r[0], Math.max(r[1], recorte[0]), r[2], Math.min(r[1] + r[3], recorte[1]) - Math.max(r[1], recorte[0])], acao]);
    }
    bx -= 6 * u;
  }
  return bx;
}

function linha_perfil(app, tela, x, y, w, nome, sub, cor_bolinha, botoes, alvos, recorte, p) {
  // cartãozinho de jogador: ícone com bolinha de situação, nome, troféus, likes e V/D
  const u = app.u, h = 68 * u;
  pg.ret(tela, [244, 247, 251], [int(x + 8 * u), int(y + 4 * u), int(w - 16 * u), int(h - 8 * u)], 0, int(12 * u));
  const bx = botoes_linha(app, tela, x - 4 * u, y, w, h, botoes, alvos, recorte);
  const ax = x + 38 * u, ay = y + h / 2;
  icones.avatar(tela, p.avatar || 0, ax, ay, 22 * u);
  pg.circulo(tela, C.ESCURO, int(ax + 16 * u), int(ay + 16 * u), int(7 * u));
  pg.circulo(tela, cor_bolinha, int(ax + 16 * u), int(ay + 16 * u), int(5 * u));
  const tx = x + 68 * u, larg = Math.max(20 * u, bx - tx - 6 * u);
  const fn = app.fonte(21 * u);
  const img = fn.render(cortar(fn, nome, larg), C.ESCURO);
  pg.blit(tela, img, int(tx), int(y + 9 * u));
  // números: troféus, likes, vitórias/derrotas
  const fs = app.fonte(14 * u);
  let xx = tx, yy = y + 44 * u;
  icone_trofeu(tela, xx + 7 * u, yy, 8 * u); xx += 17 * u;
  const n1 = fs.render(String(p.trofeus || 0), C.ESCURO); pg.blit(tela, n1, int(xx), int(yy - n1.height / 2)); xx += n1.width + 12 * u;
  if (xx + 40 * u < bx) {
    icone_coracao(tela, xx + 6 * u, yy, 6 * u); xx += 15 * u;
    const n2 = fs.render(String(p.likes || 0), C.ESCURO); pg.blit(tela, n2, int(xx), int(yy - n2.height / 2)); xx += n2.width + 12 * u;
  }
  if (xx + 30 * u < bx) {
    const larg2 = bx - xx - 6 * u;
    const f2 = app.fonte(13 * u, false);
    const t2 = f2.render(cortar(f2, `${p.vitorias || 0}V ${p.derrotas || 0}D` + (sub ? ' · ' + sub : ''), larg2), CINZA);
    pg.blit(tela, t2, int(xx), int(yy - t2.height / 2));
  }
  return h;
}

export function largura_cartao(app, eu, wmax) {
  const u = app.u;
  const fn = app.fonte(20 * u), fs = app.fonte(15 * u);
  const nums = 17 * u + fs.size(String(eu.trofeus || 0))[0] + 14 * u + 15 * u + fs.size(String(eu.likes || 0))[0];
  const nome = cortar(fn, eu.nome, Math.max(40 * u, wmax - 70 * u - 20 * u));
  return Math.min(wmax, Math.max(fn.size(nome)[0], nums) + int(74 * u));
}

export function cartao_conta(app, tela, eu, x, y, wmax, h) {
  // o cartão da sua conta no topo: ícone, nome e os números (toque: muda o ícone)
  const u = app.u;
  const fn = app.fonte(20 * u), fs = app.fonte(15 * u);
  const n1 = fs.render(String(eu.trofeus || 0), C.BRANCO), n2 = fs.render(String(eu.likes || 0), C.BRANCO);
  const nome = cortar(fn, eu.nome, Math.max(40 * u, wmax - 70 * u - 20 * u));
  const w = largura_cartao(app, eu, wmax);
  pg.ret(tela, C.ESCURO, [x, y, w, h], 0, int(12 * u));
  icones.avatar(tela, eu.avatar || 0, x + 26 * u, y + h / 2, 19 * u);
  const ie = fn.render(nome, C.BRANCO);
  pg.blit(tela, ie, int(x + 52 * u), int(y + 4 * u));
  let xx = x + 52 * u, yy = y + h - 12 * u;
  icone_trofeu(tela, xx + 7 * u, yy, 7 * u); xx += 17 * u;
  pg.blit(tela, n1, int(xx), int(yy - n1.height / 2)); xx += n1.width + 14 * u;
  icone_coracao(tela, xx + 6 * u, yy, 6 * u); xx += 15 * u;
  pg.blit(tela, n2, int(xx), int(yy - n2.height / 2));
  // lapisinho: dá para trocar o ícone
  pg.circulo(tela, C.BRANCO, int(x + 40 * u), int(y + h / 2 + 13 * u), int(7 * u));
  const lp = app.fonte(10 * u).render('✎', C.ESCURO);
  pg.blit(tela, lp, int(x + 40 * u - lp.width / 2), int(y + h / 2 + 13 * u - lp.height / 2));
  return [int(x), int(y), int(w), int(h)];
}

function caixa_perfil(app, tela, rede, alvos) {
  // escolher o ícone da conta + os números do perfil
  const u = app.u, eu = rede.eu;
  const bw = Math.min(420 * u, app.vw - 24 * u), bh = Math.min(app.vh - 16 * u, 352 * u);
  const r = caixa(app, tela, bw, bh);
  alvos.push([[r[0], r[1], r[2], r[3]], ['nada']]);   // (primeiro: os botões por cima ganham)
  const cx = r[0] + r[2] / 2;
  texto_centro(app, tela, 'Seu perfil', 28, VERDE_ESCURO, cx, r[1] + 26 * u);
  // cabeçalho: ícone grande, nome e números
  icones.avatar(tela, eu.avatar || 0, r[0] + 50 * u, r[1] + 82 * u, 28 * u);
  const fn = app.fonte(22 * u);
  pg.blit(tela, fn.render(cortar(fn, eu.nome, bw - 110 * u), C.ESCURO), int(r[0] + 90 * u), int(r[1] + 58 * u));
  const fs = app.fonte(15 * u);
  let xx = r[0] + 90 * u, yy = r[1] + 100 * u;
  icone_trofeu(tela, xx + 7 * u, yy, 8 * u); xx += 18 * u;
  let im = fs.render(`${eu.trofeus || 0} troféus`, C.ESCURO); pg.blit(tela, im, int(xx), int(yy - im.height / 2)); xx += im.width + 12 * u;
  icone_coracao(tela, xx + 6 * u, yy, 6 * u); xx += 16 * u;
  im = fs.render(`${eu.likes || 0} likes`, C.ESCURO); pg.blit(tela, im, int(xx), int(yy - im.height / 2)); xx += im.width + 12 * u;
  im = app.fonte(14 * u, false).render(`${eu.vitorias || 0}V ${eu.derrotas || 0}D`, CINZA); pg.blit(tela, im, int(xx), int(yy - im.height / 2));
  // grade de ícones (5 x 2)
  texto_centro(app, tela, 'Escolha o ícone da sua conta', 15, CINZA, cx, r[1] + 128 * u, false);
  const passo = Math.min(70 * u, (bw - 30 * u) / 5), rr = Math.min(25 * u, passo * 0.38);
  const gy = r[1] + 146 * u, alt_grade = Math.min(2 * passo, bh - 146 * u - 70 * u);
  const py = alt_grade / 2;
  for (let i = 0; i < 10; i++) {
    const x = cx + ((i % 5) - 2) * passo, y = gy + py / 2 + Math.floor(i / 5) * py;
    icones.avatar(tela, i, x, y, rr, (eu.avatar || 0) === i);
    alvos.push([[int(x - passo / 2), int(y - py / 2), int(passo), int(py)], ['avatar', i]]);
  }
  const rb = [int(cx - 90 * u), int(r[1] + bh - 56 * u), int(180 * u), int(44 * u)];
  pilula(app, tela, rb, 'PRONTO', 'verde', 21);
  alvos.push([rb, ['fechar_perfil']]);
}

function titulo_lista(app, tela, x, y, txt) {
  const u = app.u;
  const img = app.fonte(15 * u).render(txt, CINZA);
  pg.blit(tela, img, int(x + 16 * u), int(y + 8 * u));
  return 28 * u;
}

function vazio(app, tela, x, y, w, linhas) {
  const u = app.u;
  const f = app.fonte(17 * u, false);
  let yy = y + 18 * u;
  for (const l of linhas) {
    const img = f.render(cortar(f, l, w - 24 * u), CINZA);
    pg.blit(tela, img, int(x + w / 2 - img.width / 2), int(yy));
    yy += 24 * u;
  }
  return yy - y + 10 * u;
}

function recortar(tela, r, desenhar) {
  tela.save();
  tela.beginPath();
  tela.rect(r[0], r[1], r[2], r[3]);
  tela.clip();
  desenhar();
  tela.restore();
}

// ---------- AMIGOS ---------------------------------------------------------
// ---------- tempos de cada jogador (abinha) ----------------------------------
function fmt_tempo(ms) {
  const min = Math.floor(ms / 60000), h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${m} min`;
}

// as três linhas, separadas; o tempo que está rodando anda desde a chegada do estado
function bloco_tempos(app, tela, x, y, w, rede, t) {
  const u = app.u;
  const h = 76 * u;
  const fn = app.fonte(15 * u, false);
  const itens = [['Online', 'online'], ['Batalha (contra a IA)', 'batalha'], ['PvP', 'pvp']];
  itens.forEach(([rot, k], i) => {
    const ms = t.tempos[k] + (t.rodando.includes(k) ? Date.now() - rede.recebido : 0);
    const img = fn.render(`${rot}: ${fmt_tempo(ms)}`, C.ESCURO);
    pg.blit(tela, img, int(x + 40 * u), int(y + (12 + i * 20) * u));
  });
  pg.linha(tela, LINHA, [x + 14 * u, y + h], [x + w - 14 * u, y + h], Math.max(1, int(u)));
  return h;
}

function metade_amigos(app, tela, rede, r, rolagem, maximo, alvos, paineis, campo, foco, modal) {
  const u = app.u;
  const [px, py, pw, ph] = r;
  const amigos_on = rede.online.filter(o => rede.amigos.has(o.id));
  const cab = moldura(app, tela, r, 'AMIGOS', `${amigos_on.length} ON`);
  // rodapé fixo: chamar um amigo pelo e-mail
  const rod = 62 * u;
  const lb = largura_pilula(app, 'ADICIONAR', 17);
  const rc = [int(px + 14 * u), int(py + ph - rod + 8 * u), int(pw - 28 * u - lb - 8 * u), int(40 * u)];
  const rb = [int(px + pw - 14 * u - lb), int(py + ph - rod + 8 * u), lb, int(40 * u)];
  const area = [px, py + cab, pw, ph - cab - rod];
  if (!modal) alvos.push([[int(px), int(py), int(pw), int(ph)], ['nada']]);
  paineis.push([area, 'amigos']);
  const recorte = [area[1], area[1] + area[3]];
  let y = area[1] - rolagem.amigos;
  recortar(tela, area, () => {
    if (rede.pedidos.length) {
      y += titulo_lista(app, tela, px, y, 'PEDIDOS DE AMIZADE');
      for (const p of rede.pedidos) {
        y += linha_pessoa(app, tela, px, y, pw, p.nome, 'quer ser seu amigo', C.MOEDA,
          [['RECUSAR', 'claro', ['recusar_amigo', p.id]], ['ACEITAR', 'verde', ['aceitar_amigo', p.id]]], alvos, recorte,
          rede.todos.find(t => t.id === p.id) || { avatar: 0 });
      }
    }
    if (amigos_on.length) {
      if (rede.pedidos.length) y += titulo_lista(app, tela, px, y, 'AMIGOS ON');
      for (const o of amigos_on) {
        let principal;
        if (rede.convite_para === o.id) principal = ['CANCELAR', 'escuro', ['cancelar_convite']];
        else if (o.status !== 'menu') principal = ['CONVIDAR', 'apagado', ['ocupado']];
        else principal = ['CONVIDAR', 'verde', ['convidar', o.id]];
        const tod = rede.todos.find(t => t.id === o.id);
        const sub = rede.convite_para === o.id ? 'convite enviado…' : (ROTULO_STATUS[o.status] || '');
        const botoes = [['X', 'claro', ['remover', o.id]], principal];
        if (tod) botoes.push(['TEMPOS', 'claro', ['ver', o.id]]);
        y += linha_pessoa(app, tela, px, y, pw, o.nome, sub, C.TIMES.verde.base, botoes, alvos, recorte, tod || { avatar: 0 });
        if (tod && rede.abertos.has(o.id)) y += bloco_tempos(app, tela, px, y, pw, rede, tod);
      }
    } else if (!rede.pedidos.length) {
      y += vazio(app, tela, px, y, pw, ['Nenhum amigo on agora.', 'Peça amizade pela lista GLOBAL', 'ou pelo e-mail aqui embaixo.']);
    }
  });
  maximo.amigos = Math.max(0, (y + rolagem.amigos) - (area[1] + area[3]));
  rolagem.amigos = Math.min(rolagem.amigos, maximo.amigos);
  // rodapé
  pg.linha(tela, LINHA, [px + 10 * u, py + ph - rod], [px + pw - 10 * u, py + ph - rod], Math.max(1, int(u)));
  caixa_campo(app, tela, rc, foco === campo.el);
  if (!modal) campo.mostrar(app, rc, u);
  pilula(app, tela, rb, 'ADICIONAR', 'verde', 17);
  if (!modal) alvos.push([rb, ['pedir_email']]);
  borda_moldura(app, tela, r);
}

// ---------- GLOBAL -----------------------------------------------------------
function metade_global(app, tela, rede, r, rolagem, maximo, alvos, paineis) {
  const u = app.u;
  const [px, py, pw, ph] = r;
  const cab = moldura(app, tela, r, 'JOGADORES', `${rede.online.length} ON`);
  const area = [px, py + cab, pw, ph - cab - 6 * u];
  alvos.push([[int(px), int(py), int(pw), int(ph)], ['nada']]);
  paineis.push([area, 'global']);
  const recorte = [area[1], area[1] + area[3]];
  let y = area[1] - rolagem.global;
  recortar(tela, area, () => {
    y += titulo_lista(app, tela, px, y, 'QUEM JÁ ENTROU');
    const eu = rede.eu.id;
    const peso = (o) => (o.id === eu ? 0 : o.status === 'off' ? 2 : 1);   // você, on, off
    const ordem = rede.todos.slice().sort((a, b) => peso(a) - peso(b));
    for (const o of ordem) {
      let botoes;
      if (o.id === eu) botoes = [['VOCÊ', 'escuro', null]];
      else if (rede.amigos.has(o.id)) botoes = [['AMIGO', 'amigo', null]];
      else if (rede.pedidos.some(p => p.id === o.id)) botoes = [['ACEITAR', 'verde', ['aceitar_amigo', o.id]]];
      else if (rede.enviados.has(o.id)) botoes = [['PEDIDO ENVIADO', 'apagado', null]];
      else botoes = [['+ AMIGO', 'claro', ['pedir', o.id]]];
      botoes = [...botoes, ['TEMPOS', 'claro', ['ver', o.id]]];
      const off = o.status === 'off';
      y += linha_pessoa(app, tela, px, y, pw, o.nome, off ? 'OFF' : (ROTULO_STATUS[o.status] || ''),
        off ? LINHA : (o.status === 'menu' ? C.TIMES.verde.base : C.MOEDA), botoes, alvos, recorte, o);
      if (rede.abertos.has(o.id)) y += bloco_tempos(app, tela, px, y, pw, rede, o);
    }
  });
  maximo.global = Math.max(0, (y + rolagem.global) - (area[1] + area[3]));
  rolagem.global = Math.min(rolagem.global, maximo.global);
  borda_moldura(app, tela, r);
}

// ---------- caixas por cima (o mesmo desenho da caixa de fim de jogo) --------
function caixa(app, tela, bw, bh) {
  const u = app.u;
  const r = [int((app.vw - bw) / 2), int((app.vh - bh) / 2), int(bw), int(bh)];
  pg.ret(tela, C.BRANCO, r, 0, int(12 * u));
  pg.ret(tela, C.ESCURO, r, Math.max(2, int(2 * u)), int(12 * u));
  return r;
}

function texto_centro(app, tela, txt, tam, cor, cx, cy, negrito = true) {
  const img = app.fonte(tam * app.u, negrito).render(txt, cor);
  pg.blit(tela, img, int(cx - img.width / 2), int(cy - img.height / 2));
}

function caixa_convite(app, tela, rede, alvos) {
  const u = app.u;
  const c = rede.convites[0];
  if (!c) return;
  const bw = Math.min(360 * u, app.vw - 24 * u), bh = 196 * u;
  const r = caixa(app, tela, bw, bh);
  const cx = r[0] + r[2] / 2;
  texto_centro(app, tela, 'Convite de batalha', 34, VERDE_ESCURO, cx, r[1] + 38 * u);
  const f = app.fonte(21 * u);
  texto_centro(app, tela, cortar(f, c.nome, bw - 30 * u), 21, C.ESCURO, cx, r[1] + 78 * u);
  texto_centro(app, tela, 'chamou você para uma batalha.', 18, C.ESCURO, cx, r[1] + 102 * u, false);
  const lw = (bw - 54 * u) / 2;
  const ra = [int(r[0] + 20 * u), int(r[1] + bh - 64 * u), int(lw), int(44 * u)];
  const rr = [int(r[0] + 34 * u + lw), int(r[1] + bh - 64 * u), int(lw), int(44 * u)];
  pilula(app, tela, ra, 'ACEITAR', 'verde', 21);
  pilula(app, tela, rr, 'RECUSAR', 'claro', 21);
  alvos.push([ra, ['aceitar_batalha', c.id]], [rr, ['recusar_batalha', c.id]]);
}

function caixa_sala(app, tela, rede, alvos, t) {
  const u = app.u;
  const s = rede.sala;
  const eu_pronto = s.prontos.includes(rede.eu.id);
  const bw = Math.min(380 * u, app.vw - 24 * u), bh = 352 * u;
  const r = caixa(app, tela, bw, bh);
  const cx = r[0] + r[2] / 2;
  texto_centro(app, tela, 'Sala de batalha', 30, VERDE_ESCURO, cx, r[1] + 32 * u);
  // os dois lados, com as cores dos times do jogo
  const f = app.fonte(23 * u);
  let y = r[1] + 66 * u;
  for (const [lado, quem] of [['verde', s.verde], ['vermelho', s.vermelho]]) {
    const rl = [int(r[0] + 20 * u), int(y), int(bw - 40 * u), int(44 * u)];
    pg.ret(tela, C.ESCURO, [rl[0] - 2, rl[1] - 2, rl[2] + 4, rl[3] + 4], 0, int(8 * u));
    pg.ret(tela, C.TIMES[lado].base, rl, 0, int(8 * u));
    const pronto = s.prontos.includes(quem.id);
    icones.avatar(tela, quem.avatar || 0, rl[0] + 22 * u, rl[1] + rl[3] / 2, 17 * u);
    const et = app.fonte(14 * u).render((lado === 'verde' ? 'VERDE' : 'VERMELHO') + (pronto ? ' · PRONTO' : ''), C.BRANCO);
    pg.blit(tela, et, int(rl[0] + 46 * u), int(rl[1] + 5 * u));
    const tr = app.fonte(13 * u, false).render(`${quem.trofeus || 0} troféus · ${quem.likes || 0} likes`, C.BRANCO);
    pg.blit(tela, tr, int(rl[0] + 46 * u), int(rl[1] + rl[3] - tr.height - 5 * u));
    const nome = cortar(f, quem.nome + (quem.id === rede.eu.id ? ' (você)' : ''), rl[2] - Math.max(et.width, tr.width) - 70 * u);
    const img = f.render(nome, C.BRANCO);
    pg.blit(tela, img, int(rl[0] + rl[2] - img.width - 12 * u), int(rl[1] + rl[3] / 2 - img.height / 2));
    y += 54 * u;
  }
  const vs = app.texto_grosso('VS', 26 * u, C.BRANCO, int(3 * u));
  pg.blit(tela, vs, int(cx - vs.width / 2), int(r[1] + 66 * u + 49 * u - vs.height / 2));
  const outro = s.verde.id === rede.eu.id ? s.vermelho : s.verde;
  let linha;
  if (eu_pronto) linha = `Esperando ${outro.nome} ficar pronto` + '.'.repeat(1 + int(t * 2.5) % 3);
  else if (s.prontos.includes(outro.id)) linha = `${outro.nome} está pronto. Toque em PRONTO!`;
  else linha = 'Toque em PRONTO quando quiser começar.';
  const fl = app.fonte(17 * u, false);
  // modo da partida (qualquer um troca; os dois voltam a "não pronto")
  const modo = s.modo || 'vale_tudo';
  const lm = (bw - 50 * u) / 2;
  C.PVP_MODOS.forEach((k, i) => {
    const rm = [int(r[0] + 20 * u + i * (lm + 10 * u)), int(r[1] + 176 * u), int(lm), int(38 * u)];
    pilula(app, tela, rm, C.NOME_MODO[k], modo === k ? 'escuro' : 'claro', 17);
    alvos.push([rm, ['modo', k]]);
  });
  const fd = app.fonte(14 * u, false);
  texto_centro(app, tela, cortar(fd, C.DICA_MODO[modo], bw - 30 * u), 14, CINZA, cx, r[1] + 230 * u, false);
  texto_centro(app, tela, `Partida de ${C.PVP_DURACAO / 60} min · troféus calculados no fim`, 13, CINZA, cx, r[1] + 248 * u, false);
  texto_centro(app, tela, cortar(fl, linha, bw - 30 * u), 17, C.ESCURO, cx, r[1] + 274 * u, false);
  const lw = (bw - 54 * u) / 2;
  const rp = [int(r[0] + 20 * u), int(r[1] + bh - 64 * u), int(lw), int(46 * u)];
  const rb = [int(r[0] + 34 * u + lw), int(r[1] + bh - 64 * u), int(lw), int(46 * u)];
  pilula(app, tela, rp, eu_pronto ? 'PRONTO ✓' : 'PRONTO', eu_pronto ? 'amigo' : 'verde', 21);
  pilula(app, tela, rb, 'Sair da sala', 'escuro', 21);
  alvos.push([rp, ['pronto']], [rb, ['sair_sala']]);
}
