import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AudioManager } from './audio/AudioManager';
import { ChallengeModalTab, ChallengeScreen } from './components/ChallengeScreen';
import { GameScreen } from './components/GameScreen';
import { HomeScreen } from './components/HomeScreen';
import { ProgressionModal, ProgressionModalTab } from './components/ProgressionModal';
import { PrivacyScreen } from './components/PrivacyScreen';
import { ResultScreen } from './components/ResultScreen';
import { SettingsPanel } from './components/SettingsPanel';
import { GameEngine } from './game/GameEngine';
import { HudSnapshot, RunResultSummary, ScreenMode } from './game/GameState';
import {
  ChallengePayload,
  clearChallengeFromUrl,
  parseChallengeFromUrl,
} from './utils/challengeSeed';
import { requestRewardedRevive } from './utils/adRevive';
import { track } from './utils/analytics';
import { t, useLang } from './i18n';
import { loadProgression, ProgressionState } from './utils/progressionStorage';
import {
  BestRecord,
  GameSettings,
  loadRecord,
  loadSettings,
  saveSettings,
} from './utils/storage';

const INITIAL_HUD: HudSnapshot = {
  phase: 'IDLE_DEMO',
  round: 1,
  unsettledScore: 0,
  safeBankedScore: 0,
  lastCheckpointDeposit: 0,
  bankedScore: 0,
  multiplier: 1,
  nextMultiplier: 2,
  combo: 0,
  comboScoreBonusPct: 0,
  maxCombo: 0,
  maxMultiplier: 1,
  rhythmStage: 'PRESSURE',
  stageLabel: '',
  eventId: null,
  eventName: '',
  eventSubtitle: '',
  eventClue: '',
  modifier: 'NONE',
  modifierLabel: '',
  dangerLevel: 1,
  roundProgress: 0,
  warningRemainingSec: null,
  isLethalActive: false,
  bannerAlert: null,
  seed: '',
  isDailyChallenge: false,
  isCustomChallenge: false,
  onboardingStep: null,
  firstTwistCallout: null,
  decisionElapsedSec: 0,
  decisionHeartbeatTick: 0,
  lastNearMissText: null,
  lastNearMissTier: null,
  lastSecondTriggeredThisRound: false,
  lastSecondBonusText: null,
  lastMissedClueText: null,
  shardsCollected: 0,
  activeShardAvailable: false,
  canRevive: true,
  reviveUsed: false,
  reviveDemoted: false,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const audioRef = useRef<AudioManager | null>(null);

  const [screen, setScreen] = useState<ScreenMode>('HOME');
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [bestRecord, setBestRecord] = useState<BestRecord>(() => loadRecord());
  const [progression, setProgression] = useState<ProgressionState>(() => loadProgression());
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [resultSummary, setResultSummary] = useState<RunResultSummary | null>(null);

  const [incomingChallenge, setIncomingChallenge] = useState<ChallengePayload | null>(() =>
    parseChallengeFromUrl()
  );
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [challengeModalTab, setChallengeModalTab] = useState<ChallengeModalTab>('DAILY');
  const [showProgressionModal, setShowProgressionModal] = useState(false);
  const [progressionModalTab, setProgressionModalTab] = useState<ProgressionModalTab>('SKINS');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showRotateHint, setShowRotateHint] = useState(false);
  const lang = useLang(); // re-render on language switch so the rotate hint follows
  const [autoExportVideoOnResult, setAutoExportVideoOnResult] = useState(false);
  const [isRevivingAdLoading, setIsRevivingAdLoading] = useState(false);

  // Initialize Canvas 2D GameEngine once in an isolated mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const initialSettings = loadSettings();
    const audio = new AudioManager(initialSettings);
    audioRef.current = audio;

    const engine = new GameEngine(canvas, audio, initialSettings, {
      onHudUpdate: (nextHud) => {
        setHud(nextHud);
      },
      onRunFinished: (summary) => {
        if (summary.outcome === 'CASHED_OUT') {
          track('cash_out', {
            rounds: summary.survivedRounds,
            score: summary.finalScore,
            safeBankedScore: summary.safeBankedScore,
          });
        } else {
          track('death', {
            round: summary.survivedRounds + 1,
            survivedRounds: summary.survivedRounds,
            lostScore: summary.lostUnsettledScore,
            closestMm: summary.closestMm,
          });
        }
        setResultSummary(summary);
        setBestRecord(loadRecord());
        setProgression(loadProgression());
        setScreen('RESULT');
      },
    });
    engineRef.current = engine;
    engine.startLoop();

    const onResize = () => engine.resize();
    const onBlurOrHidden = () => engine.handlePointerCancel();
    const onVisibilityChange = () => {
      if (document.hidden) {
        engine.handlePointerCancel();
      }
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('blur', onBlurOrHidden);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', onBlurOrHidden);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      engine.destroy();
      audio.destroy();
      engineRef.current = null;
      audioRef.current = null;
    };
  }, []);

  const handleSettingsChange = useCallback((next: GameSettings) => {
    setSettings(next);
    saveSettings(next);
    engineRef.current?.updateSettings(next);
  }, []);

  const handleProgressionChange = useCallback((next: ProgressionState) => {
    setProgression(next);
    engineRef.current?.setEquippedSkin(next.equippedSkin);
  }, []);

  const handleToggleSoundQuick = useCallback(() => {
    const nextMuted = settings.soundEnabled || settings.musicEnabled;
    const next: GameSettings = {
      ...settings,
      soundEnabled: !nextMuted,
      musicEnabled: !nextMuted,
    };
    handleSettingsChange(next);
  }, [settings, handleSettingsChange]);

  const startRun = useCallback((payload?: ChallengePayload) => {
    setShowChallengeModal(false);
    setShowProgressionModal(false);
    setAutoExportVideoOnResult(false);
    setResultSummary(null);
    setScreen('PLAYING');
    track('game_start', {
      seed: payload?.seed ?? 'random',
      isCustomChallenge: Boolean(payload?.customSequence),
    });
    engineRef.current?.startNewRun({
      seed: payload?.seed,
      customSequence: payload?.customSequence,
    });
  }, []);

  const handleStartNormal = useCallback(() => {
    startRun();
  }, [startRun]);

  const handleStartIncoming = useCallback(() => {
    if (incomingChallenge) {
      startRun(incomingChallenge);
    } else {
      startRun();
    }
  }, [incomingChallenge, startRun]);

  const handleDismissChallenge = useCallback(() => {
    clearChallengeFromUrl();
    setIncomingChallenge(null);
  }, []);

  const handleBackHome = useCallback(() => {
    setAutoExportVideoOnResult(false);
    setResultSummary(null);
    setScreen('HOME');
    setBestRecord(loadRecord());
    setProgression(loadProgression());
    engineRef.current?.setIdleDemo();
  }, []);

  const handleExportDeathReplayNow = useCallback(() => {
    setAutoExportVideoOnResult(true);
    engineRef.current?.declineReviveAndFinish();
  }, []);

  const handleRequestRevive = useCallback(async () => {
    if (isRevivingAdLoading) return;
    setIsRevivingAdLoading(true);
    try {
      const adRes = await requestRewardedRevive();
      if (adRes.rewarded) {
        track('revive', { round: hud.round });
        engineRef.current?.reviveCurrentRound();
      }
    } finally {
      setIsRevivingAdLoading(false);
    }
  }, [isRevivingAdLoading, hud.round]);

  const handleDeclineRevive = useCallback(() => {
    engineRef.current?.declineReviveAndFinish();
  }, []);

  // Keyboard shortcuts for snappy arcade flow
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showChallengeModal || showSettingsModal || showProgressionModal || showPrivacy) {
        if (e.key === 'Escape') {
          setShowChallengeModal(false);
          setShowSettingsModal(false);
          setShowProgressionModal(false);
          setShowPrivacy(false);
        }
        return;
      }

      if (e.key === 'Escape') {
        engineRef.current?.handlePointerCancel();
        setShowSettingsModal(true);
        return;
      }

      if (screen === 'HOME' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        if (incomingChallenge) {
          handleStartIncoming();
        } else {
          handleStartNormal();
        }
      } else if (screen === 'PLAYING' && hud.phase === 'DECISION_PAUSE') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          engineRef.current?.continueNextRound();
        }
      } else if (screen === 'RESULT' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        startRun();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    screen,
    hud.phase,
    incomingChallenge,
    showChallengeModal,
    showSettingsModal,
    showProgressionModal,
    showPrivacy,
    handleStartIncoming,
    handleStartNormal,
    startRun,
  ]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (screen !== 'PLAYING') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    engineRef.current?.handlePointerDown(e.pointerId, e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (screen !== 'PLAYING') return;
    engineRef.current?.handlePointerMove(e.pointerId, e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (screen !== 'PLAYING') return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    engineRef.current?.handlePointerUp(e.pointerId);
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    engineRef.current?.handlePointerCancel();
  };

  // Mobile touch hygiene: block double-tap / pinch zoom gestures and
  // rubber-band page scroll outside scrollable panels (modals use overflow-y-auto).
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    const onTouchMove = (e: TouchEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.closest('.overflow-y-auto')) e.preventDefault();
    };
    const onGesture = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', onGesture);
    document.addEventListener('gesturechange', onGesture);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', onGesture);
      document.removeEventListener('gesturechange', onGesture);
      document.removeEventListener('touchmove', onTouchMove);
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void prevent;
  }, []);

  // Landscape phones: play is fully supported; show a one-time-per-session hint.
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 560px)');
    const update = () => {
      let dismissed = false;
      try {
        dismissed = window.sessionStorage.getItem('ls_rotate_hint_dismissed') === '1';
      } catch {
        // ignore
      }
      setShowRotateHint(mq.matches && !dismissed);
    };
    update();
    mq.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      mq.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // Hydrate absolute OpenGraph URL & SVG Share Cover URL at runtime for social link previews
  useEffect(() => {
    const origin = window.location.origin;
    const setMeta = (selector: string, content: string) => {
      const el = document.querySelector<HTMLMetaElement>(selector);
      if (el) el.content = content;
    };
    setMeta('meta[property="og:url"]', window.location.href);
    setMeta('meta[property="og:image"]', `${origin}/og-cover.svg`);
    setMeta('meta[name="twitter:image"]', `${origin}/og-cover.svg`);
    document.title =
      lang === 'zh'
        ? 'LAST SECOND 最后一秒 — 一指极限逃生'
        : 'LAST SECOND — One-Finger Escape Gambit';
  }, [lang]);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#08090e] select-none touch-none">
      {/* Isolated Full-Viewport 60fps Canvas Arena */}
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        className="block w-full h-full cursor-crosshair touch-none"
      />

      {screen === 'HOME' && (
        <HomeScreen
          bestRecord={bestRecord}
          progression={progression}
          incomingChallenge={incomingChallenge}
          soundEnabled={settings.soundEnabled || settings.musicEnabled}
          onToggleSoundQuick={handleToggleSoundQuick}
          onStartNormal={handleStartNormal}
          onStartIncomingChallenge={handleStartIncoming}
          onDismissChallenge={handleDismissChallenge}
          onOpenDailyChallenge={() => {
            setBestRecord(loadRecord());
            setChallengeModalTab('DAILY');
            setShowChallengeModal(true);
          }}
          onOpenChallengeModal={() => {
            setBestRecord(loadRecord());
            setChallengeModalTab('ENTER_CODE');
            setShowChallengeModal(true);
          }}
          onOpenProgression={(tab) => {
            setProgression(loadProgression());
            setProgressionModalTab(tab);
            setShowProgressionModal(true);
          }}
          onOpenSettings={() => setShowSettingsModal(true)}
          onOpenPrivacy={() => setShowPrivacy(true)}
        />
      )}

      {screen === 'PLAYING' && (
        <GameScreen
          hud={hud}
          isRevivingAdLoading={isRevivingAdLoading}
          reduceFlashAndShake={settings.reduceFlashAndShake || settings.reduceMotion}
          decisionPressure={settings.decisionPressure}
          onContinueNextRound={() => engineRef.current?.continueNextRound()}
          onCashOut={() => engineRef.current?.cashOutNow()}
          onRequestRevive={handleRequestRevive}
          onDeclineRevive={handleDeclineRevive}
          onSkipPostAnimation={() => engineRef.current?.skipPostRunAnimation()}
          onExportDeathReplayNow={handleExportDeathReplayNow}
          onOpenSettings={() => {
            engineRef.current?.handlePointerCancel();
            setShowSettingsModal(true);
          }}
        />
      )}

      {screen === 'RESULT' && resultSummary && (
        <ResultScreen
          result={resultSummary}
          autoStartVideoExport={autoExportVideoOnResult}
          onConsumeAutoExport={() => setAutoExportVideoOnResult(false)}
          onPlayAgainNewSeed={() => startRun()}
          onPlayAgainSameSeed={() =>
            startRun({
              seed: resultSummary.seed,
              customSequence: resultSummary.customSequence,
            })
          }
          onOpenCustomBuilder={() => {
            setBestRecord(loadRecord());
            setChallengeModalTab('CREATE_CUSTOM');
            setShowChallengeModal(true);
          }}
          onOpenProgression={() => {
            setProgression(loadProgression());
            setProgressionModalTab('SKINS');
            setShowProgressionModal(true);
          }}
          onBackHome={handleBackHome}
        />
      )}

      {showChallengeModal && (
        <ChallengeScreen
          initialTab={challengeModalTab}
          recentHistory={bestRecord.recentHistory}
          onClose={() => setShowChallengeModal(false)}
          onStartChallenge={(payload) => startRun(payload)}
        />
      )}

      {showProgressionModal && (
        <ProgressionModal
          initialTab={progressionModalTab}
          progression={progression}
          onProgressionChange={handleProgressionChange}
          onClose={() => setShowProgressionModal(false)}
        />
      )}

      {showSettingsModal && (
        <SettingsPanel
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setShowSettingsModal(false)}
          onOpenPrivacy={() => {
            setShowSettingsModal(false);
            setShowPrivacy(true);
          }}
        />
      )}

      {showPrivacy && <PrivacyScreen onClose={() => setShowPrivacy(false)} />}

      {showRotateHint && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-3.5 py-2 rounded-full border border-amber-200/25 bg-[#0b0d14]/92 text-[11px] text-amber-100 shadow-lg pointer-events-auto">
          <span aria-hidden="true">↻</span>
          <span>{t('hint.rotate')}</span>
          <button
            type="button"
            onClick={() => {
              try {
                window.sessionStorage.setItem('ls_rotate_hint_dismissed', '1');
              } catch {
                // ignore
              }
              setShowRotateHint(false);
            }}
            className="text-amber-300 font-semibold cursor-pointer whitespace-nowrap"
          >
            {t('hint.rotate.dismiss')}
          </button>
        </div>
      )}
    </main>
  );
}
