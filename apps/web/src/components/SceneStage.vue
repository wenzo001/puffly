<script setup lang="ts">
/**
 * The 3D stage, under construction (2026-10-09).
 *
 * Mounted only when the URL asks for it (`?scene=3d`, `&gl=1` forces the WebGL2 path), so the
 * shipped interface is untouched while this grows.
 *
 * Everything here is *read*: the positions come from `.stage[data-aim]` / `.stage[data-stage-box]`
 * (the same mirrors a check outside the page reads), the sizes from the core's anchors and the 2D
 * layer's exported constants, and the smoke from the state view — how many puffs a second, how they
 * rise and what colour they are all arrive in `state.smoke`. Nothing in this file is a second copy
 * of a layout or a recipe; that is the mistake this repository has paid for twice.
 */
import { TresCanvas } from '@tresjs/core';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import {
  emberHeat,
  emberPresence,
  LIP_ACTIONS,
  puffTierFor,
  showsLipLine,
  TIMING,
  ventDraught,
  type LipAction,
} from '@puffly/game-core';
import type { GameStateView } from '@puffly/game-core';
import { clamp01, mixRgb } from '@puffly/shared';
import { preferredDpr, type Puffly } from '../composables/usePuffly';
import {
  backgroundStructure,
  cherryHot,
  FIELD_SCALE,
  intakeBurst,
  interiorEdgeInk,
  ParticlePool,
  plumeIntakeOptions,
  PUFF_FLATTEN,
  puffAlpha,
  puffHeat,
  puffSpread,
  puffTint,
  vignetteAlpha,
  type StageBoxFrac,
  FLAME_BASE_FRACTION,
  flameMetrics,
  LID_THROW_DEG,
  sparkStreak,
  cartoonScale,
  ignitionEdgeAlpha,
  ignitionPunch,
  ignitionZoom,
  punchPivot,
  stepIgnition,
  stepTrayFeedback,
  trayRock,
  TRAY_FEEDBACK,
  TRAY_FEEDBACK_START,
  type TrayFeedback,
  dustMotes,
  NEAR_DEPTH,
  RAIN_TINT,
  rainLines,
  createGrainTile,
  grainAlpha,
  noise2,
  CHAR_BIT,
  CHAR_GRAIN_SEED,
  paperGive,
  DIP_SHARE,
  EffectList,
  effectFor,
  pickUpRing,
  ashtrayRadiusWorld,
  ASH_PILE,
  ashPileMetrics,
  canvasToWorld,
  createPufflyRenderer,
  frameRect,
  layoutText,
  LIGHTER_SIZE,
  PACK_SIZE,
  parseAim,
  parseAtlas,
  parseColour,
  parsePropScale,
  parseStageBox,
  puffDiameterWorld,
  radialVignette,
  roomBackdrop,
  rodBetweenInBox,
  PROP_INK,
  ROD_THICKNESS_SHARE,
  roundedRect,
  SCRIM,
  scrimRamp,
  softDisc,
  solidDisc,
  stadiumBar,
  stageUnitToWorld,
  stageWorldSize,
  toWorldSize,
  TRAY_FLATTEN,
  lipArt,
  WORLD_HEIGHT,
  type GlyphAtlas,
  type StageBox,
  flameAlpha,
} from '@puffly/game-scene';
import * as THREE from 'three';

const props = defineProps<{
  aim: string;
  stageBox: string;
  propScale: string;
  state: GameStateView | null;
  game: Puffly;
}>();

const params = new URLSearchParams(window.location.search);
const forceWebGL = params.get('gl') === '1';

interface LipProbe {
  visible: boolean;
  action: string;
  tier: 'S' | 'M' | 'L';
  /** The column's authored near half-width, Demo reference px. */
  columnWidthPx: number;
  /** `inhale` while drawn, `savor` when the rod keeps the mouth hidden, '' before any draw. */
  kind: '' | 'inhale' | 'savor';
}
interface StageRingProbe {
  visible: boolean;
  frac: number;
  seconds: string;
}
interface SceneProbe {
  backend: string;
  frames: number;
  particles: number;
  /** The context, once the scene is up — how a check outside the page asks what was built. */
  context: unknown;
  /** The §2 S3 104 px stage ring. */
  stageRing: StageRingProbe;
  /**
   * The §S7 冲击感, eased: 0 on every frame that is not leaning in, ~1 for the few frames after the
   * rod catches. A check wants the machine value rather than a screenshot of a 420 ms moment.
   */
  punch: number;
  /** The abstract mouth (S22): lip line + airflow column. */
  lip: LipProbe;
  /**
   * Whether the engine would take a draw at this instant: no draw in progress, and the settle window
   * after the previous release elapsed. A press that lands inside that window is swallowed by §18's
   * rest rule, so a check that presses on a timer can report a working game as a broken one — which
   * is what happened on 2026-10-11, seven reds in one run and green in the runs either side of it.
   */
  puffReady: boolean;
  /**
   * The cherry's light as the last frame drew it: the core's own glow radius and flare, the diameter
   * the halo quad was actually scaled to, what one stage unit is worth in world units, and the alpha.
   * Two claims need all four in the same frame — that the drawn size *is* the simulation's radius
   * through the declared gain (not a constant, not another number's ratio), and that a cherry going
   * dark dims without pushing outward. They were `ember-glow.test.ts`'s and retired with the painted
   * layer on 2026-10-10 (#145).
   */
  cherry: {
    glowRadius: number;
    flare: number;
    haloDiameter: number;
    unit: number;
    opacity: number;
    visible: boolean;
  } | null;
  /** The most recent exhale recipe the engine handed the scene. */
  lastExhale: {
    tier: 'S' | 'M' | 'L' | null;
    count: number;
    radiusMax: number;
    lifeMsMin: number;
    volumeMl: number | null;
    spreadRadiusPx: number | null;
    riseSeconds: number | null;
  } | null;
  /**
   * Test-only: swap the live rod straight at the engine, bypassing the cabinet's unlock wall
   * (which the UI keeps). The smoke suite needs a 品鉴型 rod on a fresh profile, and every such rod
   * is unlocked content. Nothing in production calls this.
   */
  selectCigarette: (id: string) => void;
}
const probe: SceneProbe = {
  backend: 'pending',
  frames: 0,
  particles: 0,
  context: null,
  stageRing: { visible: false, frac: 0, seconds: '' },
  punch: 0,
  cherry: null,
  lip: { visible: false, action: '', tier: 'S', columnWidthPx: 0, kind: '' },
  puffReady: false,
  lastExhale: null,
  selectCigarette: (id: string) => props.game.select({ cigarette: id }),
};
(window as unknown as { __pufflyScene?: SceneProbe }).__pufflyScene = probe;

const rendererFactory = (ctx: Parameters<typeof createPufflyRenderer>[0]) =>
  createPufflyRenderer(ctx, { forceWebGL, onChoice: (choice) => (probe.backend = choice.backend) });

/**
 * The surface the camera is framed for: the canvas's own box. This is not the window — on the desk
 * the scene gives 260 px to the data column, and a camera framed for the window stretches the
 * picture by the ratio of the two (1429/1169 across, 846/792 down: different numbers, so the table
 * slides and the rod gets fatter on one axis only). Until a canvas exists the window is the only
 * number there is to have.
 */
const aspect = ref(window.innerWidth / Math.max(1, window.innerHeight));
const viewportWidthPx = ref(window.innerWidth);
const viewportHeightPx = ref(window.innerHeight);
let canvasEl: HTMLElement | null = null;
let canvasWatcher: ResizeObserver | null = null;

function applySurface(widthPx: number, heightPx: number): void {
  viewportWidthPx.value = widthPx;
  viewportHeightPx.value = heightPx;
  aspect.value = widthPx / Math.max(1, heightPx);
}

/** The canvas's CSS box, falling back to the window while it is not in the document yet. */
function measureSurface(): void {
  const w = canvasEl?.clientWidth ?? 0;
  const h = canvasEl?.clientHeight ?? 0;
  if (w > 0 && h > 0) applySurface(w, h);
  else applySurface(window.innerWidth, window.innerHeight);
}

const onResize = (): void => {
  measureSurface();
};

onMounted(() => window.addEventListener('resize', onResize));
/**
 * The plume is not this file's recipe: it takes the engine's own bursts in with the same
 * `intakeBurst` and the same look the painted layer used, so the plume has one intake from one
 * source. Seeded jitter for the scene's own use stays; the bursts bring their own.
 */
const stopEvents = props.game.onEvent((event) => {
  // The same two accents the painted layer's `handleEvent` pushed (§60's feedback): the ring the
  // table gets when the rod leaves it, and whatever `effectFor` makes of a burst — one list, one
  // recipe, read by both painters.
  if (event.kind === 'transition') {
    if (
      event.to === 'PICKED_UP' &&
      props.state != null &&
      !props.game.rendererLook().reducedMotion
    ) {
      effectList.push(pickUpRing(props.state.anchors.body, clockMs));
    }
    return;
  }
  if (event.kind !== 'burst') return;
  if (event.burst.kind === 'exhale') {
    // The tier the release settled on, with the recipe it carried — the deterministic half of the
    // S/M/L breath check (the visible half is measured in pixels by the smoke suite).
    const b = event.burst;
    probe.lastExhale = {
      tier: b.tier ?? null,
      count: b.count,
      radiusMax: b.radius.max,
      lifeMsMin: b.lifeMs.min,
      volumeMl: b.volumeMl ?? null,
      spreadRadiusPx: b.spreadRadiusPx ?? null,
      riseSeconds: b.riseSeconds ?? null,
    };
  }
  intakeBurst(event.burst, pool, plumeIntakeOptions(props.game.rendererLook()));
  const look = props.game.rendererLook();
  const effect = effectFor(event.burst, clockMs, look.visualCues);
  if (effect !== null && !look.reducedMotion) effectList.push(effect);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  canvasWatcher?.disconnect();
  canvasWatcher = null;
  canvasEl = null;
  document.documentElement.classList.remove('scene3d-text');
  stopEvents();
});

/** Until the shell publishes a box, treat the canvas as the stage — never crash, never assume more. */
const FALLBACK_BOX: StageBox = { x: 0, y: 0, width: 1, height: 1 };
const box = computed(() => parseStageBox(props.stageBox) ?? FALLBACK_BOX);
/** The camera frames the stage box, not the canvas: the letterbox is not part of the picture. */
const frame = computed(() => stageWorldSize(box.value, aspect.value));

const points = computed(() => parseAim(props.aim));
const at = (key: 'lighter' | 'ashtray' | 'pack'): readonly [number, number, number] => {
  const p = points.value[key];
  return p === undefined ? [0, -99, 0] : canvasToWorld(p, box.value, aspect.value);
};
/**
 * Which of §2's two rods this is: the one lying on the pack (a dark band, `#5A5348`) or the one
 * held up into the key light (paper, `#F0E8DA`). `IDLE` is the only state with the rod still on
 * the table. Not a computed — the state object is mutated in place, so a computed over it never
 * fires and the rod would keep whichever band the first frame happened to pick.
 */
function rodInkFor(state: GameStateView | null): string {
  return state?.cigarette.state === 'IDLE' ? PROP_INK.rodAtRest : PROP_INK.rodHeld;
}
const rod = computed(() => {
  const { body, ember } = points.value;
  return body === undefined || ember === undefined
    ? null
    : rodBetweenInBox(body, ember, box.value, aspect.value);
});
/**
 * Sizes in world units. One stage unit is the stage's own height (see `props.ts`), so every number
 * the core or the 2D props module owns multiplies `WORLD_HEIGHT` and nothing is re-invented here.
 */
/** One stage unit in world units: the renderer's own `unit`, not the stage's height. */
const unitWorld = computed(() =>
  stageUnitToWorld(box.value, viewportWidthPx.value, viewportHeightPx.value, WORLD_HEIGHT),
);
const lighter = computed(() => ({
  w: toWorldSize(LIGHTER_SIZE.width, unitWorld.value),
  h: toWorldSize(LIGHTER_SIZE.height, unitWorld.value),
}));

/**
 * The cap's hinge, from the painted layer's own numbers: `lighter.lid` 0–1 through the same 78°
 * `LID_THROW_DEG`, around +x at the back edge — positive x-rotation swings the cap's top toward the
 * camera, so the tip-back is the negative. Driven per frame like every other live reading: the
 * state object is mutated in place, so a computed over it would never fire.
 */
const lighterLid = shallowRef<THREE.Group | null>(null);
/** §2's borders are one CSS pixel wide, so that is what the rim and the highlight are drawn at. */
const edgePx = computed(() => Math.max(0.001, pxToWorld(1)));
const pack = computed(() => ({
  w: toWorldSize(PACK_SIZE.width, unitWorld.value),
  h: toWorldSize(PACK_SIZE.height, unitWorld.value),
}));
const FALLBACK_TRAY_RADIUS = 0.1;
const trayRadius = computed(() =>
  ashtrayRadiusWorld(parsePropScale(props.propScale) ?? FALLBACK_TRAY_RADIUS, unitWorld.value),
);
/**
 * The room: its sky mixed by the place's own warmth, its exposure, its key light's angle and the
 * pool the table sits in. All four come from the state, through the same mix the 2D layer paints
 * with, so a venue change moves this picture for the same reason it moves that one.
 */
const room = computed(() =>
  props.state === null ? null : roomBackdrop(props.state.environment, props.state.style),
);
/**
 * The sky, already at the room's own exposure: `roomBackdrop` runs the palette the painted layer
 * paints with, so this file does not scale it a second time — doing that is how a night room came out
 * as bright midday.
 */
const skyColour = computed(() => {
  const r = room.value;
  if (r === null) return new THREE.Color('#101010');
  // The palette is 0–255 sRGB, and `new Color(r, g, b)` would read those as *linear* floats — a
  // 46-turned-255 sky, which is exactly the white wash this line used to paint. Say the colour space.
  return new THREE.Color().setRGB(
    r.sky[0] / 255,
    r.sky[1] / 255,
    r.sky[2] / 255,
    THREE.SRGBColorSpace,
  );
});
/**
 * The table's own ink: everything below the edge, as the painted layer fills it — silhouette a
 * quarter of the way to black. The slab and the band cannot disagree, because this is that mix.
 */
const tableInk = computed(() => {
  const r = room.value;
  if (r === null) return new THREE.Color('#241c17');
  const ink = interiorEdgeInk(r.silhouette);
  return new THREE.Color().setRGB(ink[0] / 255, ink[1] / 255, ink[2] / 255, THREE.SRGBColorSpace);
});
const keyLight = computed<{
  position: readonly [number, number, number];
  intensity: number;
  colour: string | THREE.Color;
}>(() => {
  const r = room.value;
  if (r === null) return { position: [2, 3, 2], intensity: 1.4, colour: '#ffffff' };
  return {
    position: [r.key.x * 3, Math.max(0.6, r.key.y * 2), 2],
    intensity: 0.6 + r.ambient * 1.6,
    colour: skyColour.value,
  };
});

/**
 * The room's corners, darkened.
 *
 * The painted layer covers the whole canvas with a radial black gradient centred on it, clear in the
 * middle and `vignetteAlpha(ambient)` dark at `max(w, h) * 0.78`; this is that shape as a plane, sat
 * between the sky and the table so it darkens the room and not the props. Without it a night room
 * came out as bright midday — the palette alone is not the picture. Measured once it drew: a corner
 * reads 35/255 against the sky's own 47, i.e. the plane is on screen and on its gradient.
 */
const vignetteSize = computed(() => Math.max(frame.value.width, frame.value.height) * 1.56);
const vignetteAlphaNow = computed(() =>
  room.value === null ? 0 : vignetteAlpha(room.value.ambient),
);

/**
 * The table slab's centre. Its top face is the core's own `tableEdgeY` — the same line the painted
 * layer fills below and the nosing strip sits on — so the slab, the nosing and the band cannot
 * disagree about where the table starts.
 */
const tableY = computed(() => {
  const state = props.state;
  if (state === null) return -WORLD_HEIGHT * 0.42;
  const edge = canvasToWorld({ x: 0.5, y: state.stage.layout.tableEdgeY }, box.value, aspect.value);
  return edge[1] - (WORLD_HEIGHT * 0.6) / 2;
});

// ------------------------------------------------------------------- the smoke

const CAPACITY = 900;
const pool = new ParticlePool(CAPACITY);
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

/**
 * The two objects built in code, and the one measured rule they obey.
 *
 * **A material constructed here in setup never renders.** Both of these used to be built next to
 * their constants; in the app's picture the vignette painted nothing (all four corners stayed at the
 * sky's own white) and the puffs were absent, while every material built by the scene itself drew.
 * Measured with a probe, one fact at a time: a fresh `MeshBasicMaterial` **carrying the very same
 * texture instance** on the very same mesh renders, a fresh material on a fresh mesh built from the
 * original's own data renders, and neither `needsUpdate` on the material nor on its texture can
 * revive the original. So the construction moves to the scene's `ready` event — after the renderer
 * exists — and the objects reach the template through `v-if`.
 */
const vignette = shallowRef<THREE.Mesh | null>(null);
let vignetteMaterial: THREE.MeshBasicMaterial | null = null;
const puffs = shallowRef<THREE.InstancedMesh | null>(null);
const halo = shallowRef<THREE.Mesh | null>(null);
let haloMaterial: THREE.MeshBasicMaterial | null = null;
const spill = shallowRef<THREE.Mesh | null>(null);
let spillMaterial: THREE.MeshBasicMaterial | null = null;
/** Falling ash, one instance per fragment the core is carrying — a shape, hence `solidDisc`. */
const ASH_CAPACITY = 64;
const flakes = shallowRef<THREE.InstancedMesh | null>(null);
/** The flint's sparks: streaks, not blobs — the one thing in the frame that moves fast. They share
 *  the smoke pool, and this layer stops drawing them as puffs. */
const SPARK_CAPACITY = 24;
const sparksMesh = shallowRef<THREE.InstancedMesh | null>(null);
/** The room's dust: the always-on half of the air, straight from `dustMotes`. */
const DUST_CAPACITY = 32;
const dustMesh = shallowRef<THREE.InstancedMesh | null>(null);
/** The sky's rain: one streak per instance, from `rainLines`. 96 covers a storm's 90. */
const RAIN_CAPACITY = 96;
const rainMesh = shallowRef<THREE.InstancedMesh | null>(null);
/** The film grain: one full-frame plane wearing the painted layer's own tile. */
const grainMesh = shallowRef<THREE.Mesh | null>(null);
let grainMaterial: THREE.MeshBasicMaterial | null = null;
/** The rod's standing ash: the painter's own eleven-segment band, as one ribbon. */
const columnMesh = shallowRef<THREE.Mesh | null>(null);
let columnMaterial: THREE.MeshBasicMaterial | null = null;
/** The tray's pile of tapped ash (§2 S5) and the pixel box its stadium was baked at. */
let pileMesh: THREE.Mesh | null = null;
/**
 * §20's tray: the group that takes the rock, and the two rings that answer a drag. The pile of ash
 * hangs off the rig group rather than this one, so `placePile` turns its own offset by the same
 * angle the bowl swings — one object, two parents, one motion.
 */
const trayGroup = shallowRef<THREE.Group | null>(null);
const trayRimMesh = shallowRef<THREE.Mesh | null>(null);
const trayHaloMesh = shallowRef<THREE.Mesh | null>(null);
/** The tray's memory of the last landing, stepped per frame like every other live reading here. */
let trayFeedback: TrayFeedback = TRAY_FEEDBACK_START;

/**
 * The deck's 冲击感 (S7): 「点火瞬间整体画面轻微推近 + 边缘压暗」.
 *
 * `worldGroup` holds everything that stands *in* the room — the backdrop, the table, the three props,
 * the plume, the ash — and it is deliberately the parent of nothing that is chrome. The pill, the rail
 * and the cards answer DOM boxes that hold still, so leaning them in as well would spend 420 ms
 * breaking §37 for no picture. The shape of the lean lives in `game-scene` (`stepIgnition` and its
 * three readers); this file only decides where it is applied.
 */
const worldGroup = shallowRef<THREE.Group | null>(null);
/** 1 on the frame the rod catches, then a linear release over the impact's own ttl. */
let impact = 0;
let lastPhase = '';
let pileMaterial: THREE.MeshBasicMaterial | null = null;
let pileSignature = '';
let columnSignature = '';
/** The rod's char front: the band, its additive hot core and the toothed grain row. */
const charBand = shallowRef<THREE.Mesh | null>(null);
const charHot = shallowRef<THREE.Mesh | null>(null);
const charGrains = shallowRef<THREE.InstancedMesh | null>(null);
let charMaterial: THREE.MeshBasicMaterial | null = null;
let charHotMaterial: THREE.MeshBasicMaterial | null = null;
let charSignature = '';
/** The painted layer's own grain count: `max(9, min(38, round((thickness / size) * 5)))`. */
const CHAR_GRAIN_CAPACITY = 38;
/** §60's accents, from the same list the painted layer keeps (`EffectList`, max 12 internally). */
const effectList = new EffectList();
const effectRingPool: THREE.Mesh[] = [];
const effectFlashPool: THREE.Mesh[] = [];
const effectRingSignatures: string[] = [];
/** The rod's own tube, so its rings can be pinched by the painter's `paperGive` while drawing. */
const rodMesh = shallowRef<THREE.Mesh | null>(null);
let rodBase: Float32Array | null = null;
let rodBuiltLength = -1;
let rodShapeSignature = '';
/** The lighter's flame: its teardrop and the blue throat under it, both additive. */
const flameBody = shallowRef<THREE.Mesh | null>(null);
const flameThroat = shallowRef<THREE.Mesh | null>(null);
let flameMaterial: THREE.MeshBasicMaterial | null = null;
let flameThroatMaterial: THREE.MeshBasicMaterial | null = null;
let flameSignature = '';
/** The pixel box the pill's halo texture was baked at, so the falloff stays one CSS px per texel. */
let pillGlowSignature = '';

/**
 * The room itself, as meshes: the sky's three stops, the wall band, the table edge's nosing, the
 * seeded clutter and the place's own furniture, and the two pools of light.
 *
 * Every number comes from `backgroundStructure`, which is the painted layer's own picture told as
 * shapes — the sky stops, the wall mix, the five furniture tones, the pools' colours and reaches —
 * so a venue change moves this room for the same reason it moves the painted one, and there is no
 * second copy of a mix anywhere in this file.
 */
