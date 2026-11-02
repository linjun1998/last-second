import { useSyncExternalStore } from 'react';

/**
 * 轻量双语系统（中 / 英），无第三方依赖。
 *
 * - 默认语言：先看本地保存的手动选择；没有保存过就跟随浏览器语言
 *   （浏览器语言以 zh 开头用中文，其它一律英文）。
 * - 手动切换：调用 setLang()，选择会被存到 localStorage，下次打开还记得。
 * - 组件里用 useLang() 订阅当前语言，用 t('key') 取文案；
 * - 非组件代码（游戏引擎等）直接用 t()，它读的是同一份当前语言状态。
 */

export type Lang = 'zh' | 'en';

const LANG_STORAGE_KEY = 'last_second_lang_v1';

function detectInitialLang(): Lang {
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // ignore
  }
  const nav = (navigator.language || 'en').toLowerCase();
  return nav.startsWith('zh') ? 'zh' : 'en';
}

let currentLang: Lang = detectInitialLang();
const listeners = new Set<() => void>();

function applyDocumentLang(): void {
  try {
    document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
  } catch {
    // ignore
  }
}
applyDocumentLang();

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  if (lang === currentLang) return;
  currentLang = lang;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
  applyDocumentLang();
  listeners.forEach((fn) => fn());
}

export function toggleLang(): void {
  setLang(currentLang === 'zh' ? 'en' : 'zh');
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => 'zh' as Lang);
}

