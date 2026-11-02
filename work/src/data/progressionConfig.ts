import { SeededRNG } from '../utils/random';

export type SparkSkinId =
  | 'classic_spark'
  | 'brass_gear'
  | 'chrono_hourglass'
  | 'lunar_eclipse'
  | 'emerald_hairspring'
  | 'crimson_pendulum'
  | 'royal_tourbillon';

export interface SparkSkinConfig {
  id: SparkSkinId;
  name: string;
  nameEn: string;
  cost: number;
  shapeDesc: string;
  shapeDescEn: string;
  trailDesc: string;
  trailDescEn: string;
  primaryColor: string;
  accentColor: string;
}

export const SPARK_SKINS: SparkSkinConfig[] = [
  {
    id: 'classic_spark',
    name: '曜白星火',
    nameEn: 'Radiant White Spark',
    cost: 0,
    shapeDesc: '四芒白金星核',
    shapeDescEn: 'Four-point white-gold star core',
    trailDesc: '金蓝菱形流火拖尾',
    trailDescEn: 'Gold-blue diamond flame trail',
    primaryColor: '#fde047',
    accentColor: '#38bdf8',
  },
  {
    id: 'brass_gear',
    name: '黄铜擒纵轮',
    nameEn: 'Brass Escapement Wheel',
    cost: 60,
    shapeDesc: '六齿旋转黄铜齿轮',
    shapeDescEn: 'Six-tooth spinning brass gear',
    trailDesc: '啮合微型齿圈拖尾',
    trailDescEn: 'Meshing micro gear-ring trail',
    primaryColor: '#f59e0b',
    accentColor: '#fef08a',
  },
  {
    id: 'chrono_hourglass',
    name: '流金沙漏',
    nameEn: 'Gilded Hourglass',
    cost: 120,
    shapeDesc: '双锥琥珀沙漏晶核',
    shapeDescEn: 'Twin-cone amber hourglass core',
    trailDesc: '流沙金粒丝带拖尾',
    trailDescEn: 'Flowing gold-sand ribbon trail',
    primaryColor: '#fbbf24',
    accentColor: '#fb923c',
  },
  {
    id: 'lunar_eclipse',
    name: '月相银弧',
    nameEn: 'Lunar Silver Arc',
    cost: 180,
    shapeDesc: '弦月星盘银蓝核心',
    shapeDescEn: 'Crescent astrolabe silver-blue core',
    trailDesc: '月蚀弯弧波纹拖尾',
    trailDescEn: 'Lunar-eclipse arc ripple trail',
    primaryColor: '#e2e8f0',
    accentColor: '#38bdf8',
  },
  {
    id: 'emerald_hairspring',
    name: '翠玉游丝',
    nameEn: 'Emerald Hairspring',
    cost: 260,
    shapeDesc: '同心翡翠螺旋游丝',
    shapeDescEn: 'Concentric emerald spiral hairspring',
    trailDesc: '双股青翠脉冲拖尾',
    trailDescEn: 'Twin emerald pulse trail',
    primaryColor: '#34d399',
    accentColor: '#a7f3d0',
  },
  {
    id: 'crimson_pendulum',
    name: '绯红摆锤',
    nameEn: 'Crimson Pendulum',
    cost: 360,
    shapeDesc: '红宝石棱枪尖核心',
    shapeDescEn: 'Ruby prism spear-tip core',
    trailDesc: '绯金折线电弧拖尾',
    trailDescEn: 'Crimson-gold zigzag arc trail',
    primaryColor: '#fb7185',
    accentColor: '#fde047',
  },
  {
    id: 'royal_tourbillon',
    name: '皇家陀飞轮',
    nameEn: 'Royal Tourbillon',
    cost: 500,
    shapeDesc: '双层逆旋金紫陀飞轮',
    shapeDescEn: 'Twin counter-rotating gold-violet tourbillon',
    trailDesc: '罗马刻度流光拖尾',
    trailDescEn: 'Roman-numeral light-stream trail',
    primaryColor: '#facc15',
    accentColor: '#c084fc',
  },
];

