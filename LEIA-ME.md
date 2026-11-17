# Guardians vs Troops — versão web (multiplayer)

Clone em JavaScript do kit `Guardians_vs_Troops_Kit_Menu_Integrado` (pygame).
Cada arquivo `jogo/*.py` virou um `public/js/*.js` com o mesmo nome e a mesma
lógica, linha por linha: config, iso, mapa, terreno, objetos, soldado, canhao,
helicoptero, tanque, tropas, efeitos, cena, interface, layout_gavetas, camera,
som, menu, opcoes e o main.

## Rodar

Precisa só do **Node.js** (nenhum `npm install`):

    node server.js

Abra o endereço que aparecer (ex.: `http://localhost:8080`). Para jogar com
outra pessoa na mesma rede Wi-Fi, use o endereço "na mesma rede". Para abrir
pela internet, hospede este projeto em qualquer serviço que rode Node.js
(Render, Railway, Fly.io, uma VPS…) — a porta vem de `PORT`.

No Termux: `pkg install nodejs` e depois `node server.js`.

## O que é igual ao original

- Regras (tropas.js): mesma IA, ondas, cartas, bases, loja, QG, dano, tudo.
  Testado rodando a mesma partida no Python e no JS com o mesmo sorteio:
  os números saem iguais.
- Desenho: mesmas formas, cores, sprites superamostrados 3x, terreno por zoom,
  fonte padrão do pygame (FreeSansBold, incluída em `public/fontes/`).
- Sons: são os próprios `.wav` que o seu jogo gerou em `cache_sons/v6_menu_kit_22050_2/`.
- Menu: toque inicial → MERCURY STUDIOS → carregamento → menu com a batalha
  borrada no fundo → CONFIGURAÇÕES.

Diferenças obrigatórias do navegador: o áudio só liga depois de um toque
(por isso existe a tela "TOQUE PARA COMEÇAR"); as configurações ficam salvas no
aparelho (localStorage) em vez de `opcoes.json`; "SAIR" mostra uma tela final
porque uma página não consegue se fechar sozinha.

## O que é novo: MULTIPLAYER

O botão MULTIPLAYER (que era "EM BREVE") abre:

1. **Entrar / Criar conta** — sempre com e-mail e senha.
2. Duas metades:
   - **AMIGOS**: pedidos de amizade (aceitar/recusar), amigos on, botão
     CONVIDAR para batalha e campo para adicionar pelo e-mail.
   - **GLOBAL**: todo mundo que está on agora (NO MENU / JOGANDO / EM SALA),
     com "+ AMIGO".
3. Convite de batalha → caixa ACEITAR/RECUSAR → **Sala de batalha**
   (quem convidou é VERDE, quem aceitou é VERMELHO).

Nada é guardado em disco: tudo vive na memória do `server.js`. Ficou off,
sumiu das listas. Fechou o servidor, as contas somem. (Em `server.js`,
`APAGAR_CONTA_AO_SAIR = true` apaga a conta também ao ficar off.)

## Batalha entre jogadores

Janelas e habilidades (solo e multiplayer):

- **Toque numa base sua** para abrir a janela dela. Todas as 3 escolhem
  **qual carta soltam** (só as desbloqueadas pelo nível do QG; a escolha
  fica até você trocar). A principal também tem **Nível do QG** e
  **Produção das bases** (vale para as 3).
- **Limite do que as bases soltam** (tropas VIVAS no campo que vieram das
  bases; cartas jogadas à mão não contam). QG nível 0: 10 pelotões,
  2 granadeiros, 2 canhões, 2 foguetes, 1 helicóptero, 1 tanque. Cada nível
  do QG: +2 pelotões e +1 de cada outro. Bateu o limite, a base espera uma
  morrer. A janela da base mostra "vivas/limite" em cada carta. Números em
  `config.js` (LIMITE_DROP e LIMITE_DROP_POR_NIVEL).
- **Habilidades** (botão embaixo à direita): cada tipo de tropa tem Dano,
  Vida, Velocidade e Recarga próprios, até o nível 5. Mesmo preço por nível
  da antiga loja, só que agora separado por tropa.
- **Zoom fixo**: a câmera mostra sempre a mesma porção do mapa (sem + / -,
  roda do mouse ou pinça).

Efeitos extras (fx.js — só enfeite, nada muda nas regras nem na rede):

- Partículas: faíscas e fumaça na boca do fuzil, cartuchos voando, neve
  levantada no impacto da bala, faíscas e pó quando a bala bate em prédio ou
  tanque, explosões com estilhaços de terra e gelo, brasas, anel de choque e
  fumaça; brasas e fumaça subindo do fogo; rastro de fumaça de granadas,
  obuses, foguetes e projéteis do helicóptero; neve chutada pelas tropas
  andando, pelas esteiras do tanque e pelo vento do rotor; baforada de neve
  quando um soldado cai; brilho dourado ao ganhar moedas; bases danificadas
  soltam fumaça e, muito danificadas, pegam fogo; neve caindo na tela.
- Luz: brilho quente sobre a neve nos clarões de tiro, disparos de canhão,
  tanque e foguete, explosões, fogo e bases em chamas (a luz treme).
- Sombra: estilhaços e cartuchos no ar fazem sombra no chão; anel de choque
  das explosões no chão.
- Sons novos (sintetizados como os originais): cartucho, estilhaços, brasa,
  ricochete, eco da explosão, gelo trincando, foguete passando, rotor do
  helicóptero, motor do tanque, brilho das moedas, neve fofa.
- Governador: se o aparelho começa a passar de ~19 ms por quadro, o jogo
  solta menos partículas sozinho (até 30%) e volta quando sobra fôlego.
  Custo medido: ~1,5 ms por quadro numa batalha de 850 soldados.

Desempenho:

- Sem troca de zoom, o terreno e os sprites são desenhados uma vez só.
- Subir o QG / a linha de frente andar redesenha só a faixa do chão por onde
  ela passa (~20 ms em vez de ~250 ms de travada).
- O quadro só ordena e desenha o que está na tela; a lista é reaproveitada.
- Minimapa: o fundo fica pronto numa imagem.
- Terreno em blocos só se passar de 4096 px (limite de textura de celulares).
- Multiplayer: o servidor comprime as mensagens (permessage-deflate); o
  navegador descomprime sozinho.
- Sem lixo na memória a cada quadro (a causa nº 1 de engasgos em jogos de
  navegador: o coletor de lixo pausa o jogo para limpar):
  * a atualização das tropas foi dividida em funções menores (a função
    gigante não era otimizada pelo motor do navegador e cada número com
    vírgula virava um objeto novo);
  * soldados e tropas declaram todos os campos no construtor (formato
    interno único: o motor não "desotimiza" o código quente);
  * laços com índice no lugar de for...of nas listas quentes;
  * partículas guardam só números na lista (cor em campo à parte);
  * o desenho usa buffers reaproveitados, itens de lista reaproveitados e
    uma ordenação estável própria (sem copiar a lista a cada quadro);
  * cache de textos sem montar strings; cache das baforadas de fumaça que
    descarta só as mais antigas (antes apagava tudo e recriava centenas de
    imagens por segundo).
  Conferido: as regras dão exatamente o mesmo resultado (mesma semente ->
  mesmo estado, quadro a quadro) e o desenho os mesmos pixels.

Bases (solo e multiplayer):

- **Cada lado começa com 3 bases**: a principal + 2 extras mais perto do centro.
  Dá para **construir só mais 2** (contam as construídas, não as vivas).
  Só a base principal (QG) sobe de nível.
- **Base extra destruída solta 200 fuzileiros de quem destruiu**, na hora,
  no lugar dela. Essa tropa **não conta no limite de soldados** e **nunca se
  junta com outra**. No solo, a do inimigo já sai atacando pela estrada.

Economia do multiplayer (números em `config.js`, bloco `MULTIPLAYER`):

- **+1 moeda sozinha a cada 0,5 s** para cada jogador.
- **Derrubar uma tropa inimiga paga o custo da carta dela + 10%**
  (Pelotão 40 → 44, Granadeiros 55 → 61, Canhão 70 → 77, Foguetes 140 → 154,
  Helicóptero 160 → 176, Tanque 180 → 198). Tropa fundida vale a soma;
  os 20 que o helicóptero desembarca valem meio pelotão (22).
