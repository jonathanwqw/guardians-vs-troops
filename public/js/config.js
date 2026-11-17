// config.js — constantes, regras e paleta. Tudo que é número ou cor mora aqui.
// (clone de jogo/config.py)

// Projeção isométrica 2:1 — um tile do mundo vira um losango TW x TH
export const TW = 64;
export const TH = 32;
export const ZH = 28;  // pixels por unidade de altura (z)

// Tamanho da cena em "unidades de tela": U = (x - y), V = (x + y).
export const CENA_U = 46;
export const CENA_V = 100;
export const LX = CENA_U * TW / 2;   // meia largura da cena em px (zoom 1)
// a cena desenhada vai FUNDO_CENA além do campo de jogo atrás de cada base: é
// onde ficam os campos de treino, e assim a câmera consegue mostrá-los no meio
// da tela (as regras continuam usando CENA_V; isto é só a parte visível)
export const FUNDO_CENA = 24;
export const LY = (CENA_V + FUNDO_CENA) * TH / 2;   // meia altura da cena em px (zoom 1)

// Tropas
export const ESPACO = 0.42;        // distância entre soldados na formação (tiles)
export const VEL_SOLDADO = 2.7;    // tiles/s de cada soldado indo ao seu lugar

// Regras do jogo (ajuste aqui para balancear)
export const VIDA_SOLDADO = 10;
export const DANO_TIRO = 2;
export const CADENCIA = [0.7, 2.9];
export const ALCANCE = 9;
export const VEL_ESTRADA = 1.9;
export const VEL_NEVE = 1.2;
export const APOIO = 1.3;
export const VIDA_BASE = 6000;
export const CADENCIA_BASE = 0.07;
export const INTERVALO_SOLDADO = 0.12;
export const MAX_ESQUADROES = 9999;

