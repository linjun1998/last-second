import React from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { isIOSDevice, supportsSystemVibration } from '../utils/haptics';
import { GameSettings } from '../utils/storage';
import { setLang, t, useLang } from '../i18n';

interface SettingsPanelProps {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  onClose: () => void;
  onOpenPrivacy?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onChange,
  onClose,
  onOpenPrivacy,
}) => {
  const lang = useLang();
  const nativeVibSupported = supportsSystemVibration();
  const isIOS = isIOSDevice();

  const toggle = (key: keyof GameSettings) => {
    onChange({
      ...settings,
      [key]: !settings[key],
    });
  };

  const rows: Array<{ key: keyof GameSettings; label: string; desc: string; note?: string }> = [
    {
      key: 'decisionPressure',
      label: t('settings.decisionPressureLabel'),
      desc: t('settings.decisionPressureDesc'),
    },
    {
      key: 'soundEnabled',
      label: t('settings.sfxLabel'),
      desc: t('settings.sfxDesc'),
    },
    {
      key: 'musicEnabled',
      label: t('settings.musicLabel'),
      desc: t('settings.musicDesc'),
    },
    {
      key: 'vibrationEnabled',
      label: t('settings.vibLabel'),
      desc: nativeVibSupported ? t('settings.vibDescOn') : t('settings.vibDescOff'),
      note: !nativeVibSupported
        ? isIOS
          ? t('settings.vibNoteIos')
          : t('settings.vibNoteOther')
        : undefined,
    },
    {
      key: 'reduceFlashAndShake',
      label: t('settings.flashLabel'),
      desc: t('settings.flashDesc'),
    },
    {
      key: 'reduceScare',
      label: t('settings.scareLabel'),
      desc: t('settings.scareDesc'),
    },
    {
      key: 'reduceMotion',
      label: t('settings.motionLabel'),
      desc: t('settings.motionDesc'),
    },
  ];

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#05060a]/90 p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md rounded-2xl border border-amber-200/18 bg-[#0a0d14] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.94)] my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-amber-200/15">
          <h2 className="font-display text-lg font-bold text-amber-50">{t('settings.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('settings.closeAria')}
            className="p-2 rounded-lg border border-amber-200/15 hover:border-amber-300/45 text-stone-400 hover:text-amber-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="divide-y divide-amber-200/10 my-2">
          {rows.map((item) => {
            const active = settings[item.key];
            return (
              <div key={item.key} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-amber-50/95">{item.label}</div>
                  <div className="text-xs text-stone-400 mt-0.5 leading-relaxed">{item.desc}</div>
                  {item.note && (
                    <div className="text-[11px] text-amber-300/90 mt-1 leading-snug">
                      {item.note}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  onClick={() => toggle(item.key)}
                  className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400 ${
                    active ? 'bg-amber-300' : 'bg-stone-800'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-slate-950 transition-transform duration-150 ${
                      active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>

        <div className="py-3 flex items-center justify-between gap-4 border-t border-amber-200/10">
          <div>
            <div className="text-sm font-semibold text-amber-50/95">{t('common.language')}</div>
            <div className="text-xs text-stone-400 mt-0.5 leading-relaxed">
              {t('settings.langDesc')}
            </div>
          </div>
          <div className="flex rounded-full border border-amber-200/20 overflow-hidden shrink-0">
            {(['zh', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                  lang === l ? 'bg-amber-300 text-slate-950' : 'bg-stone-900 text-stone-300 hover:text-amber-100'
                }`}
              >
                {l === 'zh' ? '中文' : 'EN'}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 px-3 py-2 rounded-lg bg-stone-900/75 border border-amber-200/12 text-[11px] text-stone-400 leading-relaxed">
          {t('settings.colorNotePre')}
          <span className="text-sky-300 font-medium">{t('settings.colorSafe')}</span> ·
          <span className="text-amber-300 font-medium">{t('settings.colorWarn')}</span> ·
          <span className="text-rose-400 font-medium">{t('settings.colorLethal')}</span>
        </div>

        <div className="pt-3 border-t border-amber-200/15 flex items-center justify-between">
          {onOpenPrivacy ? (
            <button
              type="button"
              onClick={onOpenPrivacy}
              className="text-[11px] text-stone-400 underline underline-offset-2 decoration-stone-600 hover:text-amber-200 transition-colors cursor-pointer"
            >
              {t('common.privacy')}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-b from-amber-100 to-amber-300 hover:from-white hover:to-amber-200 text-slate-950 font-bold text-xs transition-colors whitespace-nowrap cursor-pointer"
          >
            {t('settings.done')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
