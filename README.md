# WebSlicer

Slicer 100% no browser, construído sobre o
[CuraEngine](https://github.com/Ultimaker/CuraEngine) real, compilado para
WebAssembly via [`cura-wasm`](https://github.com/Cloud-CNC/cura-wasm) (o
mesmo motor da Cura desktop). Nada é enviado para nenhum servidor — o
fatiamento corre inteiramente no teu computador/telemóvel.

## Porquê

- Sem instalação — abre um separador e fatia.
- Aceita ficheiros **.stl** e **.3mf**.
- Três perfis de impressora prontos a usar: **LK4 Pro**, **Prusa i3
  MK3S** e **Creality CR-X** (bico único) — todas Marlin/Klipper. Muda de
  impressora no painel lateral; a mesa e os limites de temperatura ajustam-se
  automaticamente.
- **+ Adicionar impressora…** no fundo desse dropdown abre um assistente
  simples (nome, firmware Marlin/Klipper, dimensões da mesa, bico,
  temperaturas máximas) para guardares outra impressora neste browser — usa
  G-code inicial/final genérico e seguro. Uma secção **Definições avançadas**
  (fechada por omissão — 99% dos casos não precisa dela) tem velocidade de
  impressão, aceleração, jerk, retração e altura da gantry.
  **Duplicar impressora** clona a que tens selecionada (embutida ou
  personalizada) para o assistente, já preenchido, para ajustares e
  guardares como nova. Numa impressora personalizada aparecem também
  **Editar impressora** (guarda por cima da mesma, mesmo id) e **Remover
  esta impressora personalizada**.
- Perfis personalizados: ajusta as definições e carrega em **Guardar perfil**
  para as reteres por impressora entre sessões (guardado no browser). **Repor
  predefinições** volta aos valores de fábrica dessa impressora.
- Preview 3D do modelo sobre a mesa (three.js).
- Ligação direta à impressora, conforme o firmware: a LK4 Pro (Klipper) liga
  por **IP** ao Mainsail/Moonraker; a Prusa i3 MK3S e a Creality CR-X
  (Marlin) ligam diretamente por **USB** (Web Serial), sem precisar de
  Octoprint/Mainsail nem de passar por pen/SD.
- Na LK4 Pro, opção de trocar o G-code inicial/final para as macros
  `PRINT_START` / `PRINT_END` do Klipper, se as tiveres no `printer.cfg`.
- O fluxo é sempre nesta ordem: **1. Impressora → 2. Ligação → 3. Ficheiro →
  4. Definições → 5. Imprimir**. Carregar um ficheiro fica bloqueado até
  confirmares a impressora e a ligação, e trocar de impressora com um modelo
  já carregado pede confirmação antes de o limpar — para nunca perderes
  trabalho sem aviso.

## Correr localmente

```bash
npm install
npm run dev
```

Abre o URL que o Vite indica (normalmente `http://localhost:5173`).

## Build de produção

```bash
npm run build
npm run preview   # opcional, para testar o build
```

Os ficheiros finais ficam em `dist/` — é um site 100% estático, pode ir para
qualquer hosting.

## Publicar (ex: GitHub Pages, no mesmo estilo dos outros projetos)

```bash
npm run build
# copia o conteúdo de dist/ para o branch gh-pages, ou usa uma action tipo:
# peaceiris/actions-gh-pages apontando para o diretório dist
```

Se publicares num subdomínio tipo `lk4pro.monco.io`, não precisas de mudar
nada — o `vite.config.js` já usa caminhos relativos (`base: './'`).

## Enviar para o Mainsail

No painel lateral, depois de fatiar, mete o IP ou hostname do Pi (por
omissão fica guardado no browser, ex: `192.168.1.222` ou `lk4pro.local`) e
carrega em **Enviar para Mainsail**. Isto faz um upload direto via API do
Moonraker (`POST /server/files/upload`).

Se o browser bloquear o pedido por CORS (a app pode estar hospedada num
domínio diferente do Moonraker), adiciona a origem ao `moonraker.conf`:

```ini
[authorization]
cors_domains:
    https://lk4pro.monco.io
    http://localhost:5173
```

## Imprimir por USB (Prusa i3 MK3S, Creality CR-X)

Usa a [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
— só funciona em browsers baseados em Chromium (Chrome, Edge, Opera);
Firefox e Safari não a implementam. No painel **2. Ligação**, escolhe o baud
rate (115200 por omissão) e carrega em **Ligar por USB** para autorizares a
porta série. Depois de fatiar, **Imprimir por USB** envia o G-code linha a
linha, à espera do `ok` do firmware antes de enviar a seguinte (o mesmo
esquema de controlo de fluxo que qualquer sender de G-code usa por padrão).

**Limitações a saber:**
- Só funciona com firmware Marlin genuíno — o Klipper não aceita G-code
  diretamente pela porta série USB da forma que o Marlin aceita (fala um
  protocolo binário próprio com o Klippy/Moonraker), por isso a LK4 Pro só
  liga por IP.
- Só gere uma impressora USB ligada de cada vez (por agora). Enquanto
  estiveres ligado a uma, o seletor de impressora (passo 1) fica bloqueado
  para não trocares de perfil a meio de uma impressão em curso — isso
  cortaria a ligação série sem aviso. Carrega em **Desligar** para libertar
  a impressora e poderes escolher outra.
- **Cancelar impressão** para de enviar novas linhas e desliga os
  aquecedores por segurança, mas os comandos já enviados para o buffer do
  firmware continuam a executar — não é um "parar já".
- Esta funcionalidade não foi testada numa impressora física real durante o
  desenvolvimento (sem hardware disponível); a lógica segue o protocolo
  padrão send-and-wait-for-ok do Marlin, mas testa com cuidado (com o painel
  da impressora à vista) antes de confiares numa impressão sem supervisão.

## Ajustar as definições de impressora / adicionar uma nova

`src/printers.js` tem o registo `PRINTERS` com os três perfis (LK4 Pro, Prusa
i3 MK3S, Creality CR-X): dimensões, G-code inicial/final, limites de
temperatura, valores por omissão, `firmware` (`'klipper'` ou `'marlin'`) e
`connection` (`'ip'` ou `'usb'` — determina qual delas a UI liga). Cada uma
está construída por cima de um perfil já incluído na `cura-wasm-definitions`,
com overrides para os valores reais do hardware. Para adicionar outra
impressora, segue o padrão de uma das existentes e acrescenta uma entrada a
`PRINTERS`.

**Nota importante para quem editar G-code inicial/final aqui:** o CuraEngine
compilado para WASM nunca resolve placeholders `{setting}` dentro do G-code
(essa substituição só existe na app Python do Cura desktop) — usa valores
fixos ou os comandos M104/M109/M140/M190 que o próprio motor insere
automaticamente antes do G-code inicial.

## Stack

- [Vite](https://vitejs.dev)
- [cura-wasm](https://github.com/Cloud-CNC/cura-wasm) + [cura-wasm-definitions](https://github.com/Cloud-CNC/cura-wasm-definitions)
- [three.js](https://threejs.org) para o preview STL

## Nota sobre manutenção

O `cura-wasm` está marcado como deprecated pelo autor (projeto "Cloud CNC"
descontinuado), mas o binário WASM embutido continua funcional — é código
compilado, não depende de serviços externos. Se um dia precisares de
atualizar a versão do CuraEngine, a alternativa seria recompilar o
[CuraEngine](https://github.com/Ultimaker/CuraEngine) atual para WASM.
