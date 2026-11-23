// Sound: everything is synthesised in the browser, so the game still ships without a single
// audio file. Two parts:
//
//   · effects — every action has a short sound made of a few oscillators and bursts of noise
//   · music   — generated as it plays. A scene (island, mine, under water, flight, sailing,
//     pirates) is a key, a tempo and a mood; the melody is a short motif that comes back
//     changed, with long rests between phrases, over slow chords, an echo and a wide reverb.
//     Changing scene keeps the same generator running and moves it to the new key and mood
//     at the next bar, so one place flows into the next.
//
// (This is the best that can be done without recorded instruments. docs/DECISIONS.md says
// what a composed soundtrack would replace.)

export type MusicScene = 'island' | 'mine' | 'water' | 'flight' | 'sail' | 'pirate' | 'home' | 'rest' | 'fishing'
type Quality = 'maj' | 'min' | 'sus'

interface SceneDef {
  root: number // MIDI note of the key
  scale: number[]
  bpm: number
  chords: [number, Quality][] // root (semitones from the key) and colour, two bars each
  density: number // how many notes a phrase has (0..1)
  rest: number // chance that a phrase is left empty: the room between the lines
  melVol: number
  melOct: number
  padVol: number
  padCut: number
  padType: OscillatorType
  bassVol: number
  arp: number // a soft broken chord under the tune (flight)
  pulse: number // a low, urgent pulse (pirates)
  noise: 'sea' | 'wind' | 'cave' | 'deep' | 'room'
  noiseVol: number
}

const SCENES: Record<MusicScene, SceneDef> = {
  // round 18: with a line in the water — slow, few notes, a lot of sea, nothing that hurries
  fishing: {
    root: 65, scale: [0, 2, 4, 7, 9], bpm: 46, chords: [[0, 'maj'], [5, 'maj'], [-3, 'min'], [0, 'sus']],
    density: 0.26, rest: 0.6, melVol: 0.42, melOct: 12, padVol: 0.2, padCut: 900, padType: 'sine', bassVol: 0.14,
    arp: 0.12, pulse: 0, noise: 'sea', noiseVol: 0.1,
  },
  island: {
    root: 62, scale: [0, 2, 4, 7, 9], bpm: 54, chords: [[0, 'maj'], [-3, 'min'], [5, 'maj'], [7, 'sus']],
    density: 0.42, rest: 0.45, melVol: 0.5, melOct: 12, padVol: 0.16, padCut: 1500, padType: 'triangle', bassVol: 0.2,
    arp: 0, pulse: 0, noise: 'sea', noiseVol: 0.05,
  },
  mine: {
    root: 57, scale: [0, 3, 5, 7, 10], bpm: 44, chords: [[0, 'min'], [-2, 'maj'], [-4, 'maj'], [0, 'min']],
    density: 0.3, rest: 0.6, melVol: 0.42, melOct: 0, padVol: 0.14, padCut: 600, padType: 'sine', bassVol: 0.26,
    arp: 0, pulse: 0, noise: 'cave', noiseVol: 0.05,
  },
  water: {
    root: 60, scale: [0, 2, 4, 6, 7, 9, 11], bpm: 40, chords: [[0, 'maj'], [2, 'maj'], [0, 'maj'], [-3, 'min']],
    density: 0.3, rest: 0.5, melVol: 0.36, melOct: 12, padVol: 0.22, padCut: 480, padType: 'sine', bassVol: 0.22,
    arp: 0, pulse: 0, noise: 'deep', noiseVol: 0.09,
  },
  flight: {
    root: 65, scale: [0, 2, 4, 5, 7, 9, 11], bpm: 66, chords: [[0, 'maj'], [7, 'maj'], [-3, 'min'], [5, 'maj']],
    density: 0.5, rest: 0.35, melVol: 0.46, melOct: 12, padVol: 0.15, padCut: 2400, padType: 'triangle', bassVol: 0.2,
    arp: 0.5, pulse: 0, noise: 'wind', noiseVol: 0.04,
  },
  sail: {
    root: 60, scale: [0, 2, 4, 5, 7, 9, 10], bpm: 58, chords: [[0, 'maj'], [-2, 'maj'], [5, 'maj'], [0, 'maj']],
    density: 0.45, rest: 0.4, melVol: 0.44, melOct: 12, padVol: 0.12, padCut: 1100, padType: 'sawtooth', bassVol: 0.22,
    arp: 0.25, pulse: 0, noise: 'sea', noiseVol: 0.08,
  },
  // at home: a slow, warm tune, the sea far off
  home: {
    root: 60, scale: [0, 2, 4, 7, 9, 11], bpm: 50, chords: [[0, 'maj'], [5, 'maj'], [-3, 'min'], [7, 'sus']],
    density: 0.36, rest: 0.5, melVol: 0.42, melOct: 12, padVol: 0.17, padCut: 900, padType: 'sine', bassVol: 0.17,
    arp: 0.15, pulse: 0, noise: 'room', noiseVol: 0.015,
  },
  // lying in bed listening to the weather: hardly a tune at all, a few notes and the pad
  rest: {
    root: 57, scale: [0, 2, 4, 7, 9], bpm: 40, chords: [[0, 'maj'], [-3, 'min'], [5, 'maj'], [0, 'sus']],
    density: 0.2, rest: 0.66, melVol: 0.32, melOct: 12, padVol: 0.2, padCut: 700, padType: 'sine', bassVol: 0.12,
    arp: 0.1, pulse: 0, noise: 'room', noiseVol: 0.01,
  },
  pirate: {
    root: 62, scale: [0, 1, 4, 5, 7, 8, 10], bpm: 104, chords: [[0, 'min'], [1, 'maj'], [0, 'min'], [7, 'maj']],
    density: 0.7, rest: 0.1, melVol: 0.4, melOct: 0, padVol: 0.13, padCut: 900, padType: 'sawtooth', bassVol: 0.3,
    arp: 0, pulse: 0.8, noise: 'wind', noiseVol: 0.05,
  },
}