- **As bases soltam sozinhas, em rodízio, as cartas já desbloqueadas** no nível
  do seu QG, **2x mais rápido** (30 s em vez de 60 s, a loja de Produção
  ainda acelera). Precisa de espaço livre na frente da base e vaga no limite.

Na **Sala de batalha** os dois tocam em **PRONTO** e a partida começa.

- A partida roda **no servidor** (`public/js/tropas_pvp.js`), com as mesmas
  regras do jogo solo (`tropas.js`). Os aparelhos só desenham e mandam as
  ordens, então os dois veem a mesma batalha e ninguém consegue trapacear.
- No servidor, quem convidou é o lado verde e quem aceitou é o lado vermelho,
  mas **na tela cada um se vê sempre VERDE, embaixo, atacando para cima**, e o
  adversário sempre VERMELHO, em cima. Para quem é o vermelho no servidor, o
  aparelho gira o mapa meia-volta e troca as cores; as ordens são desviradas
  antes de ir para o servidor. Só muda o que aparece. Cada um tem as próprias
  moedas, cartas, melhorias, nível de QG e bases.
- Não tem IA nem ondas: as bases dos dois geram pelotões sozinhas, e derrubar
  tropa ou base do outro dá moedas.
- Subir o QG empurra a linha de frente para o lado do outro.
- Vence quem destruir o QG / a base principal do outro.
- **Menu** duas vezes = desistir (o outro vence). Cair a conexão também conta
  como desistir.
- No fim, **Jogar de novo** pede revanche; quando os dois pedem, começa outra.
- Não dá para pausar (a batalha é dos dois).

Arquivos novos: `public/js/tropas_pvp.js` (regras dos dois lados, roda no
servidor) e `public/js/partida_pvp.js` (a partida no aparelho). O jogo solo
continua igual: rodei a mesma partida no Python e aqui depois das mudanças e
os números continuam batendo.

## Treino de tropa

Atrás de cada QG ficam 3 campos de treino cercados, com alvos, pneus, muro,
sacos de areia, torre, bandeira e placa. Os campos têm espaço para 400, 220
e 400 soldados. O lado vermelho tem os mesmos campos, espelhados.

- Só tropas a pé treinam: pelotão, granadeiro, fogueteiro e canhão. Tanque e
  helicóptero não.
- Toque num campo para abrir a janela "i". Ela mostra a tropa e quantos
  soldados vão (−10, −1, +1, +10, TUDO). O canhão sempre vai inteiro. Com o
  campo ocupado, a janela mostra o nível, a barra até o próximo nível e os
  botões SELECIONAR e LIBERAR.
- (Atualizado: ver "Treino que transforma a tropa".) A tropa treina 3 minutos dentro do campo, até o nível 5. Em
  combate o relógio pausa.
- Cada nível dá +10% do valor base em dano, vida, velocidade e recarga. As
  melhorias compradas não entram na conta.
- O nível aparece ao lado do número de soldados, como "3V".
- Uma tropa treinada só se junta com outra do mesmo nível.
- Dar uma ordem para a tropa sair libera o campo e ela mantém o nível.
- A IA do modo solo não treina.

O treino funciona no solo e no multiplayer (comandos `treino` e
`treino_sair`). O mapa visível ficou um pouco mais fundo atrás das bases
para os campos caberem na tela. As regras do campo de batalha não mudaram.

## Torres de defesa

Na gaveta "Cartas", abaixo das 6 cartas, fica uma caixa laranja: TORRE DE
DEFESA.

- Custa 120 moedas. Cada jogador pode ter até 4 torres.
- Toque na caixa e depois num ponto do seu território, fora da estrada, dos
  campos de treino e longe de bases e de outras torres.
- Enquanto a torre está "na mão", o alcance das suas torres aparece no chão
  como um anel laranja. O anel também aparece nos primeiros segundos depois
  de construir.
- A torre tem a mesma vida da base principal (6000). O inimigo mira nela e
  a ataca como a uma base, e com vida zero ela desaba.
- Dois anéis de alcance (cores: vermelho por fora, amarelo por dentro). O de fora (alcance 13) é o do granadeiro: série de
  3 granadas, uma por segundo, que recomeça a cada 5 segundos (0 s, 1 s,
  2 s, depois 5 s, 6 s, 7 s...). O amarelo (metade, 6,5) fica por dentro:
  quando o inimigo entra nele, a torre para as granadas e dá tiro comum, no
  ritmo de um soldado.
- A torre acerta helicóptero nos dois anéis. O tiro dela fura a blindagem do
  tanque e tem 25% de chance de crítico (+50% de dano), só em tanques.
- O morteiro no topo vira para o alvo, dá o coice e solta um clarão a cada
  disparo. As torres aparecem no minimapa como triângulos laranja.
- Funciona no solo e no multiplayer (comando `torre`). A IA do solo não
  constrói torres.

## Inimigo do modo solo (ia.js)

O inimigo agora é um "comandante" que joga com as mesmas regras que você.

- **Mesmo caixa:** começa com as mesmas 200 moedas e as mesmas 2 tropas. Só
  ganha do mesmo jeito: tropa sua derrubada vale o mesmo prêmio, e base sua
  derrubada vale os mesmos 300. Não há mais ondas de graça nem bônus
  escondido de dano.
- **Mesmas cartas e preços:** elas desbloqueiam com o nível do QG dele, com o
  mesmo limite de soldados e o mesmo limite do que as bases soltam.
- **Mesmas funções:** QG (que empurra a linha de frente de volta; vale a
  diferença entre o seu nível e o dele), loja (dano, vida, velocidade,
  cadência, produção), habilidades por tropa, até 2 bases novas, até 4
  torres, a carta que cada base solta e os campos de treino.
- **Mais turnos de ataque:** a primeira onda vem aos 40 s. Depois o descanso
  começa em 42 s e cai até 20 s.
- **Como ele joga:**
  - Junta um grupo na frente do QG e compra cartas que respondem ao seu
    exército: granada contra tropa junta, foguete contra tanque, canhão
    contra torre, fuzil contra helicóptero.
  - Ataca pela estrada onde a sua defesa é mais fraca, às vezes em pinça
    por duas estradas.
  - Manda o helicóptero direto na sua base mais desprotegida.
  - No fim da estrada, vai atrás das suas bases.
  - Tropa muito ferida recua e volta na próxima onda.
  - Se você invade, ele chama as tropas livres, joga cartas entre a base
    dele e você, ergue torre e chama de volta quem está atacando.
  - Calmo, ele investe e treina tropas. Os veteranos (nível 2+) entram nas
    ondas.

## Notificações e guia "?" (avisos.js)

- **Caixinhas:** aparecem na lateral direita, logo abaixo do minimapa,
  sempre do mesmo tamanho. Entram deslizando devagar pelo lado, com um
  brilho correndo na faixa colorida. Ficam 6 s com uma barrinha de tempo e
  saem do mesmo jeito. As de baixo sobem com calma quando uma sai. São no
  máximo 4 ao mesmo tempo.
  - **TROPA CONCLUÍDA** (verde): uma base sua acabou de soltar um grupo. Mostra
    o tipo, quantos soldados e qual base: QG, Base Oeste, Base Leste ou Base
    Centro. Um aviso por grupo.
  - **TROPA TREINADA** (dourado): uma tropa subiu de nível no campo de treino,
    com o nível ("2V").
- **Guia "?":** só aparece quando a tropa está fora da tela no momento do
  aviso.
  - Na borda da tela, do lado em que ela está, fica um marcador com "?", uma
    setinha apontando e uma luz pulsando atrás.
  - Quando a tropa entra na tela, o "?" fica balançando em cima dela por uns
    segundos e some.
  - Selecionar a tropa ou dar ordem a ela tira o "?". Para a tropa do treino,
    o que tira é sair do campo.
- Tocar na caixinha ou no marcador leva a câmera até a tropa.
- Cada aviso tem um som curto: duas notas para tropa pronta e três para
  tropa treinada.
- Funciona no solo e no multiplayer.

## Alarme de invasão, reação das tropas e renda das bases