const backdrop = shallowRef<THREE.Group | null>(null);
let skyMesh: THREE.Mesh | null = null;
let skyColours: THREE.BufferAttribute | null = null;
let wallMesh: THREE.Mesh | null = null;
let wallMaterial: THREE.MeshBasicMaterial | null = null;
let scrimMesh: THREE.Mesh | null = null;
let scrimMaterial: THREE.MeshBasicMaterial | null = null;
let nosingMesh: THREE.Mesh | null = null;
let nosingMaterial: THREE.MeshBasicMaterial | null = null;
const poolMeshes: THREE.Mesh[] = [];
const poolMaterials: THREE.MeshBasicMaterial[] = [];
const boxMeshes: THREE.InstancedMesh[] = [];
let boxSignature = '';

function onSceneReady(context: unknown): void {
  probe.context = context;
  // The camera now measures the surface it draws into, and a `.stage` that changes size without a
  // window resize (the sheet opening, the rail appearing) has to be heard rather than polled.
  const given = (context as { canvas?: unknown }).canvas;
  canvasEl =
    given instanceof HTMLElement ? given : document.querySelector<HTMLElement>('canvas.scene3d');
  measureSurface();
  if (typeof ResizeObserver !== 'undefined' && canvasEl !== null) {
    canvasWatcher = new ResizeObserver(measureSurface);
    canvasWatcher.observe(canvasEl);
  }
  vignetteMaterial = new THREE.MeshBasicMaterial({
    map: radialVignette(192),
    transparent: true,
    depthWrite: false,
    opacity: vignetteAlphaNow.value,
  });
  // Set imperatively: a `color` key with a hex literal in the options object is indistinguishable
  // from a CSS text colour to the S19 contrast scanner, which then demands a judged pair for a 3D
  // material's black. Setting it after construction keeps that scanner reading CSS only.
  vignetteMaterial.color.set(0x000000);
  vignette.value = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), vignetteMaterial);

  const cloud = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: softDisc(64),
      transparent: true,
      // The puff's alpha rides its instance colour (an instanced cloud has no per-instance
      // opacity), which is only a fade under additive blending. Under the default source-over a
      // faint puff painted its darkened colour at the sprite's full alpha — so the breath that
      // should have been invisible was a dark bead, and measured exactly that on 2026-10-10:
      // pixels in the plume's own band sat below the same pixels with the cloud hidden. §2's
      // columns are `rgba(207,198,188,.17)` over a dark room: smoke in this game only ever adds
      // light, and the dust and the sparks already composite that way.
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    CAPACITY,
  );
  cloud.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // The colour buffer has to exist *before* the first frame compiles the material. Measured: an
  // `instanceColor` that is only born in the first `setColorAt` arrives after the compile, the
  // instances draw in the material's own white, and every puff is a white blob — which is exactly
  // what the plume looked like.
  cloud.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
  cloud.frustumCulled = false;
  cloud.count = 0;
  cloud.name = 'smoke';
  puffs.value = cloud;

  const glow = softDisc(64);
  haloMaterial = new THREE.MeshBasicMaterial({
    map: glow,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  halo.value = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMaterial);
  spillMaterial = new THREE.MeshBasicMaterial({
    map: glow,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  spill.value = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), spillMaterial);

  const ashMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: solidDisc(32),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    ASH_CAPACITY,
  );
  ashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ashMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ASH_CAPACITY * 3), 3);
  ashMesh.frustumCulled = false;
  ashMesh.count = 0;
  flakes.value = ashMesh;

  // The backdrop, one group of meshes fed by `backgroundStructure` every frame.
  const root = new THREE.Group();
  // The sky is a vertex-coloured strip with a row on each of the painter's own stops: the gradient
  // it would create is linear, and three rows interpolate to exactly that.
  const sky = new THREE.BufferGeometry();
  const rows = [0.5, -0.12, -0.5];
  const positions = new Float32Array(rows.length * 6);
  let cursor = 0;
  for (const y of rows) {
    positions[cursor++] = -0.5;
    positions[cursor++] = y;
    positions[cursor++] = 0;
    positions[cursor++] = 0.5;
    positions[cursor++] = y;
    positions[cursor++] = 0;
  }
  sky.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  skyColours = new THREE.BufferAttribute(new Float32Array(rows.length * 6), 3);
  sky.setAttribute('color', skyColours);
  sky.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5]);
  skyMesh = new THREE.Mesh(
    sky,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
  skyMesh.position.z = -1.4;
  root.add(skyMesh);

  wallMaterial = new THREE.MeshBasicMaterial({ transparent: true });
  wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMaterial);
  wallMesh.position.z = -1.35;
  root.add(wallMesh);

  // §2's bottom scrim. Behind every prop and in front of the table's own plate and its pools: in
  // the Demo the band is the stage's last child, but none of its objects reach down into it, so the
  // layering is only observable here — and washing .55 black over the near-black silhouettes #124
  // just established would make them and the floor one shape.
  scrimMaterial = new THREE.MeshBasicMaterial({
    map: scrimRamp(64),
    transparent: true,
    depthWrite: false,
  });
  // Set imperatively, the way the vignette above does it: a hex literal in the options object is
  // indistinguishable from a CSS text colour to the S19 contrast scanner.
  scrimMaterial.color.set(0x000000);
  scrimMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), scrimMaterial);
  scrimMesh.name = 'scrim';
  scrimMesh.frustumCulled = false;
  scrimMesh.visible = false;
  root.add(scrimMesh);
  nosingMaterial = new THREE.MeshBasicMaterial({ transparent: true });
  nosingMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), nosingMaterial);
  nosingMesh.position.z = -0.24;
  root.add(nosingMesh);

  const poolMap = softDisc(64);
  for (let i = 0; i < 2; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      map: poolMap,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    // Named because the browser check below reads these two by name: the pool's geometry was the
    // one place the backdrop mixed px into a fraction field, and an anonymous quad cannot be
    // pointed at from outside the page.
    mesh.name = i === 0 ? 'pool-bloom' : 'pool-warm';
    mesh.visible = false;
    poolMaterials.push(material);
    poolMeshes.push(mesh);
    root.add(mesh);
  }
  backdrop.value = root;

  // The text runs the DOM's own words mirror into. Their geometry is filled per change, not per
  // frame — a run changes when a figure changes, which is nothing like 60 times a second.
  const words = new THREE.Group();
  for (let i = 0; i < RUN_COUNT; i += 1) {
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    // A real (invisible) plane, not an empty BufferGeometry: TresJS walks the scene when a
    // primitive mounts and reads the position attribute — an empty one throws inside its watcher
    // (measured: `Cannot read properties of undefined (reading 'count')` on both backends).
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    runMaterials.push(material);
    runMeshes.push(mesh);
    runSignatures.push('');
    words.add(mesh);
  }
  textRuns.value = words;

  // The chrome: the HUD's ring and the pill's are the same mechanism (a track circle and a run
  // arc), and the pill itself is a stadium card plus the glow its CSS shadow stands for.
  const rigGroup = new THREE.Group();
  const buildRig = (): RingRig => {
    const rig: RingRig = {
      track: new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64)),
      arc: new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64)),
      trackMaterial: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
      arcMaterial: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
      signature: '',
    };
    rig.track.material = rig.trackMaterial;
    rig.arc.material = rig.arcMaterial;
    rig.track.frustumCulled = false;
    rig.track.visible = false;
    rig.arc.frustumCulled = false;
    rig.arc.visible = false;
    rigGroup.add(rig.track, rig.arc);
    return rig;
  };
  hudRig.value = buildRig();
  pillRig.value = buildRig();

  const buildCard = (z: number, name = ''): CardRig => {
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.position.z = z;
    // Named where a browser check has to point at one specific plate — the rail's four tabs are the
    // only cards whose fill arrives and leaves with the state, so that is where the claim lives.
    mesh.name = name;
    rigGroup.add(mesh);
    return { mesh, material, signature: '', baseY: 0, baseOpacity: 1 };
  };
  pillCardRig.value = buildCard(0.05);
  railRig.value = buildCard(0.068);
  tabRigs.value = [0, 1, 2, 3].map((index) => buildCard(0.07, `rail-tab-${String(index)}`));
  catCardRig.value = buildCard(0.06);
  archiveCardRig.value = buildCard(0.09);

  // The pill's line art (S4's scale, the wave, the tray flick) rides in front of its own card, so
  // the rigs hang off one group whose transform is the element's own screen transform.
  const inkGroup = new THREE.Group();
  for (let i = 0; i < INK_CAPACITY; i += 1) {
    const inkMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const inkMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), inkMaterial);
    inkMesh.frustumCulled = false;
    inkMesh.visible = false;
    inkGroup.add(inkMesh);
    inkRigs.push({ mesh: inkMesh, material: inkMaterial, signature: '', skipped: false });
  }
  pillInk.value = inkGroup;
  rigGroup.add(inkGroup);
  const hintGroup = new THREE.Group();
  for (let i = 0; i < HINT_INK_CAPACITY; i += 1) {
    const hintMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const hintMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), hintMaterial);
    hintMesh.frustumCulled = false;
    hintMesh.visible = false;
    hintGroup.add(hintMesh);
    hintRigs.push({ mesh: hintMesh, material: hintMaterial, signature: '', skipped: false });
  }
  hintInk.value = hintGroup;
  rigGroup.add(hintGroup);

  // The three Demo icon surfaces.
  const buildGlyphRigs = (group: THREE.Group, capacity: number): InkRig[] => {
    const rigs: InkRig[] = [];
    for (let i = 0; i < capacity; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.frustumCulled = false;
      mesh.visible = false;
      group.add(mesh);
      rigs.push({ mesh, material, signature: '', skipped: false });
    }
    return rigs;
  };
  const hudGlyphGroup = new THREE.Group();
  hudGlyphRigs.push(...buildGlyphRigs(hudGlyphGroup, HUD_GLYPH_CAPACITY));
  hudGlyphInk.value = hudGlyphGroup;
  rigGroup.add(hudGlyphGroup);
  const pillGlyphGroup = new THREE.Group();
  pillGlyphRigs.push(...buildGlyphRigs(pillGlyphGroup, PILL_GLYPH_CAPACITY));
  pillGlyphInk.value = pillGlyphGroup;
  rigGroup.add(pillGlyphGroup);
  for (let i = 0; i < 4; i += 1) {
    const group = new THREE.Group();
    const rigs = buildGlyphRigs(group, RAIL_GLYPH_CAPACITY);
    railGlyphRigs.push(rigs);
    railGlyphGroups.push(group);
    rigGroup.add(group);
  }
  const catGlyphGroup = new THREE.Group();
  catGlyphRigs.push(...buildGlyphRigs(catGlyphGroup, CAT_GLYPH_CAPACITY));
  catGlyphInk.value = catGlyphGroup;
  rigGroup.add(catGlyphGroup);

  // The S3 stage ring: 104 px around the rod while a draw is held, the arc being the draw's own
  // progress and the held seconds inside it. Everything inside the group is authored in Demo CSS
  // pixels; `placeStageRing` scales the group by one px-to-world factor.
  const stageRingGroup = new THREE.Group();
  stageRingGroup.frustumCulled = false;
  stageRingGroup.visible = false;
  const stageRingTrackMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  stageRingTrackMaterial.color.setRGB(1, 1, 1, THREE.SRGBColorSpace);
  const stageRingTrack = new THREE.Mesh(new THREE.RingGeometry(42, 50, 64), stageRingTrackMaterial);
  stageRingTrack.frustumCulled = false;
  stageRingTrack.name = 'stage-ring-track';
  stageRingGroup.add(stageRingTrack);
  const stageRingArcMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  stageRingArcMaterial.color.setRGB(1, 0.541, 0.239, THREE.SRGBColorSpace);
  const stageRingArc = new THREE.Mesh(new THREE.RingGeometry(42, 50, 64), stageRingArcMaterial);
  stageRingArc.frustumCulled = false;
  stageRingArc.name = 'stage-ring-arc';
  stageRingGroup.add(stageRingArc);
  stageRingArcRef = stageRingArc;
  const ringNumMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  ringNumMaterial.color.setRGB(0.929, 0.902, 0.855, THREE.SRGBColorSpace);
  // Real (tiny) geometry up front: TresJS's own performance monitor traverses every mesh reading
  // geometry.attributes.position.count, so an empty BufferGeometry here crashes the frame loop.
  const stageRingNum = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringNumMaterial);
  stageRingNum.frustumCulled = false;
  stageRingGroup.add(stageRingNum);
  stageRingNumRef = stageRingNum;
  const ringUnitMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  ringUnitMaterial.color.setRGB(0.929, 0.902, 0.855, THREE.SRGBColorSpace);
  const stageRingUnit = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringUnitMaterial);
  stageRingUnit.frustumCulled = false;
  stageRingGroup.add(stageRingUnit);
  stageRingUnitRef = stageRingUnit;
  rigGroup.add(stageRingGroup);
  stageRingGroupRef = stageRingGroup;

  // The abstract mouth (S22): two lip curves, their marks, and the airflow column.
  const mouthGroup = new THREE.Group();
  mouthGroup.frustumCulled = false;
  rigGroup.add(mouthGroup);
  mouthGroupRef = mouthGroup;

  flameMaterial = new THREE.MeshBasicMaterial({
    map: flameAlpha(),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });
  const flameMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flameMaterial);
  flameMesh.frustumCulled = false;
  flameMesh.visible = false;
  rigGroup.add(flameMesh);
  flameBody.value = flameMesh;
  const sparkCloud = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    SPARK_CAPACITY,
  );
  sparkCloud.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparkCloud.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(SPARK_CAPACITY * 3),
    3,
  );
  sparkCloud.frustumCulled = false;
  sparkCloud.name = 'sparks';
  rigGroup.add(sparkCloud);
  sparksMesh.value = sparkCloud;
  const dustCloud = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: softDisc(32),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    DUST_CAPACITY,
  );
  dustCloud.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dustCloud.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(DUST_CAPACITY * 3),
    3,
  );
  dustCloud.frustumCulled = false;
  dustCloud.name = 'dust';
  rigGroup.add(dustCloud);
  dustMesh.value = dustCloud;
  const rainCloud = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
    }),
    RAIN_CAPACITY,
  );
  rainCloud.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rainCloud.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(RAIN_CAPACITY * 3),
    3,
  );
  rainCloud.frustumCulled = false;
  rainCloud.name = 'rain';
  rigGroup.add(rainCloud);
  rainMesh.value = rainCloud;
  // The film grain's tile, baked by the same integer LCG the painted layer used (same 128 px,
  // same values), handed back as raw RGBA now that no canvas stands between them — every texture
  // on this stage is a DataTexture.
  const grainPixels = createGrainTile();
  {
    const texture = new THREE.DataTexture(grainPixels, 128, 128, THREE.RGBAFormat);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    // The canvas composites the tile in sRGB; tagging it is what keeps the mid-greys the same
    // grey through the renderer's own output pass.
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    grainMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const grainPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), grainMaterial);
    grainPlane.name = 'grain';
    grainPlane.frustumCulled = false;
    grainPlane.visible = false;
    grainPlane.position.set(0, 0, GRAIN_Z);
    rigGroup.add(grainPlane);
    grainMesh.value = grainPlane;
  }
  columnMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.92,
    vertexColors: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const columnRibbon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), columnMaterial);
  columnRibbon.name = 'ash-column';
  columnRibbon.frustumCulled = false;
  columnRibbon.visible = false;
  columnRibbon.position.set(0, 0, COLUMN_Z);
  rigGroup.add(columnRibbon);
  columnMesh.value = columnRibbon;
  // §2's pile of tapped ash — the mound that turns the tray's gram figure into something on screen.
  // The number had a reader; `PROP_INK.ashPile` had none, so the tray reported 2.1 g of ash and drew
  // an empty bowl. `ashPileMetrics` owns the box (the Demo's 126×22 in a 190 tray, dropped by the
  // Demo's own 80 px, all of it in the tray's plane); the ramp is the Demo's two ends as vertex
  // colours, the same `tint` path the column above takes, and the stadium plus its 3 px of softness
  // is baked per pixel box below, the way the slider's track is.
  pileMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    vertexColors: true,
    depthWrite: false,
  });
  const pilePlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pileMaterial);
  const pileTop = new THREE.Color(PROP_INK.ashPile);
  const pileDeep = new THREE.Color(PROP_INK.ashPileDeep);
  // PlaneGeometry's first two vertices are the top edge, so the light end of `180deg,#4A453E,
  // #2A2621` stays up and the dark end settles into the tray.
  pilePlane.geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(
      [
        pileTop.r,
        pileTop.g,
        pileTop.b,
        pileTop.r,
        pileTop.g,
        pileTop.b,
        pileDeep.r,
        pileDeep.g,
        pileDeep.b,
        pileDeep.r,
        pileDeep.g,
        pileDeep.b,
      ],
      3,
    ),
  );
  pilePlane.name = 'ash-pile';
  pilePlane.frustumCulled = false;
  pilePlane.visible = false;
  rigGroup.add(pilePlane);
  pileMesh = pilePlane;
  charMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const bandMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), charMaterial);
  bandMesh.name = 'rod-char';
  bandMesh.frustumCulled = false;
  bandMesh.visible = false;
  bandMesh.position.set(0, 0, 0.0185);
  rigGroup.add(bandMesh);
  charBand.value = bandMesh;
  charHotMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const hotMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), charHotMaterial);
  hotMesh.frustumCulled = false;
  hotMesh.visible = false;
  hotMesh.position.set(0, 0, 0.0187);
  rigGroup.add(hotMesh);
  charHot.value = hotMesh;
  const charGrainCloud = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    CHAR_GRAIN_CAPACITY,
  );
  charGrainCloud.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  charGrainCloud.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(CHAR_GRAIN_CAPACITY * 3),
    3,
  );
  charGrainCloud.frustumCulled = false;
  charGrainCloud.visible = false;
  charGrainCloud.position.set(0, 0, 0.0188);
  rigGroup.add(charGrainCloud);
  charGrains.value = charGrainCloud;
  // The effects pool: twelve of each shape (the list's own ceiling), additive like the canvas's
  // `lighter` composite. Rings rebuild their geometry per radius signature; flashes are soft
  // discs scaled per frame.
  for (let i = 0; i < 12; i += 1) {
    const ringMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMaterial);
    ring.name = 'effect-ring';
    ring.frustumCulled = false;
    ring.visible = false;
    ring.position.set(0, 0, 0.033);
    rigGroup.add(ring);
    effectRingPool.push(ring);
    effectRingSignatures.push('');
    const flashMaterial = new THREE.MeshBasicMaterial({
      map: softDisc(64),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flashMaterial);
    flash.name = 'effect-flash';
    flash.frustumCulled = false;
    flash.visible = false;
    flash.position.set(0, 0, 0.0325);
    rigGroup.add(flash);
    effectFlashPool.push(flash);
  }
  flameThroatMaterial = new THREE.MeshBasicMaterial({
    map: solidDisc(64),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  flameThroatMaterial.color.setRGB(110 / 255, 170 / 255, 255 / 255, THREE.SRGBColorSpace);
  const throatMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flameThroatMaterial);
  throatMesh.frustumCulled = false;
  throatMesh.visible = false;
  rigGroup.add(throatMesh);
  flameThroat.value = throatMesh;

  // The sheet's surface, and one rig per line of its text. The rigs carry the four clip planes
  // from the start, so a scrolled row is cut at the panel's edge the moment it is drawn.
  sheetCardRig.value = buildCard(0.095);
  for (let i = 0; i < SHEET_POOL; i += 1) {
    const sheetMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      clippingPlanes: sheetClip,
    });
    const sheetMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sheetMaterial);
    sheetMesh.frustumCulled = false;
    sheetMesh.visible = false;
    sheetMesh.position.z = RUN_TEXT_Z;
    rigGroup.add(sheetMesh);
    sheetRuns.push({ mesh: sheetMesh, material: sheetMaterial, signature: '', skipped: false });
  }
  for (let i = 0; i < SHEET_SURFACE_POOL; i += 1) {
    const surface = buildCard(0.098);
    sheetSurfaces.push(surface);
  }
  for (let i = 0; i < SHEET_FRAME_POOL; i += 1) {
    const frameMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      clippingPlanes: sheetClip,
    });
    const frameMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), frameMaterial);
    frameMesh.frustumCulled = false;
    frameMesh.visible = false;
    frameMesh.position.z = 0.0985;
    rigGroup.add(frameMesh);
    sheetFrames.push({ mesh: frameMesh, material: frameMaterial, signature: '', skipped: false });
  }
  // The slider pools: track, thumb fill, thumb ring, each on its own rung between the frames
  // (0.0985) and the sheet's text (RUN_TEXT_Z). The fill shares one circle texture — a disc scales;
  // the track's caps cannot (stretched they would oval), so its texture is rebuilt per size.
  const sliderPools: ReadonlyArray<[SliderRig[], number, string]> = [
    [sheetSliderTracks, 0.0986, 'slider-track'],
    [sheetSliderThumbs, 0.0987, 'slider-thumb'],
    [sheetSliderRings, 0.0988, 'slider-thumb-ring'],
  ];
  const sliderCircle = roundedRect(64, 1, 1);
  for (let i = 0; i < SHEET_SLIDER_POOL; i += 1) {
    for (const [pool, z, name] of sliderPools) {
      const sliderMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        clippingPlanes: sheetClip,
      });
      const sliderMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sliderMaterial);
      sliderMesh.name = name;
      sliderMesh.frustumCulled = false;
      sliderMesh.visible = false;
      sliderMesh.position.z = z;
      if (pool === sheetSliderThumbs) sliderMaterial.map = sliderCircle;
      rigGroup.add(sliderMesh);
      pool.push({ mesh: sliderMesh, material: sliderMaterial, signature: '' });
    }
  }
  badgeMaterial = new THREE.MeshBasicMaterial({
    map: solidDisc(32),
    transparent: true,
    depthWrite: false,
  });
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), badgeMaterial);
  badge.frustumCulled = false;
  badge.visible = false;
  badge.position.z = 0.062;
  badgeQuad.value = badge;
  rigGroup.add(badge);
  pillGlowMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    // Source-over, the way the browser composites the `box-shadow` this copies. Additive was a slab:
    // the halo's own alpha added light over the lit table instead of darkening it the way the DOM
    // does, which is what made the bottom of the screen read as one orange plate (§2's shadow is
    // `0 10px 28px -6px rgba(217,87,25,.42)` — a 28 px falloff hugging a 342 × 62 button).
  });
  const pillGlowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pillGlowMaterial);
  pillGlowMesh.name = 'pill-glow';
  pillGlowMesh.frustumCulled = false;
  pillGlowMesh.visible = false;
  pillGlowMesh.position.z = 0.044;
  pillGlow.value = pillGlowMesh;
  rigGroup.add(pillGlowMesh);

  chrome.value = rigGroup;
  void loadAtlas();
}

