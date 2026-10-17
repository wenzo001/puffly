/**
 * The copy table — SPEC.md §9 of the Smoke Ritual brief: three tiers, target language →
 * English → icons only.
 *
 * English is the anchor, not a translation: every key exists here, because a control with no
 * name at all is the one failure this layer must never cause. `zh-CN` is complete. `ar` is
 * deliberately partial — it is the proof that the fallback works, and the rest of it is a
 * translator's job, not something to invent here.
 */

export const EN = {
  'app.name': 'Puffly',

  'hint.pick': 'tap',
  'hint.lighter': 'light',
  'hint.puff': 'hold',
  'hint.flick': 'flick',
  'hint.extinguish': 'press',
  'hint.discard': 'drop',

  /** The rail's four names (§9.2): three phases the state machine is in, and one sheet. */
  'tab.light': 'light',
  'tab.puff': 'inhale',
  'tab.tray': 'ashtray',
  'tab.settings': 'settings',

  /**
   * The big pill's short label, one per affordance (§28's verbs are on the scene, these are the
   * handle). They stay in every tier but `icons` on purpose: §9.2 keeps a button label because it
   * is the anchor a translation hangs on — a rail of pure marks has nothing left to localise.
   */
  'cta.pick': 'pick up',
  'cta.lighter': 'light it',
  'cta.puff': 'inhale',
  'cta.savour': 'savour',
  'cta.flick': 'flick the ash',
  'cta.extinguish': 'put it out',
  'cta.discard': 'drop it in',

  'settings.sound': 'Sound',
  'settings.ambient': 'Ambient',
  'settings.smoke': 'Smoke',
  'settings.break': 'Break',
  'settings.puff': 'Draw length',
  'settings.word': 'Word',
  'settings.look': 'Look',
  'settings.vibration': 'Vibration',
  'settings.fidget': 'Fidget',
  // S6's 「混响」 row. `Tail` rather than `Room`, because the sheet already spends the word Room on
  // the four colours the room is painted with.
  'settings.tail': 'Tail',
  'settings.realism': 'Realism',
  'settings.anchor': 'Anchor',
  'settings.data': 'Data',
  'settings.sound.enough': 'enough',
  'settings.sound.little': 'a little',
  'settings.sound.none': 'none',
  'settings.smoke.auto': 'auto',
  'settings.smoke.soft': 'soft',
  'settings.smoke.normal': 'normal',
  'settings.smoke.dense': 'dense',
  'settings.language': 'Language',
  'settings.language.auto': 'auto',
  'settings.language.icons': 'icons',

  'a11y.close': 'close',
  'a11y.export': 'export',
  'a11y.import': 'import',
  'a11y.importOk': 'archive imported — the counts and the cabinet are back',
  'a11y.importBad': 'import failed — pick a file this app exported',
  'a11y.reset': 'erase every record on this device',
  'a11y.resetArm': 'tap again to erase, this cannot be undone',
  'settings.reset': 'erase',
  'settings.resetArm': 'again',
  'a11y.ambient': 'ambient',
  'a11y.soundLevel': 'sound level',
  'a11y.hintWords': 'hint words',
  'a11y.haptics': 'haptics',
  // S6's three shape words: which beat, and what the hand feels in it.
  'settings.haptic.spark': 'light · short',
  'settings.haptic.swell': 'draw · grows',
  'settings.haptic.grit': 'ash · fine',
  'a11y.fidget': 'lighter flourishes',
  'a11y.reverbTail': 'the room behind the sounds',
  'a11y.realism': 'how cartoonish the feedback looks',
  'settings.scene': 'Room',
  'a11y.sceneColours': 'your own room colours',
  'a11y.sceneLayer.skyTop': 'sky, high',
  'a11y.sceneLayer.skyBottom': 'sky, low',
  'a11y.sceneLayer.horizon': 'horizon',
  'a11y.sceneLayer.silhouette': 'everything in front',
  'a11y.motion': 'reduced motion',
  'a11y.contrast': 'high contrast',
  'a11y.textSize': 'text size',
  'a11y.breakLength': 'break length in minutes',
  'a11y.puffOwn': 'draw length: this rod decides',
  'a11y.puffLength': 'draw length in seconds',
  'a11y.anchorDate': 'quit anchor date',
  'a11y.language': 'language',
  'a11y.audioUnavailable': 'audio unavailable',
  'a11y.memoryOnly': 'memory only',
  /** The ring and its readouts: spoken nouns, since §9.2 keeps what the eye sees to digits. */
  'a11y.hud.rail': 'the break so far',
  'a11y.hud.sticks': 'sticks today',
  'a11y.hud.clock': 'this break left',
  'a11y.hud.burned': 'burned so far',
  'a11y.hud.remaining': 'rod left',
  'a11y.hud.hold': 'held for',
  'a11y.hud.puffs': 'draws so far',
  // S4 吐烟: the ring's digits during the release are the strength of the draw that just ended.
  'a11y.hud.force': 'how hard that draw was',
  'a11y.hud.ash': 'ash column',
  'a11y.hud.ashMass': 'ash this stick has made',
  // 拍板 ②: two gram figures, two subjects. `ashMass` is this stick's own output; `trayMass` is what
  // the ashtray is holding, which is the number the design puts on the ashtray (S5 的 2.1 g).
  'a11y.hud.trayMass': 'ash in the tray',
  'a11y.hud.category': 'which rod this is',
  'a11y.archive': 'the archive for this rod',
  'a11y.pill': 'the big action: {word}',
  'a11y.smokeOption': 'smoke {word}',
  'a11y.sheetBreak': 'Break',
  'a11y.sheetShelf': 'Collection',
  'a11y.sheetSettings': 'Settings',
  'a11y.dataRail': 'the desk',
  'a11y.shelfJumps': 'which group',
  'a11y.cravingBefore': 'how strong is the craving now',
  'a11y.cravingAfter': 'how strong is it now',
  'a11y.endBreak': 'end this break',
  'a11y.journey': 'journey',

  'a11y.trigger.coffee': 'coffee',
  'a11y.trigger.drink': 'drink',
  'a11y.trigger.work': 'work',
  'a11y.trigger.angry': 'angry',
  'a11y.trigger.night': 'night',
  'a11y.trigger.people': 'people',
  'a11y.trigger.drive': 'drive',
  'a11y.trigger.meal': 'meal',

  'state.idle': 'a cigarette rests on the table',
  'state.pickedUp': 'held, not lit',
  'state.lighting': 'lighting',
  'state.burning': 'burning',
  'state.puffing': 'drawing',
  'state.resting': 'resting between puffs',
  'state.ashReady': 'the ash is long',
  'state.nearEnd': 'nearly finished',
  'state.extinguishing': 'putting it out',
  'state.extinguished': 'out',
  'state.discarded': 'in the tray',

  /** S17's archive card. Tier 2 is what the rod measures; tier 3 is where the ≈ figures live. */
  /** S8's cabinet: the ladder, its count, and the two lines that explain how to read it. */
  'shelf.packs': 'boxes',
  'a11y.boxFound': 'collected: {brand}',
  'a11y.boxEmpty': 'not found yet',
  'shelf.skins': 'skins',
  'a11y.skin': 'skin {name}',
  // S17's 环境预设: the card says out loud which place wearing it would walk you into.
  'a11y.skin.preset': 'brings {place}',
  'shelf.rods': 'the ladder',
  'shelf.kit': 'the rest of the table',
  /**
   * The seven rooms as a set the player can walk through. The heading is a word and so disappears
   * on the icons tier — the mark `▢` and the `n / 7` digits stay; a rung is announced in words
   * because "3" alone does not say what it counts.
   */
  'shelf.scenes': 'the rooms',
  'a11y.scene': 'room {name}',
  'a11y.rung.now': 'there from the first night',
  'a11y.rung.level': 'level {n}',
  'a11y.rung.day': 'day {n}',
  'a11y.rung.breaks': '{n} breaks',
  'a11y.rung.draws': '{n} draws',
  'a11y.rung.boxes': '{n} boxes',
  'rail.break': 'this break',
  'rail.reduction': 'reduction',
  // S11's 统计 entry and the four local dimensions S13 names. Plain words, because the digits next
  // to them are the fact and the label only says which fact it is.
  'rail.stats': 'stats',
  'stats.sticks': 'sticks',
  'stats.streak': 'days in a row',
  'stats.time': 'time smoked',
  'stats.draws': 'draws',
  'stats.ash': 'ash dropped',
  'stats.next': 'next rod',
  // 成就 (拍板 ⑤ 与 ⑥). The axis rows are digits plus one unit word; the three moments are the deck's
  // own kind of joke — a gust the room happened to roll hard — and nothing here says a word about
  // health or about quitting (§10, §20).
  'ach.title': 'achievements',
  'ach.gust': 'hardest gust',
  // Only the ash row needs a word of its own: the ledger row above counts 磕灰 (flicks) and this
  // one counts grams, so neither may borrow the other's name. The other three axes reuse the
  // ledger's own keys, and 支数 / 口数 never appear here — §23 keeps quantifiers off the stage.
  'ach.axis.ash': 'grams of ash',
  'ach.axis.time': 'minutes',
  'ach.moment.gust': 'a stiff one',
  'ach.moment.squall': 'a squall',
  'ach.moment.freak': 'the freak gust',
  'shelf.rods.ladder': 'total {total} sticks · next at {next}',
  'shelf.hint': 'swipe up for all {total} · hold a card for its archive',
  'shelf.kind.inhale': 'inhaled',
  'shelf.kind.savor': 'savoured',
  'shelf.kind.filter': 'filtered',
  'a11y.tile': '{name}, {zhName}',
  'a11y.tileLocked': 'not met yet',
  // S8's second line on every tile: what the rod is like to smoke. Authored per rod from the
  // numbers it ships with, and for the five non-cigarette classes the deck's own words are kept.
  // Words, so the icons tier drops them and the chip plus the digits stay readable.
  // classic: density 0.92, ash 2.1 g: the middle of the table on every axis
  'rod.note.classic': 'balanced',
  // silver: density 0.72 on a 99 mm slim: the thinnest smoke of the six
  'rod.note.silver': 'cool',
  // night: density 1.08 at turbulence 1.24: a short dark stick whose smoke curls
  'rod.note.night': 'heavy',
  // long: the slowest burn of the cigarettes (4.6 min) and the tallest rise
  'rod.note.long': 'rare',
  // ember: turbulence 1.42 and 740-800 C: the shortest, busiest rod here
  'rod.note.ember': 'spicy',
  // mist: dispersion 1.35 at turbulence 0.42: a curtain, not a column
  'rod.note.mist': 'slow burn',
  // ryo: 790-850 C over 7.5 min, hand-built: hot, slow and coarse
  'rod.note.ryo': 'full-bodied',
  // cigarillo: 18 min and 16 puffs on 90 mm; the deck own word for this class
  'rod.note.cigarillo': 'dense',
  // cigar: 50 min and 6.5 g of ash; the deck word, kept
  'rod.note.cigar': 'mellow',
  // pipe: 40 min at 640-700 C with almost no ash; the deck word, kept
  'rod.note.pipe': 'aromatic',
  // hookah: 380-430 C, 40 short draws, 300 mm of stem; the deck word, kept
  'rod.note.hookah': 'cool',

  /**
   * S20. The whole page is the player's own log restated: it compares them to last week and
   * never to a health target, and it has no verb that reads as advice (§ redlines.noAntiSmokingPressure).
   */
  'reduction.sticks': 'sticks',
  'reduction.week': 'the last seven days',
  'reduction.average': 'an average of {count}',
  'reduction.deltaMore': '{count} more than the same span last week',
  'reduction.deltaFewer': '{count} fewer than the same span last week',
  'reduction.deltaSame': 'the same as the same span last week',
  'reduction.noLimit': 'no ceiling set',
  'reduction.alt.breathe': 'breathe out slowly',
  'reduction.alt.water': 'water',
  'reduction.alt.walk': 'walk it off',
  'a11y.alternative': 'instead of a rod: {word}, taken {count} times today',
  'reduction.footer': 'the ceiling is yours to move — set it where you actually stop',
  'settings.limit': 'Limit',
  'a11y.reduction.ring': '{count} of {limit} today',
  'a11y.reduction.ringNoLimit': '{count} today',
  'a11y.reduction.bar': '{day}: {count}',

  'archive.duration': 'per stick',
  'archive.puffs': 'draws',
  'archive.temp': 'cherry',
  'archive.scenes': 'when',
  'archive.range': '≈10–15 a day, published range',
  // S19's 口径 line for the three tier-two figures. It carries no ≈ on purpose: those numbers are
  // not an estimate of anybody's stick, they are this game's own parameters restated.
  'archive.basis': 'duration · puffs · core heat: this game’s own parameters',
  'archive.pin': 'keep open',
  'archive.tier.low': 'everyday tier',
  'archive.tier.mid': 'mainstream tier',
  'archive.tier.high': 'gift tier',
  'archive.price': 'reference',
  'archive.history': 'history',
  'archive.occasion': 'when',
  'archive.crowd': 'who',
  'archive.gender': 'mix',
  'archive.daily': 'per day',
  'archive.disclaimer': 'name and tier only: no mark, no packaging, no comparison, no advice',
  'archive.unitMin': 'min',
  'archive.unitTemp': '°C',

  // The achievement ladder's own unit words. Eight, and no others: the ladder's test counts them, so
  // a ninth is a red test rather than a new word. They live under `ach.` because the ladder *is* the
  // counts sheet — SPEC.md:174 keeps 中文量词 off the core loop (首页那一行、pill、rail) and
  // SPEC.md:1603 allows them where a count is what the player came to read. Naming them under the
  // ladder rather than under a free-standing `metric.` namespace is what keeps that allowance from
  // becoming a place any future screen could park a quantifier the rule was written to prevent.
  'ach.unit.sticks': 'sticks',
  'ach.unit.puffs': 'draws',
  'ach.unit.grams': 'g',
  'ach.unit.minutes': 'min',
  'ach.unit.strength': 'strength',
  'ach.unit.ratio': 'complete',
  'ach.unit.caught': 'drawn',
  'ach.unit.locked': 'not yet',
} as const;

