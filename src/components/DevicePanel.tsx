import { DRUM_LABELS, DRUM_LANES, type FilterType, type InsertKind, type Lfo2Dest, type LfoDest, type OscType, type SynthParams, type Track } from '../types'
import { engine } from '../audio/engine'
import { useStore } from '../state/store'
import { Knob } from './Knob'
import type { ParamStatus } from '../lessons/framework'

const WAVES: { type: OscType; label: string; path: string }[] = [
  { type: 'sine', label: 'Sine', path: 'M1 8 Q 4.5 0, 8 8 T 15 8' },
  { type: 'triangle', label: 'Tri', path: 'M1 12 L5 4 L9 12 L13 4 L15 8' },
  { type: 'sawtooth', label: 'Saw', path: 'M1 12 L8 4 L8 12 L15 4 L15 12' },
  { type: 'square', label: 'Sqr', path: 'M1 12 L1 4 L8 4 L8 12 L15 12 L15 4' },
]

const FILTER_TYPES: { type: FilterType; label: string }[] = [
  { type: 'lowpass', label: 'LP' },
  { type: 'bandpass', label: 'BP' },
  { type: 'highpass', label: 'HP' },
]

const LFO_DESTS: { dest: LfoDest; label: string }[] = [
  { dest: 'off', label: 'Off' },
  { dest: 'pitch', label: 'Pitch' },
  { dest: 'cutoff', label: 'Cutoff' },
  { dest: 'amp', label: 'Amp' },
]

const LFO2_DESTS: { dest: Lfo2Dest; label: string }[] = [
  { dest: 'off', label: 'Off' },
  { dest: 'pan', label: 'Pan' },
  { dest: 'sendReverb', label: 'Reverb' },
  { dest: 'sendDelay', label: 'Delay' },
  { dest: 'sendMod', label: 'Mod FX' },
  { dest: 'eqLow', label: 'EQ Low' },
  { dest: 'eqMid', label: 'EQ Mid' },
  { dest: 'eqHigh', label: 'EQ High' },
  { dest: 'distortionMix', label: 'Dist Mix' },
]

const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)
const ms = (v: number) => (v >= 1 ? `${v.toFixed(1)}s` : `${Math.round(v * 1000)}ms`)
const pct = (v: number) => `${Math.round(v * 100)}%`
const cents = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v)}c`
const db = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}dB`
const ratio = (v: number) => `${v.toFixed(1)}:1`
const bits = (v: number) => `${Math.round(v)}bit`

const INSERT_LABELS: Record<InsertKind, string> = { eq: 'EQ', comp: 'COMP', dist: 'DIST' }

