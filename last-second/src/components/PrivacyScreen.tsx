import React from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { motion } from 'motion/react';
import { t, useLang } from '../i18n';

interface PrivacyScreenProps {
  onClose: () => void;
}

const SECTIONS: Array<{ h: string; b: string }> = [
  { h: 'privacy.h1', b: 'privacy.b1' },
  { h: 'privacy.h2', b: 'privacy.b2' },
  { h: 'privacy.h3', b: 'privacy.b3' },
  { h: 'privacy.h4', b: 'privacy.b4' },
  { h: 'privacy.h5', b: 'privacy.b5' },
  { h: 'privacy.h6', b: 'privacy.b6' },
];

export const PrivacyScreen: React.FC<PrivacyScreenProps> = ({ onClose }) => {
  useLang(); // 订阅语言变化，切换语言时本页同步刷新

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
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-amber-50">
            <ShieldCheck className="w-5 h-5 text-emerald-300" />
            {t('privacy.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-2 rounded-lg border border-amber-200/15 hover:border-amber-300/45 text-stone-400 hover:text-amber-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] font-mono text-stone-500 mt-3">{t('privacy.updated')}</p>
        <p className="text-sm text-amber-100/90 leading-relaxed mt-2">{t('privacy.intro')}</p>

        <div className="mt-4 space-y-4">
          {SECTIONS.map((s) => (
            <section key={s.h}>
              <h3 className="text-sm font-semibold text-amber-50/95">{t(s.h)}</h3>
              <p className="text-xs text-stone-400 mt-1 leading-relaxed">{t(s.b)}</p>
            </section>
          ))}
        </div>

        <div className="pt-4 mt-5 border-t border-amber-200/15 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-b from-amber-100 to-amber-300 hover:from-white hover:to-amber-200 text-slate-950 font-bold text-xs transition-colors whitespace-nowrap cursor-pointer"
          >
            {t('common.back')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