/** the global object, whatever it is called here (the browser's window; WeChat's GameGlobal) */
const GL = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext; localStorage?: Storage }
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

interface Note { step: number; deg: number; len: number }

export class GameAudio {
  ctx: AudioContext | null = null
  muted = false
  private master!: GainNode
  private sfx!: GainNode
  private music!: GainNode
  private rev!: GainNode
  private echo!: GainNode
  private noiseBuf!: AudioBuffer
  private analyser!: AnalyserNode
  // music
  private scene: MusicScene = 'island'
  private def: SceneDef = SCENES.island
  private pending: MusicScene | null = null
  private step = 0
  private nextT = 0
  private timer = 0
  private motif: Note[] = []
  private phrase: Note[] = []
  private phraseN = 0
  private pads: GainNode[] = []
  private bed: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null
  // loops
  private eng: { prop: OscillatorNode; propGain: GainNode; trem: OscillatorNode; jetF: BiquadFilterNode; jetGain: GainNode; seaGain: GainNode; windGain: GainNode } | null = null
  private furnace = false
  private combo = 0
  private comboT = 0

  constructor() {
    try {
      this.muted = GL.localStorage?.getItem('skyisle-mute') === '1'
    } catch { /* no storage: start with sound on */ }
  }

  /** browsers only allow sound after a gesture: call this from the first click, tap or key */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const AC = GL.AudioContext || GL.webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.9
    // (WeChat's WebAudio may lack the compressor, the analyser or the convolver: the sound goes on without them)
    let comp: AudioNode | null = null
    try {
      const c = ctx.createDynamicsCompressor()
      c.threshold.value = -14
      c.ratio.value = 4
      comp = c
    } catch { comp = null }
    if (comp) this.master.connect(comp).connect(ctx.destination)
    else this.master.connect(ctx.destination)
    try {
      this.analyser = ctx.createAnalyser()
      this.analyser.fftSize = 1024
      this.master.connect(this.analyser)
    } catch { /* no level meter */ }
    this.sfx = ctx.createGain()
    this.sfx.gain.value = this.vol.sfx
    this.sfx.connect(this.master)
    this.music = ctx.createGain()
    this.music.gain.value = this.vol.music
    this.music.connect(this.master)

    // one second of noise, reused by every hiss, thud and wave
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const nd = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