// Cartas de pelotão
export const PELOTOES = {
  pelotao: { nome: 'Pelotão', soldados: 40, custo: 40, vida: 1.0, vel: 1.0, alcance: 9,
    linha1: '40 fuzileiros', linha2: 'tiro direto' },
  granada: { nome: 'Granadeiros', soldados: 12, custo: 55, vida: 1.0, vel: 1.0, alcance: 13,
    linha1: '12 lançadores', linha2: 'dano em área' },
  foguete: { nome: 'Foguetes', soldados: 4, custo: 140, vida: 1.0, vel: 0.75, alcance: 33,
    linha1: '4 fogueteiros', linha2: '2 tiros/min' },
  canhao: { nome: 'Canhão', soldados: 6, custo: 70, vida: 3.0, vel: 0.7, alcance: 11,
    linha1: '6 + 1 canhão', linha2: 'forte em bases' },
};
// quantos soldados cada um ocupa no limite (o tanque não tem soldados: conta como 10)
export const PESO_SOLDADO = { tanque: 10 };
export function vagas(tipo) { return PELOTOES[tipo].soldados * (PESO_SOLDADO[tipo] || 1); }
PELOTOES.heli = { nome: 'Helicóptero', soldados: 1, custo: 160, vida: 35.0, vel: 1.0, alcance: 13, linha1: '1 helicóptero', linha2: 'granadas + 20/min' };
export const ALT_HELI = 3.2;
export const VEL_HELI = 3.4;
export const CADENCIA_HELI_GRANADA = 3.2;
export const RAIO_HELI_GRANADA = 2.0;
export const DANO_HELI_GRANADA = 18;
export const INTERVALO_DESEMBARQUE = 60.0;
export const QUANTIDADE_DESEMBARQUE = 20;
PELOTOES.tanque = { nome: 'Tanque', soldados: 1, custo: 180, vida: 85.0, vel: 1.20, alcance: 14, linha1: '1 blindado', linha2: 'forte contra bases' };
export const CADENCIA_TANQUE = 4.0;
export const DANO_TANQUE = 115.0;
export const DANO_TANQUE_BASE = 650.0;
export const ORDEM_CARTAS = ['pelotao', 'granada', 'canhao', 'foguete', 'heli', 'tanque'];
export const DESBLOQUEIO_CARTAS = { pelotao: 0, granada: 1, canhao: 2, foguete: 3, heli: 3, tanque: 0 };
// LIMITE DO QUE AS BASES SOLTAM: no máximo estas tropas VIVAS no campo,
// contando só as que vieram das bases (cartas jogadas à mão não contam).
// Valor do QG nível 0; cada nível do QG soma LIMITE_DROP_POR_NIVEL.
export const LIMITE_DROP = { pelotao: 10, granada: 2, canhao: 2, foguete: 2, heli: 1, tanque: 1 };
export const LIMITE_DROP_POR_NIVEL = { pelotao: 2, granada: 1, canhao: 1, foguete: 1, heli: 1, tanque: 1 };
// TREINO DE TROPA: campos atrás da base. Treinar TREINO_TEMPO segundos TRANSFORMA
// a tropa (nível 2V). Não há mais bônus de %: o boneco muda de verdade.
//   Pelotão  -> ATIRADOR DE ELITE: só 15 soldados, alcance x2, -10% de dano, bala atravessa.
//   Granadeiro -> INCENDIÁRIO: no alcance de sempre, granada comum; no anel novo
//               (até o dobro), bomba incendiária: 10% do impacto + círculo de fogo
//               de 10 a 15 s que queima metade do impacto a cada meio segundo.
// torre de defesa: comprada na gaveta de cartas, lança granadas em série
export const CUSTO_TORRE = 120;
export const MAX_TORRES = 4;            // quantas torres cada jogador pode ter
export const ALCANCE_TORRE = 13;        // anel vermelho (de fora): alcance das granadas (o mesmo do granadeiro)
export const ALCANCE_TORRE_TIRO = ALCANCE_TORRE / 2;   // anel amarelo (de dentro): tiro comum
export const VIDA_TORRE = VIDA_BASE;    // a mesma vida da base principal
export const CRITICO_TORRE = 0.25;      // chance de crítico do tiro da torre (só em tanques)
export const CRITICO_TORRE_MULT = 1.5;  // crítico: +50% de dano
export const TORRE_SERIE = 3;           // granadas por série
export const TORRE_INTERVALO = 1.0;     // uma por segundo dentro da série
export const TORRE_CICLO = 5.0;         // uma série a cada 5 segundos
export const TORRE_ALTURA = 3.3;        // de onde sai a granada (topo da torre)
export const DISTANCIA_TORRES = 3.0;    // espaço mínimo entre torres e até bases
// BARRICADA (cavalo de frisa com arame farpado): obstáculo que barra o inimigo
export const CUSTO_BARRICADA = 60;
export const MAX_BARRICADAS = 6;        // por jogador
export const VIDA_BARRICADA = VIDA_BASE / 2;   // metade da torre (que tem a vida da base principal)
export const BARRICADA_COMP = 3.2;      // comprimento (igual ao desenho)
export const BARRICADA_RAIO = 0.55;     // meia grossura (o que a tropa não atravessa)
export const TREINO_TEMPO = 60;      // fase 2: 1 minuto de treino para transformar
export const TREINO_MAX = 1;         // 1 etapa: a tropa vira nível 2V (mostrado como nivel_treino + 1)
export const TREINO_BONUS = 0.25;    // fase 2: a tropa 2V ganha +25% de vida e de dano (além da transformação)
export const TREINO_TIPOS = ['pelotao', 'granada', 'foguete'];   // atirador, granadeiro e fogueteiro
export const NOME_TREINADO = { pelotao: 'Atirador de elite', granada: 'Incendiário', foguete: 'Míssil incendiário' };
export const ELITE_SOLDADOS = 15;       // atirador de elite: só 15 soldados
export const ELITE_ALCANCE = 2.0;       // alcance em dobro
export const ELITE_DANO = 0.9;          // 10% a menos de dano por tiro
export const ELITE_PERFURA = 2;         // a bala atravessa e ainda acerta até 2 tropas atrás
export const INCENDIO_ALCANCE = 2.0;    // o incendiário alcança o dobro (anel novo)
export const INCENDIO_IMPACTO = 0.10;   // impacto da bomba = 10% da granada comum
export const INCENDIO_QUEIMA = 0.5;     // a cada INCENDIO_TICK s, metade do impacto
export const INCENDIO_TICK = 0.5;
export const INCENDIO_DURACAO = [10, 15];   // o círculo queima de 10 a 15 s
export const INCENDIO_RAIO = 2.4;       // tamanho do círculo de fogo
export const INCENDIO_MAX = 4;          // cada tropa tem no máximo 4 círculos acesos ao mesmo tempo
// Fogueteiro 2V (MÍSSIL INCENDIÁRIO): 2 mísseis por disparo, em alvos diferentes;
// cada um dá o dobro do dano do canhão e deixa o círculo de fogo 2x maior
export const MISSIL_DANO = 2;           // x DANO_CANHAO
export const MISSIL_RAIO_FOGO = 2;      // x INCENDIO_RAIO
export const MISSIL_POR_DISPARO = 2;
// LIMITES GLOBAIS (todas as bases juntas, não cada base): de cada tipo de tropa,
// no máximo 2 vivas soltas pelas bases e no máximo 3 vivas compradas por carta.
// Não aumentam com o QG. (LIMITE_DROP acima ficou só como referência antiga.)
export const LIMITE_DROP_TOTAL = 2;
export const LIMITE_CARTA = 3;   // (antigo: agora vale o LIMITE_MAPA)
// FASE 1 (logística): limite de tropas vivas NO MAPA por tipo (bases + compradas,
// contando as que ainda estão chegando). As bases soltam até 2 de cada tipo;
// o resto do limite só se compra, e só com PARAFUSOS. A tropa comprada leva
// CHEGADA segundos para aparecer no lugar escolhido. Moeda não compra tropa.
export const LIMITE_MAPA = { pelotao: 6, granada: 6, canhao: 5, tanque: 5, foguete: 3, heli: 2 };
export const PF_POR_MOEDA = 0.25;   // preço da carta em parafusos = preço antigo em moedas x 0,25
export const CHEGADA = 60;
export function limite_drop(tipo, nivel_qg) { return LIMITE_DROP_TOTAL; }
export const LIMITE_INICIAL = 400;
export const LIMITE_POR_NIVEL = 50;
export const NIVEL_QG_MAX = 4;
export const CUSTO_QG = 120;
export const MOEDAS_INICIAIS = 200;
export const RENDA_MOEDAS = 0.0;
// MULTIPLAYER (tropas_pvp.js)
export const PVP_RENDA_INTERVALO = 0.5;   // +1 moeda sozinha a cada meio segundo
export const PVP_RENDA_TETO = 250;        // ...só enquanto o caixa tem menos de 250
export const PVP_PREMIO_FATOR = 1.10;     // tropa derrubada vale o custo da carta + 10%...
export const PREMIO_ABATE_FATOR = 0.5;    // ...e todo prêmio por abate vale a METADE (solo, IA e PvP)
export const PVP_BASE_VELOCIDADE = 2.0;   // bases soltam cartas 2x mais rápido

