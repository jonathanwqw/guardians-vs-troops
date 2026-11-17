// conexao.js — os 3 módulos que cuidam da conexão com o servidor, sozinhos.
//
//   1. Recibo       guarda no aparelho o "recibo" assinado da conta (troféus,
//                   likes, ícone, amigos). O jogador nunca vê: serve para entrar
//                   sozinho e para o servidor recuperar a conta se ele reiniciar.
//   2. Vigia        testa a conexão o tempo todo (um "oi" a cada 8 s). Se o
//                   servidor ficar mudo, ou a internet cair, avisa o Religador.
//   3. Religador    reconecta sozinho (espera crescente: 1, 2, 4… até 15 s) e,
//      + Diagnóstico antes de cada tentativa, descobre O QUE aconteceu e o que
//                   fazer: sem internet (espera ela voltar), servidor dormindo /
//                   reiniciando (espera ele acordar), servidor reiniciou (recupera
//                   a conta pelo recibo), conta aberta em outro aparelho (não
//                   insiste). Na batalha, volta para a MESMA partida (o servidor
//                   guarda o lugar por 60 s).

const CHAVE = 'gvt_recibo';
const OI_A_CADA = 8000;          // ms
const MUDO_DEMAIS = 25000;       // ms sem nada do servidor = conexão morta
const DESISTE_DEPOIS = 120000;   // ms tentando sem sucesso: para e mostra o login

// ---------------------------------------------------------------- 1. Recibo
export const Recibo = {
  ler() { try { return localStorage.getItem(CHAVE) || null; } catch (_) { return null; } },
  guardar(rc) { if (typeof rc !== 'string' || !rc) return; try { localStorage.setItem(CHAVE, rc); } catch (_) { /* sem espaço / modo privado */ } },
  apagar() { try { localStorage.removeItem(CHAVE); } catch (_) { /* nada */ } },
};

// ---------------------------------------------------------------- 2. Vigia
export class Vigia {
  constructor(rede) {
    this.rede = rede;
    this.ultimo = Date.now();   // última mensagem do servidor
    this._t = null;
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('offline', () => this.rede._caiu('sem_internet'));
      window.addEventListener('online', () => this.rede.religador.ja());
      document.addEventListener && document.addEventListener('visibilitychange', () => {
        // voltou para o jogo depois de minimizar: confere na hora
        if (!document.hidden) { if (this.rede.estado === 'ligado') this.rede.enviar({ t: 'oi' }); else this.rede.religador.ja(); }
      });
    }
  }
  chegou() { this.ultimo = Date.now(); }
  ligar() {
    this.parar();
    this.ultimo = Date.now();
    this._t = setInterval(() => {
      const r = this.rede;
      if (r.estado !== 'ligado') return;
      if (Date.now() - this.ultimo > MUDO_DEMAIS) { r._caiu('mudo'); return; }
      r.enviar({ t: 'oi' });
    }, OI_A_CADA);
  }
  parar() { if (this._t) clearInterval(this._t); this._t = null; }
}

// ---------------------------------------------------------------- 3. Religador + Diagnóstico
export const TEXTO_DIAG = {
  sem_internet: 'Sem internet. Esperando a conexão voltar…',
  acordando: 'O servidor está acordando (pode levar até 1 minuto)…',
  caiu: 'A conexão caiu. Reconectando…',
  mudo: 'O servidor parou de responder. Reconectando…',
  tentando: 'Reconectando ao servidor…',
};

export async function diagnosticar() {
  // o que aconteceu? (sem internet / servidor fora ou acordando / servidor ok)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'sem_internet';
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch('/health', { cache: 'no-store', signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return 'acordando';
    const d = await r.json().catch(() => null);
    if (!d || !d.ok) return 'acordando';
    return d.regras === false ? 'acordando' : 'ok';
  } catch (_) {
    return 'acordando';
  }
}

export class Religador {
  constructor(rede) {
    this.rede = rede;
    this.ativo = false;      // tentando reconectar agora
    this.motivo = null;      // chave do TEXTO_DIAG
    this.tentativas = 0;
    this.desde = 0;
    this._t = null;
  }
  get texto() { return this.ativo ? (TEXTO_DIAG[this.motivo] || TEXTO_DIAG.tentando) : ''; }
  comecar(motivo) {
    if (!Recibo.ler()) return false;   // sem recibo não há como entrar sozinho
    if (!this.ativo) { this.ativo = true; this.tentativas = 0; this.desde = Date.now(); }
    this.motivo = motivo || 'caiu';
    this._agendar();
    return true;
  }
  ja() { if (this.ativo || (Recibo.ler() && this.rede.estado === 'fora' && this.rede.eu)) { this.ativo = true; this._agendar(0); } }
  parar() { this.ativo = false; this.motivo = null; if (this._t) clearTimeout(this._t); this._t = null; }
  _agendar(espera) {
    if (this._t) clearTimeout(this._t);
    const ms = espera ?? Math.min(15000, 1000 * 2 ** Math.min(4, this.tentativas));
    this._t = setTimeout(() => this._tentar(), ms);
  }
  async _tentar() {
    this._t = null;
    if (!this.ativo) return;
    if (Date.now() - this.desde > DESISTE_DEPOIS) { this.rede._desistir(); return; }
    this.tentativas += 1;
    const d = await diagnosticar();
    if (!this.ativo) return;
    if (d !== 'ok') { this.motivo = d; this._agendar(); return; }
    this.motivo = 'tentando';
    this.rede.ligar();          // ao abrir, a Rede manda o recibo ('retomar')
    this._agendar(Math.min(15000, 2000 * 2 ** Math.min(3, this.tentativas)));   // se não der, tenta de novo
  }
}
