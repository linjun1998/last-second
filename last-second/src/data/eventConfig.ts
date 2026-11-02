export type EventId =
  | 'closing_wall'
  | 'moving_obstacle'
  | 'rotating_blade'
  | 'shrinking_zone'
  | 'narrow_corridor'
  | 'sudden_drop'
  | 'direction_invert'
  | 'fake_safety'
  | 'darkness_ambush'
  | 'chain_sweep'
  | 'razor_gate'
  | 'frenzy_gauntlet';

export interface EventMeta {
  id: EventId;
  name: string;
  nameEn: string;
  subtitle: string;
  subtitleEn: string;
  dangerLevel: number; // 1 to 5
  warningDuration: number; // seconds before hazard becomes lethal/active
  activeDuration: number; // seconds hazard persists
  cooldownRounds: number;
  category: 'extreme' | 'horror' | 'frenzy';
  clueHint: string;
  clueHintEn: string;
}

export const EVENT_CONFIGS: Record<EventId, EventMeta> = {
  closing_wall: {
    id: 'closing_wall',
    name: '擒纵夹壁',
    nameEn: 'Escapement Walls',
    subtitle: '两侧机芯夹板急速合拢，寻找轴端唯一豁口',
    subtitleEn: "Movement plates slam in from both sides — find the one gap at the axle end",
    dangerLevel: 1,
    warningDuration: 1.45,
    activeDuration: 2.3,
    cooldownRounds: 1,
    category: 'extreme',
    clueHint: '冲向斜纹预警壁外的 ◇ SAFE 青色豁口',
    clueHintEn: "Dash to the ◇ SAFE cyan gap outside the hatched warning walls",
  },
  moving_obstacle: {
    id: 'moving_obstacle',
    name: '巨型钟摆',
    nameEn: 'Giant Pendulum',
    subtitle: '沉重黄铜钟摆横切表盘，瞄准中间豁口穿过',
    subtitleEn: "A heavy brass pendulum sweeps the dial — thread the middle gap",
    dangerLevel: 2,
    warningDuration: 1.38,
    activeDuration: 2.45,
    cooldownRounds: 1,
    category: 'extreme',
    clueHint: '看清钟摆来袭方向，钻入摆锤间 ◇ SAFE 缺口',
    clueHintEn: "Watch the pendulum swing and slip through the ◇ SAFE gap",
  },
  rotating_blade: {
    id: 'rotating_blade',
    name: '秒针横扫',
    nameEn: 'Second-Hand Sweep',
    subtitle: '贯通表盘的超长秒针高速扫掠，切勿贴边挂机',
    subtitleEn: "An extra-long second hand rakes the whole dial — never idle at the rim",
    dangerLevel: 2,
    warningDuration: 1.42,
    activeDuration: 2.55,
    cooldownRounds: 1,
    category: 'extreme',
    clueHint: '外圈同样会被秒针扫到，冲进 ◇ SAFE 盲区',
    clueHintEn: "The outer ring gets swept too — dive into the ◇ SAFE blind spot",
  },
  shrinking_zone: {
    id: 'shrinking_zone',
    name: '发条收紧',
    nameEn: 'Mainspring Tightens',
    subtitle: '盘面主发条全向收紧咬合，逃向唯一擒纵口',
    subtitleEn: "The mainspring coils in from every side — escape to the one escapement mouth",
    dangerLevel: 2,
    warningDuration: 1.4,
    activeDuration: 2.4,
    cooldownRounds: 1,
    category: 'extreme',
    clueHint: '趁发条合拢前，蓄力冲进远端 ◇ SAFE 双圆环',
    clueHintEn: "Before the spring closes, charge into the far ◇ SAFE double ring",
  },
  narrow_corridor: {
    id: 'narrow_corridor',
    name: '机芯窄缝',
    nameEn: 'Movement Slit',
    subtitle: '两侧重型齿板挤压成一线窄槽，精准直线穿过',
    subtitleEn: "Heavy gear plates squeeze into a one-line slit — pass dead straight",
    dangerLevel: 3,
    warningDuration: 1.38,
    activeDuration: 2.35,
    cooldownRounds: 2,
    category: 'extreme',
    clueHint: '瞄准 ◇ SAFE 窄缝中心，切勿擦碰锯齿边缘',
    clueHintEn: "Aim at the center of the ◇ SAFE slit; never brush the jagged edges",
  },
  sudden_drop: {
    id: 'sudden_drop',
    name: '报时重锤',
    nameEn: 'Chime Hammer',
    subtitle: '十字准星锁定火花落点，整点报时锤猛烈砸落',
    subtitleEn: "A crosshair locks onto your spark before the hour hammer crashes down",
    dangerLevel: 3,
    warningDuration: 1.32,
    activeDuration: 2.15,
    cooldownRounds: 1,
    category: 'horror',
    clueHint: '听锁定双音，避开 △ 准星十字轴冲向四角',
    clueHintEn: "Hear the lock-on double beep; leave the △ cross axis and dash to a corner",
  },
  direction_invert: {
    id: 'direction_invert',
    name: '指针倒转',
    nameEn: 'Reversing Hands',
    subtitle: '八角品红框为倒转假诱饵，对侧真擒纵微光浮现',
    subtitleEn: "The magenta octagon is a reversal decoy; the true escapement glimmer appears opposite",
    dangerLevel: 4,
    warningDuration: 1.6,
    activeDuration: 2.35,
    cooldownRounds: 2,
    category: 'horror',
    clueHint: '↺ 八角框是指针倒转诱饵！认准对侧 ◇ 真信标',
    clueHintEn: "↺ The octagon is a reversal decoy! Trust the ◇ true beacon opposite",
  },
  fake_safety: {
    id: 'fake_safety',
    name: '停摆假象',
    nameEn: 'Stalled-Time Mirage',
    subtitle: '第一波停摆区过载蓄压（⏸），紧接着瞬间炸裂',
    subtitleEn: "The first stalled zone overloads (⏸), then bursts in an instant",
    dangerLevel: 4,
    warningDuration: 1.32,
    activeDuration: 3.3,
    cooldownRounds: 2,
    category: 'horror',
    clueHint: '见脚下 ⏸ 停摆过载圈与警报音，立即逃向对侧 ◇ 区',
    clueHintEn: "See the ⏸ overload ring under you and hear the alarm — flee to the opposite ◇ zone",
  },
  darkness_ambush: {
    id: 'darkness_ambush',
    name: '午夜停电',
    nameEn: 'Midnight Blackout',
    subtitle: '表盘熄灭唯余声呐滴答，顺着火花旁罗盘寻路',
    subtitleEn: "The dial goes dark; only sonar ticks remain — follow the compass by your spark",
    dangerLevel: 4,
    warningDuration: 1.55,
    activeDuration: 2.45,
    cooldownRounds: 2,
    category: 'horror',
    clueHint: '听声呐脉冲，顺着时间火花旁的青色指针弧冲刺',
    clueHintEn: "Follow the sonar pings and the cyan hand arc beside your spark",
  },
  chain_sweep: {
    id: 'chain_sweep',
    name: '双波表针',
    nameEn: 'Twin-Wave Hands',
    subtitle: '十字表针分两波跳格旋转 45° 交替封锁表盘',
    subtitleEn: "Cross hands jump-rotate 45° in two waves, sealing the dial in turns",
    dangerLevel: 4,
    warningDuration: 1.3,
    activeDuration: 2.8,
    cooldownRounds: 2,
    category: 'frenzy',
    clueHint: '躲过首波十字表针后，看 △ 预览切入下一扇区',
    clueHintEn: "Survive the first cross wave, then read the △ preview into the next sector",
  },
  razor_gate: {
    id: 'razor_gate',
    name: '发条箍环',
    nameEn: 'Mainspring Hoop',
    subtitle: '向外扩张的发条巨环不断收窄最后的逃生豁口',
    subtitleEn: "An expanding mainspring hoop keeps narrowing the last escape gap",
    dangerLevel: 5,
    warningDuration: 1.38,
    activeDuration: 2.3,
    cooldownRounds: 2,
    category: 'extreme',
    clueHint: '趁发条箍环豁口未闭合，果断直线穿透至外圈',
    clueHintEn: "Before the hoop gap closes, punch straight through to the outer ring",
  },
  frenzy_gauntlet: {
    id: 'frenzy_gauntlet',
    name: '整点报时风暴',
    nameEn: 'Hour-Chime Storm',
    subtitle: '超长秒针横扫与发条收紧齐发的整点终极试炼',
    subtitleEn: "Second-hand sweep and mainspring tightening together — the ultimate hour trial",
    dangerLevel: 5,
    warningDuration: 1.48,
    activeDuration: 2.75,
    cooldownRounds: 2,
    category: 'frenzy',
    clueHint: '先冲进 ◇ 发条安全环，再顺势躲开秒针横扫',
    clueHintEn: "First dive into the ◇ mainspring safe ring, then dodge the second-hand sweep",
  },
};

export const ALL_EVENT_IDS: EventId[] = Object.keys(EVENT_CONFIGS) as EventId[];