export type CopyKey = keyof typeof EN;
type Table = Partial<Record<CopyKey, string>>;

const ZH: Table = {
  // The name is not transliterated in any locale, so it maps to itself rather than falling back.
  'app.name': 'Puffly',

  'hint.pick': '点',
  'hint.lighter': '点着',
  'hint.puff': '按住',
  'hint.flick': '弹',
  'hint.extinguish': '摁',
  'hint.discard': '丢',

  'tab.light': '点燃',
  'tab.puff': '吸烟',
  'tab.tray': '烟灰缸',
  'tab.settings': '设置',

  'cta.pick': '拿起',
  'cta.lighter': '点着',
  'cta.puff': '吸入',
  'cta.savour': '含住',
  'cta.flick': '磕灰',
  'cta.extinguish': '掐灭',
  'cta.discard': '丢进去',

  'settings.sound': '声音',
  'settings.ambient': '环境',
  'settings.smoke': '烟雾',
  'settings.break': '休息',
  'settings.puff': '单口时长',
  'settings.word': '提示词',
  'settings.look': '观感',
  'settings.vibration': '震动',
  'settings.fidget': '把玩',
  'settings.tail': '混响',
  'settings.realism': '写实度',
  'settings.anchor': '起点',
  'settings.data': '数据',
  'settings.sound.enough': '正常',
  'settings.sound.little': '轻一点',
  'settings.sound.none': '静音',
  'settings.smoke.auto': '自动',
  'settings.smoke.soft': '稀',
  'settings.smoke.normal': '中',
  'settings.smoke.dense': '浓',
  'settings.language': '语言',
  'settings.language.auto': '自动',
  'settings.language.icons': '纯图标',

  'a11y.close': '关闭',
  'a11y.export': '导出',
  'a11y.import': '导入',
  'a11y.importOk': '导入完成',
  'a11y.importBad': '这个存档没导入',
  'a11y.reset': '清掉这台设备上的全部记录',
  'a11y.resetArm': '再点一次就清空，这一步撤销不了',
  'settings.reset': '清空',
  'settings.resetArm': '再点一次',
  'a11y.ambient': '环境音',
  'a11y.soundLevel': '音量',
  'a11y.hintWords': '提示词',
  'a11y.haptics': '震动反馈',
  'settings.haptic.spark': '点火 短促',
  'settings.haptic.swell': '吸入 渐强',
  'settings.haptic.grit': '烟灰 细碎',
  'a11y.fidget': '打火机小动作',
  'a11y.reverbTail': '让声音带一点房间尾音',
  'a11y.realism': '画面反馈有多卡通',
  'settings.scene': '房间',
  'a11y.sceneColours': '自己定的房间颜色',
  'a11y.sceneLayer.skyTop': '天空·上',
  'a11y.sceneLayer.skyBottom': '天空·下',
  'a11y.sceneLayer.horizon': '地平线',
  'a11y.sceneLayer.silhouette': '前景剪影',
  'a11y.motion': '减少动效',
  'a11y.contrast': '高对比度',
  'a11y.textSize': '文字大小',
  'a11y.breakLength': '休息时长（分钟）',
  'a11y.puffOwn': '单口时长：由这支烟自己定',
  'a11y.puffLength': '单口时长（秒）',
  'a11y.anchorDate': '起点日期',
  'a11y.language': '语言',
  'a11y.audioUnavailable': '没有可用的音频',
  'a11y.memoryOnly': '只存在内存里',
  'a11y.hud.rail': '这次休息',
  'a11y.hud.sticks': '今天第几支',
  'a11y.hud.clock': '这次休息还剩',
  'a11y.hud.burned': '已经燃了',
  'a11y.hud.remaining': '还剩多少烟',
  'a11y.hud.hold': '已经按住',
  'a11y.hud.puffs': '已经吸了几口',
  'a11y.hud.force': '这一口有多用力',
  'a11y.hud.ash': '灰柱长度',
  'a11y.hud.ashMass': '这一支生成的灰',
  'a11y.hud.trayMass': '缸里的灰',
  'a11y.hud.category': '这是哪一根',
  'a11y.archive': '这根烟的档案',
  'a11y.pill': '主操作：{word}',
  'a11y.smokeOption': '烟雾 {word}',
  'a11y.sheetBreak': '这次休息',
  'a11y.sheetShelf': '烟架',
  'a11y.sheetSettings': '设置',
  'a11y.dataRail': '工作台',
  'a11y.shelfJumps': '跳到哪一组',
  'a11y.cravingBefore': '现在有多想抽',
  'a11y.cravingAfter': '现在还剩多少',
  'a11y.endBreak': '结束这次休息',
  'a11y.journey': '这段日子',

  'a11y.trigger.coffee': '咖啡',
  'a11y.trigger.drink': '喝酒',
  'a11y.trigger.work': '工作',
  'a11y.trigger.angry': '烦躁',
  'a11y.trigger.night': '深夜',
  'a11y.trigger.people': '有人',
  'a11y.trigger.drive': '开车',
  'a11y.trigger.meal': '饭后',

  'state.idle': '烟躺在桌上',
  'state.pickedUp': '拿在手里，还没点',
  'state.lighting': '正在点',
  'state.burning': '在烧',
  'state.puffing': '正在吸',
  'state.resting': '歇着，等下一抽',
  'state.ashReady': '灰已经很长',
  'state.nearEnd': '快烧到头了',
  'state.extinguishing': '正在掐灭',
  'state.extinguished': '已经灭了',
  'state.discarded': '在烟灰缸里',

  'shelf.packs': '烟盒',
  'a11y.boxFound': '已收到 · {brand}',
  'a11y.boxEmpty': '还没捡到',
  'shelf.skins': '皮肤',
  'a11y.skin': '皮肤 {name}',
  'a11y.skin.preset': '带来：{place}',
  'shelf.rods': '烟种',
  'shelf.kit': '桌上其余',
  'shelf.scenes': '场景',
  'a11y.scene': '场景 {name}',
  'a11y.rung.now': '一开始就在',
  'a11y.rung.level': '第 {n} 级',
  'a11y.rung.day': '第 {n} 天',
  'a11y.rung.breaks': '{n} 次休息',
  'a11y.rung.draws': '{n} 口',
  'a11y.rung.boxes': '{n} 个烟盒',
  'rail.break': '休息',
  'rail.reduction': '减量',
  'rail.stats': '统计',
  'stats.sticks': '累计支数',
  'stats.streak': '连续天数',
  'stats.time': '总时长',
  'stats.draws': '总口数',
  'stats.ash': '磕灰',
  'stats.next': '下一支',
  'ach.title': '成就',
  'ach.gust': '最大阵风',
  'ach.axis.ash': '灰重',
  'ach.axis.time': '分钟',
  'ach.moment.gust': '一阵风',
  'ach.moment.squall': '妖风',
  'ach.moment.freak': '邪风',
  'shelf.rods.ladder': '累计 {total} 支 · 下一档 {next} 支',
  'shelf.hint': '下滑查看全部 {total} 款 · 长按卡片查档案',
  'shelf.kind.inhale': '吸入型',
  'shelf.kind.savor': '品鉴型',
  'shelf.kind.filter': '过滤型',
  'a11y.tile': '{name} · {zhName}',
  'a11y.tileLocked': '还没抽到',
  'rod.note.classic': '均衡',
  'rod.note.silver': '清凉',
  'rod.note.night': '厚重',
  'rod.note.long': '稀有',
  'rod.note.ember': '辛辣',
  'rod.note.mist': '慢燃',
  'rod.note.ryo': '浓烈',
  'rod.note.cigarillo': '稠密',
  'rod.note.cigar': '醇厚',
  'rod.note.pipe': '沉香',
  'rod.note.hookah': '冰凉',

  'reduction.sticks': '支',
  'reduction.week': '近 7 天',
  'reduction.average': '日均 {count}',
  'reduction.deltaMore': '较上周同期 多吸 {count} 支',
  'reduction.deltaFewer': '较上周同期 少吸 {count} 支',
  'reduction.deltaSame': '与上周同期一样',
  'reduction.noLimit': '未设上限',
  'reduction.alt.breathe': '深呼气',
  'reduction.alt.water': '喝水',
  'reduction.alt.walk': '走两步',
  'a11y.alternative': '替代一支：{word} · 今天 {count} 次',
  'reduction.footer': '上限可自己调，调到想抽就停',
  'settings.limit': '上限',
  'a11y.reduction.ring': '今天 {count} / {limit}',
  'a11y.reduction.ringNoLimit': '今天 {count}',
  'a11y.reduction.bar': '{day}：{count}',

  'archive.duration': '单支时长',
  'archive.puffs': '口数',
  'archive.temp': '中心温度',
  'archive.scenes': '场合',
  'archive.range': '≈10–15 支/日 · 公开调查口径',
  'archive.basis': '口径 · 时长 / 口数 / 芯温 出自本作参数',
  'archive.pin': '钉住',
  'archive.tier.low': '低档 · 走量',
  'archive.tier.mid': '中档 · 主流',
  'archive.tier.high': '高档 · 礼赠',
  'archive.price': '参考零售价',
  'archive.history': '历史渊源',
  'archive.occasion': '典型场合',
  'archive.crowd': '典型人群',
  'archive.gender': '男女构成',
  'archive.daily': '日均消耗',
  'archive.disclaimer': '只写品牌名与品类定位：不画商标、不还原包装、不做价格对比与推荐',
  'archive.unitMin': '分钟',
  'archive.unitTemp': '°C',

  'ach.unit.sticks': '支',
  'ach.unit.puffs': '口',
  'ach.unit.grams': '克',
  'ach.unit.minutes': '分钟',
  'ach.unit.strength': '风力',
  'ach.unit.ratio': '完成度',
  'ach.unit.caught': '抽到过',
  'ach.unit.locked': '还没有',
};