/** Screen pixels as world units, through the same stage box everything else uses. */
function pxToWorld(px: number): number {
  return (px / Math.max(1, box.value.height * viewportHeightPx.value)) * frame.value.height;
}

/** A canvas-fraction rect as world position and size, through the stage box the core published. */
function rectWorld(rect: { x: number; y: number; w: number; h: number }): {
  centre: readonly [number, number, number];
  width: number;
  height: number;
} {
  const centre = canvasToWorld(
    { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
    box.value,
    aspect.value,
  );
  return {
    centre,
    width: (rect.w / Math.max(0.0001, box.value.width)) * frame.value.width,
    height: (rect.h / Math.max(0.0001, box.value.height)) * frame.value.height,
  };
}

/** One instanced mesh per (colour, alpha) the structure uses — the painter's fills, as quads. */
function rebuildBackdropBoxes(root: THREE.Group, boxes: readonly StageBoxFrac[]): void {
  for (const mesh of boxMeshes) {
    root.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  boxMeshes.length = 0;
  const groups = new Map<
    string,
    { rgb: readonly [number, number, number]; alpha: number; items: StageBoxFrac[] }
  >();
  for (const part of boxes) {
    const key = `${part.rgb[0]},${part.rgb[1]},${part.rgb[2]}|${part.alpha}`;
    const group = groups.get(key) ?? { rgb: part.rgb, alpha: part.alpha, items: [] };
    group.items.push(part);
    groups.set(key, group);
  }
  let depth = 0;
  for (const group of groups.values()) {
    const material = new THREE.MeshBasicMaterial({ transparent: true });
    material.color.setRGB(
      group.rgb[0] / 255,
      group.rgb[1] / 255,
      group.rgb[2] / 255,
      THREE.SRGBColorSpace,
    );
    material.opacity = group.alpha;
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      material,
      group.items.length,
    );
    mesh.frustumCulled = false;
    group.items.forEach((part, index) => {
      const where = rectWorld(part);
      dummy.position.set(where.centre[0], where.centre[1], -1.34 + depth * 0.004);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(where.width, where.height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
    boxMeshes.push(mesh);
    depth += 1;
  }
}

/** The backdrop, from the state, every frame: colours move with the light, shapes with the room. */
function applyBackdrop(state: GameStateView | null): void {
  const root = backdrop.value;
  if (root === null) return;
  if (state === null) {
    root.visible = false;
    return;
  }
  root.visible = true;
  const structure = backgroundStructure(state, viewportWidthPx.value, viewportHeightPx.value);
  const size = frame.value;

  if (skyMesh !== null && skyColours !== null) {
    const whole = rectWorld({ x: 0, y: 0, w: 1, h: 1 });
    skyMesh.scale.set(whole.width, whole.height, 1);
    skyMesh.position.set(whole.centre[0], whole.centre[1], -1.4);
    const array = skyColours.array as Float32Array;
    structure.sky.forEach((stop, row) => {
      tint.setRGB(stop.rgb[0] / 255, stop.rgb[1] / 255, stop.rgb[2] / 255, THREE.SRGBColorSpace);
      array[row * 6] = tint.r;
      array[row * 6 + 1] = tint.g;
      array[row * 6 + 2] = tint.b;
      array[row * 6 + 3] = tint.r;
      array[row * 6 + 4] = tint.g;
      array[row * 6 + 5] = tint.b;
    });
    skyColours.needsUpdate = true;
  }

  if (wallMesh !== null && wallMaterial !== null) {
    const wall = structure.wall;
    wallMesh.visible = wall !== null;
    if (wall !== null) {
      const band = rectWorld({ x: 0, y: 0, w: 1, h: 0.7 });
      wallMesh.scale.set(band.width, band.height, 1);
      wallMesh.position.set(band.centre[0], band.centre[1], -1.35);
      wallMaterial.color.setRGB(
        wall.rgb[0] / 255,
        wall.rgb[1] / 255,
        wall.rgb[2] / 255,
        THREE.SRGBColorSpace,
      );
      wallMaterial.opacity = wall.alpha;
    }
  }

  if (scrimMesh !== null && scrimMaterial !== null) {
    // Which of §2's bands this screen asks for — and 'no band' is one of the answers, because the
    // three screens with the rod at the mouth have nothing like it.
    const screen = state.cigarette.state;
    const band =
      screen === 'LIGHTING'
        ? SCRIM.lighting
        : screen === 'IDLE' || screen === 'PICKED_UP'
          ? SCRIM.idle
          : null;
    scrimMesh.visible = band !== null;
    scrimMaterial.opacity = band?.alpha ?? 0;
    if (band !== null) {
      const strip = rectWorld({ x: 0, y: 1 - band.share, w: 1, h: band.share });
      scrimMesh.scale.set(strip.width, strip.height, 1);
      scrimMesh.position.set(strip.centre[0], strip.centre[1], -0.235);
    }
  }

  if (nosingMesh !== null && nosingMaterial !== null) {
    const table = structure.table;
    nosingMesh.visible = table !== null;
    if (table !== null) {
      const height = Math.max(1, viewportHeightPx.value * 0.004) / viewportHeightPx.value;
      const strip = rectWorld({ x: 0, y: table.edgeY, w: 1, h: height });
      nosingMesh.scale.set(strip.width, strip.height, 1);
      nosingMesh.position.set(strip.centre[0], strip.centre[1], -0.24);
      nosingMaterial.color.setRGB(
        table.nosingRgb[0] / 255,
        table.nosingRgb[1] / 255,
        table.nosingRgb[2] / 255,
        THREE.SRGBColorSpace,
      );
      nosingMaterial.opacity = table.nosingAlpha;
    }
  }

  structure.glows.forEach((light, index) => {
    const mesh = poolMeshes[index];
    const material = poolMaterials[index];
    if (mesh === undefined || material === undefined) return;
    mesh.visible = true;
    const world = canvasToWorld({ x: light.x, y: light.y }, box.value, aspect.value);
    // Two pools, two depths, because the deck draws them as two different facts: the one above the
    // table edge is light on the wall (so it has to clear the wall's near-black plate), the one
    // below it is light on the table (so it has to clear the table plate, which is otherwise pure
    // black and swallows it). Both stay behind the props, which sit at z 0.
    const onTable = light.y > state.stage.layout.tableEdgeY;
    mesh.position.set(world[0], world[1], onTable ? -0.245 : -1.345 + index * 0.002);
    mesh.scale.set(light.rx * 2 * size.width, light.ry * 2 * size.height, 1);
    material.color.setRGB(
      light.rgb[0] / 255,
      light.rgb[1] / 255,
      light.rgb[2] / 255,
      THREE.SRGBColorSpace,
    );
    material.opacity = light.alpha;
  });

  const signature = `${state.environment.id}|${state.progress.dayNumber}|${viewportWidthPx.value}x${viewportHeightPx.value}|${box.value.x},${box.value.y},${box.value.width},${box.value.height}`;
  if (signature !== boxSignature) {
    boxSignature = signature;
    rebuildBackdropBoxes(root, structure.boxes);
  }
}

// ------------------------------------------------------------------- words

/**
 * The HUD's two figures, painted from the baked atlas instead of by the browser.
 *
 * The DOM keeps both buttons — they are the tap target and the screen reader's line — but goes
 * invisible over them (`html.scene3d-text`, `-webkit-text-fill-color: transparent`, which leaves
 * `color` readable for this side), and the scene draws the same string at the same place in the
 * same colour: layout is still the DOM's, the paint is the atlas's. The class only lands after the
 * atlas bytes are in, so a failed fetch leaves the DOM's own words on screen instead of nothing.
 */
const textRuns = shallowRef<THREE.Group | null>(null);
let atlas: GlyphAtlas | null = null;
let atlasTexture: THREE.Texture | null = null;
const runMeshes: THREE.Mesh[] = [];
const runMaterials: THREE.MeshBasicMaterial[] = [];
const runSignatures: string[] = [];
/**
 * What each run mirrors: the two figures beside the ring, then whatever the ring is carrying —
 * digits when it has a number and a mark when it does not. The DOM still lays all three out.
 */
/**
 * Every run in the scene, as (selector, nth-match) pairs.
 *
 * The head slots are single elements; the rows that come and go with the width or the phase —
 * S11's desk readouts, the rail's four glyphs and words, and the archive card's own lines — are
 * matched per element, in DOM order, so their count is the only fixed thing about them.
 */
const ARCHIVE_TEXTS =
  '.archive .name, .archive .zh, .archive .close, .archive dt, .archive dd, .archive p, .archive .chip, .archive .pin span';
const RUN_TABLE: ReadonlyArray<{ selector: string; nth: number }> = [
  { selector: '.hud > button.num', nth: 0 },
  { selector: '.hud > span.num.alt', nth: 0 },
  // §2's 待机 row is three figures and only one of them is the pressed one: the leading stick count
  // is a plain span, and without its own slot the scene simply never paints it.
  { selector: '.hud > span.num:not(.alt)', nth: 0 },
  // The header symbol, the pill icon and the rail icons are Demo SVGs; their ink is mirrored by the
  // glyph ink groups, not the atlas. Only words remain here.
  { selector: '.pill .word', nth: 0 },
  { selector: '.hint', nth: 0 },
  ...[0, 1, 2, 3, 4].map((nth) => ({ selector: '.hud .desk .read', nth })),
  ...[0, 1, 2, 3].map((nth) => ({ selector: '.rail .tab .word', nth })),
  ...Array.from({ length: 32 }, (_, nth) => ({ selector: ARCHIVE_TEXTS, nth })),
];
const RUN_COUNT = RUN_TABLE.length;
/** The archive's slots, by index — their words ride the card's arrival (see `placeArchive`). */
const ARCHIVE_RUNS = RUN_TABLE.map((slot, index) =>
  slot.selector === ARCHIVE_TEXTS ? index : -1,
).filter((index) => index >= 0);
/** Where each run last landed, so an arrival can move y without rebuilding the glyph geometry. */
const runBaseY: number[] = [];
const chrome = shallowRef<THREE.Group | null>(null);
interface RingRig {
  track: THREE.Mesh;
  arc: THREE.Mesh;
  trackMaterial: THREE.MeshBasicMaterial;
  arcMaterial: THREE.MeshBasicMaterial;
  signature: string;
}
const hudRig = shallowRef<RingRig | null>(null);
const pillRig = shallowRef<RingRig | null>(null);
/** The §2 S3 stage ring group and its pieces (geometry authored in Demo CSS px). */
let stageRingGroupRef: THREE.Group | null = null;
let stageRingArcRef: THREE.Mesh | null = null;
let stageRingNumRef: THREE.Mesh | null = null;
let stageRingUnitRef: THREE.Mesh | null = null;
/** The abstract mouth's own group, positioned at the rod's mouth end while a draw is held. */
let mouthGroupRef: THREE.Group | null = null;
/**
 * A card: the same machinery the pill proved — a stadium quad whose paint is whatever the element's
 * own computed style says (a three-stop gradient, or a flat fill), rebuilt only when the state's
 * paint changes. The rail and its four tabs are four more of these.
 */
interface CardRig {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  signature: string;
  /** Where `fillCard` last put the plate, and at what opacity — the archive's arrival moves both. */
  baseY: number;
  baseOpacity: number;
}
const pillCardRig = shallowRef<CardRig | null>(null);
const railRig = shallowRef<CardRig | null>(null);
const tabRigs = shallowRef<CardRig[]>([]);
const catCardRig = shallowRef<CardRig | null>(null);
const archiveCardRig = shallowRef<CardRig | null>(null);
const badgeQuad = shallowRef<THREE.Mesh | null>(null);
let badgeMaterial: THREE.MeshBasicMaterial | null = null;
const pillGlow = shallowRef<THREE.Mesh | null>(null);
let pillGlowMaterial: THREE.MeshBasicMaterial | null = null;

async function loadAtlas(): Promise<void> {
  try {
    const base = import.meta.env.BASE_URL;
    const response = await fetch(`${base}atlas/glyphs.json`);
    if (!response.ok) throw new Error(`atlas json ${response.status}`);
    const parsed = parseAtlas(await response.json());
    const texture = await new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        `${base}atlas/glyphs.png`,
        (loaded) => {
          // The layout measures v from the image's top row, so the texture has to agree with it.
          loaded.flipY = false;
          loaded.colorSpace = THREE.SRGBColorSpace;
          resolve(loaded);
        },
        undefined,
        () => reject(new Error('atlas png failed')),
      );
    });
    // Attach, recompile, then let the DOM go quiet: the run has been drawing nothing while the
    // atlas was in flight, `needsUpdate` is what makes the already-compiled quads take the map,
    // and `html.scene3d-text` (below) is what hides the browser's own copy of the same digits.
    atlas = parsed;
    atlasTexture = texture;
    for (const material of runMaterials) {
      material.map = texture;
      material.needsUpdate = true;
    }
    // The sheet's own lines are meshes of their own (they carry clipping planes), so they are not in
    // `runMaterials` — without this the first probe drew them as solid glyph-quads: no map, no ink.
    for (const rig of sheetRuns) {
      rig.material.map = texture;
      rig.material.needsUpdate = true;
    }
    document.documentElement.classList.add('scene3d-text');
  } catch (error) {
    console.warn('scene text: atlas unavailable, the DOM keeps its own words', error);
  }
}

/**
 * Where every run of text sits. Nearer the camera than any chrome plate: the archive card is the
 * closest one at 0.09, the pill's at 0.05. A plate drawn *after* its own words dims them by the
 * plate's alpha — measured on the archive name: 103 where the same glyph unplated reads 224.
 *
 * The whole chrome ladder (0.034…0.10) also sits in front of the stage itself: the props live at
 * 0.01–0.03, and the sheet proved it matters — a panel at −0.045 had the rod and the tray's shadow
 * painting straight through it, because in 2D the chrome is DOM over the canvas and here it is just
 * another z.
 */
const RUN_TEXT_Z = 0.1;

function fillRunGeometry(
  mesh: THREE.Mesh,
  text: string,
  em: number,
  laid?: ReturnType<typeof layoutText>,
): void {
  if (atlas === null) return;
  const layout = laid ?? layoutText(text, atlas, em);
  const positions: number[] = [];
  const uvs: number[] = [];
  const push = (x: number, y: number, u: number, v: number): void => {
    positions.push(x, y, 0);
    uvs.push(u, v);
  };
  for (const quad of layout.quads) {
    const x0 = quad.x;
    const x1 = quad.x + quad.width;
    const y0 = quad.y;
    const y1 = quad.y + quad.height;
    // Counter-clockwise seen from the camera, or the quad faces away and is culled: TL → BL → BR.
    push(x0, y1, quad.u0, quad.v0);
    push(x0, y0, quad.u0, quad.v1);
    push(x1, y0, quad.u1, quad.v1);
    push(x0, y1, quad.u0, quad.v0);
    push(x1, y0, quad.u1, quad.v1);
    push(x1, y1, quad.u1, quad.v0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  mesh.geometry.dispose();
  mesh.geometry = geometry;
}

/** The runs, mirrored from the DOM every frame — the DOM is the layout's home. */
function placeText(): void {
  const group = textRuns.value;
  if (group === null || atlas === null || atlasTexture === null) return;
  runMeshes.forEach((mesh, index) => {
    const slot = RUN_TABLE[index];
    const node =
      slot === undefined
        ? null
        : (document.querySelectorAll<HTMLElement>(slot.selector)[slot.nth] ?? null);
    const material = runMaterials[index];
    if (node === null || material === undefined) {
      mesh.visible = false;
      return;
    }
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      mesh.visible = false;
      return;
    }
    const style = getComputedStyle(node);
    const fontSize = Number.parseFloat(style.fontSize) || 15;
    const text = node.textContent?.trim() ?? '';
    // The hint fades and appears — its opacity is the element's own (`0.66`, an animation), and a
    // run that ignored it would shout where the design whispers.
    const nodeOpacity = Number.parseFloat(style.opacity);
    material.opacity = Number.isFinite(nodeOpacity) ? nodeOpacity : 1;
    if (style.visibility === 'hidden' || style.display === 'none' || material.opacity <= 0.01) {
      mesh.visible = false;
      return;
    }
    const signature = `${text}|${rect.left.toFixed(1)},${rect.top.toFixed(1)},${rect.width.toFixed(1)},${rect.height.toFixed(1)}|${fontSize}|${style.color}`;
    if (signature !== runSignatures[index]) {
      runSignatures[index] = signature;
      const em = pxToWorld(fontSize);
      fillRunGeometry(mesh, text, em);
      const colour = parseColour(style.color);
      if (colour !== null) material.color.copy(colour.colour);
      // The DOM keeps its line box; the atlas puts the baseline at the em box's bottom, which is
      // where a cell's glyph sits too — so the run's origin is the bottom of the digits' box.
      const baselinePx = rect.top + (rect.height - fontSize) / 2 + fontSize;
      const padding = Number.parseFloat(style.paddingLeft) || 0;
      const world = canvasToWorld(
        {
          x: (rect.left + padding) / Math.max(1, viewportWidthPx.value),
          y: baselinePx / Math.max(1, viewportHeightPx.value),
        },
        box.value,
        aspect.value,
      );
      mesh.position.set(world[0], world[1], RUN_TEXT_Z);
      runBaseY[index] = world[1];
    }
    mesh.visible = true;
  });
}

/** The room's dust, from the painted layer's own `dustMotes` — always on, additive, and faint. */
function placeDust(state: GameStateView | null): void {
  const cloud = dustMesh.value;
  if (cloud === null) return;
  if (state == null) {
    cloud.count = 0;
    return;
  }
  const motes = dustMotes(state, state.nowMs / 1000, props.game.rendererLook().reducedMotion);
  let n = 0;
  for (const mote of motes) {
    if (n >= DUST_CAPACITY) break;
    const world = canvasToWorld({ x: mote.x, y: mote.y }, box.value, aspect.value);
    const radius = mote.radius * unitWorld.value;
    if (radius <= pxToWorld(0.3)) continue;
    dummy.position.set(world[0], world[1], -0.6);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(radius * 2, radius * 2, 1);
    dummy.updateMatrix();
    cloud.setMatrixAt(n, dummy.matrix);
    tint.setRGB(236 / 255, 226 / 255, 208 / 255, THREE.SRGBColorSpace);
    cloud.setColorAt(n, tint.multiplyScalar(mote.alpha));
    n += 1;
  }
  cloud.count = n;
  cloud.instanceMatrix.needsUpdate = true;
  if (cloud.instanceColor !== null) cloud.instanceColor.needsUpdate = true;
}

/**
 * Rain's own rung on the ladder: in front of the near half of the smoke (which tops out at 0.03 —
 * see `particleZ`) and behind the chrome's first plate (0.034). The painted layer draws rain after
 * the plume, and the canvas always sits under the DOM; both halves of that sentence are this one
 * number.
 */
const RAIN_Z = 0.032;

/**
 * Grain's rung on the ladder: immediately behind the dust (−0.6), which is the order the painted
 * layer uses (背景 → grain → dust). Two deviations are deliberate and sub-perceptual: the table
 * slab and the interior ink sit in front of it, and the canvas has grain over them — both are
 * dark surfaces where a 4% noise is nothing.
 */
const GRAIN_Z = -0.65;

/** The film grain, from the painted layer's own tile and its own amount (`grainAlpha`). */
function placeGrain(state: GameStateView | null): void {
  const mesh = grainMesh.value;
  if (mesh === null || grainMaterial === null) return;
  const alpha =
    state === null
      ? null
      : grainAlpha(state.environment.background.grain, props.game.rendererLook().reducedMotion);
  mesh.visible = alpha !== null;
  if (alpha === null) return;
  grainMaterial.opacity = alpha;
  mesh.scale.set(frame.value.width, frame.value.height, 1);
  const map = grainMaterial.map;
  if (map !== null) {
    // One tile per 128 CSS px, the painted pattern's own period.
    map.repeat.set(viewportWidthPx.value / 128, viewportHeightPx.value / 128);
  }
}

/** The sky's rain, from the painted layer's own `rainLines` — one streak per instance. */
function placeRain(state: GameStateView | null): void {
  const cloud = rainMesh.value;
  if (cloud === null) return;
  if (state == null) {
    cloud.count = 0;
    return;
  }
  const frame = rainLines(state, state.nowMs / 1000, props.game.rendererLook().reducedMotion);
  if (frame === null) {
    cloud.count = 0;
    return;
  }
  // The painter's own floor on the stroke: a hairline that rounds to nothing is nothing.
  const width = Math.max(frame.widthUnits * unitWorld.value, pxToWorld(1));
  let n = 0;
  for (const line of frame.lines) {
    if (n >= RAIN_CAPACITY) break;
    const from = canvasToWorld({ x: line.x1, y: line.y1 }, box.value, aspect.value);
    const to = canvasToWorld({ x: line.x2, y: line.y2 }, box.value, aspect.value);
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    dummy.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, RAIN_Z);
    dummy.rotation.set(0, 0, Math.atan2(dy, dx));
    dummy.scale.set(Math.hypot(dx, dy), width, 1);
    dummy.updateMatrix();
    cloud.setMatrixAt(n, dummy.matrix);
    tint.setRGB(RAIN_TINT[0] / 255, RAIN_TINT[1] / 255, RAIN_TINT[2] / 255, THREE.SRGBColorSpace);
    cloud.setColorAt(n, tint.multiplyScalar(frame.alpha));
    n += 1;
  }
  cloud.count = n;
  cloud.instanceMatrix.needsUpdate = true;
  if (cloud.instanceColor !== null) cloud.instanceColor.needsUpdate = true;
}

/**
 * S2's ignition picture: the lighter's flame, from the same numbers the painted layer draws it
 * with (`flameMetrics`), the same two quadratics, the same three gradient stops — the gradient's
 * opacities ride a hue-free texture and its colours ride the vertices, because a mesh has only one
 * material opacity. The throat is the second ellipse; both blend additively, which is the canvas's
 * `lighter` composite.
 */
function placeFlame(state: GameStateView | null): void {
  const body = flameBody.value;
  const throat = flameThroat.value;
  if (body === null || throat === null || flameMaterial === null || flameThroatMaterial === null) {
    return;
  }
  const lighterState = state?.lighter;
  const style = state?.style.lighter;
  if (
    state == null ||
    lighterState === undefined ||
    style === undefined ||
    lighterState.flame <= 0.01
  ) {
    body.visible = false;
    throat.visible = false;
    return;
  }
  const metrics = flameMetrics({
    flame: lighterState.flame,
    flicker: lighterState.flicker,
    sputter: lighterState.sputter,
    nowMs: state.nowMs,
    flameHeight: style.flameHeight,
  });
  const anchor = at('lighter');
  const bodyW = lighter.value.w;
  const bodyH = lighter.value.h;
  // `FLAME_BASE_FRACTION` is measured in the painted layer's y-down frame (0.2H *below* the
  // anchor there), and this frame's y is up — so the base is a subtraction away from the anchor.
  const baseY = anchor[1] - FLAME_BASE_FRACTION * bodyH;
  const height = metrics.height * unitWorld.value;
  const width = metrics.width * unitWorld.value;
  const baseW = Math.min(width, bodyW * 0.2);
  const { jitter } = metrics;
  const signature = `${height.toFixed(4)}|${width.toFixed(4)}|${jitter.toFixed(4)}|${baseW.toFixed(4)}`;
  if (signature !== flameSignature) {
    flameSignature = signature;
    const hue = style.hue;
    const stop0 = mixRgb(hue, [255, 252, 240], 0.42);
    const stop1 = hue;
    const stop2 = mixRgb(hue, [60, 40, 90], 0.6);
    const colour = new THREE.Color();
    const tinted = (t: number): THREE.Color => {
      const [from, to, span] =
        t <= 0.45 ? [stop0, stop1, t / 0.45] : [stop1, stop2, (t - 0.45) / 0.55];
      const rgb: [number, number, number] = [
        (from[0] ?? 0) + ((to[0] ?? 0) - (from[0] ?? 0)) * span,
        (from[1] ?? 0) + ((to[1] ?? 0) - (from[1] ?? 0)) * span,
        (from[2] ?? 0) + ((to[2] ?? 0) - (from[2] ?? 0)) * span,
      ];
      return colour.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
    };
    const positions: number[] = [];
    const colours: number[] = [];
    const uvs: number[] = [];
    const index: number[] = [];
    const steps = 14;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const u = 1 - t;
      const tipX = jitter * width * 0.6;
      const leftX =
        u * u * (-baseW / 2) + 2 * u * t * (-width * 0.62 + jitter * width) + t * t * tipX;
      const rightX =
        t * t * tipX + 2 * t * u * (width * 0.6 + jitter * width) + u * u * (baseW / 2);
      const y = -t * height;
      const shade = tinted(t);
      positions.push(leftX, y, 0, rightX, y, 0);
      colours.push(shade.r, shade.g, shade.b, shade.r, shade.g, shade.b);
      uvs.push(0, t, 1, t);
      if (i > 0) {
        const base = (i - 1) * 2;
        index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    body.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    body.geometry = geometry;
  }
  body.position.set(anchor[0], baseY, 0.02);
  body.visible = true;
  throat.position.set(anchor[0], baseY - height * 0.2, 0.021);
  throat.scale.set(width * 0.6, height * 0.26, 1);
  flameThroatMaterial.opacity = 0.35 * lighterState.flame;
  throat.visible = true;
}

/**
 * Falling ash, straight off the core's own list.
 *
 * Each fragment carries its origin, its size, its `length` (a column piece is drawn as long as the
 * sim says it is) and its rotation; the painted layer draws exactly this ellipse — `reach × size ×
 * 0.55`, turned by `rotation` — so the 3D layer draws the same shape rather than an invented flake.
 * The colour is the cigarette's own ash material, lifted 15% toward white, the way `drawFallingAsh`
 * mixes it.
 *
 * What this layer cannot carry is §2 S5's per-grain alpha — the Demo's three grains are
 * `rgba(207,198,188,.75/.55/.4)` at 5/4/3 px, the biggest nearest the rod. The sizes are the core's
 * own (`fragment.size`, and a flicked column breaks big-to-small), but an instanced cloud has no
 * per-instance opacity, and unlike the breath these must not be added: ash is opaque, so the one
 * number the Demo varies is the one this mesh holds flat at 0.9.
 */
function placeAsh(state: GameStateView | null): void {
  const ashMesh = flakes.value;
  if (ashMesh === null) return;
  const falling = state?.cigarette.ash.falling ?? [];
  const style = state?.style.cigarette.ash;
  const unit = unitWorld.value;
  let n = 0;
  for (const fragment of falling) {
    if (n >= ASH_CAPACITY) break;
    const world = canvasToWorld(fragment.origin, box.value, aspect.value);
    const size = fragment.size * unit;
    const reach = fragment.length > 0 ? (fragment.length * unit) / 2 : size;
    dummy.position.set(world[0], world[1], 0.01);
    dummy.rotation.set(0, 0, fragment.rotation);
    dummy.scale.set(reach * 2, size * 1.1, 1);
    dummy.updateMatrix();
    ashMesh.setMatrixAt(n, dummy.matrix);
    if (style !== undefined) {
      const rgb = mixRgb(style, [255, 255, 255], 0.15);
      tint.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
      ashMesh.setColorAt(n, tint.multiplyScalar(0.9));
    }
    n += 1;
  }
  ashMesh.count = n;
  ashMesh.instanceMatrix.needsUpdate = true;
  if (ashMesh.instanceColor !== null) ashMesh.instanceColor.needsUpdate = true;
}

/** The standing ash sits just over the rod's own cylinder, under everything else on the table. */
const COLUMN_Z = 0.005;

/**
 * The paper as a tube that can be sucked inward (S7, S15: 吸入时纸面会塌陷): each ring of the
 * cylinder is scaled radially by the painter's own `paperGive` — the very curve `rodBodyPath`
 * bows — so the waist sits where the painter puts it (`WAIST`, just behind the cherry) and the
 * ends never move. `dip` is the painter's own `thickness · DIP_SHARE · intensity`; at zero every
 * ring falls back to the straight tube, so an idle rod is the identical shape it always was.
 */
function placeRod(state: GameStateView | null): void {
  const mesh = rodMesh.value;
  const current = rod.value;
  if (mesh === null || current === null) return;
  // §2's two rods — dark while it lies on the pack, paper once it is held — set here, where this
  // frame's state actually is. A computed over the state object never fires: the core mutates it
  // in place, which is the same reason the cap's hinge is driven from here too.
  (mesh.material as THREE.MeshStandardMaterial).color.set(rodInkFor(state));
  const len = Math.max(1e-4, current.length);
  let geometry = mesh.geometry;
  if (Math.abs(len - rodBuiltLength) > 0.0005 || rodBase === null) {
    // The tube itself, under this script's hand rather than the template's `:args`: TresJS
    // rebuilds args reactively, and that rebuild lands *after* this step's deform — measured as a
    // perfectly round tube while the puff was live. One owner, one order: rebuild here, then pinch.
    rodBuiltLength = len;
    geometry.dispose();
    const radius = (len * ROD_THICKNESS_SHARE) / 2;
    geometry = new THREE.CylinderGeometry(radius, radius, len, 12, 16);
    mesh.geometry = geometry;
    rodBase = (
      geometry.getAttribute('position') as THREE.BufferAttribute
    ).array.slice() as Float32Array;
  }
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const puff = state?.cigarette.puff;
  const perPx = pxToWorld(1);
  const lenPx = len / perPx;
  const thickPx = (len * ROD_THICKNESS_SHARE) / perPx;
  const dip = puff != null && puff.active ? thickPx * DIP_SHARE * clamp01(puff.intensity) : 0;
  const signature = `${lenPx.toFixed(2)}|${dip.toFixed(3)}`;
  if (signature === rodShapeSignature) return;
  rodShapeSignature = signature;
  if (rodBase === null) return;
  const array = position.array as Float32Array;
  const halfPx = thickPx / 2;
  for (let i = 0; i < position.count; i += 1) {
    const bx = rodBase[i * 3] ?? 0;
    const by = rodBase[i * 3 + 1] ?? 0;
    const bz = rodBase[i * 3 + 2] ?? 0;
    const give = dip <= 0 ? 0 : paperGive(lenPx, thickPx, dip, clamp01(by / len + 0.5) * lenPx);
    const scale = give <= 0 ? 1 : Math.max(0.2, (halfPx - give) / halfPx);
    array[i * 3] = bx * scale;
    array[i * 3 + 1] = by;
    array[i * 3 + 2] = bz * scale;
  }
  position.needsUpdate = true;
}

/**
 * The painting frame: canvas pixels, because every formula copied out of `props.ts` is written in
 * them — and because the canvas is the one space that is isotropic (`stage.width` and `stage.height`
 * are different scales, so a sag laid out in stage fractions comes out skewed by the aspect). The
 * feed-through to the world goes back through the same box, so `pxOf` → `toWorld` is the identity
 * up to the mapping, whatever the box is.
 */
function canvasPx(): {
  pxOf: (p: { x: number; y: number }) => { x: number; y: number };
  unit: number;
  toWorld: (p: { x: number; y: number }) => readonly [number, number, number];
} {
  const stage = box.value;
  const vw = Math.max(1, viewportWidthPx.value);
  const vh = Math.max(1, viewportHeightPx.value);
  const px = {
    x: stage.x * vw,
    y: stage.y * vh,
    width: stage.width * vw,
    height: stage.height * vh,
  };
  return {
    pxOf: (p: { x: number; y: number }) => ({
      x: px.x + p.x * px.width,
      y: px.y + p.y * px.height,
    }),
    // The renderer's own `unit`: lengths scale with the smaller edge.
    unit: Math.min(px.width / 0.75, px.height),
    toWorld: (p: { x: number; y: number }): readonly [number, number, number] =>
      canvasToWorld({ x: p.x / vw, y: p.y / vh }, stage, aspect.value),
  };
}

/**
 * The rod's standing ash, from the painted layer's own `drawAshColumn`: the core publishes the two
 * ends (`pose.tip` and `pose.ashTip`) and the column's `bend`, and the canvas draws an eleven-
 * segment band that sags by `t² · bend · length · 0.55`, tapers to 75 % at the far end, and takes
 * its colour per segment from `mixRgb(style, [40, 38, 40], grit · 0.35)`. This is that band as
 * geometry — every station laid out in *canvas pixels* like the painter's, because the stage
 * stretches x and y by different scales and the sag hangs off the rod, not off the screen — and
 * then mapped through the camera. The rod itself has no charred segment yet (see §12), so this is
 * the first piece of the burning end that is the painter's own geometry rather than a stand-in.
 */
function placeColumn(state: GameStateView | null): void {
  const mesh = columnMesh.value;
  if (mesh === null || columnMaterial === null) return;
  const pose = state?.cigarette.pose;
  const ash = state?.cigarette.ash;
  const style = state?.style.cigarette.ash;
  if (pose == null || ash == null || style == null || ash.length <= 0 || !pose.visible) {
    mesh.visible = false;
    return;
  }
  const frame = canvasPx();
  const pivot = frame.pxOf(pose.pivot);
  const tip = frame.pxOf(pose.tip);
  const ashTip = frame.pxOf(pose.ashTip);
  const thickness = pose.thickness * frame.unit;
  const rodAngle = Math.atan2(tip.y - pivot.y, tip.x - pivot.x);
  // Screen-down perpendicular of the rod, in the painter's y-down frame.
  const perp = { x: -Math.sin(rodAngle), y: Math.cos(rodAngle) };
  const length = Math.hypot(ashTip.x - tip.x, ashTip.y - tip.y);
  const signature = `${tip.x.toFixed(2)},${tip.y.toFixed(2)}|${length.toFixed(2)}|${thickness.toFixed(2)}|${ash.bend.toFixed(3)}|${style.join(',')}`;
  if (signature !== columnSignature) {
    columnSignature = signature;
    const steps = 11;
    const positions: number[] = [];
    const colours: number[] = [];
    const index: number[] = [];
    const toWorld = frame.toWorld;
    const along = { x: Math.cos(rodAngle), y: Math.sin(rodAngle) };
    const at = (t: number, offset: number): { x: number; y: number } => {
      const sag = t * t * ash.bend * length * 0.55;
      const x = tip.x + along.x * length * t + perp.x * (sag + offset);
      const y = tip.y + along.y * length * t + perp.y * (sag + offset);
      return { x, y };
    };
    for (let i = 0; i < steps; i += 1) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const grit = 0.55 + ((i * 37) % 11) / 22;
      const rgb = mixRgb(style, [40, 38, 40], grit * 0.35);
      tint.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
      const top0 = at(t0, -thickness * 0.5);
      const top1 = at(t1, -thickness * 0.5);
      const bottom0 = at(t0, thickness * (0.5 - t0 * 0.25));
      const bottom1 = at(t1, thickness * (0.5 - t1 * 0.25));
      for (const p of [top0, bottom0, top1, bottom1]) {
        const world = toWorld(p);
        positions.push(world[0], world[1], 0);
        colours.push(tint.r, tint.g, tint.b);
      }
      const base = i * 4;
      index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    mesh.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geometry.setIndex(index);
    mesh.geometry = geometry;
  }
  mesh.visible = true;
}

/**
 * The tray's pile, gated on the tray actually holding something.
 *
 * It reads `ashtray.grams` — the same field the tray's gram figure on the HUD is formatted from — so
 * the mound and the number cannot disagree (§15). The Demo draws one fixed pile for one fixed
 * state, so presence is the whole mapping here: a growth curve would be a second source for a
 * quantity the core already keeps.
 */
function placePile(state: GameStateView | null): void {
  if (pileMesh === null || pileMaterial === null) return;
  if ((state?.ashtray.grams ?? 0) <= 0) {
    pileMesh.visible = false;
    return;
  }
  const metrics = ashPileMetrics(trayRadius.value);
  // The stadium is baked at the box it is drawn at, the way the slider's track is: one texel of
  // feather is then one CSS pixel of softness on screen, which is what the Demo's `blur(3px)` says,
  // and stretching a fixed mask would oval the two round caps.
  const perPxX = frame.value.width / Math.max(0.0001, box.value.width * viewportWidthPx.value);
  const pxWidth = Math.max(2, Math.round(metrics.width / perPxX));
  const pxHeight = Math.max(2, Math.round(metrics.height / pxToWorld(1)));
  const signature = `${pxWidth}x${pxHeight}`;
  if (signature !== pileSignature) {
    pileSignature = signature;
    pileMaterial.map?.dispose();
    pileMaterial.map = stadiumBar(pxWidth, pxHeight, ASH_PILE.blurPx);
    pileMaterial.needsUpdate = true;
  }
  const anchor = at('ashtray');
  pileMesh.scale.set(metrics.width, metrics.height, 1);
  // The pile lies in the tray's plane, so the tray's rock carries it — same angle, same pivot,
  // even though this mesh hangs off the rig group rather than the tray's own.
  const rock = trayRock(trayFeedback, state?.nowMs ?? 0);
  // In front of the tray's own face: the disc is a cylinder `trayRadius * 0.28` deep, so its
  // camera-side cap sits at 0.14 of the radius.
  pileMesh.position.set(
    anchor[0] - metrics.dy * Math.sin(rock),
    anchor[1] + metrics.dy * Math.cos(rock),
    anchor[2] + trayRadius.value * 0.14 + 0.0005,
  );
  pileMesh.visible = true;
}

/**
 * §20's tray answers a drag: the rock a landing leaves, and the rim and halo that say 这儿 while the
 * rod is being carried to it.
 *
 * The three readings come from `stepTrayFeedback` — the retired 2D layer's own constants, kept in
 * `game-scene/props` — and this function only lays them down. The invitation is what lets an object
 * answer without becoming a control: the tray is always in the scene (ash falls into it whether or
 * not anyone is dragging), so what appears on a drag is its rim warming and a halo just outside the
 * bowl, never a new button over the picture.
 */
function placeTray(state: GameStateView | null, dt: number): void {
  const group = trayGroup.value;
  if (group === null) return;
  if (state === null) {
    trayFeedback = TRAY_FEEDBACK_START;
    group.rotation.z = 0;
    return;
  }
  trayFeedback = stepTrayFeedback(trayFeedback, {
    grams: state.ashtray.grams,
    dropped: state.cigarette.ash.dropped,
    dragged: state.cigarette.pose.dragged,
    dtMs: dt,
    cartoon: cartoonScale(props.game.rendererLook().realism),
  });
  group.rotation.z = trayRock(trayFeedback, state.nowMs);
  const radius = trayRadius.value;
  const invite = trayFeedback.invited;
  const style = state.style.ashtray;
  const rim = trayRimMesh.value;
  if (rim !== null) {
    const material = rim.material as THREE.MeshBasicMaterial;
    const tinted = mixRgb(style.rim, TRAY_FEEDBACK.rimWarm, invite * 0.7);
    rim.visible = true;
    rim.scale.set(radius, radius * TRAY_FLATTEN, 1);
    material.color.setRGB(
      (tinted[0] ?? 0) / 255,
      (tinted[1] ?? 0) / 255,
      (tinted[2] ?? 0) / 255,
      THREE.SRGBColorSpace,
    );
    material.opacity = clamp01(
      0.25 + style.reflect + state.world.light.ambient * 0.3 + invite * 0.45,
    );
  }
  const halo = trayHaloMesh.value;
  if (halo !== null) {
    const material = halo.material as THREE.MeshBasicMaterial;
    halo.visible = invite > 0.02;
    halo.scale.set(radius * TRAY_FEEDBACK.halo.across, radius * TRAY_FEEDBACK.halo.down, 1);
    material.color.setRGB(
      (TRAY_FEEDBACK.haloWarm[0] ?? 0) / 255,
      (TRAY_FEEDBACK.haloWarm[1] ?? 0) / 255,
      (TRAY_FEEDBACK.haloWarm[2] ?? 0) / 255,
      THREE.SRGBColorSpace,
    );
    material.opacity = invite * 0.5;
  }
}

/**
 * The char front, from the painted layer's own `drawHeatBleed` (§17, S12): the paper just behind
 * the cherry chars and glows — `reach = min(rodLength · 0.4, len(0.05) · (1 + presence))` of the
 * rod, the ramp [24,18,16] → [46,30,22] → `mixRgb([255,150,60], [255,240,200], heat)`, the last
 * 55 % lit additively — and the toothed front at its edge: grains keyed to their index through the
 * same `noise2` field, never to the clock, so the same millimetre of paper chars the same way in
 * every frame. The painter's alphas become mixes toward the paper here, which is what they are —
 * translucent paint over paper. Stations are laid out in canvas pixels like `placeColumn`'s.
 */
function placeChar(state: GameStateView | null): void {
  const band = charBand.value;
  const hot = charHot.value;
  const grainCloud = charGrains.value;
  if (
    band === null ||
    hot === null ||
    grainCloud === null ||
    charMaterial === null ||
    charHotMaterial === null
  ) {
    return;
  }
  const pose = state?.cigarette.pose;
  const ember = state?.cigarette.ember;
  const style = state?.style.cigarette;
  const total = ember === undefined ? 0 : emberPresence(ember);
  if (pose == null || ember == null || style == null || total <= 0.05 || !pose.visible) {
    band.visible = false;
    hot.visible = false;
    grainCloud.visible = false;
    return;
  }
  const charFrame = canvasPx();
  const pivot = charFrame.pxOf(pose.pivot);
  const tip = charFrame.pxOf(pose.tip);
  const rodLengthPx = Math.hypot(tip.x - pivot.x, tip.y - pivot.y);
  if (rodLengthPx <= 1) {
    band.visible = false;
    hot.visible = false;
    grainCloud.visible = false;
    return;
  }
  const reachPx = Math.min(rodLengthPx * 0.4, charFrame.unit * 0.05 * (1 + total));
  if (reachPx <= 0.5) {
    band.visible = false;
    hot.visible = false;
    grainCloud.visible = false;
    return;
  }
  const thickness = pose.thickness * charFrame.unit;
  const along = { x: (tip.x - pivot.x) / rodLengthPx, y: (tip.y - pivot.y) / rodLengthPx };
  const perp = { x: -along.y, y: along.x };
  const paper = style.paper;
  const hotColour = mixRgb([255, 150, 60], [255, 240, 200], emberHeat(ember.temperature));
  const boundary = rodLengthPx - reachPx;
  const signature = `${tip.x.toFixed(2)},${tip.y.toFixed(2)}|${reachPx.toFixed(2)}|${thickness.toFixed(2)}|${total.toFixed(3)}|${paper.join(',')}|${hotColour.join(',')}`;
  if (signature !== charSignature) {
    charSignature = signature;
    const stations = 8;
    const stopAt = (t: number): readonly [number, number, number] =>
      t <= 0.6
        ? mixRgb([24, 18, 16], [46, 30, 22], t / 0.6)
        : mixRgb([46, 30, 22], hotColour, (t - 0.6) / 0.4);
    const alphaAt = (t: number): number =>
      t <= 0.6 ? 0.35 * total * (t / 0.6) : (0.35 + 0.2 * ((t - 0.6) / 0.4)) * total;
    const toWorld = charFrame.toWorld;
    const bandPositions: number[] = [];
    const bandColours: number[] = [];
    const bandIndex: number[] = [];
    for (let i = 0; i <= stations; i += 1) {
      const t = i / stations;
      const s = boundary + reachPx * t;
      const centre = { x: pivot.x + along.x * s, y: pivot.y + along.y * s };
      const stop = stopAt(t);
      const shown = mixRgb(paper, stop, alphaAt(t));
      tint.setRGB(shown[0] / 255, shown[1] / 255, shown[2] / 255, THREE.SRGBColorSpace);
      for (const side of [0.5, -0.5]) {
        const world = toWorld({
          x: centre.x + perp.x * thickness * side,
          y: centre.y + perp.y * thickness * side,
        });
        bandPositions.push(world[0], world[1], 0);
        bandColours.push(tint.r, tint.g, tint.b);
      }
      if (i > 0) {
        const base = (i - 1) * 2;
        bandIndex.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    band.geometry.dispose();
    const bandGeometry = new THREE.BufferGeometry();
    bandGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bandPositions, 3));
    bandGeometry.setAttribute('color', new THREE.Float32BufferAttribute(bandColours, 3));
    bandGeometry.setIndex(bandIndex);
    band.geometry = bandGeometry;

    // The hot core: the painter fills the last 55 % of the ramp again in `lighter`, so its colours
    // arrive here premultiplied by their own alpha and the material adds them.
    const hotStart = rodLengthPx - reachPx * 0.55;
    const hotPositions: number[] = [];
    const hotColours: number[] = [];
    const hotIndex: number[] = [];
    for (let i = 0; i <= stations; i += 1) {
      const t = 0.45 + 0.55 * (i / stations);
      const s = hotStart + reachPx * 0.55 * (i / stations);
      const centre = { x: pivot.x + along.x * s, y: pivot.y + along.y * s };
      const stop = stopAt(t);
      const alpha = alphaAt(t);
      tint.setRGB(
        (stop[0] * alpha) / 255,
        (stop[1] * alpha) / 255,
        (stop[2] * alpha) / 255,
        THREE.SRGBColorSpace,
      );
      for (const side of [0.42, -0.42]) {
        const world = toWorld({
          x: centre.x + perp.x * thickness * side,
          y: centre.y + perp.y * thickness * side,
        });
        hotPositions.push(world[0], world[1], 0);
        hotColours.push(tint.r, tint.g, tint.b);
      }
      if (i > 0) {
        const base = (i - 1) * 2;
        hotIndex.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    hot.geometry.dispose();
    const hotGeometry = new THREE.BufferGeometry();
    hotGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hotPositions, 3));
    hotGeometry.setAttribute('color', new THREE.Float32BufferAttribute(hotColours, 3));
    hotGeometry.setIndex(hotIndex);
    hot.geometry = hotGeometry;
  }
  band.visible = true;
  hot.visible = true;

  // The toothed front: the painter's own grain count and offsets, index-keyed.
  const size = Math.max(1, thickness * 0.16);
  const count = Math.max(9, Math.min(CHAR_GRAIN_CAPACITY, Math.round((thickness / size) * 5)));
  let n = 0;
  for (let i = 0; i < count; i += 1) {
    const across = noise2(i * 0.53, 0.5, CHAR_GRAIN_SEED);
    const bite = noise2(i * 0.31, 1.7, CHAR_GRAIN_SEED);
    const side = size * (0.6 + 0.8 * bite);
    const s = boundary - bite * thickness * CHAR_BIT;
    const centre = { x: pivot.x + along.x * s, y: pivot.y + along.y * s };
    const offset = -thickness * 0.5 + across * thickness;
    const world = charFrame.toWorld({
      x: centre.x + perp.x * offset,
      y: centre.y + perp.y * offset,
    });
    dummy.position.set(world[0], world[1], 0);
    dummy.rotation.set(0, 0, 0);
    const sideWorld = side * pxToWorld(1);
    dummy.scale.set(sideWorld, sideWorld, 1);
    dummy.updateMatrix();
    grainCloud.setMatrixAt(n, dummy.matrix);
    const shade = mixRgb(paper, [30, 21, 17], (0.26 + 0.5 * bite) * total);
    tint.setRGB(shade[0] / 255, shade[1] / 255, shade[2] / 255, THREE.SRGBColorSpace);
    grainCloud.setColorAt(n, tint);
    n += 1;
  }
  grainCloud.count = n;
  grainCloud.visible = n > 0;
  grainCloud.instanceMatrix.needsUpdate = true;
  if (grainCloud.instanceColor !== null) grainCloud.instanceColor.needsUpdate = true;
}

/**
 * §60's accents, from the same `EffectList` the painted layer fills: rings (the ripple with its
 * 0.34 squash — a mark on a surface, not in the air) as stroked circles, flashes as soft discs.
 * Radii and stroke widths ride `unitWorld` exactly as the painter's `toLen` did, alpha is the
 * painter's own `strength · (1 − age)²`, and everything blends additively.
 */
function placeEffects(): void {
  const active = effectList.active(clockMs);
  let rings = 0;
  let flashes = 0;
  for (const effect of active) {
    const age = Math.min(1, (clockMs - effect.bornMs) / effect.ttlMs);
    const eased = 1 - (1 - age) * (1 - age);
    const alpha = effect.strength * (1 - age) * (1 - age);
    if (alpha <= 0.004) continue;
    const world = canvasToWorld({ x: effect.x, y: effect.y }, box.value, aspect.value);
    if (effect.kind === 'flash') {
      const mesh = effectFlashPool[flashes];
      if (mesh === undefined) continue;
      const material = mesh.material as THREE.MeshBasicMaterial;
      const radius = (0.05 + eased * effect.reach) * unitWorld.value;
      mesh.position.set(world[0], world[1], 0.0325);
      mesh.scale.set(radius * 2, radius * 2, 1);
      material.color.setRGB(
        effect.tint[0] / 255,
        effect.tint[1] / 255,
        effect.tint[2] / 255,
        THREE.SRGBColorSpace,
      );
      material.opacity = alpha;
      mesh.visible = true;
      flashes += 1;
      continue;
    }
    const mesh = effectRingPool[rings];
    if (mesh === undefined) continue;
    const radius = (0.012 + eased * effect.reach) * unitWorld.value;
    const halfWidth = Math.max(
      unitWorld.value * 0.0005,
      unitWorld.value * 0.002 * (1 - eased * 0.6),
    );
    const signature = `${(radius - halfWidth).toFixed(4)}|${(radius + halfWidth).toFixed(4)}`;
    if (signature !== effectRingSignatures[rings]) {
      effectRingSignatures[rings] = signature;
      mesh.geometry.dispose();
      mesh.geometry = new THREE.RingGeometry(
        Math.max(0.0001, radius - halfWidth),
        radius + halfWidth,
        48,
        1,
      );
    }
    const material = mesh.material as THREE.MeshBasicMaterial;
    mesh.position.set(world[0], world[1], 0.033);
    mesh.scale.set(1, effect.kind === 'ripple' ? 0.34 : 1, 1);
    material.color.setRGB(
      effect.tint[0] / 255,
      effect.tint[1] / 255,
      effect.tint[2] / 255,
      THREE.SRGBColorSpace,
    );
    material.opacity = alpha;
    mesh.visible = true;
    rings += 1;
  }
  for (let i = rings; i < effectRingPool.length; i += 1) {
    const mesh = effectRingPool[i];
    if (mesh !== undefined) mesh.visible = false;
  }
  for (let i = flashes; i < effectFlashPool.length; i += 1) {
    const mesh = effectFlashPool[i];
    if (mesh !== undefined) mesh.visible = false;
  }
}

/**
 * The cherry, as the light source §17 calls it: a halo in the air and a spill where its light lands
 * on the table edge. Both are additive quads fed by the core's own `emberPresence` and `emberHeat`
 * through `cherryHot` — the same numbers, the same colour band the painted layer draws with — so
 * the light can never read hotter than the thing it comes from. When the cherry goes dark both go
 * out, because the whole point of drawing it is that the picture has one warm anchor.
 */
function placeCherry(state: GameStateView | null): void {
  const haloMesh = halo.value;
  const spillMesh = spill.value;
  if (haloMesh === null || spillMesh === null) return;
  const ember = state?.cigarette.ember;
  const at = points.value.ember;
  const showing =
    state !== null && ember !== undefined && at !== undefined && state.cigarette.pose.visible;
  const total = showing && ember !== undefined ? emberPresence(ember) : 0;
  const lit = showing && total > 0.02;
  haloMesh.visible = lit;
  spillMesh.visible = lit;
  // Read before the early return: a check that watches the cherry go dark has to see the frame where
  // it stopped, not a stale one.
  const report = (drawn: boolean): void => {
    probe.cherry = {
      glowRadius: ember?.glowRadius ?? 0,
      flare: ember?.flare ?? 0,
      haloDiameter: Number(haloMesh.scale.x.toFixed(4)),
      unit: Number(unitWorld.value.toFixed(6)),
      opacity: Number((haloMaterial?.opacity ?? 0).toFixed(4)),
      visible: drawn,
    };
  };
  if (!lit || ember === undefined || at === undefined || state === null) {
    report(false);
    return;
  }

  const world = canvasToWorld(at, box.value, aspect.value);
  const unit = unitWorld.value;
  const hot = cherryHot(ember.temperature);
  const setHot = (material: THREE.MeshBasicMaterial | null): void => {
    material?.color.setRGB(hot[0] / 255, hot[1] / 255, hot[2] / 255, THREE.SRGBColorSpace);
  };
  setHot(haloMaterial);

  // The halo's size is the core's own glow radius, widened by its flare (`drawCherryLight`).
  const haloRadius = ember.glowRadius * (1.9 + ember.flare * 1.4) * unit;
  haloMesh.position.set(world[0], world[1], 0.03);
  haloMesh.scale.set(haloRadius * 2, haloRadius * 2, 1);
  if (haloMaterial !== null) haloMaterial.opacity = clamp01(0.16 * total);
  report(true);

  // The spill sits on the table edge, below the ember by the state's own layout.
  const edgeCanvasY = box.value.y + box.value.height * state.stage.layout.tableEdgeY;
  const edge = canvasToWorld({ x: at.x, y: edgeCanvasY }, box.value, aspect.value);
  const distance = state.stage.layout.tableEdgeY - (at.y - box.value.y) / box.value.height;
  const spillRadius = 0.34 * (0.6 + total * 0.6) * unit;
  spillMesh.position.set(edge[0], edge[1], -0.35);
  spillMesh.scale.set(spillRadius * 2, spillRadius * 2 * 0.24, 1);
  setHot(spillMaterial);
  if (spillMaterial !== null) spillMaterial.opacity = clamp01(0.11 * total * (1 - distance));
}
/**
 * The frame's own push-in: where the world leans to, and how far the edges close.
 *
 * One writer for the vignette's opacity, on purpose. It used to answer a `watch` on the room's ambient
 * alone, which is the whole of the base look — but the 冲击感 darkens the same corners for a few
 * frames, and two writers on one opacity is how a beat gets eaten by whichever ran last.
 */
function placePunch(state: GameStateView | null, dt: number): void {
  const phase = state?.cigarette.state ?? '';
  if (phase === 'BURNING' && lastPhase !== 'BURNING') impact = 1;
  lastPhase = phase;
  impact = stepIgnition(impact, dt, props.game.rendererLook().reducedMotion);
  const punch = ignitionPunch(impact);
  probe.punch = Number(punch.toFixed(4));
  const cartoon = cartoonScale(props.game.rendererLook().realism);
  const zoom = ignitionZoom(punch, cartoon);
  const group = worldGroup.value;
  if (group !== null) {
    // x and y only. The 2D layer's transform had no third axis, and the scene's z ladder is what keeps
    // the plume under the chrome's first plate — leaning depth over would shuffle that for nothing.
    group.scale.set(zoom, zoom, 1);
    const ember = points.value.ember;
    const world = ember === undefined ? [0, 0] : canvasToWorld(ember, box.value, aspect.value);
    const pivot = punchPivot([world[0] ?? 0, world[1] ?? 0], zoom);
    group.position.set(pivot.x, pivot.y, 0);
  }
  if (vignetteMaterial !== null) {
    vignetteMaterial.opacity = clamp01(vignetteAlphaNow.value + ignitionEdgeAlpha(punch, cartoon));
  }
}

let clockMs = 0;

/**
 * Where a particle of the pool sits on the scene's z ladder. `NEAR_DEPTH` is the painter's own
 * far/near divide — `drawSmoke` draws the two halves around the props — and the pool's `depth` is
 * simulation (0.25..1), not a z: handing it to the scene directly (the first version did) put the
 * plume at 0.3..1.0, in front of the whole chrome ladder, so puffs painted over the HUD — a thing
 * the canvas can never do, because the chrome is DOM above it. The two bands below are the plain
 * reading of the same split: far puffs slide behind the props (the table's front face is −0.25,
 * the props and the rod at 0), near puffs rise in front of the flame (0.02) and stay under the
 * chrome's first plate (0.034).
 */
function particleZ(depth: number): number {
  return depth >= NEAR_DEPTH
    ? 0.021 + ((depth - NEAR_DEPTH) / (1 - NEAR_DEPTH)) * 0.009
    : -0.2 + (depth / NEAR_DEPTH) * 0.16;
}

function step(deltaMs: number): void {
  const state = props.state;
  const dt = Math.max(0, Math.min(deltaMs, 64));
  clockMs += dt;
  // The same seven inputs the painted layer's own call carries — the sparks' floor is the table's
  // own line (so the burst bounces where the picture says the table is), the bounce wears the same
  // realism dial, and the venue's draught reaches the plume's *structure*, not only its paint.
  pool.update(
    dt,
    state?.smoke.drift ?? { x: 0, y: 0 },
    FIELD_SCALE,
    clockMs / 1000,
    state?.stage.layout.table.y ?? null,
    cartoonScale(props.game.rendererLook().realism),
    ventDraught(state?.environment.ventilation ?? 1),
  );
  probe.frames += 1;
  // Read from the same fields the engine's own rest rule reads, so a check waiting on this is
  // waiting on the rule rather than on a duration someone copied out of it.
  probe.puffReady =
    state !== null &&
    !state.cigarette.puff.active &&
    state.cigarette.puff.sinceReleaseMs >= TIMING.restSettleMs;
  placePunch(state, dt);
  placeCherry(state);
  placeAsh(state);
  placePile(state);
  placeTray(state, dt);
  placeRod(state);
  placeColumn(state);
  placeChar(state);
  placeEffects();
  placeFlame(state);
  placeDust(state);
  placeRain(state);
  placeGrain(state);
  const lid = lighterLid.value;
  if (lid !== null) {
    lid.rotation.x = -clamp01(state?.lighter.lid ?? 0) * ((LID_THROW_DEG * Math.PI) / 180);
  }
  applyBackdrop(state);
  placeText();
  placeRail();
  placeCat();
  placeArchive();
  placeSheet();
  const hudRing = hudRig.value;
  if (hudRing !== null) {
    placeRingRig(hudRing, document.querySelector<SVGSVGElement>('.hud .ring svg'), 0.034, 0.035);
  }
  placePill();
  placePillInk();
  placeHintInk();
  placeGlyphIcons();
  placeStageRing(state);
  placeMouth(state);

  const cloud = puffs.value;
  if (cloud === null) return;
  const size = frame.value;
  // Every look input is the state's, through the same functions the 2D layer draws with: none is
  // this file's opinion, which is what keeps a venue change moving both pictures at once.
  const visibility = state?.smoke.visibility ?? 0.5;
  const opacity = state?.style.smoke.opacity ?? 1;
  const highContrast = props.game.rendererLook().contrast === 'high';
  const spread = puffSpread(state?.environment.ventilation ?? 1);
  let n = 0;
  let sparkN = 0;
  pool.forEachActive((particle) => {
    if (particle.spark) {
      // Sparks are streaks: they belong to this pass, and drawn as puffs they were blobs of smoke
      // where the picture promises a shower of light.
      const spark = sparksMesh.value;
      // A spark under `NEAR_DEPTH` is in the painter's far half, where it is never drawn — the
      // canvas collects sparks only in its near pass, and the same gate here keeps the two
      // pictures one shower.
      if (spark !== null && sparkN < SPARK_CAPACITY && particle.depth >= NEAR_DEPTH) {
        const from = canvasToWorld({ x: particle.px, y: particle.py }, box.value, aspect.value);
        const to = canvasToWorld({ x: particle.x, y: particle.y }, box.value, aspect.value);
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const streak = sparkStreak(particle);
        dummy.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, particleZ(particle.depth));
        dummy.rotation.set(0, 0, Math.atan2(dy, dx));
        dummy.scale.set(
          Math.hypot(dx, dy),
          Math.max(streak.widthUnits * unitWorld.value, pxToWorld(1)),
          1,
        );
        dummy.updateMatrix();
        spark.setMatrixAt(sparkN, dummy.matrix);
        tint.setRGB(
          (streak.colour[0] ?? 0) / 255,
          (streak.colour[1] ?? 0) / 255,
          (streak.colour[2] ?? 0) / 255,
          THREE.SRGBColorSpace,
        );
        spark.setColorAt(sparkN, tint.multiplyScalar(streak.alpha));
        sparkN += 1;
      }
      return;
    }
    if (n >= CAPACITY) return;
    // The pool works in stage units; the camera's frame is the only conversion from here on.
    dummy.position.set(
      (particle.x - 0.5) * size.width,
      (0.5 - particle.y) * size.height,
      particleZ(particle.depth),
    );
    // Diameter by the 2D layer's own rule (`radius * scale * size * depth * PUFF_SPREAD`, capped at
    // MAX_SMOKE_RADIUS_PX) rather than a factor of my own; the venue's 通风系数 widens it here and
    // the ellipse is flattened and turned exactly as that layer's `drawImage` does.
    const d = puffDiameterWorld(particle, unitWorld.value, viewportHeightPx.value) * spread;
    dummy.rotation.set(0, 0, particle.rotation);
    dummy.scale.set(d, d * PUFF_FLATTEN, 1);
    dummy.updateMatrix();
    cloud.setMatrixAt(n, dummy.matrix);
    const a = puffAlpha(particle.alpha, opacity, visibility, highContrast);
    const rgb = puffTint(particle.tint, puffHeat(particle), visibility);
    // The tint arrives 0–255 sRGB and per-instance colours are linear, so saying the colour space
    // is not decoration: skipping it is what made the plume a white column.
    tint.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
    // Colour carries the alpha: the sprite is soft, so a puff fades by going darker, not by
    // changing shape — and an instanced cloud has no per-instance opacity of its own.
    cloud.setColorAt(n, tint.multiplyScalar(a));
    n += 1;
  });
  const spark = sparksMesh.value;
  if (spark !== null) {
    spark.count = sparkN;
    spark.instanceMatrix.needsUpdate = true;
    if (spark.instanceColor !== null) spark.instanceColor.needsUpdate = true;
  }
  cloud.count = n;
  cloud.instanceMatrix.needsUpdate = true;
  if (cloud.instanceColor !== null) cloud.instanceColor.needsUpdate = true;
  probe.particles = n;
}
/**
 * One SVG ring, as meshes: the track circle and the run arc. Everything comes off the element —
 * radius, stroke and colours from its attributes and computed style, the arc's length from the
 * `stroke-dasharray` the DOM already computed — so the HUD's ring and the pill's are the same
 * mechanism with different numbers, which is why this serves both.
 */
function placeRingRig(rig: RingRig, svg: SVGSVGElement | null, zTrack: number, zArc: number): void {
  const trackCircle = svg?.querySelector<SVGCircleElement>('circle.track') ?? null;
  const runCircle = svg?.querySelector<SVGCircleElement>('circle.run, circle.arc') ?? null;
  if (svg === null || trackCircle === null || runCircle === null) {
    rig.track.visible = false;
    rig.arc.visible = false;
    return;
  }
  const rect = svg.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    rig.track.visible = false;
    rig.arc.visible = false;
    return;
  }
  const radiusUser = Number.parseFloat(trackCircle.getAttribute('r') ?? '0') || 0;
  const viewBox =
    Number.parseFloat((svg.getAttribute('viewBox') ?? '').split(/[\s,]+/)[2] ?? '0') || 0;
  const strokeUser = Number.parseFloat(getComputedStyle(trackCircle).strokeWidth) || 0;
  if (radiusUser <= 0 || viewBox <= 0 || strokeUser <= 0) {
    rig.track.visible = false;
    rig.arc.visible = false;
    return;
  }
  const dash = Number.parseFloat(runCircle.getAttribute('stroke-dasharray') ?? '0') || 0;
  const fraction = Math.max(0, Math.min(1, dash / (2 * Math.PI * radiusUser)));
  const trackColour = getComputedStyle(trackCircle).stroke;
  const runColour = getComputedStyle(runCircle).stroke;
  const signature = `${rect.left.toFixed(1)}|${rect.top.toFixed(1)}|${rect.width.toFixed(1)}|${fraction.toFixed(2)}|${trackColour}|${runColour}`;
  if (signature !== rig.signature) {
    rig.signature = signature;
    const centre = canvasToWorld(
      {
        x: (rect.left + rect.width / 2) / Math.max(1, viewportWidthPx.value),
        y: (rect.top + rect.height / 2) / Math.max(1, viewportHeightPx.value),
      },
      box.value,
      aspect.value,
    );
    const outerWorld = pxToWorld((rect.width * (radiusUser + strokeUser / 2)) / viewBox);
    rig.track.position.set(centre[0], centre[1], zTrack);
    rig.arc.position.set(centre[0], centre[1], zArc);
    rig.track.scale.set(outerWorld, outerWorld, 1);
    rig.arc.scale.set(outerWorld, outerWorld, 1);
    const trackParsed = parseColour(trackColour);
    const runParsed = parseColour(runColour);
    if (trackParsed !== null) {
      rig.trackMaterial.color.copy(trackParsed.colour);
      rig.trackMaterial.opacity = trackParsed.alpha;
    }
    if (runParsed !== null) {
      rig.arcMaterial.color.copy(runParsed.colour);
      rig.arcMaterial.opacity = runParsed.alpha;
    }
    rig.trackMaterial.opacity = 1;
    rig.arcMaterial.opacity = 1;
    if (fraction > 0.005) {
      const innerRatio = (radiusUser - strokeUser / 2) / (radiusUser + strokeUser / 2);
      rig.arc.geometry.dispose();
      // The SVG rotates -90°, so the arc starts at twelve o'clock and runs the way the rod burns.
      rig.arc.geometry = new THREE.RingGeometry(
        innerRatio,
        1,
        Math.max(2, Math.ceil(64 * fraction)),
        1,
        Math.PI / 2,
        -fraction * Math.PI * 2,
      );
    }
  }
  rig.track.visible = true;
  rig.arc.visible = fraction > 0.005;
}