export function DevicePanel({ track }: { track: Track }) {
  const setSynth = useStore((s) => s.setSynth)
  const setMacroValue = useStore((s) => s.setMacroValue)
  const lesson = useStore((s) => s.lesson())
  const paramScores = useStore((s) => s.paramScores)
  const allTracks = useStore((s) => s.tracks)

  const visibleParams = lesson?.visibleParams
  const visible = (key: keyof SynthParams) => !visibleParams || visibleParams.includes(key)
  const statusOf = (key: keyof SynthParams): ParamStatus | undefined => paramScores?.[key]

  if (track.kind === 'drums') {
    return (
      <div className="device">
        <div className="device-section">
          <div className="device-section-title">DRUM RACK</div>
          <div className="drum-pads">
            {DRUM_LANES.map((lane) => (
              <button key={lane} className="pad" onClick={() => void engine.previewDrum(lane)}>
                {DRUM_LABELS[lane]}
              </button>
            ))}
          </div>
        </div>
        <div className="device-note">
          909-style synthesized kit — kick from a pitched membrane, snare/clap from filtered noise,
          hats from inharmonic FM. Click a pad to audition.
        </div>
      </div>
    )
  }

  const p = track.synth
  const set = (patch: Partial<typeof p>) => setSynth(track.id, patch)

  const showFilter = visible('cutoff') || visible('resonance') || visible('filterType')
  const showEnv = visible('attack') || visible('decay') || visible('sustain') || visible('release')
  const showOscBank = visible('osc2Type') || visible('osc2Level') || visible('osc2Detune') || visible('subLevel') || visible('noiseLevel')
  const showFilterEnv =
    visible('filterEnvAmount') || visible('filterEnvAttack') || visible('filterEnvDecay') || visible('filterEnvSustain') || visible('filterEnvRelease')
  const showLfo = visible('lfoRate') || visible('lfoDepth') || visible('lfoDest')
  const showEq = visible('eqLow') || visible('eqMid') || visible('eqHigh')
  const showComp = visible('compThreshold') || visible('compRatio') || visible('compAttack') || visible('compRelease') || visible('compMix')
  const showDist = visible('distortionAmount') || visible('distortionMix') || visible('bitcrushBits') || visible('bitcrushMix')
  const showChainOrder = (showEq || showComp || showDist) && visible('insertOrder')
  const showModSend = visible('sendMod')
  const showSidechain = visible('duckSource') || visible('duckAmount')
  const duckSourceOptions = allTracks.filter((t) => t.kind === 'drums' && t.id !== track.id)
  const showLfo2 = visible('lfo2Rate') || visible('lfo2Depth') || visible('lfo2Dest')
  const showMacro = visible('macroValue')

  const swapInsertOrder = (i: number) => {
    const next = [...p.insertOrder]
    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
    set({ insertOrder: next })
  }

  return (
    <div className="device">
      {visible('osc') && (
        <div className="device-section">
          <div className="device-section-title">OSC</div>
          <div className="wave-btns">
            {WAVES.map((w) => (
              <button
                key={w.type}
                className={`wave ${p.osc === w.type ? 'on' : ''} ${p.osc === w.type && statusOf('osc') ? `status-${statusOf('osc')}` : ''}`}
                onClick={() => set({ osc: w.type })}
                title={w.type}
              >
                <svg width="16" height="16" viewBox="0 0 16 16">
                  <path d={w.path} stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
                {w.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {showOscBank && (
        <div className="device-section">
          <div className="device-section-title">OSC 2 / SUB / NOISE</div>
          {visible('osc2Type') && (
            <div className="wave-btns" style={{ marginBottom: 8 }}>
              {WAVES.map((w) => (
                <button
                  key={w.type}
                  className={`wave ${p.osc2Type === w.type ? 'on' : ''} ${p.osc2Type === w.type && statusOf('osc2Type') ? `status-${statusOf('osc2Type')}` : ''}`}
                  onClick={() => set({ osc2Type: w.type })}
                  title={w.type}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16">
                    <path d={w.path} stroke="currentColor" strokeWidth="1.5" fill="none" />
                  </svg>
                  {w.label}
                </button>
              ))}
            </div>
          )}
          <div className="knob-row">
            {visible('osc2Level') && (
              <Knob label="Osc2" value={p.osc2Level} min={0} max={1} format={pct} status={statusOf('osc2Level')} onChange={(v) => set({ osc2Level: v })} />
            )}
            {visible('osc2Detune') && (
              <Knob label="Detune" value={p.osc2Detune} min={-50} max={50} format={cents} status={statusOf('osc2Detune')} onChange={(v) => set({ osc2Detune: v })} />
            )}
            {visible('subLevel') && (
              <Knob label="Sub" value={p.subLevel} min={0} max={1} format={pct} status={statusOf('subLevel')} onChange={(v) => set({ subLevel: v })} />
            )}
            {visible('noiseLevel') && (
              <Knob label="Noise" value={p.noiseLevel} min={0} max={1} format={pct} status={statusOf('noiseLevel')} onChange={(v) => set({ noiseLevel: v })} />
            )}
          </div>
        </div>
      )}
      {showFilter && (
        <div className="device-section">
          <div className="device-section-title">FILTER</div>
          {visible('filterType') && (
            <div className="wave-btns" style={{ marginBottom: 8, gridTemplateColumns: '1fr 1fr 1fr' }}>
              {FILTER_TYPES.map((f) => (
                <button
                  key={f.type}
                  className={`wave ${p.filterType === f.type ? 'on' : ''} ${p.filterType === f.type && statusOf('filterType') ? `status-${statusOf('filterType')}` : ''}`}
                  onClick={() => set({ filterType: f.type })}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <div className="knob-row">
            {visible('cutoff') && (
              <Knob label="Cutoff" value={p.cutoff} min={40} max={16000} log format={hz} status={statusOf('cutoff')} onChange={(v) => set({ cutoff: v })} />
            )}
            {visible('resonance') && (
              <Knob label="Res" value={p.resonance} min={0.1} max={20} format={(v) => v.toFixed(1)} status={statusOf('resonance')} onChange={(v) => set({ resonance: v })} />
            )}
          </div>
        </div>
      )}
      {showFilterEnv && (
        <div className="device-section">
          <div className="device-section-title">FILTER ENV</div>
          <div className="knob-row">
            {visible('filterEnvAmount') && (
              <Knob label="Amount" value={p.filterEnvAmount} min={0} max={1} format={pct} status={statusOf('filterEnvAmount')} onChange={(v) => set({ filterEnvAmount: v })} />
            )}
            {visible('filterEnvAttack') && (
              <Knob label="Attack" value={p.filterEnvAttack} min={0.001} max={2} log format={ms} status={statusOf('filterEnvAttack')} onChange={(v) => set({ filterEnvAttack: v })} />
            )}
            {visible('filterEnvDecay') && (
              <Knob label="Decay" value={p.filterEnvDecay} min={0.01} max={2} log format={ms} status={statusOf('filterEnvDecay')} onChange={(v) => set({ filterEnvDecay: v })} />
            )}
            {visible('filterEnvSustain') && (
              <Knob label="Sustain" value={p.filterEnvSustain} min={0} max={1} format={(v) => v.toFixed(2)} status={statusOf('filterEnvSustain')} onChange={(v) => set({ filterEnvSustain: v })} />
            )}
            {visible('filterEnvRelease') && (
              <Knob label="Release" value={p.filterEnvRelease} min={0.01} max={4} log format={ms} status={statusOf('filterEnvRelease')} onChange={(v) => set({ filterEnvRelease: v })} />
            )}
          </div>
        </div>
      )}
      {showEnv && (
        <div className="device-section">
          <div className="device-section-title">ENVELOPE</div>
          <div className="knob-row">
            {visible('attack') && (
              <Knob label="Attack" value={p.attack} min={0.001} max={2} log format={ms} status={statusOf('attack')} onChange={(v) => set({ attack: v })} />
            )}
            {visible('decay') && (
              <Knob label="Decay" value={p.decay} min={0.01} max={2} log format={ms} status={statusOf('decay')} onChange={(v) => set({ decay: v })} />
            )}
            {visible('sustain') && (
              <Knob label="Sustain" value={p.sustain} min={0} max={1} format={(v) => v.toFixed(2)} status={statusOf('sustain')} onChange={(v) => set({ sustain: v })} />
            )}
            {visible('release') && (
              <Knob label="Release" value={p.release} min={0.01} max={4} log format={ms} status={statusOf('release')} onChange={(v) => set({ release: v })} />
            )}
          </div>
        </div>
      )}
      {showLfo && (
        <div className="device-section">
          <div className="device-section-title">LFO</div>
          {visible('lfoDest') && (
            <div className="wave-btns" style={{ marginBottom: 8, gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              {LFO_DESTS.map((d) => (
                <button
                  key={d.dest}
                  className={`wave ${p.lfoDest === d.dest ? 'on' : ''} ${p.lfoDest === d.dest && statusOf('lfoDest') ? `status-${statusOf('lfoDest')}` : ''}`}
                  onClick={() => set({ lfoDest: d.dest })}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
          <div className="knob-row">
            {visible('lfoRate') && (
              <Knob label="Rate" value={p.lfoRate} min={0.05} max={20} log format={(v) => `${v.toFixed(v < 1 ? 2 : 1)}Hz`} status={statusOf('lfoRate')} onChange={(v) => set({ lfoRate: v })} />
            )}
            {visible('lfoDepth') && (
              <Knob label="Depth" value={p.lfoDepth} min={0} max={1} format={pct} status={statusOf('lfoDepth')} onChange={(v) => set({ lfoDepth: v })} />
            )}
          </div>
        </div>
      )}
      {showLfo2 && (
        <div className="device-section">
          <div className="device-section-title">LFO 2</div>
          {visible('lfo2Dest') && (
            <select className="duck-source-select" value={p.lfo2Dest} onChange={(e) => set({ lfo2Dest: e.target.value as Lfo2Dest })}>
              {LFO2_DESTS.map((d) => (
                <option key={d.dest} value={d.dest}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
          <div className="knob-row">
            {visible('lfo2Rate') && (
              <Knob label="Rate" value={p.lfo2Rate} min={0.05} max={20} log format={(v) => `${v.toFixed(v < 1 ? 2 : 1)}Hz`} status={statusOf('lfo2Rate')} onChange={(v) => set({ lfo2Rate: v })} />
            )}
            {visible('lfo2Depth') && (
              <Knob label="Depth" value={p.lfo2Depth} min={0} max={1} format={pct} status={statusOf('lfo2Depth')} onChange={(v) => set({ lfo2Depth: v })} />
            )}
          </div>
        </div>
      )}
      {showMacro && (
        <div className="device-section">
          <div className="device-section-title">MACRO</div>
          <div className="knob-row">
            <Knob
              label="Intensity"
              value={p.macroValue}
              min={0}
              max={1}
              format={pct}
              status={statusOf('macroValue')}
              onChange={(v) => setMacroValue(track.id, v)}
            />
          </div>
          <div className="device-note" style={{ padding: '8px 0 0' }}>
            One knob → cutoff, reverb send, and distortion mix together.
          </div>
        </div>
      )}
      {(visible('volume') || visible('pan')) && (
        <div className="device-section">
          <div className="device-section-title">OUT</div>
          <div className="knob-row">
            {visible('volume') && (
              <Knob label="Volume" value={p.volume} min={-30} max={0} format={(v) => `${v.toFixed(0)}dB`} status={statusOf('volume')} onChange={(v) => set({ volume: v })} />
            )}
            {visible('pan') && (
              <Knob
                label="Pan"
                value={p.pan}
                min={-1}
                max={1}
                format={(v) => (Math.abs(v) < 0.03 ? 'C' : v < 0 ? `${Math.round(-v * 100)}L` : `${Math.round(v * 100)}R`)}
                status={statusOf('pan')}
                onChange={(v) => set({ pan: v })}
              />
            )}
          </div>
        </div>
      )}
      {(visible('sendReverb') || visible('sendDelay')) && (
        <div className="device-section">
          <div className="device-section-title">SEND</div>
          <div className="knob-row">
            {visible('sendReverb') && (
              <Knob label="Reverb" value={p.sendReverb} min={0} max={1} format={(v) => `${Math.round(v * 100)}%`} status={statusOf('sendReverb')} onChange={(v) => set({ sendReverb: v })} />
            )}
            {visible('sendDelay') && (
              <Knob label="Delay" value={p.sendDelay} min={0} max={1} format={(v) => `${Math.round(v * 100)}%`} status={statusOf('sendDelay')} onChange={(v) => set({ sendDelay: v })} />
            )}
            {showModSend && (
              <Knob label="Mod FX" value={p.sendMod} min={0} max={1} format={(v) => `${Math.round(v * 100)}%`} status={statusOf('sendMod')} onChange={(v) => set({ sendMod: v })} />
            )}
          </div>
        </div>
      )}
      {showChainOrder && (
        <div className="device-section">
          <div className="device-section-title">CHAIN ORDER</div>
          <div className="insert-order-row">
            {p.insertOrder.map((k, i) => (
              <div className="insert-slot" key={k}>
                <span className="insert-chip">{INSERT_LABELS[k]}</span>
                {i < p.insertOrder.length - 1 && (
                  <button className="insert-swap" title="Swap with next" onClick={() => swapInsertOrder(i)}>
                    ⇄
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {showEq && (
        <div className="device-section">
          <div className="device-section-title">EQ</div>
          <div className="knob-row">
            {visible('eqLow') && <Knob label="Low" value={p.eqLow} min={-24} max={24} format={db} status={statusOf('eqLow')} onChange={(v) => set({ eqLow: v })} />}
            {visible('eqMid') && <Knob label="Mid" value={p.eqMid} min={-24} max={24} format={db} status={statusOf('eqMid')} onChange={(v) => set({ eqMid: v })} />}
            {visible('eqHigh') && <Knob label="High" value={p.eqHigh} min={-24} max={24} format={db} status={statusOf('eqHigh')} onChange={(v) => set({ eqHigh: v })} />}
          </div>
        </div>
      )}
      {showComp && (
        <div className="device-section">
          <div className="device-section-title">COMPRESSOR</div>
          <div className="knob-row">
            {visible('compThreshold') && (
              <Knob label="Thresh" value={p.compThreshold} min={-60} max={0} format={db} status={statusOf('compThreshold')} onChange={(v) => set({ compThreshold: v })} />
            )}
            {visible('compRatio') && (
              <Knob label="Ratio" value={p.compRatio} min={1} max={20} format={ratio} status={statusOf('compRatio')} onChange={(v) => set({ compRatio: v })} />
            )}
            {visible('compAttack') && (
              <Knob label="Attack" value={p.compAttack} min={0.001} max={0.5} log format={ms} status={statusOf('compAttack')} onChange={(v) => set({ compAttack: v })} />
            )}
            {visible('compRelease') && (
              <Knob label="Release" value={p.compRelease} min={0.01} max={1} log format={ms} status={statusOf('compRelease')} onChange={(v) => set({ compRelease: v })} />
            )}
            {visible('compMix') && (
              <Knob label="Mix" value={p.compMix} min={0} max={1} format={pct} status={statusOf('compMix')} onChange={(v) => set({ compMix: v })} />
            )}
          </div>
        </div>
      )}
      {showDist && (
        <div className="device-section">
          <div className="device-section-title">DISTORTION / BITCRUSH</div>
          <div className="knob-row">
            {visible('distortionAmount') && (
              <Knob label="Drive" value={p.distortionAmount} min={0} max={1} format={pct} status={statusOf('distortionAmount')} onChange={(v) => set({ distortionAmount: v })} />
            )}
            {visible('distortionMix') && (
              <Knob label="Dist Mix" value={p.distortionMix} min={0} max={1} format={pct} status={statusOf('distortionMix')} onChange={(v) => set({ distortionMix: v })} />
            )}
            {visible('bitcrushBits') && (
              <Knob label="Bits" value={p.bitcrushBits} min={1} max={8} format={bits} status={statusOf('bitcrushBits')} onChange={(v) => set({ bitcrushBits: Math.round(v) })} />
            )}
            {visible('bitcrushMix') && (
              <Knob label="Crush Mix" value={p.bitcrushMix} min={0} max={1} format={pct} status={statusOf('bitcrushMix')} onChange={(v) => set({ bitcrushMix: v })} />
            )}
          </div>
        </div>
      )}
      {showSidechain && (
        <div className="device-section">
          <div className="device-section-title">SIDECHAIN</div>
          {visible('duckSource') && (
            <select
              className="duck-source-select"
              value={p.duckSource ?? ''}
              onChange={(e) => set({ duckSource: e.target.value || null })}
            >
              <option value="">Off</option>
              {duckSourceOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  Duck to {t.name}'s kick
                </option>
              ))}
            </select>
          )}
          {visible('duckAmount') && (
            <div className="knob-row">
              <Knob label="Depth" value={p.duckAmount} min={0} max={1} format={pct} status={statusOf('duckAmount')} onChange={(v) => set({ duckAmount: v })} />
            </div>
          )}
        </div>
      )}
      {visibleParams && visibleParams.length === 0 && (
        <div className="device-note">Patch is fixed for this drill — the notes are the whole test.</div>
      )}
    </div>
  )
}