// ONDAS DO INIMIGO
export const ONDAS = [
  ['pelotao', 'pelotao', 'canhao', 'canhao'],
  ['pelotao', 'pelotao', 'pelotao', 'granada'],
  ['pelotao', 'pelotao', 'granada', 'granada', 'canhao'],
  ['pelotao', 'pelotao', 'pelotao', 'granada', 'canhao', 'canhao'],
  ['pelotao', 'pelotao', 'pelotao', 'granada', 'granada', 'canhao', 'canhao'],
  ['pelotao', 'pelotao', 'pelotao', 'pelotao', 'granada', 'granada', 'canhao', 'canhao'],
];
export const ONDA_MAX_TROPAS = 8;
export const ONDA_CRESCE = 0.08;
export const ONDA_CRESCE_MAX = 2.0;
export const FORCA_IA = [0.7, 0.06, 1.4];
export const DESCANSO_ONDA = [60, 35];
export const DESCANSO_CAI = 3;
export const ESPERA_ATAQUE = 5;
export const PRIMEIRO_PREPARO = 10;

// Canhão
export const CADENCIA_CANHAO = 2.8;
export const VEL_OBUS = 17;
export const RAIO_CANHAO = 1.1;
export const DANO_CANHAO = 60;
export const DANO_CANHAO_BASE = 110;

