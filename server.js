// server.js — servidor do Guardians vs Troops (web).
//
// Faz duas coisas, sem instalar NADA (só o Node.js):
//   1. entrega o jogo (a pasta public/) pelo navegador
//   2. cuida do multiplayer por WebSocket: entrar / criar conta (sempre com
//      e-mail), quem está on (GLOBAL), amigos e convites de batalha
//
// Rodar:   node server.js          (porta 8080)
//          PORT=3000 node server.js
// Depois abra no navegador o endereço que aparecer aqui embaixo.
//
// NADA É GUARDADO EM DISCO. Tudo fica na memória deste processo: fechou o
// servidor, sumiu tudo. Quem fica off some das listas na hora.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const os = require('os');
const { pathToFileURL } = require('url');

const PORTA = parseInt(process.env.PORT || '8080', 10);
const PUBLICO = path.join(__dirname, 'public');

// O proxy da hospedagem pode entregar um Host interno. O endereço público
// vem da configuração do servidor, nunca de um cabeçalho enviado pelo cliente.
const HOSTS_PUBLICOS = new Set();
for (const endereco of [process.env.RENDER_EXTERNAL_URL,
  process.env.RENDER_EXTERNAL_HOSTNAME && 'https://' + process.env.RENDER_EXTERNAL_HOSTNAME,
  ...(process.env.ORIGENS_PUBLICAS || '').split(',')]) {
  if (!endereco) continue;
  try {
    const url = new URL(endereco.trim());
    if (url.protocol === 'http:' || url.protocol === 'https:') HOSTS_PUBLICOS.add(url.host);
  } catch (_) { console.warn('[multiplayer] Endereço público inválido na configuração.'); }
}

// true  = ao ficar off a CONTA também é apagada (tem que criar de novo sempre)
// false = a conta fica na memória até o servidor fechar, então ENTRAR funciona
//         quando o jogador volta; fora isso ele some das listas igual
const APAGAR_CONTA_AO_SAIR = false;
// Dados simples: contas (senha só como hash com sal) e tempos. Fica num arquivo JSON local.
const ARQUIVO_DADOS = process.env.DADOS_ARQUIVO || path.join(__dirname, 'dados.json');
const SALVAR_A_CADA = 30 * 1000;

const CONVITE_VALE = 30 * 1000;      // um convite de batalha espera 30 s
const SEM_SINAL = 45 * 1000;         // conexão muda por 45 s = caiu
const MAX_MENSAGEM = 4096;           // bytes
const COMPRIMIR_ACIMA = 512;          // mensagens menores vão sem compressão
const MAX_POR_SEGUNDO = 40;          // mensagens por conexão
const MAX_ONLINE = 500;
const PASSO = 1 / 30;                // a batalha roda a 30 passos por segundo...
const FOTOS_A_CADA = 3;              // ...e manda um retrato a cada 3 passos (10 por segundo)

// as regras da batalha entre jogadores são as do próprio jogo (public/js)
let PvP = null, LIMITES = null, GRUPOS = null, CFG = null;
Promise.all([
  import(pathToFileURL(path.join(PUBLICO, 'js', 'tropas_pvp.js')).href),
  import(pathToFileURL(path.join(PUBLICO, 'js', 'som.js')).href),
  import(pathToFileURL(path.join(PUBLICO, 'js', 'config.js')).href),
]).then(([pvp, som, cfg]) => {
  PvP = pvp; LIMITES = som._LIMITE; GRUPOS = som._GRUPO; CFG = cfg;
}).catch((e) => console.error('Não deu para carregar as regras da batalha:', e));

// ======================================================================
// 1. Arquivos do jogo
// ======================================================================
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.wav': 'audio/wav', '.ttf': 'font/ttf', '.png': 'image/png',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

const servidor = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); res.end(); return;
  }
  let caminho;
  try {
    caminho = decodeURIComponent(req.url.split('?')[0]);
  } catch (_) {
    res.writeHead(400); res.end(); return;
  }
  if (caminho === '/config.json') {   // o que o aparelho precisa saber (ex.: o botão do Google)
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ google: GOOGLE_CLIENT_ID || null }));
    return;
  }
  if (caminho === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({
      ok: true, multiplayer: true, revisao: 'online-1', online: online.size, regras: PvP !== null,
    }));
    return;
  }
  if (caminho === '/') caminho = '/index.html';
  const arquivo = path.normalize(path.join(PUBLICO, caminho));
  if (arquivo !== PUBLICO && !arquivo.startsWith(PUBLICO + path.sep)) {   // nada fora da pasta public
    res.writeHead(403); res.end(); return;
  }
  fs.stat(arquivo, (erro, st) => {
    if (erro || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado');
      return;
    }
    const ext = path.extname(arquivo).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TIPOS[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      // sons e fonte não mudam: o navegador pode guardar; o código sempre é conferido
      'Cache-Control': (ext === '.wav' || ext === '.ttf') ? 'public, max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(arquivo).pipe(res);
  });
});

