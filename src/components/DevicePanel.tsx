import { useRef, useState } from 'react'
import { DRUM_LABELS, DRUM_LANES, type FilterType, type InsertKind, type Lfo2Dest, type LfoDest, type OscType, type SynthParams, type Track } from '../types'
import { engine } from '../audio/engine'
import { useStore } from '../state/store'
import { Knob } from './Knob'
import type { ParamStatus } from '../lessons/framework'

const WAVES: { type: OscType; label: string; path: string; hint: string }[] = [
  { type: 'sine', label: 'Sine', path: 'M1 8 Q 4.5 0, 8 8 T 15 8', hint: 'Pure tone, no harmonics — the softest, roundest waveform' },
  { type: 'triangle', label: 'Tri', path: 'M1 12 L5 4 L9 12 L13 4 L15 8', hint: 'Soft and mellow — odd harmonics that fall off quickly' },
  { type: 'sawtooth', label: 'Saw', path: 'M1 12 L8 4 L8 12 L15 4 L15 12', hint: 'Bright and buzzy — every harmonic present, the classic dance-music workhorse' },
  { type: 'square', label: 'Sqr', path: 'M1 12 L1 4 L8 4 L8 12 L15 12 L15 4', hint: 'Hollow, woody tone — only odd harmonics' },
]

const FILTER_TYPES: { type: FilterType; label: string; hint: string }[] = [
  { type: 'lowpass', label: 'LP', hint: 'Low-pass: lets bass through, rolls off the highs above Cutoff' },
  { type: 'bandpass', label: 'BP', hint: 'Band-pass: only a narrow band around Cutoff gets through' },
  { type: 'highpass', label: 'HP', hint: 'High-pass: lets highs through, rolls off the bass below Cutoff' },
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

/** Collapsible wrapper for one device-panel section — click the title to fold it away, so a
 * lesson exposing many sections at once (e.g. everything up through Synth Depth II) can still
 * fit in a short device panel without every knob row being visible simultaneously. */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className={`device-section ${collapsed ? 'collapsed' : ''}`}>
      <button className="device-section-title" title={hint} onClick={() => setCollapsed((c) => !c)}>
        <span className="collapse-caret">{collapsed ? '▸' : '▾'}</span> {title}
      </button>
      {!collapsed && children}
    </div>
  )
}

