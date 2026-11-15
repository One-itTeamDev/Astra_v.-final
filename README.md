# ASTRA · Protótipo de monitorização de saúde da tripulação

NASA Space Apps Challenge 2026 · *Create Health Monitoring Software for Astronauts on Space Missions*
Equipa OneHealth Space · Maputo

O ASTRA tem duas partes:

- **O tablet do tripulante.** É uma página Web dentro de uma moldura de tablet. O tripulante faz o check-up com sensores animados, mede-se com os aparelhos de bordo, faz triagem com IA local, recebe alertas críticos e troca mensagens com a Terra.
- **A consola de missão.** Tem ecrã de login e cinco secções: Visão geral, Comunicações, Radiação e ambiente, Câmaras, Ligação e registo. A cirurgiã de voo vê a saúde da tripulação com o atraso real da ligação, as câmaras da nave, o clima espacial ao vivo e a fila nave↔Terra. Também valida orientações e conversa com a tripulação.

## Arrancar

```bash
cp .env.example .env            # opcional: ponha a sua NASA_API_KEY (grátis em api.nasa.gov)
docker compose up --build
```

| Endereço | O que é |
|---|---|
| http://localhost:8000 | Página inicial |
| http://localhost:8000/tablet/ | Tablet do tripulante: escolha um tripulante e escreva o seu PIN (tabela abaixo) |
| http://localhost:8000/consola/ | Consola: utilizador **cirurgia**, palavra-passe **astra2026** (as credenciais não aparecem no ecrã de entrada) |
| http://localhost:8000/docs | Documentação da API (OpenAPI) |

Para a demonstração, abra o tablet e a consola em duas janelas lado a lado.

A IA de bordo é opcional e corre com Ollama:

```bash
docker compose --profile ia up -d
docker compose exec ollama ollama pull llama3.2:3b
# no .env: OLLAMA_URL=http://ollama:11434  → docker compose up -d api
```

Sem Ollama, a triagem funciona só com as regras. As regras de segurança correm sempre, com ou sem IA.

## Tripulação simulada

Nomes moçambicanos fictícios; os dados de saúde são simulados.

| Código | Tripulante | Função | PIN |
|---|---|---|---|
| CDR | Celina Macuácua | Comandante | 4821 |
| FE | Tomás Sitoe | Engenheiro de voo | 3057 |
| MS | Amélia Cossa | Especialista de missão | 7314 |
| GEO | Rafael Nhantumbo | Geólogo planetário | 6290 |

Cada tripulante tem o seu PIN. Na base de dados (tabela `person`) só fica o hash PBKDF2, nunca o PIN em claro, e o PIN de um tripulante não abre a sessão de outro. Os PINs não aparecem no ecrã; estão só aqui. Se já tinha uma base de dados de uma versão anterior, os códigos e os PINs são actualizados ao arrancar.

## Os cinco perigos da NASA (organização do ASTRA)