// ======================================================================
// 2. WebSocket feito à mão (RFC 6455), só o que o jogo usa
// ======================================================================
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class Conexao {
  constructor(soquete) {
    this.soquete = soquete;
    this.resto = Buffer.alloc(0);
    this.pedacos = [];         // mensagem vinda em vários quadros
    this.aberta = true;
    this.visto = Date.now();
    this.janela = 0;           // controle de excesso de mensagens
    this.contagem = 0;
    this.usuario = null;       // conta que entrou por esta conexão
    this.deflate = false;      // compressão do WebSocket (permessage-deflate) combinada no aperto de mão
    this.comprimida = false;   // a mensagem que está chegando veio comprimida
    soquete.setNoDelay(true);
    soquete.on('data', (d) => this._dados(d));
    soquete.on('end', () => this._fim());
    soquete.on('close', () => this._fim());
    soquete.on('error', () => this._fim());
  }

  _fim() {
    if (!this.aberta) return;
    this.aberta = false;
    try { this.soquete.destroy(); } catch (_) { /* ok */ }
    ao_fechar(this);
  }

  fechar() {
    if (!this.aberta) return;
    try { this.soquete.write(Buffer.from([0x88, 0x00])); } catch (_) { /* ok */ }
    this._fim();
  }

  _quadro(op, dados, rsv = 0) {
    const n = dados.length;
    const b0 = 0x80 | rsv | op;
    let cab;
    if (n < 126) cab = Buffer.from([b0, n]);
    else if (n < 65536) { cab = Buffer.alloc(4); cab[0] = b0; cab[1] = 126; cab.writeUInt16BE(n, 2); }
    else { cab = Buffer.alloc(10); cab[0] = b0; cab[1] = 127; cab.writeUInt32BE(0, 2); cab.writeUInt32BE(n, 6); }
    try { this.soquete.write(Buffer.concat([cab, dados])); } catch (_) { this._fim(); }
  }

  enviar(obj) {
    if (!this.aberta) return;
    this.enviar_texto(JSON.stringify(obj));
  }

  enviar_texto(txt) {
    if (!this.aberta) return;
    const dados = Buffer.from(txt, 'utf8');
    // os retratos da batalha são grandes e cheios de números repetidos:
    // comprimidos ficam várias vezes menores (o navegador descomprime sozinho)
    if (this.deflate && dados.length > COMPRIMIR_ACIMA) {
      const z = zlib.deflateRawSync(dados, { level: 3, finishFlush: zlib.constants.Z_SYNC_FLUSH });
      this._quadro(0x1, z.subarray(0, z.length - 4), 0x40);   // sem o 00 00 FF FF do final (RFC 7692)
    } else {
      this._quadro(0x1, dados);
    }
  }

  ping() {
    if (this.aberta) this._quadro(0x9, Buffer.alloc(0));
  }

  _dados(d) {
    this.resto = this.resto.length ? Buffer.concat([this.resto, d]) : d;
    for (;;) {
      const b = this.resto;
      if (b.length < 2) return;
      const fim = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, rsv1 = (b[0] & 0x40) !== 0;
      if (rsv1 && !this.deflate) { this.fechar(); return; }
      const mascarado = (b[1] & 0x80) !== 0;
      let n = b[1] & 0x7f, pos = 2;
      if (n === 126) {
        if (b.length < 4) return;
        n = b.readUInt16BE(2); pos = 4;
      } else if (n === 127) {
        if (b.length < 10) return;
        if (b.readUInt32BE(2) !== 0) { this.fechar(); return; }
        n = b.readUInt32BE(6); pos = 10;
      }
      if (!mascarado || n > MAX_MENSAGEM) { this.fechar(); return; }   // navegador sempre mascara
      if (b.length < pos + 4 + n) return;
      const mascara = b.subarray(pos, pos + 4);
      const dados = Buffer.from(b.subarray(pos + 4, pos + 4 + n));
      for (let i = 0; i < n; i++) dados[i] ^= mascara[i & 3];
      this.resto = b.subarray(pos + 4 + n);
      this.visto = Date.now();
      if (op === 0x8) { this.fechar(); return; }
      if (op === 0x9) { this._quadro(0xA, dados); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x0) {
        if (op === 0x1) this.comprimida = rsv1;
        this.pedacos.push(dados);
        if (this.pedacos.reduce((s, p) => s + p.length, 0) > MAX_MENSAGEM) { this.fechar(); return; }
        if (!fim) continue;
        let bruto = Buffer.concat(this.pedacos);
        this.pedacos = [];
        if (this.comprimida) {
          try {
            bruto = zlib.inflateRawSync(Buffer.concat([bruto, Buffer.from([0x00, 0x00, 0xff, 0xff])]), { maxOutputLength: MAX_MENSAGEM, finishFlush: zlib.constants.Z_SYNC_FLUSH });
          } catch (_) { this.fechar(); return; }
        }
        const texto = bruto.toString('utf8');
        const agora = Date.now();
        if (agora - this.janela > 1000) { this.janela = agora; this.contagem = 0; }
        if (++this.contagem > MAX_POR_SEGUNDO) { this.fechar(); return; }
        let m;
        try { m = JSON.parse(texto); } catch (_) { continue; }
        if (m && typeof m === 'object' && typeof m.t === 'string') {
          try { ao_receber(this, m); } catch (e) { console.error('erro numa mensagem:', e); }
        }
        continue;
      }
      this.fechar();   // tipo de quadro que o jogo não usa
      return;
    }
  }
}

servidor.on('upgrade', (req, soquete, head) => {
  const chave = req.headers['sec-websocket-key'];
  if (req.url.split('?')[0] !== '/ws' || !chave || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    soquete.destroy();
    return;
  }
  // Aceita a página deste servidor e os endereços públicos configurados.
  const origem = req.headers.origin;
  if (origem) {
    let host = '', hostInterno = '';
    try {
      const url = new URL(origem);
      if (url.protocol === 'http:' || url.protocol === 'https:') host = url.host;
      hostInterno = new URL('http://' + req.headers.host).host;
    } catch (_) { /* origem estranha */ }
    if (!host || (host !== hostInterno && !HOSTS_PUBLICOS.has(host))) {
      console.warn('[multiplayer] Conexão recusada: origem diferente do endereço público configurado.');
      soquete.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
  }
  const aceite = crypto.createHash('sha1').update(chave + GUID).digest('base64');
  // compressão: o navegador oferece permessage-deflate; sem "memória" entre
  // mensagens (cada uma comprime sozinha), que é o mais leve para o servidor
  const deflate = /permessage-deflate/i.test(req.headers['sec-websocket-extensions'] || '');
  soquete.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + aceite + '\r\n' +
    (deflate ? 'Sec-WebSocket-Extensions: permessage-deflate; server_no_context_takeover; client_no_context_takeover\r\n' : '') +
    '\r\n');
  const con = new Conexao(soquete);
  con.deflate = deflate;
  conexoes.add(con);
  // O primeiro quadro pode vir no mesmo pacote que o pedido de upgrade.
  if (head && head.length) con._dados(head);
});

// ======================================================================
// 3. O multiplayer: contas, quem está on, amigos, convites e salas
// ======================================================================
// conta = { id, nome, email, sal, hash, amigos:Set(id), pedidos:Set(id de quem pediu) }
const contas = new Map();      // e-mail -> conta
const por_id = new Map();      // id -> conta
// sessão = { conta, con, status:'menu'|'jogando'|'sala', sala }
const online = new Map();      // id -> sessão
const convites = new Map();    // id de quem convidou -> { para, expira }
const salas = new Map();       // id da sala -> { id, verde, vermelho }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const novo_id = () => crypto.randomBytes(6).toString('hex');