export function getSkinConfig(id: SparkSkinId): SparkSkinConfig {
  return SPARK_SKINS.find((s) => s.id === id) || SPARK_SKINS[0];
}

export interface AchievementDef {
  id: string;
  title: string;
  titleEn: string;
  desc: string;
  descEn: string;
  rewardShards: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_cash_out',
    title: '见好就收',
    titleEn: "Know When to Fold",
    desc: '首次主动选择稳妥收手并成功落袋',
    descEn: "Cash out voluntarily for the first time and bank your score",
    rewardShards: 20,
  },
  {
    id: 'last_second_streak_3',
    title: '连续3次最后一秒',
    titleEn: "Triple Last Second",
    desc: '单局内连续 3 轮触发“最后一秒（≤0.25s）”压哨冲出',
    descEn: "Trigger Last Second (≤0.25s) escapes 3 rounds in a row in one run",
    rewardShards: 60,
  },
  {
    id: 'untouched_round_5',
    title: '零擦碰通关第5轮',
    titleEn: "Untouched Through Round 5",
    desc: '全程零危险擦碰（距机关始终 >6mm）且未复活通关第 5 轮',
    descEn: "Clear round 5 with zero hazard grazes (always >6mm away) and no revive",
    rewardShards: 55,
  },
  {
    id: 'survive_round_5',
    title: '首道发条锁',
    titleEn: "First Mainspring Lock",
    desc: '单局存活达到第 5 轮并激活存档点保底',
    descEn: "Survive to round 5 and activate the checkpoint floor",
    rewardShards: 25,
  },
  {
    id: 'survive_round_10',
    title: '十轮老表匠',
    titleEn: "Ten-Round Watchmaker",
    desc: '单局存活达到第 10 轮',
    descEn: "Survive to round 10 in one run",
    rewardShards: 50,
  },
  {
    id: 'survive_round_15',
    title: '午夜守钟人',
    titleEn: "Midnight Bell Keeper",
    desc: '单局存活达到第 15 轮',
    descEn: "Survive to round 15 in one run",
    rewardShards: 80,
  },
  {
    id: 'godlike_margin',
    title: '毫厘刀尖',
    titleEn: "Hairline Blade",
    desc: '单次擦边距离 ≤ 1.5mm（触发超极限神闪）',
    descEn: "Graze within ≤1.5mm once (godlike flash)",
    rewardShards: 45,
  },
  {
    id: 'combo_8',
    title: '八连擒纵',
    titleEn: "Eightfold Escapement",
    desc: '单局最高连击达到 8 连击',
    descEn: "Reach an 8 combo in one run",
    rewardShards: 35,
  },
  {
    id: 'greedy_shards_3',
    title: '火中取栗',
    titleEn: "Fire Chestnuts",
    desc: '单局内在危险区边缘夺取至少 3 枚时间碎片',
    descEn: "Snatch at least 3 Time Shards at danger edges in one run",
    rewardShards: 45,
  },
  {
    id: 'score_5000',
    title: '满载金库',
    titleEn: "Loaded Vault",
    desc: '单局结算得分达到 5,000 分',
    descEn: "Settle a run at 5,000 pts",
    rewardShards: 40,
  },
  {
    id: 'score_15000',
    title: '钟表大亨',
    titleEn: "Clockwork Tycoon",
    desc: '单局结算得分达到 15,000 分',
    descEn: "Settle a run at 15,000 pts",
    rewardShards: 75,
  },
  {
    id: 'revive_comeback',
    title: '逆转时钟',
    titleEn: "Reversed Clock",
    desc: '单局使用回拨复活后，稳住局势并主动收手结算',
    descEn: "After a rewind revive, steady the run and cash out",
    rewardShards: 35,
  },
  {
    id: 'daily_complete',
    title: '今日校时',
    titleEn: "Today's Calibration",
    desc: '完成任意一局「每日表盘」固定种子挑战',
    descEn: "Finish any Daily Dial fixed-seed run",
    rewardShards: 25,
  },
  {
    id: 'deception_clear_3',
    title: '洞穿假象',
    titleEn: "See Through Illusions",
    desc: '单局内无伤通过至少 3 个心理欺骗/反转类机关',
    descEn: "Clear at least 3 deception/reversal hazards unharmed in one run",
    rewardShards: 45,
  },
  {
    id: 'unlock_3_skins',
    title: '花火藏家',
    titleEn: "Spark Collector",
    desc: '累计拥有 3 款不同的时间火花皮肤',
    descEn: "Own 3 different Time Spark skins",
    rewardShards: 40,
  },
  {
    id: 'career_20_runs',
    title: '百炼发条',
    titleEn: "Tempered Mainspring",
    desc: '生涯累计完成 20 局挑战',
    descEn: "Complete 20 career runs",
    rewardShards: 35,
  },
];

