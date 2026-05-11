import gsap from "gsap";
import railConfigCsv from "../rail_config.csv?raw";
import sampleLayoutRaw from "../maze_layout.json?raw";
import { loadConfigFromCsv } from "./maze/csv";
import { calculateOccupiedCellsWithRotAbs, composeRotAbs, exitDirFromLocalRot, MazeGenerator, transformByRotAbs } from "./maze/generator";
import { DEFAULT_GENERATOR_OPTIONS, GRID_TO_WORLD_SCALE } from "./maze/constants";
import { MazeLayout, MazeRailJson, RailConfigItem, RotAbs, Vec3Dict, Vector3 } from "./maze/types";
import { BuildExitTarget, EditorMode, MazeViewer, RailEditAction, RailMeta } from "./viewer/MazeViewer";
import "./styles/main.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

const SEED_VERSION = "bm01";
const RANDOM_SEED_MAX = 36 ** 6;
const BUILD_GROUPS = [
  { id: "straight", label: "Straight" },
  { id: "curve", label: "Curve" },
  { id: "bump", label: "Bump" },
  { id: "tube", label: "Tube" },
  { id: "special", label: "Special" },
] as const;

type BuildGroupId = (typeof BUILD_GROUPS)[number]["id"];

interface BuildSelection {
  familyKey: string;
  railId: string;
  sizeIndex: number;
  spin: number;
}

interface BuildRailFamily {
  key: string;
  group: BuildGroupId;
  descriptor: string;
  variants: RailConfigItem[];
}

function createRandomSeed(): number {
  return Math.floor(Math.random() * RANDOM_SEED_MAX);
}

interface GeneratorSeedState {
  random: number;
  targetDifficulty: number;
  targetCheckpoints: number;
  maxSpins: number;
  bounds: Vec3Dict;
}

function randomOdd(min: number, max: number): number {
  const values = [];
  for (let value = min; value <= max; value += 1) {
    if (value % 2 === 1) values.push(value);
  }
  return values[Math.floor(Math.random() * values.length)] ?? min;
}

function createRandomSeedState(): GeneratorSeedState {
  return {
    random: createRandomSeed(),
    targetDifficulty: Math.floor(Math.random() * 23) + 8,
    targetCheckpoints: Math.floor(Math.random() * 4),
    maxSpins: Math.floor(Math.random() * 5),
    bounds: {
      x: randomOdd(7, 15),
      y: randomOdd(7, 15),
      z: randomOdd(1, 7),
    },
  };
}

function createInitialSeedState(): GeneratorSeedState {
  return {
    random: createRandomSeed(),
    targetDifficulty: DEFAULT_GENERATOR_OPTIONS.targetDifficulty,
    targetCheckpoints: DEFAULT_GENERATOR_OPTIONS.targetCheckpoints,
    maxSpins: DEFAULT_GENERATOR_OPTIONS.maxSpins,
    bounds: DEFAULT_GENERATOR_OPTIONS.bounds.toDict(),
  };
}

function encodeSeedState(state: GeneratorSeedState): string {
  const encode = (value: number, width: number) => Math.max(0, Math.floor(value)).toString(36).padStart(width, "0").slice(-width);
  return [
    SEED_VERSION,
    encode(state.random, 6),
    encode(Math.max(1, state.targetDifficulty), 2),
    encode(state.targetCheckpoints, 2),
    encode(state.maxSpins, 2),
    [normalizeBoundSize(state.bounds.x), normalizeBoundSize(state.bounds.y), normalizeBoundSize(state.bounds.z)]
      .map((value) => encode(value, 2))
      .join(""),
  ].join("-");
}

function parseSeedState(seed: string): GeneratorSeedState | null {
  const raw = seed.trim();
  const parts = raw.split("-");
  if (parts.length !== 6) return null;

  const read = (value: string) => Number.parseInt(value, 36);
  const isModern = parts[0] === SEED_VERSION;
  const isLegacy = parts[0] === "BM1";
  if (!isModern && !isLegacy) return null;

  const bounds = isModern
    ? [parts[5].slice(0, 2), parts[5].slice(2, 4), parts[5].slice(4, 6)].map(read)
    : parts[5].split(".").map(read);
  const random = read(parts[1]);
  const targetDifficulty = read(parts[2]);
  const targetCheckpoints = read(parts[3]);
  const maxSpins = read(parts[4]);
  if (![random, targetDifficulty, targetCheckpoints, maxSpins, ...bounds].every(Number.isFinite)) return null;
  if (bounds.length !== 3) return null;
  if (isModern && !/^[a-z0-9]{4}-[a-z0-9]{6}-[a-z0-9]{2}-[a-z0-9]{2}-[a-z0-9]{2}-[a-z0-9]{6}$/.test(raw)) return null;

  return {
    random,
    targetDifficulty: Math.max(1, Math.floor(targetDifficulty)),
    targetCheckpoints: Math.max(0, Math.floor(targetCheckpoints)),
    maxSpins: Math.max(0, Math.floor(maxSpins)),
    bounds: {
      x: normalizeBoundSize(bounds[0]),
      y: normalizeBoundSize(bounds[1]),
      z: normalizeBoundSize(bounds[2]),
    },
  };
}

