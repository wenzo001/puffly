# Puffly · 功能清单与设计目标（交给 UI 的一页）

写给：要在 Puffly 上出一套新 UI 的人／agent。
读法：第 1、7、8 节是**不能商量的边界**；第 2–5 节是**现状事实**；第 6 节是**已经确认的粗糙点**；第 9 节是**必须由产品主人拍板的取向题**，不要自决。

产品一句话：`Take a break. Skip the smoke.` —— 一支不燃烧的烟，一次被记住的休息。
它不是戒烟应用，不是计时器，不是游戏化打卡。它模仿的是"点一支、含一口、磕灰、掐灭"这套动作的**手感**，把烟换成了呼吸。

---

## 1. 红线（SPEC §84，逐条不可越）

1. 不宣称治疗戒烟；2. 不提供医学诊断；3. 不伪造恢复数据；4. 不把游戏数据包装成医学结论；
5. 不推广现实品牌；6. 不鼓励真实吸烟；7. 不诱导购买。

外加一条设计原则（SPEC §85）：**任何需要超过一句话才能解释的功能，优先重新设计交互，而不是加提示文案。**

还有一条产品决定：**不做价格**。稿子里给每个烟种写的参考零售价被明确判为不做（`docs/SPEC.md:1151`，同一条在 `:2228` 落成了字段决定：`PackContent` 上不再有金额字段——现读 `packages/game-core/src/types/content.ts` 那个类型里只有 `tier: PackTier`，没有任何钱）。README 里那句"never a price comparison"在内容走查段 `README.md:361`，**不在**「Not built」（`:512` 起那一节没有价格字样——复跑 `sed -n '512,563p' README.md | grep -ic price`＝0，阳性对照 `grep -in price README.md`＝命中 361）。新 UI 不要把它加回来。

---

## 2. 表面清单（用户能看见的每一个"块"）

单一页面，没有路由：所有表面叠在一个 `.stage` 上。组件实测 12 个（`apps/web/src/components/*.vue`）。

| 表面 | 看见什么 | 能做什么 | 什么时候出现／消失 |
| --- | --- | --- | --- |
| 舞台（3D 场景） | 房间／桌／烟杆／炭头／立灰／烟羽／落灰／火星／天气 | 一切按压的落点（画布本身不吃指针，手势归下层 DOM） | 常驻，铺满视口 |
| 命中面 `.hit` | 透明 | 键盘可 Tab 到的操作面，带 aria 播报 | 常驻，在场景之下 |
| HUD 行 | 品类标＋支数环＋计时＋剩余%；宽屏并排 5 格 | 点品类标开货架；点计时格开「这次休息」；长按支数标记开档案卡 | 随 chrome 开关淡入淡出 |
| CTA 药丸 | 一个记号＋一个短动词（拿起／点着／吸入／含住／磕灰／掐灭）＋三张示意图 | 按＝执行，按住＝吸入 | **任何面板一打开就收起**（面板占它的位置） |
| 底栏 | 3 个相位指示＋设置 | 相位灯**不是按钮**；设置按钮开设置面板 | 常驻（面板打开时仍在，它就是关面板的入口） |
| 数据栏 | 桌面 260px 纵列，8 个入口＋内嵌减量面板 | 逐一开对应面板 | ≥860px 才出现；手机走同一批面板 |
| 这次休息 | 心情、触发标签、旅程、4 个数字、成就、减量 | 自我报告，不看广告不看分数 | 面板态 |
| 货架 | 4 组：烟杆 11／烟盒 12／皮肤 6／道具（8 道具＋5 烟型＋39 音效） | 选择与解锁 | 面板态 |
| 设置 | 见第 5 节 | 全部可调项 | 面板态 |
| 档案卡 | 层二＝本支测量；层三＝钉住的参考资料（带 ≈） | 长按 600ms 打开，松手收起 | 不是面板，因此不抢药丸位置 |
| 减量面板 | 今日 n/上限 的环、近 7 天 7 柱、较上周差值、3 个替代动作 | 只做替代动作可点 | 嵌在「这次休息」里，不是第四个 tab |
| 提示词 | 一个动词（无字层换成图形） | 不接收点击 | 仅在无面板且引擎有建议时 |

**已知死样式**：`.notice` 在 `global.css` 里有完整定义但全仓无消费者——新 UI 要么用上它，要么删掉它，不要保留第三种状态。

---

## 3. 核心循环

产品循环（§83）：工作 → 注意到 Puffly → 交互 → 短休息 → 观察 → 放松 → 回到工作。

状态机 11 相（实测 `apps/web/src/phase.ts`）：
`IDLE, PICKED_UP, LIGHTING, BURNING, PUFFING, RESTING, NEAR_END, ASH_READY, EXTINGUISHING, EXTINGUISHED, DISCARDED`
其中 7 相由交互驱动，4 相由环境派生。UI 只暴露 4 个相位：`light / puff / tray / out`。

三条手感规则，新 UI 不能改：

- **长按＝拖**： anywhere 按住可以拖着烟杆走，松手在缸上方即弃（§14/§66）。短按＝一次动作，长按＝一个持续状态，二者绝不叠加。
- **到上限照抽**：环走完，数字换成 `◇`，**不弹窗、不锁、不断签、不安慰**（§31/§33）。这是产品最硬的差异化决定。
- **点火可以有哑火**：真实打火机带 0.02–0.10 的失败率，"再按一次才着"是设计，不是 bug。

---

## 4. 设计目标（把 §56–§62 翻译成给设计者的话）

- 气质：**电影感 + 柔和 + 略微风格化**。既不是照片级写实，也不是卡通 emoji。
- 颜色克制：**火焰是画面里唯一的焦点**。五种颜色以内解决一个界面，禁止霓虹渐变。
- 光的语言：局部辉光 + 柔和散射 + 微弱环境光。亮起来的东西必须说明"为什么亮"。
- 形状：有机、非线性、略微不完美（对齐稿子里那只手工感的烟杆）。
- 动效：出现＝淡入＋轻微位移；消失＝只淡出（§61）。禁止滥用弹窗（§62）。
- 版式：环（支数环）是界面的主符号，每屏一个头条数；环内的记号必须**在环里可读**，不是装饰。

字体已经定了，不要再议：系统圆体栈（`ui-rounded / SF Pro Rounded / …`）。SPEC.md:3335 明写基线里的 Noto Sans SC + Inter Tight 是**未采纳的备选**，并且"不要再把它列为待决问题"。

---

## 5. 可调项（设计需要为它们留位置）

设置对象实测 21 个字段。界面上带范围的东西（2026-10-17 逐个 `grep -n 'type="range"' -A6 apps/web/src/components/SettingsSheet.vue` 现读，
min/max/step 都取自己那一行的属性，别抄这张表）：

| 项 | 范围／步长 | 控件 |
| --- | --- | --- |
| 音量 | **Sound 那一行装的是两个控件**：三档循环按钮 🔊0.7／🔉0.25／🔇muted（`SOUND_STEPS` 在 `SettingsSheet.vue:130-132`，`cycleSound` 在 `:143`）**＋**一条 0–100 的滑块（`:236-248`） | `button.choice[data-setting="sound"]` + range |
| 环境声 | 就是上面 Sound 行里那条滑块：`min 0 / max 100`、**无 step**，绑的是 `settings.ambientVolume`（`:241/245`），`v-if="!settings.muted"` ⇒ **静音时整条滑块消失** | range（与音量同行） |
| 写实度 | 0–100，step 20 ⇒ **6 个定位档**（`:281-283`） | range |
| 单口时长 | 1–4 秒，step 0.5（`:352-354`；**故意没有默认值**：缺省由烟种决定） | range |
| 文字缩放 | 90–150%，step 5（`:470-472`） | range |
| 休息长度 | **1–30**（分钟），step 1（`:316-318`） | range |
| 触感 | **0–100**，step 5（`:508-510`），滑块侧带波形，波形条数＝档位 | range |
| 每日上限 | **0–40 支**，step 1（`:542-544`），0＝不设、写成 `—` | range |
| 画质 | 三档 light／balanced／high（`:150-152`），预算分别 380／800／1400（`constants.ts:118`）；`auto` 不是画质档，是**语言**的默认值（`:156`）；第四个预算 160 挂在 `reducedMotion` 上，界面上没有这一档 | `button.choice` ×3 |
| 语言 | en／zh-CN／ar／**icons（无字层）**，`auto`＝跟系统 | `button.choice` |
| 自定义房色 | 4 层（天空上／天空下／地平线／剪影），每层一个**原生取色器** `input type="color"`（`SettingsSheet.vue:381-384`，只在开关打开后出现），不是滑块 | swatch ×4 |
| 数据 | 导出／导入／清空（清空是两段式：变橙 → `again` → 6 秒失效） | button |

语言表实测：en **210** 条、zh **210** 条、**ar 只有 4 条**（全文件 424 个键行）。复跑＝先锚三张表的起点再数区间，别抄行号：
`grep -n 'export const EN\|^const ZH\|^const AR\|^export const LOCALES' apps/web/src/i18n/copy.ts` ⇒ 今天落在 11／293／522／532，
然后 `awk 'NR>=12 && NR<=288' … | grep -cE "^  '[^']+':"`（同法 294-521、523-535）。
⇒ 之前这里写的"en 420"是把中英两块加在一起数的。其余回落英文／中文（`LOCALES` 第四个是 `icons` 纯图标层）。阿语补齐被记为**"不做也不错"**（见第 7 节）。

---

## 6. 已经确认的粗糙点

### 6.1 这一轮已修，并且每条都有会红的判据

