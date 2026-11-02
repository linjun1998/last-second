import { EventId } from '../data/eventConfig';
import { ClueZone } from '../events/HazardEvents';
import { HazardShape, SafeZoneHint } from './CollisionSystem';
import { t } from '../i18n';

export interface MissedClueHighlight {
  x: number;
  y: number;
  radius: number;
  text: string;
  color: 'AMBER' | 'MAGENTA' | 'CYAN';
}

export interface ReplaySnapshotFrame {
  timestampSec: number;
  playerX: number;
  playerY: number;
  aimAngle: number;
  hazards: HazardShape[];
  safeHints: SafeZoneHint[];
  clueZones?: ClueZone[];
  timeShard?: { x: number; y: number; radius: number; collected: boolean } | null;
  closestMarginPx: number;
  round: number;
  eventId?: EventId | null;
  eventName: string;
  label: string;
  isNearMiss: boolean;
  isDecisionPoint?: boolean; // Marks the exact window (~0.65s before death) where dashing toward safeHints would have saved the player!
  optimalEscapeX?: number;
  optimalEscapeY?: number;
  missedClue?: MissedClueHighlight;
}

export interface KeyMomentLog {
  round: number;
  type:
    | 'DASH'
    | 'NEAR_MISS'
    | 'LAST_SECOND'
    | 'TIME_SHARD'
    | 'CHECKPOINT'
    | 'REVIVE'
    | 'COMBO_BURST'
    | 'HORROR_SURVIVED'
    | 'CASH_OUT'
    | 'FAIL';
  description: string;
  marginPx?: number;
}

export class ReplaySystem {
  private bestClimaxSnapshot: ReplaySnapshotFrame | null = null;
  private bestMargin = Infinity;
  private moments: KeyMomentLog[] = [];
  private rollingTimeline: ReplaySnapshotFrame[] = []; // Captures ~5 seconds @ 15fps (75 frames)
  private climaxReel: ReplaySnapshotFrame[] = []; // Saved 3~6s highlight clip
  private lastMissedClueSummary: string | null = null;

  public reset(): void {
    this.bestClimaxSnapshot = null;
    this.bestMargin = Infinity;
    this.moments = [];
    this.rollingTimeline = [];
    this.climaxReel = [];
    this.lastMissedClueSummary = null;
  }

  private cloneFrame(frame: ReplaySnapshotFrame): ReplaySnapshotFrame {
    return {
      ...frame,
      hazards: frame.hazards.map((h) => ({ ...h })),
      safeHints: frame.safeHints.map((s) => ({ ...s })),
      clueZones: frame.clueZones ? frame.clueZones.map((c) => ({ ...c })) : undefined,
      timeShard: frame.timeShard ? { ...frame.timeShard } : null,
      missedClue: frame.missedClue ? { ...frame.missedClue } : undefined,
    };
  }

  /** Sampled ~15Hz during active play for smooth 3~6s shareable replay & death instant-slowmo */
  public pushTimelineSample(frame: ReplaySnapshotFrame): void {
    const cloned = this.cloneFrame(frame);
    this.rollingTimeline.push(cloned);
    if (this.rollingTimeline.length > 75) {
      this.rollingTimeline.shift();
    }

    if (frame.closestMarginPx > 0 && frame.closestMarginPx < this.bestMargin) {
      this.bestMargin = frame.closestMarginPx;
      this.bestClimaxSnapshot = cloned;
      // Snapshot the surrounding reel whenever a new personal closest-call occurs
      this.climaxReel = this.rollingTimeline.slice(-52);
    }
  }