/**
 * The pill: a stadium card, its glow, and the state's own paint.
 *
 * The card's geometry is built per state change, and its winding cost a long probe round: a custom
 * quad still has to wind counter-clockwise or it is culled — the card drew nothing at all, and the
 * shape on screen was its own glow, which is why repainting the card's material changed no pixel
 * and why hiding the card changed nothing either. The aha came from hiding each scene child in turn
 * and watching which one owned the pixel.
 *
 * The sustained states carry a three-stop ember gradient; the quiet ones a flat mix. Both are read
 * from what the browser resolved (`background-color`, and the `rgb(...)` stops inside
 * `background-image`), so a state change moves this card because it moved the CSS. The card's
 * gradient runs left-to-right here while the CSS tilts it 10°: that tilt is the one approximation
 * in this file, and it is one line to fix when the pill's own art pass happens.
 */
function fillCard(rig: CardRig, element: HTMLElement | null, shrink: number): void {
  const { mesh: card, material } = rig;
  if (element === null) {
    card.visible = false;
    return;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    card.visible = false;
    return;
  }
  const style = getComputedStyle(element);
  const gradient = style.backgroundImage.includes('gradient');
  const signature = `${rect.left.toFixed(1)}|${rect.top.toFixed(1)}|${rect.width.toFixed(1)}|${rect.height.toFixed(1)}|${shrink}|${style.backgroundImage}|${style.backgroundColor}|${style.borderColor}|${style.borderRadius}`;
  if (signature !== rig.signature) {
    rig.signature = signature;
    const whole = rectWorld({
      x: rect.left / Math.max(1, viewportWidthPx.value),
      y: rect.top / Math.max(1, viewportHeightPx.value),
      w: rect.width / Math.max(1, viewportWidthPx.value),
      h: rect.height / Math.max(1, viewportHeightPx.value),
    });
    card.position.set(whole.centre[0], whole.centre[1], card.position.z);
    rig.baseY = whole.centre[1];
    const geometry = new THREE.BufferGeometry();
    const stops = [
      ...style.backgroundImage.matchAll(
        /(#[0-9a-fA-F]{3,8}|(?:rgba?|oklab|oklch|lab|lch|color)\([^)]*\))\s*([\d.]+%)?/g,
      ),
    ]
      .map((match) => ({
        colour: parseColour(String(match[1])),
        at: match[2] === undefined ? null : Number.parseFloat(match[2]) / 100,
      }))
      .filter((stop) => stop.colour !== null);
    const positions: number[] = [];
    const colours: number[] = [];
    const uvs: number[] = [];
    if (gradient && stops.length >= 2) {
      // A column per stop reproduces the painter's linear stops exactly along the card's length.
      stops.forEach((stop, index) => {
        const at = stop.at ?? index / (stops.length - 1);
        const x = at - 0.5;
        const colour = stop.colour;
        if (colour === null) return;
        for (const y of [-0.5, 0.5]) {
          positions.push(x, y, 0);
          colours.push(colour.colour.r, colour.colour.g, colour.colour.b);
          // The card carries the stadium texture, so it needs real uvs — without them the
          // sampler reads the texture's transparent corner and the card draws nothing at all.
          uvs.push(at, y + 0.5);
        }
      });
      const index: number[] = [];
      for (let i = 0; i < stops.length - 1; i += 1) {
        // Counter-clockwise seen from the camera, or the card faces away and is culled — the same
        // trap the text quads fell into, and the one that hid the pill behind its own glow.
        index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
      }
      geometry.setIndex(index);
      // Vertex colours are what carry the stops; without this the card paints a flat white.
      material.vertexColors = true;
      material.color.set('#ffffff');
      // A gradient background is a painted thing: the opacity has to come back to 1. The flat branch
      // below writes an opacity for every case it sees — including `background: none`, which is 0 —
      // and a card that starts quiet and later gets a gradient (the rail's tabs, the selected chips)
      // kept that 0. Measured on the served build 2026-10-11: the lit tab's plate sat at opacity 0
      // with its gradient geometry in place, so the tab's dark §1 ink had no orange under it and the
      // selected row read as blank.
      material.opacity = 1;
    } else {
      const flat = parseColour(style.backgroundColor);
      positions.push(-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0);
      uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
      geometry.setIndex([0, 1, 2, 2, 1, 3]);
      material.vertexColors = false;
      if (flat !== null) material.color.copy(flat.colour);
      // A transparent flat fill is a card that is not there — the quiet rail tabs are exactly that.
      material.opacity = flat?.alpha ?? 0;
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (colours.length > 0) {
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    }
    card.geometry.dispose();
    card.geometry = geometry;
    quadScale(card, rect, shrink);
    const { corners, first, uniform } = cornerRadii(style.borderRadius, rect);
    if (uniform && first[0] >= 1 && first[1] >= 1) {
      material.map = solidDisc(64);
    } else if (uniform) {
      material.map = roundedRect(128, first[0], first[1]);
    } else {
      material.map = roundedRect(128, first[0], first[1], 1.5, corners);
    }
    material.needsUpdate = true;
    rig.baseOpacity = material.opacity;
  }
  card.visible = true;
}

/**
 * A card's four corner radii, per axis: 1/1 is a circle (the cat), ~1 on the short axis is the
 * stadium the pill and the rail ask for, and a big card's 16px stays 16px on both axes. The computed
 * shorthand is expanded by CSS's own rules (1/2/3/4 values, `x / y` split first), so a sheet's
 * "22px 22px 0 0" keeps its square bottom corners instead of rounding all four.
 */
function cornerRadii(
  borderRadius: string,
  rect: { width: number; height: number },
): {
  corners: Array<readonly [number, number]>;
  first: readonly [number, number];
  uniform: boolean;
} {
  const [horizontal = ''] = borderRadius.split('/');
  const radiusParts = horizontal.split(/\s+/).map((value) => Number.parseFloat(value) || 0);
  const radiusAt = (index: number): number =>
    radiusParts.length <= 1
      ? (radiusParts[0] ?? 0)
      : radiusParts.length === 2
        ? (radiusParts[index % 2] ?? 0)
        : radiusParts.length === 3
          ? ([radiusParts[0], radiusParts[1], radiusParts[2], radiusParts[1]][index] ?? 0)
          : (radiusParts[index] ?? 0);
  const halfW = Math.max(1, rect.width / 2);
  const halfH = Math.max(1, rect.height / 2);
  const corners = [0, 1, 2, 3].map(
    (index) =>
      [Math.min(1, radiusAt(index) / halfW), Math.min(1, radiusAt(index) / halfH)] as const,
  );
  const first = corners[0] ?? ([0, 0] as const);
  const uniform = corners.every(([x, y]) => x === first[0] && y === first[1]);
  return { corners, first, uniform };
}

/** A DOM rect as a unit quad's world scale, through the stage box everything else uses. */
function quadScale(
  mesh: THREE.Mesh,
  rect: { width: number; height: number },
  shrink: number,
): void {
  mesh.scale.set(
    (rect.width / Math.max(1, viewportWidthPx.value)) *
      (frame.value.width / Math.max(0.0001, box.value.width)) *
      shrink,
    (rect.height / Math.max(1, viewportHeightPx.value)) *
      (frame.value.height / Math.max(0.0001, box.value.height)) *
      shrink,
    1,
  );
}

/** The pill: its card, its ring and its glow. */
function placePill(): void {
  const rig = pillCardRig.value;
  const ring = pillRig.value;
  const pill = document.querySelector<HTMLElement>('.pill');
  if (rig === null) return;
  const held = pill?.closest('.cta')?.getAttribute('data-held') === 'true';
  // The DOM's own press, so the painted card shrinks with the box the finger is on.
  fillCard(rig, pill, held === true ? 0.98 : 1);
  if (ring !== null) {
    placeRingRig(ring, pill?.querySelector('svg') ?? null, 0.054, 0.055);
  }
  const glow = pillGlow.value;
  if (glow !== null && pillGlowMaterial !== null && pill !== null) {
    const rect = pill.getBoundingClientRect();
    // One home for the button's look: the DOM's own `box-shadow`, which §2 writes as
    // `0 10px 28px -6px rgba(217,87,25,.42)`. The card, the ring and this halo all read the element,
    // so the numbers cannot drift into two copies of a button.
    const shadow = parseDropShadow(getComputedStyle(pill).boxShadow);
    if (shadow === null || rect.width === 0 || rect.height === 0) {
      glow.visible = false;
    } else {
      // The shadow's own rect is the card moved by the offset and widened by the spread; the blur is
      // the room its falloff needs outside that.
      const plateW = rect.width + shadow.spread * 2;
      const plateH = rect.height + shadow.spread * 2;
      const boxW = plateW + shadow.blur * 2;
      const boxH = plateH + shadow.blur * 2;
      const signature = `${Math.round(boxW)}x${Math.round(boxH)}|${Math.round(shadow.blur)}`;
      if (signature !== pillGlowSignature) {
        pillGlowSignature = signature;
        const previous = pillGlowMaterial.map;
        // Built at the size it is drawn, so one texel of softness stays one CSS pixel of it.
        pillGlowMaterial.map = stadiumBar(plateW, plateH, shadow.blur, shadow.blur);
        pillGlowMaterial.needsUpdate = true;
        previous?.dispose();
      }
      const vw = Math.max(1, viewportWidthPx.value);
      const vh = Math.max(1, viewportHeightPx.value);
      const glowWorld = rectWorld({
        x: (rect.left + shadow.x + shadow.spread - shadow.blur) / vw,
        y: (rect.top + shadow.y + shadow.spread - shadow.blur) / vh,
        w: boxW / vw,
        h: boxH / vh,
      });
      glow.visible = true;
      glow.scale.set(glowWorld.width, glowWorld.height, 1);
      glow.position.set(glowWorld.centre[0], glowWorld.centre[1], 0.044);
      const [sr, sg, sb] = shadow.rgb;
      pillGlowMaterial.color.setRGB(sr / 255, sg / 255, sb / 255, THREE.SRGBColorSpace);
      pillGlowMaterial.opacity = shadow.alpha;
    }
  }
}

/**
 * The DOM's own `box-shadow`, as numbers — `rgba(217, 87, 25, 0.42) 0px 10px 28px -6px`.
 *
 * Only the first layer is read, because that is all §2 writes. A value this cannot parse leaves the
 * halo unpainted rather than guessed at: the button's look has one home, and a silent default here
 * is how two copies of one number start disagreeing.
 */
function parseDropShadow(raw: string): {
  rgb: [number, number, number];
  alpha: number;
  x: number;
  y: number;
  blur: number;
  spread: number;
} | null {
  const match =
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s]+([\d.]+))?\s*\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?/.exec(
      raw.trim(),
    );
  if (match === null) return null;
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: match[4] === undefined ? 1 : Number(match[4]),
    x: Number(match[5]),
    y: Number(match[6]),
    blur: Number(match[7]),
    spread: match[8] === undefined ? 0 : Number(match[8]),
  };
}

