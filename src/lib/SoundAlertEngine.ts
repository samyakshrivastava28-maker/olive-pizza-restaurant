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
  | 'soft_pop'         // Gentle informational update
  | 'test';            // Audio test tone

export interface SoundSettings {
  muted: boolean;
  volume: number; // 0.0 to 1.0
  newOrderAlarm: boolean; // Continuous alarm for unaccepted pending orders
  deliveryCompletedChime: boolean; // Single chime on delivered
  vibration: boolean; // Device vibration if supported
}

const SETTINGS_KEY = 'olive_sound_settings_v1';

const DEFAULT_SETTINGS: SoundSettings = {
  muted: false,
  volume: 0.85,
  newOrderAlarm: true,
  deliveryCompletedChime: true,
  vibration: true,
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
   * Lazily initialize or retrieve the shared Web Audio API context.
   */
  static getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx!;
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
   * Synthesize musical frequency tones using Oscillator nodes.
   */
  private static playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = 'sine',
    volumeMultiplier = 0.5,
    delaySec = 0
  ): void {
    const settings = this.getSettings();
    if (settings.muted) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delaySec);

      const targetVol = Math.max(0.01, Math.min(1.0, settings.volume * volumeMultiplier));
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delaySec);
      gain.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + delaySec + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delaySec + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delaySec);
      osc.stop(ctx.currentTime + delaySec + durationSec + 0.03);
    } catch (err) {
      console.warn('[SoundAlertEngine] Tone synthesis error:', err);
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
        audio.volume = settings.volume;
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
   * Synthesize fallback musical frequency tones using Web Audio API.
   * Only called when custom audio files fail to load or play.
   */
  private static playSynthesizedTone(type: SoundType): void {
    switch (type) {
      case 'new_order':
        // High-importance commanding 4-tone sequence: A5 -> D6 -> A5 -> D6
        this.playTone(880, 0.22, 'triangle', 0.9, 0);
        this.playTone(1174, 0.22, 'sine', 0.9, 0.14);
        this.playTone(880, 0.22, 'triangle', 0.9, 0.28);
        this.playTone(1174, 0.35, 'sine', 1.0, 0.42);
        break;

      case 'delivery_urgent':
        this.playTone(987, 0.18, 'sine', 0.85, 0);
        this.playTone(1318, 0.28, 'sine', 0.95, 0.12);
        break;

      case 'order_accepted':
        this.playTone(659, 0.2, 'sine', 0.5, 0);
        this.playTone(880, 0.3, 'sine', 0.6, 0.15);
        break;

      case 'order_ready':
        this.playTone(1046, 0.35, 'sine', 0.7, 0);
        break;

      case 'order_cancelled':
        this.playTone(440, 0.25, 'sawtooth', 0.6, 0);
        this.playTone(330, 0.45, 'sine', 0.7, 0.2);
        break;

      case 'order_delivered':
        // Celebratory melodic 3-tone chime: G5 -> B5 -> D6
        this.playTone(784, 0.16, 'sine', 0.7, 0);
        this.playTone(987, 0.16, 'sine', 0.75, 0.12);
        this.playTone(1174, 0.32, 'sine', 0.85, 0.24);
        break;

      case 'soft_pop':
        this.playTone(880, 0.1, 'sine', 0.3, 0);
        break;

      case 'test':
        this.playTone(880, 0.15, 'sine', 0.7, 0);
        this.playTone(1174, 0.25, 'triangle', 0.8, 0.12);
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

    const soundFilesMap: Record<SoundType, string[]> = {
      new_order: ['/sounds/order_alert.mp3', '/sounds/order_alert.wav', '/sounds/new_order.mp3', '/sounds/new_order.wav'],
      delivery_urgent: ['/sounds/system_alert.mp3', '/sounds/delivery_chime.mp3'],
      order_accepted: ['/sounds/order_confirmed.mp3', '/sounds/success_ding.mp3'],
      order_ready: ['/sounds/success_ding.mp3', '/sounds/delivery_chime.mp3'],
      order_cancelled: ['/sounds/cancel_buzz.mp3'],
      order_delivered: [
        '/sounds/delivery_completed.mp3',
        '/sounds/delivery_completed.wav',
        '/sounds/order_delivered.mp3',
        '/sounds/order_delivered.wav',
        '/sounds/delivery_chime.mp3'
      ],
      soft_pop: ['/sounds/soft_pop.mp3'],
      test: ['/sounds/order_alert.mp3', '/sounds/new_order.mp3', '/sounds/success_ding.mp3']
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