O Human Research Program da NASA agrupa os riscos do voo espacial em cinco perigos (fonte: https://www.nasa.gov/hrp/hazards). No ASTRA, cada indicador pertence a um deles. O separador **5 Perigos** do tablet e a matriz da consola mostram o estado de cada tripulante:

| Perigo | O que o ASTRA acompanha | Fica em Atenção quando |
|---|---|---|
| **R** Radiação espacial | Eventos SEP (NASA DONKI), protões ≥10 MeV (NOAA GOES), dose estimada e acumulada | fluxo ≥10 pfu (tempestade S1 ou superior) |
| **I** Isolamento e confinamento | Humor, stress e sono (check-up diário) | humor em baixo, stress alto ou sono abaixo da faixa habitual |
| **D** Distância da Terra | Estado da ligação, atraso, fila, decisões tomadas a bordo à espera da Terra | ligação cortada ou fila longa |
| **G** Gravidade alterada | Minutos de exercício (ARED/T2/CEVIS), força de preensão (dinamómetro), tremor e tempo de reacção | menos de 60 min de exercício em 24 h, força 10 % abaixo da linha de base ou reacção mais lenta |
| **E** Ambientes fechados e hostis | O₂, CO₂, pressão, temperatura e humidade da cabine; sintomas da triagem | CO₂ acima de 3 mmHg, valores fora da faixa ou sintomas recentes |

O estado geral de cada tripulante (Verde/Atenção) é o pior dos cinco perigos, com as razões indicadas por letra (ex.: "G · pouco exercício"). Tensão arterial, glicemia e temperatura continuam a ser medidas e usadas pela triagem e pela cirurgiã de voo, mas não pertencem a nenhum perigo. Os textos, os factos com fonte e as contramedidas estão em `api/data/hazards.json`. O vermelho continua reservado ao alerta crítico, que só as regras de segurança disparam. Ficaram de fora os riscos do HRP que o tablet não consegue acompanhar a bordo, como o cancro a longo prazo ou a síndrome neuro-ocular. Também não se incluiu a nutrição como perigo próprio.

## O que é real e o que é simulado

| Real (fontes públicas) | Simulado (demonstração) |
|---|---|
| **NASA DONKI**: eventos de partículas solares (SEP), erupções (FLR) e tempestades geomagnéticas (GST) | Saúde dos 4 tripulantes (incluindo exercício, força e stress), 14 dias de histórico com gamas fisiológicas reais |
| **NOAA SWPC / GOES**: fluxo de protões ≥10 MeV, últimas 24 h | Sinais de sensores (PPG, oxímetro, braçadeira). O tremor usa o acelerómetro real se o aparelho o tiver |
| **NASA Image and Video Library**: fotografias reais do Destiny e do módulo Orion para as câmaras | Ambiente da cabine (CO₂, O₂, pressão), em gamas típicas da ISS |
| **DSCOVR/EPIC**: imagem mais recente da Terra (câmara exterior) | Dose SEP (modelo ilustrativo, ver `api/data/references.json`) |
| Valores de referência com fonte (MSL/RAD 1,84 mSv/dia, NASA-STD-3001, escala S da NOAA…) | |

Os dados reais são descarregados ao arrancar e de 30 em 30 minutos, e ficam guardados em PostgreSQL e numa cache em disco. Sem internet, o sistema usa a última cópia. As câmaras mostram “Imagem indisponível no momento” até haver uma fotografia descarregada. O repositório traz eventos SEP reais do DONKI (2023–2026) em `api/data/fallback/donki.json` para funcionar logo à primeira. Também pode trocar as fotografias das câmaras em `api/data/cameras.json`, indicando outro `nasa_id`.

## Como funciona o atraso Terra–nave

Tudo o que atravessa a ligação é um **pacote** na tabela `packet`. Isto inclui medições, queixas, alertas, mensagens, confirmações e decisões.

- Com a ligação aberta, o pacote sai por prioridade. O alerta crítico passa sempre à frente.
- O pacote chega `atraso` segundos depois. O outro lado só vê a linha quando `earth_visible_at` ou `ship_visible_at` já passou.
- Com a ligação cortada, o pacote fica retido e sai quando a ligação reabrir. A nave continua a funcionar sozinha.
- A telemetria e as câmaras que a consola mostra são as de há `atraso` segundos.

Atraso para Marte: 14 min 06 s. No **modo demonstração** é ÷60, ou seja, 14,1 s. Liga-se e desliga-se na consola.

## Estrutura

```
astra/
├─ docker-compose.yml        PostgreSQL + API (+ Ollama opcional)
├─ .env.example
├─ api/                      Python 3.12 · FastAPI · SQLAlchemy 2 · PostgreSQL
│  ├─ Dockerfile
│  ├─ requirements.txt
│  ├─ app/
│  │  ├─ main.py             arranque, ciclo em segundo plano, páginas estáticas
│  │  ├─ config.py           variáveis de ambiente, distâncias, margens
│  │  ├─ db.py · models.py   tabelas (registo que não se apaga, fila, mensagens…)
│  │  ├─ security.py         PIN/palavra-passe (PBKDF2), sessões, registo de acessos
│  │  ├─ seed.py             tripulação, cirurgiã de voo, 14 dias de histórico
│  │  ├─ routers/            auth · tablet · console · data (clima espacial, câmaras)
│  │  └─ services/           link (atraso e fila) · hazards (5 perigos) · physiology · triage · radiation · nasa · ops
│  ├─ data/                  5 perigos (NASA HRP), regras de segurança, câmaras, referências, cache DONKI
│  └─ tests/                 regras de triagem + ponta a ponta em PostgreSQL
└─ web/                      HTML/CSS/JS sem build
   ├─ index.html
   ├─ assets/                estilos e utilitários partilhados (gráficos, API)
   ├─ tablet/                moldura do tablet, ecrãs, sensores animados
   └─ consola/               login + consola de missão
```

## Guião de demonstração (5 min)

1. Na **consola**, entre como `cirurgia`. Mostre o login falhado no registo de eventos.
2. No **tablet**, entre como FE, o engenheiro de voo (PIN 3057). Faça o check-up: mantenha premido o botão do coração (15 s), depois o tremor, a reacção (8 toques), o sono, o humor e o stress. Os valores aparecem na consola cerca de 14 s depois.
3. No separador **Aparelhos**, meça a tensão, a força de preensão e registe uma sessão de exercício. Abra **5 Perigos** para ver como cada valor alimenta um perigo da NASA.
4. Em **Triagem**, escreva *"dor de cabeça forte e vejo desfocado"* e confirme o resumo. Na consola, em **Visão geral**, a orientação aparece em **Orientações por validar**. Valide-a e a resposta chega ao tablet.
5. Em **Mensagens**, escreva para a Terra. Na consola, abra a secção **Comunicações** e responda.
6. Na consola, em **Ligação e registo**, carregue em **Reproduzir um evento SEP real**. Em **Radiação e ambiente**, o fluxo sobe acima de S1 e a dose aumenta. Envie o modelo **Abrigo de tempestade** em **Comunicações**: o tablet recebe uma instrução urgente e, quando o tripulante confirma, o local passa a "Abrigo".
7. No tablet, escreva *"dor no peito"*. O alerta crítico ocupa o ecrã e toca para toda a tripulação. Na consola aparece a faixa vermelha.
8. Na consola, em **Ligação e registo**, use **Falha do removedor de CO₂ (CDRA)**. Em **Radiação e ambiente**, o CO₂ da cabine sobe acima de 3 mmHg e o perigo **E** passa a Atenção para todos.
9. Na consola, em **Ligação e registo**, use **Cortar ligação**. As câmaras ficam sem sinal e a telemetria congela. O tablet continua a funcionar e a fila acumula. Reabra a ligação e tudo é entregue sem duplicados.

## Testes

```bash
cd api
pytest tests/test_triage.py                                   # regras, sem base de dados
TEST_DATABASE_URL=postgresql+psycopg://astra:astra@localhost:5432/astra_test pytest
```

## Limites do protótipo

- As regras de segurança ainda não têm revisão clínica (`api/data/safety_rules.json`).
- O sistema nunca diagnostica nem receita: a IA orienta e a decisão final é da cirurgiã de voo.
- A dose SEP é um modelo de ordem de grandeza, não um cálculo dosimétrico.