- **Invasão:** quando uma tropa inimiga entra no seu território, aparece a
  caixinha vermelha "INVASÃO!", com o ícone da tropa inimiga e a base mais
  perto. Ao mesmo tempo:
  - toca a sirene (som sintetizado: tom subindo e descendo entre 700 e
    1000 Hz, duas vezes);
  - um clarão vermelho curto nas bordas (entra forte e some rápido, duas
    vezes);
  - uma faixa larga de luz vermelha atravessa a tela, de um lado e depois do
    outro, como a luz de uma sirene girando. A tela não fica vermelha.

  Se o invasor está fora da tela, um "!" vermelho na borda aponta para ele.
  Um alarme a cada 25 s, no máximo.
- **Tropa sob ataque:** caixinha laranja quando uma tropa sua perde vida com
  inimigo por perto, com o guia se ela estiver fora da tela. No máximo um
  aviso a cada 12 s, e 30 s para a mesma tropa.
- **Reação padrão (você e o inimigo, no solo e no multiplayer):** a tropa que
  leva tiro de quem ela não alcança vai até o atacante, para dentro do
  alcance e luta. Isso só acontece com a tropa parada (ou já reagindo). Uma
  ordem sua ou do comandante continua valendo. A tropa no campo de treino não
  reage.
- **Renda das bases:** cada base viva, inclusive as novas, rende 35 moedas por
  minuto para o dono, com "+35" em cima dela. Vale no solo, para você e para
  o inimigo, e no multiplayer.
- **Limite atingido (azul):** uma base sua está com uma carta escolhida, mas
  o limite do QG para esse tipo de tropa no campo já está cheio. Por exemplo,
  com o Tanque escolhido no QG e o 1 tanque permitido já em campo, aparece
  "Tanque 1/1 · QG parado", com a plaquinha "MÁX" e uma seta para cima (suba
  o QG para liberar mais). O aviso sai uma vez por tipo, quando o limite
  enche, e só volta a avisar depois que liberar e encher de novo (no mínimo
  20 s depois). Tocar nele leva a câmera até a base parada.

## Treino em 3 min e o tanque valendo 10

- **Treino:** cada nível agora leva 3 minutos (antes eram 7).
- **Tanque no limite de soldados:** o tanque conta como 10 soldados, tanto
  no contador "Soldados X/400" quanto para jogar a carta e para a base
  soltar. Vale para você, para a IA e no multiplayer.
- **Painel de ondas:** removido (não há caixa de status nem registro de ondas no topo).

## Tetos de renda

- **Bases:** as 35 moedas por minuto de cada base só entram enquanto o caixa
  está abaixo de 1000. Perto do teto, entra só o que falta para chegar a
  1000; acima dele, a base para de render. Vale para você, para a IA do solo
  e no multiplayer.
- **Renda automática do multiplayer** (+1 moeda a cada meio segundo): só
  enquanto o caixa está abaixo de 250.
- Prêmios por derrubar tropa ou base não têm teto.

## Utilização dos gráficos: fumaça volumétrica (fumaca.js)

Só enfeite, por cima do que já existia (os efeitos antigos continuam iguais).

- **Nuvens com volume:** cada nuvem é uma "couve-flor" de bolhas
  sobrepostas, com a luz vindo de cima à esquerda, a base mais escura (sombra
  própria), um brilho do céu na borda de cima e o contorno esfumaçado. São 5
  variações em 5 tons: fumaça preta de queimada, fumaça de explosão, poeira
  de neve, bola de fogo e fiapo.
- **Explosões ganham um cone de fumaça:**
  - bola de fogo que sobe e apaga;
  - nuvens lançadas para cima num cone de ~25°, que desaceleram lá no alto e
    abrem como um chapéu, com um brilho de fogo por baixo no começo;
  - saia de poeira de neve correndo rente ao chão;
  - fumaça que fica pairando e subindo devagar.
- **Queimadas soltam colunas que sobem para o céu:**
  - fogo no chão: coluna escura;
  - chão queimado ainda quente: fiapos claros;
  - base muito danificada: coluna escura.

  As colunas alargam ao subir, e lá no alto o vento as inclina.
- Sombra macia das nuvens baixas no chão.
- **Desempenho:** até 520 nuvens, texturas prontas, nada nasce fora da tela e
  a quantidade segue o governador de partículas. Com 127 nuvens na tela, a
  mediana do tempo de quadro foi de 16,7 ms (60 FPS).

## Celular: sempre na horizontal e em tela cheia

Vale só para celular e tablet. No computador nada muda.

- **Tela cheia:** no primeiro toque, o jogo pede tela cheia e trava a tela
  deitada (Android/Chrome e navegadores que deixam). O navegador só permite
  isso num toque, então todo toque confere: se sair da tela cheia, o próximo
  toque volta. Em Configurações, "Tela cheia" fica sempre ligada no celular.
- **Onde o navegador não deixa travar** (iPhone/Safari) e o aparelho está em
  pé: o jogo inteiro é desenhado girado 90°, então fica sempre deitado. Os
  toques são convertidos para a tela girada, e os campos de texto do
  multiplayer giram junto.
- **Instalado na tela inicial ("Adicionar à tela inicial"):** o
  `manifest.json` abre o jogo em tela cheia e na horizontal.
- **Tela baixa** (celular deitado): a caixa laranja da torre não cabe embaixo
  das cartas, então vira uma ficha em pé ao lado delas, com o mesmo visual.

## Treino que transforma a tropa (nível 2V)

O treino não dá mais +10% nos atributos. Treinar 3 minutos no campo
transforma a tropa, que passa a mostrar o selo "2V". Treinam o pelotão, o
granadeiro e o fogueteiro.

- **Pelotão vira ATIRADOR DE ELITE**
  - Ficam só 15 soldados. Se o grupo tinha mais, o resto sai do campo como
    pelotão comum (ninguém se perde).
  - Alcance em dobro (18).
  - 10% a menos de dano por tiro.
  - A bala atravessa: depois do alvo, segue reto e acerta até 2 tropas
    inimigas que estejam na linha, atrás dele (tanque continua imune a
    fuzil).
- **Granadeiro vira INCENDIÁRIO**, com dois anéis, como a torre:
  - Amarelo (alcance de sempre, 13): granada comum.
  - Vermelho (de 13 até 26): bomba incendiária. O impacto vale 10% da
    granada comum e deixa um círculo de fogo de 10 a 15 s (varia). O
    círculo queima metade do impacto a cada meio segundo em quem estiver
    dentro (não pega helicóptero).
  - No chão: círculo chamuscado com brasa pulsando, borda acesa e foguinhos
    soltando a fumaça volumétrica.
- **Tela:**
  - Ao selecionar uma tropa transformada sua, os anéis do alcance aparecem
    no chão.
  - A janela "i" do campo mostra quanto falta para a transformação.
  - A notificação diz "Atirador de elite" ou "Incendiário".
- Funciona no solo (a IA também usa) e no multiplayer.

### Ajustes do treino (2V)

- **Tropa 2V não volta para o treino:** ela não aparece mais na lista do campo
  e o servidor também recusa.
- **Saiu a notificação "tropa sob ataque".** As outras continuam.
- **Incendiário: no máximo 4 círculos de fogo acesos por tropa.**
  - Com 4 acesos, a bomba que cai só dá o impacto.
  - Quando um círculo apaga, a próxima bomba que cair (naquele momento, no
    lugar onde ela cai) acende outro.
- **Círculos como bolhas:** onde dois círculos se encostam, a borda entre eles
  some e eles se juntam, mas cada um continua do seu tamanho.
  - O chão chamuscado e a brasa são pintados como união: a sobreposição não
    fica mais escura nem mais clara.
  - A borda acesa só aparece nos trechos de cada círculo que ficam fora dos
    outros.
- **Fogueteiro vira MÍSSIL INCENDIÁRIO (2V):** 2 mísseis por disparo, sempre
  em alvos diferentes (se só houver um alvo no alcance, sai 1).
  - Cada míssil dá o dobro do dano do canhão (120) em quem estiver no ponto
    de impacto.
  - Deixa o mesmo círculo de fogo do incendiário, com o dobro do tamanho.
  - Também vale o limite de 4 círculos acesos por tropa.

## Círculo de visão: parar, atacar e seguir