app.innerHTML = `
  <main class="shell">
    <aside class="panel">
      <div class="brand">
        <img class="brand-icon" src="${import.meta.env.BASE_URL}ball-maze-icon.png" alt="" />
        <h1>BALL MAZE BUILDER</h1>
        <div class="lang-switch" aria-label="Language">
          <button class="lang is-active">中</button>
          <button class="lang">EN</button>
        </div>
      </div>

      <div class="panel-body">
        <section class="drop" id="dropZone" title="拖入 UE 导出的 CSV 会重新生成配置；拖入 maze JSON 会直接打开布局。">
          <strong>Drop CSV or maze JSON</strong>
          <span>CSV regenerates config. JSON opens a layout.</span>
        </section>

        <section class="section collapsible-section" data-panel="generator">
          <div class="section-head">
            <button class="collapse-toggle" data-collapse-target="generator" title="收起 Generator 面板。" aria-label="Toggle Generator panel" aria-expanded="true"></button>
            <h2>Generator</h2>
            <button id="generateBtn" class="primary section-action" title="保持当前配置不变，换一个随机性并重新生成迷宫。">Generate</button>
          </div>
          <div class="collapsible-content">
            <label class="field">
              <span class="help-label" data-help="完整生成种子，格式为 bm01-random-difficulty-checkpoints-spins-bounds。输入有效 seed 会自动反写配置并生成迷宫。">Seed</span>
              <div class="seed-row">
                <input id="seedInput" type="text" value="${encodeSeedState(createInitialSeedState())}" />
                <button id="randomSeedBtn" class="icon-button" title="随机生成一套新的 seed 和配置。">↻</button>
              </div>
            </label>
            <label class="field">
              <span class="help-label" data-help="目标总难度。生成器达到该难度后会尝试收尾并放置终点。">Target difficulty</span>
              <input id="difficultyInput" type="number" min="1" step="1" value="${DEFAULT_GENERATOR_OPTIONS.targetDifficulty}" />
            </label>
            <label class="field">
              <span class="help-label" data-help="Checkpoint 数量。为 0 时不放置 checkpoint；大于 0 时每段超过目标难度 / checkpoint 数量后触发一次分叉 checkpoint。">Checkpoints</span>
              <input id="checkpointInput" type="number" min="0" step="1" value="${DEFAULT_GENERATOR_OPTIONS.targetCheckpoints}" />
            </label>
            <label class="field">
              <span class="help-label" data-help="允许出现非 0 自旋的最大次数。0 表示下一节轨道默认不绕出口方向自旋。">Max spins</span>
              <input id="maxSpinsInput" type="number" min="0" step="1" value="${DEFAULT_GENERATOR_OPTIONS.maxSpins}" />
            </label>
            <label class="field">
              <span class="help-label" data-help="生成边界的实际双边尺寸，单位是逻辑 grid。只使用 1、3、5、7 这样的奇数；1 等于旧逻辑里的 0，3 等于旧逻辑里的 1。">Bounds X/Y/Z</span>
              <div class="triple">
                <input id="boundX" type="number" min="1" step="2" value="${DEFAULT_GENERATOR_OPTIONS.bounds.x}" />
                <input id="boundY" type="number" min="1" step="2" value="${DEFAULT_GENERATOR_OPTIONS.bounds.y}" />
                <input id="boundZ" type="number" min="1" step="2" value="${DEFAULT_GENERATOR_OPTIONS.bounds.z}" />
              </div>
            </label>
            <div class="actions">
              <button id="moveCenterBtn" title="按 grid 整数偏移当前迷宫，使布局尽量落在当前 bounds 的中心。">Move to center</button>
              <button id="fitBoundsBtn" title="把 bounds 收缩到能容纳当前迷宫的最小 grid 尺寸，并重新居中布局。">Fit size</button>
              <button id="downloadBtn" title="下载当前迷宫 JSON。">Download JSON</button>
              <button id="resetCameraBtn" title="重置相机视角。">Reset View</button>
            </div>
          </div>
        </section>

        <section class="section stats collapsible-section" data-panel="stats">
          <div class="section-head">
            <button class="collapse-toggle" data-collapse-target="stats" title="收起 Stats 面板。" aria-label="Toggle Stats panel" aria-expanded="true"></button>
            <h2>Stats</h2>
          </div>
          <div class="collapsible-content">
            <div id="statsContent" class="stats-grid"></div>
          </div>
        </section>

        <section class="section details collapsible-section" data-panel="details">
          <div class="section-head">
            <button class="collapse-toggle" data-collapse-target="details" title="收起 Rail Detail 面板。" aria-label="Toggle Rail Detail panel" aria-expanded="true"></button>
            <h2>Rail Detail</h2>
          </div>
          <div class="collapsible-content">
            <div id="detailContent" class="muted">Hover a rail in the scene.</div>
          </div>
        </section>
      </div>
    </aside>

    <section class="viewport">
      <header class="topbar">
        <button id="historyBackBtn" class="tool-chip" title="返回上一个相机 focus。">返回</button>
        <button id="historyForwardBtn" class="tool-chip" title="前进到下一个相机 focus。">前进</button>
        <button id="projectionToggleBtn" class="tool-chip" title="在透视和无透视视图之间切换。">透视</button>
        <span id="editorStatus" class="editor-status">Mode: Move</span>
        <button id="focusToggleBtn" class="tool-chip primary-tool" data-current="Focus: Maze" data-next="Focus: Bounds" title="在建筑区域中心和当前迷宫中心之间切换相机 focus。"></button>
      </header>
      <div id="viewerHost" class="viewer"></div>
      <div class="view-axis" aria-label="View axis">
        <button data-view="top" class="axis-z" title="Top view">Z</button>
        <div>
          <button data-view="left" class="axis-x" title="Left view">-X</button>
          <button data-view="iso" title="Iso view">ISO</button>
          <button data-view="right" class="axis-x" title="Right view">X</button>
        </div>
        <div>
          <button data-view="front" class="axis-y" title="Front view">Y</button>
          <button data-view="back" class="axis-y" title="Back view">-Y</button>
        </div>
      </div>
      <div class="build-tray" id="buildTray" aria-label="Rail build library">
        <div class="build-tray-head">
          <span>Rail Library</span>
          <span id="buildHint">Select a rail to build from open exits.</span>
        </div>
        <div id="partTabs" class="part-tabs" role="tablist"></div>
        <div id="descTabs" class="desc-tabs" role="tablist"></div>
        <div id="partStrip" class="part-strip" aria-label="Rail parts"></div>
      </div>
      <div class="log-dock is-collapsed">
        <div class="log-head">
          <button id="logToggleBtn" class="collapse-toggle log-toggle" title="展开生成日志内容。" aria-label="Toggle generation log" aria-expanded="false"></button>
          <span>Generation Log</span>
        </div>
        <div id="logContent" class="log-content"></div>
      </div>
    </section>
  </main>
`;

const viewerHost = document.querySelector<HTMLDivElement>("#viewerHost")!;
const statsContent = document.querySelector<HTMLDivElement>("#statsContent")!;
const detailContent = document.querySelector<HTMLDivElement>("#detailContent")!;
const logContent = document.querySelector<HTMLDivElement>("#logContent")!;
const logDock = document.querySelector<HTMLDivElement>(".log-dock")!;
const logToggleBtn = document.querySelector<HTMLButtonElement>("#logToggleBtn")!;
const generateBtn = document.querySelector<HTMLButtonElement>("#generateBtn")!;
const downloadBtn = document.querySelector<HTMLButtonElement>("#downloadBtn")!;
const resetCameraBtn = document.querySelector<HTMLButtonElement>("#resetCameraBtn")!;
const randomSeedBtn = document.querySelector<HTMLButtonElement>("#randomSeedBtn")!;
const moveCenterBtn = document.querySelector<HTMLButtonElement>("#moveCenterBtn")!;
const fitBoundsBtn = document.querySelector<HTMLButtonElement>("#fitBoundsBtn")!;
const historyBackBtn = document.querySelector<HTMLButtonElement>("#historyBackBtn")!;
const historyForwardBtn = document.querySelector<HTMLButtonElement>("#historyForwardBtn")!;
const projectionToggleBtn = document.querySelector<HTMLButtonElement>("#projectionToggleBtn")!;
const editorStatus = document.querySelector<HTMLSpanElement>("#editorStatus")!;
const focusToggleBtn = document.querySelector<HTMLButtonElement>("#focusToggleBtn")!;
const viewAxis = document.querySelector<HTMLDivElement>(".view-axis")!;
const collapseToggles = document.querySelectorAll<HTMLButtonElement>(".collapse-toggle[data-collapse-target]");
const dropZone = document.querySelector<HTMLDivElement>("#dropZone")!;
const buildTray = document.querySelector<HTMLDivElement>("#buildTray")!;
const buildHint = document.querySelector<HTMLSpanElement>("#buildHint")!;
const partTabs = document.querySelector<HTMLDivElement>("#partTabs")!;
const descTabs = document.querySelector<HTMLDivElement>("#descTabs")!;
const partStrip = document.querySelector<HTMLDivElement>("#partStrip")!;
const seedInput = document.querySelector<HTMLInputElement>("#seedInput")!;
const difficultyInput = document.querySelector<HTMLInputElement>("#difficultyInput")!;
const checkpointInput = document.querySelector<HTMLInputElement>("#checkpointInput")!;
const maxSpinsInput = document.querySelector<HTMLInputElement>("#maxSpinsInput")!;
const boundX = document.querySelector<HTMLInputElement>("#boundX")!;
const boundY = document.querySelector<HTMLInputElement>("#boundY")!;
const boundZ = document.querySelector<HTMLInputElement>("#boundZ")!;

