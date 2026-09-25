/**
 * Short oscillator beep for timer completions (pomodoro, global countdowns).
 * Each call creates its own AudioContext and closes it on end — browsers cap
 * concurrent AudioContexts (~6 in Chrome), so a leaked one per beep eventually
 * makes new AudioContext() throw forever.
 */
export function playBeep(frequency = 880, durationSec = 0.5, volume = 0.25): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = frequency
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec)
    osc.start()
    osc.stop(ctx.currentTime + durationSec)
    osc.onended = () => { ctx.close().catch(() => {}) }
  } catch {
    // AudioContext unavailable — ignore.
  }
}