    // a wide room: noise that dies away over three seconds, used as an impulse response
    const len = Math.floor(ctx.sampleRate * 3)
    const ir = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
    }
    this.rev = ctx.createGain()
    this.rev.gain.value = 0.5
    try {
      const conv = ctx.createConvolver()
      conv.buffer = ir
      this.rev.connect(conv).connect(this.music)
    } catch {
      // no convolver: a quiet, dark echo stands in for the room
      const d = ctx.createDelay(1)
      d.delayTime.value = 0.09
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 1200
      const g = ctx.createGain()
      g.gain.value = 0.35
      this.rev.connect(d).connect(lp).connect(g).connect(this.music)
    }
    // an echo that answers each note a few times, darker every time
    const delay = ctx.createDelay(2)
    delay.delayTime.value = 0.46
    const fb = ctx.createGain()
    fb.gain.value = 0.42
    const damp = ctx.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 1700
    this.echo = ctx.createGain()
    this.echo.gain.value = 0.34
    this.echo.connect(delay)
    delay.connect(damp).connect(fb).connect(delay)
    damp.connect(this.music)

    this.startLoops()
    this.setBed()
    this.nextT = ctx.currentTime + 0.3
    this.newMotif()
    this.timer = setInterval(() => { try { this.tick() } catch { clearInterval(this.timer) } }, 70)
  }
  dispose() {
    clearInterval(this.timer)
    void this.ctx?.close()
    this.ctx = null
  }
  /** how loud the music and the effects are, each 0 … 1 */
  setVolume(music: number, sfx: number) {
    this.vol = { music, sfx }
    if (!this.ctx) return
    this.music.gain.setTargetAtTime(music, this.ctx.currentTime, 0.05)
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05)
  }
  private vol = { music: 0.5, sfx: 0.55 }
  toggleMute() {
    this.muted = !this.muted
    try {
      GL.localStorage?.setItem('skyisle-mute', this.muted ? '1' : '0')
    } catch { /* not remembered, that is all */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05)
  }
  /** how loud the output is right now, 0..1 (for the tests: silence is a bug) */
  level(): number {
    if (!this.ctx || !this.analyser) return 0
    const buf = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
    return Math.sqrt(sum / buf.length)
  }

  // ───────────────────────────────────────────────────────────── building blocks
  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, dest?: AudioNode, attack = 0.004) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(dest ?? this.sfx)
    o.start(t)
    o.stop(t + dur + 0.02)
    return g
  }
  private hiss(t: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1 = f0, q = 0.8, dest?: AudioNode) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = type
    f.Q.value = q
    f.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(dest ?? this.sfx)
    src.start(t, Math.random() * 0.8)
    src.stop(t + dur + 0.02)
  }
  /** a small bell: the game's "good news" voice */
  private bell(f: number, t: number, dur: number, vol: number) {
    this.tone('sine', f, f, t, dur, vol)
    this.tone('sine', f * 2.01, f * 2.01, t, dur * 0.6, vol * 0.35)
    this.tone('triangle', f * 3.02, f * 3.02, t, dur * 0.3, vol * 0.12)
  }

  // ───────────────────────────────────────────────────────────── effects
  /** plays a named effect. pitch shifts it (1 = as written), vol scales it */
  play(name: string, pitch = 1, vol = 1) {
    const ctx = this.ctx
    if (!ctx || this.muted) return
    const t = ctx.currentTime + 0.005
    const r = () => 0.94 + Math.random() * 0.12
    const p = pitch
    switch (name) {
      case 'tap': this.tone('sine', 760 * p, 560 * p, t, 0.05, 0.16 * vol); break
      case 'open': this.hiss(t, 0.12, 0.1 * vol, 'bandpass', 700, 2200, 1.2); break
      case 'close': this.hiss(t, 0.1, 0.08 * vol, 'bandpass', 1800, 600, 1.2); break
      case 'error':
        this.tone('square', 150, 120, t, 0.09, 0.1 * vol)
        this.tone('square', 120, 96, t + 0.1, 0.12, 0.1 * vol)
        break
      case 'step': this.hiss(t, 0.045, 0.045 * vol, 'lowpass', 520 * r() * p, 300, 0.7); break
      case 'go': this.tone('sine', 520, 700, t, 0.05, 0.06 * vol); break
      case 'swing': this.hiss(t, 0.09, 0.07 * vol, 'bandpass', 500, 1500, 1.5); break
      case 'chop':
        this.hiss(t, 0.07, 0.34 * vol, 'lowpass', 1500 * r(), 380, 0.8)
        this.tone('triangle', 170 * r() * p, 90, t, 0.11, 0.3 * vol)
        break
      case 'creak':
        this.tone('sawtooth', 240, 120, t, 0.5, 0.07 * vol)
        this.tone('sawtooth', 370, 150, t + 0.06, 0.42, 0.05 * vol)
        break
      case 'treefall':
        this.tone('sine', 90, 42, t, 0.35, 0.5 * vol)
        this.hiss(t, 0.4, 0.3 * vol, 'lowpass', 900, 160, 0.7)
        this.hiss(t + 0.03, 0.55, 0.12 * vol, 'highpass', 2600, 1800, 0.7)
        break
      case 'mine':
        this.tone('sine', 1900 * r() * p, 1700 * p, t, 0.14, 0.2 * vol)
        this.tone('sine', 2850 * r() * p, 2600 * p, t, 0.09, 0.1 * vol)
        this.hiss(t, 0.035, 0.26 * vol, 'highpass', 1800, 1800, 0.7)
        this.tone('triangle', 140, 80, t, 0.07, 0.2 * vol)
        break
      case 'rockbreak':
        this.hiss(t, 0.3, 0.42 * vol, 'lowpass', 2200, 220, 0.7)
        this.tone('sine', 110, 46, t, 0.28, 0.42 * vol)
        for (let i = 0; i < 4; i++) this.hiss(t + 0.08 + i * 0.05 * r(), 0.04, 0.1 * vol, 'bandpass', 1400 * r(), 900, 2)
        break
      case 'pick':
        this.tone('sine', 520 * p, 820 * p, t, 0.09, 0.16 * vol)
        this.hiss(t, 0.08, 0.08 * vol, 'highpass', 3000, 2400, 0.7)
        break
      case 'pop': this.tone('sine', 380 * p * r(), 760 * p, t, 0.08, 0.14 * vol); break
      case 'flap': this.hiss(t, 0.18, 0.08 * vol, 'bandpass', 900 * p, 400 * p, 1.5); this.hiss(t + 0.1, 0.16, 0.07 * vol, 'bandpass', 900 * p, 400 * p, 1.5); break
      case 'talk': {
        // a few soft syllables, Animalese-style: short blips at wandering pitches
        for (let i = 0; i < 5; i++) {
          const f = (420 + Math.random() * 260) * p
          this.tone('triangle', f, f * (0.9 + Math.random() * 0.2), t + i * 0.075, 0.06, 0.07 * vol)
        }
        break
      }
      case 'thunder': {
        // a crack, then the long roll
        this.hiss(t, 0.08, 0.3 * vol, 'highpass', 1800, 900, 0.7)
        this.hiss(t + 0.05, 2.6 * p, 0.32 * vol, 'lowpass', 220, 60, 0.7)
        this.hiss(t + 0.4, 1.8 * p, 0.2 * vol, 'lowpass', 160, 50, 0.7)
        break
      }
      case 'collect': {
        // each one in a quick run is a step higher: gathering a pile plays a little scale
        if (t - this.comboT > 0.7) this.combo = 0
        this.comboT = t
        const f = midi(76 + [0, 2, 4, 7, 9, 12, 14, 16][Math.min(7, this.combo++)])
        this.tone('sine', f, f, t, 0.16, 0.16 * vol)
        this.tone('sine', f * 2, f * 2, t, 0.1, 0.05 * vol)
        break
      }
      case 'coin': {
        if (t - this.comboT > 0.7) this.combo = 0
        this.comboT = t
        const f = midi(84 + [0, 4, 7, 12, 16][Math.min(4, this.combo++)])
        this.tone('square', f, f, t, 0.05, 0.05 * vol)
        this.tone('sine', f * 1.5, f * 1.5, t + 0.045, 0.22, 0.14 * vol)
        break
      }
      case 'buy':
        this.tone('sine', 1320, 1320, t, 0.07, 0.12 * vol)
        this.tone('sine', 990, 990, t + 0.07, 0.14, 0.12 * vol)
        break
      case 'craft':
        this.hiss(t, 0.04, 0.22 * vol, 'bandpass', 2000 * r(), 1300, 1.5)
        this.tone('triangle', 300 * r() * p, 210, t, 0.07, 0.2 * vol)
        break
      case 'saw': this.hiss(t, 0.16, 0.1 * vol, 'bandpass', 900, 1500 * r(), 3); break
      case 'done':
        this.bell(midi(79), t, 0.5, 0.14 * vol)
        this.bell(midi(84), t + 0.09, 0.7, 0.14 * vol)
        break
      case 'ding':
        this.bell(1568, t, 1.5, 0.24 * vol)
        this.tone('sine', 3136, 3136, t, 0.9, 0.06 * vol)
        break
      case 'crackle': this.hiss(t, 0.03, 0.08 * vol * r(), 'bandpass', 1500 + Math.random() * 2500, 900, 3); break
      case 'place':
        this.tone('sine', 120, 50, t, 0.22, 0.45 * vol)
        this.hiss(t, 0.3, 0.2 * vol, 'lowpass', 1200, 200, 0.7)
        break
      case 'stack': this.tone('triangle', 260 * p, 200 * p, t, 0.06, 0.2 * vol); this.hiss(t, 0.03, 0.1 * vol, 'highpass', 2500, 2500); break
      case 'paper': this.hiss(t, 0.12, 0.14 * vol, 'highpass', 2200, 4200, 0.7); break
      case 'stamp':
        this.hiss(t, 0.1, 0.12 * vol, 'highpass', 2600, 3600, 0.7)
        this.tone('sine', 150, 70, t + 0.1, 0.12, 0.4 * vol)
        break
      case 'quest':
        this.bell(midi(81), t, 0.4, 0.13 * vol)
        this.bell(midi(88), t + 0.11, 0.7, 0.13 * vol)
        break
      case 'fanfare': {
        const notes = [72, 76, 79, 84]
        notes.forEach((n, i) => this.bell(midi(n), t + i * 0.1, 0.9, 0.16 * vol))
        this.hiss(t + 0.3, 0.9, 0.05 * vol, 'highpass', 5000, 8000, 0.7)
        break
      }
      case 'bigfanfare': {
        const notes = [60, 67, 72, 76, 79, 84, 88, 91]
        notes.forEach((n, i) => this.bell(midi(n), t + i * 0.09, 1.6, 0.16 * vol))
        ;[72, 76, 79].forEach((n) => this.tone('triangle', midi(n), midi(n), t + 0.75, 1.8, 0.1 * vol, undefined, 0.05))
        this.tone('sine', midi(48), midi(48), t + 0.75, 1.8, 0.2 * vol, undefined, 0.03)
        this.hiss(t + 0.7, 1.6, 0.07 * vol, 'highpass', 4000, 9000, 0.7)
        break
      }
      case 'reveal':
        for (let i = 0; i < 4; i++) this.tone('sine', midi(88 + [0, 4, 7, 11][i]), midi(88 + [0, 4, 7, 11][i]), t + i * 0.05, 0.3, 0.07 * vol)
        break
      case 'rare':
        for (let i = 0; i < 7; i++) this.bell(midi(84 + [0, 4, 7, 11, 12, 16, 19][i]), t + i * 0.07, 0.9, 0.11 * vol)
        break
      case 'land':
        this.hiss(t, 0.14, 0.2 * vol, 'highpass', 2400, 1500, 2)
        this.tone('sine', 100, 50, t + 0.02, 0.25, 0.4 * vol)
        break
      case 'splash':
        this.hiss(t, 0.5, 0.3 * vol, 'lowpass', 2600, 300, 0.7)
        this.hiss(t + 0.05, 0.35, 0.1 * vol, 'highpass', 3000, 5000, 0.7)
        break
      case 'munch': // a bite: two soft crunches
        this.hiss(t, 0.05, 0.1 * vol, 'bandpass', 900 * p, 600 * p, 1.2)
        this.hiss(t + 0.09, 0.05, 0.08 * vol, 'bandpass', 800 * p, 500 * p, 1.2)
        break
      case 'cutlery': // a fork against the plate
        this.tone('sine', 2400 * p, 2300 * p, t, 0.07, 0.07 * vol)
        this.tone('sine', 3100 * p, 3000 * p, t + 0.06, 0.09, 0.05 * vol)
        break
      case 'yum': // a meal finished: two warm notes
        this.tone('triangle', 440, 440, t, 0.12, 0.13 * vol)
        this.tone('triangle', 587, 587, t + 0.11, 0.24, 0.14 * vol)
        break
      case 'sizzle': // into the hot pan
        this.hiss(t, 1.1, 0.09 * vol, 'highpass', 3500, 5000, 0.7)
        this.hiss(t, 0.15, 0.1 * vol, 'bandpass', 1800, 2600, 1)
        break
      case 'stir': // the spoon round the pan
        this.tone('sine', 1500 * p, 1350 * p, t, 0.05, 0.05 * vol)
        this.hiss(t, 0.12, 0.05 * vol, 'bandpass', 1200 * p, 2000 * p, 1.5)
        break
      case 'pour': // the watering can: a long sprinkle
        this.hiss(t, 0.7, 0.1 * vol, 'bandpass', 2600, 1700, 0.9)
        this.hiss(t + 0.1, 0.55, 0.06 * vol, 'highpass', 5000, 4200, 0.7)
        break
      case 'drip': // water landing on soil
        this.tone('sine', 900 * p, 500 * p, t, 0.05, 0.05 * vol)
        this.hiss(t, 0.06, 0.04 * vol, 'lowpass', 1200, 600)
        break
      case 'scatter': // grains shaken out of a sack
        for (let i = 0; i < 4; i++) this.hiss(t + i * 0.035, 0.03, 0.08 * vol, 'bandpass', (1800 + i * 300) * p, 1400 * p, 1.6)
        break
      case 'sprout': // the soil taking it up: a soft rising pair
        this.tone('sine', 523, 659, t, 0.14, 0.09 * vol)
        this.tone('sine', 784, 880, t + 0.1, 0.2, 0.07 * vol)
        break
      case 'boot': // the computer starting up: the fan, then a rising chord
        this.hiss(t, 0.7, 0.03 * vol, 'lowpass', 500, 900)
        this.tone('square', 262, 262, t + 0.2, 0.1, 0.05 * vol)
        this.tone('square', 392, 392, t + 0.32, 0.1, 0.05 * vol)
        this.tone('square', 523, 523, t + 0.44, 0.22, 0.06 * vol)
        break
      case 'key': // one key of the keyboard
        this.hiss(t, 0.025, 0.11 * vol, 'bandpass', 2200 * p, 1600 * p, 2)
        this.tone('sine', 300 * p, 220 * p, t, 0.03, 0.05 * vol)
        break
      case 'shutdown': // the screen going dark
        this.tone('square', 523, 523, t, 0.09, 0.05 * vol)
        this.tone('square', 330, 330, t + 0.1, 0.09, 0.05 * vol)
        this.tone('square', 196, 196, t + 0.2, 0.2, 0.05 * vol)
        break
      case 'creel': // a fish into the basket: a wet slap and the lid
        this.hiss(t, 0.09, 0.12 * vol, 'lowpass', 700, 300)
        this.tone('sine', 220, 140, t + 0.02, 0.09, 0.16 * vol)
        this.tone('triangle', 520, 420, t + 0.16, 0.05, 0.1 * vol)
        break
      case 'bigfish': // a big one landed: three rising notes and a shimmer
        this.tone('triangle', 523, 523, t, 0.14, 0.16 * vol)
        this.tone('triangle', 659, 659, t + 0.13, 0.14, 0.16 * vol)
        this.tone('triangle', 784, 784, t + 0.26, 0.3, 0.18 * vol)
        this.tone('sine', 1568, 1568, t + 0.3, 0.4, 0.07 * vol)
        break
      case 'plop': this.tone('sine', 300, 620, t, 0.07, 0.2 * vol); this.hiss(t, 0.1, 0.06 * vol, 'lowpass', 900, 400); break
      case 'bite':
        this.tone('sine', 880, 880, t, 0.07, 0.22 * vol)
        this.tone('sine', 1320, 1320, t + 0.09, 0.12, 0.22 * vol)
        this.hiss(t, 0.2, 0.14 * vol, 'lowpass', 1500, 400)
        break
      case 'reel': this.tone('square', 900 * p, 700 * p, t, 0.02, 0.04 * vol); break
      case 'strain': this.tone('sawtooth', 300 * p, 340 * p, t, 0.12, 0.04 * vol); break
      case 'snap':
        this.tone('sawtooth', 900, 120, t, 0.16, 0.2 * vol)
        this.hiss(t, 0.1, 0.14 * vol, 'highpass', 3000, 1500)
        break
      case 'bubble': this.tone('sine', 420 * r() * p, 900 * p, t, 0.07, 0.07 * vol); break
      case 'harpoon': this.hiss(t, 0.14, 0.2 * vol, 'bandpass', 2400, 500, 2); this.tone('sine', 220, 110, t, 0.1, 0.15 * vol); break
      case 'beep': this.tone('square', 1040, 1040, t, 0.08, 0.07 * vol); break
      case 'whoosh': this.hiss(t, 0.45, 0.2 * vol, 'bandpass', 400, 2600, 1.2); break
      case 'ring':
        this.hiss(t, 0.3, 0.14 * vol, 'bandpass', 800, 3600, 1.5)
        this.bell(midi(86), t + 0.02, 0.5, 0.12 * vol)
        break
      case 'gull':
        this.tone('sawtooth', 1500 * r(), 1100, t, 0.16, 0.035 * vol, this.rev)
        this.tone('sawtooth', 1700 * r(), 1150, t + 0.2, 0.2, 0.035 * vol, this.rev)
        break
      case 'alarm':
        for (let i = 0; i < 3; i++) {
          this.tone('square', 660, 660, t + i * 0.3, 0.13, 0.09 * vol)
          this.tone('square', 495, 495, t + i * 0.3 + 0.15, 0.13, 0.09 * vol)
        }
        break
      case 'cannon':
        this.tone('sine', 140, 36, t, 0.5, 0.6 * vol)
        this.hiss(t, 0.45, 0.4 * vol, 'lowpass', 1800, 150, 0.7)
        break
      case 'robbed':
        ;[76, 72, 67, 60].forEach((n, i) => this.tone('triangle', midi(n), midi(n), t + i * 0.11, 0.22, 0.14 * vol))
        this.hiss(t + 0.1, 0.5, 0.12 * vol, 'highpass', 3000, 1200)
        break
      case 'escape':
        this.hiss(t, 0.5, 0.18 * vol, 'bandpass', 500, 3200, 1.2)
        ;[72, 79, 84].forEach((n, i) => this.bell(midi(n), t + 0.12 + i * 0.08, 0.7, 0.13 * vol))
        break
      case 'boom':
        this.tone('sine', 120, 28, t, 1.1, 0.7 * vol)
        this.hiss(t, 1.2, 0.5 * vol, 'lowpass', 2400, 90, 0.7)
        break
      case 'rumble': this.tone('sine', 60, 40, t, 0.9, 0.3 * vol); this.hiss(t, 0.9, 0.2 * vol, 'lowpass', 300, 120); break
    }
  }

  // ───────────────────────────────────────────────────────────── loops that follow the game
  private startLoops() {
    const ctx = this.ctx!
    const noise = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource()
      s.buffer = this.noiseBuf
      s.loop = true
      s.start()
      return s
    }
    // propeller: a low buzz chopped by the blades
    const prop = ctx.createOscillator()
    prop.type = 'sawtooth'
    prop.frequency.value = 70
    const propF = ctx.createBiquadFilter()
    propF.type = 'lowpass'
    propF.frequency.value = 420
    const chop = ctx.createGain()
    chop.gain.value = 0.6
    const trem = ctx.createOscillator()
    trem.type = 'triangle'
    trem.frequency.value = 20
    const tremDepth = ctx.createGain()
    tremDepth.gain.value = 0.4
    trem.connect(tremDepth).connect(chop.gain)
    const propGain = ctx.createGain()
    propGain.gain.value = 0
    prop.connect(propF).connect(chop).connect(propGain).connect(this.sfx)
    prop.start()
    trem.start()
    // jet: a roar of filtered noise
    const jetF = ctx.createBiquadFilter()
    jetF.type = 'bandpass'
    jetF.frequency.value = 500
    jetF.Q.value = 0.6
    const jetGain = ctx.createGain()
    jetGain.gain.value = 0
    noise().connect(jetF).connect(jetGain).connect(this.sfx)
    // water along a hull, and wind past a wing
    const seaF = ctx.createBiquadFilter()
    seaF.type = 'lowpass'
    seaF.frequency.value = 700
    const seaGain = ctx.createGain()
    seaGain.gain.value = 0
    noise().connect(seaF).connect(seaGain).connect(this.sfx)
    const windF = ctx.createBiquadFilter()
    windF.type = 'bandpass'
    windF.frequency.value = 1100
    windF.Q.value = 0.5
    const windGain = ctx.createGain()
    windGain.gain.value = 0
    noise().connect(windF).connect(windGain).connect(this.sfx)
    this.eng = { prop, propGain, trem, jetF, jetGain, seaGain, windGain }
  }
  /** the vehicle's own sound: which kind it is, how fast it is going (0..1) and how hard it is boosting */
  setEngine(kind: 'plane' | 'jet' | 'boat' | null, speed: number, boost: number) {
    const e = this.eng
    if (!e || !this.ctx) return
    const t = this.ctx.currentTime
    const k = 0.12
    e.propGain.gain.setTargetAtTime(kind === 'plane' ? 0.05 + 0.05 * speed + 0.04 * boost : 0, t, k)
    e.prop.frequency.setTargetAtTime(58 + 34 * speed + 30 * boost, t, k)
    e.trem.frequency.setTargetAtTime(14 + 16 * speed + 10 * boost, t, k)
    e.jetGain.gain.setTargetAtTime(kind === 'jet' ? 0.06 + 0.08 * speed + 0.12 * boost : 0, t, k)
    e.jetF.frequency.setTargetAtTime(380 + 500 * speed + 900 * boost, t, k)
    e.seaGain.gain.setTargetAtTime(kind === 'boat' ? 0.04 + 0.1 * speed + 0.05 * boost : 0, t, 0.3)
    e.windGain.gain.setTargetAtTime(kind === 'plane' || kind === 'jet' ? 0.015 + 0.03 * speed + 0.04 * boost : 0, t, 0.3)
  }
  /** the furnace crackles while it is lit */
  setFurnace(on: boolean) {
    this.furnace = on
  }
  /**
   * The weather and the room, as sound: rain (outside, or on the roof and the window from
   * inside: lower and softer), the wind of a snowfall, a fire crackling in the hearth.
   */
  setAmbience(a: { rain: number; snow: number; indoor: boolean; fire: boolean; rest?: boolean }) {
    const ctx = this.ctx
    if (!ctx) return
    if (!this.amb) {
      const mk = (type: BiquadFilterType, f: number, q: number) => {
        const src = ctx.createBufferSource()
        src.buffer = this.noiseBuf
        src.loop = true
        src.playbackRate.value = 0.7 + Math.random() * 0.6
        const filt = ctx.createBiquadFilter()
        filt.type = type
        filt.frequency.value = f
        filt.Q.value = q
        const gain = ctx.createGain()
        gain.gain.value = 0
        src.connect(filt).connect(gain).connect(this.sfx)
        src.start()
        return { filt, gain }
      }
      const rain = mk('bandpass', 1800, 0.5)
      const roof = mk('lowpass', 500, 0.7) // the drumming on the roof, heard from inside
      const snow = mk('bandpass', 380, 0.9)
      // the snow's wind rises and falls
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.07
      const depth = ctx.createGain()
      depth.gain.value = 120
      lfo.connect(depth).connect(snow.filt.frequency)
      lfo.start()
      const hearth = mk('lowpass', 260, 0.6) // the low roar of a fire
      const pane = mk('highpass', 3600, 0.4) // rain ticking on the window glass
      this.amb = { rain, roof, snow, hearth, pane }
    }
    const t = ctx.currentTime
    const e = this.amb
    const r = Math.max(0, Math.min(1.5, a.rain))
    e.rain.gain.gain.setTargetAtTime(a.indoor ? r * 0.02 : r * 0.07, t, 1.2)
    e.rain.filt.frequency.setTargetAtTime(a.indoor ? 900 : 1800, t, 0.6)
    e.roof.gain.gain.setTargetAtTime(a.indoor ? r * 0.09 : 0, t, 1.2)
    e.snow.gain.gain.setTargetAtTime(a.snow * (a.indoor ? 0.03 : 0.06), t, 1.5)
    e.hearth.gain.gain.setTargetAtTime(a.fire ? (a.rest ? 0.07 : 0.05) : 0, t, 0.8)
    // indoors: the rain on the glass and dripping off the eaves; lying down, all of it a little nearer
    const near = a.rest ? 1.4 : 1
    e.roof.gain.gain.setTargetAtTime(a.indoor ? r * 0.09 * near : 0, t, 1.2)
    e.pane.gain.gain.setTargetAtTime(a.indoor ? r * 0.03 * near : 0, t, 1.5)
    this.hearthOn = a.fire
    this.dripRain = a.indoor ? r : 0
    // the music steps back a little while you rest, so the room is heard
    const duck = a.rest ? 0.62 : 1
    if (duck !== this.duck) { this.duck = duck; this.music.gain.setTargetAtTime(this.vol.music * duck, t, 2.5) }
  }
  private amb: Record<'rain' | 'roof' | 'snow' | 'hearth' | 'pane', { filt: BiquadFilterNode; gain: GainNode }> | null = null
  private dripRain = 0
  private duck = 1
  private hearthOn = false
  /**
   * Someone talking in the islands' own tongue: a blip for each syllable of what they say,
   * pitched for their voice and rising at a question — words you cannot make out, but a tone
   * you can.
   */
  babble(text: string, voice = 1) {
    const ctx = this.ctx
    if (!ctx || this.vol.sfx <= 0) return
    const t0 = ctx.currentTime + 0.02
    const chars = Array.from(text).filter((c) => !/[\s，。、！？…·：；,.!?:;—\-]/.test(c)).slice(0, 26)
    const ask = /[？?]\s*$/.test(text)
    let t = t0
    chars.forEach((c, i) => {
      const code = c.codePointAt(0) ?? 65
      const deg = [0, 2, 4, 5, 7, 9][code % 6]
      const rise = ask && i >= chars.length - 3 ? (i - chars.length + 4) * 3 : 0
      const f = 330 * voice * Math.pow(2, (deg + rise) / 12)
      const d = 0.055 + (code % 3) * 0.012
      // a vowel: two partials, a quick fall, like a syllable
      this.tone('triangle', f, f * 0.94, t, d, 0.08)
      this.tone('sine', f * 2.01, f * 1.9, t, d * 0.8, 0.03)
      t += d + 0.018
    })
  }
  /** rain on the island: a soft steady hiss of noise, faded in and out */
  setRain(on: boolean) {
    const ctx = this.ctx
    if (!ctx) return
    if (!this.rainGain) {
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuf
      src.loop = true
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 1800
      f.Q.value = 0.5
      this.rainGain = ctx.createGain()
      this.rainGain.gain.value = 0
      src.connect(f).connect(this.rainGain).connect(this.sfx)
      src.start()
    }
    if (this.rainOn === on) return
    this.rainOn = on
    this.rainGain.gain.setTargetAtTime(on ? 0.07 : 0, ctx.currentTime, 1.2)
  }
  private rainGain: GainNode | null = null
  private rainOn = false

  // ───────────────────────────────────────────────────────────── music
  /** move the music to another place; it gets there at the next bar (at once for pirates) */
  setScene(s: MusicScene) {
    if (s === this.scene && !this.pending) return
    if (s === this.scene) {
      this.pending = null
      return
    }
    this.pending = s
  }
  get currentScene(): MusicScene {
    return this.pending ?? this.scene
  }
  private setBed() {
    const ctx = this.ctx!
    const d = this.def
    if (!this.bed) {
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuf
      src.loop = true
      const filter = ctx.createBiquadFilter()
      const gain = ctx.createGain()
      gain.gain.value = 0
      // a slow swell, so the sea breathes
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.11
      const depth = ctx.createGain()
      depth.gain.value = 0.02
      lfo.connect(depth).connect(gain.gain)
      lfo.start()
      src.connect(filter).connect(gain).connect(this.music)
      src.start()
      this.bed = { src, filter, gain }
    }
    const t = ctx.currentTime
    const b = this.bed
    b.filter.type = d.noise === 'wind' ? 'bandpass' : 'lowpass'
    b.filter.frequency.setTargetAtTime(d.noise === 'sea' ? 520 : d.noise === 'wind' ? 900 : d.noise === 'cave' ? 180 : d.noise === 'room' ? 140 : 240, t, 0.8)
    b.gain.gain.setTargetAtTime(d.noiseVol, t, 1.2)
  }
  private freq(deg: number, oct: number) {
    const d = this.def
    const n = d.scale.length
    const o = Math.floor(deg / n)
    return midi(d.root + oct + d.scale[deg - o * n] + 12 * o)
  }
  /** a new tune: a few notes that mostly move by step and come to rest on the key note or its fifth */
  private newMotif() {
    const d = this.def
    const notes: Note[] = []
    const count = 3 + Math.round(d.density * 4 + Math.random() * 2)
    const grid = d.bpm > 90 ? 2 : 4 // sixteenths between possible notes
    let step = 0
    let deg = [0, 2, 4][(Math.random() * 3) | 0]
    for (let i = 0; i < count && step < 30; i++) {
      const len = grid * (Math.random() < 0.3 ? 2 : 1)
      notes.push({ step, deg, len })
      step += len + (Math.random() < 0.25 ? grid : 0)
      const leap = Math.random() < 0.22
      deg += (Math.random() < 0.5 ? -1 : 1) * (leap ? 2 + ((Math.random() * 2) | 0) : 1)
      deg = Math.max(-2, Math.min(d.scale.length + 3, deg))
    }
    const n = d.scale.length
    const last = notes[notes.length - 1]
    last.deg = Math.round(last.deg / n) * n + (Math.random() < 0.35 && n >= 5 ? (n === 5 ? 3 : 4) : 0) // home, or the fifth
    last.len = 8
    this.motif = notes
  }
  /** the motif again, but not the same: moved, turned round, cut short, or answered an octave up */
  private vary(): Note[] {
    const r = Math.random()
    const m = this.motif
    if (r < 0.3) return m
    if (r < 0.55) return m.map((x) => ({ ...x, deg: x.deg + (Math.random() < 0.5 ? 1 : -1) * 2 }))
    if (r < 0.7) {
      const top = Math.max(...m.map((x) => x.deg))
      return m.map((x, i) => (i === m.length - 1 ? x : { ...x, deg: top - (x.deg - m[0].deg) - (top - m[0].deg) + (top - m[0].deg) }))
    }
    if (r < 0.85) return m.slice(0, Math.max(2, m.length - 2))
    return m.map((x) => ({ ...x, deg: x.deg + this.def.scale.length }))
  }
  /** a single drop of water: a little falling 'plip' */
  private drip(t: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const f = 900 + Math.random() * 900
    o.type = 'sine'
    o.frequency.setValueAtTime(f, t)
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.07)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.035 * (0.5 + Math.random() * 0.5), t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    o.connect(g).connect(this.sfx)
    o.start(t)
    o.stop(t + 0.14)
  }
  private tick() {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    // the furnace's fire
    if (this.furnace && Math.random() < 0.5) this.play('crackle')
    // a hearth: crackles and the odd pop of a log
    if (this.hearthOn) {
      if (Math.random() < 0.6) this.play('crackle', 0.8 + Math.random() * 0.5, 0.7)
      if (Math.random() < 0.03) this.play('crackle', 0.5, 1.6)
    }
    // drops off the eaves, now and then, when it rains outside
    if (this.dripRain > 0.15 && Math.random() < 0.1 * this.dripRain) this.drip(ctx.currentTime + Math.random() * 0.2)
    while (this.nextT < ctx.currentTime + 0.25) {
      this.schedule(this.step, this.nextT)
      this.nextT += 60 / this.def.bpm / 4
      this.step++
    }
  }
  private schedule(step: number, t: number) {
    const ctx = this.ctx!
    const bar = Math.floor(step / 16)
    const s = step % 16
    // a change of scene lands on a bar line; trouble does not wait that long
    if (this.pending && (s === 0 || (this.pending === 'pirate' && s % 4 === 0))) {
      this.scene = this.pending
      this.def = SCENES[this.scene]
      this.pending = null
      this.step = step = Math.ceil(step / 16) * 16
      for (const g of this.pads) g.gain.setTargetAtTime(0, t, 0.5)
      this.pads = []
      this.setBed()
      this.newMotif()
      this.phraseN = 0
      this.phrase = this.motif
      this.padChord(0, t)
      this.melody(0, t)
      return
    }
    const d = this.def
    const chordI = Math.floor(bar / 2) % d.chords.length
    if (s === 0 && bar % 2 === 0) this.padChord(chordI, t)
    // a phrase is two bars; then, more often than not, two bars of nothing but the chord
    if (s === 0 && bar % 2 === 0) {
      this.phraseN++
      if (this.phraseN % 8 === 0) this.newMotif()
      this.phrase = Math.random() < d.rest && this.phraseN > 1 ? [] : this.vary()
    }
    this.melody(step % 32, t)
    const [croot, quality] = d.chords[chordI]
    if (d.arp > 0 && s % 2 === 0) {
      const tones = [0, quality === 'min' ? 3 : quality === 'sus' ? 5 : 4, 7, 12]
      const n = d.root + croot + tones[(s / 2) % 4] + (bar % 2 === 1 && s >= 8 ? 12 : 0)
      const g = this.tone('sine', midi(n), midi(n), t, 0.5, 0.05 * d.arp, this.music, 0.01)
      g.connect(this.echo)
    }
    if (d.pulse > 0 && s % 2 === 0) {
      const n = d.root + croot - 24 + (s % 8 === 6 ? 7 : 0)
      this.tone('sawtooth', midi(n), midi(n), t, 0.16, 0.16 * d.pulse, this.music, 0.005)
      if (s % 4 === 0) this.tone('sine', 110, 52, t, 0.16, 0.3 * d.pulse, this.music)
      if (s % 8 === 4) this.hiss(t, 0.05, 0.1 * d.pulse, 'highpass', 5000, 5000, 0.7, this.music)
    }
  }
  private melody(pos: number, t: number) {
    const d = this.def
    for (const n of this.phrase) {
      if (n.step !== pos) continue
      const f = this.freq(n.deg, d.melOct)
      const dur = 1.2 + n.len * 0.22
      const v = d.melVol * 0.22 * (0.8 + Math.random() * 0.3)
      // a soft struck tone: mostly a sine, a little of the octave for the attack
      const g = this.tone('sine', f, f, t, dur, v, this.music, 0.008)
      g.connect(this.echo)
      g.connect(this.rev)
      this.tone('triangle', f * 2, f * 2, t, dur * 0.35, v * 0.22, this.music, 0.004)
    }
  }
  private padChord(i: number, t: number) {
    const ctx = this.ctx!
    const d = this.def
    const [croot, quality] = d.chords[i]
    const third = quality === 'min' ? 3 : quality === 'sus' ? 5 : 4
    const notes = [d.root + croot - 12, d.root + croot - 12 + 7, d.root + croot + third, d.root + croot + 14]
    const barLen = (60 / d.bpm) * 4
    const hold = barLen * 2
    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, t)
    out.gain.linearRampToValueAtTime(d.padVol, t + Math.min(2.5, hold * 0.4))
    out.gain.setValueAtTime(d.padVol, t + hold * 0.8)
    out.gain.linearRampToValueAtTime(0.0001, t + hold + 2.5)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = d.padCut
    f.connect(out)
    out.connect(this.music)
    out.connect(this.rev)
    for (const n of notes) {
      for (const det of [-5, 6]) {
        const o = ctx.createOscillator()
        o.type = d.padType
        o.frequency.value = midi(n)
        o.detune.value = det
        const g = ctx.createGain()
        g.gain.value = d.padType === 'sawtooth' ? 0.1 : 0.22
        o.connect(g).connect(f)
        o.start(t)
        o.stop(t + hold + 2.7)
      }
    }
    this.pads.push(out)
    if (this.pads.length > 3) this.pads.shift()
    if (d.bassVol > 0) {
      const b = midi(d.root + croot - 24)
      this.tone('sine', b, b, t, hold * 0.9, d.bassVol * 0.5, this.music, 0.06)
    }
  }
}