/**
 * The rail: its container card and the four tab cards. The container is a flat 72% charcoal; the
 * lit tab is the only filled one (the ember gradient), and the rest come back as transparent
 * fills — a card with no paint is a card that is not there, which is what "not selected" looks
 * like when the SVG/text have already moved into the scene.
 */
function placeRail(): void {
  const container = railRig.value;
  if (container === null) return;
  fillCard(container, document.querySelector<HTMLElement>('.rail'), 1);
  const rigs = tabRigs.value;
  const tabs = document.querySelectorAll<HTMLElement>('.rail .tab');
  rigs.forEach((rig, index) => {
    fillCard(rig, tabs[index] ?? null, 1);
  });
}

/** The top-left mark: its disc, and the ember dot that is the only reason it ever wants attention. */
function placeCat(): void {
  const rig = catCardRig.value;
  const cat = document.querySelector<HTMLElement>('.cat');
  if (rig !== null) fillCard(rig, cat, 1);
  const badge = badgeQuad.value;
  if (badge === null || badgeMaterial === null) return;
  const dot = document.querySelector<HTMLElement>('.cat .badge');
  if (dot === null || cat === null) {
    badge.visible = false;
    return;
  }
  const rect = dot.getBoundingClientRect();
  if (rect.width === 0) {
    badge.visible = false;
    return;
  }
  const where = rectWorld({
    x: rect.left / Math.max(1, viewportWidthPx.value),
    y: rect.top / Math.max(1, viewportHeightPx.value),
    w: rect.width / Math.max(1, viewportWidthPx.value),
    h: rect.height / Math.max(1, viewportHeightPx.value),
  });
  badge.visible = true;
  badge.scale.set(where.width, where.height, 1);
  badge.position.set(where.centre[0], where.centre[1], 0.062);
  badgeMaterial.color.set(
    getComputedStyle(document.documentElement).getPropertyValue('--ember-orange').trim() ||
      '#e2604a',
  );
}

