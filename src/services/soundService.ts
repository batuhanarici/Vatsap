/**
 * Native Web Audio API Chime & Notification Service
 * Plays pleasant synthesized audio cues without requiring external sound files.
 */
class SoundService {
  private audioCtx: AudioContext | null = null;

  private getAudioContext(): AudioContext | null {
    try {
      if (!this.audioCtx) {
        const AudioContextClass =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /**
   * Plays a pleasant dual-tone chime (e.g. for scheduled send start or completion)
   */
  playChime(type: 'schedule_start' | 'success' | 'alert' = 'schedule_start') {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      if (type === 'schedule_start') {
        // High, bright ascending chime (G5 -> C6)
        osc1.frequency.setValueAtTime(783.99, now);
        osc1.frequency.exponentialRampToValueAtTime(1046.5, now + 0.18);
        osc2.frequency.setValueAtTime(392.0, now);
      } else if (type === 'success') {
        // Joyful success chord
        osc1.frequency.setValueAtTime(523.25, now); // C5
        osc1.frequency.setValueAtTime(659.25, now + 0.1); // E5
        osc1.frequency.setValueAtTime(783.99, now + 0.2); // G5
      } else {
        // Alert tone
        osc1.frequency.setValueAtTime(440, now);
        osc1.frequency.setValueAtTime(330, now + 0.15);
      }

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.65);
      osc2.stop(now + 0.65);
    } catch {
      // Audio not supported or blocked by autoplay policy
    }
  }

  /**
   * Request browser desktop notification permission if supported
   */
  async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  /**
   * Sends desktop notification
   */
  sendNotification(title: string, body: string) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
        });
      } catch {
        // Fallback
      }
    }
  }
}

export const soundService = new SoundService();
