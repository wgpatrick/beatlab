// "Musical typing" (à la GarageBand): lets a plain computer keyboard stand in for a MIDI
// keyboard, for anyone without real MIDI hardware. Feeds the exact same handleMidiNoteOn/Off
// pipeline Phase G's real MIDI input uses — live monitoring, continuous-time recording, and
// quantize-strength all work identically, with zero changes to that pipeline.
//
// Layout: two physically-aligned rows, white keys on the bottom, black keys directly above the
// gap between the white keys they belong between (skipping the E-F and B-C gaps, exactly like a
// real piano has no black key there):
//
//   Black:   S  D     G  H  J     L  ;        2  3     5  6  7     9  0
//   White: Z  X  C  V  B  N  M  ,  .  /      Q  W  E  R  T  Y  U  I  O  P
//   Note:  C4 D4 E4 F4 G4 A4 B4 C5 D5 E5     C5 D5 E5 F5 G5 A5 B5 C6 D6 E6
//
// The two rows deliberately overlap by a third (both start at C, one octave apart) rather than
// continuing seamlessly — easier to keep straight while playing than one long 20-note run.
const KEY_TO_PITCH: Record<string, number> = {
  KeyZ: 60, KeyS: 61, KeyX: 62, KeyD: 63, KeyC: 64, KeyV: 65, KeyG: 66, KeyB: 67, KeyH: 68, KeyN: 69, KeyJ: 70, KeyM: 71,
  Comma: 72, KeyL: 73, Period: 74, Semicolon: 75, Slash: 76,
  KeyQ: 72, Digit2: 73, KeyW: 74, Digit3: 75, KeyE: 76, KeyR: 77, Digit5: 78, KeyT: 79, Digit6: 80, KeyY: 81, Digit7: 82, KeyU: 83,
  KeyI: 84, Digit9: 85, KeyO: 86, Digit0: 87, KeyP: 88,
}

export { KEY_TO_PITCH }

type NoteHandlers = { onNoteOn(pitch: number, velocity: number): void; onNoteOff(pitch: number): void }

let handlers: NoteHandlers | null = null
let enabled = false
const heldCodes = new Set<string>()

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')
}

function onKeyDown(e: KeyboardEvent) {
  if (e.repeat || isTypingTarget(e.target)) return
  const pitch = KEY_TO_PITCH[e.code]
  if (pitch === undefined || heldCodes.has(e.code)) return
  heldCodes.add(e.code)
  e.preventDefault()
  handlers?.onNoteOn(pitch, 0.8)
}

function onKeyUp(e: KeyboardEvent) {
  const pitch = KEY_TO_PITCH[e.code]
  if (pitch === undefined || !heldCodes.has(e.code)) return
  heldCodes.delete(e.code)
  e.preventDefault()
  handlers?.onNoteOff(pitch)
}

export function setComputerKeyboardHandlers(h: NoteHandlers) {
  handlers = h
}

export function setComputerKeyboardEnabled(on: boolean) {
  if (on === enabled) return
  enabled = on
  if (on) {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  } else {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    for (const code of heldCodes) handlers?.onNoteOff(KEY_TO_PITCH[code])
    heldCodes.clear()
  }
}

if (import.meta.env.DEV) {
  ;(window as unknown as { __computerKeyboard: { setComputerKeyboardEnabled: typeof setComputerKeyboardEnabled; setComputerKeyboardHandlers: typeof setComputerKeyboardHandlers; KEY_TO_PITCH: typeof KEY_TO_PITCH } }).__computerKeyboard =
    { setComputerKeyboardEnabled, setComputerKeyboardHandlers, KEY_TO_PITCH }
}