export type DailyQuestMetric =
  | 'PLAY_RUNS'
  | 'CASH_OUTS'
  | 'PLAY_DAILY'
  | 'NEAR_MISSES'
  | 'LAST_SECONDS'
  | 'COLLECT_SHARDS'
  | 'REACH_ROUND_4'
  | 'TOTAL_ROUNDS'
  | 'REACH_COMBO_4';

export interface DailyQuestTemplate {
  id: string;
  metric: DailyQuestMetric;
  title: string;
  titleEn: string;
  target: number;
  rewardShards: number;
}

const QUEST_POOL_A: DailyQuestTemplate[] = [
  {
    id: 'play_2_runs',
    metric: 'PLAY_RUNS',
    title: '完成 2 局任意挑战',
    titleEn: 'Finish 2 runs of any kind',
    target: 2,
    rewardShards: 25,
  },
  {
    id: 'cash_out_1',
    metric: 'CASH_OUTS',
    title: '成功「见好就收」结算 1 次',
    titleEn: 'Cash out successfully once',
    target: 1,
    rewardShards: 30,
  },
  {
    id: 'play_daily_1',
    metric: 'PLAY_DAILY',
    title: '参与 1 局「每日表盘」挑战',
    titleEn: 'Play 1 Daily Dial run',
    target: 1,
    rewardShards: 30,
  },
];

const QUEST_POOL_B: DailyQuestTemplate[] = [
  {
    id: 'near_miss_2',
    metric: 'NEAR_MISSES',
    title: '累计触发 2 次险过擦边',
    titleEn: 'Trigger 2 near-miss grazes total',
    target: 2,
    rewardShards: 30,
  },
  {
    id: 'last_sec_1',
    metric: 'LAST_SECONDS',
    title: '触发 1 次「最后一秒」压哨冲出',
    titleEn: 'Trigger 1 Last Second buzzer escape',
    target: 1,
    rewardShards: 35,
  },
  {
    id: 'collect_shard_1',
    metric: 'COLLECT_SHARDS',
    title: '局内拾取 1 枚危险边缘碎片',
    titleEn: 'Pick up 1 danger-edge shard in a run',
    target: 1,
    rewardShards: 30,
  },
];

const QUEST_POOL_C: DailyQuestTemplate[] = [
  {
    id: 'reach_round_4',
    metric: 'REACH_ROUND_4',
    title: '单局存活达到第 4 轮',
    titleEn: 'Survive to round 4 in one run',
    target: 1,
    rewardShards: 30,
  },
  {
    id: 'total_rounds_8',
    metric: 'TOTAL_ROUNDS',
    title: '今日累计闯过 8 轮机关',
    titleEn: 'Clear 8 rounds total today',
    target: 8,
    rewardShards: 30,
  },
  {
    id: 'reach_combo_4',
    metric: 'REACH_COMBO_4',
    title: '单局达成 4 连击',
    titleEn: 'Reach a 4 combo in one run',
    target: 1,
    rewardShards: 30,
  },
];

export function getDailyQuestTemplatesForDate(dateKey: string): DailyQuestTemplate[] {
  const rng = new SeededRNG(`QUEST-${dateKey}`);
  const q1 = QUEST_POOL_A[rng.int(0, QUEST_POOL_A.length - 1)];
  const q2 = QUEST_POOL_B[rng.int(0, QUEST_POOL_B.length - 1)];
  const q3 = QUEST_POOL_C[rng.int(0, QUEST_POOL_C.length - 1)];
  return [q1, q2, q3];
}
