class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(2000);
    this._offset = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._buf[this._offset++] = channel[i];
      if (this._offset >= 2000) {
        const int16 = new Int16Array(2000);
        for (let j = 0; j < 2000; j++) {
          const s = Math.max(-1, Math.min(1, this._buf[j]));
          int16[j] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
        }
        this.port.postMessage(int16.buffer, [int16.buffer]);
        this._offset = 0;

      }
    }
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
