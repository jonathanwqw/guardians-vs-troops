// som.js — todos os sons do jogo, tocados com posição. (clone de jogo/som.py)
//
// No original os sons são SINTETIZADOS em Python puro na primeira vez e
// gravados em cache_sons/ como .wav; nas vezes seguintes são só carregados.
// Aqui vêm os MESMOS .wav que o jogo gerou (pasta sons/), então cada som é
// idêntico ao do pygame. A reprodução segue as mesmas regras:
//   * som à esquerda da tela sai mais na esquerda, longe da câmera sai mais baixo
//   * sons repetidos têm limite por segundo (para 100 soldados atirando
//     juntos não virarem chiado)
//   * no máximo 27 sons ao mesmo tempo + 1 canal reservado para a MÚSICA
//     (o som de guerra do menu)
export const VERSAO = 'v6_menu_kit';
export const VOLUME = 0.85;

// limite de repetição: no máximo 1 som do grupo a cada N segundos
export const _LIMITE = { tiro: 0.045, tiro_base: 0.09, bala: 0.07, neve: 0.05, predio: 0.06, queda: 0.08,
  passos: 0.16, alarme: 3.5, tecla: 0.028, ui: 0.03, moeda: 0.05, erro: 0.1,
  morteiro: 0.08, canhao: 0.1, rodas: 0.3, obus: 0.1, recarga: 0.15, pancada: 0.08,
  chiar: 0.3, contagem: 0.5, sob_ataque: 8.0, base_fraca: 5.0, bandeira: 0.25, radar: 1.0, chegou: 0.2, assobio: 0.25, explosao: 0.09, fogo: 0.5, carta_pronta: 0.2,
  // sons novos dos efeitos (fx.js)
  cartucho: 0.06, estilhaco: 0.12, brasa: 0.35, ricochete: 0.09, eco: 0.5, gelo: 0.4, foguete_voo: 0.3,
  rotor: 0.45, motor: 0.55, brilho: 0.12, neve_fofa: 0.07 };
export const _GRUPO = { selecionar: 'ui', ordem: 'ui', desselecionar: 'ui', clique: 'ui', carta_pega: 'ui', carta_solta: 'ui' };
const _VARIACOES = { tiro: 4, tiro_base: 2, bala: 4, neve: 3, predio: 3, queda: 2, passos: 3,
  morteiro: 3, canhao: 2, assobio: 2, rodas: 3, bandeira: 3, chegou: 2, posicionar: 2,
  pancada: 2, obus: 2, explosao: 3, fogo: 3,
  cartucho: 3, estilhaco: 3, brasa: 3, ricochete: 3, eco: 2, gelo: 2, foguete_voo: 2, rotor: 2, motor: 2, neve_fofa: 3, tecla: 4 };

// todos os efeitos do jogo e do kit de menu (a mesma lista do Sintetizador.receitas)
const _NOMES = ['tiro', 'tiro_base', 'bala', 'neve', 'predio', 'queda', 'passos', 'destruida', 'destruida_amiga',
  'pronta_amiga', 'pronta_inimiga', 'alarme', 'selecionar', 'ordem', 'moeda', 'compra', 'erro', 'vitoria', 'derrota',
  'morteiro', 'canhao', 'assobio', 'explosao', 'fogo', 'carta', 'carta_pronta', 'clique', 'zoom', 'pausa', 'continua',
  'desselecionar', 'carta_pega', 'carta_solta', 'nivel_max', 'inicio', 'construir', 'posicionar', 'chegou',
  'rodas', 'recarga', 'obus', 'pancada', 'chiar', 'sob_ataque', 'base_fraca', 'base_destruida',
  'preparo', 'contagem', 'corneta_inimiga', 'bandeira', 'radar', 'rajada', 'vento',
  'guerra_fundo', 'logo', 'menu_passar', 'menu_clique', 'menu_voltar', 'menu_iniciar',
  // sons novos dos efeitos (fx.js)
  'cartucho', 'estilhaco', 'brasa', 'ricochete', 'eco', 'gelo', 'foguete_voo', 'rotor', 'motor', 'brilho', 'neve_fofa',
  // notificações (avisos.js)
  'aviso', 'aviso_treino', 'sirene', 'tecla', 'dica'];

const _CANAIS = 27;   // pygame.mixer.set_num_channels(28) com 1 reservado