function limpar_nome(s) {
  return String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

// ---------- RECIBO ASSINADO: a conta guardada no próprio aparelho ----------
// O servidor do Render esquece tudo quando reinicia. Então cada jogador leva um
// "recibo" da sua conta (troféus, likes, ícone, amigos, senha só como hash),
// assinado com um segredo que só o servidor conhece. O aparelho guarda o recibo
// sozinho e manda de volta ao reconectar: se o servidor perdeu a conta, ela é
// refeita com os números exatos; se alguém mexer num número, a assinatura não
// bate e o recibo é recusado. O jogador nunca vê nada disso.
// Segredo: variável RECIBO_SEGREDO (Environment do Render). Sem ela, usa um
// segredo tirado do id do serviço do Render (fixo entre reinícios).
const SEGREDO_RECIBO = process.env.RECIBO_SEGREDO ||
  crypto.createHash('sha256').update('guardians-recibo:' + (process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_HOSTNAME || __dirname)).digest('hex');
if (!process.env.RECIBO_SEGREDO) console.warn('[recibo] Sem RECIBO_SEGREDO: usando um segredo derivado do serviço. Para mais segurança, crie a variável RECIBO_SEGREDO no Render.');
const RECIBO_VALE = 60 * 24 * 3600 * 1000;   // 60 dias sem entrar = recibo vence

function _assinar(txt) { return crypto.createHmac('sha256', SEGREDO_RECIBO).update(txt).digest('base64url'); }
function recibo_de(c) {
  const d = { v: 1, id: c.id, nome: c.nome, email: c.email, sal: c.sal.toString('hex'), hash: c.hash.toString('hex'),
    tr: c.trofeus || 0, lk: c.likes || 0, vi: c.vitorias || 0, de: c.derrotas || 0, av: c.avatar || 0,
    am: [...c.amigos].slice(0, 200), gs: c.google || '', ts: Date.now(),
    // tempos de jogo COM a sessão que está aberta agora (online, batalha, pvp)
    tp: (() => { const s = online.get(c.id); return { online: tempo_total(c, s, 'online'), batalha: tempo_total(c, s, 'batalha'), pvp: tempo_total(c, s, 'pvp') }; })() };
  const corpo = Buffer.from(JSON.stringify(d)).toString('base64url');
  return corpo + '.' + _assinar(corpo);
}
function ler_recibo(rc) {
  // devolve os dados se a assinatura bate e o recibo não venceu; senão null
  if (typeof rc !== 'string' || rc.length > 20000) return null;
  const i = rc.lastIndexOf('.');
  if (i < 1) return null;
  const corpo = rc.slice(0, i), ass = Buffer.from(rc.slice(i + 1));
  const certa = Buffer.from(_assinar(corpo));
  if (ass.length !== certa.length || !crypto.timingSafeEqual(ass, certa)) return null;
  let d;
  try { d = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')); } catch (_) { return null; }
  if (!d || d.v !== 1 || typeof d.id !== 'string' || typeof d.email !== 'string' || Date.now() - (d.ts || 0) > RECIBO_VALE) return null;
  return d;
}
function restaurar_conta(d) {
  // o servidor perdeu a conta: refaz a partir do recibo (mesmo id, números exatos)
  if (por_id.has(d.id) || contas.has(d.email)) return null;
  const conta = {
    id: d.id, nome: limpar_nome(d.nome) || 'Jogador', email: d.email,
    sal: Buffer.from(d.sal, 'hex'), hash: Buffer.from(d.hash, 'hex'),
    amigos: new Set((d.am || []).filter(x => typeof x === 'string')), pedidos: new Set(), entrou: true,
    tempos: { online: d.tp?.online || 0, batalha: d.tp?.batalha || 0, pvp: d.tp?.pvp || 0 },
    trofeus: d.tr | 0, likes: d.lk | 0, vitorias: d.vi | 0, derrotas: d.de | 0, avatar: (d.av | 0) % 10, google: d.gs || '',
  };
  contas.set(conta.email, conta);
  por_id.set(conta.id, conta);
  // amizade é dos dois lados: quem já voltou e é amigo dele religa
  for (const c of por_id.values()) if (c !== conta && conta.amigos.has(c.id) && !c.amigos.has(conta.id)) c.amigos.add(conta.id);
  for (const c of por_id.values()) if (c !== conta && c.amigos.has(conta.id)) conta.amigos.add(c.id);
  console.log('[recibo] Conta recuperada pelo recibo. Contas: ' + contas.size);
  salvar_dados();
  return conta;
}

// ---------- ENTRAR COM O GOOGLE ----------
// O aparelho recebe do Google um "ID token" (a pessoa escolheu a conta Google);
// o servidor confere esse token com o próprio Google (tokeninfo): o token tem
// de ser para ESTE jogo (aud = GOOGLE_CLIENT_ID), não vencido e com e-mail
// verificado. E-mail que já tem conta: entra. E-mail novo: a pessoa só escolhe
// nome e senha (o e-mail vem do Google).
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_TESTE = process.env.GOOGLE_TESTE_INSEGURO === '1' && process.env.NODE_ENV !== 'production';   // só testes locais
const GOOGLE_PENDENTE = 10 * 60 * 1000;   // 10 min para escolher nome e senha
async function conferir_google(cred) {
  if (typeof cred !== 'string' || cred.length > 4096) return null;
  if (GOOGLE_TESTE && cred.startsWith('teste:')) {   // teste:email:nome
    const [, email, nome] = cred.split(':');
    return { email: email.toLowerCase(), sub: 'teste-' + email, nome: nome || '' };
  }
  if (!GOOGLE_CLIENT_ID) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    // token de ACESSO: o Google diz para qual app ele foi feito (aud/azp), de quem é e se vale
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(cred), { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const d = await r.json();
    const app_ok = d.aud === GOOGLE_CLIENT_ID || d.azp === GOOGLE_CLIENT_ID;
    const verificado = d.email_verified === true || d.email_verified === 'true';
    if (!app_ok || !verificado || !(Number(d.expires_in) > 0) || typeof d.email !== 'string') return null;
    // o nome do perfil (só para sugerir o nome no jogo)
    let nome = '';
    try {
      const u = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + cred } });
      if (u.ok) { const p = await u.json(); nome = String(p.given_name || p.name || ''); }
    } catch (_) { /* sem nome: a pessoa escreve */ }
    return { email: d.email.toLowerCase(), sub: String(d.sub || ''), nome };
  } catch (_) {
    return null;
  }
}

function hash_senha(senha, sal) {
  return crypto.scryptSync(String(senha), sal, 32);
}

function erro_login(con, msg) {
  con.enviar({ t: 'erro_login', msg });
}

// ---------- tempos: só o servidor conta (online, batalha contra a IA, PvP) ----------
// a cada 1 min, um recibo novo para quem está on: os tempos de jogo vão sendo salvos
// (no celular e no Drive) mesmo se a pessoa fechar o jogo de repente
setInterval(() => {
  for (const s of online.values()) s.con.enviar({ t: 'rc', rc: recibo_de(s.conta) });
}, 60 * 1000).unref?.();

function ligar_tempo(s, k) { if (s && !s.rodando[k]) s.rodando[k] = Date.now(); }
function parar_tempo(s, k) {
  if (!s || !s.rodando[k]) return;
  s.conta.tempos[k] += Date.now() - s.rodando[k];
  delete s.rodando[k];
}
function parar_todos(s) { for (const k of ['online', 'batalha', 'pvp']) parar_tempo(s, k); }
function tempo_total(c, s, k) { return c.tempos[k] + (s && s.rodando[k] ? Date.now() - s.rodando[k] : 0); }