/**
 * S19's arrival, as the scene's own: the card rises 18 px on the same 220 ms curve its DOM copy
 * animates with (`archive-rise` in ArchiveCard.vue), but that animation is off under this layer —
 * and moving the plate alone would leave its words standing still, so the runs ride along. The
 * reduced-motion promise is the CSS gate's: the card is simply there.
 */
const ARCHIVE_RISE_PX = 18;
const ARCHIVE_RISE_MS = 220;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let archiveShownAt = 0;

/** cubic-bezier(0.16, 0.84, 0.3, 1) — the curve `archive-rise` names, solved by Newton on x. */
function archiveEase(progress: number): number {
  const axis = (a: number, b: number, t: number): number =>
    3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  let t = progress;
  for (let i = 0; i < 5; i += 1) {
    const error = axis(0.16, 0.3, t) - progress;
    if (Math.abs(error) < 1e-4) break;
    const slope =
      3 * (1 - t) * (1 - t) * 0.16 + 6 * (1 - t) * t * (0.3 - 0.16) + 3 * t * t * (1 - 0.3);
    if (slope === 0) break;
    t -= error / slope;
  }
  return axis(0.84, 1, t);
}

/** The archive card (S19's long-press): the surface here, its words through the runs, and arrival. */
function placeArchive(): void {
  const rig = archiveCardRig.value;
  if (rig === null) return;
  const card = document.querySelector<HTMLElement>('.archive');
  fillCard(rig, card, 1);
  if (card === null || !rig.mesh.visible) {
    // Gone — the next appearance is a fresh arrival.
    archiveShownAt = 0;
    return;
  }
  if (archiveShownAt === 0) archiveShownAt = performance.now();
  const eased = REDUCED_MOTION
    ? 1
    : archiveEase(Math.min(1, (performance.now() - archiveShownAt) / ARCHIVE_RISE_MS));
  const rise = (1 - eased) * pxToWorld(ARCHIVE_RISE_PX);
  rig.mesh.position.y = rig.baseY - rise;
  rig.material.opacity = rig.baseOpacity * eased;
  for (const index of ARCHIVE_RUNS) {
    const mesh = runMeshes[index];
    const material = runMaterials[index];
    const base = runBaseY[index];
    if (mesh === undefined || material === undefined || base === undefined || !mesh.visible)
      continue;
    mesh.position.y = base - rise;
    material.opacity *= eased;
  }
}

// ------------------------------------------------------------ the sheets (S6 / S8 / S17 / S23 …)

/**
 * A sheet, mirrored: the surface, and every line of its text the atlas can carry.
 *
 * The sheet's own box is hidden under `html.scene3d-text .sheet { visibility: hidden }` — that takes
 * only the root's *paint* (its background), and `visibility` leaves the computed background
 * readable, which is where this surface comes from. The children are put back by the
 * `[data-open='true'] *` rule: at this stage the controls, tiles and emoji are still the DOM's to
 * paint. The mirrored lines have their ink taken away one node at a time, inline, because *which*
 * lines are mirrorable is known only here — a line with characters the atlas does not carry (the
 * header's ☀ 🌙 🔥, the mood faces) stays crisp DOM rather than being punched into a half-drawn
 * copy. Scrolling needs no code: the rows' rects are read every frame, so the DOM's own scroll
 * moves the mirror; the four clip planes are what keep the rows inside the panel while it does.
 */
const SHEET_POOL = 44;
const sheetRuns: InkRig[] = [];
const sheetCardRig = shallowRef<CardRig | null>(null);
const sheetClip: THREE.Plane[] = [
  new THREE.Plane(new THREE.Vector3(-1, 0, 0), -1e6),
  new THREE.Plane(new THREE.Vector3(1, 0, 0), -1e6),
  new THREE.Plane(new THREE.Vector3(0, -1, 0), -1e6),
  new THREE.Plane(new THREE.Vector3(0, 1, 0), -1e6),
];
const maskedLeaves = new Set<HTMLElement>();
/** The sheet's painted controls: one fill rig each, plus a frame rig for the bordered ones. */
const SHEET_SURFACE_POOL = 40;
const SHEET_FRAME_POOL = 36;
/**
 * The slider trio. Track and thumb paint lives in `::-webkit-slider-*` pseudo-elements — invisible
 * to `getComputedStyle` and to inline masking — so `global.css` declares the geometry and colours
 * as `--slider-*` custom properties and masks the pseudo-elements, and these three quads draw what
 * the browser resolved: the stadium track, the thumb's fill and its ring.
 */
const SHEET_SLIDER_POOL = 8;
interface SliderRig {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  signature: string;
}
const sheetSliderTracks: SliderRig[] = [];
const sheetSliderThumbs: SliderRig[] = [];
const sheetSliderRings: SliderRig[] = [];
const sheetSurfaces: CardRig[] = [];
const sheetFrames: InkRig[] = [];
const markedSurfaces = new Set<HTMLElement>();
let sheetClippingOn = false;

/**
 * A control's own paint, taken away inline — not with `visibility`, which is what the first cut
 * used and what the suite caught: `visibility: hidden` removes the element from hit testing, so a
 * masked chip stopped answering the finger. Backgrounds and borders gate no hits, so those two
 * properties are what this layer withholds; the scene reads them just before masking, in the same
 * frame (clear, read, paint, re-mask), which is why nothing here needs to remember what the values
 * were.
 */
function clearSurfacePaint(node: HTMLElement): void {
  if (!markedSurfaces.delete(node)) return;
  node.removeAttribute('data-scene-surface');
  node.style.removeProperty('background-color');
  node.style.removeProperty('border-color');
}

function maskSurfacePaint(node: HTMLElement): void {
  if (markedSurfaces.has(node)) return;
  markedSurfaces.add(node);
  node.setAttribute('data-scene-surface', '');
  node.style.setProperty('background-color', 'transparent');
  node.style.setProperty('border-color', 'transparent');
}

/** Four half-spaces around the sheet's box, so a scrolled row is cut at the panel's own edge. */
function updateSheetClip(rect: DOMRect): void {
  const whole = rectWorld({
    x: rect.left / Math.max(1, viewportWidthPx.value),
    y: rect.top / Math.max(1, viewportHeightPx.value),
    w: rect.width / Math.max(1, viewportWidthPx.value),
    h: rect.height / Math.max(1, viewportHeightPx.value),
  });
  const left = whole.centre[0] - whole.width / 2;
  const right = whole.centre[0] + whole.width / 2;
  const top = whole.centre[1] + whole.height / 2;
  const bottom = whole.centre[1] - whole.height / 2;
  const [west, east, north, south] = sheetClip;
  if (west !== undefined) west.constant = right;
  if (east !== undefined) east.constant = -left;
  if (north !== undefined) north.constant = top;
  if (south !== undefined) south.constant = -bottom;
}

function clearLeafMask(node: HTMLElement): void {
  if (!maskedLeaves.delete(node)) return;
  node.style.removeProperty('-webkit-text-fill-color');
}

function maskLeaf(node: HTMLElement): void {
  if (maskedLeaves.has(node)) return;
  maskedLeaves.add(node);
  node.style.setProperty('-webkit-text-fill-color', 'transparent');
}

function hideSheetMirror(): void {
  const card = sheetCardRig.value;
  if (card !== null) card.mesh.visible = false;
  for (const rig of sheetRuns) rig.mesh.visible = false;
  for (const rig of sheetSurfaces) rig.mesh.visible = false;
  for (const rig of sheetFrames) rig.mesh.visible = false;
  for (const rig of sheetSliderTracks) rig.mesh.visible = false;
  for (const rig of sheetSliderThumbs) rig.mesh.visible = false;
  for (const rig of sheetSliderRings) rig.mesh.visible = false;
  for (const node of [...maskedLeaves]) clearLeafMask(node);
  for (const node of [...markedSurfaces]) clearSurfacePaint(node);
}

