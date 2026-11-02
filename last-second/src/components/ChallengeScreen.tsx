import React, { useState } from 'react';
import { Copy, Play, RefreshCw, Trophy, X } from 'lucide-react';
import { motion } from 'motion/react';
import { ALL_EVENT_IDS, EVENT_CONFIGS, EventId } from '../data/eventConfig';
import {
  buildChallengeUrl,
  ChallengePayload,
  decodeChallengeCode,
  encodeChallengeCode,
} from '../utils/challengeSeed';
import { SeededRNG } from '../utils/random';
import { getDailyLeaderboard, RunHistoryEntry } from '../utils/storage';
import { pick, t, useLang } from '../i18n';

export type ChallengeModalTab = 'DAILY' | 'ENTER_CODE' | 'CREATE_CUSTOM' | 'HISTORY';

interface ChallengeScreenProps {
  initialTab?: ChallengeModalTab;
  recentHistory: RunHistoryEntry[];
  onClose: () => void;
  onStartChallenge: (payload: ChallengePayload) => void;
}

const PRESET_COMBOS: Array<{ labelKey: string; descKey: string; seq: EventId[] }> = [
  {
    labelKey: 'challenge.preset1.label',
    descKey: 'challenge.preset1.desc',
    seq: ['narrow_corridor', 'fake_safety', 'direction_invert', 'fake_safety', 'frenzy_gauntlet'],
  },
  {
    labelKey: 'challenge.preset2.label',
    descKey: 'challenge.preset2.desc',
    seq: ['narrow_corridor', 'razor_gate', 'rotating_blade', 'razor_gate'],
  },
  {
    labelKey: 'challenge.preset3.label',
    descKey: 'challenge.preset3.desc',
    seq: ['darkness_ambush', 'sudden_drop', 'fake_safety', 'chain_sweep'],
  },
];