// todo mundo que já entrou nesta versão do arquivo (on e off), para a lista GLOBAL e os amigos
function lista_todos() {
  const lista = [];
  for (const c of por_id.values()) {
    if (!c.entrou) continue;
    const s = online.get(c.id);
    lista.push({
      id: c.id, nome: c.nome, status: s ? s.status : 'off', trofeus: c.trofeus || 0, likes: c.likes || 0,
      avatar: c.avatar || 0, vitorias: c.vitorias || 0, derrotas: c.derrotas || 0,
      tempos: { online: tempo_total(c, s, 'online'), batalha: tempo_total(c, s, 'batalha'), pvp: tempo_total(c, s, 'pvp') },
      rodando: s ? Object.keys(s.rodando) : [],
    });
  }
  return lista;
}

function carregar_dados() {
  let d;
  try { d = JSON.parse(fs.readFileSync(ARQUIVO_DADOS, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') console.warn('[dados] não consegui ler ' + ARQUIVO_DADOS); return; }
  for (const c of d.contas || []) {
    const conta = {
      id: c.id, nome: c.nome, email: c.email,
      sal: Buffer.from(c.sal, 'hex'), hash: Buffer.from(c.hash, 'hex'),
      amigos: new Set(c.amigos || []), pedidos: new Set(c.pedidos || []),
      entrou: !!c.entrou,
      tempos: { online: c.tempos?.online || 0, batalha: c.tempos?.batalha || 0, pvp: c.tempos?.pvp || 0 },
      trofeus: c.trofeus || 0, likes: c.likes || 0, vitorias: c.vitorias || 0, derrotas: c.derrotas || 0,
      avatar: Number.isInteger(c.avatar) ? c.avatar : 0, google: c.google || '',
    };
    contas.set(conta.email, conta);
    por_id.set(conta.id, conta);
  }
  console.log('[dados] contas carregadas: ' + contas.size);
}

function salvar_dados() {
  if (!contas.size) return;
  const lista = [...contas.values()].map(c => ({
    id: c.id, nome: c.nome, email: c.email,
    sal: c.sal.toString('hex'), hash: c.hash.toString('hex'),
    amigos: [...c.amigos], pedidos: [...c.pedidos],
    entrou: c.entrou, tempos: c.tempos,
    trofeus: c.trofeus || 0, likes: c.likes || 0, vitorias: c.vitorias || 0, derrotas: c.derrotas || 0,
    avatar: c.avatar || 0, google: c.google || '',
  }));
  const tmp = ARQUIVO_DADOS + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify({ versao: 1, contas: lista }));
    fs.renameSync(tmp, ARQUIVO_DADOS);
  } catch (e) { console.warn('[dados] falha ao salvar: ' + e.message); }
}

function estado_para(s) {
  const c = s.conta;
  const lista = [];
  for (const o of online.values()) lista.push({ id: o.conta.id, nome: o.conta.nome, status: o.status });
  const pedidos = [];
  for (const id of c.pedidos) {
    const quem = por_id.get(id);
    if (quem && online.has(id)) pedidos.push({ id, nome: quem.nome });   // só de quem está on
  }
  const enviados = [];
  for (const o of online.values()) if (o.conta.pedidos.has(c.id)) enviados.push(o.conta.id);
  const cv = convites.get(c.id);
  return { t: 'estado', online: lista, todos: lista_todos(), amigos: [...c.amigos], pedidos, enviados, convite_para: cv ? cv.para : null,
    rc: recibo_de(c) };   // recibo atualizado: o aparelho guarda sozinho
}

function espalhar() {
  // manda para todo mundo a situação atual (as listas são pequenas)
  for (const s of online.values()) s.con.enviar(estado_para(s));
}

function aviso(id, msg, som) {
  const s = online.get(id);
  if (s) s.con.enviar({ t: 'aviso', msg, som: som || null });
}

// quem caiu no meio de uma batalha tem um tempo para voltar (a partida continua)
const VOLTA_BATALHA = 60 * 1000;
const ausentes = new Map();   // id -> { sala (id), ate, timer }

function entrar(con, conta, op = {}) {
  let herda = null;   // sala/estado de uma sessão que continua (reconexão)
  const antiga = online.get(conta.id);
  if (antiga && antiga.con !== con) {
    // a mesma conta entrou de novo. Se é o mesmo jogador voltando (conexão
    // antiga ainda pendurada), ele HERDA a sala/batalha; senão a de antes sai.
    antiga.con.usuario = null;
    if (op.sozinho) herda = antiga;
    else {
      antiga.con.enviar({ t: 'aviso', msg: 'Sua conta entrou em outro aparelho.', som: 'erro' });
      sair_de_tudo(conta.id);
      parar_todos(antiga);
    }
    antiga.con.enviar({ t: 'saiu', outro: !op.sozinho });
    online.delete(conta.id);
  }
  con.usuario = conta.id;
  const sessao = herda ? { conta, con, status: herda.status, sala: herda.sala, rodando: herda.rodando } : { conta, con, status: 'menu', sala: null, rodando: {} };
  // voltou a tempo de uma batalha em que tinha caído?
  const au = ausentes.get(conta.id);
  if (au) {
    clearTimeout(au.timer);
    ausentes.delete(conta.id);
    const sala = salas.get(au.sala);
    if (sala && sala.jogo && sala.jogo.dentro.has(conta.id)) { sessao.sala = sala.id; sessao.status = 'batalha'; ligar_tempo(sessao, 'pvp'); }
  }
  online.set(conta.id, sessao);
  conta.entrou = true;
  ligar_tempo(sessao, 'online');
  console.log('[multiplayer] Jogador entrou. Online: ' + online.size);
  con.enviar({ t: 'logado', eu: { id: conta.id, nome: conta.nome, email: conta.email, trofeus: conta.trofeus || 0, likes: conta.likes || 0,
    avatar: conta.avatar || 0, vitorias: conta.vitorias || 0, derrotas: conta.derrotas || 0, nova: !!conta.nova },
    restaurou: !!op.restaurou, rc: recibo_de(conta) });
  conta.nova = false;
  // de volta para a sala/batalha em que estava
  const sala = sessao.sala && salas.get(sessao.sala);
  if (sala) {
    if (sala.jogo && sala.jogo.dentro.has(conta.id)) {
      con.enviar({ t: 'partida', lado: lado_de(sala, conta.id), sala: sala_publica(sala), volta: true });
      const outro = online.get(sala[lado_de(sala, conta.id) === 'verde' ? 'vermelho' : 'verde'].id);
      if (outro) outro.con.enviar({ t: 'aviso', msg: `${conta.nome} voltou para a batalha!`, som: 'pronta_amiga' });
    } else if (!sala.jogo) con.enviar({ t: 'sala', sala: sala_publica(sala) });
  }
  espalhar();
}

function sala_publica(sala) {
  const info = (lado) => { const c = por_id.get(sala[lado].id); return { ...sala[lado], trofeus: c ? c.trofeus || 0 : 0, likes: c ? c.likes || 0 : 0, avatar: c ? c.avatar || 0 : 0 }; };
  return { id: sala.id, verde: info('verde'), vermelho: info('vermelho'), prontos: sala.prontos, modo: sala.modo || 'vale_tudo' };
}

function cancelar_convite(de, motivo) {
  const cv = convites.get(de);
  if (!cv) return;
  convites.delete(de);
  const alvo = online.get(cv.para);
  if (alvo) alvo.con.enviar({ t: 'convite_fim', de });
  if (motivo) aviso(de, motivo, 'menu_voltar');
}

function fechar_sala(id_sala, quem_saiu) {
  const sala = salas.get(id_sala);
  if (!sala) return;
  if (sala.jogo) { sair_da_batalha(sala, quem_saiu); return; }
  salas.delete(id_sala);
  for (const lado of [sala.verde, sala.vermelho]) {
    const s = online.get(lado.id);
    if (!s) continue;
    s.sala = null;
    if (s.status === 'sala') s.status = 'menu';
    if (lado.id !== quem_saiu) {
      const nome = (por_id.get(quem_saiu) || {}).nome || 'O outro jogador';
      s.con.enviar({ t: 'sala_fim', msg: `${nome} saiu da sala.` });
    } else {
      s.con.enviar({ t: 'sala_fim', msg: null });
    }
  }
}

function sair_de_tudo(id) {
  // tira o jogador de convites e salas (ao ficar off, ao sair da conta)
  cancelar_convite(id, null);
  for (const [de, cv] of [...convites]) {
    if (cv.para === id) {
      convites.delete(de);
      aviso(de, 'O convite não vale mais: o jogador ficou off.', 'menu_voltar');
    }
  }
  const s = online.get(id);
  if (s && s.sala) fechar_sala(s.sala, id);
}

function desligar(con, de_proposito = false) {
  const id = con.usuario;
  if (!id) return;
  con.usuario = null;
  const s = online.get(id);
  if (!s || s.con !== con) return;
  // caiu no MEIO de uma batalha (sem ter saído de propósito): a partida continua
  // e ele tem VOLTA_BATALHA para voltar; senão, perde como quem sai
  const sala = s.sala && salas.get(s.sala);
  const j = sala && sala.jogo;
  if (!de_proposito && j && j.dentro.has(id) && !j.vencedor && !j.T.vencedor()) {
    cancelar_convite(id, null);
    parar_todos(s);
    online.delete(id);
    const timer = setTimeout(() => {
      ausentes.delete(id);
      const sl = salas.get(sala.id);
      if (sl && sl.jogo) { sair_da_batalha(sl, id); }
    }, VOLTA_BATALHA);
    ausentes.set(id, { sala: sala.id, ate: Date.now() + VOLTA_BATALHA, timer });
    const outro = online.get(sala[lado_de(sala, id) === 'verde' ? 'vermelho' : 'verde'].id);
    if (outro) outro.con.enviar({ t: 'aviso', msg: `${s.conta.nome} caiu. Esperando voltar (até ${VOLTA_BATALHA / 1000} s)…`, som: 'menu_voltar' });
    console.log('[multiplayer] Jogador caiu na batalha; esperando voltar.');
    espalhar();
    return;
  }
  sair_de_tudo(id);
  parar_todos(s);
  online.delete(id);
  console.log('[multiplayer] Jogador saiu. Online: ' + online.size);
  if (APAGAR_CONTA_AO_SAIR) {
    const conta = por_id.get(id);
    if (conta) {
      contas.delete(conta.email);
      por_id.delete(id);
      for (const c of por_id.values()) { c.amigos.delete(id); c.pedidos.delete(id); }
    }
  }
  espalhar();
}

function ao_fechar(con) {
  conexoes.delete(con);
  desligar(con);
}

const conexoes = new Set();

function ao_receber(con, m) {
  conexoes.add(con);
  // ---------- antes de entrar ----------
  if (m.t === 'oi') { con.enviar({ t: 'oi' }); return; }   // vigia de conexão do aparelho

  if (m.t === 'retomar') {   // entrar sozinho com o recibo (ao abrir o jogo / ao reconectar)
    if (con.usuario) return;
    const d = ler_recibo(m.rc);
    if (!d) return con.enviar({ t: 'recibo_ruim' });
    let conta = por_id.get(d.id), restaurou = false;
    if (!conta) { conta = restaurar_conta(d); restaurou = !!conta; }
    if (!conta || conta.email !== d.email) return con.enviar({ t: 'recibo_ruim' });
    if (online.size >= MAX_ONLINE && !online.has(conta.id)) return erro_login(con, 'Servidor cheio. Tente daqui a pouco.');
    entrar(con, conta, { restaurou, sozinho: true });
    return;
  }

  if (m.t === 'google') {   // ENTRAR COM O GOOGLE (o único jeito de entrar)
    // m.token = token de acesso do Google (o aparelho também usa ele para o Drive);
    // m.rc = o recibo mais novo que o aparelho achou (Drive ou celular)
    if (con.usuario) return;
    conferir_google(m.token).then((g) => {
      if (con.usuario) return;
      if (!g) return erro_login(con, 'Não deu para confirmar a conta do Google. Tente de novo.');
      let conta = contas.get(g.email), restaurou = false;
      if (!conta) {   // servidor esqueceu (reiniciou): o recibo do Drive refaz a conta
        const d = ler_recibo(m.rc);
        if (d && d.email === g.email && (!d.gs || d.gs === g.sub)) { conta = restaurar_conta(d); restaurou = !!conta; }
      }
      if (conta) {
        if (conta.google && g.sub && conta.google !== g.sub) return erro_login(con, 'Essa conta é de outro login do Google.');
        conta.google = g.sub;
        if (online.size >= MAX_ONLINE && !online.has(conta.id)) return erro_login(con, 'Servidor cheio. Tente daqui a pouco.');
        return entrar(con, conta, { restaurou });
      }
      con.google = { email: g.email, sub: g.sub, ate: Date.now() + GOOGLE_PENDENTE };
      con.enviar({ t: 'google_novo', email: g.email, nome: limpar_nome(g.nome) });
    });
    return;
  }

  if (m.t === 'google_criar') {   // conta nova: só nome e ícone (sem senha)
    if (con.usuario) return;
    const g = con.google;
    if (!g || g.ate < Date.now()) return erro_login(con, 'O tempo acabou. Toque em Continuar com o Google de novo.');
    const nome = limpar_nome(m.nome);
    if (nome.length < 2) return erro_login(con, 'Escreva um nome (2 a 16 letras).');
    if (contas.has(g.email)) return entrar(con, contas.get(g.email));
    if (online.size >= MAX_ONLINE) return erro_login(con, 'Servidor cheio. Tente daqui a pouco.');
    const sal = crypto.randomBytes(16);
    const conta = { id: novo_id(), nome, email: g.email, sal, hash: crypto.randomBytes(32),   // (sem senha: só o Google entra)
      amigos: new Set(), pedidos: new Set(), entrou: false,
      tempos: { online: 0, batalha: 0, pvp: 0 }, trofeus: 0, likes: 0, vitorias: 0, derrotas: 0,
      avatar: Number.isInteger(m.avatar) && m.avatar >= 0 && m.avatar < 10 ? m.avatar : crypto.randomInt(10), google: g.sub };
    con.google = null;
    contas.set(conta.email, conta);
    por_id.set(conta.id, conta);
    return entrar(con, conta);
  }

  // ---------- daqui para baixo, só quem entrou ----------
  const eu = con.usuario && online.get(con.usuario);
  if (!eu || eu.con !== con) return;
  const meu = eu.conta.id;

  if (m.t === 'sair') {
    con.enviar({ t: 'saiu' });
    desligar(con, true);
    return;
  }

  if (m.t === 'status') {
    if (eu.sala) return;   // quem está em sala fica "em sala"
    const s = m.status === 'jogando' ? 'jogando' : 'menu';
    if (s === 'jogando') ligar_tempo(eu, 'batalha'); else parar_tempo(eu, 'batalha');
    if (s !== eu.status) {
      eu.status = s;
      if (s !== 'menu') {   // foi jogar: convites pendentes caem
        cancelar_convite(meu, null);
        for (const [de, cv] of [...convites]) {
          if (cv.para === meu) { convites.delete(de); aviso(de, `${eu.conta.nome} foi para uma partida.`, 'menu_voltar'); }
        }
      }
      espalhar();
    }
    return;
  }

  if (m.t === 'amigo_pedir') {
    let alvo = null;
    if (typeof m.id === 'string') alvo = por_id.get(m.id);
    else if (typeof m.email === 'string') alvo = contas.get(m.email.trim().toLowerCase());
    if (!alvo) return aviso(meu, 'Ninguém com esse e-mail criou conta aqui.', 'erro');
    if (alvo.id === meu) return aviso(meu, 'Esse é o seu próprio e-mail.', 'erro');
    if (eu.conta.amigos.has(alvo.id)) return aviso(meu, `${alvo.nome} já é seu amigo.`, null);
    if (eu.conta.pedidos.has(alvo.id)) {   // ele já tinha pedido: vira amizade na hora
      eu.conta.pedidos.delete(alvo.id);
      eu.conta.amigos.add(alvo.id);
      alvo.amigos.add(meu);
      aviso(meu, `Você e ${alvo.nome} agora são amigos!`, 'compra');
      aviso(alvo.id, `Você e ${eu.conta.nome} agora são amigos!`, 'compra');
    } else {
      alvo.pedidos.add(meu);
      aviso(meu, online.has(alvo.id) ? `Pedido de amizade enviado para ${alvo.nome}.` : `${alvo.nome} está off: o pedido aparece quando voltar.`, null);
    }
    return espalhar();
  }

  if (m.t === 'amigo_responder') {
    const id = String(m.id || '');
    if (!eu.conta.pedidos.has(id)) return;
    eu.conta.pedidos.delete(id);
    const outro = por_id.get(id);
    if (m.aceitar === true && outro) {
      eu.conta.amigos.add(id);
      outro.amigos.add(meu);
      aviso(meu, `Você e ${outro.nome} agora são amigos!`, null);
      aviso(id, `${eu.conta.nome} aceitou seu pedido de amizade!`, 'compra');
    }
    return espalhar();
  }

  if (m.t === 'amigo_remover') {
    const id = String(m.id || '');
    if (!eu.conta.amigos.has(id)) return;
    eu.conta.amigos.delete(id);
    const outro = por_id.get(id);
    if (outro) outro.amigos.delete(meu);
    const cv = convites.get(meu);
    if (cv && cv.para === id) cancelar_convite(meu, null);
    const cv2 = convites.get(id);
    if (cv2 && cv2.para === meu) cancelar_convite(id, null);
    return espalhar();
  }

  if (m.t === 'convidar') {
    const id = String(m.id || '');
    const alvo = online.get(id);
    if (!eu.conta.amigos.has(id)) return aviso(meu, 'Só dá para convidar amigos.', 'erro');
    if (!alvo) return aviso(meu, 'Esse amigo ficou off.', 'erro');
    if (eu.status !== 'menu' || eu.sala) return;
    if (alvo.status !== 'menu' || alvo.sala) return aviso(meu, `${alvo.conta.nome} está ocupado agora.`, 'erro');
    cancelar_convite(meu, null);   // um convite de cada vez
    const inverso = convites.get(id);
    if (inverso && inverso.para === meu) {   // os dois se convidaram: já entra na sala
      convites.delete(id);
      return abrir_sala(alvo, eu);
    }
    convites.set(meu, { para: id, expira: Date.now() + CONVITE_VALE });
    alvo.con.enviar({ t: 'convite', de: { id: meu, nome: eu.conta.nome } });
    return espalhar();
  }

  if (m.t === 'convite_cancelar') {
    cancelar_convite(meu, null);
    return espalhar();
  }

  if (m.t === 'convite_responder') {
    const de = String(m.de || '');
    const cv = convites.get(de);
    if (!cv || cv.para !== meu) return aviso(meu, 'Esse convite não vale mais.', 'erro');
    convites.delete(de);
    const quem = online.get(de);
    if (m.aceitar !== true) {
      aviso(de, `${eu.conta.nome} recusou o convite.`, 'menu_voltar');
      return espalhar();
    }
    if (!quem || quem.status !== 'menu' || quem.sala || eu.status !== 'menu' || eu.sala) {
      aviso(meu, 'Não deu: um dos dois está ocupado.', 'erro');
      return espalhar();
    }
    return abrir_sala(quem, eu);
  }

  if (m.t === 'sala_sair' || m.t === 'partida_sair') {
    if (eu.sala) { fechar_sala(eu.sala, meu); espalhar(); }
    return;
  }

  if (m.t === 'pronto') {
    const sala = eu.sala && salas.get(eu.sala);
    if (!sala || sala.jogo) return;
    if (!PvP) return aviso(meu, 'O servidor ainda está carregando a batalha. Tente de novo.', 'erro');
    if (sala.prontos.includes(meu)) sala.prontos = sala.prontos.filter(i => i !== meu);
    else sala.prontos.push(meu);
    if (sala.prontos.length === 2) return iniciar_batalha(sala);
    for (const lado of ['verde', 'vermelho']) {
      const s = online.get(sala[lado].id);
      if (s) s.con.enviar({ t: 'sala', sala: sala_publica(sala) });
    }
    return;
  }

  if (m.t === 'avatar') {   // troca o ícone da conta (0..9)
    if (!Number.isInteger(m.avatar) || m.avatar < 0 || m.avatar > 9) return;
    eu.conta.avatar = m.avatar;
    salvar_dados();
    return espalhar();
  }

  if (m.t === 'modo') {   // troca o modo da sala (os dois voltam a "não pronto")
    const sala = eu.sala && salas.get(eu.sala);
    if (!sala || sala.jogo || !['vale_tudo', 'sobrevivente'].includes(m.modo) || sala.modo === m.modo) return;
    sala.modo = m.modo; sala.prontos = [];
    for (const lado of ['verde', 'vermelho']) {
      const s = online.get(sala[lado].id);
      if (s) s.con.enviar({ t: 'sala', sala: sala_publica(sala) });
    }
    return;
  }

  if (m.t === 'curtir') {   // like no oponente, uma vez por partida, depois que ela acaba
    const sala = eu.sala && salas.get(eu.sala);
    const j = sala && sala.jogo;
    if (!j || !(j.vencedor || j.T.vencedor()) || j.curtiu.has(meu)) return;
    const outro_lado = lado_de(sala, meu) === 'verde' ? 'vermelho' : 'verde';
    const c = por_id.get(sala[outro_lado].id);
    if (!c) return;
    j.curtiu.add(meu);
    c.likes = (c.likes || 0) + 1;
    aviso(meu, `Você curtiu ${c.nome}!`, 'compra');
    aviso(c.id, `${eu.conta.nome} curtiu você! Agora você tem ${c.likes} likes.`, 'pronta_amiga');
    salvar_dados();
    return espalhar();
  }

  if (m.t === 'cmd') {
    const sala = eu.sala && salas.get(eu.sala);
    if (sala && sala.jogo && sala.jogo.dentro.has(meu)) comando_batalha(sala, meu, m);
    return;
  }
}

function abrir_sala(quem_convidou, quem_aceitou) {
  // quem convidou fica de VERDE, quem aceitou de VERMELHO
  for (const s of [quem_convidou, quem_aceitou]) {
    cancelar_convite(s.conta.id, null);
    for (const [de, cv] of [...convites]) {
      if (cv.para === s.conta.id) { convites.delete(de); aviso(de, `${s.conta.nome} entrou numa sala.`, 'menu_voltar'); }
    }
  }
  const sala = {
    id: novo_id(),
    verde: { id: quem_convidou.conta.id, nome: quem_convidou.conta.nome },
    vermelho: { id: quem_aceitou.conta.id, nome: quem_aceitou.conta.nome },
    prontos: [],
    jogo: null,
    modo: 'vale_tudo',   // VALE TUDO ou SOBREVIVENTE (qualquer um dos dois troca na sala)
  };
  salas.set(sala.id, sala);
  for (const s of [quem_convidou, quem_aceitou]) {
    s.sala = sala.id;
    s.status = 'sala';
    s.con.enviar({ t: 'sala', sala: sala_publica(sala) });
  }
  espalhar();
}

// ======================================================================
// 4. A batalha entre jogadores (a partida roda AQUI; os aparelhos só desenham)
// ======================================================================
function lado_de(sala, id) {
  return sala.verde.id === id ? 'verde' : 'vermelho';
}

function iniciar_batalha(sala) {
  const grav = new PvP.Gravador(LIMITES, GRUPOS);
  sala.jogo = {
    T: new PvP.TropasPvP(grav), grav, passo: 0, vencedor: null,
    revanche: new Set(), dentro: new Set([sala.verde.id, sala.vermelho.id]),
    curtiu: new Set(), resultado: null,
  };
  sala.jogo.T.modo_pvp = sala.modo || 'vale_tudo';   // (T.modo é normal/zumbi do jogo solo)
  if (process.env.PVP_TESTE_DURACAO) sala.jogo.T.duracao = Number(process.env.PVP_TESTE_DURACAO);   // só para testes
  for (const lado of ['verde', 'vermelho']) {
    const s = online.get(sala[lado].id);
    if (!s) continue;
    s.status = 'batalha';
    ligar_tempo(s, 'pvp');
    s.con.enviar({ t: 'partida', lado, sala: sala_publica(sala) });
  }
  espalhar();
}

function contar_trofeus(sala) {
  // TROFÉUS: o servidor decide quanto a partida vale (config.js trofeus_da_partida);
  // quem ganha leva X, quem perde perde X (sem ficar negativo); empate não muda nada
  const j = sala.jogo;
  const v = j.vencedor || j.T.vencedor();
  const cv = por_id.get(sala.verde.id), cr = por_id.get(sala.vermelho.id);
  if (!v || j.resultado || !cv || !cr || !CFG) return;   // conta uma vez só
  let res = { vencedor: v, x: 0, modo: j.T.modo_pvp, como: 'empate' };
  if (v === 'verde' || v === 'vermelho') {
    const w = v === 'verde' ? cv : cr, l = v === 'verde' ? cr : cv;
    const r = j.vencedor && !j.T.vencedor() ? { como: 'saiu', margem: 0.5, t: j.T.t_partida || 0 } : j.T.resumo_fim();
    const x = CFG.trofeus_da_partida({ tw: w.trofeus || 0, tl: l.trofeus || 0, modo: j.T.modo_pvp, t: r.t, como: r.como, margem: r.margem });
    w.trofeus = (w.trofeus || 0) + x;
    l.trofeus = Math.max(0, (l.trofeus || 0) - x);
    w.vitorias = (w.vitorias || 0) + 1; l.derrotas = (l.derrotas || 0) + 1;
    res = { vencedor: v, x, modo: j.T.modo_pvp, como: r.como };
  }
  j.resultado = res;
  for (const lado of ['verde', 'vermelho']) {
    const c = lado === 'verde' ? cv : cr, s = online.get(c.id);
    const delta = res.x ? (res.vencedor === lado ? res.x : -res.x) : 0;
    if (s) s.con.enviar({ t: 'resultado', delta, trofeus: c.trofeus || 0, likes: c.likes || 0, modo: res.modo, como: res.como,
      empate: res.vencedor === 'empate', oponente: sala[lado === 'verde' ? 'vermelho' : 'verde'].nome });
  }
  salvar_dados();
  espalhar();
}

function sair_da_batalha(sala, id) {
  // quem sai antes do fim perde; a sala acaba quando os dois saem
  const j = sala.jogo;
  if (!j.dentro.has(id)) return;
  j.dentro.delete(id);
  j.revanche.clear();
  const lado = lado_de(sala, id), outro_lado = lado === 'verde' ? 'vermelho' : 'verde';
  if (!j.vencedor && !j.T.vencedor()) j.vencedor = outro_lado;
  contar_trofeus(sala);   // quem sai antes do fim perde os troféus na hora
  const s = online.get(id);
  parar_tempo(s, 'pvp');
  if (s && s.sala === sala.id) { s.sala = null; s.status = 'menu'; }
  const o = online.get(sala[outro_lado].id);
  if (o && j.dentro.has(o.conta.id)) o.con.enviar({ t: 'oponente_saiu', nome: sala[lado].nome });
  if (!j.dentro.size) salas.delete(sala.id);
  espalhar();
}

function passo_batalha(sala) {
  const j = sala.jogo;
  j.grav.relogio += PASSO;
  j.T.aplicar_avanco();
  j.T.atualizar(PASSO);
  j.T.coletar();
  j.passo += 1;
  if (!j.contado && (j.vencedor || j.T.vencedor())) {   // partida acabou: para de contar o PvP
    j.contado = true;
    contar_trofeus(sala);
    for (const id of j.dentro) parar_tempo(online.get(id), 'pvp');
  }
  if (j.passo % FOTOS_A_CADA) return;
  const eventos = j.grav.ev.splice(0);
  for (const lado of ['verde', 'vermelho']) {
    const id = sala[lado].id;
    if (!j.dentro.has(id)) continue;
    const s = online.get(id);
    if (s) s.con.enviar(j.T.foto(lado, eventos, j.vencedor, j.passo * PASSO));
  }
  j.T.limpar_disparos();
}

function comando_batalha(sala, id, m) {
  const j = sala.jogo, T = j.T, lado = lado_de(sala, id);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const x = num(m.x), y = num(m.y);
  T.aplicar_avanco();
  if (m.c === 'carta' && x !== null && y !== null && typeof m.tipo === 'string') T.posicionar_t(lado, m.tipo, x, y);
  else if (m.c === 'base' && x !== null && y !== null) T.construir_t(lado, x, y);
  else if (m.c === 'torre' && x !== null && y !== null) T.torre_t(lado, x, y);
  else if (m.c === 'barricada' && x !== null && y !== null && num(m.ang) !== null) T.barricada_t(lado, x, y, m.ang);
  else if (m.c === 'ordem' && x !== null && y !== null && num(m.id) !== null) T.ordem_t(lado, m.id, x, y);
  else if (m.c === 'compra' && typeof m.m === 'string') T.comprar_m(lado, m.m);
  else if (m.c === 'mb' && typeof m.m === 'string') T.comprar_mb(lado, m.m);   // fase 3: melhoria da base
  else if (m.c === 'ref' && typeof m.m === 'string' && m.m.length < 12) T.pedir_ref(lado, m.m);   // fase 4: refinaria
  else if (m.c === 'cam' && Number.isInteger(m.id) && (m.p === 'de' || m.p === 'para' || m.p === 'parar')) T.caminhao_t(lado, m.id, m.p, num(m.x) ?? 0, num(m.y) ?? 0);   // fase 5: caminhão
  else if (m.c === 'cam_comprar') T.comprar_caminhao(lado);   // fase 5
  else if (m.c === 'qg') T.melhorar_qg_t(lado);
  else if (m.c === 'hab' && typeof m.tipo === 'string' && typeof m.m === 'string') T.comprar_hab_t(lado, m.tipo, m.m);
  else if (m.c === 'treino' && Number.isInteger(m.a) && Number.isInteger(m.id) && Number.isFinite(m.q)) T.treino_t(lado, m.a, m.id, m.q);
  else if (m.c === 'treino_sair' && Number.isInteger(m.a)) T.treino_sair_t(lado, m.a);
  else if (m.c === 'base_carta' && x !== null && y !== null && typeof m.tipo === 'string') T.escolher_carta_t(lado, x, y, m.tipo);
  else if (m.c === 'gps' && x !== null && y !== null && num(m.px) !== null && num(m.py) !== null) T.reuniao_t(lado, x, y, m.px, m.py);
  else if (m.c === 'deck' && x !== null && y !== null && Array.isArray(m.cartas) && m.cartas.length === 3 && m.cartas.every(k => typeof k === 'string')) T.deck_t(lado, x, y, m.cartas);
  else if (m.c === 'revanche') {
    if (!j.vencedor && !T.vencedor()) return;
    const outro_lado = lado === 'verde' ? 'vermelho' : 'verde';
    if (j.dentro.size < 2) return aviso(id, 'O outro jogador já saiu da batalha.', 'erro');
    j.revanche.add(id);
    if (j.revanche.size === 2) {
      j.revanche.clear();
      j.vencedor = null;
      j.grav.ev.length = 0;
      j.contado = false; j.curtiu = new Set(); j.resultado = null;   // a revanche vale troféus de novo
      T.iniciar();
      for (const l of ['verde', 'vermelho']) aviso(sala[l].id, 'Revanche! Nova batalha.', 'menu_iniciar');
    } else {
      aviso(id, `Esperando ${sala[outro_lado].nome} aceitar a revanche…`, null);
      aviso(sala[outro_lado].id, `${sala[lado].nome} quer revanche: toque em Jogar de novo.`, 'carta_pronta');
    }
  }
}

setInterval(() => {
  if (!PvP) return;
  for (const sala of salas.values()) {
    if (!sala.jogo) continue;
    try { passo_batalha(sala); } catch (e) { console.error('erro na batalha:', e); }
  }
}, 1000 * PASSO);

// relógio do servidor: convites vencidos e conexões que caíram sem avisar
setInterval(() => {
  const agora = Date.now();
  let mudou = false;
  for (const [de, cv] of [...convites]) {
    if (cv.expira <= agora) {
      cancelar_convite(de, 'O convite venceu sem resposta.');
      mudou = true;
    }
  }
  if (mudou) espalhar();
}, 1000).unref();

setInterval(() => {
  const agora = Date.now();
  for (const s of [...online.values()]) {
    if (agora - s.con.visto > SEM_SINAL) s.con.fechar();
    else s.con.ping();
  }
  for (const con of [...conexoes]) {
    if (!con.usuario && agora - con.visto > SEM_SINAL) con.fechar();
  }
}, 15000).unref();

// ======================================================================
carregar_dados();
setInterval(salvar_dados, SALVAR_A_CADA).unref();
function encerrar(sinal) {
  for (const s of online.values()) parar_todos(s);   // fecha o que ainda estava contando
  salvar_dados();
  process.exit(0);
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));

servidor.listen(PORTA, '0.0.0.0', () => {
  console.log('Guardians vs Troops (web) no ar.');
  console.log('  neste aparelho:  http://localhost:' + PORTA);
  let interfaces = {};
  try { interfaces = os.networkInterfaces(); }
  catch (_) { /* Alguns ambientes bloqueiam a consulta das interfaces de rede. */ }
  for (const lista of Object.values(interfaces)) {
    for (const r of lista || []) {
      if (r.family === 'IPv4' && !r.internal) console.log('  na mesma rede:   http://' + r.address + ':' + PORTA);
    }
  }
  console.log('Nada é guardado em disco: fechou o servidor, as contas somem.');
});
