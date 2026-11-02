/**
 * 统计事件接口（上线前占位版）
 *
 * 现在只在本地打印日志，不向任何服务器发送数据。
 * 以后要接真实统计（比如自建接口、Umami、GA）时，只改这个文件里的
 * sendToAnalytics 函数即可，业务代码里埋的 track(...) 调用不用动。
 *
 * 事件清单：
 * - game_start  开始一局        props: { seed, isCustomChallenge }
 * - death       死亡（翻车）    props: { round, survivedRounds, lostScore, closestMm }
 * - cash_out    收手落袋        props: { rounds, score, safeBankedScore }
 * - revive      复活成功        props: { round }
 * - share       分享动作        props: { method }  method: copy_link / copy_code / video / poster
 */

export type AnalyticsEventName = 'game_start' | 'death' | 'cash_out' | 'revive' | 'share';

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  props: Record<string, unknown>;
  ts: number;
}

function sendToAnalytics(event: AnalyticsEvent): void {
  // 占位实现：仅本地日志。控制台过滤 [analytics] 即可看到全部事件。
  // TODO(上线后): 在这里换成真实上报，例如
  //   navigator.sendBeacon('/api/analytics', JSON.stringify(event))
  console.info('[analytics]', event.name, event.props);
}

export function track(name: AnalyticsEventName, props: Record<string, unknown> = {}): void {
  const event: AnalyticsEvent = { name, props, ts: Date.now() };
  try {
    sendToAnalytics(event);
  } catch {
    // 统计失败绝不能影响游戏本身
  }
  try {
    window.dispatchEvent(new CustomEvent<AnalyticsEvent>('ls-analytics', { detail: event }));
  } catch {
    // ignore
  }
}