| 症状 | 位置 | 判据 |
| --- | --- | --- |
| 鼠标连点会被误判成"长按"（抬手后旧定时器还在跑，鼠标 pointerId 恒定） | `useInputAdapters.ts` 的 onDown/onUp/onCancel/detach | `composables/__tests__/inputAdapters.test.ts` 两条新用例 |
| 可 Tab 到的舞台完全没有可见焦点（`.hit` 上写着 `outline: none`） | `App.vue` | `__tests__/interaction-states.test.ts` |
| 除 3 个选择器外没有任何焦点环（底栏、药丸、关闭键、货架格子、档案格全无） | `styles/global.css` | 同上 |
| 手指抬起后 hover 配色粘住（全仓 `:hover` 没有一处按 `@media (hover: hover)` 收口） | `TabRail.vue`、`ArchiveTile.vue` | 同上 |
| "减弱动态效果"只覆盖 4 个类名，各组件自己的 transition 全在外面 | `global.css` 的 reduce 块 | 同上 |
| HUD 品类标是按钮但只有 34×34，低于自家 `--tap-target`（**脸必须留在 34**，撑大它会顶开整行——见 §11 的实测表） | 脸在 `HudBar.vue`，够到手指的尺寸在 `global.css` 的 `[data-reach]` | `interaction-states.test.ts` 的 `keeps the category face … widens only its reach` + `gives every thumb-sized control one shared reach, and no second copy of it` |
| **HUD 的读数格是 18 px 高的按钮**（`.num` 49×18、宽屏 `desk` 的 `.read` 47/46/23×18）——它们不是 `.icon-button`，所以 `global.css:134-135` 那条"自家控件 44/54"的下限从来没管到它们；实测可命中方块 **0**（连 24×24 都凑不出） | `HudBar.vue` 三个按钮挂 `data-reach` | 同上（计数按属性行，不按文本——第一版把注释里那句 `data-reach` 也数进去了，读出 4） |
| **档案卡的关闭键 28×28、钉住键 198×32**：`.close` 在 `ArchiveCard.vue:209-215` 用 `min-width/min-height: 28px` **主动压掉了**那条 44/54 下限 | `ArchiveCard.vue` 两处 `data-reach` | 同上 |
| 图集／CSSOM 读不到时，场景里徽标的兜底色 `#e2604a` 与 token `#ff8a3d` 不是一个颜色 | `SceneStage.vue` | — |
| **开屏那一跳是真的**：脚本跑起来之前页面涂 `#121317`，跑起来之后涂 `--deep-charcoal #0b0a09`——实测相对亮度差 **2.13 倍**；而 `theme-color`（浏览器自己的那条栏）也停在旧的 `#121317`，与运行中的页面永远不一致（manifest 早就是 `#0b0a09`） | `apps/web/index.html:6/21` 与 `vite.config.ts:37-38` 收成同一个数 | `__tests__/boot-colour.test.ts`（把开屏色改回 `#121317` ⇒ 两条都红，现场跑过） |
| 在设置里打字／选日期时，空格、回车、方向键、Esc 被游戏抢走；Tab 到药丸后按回车也不激活按钮，而是去点烟 | `useInputAdapters.ts` 的 `yieldsToFocus` | `inputAdapters.test.ts` 的 `yields space, Enter and the arrows…` + `keeps Space as the draw even when a button holds the focus` |
| 拖动途中另一根手指碰到屏幕会抢走烟杆；抬起的那根还会在指位表里留鬼 | `useInputAdapters.ts` 的 `onDown`／`onUp`／`onCancel` | 同一文件三条用例，各自只为自己红 |
| **建议是"磕灰"或"收烟"时，空格键按下去毫无反应**（键盘对所有动词都发 hold，而引擎的 hold 没有 `ash` 那一行、也不管收走已熄灭的烟） | `useInputAdapters.ts` 里空格改按 `isSustained` 分流 | `inputAdapters.test.ts` 的 `answers the decisive verbs with Space too…` + `keeps the sustained verbs as a hold and one release` |

### 6.2 结构性原因（比单点 bug 更值得新 UI 处理）

- **界面语言有三层翻译**（引擎状态 → UI 相位 → DOM 镜像 → 3D 场景）。一次"点了没反应"可能是任意一层的读值时机问题，而不是渲染问题。新 UI 应当减少层数，或在层之间放**统一的机器值镜像**（项目已经有 `.stage` 镜像的约定）。
- **验证装置非常重，但绝大多数是一次性脚本**（2026-10-17 现算，别抄这行）：单测文件 **143** 个
  （`find . -name '*.test.ts' -not -path '*/node_modules/*' | wc -l`），其中 **45** 个用 `readFileSync`
  断言源码文本（`grep -rl readFileSync --include='*.test.ts' . | grep -v node_modules | wc -l`）；
  `tests/smoke/` 下 `probe-*`／`scan-*` 脚本 **34** 个（`ls tests/smoke | grep -cE '^(probe|scan)-'`），
  而 CI 只跑四样：`served-build.sh`、`serve.mjs`、`ci-runtime-probe.mjs`、`touch-device.mjs`
  （`grep -rn 'tests/smoke' .github/workflows/`）⇒ **34 个一次性量具 0 个进门禁**。
  绿不等于能用——新 UI 每引入一种交互，请同时留下一条**会在它坏掉时变红**的判据，而不是一张截图。

---

## 7. 有意不做／不要动（来自 SPEC 与 README 的逐行记录）

1. 不做价格、不做促销、不推荐现实品牌。
2. 不做断签惩罚、不做戒烟宣言、不做医学结论。
3. 不做 0–12 秒定拍表（SPEC.md:4183 已拍成不做）。
4. 不做桌面挂件（SPEC.md:4192「暂时不做，不真做」，并写明"记的是决定，不是待办"）。
5. 不再议字体替换。
6. 不做输入方式差异的额外适配（§66 宽目标已处理，SPEC.md:2456 记为"刻意不做"）。
7. 阿语不补齐、触觉的三个形状词不图形化（`docs/notes` 与项目记忆都记为"做完反而错"）。
8. 13px 的底栏小字**故意**低于 15px 阅读下限，有 `rail-label.test.ts` 守着。
9. 21 场所中 7 个是室外族、不画室内杂物——这是画法，不是漏画。
10. 稿子里没有"网吧"（SPEC.md:1073/1109），要加需要产品主人确认。

---

## 8. 交给新 UI 的取向题（这些**不是**可以自决的 bug）