// Granadeiros
export const CADENCIA_GRANADA = [4.5, 8.0];
export const RAIO_GRANADA = 2.0;
export const DANO_GRANADA = 6;
export const DANO_GRANADA_SOLDADO = 0.45;
export const DANO_GRANADA_BASE = 12;
export const ERRO_GRANADA = 1.3;
export const FOGOS_POR_EXPLOSAO = 7;
export const DURACAO_FOGO = 2.6;

// BASES
export const BASE_MOEDAS = 17.5;       // cada base viva rende 17,5 moedas (metade dos 35 antigos)...
export const BASE_TEMPO_MOEDAS = 60;   // ...a cada 1 minuto (as novas também)
export const BASE_MOEDAS_TETO = 1000;  // ...só até o caixa chegar a 1000
export const BASE_TEMPO_TROPA = 60;
export const CUSTO_BASE = 150;
export const CUSTO_BASE_FATOR = 1.5;
export const MAX_BASES_EXTRA = 2;      // quantas bases cada um ainda pode CONSTRUIR (além das 3 do começo)
export const TROPA_DA_BASE = 200;      // base extra destruída: saem 200 fuzileiros de quem destruiu
export const VIDA_BASE_EXTRA = 2500;
export const DISTANCIA_BASES = 8;
export const PREMIO_BASE = 300;
export const MAX_SOLDADOS_IA = 450;

// ---------- PARAFUSOS: o recurso das bases ---------------------------------
// cada tropa que uma BASE solta sozinha gasta parafusos (as cartas do
// Batalhão continuam só com moedas). Ganha: cada tropa no campo de treino
// rende 1 parafuso a cada 10 s.
export const PARAFUSOS_INICIAIS = 20;
export const PARAFUSO_CUSTO = { pelotao: 2, granada: 3, foguete: 4, canhao: 4, heli: 5, tanque: 6 };
export const PARAFUSO_TREINO = 10;   // a cada 10 s com gente treinando no campo...
export const PARAFUSO_GANHO = 3;     // ...o campo rende 3 parafusos
export const PARAFUSOS_TETO = 150;   // o "armazém": acima disso o campo não rende mais
// CONSTRUÇÕES custam PARAFUSOS (o material de construção), não moedas
export const PF_TORRE = 40;
export const PF_BARRICADA = 15;
// REPARO: construção sua parada sem levar dano há 8 s se conserta sozinha,
// 1 parafuso por 4% da vida, desde que sobrem mais de 20 parafusos no caixa
// (a reserva fica para as bases soltarem tropas)
export const REPARO_ESPERA = 8;
export const REPARO_PASSO = 0.04;
export const REPARO_INTERVALO = 0.6;   // um conserto a cada 0,6 s por construção
export const REPARO_RESERVA = 20;
// RENDA DE AVANÇO: soldados seus dentro do território inimigo rendem moedas
export const AVANCO_POR_SOLDADO = 0.025;   // por soldado, a cada 10 s (100 soldados = 15/min)
export const AVANCO_INTERVALO = 10;
export const AVANCO_TETO = 5;              // no máximo 5 moedas a cada 10 s (30/min)
// VIRADA: quem tem menos soldados que o adversário ganha mais por abate
export const VIRADA_MAX = 0.5;             // até +50% (com metade dos soldados do outro, ou menos)