- **Conferido:** o círculo desenhado é o mesmo que o jogo usa para atacar.
  Para cada tropa (pelotão 9, elite 18, granadeiro 13, incendiário 26,
  foguete 33, canhão 11, tanque 14, helicóptero 13), um inimigo logo dentro
  do círculo é atacado e um logo fora não. As torres usam o mesmo critério.
- **Ao selecionar uma tropa sua,** o círculo do alcance dela aparece no chão.
  O incendiário mostra os dois anéis.
- **Andando e atacando, para todas as tropas,** suas e do inimigo (a pé,
  tanque e helicóptero), no solo e no multiplayer: se um inimigo entra no
  círculo no meio do caminho, a tropa para na hora, ataca e, quando acaba,
  continua até o destino. O tanque e o helicóptero antes passavam direto.
  Ordens de juntar tropas e de perseguir um alvo continuam como eram.
- **Atirador de elite (2V) fere tanque.** O pelotão comum continua sem dano
  em tanque. A bala que atravessa também pega tanque quando é de elite.

## Limites de tropa (valem para tudo, não por base)

- **Bases soltando tropas:** no máximo **2 vivas de cada tipo**, somando todas as bases. O nível do QG não aumenta mais esse número.
- **Cartas:** no máximo **3 compradas de cada tipo** em campo. A carta mostra `LIMITE 3/3` quando chega lá.
- Regras: `LIMITE_DROP_TOTAL` e `LIMITE_CARTA` (config.js). Valem para você, para a IA e no PvP.

## Seção de construção e barricada (barricada.js)

- **Gaveta de Cartas:** embaixo (ou ao lado, em tela baixa) ficam três caixas no mesmo molde, *Base*, *Torre* e *Barricada*. Cada uma tem nome, preço, desenho, quantas já existem e o botão COMPRAR. A compra da base saiu da faixa de cima.
- **Desenho:** cavaletes em X de madeira, tronco no meio, faixa da cor do time e arame farpado. O arame é uma espiral enrolada e fios esticados entre as pontas, com farpas em estrelinha. Tudo é feito no código, em 16 direções. O plano do X fica sempre de frente para a câmera, então o X aparece em qualquer ângulo.
- **Colocar:**
  - Ao tocar na caixa, a barricada aparece no meio da tela, com a faixa no chão verde (pode) ou vermelha (não pode).
  - Para posicioná-la: arraste a barricada ou toque no mapa para levá-la até lá.
  - Em cima dela ficam o **X vermelho** (cancelar) e o **V verde** (confirmar).
  - O ângulo é automático: perto de uma estrada ela fica atravessada na estrada; longe, de frente para o inimigo.
  - **Pode em cima de estrada**. Só no seu território, fora dos campos de treino e sem encostar em bases ou torres.
- **Números:** custa 60, máximo 6 por jogador. A vida é **metade da torre** (3000).
- **Como as tropas lidam com ela:**
  - Ela **não é alvo comum**: ninguém mira nela por estar no alcance.
  - Para o inimigo ela é **obstáculo**. Andando com ordem, a tropa procura a volta pela ponta da barricada (as duas pontas, os dois lados) e segue.
  - A tropa **só ataca a barricada** quando ela está **em cima da estrada** (quem vem pela estrada para e derruba) ou quando **não existe outra rota** (muro de barricadas, sem volta livre). Derrubada, a tropa continua o caminho.
  - Helicóptero passa por cima. As suas tropas atravessam as suas barricadas.
  - Granadas, obuses, foguetes e mísseis também quebram barricadas inimigas.
- **PvP:** comando `barricada` {x, y, ang}. O retrato leva `bar` (time, x, y, ângulo, vida). O ângulo vale dos dois lados, porque o desenho é simétrico em meia volta.
- A IA do modo solo não constrói barricadas, mas as tropas dela respeitam as suas.

## Tutorial (só no modo solo) — tutorial.js

- Aparece em **toda partida solo** enquanto a opção **Ativar tutorial** (Configurações) estiver ligada. Ver até o fim ou pular não desliga a opção; para parar de ver, desligue nas Configurações. No multiplayer não existe.
- **Durante o tutorial:**
  - O jogo fica parado (a onda não anda); só a neve continua caindo.
  - A interface some devagar, e a paisagem escurece e fica embaçada, sem ficar preta.
  - Só o assunto da dica fica nítido e claro, com um holofote de borda macia e contorno pulsando.
  - A câmera viaja até o assunto.
  - A caixa da dica sobe e o texto aparece letra por letra, com barulho de teclado (som `tecla`, 4 variações) e cursor piscando. As palavras importantes saem em amarelo.
  - A caixa escolhe sozinha onde ficar (embaixo, em cima ou do lado) para não cobrir o que está sendo mostrado.
- **Dicas:**
  1. **As suas bases:** as três bases em destaque. Elas dropam unidades, cada base tem 2 unidades, e é preciso ficar atento aos limites de tropa.
  2. **Base 1, a principal:** uma mãozinha toca na base e no botão MELHORAR, e aparece "▲ TROPAS NOVAS".
  3. **Treinamento** (com a interface de verdade): a mão toca na tropa (ela fica selecionada), toca no campo e a **janela real do campo de treino** abre. Depois toca em "ENVIAR PARA O TREINO" e a tropa vai treinar de verdade, aparecendo a legenda "em 3 min vira 2V". No texto final: pelotão vira atirador de elite, granadeiro vira incendiário, fogueteiro vira míssil incendiário.
  3b. **Melhorias** (com a interface de verdade): a mão toca em **Habilidades** e a tela real abre. Escolhe o Pelotão e toca no **+ do Dano**: a melhoria é comprada de verdade e **grátis** ("+1 DANO · GRÁTIS!"). Depois mostra o + da Vida ("cada nível custa moedas") e fecha. Texto final: cada melhoria vale para todas as tropas daquele tipo.
  4. **Batalhão** (a aba de baixo, que antes se chamava *Cartas*): a dica mais animada, com o jogo de verdade.
     - A aba acende por cima do escuro e a mãozinha toca nela.
     - A gaveta abre com as cartas iluminadas, e a mão pega a carta do Pelotão ("GRÁTIS!").
     - A mão toca no campo, e a tropa cai de verdade no ponto marcado.
     - A tropa sai **de graça**: as moedas da carta são dadas e gastas na hora. Se você pular no meio, elas são devolvidas.
     - Depois vem o texto final ("Pronto!... foi grátis!"). Durante a queda o jogo anda só o bastante para a tropa chegar; a onda continua parada.
  5. **Base 2 e base 3:** a câmera vai até a base 2 e a demonstração usa o jogo de verdade.
     - A mão toca na base e a janela dela abre.
     - A mão toca na carta escolhida do **deck da base**, e acende o "0/2 no campo" com a legenda "Só 2 de cada tropa no campo".
     - A janela fecha, a câmera pula para a base 3 e mostra o mesmo.
     - A escolha de carta das bases não muda.
     - Texto final: cada base tem o seu deck, mas só 2 de cada tropa ficam no campo; chegou em 2, a base espera uma cair. "Boa batalha!"
- **Toques:** um toque mostra o texto inteiro; o próximo passa de dica. **PULAR TUTORIAL**, no canto, encerra tudo.

## Destroços (destrocos.js)

São só visuais e não mudam regra nenhuma. Como os efeitos do fx.js, o sistema observa a batalha a cada quadro, então vale no solo, no PvP (os seus e os do inimigo) e no fundo do menu, sem mandar nada pela rede.

- **Tanque:** casco queimado (a paleta "queimado" do tanque.js). A torre fica torta em cima ou é arrancada e cai do lado, deixando o buraco no casco. Esteira solta e lascas de aço em volta.
- **Canhão:** uma roda torta em pé e a outra caída, cano no chão, escudo amassado da cor do time, caixote de munição aberto com as granadas espalhadas.
- **Helicóptero:** fuselagem caída, cabine quebrada, cauda partida, esquis tortos e pás do rotor espalhadas.
- **Base:** lajes rachadas, pedaços do teto curvo desabado (na cor do time, chamuscado) com as nervuras de aço, vigas tortas espetadas, entulho e a porta caída.
- **Torre:** base de concreto rachada, pernas tortas, plataforma caída e sacos de areia rasgados.
- **Barricada:** tronco partido, cavaletes caídos e arame farpado solto no chão.
- **Tropas** (pelotão, granadeiro, fogueteiro/bazuqueiro, equipe do canhão): destrocinhos no chão, como capacete da cor do time, fuzil, lança-granadas, tubo de bazuca, caixote e cinto de munição.
- **Tudo junto:**
  - chão chamuscado embaixo;
  - foguinhos em 3 tons que acendem e apagam em cima do destroço;
  - brilho de brasa no chão, brasas subindo, luz quente, coluna de fumaça escura e estalos do fogo.
