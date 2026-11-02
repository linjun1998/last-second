import { EventId } from '../data/eventConfig';

export interface ChallengePayload {
  seed: string;
  customSequence?: EventId[];
  creatorScore?: number;
  creatorRound?: number;
  title?: string;
}

const EVENT_SHORT_CODES: Record<EventId, string> = {
  closing_wall: 'CW',
  moving_obstacle: 'MO',
  rotating_blade: 'RB',
  shrinking_zone: 'SZ',
  narrow_corridor: 'NC',
  sudden_drop: 'SD',
  direction_invert: 'DI',
  fake_safety: 'FS',
  darkness_ambush: 'DA',
  chain_sweep: 'CS',
  razor_gate: 'RG',
  frenzy_gauntlet: 'FG',
};

const CODE_TO_EVENT: Record<string, EventId> = Object.entries(EVENT_SHORT_CODES).reduce(
  (acc, [k, v]) => {
    acc[v] = k as EventId;
    return acc;
  },
  {} as Record<string, EventId>
);

export function encodeChallengeCode(payload: ChallengePayload): string {
  const seedPart = payload.seed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'LS2026';
  if (!payload.customSequence || payload.customSequence.length === 0) {
    if (payload.creatorRound && payload.creatorScore) {
      return `LS-${seedPart}-R${payload.creatorRound}S${payload.creatorScore}`;
    }
    return `LS-${seedPart}`;
  }
  const seqStr = payload.customSequence.map((id) => EVENT_SHORT_CODES[id] || 'CW').join('');
  return `LSC-${seedPart}-${seqStr}`;
}

export function decodeChallengeCode(code: string): ChallengePayload | null {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;

  if (trimmed.startsWith('LSC-')) {
    const parts = trimmed.split('-');
    if (parts.length >= 3) {
      const seed = parts[1] || 'CUSTOM';
      const rawSeq = parts[2] || '';
      const customSequence: EventId[] = [];
      for (let i = 0; i < rawSeq.length; i += 2) {
        const pair = rawSeq.slice(i, i + 2);
        if (CODE_TO_EVENT[pair]) {
          customSequence.push(CODE_TO_EVENT[pair]);
        }
      }
      if (customSequence.length > 0) {
        return { seed, customSequence };
      }
    }
  }

  if (trimmed.startsWith('LS-')) {
    const parts = trimmed.split('-');
    const seed = parts[1] || 'LS2026';
    let creatorRound: number | undefined;
    let creatorScore: number | undefined;
    if (parts[2]) {
      const m = parts[2].match(/R(\d+)S(\d+)/);
      if (m) {
        creatorRound = parseInt(m[1], 10);
        creatorScore = parseInt(m[2], 10);
      }
    }
    return { seed, creatorRound, creatorScore };
  }

  // Fallback: treat plain alphanumeric string as seed
  if (/^[A-Z0-9]{4,12}$/.test(trimmed)) {
    return { seed: trimmed };
  }

  return null;
}

export function buildChallengeUrl(payload: ChallengePayload): string {
  const code = encodeChallengeCode(payload);
  const url = new URL(window.location.href);
  url.searchParams.set('c', code);
  return url.toString();
}

export function parseChallengeFromUrl(): ChallengePayload | null {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('c') || url.searchParams.get('seed');
    if (!code) return null;
    return decodeChallengeCode(code);
  } catch {
    return null;
  }
}

export function clearChallengeFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('c') || url.searchParams.has('seed')) {
      url.searchParams.delete('c');
      url.searchParams.delete('seed');
      window.history.replaceState({}, '', url.toString());
    }
  } catch {
    // Ignore
  }
}
