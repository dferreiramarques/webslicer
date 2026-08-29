# LK4 Pro Slicer

Slicer 100% no browser para a **Longer LK4 Pro**, construído sobre o
[CuraEngine](https://github.com/Ultimaker/CuraEngine) real, compilado para
WebAssembly via [`cura-wasm`](https://github.com/Cloud-CNC/cura-wasm) (o
mesmo motor da Cura desktop). Nada é enviado para nenhum servidor — o
fatiamento corre inteiramente no teu computador/telemóvel.

## Porquê

- Sem instalação — abre um separador e fatia.
- Definição de impressora feita à medida da LK4 Pro (220×220×250mm, bico
  0.4mm, cama até 100°C, bico até 250°C, sem ABL).
- Preview 3D do modelo sobre a mesa (three.js).
- Envio direto do G-code para o teu **Mainsail/Moonraker** (a IP `192.168.1.222`
  do Pi que já tens configurado) — sem passar por pen/SD.
- Opção de trocar o G-code inicial/final para as macros `PRINT_START` /
  `PRINT_END` do Klipper, se as tiveres no `printer.cfg`.

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

## Ajustar a definição da impressora

`src/lk4pro.definition.js` tem todos os valores específicos da LK4 Pro
(dimensões, G-code inicial/final, limites de temperatura). Está construída
por cima do perfil `creality_base` já incluído na `cura-wasm-definitions`
(mesma família Bowden + cama de vidro), com overrides para os valores reais
da LK4 Pro. Se mudares alguma peça do hardware (ex: hotend all-metal,
extrusora direct drive), é aqui que ajustas.

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