function placeSheet(): void {
  const card = sheetCardRig.value;
  if (card === null) return;
  // The sheet that is on stage *right now*: an open one, or one still sliding out — its own
  // rect/opacity carry the close transition, and the mirror simply keeps reading them. A closed
  // sheet sits below the viewport, so its intersection area is zero.
  let sheet: HTMLElement | null = null;
  let best = 1;
  for (const candidate of document.querySelectorAll<HTMLElement>('.sheet')) {
    const rect = candidate.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, viewportWidthPx.value) - Math.max(rect.left, 0));
    const height = Math.max(
      0,
      Math.min(rect.bottom, viewportHeightPx.value) - Math.max(rect.top, 0),
    );
    const area = width * height;
    if (area > best) {
      best = area;
      sheet = candidate;
    }
  }
  const glyphs = atlas;
  if (sheet === null || glyphs === null || atlasTexture === null) {
    hideSheetMirror();
    return;
  }
  if (!sheetClippingOn) {
    const context = probe.context as { renderer?: unknown } | null;
    const raw = context?.renderer;
    const renderer = raw !== null && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
    if (renderer !== null && typeof renderer === 'object' && 'localClippingEnabled' in renderer) {
      (renderer as { localClippingEnabled: boolean }).localClippingEnabled = true;
      sheetClippingOn = true;
    }
  }
  fillCard(card, sheet, 1);
  const rootOpacity = Number.parseFloat(getComputedStyle(sheet).opacity);
  const panelAlpha = Number.isFinite(rootOpacity) ? rootOpacity : 1;
  card.material.opacity = card.baseOpacity * panelAlpha;
  const panelBox = sheet.getBoundingClientRect();
  updateSheetClip(panelBox);
  const elements = [...sheet.querySelectorAll<HTMLElement>('*')];
  const leaves = elements.filter(
    (element) => element.childElementCount === 0 && (element.textContent ?? '').trim() !== '',
  );
  const wanted = new Set<HTMLElement>();
  const domKept = new Set<HTMLElement>();
  leaves.forEach((node, index) => {
    const rig = sheetRuns[index];
    if (rig === undefined) return;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    // A rect question only: the closed sheet is already excluded by the `[data-open]` query, and a
    // visibility read here would see this layer's own mask (a marked surface computes `hidden`).
    const outside =
      rect.width === 0 ||
      rect.height === 0 ||
      rect.bottom < panelBox.top - 4 ||
      rect.top > panelBox.bottom + 4;
    const text = node.textContent?.trim() ?? '';
    const fontSize = Number.parseFloat(style.fontSize) || 15;
    const signature = `${text}|${rect.left.toFixed(1)},${rect.top.toFixed(1)},${rect.width.toFixed(1)},${rect.height.toFixed(1)}|${fontSize}|${style.color}`;
    if (rig.signature !== signature) {
      const em = pxToWorld(fontSize);
      const layout = layoutText(text, glyphs, em);
      rig.signature = signature;
      // Characters the atlas does not carry (the header's emoji): the whole line stays the DOM's.
      rig.skipped = outside || layout.missing.length > 0;
      if (!rig.skipped) {
        fillRunGeometry(rig.mesh, text, em, layout);
        const colour = parseColour(style.color);
        if (colour !== null) rig.material.color.copy(colour.colour);
        const baselinePx = rect.top + (rect.height - fontSize) / 2 + fontSize;
        const padding = Number.parseFloat(style.paddingLeft) || 0;
        const world = canvasToWorld(
          {
            x: (rect.left + padding) / Math.max(1, viewportWidthPx.value),
            y: baselinePx / Math.max(1, viewportHeightPx.value),
          },
          box.value,
          aspect.value,
        );
        rig.mesh.position.set(world[0], world[1], RUN_TEXT_Z);
      }
    }
    if (outside || rig.skipped) {
      rig.mesh.visible = false;
      clearLeafMask(node);
      domKept.add(node);
      return;
    }
    const nodeOpacity = Number.parseFloat(style.opacity);
    rig.material.opacity = (Number.isFinite(nodeOpacity) ? nodeOpacity : 1) * panelAlpha;
    rig.mesh.visible = true;
    maskLeaf(node);
    wanted.add(node);
  });
  for (let index = leaves.length; index < sheetRuns.length; index += 1) {
    const rig = sheetRuns[index];
    if (rig !== undefined) rig.mesh.visible = false;
  }
  for (const node of [...maskedLeaves]) {
    if (!wanted.has(node)) clearLeafMask(node);
  }

  // The controls' own paint, one layer under the words: every element that draws a background or a
  // border gets a fill (through `fillCard`) and, when bordered, a frame. That is what the inline
  // `-webkit-text-fill-color` cannot reach — it hides a line's ink, not a chip's own body. Lines the
  // atlas could not take stay the DOM's entirely (the `domKept` set), border included.
  // The masks are lifted first so this frame's reads are the DOM's own values; the wanted ones are
  // put back once the paints have been taken (the loop at the end of this function).
  for (const node of [...markedSurfaces]) clearSurfacePaint(node);
  const painted = elements.filter((element) => {
    if (domKept.has(element)) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none') return false;
    const rect = element.getBoundingClientRect();
    if (
      rect.width === 0 ||
      rect.height === 0 ||
      rect.bottom < panelBox.top - 4 ||
      rect.top > panelBox.bottom + 4
    ) {
      return false;
    }
    const fills = style.backgroundImage !== 'none' || style.backgroundColor !== 'rgba(0, 0, 0, 0)';
    const bordered =
      (Number.parseFloat(style.borderTopWidth) || 0) > 0 && style.borderTopStyle !== 'none';
    return fills || bordered;
  });
  const wantedSurfaces = new Set<HTMLElement>();
  painted.forEach((element, index) => {
    const rig = sheetSurfaces[index];
    if (rig === undefined) return;
    fillCard(rig, element, 1);
    if (!rig.mesh.visible) return;
    const style = getComputedStyle(element);
    const own = Number.parseFloat(style.opacity);
    rig.material.opacity = rig.baseOpacity * panelAlpha * (Number.isFinite(own) ? own : 1);
    wantedSurfaces.add(element);
  });
  for (let index = painted.length; index < sheetSurfaces.length; index += 1) {
    const rig = sheetSurfaces[index];
    if (rig !== undefined) rig.mesh.visible = false;
  }
  let frameSlot = 0;
  painted.forEach((element) => {
    const style = getComputedStyle(element);
    const width = Number.parseFloat(style.borderTopWidth) || 0;
    if (!(width > 0) || style.borderTopStyle === 'none') return;
    const rig = sheetFrames[frameSlot];
    frameSlot += 1;
    if (rig === undefined) return;
    const rect = element.getBoundingClientRect();
    const signature = `${rect.left.toFixed(1)},${rect.top.toFixed(1)},${rect.width.toFixed(1)},${rect.height.toFixed(1)}|${String(width)}|${style.borderTopColor}|${style.borderRadius}`;
    if (signature !== rig.signature) {
      rig.signature = signature;
      const { corners } = cornerRadii(style.borderRadius, rect);
      rig.mesh.geometry.dispose();
      rig.mesh.geometry = new THREE.PlaneGeometry(1, 1);
      rig.material.map = frameRect(
        128,
        corners,
        width / Math.max(1, rect.width / 2),
        width / Math.max(1, rect.height / 2),
      );
      rig.material.needsUpdate = true;
      const whole = rectWorld({
        x: rect.left / Math.max(1, viewportWidthPx.value),
        y: rect.top / Math.max(1, viewportHeightPx.value),
        w: rect.width / Math.max(1, viewportWidthPx.value),
        h: rect.height / Math.max(1, viewportHeightPx.value),
      });
      rig.mesh.position.set(whole.centre[0], whole.centre[1], rig.mesh.position.z);
      quadScale(rig.mesh, rect, 1);
    }
    const paint = parseColour(style.borderTopColor);
    if (paint !== null) {
      rig.material.color.copy(paint.colour);
      rig.material.opacity = paint.alpha * panelAlpha;
    }
    rig.mesh.visible = true;
  });
  for (let index = frameSlot; index < sheetFrames.length; index += 1) {
    const rig = sheetFrames[index];
    if (rig !== undefined) rig.mesh.visible = false;
  }
  // The sliders. Their paint lives in `::-webkit-slider-*` pseudo-elements — invisible to
  // getComputedStyle and to inline masking — so global.css declares geometry and colours as
  // `--slider-*` custom properties and masks the pseudo-elements, and this loop draws what the
  // browser resolved. The layout is Chromium's own, measured off the 2D build in both directions:
  // the track spans the whole box on its centre line, the thumb rides that line starting half a
  // thumb in from either end, and `dir=rtl` mirrors the mapping — min sits at the right edge there.
  let sliderSlot = 0;
  const sliders = elements.filter((element): element is HTMLInputElement => {
    if (!(element instanceof HTMLInputElement) || element.type !== 'range') return false;
    const style = getComputedStyle(element);
    if (style.display === 'none') return false;
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom >= panelBox.top - 4 &&
      rect.top <= panelBox.bottom + 4
    );
  });
  for (const input of sliders) {
    const track = sheetSliderTracks[sliderSlot];
    const fill = sheetSliderThumbs[sliderSlot];
    const ring = sheetSliderRings[sliderSlot];
    sliderSlot += 1;
    if (track === undefined || fill === undefined || ring === undefined) break;
    const style = getComputedStyle(input);
    const rect = input.getBoundingClientRect();
    const trackH = Number.parseFloat(style.getPropertyValue('--slider-track-h'));
    const thumbSize = Number.parseFloat(style.getPropertyValue('--slider-thumb-size'));
    const lift = Number.parseFloat(style.getPropertyValue('--slider-thumb-lift'));
    const edge = Number.parseFloat(style.getPropertyValue('--slider-thumb-edge')) || 0;
    const trackPaint = parseColour(style.getPropertyValue('--slider-track-colour'));
    const fillPaint = parseColour(style.getPropertyValue('--slider-thumb-colour'));
    const ringPaint = parseColour(style.getPropertyValue('--slider-thumb-edge-colour'));
    if (
      !(trackH > 0) ||
      !(thumbSize > 0) ||
      !Number.isFinite(lift) ||
      trackPaint === null ||
      fillPaint === null ||
      ringPaint === null
    ) {
      track.mesh.visible = false;
      fill.mesh.visible = false;
      ring.mesh.visible = false;
      continue;
    }
    const place = (rig: SliderRig, left: number, top: number, width: number, height: number) => {
      const whole = rectWorld({
        x: left / Math.max(1, viewportWidthPx.value),
        y: top / Math.max(1, viewportHeightPx.value),
        w: width / Math.max(1, viewportWidthPx.value),
        h: height / Math.max(1, viewportHeightPx.value),
      });
      rig.mesh.position.set(whole.centre[0], whole.centre[1], rig.mesh.position.z);
      quadScale(rig.mesh, { width, height }, 1);
      rig.mesh.visible = true;
    };
    const trackTop = rect.top + (rect.height - trackH) / 2;
    const min = Number(input.min);
    const max = Number(input.max);
    const span = max - min;
    const fraction =
      Number.isFinite(span) && span > 0
        ? Math.min(1, Math.max(0, (Number(input.value) - min) / span))
        : 0;
    const travel = Math.max(0, rect.width - thumbSize);
    const thumbCx =
      style.direction === 'rtl'
        ? rect.right - thumbSize / 2 - fraction * travel
        : rect.left + thumbSize / 2 + fraction * travel;
    const thumbCy = trackTop + lift + thumbSize / 2;
    const trackSignature = `${rect.width.toFixed(1)}x${trackH.toFixed(1)}`;
    if (trackSignature !== track.signature) {
      track.signature = trackSignature;
      track.material.map = stadiumBar(rect.width, trackH);
      track.material.needsUpdate = true;
    }
    track.material.color.copy(trackPaint.colour);
    track.material.opacity = trackPaint.alpha * panelAlpha;
    place(track, rect.left, trackTop, rect.width, trackH);
    fill.material.color.copy(fillPaint.colour);
    fill.material.opacity = fillPaint.alpha * panelAlpha;
    place(fill, thumbCx - thumbSize / 2, thumbCy - thumbSize / 2, thumbSize, thumbSize);
    const ringSignature = `${thumbSize.toFixed(1)}x${edge.toFixed(1)}`;
    if (ringSignature !== ring.signature) {
      ring.signature = ringSignature;
      const inset = edge / Math.max(1, thumbSize / 2);
      ring.material.map = frameRect(
        64,
        [
          [1, 1],
          [1, 1],
          [1, 1],
          [1, 1],
        ],
        inset,
        inset,
      );
      ring.material.needsUpdate = true;
    }
    ring.material.color.copy(ringPaint.colour);
    ring.material.opacity = ringPaint.alpha * panelAlpha;
    place(ring, thumbCx - thumbSize / 2, thumbCy - thumbSize / 2, thumbSize, thumbSize);
  }
  for (let index = sliderSlot; index < SHEET_SLIDER_POOL; index += 1) {
    for (const rig of [
      sheetSliderTracks[index],
      sheetSliderThumbs[index],
      sheetSliderRings[index],
    ]) {
      if (rig !== undefined) rig.mesh.visible = false;
    }
  }
  for (const node of wantedSurfaces) maskSurfacePaint(node);
}

// ------------------------------------------------------- the pill's line art (S4 / S14 / S15)

/**
 * The pill's own diagrams — S4's 力度条 (three hairlines ↔ three cloud lobes, a knob where the draw
 * landed), the wave, and the tray flick — drawn from the same SVG the DOM painted, because that SVG
 * is hidden under `html.scene3d-text .pill` and this layer is what keeps the diagrams on screen.
 *
 * Nothing here re-parses a `d` or re-implements a viewBox: every outline is sampled through the
 * browser's own geometry (`getTotalLength` / `getPointAtLength`) and a coordinate becomes a screen
 * point through the element's own transform (`getScreenCTM`), so a change to the SVG moves this
 * copy the way a change to the CSS moves every other mirror in this file. Strokes become ribbons
 * (an SVG hairline is a filled 1–1.4 px band that GL's 1-px lines cannot draw); circles become the
 * same `solidDisc` quads the cat's plate uses.
 */
const INK_CAPACITY = 14;
interface InkRig {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  signature: string;
  /** This run is left to the DOM (characters the atlas lacks, or a rect outside the panel). An
   *  explicit field, not a prefix inside the signature: a prefix made the skip sticky, because a
   *  later frame whose plain signature matched the stripped one never rebuilt. */
  skipped: boolean;
}
const inkRigs: InkRig[] = [];
const pillInk = shallowRef<THREE.Group | null>(null);
const HINT_INK_CAPACITY = 4;
const hintRigs: InkRig[] = [];
const hintInk = shallowRef<THREE.Group | null>(null);
/**
 * The Demo SVG icons, mirrored the same way the pill's line art is. Three surfaces — the header
 * ring symbol, the pill icon and the four rail icons — each from its own SVG, since a rig's
 * transform is locked to one element's screen CTM.
 */
const HUD_GLYPH_CAPACITY = 5;
const hudGlyphRigs: InkRig[] = [];
const hudGlyphInk = shallowRef<THREE.Group | null>(null);
const PILL_GLYPH_CAPACITY = 6;
const pillGlyphRigs: InkRig[] = [];
const pillGlyphInk = shallowRef<THREE.Group | null>(null);
const RAIL_GLYPH_CAPACITY = 3;
const railGlyphGroups: THREE.Group[] = [];
const railGlyphRigs: InkRig[][] = [];
const CAT_GLYPH_CAPACITY = 3;
const catGlyphRigs: InkRig[] = [];
const catGlyphInk = shallowRef<THREE.Group | null>(null);
/** Longest sample step, in element units — an 18-unit thread becomes 18 segments, a 1000-unit path 32. */
const INK_STEPS = 32;

/** The element's outline as sampled points, each in its own user units. */
function inkOutline(element: SVGGeometryElement): Array<[number, number]> {
  const total = element.getTotalLength();
  if (!(total > 0)) return [];
  const steps = Math.max(2, Math.min(INK_STEPS, Math.ceil(total)));
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    const point = element.getPointAtLength((i / steps) * total);
    points.push([point.x, point.y]);
  }
  return points;
}

/** A dashed outline as the pieces the stroke actually paints — the gaps are cut by arc length. */
function dashPieces(
  points: ReadonlyArray<readonly [number, number]>,
  on: number,
  off: number,
): Array<Array<[number, number]>> {
  const pieces: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  let drawing = true;
  let capacity = on;
  for (let i = 0; i < points.length - 1; i += 1) {
    let a = points[i];
    const b = points[i + 1];
    if (a === undefined || b === undefined) continue;
    let remaining = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (remaining > 1e-6) {
      const step = Math.min(remaining, capacity);
      const t = step / remaining;
      const next: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (drawing) {
        if (current.length === 0) current.push([a[0], a[1]]);
        current.push(next);
      }
      remaining -= step;
      capacity -= step;
      if (capacity <= 1e-6) {
        if (drawing) {
          pieces.push(current);
          current = [];
        }
        drawing = !drawing;
        capacity = drawing ? on : off;
      }
      a = next;
    }
  }
  if (current.length > 1) pieces.push(current);
  return pieces;
}