/**
 * Partial on purpose. Everything missing here falls through to English, and the browser checks
 * assert that the fall-through is what a player sees — not a blank label.
 */
const AR: Table = {
  'tab.settings': 'الإعدادات',
  'a11y.close': 'إغلاق',
  'settings.sound': 'الصوت',
  'settings.smoke': 'الدخان',
};

export const COPY: Record<string, Table> = { en: EN, 'zh-CN': ZH, ar: AR };

/** The languages a player can pick, plus the third tier as a choice of its own. */
export const LOCALES = ['en', 'zh-CN', 'ar', 'icons'] as const;
export type LocaleCode = (typeof LOCALES)[number];

/** Written right-to-left: the layout mirrors, the burn never does. */
const RTL = new Set(['ar', 'he', 'fa', 'ur']);

export function isRtl(locale: string): boolean {
  return RTL.has(locale);
}

/**
 * §28: the one word the scene is allowed to say, per affordance. The affordance is the engine's
 * own name for "what this finger should do next", so the mapping belongs beside the words rather
 * than in the component that happens to draw them.
 */
export const HINT_KEYS: Record<string, CopyKey> = {
  pick: 'hint.pick',
  lighter: 'hint.lighter',
  puff: 'hint.puff',
  flick: 'hint.flick',
  extinguish: 'hint.extinguish',
  discard: 'hint.discard',
};

