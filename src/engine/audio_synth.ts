export class SimulationAudioEngine {
  private static instance: SimulationAudioEngine | null = null;
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.5;
  private muted: boolean = false;
  private lastSoundTime: number = 0;
  private soundCountInWindow: number = 0;
  private readonly maxSoundsPerSec: number = 3;

  private constructor() {}

  public static getInstance(): SimulationAudioEngine {
    if (!SimulationAudioEngine.instance) {
      SimulationAudioEngine.instance = new SimulationAudioEngine();
    }
    return SimulationAudioEngine.instance;
  }

  /**
   * Lazy initialization of AudioContext on user interaction.
   */
  public initAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.audioCtx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.setValueAtTime(
          this.muted ? 0 : this.volume,
          this.audioCtx.currentTime
        );
        this.masterGain.connect(this.audioCtx.destination);
      }
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {
        // Ignore user interaction policy error if not yet clicked
      });
    }

    return this.audioCtx;
  }

  public setVolume(level: number): void {
    this.volume = Math.max(0, Math.min(1, level));
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(
        this.muted ? 0 : this.volume,
        this.audioCtx.currentTime
      );
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public toggleMute(isMuted?: boolean): void {
    this.muted = isMuted !== undefined ? isMuted : !this.muted;
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(
        this.muted ? 0 : this.volume,
        this.audioCtx.currentTime
      );
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  /**
   * Throttle check: allow max 3 sounds per second to prevent audio clipping.
   */
  private canPlaySound(): boolean {
    if (this.muted || this.volume <= 0) return false;

    const ctx = this.initAudioContext();
    if (!ctx) return false;

    const now = ctx.currentTime;
    if (now - this.lastSoundTime >= 1.0) {
      this.lastSoundTime = now;
      this.soundCountInWindow = 0;
    }

    if (this.soundCountInWindow >= this.maxSoundsPerSec) {
      return false;
    }

    this.soundCountInWindow++;
    return true;
  }

  /**
   * 1. playChargeStart: soft ascending two-tone bell (440 Hz -> 880 Hz, 0.2 s).
   */
  public playChargeStart(): void {
    if (!this.canPlaySound() || !this.audioCtx || !this.masterGain) return;

    const now = this.audioCtx.currentTime;

    const osc1 = this.audioCtx.createOscillator();
    const osc2 = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(440, now);
    osc2.frequency.setValueAtTime(880, now + 0.1);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc1.stop(now + 0.1);

    osc2.start(now + 0.1);
    osc2.stop(now + 0.2);
  }

  /**
   * 2. playChargeEnd: short futuristic readiness click (0.1 s).
   */
  public playChargeEnd(): void {
    if (!this.canPlaySound() || !this.audioCtx || !this.masterGain) return;

    const now = this.audioCtx.currentTime;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * 3. playBoxPick: soft magnetic latch click (300 Hz, fast decay).
   */
  public playBoxPick(): void {
    if (!this.canPlaySound() || !this.audioCtx || !this.masterGain) return;

    const now = this.audioCtx.currentTime;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  /**
   * 4. playBoxDrop: dull soft pallet placement sound (150 Hz -> 80 Hz, 0.15 s).
   */
  public playBoxDrop(): void {
    if (!this.canPlaySound() || !this.audioCtx || !this.masterGain) return;

    const now = this.audioCtx.currentTime;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * 5. playBrake: short delicate braking sweep.
   */
  public playBrake(): void {
    if (!this.canPlaySound() || !this.audioCtx || !this.masterGain) return;

    const now = this.audioCtx.currentTime;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(200, now + 0.12);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.12);
  }
}

export const audioEngine = SimulationAudioEngine.getInstance();