  /**
   * Builds the ~1.8s Death Slow-Motion Replay clip, annotates the exact "Last Viable Decision Point",
   * and highlights the exact Clue ("错过的线索") so the player always understands why they died!
   */
  public finalizeFailureReplay(
    overrideClue?: MissedClueHighlight,
    fallbackClueHint?: string
  ): ReplaySnapshotFrame[] {
    const tail = this.rollingTimeline.slice(-30).map((f) => this.cloneFrame(f));
    if (tail.length === 0) return [];

    const decisionIdx = Math.max(0, tail.length - 11);
    const decisionRef = tail[decisionIdx];

    // Resolve the clearest missed clue from recent timeline (preferring MAGENTA/AMBER deception clues)
    let resolvedClue: MissedClueHighlight | null = overrideClue ? { ...overrideClue } : null;
    if (!resolvedClue) {
      const recentWindow = this.rollingTimeline.slice(-45);
      for (let i = recentWindow.length - 1; i >= 0; i--) {
        const czList = recentWindow[i].clueZones;
        if (czList && czList.length > 0) {
          const priorityCz =
            czList.find((c) => c.color === 'MAGENTA' || c.color === 'AMBER') || czList[0];
          resolvedClue = {
            x: priorityCz.x,
            y: priorityCz.y,
            radius: Math.max(24, priorityCz.radius),
            text: priorityCz.replayReason || priorityCz.label,
            color: priorityCz.color,
          };
          break;
        }
      }
    }

    if (!resolvedClue) {
      if (decisionRef.safeHints.length > 0) {
        const sh = decisionRef.safeHints[0];
        resolvedClue = {
          x: sh.x,
          y: sh.y,
          radius: Math.max(26, sh.radius),
          text: fallbackClueHint || t('replay.fallbackSafe'),
          color: 'CYAN',
        };
      } else {
        resolvedClue = {
          x: decisionRef.playerX,
          y: decisionRef.playerY,
          radius: 30,
          text: fallbackClueHint || t('replay.fallbackLethal'),
          color: 'AMBER',
        };
      }
    }

    this.lastMissedClueSummary = resolvedClue.text;

    for (let i = Math.max(0, decisionIdx - 3); i < tail.length; i++) {
      const f = tail[i];
      f.missedClue = { ...resolvedClue };
      if (i >= Math.max(0, decisionIdx - 2) && i <= Math.min(tail.length - 2, decisionIdx + 2)) {
        f.isDecisionPoint = true;
        if (f.safeHints.length > 0) {
          f.optimalEscapeX = f.safeHints[0].x;
          f.optimalEscapeY = f.safeHints[0].y;
        } else {
          const ang = Math.atan2(-f.playerY, -f.playerX);
          f.optimalEscapeX = Math.cos(ang) * 145;
          f.optimalEscapeY = Math.sin(ang) * 145;
        }
      }
    }

    this.climaxReel = this.rollingTimeline.slice(-65).map((f, idx, arr) => {
      const copy = this.cloneFrame(f);
      if (idx >= arr.length - 14) {
        copy.missedClue = { ...resolvedClue! };
      }
      if (idx >= arr.length - 13 && idx <= arr.length - 9) {
        copy.isDecisionPoint = true;
        if (copy.safeHints.length > 0) {
          copy.optimalEscapeX = copy.safeHints[0].x;
          copy.optimalEscapeY = copy.safeHints[0].y;
        }
      }
      return copy;
    });

    return tail;
  }

  public getMissedClueSummary(): string | null {
    return this.lastMissedClueSummary;
  }

  public finalizeCashOutReplay(): void {
    if (this.climaxReel.length === 0 && this.rollingTimeline.length > 0) {
      this.climaxReel = this.rollingTimeline.slice(-60);
    }
  }

  public logMoment(moment: KeyMomentLog): void {
    this.moments.push(moment);
  }

  public getClosestCallSnapshot(): ReplaySnapshotFrame | null {
    return this.bestClimaxSnapshot;
  }

  public getReplayReel(): ReplaySnapshotFrame[] {
    return this.climaxReel.length > 0 ? this.climaxReel : this.rollingTimeline;
  }

  public getMoments(): KeyMomentLog[] {
    return this.moments;
  }

  public getClosestMarginMm(): number | null {
    if (this.bestMargin < 120 && this.bestMargin > 0) {
      return Math.max(0.1, +(this.bestMargin * 0.25).toFixed(1));
    }
    return null;
  }

  public getClosestTierLabel(): string {
    if (this.bestMargin <= 8) return t('replay.tierGod');
    if (this.bestMargin <= 16) return t('replay.tierExtreme');
    if (this.bestMargin <= 24) return t('replay.tierClose');
    return t('replay.tierSafe');
  }

  public getHighlightSummary(): string {
    if (this.bestClimaxSnapshot && this.bestMargin < 120) {
      const mm = Math.max(0.1, +(this.bestMargin * 0.25).toFixed(1));
      const tier = t(
        this.bestMargin <= 8
          ? 'replay.tierShortGod'
          : this.bestMargin <= 16
          ? 'replay.tierShortExtreme'
          : 'replay.tierShortClose'
      );
      return t('replay.highlight', {
        round: this.bestClimaxSnapshot.round,
        event: this.bestClimaxSnapshot.eventName,
        tier,
        mm,
      });
    }
    const last = this.moments[this.moments.length - 1];
    return last ? last.description : t('replay.firstTrial');
  }
}