/** 文案字典：key -> { zh, en }。组件和引擎共用。 */
export const STR: Record<string, { zh: string; en: string }> = {
  // 通用
  'common.settings': { zh: '设置', en: 'Settings' },
  'common.close': { zh: '关闭', en: 'Close' },
  'common.back': { zh: '返回', en: 'Back' },
  'common.privacy': { zh: '隐私说明', en: 'Privacy' },
  'home.firstRunHint': { zh: '第一局有慢速引导，放心点 · 按住蓄力，松手冲刺', en: 'First run has a slowed-down guide · hold to charge, release to dash' },
  'common.language': { zh: '语言 / Language', en: 'Language / 语言' },

  // 横竖屏提示
  'hint.rotate': {
    zh: '横屏也能玩，竖屏体验更好',
    en: 'Landscape works, but portrait feels better',
  },
  'hint.rotate.dismiss': { zh: '知道了', en: 'Got it' },

  // 隐私说明页
  'privacy.title': { zh: '隐私说明', en: 'Privacy Notice' },
  'privacy.updated': { zh: '最后一秒 LAST SECOND · 更新于 2026 年 11 月', en: 'LAST SECOND · Updated Nov 2026' },
  'privacy.intro': {
    zh: '一句话版：这个游戏不注册、不登录，不收集你的姓名、手机号等个人信息；你的成绩只存在你自己的浏览器里。',
    en: 'In short: no accounts, no sign-up, and no personal data like your name or phone number. Your records live only in your own browser.',
  },
  'privacy.h1': { zh: '我们存了什么', en: 'What is stored' },
  'privacy.b1': {
    zh: '游戏设置、最高分、历史战绩、皮肤与成就进度，都只保存在你本机的浏览器存储（localStorage）里，不会上传到服务器。你清除浏览器数据，这些记录就会一并消失。',
    en: 'Settings, best scores, run history, skins and achievements are kept only in your browser\u2019s local storage (localStorage) and are never uploaded. Clearing your browser data deletes them.',
  },
  'privacy.h2': { zh: '我们不收集什么', en: 'What we do not collect' },
  'privacy.b2': {
    zh: '不收集姓名、电话、邮箱、通讯录、精确位置，也不读取你设备上的其它应用数据。游戏不需要任何账号，打开就能玩。',
    en: 'We do not collect your name, phone, email, contacts or precise location, and we never read data from other apps. No account is needed to play.',
  },
  'privacy.h3': { zh: '统计数据', en: 'Analytics' },
  'privacy.b3': {
    zh: '游戏内部预留了统计事件接口（开始游戏、死亡、收手、复活、分享），目前只在你本机的浏览器控制台里打印日志，不联网、不上报。将来如果启用联网统计，我们会先更新这份说明。',
    en: 'The game reserves analytics events (game start, death, cash-out, revive, share). For now they only print to your local browser console \u2014 nothing is sent over the network. If that ever changes, this notice will be updated first.',
  },
  'privacy.h4': { zh: '分享功能', en: 'Sharing' },
  'privacy.b4': {
    zh: '当你主动点击分享或复制挑战链接时，浏览器会把挑战码和战绩文案复制到剪贴板，或调起你系统自带的分享面板。发不发、发给谁，完全由你决定，游戏不会自动发送任何内容。',
    en: 'When you tap share or copy a challenge link, your browser copies the challenge code and result text to the clipboard, or opens your system share sheet. Nothing is ever sent automatically \u2014 what you share and with whom is entirely up to you.',
  },
  'privacy.h5': { zh: '第三方与广告', en: 'Third parties & ads' },
  'privacy.b5': {
    zh: '当前版本没有接入任何第三方统计、广告或登录 SDK，也没有出售或共享数据的行为。游戏里的\u201c免费复活\u201d是内置功能，不播放任何广告，也不需要付费。',
    en: 'The current version includes no third-party analytics, advertising or login SDKs, and no data is sold or shared. The in-game \u201cfree revive\u201d is a built-in feature: it plays no ads and costs nothing.',
  },
  'privacy.h6': { zh: '联系我们', en: 'Contact' },
  'privacy.b6': {
    zh: '对这份说明有疑问，可以通过发布这个游戏的页面或社群渠道联系开发者。',
    en: 'Questions about this notice? Reach the developer through the page or community channel where you found this game.',
  },
  'common.shards': { zh: '碎片', en: 'Shards' },
  'common.scorePts': { zh: '{n} 分', en: '{n} pts' },

  // 主页
  'home.bestScore': { zh: '最高 {score} 分', en: 'Best {score} pts' },
  'home.bestRound': { zh: '极限 {round} 轮', en: 'Best round {round}' },
  'home.achievements': { zh: '成就 {done}/{total}', en: 'Achievements {done}/{total}' },
  'home.tagline': { zh: '巨型机芯 · 单指时间火花试炼', en: 'Giant movement · one-finger Time Spark trial' },
  'home.shardsTitle': { zh: '时间碎片余额 · 点击打开皮肤工坊', en: 'Time Shards balance · tap to open the skin workshop' },
  'home.mute': { zh: '静音', en: 'Mute' },
  'home.unmute': { zh: '开启声音', en: 'Unmute' },
  'home.logoAria': { zh: 'LAST SECOND 最后一秒', en: 'LAST SECOND' },
  'home.brandSub': { zh: '最后一秒', en: 'LAST SECOND' },
  'home.slogan.1': { zh: '秒针扫过之前，你能活到第几轮？', en: 'Before the second hand sweeps past — how many rounds can you survive?' },
  'home.slogan.2': { zh: '发条越收越紧，见好就收还是再赌一秒？', en: 'The mainspring winds tighter. Bank it, or bet one more second?' },
  'home.slogan.3': { zh: '听见擒纵轮咬合了吗？再坚持最后一秒。', en: 'Hear the escapement bite? Hold on for the last second.' },
  'home.slogan.4': { zh: '整点报时将至，这一次你可能真的躲不过去了。', en: 'The hour chime is coming — this time you may not dodge it.' },
  'home.challengeReceived': { zh: '收到同机芯挑战书', en: 'Same-movement challenge received' },
  'home.challengeBodyRound': { zh: '好友在同一座钟表序列中活到了第 {round} 轮（{score} 分）。相同指针与反转，敢不敢破纪录？', en: 'A friend survived to round {round} ({score} pts) on this same clockwork sequence. Same hands, same twists — dare to beat it?' },
  'home.challengeBodyCustom': { zh: '好友亲手编排了 {count} 阶致命钟表机关，等你化作时间火花闯关。', en: 'A friend hand-built {count} deadly clockwork traps. Become the Time Spark and break through.' },
  'home.challengeBodyDefault': { zh: '完全一致的指针轨迹与难度曲线，纯凭反应与胆识一决高下。', en: 'Identical hand paths and difficulty curve — pure reflexes and nerve.' },
  'home.acceptChallenge': { zh: '迎战相同机芯', en: 'Take the challenge' },
  'home.normalMode': { zh: '普通模式', en: 'Normal mode' },
  'home.start': { zh: '开始', en: 'Start' },
  'home.dailyDial': { zh: '每日表盘', en: 'Daily Dial' },
  'home.skinNew': { zh: '可换新皮肤', en: 'New skin ready' },
  'home.skinAch': { zh: '皮肤与成就', en: 'Skins & Achievements' },
  'home.friendSame': { zh: '好友同局', en: 'Friend Duel' },
  'home.todayGoals': { zh: '今日目标 ({done}/3 已完成)', en: "Today's goals ({done}/3 done)" },
  'home.dailyPending': { zh: ' · 每日表盘待挑战', en: ' · Daily Dial not attempted' },
  'home.todayBest': { zh: ' · 今日最佳 {score}', en: ' · Today best {score}' },
  'home.details': { zh: '详情 →', en: 'Details →' },
  'home.questDone': { zh: '已完成', en: 'Done' },
  'home.legendHold': { zh: '按住蓄力拖动时间火花', en: 'Hold to charge, drag the Time Spark' },
  'home.legendSafe': { zh: '◇双环=安全', en: '◇ rings = safe' },
  'home.legendWarn': { zh: '△斜纹=预警', en: '△ hatch = warning' },
  'home.legendLethal': { zh: '✦锯齿=致死', en: '✦ jagged = lethal' },
  'home.keysHint': { zh: 'Space / Enter 快速开始 · Esc 设置', en: 'Space / Enter to start · Esc for settings' },

  // 游戏中 HUD 与弹窗
  'game.frenzyBurst': { zh: '· 整点报时爆发', en: '· On-the-hour chime frenzy' },
  'game.combo': { zh: '{combo} 连击 (+{pct}%)', en: '{combo} combo (+{pct}%)' },
  'game.modifierPrefix': { zh: '机芯词缀：{label}', en: 'Modifier: {label}' },
  'game.shardHint': { zh: '✦ 金色时间碎片：高分诱惑（紧贴危险边缘）', en: '✦ Golden Time Shard: big points, hugging the danger edge' },
  'game.lethalNow': { zh: '✦ 锯齿红区 · 已致死', en: '✦ Jagged red zone · lethal now' },
  'game.lastSecondWindow': { zh: '⚡ 最后一秒窗口 {sec}s!', en: '⚡ Last-second window {sec}s!' },
  'game.warnCountdown': { zh: '△ 斜纹预警 {sec}s', en: '△ Warning {sec}s' },
  'game.warnOnly': { zh: '△ 斜纹预警', en: '△ Warning' },
  'game.cashingOut': { zh: '正在锁入发条金库', en: 'Locking into the mainspring vault' },
  'game.unsettledRisk': { zh: '悬空时间筹码（失手清零）', en: 'Unsettled time chips (lost if you fall)' },
  'game.unsettled': { zh: '悬空未结算分', en: 'Unsettled score' },
  'game.banked': { zh: '存档保底 {score}', en: 'Banked floor {score}' },
  'game.bankedHint': { zh: '第5轮锁50%保底', en: 'Round 5 locks a 50% floor' },
  'game.dailySeed': { zh: '每日 #{seed}', en: 'Daily #{seed}' },
  'game.guide1Title': { zh: '新手引导 1/2：按住屏幕任意位置为时间火花蓄力（齿轮已为你放慢）', en: 'Guide 1/2: press and hold anywhere to charge the Time Spark (gears slowed for you)' },
  'game.guide2Title': { zh: '新手引导 2/2：拖动瞄准表盘内 ◇ SAFE 双环缺口，松手瞬间冲刺！', en: 'Guide 2/2: drag to aim at the ◇ SAFE ring gap inside the dial, release to dash!' },
  'game.guideLegendSafe': { zh: '◇ 青色双环 = 安全', en: '◇ Cyan rings = safe' },
  'game.guideLegendWarn': { zh: '△ 斜纹虚线 = 预警（最后0.25s冲出+50%）', en: '△ Hatched dashes = warning (dash in the final 0.25s for +50%)' },
  'game.guideLegendLethal': { zh: '✦ 菱网锯齿 = 致死', en: '✦ Diamond mesh = lethal' },
  'game.reviveVerifying': { zh: '回拨发条验证中...', en: 'Rewinding mainspring...' },
  'game.reviveBtn': { zh: '免费复活一次（每局 1 次）', en: 'Free revive (1 per run)' },
  'game.exportVideo': { zh: '一键生成慢镜短视频并分享', en: 'Make a slow-mo clip & share' },
  'game.skipReplay': { zh: '跳过回放', en: 'Skip replay' },
  'game.skipReplayResult': { zh: '跳过回放看结算', en: 'Skip to results' },
  'game.viewResult': { zh: '直接查看战绩', en: 'View results' },
  'game.cashOutNow': { zh: '见好就收 · 落袋 {score} 分', en: 'Cash out · bank {score} pts' },
  'game.reviveTitle': { zh: '第 {round} 轮火花熄灭 · 逆转时间窗口', en: 'Round {round}: spark out · rewind window' },
  'game.reviveOnce': { zh: '每局仅限 1 次回拨', en: 'One rewind per run' },
  'game.reviveAtRisk': { zh: '未结算分', en: 'Unsettled points' },
  'game.reviveBanked': { zh: '已存入的保底分', en: 'Banked floor' },
  'game.missedClueLabel': { zh: '△ 刚才错过的机芯线索：', en: '△ The clue you missed: ' },
  'game.reviveNote': { zh: '回拨复活后将保留全部悬空筹码与连击，从第 {round} 轮起点重新迎战同一钟表机关。', en: 'Reviving keeps all unsettled chips and your combo; you restart round {round} against the same clockwork trap.' },
  'game.declineRevive': { zh: '结算 · {score} 分', en: 'Settle · {score} pts' },
  'game.reviveAdLoading': { zh: '正在准备复活…', en: 'Preparing revive…' },
  'game.reviveAd': { zh: '免费复活一次', en: 'Free revive' },
  'game.pressureCritical': { zh: '不着急 · 想清楚再选', en: 'No rush · decide when you are ready' },
  'game.pressureNormal': { zh: '本轮已过关 · 收手或继续，你说了算', en: 'Round cleared · bank it or continue — your call' },
  'game.threatLevel': { zh: '机芯威胁 Lv.{level}', en: 'Threat Lv.{level}' },
  'game.roundCleared': { zh: '第 {round} 轮逃生成功', en: 'Round {round} cleared' },
  'game.comboBonus': { zh: '连击 {combo} (+{pct}% 加成)', en: 'Combo {combo} (+{pct}% bonus)' },
  'game.checkpointHit': { zh: '第 {round} 轮存档齿轮啮合！自动锁入 50% 保底分', en: 'Round {round}: checkpoint gear engaged! 50% floor auto-banked' },
  'game.checkpointDeposit': { zh: '+{amount}（累计保底 {total}）', en: '+{amount} (floor total {total})' },
  'game.bankedSoFar': { zh: '已锁保底分：', en: 'Banked floor:' },
  'game.nextCheckpoint': { zh: '再过 {n} 轮（第 {round} 轮）自动锁入 50% 保底', en: 'In {n} rounds (round {round}), 50% auto-banks' },
  'game.currentStake': { zh: '当前悬空筹码', en: 'Current unsettled chips' },
  'game.nextMult': { zh: '下一轮倍率升至 x{mult}', en: 'Next round multiplier rises to x{mult}' },
  'game.lossWarnPre': { zh: '下一轮若被指针吞噬，将损失悬空 ', en: 'Fall next round and you lose the unsettled ' },
  'game.lossWarnUnit': { zh: ' 分', en: ' pts' },
  'game.lossWarnKeep': { zh: '（保底 {score} 分保留）', en: '(your {score} pt floor stays)' },
  'game.lossWarnZero': { zh: '（直接归零）', en: '(down to zero)' },
  'game.reviveLeft': { zh: '剩1次回拨', en: '1 rewind left' },
  'game.noRevive': { zh: '无复活机会', en: 'No revive left' },
  'game.cashOutBtn': { zh: '见好就收 · +{score}', en: 'Cash out · +{score}' },
  'game.continueBtn': { zh: '继续上弦 · 冲 x{mult}', en: 'Wind on · chase x{mult}' },

  // 挑战弹窗
  'challenge.title': { zh: '每日表盘（本地成绩）与挑战码对决', en: 'Daily Dial (local scores) & code duels' },
  'challenge.subtitle': { zh: '本机离线存储 · 相同种子拥有完全一致的指针角度与反转时机', en: 'Stored offline on this device · same seed = identical hand angles & twist timing' },
  'challenge.tabDaily': { zh: '每日挑战（本地成绩）', en: 'Daily (local)' },
  'challenge.tabEnter': { zh: '输入挑战码', en: 'Enter code' },
  'challenge.tabCreate': { zh: '自制组合', en: 'Custom combo' },
  'challenge.tabHistory': { zh: '历史 ({n})', en: 'History ({n})' },
  'challenge.invalidCode': { zh: '请输入有效的挑战码（如 LS-8K9P2A）或 4~12 位字母数字种子', en: 'Enter a valid challenge code (e.g. LS-8K9P2A) or a 4–12 character seed' },
  'challenge.dailySeedLine': { zh: '{date} 每日固定种子', en: '{date} daily fixed seed' },
  'challenge.localNote': { zh: '本地成绩（非联网排行）', en: 'Local scores (not an online board)' },
  'challenge.dailyBest': { zh: '今日你的本地最佳：{score} 分（已挑战 {n} 次） · 下方为本机记录与预设目标线对比', en: 'Your local best today: {score} pts ({n} attempts) · your records vs preset target lines below' },
  'challenge.dailyNone': { zh: '今日尚未留下本地成绩 · 下方各档位为离线预设目标参考线，并非真人联网排行', en: 'No local score yet today · the tiers below are offline preset targets, not real online rankings' },
  'challenge.startDaily': { zh: '挑战今日种子', en: "Play today's seed" },
  'challenge.colTier': { zh: '档位', en: 'Tier' },
  'challenge.colScore': { zh: '本地成绩 / 预设目标线', en: 'Local score / target line' },
  'challenge.colSurvive': { zh: '存活', en: 'Rounds' },
  'challenge.colMargin': { zh: '最险擦边', en: 'Closest call' },
  'challenge.colFinal': { zh: '结算分', en: 'Score' },
  'challenge.roundsUnit': { zh: '{n}轮', en: '{n} rds' },
  'challenge.enterLabel': { zh: '粘贴朋友发来的挑战码或输入任意 6 位种子', en: "Paste a friend's challenge code or type any 6-char seed" },
  'challenge.enterPlaceholder': { zh: '例如：LS-7H3K9P', en: 'e.g. LS-7H3K9P' },
  'challenge.enterBtn': { zh: '进入挑战', en: 'Enter' },
  'challenge.presetsTitle': { zh: '官方精选挑战组合（规则公开透明）', en: 'Featured challenge combos (rules fully open)' },
  'challenge.challengeBtn': { zh: '挑战', en: 'Play' },
  'challenge.customCopyText': { zh: '我为你定制了一局《最后一秒 LAST SECOND》死亡机关组合（挑战码：{code}），敢不敢来试试？ {url}', en: 'I built you a custom LAST SECOND death-trap combo (code: {code}). Dare to try it? {url}' },
  'challenge.seqLabel': { zh: '已编排危险序列（点击标签可移除，最多 8 阶循环）', en: 'Your trap sequence (tap a tag to remove, up to 8 looping)' },
  'challenge.seedLabel': { zh: '种子 #{seed}', en: 'Seed #{seed}' },
  'challenge.seqEmpty': { zh: '请从下方点击添加至少 1 个危险机关', en: 'Tap below to add at least 1 hazard' },
  'challenge.addTitle': { zh: '点击加入 12 种危险机关：', en: 'Tap to add from 12 hazards:' },
  'challenge.catHorror': { zh: '心理反转', en: 'Mind twist' },
  'challenge.catFrenzy': { zh: '狂热连击', en: 'Frenzy chain' },
  'challenge.catExtreme': { zh: '极限擦边', en: 'Extreme graze' },
  'challenge.copied': { zh: '已复制分享链接', en: 'Share link copied' },
  'challenge.copyLink': { zh: '复制好友挑战链接 ({code})', en: 'Copy friend challenge link ({code})' },
  'challenge.trySelf': { zh: '自己先试玩', en: 'Try it myself' },
  'challenge.historyEmpty': { zh: '暂无挑战记录，快去开启你的第一局逃生吧！', en: 'No runs yet — go start your first escape!' },
  'challenge.outcomeCash': { zh: '收手成功', en: 'Cashed out' },
  'challenge.outcomeFail': { zh: '贪婪失败', en: 'Greed got you' },
  'challenge.histRounds': { zh: '{n} 轮', en: '{n} rounds' },
  'challenge.histScore': { zh: '{score} 分', en: '{score} pts' },
  'challenge.histBanked': { zh: '保底 {score} 分 (失 {lost})', en: 'Floor {score} pts (lost {lost})' },
  'challenge.histLost': { zh: '痛失 {lost}', en: 'Lost {lost}' },
  'challenge.rematch': { zh: '重战此局', en: 'Rematch' },
  'challenge.preset1.label': { zh: '停摆假时间试炼', en: 'Stalled-Time Trial' },
  'challenge.preset1.desc': { zh: '机芯窄缝 · 停摆的假时间 · 指针倒转 · 停摆的假时间 · 整点报时狂热', en: 'Movement Slit · Stalled-Time Mirage · Reversing Hands · Stalled-Time Mirage · Hour-Chime Storm' },
  'challenge.preset2.label': { zh: '秒针毫厘擦边连击', en: 'Millimeter Graze Chain' },
  'challenge.preset2.desc': { zh: '机芯窄缝 · 游丝一线天 · 秒针横扫 · 游丝一线天', en: 'Movement Slit · Hairspring Razor · Second-Hand Sweep · Hairspring Razor' },
  'challenge.preset3.label': { zh: '午夜停摆噩梦', en: 'Midnight Stall Nightmare' },
  'challenge.preset3.desc': { zh: '夜光停摆 · 报时重锤 · 停摆的假时间 · 双针合围', en: 'Midnight Blackout · Chime Hammer · Stalled-Time Mirage · Twin-Wave Hands' },

  // 成长工坊
  'prog.title': { zh: '时间火花工坊与生涯成就', en: 'Time Spark Workshop & Career Achievements' },
  'prog.subtitle': { zh: '所有碎片、皮肤、任务与成就均保存在当前设备本地', en: 'All shards, skins, quests and achievements are stored on this device' },
  'prog.balanceLabel': { zh: '持有时间碎片', en: 'Time Shards held' },
  'prog.tabSkins': { zh: '火花皮肤 ({a}/{b})', en: 'Spark skins ({a}/{b})' },
  'prog.tabQuests': { zh: '每日任务 ({a}/3)', en: 'Daily quests ({a}/3)' },
  'prog.tabAch': { zh: '成就 ({a}/{b})', en: 'Achievements ({a}/{b})' },
  'prog.equipped': { zh: '装备中', en: 'Equipped' },
  'prog.equip': { zh: '换上', en: 'Equip' },
  'prog.equippedFeedback': { zh: '已换上「{name}」', en: 'Equipped “{name}”' },
  'prog.unlockFeedback': { zh: '已解锁并装备「{name}」', en: 'Unlocked & equipped “{name}”' },
  'prog.unlockAchBonus': { zh: ' · 同时达成成就「{title}」(+{n} 碎片)', en: ' · also earned “{title}” (+{n} shards)' },
  'prog.questRewarded': { zh: '✓ 已奖励 +{n} 碎片', en: '✓ Rewarded +{n} shards' },
  'prog.questReward': { zh: '奖励 ✦ +{n}', en: 'Reward ✦ +{n}' },
  'prog.questsNote': { zh: '每天自动刷新 3 个轻量任务。对局结算时会自动统计进度并将时间碎片直接存入余额。', en: 'Three light quests refresh daily. Progress is tallied at settlement and shards go straight to your balance.' },
  'prog.achProgress': { zh: '已解锁 {a} / {b} 项成就', en: 'Unlocked {a} / {b} achievements' },
  'prog.achNote': { zh: '每项达成自动奖励时间碎片', en: 'Each one auto-rewards Time Shards' },
  'prog.achClaimed': { zh: '✓ 已领 +{n}', en: '✓ Claimed +{n}' },

  // 设置面板
  'settings.title': { zh: '手感、音频与无障碍设置', en: 'Feel, Audio & Accessibility' },
  'settings.closeAria': { zh: '关闭设置', en: 'Close settings' },
  'settings.sfxLabel': { zh: '机芯与蓄力音效', en: 'Movement & charge sounds' },
  'settings.sfxDesc': { zh: '12 阶发条棘轮蓄力声、冲刺释放、毫厘擦边与倒转预警音', en: '12-step ratchet charge, dash release, graze and reversal warning sounds' },
  'settings.musicLabel': { zh: '随轮数加速的钟表背景音乐', en: 'Clockwork music that speeds up by round' },
  'settings.musicDesc': { zh: '纯代码合成：随轮数逐步叠加摆锤、音乐盒拨弦、合成低音与整点钟琴', en: 'Fully synthesized: pendulum, music-box plucks, synth bass and hour chimes layer in by round' },
  'settings.vibLabel': { zh: '触觉震动与手感补偿', en: 'Haptics & feel compensation' },
  'settings.vibDescOn': { zh: '启用系统马达，在蓄力棘轮、冲刺与险过瞬间触发触觉震动', en: 'Uses the system motor for charge ratchets, dashes and near-miss moments' },
  'settings.vibDescOff': { zh: '启用重低音扬声器脉冲 + 表圈微弹视觉反馈，模拟真实机械振感', en: 'Uses bass speaker pulses + bezel micro-bounce visuals to mimic mechanical vibration' },
  'settings.vibNoteIos': { zh: '检测到 iOS 浏览器不支持系统震动接口，已自动切换为「重低音振感 + 边框微弹补偿」', en: 'iOS browsers lack the vibration API — switched to “bass haptics + bezel bounce” automatically' },
  'settings.vibNoteOther': { zh: '当前浏览器不支持系统震动接口，已自动启用「重低音振感 + 边框微弹补偿」', en: 'This browser lacks the vibration API — “bass haptics + bezel bounce” enabled automatically' },
  'settings.flashLabel': { zh: '减少闪烁和震动', en: 'Reduce flashes & shake' },
  'settings.flashDesc': { zh: '关闭强光闪屏、心跳红边闪烁、画面抖动与一切设备震动，护眼防眩晕', en: 'Turns off bright flashes, heartbeat red-edge pulses, screen shake and all device vibration' },
  'settings.scareLabel': { zh: '降低惊吓强度', en: 'Reduce scare intensity' },
  'settings.scareDesc': { zh: '减弱突然倒转音效与夜光停摆的暗角遮蔽幅度', en: 'Softens sudden reversal sounds and the blackout vignette' },
  'settings.motionLabel': { zh: '减少动态效果', en: 'Reduce motion' },
  'settings.motionDesc': { zh: '关闭顿帧、慢动作、粒子爆发与回放镜头切换', en: 'Turns off hitstop, slow motion, particle bursts and replay cuts' },
  'settings.langDesc': { zh: '默认跟随浏览器语言，可随时手动切换', en: 'Follows your browser language by default; switch anytime' },
  'settings.colorNotePre': { zh: '色觉无障碍支持已默认常驻：', en: 'Color-vision support is always on:' },
  'settings.colorSafe': { zh: ' ◇双同心环=安全', en: ' ◇ double rings = safe' },
  'settings.colorWarn': { zh: ' △45°斜纹+虚线=预警', en: ' △ 45° hatch + dashes = warning' },
  'settings.colorLethal': { zh: ' ✦菱网+外沿锯齿=致死', en: ' ✦ diamond mesh + jagged rim = lethal' },
  'settings.done': { zh: '完成并保存', en: 'Done & save' },

  // 结算页与分享
  'result.shareSuccess': { zh: '我在《最后一秒 LAST SECOND》巨型钟表试炼活到了第 {rounds} 轮{grazepart}，果断收手带走 {score} 分！同机芯挑战（#{seed}），你敢不敢超过我？ {url}', en: "I survived to round {rounds} in LAST SECOND's giant clockwork trial{graze} and cashed out with {score} pts! Same-movement challenge (#{seed}) — dare to beat me? {url}" },
  'result.shareGraze': { zh: '（最近擦边秒针仅 {mm}mm！）', en: ' (closest graze just {mm}mm!)' },
  'result.shareFail': { zh: '我在《最后一秒 LAST SECOND》第 {round} 轮贪心翻车，痛失 {lost} 悬空分{banked}！同一座钟表机关（#{seed}），你敢来试试吗？ {url}', en: 'Greed got me in LAST SECOND at round {round} — I lost {lost} unsettled pts{banked}! Same clockwork traps (#{seed}), dare to try? {url}' },
  'result.shareBanked': { zh: '（靠发条存档点保住 {n} 分）', en: ' (checkpoint saved {n} pts)' },
  'result.posterSubtitle': { zh: '最后一秒 · 巨型钟表毫厘对决战报', en: 'LAST SECOND · Giant Clockwork Millimeter Duel Report' },
  'result.posterClosest': { zh: '最近擦边秒针: {mm} mm', en: 'Closest graze: {mm} mm' },
  'result.posterHighlight': { zh: '本局高光瞬间', en: 'Run highlight' },
  'result.posterCash': { zh: '第 {n} 轮果断收手', en: 'Cashed out at round {n}' },
  'result.posterDecision': { zh: '最后逃生决策点复盘', en: 'Final escape decision replay' },
  'result.posterVs': { zh: '我的最近擦边 {mm}mm · 我的历史最佳 {best}mm', en: 'My closest {mm}mm · my personal best {best}mm' },
  'result.posterCode': { zh: '同机芯挑战码：{code}', en: 'Same-movement challenge code: {code}' },
  'result.posterFootnote': { zh: '输入挑战码，迎战完全一致的钟表指针！', en: 'Enter the code to face the identical clock hands!' },
  'result.dailySeed': { zh: '每日表盘 #{seed}', en: 'Daily Dial #{seed}' },
  'result.newBest': { zh: ' · 刷新生涯最高分', en: ' · New career best' },
  'result.home': { zh: '首页', en: 'Home' },
  'result.titleSuccess': { zh: '擒纵落锁 · 安全落袋为安', en: 'Escapement locked · safely banked' },
  'result.titleFail': { zh: '发条崩断 · 最后一秒失守', en: 'Mainspring snapped · fell at the last second' },
  'result.finalScore': { zh: '最终结算分', en: 'Final score' },
  'result.bankedLost': { zh: '存档保底 {a} · 失 {b}', en: 'Banked floor {a} · lost {b}' },
  'result.lostOnly': { zh: '痛失未结算 {n}', en: 'Lost unsettled {n}' },
  'result.includesBanked': { zh: '含存档保底 {n}', en: 'Includes banked floor {n}' },
  'result.survivedRounds': { zh: '生存轮数', en: 'Rounds survived' },
  'result.roundsVal': { zh: '{n} 轮', en: '{n} rounds' },
  'result.targetRounds': { zh: '标准目标 {n} 轮', en: 'Target {n} rounds' },
  'result.revivedTag': { zh: ' · 已回拨复活', en: ' · Rewound & revived' },
  'result.maxMult': { zh: '最高倍率', en: 'Top multiplier' },
  'result.maxCombo': { zh: '最长连击', en: 'Longest combo' },
  'result.lastSecondCount': { zh: '最后一秒 {n} 次', en: 'Last-second x{n}' },
  'result.shardsPicked': { zh: '局内拾取 {n} 枚', en: 'Picked up {n} in-run' },
  'result.shardsEarned': { zh: '本局收获时间碎片', en: 'Time Shards earned this run' },
  'result.balanceNow': { zh: '(当前持有 ✦ {n})', en: '(holding ✦ {n})' },
  'result.gotoSkins': { zh: '去换皮肤 / 看成就 →', en: 'Skins / achievements →' },
  'result.shardSurvival': { zh: '存活 +{n}', en: 'Survival +{n}' },
  'result.shardCash': { zh: '收手奖励 +{n}', en: 'Cash-out bonus +{n}' },
  'result.shardSkill': { zh: '险过/最后一秒 +{n}', en: 'Grazes / last-second +{n}' },
  'result.shardArena': { zh: '局内拾取 +{n}', en: 'In-run pickups +{n}' },
  'result.shardQuest': { zh: '每日任务 +{n}', en: 'Daily quests +{n}' },
  'result.shardAch': { zh: '新成就 +{n}', en: 'New achievements +{n}' },
  'result.questDoneLine': { zh: '✓ 今日任务达成：「{title}」(+{n} 碎片)', en: '✓ Quest done: “{title}” (+{n} shards)' },
  'result.achLine': { zh: '★ 解锁新成就：「{title}」— {desc} (+{n} 碎片)', en: '★ Achievement: “{title}” — {desc} (+{n} shards)' },
  'result.closestLabel': { zh: '最近擦边距离', en: 'Closest graze' },
  'result.noNearMiss': { zh: '未触发险过', en: 'No near miss' },
  'result.targetLines': { zh: '标准目标线 {a}mm · 大师线 {b}mm', en: 'Target {a}mm · master {b}mm' },
  'result.careerBestMm': { zh: ' · 生涯最佳 {mm}mm', en: ' · career best {mm}mm' },
  'result.yourBestRounds': { zh: '你的最佳 {n} 轮', en: 'Your best: {n} rounds' },
  'result.personalBestLine': { zh: '你的历史最佳 {mm}mm', en: 'Your best {mm}mm' },
  'result.bestScore': { zh: '最佳成绩', en: 'Best score' },
  'result.bestRoundsLine': { zh: '最佳 {n} 轮', en: 'Best {n} rounds' },
  'result.watchReplay': { zh: '看回放', en: 'Watch replay' },
  'result.hideReplay': { zh: '收起回放', en: 'Hide replay' },
  'result.showDetails': { zh: '详细数据', en: 'Details' },
  'result.hideDetails': { zh: '收起数据', en: 'Hide details' },
  'result.vsPrevCloser': { zh: '比你上一局近了 {d} 毫米', en: '{d}mm closer than your last run' },
  'result.vsPrevFarther': { zh: '比你上一局远了 {d} 毫米', en: '{d}mm farther than your last run' },
  'result.vsPrevSame': { zh: '和上一局的擦边距离差不多', en: 'About the same graze as your last run' },
  'result.weekRank': { zh: '这是你本周第 {rank} 好的成绩（本地记录）', en: 'Your #{rank} best score this week (local records)' },
  'result.shareDelta': { zh: '，比上一局还近了 {d}mm', en: ', {d}mm closer than my last run' },
  'game.decisionInfo': { zh: '现在收手可拿 {score} 分 · 继续下一轮倍率 x{next}；若失败，未结算分清零，已存保底分保留', en: 'Cash out now for {score} pts · next round pays x{next}; if you fall, unsettled points are lost and your banked floor stays' },
  'settings.decisionPressureLabel': { zh: '决策阶段心跳与律动', en: 'Decision-phase heartbeat & pulse' },
  'settings.decisionPressureDesc': { zh: '收手还是继续时，心跳声和分数律动会营造紧张感（强度已减半）。关掉后决策界面完全安静', en: 'A heartbeat and a pulsing score while you decide cash-out vs continue (intensity halved). Turn off for a completely calm decision screen' },
  'result.gaugeBestTitle': { zh: '你的历史最佳 {mm}mm', en: 'Your best {mm}mm' },
  'result.gauge1': { zh: '<2mm 超极限', en: '<2mm beyond-limit' },
  'result.gauge2': { zh: '2-4mm 极限', en: '2-4mm extreme' },
  'result.gauge3': { zh: '4-6mm 惊险', en: '4-6mm close' },
  'result.gauge4': { zh: '>6mm 安全区', en: '>6mm safe zone' },
  'result.gaugeTargetTitle': { zh: '标准目标线 {mm}mm', en: 'Target line {mm}mm' },
  'result.gaugeScale': { zh: '0.0mm 指针锋刃 → 10mm 安全区（灰线为本局标准目标线）', en: "0.0mm hand's edge → 10mm safe (grey line = this run's target)" },
  'result.beatMaster': { zh: '🏆 刷新了你自己的擦边纪录！', en: '🏆 A new personal graze record!' },
  'result.beatTarget': { zh: '就差一点 · 接近你的历史最佳', en: 'So close · near your personal best' },
  'result.tryHarder': { zh: '下次试着压到最后 0.25s 再松手', en: 'Next time, hold until the final 0.25s' },
  'result.pauseAria': { zh: '暂停回放', en: 'Pause replay' },
  'result.playAria': { zh: '播放回放', en: 'Play replay' },
  'result.scrubAria': { zh: '拖动回放进度', en: 'Scrub replay' },
  'result.replayHint': { zh: '拨动怀表复盘', en: 'Pocket-watch replay' },
  'result.framesUnit': { zh: '{a}/{b} 帧', en: '{a}/{b} frames' },
  'result.frameInfo': { zh: '第 {round} 轮 · {event}', en: 'Round {round} · {event}' },
  'result.replayFallback': { zh: '关键片段复盘', en: 'Key-moment replay' },
  'result.couldLive': { zh: ' · 这一瞬其实能活！', en: ' · You could have lived here!' },
  'result.jumpDecision': { zh: '定格最后逃生点', en: 'Freeze the last escape point' },
  'result.missedClueLabel': { zh: '△ 错过的机芯线索：', en: '△ Missed clue: ' },
  'result.exporting': { zh: '合成竖版短视频 {pct}%', en: 'Rendering vertical video {pct}%' },
  'result.videoDone': { zh: '短视频已生成并复制文案', en: 'Video ready, caption copied' },
  'result.exportVideo': { zh: '导出竖版高光短视频 (9:16)', en: 'Export vertical highlight video (9:16)' },
  'result.posterDownloaded': { zh: '对比海报已下载', en: 'Poster downloaded' },
  'result.downloadPoster': { zh: '下载钟表毫厘对比图', en: 'Download millimeter comparison poster' },
  'result.videoNoteOk': { zh: '竖版钟表高光短视频已导出，挑战文案已自动复制，可直接发抖音/视频号！', en: 'Vertical highlight exported and caption copied — ready to post!' },
  'result.videoNoteFallback': { zh: '当前环境不支持视频流编码，已为你自动切换导出高清钟表对比海报', en: 'Video encoding is not supported here — exported the HD comparison poster instead' },
  'result.shareTitle': { zh: '最后一秒 LAST SECOND', en: 'LAST SECOND' },
  'result.challengeCodeLine': { zh: '同机芯挑战码 {code}', en: 'Challenge code {code}' },
  'result.codeCopied': { zh: '已复制挑战码', en: 'Code copied' },
  'result.copyCode': { zh: '复制挑战码', en: 'Copy code' },
  'result.playAgain': { zh: '再玩一次', en: 'Play again' },
  'result.replaySame': { zh: '重玩同机芯', en: 'Replay same movement' },
  'result.linkCopied': { zh: '已复制挑战链接', en: 'Challenge link copied' },
  'result.challengeFriend': { zh: '挑战朋友', en: 'Challenge a friend' },
  'result.customBuild': { zh: '自制机芯', en: 'Custom movement' },

  // 引擎 / 回放 / 危险机关
  'engine.twist.fake_safety': { zh: '首次遭遇「停摆假象」：听双脉冲警报、见脚下 ⏸ 停摆圈过载，立即逃向对侧 ◇ 区！', en: 'First “Stalled-Time Mirage”: hear the double-pulse alarm, see the ⏸ overload ring under you — flee to the opposite ◇ zone!' },
  'engine.twist.direction_invert': { zh: '首次遭遇「指针倒转」：↺ 八角框是倒转诱饵，认准对侧预闪微光的 ◇ 真信标！', en: 'First “Reversing Hands”: the ↺ octagon is a decoy — trust the pre-flashing ◇ true beacon opposite!' },
  'engine.twist.darkness_ambush': { zh: '首次遭遇「午夜停电」：听声呐滴答音，顺着时间火花旁的青色指针弧冲刺！', en: 'First “Midnight Blackout”: follow the sonar ticks and the cyan hand arc beside your spark!' },
  'engine.twist.sudden_drop': { zh: '首次遭遇「报时重锤」：听锁定蜂鸣、避开 △ 十字准星落点，迅速冲向两侧安全区！', en: 'First “Chime Hammer”: hear the lock-on buzz, avoid the △ crosshair point, dash to a side safe zone!' },
  'engine.reviveBanner': { zh: '唯一复活机会 · 可保住全部悬空筹码', en: 'Your one revive · keeps every unsettled chip' },
  'engine.reviveMoment': { zh: '第 {round} 轮回拨发条重返赛场，保住 {score} 悬空筹码', en: 'Round {round}: rewound the mainspring and returned, keeping {score} unsettled chips' },
  'engine.reviveCallout': { zh: '↺ 发条回拨复活 · 筹码全额保留', en: '↺ Rewind revive · chips fully kept' },
  'engine.reviveHud': { zh: '发条回拨成功 · 慢镜护航重返本轮', en: 'Rewind successful · slow-mo escort back into the round' },
  'engine.cashMoment': { zh: '第 {round} 轮战胜贪婪，落袋 {score} 分', en: 'Round {round}: beat greed and banked {score} pts' },
  'engine.cashCallout': { zh: '成功落袋 +{score}', en: 'Banked +{score}' },
  'engine.cashHud': { zh: '战胜贪婪 · 奖励已锁定存入金库', en: 'Greed beaten · reward locked in the vault' },
  'engine.dashMoment': { zh: '第 {round} 轮极限冲刺', en: 'Round {round}: full-throttle dash' },
  'engine.shardCallout': { zh: '时间碎片 +{n}！快进青色区！', en: 'Time Shard +{n}! Get to the cyan zone!' },
  'engine.shardMoment': { zh: '第 {round} 轮冒险夺取危险边缘「时间碎片」+{n} 分', en: 'Round {round}: snatched a danger-edge Time Shard +{n} pts' },
  'engine.shardHud': { zh: '夺取时间碎片 +{n} 分 · 速回青色安全区！', en: 'Shard grabbed +{n} pts · get back to the cyan safe zone!' },
  'engine.labelCollision': { zh: '致命碰撞', en: 'Fatal hit' },
  'engine.labelGodlike': { zh: '超极限擦边', en: 'Beyond-limit graze' },
  'engine.labelExtreme': { zh: '极限擦边', en: 'Extreme graze' },
  'engine.labelClose': { zh: '惊险擦边', en: 'Close graze' },
  'engine.labelSafe': { zh: '安全机动', en: 'Safe move' },
  'engine.lastSecondCallout': { zh: '⚡ 最后一秒！剩 {sec}s (+50%)', en: '⚡ Last second! {sec}s left (+50%)' },
  'engine.lastSecondMoment': { zh: '第 {round} 轮压哨「最后一秒」冲出（距生效仅剩 {sec}s），本轮得分 +50%', en: 'Round {round}: buzzer-beating Last Second escape ({sec}s to spare), round score +50%' },
  'engine.lastSecondHud': { zh: '最后一秒冲出（剩 {sec}s）· 本轮得分 +50%', en: 'Last-second escape ({sec}s left) · round score +50%' },
  'engine.tierGodlike': { zh: '超极限神闪', en: 'Godlike flash' },
  'engine.tierExtreme': { zh: '极限擦边', en: 'Extreme graze' },
  'engine.tierClose': { zh: '惊险擦边', en: 'Close graze' },
  'engine.nearMissMoment': { zh: '第 {round} 轮{tier}仅差 {mm}mm', en: 'Round {round}: {tier}, just {mm}mm away' },
  'engine.nearMissHud': { zh: '{tier} · 距致死边缘仅 {mm}mm', en: '{tier} · {mm}mm from the lethal edge' },
  'engine.checkpointCallout': { zh: '存档点达成 · 锁入保底 +{n}', en: 'Checkpoint reached · floor banked +{n}' },
  'engine.checkpointMoment': { zh: '第 {round} 轮达成存档点，自动存入保底 {deposit} 分（累计保底 {total} 分）', en: 'Round {round}: checkpoint — auto-banked {deposit} pts (floor total {total})' },
  'engine.comboFrenzy': { zh: '狂热连击 x{n}!', en: 'Frenzy combo x{n}!' },
  'engine.comboBurst': { zh: '连击高潮 x{n}!', en: 'Combo surge x{n}!' },
  'engine.comboMoment': { zh: '达成 {n} 连击高潮', en: 'Hit a {n} combo surge' },
  'engine.bonusGodlike': { zh: '超极限神闪加成 +140 基础分', en: 'Godlike flash bonus +140 base pts' },
  'engine.bonusExtreme': { zh: '极限擦边加成 +85 基础分', en: 'Extreme graze bonus +85 base pts' },
  'engine.bonusClose': { zh: '惊险擦边加成 +45 基础分', en: 'Close graze bonus +45 base pts' },
  'engine.failMomentSaved': { zh: '第 {round} 轮死于「{event}」，损失悬空 {lost} 分，存档保底带走 {saved} 分', en: 'Round {round}: fell to “{event}”, lost {lost} unsettled pts, banked floor kept {saved}' },
  'engine.failMoment': { zh: '第 {round} 轮死于「{event}」，痛失 {lost} 未结算分', en: 'Round {round}: fell to “{event}”, lost {lost} unsettled pts' },
  'engine.dangerFallback': { zh: '危险', en: 'danger' },
  'engine.greedyClue': { zh: '贪吃危险边缘「时间碎片」后，未及时二次冲刺逃回青色区', en: 'Grabbed the danger-edge Time Shard, then failed to dash back to the cyan zone in time' },
  'engine.missedHud': { zh: '错过的线索：{text}', en: 'Missed clue: {text}' },
  'engine.deathReplayHud': { zh: '死亡慢镜复盘 · 标出最后逃生时机', en: 'Death slow-mo replay · last escape window marked' },
  'engine.failHudSaved': { zh: '挑战结束 · 存档点保住 {n} 分', en: 'Run over · checkpoint kept {n} pts' },
  'engine.failHud': { zh: '挑战失败 · 未结算奖励清零', en: 'Run failed · unsettled reward wiped' },
  'engine.lastSecondBonus': { zh: '最后一秒冲出（剩 {sec}s）+50%', en: 'Last-second escape ({sec}s left) +50%' },
  'engine.shardCanvasLabel': { zh: '✦ 时间碎片', en: '✦ Time Shard' },
  'engine.missedTag': { zh: '⚠ 错过的线索', en: '⚠ Missed clue' },
  'engine.escapeHint': { zh: '这里冲向 ◇ 青色区其实能活！', en: 'Dash to the ◇ cyan zone here and you live!' },
  'replay.fallbackSafe': { zh: '未在黄区读秒结束前冲入青色 SAFE 安全区', en: 'Did not reach the cyan SAFE zone before the yellow countdown ended' },
  'replay.fallbackLethal': { zh: '黄区预警读秒归零转为红区致死', en: 'The yellow warning hit zero and turned lethal red' },
  'replay.tierGod': { zh: '超极限神级擦边', en: 'Godlike beyond-limit graze' },
  'replay.tierExtreme': { zh: '极限刀尖擦边', en: 'Extreme knife-edge graze' },
  'replay.tierClose': { zh: '惊险擦边逃生', en: 'Thrilling graze escape' },
  'replay.tierSafe': { zh: '稳健安全闪避', en: 'Steady safe dodge' },
  'replay.tierShortGod': { zh: '超极限', en: 'Beyond-limit' },
  'replay.tierShortExtreme': { zh: '极限', en: 'Extreme' },
  'replay.tierShortClose': { zh: '惊险', en: 'Close' },
  'replay.highlight': { zh: '第 {round} 轮「{event}」{tier}擦边 {mm}mm', en: 'Round {round} “{event}”: {tier} graze at {mm}mm' },
  'replay.firstTrial': { zh: '完成首次生存试炼', en: 'Finished the first survival trial' },
  'hazard.echoLabel': { zh: '余震环爆发!', en: 'Aftershock ring!' },
  'hazard.echoReason': { zh: '「双波余震」词缀会在中心爆发第二道扩散环，需冲向新青色缺口', en: 'The Double Echo modifier bursts a second ring from the center — dash to the new cyan gap' },
  'hazard.echoBanner': { zh: '双波余震即将扩散！快冲向青色缺口', en: 'Double Echo about to burst! Dash to the cyan gap' },
  'hazard.modifierBanner': { zh: '词缀：{name}', en: 'Modifier: {name}' },
  'hazard.gateLabel': { zh: '闸门推进方向', en: 'Gate sweep direction' },
  'hazard.gateReason': { zh: '黄色闸门已标出横扫起点与豁口位置，需提前对准青色 SAFE 缺口', en: 'The yellow gate marks the sweep start and gap — line up with the cyan SAFE gap early' },
  'hazard.hammerLabelWarn': { zh: '重锤十字锁定!', en: 'Hammer cross locked!' },
  'hazard.hammerLabelHit': { zh: '重锤落点', en: 'Hammer impact' },
  'hazard.hammerReason': { zh: '黄色收缩准星与双音警报已锁定中心十字轴，必须冲向四角青色安全区', en: 'The shrinking yellow reticle and double beep lock the cross axis — dash to a corner cyan zone' },
  'hazard.hammerBanner': { zh: '重锤十字锁定！避开轴线冲向四角 SAFE', en: 'Hammer locked! Avoid the axis, dash to a corner SAFE' },
  'hazard.fakeLabel': { zh: '假出口? 信号闪烁', en: 'Fake exit? Signal flickering' },
  'hazard.fakeReason': { zh: '紫光闪烁圆环是伪造的假出口诱饵（伴有电流杂音），切勿提前盲冲', en: 'The flickering purple ring is a fake exit decoy (with static noise) — do not dash blindly' },
  'hazard.realLabel': { zh: '真信标 · 青色', en: 'TRUE beacon · cyan' },
  'hazard.realReason': { zh: '对侧早已浮现稳定的青色微光信标，那才是反转后的真实安全区', en: 'A steady cyan beacon already glows on the far side — that is the real safe zone after the twist' },
  'hazard.decoyLabel': { zh: '诱饵已失效!', en: 'Decoy exposed!' },
  'hazard.decoyReason': { zh: '紫圈是叛变的假出口诱饵，真实青色 SAFE 在对侧微光信标处', en: 'The purple ring is a traitor decoy — the real cyan SAFE is at the far-side beacon' },
  'hazard.invertBannerTwisted': { zh: '出口已反转！快冲向真青色 SAFE 环', en: 'Exit reversed! Dash to the true cyan SAFE ring' },
  'hazard.invertBanner': { zh: '信号干扰！紫圈是假诱饵，留意对侧青色微光', en: 'Signal jammed! The purple ring is fake — watch the far-side cyan glow' },
  'hazard.overloadLabel': { zh: '地面过载! 准备折返', en: 'Ground overload! Get ready to turn back' },
  'hazard.overloadReason': { zh: '第一波结束前脚下已亮起琥珀过载警报圈，预告原安全区即将反噬', en: 'Before wave 1 ends, an amber overload ring lights under you — the old safe zone is about to turn' },
  'hazard.overloadBanner': { zh: '脚下安全区充能过载！准备折返对面', en: 'The safe zone under you is overloading! Prepare to cross over' },
  'hazard.betrayLabel': { zh: '即将反噬! 快离开', en: 'About to turn! Leave now' },
  'hazard.betrayReason': { zh: '原安全区已发出过载闪烁与双音警报，必须立刻冲向对面新亮起的青色 SAFE', en: 'The old zone flashes overload warnings — dash now to the new cyan SAFE across the dial' },
  'hazard.betrayBanner': { zh: '假安全即将反噬！立即冲向对面新青色 SAFE', en: 'Fake safety about to turn! Dash to the new cyan SAFE opposite' },
  'hazard.turnedLabel': { zh: '原安全区反噬!', en: 'Old safe zone turned!' },
  'hazard.turnedReason': { zh: '原安全区在第一波后已提前闪烁琥珀/紫光过载线索，停留原地会被二次回杀', en: 'After wave 1 the old zone flashed amber/purple overload clues — staying means a second strike' },
  'hazard.turnedBanner': { zh: '假安全反噬！快冲向对面青色安全区', en: 'Fake safety turned! Dash to the cyan zone opposite' },
  'hazard.sonarLabel': { zh: '声呐缺口信标', en: 'Sonar gap beacon' },
  'hazard.sonarReason': { zh: '断电时声呐双脉冲响起，小球身旁的青色罗盘箭头与微光信标一直指明缺口方向', en: 'In the blackout, sonar double-pings sound and the cyan compass arrow by your spark points to the gap' },
  'hazard.darkBannerWarn': { zh: '断电伏击！听声呐音，顺小球旁青色箭头冲出', en: 'Blackout ambush! Follow the sonar and the cyan arrow by your spark' },
  'hazard.darkBanner': { zh: '暗影收缩中 · 停留在青色声呐缺口内', en: 'Shadows closing · stay inside the cyan sonar gap' },
  'hazard.nextCellLabel': { zh: '下波安全格', en: 'Next safe cell' },
  'hazard.nextCellReason': { zh: '连锁矩阵第二波会旋转 45° 切入原象限，需顺着预告移步下一安全格', en: 'Wave 2 of the chain matrix rotates 45° into this quadrant — move to the next safe cell as previewed' },
  'hazard.chainBanner': { zh: '矩阵即将旋转 45° · 准备切入下一格', en: 'Matrix rotating 45° soon · get ready to shift cells' },
  'hazard.wave2Label': { zh: '第2波激光线!', en: 'Wave 2 laser lines!' },
  'hazard.wave2Reason': { zh: '连锁矩阵已旋转 45° 封锁第一波位置，需横移一步进入 SAFE 2/2', en: 'The chain matrix rotated 45° and sealed wave 1 spots — sidestep into SAFE 2/2' },
  'hazard.wave2Banner': { zh: '第二波旋转封锁！快横移进 SAFE 2/2', en: 'Wave 2 rotation lockdown! Sidestep into SAFE 2/2' },
  'storage.tierLegend': { zh: '预设参考 · 传奇目标线', en: 'Preset target · Legend line' },
  'storage.tierMaster': { zh: '预设参考 · 大师目标线', en: 'Preset target · Master line' },
  'storage.tierAdvanced': { zh: '预设参考 · 进阶目标线', en: 'Preset target · Advanced line' },
  'storage.tierStarter': { zh: '预设参考 · 初学及格线', en: 'Preset target · Starter line' },
  'storage.myBest': { zh: '我的本地最佳', en: 'My local best' },
  'storage.myRecord': { zh: '我的本地记录 #{n}', en: 'My local record #{n}' },
  'video.unsupported': { zh: '当前浏览器不支持视频录制导出', en: 'This browser cannot record video exports' },
  'video.encodeFail': { zh: '视频编码失败', en: 'Video encoding failed' },
  'video.header': { zh: '最后一秒 · 第 {round} 轮 · {event}', en: 'LAST SECOND · Round {round} · {event}' },
  'video.subSuccess': { zh: '果断收手！活到第 {rounds} 轮带走 {score} 分', en: 'Cashed out! Survived {rounds} rounds and banked {score} pts' },
  'video.subFail': { zh: '发条崩断！痛失 {lost} 未结算积分', en: 'Mainspring snapped! Lost {lost} unsettled pts' },
  'video.subClue': { zh: '错过线索：{text}', en: 'Missed clue: {text}' },
  'video.subDecision': { zh: '慢镜复盘：这一秒冲向 ◇ SAFE 双环其实能活！', en: 'Slow-mo: dash to the ◇ SAFE rings this second and you live!' },
  'video.subNearMiss': { zh: '毫厘擦边！距离致死指针仅差 {mm} mm！', en: 'Millimeter graze! Just {mm} mm from the lethal hand!' },
  'video.missedTag': { zh: '△ 错过的线索', en: '△ Missed clue' },
  'video.statRounds': { zh: '生存轮数', en: 'Rounds survived' },
  'video.statMult': { zh: '最高倍率', en: 'Top multiplier' },
  'video.statMargin': { zh: '最近擦边', en: 'Closest graze' },
  'video.roundsVal': { zh: '{n} 轮', en: '{n} rounds' },
  'video.code': { zh: '同机芯挑战码: {code}', en: 'Same-movement code: {code}' },
  'video.cta': { zh: '相同钟表指针序列，你敢不敢活过这一秒？', en: 'Same clock-hand sequence — dare to survive this second?' },
};

/** 在一对中英文字段之间按当前语言挑选（供数据配置的 xxxEn 字段使用）。 */
export function pick(zh: string, en?: string): string {
  return getLang() === 'en' && en ? en : zh;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = STR[key];
  let text = entry ? entry[currentLang] ?? entry.zh : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}