| # | 问题 | 现状 |
| --- | --- | --- |
| 1 | **道具读成黑洞**：打火机／烟盒／烟灰缸比墙亮 2.3–2.6 倍的房间底色下变成暗方块。两条修法都试过并按实测撤回（压暗地面→剪影不够暖；提亮道具墨色→仍是洞）。补到墙的亮度需要 4.4–9.2 倍光，会把烟杆削成纯白。 | 未解决，需要的是**21 个房间的配色决定**，不是阈值 |
| 2 | **吸气时画面泛白**：一次真实呼气覆盖画面约三分之一，且是均匀薄纱（实测 spread 0.264 / 0.190，而判据基线 0.66–1.03 是在小footprint 上读的）。要的是每颗粒的 alpha/size 变化。 | 未解决，属于"一口气应该长什么样"的画法 |
| 3 | **支数环语义**：四屏有活读数、三屏偏、一屏同、一屏只到源码级（#152）。改哪一侧都是设计取向。 | 只登记，等拍板 |
| 4 | **背景杂物 5 种还是 4 种**：SPEC §22.z 写五种（含"一段墙缝"），代码只滚四种，且有判据钉死 `[0,1,2,3]`。 | 二选一，等拍板 |
| 5 | **宽屏遮挡**（#150）与托盘近侧要不要一条与远侧对称的边。 | 三条修法的取舍，等拍板 |
| 6 | 面板打开时药丸整个消失（有实测：控制缺席而不是折叠）。新 UI 如果要保留一个"随时能吸一口"的入口，这是要重新设计的核心冲突。 | 已知事实，未定方向 |
| 9 | **"记录只存在内存里、关掉就全丢"这件事，可见面只有一个半透明的圆点**：`SettingsSheet.vue:216` 是 `<span class="warn" aria-label="…">◍</span>`，`.warn { opacity: 0.6 }`（`:631`），那句话（`a11y.memoryOnly`：英文 'memory only'、中文『只存在内存里』，`copy.ts:99/373`）**只有屏幕阅读器能拿到**。同一行还有一个同形状的 🔇（音频不可用，`:211`）。SPEC 从未规定这个标记怎么呈现，所以这不是"设计就这么定的"，是当初就这么建的。⇒ 两条路：在带字的行里（数据/导出那排）落一句现成文案，或者接受"记号不配字"的语汇但换一个认得出的记号。**前者会动界面的语言（本应用是记号＋数字，§9.2），该你定。** | 未动，等取向 |
| 15 | **全应用没有标题结构**：源码与运行页面都读到 `h1..h6` **0 个** ⇒ 屏幕阅读器用户没有"跳到下一节"的落脚点。补法两条都动契约：加视觉隐藏的标题＝往无字层塞成句文字（与 §8-8 同族冲突），加可见小标题＝改版式。 | 未动，等取向 |
| 14 | **自家两个标准在打架：滑块 40 px，而 `--tap-target` 是 44／54**。§66 把 `input[type='range']` 定成 `height: 40px` + 30 px 滑块头（`global.css:444-448`，理由是"22 px 的头压在 3 px 线上按不中"），但可命中方块实测只有 **34**（盒子 822／846×40，三条滑块一样）。抬到 `min-height: var(--tap-target)` 是两行 CSS，代价是设置面板每一行长高 4~14 px（面板本来就靠滚动）⇒ 这是"要不要用滚动换手指"的取舍。 | 未动，等一句话 |
| 13 | **键盘打开面板时焦点不搬进面板**（实测 `focusMovedInsidePanel:false`，量具 `probe-keyboard-reach.mjs`）。代价是能算出来的：焦点留在底栏那颗 tab，所以再按一次 Enter 就把面板关了——这是键盘用户当前唯一的快速出路；把焦点搬进面板（标准做法，屏幕阅读器会立刻念出面板）会连带拿走这条 toggle 路。两条都站得住，选哪条是取向。 | 未动，等一句话 |
| 12 | **Sound 那一行的滑块拖的不是音量**：行标签 `settings.sound`，三档循环按钮（🔊够／🔉一点／🔇关）动 `volume+muted`，而同一行那条 0–100 的长滑块绑的是 `settings.ambientVolume`（`SettingsSheet.vue:236-248`）——它管的是环境声底（风／房间），拖它的时候提示音本身不变。截图里两者并排，肉眼分不出归属。要么把这条滑块挪去它自己的行（多一行，但归属清楚），要么把行标签拆成两个词（要新文案），要么接受现状。 | 未动，等一句话 |
| 11 | **钉住的档案卡和面板的关闭键互相压在对方身上**（实测、正常速度、393×852：`.sheet .close` 那颗 54×54 完全落在卡内，中心点命中 `p.scenes` ⇒ 面板的 × 点不动；把卡沉到面板之下则卡的钉住键（y 409–441，也在面板顶边之下）先死）。量具两件：`tests/smoke/probe-card-overlap.mjs`，以及把整页控件扫一遍的 `probe-covered-controls.mjs`——后者在同一个状态下又量到三颗被压住的：`button.icon-button[data-setting="scene-surface"]`、跳转条的 `jump=jumpskins` 与 `jump=jumpkit`（中心点分别回答 `p.scenes`／`aside.archive`／`p.basis`），所以这不是一颗键的事，是一排。三条路：① 面板打开时把钉住的卡一并收掉（最省事，但"钉住就是为了不被划走"这条契约要改口径）；② 面板打开时把卡锚到另一边（两张键都活，但 S19 的稿子指定档案区在右栏）；③ 面板高度给卡让出上部（等于重写这块的版式）。 | 未动，三条都得你挑 |
| 10 | **键盘滚不动打开的面板**：三个 sheet 都没有 `tabindex`（现读：SettingsSheet:203 / SessionSheet:243 / CollectionSheet:227 只有 `class="sheet"`），而方向键在 `useInputAdapters.ts` 里被全局 `preventDefault` 收去 nudge 烟杆 ⇒ 键盘用户只能 Tab 到逐个控件、由浏览器把它滚进视野，PageDown/Home/End 全无作用。修法两半：给打开的面板 `tabindex="0"`（无害、纯加法），**并**规定『面板开着时方向键归面板』（这一半会拿走烟杆的一个既有键位）。§65 只说方向键『可以作为辅助输入』，没规定它永远属于杆——这条能设计得比现在好，但它动的是键位契约。 | 未动，等取向 |
| 8 | **盲人听状态这条通道目前没有实现，而且两种实现互相打架。** `App.vue` 的注释写着"a blind user hears the state"，但那个句子只绑在舞台一层静态 `<div>` 的 `aria-label` 上——**改 `aria-label` 屏幕阅读器不会播报**，播报需要 live region 里的内容变化。试着加了一个裁剪掉的 `<p aria-live="polite">`，真机两趟都是 **167/174**，7 条红同一个因 `offenders:["said"]`：有一族判据钉着"无字层屏面上不得有成句文字"，而它扫的是整篇文档，不是 `.stage`。⇒ 要么给那族判据加一条"排除只供播报的裁剪节点"（＝改判据，得你点头），要么换一条不产生文字的通道（例如焦点真正落到带状态的元素上）。我没有自行放宽判据。 | 未动，等取向 |
| 7 | **阿拉伯语下界面只镜像了一处**：`copy.ts` 认 ar/he/fa/ur、`App.vue` 会设 `dir=rtl`，但 CSS 里物理属性有 23 行、逻辑属性 19 行（口径：`grep -rn -E 'left:|right:|text-align|padding-left|border-left' --include=*.css --include=*.vue apps/web/src` 的命中行数，逻辑属性同法），专门写给 rtl 的规则全仓只有 1 条。⇒ 现在既不是"完整镜像"也不是"不镜像"，而是半镜像。要么把物理属性收成逻辑属性（会动到按 x 坐标写的像素判据，需要重定基线），要么在阿语补齐之前不设 `dir=rtl`。**选哪边取决于你对"4/210 条阿语翻译的界面该不该镜像"的判断**，我没有替你定。 | 未动，等一句话 |

---

## 9. 设计语言可复用的现值

`:root` 实测 **20** 个自定义属性（`apps/web/src/styles/global.css`；复跑 `awk '/^:root/,/^}/' apps/web/src/styles/global.css | grep -cE '^\s+--'`）：

```
--deep-charcoal #0b0a09   --warm-gray #7e746a   --soft-white #f2ede6
--alert-ember #e2604a     --ember-orange #ff8a3d --ember-core #ffb273
--cool-blue #a8d4e0       --smoke-gray #c4c6cd   --text-2 #8a8078
--ash-gray #7e7e82
--chrome-bg / --chrome-line（均由上面两色 color-mix 而来）
--tap-target 44px（粗指针 54px）  --chrome-height calc(tap-target + 20px)
--sheet-lift calc(chrome-height + env(safe-area-inset-bottom))
--text-scale 1  --label-size calc(13px * text-scale)  --radius 14px
--ease-out cubic-bezier(.16,.84,.3,1)  --ease-in cubic-bezier(.5,0,.75,.4)
```

`--alert-ember` 是这一轮加的第 20 个：它不是"更红的 ember"，是**唯一一条错误色**
（复跑 `grep -rn e2604a apps/web/src` ⇒ 源码里只有 `global.css:15` 这一处定义，没有第二个家）。
现读它只有**一处规则**在用——`SettingsSheet.vue:776` 的坏值读数 `.state.bad`——外加一条对比度判据
（`styles/__tests__/text-contrast.test.ts:82/84` 直接读这个 token）。3D 那边的兜底走的是 `--ember-orange`
那条线的字面量 `#ff8a3d`（`SceneStage.vue:3518`），不是这条红。

媒体查询 6 种条件（`grep -rhoE '@media[^{]*' apps/web/src | sort | uniq -c` 现读，2026-10-17）：
`prefers-reduced-motion` ×4、`min-width: 860px` ×3、`hover: hover` ×2（这一轮加的：`:hover` 只给真有指针的设备）、
`pointer: coarse` ×1、`landscape and max-height: 520px` ×1、`max-width: 859px` ×1。

**外部设计源**：`Smoke Ritual`（pptx 抽出的纯文本，**24 屏**），逐屏对账表在 `docs/SPEC.md:4098`，口径三态"落／偏／欠"。另有浏览器抄出的 Demo 抽取件，五屏的页头／按钮／环 dasharray 实测在 `docs/SPEC.md:6114`：S1 83.31→0.780、S2 83.31→0.780、S3 53.41→0.500、S4 66.22→0.620、S5 80.11→0.750。3D 契约在 `docs/superpowers/specs/2026-10-09-scene3d-rewrite-design.md`。

---

## 10. 新 UI 的验收方式（不要另起一套）

- **一条命令扫全部 UI 判据**：`node tests/smoke/ui-sweep.mjs`（没有服务时它自己起 `npm run dev`，跑完关掉）。它把四把尺子跑一遍并汇总：谁压住谁＋手指够不够、键盘这条路、减弱动态效果、无字层。`--strict` 在任何一条被列出时退 1（今天会红，因为 §8-11 那三颗被钉住卡压住的键还在）。
  2026-10-17 现读：`covered 3`、`reachBelow44 14`（另有 `reachBetween44AndTarget 70`——那是"到了 44、没到 54"，算读数不算缺陷）、键盘 `insideClosedPanel 0 / noRing 0`、`stillTravelling 0`、`nothingLeft 0` ⇒ 汇总 **17 条明细**，逐条都落在已登记的族里：**8 条**是钉住卡那一态（3 颗被压住 + 3 颗命中 0 + 2 颗被挤到 34，§8-11）、**7 条**是滑块 40 与 44 打架（§8-14）、**2 条**是宽屏 desk 那排里邻格间距 46 px 装不下 44 的读数格（§11-14 记的那个例外）。
- **把 CI 那一趟在本地复现出来**（推送之前就能拿到它的数，而不是靠 CI 去试）：
  ```bash
  bash tests/smoke/served-build.sh
  PUBLIC_BASE=/puffly/ npm run build
  node tests/smoke/serve.mjs apps/web/dist 4173 127.0.0.1 /puffly/ &
  PUFFLY_CHROME_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader --disable-gpu" \
    node tests/smoke/touch-device.mjs http://127.0.0.1:4173/puffly/
  ```
  2026-10-17 这样跑出来是 **167/175**（8 条红的族见 §11-18 末段），耗时约 13 分钟。
- 正常路径基线：真机套件 **175 条**（2026-10-17 加了第 175 条 reduced motion，加之前是 174/174）——**分母会动，别抄这个数**，现算＝跑一遍看最后一行。同一棵树一晚连跑四趟是 **174/174 → 174/175 → 171/175 → 170/175，红在三个互不相干的族之间换人**（第 2 趟红在自己新判据的对照上＝套件自己的按压被拒；第 3 趟 `lighting attempts 4` 一根烟没点着、后面三条全是它的下游；第 4 趟整场 3D 没起来：`visibility: missing`、`nameMax 0`、meshes 0）。⇒ 这三族的红都不能归因给某一笔改动；本地要把任何一条写成"修好了"，必须先同树复跑一趟；有效判决仍是 CI。；软件渲染（无 GPU）代理旗标 `PUFFLY_CHROME_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader --disable-gpu"`，约 357s 跑完整套。**同一棵树同一旗标曾出现 174→5 红→9 红→174 的轮换**，所以"绿过一次"永远不等于"修好了"。
- 真机套件**没有单条过滤器**：新增一条真机判据＝跑整套，并在页面内就地做反证。
- 改了画面上看得见的事实，就要用 `tests/smoke/readme-shots.mjs` 重拍 README 四图并入库。
- 只读 `.stage` 的机器值镜像做断言，不去读被三层语言翻译过的字；道具坐标用 `data-aim`；状态读 computed 值（animationName／color／CSSOM）。
- 本仓没有 CHANGELOG，也没有版本号脚注那一层。