/** The same six affordances, in the words the pill wears (§9.2 keeps a label to translate). */
export const CTA_KEYS: Record<string, CopyKey> = {
  pick: 'cta.pick',
  lighter: 'cta.lighter',
  puff: 'cta.puff',
  flick: 'cta.flick',
  extinguish: 'cta.extinguish',
  discard: 'cta.discard',
};

/**
 * The verb the handle actually wears. A draw that stays in the mouth is not an inhalation, and the
 * rod says so with its own measurement (`readouts.savourMs`) rather than with a category the
 * shell would have to keep in step (Smoke Ritual 品鉴型: 含住 2 秒再缓缓吐出, 不入肺).
 */
export function ctaKeyFor(affordance: string, savourMs: number): CopyKey | undefined {
  if (affordance === 'puff' && savourMs > 0) return 'cta.savour';
  return CTA_KEYS[affordance];
}

/**
 * S8's second line on a rod tile: the one word for what smoking it is like. A rod id is not a
 * literal, so the key has to be resolved against the English table rather than cast — a cast would
 * let a rod whose note was never authored reach `t()` and look like a present key.
 */
export function rodNoteKey(id: string): CopyKey | undefined {
  const key = `rod.note.${id}`;
  return key in EN ? (key as CopyKey) : undefined;
}