export class Som {
  // toca os sons com posição. Se o áudio não abrir, vira tudo silêncio.
  // O carregamento é feito depois, por carregar(), que devolve o progresso
  // (é o que faz a barra de carregamento andar — ver menu.js).
  constructor(pasta, posicao) {
    // posicao(x, y) -> [pan -1..1, volume 0..1], dada pela câmera
    this.posicao = posicao;
    this.pasta = pasta;
    this.ligado = true;          // efeitos sonoros
    this.musica_ligada = true;   // som de guerra do menu
    this.volume = VOLUME;
    this.ok = false;
    this.sons = {};
    this._ultimo = {};
    this._canal_vento = null;
    this._canal_musica = null;
    this._musica = null;
    this._t_radar = 1.0; this._t_bandeira = 0.5; this._t_rajada = 8.0;
    this._ativos = new Set();
    this._feitos = 0;
    this._total = 0;
    this._carregando = false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.saida = this.ctx.createGain();
      this.saida.connect(this.ctx.destination);
      this._audio = true;
    } catch (e) {   // sem áudio: o jogo continua mudo
      console.warn('Som desligado:', e);
      this._audio = false;
    }
  }

  acordar() {
    // o navegador só libera o áudio depois de um toque do jogador
    if (this._audio && this.ctx.state !== 'running') {
      return this.ctx.resume().then(() => this._retomar_lacos()).catch(() => {});
    }
    return Promise.resolve();
  }

  _retomar_lacos() {
    if (this.ok && this.ligado && !this._canal_vento) this._vento();
    if (this._musica && this.musica_ligada && !this._canal_musica) this.musica(this._musica[0], this._musica[1]);
  }

  async _buscar(nome) {
    try {
      const r = await fetch(`${this.pasta}${nome}.wav`);
      if (!r.ok) throw new Error(r.status);
      const dados = await r.arrayBuffer();
      const buf = await new Promise((ok, erro) => {
        const p = this.ctx.decodeAudioData(dados, ok, erro);
        if (p && p.catch) p.catch(erro);
      });
      this.sons[nome] = buf;
    } catch (e) {
      console.warn('Som que não carregou:', nome, e);
    }
  }

  async carregar_um(nome) {
    // carrega um som antes dos outros (o 'logo' da abertura)
    if (this._audio && !this.sons[nome]) await this._buscar(nome);
  }

  *carregar() {
    // gerador: carrega os sons, devolvendo o progresso 0..1
    if (!this._audio || this.ok) {
      yield 1.0;
      return;
    }
    if (!this._carregando) {
      this._carregando = true;
      const lista = [];
      for (const nome of _NOMES) {
        for (let k = 0; k < (_VARIACOES[nome] || 1); k++) lista.push(`${nome}_${k}`);
      }
      this._total = lista.length;
      this._feitos = 0;
      let proximo = 0;
      const trabalhador = async () => {   // alguns de cada vez, para a barra andar aos poucos
        while (proximo < lista.length) {
          const nome = lista[proximo++];
          if (!this.sons[nome]) await this._buscar(nome);
          this._feitos++;
        }
      };
      for (let i = 0; i < 4; i++) trabalhador();
    }
    while (this._feitos < this._total) yield this._feitos / this._total * 0.99;
    this.ok = true;
    this._vento();
    yield 1.0;
  }

  // ---- canais ----
  _tocar(buf, esq, dir, laco = false, reservado = false) {
    // equivalente a Sound.play() + Channel.set_volume(esq, dir); null se não há canal livre
    if (!this._audio || this.ctx.state !== 'running') return null;
    if (!reservado && this._ativos.size >= _CANAIS) return null;
    const ctx = this.ctx;
    const fonte = ctx.createBufferSource();
    fonte.buffer = buf;
    fonte.loop = laco;
    const canal = { fonte, reservado };
    if (dir === undefined) {
      canal.g = ctx.createGain();
      canal.g.gain.value = esq;
      fonte.connect(canal.g);
      canal.g.connect(this.saida);
    } else {
      const separa = ctx.createChannelSplitter(2);
      const junta = ctx.createChannelMerger(2);
      canal.ge = ctx.createGain();
      canal.gd = ctx.createGain();
      canal.ge.gain.value = esq;
      canal.gd.gain.value = dir;
      fonte.connect(separa);
      separa.connect(canal.ge, 0);
      separa.connect(canal.gd, buf.numberOfChannels > 1 ? 1 : 0);
      canal.ge.connect(junta, 0, 0);
      canal.gd.connect(junta, 0, 1);
      junta.connect(this.saida);
    }
    if (!reservado) {
      this._ativos.add(canal);
      fonte.onended = () => this._ativos.delete(canal);
    }
    fonte.start();
    return canal;
  }

  _parar(canal) {
    if (!canal) return;
    try { canal.fonte.onended = null; canal.fonte.stop(); } catch (_) { /* já parou */ }
    this._ativos.delete(canal);
  }

  tocar_buffer(nome, vol = 1.0) {
    // toca um som solto (ex.: o 'logo' da abertura, antes de carregar tudo)
    if (!this._audio || !this.ligado) return;
    const s = this.sons[nome];
    if (s) this._tocar(s, this.volume * vol);
  }

  // ---- música (canal reservado) ----
  musica(nome, vol = 0.55) {
    // toca 'nome' em laço no canal da música (ex.: 'guerra_fundo' no menu)
    this._musica = [nome, vol];
    if (!this.ok || !this.musica_ligada) return;
    const s = this.sons[nome + '_0'];
    if (!s) return;
    if (this._canal_musica) this._parar(this._canal_musica);
    const canal = this._tocar(s, 0, undefined, true, true);
    this._canal_musica = canal;
    if (canal) {   // entra subindo em 0,9 s
      const agora = this.ctx.currentTime;
      canal.g.gain.setValueAtTime(0, agora);
      canal.g.gain.linearRampToValueAtTime(this.volume * vol, agora + 0.9);
    }
  }

  parar_musica(fade_ms = 800) {
    this._musica = null;
    const canal = this._canal_musica;
    this._canal_musica = null;
    if (!canal) return;
    if (fade_ms <= 0) {
      this._parar(canal);
      return;
    }
    const agora = this.ctx.currentTime;
    canal.g.gain.cancelScheduledValues(agora);
    canal.g.gain.setValueAtTime(canal.g.gain.value, agora);
    canal.g.gain.linearRampToValueAtTime(0, agora + fade_ms / 1000);
    try { canal.fonte.stop(agora + fade_ms / 1000 + 0.05); } catch (_) { /* ok */ }
  }

  aplicar({ volume = null, efeitos = null, musica = null } = {}) {
    // muda volume / efeitos / música (menu de configurações)
    if (volume !== null) this.volume = Math.max(0.0, Math.min(1.0, volume));
    if (efeitos !== null && efeitos !== this.ligado) this.alternar();
    if (musica !== null) this.musica_ligada = musica;
    if (this._audio) {
      if (!this.musica_ligada) {
        if (this._canal_musica) { this._parar(this._canal_musica); this._canal_musica = null; }
      } else if (this._musica) {
        if (!this._canal_musica) {
          this.musica(this._musica[0], this._musica[1]);
        } else {
          const g = this._canal_musica.g.gain, agora = this.ctx.currentTime;
          g.cancelScheduledValues(agora);
          g.setValueAtTime(this.volume * this._musica[1], agora);
        }
      }
    }
    if (this._canal_vento) this._canal_vento.g.gain.value = this.volume * 0.5;
  }

  _vento() {
    const s = this.sons.vento_0;
    if (s && this.ligado) {
      if (this._canal_vento) this._parar(this._canal_vento);
      this._canal_vento = this._tocar(s, this.volume * 0.5, undefined, true);
    }
  }

  alternar() {
    this.ligado = !this.ligado;
    if (this.ok) {
      if (this.ligado) {
        this._vento();
      } else {   // para tudo menos a música
        for (const canal of [...this._ativos]) this._parar(canal);
        this._canal_vento = null;
      }
    }
    return this.ligado;
  }

  ambiente(dt, bandeiras, radar) {
    // sons de fundo do cenário, chamado a cada quadro.
    // bandeiras = [[x, y], ...] dos mastros; radar = [x, y] do QG.
    // Só se ouvem quando a câmera está perto (so_perto).
    if (!this.ok || !this.ligado) return;
    this._t_radar -= dt;
    if (this._t_radar <= 0) {
      this._t_radar = 2.6;
      this.tocar('radar', radar[0], radar[1], 1.0, true);
    }
    this._t_bandeira -= dt;
    if (this._t_bandeira <= 0 && bandeiras.length) {
      this._t_bandeira = 0.5 + Math.random() * 0.9;
      const [x, y] = bandeiras[Math.floor(Math.random() * bandeiras.length)];
      this.tocar('bandeira', x, y, 1.0, true);
    }
    this._t_rajada -= dt;
    if (this._t_rajada <= 0) {
      this._t_rajada = 11 + Math.random() * 14;
      this.tocar('rajada', null, null, 0.6 + Math.random() * 0.4);
    }
  }

  tocar(nome, x = null, y = null, vol = 1.0, so_perto = false) {
    // toca 'nome' na posição (x, y) do mundo; sem posição = som de interface.
    // so_perto=true: não toca se o ponto estiver longe da câmera
    if (!this.ok || !this.ligado) return;
    const grupo = _GRUPO[nome] || nome;
    const limite = _LIMITE[grupo];
    if (limite) {
      const agora = performance.now() / 1000;
      if (agora - (this._ultimo[grupo] || 0.0) < limite) return;
      this._ultimo[grupo] = agora;
    }
    const s = this.sons[`${nome}_${Math.floor(Math.random() * (_VARIACOES[nome] || 1))}`];
    if (!s) return;
    if (so_perto && x !== null && this.posicao(x, y)[1] < 0.3) return;
    if (x === null) {
      this._tocar(s, this.volume * vol);
    } else {
      let [pan, v] = this.posicao(x, y);
      v *= this.volume * vol;
      this._tocar(s, v * Math.min(1.0, 1.0 - pan), v * Math.min(1.0, 1.0 + pan));
    }
  }
}

export class Mudo {
  // substituto silencioso (a batalha do fundo do menu, ou quando não há áudio)
  constructor() { this.ligado = false; }
  tocar() {}
  ambiente() {}
  alternar() { return false; }
}
