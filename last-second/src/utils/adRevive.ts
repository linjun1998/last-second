import { pick } from '../i18n';
/**
 * Pluggable Rewarded Revive Interface (1 per run).
 * Currently uses a local mock button confirmation; replace `customReviveHandler`
 * via `setCustomReviveAdHandler` when integrating a real ad SDK (WeChat / Douyin / H5 Ads).
 */
export interface ReviveAdResult {
  rewarded: boolean;
  reason?: string;
}

export type ReviveAdHandler = () => Promise<ReviveAdResult>;

let customReviveHandler: ReviveAdHandler | null = null;

export function setCustomReviveAdHandler(handler: ReviveAdHandler | null): void {
  customReviveHandler = handler;
}

export async function requestRewardedRevive(): Promise<ReviveAdResult> {
  if (customReviveHandler) {
    try {
      return await customReviveHandler();
    } catch {
      return { rewarded: false, reason: pick('复活失败，请重试', 'Revive failed — please try again') };
    }
  }

  // Mock ad playback delay (350ms) so UI state transitions feel natural and testable
  await new Promise((resolve) => window.setTimeout(resolve, 350));
  return { rewarded: true };
}