/** §4: what a screen reader hears, keyed off `GameState.cigarette.state`. */ export const STATE_KEYS: Record<
  string,
  CopyKey
> = {
  IDLE: 'state.idle',
  PICKED_UP: 'state.pickedUp',
  LIGHTING: 'state.lighting',
  BURNING: 'state.burning',
  PUFFING: 'state.puffing',
  RESTING: 'state.resting',
  ASH_READY: 'state.ashReady',
  NEAR_END: 'state.nearEnd',
  EXTINGUISHING: 'state.extinguishing',
  EXTINGUISHED: 'state.extinguished',
  DISCARDED: 'state.discarded',
};

export interface LanguageChoice {
  /** What goes into `Settings.language`; `auto` means the player has not said. */
  readonly code: LocaleCode | 'auto';
  /**
   * The name a language calls itself. Deliberately outside the copy table: naming 中文 "Chinese"
   * is the mistake this row exists to avoid, and a player who cannot read the current script has
   * no way to recognise a translated name.
   */
  readonly endonym: string;
  readonly glyph: string;
  /** Set when the chip's word is a translation rather than a self-name. */
  readonly copyKey?: CopyKey;
}

/**
 * The row's order is the fallback order: undecided, then the two complete tables, then none.
 *
 * The `glyph` is a mark, not a word: it sits above the language's own name, which is spelled out
 * underneath it, so it has to be something every system font can draw. Two of these were not (#163) —
 * `◌` (U+25CC) and `ع` (U+0639), both of which the browser fell back to `.notdef` on, the Arabic
 * one eight boxes for eight letters because the *script* is missing, not the character. Measured in
 * `tests/smoke/scan-glyphs.mjs` against the built app:
 *
 *   auto  ◌ U+25CC  core 3.0%  edge 97.8%   .notdef   → ○  U+25CB (renders; a hollow circle still
 *                                                            says "whatever the device offers")
 *   ar    ع  U+0639  core 3.1%  edge 102.2%  .notdef   → ↔  U+2194 (renders; a bidirectional arrow
 *                                                            says right-to-left, and `A` would
 *                                                            have been indistinguishable from English)
 *
 * Both replacements were measured **in the real element** — same font stack, same 15px, same
 * `line-height: 1` clip — before being written here, because a stand-in with a different line-height
 * reads as drawn for a character that is `.notdef` in the row.
 */
export const LANGUAGES: readonly LanguageChoice[] = [
  { code: 'auto', endonym: 'auto', glyph: '○', copyKey: 'settings.language.auto' },
  { code: 'en', endonym: 'English', glyph: 'A' },
  { code: 'zh-CN', endonym: '中文', glyph: '中' },
  { code: 'ar', endonym: 'العربية', glyph: '↔' },
  { code: 'icons', endonym: 'icons', glyph: '∅', copyKey: 'settings.language.icons' },
];
