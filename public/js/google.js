// google.js — ENTRAR COM O GOOGLE + SALVAR NO DRIVE DA PRÓPRIA PESSOA.
//
// Um toque no botão abre a janela do Google (uma vez só pede a permissão de
// guardar os dados do jogo numa pasta ESCONDIDA do Drive dela, "appDataFolder").
// Com o token que o Google devolve:
//   - o servidor confere quem é a pessoa (server.js, tokeninfo);
//   - o jogo lê/grava o arquivo "gvt_conta.json" nessa pasta: é o RECIBO
//     assinado pelo servidor (troféus, likes, ícone, amigos). Trocou de
//     celular, limpou o navegador ou o servidor reiniciou: o recibo do Drive
//     traz tudo de volta. Ninguém precisa de banco de dados.
// O ID do app no Google (GOOGLE_CLIENT_ID) vem do servidor em /config.json.

const ESCOPOS = 'openid email profile https://www.googleapis.com/auth/drive.appdata';
const ARQUIVO = 'gvt_conta.json';
const API = 'https://www.googleapis.com';

let _config = null;          // { google: client_id | null }
let _carregando = null;
let _cliente = null;         // google.accounts.oauth2 token client
let _ao_token = null;        // callback(token) quando a pessoa entra
let _token = null, _vence = 0;
let _id_arquivo = null;      // id do arquivo no Drive (cache)
let _pendente = null;        // recibo esperando para ir ao Drive
let _gravando = false;
let _t_grava = null;
let _botao = null;           // <button> por cima do botão desenhado (o toque precisa ser "de verdade")

export function estado() {
  if (_config === null) return 'carregando';
  if (!_config.google) return 'desligado';
  return _cliente ? 'pronto' : 'carregando';
}
export function tem_token() { return !!_token && Date.now() < _vence; }

export function preparar(ao_token) {
  _ao_token = ao_token;
  if (_carregando) return _carregando;
  _carregando = (async () => {
    try {
      const r = await fetch('config.json', { cache: 'no-store' });
      _config = r.ok ? await r.json() : { google: null };
    } catch (_) { _config = { google: null }; }
    if (!_config.google) return;
    await new Promise((ok) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true;
      s.onload = ok; s.onerror = ok;
      document.head.appendChild(s);
    });
    const o = window.google && window.google.accounts && window.google.accounts.oauth2;
    if (!o) { _config.google = null; return; }
    _cliente = o.initTokenClient({
      client_id: _config.google,
      scope: ESCOPOS,
      callback: (resp) => {
        const login = _quer_login; _quer_login = false;
        if (!resp || resp.error || !resp.access_token) { if (login && _ao_token) _ao_token(null, resp && resp.error); return; }
        _token = resp.access_token;
        _vence = Date.now() + (Number(resp.expires_in) || 3000) * 1000 - 60000;
        if (_pendente) _gravar_logo();
        if (login && _ao_token) _ao_token(_token);   // (renovação do acesso ao Drive não refaz o login)
      },
      error_callback: (e) => { const login = _quer_login; _quer_login = false; if (login && _ao_token) _ao_token(null, e && e.type); },
    });
  })();
  return _carregando;
}
let _quer_login = false;   // o pedido atual é um login (e não só renovar o acesso ao Drive)

function pedir(prompt, login) {
  if (!_cliente) return;
  _quer_login = !!login;
  _cliente.requestAccessToken({ prompt });
}

// ---------- o botão (um <button> de verdade por cima do desenho do jogo) ----------
export function mostrar(app, r) {
  if (!_cliente) return;
  const k = (app.janela.canvas.clientWidth || 1) / app.janela.canvas.width;
  if (!_botao) {
    _botao = document.createElement('button');
    _botao.setAttribute('aria-label', 'Continuar com o Google');
    Object.assign(_botao.style, { position: 'absolute', margin: '0', padding: '0', border: '0', background: 'transparent', cursor: 'pointer', outline: 'none' });
    // o toque abre a janela do Google na hora (navegador só deixa abrir janela num toque de verdade)
    _botao.addEventListener('click', () => pedir('', true));
    (document.getElementById('palco') || document.body).appendChild(_botao);
  }
  const s = _botao.style;
  s.display = 'block';
  s.left = r[0] * k + 'px'; s.top = r[1] * k + 'px';
  s.width = r[2] * k + 'px'; s.height = r[3] * k + 'px';
}
export function esconder() { if (_botao) _botao.style.display = 'none'; }