const viewer = new MazeViewer(viewerHost);
let csvText = railConfigCsv;
let currentLayout: MazeLayout = JSON.parse(sampleLayoutRaw) as MazeLayout;
let focusMode: "maze" | "bounds" = "maze";
let selectedRail: RailMeta | null = null;
let selectedRailId: number | null = null;
let editorMode: EditorMode = "move";
let deleteMode = false;
let buildSelection: BuildSelection | null = null;
let buildHoverTarget: BuildExitTarget | null = null;
let buildActiveGroup: BuildGroupId = "straight";
let buildActiveDescriptor = "Normal";
let buildPreviewMessage = "Select a rail to build from open exits.";
let seedInputTimer: number | undefined;

function markLatin(text: string): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  return escape(text).replace(/[A-Za-z0-9_.:/()+,-]+/g, (match) => `<span class="latin">${match}</span>`);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function classifyRailGroup(rail: RailConfigItem): BuildGroupId {
  const lower = rail.rowName.toLowerCase();
  if (lower.includes("straight")) return "straight";
  if (lower.includes("curve")) return "curve";
  if (lower.includes("bump")) return "bump";
  if (lower.includes("tube") || lower.includes("box")) return "tube";
  return "special";
}

function railFamilyKey(railId: string): string {
  return railId.replace(/_X\d+_Y\d+_Z\d+(?=_Rail$)/, "");
}

function railDescriptor(rail: RailConfigItem): string {
  const noPrefix = railFamilyKey(rail.rowName).replace(/^BP_/, "").replace(/_Rail$/, "");
  const tokens = noPrefix.split("_").filter(Boolean);
  const directionTokens = new Set(["F", "L90", "R90", "U90", "D90", "FD", "FU", "FR90", "FL90", "T", "CR"]);
  const description = tokens
    .slice(1)
    .filter((token) => !directionTokens.has(token))
    .map((token) => token.charAt(0) + token.slice(1).toLowerCase())
    .join(" ");
  return description || "Normal";
}

function compareRailSize(a: RailConfigItem, b: RailConfigItem): number {
  const volumeA = a.sizeRev.x * a.sizeRev.y * a.sizeRev.z;
  const volumeB = b.sizeRev.x * b.sizeRev.y * b.sizeRev.z;
  return volumeA - volumeB || a.sizeRev.x - b.sizeRev.x || a.sizeRev.y - b.sizeRev.y || a.sizeRev.z - b.sizeRev.z || a.rowName.localeCompare(b.rowName);
}

