/** Sygnał dźwiękowy gola (WebAudio, bez plików). Przeglądarka może zablokować dźwięk bez gestu — wtedy cicho pomijamy. */
const KEY = 'varify_sound';
let ctx: AudioContext | null = null;

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

export function playGoalSound(): void {
  if (!isSoundEnabled()) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    [660, 880, 1100].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.14 + 0.2);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t0 + i * 0.14);
      osc.stop(t0 + i * 0.14 + 0.22);
    });
  } catch {
    /* brak dźwięku nie może psuć UI */
  }
}