// ---------- DEFESA de cada tropa (parte do dano que ela segura) -----------
// pelo porte: soldado a pé segura pouco; canhão tem escudo; helicóptero tem
// cabine blindada; o tanque segura muito (mas não é mais imune ao fuzil).
export const DEFESA = { pelotao: 0.10, granada: 0.10, foguete: 0.12, canhao: 0.25, heli: 0.35, tanque: 0.70 };
export const DEFESA_MAX = 0.85;
// PERFURAÇÃO de cada arma: quanto da defesa do alvo ela ignora
//   dano final = dano x (1 - defesa x (1 - perfuração))
export const PERFURA = { tiro: 0.0, elite: 0.4, granada: 0.25, fogo: 0.5, canhao: 0.5, foguete: 0.6, tanque: 0.6 };

// ---------- PARTIDA SOLO: a tela de configuração ---------------------------
export const LIMITES_TROPA = [250, 500, 750];   // tropas terrestres por jogador
export const DIFICULDADES = {
  1: { nome: 'IA 1', titulo: 'Normal', linha: 'A IA de sempre.' },
  2: { nome: 'IA 2', titulo: 'Estrategista', linha: 'Começa com 2000 moedas e gasta bem.' },
  3: { nome: 'IA 3', titulo: 'Elite', linha: 'A IA 2 com tropas melhoradas: +20% dano, +20% defesa.' },
};
export const IA2_MOEDAS = 2000;
export const IA3_DANO = 1.20;      // duas melhorias de 10%
export const IA3_DEFESA = 0.20;    // somado à defesa de cada tropa
export const IA_RESERVAS = 6;

// Economia
export const PREMIO_POR_SOLDADO = 0.6;
export const PREMIO_MIN = 10;
export const NIVEL_MAX = 5;
export const CUSTO_FATOR = 1.6;
export const MELHORIAS = {
  dano: { nome: 'Dano', custo: 30, passo: 0.25 },
  vida: { nome: 'Vida', custo: 30, passo: 0.20 },
  vel: { nome: 'Velocidade', custo: 20, passo: 0.15 },
  cad: { nome: 'Cadência', custo: 35, passo: 0.12 },
  prod: { nome: 'Produção', custo: 40, passo: 0.12 },
};
export const ORDEM_LOJA = ['dano', 'vida', 'vel', 'cad', 'prod'];
// HABILIDADES: dano/vida/velocidade/cadência compradas para CADA tipo de tropa
// (tela no estilo de "subir atributos"); Produção fica na janela da base principal
export const ORDEM_HAB = ['dano', 'vida', 'vel', 'cad'];
export function custo_hab(m, nivel) { return Math.trunc(MELHORIAS[m].custo * CUSTO_FATOR ** nivel + 0.5); }
export function mult_hab(m, n) {
  const p = MELHORIAS[m].passo;
  return (m === 'cad' || m === 'prod') ? (1 - p) ** n : 1 + p * n;   // cad/prod = tempo menor
}

// Câmera
export const NIVEIS_ZOOM = [0.5, 0.65, 0.8, 1.0, 1.25, 1.6, 2.0];
// zoom fixo: a tela mostra no máximo ~1150 px de largura e ~1500 px de altura da cena
export const ZOOM_LARGURA = 1150;
export const ZOOM_ALTURA = 1500;
export const MAX_PIXELS_TERRENO = 16_000_000;
export const FPS = 60;