- **Tempo:** o fogo dura a primeira parte da vida do destroço e depois sobra um fiapo de fumaça clara. No fim tudo some devagar. Ficam no chão por cerca de 34 s (tanque e helicóptero), 28 s (canhão), 55 s (base), 40 s (torre), 26 s (barricada) e 16 a 24 s (destrocinhos).
- **Limites:** no máximo 28 destroços grandes e 260 destrocinhos ao mesmo tempo (o mais velho sai primeiro). Os desenhos são feitos uma vez e guardados como imagem, para não pesar.

## Deck da base 2 e da base 3

- **Quais bases:** as duas bases iniciais, a **base 2** (à esquerda de quem joga) e a **base 3** (à direita). A **base 1**, o QG, continua como era. Bases compradas depois e as bases da IA também não mudam.
- **Começo da partida:** as duas primeiras notificações são **"ESCOLHA O DECK"** (base 2 e base 3).
  - Ficam **fixas**, com borda dourada pulsando, até você escolher.
  - Tocar nelas leva a câmera até a base e abre a escolha.
  - Com o tutorial ligado, elas aparecem quando ele termina.
  - Tocar na base também abre a escolha.
- **A escolha (janela nova):** as 6 cartas, e você marca **3** (numeradas 1, 2, 3).
  - Cada carta mostra se está LIBERADA, se "dropa no QG n" (bloqueada, mas pode entrar no deck) ou se já está "NA BASE 2/3".
  - As duas bases **não repetem cartas**.
  - **CONFIRMAR DECK** só acende com 3 marcadas. É **uma vez só**: depois não muda.
- **Depois:**
  - A janela da base mostra só as 3 cartas do deck, e você escolhe **qual delas a base dropa**.
  - Carta bloqueada só dropa quando o nível do QG liberar. Se o deck inteiro ainda estiver bloqueado, a base espera.
  - Sem deck escolhido, a base não solta tropa.
  - As cartas fora do deck de uma base só saem pelo **Batalhão** (comprando).
- **PvP:** os dois jogadores escolhem os seus decks. Comando `deck` {x, y, cartas}; o servidor confere tudo (3 cartas, sem repetir, uma vez só). O retrato das bases leva o número da base e o deck.
- O tutorial (dica "Base 2 e base 3") mostra a escolha: marca 3 cartas e aponta o CONFIRMAR, sem confirmar, porque quem escolhe de verdade é você.

## Nova Partida (solo): limite de tropas e dificuldade da IA

- **INICIAR → tela NOVA PARTIDA** (as escolhas ficam salvas):
  - **Tropas terrestres por jogador:** 250, 500 ou 750.
    - O 750 mostra um aviso: *pode ter quedas de FPS e travadas, dependendo do aparelho*.
    - O limite vale para você e para a IA e **não sobe com o QG**.
    - O helicóptero não conta, porque não é tropa terrestre.
  - **Dificuldade da IA:**
    - **IA 1 · Normal:** a IA que já existia.
    - **IA 2 · Estrategista:** começa com **2000 moedas** e gasta com critério. Sempre guarda reserva para responder com cartas; calma, investe na ordem QG → dano/vida das tropas que mais usa → base nova → até 3 torres na estrada que você mais ataca → loja.
    - **IA 3 · Elite:** a IA 2 com as tropas melhoradas: **+20% de dano** (duas melhorias de 10%) e **+20% de defesa**.
  - **JOGAR** abre uma tela de carregamento: barra, dicas e o resumo do que foi escolhido.
- **PvP e o fundo do menu** continuam com o limite antigo (400 + 50 por nível do QG).

## Defesa das tropas (nova regra, vale no solo e no PvP)

Cada tropa segura uma parte do dano, conforme o porte. Cada arma fura uma parte dessa defesa:

    dano final = dano x (1 - defesa x (1 - perfuração))

| Tropa | Defesa |
|---|---|
| Pelotão | 10% |
| Granadeiros | 10% |
| Foguetes | 12% |
| Canhão (escudo) | 25% |
| Helicóptero (cabine blindada) | 35% |
| **Tanque** | **70%** |

| Arma | Fura da defesa |
|---|---|
| Fuzil | 0% |
| Atirador de elite / tiro da torre | 40% |
| Granada | 25% |
| Fogo | 50% |
| Canhão | 50% |
| Foguete / míssil | 60% |
| Tanque | 60% |

- O **tanque não é mais imune ao fuzil**: leva pouco (cerca de 30% do dano do tiro), mas leva.
- O **helicóptero não leva dano de granada nem de canhão**, nem da explosão em área nem do fogo, porque granada não alcança o céu. Granadeiro e canhão também não miram nele.
- **IA 3:** +20% somado à defesa de cada tropa dela (máximo 85%).
- Valores em `config.js`: `DEFESA`, `PERFURA`, `DEFESA_MAX`, `LIMITES_TROPA`, `DIFICULDADES`, `IA2_MOEDAS`, `IA3_DANO`, `IA3_DEFESA`.

## Parafusos (novo recurso)

- Caixa nova ao lado das moedas, com ícone de parafuso de cabeça sextavada.
- Toda tropa que uma **base** solta sozinha (QG, base 2 e base 3) custa parafusos:
  pelotão 2 · granadeiros 3 · canhão 4 · foguetes 4 · helicóptero 5 · tanque 6.
  As cartas do **Batalhão** continuam custando só moedas.
- Cada time começa com 20 parafusos.
- **Como ganhar:** cada campo de treino com tropa treinando rende 3 parafusos a cada 10 s (aparece um "+3" flutuando). Campo vazio não conta.
- Sem parafusos suficientes, a base fica esperando: aparece um "?" vermelho em cima dela e a notificação "FALTAM PARAFUSOS".
  A janela da base mostra o custo em cada carta.
- A IA também usa parafusos e treina mais cedo quando está com poucos.
- **Moedas:** o prêmio por abate caiu 50% e a renda das bases caiu de 35 para 17,5 por minuto. Isso vale para todos: você, IA e PvP.
- **Dica dos parafusos:** com "Ativar tutorial" ligado, na primeira vez da partida em que faltam parafusos o jogo pausa e a câmera vai até os campos de treino. Aparecem 3 caixas curtas explicando como conseguir mais parafusos. Só acontece uma vez por partida.
- **Notificações mais limpas:** "Tropa concluída" e "Limite atingido" não aparecem mais na caixa lateral.
  - A tropa pronta fora da tela continua com o marcador na borda.
  - Base com tropa no limite mostra uma bolinha azul "MÁX" em cima dela.
- **Parafusos só saem quando a tropa sai de verdade:** uma base no limite ou sem lugar livre não gasta parafusos.

## Economia nova

Cada regra resolve um problema do jogo:

- **Construções custam parafusos.** Torre: 40 parafusos. Barricada: 15 parafusos. Não custam mais moedas; a base extra continua em moedas.
  - Resolve: parafusos sobrando com 3 campos ocupados e moedas apertadas.
- **Armazém de parafusos:** no máximo 150. Com o armazém cheio, o campo para de render e o número fica dourado.
- **Reparo automático:** construção sua (base, torre, barricada) que fica 8 s sem levar dano se conserta sozinha.
  - Gasta 1 parafuso por 4% da vida, a cada 0,6 s; aparece uma cruzinha verde.
  - Só gasta o que passar de 20 parafusos: a reserva fica para as bases soltarem tropas.
- **Campo de treino vira alvo.** Com tropa inimiga dentro, o campo para de render parafusos.
  - Aparece a placa vermelha "INVADIDO · SEM PARAFUSOS" e a notificação "CAMPO INVADIDO".
  - A IA ataca os seus campos ocupados: helicópteros a cada 2 ondas e parte da tropa nas ondas ímpares.
  - Resolve: o treino era "colocar e esquecer".