---

## 11. 这一轮量到的东西，以及两条被复核判为"不是缺陷"的指控

**1）HUD 的版式与真机的像素判据是耦合的——而且这次真撞上了。**

`touch-device.mjs` 里那条 `the clock's ink lands at the DOM font's own size` 扫的是一个**写死的像素框**
`[100, 16, 55, 24]`，断言墨行 9..15（稿子的时钟 15px、实测墨行 12）。
把 `.cat` 按 `--tap-target` 撑大之后，同一页面里实测（`node tests/smoke/probe-cat-ink.mjs <url>`，一次跑两种尺寸）：

| | `.cat` 撑到 var(--tap-target) | 脸回到 34px |
| --- | --- | --- |
| `.cat` 实际尺寸 | **54×54**（手机是 coarse 档，那个变量在这里是 54 不是 44） | 34×34 |
| `.hud` 行高 | 54 | 40 |
| 环的位置 | x=78 | x=58 |
| 时钟的位置 | x=128 | x=108 |
| 写死框里的墨行 | **22**（超出上限 15，判据红） | **11** |
| 真机套件（同树两趟） | 173/174、173/174 | **174/174、174/174** |

⇒ 结论不是"判据太脆"，而是**那颗按钮的可见尺寸就是设计的一部分**：撑它会顶开整行。
命中面改由一个透明伪元素承担（脸 34、可达 44，实测中心 ±20px 四个方向都落在按钮上，而环那一格仍归环）。
判据：`interaction-states.test.ts` 里那条 `keeps the category face at the drawn size and widens only its reach`
（两次单点谎言各自打红它）。

**2）真机文件里两个上下文过去没给 touch，那两处的坐标按压是静默空操作。**

宽屏 1280×800 那块和 `?scene=2d` 那块建 context 时没有 `hasTouch`，而块内多处是
`page.touchscreen.tap(x, y)`（8d526ce 修的是同族，作者自己标了"未验"）。
两种修法的取舍是这轮定的：

- **把按压路由改成"无 touch 就走 `page.mouse.click`"——已被实测否证**（那趟 169/174，5 条红全是"面板没打开"）。
  机制在 §66：**加宽命中面只对手指生效**，`sourceOf()` 报 `mouse` 时用的是窄容差，而这些坐标本来是按手指尺寸瞄的。
  换鼠标不是"把空操作接通"，是把语义换掉了。
- **给这两个 context 补 `hasTouch: true`——已实测**：保住手指语义，同树两趟 **174/174、174/174**。
  桌面的鼠标路径没受影响（适配器报的是指针自己的类型，与这个标志无关）。

**3）两条被复核判为"不是缺陷"的指控，记下来免得有人去修不存在的洞。**

- 「`usePuffly.ts:733` 的 `if (!engine) return;` 会让 rAF 循环静默死掉」——**假**。`engine` 在 `attach()` 里
  赋值一次（`:821`），循环在其之后才起（`:947`），而全文件**没有任何一处把 `engine` 置回 null**（现读：
  `grep -n "engine = null" apps/web/src/composables/usePuffly.ts` 无命中）。这条守卫不可达。
- 「`dt = Math.min(raw, 250)` 让饥饿页面的模拟时间恒定慢于墙钟」——**不是这一层的事**。后台那段时间另有
  记账（`:737` 把 `raw` 累进 `simulatedWhileHiddenMs`），跨后台的续燃按系统时钟补（`openBreakSnapshot`／
  `restoreOpenBreak`，§81(4)）。动这个上限之前要先证明补烧那条链没接住同一个洞。

**4）一条名字比内容大的判据——它承诺的守卫根本没在测。**

`inputAdapters.test.ts` 里 `ignores a second pointer, so two fingers cannot fight over the rod`
原来只是按了一次 id 1、数一个 tap（它甚至建了个空的 handlers 又 `void` 掉）。而代码里
`onDown` 是**无条件替换**当前按压的，所以那句话说的是不存在的行为。写成真驱动之后当场红了：
发出去的方向是 `[0.25, 0.75, 0.8]`——**烟杆跳到那根多余的手指上并跟着它走**。
玩家手感就是"拖着拖着，另一根手指碰一下屏幕，烧的那头跑过去了"。

现在：一根手指在按住时，后来的手指只记账不抢杆；抬起／取消的那根无论是不是主控都从指位表里划掉
（少划一次就会让下一个双指动作数到三根手指、捏合永不触发）。三处修改各有一条只为自己红的用例
（`ignores a second pointer…`、`a thumb resting beside a finger…`、`a cancelled stray finger…`）。

⇒ 给下一位读者的通例：**看一条判据时先读它真正驱动了什么事件，别信它的名字。**

**5）四趟真机读数（同一棵树上，正常路径），留给下一位把这行当基线的人。**

| 树 | 两趟 |
| --- | --- |
| `.cat` 撑到 54（错的那版） | 173/174、173/174（同一项红，写死框里 22 行墨） |
| 脸回到 34 + 可达面 44 | 174/174、174/174 |
| 再加第二根手指不抢杆 | 173/174、174/174 |
| 再把警示红与冷色收成 token | 174/174、174/174 |

第三行第一趟红的是 `right-to-left: the burning end stays on the same side` 的**漂移预算项**
（x 走了 4.9px，上限是它自己按"同一支烟在同一时窗测出的漂移"推出来的 3.9），后三趟没再出现。
⇒ 这一条**不能写成"修好了"，也不能写成"那笔改坏的"**；它是本仓已知的骑线判据族（同族历史：`wakeChrome`、
`pillBox=null`、逐帧记录器那几拍）。复跑命令：`PUBLIC_BASE=/puffly/ npm run build` → `node tests/smoke/serve.mjs apps/web/dist 4173 127.0.0.1 /puffly/` → `node tests/smoke/touch-device.mjs http://127.0.0.1:4173/puffly/`。

第三行之后又跑了一棵树（键盘让路那次），三趟：174/174、172/174、174/174。
中间那趟的两条红分别是取向题 #2（烟羽成均匀薄纱，实测 spread 0.340 对下限 0.66）与"抽取上限"那族
的下游读数异常——都与那笔改动无关，也没有在第三趟复现。

**一处值得记下的取舍**：键盘让路这件事，写成"焦点在控件上就一律让路"最省事，但它会把 §65 承诺的
"空格＝吸一口"吃掉——鼠标点过药丸之后焦点就在那个 `<button>` 上，此后的空格就不再是吸气了。
所以最终形状是**按钥匙分**：输入框全让（那是文字入口），按钮只让回车（那是键盘用户按它的方式），
空格无论如何归游戏。判据两头都配了：摘掉按钮那半 → `yields …` 红；把按钮改成全让 →
`keeps Space as the draw even when a button holds the focus` 红。

**4）CI 那 22 条面板红的形状，在这台机器上复现不出来，所以改的是观测通道。**

同一条旗标（`--use-angle=swiftshader --enable-unsafe-swiftshader --disable-gpu`）在这台 Mac 上跑整套是
**173/174**，面板一族一条没红，唯一的红是 `the ignition's flame, open cap and sparks`（`sparks=false
strikes=2`，属于已登记的逐帧记录器轮换族）。而 GitHub 的 runner 上同一棵树是 22 条 FAIL、
`openSheet(...) never opened` 带 `hitIsHandle:true` 与 `events:[]`——那个 runner 慢到 13fps，这台是 26fps。
⇒ 不要再从本地绿推 CI 绿。`openSheet` 现在把**走的是哪条路线**（click／tap）与**被吞掉的抛错原因**
一起印进 FAIL 诊断（`tapAt`/`clickAt` 之前 `.catch(()=>false)`，"Playwright 根本没按下"与"按下了而状态没动"
都读作 `events:[]`）。下一次 CI 会自己说是哪一半。改动只是读数，判据一条没动。

**5）节流旋钮与本地四趟的账（同树，正常旗标，只差没加节流）。**

`PUFFLY_CPU_THROTTLE=<倍数>` 是给套件加的**默认关闭**的旋钮（`Emulation.setCPUThrottlingRate`），
存在只为把 CI 那台没有 GPU 的机器的形状搬到本地来看——加软件渲染旗标后这台 Mac 是 ~26fps，
runner 是 13fps，差的那一截正是"面板一族"红不红的关键。8 倍节流下本地页面测得 ~10fps（比 runner 还慢）。

| 跑 | 条件 | 结果 |
| --- | --- | --- |
| 1 | 软件渲染旗标，无节流 | 174/174 |
| 2 | 同上 | 174/174 |
| 3 | 同上 | 173/174（`sparks=false strikes=2`，逐帧记录器那族） |
| 4 | 同上 | 170/174，**四条全在点火→抽取那条链**（`phase:light affordance:lighter`＝四次按药丸没点着，下游全灭） |
| 5 | 同上（紧接第 4 趟） | 171/174，**红的又是另外三条**（烟灰缸倾角、落灰位置、炭头），与第 4 趟零重叠 |
| 6 | 软件渲染旗标 + 8 倍节流 | 168/174，六条全是"面板已开过、后来自己合上"的下游（`openId:null`、镜像 `visibility:missing`），**没有一条 `openSheet never opened`** |

⇒ 三条结论：① 同树四趟红集合各不相同，**本地正常路径本来就在轮换**，任何"我改了 X 所以那族红了"的推断都要先用同树复跑来否证；
② 光把 CPU 压到比 runner 还慢，**够不到 CI 那 22 条的形状**，所以那条红的成因不止速度；
③ 节流旋钮把可探索的边界往前推了一点，但没有把答案交出来——剩下的要靠那两条新读数（`route`／`pressError`）在真正的 runner 上跑一次。

**6）三条"绿色但没在看守"的判据已经收紧，每条都用诱饵验过。**