export function hexa(s) {
  // '#rrggbb' -> [r, g, b]
  s = s.replace(/^#/, '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

// Paleta fosca: cores chapadas, sem brilho.
export const ESCURO = hexa('#1f2937');
export const BRANCO = [255, 255, 255];
export const NEVE = hexa('#e3e7ef');
export const NEVE_CLARA = hexa('#f3f5f9');
export const NEVE_SOMBRA = hexa('#c4cde0');
export const LOTE = hexa('#eceff5');
export const LOTE_BORDA = hexa('#c9d1e2');
export const LOTE_RISCO = hexa('#d6dce9');
export const SOMBRA = [96, 116, 170];
export const SOMBRA_ALFA = 87;

export const ESTRADA = hexa('#c9a67c');
export const ESTRADA_BORDA = hexa('#b08e68');
export const ESTRADA_TRILHA = hexa('#bb9870');
export const ESTRADA_MARGEM = hexa('#d2d8e6');

export const PINHEIRO = hexa('#3f7d78');
export const PINHEIRO_ESCURO = hexa('#2f615f');
export const TRONCO = hexa('#6b4a35');

export const CONCRETO = { topo: hexa('#aeb6c4'), dir: hexa('#8e97a8'), esq: hexa('#6f788b') };
export const CONCRETO_CLARO = { topo: hexa('#d5dae3'), dir: hexa('#b5bcc9'), esq: hexa('#8f98aa') };
export const JANELA = hexa('#2b3446');
export const MASTRO = hexa('#4b5567');

export const MOEDA = hexa('#f2b632');
export const MOEDA_ESCURA = hexa('#d99a1c');
export const MOEDA_TEXTO = hexa('#ffd04a');
export const FOGO = hexa('#ec6e28');
export const FOGO_CLARO = hexa('#fac846');
export const FUMACA = hexa('#7b8494');
export const FAIXA_GRANADEIRO = hexa('#f2b632');

export const TIMES = {
  verde: {
    base: hexa('#2fa457'), topo: hexa('#46bd6c'), dir: hexa('#2fa457'), esq: hexa('#1f7a3f'),
    faixa: hexa('#e9efe9'), linha: hexa('#2fb45c'), emblema: hexa('#1f8a45'),
    soldado: { claro: hexa('#4fc474'), medio: hexa('#2f9f55'), escuro: hexa('#1e6f3b'),
      capacete: hexa('#185a30'), arma: hexa('#22302a') },
  },
  vermelho: {
    base: hexa('#e2533a'), topo: hexa('#f0705a'), dir: hexa('#dc4f37'), esq: hexa('#a93524'),
    faixa: hexa('#f3ece8'), linha: hexa('#ea5740'), emblema: hexa('#cf3f2b'),
    soldado: { claro: hexa('#f47a62'), medio: hexa('#de4f38'), escuro: hexa('#a53323'),
      capacete: hexa('#86281b'), arma: hexa('#33221f') },
  },
  neutro: {
    base: hexa('#8d96a8'), topo: hexa('#a9b1c0'), dir: hexa('#8d96a8'), esq: hexa('#6c7588'),
    faixa: hexa('#eef0f4'),
  },
};

// Limite de partículas dos efeitos originais do kit-tanque.
export const MAX_PARTICULAS = 700;
export const VEL_PROJETIL_TANQUE = 15.0;

// preço de cada carta em PARAFUSOS (pelotão 10, granada 14, canhão 18, foguete 35, heli 40, tanque 45)
export const PF_CARTA = {};
for (const k in PELOTOES) PF_CARTA[k] = Math.round(PELOTOES[k].custo * PF_POR_MOEDA);
export function limite_mapa(tipo) { return LIMITE_MAPA[tipo] ?? 2; }   // tipo sem número na lista: 2

// ---------- FASE 2: TROPA ABATIDA -----------------------------------------
// Caiu no campo INIMIGO: fica PRESA ali PRESO_TEMPO segundos. Uma tropa sua
// do MESMO tipo que encostar nela resgata metade dos soldados (juntam-se a ela).
// Caiu no SEU campo: metade dos soldados volta para um campo de treino livre
// (ou espera na FILA até um campo vagar). Só tropas a pé: tanque e helicóptero
// são máquinas e se perdem como antes.
export const PRESO_TEMPO = 90;
export const PRESO_RAIO = 2.2;          // distância (além do raio da tropa) para resgatar
export const PRESO_TIPOS = ['pelotao', 'granada', 'foguete', 'canhao'];
export function metade_tropa(tipo) { return Math.max(1, Math.ceil(PELOTOES[tipo].soldados / 2)); }

// ---------- FASE 3: MOEDAS SÓ MELHORAM A BASE ------------------------------
// Moedas não compram tropa: servem para o QG, a produção, as habilidades e
// estas 4 melhorias da base (3 níveis cada, compradas na janela do QG).
export const MELHORIAS_BASE = {
  bvida: { nome: 'Vida das bases', custos: [60, 120, 200], passo: 0.20, txt: n => `+${n * 20}% de vida` },
  tdano: { nome: 'Dano das torres', custos: [60, 120, 200], passo: 0.25, txt: n => `+${n * 25}% de dano` },
  tvel: { nome: 'Velocidade do treino', custos: [50, 100, 170], passo: 0.15, txt: n => `2V em ${Math.round(TREINO_TEMPO * (1 - 0.15 * n))}s` },
  tpf: { nome: 'Rendimento do treino', custos: [50, 100, 170], passo: 1, txt: n => `${PARAFUSO_GANHO + n} parafusos/${PARAFUSO_TREINO}s` },
};
export const ORDEM_MELH_BASE = ['bvida', 'tdano', 'tvel', 'tpf'];
export const MELH_BASE_MAX = 3;
// TORRE DE GRAÇA: toda base CONSTRUÍDA (as que não soltam tropa) vem com uma
// torre ao lado: dano em dobro e metade da vida. Não ocupa vaga de torre.
export const TORRE_GRACA_DANO = 2.0;
export const TORRE_GRACA_VIDA = 0.5;
export const TORRE_GRACA_DIST = 3.6;

// ---------- FASE 4: MUNIÇÃO, REFINARIA E ESTOQUE ---------------------------
// Cada tropa sai com a munição cheia (1.0). Atirando PERTO de uma base sua
// (MUN_RAIO_LIVRE) não gasta nada; longe gasta, e quanto mais longe mais gasta.
// Sem munição a tropa ainda luta, mas com MUN_SEM_DANO do dano.
// Recarrega parada perto de uma base sua que tenha ESTOQUE do item dela:
// uma carga cheia gasta 1 caixa.
export const ITENS = ['balas', 'polvora', 'bombas', 'bolas', 'foguetes', 'pecas'];
export const NOME_ITEM = { balas: 'Balas', polvora: 'Pólvora', bombas: 'Bombas', bolas: 'Bolas de canhão', foguetes: 'Foguetes', pecas: 'Peças de tanque' };
export const COR_ITEM = { balas: [214, 170, 60], polvora: [70, 74, 84], bombas: [96, 128, 70], bolas: [120, 124, 134], foguetes: [214, 96, 80], pecas: [86, 140, 220] };
export const MUN_ITEM = { pelotao: 'balas', heli: 'balas', granada: 'bombas', canhao: 'bolas', foguete: 'foguetes', tanque: 'pecas' };
export const MUN_RAIO_LIVRE = 12;     // perto de uma base sua: tiro de graça
export const MUN_TEMPO = 90;          // segundos de combate longe da base para esvaziar (logo além do raio)
export const MUN_LONGE = 30;          // a cada 30 casas a mais, o gasto sobe +100% (até 3x)
export const MUN_SEM_DANO = 0.3;      // sem munição: 30% do dano
export const MUN_RAIO_RECARGA = 7;    // recarrega a até 7 casas de uma base sua com estoque
export const MUN_RECARGA = 8;         // segundos para encher do zero
export const ESTOQUE_MAX = 30;        // caixas de cada item por base
export const ESTOQUE_QG = { balas: 10, polvora: 4, bombas: 6, bolas: 4, foguetes: 4, pecas: 3 };
export const ESTOQUE_BASE = { balas: 5, polvora: 0, bombas: 3, bolas: 2, foguetes: 2, pecas: 1 };   // base 2 e 3
// REFINARIA (no QG): transforma parafusos em caixas; bombas, bolas e foguetes
// também gastam pólvora. Fila de até REF_FILA pedidos; o que sai vai para o QG.
export const REFINARIA = {
  balas: { pf: 4, polvora: 0, tempo: 8, lote: 2 },
  polvora: { pf: 3, polvora: 0, tempo: 6, lote: 2 },
  bombas: { pf: 4, polvora: 1, tempo: 10, lote: 2 },
  bolas: { pf: 5, polvora: 1, tempo: 10, lote: 2 },
  foguetes: { pf: 6, polvora: 1, tempo: 12, lote: 2 },
  pecas: { pf: 8, polvora: 0, tempo: 14, lote: 1 },
};
export const REF_FILA = 6;

// ---------- FASE 5: CAMINHÃO E LOGÍSTICA -------------------------------------
// Toque no caminhão, depois na base de CARGA e na base de DESCARGA: ele faz a
// rota sozinho, ida e volta, equilibrando o estoque (leva o que falta lá e
// sobra aqui). Pode ser atacado: destruído, a carga se perde.
export const CAMINHAO_CAP = 10;          // caixas por viagem
export const CAMINHAO_VIDA = 900;
export const CAMINHAO_VEL = 0.9;         // fração da velocidade de tropa (estrada/neve)
export const CAMINHAO_TEMPO_CARGA = 3;   // segundos parado para carregar/descarregar
export const CAMINHAO_INICIAIS = 1;      // cada lado começa com 1
export const MAX_CAMINHOES = 3;
export const CUSTO_CAMINHAO = 100;       // moedas (melhora a base: não é tropa)
export const CAMINHAO_RESERVA_QG = 2;    // o QG guarda 2 de cada item
export const CAMINHAO_CHEGOU = 2.8;      // distância da base para operar

// ---------- PvP: MODOS, TEMPO, TROFÉUS E LIKES --------------------------------
// VALE TUDO: vence quem derrubar o QG inimigo. Se o tempo acabar, vence quem
//   tiver o QG mais inteiro (% de vida); igual = empate.
// SOBREVIVENTE: no fim do tempo vence quem tiver MAIS das suas 3 bases (QG,
//   base 2 e base 3) de pé; empatou na contagem, desempata pela vida somada
//   delas (%). O QG continua sendo o coração: se ele cair, acabou.
export const PVP_DURACAO = 15 * 60;          // 15 minutos
export const PVP_MODOS = ['vale_tudo', 'sobrevivente'];
export const NOME_MODO = { vale_tudo: 'VALE TUDO', sobrevivente: 'SOBREVIVENTE' };
export const DICA_MODO = {
  vale_tudo: 'Derrube o QG inimigo. No fim do tempo, ganha o QG mais inteiro.',
  sobrevivente: 'Fique com mais das suas 3 bases de pé quando o tempo acabar.',
};
// TROFÉUS: o servidor calcula quanto a partida vale; quem ganha leva X e quem
// perde perde X (sem ficar negativo). Empate não mexe em nada.
export const TROFEU_MIN = 10;
export const TROFEU_MAX = 40;
export const TROFEU_BASE = 24;
export function trofeus_da_partida(r) {
  // r = { tw, tl (troféus de quem ganhou/perdeu), modo, t (s jogados), como:
  //       'qg' | 'tempo' | 'saiu', margem (0..1: diferença de vida/bases) }
  // 1) força do oponente (tipo Elo): ganhar de quem tem mais troféus vale mais
  const E = 1 / (1 + Math.pow(10, (r.tl - r.tw) / 400));
  const forca = 0.5 + (1 - E);                       // 0,5 .. 1,5 (1,0 entre iguais)
  // 2) velocidade: derrubar o QG cedo vale mais; ganhar só no tempo vale menos
  let vel = 1;
  if (r.como === 'qg') vel = 1 + 0.4 * Math.max(0, 1 - r.t / PVP_DURACAO);
  else if (r.como === 'tempo') vel = 0.85;
  // 3) margem: vitória folgada vale mais
  const margem = 1 + 0.35 * Math.max(0, Math.min(1, r.margem || 0));
  const x = Math.round(TROFEU_BASE * forca * vel * margem);
  return Math.max(TROFEU_MIN, Math.min(TROFEU_MAX, x));
}
