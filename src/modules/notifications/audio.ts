'use client';

let unlockInstalled = false;
let audioUnlocked = false;
let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioContext ??= new Ctor();
  return audioContext;
}

async function unlockAudio() {
  if (audioUnlocked) return;

  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }

    const audio = new Audio();
    audio.muted = true;
    audio.volume = 0;
    audio.src = '/notification-message.mp3';
    await audio.play().catch(() => undefined);
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // ignore
  } finally {
    audioUnlocked = true;
  }
}

export function initNotificationAudioUnlock() {
  if (typeof window === 'undefined' || unlockInstalled) return;
  unlockInstalled = true;

  const handler = () => {
    void unlockAudio().finally(() => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    });
  };

  window.addEventListener('pointerdown', handler, { once: true, passive: true });
  window.addEventListener('keydown', handler, { once: true });
  window.addEventListener('touchstart', handler, { once: true, passive: true });
}

export async function playNotificationSound(file: string) {
  try {
    const audio = new Audio(`/${file}?${Date.now()}`);
    audio.volume = 0.5;
    await audio.play();
    return true;
  } catch {
    try {
      const ctx = getAudioContext();
      if (!ctx) return false;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      gain.gain.value = 0.15;
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.setValueAtTime(1000, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
      return true;
    } catch {
      return false;
    }
  }
}
