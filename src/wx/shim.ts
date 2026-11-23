// The few browser things the game's own code reaches for, given to it on WeChat (round 25).
// Imported first, before anything of the game, so they are there when the modules load.
const G = globalThis as any
const wx = G.wx

if (!G.window) G.window = G
if (!G.localStorage) {
  // wx storage: a missing key reads as ''; the game expects null
  G.localStorage = {
    getItem: (k: string) => { try { const v = wx.getStorageSync(k); return v === '' || v === undefined ? null : String(v) } catch { return null } },
    setItem: (k: string, v: string) => { try { wx.setStorageSync(k, String(v)) } catch { /* full: the game plays on */ } },
    removeItem: (k: string) => { try { wx.removeStorageSync(k) } catch { /* nothing to remove */ } },
  }
}
if (!G.navigator) G.navigator = {}
if (!G.navigator.language) {
  let lang = 'zh-CN'
  try { lang = String(wx.getSystemInfoSync().language || 'zh_CN').replace('_', '-') } catch { /* keep Chinese */ }
  G.navigator.language = lang
}
if (!G.performance) G.performance = { now: () => Date.now() }
if (!G.document) G.document = { hidden: false, createElement: () => wx.createCanvas() }

// sound: WeChat's own WebAudio (base library 2.19.0 and up, still marked beta). It is not quite the
// browser's: connect() may not hand back the node it connected to (the engine chains a.connect(b).connect(c)),
// and an AudioParam may lack some of the scheduling calls. Every node it makes is mended on the way out.
function mendParam(p: any) {
  if (!p || typeof p !== 'object' || p.__mended) return
  p.__mended = true
  const set = (v: number, t: number) => { try { if (p.setValueAtTime) p.setValueAtTime(v, t); else p.value = v } catch { try { p.value = v } catch { /* */ } } }
  if (!p.setValueAtTime) p.setValueAtTime = (v: number) => { p.value = v; return p }
  if (!p.linearRampToValueAtTime) p.linearRampToValueAtTime = (v: number, t: number) => { set(v, t); return p }
  if (!p.exponentialRampToValueAtTime) p.exponentialRampToValueAtTime = (v: number, t: number) => { p.linearRampToValueAtTime(v, t); return p }
  // setTargetAtTime: approach the value with time constant k (as a ramp over three of them)
  if (!p.setTargetAtTime) p.setTargetAtTime = (v: number, t: number, k: number) => { p.linearRampToValueAtTime(v, t + k * 3); return p }
  if (!p.cancelScheduledValues) p.cancelScheduledValues = () => p
}
function mendNode(n: any) {
  if (!n || typeof n !== 'object' || n.__mended) return n
  n.__mended = true
  const connect = n.connect
  if (typeof connect === 'function') n.connect = function (dest: any, ...rest: unknown[]) { connect.call(n, dest, ...rest); return dest }
  for (const k of ['frequency', 'detune', 'gain', 'Q', 'delayTime', 'threshold', 'ratio', 'knee', 'attack', 'release', 'playbackRate', 'offset', 'pan']) {
    try { mendParam(n[k]) } catch { /* not this node's */ }
  }
  return n
}
// the phone's mute switch should not silence the game (as other games on WeChat)
try { wx.setInnerAudioOption?.({ obeyMuteSwitch: false, mixWithOther: true }) } catch { /* */ }
if (!G.AudioContext && wx.createWebAudioContext) {
  G.AudioContext = function () {
    const ctx = wx.createWebAudioContext()
    for (const k of ['createGain', 'createOscillator', 'createBufferSource', 'createBiquadFilter', 'createDelay', 'createDynamicsCompressor', 'createAnalyser', 'createConvolver', 'createWaveShaper', 'createPanner', 'createStereoPanner', 'createConstantSource']) {
      const make = ctx[k]
      if (typeof make !== 'function') { ctx[k] = undefined; continue }
      ctx[k] = (...args: unknown[]) => mendNode(make.apply(ctx, args))
    }
    try { mendNode(ctx.destination) } catch { /* */ }
    try { ctx.resume?.() } catch { /* */ }
    return ctx
  }
}
// the language switch reloads the page on the web: here the mini game starts again
if (!G.location) G.location = { reload: () => { try { wx.restartMiniProgram?.({}) } catch { /* */ } }, search: '', href: '' }

export {}