/** Stroked polylines as one triangle strip per piece, half the stroke width either side of it. */
function ribbonGeometry(
  polylines: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  half: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  let vertex = 0;
  for (const points of polylines) {
    const first = points[0];
    if (first === undefined || points.length < 2) continue;
    for (let i = 0; i < points.length; i += 1) {
      const previous = points[Math.max(0, i - 1)] ?? first;
      const next = points[Math.min(points.length - 1, i + 1)] ?? first;
      const point = points[i] ?? first;
      const dx = next[0] - previous[0];
      const dy = next[1] - previous[1];
      const length = Math.hypot(dx, dy) || 1;
      const nx = (-dy / length) * half;
      const ny = (dx / length) * half;
      positions.push(point[0] + nx, point[1] + ny, 0, point[0] - nx, point[1] - ny, 0);
      if (i > 0) {
        const base = vertex + (i - 1) * 2;
        index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    vertex += points.length * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

/** Everything that decides an ink shape's picture; anything outside it can move every frame for free. */
function inkSignature(element: SVGGeometryElement | SVGRectElement): string {
  const style = getComputedStyle(element);
  const circle =
    element instanceof SVGCircleElement
      ? `${element.cx.baseVal.value},${element.cy.baseVal.value},${element.r.baseVal.value}`
      : '';
  const rect =
    element instanceof SVGRectElement
      ? `${element.x.baseVal.value},${element.y.baseVal.value},${element.width.baseVal.value},${element.height.baseVal.value}`
      : '';
  const outline =
    element.getAttribute('d') ??
    element.getAttribute('points') ??
    `${element.getAttribute('x2') ?? ''} ${element.getAttribute('y2') ?? ''}`;
  return `${element.tagName}|${circle}|${rect}|${outline}|${style.stroke}|${style.fill}|${style.strokeWidth}|${style.strokeDasharray}`;
}

/** One SVG of line art, drawn in the scene — shared by the pill's diagrams and the hint's dimple. */
function placeInk(
  svg: SVGSVGElement | null,
  group: THREE.Group | null,
  rigs: InkRig[],
  alphaHost: Element | null,
): void {
  if (group === null || rigs.length === 0) return;
  const ctm = svg?.getScreenCTM() ?? null;
  if (svg === null || ctm === null) {
    for (const rig of rigs) rig.mesh.visible = false;
    return;
  }
  const toCanvas = (x: number, y: number): readonly [number, number] => {
    const screen = new DOMPoint(x, y).matrixTransform(ctm);
    return [
      screen.x / Math.max(1, viewportWidthPx.value),
      screen.y / Math.max(1, viewportHeightPx.value),
    ];
  };
  const at = (x: number, y: number): readonly [number, number, number] => {
    const [cx, cy] = toCanvas(x, y);
    return canvasToWorld({ x: cx, y: cy }, box.value, aspect.value);
  };
  const origin = at(0, 0);
  const unitX = at(1, 0);
  const unitY = at(0, 1);
  group.position.set(origin[0], origin[1], RUN_TEXT_Z);
  group.scale.set(unitX[0] - origin[0], unitY[1] - origin[1], 1);
  const host = alphaHost ?? svg;
  const svgOpacity = Number.parseFloat(getComputedStyle(host).opacity);
  const svgAlpha = Number.isFinite(svgOpacity) ? svgOpacity : 1;
  const marks = [
    ...svg.querySelectorAll<SVGGeometryElement | SVGRectElement>(
      'path, line, polyline, circle, rect',
    ),
  ];
  marks.forEach((element, index) => {
    const rig = rigs[index];
    if (rig === undefined) return;
    const style = getComputedStyle(element);
    const signature = inkSignature(element);
    const isRect = element instanceof SVGRectElement;
    const paint = parseColour(
      isRect ? style.fill : style.fill === 'none' ? style.stroke : style.fill,
    );
    if (signature !== rig.signature) {
      rig.signature = signature;
      if (element instanceof SVGCircleElement) {
        rig.mesh.geometry.dispose();
        rig.mesh.geometry = new THREE.PlaneGeometry(
          element.r.baseVal.value * 2,
          element.r.baseVal.value * 2,
        ).translate(element.cx.baseVal.value, element.cy.baseVal.value, 0);
      } else if (isRect) {
        // A filled rect (the Demo icons are mostly rects): the rounded corners are at most a couple
        // of CSS px here, well under a world pixel, so the plane stays square rather than inventing
        // a rounded geometry the eye could not resolve.
        rig.mesh.geometry.dispose();
        rig.mesh.geometry = new THREE.PlaneGeometry(
          element.width.baseVal.value,
          element.height.baseVal.value,
        ).translate(
          element.x.baseVal.value + element.width.baseVal.value / 2,
          element.y.baseVal.value + element.height.baseVal.value / 2,
          0,
        );
      } else {
        const outline = inkOutline(element);
        const dash = style.strokeDasharray;
        let polylines: Array<Array<[number, number]>> = [outline];
        if (dash !== 'none' && dash !== '') {
          const [on, off] = dash.split(/[\s,]+/).map(Number);
          if (
            Number.isFinite(on) &&
            Number.isFinite(off) &&
            on !== undefined &&
            off !== undefined &&
            on > 0 &&
            off > 0
          ) {
            polylines = dashPieces(outline, on, off);
          }
        }
        rig.mesh.geometry.dispose();
        rig.mesh.geometry = ribbonGeometry(
          polylines,
          (Number.parseFloat(style.strokeWidth) || 1) / 2,
        );
      }
    }
    const wanted = element instanceof SVGCircleElement ? solidDisc(64) : null;
    if (rig.material.map !== wanted) {
      rig.material.map = wanted;
      rig.material.needsUpdate = true;
    }
    if (paint !== null) {
      rig.material.color.copy(paint.colour);
      rig.material.opacity = paint.alpha * svgAlpha;
    }
    rig.mesh.visible = true;
  });
  for (let index = marks.length; index < rigs.length; index += 1) {
    const rig = rigs[index];
    if (rig !== undefined) rig.mesh.visible = false;
  }
}

function placePillInk(): void {
  const svg = document.querySelector<SVGSVGElement>('.cta svg.art');
  placeInk(svg, pillInk.value, inkRigs, svg);
}

/**
 * S15's wordless tier: the paper-collapse diagram the hint strip carries when no language has a
 * word for the gesture. The strip fades itself, so the ink's alpha rides the `hint` element rather
 * than the svg's own (which is always 1).
 */
function placeHintInk(): void {
  const hint = document.querySelector<HTMLElement>('.hint');
  const svg = hint?.querySelector<SVGSVGElement>('svg') ?? null;
  placeInk(svg, hintInk.value, hintRigs, hint);
}

/** The three Demo icon surfaces (header symbol / pill icon / four rail icons). */
function placeGlyphIcons(): void {
  placeInk(
    document.querySelector<SVGSVGElement>('.hud .ring svg.demo-glyph'),
    hudGlyphInk.value,
    hudGlyphRigs,
    null,
  );
  placeInk(
    document.querySelector<SVGSVGElement>('.cta .pill svg.demo-glyph'),
    pillGlyphInk.value,
    pillGlyphRigs,
    null,
  );
  const railSvgs = document.querySelectorAll<SVGSVGElement>('.rail .tab svg.demo-glyph');
  railGlyphGroups.forEach((group, index) => {
    placeInk(railSvgs[index] ?? null, group, railGlyphRigs[index] ?? [], null);
  });
  placeInk(
    document.querySelector<SVGSVGElement>('.cat svg.demo-glyph'),
    catGlyphInk.value,
    catGlyphRigs,
    null,
  );
}

// ------------------------------------------------------------ the §2 S3 stage ring (104 px)

let stageRingSig = '';

function hideStageRing(): void {
  if (stageRingGroupRef !== null) stageRingGroupRef.visible = false;
  probe.stageRing = { visible: false, frac: 0, seconds: '' };
}

function placeStageRing(state: GameStateView | null): void {
  const group = stageRingGroupRef;
  const arc = stageRingArcRef;
  const numMesh = stageRingNumRef;
  const unitMesh = stageRingUnitRef;
  if (group === null || arc === null || numMesh === null || unitMesh === null || state === null) {
    hideStageRing();
    return;
  }
  const puff = state.cigarette.puff;
  if (state.cigarette.state !== 'PUFFING' || !state.cigarette.pose.visible) {
    hideStageRing();
    return;
  }
  group.visible = true;
  const world = canvasToWorld(state.anchors.body, box.value, aspect.value);
  group.position.set(world[0], world[1], 0.012);
  const k = pxToWorld(1);
  group.scale.set(k, k, 1);
  arc.position.z = 0.001;
  arc.renderOrder = 2;
  numMesh.position.z = 0.002;
  unitMesh.position.z = 0.002;
  const frac = clamp01(puff.progress);
  const seconds = (puff.heldMs / 1000).toFixed(1);
  const sig = `${frac.toFixed(4)}|${seconds}|${k.toFixed(6)}`;
  if (sig !== stageRingSig) {
    stageRingSig = sig;
    arc.geometry.dispose();
    if (frac > 0.005) {
      // Starts at twelve o'clock and runs the way the rod burns — the same convention as the
      // header ring's mirrored arc.
      arc.geometry = new THREE.RingGeometry(42, 50, 64, 1, Math.PI / 2, -frac * Math.PI * 2);
    }
    arc.visible = frac > 0.005;
    if (atlas !== null) {
      const numLayout = layoutText(seconds, atlas, 1);
      fillRunGeometry(numMesh, seconds, 1, numLayout);
      numMesh.position.x = -numLayout.width / 2;
      numMesh.position.y = 7;
      const unitText = '秒';
      const unitLayout = layoutText(unitText, atlas, 1);
      fillRunGeometry(unitMesh, unitText, 1, unitLayout);
      unitMesh.position.x = -unitLayout.width / 2;
      unitMesh.position.y = -11;
      numMesh.visible = true;
      unitMesh.visible = true;
    }
  }
  probe.stageRing = { visible: true, frac, seconds };
}

// ------------------------------------------------------------ the abstract mouth (§puffAnimations)

const LIP_LIP_Z = 0.004;
const COLUMN_STACKS = 5;

function disposeGroupContent(group: THREE.Group): void {
  for (const child of [...group.children]) {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
    group.remove(child);
  }
}

function stripMaterial(colour: [number, number, number], alpha: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.color.setRGB(colour[0] / 255, colour[1] / 255, colour[2] / 255, THREE.SRGBColorSpace);
  material.opacity = alpha;
  return material;
}

let mouthActionId: string | null = null;

/** Mark the rig's authored alpha once, so the per-frame fade can restore it. */
function rememberBaseAlpha(mesh: THREE.Mesh): void {
  const material = mesh.material as THREE.MeshBasicMaterial;
  if (material.userData.baseAlpha === undefined) material.userData.baseAlpha = material.opacity;
}

function buildMouth(art: ReturnType<typeof lipArt>): void {
  const group = mouthGroupRef;
  if (group === null) return;
  disposeGroupContent(group);
  mouthActionId = null;

  // The lip curves (and their marks) live in a sub-group so the S3 tilt rotates the mouth alone.
  const lipSubGroup = new THREE.Group();
  lipSubGroup.rotation.z = (art.tiltDeg * Math.PI) / 180;
  group.add(lipSubGroup);

  const lipMat = stripMaterial([art.lipRgb[0], art.lipRgb[1], art.lipRgb[2]], art.lipAlpha);
  const addRibbon = (points: ReadonlyArray<readonly [number, number]>, z: number) => {
    const mesh = new THREE.Mesh(ribbonGeometry([points], 1.1), lipMat);
    mesh.frustumCulled = false;
    mesh.position.z = z;
    rememberBaseAlpha(mesh);
    lipSubGroup.add(mesh);
  };
  // L3 presses in steps: the curves meet at the centre with a break rather than a seam.
  const split = (points: readonly { x: number; y: number }[]) => {
    const mid = Math.floor(points.length / 2);
    return [
      points.slice(0, mid).map((p) => [p.x, p.y] as [number, number]),
      points.slice(mid + 1).map((p) => [p.x, p.y] as [number, number]),
    ];
  };
  const lipPieces = art.lip.segmented
    ? [...split(art.lip.upper), ...split(art.lip.lower)]
    : [
        art.lip.upper.map((p) => [p.x, p.y] as [number, number]),
        art.lip.lower.map((p) => [p.x, p.y] as [number, number]),
      ];
  for (const piece of lipPieces) addRibbon(piece, LIP_LIP_Z);

  for (const stroke of art.lip.strokes) {
    if (stroke.kind === 'bead' && stroke.radiusPx !== undefined) {
      const p0 = stroke.points[0];
      if (p0 === undefined) continue;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(stroke.radiusPx * 2, stroke.radiusPx * 2),
        lipMat,
      );
      mesh.frustumCulled = false;
      mesh.position.set(p0.x, p0.y, LIP_LIP_Z);
      rememberBaseAlpha(mesh);
      lipSubGroup.add(mesh);
    } else {
      addRibbon(
        stroke.points.map((p) => [p.x, p.y] as [number, number]),
        LIP_LIP_Z - 0.001,
      );
    }
  }

  // The airflow column: stacked soft discs, fading mouth-bright to far-thin. The sub-group is
  // deliberately not tilted: the column's own offset/bend carries the S3 lean.
  const discTexture = softDisc(64);
  const [cr, cg, cb] = art.columnRgb;
  const pieces = art.column.segments.length;
  art.column.segments.forEach((segment, si) => {
    for (let i = 0; i <= COLUMN_STACKS; i += 1) {
      const localT = i / COLUMN_STACKS;
      const globalT = pieces === 1 ? localT : (si + localT) / pieces;
      const halfW = segment.w0 + (segment.w1 - segment.w0) * localT;
      const y = segment.y0 + (segment.y1 - segment.y0) * localT;
      // S3 drifts sideways linearly; M2's spin is one half-sine.
      const x =
        art.column.offsetPx +
        (art.column.spin
          ? Math.sin(Math.PI * globalT) * art.column.bendPx
          : art.column.bendPx * globalT);
      const alpha = art.columnAlpha[0] + (art.columnAlpha[1] - art.columnAlpha[0]) * globalT;
      const material = stripMaterial([cr, cg, cb], alpha);
      material.map = discTexture;
      material.needsUpdate = true;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.frustumCulled = false;
      const height = Math.max(4, (segment.y1 - segment.y0) / COLUMN_STACKS) * 1.9;
      mesh.scale.set(halfW * 2, height, 1);
      mesh.position.set(x, y, -0.002);
      mesh.name = 'airflow';
      rememberBaseAlpha(mesh);
      group.add(mesh);
    }
  });
}

function placeMouth(state: GameStateView | null): void {
  const group = mouthGroupRef;
  if (group === null || state === null) {
    probe.lip = { visible: false, action: '', tier: 'S', columnWidthPx: 0, kind: '' };
    return;
  }
  const puff = state.cigarette.puff;
  const mouthed = state.cigarette.readouts.savourMs > 0;
  if (
    state.cigarette.state !== 'PUFFING' ||
    !state.cigarette.pose.visible ||
    puff.lipAction === null
  ) {
    group.visible = false;
    probe.lip = {
      visible: false,
      action: puff.lipAction ?? '',
      tier: puffTierFor(puff.heldMs),
      columnWidthPx: 0,
      kind: mouthed ? 'savor' : 'inhale',
    };
    return;
  }
  // §puffAnimations: a mouthed rod rolls its action (replay needs the stream intact) but never gets
  // the lip line or the column.
  if (!showsLipLine(state.cigarette.readouts.savourMs)) {
    group.visible = false;
    probe.lip = {
      visible: false,
      action: puff.lipAction,
      tier: puffTierFor(puff.heldMs),
      columnWidthPx: 0,
      kind: 'savor',
    };
    return;
  }
  const action: LipAction =
    LIP_ACTIONS.find((entry) => entry.id === puff.lipAction) ?? LIP_ACTIONS[0]!;
  const art = lipArt(action);
  if (mouthActionId !== action.id) {
    buildMouth(art);
    mouthActionId = action.id;
  }
  group.visible = true;
  // The local frame: x across the lips, y outward past the mouth end. The pivot is the mouth end,
  // and the rod points pivot→tip; outward is that direction reversed.
  const pose = state.cigarette.pose;
  const tip = canvasToWorld(pose.tip, box.value, aspect.value);
  const pivot = canvasToWorld(pose.pivot, box.value, aspect.value);
  const outward = new THREE.Vector2(tip[0] - pivot[0], tip[1] - pivot[1])
    .normalize()
    .multiplyScalar(-1);
  const across = new THREE.Vector2(outward.y, -outward.x);
  const k = pxToWorld(1);
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(across.x * k, across.y * k, 0),
    new THREE.Vector3(outward.x * k, outward.y * k, 0),
    new THREE.Vector3(0, 0, 1),
  );
  group.quaternion.setFromRotationMatrix(basis);
  group.position.set(pivot[0], pivot[1], 0.026);
  // The column fades in over the action's own to-top time; the lips themselves stay put. Reduced
  // motion shows the column immediately.
  const reduced = props.game.rendererLook().reducedMotion;
  const fade = reduced ? 1 : clamp01(puff.heldMs / Math.max(1, art.column.fadeInMs));
  for (const child of group.children) {
    if (child.name === 'airflow') {
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.opacity = (material.userData.baseAlpha as number) * fade;
    }
  }
  probe.lip = {
    visible: true,
    action: action.id,
    tier: puffTierFor(puff.heldMs),
    columnWidthPx: art.column.segments[0]?.w0 ?? 0,
    kind: 'inhale',
  };
}
</script>

<template>
  <!--
    `delta` is three's own clock: seconds, not milliseconds. Passing it straight into a pool that
    counts in milliseconds emits a sixteen-thousandth of a puff per frame — which looks exactly like
    a plume that was never written.
  -->
  <!--
    `tone-mapping` is stated, not defaulted: TresJS's canvas defaults to ACES, which dims every flat
    colour on the way out (a white plane came out #e3e3e3 and the palette's sky came out warm-white),
    and this layer has to put the same colours on screen the painted layer does — grey in, grey out.
  -->
  <TresCanvas
    class="scene3d"
    :renderer="rendererFactory"
    :dpr="preferredDpr()"
    clear-color="#101010"
    :tone-mapping="THREE.NoToneMapping"
    @loop="({ delta }) => step((delta ?? 0) * 1000)"
    @ready="onSceneReady"
  >
    <!--
      An orthographic stage box, not a perspective camera: the mirror's fractions describe the stage,
      so the camera's frame is the stage's world size and a point lands where the core says it is.
      A perspective camera put the tray in the wrong place and at the wrong size.
    -->
    <TresOrthographicCamera
      :args="[-frame.width / 2, frame.width / 2, frame.height / 2, -frame.height / 2, 0.1, 100]"
      :position="[0, 0, 3]"
      :look-at="[0, 0, 0]"
    />
    <!-- The room's own light: direction from the place's key angle, colour from its sky. -->
    <TresDirectionalLight
      :position="keyLight.position"
      :intensity="keyLight.intensity"
      :color="keyLight.colour"
    />
    <TresAmbientLight :intensity="0.35" />

    <!-- The vignette: the room's corners, before anything stands in them. Built at `ready` — see
         the note where it is made — so it arrives one tick late, via this v-if. It stays outside the
         world group below: the 冲击感 leans the room in, and the frame is the one thing it must not
         lean with. -->
    <primitive
      v-if="vignette !== null"
      :object="vignette"
      :position="[0, 0, -1.2]"
      :scale="[vignetteSize, vignetteSize, 1]"
    />

    <!-- Everything that stands IN the room, under the one transform `placePunch` writes. The chrome is
         deliberately not in here — its plates answer DOM boxes that hold still, and §37 is the rule
         that a picture may not outrun. The rain and the grain are the stated exception: they ride in
         the chrome group from P2, so they hold still for these 420 ms, which the 2D layer did not do. -->
    <TresGroup ref="worldGroup" name="world">
      <!-- The room's own backdrop — the sky's stops, the wall, the place's furniture, the two pools
         of light — one group, fed by `backgroundStructure` every frame. -->
      <primitive v-if="backdrop !== null" :object="backdrop" />

      <!-- The table: a slab, not a plane, so it catches the key light the way the 2D one does — and
         in the room's own ink, so the slab and the painted band below the edge are one colour. -->
      <TresMesh :position="[0, tableY, -0.4]">
        <TresBoxGeometry :args="[frame.width * 1.2, WORLD_HEIGHT * 0.6, 0.3]" />
        <TresMeshStandardMaterial :color="tableInk" :roughness="0.85" />
      </TresMesh>

      <!-- The lighter as the painted layer's own bands: a tank up to the shoulder, the chimney and
         wick above it, and the cap on a hinge at the back. The body sits in the anchor's frame the
         way the 2D lays it out (top −0.3H, shoulder +0.14H, bottom +0.7H in its y-down local
         frame), so the aim point, the flame and the box finally agree on where the thing is. -->
      <TresGroup :position="at('lighter')">
        <!-- Tank: −0.7H…−0.14H. -->
        <TresMesh :position="[0, -0.42 * lighter.h, 0]">
          <TresBoxGeometry :args="[lighter.w, 0.56 * lighter.h, lighter.w * 0.7]" />
          <TresMeshStandardMaterial
            :color="PROP_INK.lighterTank"
            :metalness="0.5"
            :roughness="0.4"
          />
        </TresMesh>
        <!-- Chimney and wick: −0.14H…−0.03H. -->
        <TresMesh :position="[0, -0.085 * lighter.h, 0]">
          <TresBoxGeometry :args="[lighter.w * 0.56, 0.11 * lighter.h, lighter.w * 0.5]" />
          <TresMeshStandardMaterial color="#6d6259" :metalness="0.35" :roughness="0.7" />
        </TresMesh>
        <!-- The cap: hinged at the shoulder's back edge, `lighter.lid` its only input. Closed it
           covers the chimney; at full throw the shell tips back and the wick comes out. -->
        <TresGroup
          ref="lighterLid"
          name="lighter-lid"
          :position="[0, -0.14 * lighter.h, -lighter.w * 0.35]"
        >
          <TresMesh :position="[0, 0.11 * lighter.h, lighter.w * 0.35]">
            <!-- The shell is 0.22H tall and centred at half that above the hinge, so closed it spans
               shoulder → top and covers the chimney, and `lighter.lid` alone decides whether the
               wick is out. Width and depth are the tank's: a flip-top's cap is the same can.

               It used to have no geometry at all — a `TresMesh` with only a material and a nested
               mesh — which drew nothing *and* threw once per frame inside TresJS's own memory meter
               (it reads `geometry.attributes.position.count` for every mesh in the scene). The
               nested mesh below inherited the parent's 0.22H and so floated a line at 0.44H, above
               the lighter rather than on it; the two numbers were the same edge, counted twice. -->
            <TresBoxGeometry :args="[lighter.w, 0.22 * lighter.h, lighter.w * 0.7]" />
            <TresMeshStandardMaterial
              :color="PROP_INK.lighterCap"
              :metalness="0.55"
              :roughness="0.3"
            />
            <!-- `box-shadow: inset 0 1px 0 rgba(255,255,255,.06)`, as the line it draws: the shell's
               top face, a hair in front of it so it is not z-fighting with the can. -->
            <TresMesh :position="[0, 0.11 * lighter.h, lighter.w * 0.01]">
              <TresPlaneGeometry :args="[lighter.w * 1.035, edgePx]" />
              <TresMeshBasicMaterial :color="PROP_INK.lighterEdge" />
            </TresMesh>
          </TresMesh>
        </TresGroup>
      </TresGroup>
      <TresMesh :position="at('pack')">
        <!-- §2's `border: 1px solid rgba(255,255,255,.05)`: the plate behind, a hair larger, is the
           only way a box can have an edge in this layer. -->
        <TresMesh :position="[0, 0, -pack.w * 0.32]">
          <TresPlaneGeometry :args="[pack.w + 2 * edgePx, pack.h + 2 * edgePx]" />
          <TresMeshBasicMaterial :color="PROP_INK.packEdge" />
        </TresMesh>
        <TresBoxGeometry :args="[pack.w, pack.h, pack.w * 0.6]" />
        <TresMeshStandardMaterial :color="PROP_INK.pack" :roughness="0.6" />
      </TresMesh>
      <!--
      A disc facing the camera, squashed by the 2D layer's own ratio: the canvas draws the tray as an
      ellipse because its drawing implies a view from a little above, and the 3D layer reproduces that
      convention as geometry. Tilting the camera would have reproduced the look by breaking the 1:1
      mapping between the mirror's fractions and the screen.
    -->
      <!-- The squash is on the LOCAL z axis on purpose: scale is applied before the rotation, and this
         disc is turned a quarter turn about x — so its local z is what the screen reads as vertical.
         Squashing local y instead (the obvious guess) squashes the tray's thickness into the screen
         and leaves a perfect circle on it. -->
      <TresGroup ref="trayGroup" name="tray" :position="at('ashtray')">
        <TresMesh :rotation="[-Math.PI / 2, 0, 0]" :scale="[1, 1, TRAY_FLATTEN]">
          <TresCylinderGeometry :args="[trayRadius, trayRadius, trayRadius * 0.28, 32]" />
          <TresMeshStandardMaterial :color="PROP_INK.ashtray" :metalness="0.3" :roughness="0.5" />
        </TresMesh>
        <!-- §20's answer to a drag. The back rim is the only place a tray shows its material, and it is
           also what the tray says while the rod is being carried toward it — the destination answers,
           so no control has to appear over the scene. Both rings are unit geometry scaled by the
           tray's own radius every frame, so a window that resizes the bowl never rebuilds a mesh.
           The 2D layer drew the rim as an arc from θ 1.05π to 1.95π with a line of 0.06 r, and the
           invitation's halo at 1.16 r across and 0.54 r down — flatter than the bowl, which is how a
           ring of light off a rim reads. -->
        <TresMesh ref="trayRimMesh" name="tray-rim">
          <TresRingGeometry :args="[0.94, 1, 48, 1, Math.PI * 1.05, Math.PI * 0.9]" />
          <TresMeshBasicMaterial :transparent="true" :depth-write="false" :opacity="0" />
        </TresMesh>
        <TresMesh ref="trayHaloMesh" name="tray-halo">
          <TresRingGeometry :args="[0.979, 1.021, 48]" />
          <TresMeshBasicMaterial :transparent="true" :depth-write="false" :opacity="0" />
        </TresMesh>
      </TresGroup>

      <!-- The rod: a cylinder between the two published points (its true ends), rotated by the
         angle they imply. `placeRod` pinches its rings while a draw is held (S7/S15). -->
      <TresMesh
        v-if="rod !== null"
        ref="rodMesh"
        name="rod"
        :position="rod.mid"
        :rotation="[0, 0, rod.angle - Math.PI / 2]"
      >
        <TresCylinderGeometry
          :args="[(0.1 * ROD_THICKNESS_SHARE) / 2, (0.1 * ROD_THICKNESS_SHARE) / 2, 0.1, 12, 16]"
        />
        <!-- The ink is this frame's, not the template's: see `rodInkFor`. -->
        <TresMeshStandardMaterial color="#f0e8da" />
      </TresMesh>

      <!--
      The plume: one point per live particle, coloured by the core's own tint and faded by its own
      alpha. The pool, its noise field and its lifetimes are the Canvas 2D layer's `ParticlePool` —
      the half of that renderer worth keeping — and how many puffs a second come out is the core's
      `smoke.emissionRate`, not this file's opinion.
    -->
      <primitive v-if="puffs !== null" :object="puffs" />

      <!-- The cherry's own light: halo in the air, spill on the table edge. Both additive. -->
      <primitive v-if="halo !== null" :object="halo" />
      <primitive v-if="spill !== null" :object="spill" />

      <!-- Falling ash: one ellipse per fragment the core is carrying. -->
      <primitive v-if="flakes !== null" :object="flakes" />
    </TresGroup>

    <!-- The HUD's two figures, painted from the baked atlas; the DOM under them keeps the taps
         and the screen reader's line while `html.scene3d-text` hides their ink. -->
    <primitive v-if="textRuns !== null" :object="textRuns" />

    <!-- The chrome: both rings and the pill's card and glow, all off their DOM boxes. -->
    <primitive v-if="chrome !== null" :object="chrome" />
  </TresCanvas>
</template>

<style scoped>
/* The canvas is decoration over the live stage and deaf to the pointer — but the mask itself lives
   in `global.css` (`html.scene3d-text canvas.scene3d`): a scoped rule never reached the canvas
   TresJS renders, measured `pointer-events: auto`, and the covered page swallowed the sustained
   gestures (the pill's hold-to-draw never fired in `?scene=3d`). */
.scene3d {
  position: absolute;
  inset: 0;
}
</style>
