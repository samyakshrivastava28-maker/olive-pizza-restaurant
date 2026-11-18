/**
 * SoundAlertEngine.ts
 *
 * Centralized, production-grade audio and alarm system for Olive Pizza Restaurant Manager.
 *
 * Capabilities:
 * - Pure Web Audio API tone synthesis + HTML5 Audio fallback for public/sounds/.
 * - Browser Autoplay policy compliance with user gesture auto-unlock.
 * - Continuous looping alarm for new unaccepted orders ('pending').
 * - Automatic alarm cessation when order is accepted, rejected, or dismissed.
 * - Distinct single celebratory chime when an order is marked 'delivered'.
 * - Volume control, mute, per-feature alert toggles, and vibration support.
 * - Android Native Notification channel configuration with IMPORTANCE_HIGH (5).
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

export type SoundType =
  | 'new_order'        // Urgent 4-tone continuous alarm for kitchen
  | 'delivery_urgent'  // High-tempo double chime for delivery dispatch
  | 'order_accepted'   // Warm 2-tone confirmation
  | 'order_ready'      // Bright kitchen bell
  | 'order_cancelled'  // Deep warning tone
  | 'order_delivered'  // Triple celebratory chime
  | 'prep_timer_ended' // Kitchen prep timer finish bell
  | 'status_changed'   // Order status progression chime
  | 'soft_pop'         // Gentle informational update
  | 'test';            // Audio test tone

export interface SoundOption {
  id: string;
  name: string;
  description: string;
  file: string;
}

export const ALERT_SOUND_OPTIONS: SoundOption[] = [
  { id: 'olive_dispatch', name: 'Royal Grand Crystal Chime', description: 'Majestic 3-tier crystal bell chime with rich acoustic resonance (Default)', file: '/sounds/new_order.mp3' },
  { id: 'kitchen_bell', name: 'Executive Brass Service Bell', description: 'Ultra-crisp counter ding with metallic overtone shimmer', file: '/sounds/success_ding.mp3' },
  { id: 'commercial_siren', name: 'Commercial Kitchen Siren', description: 'High-urgency penetrating alert siren for busy kitchen environments', file: '/sounds/order_alert.mp3' },
  { id: 'wooden_marimba', name: 'Acoustic Wooden Marimba', description: 'Warm organic wooden chord strike with smooth natural decay', file: '/sounds/order_confirmed.mp3' },
  { id: 'cyber_pulse', name: 'Modern Shimmer Chime', description: 'Contemporary luxury pulse with cascading high-frequency shimmer', file: '/sounds/delivery_chime.mp3' },
];

export const DEFAULT_ALERT_SOUND_ID = 'olive_dispatch';

export interface SoundSettings {
  muted: boolean;
  volume: number; // 0.0 to 1.0
  newOrderAlarm: boolean; // Continuous alarm for unaccepted pending orders
  deliveryCompletedChime: boolean; // Single chime on delivered
  vibration: boolean; // Device vibration if supported
  selectedSoundId: string;
}

const SETTINGS_KEY = 'olive_sound_settings_v1';

const DEFAULT_SETTINGS: SoundSettings = {
  muted: false,
  volume: 0.85,
  newOrderAlarm: true,
  deliveryCompletedChime: true,
  vibration: true,
  selectedSoundId: DEFAULT_ALERT_SOUND_ID,
};

export class SoundAlertEngine {
  private static audioCtx: AudioContext | null = null;
  private static continuousInterval: any = null;
  private static isAlarmActive = false;
  private static currentAlarmType: SoundType | null = null;
  private static currentAudioElement: HTMLAudioElement | null = null;
  private static settingsListeners: Set<(settings: SoundSettings) => void> = new Set();
  private static isUnlocked = false;

  /**
   * Retrieve saved audio settings with safe defaults.
   */
  static getSettings(): SoundSettings {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          // Ensure volume stays bounded
          volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULT_SETTINGS.volume,
          selectedSoundId: parsed.selectedSoundId || DEFAULT_ALERT_SOUND_ID,
        };
      }
    } catch {}
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Persist sound settings to localStorage and notify all subscribers.
   */
  static saveSettings(settings: Partial<SoundSettings>): void {
    try {
      const current = this.getSettings();
      const updated: SoundSettings = { ...current, ...settings };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      this.notifySettingsChanged(updated);

      // If user muted or disabled newOrderAlarm while alarming, silence it immediately
      if (this.isAlarmActive && (updated.muted || !updated.newOrderAlarm)) {
        this.stopAlarm();
      }
    } catch {}
  }

  /**
   * Subscribe to sound settings changes.
   */
  static subscribeSettings(listener: (settings: SoundSettings) => void): () => void {
    this.settingsListeners.add(listener);
    listener(this.getSettings());
    return () => {
      this.settingsListeners.delete(listener);
    };
  }

  private static notifySettingsChanged(settings: SoundSettings): void {
    for (const listener of this.settingsListeners) {
      try {
        listener(settings);
      } catch {}
    }
  }

  /**
   * Lazily initialize or retrieve the shared Web Audio API context with Master Compressor.
   */
  private static masterCompressor: DynamicsCompressorNode | null = null;

  static getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      // Create master studio compressor for loud, punchy, distortion-free audio
      if (!this.masterCompressor) {
        try {
          const comp = this.audioCtx.createDynamicsCompressor();
          comp.threshold.setValueAtTime(-12, this.audioCtx.currentTime);
          comp.knee.setValueAtTime(24, this.audioCtx.currentTime);
          comp.ratio.setValueAtTime(12, this.audioCtx.currentTime);
          comp.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
          comp.release.setValueAtTime(0.25, this.audioCtx.currentTime);
          comp.connect(this.audioCtx.destination);
          this.masterCompressor = comp;
        } catch {
          this.masterCompressor = null;
        }
      }
    }
    return this.audioCtx!;
  }

  private static getMasterDestination(): AudioNode {
    const ctx = this.getAudioContext();
    return this.masterCompressor || ctx.destination;
  }

  /**
   * Unlocks Web Audio API context upon first user gesture.
   * Plays a 1-sample silent buffer to unlock audio processing on iOS Safari & Chrome WebViews.
   */
  static unlockAudio(): void {
    try {
      const ctx = this.getAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        if (!this.isUnlocked) {
          const buffer = ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
          this.isUnlocked = true;
        }
      }
    } catch {}
  }

  /**
   * Trigger hardware vibration if enabled in settings and supported by the device.
   */
  static triggerVibration(pattern: number[] = [300, 150, 300]): void {
    const settings = this.getSettings();
    if (!settings.vibration) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  /**
   * High-definition multi-harmonic acoustic tone generator.
   * Produces rich studio-grade bell, chime, and acoustic instrument harmonics.
   */
  private static playHarmonicTone(
    freq: number,
    durationSec: number,
    waveType: OscillatorType = 'sine',
    volMultiplier = 0.95,
    delaySec = 0,
    decayType: 'exponential' | 'bell' = 'exponential'
  ): void {
    const settings = this.getSettings();
    if (settings.muted) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const dest = this.getMasterDestination();
      const now = ctx.currentTime + delaySec;

      // Primary Fundamental Oscillator
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = waveType;
      osc1.frequency.setValueAtTime(freq, now);

      // 2nd Harmonic Shimmer Oscillator (detuned octave for acoustic warmth)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2.003, now);

      // 3rd Harmonic Metallic overtone
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(freq * 3.006, now);

      const targetVol = Math.max(0.01, Math.min(1.2, settings.volume * volMultiplier));

      // Fast percussive attack (4ms) to avoid clicking, followed by acoustic decay
      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.linearRampToValueAtTime(targetVol, now + 0.006);

      gain2.gain.setValueAtTime(0.0001, now);
      gain2.gain.linearRampToValueAtTime(targetVol * 0.4, now + 0.006);

      gain3.gain.setValueAtTime(0.0001, now);
      gain3.gain.linearRampToValueAtTime(targetVol * 0.18, now + 0.006);

      if (decayType === 'bell') {
        gain1.gain.exponentialRampToValueAtTime(targetVol * 0.35, now + durationSec * 0.3);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + durationSec * 0.65);
        gain3.gain.exponentialRampToValueAtTime(0.0001, now + durationSec * 0.45);
      } else {
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + durationSec * 0.8);
        gain3.gain.exponentialRampToValueAtTime(0.0001, now + durationSec * 0.5);
      }

      osc1.connect(gain1);
      gain1.connect(dest);
      osc2.connect(gain2);
      gain2.connect(dest);
      osc3.connect(gain3);
      gain3.connect(dest);

      osc1.start(now);
      osc1.stop(now + durationSec + 0.05);
      osc2.start(now);
      osc2.stop(now + durationSec + 0.05);
      osc3.start(now);
      osc3.stop(now + durationSec + 0.05);
    } catch (err) {
      console.warn('[SoundAlertEngine] Harmonic tone synthesis error:', err);
    }
  }

  /**
   * Sound Preset 1: Royal Grand Crystal Chime (Default)
   * Majestic multi-tier acoustic crystal chime with rich decaying overtone
   */
  static playRoyalChime(): void {
    this.playHarmonicTone(740, 0.4, 'sine', 0.9, 0, 'bell');       // F#5
    this.playHarmonicTone(932, 0.4, 'sine', 0.95, 0.12, 'bell');   // A#5
    this.playHarmonicTone(1109, 0.65, 'sine', 1.0, 0.24, 'bell');  // C#6
    this.playHarmonicTone(1480, 0.85, 'sine', 0.85, 0.38, 'bell'); // F#6
  }

  /**
   * Sound Preset 2: Executive Brass Service Bell
   * Ultra-crisp brass service counter bell with 1.6s ringing shimmer
   */
  static playBrassBell(): void {
    this.playHarmonicTone(1200, 1.4, 'sine', 1.1, 0, 'bell');
    this.playHarmonicTone(2400, 0.8, 'sine', 0.5, 0, 'bell');
    this.playHarmonicTone(3600, 0.4, 'sine', 0.25, 0, 'bell');
  }

  /**
   * Sound Preset 3: Commercial Kitchen Siren
   * High-urgency penetrating alert siren designed to cut through loud kitchen hoods and pizza ovens
   */
  static playKitchenSiren(): void {
    this.playHarmonicTone(880, 0.22, 'triangle', 1.05, 0);
    this.playHarmonicTone(1174, 0.22, 'triangle', 1.1, 0.14);
    this.playHarmonicTone(880, 0.22, 'triangle', 1.05, 0.28);
    this.playHarmonicTone(1174, 0.35, 'triangle', 1.15, 0.42);
  }

  /**
   * Sound Preset 4: Acoustic Wooden Marimba
   * Warm organic marimba strike with smooth natural acoustic decay
   */
  static playWoodenMarimba(): void {
    this.playHarmonicTone(523, 0.35, 'sine', 0.9, 0);       // C5
    this.playHarmonicTone(659, 0.35, 'sine', 0.92, 0.08);   // E5
    this.playHarmonicTone(784, 0.4, 'sine', 0.95, 0.16);    // G5
    this.playHarmonicTone(1046, 0.55, 'sine', 1.0, 0.24);   // C6
  }

  /**
   * Sound Preset 5: Modern Shimmer Chime
   * Contemporary luxury pulse with cascading high-frequency shimmer
   */
  static playModernPulse(): void {
    this.playHarmonicTone(1046, 0.3, 'sine', 0.95, 0, 'bell');     // C6
    this.playHarmonicTone(1318, 0.35, 'sine', 1.0, 0.1, 'bell');   // E6
    this.playHarmonicTone(1568, 0.45, 'sine', 1.05, 0.2, 'bell');  // G6
    this.playHarmonicTone(2093, 0.6, 'sine', 0.9, 0.3, 'bell');    // C7
  }

  /**
   * Play option preview when clicked in the Sound Settings dialog
   */
  static playOptionPreview(optionId: string): void {
    this.unlockAudio();
    switch (optionId) {
      case 'kitchen_bell':
        this.playBrassBell();
        break;
      case 'commercial_siren':
        this.playKitchenSiren();
        break;
      case 'wooden_marimba':
        this.playWoodenMarimba();
        break;
      case 'cyber_pulse':
        this.playModernPulse();
        break;
      case 'olive_dispatch':
      default:
        this.playRoyalChime();
        break;
    }
  }

  /**
   * Try playing custom audio from list of candidate paths.
   * Resolves if playback started successfully, throws error if all files fail or are blocked.
   */
  private static async playCustomAudio(filePaths: string[]): Promise<void> {
    const settings = this.getSettings();
    if (settings.muted) return;

    for (const path of filePaths) {
      try {
        const audio = new Audio(path);
        audio.preload = 'auto';
        audio.volume = Math.max(0.05, Math.min(1, settings.volume));
        this.currentAudioElement = audio;
        await audio.play();
        return; // Success!
      } catch {
        continue;
      }
    }
    throw new Error('All custom audio files failed to play');
  }

  /**
   * Synthesize high-definition musical frequency tones using Web Audio API.
   */
  private static playSynthesizedTone(type: SoundType): void {
    const settings = this.getSettings();
    switch (type) {
      case 'new_order':
      case 'test':
        this.playOptionPreview(settings.selectedSoundId);
        break;

      case 'delivery_urgent':
        this.playHarmonicTone(987, 0.22, 'sine', 1.0, 0);
        this.playHarmonicTone(1318, 0.35, 'sine', 1.05, 0.12);
        break;

      case 'order_accepted':
        this.playHarmonicTone(659, 0.22, 'sine', 0.85, 0);
        this.playHarmonicTone(880, 0.35, 'sine', 0.9, 0.14);
        break;

      case 'order_ready':
        this.playHarmonicTone(1046, 0.45, 'sine', 1.0, 0, 'bell');
        break;

      case 'order_cancelled':
        this.playHarmonicTone(440, 0.25, 'triangle', 0.9, 0);
        this.playHarmonicTone(330, 0.45, 'sine', 0.95, 0.18);
        break;

      case 'order_delivered':
        // Celebratory melodic 3-tone chime: G5 -> B5 -> D6
        this.playHarmonicTone(784, 0.2, 'sine', 0.9, 0, 'bell');
        this.playHarmonicTone(987, 0.2, 'sine', 0.95, 0.12, 'bell');
        this.playHarmonicTone(1174, 0.45, 'sine', 1.05, 0.24, 'bell');
        break;

      case 'prep_timer_ended':
        // Rhythmic kitchen timer completion alarm: E5 -> G#5 -> B5 (bright E Major arpeggio)
        this.playHarmonicTone(659, 0.25, 'sine', 1.0, 0, 'bell');
        this.playHarmonicTone(830, 0.25, 'sine', 1.0, 0.12, 'bell');
        this.playHarmonicTone(987, 0.6, 'sine', 1.1, 0.24, 'bell');
        break;

      case 'status_changed':
        // Crisp professional micro-chime: C6 -> E6
        this.playHarmonicTone(1046, 0.18, 'sine', 0.85, 0, 'bell');
        this.playHarmonicTone(1318, 0.3, 'sine', 0.9, 0.1, 'bell');
        break;

      case 'soft_pop':
        this.playHarmonicTone(880, 0.12, 'sine', 0.6, 0);
        break;
    }
  }

  private static triggerVibrationForType(type: SoundType): void {
    switch (type) {
      case 'new_order':
        this.triggerVibration([300, 200, 300, 200, 400]);
        break;
      case 'delivery_urgent':
        this.triggerVibration([200, 100, 200]);
        break;
      case 'order_accepted':
        this.triggerVibration([100]);
        break;
      case 'order_ready':
        this.triggerVibration([150]);
        break;
      case 'order_cancelled':
        this.triggerVibration([200, 100, 200]);
        break;
      case 'order_delivered':
        this.triggerVibration([150, 100, 150]);
        break;
      case 'prep_timer_ended':
        this.triggerVibration([250, 100, 250, 100, 400]);
        break;
      case 'status_changed':
        this.triggerVibration([80]);
        break;
      case 'test':
        this.triggerVibration([150, 100, 150]);
        break;
    }
  }

  /**
   * Play a one-shot notification chime or alert tone.
   * Tries custom audio first. ONLY falls back to synthesized tone if custom fails with an error.
   * Never plays both simultaneously.
   */
  static async playSound(type: SoundType): Promise<void> {
    this.unlockAudio();
    const settings = this.getSettings();
    if (settings.muted) return;

    if (type === 'new_order' && !settings.newOrderAlarm) return;
    if (type === 'order_delivered' && !settings.deliveryCompletedChime) return;

    this.triggerVibrationForType(type);

    const selectedOption = ALERT_SOUND_OPTIONS.find(o => o.id === settings.selectedSoundId) || ALERT_SOUND_OPTIONS[0];

    const soundFilesMap: Record<SoundType, string[]> = {
      new_order: ['/sounds/new_order.wav', '/sounds/order_alert.wav', selectedOption.file, '/sounds/new_order.mp3'],
      delivery_urgent: ['/sounds/delivery_chime.wav', '/sounds/delivery_chime.mp3', '/sounds/system_alert.mp3'],
      order_accepted: ['/sounds/order_confirmed.wav', '/sounds/order_confirmed.mp3', '/sounds/success_ding.wav'],
      order_ready: ['/sounds/success_ding.wav', '/sounds/success_ding.mp3', '/sounds/delivery_chime.wav'],
      order_cancelled: ['/sounds/cancel_buzz.wav', '/sounds/cancel_buzz.mp3'],
      order_delivered: ['/sounds/order_delivered.wav', '/sounds/order_delivered.mp3', '/sounds/delivery_completed.wav', '/sounds/delivery_completed.mp3'],
      prep_timer_ended: ['/sounds/prep_timer_ended.wav', '/sounds/prep_timer_ended.mp3', '/sounds/success_ding.wav'],
      status_changed: ['/sounds/status_changed.wav', '/sounds/status_changed.mp3', '/sounds/delivery_chime.wav'],
      soft_pop: ['/sounds/soft_pop.wav', '/sounds/soft_pop.mp3'],
      test: ['/sounds/new_order.wav', '/sounds/order_alert.wav', selectedOption.file, '/sounds/new_order.mp3']
    };

    const files = soundFilesMap[type] || [];
    try {
      await this.playCustomAudio(files);
      return; // Success - don't play synth
    } catch (err) {
      console.warn(`[Sound] Custom audio failed for ${type}:`, err);
      this.playSynthesizedTone(type); // Fallback only
    }
  }

  /**
   * Preview a specific sound file or preset option without altering persistent settings.
   */
  static previewSoundFile(fileUrl: string, optionId?: string): void {
    try {
      this.unlockAudio();
      if (optionId) {
        this.playOptionPreview(optionId);
        return;
      }
      const matched = ALERT_SOUND_OPTIONS.find(o => o.file === fileUrl);
      if (matched) {
        this.playOptionPreview(matched.id);
        return;
      }
      const settings = this.getSettings();
      const audio = new Audio(fileUrl);
      audio.volume = settings.muted ? 0 : settings.volume;
      audio.play().catch(() => {
        this.playRoyalChime();
      });
    } catch {
      this.playRoyalChime();
    }
  }

  /**
   * Play distinct single chime when an order is marked delivered.
   */
  static playOrderDelivered(): void {
    const settings = this.getSettings();
    if (!settings.deliveryCompletedChime || settings.muted) return;
    this.playSound('order_delivered');
  }

  /**
   * Start a continuous looping alarm for new unaccepted orders ('pending').
   * Repeats every 2.4 seconds until stopped by order acceptance, rejection, or explicit dismissal.
   */
  static startContinuousAlarm(type: SoundType = 'new_order'): void {
    const settings = this.getSettings();
    if (settings.muted) return;
    if (type === 'new_order' && !settings.newOrderAlarm) return;

    if (this.isAlarmActive && this.currentAlarmType === type) {
      return;
    }

    this.stopAlarm();

    this.isAlarmActive = true;
    this.currentAlarmType = type;
    this.playSound(type);

    this.continuousInterval = setInterval(() => {
      if (this.isAlarmActive) {
        const currentSettings = this.getSettings();
        if (currentSettings.muted || (this.currentAlarmType === 'new_order' && !currentSettings.newOrderAlarm)) {
          this.stopAlarm();
          return;
        }
        this.playSound(type);
      }
    }, 2400);
  }

  /**
   * Stop any continuous alert loop immediately and pause active sound elements.
   */
  static stopAlarm(): void {
    this.isAlarmActive = false;
    this.currentAlarmType = null;
    if (this.continuousInterval) {
      clearInterval(this.continuousInterval);
      this.continuousInterval = null;
    }
    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement.currentTime = 0;
      } catch {}
      this.currentAudioElement = null;
    }
  }

  /**
   * Check whether the alarm is currently ringing.
   */
  static isAlarming(): boolean {
    return this.isAlarmActive;
  }

  /**
   * Initialize Android Native Notification channels with IMPORTANCE_HIGH (5) and sound configured
   * before notifications arrive.
   */
  static async initAndroidNotificationChannels(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
      // 1. Delete legacy channels to clear stale silent configurations
      await PushNotifications.deleteChannel({ id: 'olive_order_new' }).catch(() => {});

      // 2. Urgent Incoming Order Alarm Channel (IMPORTANCE_HIGH = 5)
      await PushNotifications.createChannel({
        id: 'olive_order_alarm_v3',
        name: 'Urgent Order Alarms',
        description: 'Critical incoming kitchen order alarms with heads-up banner and loud alarm sound.',
        importance: 5, // IMPORTANCE_HIGH (5)
        visibility: 1, // Public on lockscreen
        vibration: true,
        sound: 'order_alert',
      });

      // 2b. Backward-compatible alias channel
      await PushNotifications.createChannel({
        id: 'olive_order_new_v2',
        name: 'New Orders Alarm (v2)',
        description: 'Critical incoming order alerts for kitchen.',
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: 'new_order',
      });

      // 3. Order Delivered / Completed Chime Channel
      await PushNotifications.createChannel({
        id: 'olive_order_completed_v2',
        name: 'Order Delivered / Completed',
        description: 'Delivered and completed order notifications with single chime.',
        importance: 4, // High importance
        visibility: 1,
        vibration: true,
        sound: 'delivery_completed',
      });

      // 4. System Announcement Channel
      await PushNotifications.createChannel({
        id: 'olive_system',
        name: 'System Alerts',
        description: 'System announcements and management updates',
        importance: 4,
        visibility: 1,
        vibration: true,
        sound: 'system_alert',
      });
    } catch (err) {
      console.warn('[SoundAlertEngine] Native notification channel initialization notice:', err);
    }
  }
}

// Global user interaction listener to unlock AudioContext across all browsers
if (typeof window !== 'undefined') {
  const unlockEvents = ['click', 'touchstart', 'touchend', 'keydown', 'pointerdown', 'mousedown'];
  const handleInteraction = () => {
    SoundAlertEngine.unlockAudio();
    unlockEvents.forEach((ev) => window.removeEventListener(ev, handleInteraction));
  };
  unlockEvents.forEach((ev) => window.addEventListener(ev, handleInteraction, { passive: true }));
}