// ---------- Drive: pasta escondida do app ----------
async function _api(caminho, op = {}) {
  const r = await fetch(API + caminho, { ...op, headers: { ...(op.headers || {}), Authorization: 'Bearer ' + _token } });
  if (r.status === 401) { _token = null; _vence = 0; throw new Error('token'); }
  if (!r.ok) throw new Error('drive ' + r.status);
  return r;
}

export async function ler_recibo() {
  // o recibo guardado no Drive da pessoa (ou null)
  if (!tem_token()) return null;
  try {
    const q = encodeURIComponent(`name='${ARQUIVO}'`);
    const r = await _api(`/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=1`);
    const d = await r.json();
    if (!d.files || !d.files.length) return null;
    _id_arquivo = d.files[0].id;
    const c = await _api(`/drive/v3/files/${_id_arquivo}?alt=media`);
    const j = await c.json();
    return j && typeof j.rc === 'string' ? j.rc : null;
  } catch (_) { return null; }
}

export function guardar_recibo(rc) {
  // guarda no Drive sem travar o jogo (junta várias mudanças: no máximo 1 a cada 5 s)
  if (!rc || !_config || !_config.google) return;
  _pendente = rc;
  if (_t_grava) return;
  _t_grava = setTimeout(() => { _t_grava = null; _gravar_logo(); }, 5000);
}
export function tem_pendente() { return !!_pendente; }
export function renovar_se_precisar() {
  // chamado num toque da pessoa FORA da batalha: o acesso ao Drive venceu (1 h) e há o que salvar
  if (_pendente && !tem_token() && _cliente) pedir('', false);
}

async function _gravar_logo() {
  if (_gravando || !_pendente || !tem_token()) return;
  _gravando = true;
  const rc = _pendente;
  try {
    const corpo = JSON.stringify({ rc, salvo: new Date().toISOString() });
    if (!_id_arquivo) {   // procura antes de criar (não duplica)
      const q = encodeURIComponent(`name='${ARQUIVO}'`);
      const d = await (await _api(`/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=1`)).json();
      if (d.files && d.files.length) _id_arquivo = d.files[0].id;
    }
    if (_id_arquivo) {
      await _api(`/upload/drive/v3/files/${_id_arquivo}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: corpo });
    } else {
      const meta = { name: ARQUIVO, parents: ['appDataFolder'], mimeType: 'application/json' };
      const fronteira = 'gvt' + Math.random().toString(36).slice(2);
      const multi = `--${fronteira}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
        `--${fronteira}\r\nContent-Type: application/json\r\n\r\n${corpo}\r\n--${fronteira}--`;
      const r = await _api('/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + fronteira }, body: multi });
      _id_arquivo = (await r.json()).id;
    }
    if (_pendente === rc) _pendente = null;   // (chegou outro no meio: grava de novo depois)
  } catch (_) { /* sem rede / token vencido: tenta na próxima */ }
  _gravando = false;
  if (_pendente && tem_token()) guardar_recibo(_pendente);
}

export function sair() {
  // sair da conta: esquece o token (o recibo fica no Drive para a próxima vez)
  try { if (_token && window.google) window.google.accounts.oauth2.revoke(_token, () => {}); } catch (_) { /* nada */ }
  _token = null; _vence = 0; _id_arquivo = null; _pendente = null;
}

// recibo mais novo entre dois (o "ts" vem dentro do recibo assinado)
export function mais_novo(a, b) {
  const ts = (rc) => { try { return JSON.parse(atob(rc.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).ts || 0; } catch (_) { return 0; } };
  if (!a) return b || null;
  if (!b) return a;
  return ts(b) > ts(a) ? b : a;
}
