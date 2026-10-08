import React, { useState, useEffect } from 'react';
import { 
  Volume2, 
  VolumeX, 
  Volume1, 
  Bell, 
  CheckCircle2, 
  Vibrate, 
  Sparkles, 
  X, 
  Play, 
  Square
} from 'lucide-react';
import { SoundAlertEngine, type SoundSettings } from '../../lib/SoundAlertEngine';
import toast from 'react-hot-toast';

interface SoundSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SoundSettingsModal: React.FC<SoundSettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<SoundSettings>(() => SoundAlertEngine.getSettings());
  const [isPlayingTest, setIsPlayingTest] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = SoundAlertEngine.subscribeSettings((newSettings) => {
      setSettings(newSettings);
    });
    return unsub;
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUpdate = (partial: Partial<SoundSettings>) => {
    SoundAlertEngine.saveSettings(partial);
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  const handleTestNewOrderSound = () => {
    SoundAlertEngine.unlockAudio();
    setIsPlayingTest(true);
    SoundAlertEngine.playSound('new_order');
    toast.success('Playing New Order alarm test', { id: 'test-sound-toast' });
    setTimeout(() => setIsPlayingTest(false), 1200);
  };

  const handleTestDeliveredChime = () => {
    SoundAlertEngine.unlockAudio();
    SoundAlertEngine.playSound('order_delivered');
    toast.success('Playing Delivery Completed chime test', { id: 'test-delivered-toast' });
  };

  const handleStopAllSounds = () => {
    SoundAlertEngine.stopAlarm();
    setIsPlayingTest(false);
    toast('Audio alarm silenced', { icon: '🔇' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-[#121814] border border-[#26332a] rounded-3xl p-6 shadow-2xl text-[#e8eee9] relative overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sound-settings-title"
      >
        {/* Glow Accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#57854d]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#26332a]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#57854d]/20 border border-[#57854d]/40 flex items-center justify-center text-[#c6a052]">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="sound-settings-title" className="text-base font-extrabold text-white tracking-tight">
                Sound & Notification Settings
              </h3>
              <p className="text-xs text-[#a4c29c]">Kitchen terminal audio alert preferences</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#7ba372] hover:text-white hover:bg-[#1b241e] transition"
            aria-label="Close sound settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-5 space-y-5">
          {/* Master Volume Slider */}
          <div className="p-4 rounded-2xl bg-[#0d120f] border border-[#26332a] space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white flex items-center gap-1.5">
                {settings.muted ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : settings.volume < 0.4 ? (
                  <Volume1 className="w-4 h-4 text-[#a4c29c]" />
                ) : (
                  <Volume2 className="w-4 h-4 text-[#c6a052]" />
                )}
                <span>Alert Volume</span>
              </span>
              <span className="font-mono text-[#c6a052] font-bold">
                {settings.muted ? 'MUTED' : `${Math.round(settings.volume * 100)}%`}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0.05"
                max="1.0"
                step="0.05"
                disabled={settings.muted}
                value={settings.volume}
                onChange={(e) => handleUpdate({ volume: parseFloat(e.target.value) })}
                className="flex-1 h-2 rounded-lg bg-[#1b241e] accent-[#57854d] cursor-pointer disabled:opacity-40"
              />
              <button
                onClick={() => handleUpdate({ muted: !settings.muted })}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 ${
                  settings.muted 
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                    : 'bg-[#1b241e] text-[#a4c29c] hover:text-white border border-[#26332a]'
                }`}
              >
                {settings.muted ? 'Unmute' : 'Mute'}
              </button>
            </div>
          </div>

          {/* Toggle Switches */}
          <div className="space-y-3">
            {/* New Order Alarm Toggle */}
            <div className="p-3.5 rounded-2xl bg-[#0d120f] border border-[#26332a] flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Bell className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">New Order Continuous Alarm</h4>
                  <p className="text-[11px] text-[#a4c29c] leading-snug">
                    Loud repeating chime for incoming pending orders until accepted
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleUpdate({ newOrderAlarm: !settings.newOrderAlarm })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.newOrderAlarm ? 'bg-[#57854d]' : 'bg-[#1e2821]'
                }`}
                role="switch"
                aria-checked={settings.newOrderAlarm}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    settings.newOrderAlarm ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Delivery Completed Chime Toggle */}
            <div className="p-3.5 rounded-2xl bg-[#0d120f] border border-[#26332a] flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Delivery Completed Chime</h4>
                  <p className="text-[11px] text-[#a4c29c] leading-snug">
                    Single celebratory chime whenever an order is marked delivered
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleUpdate({ deliveryCompletedChime: !settings.deliveryCompletedChime })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.deliveryCompletedChime ? 'bg-[#57854d]' : 'bg-[#1e2821]'
                }`}
                role="switch"
                aria-checked={settings.deliveryCompletedChime}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    settings.deliveryCompletedChime ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Vibration Toggle */}
            <div className="p-3.5 rounded-2xl bg-[#0d120f] border border-[#26332a] flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Vibrate className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Device Vibration</h4>
                  <p className="text-[11px] text-[#a4c29c] leading-snug">
                    Haptic motor vibration pulse on mobile and tablet terminals
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleUpdate({ vibration: !settings.vibration })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.vibration ? 'bg-[#57854d]' : 'bg-[#1e2821]'
                }`}
                role="switch"
                aria-checked={settings.vibration}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    settings.vibration ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Test Sound Action Buttons */}
          <div className="pt-2 border-t border-[#26332a] space-y-2">
            <span className="text-[10px] font-bold text-[#7ba372] uppercase tracking-wider block">
              Test Audio & Diagnostics
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleTestNewOrderSound}
                disabled={isPlayingTest}
                className="py-2.5 px-3 rounded-xl bg-[#1b241e] hover:bg-[#222d26] border border-[#26332a] text-xs font-bold text-white flex items-center justify-center gap-1.5 transition active:scale-98 disabled:opacity-60"
              >
                <Play className={`w-3.5 h-3.5 text-amber-400 ${isPlayingTest ? 'animate-spin' : ''}`} />
                <span>{isPlayingTest ? 'Testing...' : 'Test Order Alarm'}</span>
              </button>

              <button
                onClick={handleTestDeliveredChime}
                className="py-2.5 px-3 rounded-xl bg-[#1b241e] hover:bg-[#222d26] border border-[#26332a] text-xs font-bold text-white flex items-center justify-center gap-1.5 transition active:scale-98"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Test Delivered Chime</span>
              </button>
            </div>

            {SoundAlertEngine.isAlarming() && (
              <button
                onClick={handleStopAllSounds}
                className="w-full py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Silence Active Siren Loop</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#26332a] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#57854d] hover:bg-[#426939] text-white text-xs font-bold transition shadow-md"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
