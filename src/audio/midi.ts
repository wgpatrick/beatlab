// Web MIDI API integration. Deliberately split from midiRecorder.ts/engine.ts: this file only
// knows about raw MIDI bytes in and note-on/off callbacks out — it has no idea a Track or a
// Transport exists. That split is what makes `simulateMessage` below a real test seam rather than
// a hack: it feeds the exact same byte-parsing path a real keyboard's `onmidimessage` would use,
// so recording/quantize behavior can be exercised end-to-end without any physical hardware.

export interface MidiDeviceInfo {
  id: string
  name: string
}

export interface MidiHandlers {
  onNoteOn(pitch: number, velocity: number): void
  onNoteOff(pitch: number): void
}

class MidiInput {
  // Safari (macOS + iOS) doesn't implement the Web MIDI API at all (Apple has declined it over
  // fingerprinting concerns) — feature-detect so the UI can say so plainly instead of the Connect
  // button silently failing.
  readonly supported = typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'

  private access: MIDIAccess | null = null
  private handlers: MidiHandlers | null = null
  private connectedInputs: MIDIInput[] = []
  private onDevicesChanged: ((devices: MidiDeviceInfo[]) => void) | null = null

  setHandlers(handlers: MidiHandlers) {
    this.handlers = handlers
  }

  /** Called with the current device list every time it changes — including *after* connect()
   * has already resolved. Web MIDI's own onstatechange event (below) fires when a keyboard is
   * plugged in after the initial permission grant, e.g. someone clicks Connect MIDI first and
   * plugs the keyboard in a moment later; without this, the UI would be stuck showing "no
   * devices found" forever even once one shows up. */
  setOnDevicesChanged(cb: (devices: MidiDeviceInfo[]) => void) {
    this.onDevicesChanged = cb
  }

  async connect(): Promise<MidiDeviceInfo[]> {
    if (!this.supported) throw new Error('Web MIDI API not supported in this browser')
    this.access = await navigator.requestMIDIAccess()
    this.attachToInputs()
    this.access.onstatechange = () => this.attachToInputs()
    return this.listDevices()
  }

  listDevices(): MidiDeviceInfo[] {
    return this.connectedInputs.map((input) => ({ id: input.id, name: input.name ?? 'MIDI device' }))
  }

  private attachToInputs() {
    if (!this.access) return
    this.connectedInputs = [...this.access.inputs.values()]
    for (const input of this.connectedInputs) {
      input.onmidimessage = (e: MIDIMessageEvent) => this.handleMessage(e.data)
    }
    this.onDevicesChanged?.(this.listDevices())
  }

  /** Test/dev hook: pushes a raw MIDI message (e.g. `[0x90, 60, 100]` = note-on, middle C,
   * velocity 100) through the same handler a real device's `onmidimessage` uses. This is how
   * Phase G is verified without a physical keyboard — see docs/ROADMAP.md Phase G. */
  simulateMessage(data: number[] | Uint8Array) {
    this.handleMessage(data instanceof Uint8Array ? data : new Uint8Array(data))
  }

  private handleMessage(data: Uint8Array | null) {
    if (!data || data.length < 2 || !this.handlers) return
    const status = data[0] & 0xf0
    const pitch = data[1]
    const velocity = (data[2] ?? 0) / 127
    if (status === 0x90 && velocity > 0) {
      this.handlers.onNoteOn(pitch, velocity)
    } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      this.handlers.onNoteOff(pitch)
    }
  }
}

export const midiInput = new MidiInput()

if (import.meta.env.DEV) {
  ;(window as unknown as { __midiInput: typeof midiInput }).__midiInput = midiInput
}