| 判据 | 旧写法漏掉什么（诱饵实测） |
| --- | --- |
| `reduction.test.ts` 减量行的命中面 | 窗口从 `.alt {` 一路开到文件尾：**删掉 `.alt` 自己的 `min-height`、在后面任意规则补一条同名的**，旧写法仍答 True |
| `hud-glyphs.test.ts` 环内符号 | 五个字面量各自存在：**把火苗与灰线在两个分支间互换**（点火戴灰线、烟灰缸戴火苗），五个字全在 ⇒ 旧判据 True |
| `chrome-furniture.test.ts` 舞台高度交给 core | 只在数文件里 `setStageAspect(` 出现几次：**把这次交递从 `resize()` 搬进 `frame()`**（转屏后信框仍用昨天的高度），调用数与参数串都没变 ⇒ 旧写法 True |
| `warm-pool.test.ts` 暖光池在画框内 | 旧判据只量待机一屏，其余四相只跟表逐项相等：**把表里某相的半径写成像素量纲、并同步改掉那条相等期望**（＝『改数顺手改期望』的现实形状），六个既有用例全绿、只有新加的『十一相 × 直屏与宽屏都量在框内』红 ⇒ 这条挣到了位置。顺带记一条：这条第一版把宽屏当成参数却没传给读取函数，等于只量了直屏——名字又比内容大了一次，是 typecheck 的未用变量把它揭出来的 |
| `cta-anatomy.test.ts` 药丸两态 | 只查声明是否出现在文件里：**删掉暗态选择器、把它的两条声明搬进 `.pill`**（药丸在任何动词下都是同一个橙），或把 `data-held` 的值写错（按住不再缩放）⇒ 旧判据两次都 True |

统一形状：**按花括号 depth 切出规则体/分支体，再在里面判**（`sourceProbe.ts` 的 `blockAfter` 早就有了，
`hud-anatomy.test.ts:120` 也记过同一个坑）。给 UI 重写时的约定：**新写一条判据，先想一个能让它红的诱饵**，
诱饵要让所有字面量都还在、只破坏语义，否则那条判据守的是字符而不是界面。


**7）面板一族的三种形状，现在能被读出来了（这是本地能做到的极限，不是结论）。**

`openSheet` 原来只报 `events:[]`，而三种成因要三种修法：

| 现场 | 含义 | 现在的读数 |
| --- | --- | --- |
| `handle:"onscreen"`＋`hitIsHandle:true`＋`events:[]` | **Playwright 拒绝按压**（动作性等待超时，事件根本没送出）＝仪器的问题 | `pressError` 直接印出抛错原文（本地实测：`locator.click: Timeout 2500ms exceeded.`）；同中心的原始坐标按压会补上，`route` 变成 `mouse.click@box`／`touchscreen.tap@box` |
| `handle:"zero-box"`＋`hitIsHandle:false`＋`events:[]` | 界面被折走了（§10 的 2.6 秒），**没有盒可按**＝唤醒那一步的边界问题 | `route` 保持 `locator.tap`（回退正确地没触发），`rect:[0,0,0,0]` |
| `events` 非空＋`openAny:0` | 送达了而面板没挂上＝**应用的问题** | `events` 数组自己说话 |

安全边界：这套改动在**正常路径两趟都是 174/174**（回退只在被拒绝时走），所以它不是"为了让红消失"。
20× 节流那一趟剩下的面板红全是第二种形状（折走），而 CI 那 22 条是第一种形状——
⇒ 这一笔**推上去有可能让 CI 那族掉下来**；掉不掉以 CI 自己报的 `route`/`pressError` 为准，不拿它当承诺。

**8）扫描报的第六条按它原话是误报，真盲点是另一个形状。**

有 agent 说 `gesture-surface.test.ts` 只扫带 `scene3d` 的规则、会漏掉藏滚动容器的其它规则。现读：全仓
`visibility: hidden` 共 4 条规则，其中 `.sheet`（`global.css:223`）确实是滚动容器，但那是**关闭态默认**——
`.sheet[data-open='true']` 在 `:250/254` 把它恢复成 visible。关掉的面板本就不该吃手势（同一条规则里还有
`pointer-events: none`，注释写明"不这样它会吞掉给舞台的按压、也会抢走 Tab 焦点"）。所以那道 `scene3d` 门
是**故意**绕开这个合法默认的，不是漏。

真的盲点是另一个形状：**开着的面板被摘出命中测试**——那才是 #162 重演，而它写在 `[data-open=…]` 上、
不带 `scene3d`，旧判据完全看不见。已扩成"两种门都算"，诱饵为证：把 `:254` 的 visible 改成 hidden，
**旧判据 5/5 仍全绿、新判据红**。关闭态那条仍按形状排除（不是靠名字豁免）。


**9）一族"看起来会缺"的精细项，实测全部已经做对（负结果，别再重做）。**

`global.css:96-104` 一处集中管着：`overscroll-behavior: none`、`-webkit-user-select: none`、
`-webkit-tap-highlight-color: transparent`（点了不闪灰框）、`-webkit-touch-callout: none`（长按不弹
『储存图像/查询』）、`touch-action: none`；面板自己再放开 `pan-y`（`:247`）、滑块也 `pan-y`（`:350`），
`CtaPill` 自己是 `touch-action: none`。**`inputmode` 没有缺口**：应用里没有任何 `type=number`/`type=text`
输入（每日上限、单口时长、休息长度都是 range 滑块＋读数），只有 `type=date` 与 `type=color` 的原生选择器。
⇒ 新 UI 若重排 chrome，请把这五行**一起搬**——它们是一个整体，少一行就是一个具体的手感缺陷。

**同一族的第三条负结果（2026-10-17 现量，无字层）：** 把语言切到 `icons` 之后（页面自报
档位按钮 `aria-pressed` 复读为 `["icons"]`、面板里 15 个行标签的字全数归零），
可见的可交互控件 **31 颗全部仍然有可访问名字，unnamed = 0**；
（这里原来写的证据是"页面自报 `data-cues=audio`"——**那句已被自己推翻**：`data-cues` 是**提示通道**，
面板一开它就是 `audio`，与字在不在无关，见 §11-17 的两次读数。证据要挑那个只会为这件事变的。）
——名字来自各自的 `aria-label`，不是来自那些消失的字。量法（临时脚本，未入库）：
`page.locator('[data-language="icons"]').click()` 之后遍历 `button, input, a[href], select, [role=button]`，
对每颗取 `aria-label` 或 `textContent`，两者皆空才算无名。
⇒ 这条是**已经做对、重排 chrome 时容易弄坏**的那一类：新 UI 只要有一颗图标按钮靠字面文本当名字，
无字层一开它就变成"有个能按的东西，但没人知道是什么"。

**10）面板一族：拒绝按压的机制查清了，`never opened` 也确实归零；但"总红数 12 → 2"这句我收回。**

诊断链：先复现出 `pressError:"locator.click: Timeout 2500ms exceeded."`（Playwright 的动作性等待拒绝按压），
加"被拒绝就用同一中心、同一指针类型补按"之后仍剩一批 `handle:"zero-box"`；再量了折叠窗口本身——
**61fps 时唤醒后 1ms 出现盒子、2697ms 折回；8fps 时 113ms 出现、2590ms 折回**（⇒ `idleMs` 走墙上钟，
"dt 上限会压缩折叠窗口"这个假设被否证，那个修法没写）。真正的原因是**按压预算 2500ms 与窗口 2600ms 同长**：
慢页上等稳定的那一段把窗口耗光，盒子归零，于是拒绝之后必须**重新唤醒**再按。

四趟 20×（同一条件：`PUFFLY_CHROME_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader --disable-gpu" PUFFLY_CPU_THROTTLE=20 node tests/smoke/touch-device.mjs`；日志在 `/tmp/dev-c3.txt`、`dev-after.txt`、`dev-t2.txt`、`dev-f20.txt`）：

| 相对『拒绝→重新唤醒→新鲜窗口内原语按压』 | FAIL 总数 | 其中 `openSheet never opened` |
| --- | --- | --- |
| 之前两趟 | 12、12 | 4、3 |
| 之后两趟 | **2、8** | **0、0** |

**能站住的只有右边那一列**：`never opened` 在 2 之前 / 2 之后从「每趟 3~4 条」变成「两趟都是 0」。
左边那一列是噪声——总红数在 2~8 之间晃，而且**每趟失败的集合都不一样**（2 那趟只有 2 条，8 那趟里 6 条是
`S1/S4/pill draw/ceiling/tile minutes` 这一族读时机的判据）。所以「12 → 2」不是这条改动的效果，
我上一笔把它写进了文档和 commit message（`f118e15` 标题），**那句收回**；那笔已经进栈，
要不要在 push 前改写由用户定，我只在这里判它不成立。

一条我自己犯的错，顺带记在这里：那一轮我还加过一处「先清掉压住 close 的那张档案卡」。改完那条照旧红，
而我去核实时用的是 `clickAt`——正是这一族里那个会静默拒绝的调用，所以连"它有没有生效"都没测到。
**那段没证明有用的代码已整块撤掉，工作树回到 `f6467cc`**：没证据的修法不留。

四趟里有一条**不是噪声**的红，而且我把它在**正常速度下**复现出来了：`close=aside.archive<…|open=1|card=1`
（标题『rail、head-up 行和 sheet 同时可点』）。量法＝`node tests/smoke/probe-card-overlap.mjs http://localhost:5175/`
（393×852 触屏、不加任何节流旗标），现读结果：

| 谁 | y 范围 | 落在哪儿 |
| --- | --- | --- |
| 打开的 sheet 顶边 `sheetTop` | 204.48 | — |
| 钉住的档案卡 `.archive` | 58 → 454 | 下半截 250px 压进面板区 |
| 面板自己的关闭键 `.sheet .close` | 221 → 275 | **整颗 54×54 都在卡里**，中心点 `elementFromPoint` 回答 `p.scenes` |
| 卡自己的 `.close` | 71 → 99 | 在面板上方，两种叠法都点得到 |
| 卡自己的钉住键 `[data-hook=pin]` | 409 → 441 | 在面板顶边之下——**如果把卡片降到面板之下，这颗先死** |
| 阳性对照：关掉卡后同一中心 | 221 → 275 | 回答 `button.icon-button` ⇒ 判据不是空转 |