- **Renda de avanço.** A cada 10 s, cada soldado seu dentro do território inimigo rende 0,025 moeda (até 5 moedas a cada 10 s, ou seja, 30/min).
  - Resolve: ficar parado só defendendo.
- **Virada.** Quem tem menos soldados que o adversário ganha mais por abate, até +50%. Aparece a etiqueta "VIRADA · abate +X%" embaixo das moedas.
  - Resolve: a bola de neve de quem já está ganhando.
- Tudo vale para você, para a IA e para o PvP.

## Gráficos: estradas e árvores

Tudo é desenhado uma vez só, junto com o chão (decor.js) ou no sprite da árvore (objetos.js), então o custo por quadro é zero.

- **Estradas:**
  - manchas de lama;
  - neve suja grudada nas beiradas;
  - 2 pares de sulcos de pneu ondulando, com filete de luz;
  - faixa de lama derretida no meio;
  - poças congeladas com reflexo;
  - pedrinhas;
  - montinhos de neve empurrada nas margens (sem invadir os cruzamentos);
  - pegadas na neve ao lado.
- **Árvores, 6 tipos:** clássico, alto e fino, gordo, novinho, carregado de neve e seco com galhos nevados.
  - Algumas ficam tortas e o verde varia de uma para outra.
  - Todas têm montinho de neve no pé e bolotas de neve nas pontas.
  - A sombra acompanha a altura de cada tipo.
- **Chão:** arbustos nevados, pedras com capa de neve, tocos, galhos caídos, tufos de capim e rastros de coelho, em volta das árvores e soltos pelo mapa.

## Desempenho (sem mudar jogabilidade)
Objetivo: mais FPS e menos travadas, com as mesmas regras, mesmas decisões e mesmo resultado.

- Passo fixo (passo.js): a simulação roda em passos de 1/60 s, com teto de 0,05 s por quadro. A posição desenhada é interpolada entre passos; só o desenho muda de ritmo, não a regra.
- Agenda (agenda.js): orçamento de 2 ms por quadro para trabalho extra (carimbos de cena).
- Grade de esquadrões (grade.js): consultas de proximidade viram busca em células, com a mesma ordem de resultado.
- Distância até a estrada (mapa.js): grade de candidatos exata, com fallback para a busca completa. Mesmos valores, mais rápido.
- Rotas de estrada em cache (tropas.js): o grafo e as rotas são calculados uma vez e reaproveitados.
- Listas temporárias compactadas (tropas.js): só remove itens mortos; a ordem dos vivos não muda.
- Atlas de sprites (atlas.js): os soldados são desenhados a partir de uma folha só, com os mesmos pixels.
- Carimbos (carimbo.js): esquadrões parados são guardados como imagem só quando a checagem prova que nada se sobrepõe; senão, desenha como antes.
- Governador de qualidade (qualidade.js): só reduz efeitos visuais (fumaça, partículas, destroços) quando o quadro está lento. Não mexe em regra.
- Escala de resolução (pg.js): em aparelhos de tela muito densa, pode renderizar menor; a escolha fica em localStorage ('gvt_resolucao').
- Painel de desempenho (painel.js): F3, ou toque triplo nas caixas de moedas/parafusos. Mostra FPS, tempos de lógica e desenho.
- Caches de texto e cor (pg.js podar): limitados em tamanho, sem efeito na tela.
- IA (ia.js): o "pensar" continua no mesmo quadro, com as mesmas decisões. A otimização vem de dentro das funções (grade e cache), não de adiar as decisões.

Verificação: com semente fixa, a partida simulada e o teste de igualdade batem byte a byte com a versão anterior.

## Publicação e multiplayer online (Render)
- Correção de conexão aplicada no server.js (revisão online-1): aceita o endereço público, registra a conexão já no aperto de mão e trata o fim do TCP. Mesmo servidor serve public/ e o WebSocket /ws.
- package.json: start `node server.js`, Node 24.x, sem dependências.
- Render (Web Service, Runtime Node, Build `npm install`, Start `node server.js`, um único processo). O Render fornece RENDER_EXTERNAL_URL sozinho.
- Domínio próprio: defina ORIGENS_PUBLICAS=https://seudominio.com (sem asterisco; separe por vírgula).
- Conferir: abra /health e veja revisao="online-1", multiplayer=true, regras=true.
- Contas: continuam em memória. Quem cria a conta já entra no GLOBAL. Reiniciar ou redeployar apaga as contas.

## Tempos dos jogadores (abinha TEMPOS)
- Cada jogador que já entrou tem três contadores, todos medidos pelo servidor: **Online** (do login até sair ou cair), **Batalha (contra a IA)** e **PvP** (até a partida acabar, ou até sair/cair).
- O botão TEMPOS aparece no GLOBAL e nos AMIGOS; abre a abinha com as três linhas separadas.
- Quem está on mostra o tempo andando. Quem saiu aparece como OFF com o último valor, enquanto o servidor estiver no ar.
- Os tempos e as contas ficam num arquivo simples `dados.json` (ou no caminho de DADOS_ARQUIVO). A senha fica só como hash com sal.
- O arquivo é salvo a cada 30 s e ao desligar o servidor (SIGTERM/SIGINT). Uma queda brusca perde no máximo os últimos 30 s.
- Atenção no Render: o disco do plano gratuito não é permanente. Redeploy ou reinício do serviço pode apagar o arquivo.
- O tempo de batalha contra a IA é informado pelo navegador (ao iniciar e voltar ao menu). Os outros dois são medidos pelo servidor.

## Modo versus zumbi
- Ao tocar em INICIAR aparece a tela ESCOLHA O MODO: Modo normal (versus IA) ou Versus zumbi. Depois vem a NOVA PARTIDA de sempre; no modo zumbi a dificuldade vira o TAMANHO DA HORDA (1, 2 ou 3: até 700, 1100 ou 1500 zumbis vivos ao mesmo tempo).
- O seu lado é igual ao modo normal: moedas, parafusos, cartas, bases, torres, barricadas, treino.
- Do outro lado não há base: o QG, os galpões e os campos de treino vermelhos somem, e no lugar do QG fica a NAVE CAÍDA (9000 de vida), com cratera, motores, aletas, rasgo no casco, gosma, fungo, talos de cordyceps, veios, poças e larvas. Vitória: destruir a nave. Derrota: perder a sua base principal.
- Zumbis: um pouco maiores que os soldados, três tipos (ex-soldado, civil e estalador com a cabeça tomada de fungo). Sempre sozinhos, sem grupo e sem canhão. Mordem tropas, torres, bases e barricadas.
- Andar: 90% pelas estradas (cada um numa faixa da estrada, sempre em linha reta até um ponto pouco à frente), 10% pela neve, em linha reta até uma base sua. Quem enxerga algo seu por perto vai reto nele; quando acaba, volta para a estrada. Passo manco e empurrão leve entre vizinhos para não empilhar.
- Hordas: a primeira sai aos 30 s; cada uma é maior que a anterior; entre hordas, zumbis soltos continuam chegando. Cada abate rende 0,35 moeda (somadas e pagas uma vez por segundo).
- Desempenho (zumbis.js): grade de células 1x1 para vizinhos, mira e explosões; cada zumbi procura alvo a cada 1/3 s (em fatias); separação em metades alternadas; caminho sem busca (só um índice na lista de pontos da estrada). Medido no Node: 1500 zumbis vivos custam em média 0,7 ms por passo das regras.
- Especiais (poucos por horda, cada um com 2 versões), desenhados osso por osso a cada quadro (pernas e braços com cinemática inversa de dois ossos):
  - MONSTRO (pálido de tendões / queimado com fungo): alto, de pernas de bicho e braços até o chão. Fica a 6 da linha, agacha, arranca uma pedra do chão, leva para trás da cabeça e arremessa em arco. Onde a pedra cai: dano em cada soldado dentro do raio (1,3 ou 1,6), nas torres, barricadas e bases. Recarga de 4,5 a 5,5 s. Sai desde a 1ª horda.
  - GRANDÃO (inchado / brutamontes com couraça de fungo): enorme e lento, morde forte. SUPER GRITO: estufa o peito, joga a cabeça para trás e solta uma onda em leque da boca (até 6,5 ou 7,5). Cada tropa que a frente da onda pega leva dano por soldado e fica sem atirar por 1,8 a 2,2 s; torres e barricadas no leque também levam dano. Recarga de 10 a 12 s. Sai a partir da 2ª horda.
