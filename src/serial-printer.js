/**
 * Impressão direta por USB via Web Serial API — só funciona em browsers
 * baseados em Chromium (Chrome, Edge, Opera); Firefox e Safari não
 * implementam `navigator.serial`.
 *
 * Protocolo: envia uma linha de G-code de cada vez e espera por "ok" antes
 * de enviar a seguinte (o mesmo esquema de controlo de fluxo que qualquer
 * firmware Marlin usa por defeito, sem números de linha nem checksums —
 * seguro para uma ligação USB direta, ao contrário de RS232/rádio).
 */
export function isSerialSupported() {
  return 'serial' in navigator;
}

export class SerialPrinter {
  constructor() {
    this.port = null;
    this.writer = null;
    this.reader = null;
    this._readableClosed = null;
    this._writableClosed = null;
    this.cancelled = false;
  }

  get connected() {
    return this.port != null;
  }

  /** Pede ao utilizador para escolher uma porta série nova. */
  async connect(baudRate) {
    const port = await navigator.serial.requestPort();
    await this._open(port, baudRate);
  }

  /** Tenta religar a uma porta já autorizada anteriormente, sem novo popup. */
  async reconnectIfAuthorized(baudRate) {
    const ports = await navigator.serial.getPorts();
    if (ports.length === 0) return false;
    await this._open(ports[0], baudRate);
    return true;
  }

  async _open(port, baudRate) {
    await port.open({ baudRate });
    this.port = port;

    const encoder = new TextEncoderStream();
    this._writableClosed = encoder.readable.pipeTo(port.writable);
    this.writer = encoder.writable.getWriter();

    // A maioria das placas Arduino/Marlin reinicia o microcontrolador quando
    // a porta série abre (reset via DTR) e demora um pouco a ficar pronta.
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  async disconnect() {
    this.cancelled = true;
    if (this.reader) {
      await this.reader.cancel().catch(() => {});
      this.reader = null;
    }
    if (this.writer) {
      await this.writer.close().catch(() => {});
      this.writer = null;
    }
    await this._writableClosed?.catch(() => {});
    await this._readableClosed?.catch(() => {});
    await this.port?.close().catch(() => {});
    this.port = null;
  }

  /** Para de enviar mais linhas e desliga os aquecedores por segurança. */
  async cancelPrint() {
    this.cancelled = true;
    if (this.writer) {
      await this.writer.write('M104 S0\n').catch(() => {});
      await this.writer.write('M140 S0\n').catch(() => {});
    }
  }

  async printGcode(text, { onProgress } = {}) {
    if (!this.port || !this.writer) throw new Error('Porta série não ligada.');
    this.cancelled = false;

    const lines = text.split('\n').filter((line) => line.trim().length > 0);

    const decoder = new TextDecoderStream();
    this._readableClosed = this.port.readable.pipeTo(decoder.writable);
    this.reader = decoder.readable.getReader();

    let buffer = '';
    const waitForOk = async () => {
      while (true) {
        const idx = buffer.indexOf('\n');
        if (idx >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (/^error/i.test(line)) throw new Error(`Impressora reportou erro: ${line}`);
          if (/^ok/i.test(line)) return;
          continue;
        }
        const { value, done } = await this.reader.read();
        if (done) throw new Error('Ligação série fechada pela impressora.');
        buffer += value;
      }
    };

    try {
      for (let i = 0; i < lines.length; i++) {
        if (this.cancelled) break;
        await this.writer.write(lines[i] + '\n');
        await waitForOk();
        onProgress?.(i + 1, lines.length);
      }
    } finally {
      await this.reader?.cancel().catch(() => {});
      this.reader = null;
    }
  }
}
