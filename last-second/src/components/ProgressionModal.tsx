import React, { useEffect, useRef, useState } from 'react';
import { Check, Lock, Sparkles, X } from 'lucide-react';
import { motion } from 'motion/react';
import {
  ACHIEVEMENTS,
  SPARK_SKINS,
  SparkSkinConfig,
  SparkSkinId,
} from '../data/progressionConfig';
import { drawTimeSparkPlayer } from '../game/ClockworkRenderer';
import { TrailGhost } from '../game/PlayerController';
import {
  equipSparkSkin,
  getTodayDailyQuestsStatus,
  ProgressionState,
  unlockAndEquipSparkSkin,
} from '../utils/progressionStorage';
import { pick, t, useLang } from '../i18n';

export type ProgressionModalTab = 'SKINS' | 'QUESTS' | 'ACHIEVEMENTS';

interface ProgressionModalProps {
  initialTab?: ProgressionModalTab;
  progression: ProgressionState;
  onProgressionChange: (next: ProgressionState) => void;
  onClose: () => void;
}

export const ProgressionModal: React.FC<ProgressionModalProps> = ({
  initialTab = 'SKINS',
  progression,
  onProgressionChange,
  onClose,
}) => {
  useLang();
  const [tab, setTab] = useState<ProgressionModalTab>(initialTab);
  const [previewSkinId, setPreviewSkinId] = useState<SparkSkinId>(progression.equippedSkin);
  const [unlockFeedback, setUnlockFeedback] = useState<string | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const dailyQuests = getTodayDailyQuestsStatus(progression);
  const completedQuestCount = dailyQuests.filter((q) => q.completed).length;
  const previewCfg: SparkSkinConfig =
    SPARK_SKINS.find((s) => s.id === previewSkinId) || SPARK_SKINS[0];

  // Live animated preview of the selected Spark Skin + its signature trail
  useEffect(() => {
    if (tab !== 'SKINS') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const start = performance.now();

    const renderPreview = (now: number) => {
      const t = (now - start) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Subtle engraved watch dial chapter lines in preview box
      ctx.fillStyle = '#06080d';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(200, 169, 110, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(24, h / 2);
      ctx.lineTo(w - 24, h / 2);
      ctx.stroke();

      for (let x = 44; x < w - 30; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, h / 2 - 5);
        ctx.lineTo(x, h / 2 + 5);
        ctx.stroke();
      }

      // Smooth figure-8 / sine glide across preview window to showcase trail clearly
      const headX = w * 0.68 + Math.cos(t * 2.2) * 34;
      const headY = h * 0.5 + Math.sin(t * 4.4) * 11;
      const vx = -Math.sin(t * 2.2) * 34 * 2.2;
      const vy = Math.cos(t * 4.4) * 11 * 4.4;
      const aimAngle = Math.atan2(vy, vx + 110);

      const trail: TrailGhost[] = Array.from({ length: 8 }, (_, idx) => {
        const dtBack = (8 - idx) * 0.055;
        const tb = t - dtBack;
        const tx =
          w * 0.68 + Math.cos(tb * 2.2) * 34 - (8 - idx) * 15;
        const ty = h * 0.5 + Math.sin(tb * 4.4) * 11;
        return {
          x: tx,
          y: ty,
          angle: 0,
          stretch: 1.12,
          alpha: ((idx + 1) / 9) * 0.92,
        };
      });

      drawTimeSparkPlayer(ctx, headX, headY, aimAngle, 1.08, 6, t, trail, previewSkinId);

      rafId = requestAnimationFrame(renderPreview);
    };

    rafId = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(rafId);
  }, [previewSkinId, tab]);

  const handleSelectOrUnlock = (skin: SparkSkinConfig) => {
    setPreviewSkinId(skin.id);
    const isUnlocked = progression.unlockedSkins.includes(skin.id);
    if (isUnlocked) {
      const next = equipSparkSkin(skin.id);
      onProgressionChange(next);
      setUnlockFeedback(t('prog.equippedFeedback', { name: pick(skin.name, skin.nameEn) }));
      window.setTimeout(() => setUnlockFeedback(null), 1800);
      return;
    }

    const res = unlockAndEquipSparkSkin(skin.id);
    if (res.success) {
      onProgressionChange(res.state);
      const achBonus =
        res.unlockedAchievements.length > 0
          ? t('prog.unlockAchBonus', {
              title: pick(
                res.unlockedAchievements[0].title,
                res.unlockedAchievements[0].titleEn
              ),
              n: res.unlockedAchievements[0].rewardShards,
            })
          : '';
      setUnlockFeedback(
        `${t('prog.unlockFeedback', { name: pick(skin.name, skin.nameEn) })}${achBonus}`
      );
      window.setTimeout(() => setUnlockFeedback(null), 2600);
    }
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
        {/* Header + Time Shards Balance */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-amber-200/15">
          <div>
            <h2 className="font-display text-lg font-bold text-amber-50">{t('prog.title')}</h2>
            <p className="text-xs text-stone-400 mt-0.5">{t('prog.subtitle')}</p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right font-mono tabular-nums">
              <div className="text-[11px] text-stone-400">{t('prog.balanceLabel')}</div>
              <div className="text-sm font-bold text-amber-300">
                ✦ {progression.shardsBalance.toLocaleString()}
              </div>
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
        </div>

        {/* Segmented Navigation Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#05070b] border border-slate-800/80 rounded-xl my-5">
          <button
            type="button"
            onClick={() => setTab('SKINS')}
            className={`flex-1 py-2 px-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'SKINS'
                ? 'bg-slate-800 text-amber-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('prog.tabSkins', { a: progression.unlockedSkins.length, b: SPARK_SKINS.length })}
          </button>
          <button
            type="button"
            onClick={() => setTab('QUESTS')}
            className={`flex-1 py-2 px-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'QUESTS'
                ? 'bg-slate-800 text-amber-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('prog.tabQuests', { a: completedQuestCount })}
          </button>
          <button
            type="button"
            onClick={() => setTab('ACHIEVEMENTS')}
            className={`flex-1 py-2 px-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'ACHIEVEMENTS'
                ? 'bg-slate-800 text-amber-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('prog.tabAch', { a: progression.unlockedAchievements.length, b: ACHIEVEMENTS.length })}
          </button>
        </div>

        {tab === 'SKINS' && (
          <div className="space-y-4">
            {/* Live Spark Shape + Trail Preview Window */}
            <div className="rounded-xl border border-amber-200/15 bg-[#06080d] overflow-hidden">
              <canvas
                ref={previewCanvasRef}
                width={520}
                height={88}
                className="w-full h-[88px] block"
              />
              <div className="px-4 py-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-stone-200">
                  <span className="font-bold text-amber-200">
                    {pick(previewCfg.name, previewCfg.nameEn)}
                  </span>
                  <span className="text-stone-500 mx-2" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-stone-400">
                    {pick(previewCfg.shapeDesc, previewCfg.shapeDescEn)} /{' '}
                    {pick(previewCfg.trailDesc, previewCfg.trailDescEn)}
                  </span>
                </div>
                {unlockFeedback && (
                  <span className="text-emerald-300 font-medium">{unlockFeedback}</span>
                )}
              </div>
            </div>

            {/* 7 Spark Skins List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
              {SPARK_SKINS.map((skin) => {
                const isUnlocked = progression.unlockedSkins.includes(skin.id);
                const isEquipped = progression.equippedSkin === skin.id;
                const canAfford = progression.shardsBalance >= skin.cost;
                const isPreviewing = previewSkinId === skin.id;

                return (
                  <div
                    key={skin.id}
                    onMouseEnter={() => setPreviewSkinId(skin.id)}
                    onClick={() => setPreviewSkinId(skin.id)}
                    className={`p-3.5 rounded-xl border transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                      isEquipped
                        ? 'border-amber-300/60 bg-amber-950/20'
                        : isPreviewing
                        ? 'border-sky-400/45 bg-[#070a12]'
                        : 'border-slate-800/90 bg-[#05070b] hover:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-amber-50 truncate">
                        <span style={{ color: skin.primaryColor }}>✦</span>
                        <span className="truncate">{pick(skin.name, skin.nameEn)}</span>
                      </div>
                      <div className="text-[11px] text-stone-400 truncate mt-0.5">
                        {pick(skin.shapeDesc, skin.shapeDescEn)} ·{' '}
                        {pick(skin.trailDesc, skin.trailDescEn)}
                      </div>
                    </div>

                    {isEquipped ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 shrink-0 whitespace-nowrap">
                        <Check className="w-3.5 h-3.5" />
                        <span>{t('prog.equipped')}</span>
                      </span>
                    ) : isUnlocked ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectOrUnlock(skin);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-amber-200/25 hover:border-amber-300 text-xs font-semibold text-amber-100 shrink-0 whitespace-nowrap cursor-pointer"
                      >
                        {t('prog.equip')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectOrUnlock(skin);
                        }}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-mono font-bold tabular-nums shrink-0 whitespace-nowrap transition-colors ${
                          canAfford
                            ? 'bg-amber-300 hover:bg-amber-200 text-slate-950 cursor-pointer'
                            : 'border border-slate-800 text-stone-500 cursor-not-allowed'
                        }`}
                      >
                        {!canAfford && <Lock className="w-3 h-3" />}
                        <span>✦ {skin.cost}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'QUESTS' && (
          <div className="space-y-3.5">
            <div className="divide-y divide-slate-800/80 border-y border-slate-800/80">
              {dailyQuests.map((q) => {
                const ratio = Math.min(100, Math.round((q.progress / q.target) * 100));
                return (
                  <div key={q.id} className="py-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-stone-100">{q.title}</div>
                      <div className="font-mono tabular-nums text-xs shrink-0">
                        {q.completed ? (
                          <span className="text-emerald-300 font-semibold">
                            {t('prog.questRewarded', { n: q.rewardShards })}
                          </span>
                        ) : (
                          <span className="text-amber-300">
                            {t('prog.questReward', { n: q.rewardShards })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-900 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            q.completed ? 'bg-emerald-400' : 'bg-amber-300'
                          }`}
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono tabular-nums text-stone-400 w-10 text-right">
                        {q.progress}/{q.target}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-stone-400 leading-relaxed">{t('prog.questsNote')}</p>
          </div>
        )}

        {tab === 'ACHIEVEMENTS' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-stone-400">
              <span>
                {t('prog.achProgress', {
                  a: progression.unlockedAchievements.length,
                  b: ACHIEVEMENTS.length,
                })}
              </span>
              <span className="inline-flex items-center gap-1 text-amber-300/90">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('prog.achNote')}</span>
              </span>
            </div>

            <div className="divide-y divide-slate-800/75 border-y border-slate-800/75 max-h-80 overflow-y-auto pr-1">
              {ACHIEVEMENTS.map((ach) => {
                const unlocked = progression.unlockedAchievements.includes(ach.id);
                return (
                  <div
                    key={ach.id}
                    className="py-3 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-semibold ${
                          unlocked ? 'text-amber-200' : 'text-stone-300'
                        }`}
                      >
                        {unlocked
                          ? `★ ${pick(ach.title, ach.titleEn)}`
                          : pick(ach.title, ach.titleEn)}
                      </div>
                      <div className="text-xs text-stone-400 mt-0.5">
                        {pick(ach.desc, ach.descEn)}
                      </div>
                    </div>

                    <div className="shrink-0 font-mono tabular-nums text-xs text-right">
                      {unlocked ? (
                        <span className="text-emerald-300 font-semibold">
                          {t('prog.achClaimed', { n: ach.rewardShards })}
                        </span>
                      ) : (
                        <span className="text-stone-400">✦ +{ach.rewardShards}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