export const ChallengeScreen: React.FC<ChallengeScreenProps> = ({
  initialTab = 'DAILY',
  recentHistory,
  onClose,
  onStartChallenge,
}) => {
  useLang();
  const [tab, setTab] = useState<ChallengeModalTab>(initialTab);
  const [inputCode, setInputCode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [customSeed, setCustomSeed] = useState(() => SeededRNG.generateSeedString());
  const [customSeq, setCustomSeq] = useState<EventId[]>([
    'narrow_corridor',
    'fake_safety',
    'razor_gate',
    'frenzy_gauntlet',
  ]);
  const [copied, setCopied] = useState(false);

  const dailyBoard = getDailyLeaderboard();

  const handleJoinByCode = () => {
    const parsed = decodeChallengeCode(inputCode);
    if (!parsed) {
      setErrorMsg(t('challenge.invalidCode'));
      return;
    }
    setErrorMsg(null);
    onStartChallenge(parsed);
  };

  const generatedPayload: ChallengePayload = {
    seed: customSeed,
    customSequence: customSeq,
  };
  const generatedCode = encodeChallengeCode(generatedPayload);
  const generatedUrl = buildChallengeUrl(generatedPayload);

  const handleCopyCustom = async () => {
    const text = t('challenge.customCopyText', { code: generatedCode, url: generatedUrl });
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ignore
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  const addEventToSeq = (id: EventId) => {
    if (customSeq.length >= 8) return;
    setCustomSeq([...customSeq, id]);
  };

  const removeEventAt = (idx: number) => {
    setCustomSeq(customSeq.filter((_, i) => i !== idx));
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#05060a]/92 p-4 sm:p-6 overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xl rounded-2xl border border-amber-200/18 bg-[#0a0d14] p-6 sm:p-7 shadow-[0_30px_90px_rgba(0,0,0,0.94)] my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-amber-200/15">
          <div>
            <h2 className="font-display text-lg font-bold text-amber-50">
              {t('challenge.title')}
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">{t('challenge.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-2 rounded-lg border border-amber-200/15 hover:border-amber-300/45 text-stone-400 hover:text-amber-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Clean Segmented Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#05070b] border border-slate-800/80 rounded-xl my-5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab('DAILY')}
            className={`flex-1 py-2 px-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'DAILY'
                ? 'bg-slate-800 text-amber-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('challenge.tabDaily')}
          </button>
          <button
            type="button"
            onClick={() => setTab('ENTER_CODE')}
            className={`flex-1 py-2 px-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'ENTER_CODE'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('challenge.tabEnter')}
          </button>
          <button
            type="button"
            onClick={() => setTab('CREATE_CUSTOM')}
            className={`flex-1 py-2 px-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'CREATE_CUSTOM'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('challenge.tabCreate')}
          </button>
          <button
            type="button"
            onClick={() => setTab('HISTORY')}
            className={`flex-1 py-2 px-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'HISTORY'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('challenge.tabHistory', { n: recentHistory.length })}
          </button>
        </div>

        {tab === 'DAILY' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#05070b] p-4">
              <div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono tabular-nums text-amber-300">
                  <Trophy className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('challenge.dailySeedLine', { date: dailyBoard.dateLabel })}</span>
                  <span className="text-slate-600">·</span>
                  <span>#{dailyBoard.seed}</span>
                  <span className="text-slate-600">·</span>
                  <span className="font-sans text-stone-300">{t('challenge.localNote')}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {dailyBoard.playerBestScore !== null
                    ? t('challenge.dailyBest', {
                        score: dailyBoard.playerBestScore.toLocaleString(),
                        n: dailyBoard.localAttemptCount,
                      })
                    : t('challenge.dailyNone')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onStartChallenge({ seed: dailyBoard.seed })}
                className="flex items-center gap-1.5 py-2.5 px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-transform active:scale-[0.98] whitespace-nowrap cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{t('challenge.startDaily')}</span>
              </button>
            </div>

            <div className="rounded-xl border border-slate-800/80 overflow-hidden">
              <div className="grid grid-cols-12 px-4 py-2 bg-[#05070b] text-[11px] text-slate-500 border-b border-slate-800/80">
                <div className="col-span-2">{t('challenge.colTier')}</div>
                <div className="col-span-4">{t('challenge.colScore')}</div>
                <div className="col-span-2 text-right">{t('challenge.colSurvive')}</div>
                <div className="col-span-2 text-right">{t('challenge.colMargin')}</div>
                <div className="col-span-2 text-right">{t('challenge.colFinal')}</div>
              </div>
              <div className="divide-y divide-slate-800/60 max-h-60 overflow-y-auto font-mono tabular-nums text-xs">
                {dailyBoard.rows.map((row) => (
                  <div
                    key={`${row.rank}-${row.name}`}
                    className={`grid grid-cols-12 items-center px-4 py-2.5 ${
                      row.isPlayer
                        ? 'bg-cyan-950/35 text-cyan-200 font-bold'
                        : 'text-slate-400'
                    }`}
                  >
                    <div
                      className={`col-span-2 font-bold ${
                        row.isPlayer
                          ? 'text-cyan-300'
                          : row.rank === 1
                          ? 'text-amber-300/85'
                          : 'text-slate-500'
                      }`}
                    >
                      #{row.rank}
                    </div>
                    <div className="col-span-4 font-sans truncate">{row.name}</div>
                    <div className="col-span-2 text-right text-slate-400">
                      {t('challenge.roundsUnit', { n: row.round })}
                    </div>
                    <div className="col-span-2 text-right text-amber-300/90">
                      {row.closestMm.toFixed(1)}mm
                    </div>
                    <div className="col-span-2 text-right font-bold text-white">
                      {row.score.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'ENTER_CODE' && (
          <div className="space-y-5">
            <div>
              <label className="block text-xs text-slate-400 mb-2">
                {t('challenge.enterLabel')}
              </label>
              <div className="flex gap-2.5">
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleJoinByCode();
                  }}
                  placeholder={t('challenge.enterPlaceholder')}
                  className="flex-1 rounded-xl border border-slate-700 bg-[#05070b] px-4 py-2.5 text-sm font-mono text-white placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleJoinByCode}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-sm whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{t('challenge.enterBtn')}</span>
                </button>
              </div>
              {errorMsg && <p className="text-xs text-rose-400 mt-2">{errorMsg}</p>}
            </div>

            <div className="pt-4 border-t border-slate-800/80">
              <div className="text-xs text-slate-400 mb-3">{t('challenge.presetsTitle')}</div>
              <div className="divide-y divide-slate-800/70 border-y border-slate-800/70">
                {PRESET_COMBOS.map((preset) => (
                  <div
                    key={preset.labelKey}
                    className="py-3.5 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-100">{t(preset.labelKey)}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{t(preset.descKey)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onStartChallenge({
                          seed: SeededRNG.generateSeedString(),
                          customSequence: preset.seq,
                        })
                      }
                      className="px-4 py-2 rounded-lg border border-slate-700 hover:border-cyan-400 text-xs font-semibold text-cyan-300 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {t('challenge.challengeBtn')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'CREATE_CUSTOM' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{t('challenge.seqLabel')}</span>
              <button
                type="button"
                onClick={() => setCustomSeed(SeededRNG.generateSeedString())}
                className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-mono cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{t('challenge.seedLabel', { seed: customSeed })}</span>
              </button>
            </div>

            <div className="min-h-[52px] rounded-xl border border-slate-800 bg-[#05070b] p-3 flex flex-wrap gap-2">
              {customSeq.length === 0 ? (
                <span className="text-xs text-slate-500 my-auto">{t('challenge.seqEmpty')}</span>
              ) : (
                customSeq.map((id, idx) => (
                  <button
                    key={`${id}-${idx}`}
                    type="button"
                    onClick={() => removeEventAt(idx)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-700 hover:border-rose-500 bg-slate-900 text-xs text-slate-200 whitespace-nowrap cursor-pointer"
                  >
                    {idx + 1}. {pick(EVENT_CONFIGS[id].name, EVENT_CONFIGS[id].nameEn)} ×
                  </button>
                ))
              )}
            </div>

            <div>
              <div className="text-xs text-slate-400 mb-2">{t('challenge.addTitle')}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                {ALL_EVENT_IDS.map((id) => {
                  const cfg = EVENT_CONFIGS[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={customSeq.length >= 8}
                      onClick={() => addEventToSeq(id)}
                      className="text-left p-2.5 rounded-xl border border-slate-800 hover:border-cyan-500/60 bg-[#05070b] disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-slate-200 truncate">
                        + {pick(cfg.name, cfg.nameEn)}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        Lv.{cfg.dangerLevel} ·{' '}
                        {cfg.category === 'horror'
                          ? t('challenge.catHorror')
                          : cfg.category === 'frenzy'
                          ? t('challenge.catFrenzy')
                          : t('challenge.catExtreme')}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={customSeq.length === 0}
                onClick={handleCopyCustom}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-cyan-500/50 text-cyan-300 hover:bg-cyan-950/35 text-xs font-semibold disabled:opacity-40 whitespace-nowrap cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? t('challenge.copied') : t('challenge.copyLink', { code: generatedCode })}</span>
              </button>
              <button
                type="button"
                disabled={customSeq.length === 0}
                onClick={() => onStartChallenge(generatedPayload)}
                className="py-3 px-6 rounded-xl bg-white hover:bg-cyan-50 text-slate-950 font-bold text-xs disabled:opacity-40 whitespace-nowrap cursor-pointer"
              >
                {t('challenge.trySelf')}
              </button>
            </div>
          </div>
        )}

        {tab === 'HISTORY' && (
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/70">
            {recentHistory.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                {t('challenge.historyEmpty')}
              </div>
            ) : (
              recentHistory.map((item) => (
                <div
                  key={item.id}
                  className="py-3 flex items-center justify-between gap-4 font-mono tabular-nums"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`font-sans font-bold ${
                          item.outcome === 'CASHED_OUT' ? 'text-cyan-300' : 'text-rose-400'
                        }`}
                      >
                        {item.outcome === 'CASHED_OUT'
                          ? t('challenge.outcomeCash')
                          : t('challenge.outcomeFail')}
                      </span>
                      <span className="text-slate-600" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-200">
                        {t('challenge.histRounds', { n: item.round })}
                      </span>
                      <span className="text-slate-600" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-300">
                        {item.outcome === 'CASHED_OUT'
                          ? t('challenge.histScore', { score: item.score.toLocaleString() })
                          : item.score > 0
                          ? t('challenge.histBanked', {
                              score: item.score.toLocaleString(),
                              lost: item.lostScore.toLocaleString(),
                            })
                          : t('challenge.histLost', {
                              lost: item.lostScore.toLocaleString(),
                            })}
                      </span>
                    </div>
                    <div className="text-[11px] font-sans text-slate-500 truncate mt-0.5">
                      #{item.seed} · {item.highlight}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onStartChallenge({ seed: item.seed })}
                    className="px-3 py-1.5 rounded-lg border border-slate-800 hover:border-cyan-400 text-xs font-sans font-medium text-cyan-300 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {t('challenge.rematch')}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};