function buildFamilies(): BuildRailFamily[] {
  const config = loadConfigFromCsv(csvText);
  const families = new Map<string, BuildRailFamily>();

  for (const rail of config.values()) {
    if (rail.isStart) continue;
    const key = railFamilyKey(rail.rowName);
    const group = classifyRailGroup(rail);
    const descriptor = railDescriptor(rail);
    const family = families.get(key) ?? { key, group, descriptor, variants: [] };
    family.variants.push(rail);
    families.set(key, family);
  }

  return [...families.values()]
    .map((family) => ({
      ...family,
      variants: family.variants.sort(compareRailSize).slice(0, 4),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function currentBuildFamilies(): BuildRailFamily[] {
  return buildFamilies().filter((family) => family.group === buildActiveGroup && family.descriptor === buildActiveDescriptor);
}

function findBuildFamily(familyKey: string): BuildRailFamily | undefined {
  return buildFamilies().find((family) => family.key === familyKey);
}

function railForFamilyDisplay(family: BuildRailFamily): RailConfigItem {
  if (buildSelection?.familyKey === family.key) {
    return family.variants[Math.min(buildSelection.sizeIndex, family.variants.length - 1)] ?? family.variants[0];
  }
  return family.variants[0];
}

function renderPartLibrary(): void {
  const families = buildFamilies();
  const availableGroups = BUILD_GROUPS.filter((group) => families.some((family) => family.group === group.id));
  if (!availableGroups.some((group) => group.id === buildActiveGroup)) {
    buildActiveGroup = availableGroups[0]?.id ?? "special";
  }

  const descriptors = [...new Set(families.filter((family) => family.group === buildActiveGroup).map((family) => family.descriptor))];
  descriptors.sort((a, b) => (a === "Normal" ? -1 : b === "Normal" ? 1 : a.localeCompare(b)));
  if (!descriptors.includes(buildActiveDescriptor)) {
    buildActiveDescriptor = descriptors[0] ?? "Normal";
  }

  partTabs.innerHTML = availableGroups
    .map((group) => {
      const count = families.filter((family) => family.group === group.id).length;
      return `
        <button class="part-tab ${buildActiveGroup === group.id ? "is-active" : ""}" data-group="${group.id}" role="tab" aria-selected="${buildActiveGroup === group.id}">
          ${markLatin(group.label)} <span>${count}</span>
        </button>
      `;
    })
    .join("");

  descTabs.innerHTML = descriptors
    .map((descriptor) => {
      const count = families.filter((family) => family.group === buildActiveGroup && family.descriptor === descriptor).length;
      return `
        <button class="desc-tab ${buildActiveDescriptor === descriptor ? "is-active" : ""}" data-desc="${escapeHtml(descriptor)}" role="tab" aria-selected="${buildActiveDescriptor === descriptor}">
          ${markLatin(descriptor)} <span>${count}</span>
        </button>
      `;
    })
    .join("");

  const visibleFamilies = currentBuildFamilies();
  partStrip.innerHTML = visibleFamilies.length > 0
    ? visibleFamilies
      .map((family) => {
        const rail = railForFamilyDisplay(family);
        const selected = buildSelection?.familyKey === family.key;
        return `
          <button class="part-tile ${selected ? "is-selected" : ""}" data-family-key="${escapeHtml(family.key)}" title="${escapeHtml(rail.rowName)}">
            <span class="part-name">${markLatin(rail.rowName)}</span>
            <span class="part-meta">${markLatin(`Difficulty ${rail.diffBase}`)}</span>
            <span class="part-meta">${markLatin(`Exits ${rail.exitsLogic.length}`)}</span>
          </button>
        `;
      })
      .join("")
    : `<div class="part-empty">${markLatin("No rails in this group.")}</div>`;

  buildTray.classList.toggle("is-building", buildSelection !== null);
  buildHint.textContent = buildSelection
    ? "Hover an open exit. Left click places, R spins, 1-4 switches size, X exits."
    : "Select a rail to build from open exits.";
}

function renderRailDetail(rail: RailMeta | null): void {
  if (!rail) {
    const message = buildSelection
      ? `Build mode: ${buildSelection.railId}. Hover an open exit, R spin, 1-4 size, X exit.`
      : deleteMode
        ? "Delete mode: click a rail to delete it."
        : "Hover a rail in the scene.";
    detailContent.innerHTML = `<span class="muted">${markLatin(message)}</span>`;
    return;
  }
  detailContent.innerHTML = `
    <div class="detail-row"><span>${markLatin("ID")}</span><strong>${markLatin(String(rail.id))}</strong></div>
    <div class="detail-row"><span>${markLatin("Type")}</span><strong>${markLatin(rail.type)}</strong></div>
    <div class="detail-row"><span>${markLatin("Rev")}</span><strong>${markLatin(formatVec(rail.posRev))}</strong></div>
    <div class="detail-row"><span>${markLatin("Abs")}</span><strong>${markLatin(formatVec(rail.pos))}</strong></div>
    <div class="detail-row"><span>${markLatin("Rot")}</span><strong>${markLatin(`${rail.rot.p}/${rail.rot.y}/${rail.rot.r}`)}</strong></div>
    <div class="detail-row"><span>${markLatin("Diff")}</span><strong>${markLatin(rail.diff.toFixed(2))}</strong></div>
    <div class="detail-row"><span>${markLatin("Total Diff")}</span><strong>${markLatin(rail.cumulativeDiff.toFixed(2))}</strong></div>
    <div class="detail-row"><span>${markLatin("Segment Diff")}</span><strong>${markLatin(rail.segmentDiff.toFixed(2))}</strong></div>
  `;
}

viewer.onHover = (rail) => {
  if (selectedRail) return;
  renderRailDetail(rail);
};

viewer.onSelect = (rail) => {
  if (deleteMode && rail) {
    deleteRail(rail.id);
    return;
  }
  selectedRail = rail;
  selectedRailId = rail?.id ?? null;
  renderRailDetail(selectedRail);
};

viewer.onEdit = (action) => {
  applyRailEdit(action);
};

viewer.onBuildHover = (target) => {
  buildHoverTarget = target;
  updateBuildPreview();
};

viewer.onBuildPlace = (target) => {
  placeBuildRail(target);
};

function readGeneratorStateFromControls(random = Number(createRandomSeed())): GeneratorSeedState {
  normalizeBoundInputs();
  const bounds = currentBounds();
  return {
    random,
    targetDifficulty: Math.max(1, Math.floor(Number(difficultyInput.value) || DEFAULT_GENERATOR_OPTIONS.targetDifficulty)),
    targetCheckpoints: Math.max(0, Math.floor(Number(checkpointInput.value) || DEFAULT_GENERATOR_OPTIONS.targetCheckpoints)),
    maxSpins: Math.max(0, Math.floor(Number(maxSpinsInput.value) || DEFAULT_GENERATOR_OPTIONS.maxSpins)),
    bounds,
  };
}

function applySeedState(state: GeneratorSeedState): void {
  difficultyInput.value = String(state.targetDifficulty);
  checkpointInput.value = String(state.targetCheckpoints);
  maxSpinsInput.value = String(state.maxSpins);
  boundX.value = String(state.bounds.x);
  boundY.value = String(state.bounds.y);
  boundZ.value = String(state.bounds.z);
}

function generateLayout(state: GeneratorSeedState): void {
  try {
    applySeedState(state);
    const config = loadConfigFromCsv(csvText);
    const generator = new MazeGenerator(config, {
      seed: state.random,
      targetDifficulty: state.targetDifficulty,
      targetCheckpoints: state.targetCheckpoints,
      maxSpins: state.maxSpins,
      bounds: new Vector3(state.bounds.x, state.bounds.y, state.bounds.z),
    });
    currentLayout = generator.generate();
    currentLayout.MapMeta.Seed = encodeSeedState(state);
    buildHoverTarget = null;
    setLayout(currentLayout);
    updateBuildPreview();
    renderLog(generator.logs);
  } catch (error) {
    logContent.innerHTML = `<div class="log-line fail">${error instanceof Error ? error.message : String(error)}</div>`;
  }
}

function generateFromSeedInput(): void {
  const state = parseSeedState(seedInput.value);
  if (!state) {
    logContent.innerHTML = `<div class="log-line fail">${markLatin("Invalid seed. Expected format: bm01-000000-00-00-00-000000")}</div>`;
    return;
  }
  seedInput.value = encodeSeedState(state);
  generateLayout(state);
}

function regenerateWithCurrentConfig(): void {
  const state = readGeneratorStateFromControls();
  seedInput.value = encodeSeedState(state);
  generateLayout(state);
}

function setLayout(layout: MazeLayout, keepSelectedId: number | null = null): void {
  currentLayout = layout;
  selectedRailId = keepSelectedId !== null && layout.Rail.some((rail) => rail.Rail_Index === keepSelectedId) ? keepSelectedId : null;
  selectedRail = selectedRailId !== null ? railMetaFromLayout(layout, selectedRailId) : null;
  viewer.setBounds(currentBounds());
  viewer.setLayout(layout, selectedRailId, keepSelectedId === null);
  renderRailDetail(selectedRail);
  updateEditorStatus();
  statsContent.innerHTML = `
    <div><span>${markLatin("Rails")}</span><strong>${markLatin(String(layout.MapMeta.RailCount))}</strong></div>
    <div><span>${markLatin("Difficulty")}</span><strong>${markLatin(layout.MapMeta.MazeDiff.toFixed(2))}</strong></div>
    <div><span>${markLatin("Start")}</span><strong>${markLatin(String(layout.Rail.filter((rail) => rail.Rail_ID.includes("Start")).length))}</strong></div>
    <div><span>${markLatin("End")}</span><strong>${markLatin(String(layout.Rail.filter((rail) => rail.Rail_ID.includes("End")).length))}</strong></div>
    <div><span>${markLatin("Checkpoints")}</span><strong>${markLatin(String(layout.Rail.filter((rail) => rail.Rail_ID.toLowerCase().includes("checkpoint")).length))}</strong></div>
    <div><span>${markLatin("Spins")}</span><strong>${markLatin(`${layout.MapMeta.SpinCount ?? 0}/${layout.MapMeta.MaxSpins ?? 0}`)}</strong></div>
    ${(layout.MapMeta.SegmentDiffs ?? [])
      .map((diff, index) => `<div class="segment-stat"><span>${markLatin(`Segment ${index + 1}`)}</span><strong>${markLatin(diff.toFixed(2))}</strong></div>`)
      .join("")}
  `;
}

function railMetaFromLayout(layout: MazeLayout, railId: number): RailMeta | null {
  const rail = layout.Rail.find((item) => item.Rail_Index === railId);
  if (!rail) return null;
  return {
    id: rail.Rail_Index,
    type: rail.Rail_ID,
    pos: rail.Pos_Abs,
    posRev: rail.Pos_Rev,
    rot: rail.Rot_Abs,
    diff: rail.Diff_Act,
    cumulativeDiff: rail.Diff_Act,
    segmentDiff: rail.Diff_Act,
  };
}

function restoreSeedFromLayout(layout: MazeLayout): string | null {
  const meta = layout.MapMeta as MazeLayout["MapMeta"] & { seed?: unknown };
  const topLevel = layout as MazeLayout & { seed?: unknown };
  const seed = meta.Seed ?? meta.seed ?? topLevel.seed;
  if (typeof seed !== "string") return null;
  const state = parseSeedState(seed);
  if (!state) return null;
  seedInput.value = encodeSeedState(state);
  applySeedState(state);
  return seedInput.value;
}

function cloneLayout(layout: MazeLayout): MazeLayout {
  return JSON.parse(JSON.stringify(layout)) as MazeLayout;
}

function worldDict(vec: Vec3Dict): Vec3Dict {
  return {
    x: Number((vec.x * GRID_TO_WORLD_SCALE).toFixed(8)),
    y: Number((vec.y * GRID_TO_WORLD_SCALE).toFixed(8)),
    z: Number((vec.z * GRID_TO_WORLD_SCALE).toFixed(8)),
  };
}

function vectorFromDict(vec: Vec3Dict): Vector3 {
  return new Vector3(vec.x, vec.y, vec.z);
}

function normalizeRot(rot: RotAbs): RotAbs {
  const normalize = (value: number | undefined) => (((Math.round((value ?? 0) / 90) * 90) % 360) + 360) % 360;
  return { p: normalize(rot.p), y: normalize(rot.y), r: normalize(rot.r) };
}

function updateLayoutMeta(layout: MazeLayout): MazeLayout {
  layout.MapMeta.RailCount = layout.Rail.length;
  layout.MapMeta.MazeDiff = layout.Rail.reduce((sum, rail) => sum + rail.Diff_Act, 0);
  layout.MapMeta.CheckpointCount = layout.Rail.filter((rail) => rail.Rail_ID.toLowerCase().includes("checkpoint")).length;
  return layout;
}

function recalculateRailGeometry(rail: MazeRailJson): MazeRailJson {
  const config = loadConfigFromCsv(csvText).get(rail.Rail_ID);
  if (!config) return rail;
  const posRev = vectorFromDict(rail.Pos_Rev);
  const rotAbs = normalizeRot(rail.Rot_Abs);
  const occupiedCells = calculateOccupiedCellsWithRotAbs(rail.Rail_ID, posRev, vectorFromDict(rail.Size_Rev), rotAbs)
    .map(([x, y, z]) => ({ x, y, z }));
  const previousExits = rail.Exit;
  const exits = config.exitsLogic.map((exit, index) => {
    const worldLogicPos = posRev.add(transformByRotAbs(exit.Pos, rotAbs));
    const previous = previousExits[index];
    return {
      Index: index,
      Exit_Pos_Rev: worldLogicPos.toDict(),
      Exit_Pos_Abs: worldDict(worldLogicPos.toDict()),
      Exit_Rot_Abs: composeRotAbs(rotAbs, exit.LocalRot),
      Exit_Dir_Abs: exitDirFromLocalRot(rotAbs, exit.LocalRot),
      SpinDiff: [...exit.SpinDiff],
      IsConnected: previous?.IsConnected ?? false,
      TargetInstanceID: previous?.TargetInstanceID ?? -1,
    };
  });
  return {
    ...rail,
    Pos_Abs: worldDict(rail.Pos_Rev),
    Rot_Abs: rotAbs,
    Occupied_Cells_Rev: occupiedCells,
    Exit: exits,
  };
}

function selectBuildFamily(familyKey: string): void {
  if (buildSelection?.familyKey === familyKey) {
    exitBuildMode("Build mode exited.");
    return;
  }

  const family = findBuildFamily(familyKey);
  const railId = family?.variants[0]?.rowName;
  if (!railId) return;

  buildSelection = { familyKey, railId, sizeIndex: 0, spin: 0 };
  buildHoverTarget = null;
  buildPreviewMessage = "Hover an open exit. Left click places, R spins, 1-4 switches size, X exits.";
  deleteMode = false;
  selectedRail = null;
  selectedRailId = null;
  viewer.selectRail(null);
  viewer.setBuildMode(true);
  viewer.setBuildPreview(null);
  renderRailDetail(null);
  renderPartLibrary();
  updateEditorStatus();
  renderLog([{ kind: "info", message: `Build mode: ${railId}. Hover an open exit, R spins, 1-4 switches size, X exits.` }]);
}

function exitBuildMode(message?: string): void {
  if (!buildSelection) return;
  buildSelection = null;
  buildHoverTarget = null;
  buildPreviewMessage = "Select a rail to build from open exits.";
  viewer.setBuildMode(false);
  viewer.setBuildPreview(null);
  renderRailDetail(selectedRail);
  renderPartLibrary();
  updateEditorStatus();
  if (message) renderLog([{ kind: "info", message }]);
}

function rotateBuildSpin(): void {
  if (!buildSelection) return;
  const spinDiffs = buildHoverTarget?.spinDiffs ?? [1, 1, 1, 1];
  let nextSpin = buildSelection.spin;
  for (let offset = 1; offset <= 4; offset += 1) {
    const candidate = (buildSelection.spin + offset) % 4;
    if ((spinDiffs[candidate] ?? 0) > 0) {
      nextSpin = candidate;
      break;
    }
  }
  buildSelection = { ...buildSelection, spin: nextSpin };
  updateBuildPreview();
  updateEditorStatus();
}

function switchBuildSize(slot: number): void {
  if (!buildSelection) return;
  const family = findBuildFamily(buildSelection.familyKey);
  const index = slot - 1;
  const variant = family?.variants[index];
  if (!family || !variant) {
    renderLog([{ kind: "warn", message: `No size slot ${slot} for ${buildSelection.familyKey}.` }]);
    return;
  }

  buildSelection = {
    ...buildSelection,
    railId: variant.rowName,
    sizeIndex: index,
  };
  buildPreviewMessage = `Size ${slot}/${family.variants.length}: ${variant.rowName}.`;
  renderRailDetail(null);
  renderPartLibrary();
  updateBuildPreview();
  updateEditorStatus();
}

function updateBuildPreview(): void {
  if (!buildSelection) {
    viewer.setBuildPreview(null);
    buildPreviewMessage = "Select a rail to build from open exits.";
    return;
  }

  if (!buildHoverTarget) {
    viewer.setBuildPreview(null);
    buildPreviewMessage = "Hover an open exit to preview placement.";
    updateEditorStatus();
    return;
  }

  const result = createBuildRail(buildHoverTarget);
  if (!result.rail) {
    viewer.setBuildPreview(null);
    buildPreviewMessage = result.reason ?? "This exit cannot accept the selected rail.";
    updateEditorStatus();
    return;
  }

  viewer.setBuildPreview(result.rail);
  buildPreviewMessage = `Ready at rail ${buildHoverTarget.parentRailId}, exit ${buildHoverTarget.exitIndex}.`;
  updateEditorStatus();
}

function createBuildRail(target: BuildExitTarget): { rail: MazeRailJson | null; reason?: string } {
  if (!buildSelection) return { rail: null, reason: "No rail selected." };
  const config = loadConfigFromCsv(csvText);
  const railConfig = config.get(buildSelection.railId);
  if (!railConfig) return { rail: null, reason: "Selected rail is not in the current CSV." };

  const parent = currentLayout.Rail.find((rail) => rail.Rail_Index === target.parentRailId);
  if (!parent) return { rail: null, reason: "Parent rail no longer exists." };
  const parentExit = parent.Exit[target.exitIndex];
  if (!parentExit || parentExit.IsConnected || parentExit.TargetInstanceID !== -1) {
    return { rail: null, reason: "Exit is already connected." };
  }
  if ((parentExit.SpinDiff?.[buildSelection.spin] ?? 1) <= 0) {
    return { rail: null, reason: `Spin ${buildSelection.spin * 90} is not allowed on this exit.` };
  }

  const posRev = vectorFromDict(parentExit.Exit_Pos_Rev);
  const rotAbs = normalizeRot(composeRotAbs(parentExit.Exit_Rot_Abs, { p: 0, y: 0, r: buildSelection.spin * 90 }));
  const occupiedTuples = calculateOccupiedCellsWithRotAbs(railConfig.rowName, posRev, railConfig.sizeRev, rotAbs);
  const occupiedCells = occupiedTuples.map(([x, y, z]) => ({ x, y, z }));
  const boundsFailure = firstOutOfBoundsCell(occupiedCells);
  if (boundsFailure) return { rail: null, reason: `Out of bounds at ${formatVec(boundsFailure)}.` };

  const collision = firstCollidingRail(occupiedCells);
  if (collision !== null) return { rail: null, reason: `Collision with rail ${collision}.` };

  const railIndex = nextRailIndex(currentLayout);
  const exits = railConfig.exitsLogic.map((exit, index) => {
    const worldLogicPos = posRev.add(transformByRotAbs(exit.Pos, rotAbs));
    return {
      Index: index,
      Exit_Pos_Rev: worldLogicPos.toDict(),
      Exit_Pos_Abs: worldDict(worldLogicPos.toDict()),
      Exit_Rot_Abs: composeRotAbs(rotAbs, exit.LocalRot),
      Exit_Dir_Abs: exitDirFromLocalRot(rotAbs, exit.LocalRot),
      SpinDiff: [...exit.SpinDiff],
      IsConnected: false,
      TargetInstanceID: -1,
    };
  });

  return {
    rail: {
      Rail_Index: railIndex,
      Rail_ID: railConfig.rowName,
      Pos_Rev: posRev.toDict(),
      Pos_Abs: worldDict(posRev.toDict()),
      Rot_Abs: rotAbs,
      Dir_Abs: exitDirFromLocalRot(rotAbs, { p: 0, y: 0, r: 0 }),
      Size_Rev: railConfig.sizeRev.toDict(),
      Occupied_Cells_Rev: occupiedCells,
      Diff_Base: railConfig.diffBase,
      Diff_Act: railConfig.diffBase,
      Prev_Index: parent.Rail_Index,
      Next_Index: [],
      Exit: exits,
    },
  };
}

function placeBuildRail(target: BuildExitTarget): void {
  if (!buildSelection) return;
  const result = createBuildRail(target);
  if (!result.rail) {
    renderLog([{ kind: "warn", message: result.reason ?? "Cannot place selected rail here." }]);
    return;
  }

  const next = cloneLayout(currentLayout);
  const parent = next.Rail.find((rail) => rail.Rail_Index === target.parentRailId);
  if (!parent) return;
  const parentExit = parent.Exit[target.exitIndex];
  parentExit.IsConnected = true;
  parentExit.TargetInstanceID = result.rail.Rail_Index;
  if (!parent.Next_Index.includes(result.rail.Rail_Index)) parent.Next_Index.push(result.rail.Rail_Index);
  next.Rail.push(result.rail);
  updateLayoutMeta(next);
  selectedRail = null;
  selectedRailId = null;
  buildHoverTarget = null;
  buildPreviewMessage = `Placed rail ${result.rail.Rail_Index}. Hover another open exit.`;
  setLayout(next);
  viewer.setBuildMode(true);
  viewer.setBuildPreview(null);
  renderPartLibrary();
  updateEditorStatus();
  renderLog([{ kind: "success", message: `Placed ${result.rail.Rail_ID} on rail ${target.parentRailId} exit ${target.exitIndex} with local spin ${buildSelection.spin * 90}.` }]);
}

function nextRailIndex(layout: MazeLayout): number {
  return Math.max(-1, ...layout.Rail.map((rail) => rail.Rail_Index)) + 1;
}

function firstCollidingRail(cells: Vec3Dict[]): number | null {
  const occupied = new Map<string, number>();
  currentLayout.Rail.forEach((rail) => {
    rail.Occupied_Cells_Rev.forEach((cell) => occupied.set(cellKey(cell), rail.Rail_Index));
  });
  for (const cell of cells) {
    const existing = occupied.get(cellKey(cell));
    if (existing !== undefined) return existing;
  }
  return null;
}

function firstOutOfBoundsCell(cells: Vec3Dict[]): Vec3Dict | null {
  const bounds = currentBounds();
  const radius = {
    x: boundRadius(bounds.x),
    y: boundRadius(bounds.y),
    z: boundRadius(bounds.z),
  };
  return cells.find((cell) =>
    cell.x < -radius.x ||
    cell.x > radius.x ||
    cell.y < -radius.y ||
    cell.y > radius.y ||
    cell.z < -radius.z ||
    cell.z > radius.z,
  ) ?? null;
}

function cellKey(cell: Vec3Dict): string {
  return `${cell.x},${cell.y},${cell.z}`;
}


function layoutBounds(layout: MazeLayout): { min: Vec3Dict; max: Vec3Dict } {
  const cells = layout.Rail.flatMap((rail) => (rail.Occupied_Cells_Rev.length > 0 ? rail.Occupied_Cells_Rev : [rail.Pos_Rev]));
  return {
    min: {
      x: Math.min(...cells.map((cell) => cell.x)),
      y: Math.min(...cells.map((cell) => cell.y)),
      z: Math.min(...cells.map((cell) => cell.z)),
    },
    max: {
      x: Math.max(...cells.map((cell) => cell.x)),
      y: Math.max(...cells.map((cell) => cell.y)),
      z: Math.max(...cells.map((cell) => cell.z)),
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.max(low, Math.min(high, value));
}

function currentBounds(): Vec3Dict {
  const read = (input: HTMLInputElement, fallback: number) => {
    const value = Number(input.value);
    return Number.isFinite(value) ? normalizeBoundSize(value) : fallback;
  };
  return {
    x: read(boundX, DEFAULT_GENERATOR_OPTIONS.bounds.x),
    y: read(boundY, DEFAULT_GENERATOR_OPTIONS.bounds.y),
    z: read(boundZ, DEFAULT_GENERATOR_OPTIONS.bounds.z),
  };
}

function centerOffsetForBounds(layout: MazeLayout, bounds: Vec3Dict): Vec3Dict {
  const box = layoutBounds(layout);
  const radius = {
    x: boundRadius(bounds.x),
    y: boundRadius(bounds.y),
    z: boundRadius(bounds.z),
  };
  return {
    x: clamp(Math.round(-(box.min.x + box.max.x) / 2), -radius.x - box.min.x, radius.x - box.max.x),
    y: clamp(Math.round(-(box.min.y + box.max.y) / 2), -radius.y - box.min.y, radius.y - box.max.y),
    z: clamp(Math.round(-(box.min.z + box.max.z) / 2), -radius.z - box.min.z, radius.z - box.max.z),
  };
}

function translateLayout(layout: MazeLayout, offset: Vec3Dict): MazeLayout {
  const next = cloneLayout(layout);
  next.Rail.forEach((rail) => {
    rail.Pos_Rev = { x: rail.Pos_Rev.x + offset.x, y: rail.Pos_Rev.y + offset.y, z: rail.Pos_Rev.z + offset.z };
    rail.Pos_Abs = worldDict(rail.Pos_Rev);
    rail.Occupied_Cells_Rev = rail.Occupied_Cells_Rev.map((cell) => ({ x: cell.x + offset.x, y: cell.y + offset.y, z: cell.z + offset.z }));
    rail.Exit = rail.Exit.map((exit) => {
      const exitPos = { x: exit.Exit_Pos_Rev.x + offset.x, y: exit.Exit_Pos_Rev.y + offset.y, z: exit.Exit_Pos_Rev.z + offset.z };
      return { ...exit, Exit_Pos_Rev: exitPos, Exit_Pos_Abs: worldDict(exitPos) };
    });
  });
  return next;
}

function moveLayoutToCenter(): void {
  const offset = centerOffsetForBounds(currentLayout, currentBounds());
  setLayout(translateLayout(currentLayout, offset));
  renderLog([{ kind: "info", message: `Moved layout by grid offset (${offset.x}, ${offset.y}, ${offset.z}).` }]);
}

function fitLayoutBounds(): void {
  const box = layoutBounds(currentLayout);
  const fitted = {
    x: normalizeBoundSize(box.max.x - box.min.x + 1),
    y: normalizeBoundSize(box.max.y - box.min.y + 1),
    z: normalizeBoundSize(box.max.z - box.min.z + 1),
  };
  boundX.value = String(fitted.x);
  boundY.value = String(fitted.y);
  boundZ.value = String(fitted.z);
  const offset = centerOffsetForBounds(currentLayout, fitted);
  setLayout(translateLayout(currentLayout, offset));
  renderLog([{ kind: "info", message: `Fitted bounds to ${fitted.x}/${fitted.y}/${fitted.z} and centered by (${offset.x}, ${offset.y}, ${offset.z}).` }]);
}

function deleteRail(railId: number): void {
  const target = currentLayout.Rail.find((rail) => rail.Rail_Index === railId);
  if (!target) return;
  const next = cloneLayout(currentLayout);
  next.Rail = next.Rail
    .filter((rail) => rail.Rail_Index !== railId)
    .map((rail) => ({
      ...rail,
      Prev_Index: rail.Prev_Index === railId ? -1 : rail.Prev_Index,
      Next_Index: rail.Next_Index.filter((index) => index !== railId),
      Exit: rail.Exit.map((exit) => exit.TargetInstanceID === railId
        ? { ...exit, IsConnected: false, TargetInstanceID: -1 }
        : exit),
    }));
  updateLayoutMeta(next);
  selectedRail = null;
  selectedRailId = null;
  setLayout(next);
  renderLog([{ kind: "warn", message: `Deleted rail ${railId} (${target.Rail_ID}).` }]);
}

function applyRailEdit(action: RailEditAction): void {
  if (action.mode === "move") {
    moveRail(action.railId, axisOffset(action.axis, action.sign, action.amount ?? 1));
  } else {
    rotateRail(action.railId, action.axis, action.sign, action.amount ?? 1);
  }
}

function axisOffset(axis: RailEditAction["axis"], sign: 1 | -1, amount: number): Vec3Dict {
  const step = sign * Math.max(1, Math.floor(amount));
  return {
    x: axis === "x" ? step : 0,
    y: axis === "y" ? step : 0,
    z: axis === "z" ? step : 0,
  };
}

function moveRail(railId: number, offset: Vec3Dict): void {
  const next = cloneLayout(currentLayout);
  const rail = next.Rail.find((item) => item.Rail_Index === railId);
  if (!rail) return;
  rail.Pos_Rev = { x: rail.Pos_Rev.x + offset.x, y: rail.Pos_Rev.y + offset.y, z: rail.Pos_Rev.z + offset.z };
  Object.assign(rail, recalculateRailGeometry(rail));
  updateLayoutMeta(next);
  setLayout(next, railId);
  renderLog([{ kind: "info", message: `Moved rail ${railId} by (${offset.x}, ${offset.y}, ${offset.z}).` }]);
}

function rotateRail(railId: number, axis: RailEditAction["axis"], sign: 1 | -1, amount: number): void {
  const next = cloneLayout(currentLayout);
  const rail = next.Rail.find((item) => item.Rail_Index === railId);
  if (!rail) return;
  const steps = Math.max(1, Math.floor(amount));
  const delta = sign * 90 * steps;
  rail.Rot_Abs = normalizeRot({
    p: rail.Rot_Abs.p + (axis === "y" ? delta : 0),
    y: rail.Rot_Abs.y + (axis === "z" ? delta : 0),
    r: rail.Rot_Abs.r + (axis === "x" ? delta : 0),
  });
  Object.assign(rail, recalculateRailGeometry(rail));
  updateLayoutMeta(next);
  setLayout(next, railId);
  renderLog([{ kind: "info", message: `Rotated rail ${railId} ${axis.toUpperCase()}${sign > 0 ? "+" : "-"}${90 * steps}.` }]);
}

function toggleEditorMode(): void {
  editorMode = editorMode === "move" ? "rotate" : "move";
  viewer.setEditorMode(editorMode);
  renderRailDetail(selectedRail);
  updateEditorStatus();
  renderLog([{ kind: "info", message: `Editor mode: ${editorMode}.` }]);
}

function toggleDeleteMode(): void {
  deleteMode = !deleteMode;
  if (deleteMode) {
    selectedRail = null;
    selectedRailId = null;
    viewer.selectRail(null);
  }
  renderRailDetail(selectedRail);
  updateEditorStatus();
  renderLog([{ kind: "warn", message: `Delete mode ${deleteMode ? "enabled" : "disabled"}.` }]);
}

function updateEditorStatus(): void {
  if (buildSelection) {
    const family = findBuildFamily(buildSelection.familyKey);
    const sizeCount = family?.variants.length ?? 1;
    editorStatus.textContent = `Build: ${buildSelection.railId} · Size ${buildSelection.sizeIndex + 1}/${sizeCount} · Spin ${buildSelection.spin * 90} · ${buildPreviewMessage} · X exit`;
    editorStatus.classList.remove("is-delete", "is-rotate");
    editorStatus.classList.add("is-build");
    buildHint.textContent = buildPreviewMessage;
    return;
  }

  const mode = deleteMode ? "Delete" : editorMode === "move" ? "Move" : "Rotate";
  const target = selectedRailId === null ? "No selection" : `Rail ${selectedRailId}`;
  editorStatus.textContent = `Mode: ${mode} · ${target}`;
  editorStatus.classList.remove("is-build");
  editorStatus.classList.toggle("is-delete", deleteMode);
  editorStatus.classList.toggle("is-rotate", !deleteMode && editorMode === "rotate");
  buildHint.textContent = "Select a rail to build from open exits.";
}

function handleEditorKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, select")) return;
  if (buildSelection) {
    const key = event.key.toLowerCase();
    if (key === "x" || event.key === "Escape") {
      event.preventDefault();
      exitBuildMode("Build mode exited.");
    } else if (key === "r") {
      event.preventDefault();
      rotateBuildSpin();
    } else if (/^[1-4]$/.test(event.key)) {
      event.preventDefault();
      switchBuildSize(Number(event.key));
    }
    return;
  }
  if (target?.closest("button")) return;
  if (event.key.toLowerCase() === "x") {
    event.preventDefault();
    if (selectedRailId !== null) {
      deleteRail(selectedRailId);
    } else {
      toggleDeleteMode();
    }
  } else if (event.code === "Space" && selectedRailId !== null) {
    event.preventDefault();
    toggleEditorMode();
  }
}

function renderLog(logs: { kind: string; message: string }[]): void {
  logContent.innerHTML = logs
    .slice(-80)
    .map((entry) => `<div class="log-line ${entry.kind}">${markLatin(entry.message)}</div>`)
    .join("");
  logContent.scrollTop = logContent.scrollHeight;
}

function randomizeSeed(): void {
  const state = createRandomSeedState();
  seedInput.value = encodeSeedState(state);
  generateLayout(state);
}

function toggleLogDock(): void {
  const isCollapsed = logDock.classList.toggle("is-collapsed");
  logToggleBtn.title = isCollapsed ? "展开生成日志内容。" : "收起生成日志内容。";
  logToggleBtn.setAttribute("aria-expanded", String(!isCollapsed));
}

function toggleSection(button: HTMLButtonElement): void {
  const target = button.dataset.collapseTarget;
  if (!target) return;

  const section = document.querySelector<HTMLElement>(`.collapsible-section[data-panel="${target}"]`);
  if (!section) return;

  const isCollapsed = section.classList.toggle("is-collapsed");
  const title = section.querySelector("h2")?.textContent ?? "Panel";
  button.title = `${isCollapsed ? "展开" : "收起"} ${title} 面板。`;
  button.setAttribute("aria-expanded", String(!isCollapsed));
}

function refreshBoundsOnly(): void {
  normalizeBoundInputs();
  viewer.setBounds(currentBounds());
  viewer.setLayout(currentLayout);
  buildHoverTarget = null;
  updateBuildPreview();
}

function normalizeBoundInputs(): void {
  [boundX, boundY, boundZ].forEach((input) => {
    const value = Number(input.value);
    if (Number.isFinite(value)) input.value = String(normalizeBoundSize(value));
  });
}

function normalizeBoundSize(value: number): number {
  const whole = Math.max(1, Math.round(value));
  return whole % 2 === 0 ? whole + 1 : whole;
}

function boundRadius(size: number): number {
  return Math.max(0, Math.floor((size - 1) / 2));
}

function updateFocusButton(): void {
  const current = focusMode === "maze" ? "Focus: Maze" : "Focus: Bounds";
  const next = focusMode === "maze" ? "Focus: Bounds" : "Focus: Maze";
  focusToggleBtn.dataset.current = current;
  focusToggleBtn.dataset.next = next;
}

function downloadLayout(): void {
  const blob = new Blob([JSON.stringify(currentLayout, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `maze_layout_${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function handleFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? "");
    if (file.name.toLowerCase().endsWith(".json")) {
      const layout = JSON.parse(text) as MazeLayout;
      const restoredSeed = restoreSeedFromLayout(layout);
      setLayout(layout);
      renderLog([{ kind: "info", message: restoredSeed ? `Loaded ${file.name}; restored seed ${restoredSeed}` : `Loaded ${file.name}` }]);
    } else {
      csvText = text;
      if (buildSelection && !findBuildFamily(buildSelection.familyKey)) exitBuildMode("Build mode exited because the CSV changed.");
      renderPartLibrary();
      generateFromSeedInput();
    }
  };
  reader.readAsText(file);
}

function formatVec(vec: { x: number; y: number; z: number }): string {
  return `(${fmt(vec.x)}, ${fmt(vec.y)}, ${fmt(vec.z)})`;
}

function fmt(value: number): string {
  return Number(value.toFixed(3)).toString();
}

generateBtn.addEventListener("click", regenerateWithCurrentConfig);
downloadBtn.addEventListener("click", downloadLayout);
resetCameraBtn.addEventListener("click", () => viewer.resetCamera());
randomSeedBtn.addEventListener("click", randomizeSeed);
seedInput.addEventListener("input", () => {
  window.clearTimeout(seedInputTimer);
  seedInputTimer = window.setTimeout(generateFromSeedInput, 250);
});
logToggleBtn.addEventListener("click", toggleLogDock);
collapseToggles.forEach((button) => button.addEventListener("click", () => toggleSection(button)));
moveCenterBtn.addEventListener("click", moveLayoutToCenter);
fitBoundsBtn.addEventListener("click", fitLayoutBounds);
historyBackBtn.addEventListener("click", () => viewer.goBack());
historyForwardBtn.addEventListener("click", () => viewer.goForward());
projectionToggleBtn.addEventListener("click", () => {
  const mode = viewer.toggleProjection();
  projectionToggleBtn.textContent = mode === "perspective" ? "透视" : "无透视";
});
focusToggleBtn.addEventListener("click", () => {
  focusMode = focusMode === "maze" ? "bounds" : "maze";
  if (focusMode === "maze") {
    viewer.focusMaze();
  } else {
    viewer.focusBounds(currentBounds());
  }
  updateFocusButton();
});
partTabs.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-group]");
  if (!button) return;
  buildActiveGroup = button.dataset.group as BuildGroupId;
  renderPartLibrary();
});
descTabs.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-desc]");
  if (!button) return;
  buildActiveDescriptor = button.dataset.desc ?? "Normal";
  renderPartLibrary();
});
partStrip.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-family-key]");
  const familyKey = button?.dataset.familyKey;
  if (!familyKey) return;
  selectBuildFamily(familyKey);
});
[boundX, boundY, boundZ].forEach((input) => input.addEventListener("input", refreshBoundsOnly));
window.addEventListener("keydown", handleEditorKeydown);
viewAxis.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-view]");
  if (!button) return;
  viewer.focusView(button.dataset.view as "iso" | "top" | "front" | "back" | "left" | "right");
});
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-over"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-over");
  const file = event.dataTransfer?.files[0];
  if (file) handleFile(file);
});

updateFocusButton();
renderPartLibrary();
updateEditorStatus();
generateFromSeedInput();
gsap.from(".panel", { x: -20, opacity: 0, duration: 0.45, ease: "power3.out" });
gsap.from(".log-dock", { y: 18, opacity: 0, duration: 0.45, delay: 0.12, ease: "power3.out" });