⇒ **这不是速度题，是几何题，而且两边互杀**：现在面板的 × 是死的；把卡片沉下去，卡的钉住键变成死的。
成因写得很清楚：`App.vue` 打开面板时不收起**已钉住**的卡（`dismissArchive` 见 pinned 就 return，钉住本来就是为了不被划走），
而卡是 `.stage` 里 `top:58px; inset-inline-end:14px; z-index:3` 的绝对定位块，面板是从下面升起的满宽块。
今天 CI 看不见它，只因为套件在跑这一段之前会先把卡清掉（`touch-device.mjs:913`）。
⇒ 归 §8 取向题第 11 行，三条修法都动叠放或锚点，得你定。

还能站住的另外三条：
- **机制**：`pressError:"locator.click: Timeout 2500ms exceeded."` 是真的——Playwright 的动作性等待会拒绝按压，
  而拒绝被 `tapAt/clickAt` 吞成 `false`，于是「没按成」和「按了但按钮不理」都落在 `events:[]`。这一族现在有
  `pressHow`／`pressError` 两个读数把两者分开。
- **窗口**：按压预算 2500ms 与折叠窗口 2600ms 同长，慢页上等稳定那段把窗口耗光 ⇒ 盒子归零，
  所以拒绝之后必须**重新唤醒**再按。「dt 上限会压缩折叠窗口」这个假设被实测否证（61fps 唤醒后 1ms 出盒子、
  2697ms 折回；8fps 113ms 出、2590ms 折回 ⇒ `idleMs` 走墙上钟），那个修法没写。
- **不伤人**：正常路径两趟都是 **174/174、0 红**（`/tmp/dev-n2.txt`、`/tmp/dev-fn.txt`；复跑＝去掉上面那两个
  环境变量），因为这一路只在被拒绝时才进。

**CI 仍是这一族唯一有效判决**：本地在 20× 下量不到可信的分母，只能量到"总红数会自己换人"。

**11）那条 `tile 9.0 vs 10.0分钟` 是判据自己撒谎，不是应用把同一个数写成两个数。**