- DISCO VOADOR: a partir da 2ª horda saem da nave caída (um a cada 5 s, até 1 a 3 por horda). Sobe, flutua até a tropa sua mais perto e para em cima dela: o raio de luz puxa um soldado a cada 0,9 s (canhão e tanque: uma peça a cada 3,5 s), que sobe girando para dentro do disco. Fica 1 minuto no mapa e depois sobe e some (sem prêmio). Suas tropas atiram nele (160 de vida, 20 moedas se cair); granada, canhão, foguete e pedra não pegam no céu. Abatido, ele tomba soltando fumaça preta e explode no chão. Visual: casco de metal negro, torto e sem simetria, com nervuras, chapa solta, rombo, fungo na borda, cabos pendurados balançando, fenda vermelha pulsando no meio e só três luzes vermelhas fracas; o raio é uma luz fria e fraca, com poeira subindo. Voa alto (7) para ficar acima do nome das tropas.
- Tamanho: monstros e grandões são desenhados 3x maiores e as pedras 5x maiores (K_ESP e K_PEDRA em zumbi_visual.js). O raio de dano das pedras não mudou.
- O tutorial não aparece no modo zumbi (ele ensina as ondas do inimigo normal). O modo normal continua idêntico (mesmo carimbo no teste de igualdade).

## Logística — Fase 1 (limites, compra com parafusos, chegada em 1 min, GPS)

- **Limite no mapa por tipo** (`config.js` → `LIMITE_MAPA`): pelotão 6, granadeiros 6, canhão 5, tanque 5, foguetes 3, helicóptero 2. Conta tropa cheia (soldados ÷ tamanho da tropa, arredondado para cima), então juntar tropas não abre vaga. Vale para você, para a IA e para o PvP.
- **Quem solta tropa:** só o QG, a base 2 e a base 3, até 2 de cada tipo. Base construída não solta (a janela dela avisa).
- **Compra:** cartas custam só **parafusos** (`PF_CARTA` = 25% do preço antigo em moedas: pelotão 10, granadeiros 14, canhão 18, foguetes 35, heli 40, tanque 45). A tropa comprada aparece no ponto escolhido depois de **60 s** (`CHEGADA`); até lá fica uma marca no chão com o relógio. Moedas não compram mais tropa.
- **GPS da base:** toque na base → selo **GPS** no cabeçalho da janela → toque no mapa. As tropas que essa base soltar vão sozinhas até a bandeira (linha tracejada mostra a ligação). No PvP vai pelo comando `gps` e o servidor confere.

## Logística — Fase 2 (tropa abatida, resgate, fila do treino, nível 2)

- **Caiu no campo inimigo → PRESA** por 90 s (`PRESO_TEMPO`), com uma cela, um anel de tempo e o aviso "RESGATE Ns". Uma tropa sua do **mesmo tipo** (comum, fora do treino) que encostar resgata **metade de uma tropa cheia** (`metade_tropa`). Esses soldados juntam-se a ela, se couberem nos limites. Passados os 90 s, a tropa se perde.
- **Caiu no seu campo → volta para o treino:** metade de uma tropa cheia nasce num campo de treino livre. Se os campos estiverem ocupados ou invadidos, espera na **FILA DO TREINO**, que aparece numa placa azul e na janela do campo.
- Vale para pelotão, granadeiros, foguetes e canhão (`PRESO_TIPOS`). Tanque e helicóptero são máquinas e se perdem como antes. Não vale no modo zumbi. A IA e o PvP seguem as mesmas regras.
- **Nível 2 (2V):** sai em **1 min** de treino (`TREINO_TEMPO = 60`) e ganha **+25% de vida e dano** (`TREINO_BONUS`), além da transformação de antes. A tropa 2V **não rende mais parafusos** e continua no campo até você liberá-la.

## Logística — Fase 3 (moedas só melhoram a base, torre de graça)

- **Moedas não compram tropa.** Servem para o nível do QG, a produção, as habilidades e as novas **Melhorias da base**, abertas pelo botão **Melhorias**, ao lado de Habilidades. São 3 níveis em cada uma (`MELHORIAS_BASE`):
  - **Vida das bases:** +20% por nível no QG e em todas as bases, na hora e nas que forem construídas depois (60/120/200 moedas).
  - **Dano das torres:** +25% por nível (60/120/200).
  - **Velocidade do treino:** o 2V sai 15% mais rápido por nível (60 s → 51 → 42 → 33) (50/100/170).
  - **Rendimento do treino:** +1 parafuso por ciclo de 10 s (3 → 4 → 5 → 6) (50/100/170).
- **Torre de graça:** toda base construída (as que não soltam tropa) já nasce com uma torre ao lado, virada para o inimigo, com **dano x2** e **metade da vida**. Ela não ocupa vaga de torre (o limite de 4 continua só para as compradas).
- A IA compra essas melhorias e também ganha a torre. No PvP vai pelo comando `mb` e o servidor confere.

## Logística — Fase 4 (munição, refinaria, estoque nas bases)

- **Munição:** toda tropa sai cheia, e a barrinha amarela sob a vida aparece quando falta munição.
  - **Perto de uma base sua** (12 casas, `MUN_RAIO_LIVRE`), atirar é de graça.
  - **Longe**, o gasto começa em 90 s de combate para esvaziar e sobe até 3x quanto mais longe a tropa estiver.
  - **Sem munição**, a tropa luta com **30% do dano** e mostra "SEM MUNIÇÃO".
- **Recarga:** a tropa recarrega parada a até 7 casas de uma base sua que tenha o item dela no estoque. Uma carga cheia gasta 1 caixa.
  - **Balas:** pelotão e helicóptero.
  - **Bombas:** granadeiros.
  - **Bolas de canhão:** canhão.
  - **Foguetes:** fogueteiros.
  - **Peças de tanque:** tanque.
  - **Pólvora:** é matéria-prima.
- **Estoque inicial:** o QG começa com balas 10, pólvora 4, bombas 6, bolas 4, foguetes 4 e peças 3. As bases 2 e 3 começam com metade disso, sem pólvora. A base construída começa vazia. O máximo é 30 caixas de cada item por base.
- **Refinaria**, no botão ao lado de Melhorias: transforma parafusos em caixas, que saem no QG. Bombas, bolas e foguetes também gastam 1 pólvora. A fila tem até 6 pedidos. A janela mostra o estoque de todas as suas bases; quem leva estoque de uma base para outra é o caminhão, na fase 5.
- A IA pede na refinaria o que as tropas dela mais usam. No PvP o pedido vai pelo comando `ref`. Isto não vale no modo zumbi.
- Correção da fase 1: as bases 2 e 3 da IA voltaram a soltar tropa (`b.inicial`).

## Logística — Fase 5 (caminhão e aba de logística)

- **Caminhão:** cada lado começa com 1, ao lado do QG, e pode comprar até 3 por **100 moedas**, na janela Logística. Ele leva até **10 caixas**, tem 900 de vida e anda pelas estradas um pouco mais devagar que as tropas.
- **Rota:** toque no caminhão no mapa, depois na **base de carga** e na **base de descarga**. Também dá para usar o botão **ROTA** na janela. Daí ele vai e volta sozinho.
  - Para carregar, ele fica 3 s parado na base e leva o que **falta no destino** e **sobra na origem**.
  - O QG sempre guarda 2 caixas de cada item. A pólvora fica no QG, porque é matéria-prima da refinaria.
  - Para descarregar, fica 3 s parado, respeitando o máximo de 30 caixas por item na base.
  - Se não houver nada para levar, ele espera e tenta de novo.
  - O botão **PARAR** desfaz a rota.
- **Pode ser atacado:** para o inimigo, o caminhão é um alvo como as torres. Destruído, a carga se perde, e você compra outro.
- **Aba Logística:** o botão Refinaria virou **Logística**, com duas abas:
  - **Caminhões e estoque:** lista dos caminhões (rota, estado, carga e vida), compra de caminhão e estoque de todas as bases.
  - **Refinaria:** a mesma da fase 4.