export function DevicePanel({ track }: { track: Track }) {
  const setSynth = useStore((s) => s.setSynth)
  const setMacroValue = useStore((s) => s.setMacroValue)
  const lesson = useStore((s) => s.lesson())
  const paramScores = useStore((s) => s.paramScores)
  const allTracks = useStore((s) => s.tracks)
  const sampleLoaded = useStore((s) => s.sampleLoaded)
  const loadDrumSample = useStore((s) => s.loadDrumSample)
  const clearDrumSample = useStore((s) => s.clearDrumSample)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const visibleParams = lesson?.visibleParams
  const visible = (key: keyof SynthParams) => !visibleParams || visibleParams.includes(key)
  const statusOf = (key: keyof SynthParams): ParamStatus | undefined => paramScores?.[key]

  if (track.kind === 'drums') {
    return (
      <div className="device">
        <Section title="DRUM RACK" hint="The 5-lane synthesized/sampled kit this track's step sequencer triggers">
          <div className="drum-pads">
            {DRUM_LANES.map((lane) => (
              <button key={lane} className="pad" onClick={() => void engine.previewDrum(lane)} title={`Click to audition ${DRUM_LABELS[lane]}`}>
                {DRUM_LABELS[lane]}
              </button>
            ))}
          </div>
        </Section>
        <Section title="SAMPLE" hint="Load your own audio file to replace the synthesized kit, sliced across the 5 pads above">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void loadDrumSample(file)
              e.target.value = ''
            }}
          />
          <div className="knob-row" style={{ alignItems: 'center', gap: 8 }}>
            <button className="clear-btn" onClick={() => fileInputRef.current?.click()} title="Pick a short audio file — it auto-slices into 5 equal chunks, one per pad">
              Load Sample
            </button>
            {sampleLoaded && (
              <button className="clear-btn" onClick={clearDrumSample} title="Remove the loaded sample and go back to the synthesized kit">
                Clear
              </button>
            )}
          </div>
          <div className="device-note" style={{ padding: '8px 0 0' }}>
            {sampleLoaded
              ? `Loaded "${sampleLoaded.name}", auto-sliced into 5 equal chunks across the pads above — each pad now plays its slice instead of the synthesized voice.`
              : 'Load any short audio file to auto-slice it across the 5 pads (equal regions), replacing the synthesized kit lane-for-lane.'}
          </div>
        </Section>
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
  const showFm = visible('fmLevel') || visible('fmHarmonicity') || visible('fmModIndex')
  const showUnison = visible('unisonVoices')
  const showGlide = visible('glide')
  const showArp = visible('arpOn') || visible('arpRate') || visible('arpPattern')

  const swapInsertOrder = (i: number) => {
    const next = [...p.insertOrder]
    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
    set({ insertOrder: next })
  }

  return (
    <div className="device">
      {visible('osc') && (
        <Section title="OSC" hint="The main oscillator — the wave everything else in this patch is built around">
          <div className="wave-btns">
            {WAVES.map((w) => (
              <button
                key={w.type}
                className={`wave ${p.osc === w.type ? 'on' : ''} ${p.osc === w.type && statusOf('osc') ? `status-${statusOf('osc')}` : ''}`}
                onClick={() => set({ osc: w.type })}
                title={w.hint}
              >
                <svg width="16" height="16" viewBox="0 0 16 16">
                  <path d={w.path} stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
                {w.label}
              </button>
            ))}
          </div>
        </Section>
      )}
      {showOscBank && (
        <Section title="OSC 2 / SUB / NOISE" hint="Additional oscillator-bank layers summed in with the main oscillator before the filter">
          {visible('osc2Type') && (
            <div className="wave-btns wave-btns-row" style={{ marginBottom: 8 }}>
              {WAVES.map((w) => (
                <button
                  key={w.type}
                  className={`wave ${p.osc2Type === w.type ? 'on' : ''} ${p.osc2Type === w.type && statusOf('osc2Type') ? `status-${statusOf('osc2Type')}` : ''}`}
                  onClick={() => set({ osc2Type: w.type })}
                  title={w.hint}
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
              <Knob label="Osc2" value={p.osc2Level} min={0} max={1} format={pct} status={statusOf('osc2Level')} onChange={(v) => set({ osc2Level: v })} hint="How loud the second oscillator layer is mixed in — 0 = silent/off" />
            )}
            {visible('osc2Detune') && (
              <Knob label="Detune" value={p.osc2Detune} min={-100} max={100} format={cents} status={statusOf('osc2Detune')} onChange={(v) => set({ osc2Detune: v })} hint="How far Osc2 (and Osc3, if on) is detuned from the main pitch, in cents — creates width/beating" />
            )}
            {visible('subLevel') && (
              <Knob label="Sub" value={p.subLevel} min={0} max={1} format={pct} status={statusOf('subLevel')} onChange={(v) => set({ subLevel: v })} hint="A fixed sine wave one octave below the main pitch — adds low-end weight" />
            )}
            {visible('noiseLevel') && (
              <Knob label="Noise" value={p.noiseLevel} min={0} max={1} format={pct} status={statusOf('noiseLevel')} onChange={(v) => set({ noiseLevel: v })} hint="Blends in white noise — adds air, breath, or grit" />
            )}
            {showUnison && (
              <div className="unison-btns">
                <div className="unison-btns-label">Unison</div>
                {[1, 2, 3].map((v) => (
                  <button
                    key={v}
                    className={`wave ${p.unisonVoices === v ? 'on' : ''} ${p.unisonVoices === v && statusOf('unisonVoices') ? `status-${statusOf('unisonVoices')}` : ''}`}
                    onClick={() => set({ unisonVoices: v as 1 | 2 | 3 })}
                    title={v === 1 ? 'Just the main oscillator' : v === 2 ? 'Adds Osc2 at +Detune (the classic "supersaw" 2-voice stack)' : 'Adds a third voice mirrored at -Detune, for a symmetric, wider stack'}
                  >
                    {v}V
                  </button>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}
      {showFm && (
        <Section title="FM" hint="A separate FM (frequency modulation) voice, mixed in alongside the subtractive oscillators above">
          <div className="knob-row">
            {visible('fmLevel') && (
              <Knob label="Level" value={p.fmLevel} min={0} max={1} format={pct} status={statusOf('fmLevel')} onChange={(v) => set({ fmLevel: v })} hint="How loud the FM voice is mixed in — 0 = silent/off" />
            )}
            {visible('fmHarmonicity') && (
              <Knob label="Harm" value={p.fmHarmonicity} min={0.25} max={12} format={(v) => v.toFixed(2)} status={statusOf('fmHarmonicity')} onChange={(v) => set({ fmHarmonicity: v })} hint="Carrier:modulator frequency ratio — whole numbers (1, 2, 3) sound pitched; in-between values sound metallic/clangorous" />
            )}
            {visible('fmModIndex') && (
              <Knob label="Mod Idx" value={p.fmModIndex} min={0} max={30} format={(v) => v.toFixed(0)} status={statusOf('fmModIndex')} onChange={(v) => set({ fmModIndex: v })} hint="Modulation amount — higher values add more (and louder) harmonics" />
            )}
          </div>
        </Section>
      )}
      {showFilter && (
        <Section title="FILTER" hint="Shapes the oscillator bank's tone by rolling off part of the frequency spectrum">
          {visible('filterType') && (
            <div className="wave-btns" style={{ marginBottom: 8, gridTemplateColumns: '1fr 1fr 1fr' }}>
              {FILTER_TYPES.map((f) => (
                <button
                  key={f.type}
                  className={`wave ${p.filterType === f.type ? 'on' : ''} ${p.filterType === f.type && statusOf('filterType') ? `status-${statusOf('filterType')}` : ''}`}
                  onClick={() => set({ filterType: f.type })}
                  title={f.hint}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <div className="knob-row">
            {visible('cutoff') && (
              <Knob label="Cutoff" value={p.cutoff} min={20} max={20000} log format={hz} status={statusOf('cutoff')} onChange={(v) => set({ cutoff: v })} hint="The frequency where the filter's rolloff starts" />
            )}
            {visible('resonance') && (
              <Knob label="Res" value={p.resonance} min={0.1} max={20} format={(v) => v.toFixed(1)} status={statusOf('resonance')} onChange={(v) => set({ resonance: v })} hint="Emphasizes frequencies right at Cutoff — high values start to whistle/self-oscillate" />
            )}
          </div>
        </Section>
      )}
      {showFilterEnv && (
        <Section title="FILTER ENV" hint="A second envelope, separate from the amp envelope below, that sweeps the filter cutoff on every note-on">
          <div className="knob-row">
            {visible('filterEnvAmount') && (
              <Knob label="Amount" value={p.filterEnvAmount} min={0} max={1} format={pct} status={statusOf('filterEnvAmount')} onChange={(v) => set({ filterEnvAmount: v })} hint="How far the envelope sweeps the cutoff (in octaves) — 0 = no movement, filter stays static" />
            )}
            {visible('filterEnvAttack') && (
              <Knob label="Attack" value={p.filterEnvAttack} min={0.001} max={4} log format={ms} status={statusOf('filterEnvAttack')} onChange={(v) => set({ filterEnvAttack: v })} hint="Time for the filter sweep to reach its peak after a note starts" />
            )}
            {visible('filterEnvDecay') && (
              <Knob label="Decay" value={p.filterEnvDecay} min={0.01} max={4} log format={ms} status={statusOf('filterEnvDecay')} onChange={(v) => set({ filterEnvDecay: v })} hint="Time for the sweep to fall from its peak to the sustain level" />
            )}
            {visible('filterEnvSustain') && (
              <Knob label="Sustain" value={p.filterEnvSustain} min={0} max={1} format={(v) => v.toFixed(2)} status={statusOf('filterEnvSustain')} onChange={(v) => set({ filterEnvSustain: v })} hint="Fraction of the full sweep held while a note is sustained" />
            )}
            {visible('filterEnvRelease') && (
              <Knob label="Release" value={p.filterEnvRelease} min={0.01} max={8} log format={ms} status={statusOf('filterEnvRelease')} onChange={(v) => set({ filterEnvRelease: v })} hint="Time for the filter to settle back after a note ends" />
            )}
            {visible('keytrackAmount') && (
              <Knob label="Keytrack" value={p.keytrackAmount} min={0} max={1} format={pct} status={statusOf('keytrackAmount')} onChange={(v) => set({ keytrackAmount: v })} hint="Higher notes automatically brighten the filter — mimics how real instruments behave" />
            )}
            {visible('velToFilterAmount') && (
              <Knob label="Vel→Cutoff" value={p.velToFilterAmount} min={0} max={1} format={pct} status={statusOf('velToFilterAmount')} onChange={(v) => set({ velToFilterAmount: v })} hint="Harder-played (higher velocity) notes automatically brighten the filter" />
            )}
          </div>
        </Section>
      )}
      {showEnv && (
        <Section title="ENVELOPE" hint="The amplitude (volume) envelope — how loud a note is at each moment from key-down to silence">
          <div className="knob-row">
            {visible('attack') && (
              <Knob label="Attack" value={p.attack} min={0.001} max={8} log format={ms} status={statusOf('attack')} onChange={(v) => set({ attack: v })} hint="Time to reach full volume after a note starts" />
            )}
            {visible('decay') && (
              <Knob label="Decay" value={p.decay} min={0.01} max={8} log format={ms} status={statusOf('decay')} onChange={(v) => set({ decay: v })} hint="Time to fall from peak volume down to the sustain level" />
            )}
            {visible('sustain') && (
              <Knob label="Sustain" value={p.sustain} min={0} max={1} format={(v) => v.toFixed(2)} status={statusOf('sustain')} onChange={(v) => set({ sustain: v })} hint="Volume level held for as long as the note is held" />
            )}
            {visible('release') && (
              <Knob label="Release" value={p.release} min={0.01} max={15} log format={ms} status={statusOf('release')} onChange={(v) => set({ release: v })} hint="Time to fade to silence after the note ends" />
            )}
            {showGlide && (
              <Knob label="Glide" value={Math.max(p.glide, 0.001)} min={0.001} max={3} log format={ms} status={statusOf('glide')} onChange={(v) => set({ glide: v < 0.0015 ? 0 : v })} hint="Portamento — time to slide in pitch between consecutive notes instead of jumping instantly. Near-0 = off" />
            )}
          </div>
        </Section>
      )}
      {showArp && (
        <Section title="ARPEGGIATOR" hint="Fans notes stacked at the same grid position out into a fast sequence instead of playing them as a block chord">
          <div className="knob-row" style={{ alignItems: 'center' }}>
            {visible('arpOn') && (
              <div className="arp-toggle-group">
                <div className="unison-btns-label">On/Off</div>
                <div className="wave-btns wave-btns-row">
                  <button className={`wave ${!p.arpOn ? 'on' : ''}`} onClick={() => set({ arpOn: false })} title="Play stacked notes together as a chord">
                    Off
                  </button>
                  <button className={`wave ${p.arpOn ? 'on' : ''}`} onClick={() => set({ arpOn: true })} title="Fan stacked notes out into a sequence">
                    On
                  </button>
                </div>
              </div>
            )}
            {visible('arpPattern') && (
              <div className="arp-toggle-group">
                <div className="unison-btns-label">Pattern</div>
                <div className="wave-btns wave-btns-row">
                  {(['up', 'down', 'updown'] as const).map((pat) => (
                    <button
                      key={pat}
                      className={`wave ${p.arpPattern === pat ? 'on' : ''}`}
                      onClick={() => set({ arpPattern: pat })}
                      title={pat === 'up' ? 'Lowest pitch to highest' : pat === 'down' ? 'Highest pitch to lowest' : 'Up then back down'}
                    >
                      {pat}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {visible('arpRate') && (
              <Knob label="Rate" value={p.arpRate} min={1} max={8} format={(v) => `${Math.round(v)}/step`} status={statusOf('arpRate')} onChange={(v) => set({ arpRate: Math.round(v) })} hint="How many arp notes fit into one 16th-note step — higher = faster" />
            )}
          </div>
          <div className="device-note" style={{ padding: '8px 0 0' }}>
            Arpeggiates notes stacked at the same grid position — hold a chord in the piano roll to hear it fan out.
          </div>
        </Section>
      )}
      {showLfo && (
        <Section title="LFO" hint="A low-frequency oscillator that continuously modulates one destination — the classic wobble/vibrato/tremolo mechanism">
          {visible('lfoDest') && (
            <div className="wave-btns" style={{ marginBottom: 8, gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              {LFO_DESTS.map((d) => (
                <button
                  key={d.dest}
                  className={`wave ${p.lfoDest === d.dest ? 'on' : ''} ${p.lfoDest === d.dest && statusOf('lfoDest') ? `status-${statusOf('lfoDest')}` : ''}`}
                  onClick={() => set({ lfoDest: d.dest })}
                  title={d.dest === 'off' ? 'LFO has no effect' : d.dest === 'pitch' ? 'Modulates pitch (vibrato)' : d.dest === 'cutoff' ? 'Modulates filter cutoff (wobble)' : 'Modulates volume (tremolo)'}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
          <div className="knob-row">
            {visible('lfoRate') && (
              <Knob label="Rate" value={p.lfoRate} min={0.02} max={20} log format={(v) => `${v.toFixed(v < 1 ? 2 : 1)}Hz`} status={statusOf('lfoRate')} onChange={(v) => set({ lfoRate: v })} hint="LFO speed, in cycles per second" />
            )}
            {visible('lfoDepth') && (
              <Knob label="Depth" value={p.lfoDepth} min={0} max={1} format={pct} status={statusOf('lfoDepth')} onChange={(v) => set({ lfoDepth: v })} hint="How far the LFO swings its destination — 0 = no audible effect" />
            )}
          </div>
        </Section>
      )}
      {showLfo2 && (
        <Section title="LFO 2" hint="A second, independent LFO with its own destination list — lets two modulation routes run at once">
          {visible('lfo2Dest') && (
            <select className="duck-source-select" value={p.lfo2Dest} onChange={(e) => set({ lfo2Dest: e.target.value as Lfo2Dest })} title="What this LFO modulates">
              {LFO2_DESTS.map((d) => (
                <option key={d.dest} value={d.dest}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
          <div className="knob-row">
            {visible('lfo2Rate') && (
              <Knob label="Rate" value={p.lfo2Rate} min={0.02} max={20} log format={(v) => `${v.toFixed(v < 1 ? 2 : 1)}Hz`} status={statusOf('lfo2Rate')} onChange={(v) => set({ lfo2Rate: v })} hint="LFO 2 speed, in cycles per second" />
            )}
            {visible('lfo2Depth') && (
              <Knob label="Depth" value={p.lfo2Depth} min={0} max={1} format={pct} status={statusOf('lfo2Depth')} onChange={(v) => set({ lfo2Depth: v })} hint="How far LFO 2 swings its destination — 0 = no audible effect" />
            )}
          </div>
        </Section>
      )}
      {showMacro && (
        <Section title="MACRO" hint="One performance knob mapped to several parameters at once">
          <div className="knob-row">
            <Knob
              label="Intensity"
              value={p.macroValue}
              min={0}
              max={1}
              format={pct}
              status={statusOf('macroValue')}
              onChange={(v) => setMacroValue(track.id, v)}
              hint="Sweeps cutoff, reverb send, and distortion mix together — a fixed mapping, not user-configurable"
            />
          </div>
        </Section>
      )}
      {(visible('volume') || visible('pan')) && (
        <Section title="OUT" hint="This track's final output level and stereo position">
          <div className="knob-row">
            {visible('volume') && (
              <Knob label="Volume" value={p.volume} min={-30} max={6} format={(v) => `${v.toFixed(0)}dB`} status={statusOf('volume')} onChange={(v) => set({ volume: v })} hint="Track output level, in dB" />
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
                hint="Stereo position, from hard left to hard right"
              />
            )}
          </div>
        </Section>
      )}
      {(visible('sendReverb') || visible('sendDelay')) && (
        <Section title="SEND" hint="How much of this track bleeds into the shared reverb/delay/mod-fx return buses">
          <div className="knob-row">
            {visible('sendReverb') && (
              <Knob label="Reverb" value={p.sendReverb} min={0} max={1} format={(v) => `${Math.round(v * 100)}%`} status={statusOf('sendReverb')} onChange={(v) => set({ sendReverb: v })} hint="How much signal bleeds into the shared reverb bus" />
            )}
            {visible('sendDelay') && (
              <Knob label="Delay" value={p.sendDelay} min={0} max={1} format={(v) => `${Math.round(v * 100)}%`} status={statusOf('sendDelay')} onChange={(v) => set({ sendDelay: v })} hint="How much signal bleeds into the shared delay bus" />
            )}
            {showModSend && (
              <Knob label="Mod FX" value={p.sendMod} min={0} max={1} format={(v) => `${Math.round(v * 100)}%`} status={statusOf('sendMod')} onChange={(v) => set({ sendMod: v })} hint="How much signal bleeds into the shared chorus → phaser bus" />
            )}
          </div>
        </Section>
      )}
      {showChainOrder && (
        <Section title="CHAIN ORDER" hint="The order EQ, Compressor, and Distortion process the signal in — reordering audibly changes the result">
          <div className="insert-order-row">
            {p.insertOrder.map((k, i) => (
              <div className="insert-slot" key={k}>
                <span className="insert-chip">{INSERT_LABELS[k]}</span>
                {i < p.insertOrder.length - 1 && (
                  <button className="insert-swap" title="Swap this effect's position with the next one in the chain" onClick={() => swapInsertOrder(i)}>
                    ⇄
                  </button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
      {showEq && (
        <Section title="EQ" hint="A 3-band equalizer — boosts or cuts a frequency range independently of the filter">
          <div className="knob-row">
            {visible('eqLow') && <Knob label="Low" value={p.eqLow} min={-24} max={24} format={db} status={statusOf('eqLow')} onChange={(v) => set({ eqLow: v })} hint="Boost or cut the low band, in dB" />}
            {visible('eqMid') && <Knob label="Mid" value={p.eqMid} min={-24} max={24} format={db} status={statusOf('eqMid')} onChange={(v) => set({ eqMid: v })} hint="Boost or cut the mid band, in dB" />}
            {visible('eqHigh') && <Knob label="High" value={p.eqHigh} min={-24} max={24} format={db} status={statusOf('eqHigh')} onChange={(v) => set({ eqHigh: v })} hint="Boost or cut the high band, in dB" />}
          </div>
        </Section>
      )}
      {showComp && (
        <Section title="COMPRESSOR" hint="Turns down anything louder than Thresh, by a factor of Ratio — evens out dynamics">
          <div className="knob-row">
            {visible('compThreshold') && (
              <Knob label="Thresh" value={p.compThreshold} min={-60} max={0} format={db} status={statusOf('compThreshold')} onChange={(v) => set({ compThreshold: v })} hint="Level above which the compressor starts working" />
            )}
            {visible('compRatio') && (
              <Knob label="Ratio" value={p.compRatio} min={1} max={20} format={ratio} status={statusOf('compRatio')} onChange={(v) => set({ compRatio: v })} hint="How hard signal above the threshold gets squashed — e.g. 4:1 means 4dB over becomes 1dB over" />
            )}
            {visible('compAttack') && (
              <Knob label="Attack" value={p.compAttack} min={0.001} max={1} log format={ms} status={statusOf('compAttack')} onChange={(v) => set({ compAttack: v })} hint="How quickly the compressor reacts once the signal crosses the threshold" />
            )}
            {visible('compRelease') && (
              <Knob label="Release" value={p.compRelease} min={0.01} max={2} log format={ms} status={statusOf('compRelease')} onChange={(v) => set({ compRelease: v })} hint="How quickly the compressor lets go after the signal drops back below threshold" />
            )}
            {visible('compMix') && (
              <Knob label="Mix" value={p.compMix} min={0} max={1} format={pct} status={statusOf('compMix')} onChange={(v) => set({ compMix: v })} hint="Blend of compressed vs. dry signal — 100% wet vs. dry (parallel/'New York' compression) at less than 100%" />
            )}
          </div>
        </Section>
      )}
      {showDist && (
        <Section title="DISTORTION / BITCRUSH" hint="Two different flavors of intentional 'ugly': harmonic saturation, and lo-fi digital crunch">
          <div className="knob-row">
            {visible('distortionAmount') && (
              <Knob label="Drive" value={p.distortionAmount} min={0} max={1} format={pct} status={statusOf('distortionAmount')} onChange={(v) => set({ distortionAmount: v })} hint="Distortion amount — more drive = more harmonic saturation/grit" />
            )}
            {visible('distortionMix') && (
              <Knob label="Dist Mix" value={p.distortionMix} min={0} max={1} format={pct} status={statusOf('distortionMix')} onChange={(v) => set({ distortionMix: v })} hint="How much distorted signal is blended back in with the dry signal" />
            )}
            {visible('bitcrushBits') && (
              <Knob label="Bits" value={p.bitcrushBits} min={1} max={16} format={bits} status={statusOf('bitcrushBits')} onChange={(v) => set({ bitcrushBits: Math.round(v) })} hint="Bit depth — lower values sound more lo-fi/digital/broken" />
            )}
            {visible('bitcrushMix') && (
              <Knob label="Crush Mix" value={p.bitcrushMix} min={0} max={1} format={pct} status={statusOf('bitcrushMix')} onChange={(v) => set({ bitcrushMix: v })} hint="How much bitcrushed signal is blended back in with the dry signal" />
            )}
          </div>
        </Section>
      )}
      {showSidechain && (
        <Section title="SIDECHAIN" hint="Ducks this track's volume whenever another track's kick hits — the classic dance-music 'pump'">
          {visible('duckSource') && (
            <select
              className="duck-source-select"
              value={p.duckSource ?? ''}
              onChange={(e) => set({ duckSource: e.target.value || null })}
              title="Which drum track's kick lane triggers the duck"
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
              <Knob label="Depth" value={p.duckAmount} min={0} max={1} format={pct} status={statusOf('duckAmount')} onChange={(v) => set({ duckAmount: v })} hint="How deep the volume dip is on each kick hit" />
            </div>
          )}
        </Section>
      )}
      {visibleParams && visibleParams.length === 0 && (
        <div className="device-note">Patch is fixed for this drill — the notes are the whole test.</div>
      )}
    </div>
  )
}