上一段里 20× 那趟有一条看着最像产品缺陷的红：『the tile and the card say the same number of minutes for
the same rod — silver: tile 9.0 vs ["10.0分钟",…]`。两个数不可能来自两处口径——现读：柜子里那颗
（`CollectionSheet.vue:287`）和卡上那一格（`archiveModel.ts:90`）**调的是同一个函数**
`archiveModel.rodMinutes`（复跑：`grep -rn rodMinutes apps/web/src packages/*/src`，除定义与测试只剩这两处）。
⇒ 唯一的可能是卡和tile说的不是同一支烟：全页只有一个 `[data-hook="archive"]`（`App.vue` 的 `archiveFacts` 是单值），
饥饿下那一按没换成这支烟的卡，卡上还是上一支。而旧判据三条断言（`cells===3`、`chosen` 不变、`name.length>0`）
**没有一条钉住"是谁的卡"**——错的那张卡同样满足，所以它一边把状态问题报成应用问题，一边在正常速度下绿着。

改法是就地补同一句话：卡的 `.name` 必须等于那颗 tile 的 `.name`（`heldLocked.tileName` 新增读数），
两条判据都加上（`holding a card you have not met opens its archive…` 那条的标题里就写着 "its archive"）。
反证在页面里现量（`node tests/smoke/probe-card-identity.mjs`，正常速度）：
`lockedRod=silver / lockedName=Menthol / 卡名=Menthol / tile 9.0 / 卡 ["9.0分钟","11","690–780°C"]`
⇒ `sameRod:true`、`minutesAgree:true`，而 `lieAgainstOtherTile:false`（拿柜子里另一颗 Hookah 的名字比就不成立）
⇒ 这一条加得下去、也红得起来。真机套件加完两条判据后正常路径 **174/174、RUN=0**（`/tmp/dev-id2.txt`；
复跑＝`node tests/smoke/touch-device.mjs http://localhost:5175/`，先 `npm run dev`）。

**12）这份文档自己也漂了：一次独立复核抓到 7 处，逐条现量后全部改掉。**

派了一个不带上下文的 agent 把全文的可机械核对数字／行号重算一遍（口径：文件行号要看那一行确实写着这件事；
数数要挂命令；zsh 会把未加引号的 `--include=*.vue` 吞成"no matches found"，所以空结果不算证据）。
它报回 7 处，我**逐条自己复跑**才动手（其中一条它说错的其实是它自己数法不同：AR 表它数 4 条＝我数 4 条，一致）：

1. 语言表 `en 420` → **210**（420 是中英两块相加；见 §5 那条复跑命令）。
2. §8-7 里 `4/420` → **4/210**。
3. `:root` 自定义属性 `19` → **20**——多出来那个正是我这轮自己加的 `--alert-ember`（写文档的人不会主动想起来数自己刚加的东西）。
4. **§5 那张控件表整块错位**（对交付物最坏的一条）：音量根本不是滑块（三档循环按钮）、环境声没有 step、
   写实度是 0–100 step 20 而不是 1–30、休息长度是 1–30 step 1 而不是 0–100 step 5、
   触感是 0–100 step 5 而不是 0–40、每日上限 0–40 step 1 漏了范围、`auto` 是**语言**默认值不是画质档、
   预算 160 挂在 `reducedMotion` 上而不是第四个画质档。⇒ 表里每一行都补了 `SettingsSheet.vue` 的行号，
   让下一个人不必信我。
5. §12 说读数行 `:252-256`"全部 `today?.x ?? 0`"→ 只有三条是；`:252` 回落到 `summary.puffs`，`:255` 只读 `summary.puffs`。
6. §1 把"不做价格"挂在 README「Not built」上 → 那一节没有价格字样（`sed -n '512,563p' README.md | grep -ic price`＝0，
   阳性对照命中 `:361`）；真正的出处是 `SPEC.md:1151` 与落成字段的 `:2228`（现读 `PackContent` 只有 `tier`，没有金额）。
7. §9 说媒体查询"只有 3 条"→ **6 种条件**（`prefers-reduced-motion`×4、`min-width:860px`×3、`hover:hover`×2、
   `pointer:coarse`、`landscape and max-height:520px`、`max-width:859px`）——`hover: hover` 那两条也是我加的。

它另外点了四处"树内查不到静态根据"的数（§8-1 的 2.3–2.6 倍、§8-2 的 spread 0.264/0.190、§8-3 的逐屏对账、
§10 的"约 357s"）：那四条都是探针现读的，**只在跑对应量具的那一刻成立**，引用时要重跑，不要当常数。
⇒ 结论写在这里给下一个改这份文档的人：**它是数出来的，不是抄来的**；每节的复跑命令就是它的有效期。

**13）README 四图按规矩重拍了一遍，然后原样退回——因为画面事实没变；顺带量到两处只在截图里看得见的东西。**

复跑口径（`tests/smoke/readme-shots.mjs` 头部那三行）：`PUBLIC_BASE=/puffly/ npm run build` →
`PUBLIC_BASE=/puffly/ npm run preview` → `node tests/smoke/readme-shots.mjs http://localhost:4173/puffly/`。
四张都写了、`git status` 四个 M，但逐张与已入库版本对照（`git show HEAD:docs/images/<名>.jpg`）之后：
构图、HUD 那颗 34px 的档位符号、道具位置、药丸与底栏**一字不差**，变的只有实时计数（69→71）和烟羽的随机颗粒。
⇒ **四图已 `git checkout` 退回**：为一次无信息量的重拍往待推栈里塞四个二进制 diff 不值得；
这条记录就是"重拍过、比过、不必换"的证据。要验随时上面三行重跑。

截图里另外量到两件事，都记在这里免得下次误读：
- **语言行的阿拉伯语标签在这台机器的无头 Chromium 里是 8 个豆腐块**（DOM 里码位是真的：
  `627 644 639 631 628 64a 629`＝العربية，而 `getComputedStyle(document.body).fontFamily` 是
  `ui-rounded, "SF Pro Rounded", -apple-system, "Segoe UI", system-ui, "Noto Sans", sans-serif`，没有一条点名阿语字族）。
  ⇒ 这是**本机渲染环境**，不是应用缺陷（iOS/Android/Windows 都带阿语兜底），**不要照这张图开单**。
  但它同时说明一件事：这条栈在缺兜底的环境里对非拉丁文没有任何保障，新 UI 如果要认真做 ar，字体栈要显式带一条。
- **Sound 那一行拖的其实不是音量**（见 §5 那两行修正）：行标签是 `settings.sound`，可拖的滑块绑的是
  `settings.ambientVolume`（`SettingsSheet.vue:241/245`），三档循环按钮才动 `volume/muted`。
  截图里那一行正好把两件事画在一起，肉眼分不出谁归谁 ⇒ 归 §8 第 12 行等拍板。

**14）把"谁压住谁"和"够不够手指"做成了一次全页扫描，量出 HUD 的读数格只有 18 px 高——已经修掉。**

新量具 `tests/smoke/probe-covered-controls.mjs`（复跑：`npm run dev` 之后
`node tests/smoke/probe-covered-controls.mjs http://localhost:5175/`）。它走 7 个状态×视口
（待机／货架／设置／钉卡+货架／宽屏／宽屏+设置／横屏），每个可交互控件报两件事：
**COVERED**＝中心点的 `elementFromPoint` 回答了一个外来层；**REACH**＝以它为中心、还能整块命中它自己的
最大正方形（半径按 12/17/22/27/32/40 试探），与自家 `--tap-target` 比。
两处刻意的排除写死在文件里：`.hit` 是舞台的兜底命中面、不是一个目标；被面板滚出可视区的控件算
`scrolledAway`，不算被压住。

改之前（393×852 待机，`away=0`，所以这一格没有滚动带来的假象）：

| 控件 | 盒子 | 实测可命中方块 |
| --- | --- | --- |
| `.hud .num[data-hook="break"]` | 49×18 | **0**（连 24×24 都凑不出） |
| 宽屏 `desk` 的 `.read` ×3 | 47×18／46×18／23×18 | **0** |
| `.cat`（品类标） | 34×34 | 34 |
| 档案卡 `.close` | 28×28 | 24 |
| 档案卡 `[data-hook="pin"]` | 198×32 | 24 |

根因不是"忘了写"，是**两条规则各管一半**：`global.css:134-135` 的 `min-width/min-height: var(--tap-target)`
只挂在 `.icon-button` 上，HUD 的读数格不是 `.icon-button`（它们长得像字），而档案卡的 `.close`
在 `ArchiveCard.vue:209-215` 用 `min-width/min-height: 28px` **主动把这条下限压掉了**。

修法是收成一个家：`global.css` 里一条 `[data-reach]::after`（尺寸取 `--tap-target`、居中、不画墨、
不参与布局），五个控件各加一个 `data-reach`（HudBar 3 处、ArchiveCard 2 处），`.cat` 那份私有的 44px
副本删掉。改完同一把尺复量（2026-10-17 现读四个状态）：`.cat`／`.num`／`.close`／`.pin`／`jump`／`entry`／`alt`／`choice`／`icon-button` **都到 44**（44 是量具网格在 54 边界前的最后一档）。**两处没到，记在这里而不是藏起来**：
① 宽屏 desk 那一排四颗 `.read` 里有一颗 47×18 只到 **34**——它与邻格的间距是 46 px，两个 44 的方块必然互相压住 ⇒ 这一排要真到 44，得先给行让出横向空间（版式决定）。
② 三条滑块 `input.grow` 到 **34**（盒子 822／846×40）：§66 把 range 定成 `height: 40px`，而自家 `--tap-target` 是 44／54 ⇒ 两个数在打架，归 §8 第 14 行。
HUD 那一行总共 40 px 高，把格子撑到 54 会顶开环和时钟，第一次尝试就实测顶开 20 px——所以脸留在原尺寸、只加隐形命中面。

判据：`interaction-states.test.ts` 新增 `gives every thumb-sized control one shared reach, and no second copy of it`
——它钉三件事：工具存在且尺寸取自 token（把 `var(--tap-target)` 手写回 44px 就红）、
带属性的控件数是 3+2（多一个少一个都红）、`HudBar.vue` 里不再出现 `.cat::after`（两份家就红）。
两条谎都现场跑过：硬编 44px ⇒ 红；把注释里那句 `data-reach` 当成属性 ⇒ 计数读出 4 ⇒ 红，
于是计数改成只认"整行只有这个属性"的写法。

真机套件在这一改动之后 **174/174、RUN=0**（`/tmp/dev-reach.txt`）——这条是必要的：给 18 px 高的格子
加 54 px 的隐形命中面，最坏的结果是它把舞台的按压抢走（HUD 正压在舞台上），实测没有。

量具自己的两个坑，记下来免得下次重踩：① 它注入页面的那段是一个模板字符串，**注释里出现反引号会
静默截断整段**（这一版就断过一次，报错长得像页面 bug）；② "中心点被外来层回答"和"控件被面板滚出可视区"
是两件事——第一版的祖先链判据把设置面板最后一行的三颗语言键报成了"被底栏压住"，
而同一份逻辑写在旁边几行却报"已滚出"，两次读数在同一个 evaluate 里自相矛盾；
现在直接点名 `.sheet`，不再走 overflow 链。

**15）键盘这条路扫了一遍：能走通、有焦点环、Tab 会带着面板滚——两次误读都是我自己量错的。**

新量具 `tests/smoke/probe-keyboard-reach.mjs`（复跑：`node tests/smoke/probe-keyboard-reach.mjs http://localhost:5175/`）。
现读（393×852，页面加载后不碰它，chrome 已自行收起）：

| 问的是 | 量到的 |
| --- | --- |
| 从头按 Tab 一共几个落点 | **6**：`.hit` → `.cat` → `.num` → `.pill` → `.tab[settings]` → 回到文档头 |
| 会不会落到"关着的面板里"的控件 | **0 次**（三张关着的 sheet 一个都没进 Tab 序） |
| 打开的设置面板里能走几步 | **19~20 个落点**，且 **Tab 会把面板滚进视野**（`scrollTop` 走到 465）⇒ 每一行都到得了 |
| 键盘焦点上有没有可见环 | 每个被浏览器判为 `:focus-visible` 的落点**都有环**（`focusVisibleWithNoRing = []`） |
| Esc 关不关面板 | **不关**——这是契约（§65：Esc 永远是"把烟掐了"），键盘出路是面板自己的 ×，而它在上面那 19 步里 |

三次"看着像缺陷"的读数都是量具的错，都写回文件里免得下次重踩：
① 第一版把"元素自己 `opacity: 0`"读成"玩家看不见"——**这一版架构里 DOM 常常就是不该画东西**：
`global.css:549-578` 明写 `html.scene3d-text` 下 `.cat / .pill / .rail / .archive` 一律 `opacity: 0`，
墨由 3D 场景画、DOM 只留手点和无障碍那一行（`.cat` 在**未收起**时也是 0，这条一开始就自证了）。
所以那个字段现在叫 `domInk`，回答的是"DOM 这一层在这里画不画"；看得见与否是像素问题
（列亮度对未打光常量），不是计算样式。
② 第一版报"起点日期那颗没有焦点环"，直接复量同一颗：`matches(':focus-visible') = true`、
`outline: 2px solid rgb(255,178,115)` ⇒ 有环。原生 `input[type=date]` 的样式要在焦点落定后再读，
现在只在浏览器自己判为 focus-visible 时才下这个结论。
③ 文件级的坑：这个探针把一段源码作为**模板字符串**注入页面，注释里写反引号会静默截断整段
（本轮第三次踩）。

唯一一条真的、但归你拍的：**用键盘打开面板时，焦点留在底栏那颗 tab 上，没有进面板**
（`focusMovedInsidePanel: false`）。这不是坏——现在再按一次 Enter 就把面板关了，这是键盘用户当前的
快速出路；把焦点搬进面板（标准做法、屏幕阅读器会立刻念出面板）会连带拿走这条 toggle 路。⇒ §8 第 13 行。

**16）"减弱动态效果"这一格：源码里写了，浏览器里没做到——面板在 reduce 下还是滑 380 ms。已修，判据进真机套件。**

新量具 `tests/smoke/probe-reduced-motion.mjs`（复跑：`node tests/smoke/probe-reduced-motion.mjs http://localhost:5175/`）。
它把"还在动的东西"分成 **MOVE（会位移的）** 与 **fade（只是变色／变透明的）**：reduce 该管的是前者，
把后者也一并列出来，下一个人就会去追十条没病的。现读三态（待机／设置面板开着／宽屏）× 两档：

| | 全速 | reduce |
| --- | --- | --- |
| 修之前 | MOVE：`section.sheet transform 0.38s`、`button.icon-button 0.26s` | **MOVE：`section.sheet 0.38s` 还在** |
| 修之后 | MOVE：同上两条（这是给要动的人的，不该动它） | **MOVE：0 条**（fade 各留 3~4 条，是颜色与透明度） |

根因是层叠，不是漏写：reduce 块里那条 `* { transition-duration: 1ms }` 特异性为 0，而
`.sheet[data-open='true']` 用 **shorthand** 重新声明了整条 transition（特异性 0-2-0）⇒ 它压过通配，
面板照旧旅行。修法不是把通配写得更狠，而是就地补一条同特异性的规则，**把 `transform` 从"会动的属性"里摘出去、
留下 §61 要的那个淡入**（`transition-property: opacity, visibility`）：面板到位不再滑行，淡入还是 300 ms。

判据：真机套件第 175 条，**带正对照**——同一把尺在全速档必须看得见 `section.sheet 0.38s`，看不见就说明扫描是空的。
现读 `{"sheetsOpen":{"control":1,"underReduce":1},"control":["section.sheet 0.38s","button.icon-button 0.26s"],"underReduce":[]}`。
它第一版红在自己的对照上：我自己手写了一次 `tap + click().catch()`，被拒的按压被 `catch` 吞掉，读数就成"面板没开"。
换成套件既有的 `openSheet()` 路由、并把 `sheetsOpen` 印进读数之后，才分得清是谁的问题。

同一轮顺手修掉另一条**会自己撒谎的判据**：`S: the released breath is the 8 ml / 24 px / 0.6 s recipe`
量到 `tier M / 24 ml / 52 px / 1.2 s`。不在引擎——`holdDraw(0.3)` 的语义是"held 到引擎看见 ≥0.3 s 为止"，
机器忙时一次轮询几百毫秒，0.3 s 的委托能飘进 M 档（`puffTier.ts` 里 S 的窗口是 `maxSeconds: 1`）。
⇒ 飘出窗口就重试一次，并把**实际 held 秒数**印进读数（`held 0.3s (S ends at 1s) -> {"tier":"S",…}`）；
下次再红，它会先回答是驱动飘了还是档位错了。

**17）无字层扫了一遍：31 颗控件一颗没剩空壳——但这条"干净"差点是假的，两处尺子先修了。**

新量具 `tests/smoke/probe-no-prose-layer.mjs`（复跑：`node tests/smoke/probe-no-prose-layer.mjs http://localhost:5175/`）。
它问的是这一层最坏的一种病：**一颗控件的全部内容本来就是一个词**，词没了之后它就什么都不是——没有图形、
没有边框、没有底色，只剩一块能按的空气（3D 那边也救不了它：场景画的是 DOM 文字与记号的镜像，
DOM 里两样都没有，场景就没有东西可画）。

现读（393×852：面板开着 → 切到 icons → 关面板只剩舞台）：

| 状态 | 档位（`aria-pressed`） | 面板行标签字数 | 控件数 | 什么都没有了的控件 |
| --- | --- | --- | --- | --- |
| 设置面板开着，带字 | `["auto"]` | 15 | 31 | **0** |
| 设置面板开着，无字 | `["icons"]` | **0** | 31 | **0** |
| 关掉面板，只剩舞台 | `["icons"]` | 0 | 4 | **0** |

两处先修的尺子（不修就是两条假结论）：
- 第一版报了 6 颗"空壳"，**全是 `input[type=range]`**。滑块的轨道与滑块头画在**伪元素**上，DOM 查不到，
  而 `getComputedStyle(el, '::-webkit-slider-thumb')` 在 Chromium 里回的是元素自己的值
  （实测：一个 195×40 的透明盒，真相是 22 px 的圆头）。这个应用已经把那份墨提成了 `--slider-*`
  自定义属性（`global.css:332-367`），**读那个才作数** ⇒ 改完 6 颗归零。
- `wordsDropped` 只掉了 1，说明我可能把带字那层量了两遍。于是补两个"这层真的开了"的读数：
  档位按钮的 `aria-pressed`（`auto → icons`）与面板行标签字数（`15 → 0`）。
  顺带推翻我自己上一轮写进 §11 的一句证据：**`data-cues` 不是无字层的标志**——它是提示通道，
  面板一开就变 `audio`，那时字还在（第一趟读数就是 `cues=audio` + `labelWords=15`）。
  ⇒ 证据要挑那个**只会为这件事变**的读数。

⇒ 这一格**已经做对**，归进上面第 9 族那份"负结果清单"。对新 UI 的约束照旧：
一颗控件在无字层里必须还剩记号或表面，词不能是它唯一的墨。

---

**18）CI 那一趟为什么会"整跑丢掉"：三处没加界的 `page.click` —— 其中把它压垮的那一笔，是我的 `data-reach` 惹的。**

在 CI 的环境下本地复跑（软件 WebGL 代理，命令在 §10），第一趟**跑到第 255 行就死了**：
未捕获的 `TimeoutError`，来自一句裸的 `await page.click('.sheet[data-open="true"] .close')`。
Playwright 的动作性等待拒绝按压 → 重试到超时 → **抛出** → 后面一百多条判据一条都不报，
读数就变成"这一趟没跑完"而不是"这一条红"。这正是 #159 记过的那个形状，只是又换了三个入口。

成因链有三节，中间那节是我的改动接上的：
① 套件里还留着 **3 处没有 `.catch()` 的 `page.click(selector)`**（`:3474`、`:3527`、`:3579`），
   而同文件早就有 `tapAt/clickAt` 这套"有界、把拒绝咽下、让下游判据去报"的规矩；
② 那一刻**钉住的档案卡正压在面板的关闭键上**（§8-11 那条待拍板），日志里拦截者写得很清楚：
   `button.pin … from <aside class="archive">`；
③ 而我把卡上 `.close`(28px) 与 `.pin`(32px) 的隐形命中面提到 `--tap-target`（54px）——
   **原本勉强能挤过去的按压，从此被拒**。所以"红变成丢跑"这一步是我造成的；
   本地正常速度那几趟全是 174/174，看不见它——只有 CI 那种慢页会踩到。

修法两半，都不动那条待拍板的几何题：三处点击改成 `timeout: 3000 + .catch(() => {})`
（**判据不放宽**：`opened`／`scrollProof`／`closed` 这些下游读数才是报告者，拒绝照样红，只是不再带走全跑）；
`openSheet` 里"先把钉住的卡清掉"那一步补一条**送达式**兜底——`clickAt` 拒绝后就按 `.close` 自己的中心
用 `touchscreen.tap` 原语再按一次，两次尝试都没清掉就打印 `CARD NOT CLEARED <选择器>`。

复跑同一条件同一产物之后：**167/175、跑完、`CARD NOT CLEARED` 出现 0 次**，S10 那 10 条全绿
（包括死掉的那条 `closing the sheet brings the scene back to the same pixels`）。
剩下 8 条红的族与本轮改动无关：4 条是"整场 3D 没起来"（`visibility: missing`、`nameMax 0`、meshes 0），
其余是 dial／计数／落雪碎片那类时机读数。⇒ **这是第一次在推送之前拿到 CI 环境的数**，
把它记在这里，是为了下一次推送前有人能复现这句话，而不是又一次靠 CI 去试。



**19）这一格不是我自己想到的——是融合进来的那份技能清单点出来的，量完确实是个 bug。**

`.qoder/skills/web-design-guidelines/SKILL.md`（AAS 装进来的 7 个之一）的工作流是"先取上游规则、再对着文件逐条查"。
照它做了：取回 Web Interface Guidelines，把可机械核对的那批逐条查这个应用。**结果分三类。**

一、**查到一处真缺陷，已修**（就是 §6.1 新增那一行）：开屏背景 `#121317` vs 应用背景 `#0b0a09`，
实测相对亮度 **2.13 倍**之差（`at commit rgb(18,19,23)` → `after boot rgb(11,10,9)`），
`theme-color` 也停在旧值上，于是浏览器那条栏永远和运行中的页面不同色；manifest 早就是 `#0b0a09` ⇒ 四处三个数。
修完复测 `at commit rgb(11,10,9)`、`theme #0b0a09`，四处一个数。
判据 `boot-colour.test.ts` 钉的是"四个地方必须同数"，把开屏色改回 `#121317` 两条都红（现场跑过）。

二、**查到一处结构性的缺，但它撞本仓另一条契约，所以只登记**（§8 第 15 行）：
**全应用零标题元素**——源码 `grep -rnoE '<h[1-6]' apps/web/src` 命中 **0**，运行中的页面
`document.querySelectorAll('h1,h2,h3,h4,h5,h6').length` 也读到 **0**。屏幕阅读器用户因此没有
"跳到下一节"的落脚点。补法要么加视觉隐藏的标题（**那就在无字层里塞进了成句文字**——§8-8 那条
live-region 冲突是同一族：有一族判据钉着"无字层不得有成句文字"，它扫整篇文档），
要么给可见的小标题（那是版式决定）。两条都动契约，不自行改。

三、**一批"看起来会缺"的，实测全部已经做对**（负结果，别再重做）：
`transition: all` **0 处**；只动 `transform/opacity` 之外的属性的 transition **0 处**；
文案里没有一处 ASCII 三点省略号（`…` 用得对）；**没有 `<img>`、没有 `<select>`**（所以 alt／Windows 原生下拉那两条不适用）；
`color-scheme: dark` 在 `index.html:22` 有；安全区 `env(safe-area-inset-*)` 在用；
最大的一屏列表是 32 个 `.swatch`（另有 21 房间／12 盒／11 支烟），**都在"＞50 才要虚拟化"那条门槛下面**——
现读口径：打开设置面板后 `document.querySelectorAll('.swatch').length`。

---

## 12. 状态矩阵（新 UI 必须为这些留位置；每行都是现读代码得到的）

| 状态 | 今天怎么处理（出处） | 缺什么 |
| --- | --- | --- |
| 今日还没有一支（`sessionCount` 无值） | 直接算 0：`SessionSheet.vue:83` `?? 0`，读数行 `:252-256` 里三条用 `today?.x ?? 0`（`:253` ☀、`:254` 🌙、`:256` 🌫️），另外两条不是：`:252` 是 `today?.puffs ?? summary.puffs`（没有今天就用整场），`:255` 🔥 干脆只读 `summary.puffs` | 没有"今天还没有"的空态语汇；成就/收集侧用 `'还没有'`（`copy.ts:515` `ach.unit.locked`），两套口径不同 |
| 货架里未解锁的格子 | 用**色块**压住（`CollectionSheet.vue:645` 注释写明"压的是色块不是字"），格子本身是可聚焦按钮带 `aria-pressed`；档案格 `ArchiveTile.vue:24` 空档 = 空字符串 | 视觉语言已定，但"空"这件事只有色块、没有读数的位置约定 |
| 存档降级（IndexedDB 不可用，落到内存） | 有露出：`SettingsSheet.vue:216` 的 `◍` + `aria-label`；标志位由 `usePuffly.ts:665/668/852/960` 维护 | **可见面只有一个半透明记号**（第 8 节第 9 条） |
| 音频不可用（静音/自动播放策略/无 Web Audio） | `SettingsSheet.vue:211` 的 🔇 + `aria-label`；§63 规定此时**画面接管提示**（cue 通道 `data-cues`） | 记号同上；画面接管这条有真机判据 |
| 导入失败 | `importState: 'idle'\|'ok'\|'bad'`（`SettingsSheet.vue:73/79/102`），坏态用 `--alert-ember`（本轮收成 token，原为字面 `#e2604a`） | 只有颜色变化，没有一句"为什么失败" |
| 清空数据 | 两段式：按钮变橙 + `again` + 6 秒失效（第 5 节），写回闸门是 `persistence.reset()` | 已定形，别再改成弹窗（§62 禁弹窗滥用） |
| 离线 | **运行时没有任何 `onLine`/`offline` 处理**（现读：`grep -rn "onLine|offline" apps/web/src --include=*.vue --include=*.ts` 得 **1**，且那一处是测试文件里的注释；离线缓存只出现在 `apps/web/vite.config.ts` 的 PWA 配置）⇒ 这是对的：SPEC §52 零网络代码、§53 PWA 全本地 | ⇒ 新 UI **不要发明离线横幅/重试态**，那会凭空造出一个产品没有的失败面 |
| 没有 GPU／帧率极低 | 画质四档（`auto/high/balanced/light`，预算 1400/800/380/160）；DPR 上限按档位；15fps 的静置降频（§71 计数不受影响）；后台续燃按系统时钟补 | 玩家看不见"我现在在降档跑"——这是个取向，不是 bug |
| 触觉不可用（无 `navigator.vibrate`） | 整行隐藏：`SettingsSheet.vue:483/521` `v-if="game.canVibrate.value"`（标志位 `usePuffly.ts:394`） | 隐藏即无声；与"降级记号"是同一族问题（少了这件事 vs 没有这件事） |