- **IA:** compra um 2º caminhão e manda cada um do QG para a base dela com menos estoque, repensando a cada 30 s.
- **PvP:** comandos `cam` (de/para/parar) e `cam_comprar`. O servidor confere a base pela posição. A rota e a carga do inimigo não aparecem para você.
- No modo zumbi não há caminhões, porque também não há munição.

### Ícones dos materiais

Os seis materiais da refinaria têm ícones desenhados em código (`icones.item`, em `icones.js`), sobre um quadradinho claro na cor de cada um:
- **Balas:** três cartuchos de latão com ponta de cobre.
- **Pólvora:** barril de madeira com cintas e pavio aceso.
- **Bombas:** bomba preta com pavio e faísca.
- **Bolas de canhão:** pirâmide de três balas de ferro.
- **Foguetes:** foguete vermelho com ogiva, aletas e chama.
- **Peças de tanque:** engrenagem de aço com chave inglesa.

Eles aparecem nos quadros da Refinaria, na fila e no cabeçalho da tabela de estoque. A pólvora que o item gasta também aparece como ícone.

## Logos

- `public/img/logo_jogo.png`: logo GUARDIANS VS TROOPS sem fundo (letras com neve em cima, selo VS verde/vermelho). Aparece no lugar do nome escrito na tela de carregamento e no menu.
- `public/img/logo_mercury.png`: logo do MERCURY STUDIO sem fundo (planeta com asas e anel). Aparece na abertura.
- Se a imagem não carregar, volta o nome em texto, como antes. Os arquivos-fonte estão desenhados em código (canvas) e as letras usam a fonte Lilita One.

## PvP: modos, 15 minutos, troféus e likes

- **Modo:** escolhido na **sala**. Qualquer um dos dois troca, e os dois voltam a "não pronto".
  - **VALE TUDO:** vence quem derrubar o QG inimigo. Se acabarem os 15 min, vence quem tiver o QG mais inteiro (% de vida). Se ficar igual, é empate.
  - **SOBREVIVENTE:** no fim dos 15 min vence quem tiver **mais das suas 3 bases** de pé (QG, base 2 e base 3). Se empatar na contagem, desempata pela vida somada delas. O QG continua sendo o coração: se ele cair, a partida acaba.
- **Relógio:** pílula no topo com o modo, o tempo que falta e o placar (QG % x % ou Bases 3 x 2). Ela pisca vermelho no último minuto.
- **Troféus:** o servidor calcula quanto a partida vale (`trofeus_da_partida` no `config.js`), entre **10 e 40**.
  - **Força:** ganhar de quem tem mais troféus vale mais (conta do tipo Elo).
  - **Velocidade:** derrubar o QG cedo vale até +40%. Ganhar só no tempo vale -15%.
  - **Margem:** vitória folgada vale até +35%.
  - Quem ganha leva X e quem perde perde X, sem ficar negativo. Empate não muda nada.
  - Quem sai antes do fim perde na hora.
- **Likes:** no fim da partida, o botão **CURTIR** dá 1 like ao oponente, uma vez por partida.
- **Na conta:** troféus, likes, vitórias e derrotas ficam salvos (`dados.json`). Aparecem no topo da tela de multiplayer, nas listas e na sala.
- Para testar rápido: `PVP_TESTE_DURACAO=40 node server.js` deixa a partida com 40 s.

## Perfil da conta

- **10 ícones de conta**, desenhados em código (`icones.avatar`): soldado, tanque, helicóptero, canhão, foguete, granada, pinheiro, escudo, caveira e floco de neve. Quem cria conta escolhe o ícone na hora, e dá para trocar depois tocando no cartão da conta. Fica salvo na conta.
- **Cartão da conta**: ícone, nome, troféus e likes. Aparece no topo do multiplayer e no menu principal; sem conta, mostra "ENTRAR / CRIAR CONTA" e o toque abre o multiplayer.
- **Listas (amigos, pedidos e jogadores)**: cada pessoa aparece como um cartãozinho com ícone, bolinha de on/off, troféus, likes, vitórias/derrotas e situação. A sala de batalha mostra o ícone dos dois.

## Conexão automática (conexao.js) e recibo assinado

Tudo automático: o jogador não vê recibo nenhum.
1. **Recibo:** a cada mudança, o servidor manda um recibo assinado (HMAC) da conta: troféus, likes, ícone, vitórias/derrotas, amigos e a senha só como hash. O aparelho guarda no `localStorage`.
   - Quando o jogo abre, ele entra sozinho com o recibo (`retomar`).
   - Se o servidor reiniciou e esqueceu a conta, ela é refeita com os números exatos.
   - Recibo adulterado é recusado.
   - "Sair da conta" apaga o recibo.
2. **Vigia:** manda um `oi` a cada 8 s. Se ficar 25 s sem resposta, ou se a internet cair, o Religador assume.
3. **Religador + diagnóstico:** reconecta sozinho, esperando 1, 2, 4… até 15 s entre tentativas. Antes de cada tentativa descobre o motivo e mostra na tela:
   - sem internet;
   - servidor acordando (testa o `/health`);
   - conexão caiu.
   
   Desiste depois de 2 minutos. Se a conta foi aberta em outro aparelho, não insiste.
- **Batalha:** quem cai no meio tem **60 s** para voltar para a **mesma** partida, que continua rodando. O oponente vê "fulano caiu / voltou". Se não voltar, perde como quem sai.
- **Segredo do recibo:** crie no Render a variável `RECIBO_SEGREDO` com um texto longo qualquer. Sem ela, o servidor usa um segredo tirado do id do serviço do Render.

## Entrar só com o Google + progresso salvo no Google Drive (sem banco de dados)

- **Login:** o único login é **Continuar com o Google** (não existe mais e-mail e senha). Conta nova escolhe só o **nome no jogo** e o **ícone**.
- **Onde fica o progresso:** troféus, likes, ícone, vitórias/derrotas e amigos ficam no **recibo assinado** pelo servidor. O jogo grava esse recibo:
  - no celular (`localStorage`), para entrar sozinho na próxima vez;
  - no **Google Drive da própria pessoa**, numa pasta escondida do app (`appDataFolder`, permissão `drive.appdata`, do tipo "não sensível"). Grava no máximo a cada 5 s.
- **Trocou de celular, limpou o navegador ou o servidor reiniciou:** entrou com o Google, o jogo lê o recibo do Drive, o servidor confere a assinatura e se é da mesma conta Google, e tudo volta.
- **Segurança:** o servidor confere o token com o Google (`tokeninfo`): tem de ser deste app e com e-mail verificado. O recibo fica preso à conta Google (`gs`). O servidor nunca mexe no Drive de ninguém; quem grava é o jogo, no aparelho.
- **Acesso ao Drive:** dura cerca de 1 h. Se venceu e há progresso para salvar, ele é renovado no próximo toque na tela do multiplayer (pode piscar uma janelinha do Google).
- **Para ligar (uma vez, no Google Cloud Console):**
  1. Crie um projeto e ative a **Google Drive API**.
  2. **Tela de consentimento OAuth:** tipo Externo, nome do jogo, seu e-mail. Em escopos, adicione `.../auth/drive.appdata`. Depois clique em **Publicar app**; sem publicar, só os "usuários de teste" entram.
  3. **Credenciais → ID do cliente OAuth → Aplicativo da Web.** Em "Origens JavaScript autorizadas", ponha o endereço do jogo (ex.: `https://seu-jogo.onrender.com`).
  4. No Render, em Environment, crie `GOOGLE_CLIENT_ID` com o ID e `RECIBO_SEGREDO` com um texto longo inventado.
- **Testes locais:** `GOOGLE_TESTE_INSEGURO=1` aceita tokens falsos `teste:email:nome`. **Nunca** ligue essa variável no Render.

- **Tempos de jogo** (online, batalha e PvP) também vão no recibo, já contando a sessão aberta. A cada 1 minuto o servidor manda um recibo novo para quem está on, e o jogo salva no celular e no Drive. Fechar o jogo de repente perde no máximo 1 minuto de tempo contado.
