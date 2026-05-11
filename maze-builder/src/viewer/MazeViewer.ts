import gsap from "gsap";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GRID_TO_WORLD_SCALE } from "../maze/constants";
import { DirAbs, MazeLayout, MazeRailJson, RotAbs, Vec3Dict } from "../maze/types";

export interface RailMeta {
  id: number;
  type: string;
  pos: Vec3Dict;
  posRev: Vec3Dict;
  rot: { p: number; y: number; r: number };
  diff: number;
  cumulativeDiff: number;
  segmentDiff: number;
}

export type EditorMode = "move" | "rotate";
export interface RailEditAction {
  railId: number;
  mode: EditorMode;
  axis: "x" | "y" | "z";
  sign: 1 | -1;
  amount?: number;
}

export interface BuildExitTarget {
  parentRailId: number;
  exitIndex: number;
  isConnected: boolean;
  exitPosRev: Vec3Dict;
  exitPosAbs: Vec3Dict;
  exitRotAbs: RotAbs;
  exitDirAbs: DirAbs;
  spinDiffs: number[];
}

interface PointerState {
  x: number;
  y: number;
  action: RailEditAction | null;
  axisViewDir: THREE.Vector2 | null;
  appliedSteps: number;
  draggingGizmo: boolean;
}

interface VisualBounds {
  center: THREE.Vector3;
  size: THREE.Vector3;
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export class MazeViewer {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private root?: THREE.Group;
  private spriteMap = new Map<number, THREE.Sprite>();
  private railDataMap = new Map<number, RailMeta>();
  private railMarkerMap = new Map<number, THREE.Object3D[]>();
  private exitMarkerMap = new Map<string, THREE.Object3D>();
  private editGizmo?: THREE.Group;
  private buildPreviewGroup?: THREE.Group;
  private editorMode: EditorMode = "move";
  private buildMode = false;
  private pointerState: PointerState | null = null;
  private lastHoveredId: number | null = null;
  private buildHoveredExitKey: string | null = null;
  private selectedId: number | null = null;
  private highlightedMarkers: THREE.Object3D[] = [];
  private activeLayout?: MazeLayout;
  private bounds: Vec3Dict = { x: 4, y: 4, z: 1 };
  private focusHistory: THREE.Vector3[] = [new THREE.Vector3(0, 0, 0)];
  private focusHistoryIndex = 0;
  private projectionMode: "perspective" | "orthographic" = "perspective";
  private readonly orthoHeight = 260;
  onHover?: (rail: RailMeta | null) => void;
  onSelect?: (rail: RailMeta | null) => void;
  onEdit?: (action: RailEditAction) => void;
  onBuildHover?: (target: BuildExitTarget | null) => void;
  onBuildPlace?: (target: BuildExitTarget) => void;

  constructor(private host: HTMLElement) {
    this.scene.background = new THREE.Color(0xfbfbf8);
    this.camera = this.createPerspectiveCamera();
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(130, -150, 115);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);

    this.setupBaseScene();
    this.renderer.domElement.addEventListener("mousemove", this.handleMouseMove);
    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerup", this.handlePointerUp);
    this.renderer.domElement.addEventListener("pointercancel", this.handlePointerCancel);
    window.addEventListener("resize", this.resize);
    this.animate();
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener("mousemove", this.handleMouseMove);
    this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerup", this.handlePointerUp);
    this.renderer.domElement.removeEventListener("pointercancel", this.handlePointerCancel);
    window.removeEventListener("resize", this.resize);
    this.renderer.dispose();
    this.host.innerHTML = "";
  }

  setLayout(layout: MazeLayout, selectedId: number | null = null, animate = true): void {
    this.activeLayout = layout;
    this.clearBuildPreview();
    if (this.root) this.scene.remove(this.root);
    if (this.editGizmo) {
      this.scene.remove(this.editGizmo);
      this.editGizmo = undefined;
    }
    this.root = new THREE.Group();
    this.root.name = "MazeRoot";
    this.scene.add(this.root);
    this.spriteMap.clear();
    this.railDataMap.clear();
    this.railMarkerMap.clear();
    this.exitMarkerMap.clear();
    this.lastHoveredId = null;
    this.buildHoveredExitKey = null;
    this.selectedId = selectedId;
    this.highlightedMarkers = [];

    this.drawBounds();
    this.drawRails(layout.Rail);
    this.refreshEditGizmo();
    if (animate) {
      gsap.fromTo(this.root.scale, { x: 0.96, y: 0.96, z: 0.96 }, { x: 1, y: 1, z: 1, duration: 0.55, ease: "power3.out" });
      gsap.fromTo(this.root.position, { z: -8 }, { z: 0, duration: 0.55, ease: "power3.out" });
    }
  }

  setEditorMode(mode: EditorMode): void {
    this.editorMode = mode;
    this.refreshEditGizmo();
  }

  setBuildMode(active: boolean): void {
    this.buildMode = active;
    this.host.classList.toggle("is-building", active);
    if (active) {
      this.setSelection(null);
    } else {
      this.setBuildExitHover(null);
      this.clearBuildPreview();
    }
    this.refreshEditGizmo();
  }

  setBuildPreview(rail: MazeRailJson | null): void {
    this.clearBuildPreview();
    if (!rail || !this.root) return;
    this.buildPreviewGroup = this.createBuildPreview(rail);
    this.root.add(this.buildPreviewGroup);
  }

  selectRail(id: number | null): void {
    this.setSelection(id);
  }

  setBounds(bounds: Vec3Dict): void {
    this.bounds = bounds;
  }

  toggleProjection(): "perspective" | "orthographic" {
    this.setProjectionMode(this.projectionMode === "perspective" ? "orthographic" : "perspective");
    return this.projectionMode;
  }

  setProjectionMode(mode: "perspective" | "orthographic"): void {
    if (mode === this.projectionMode) return;
    const position = this.camera.position.clone();
    const up = this.camera.up.clone();
    const target = this.controls.target.clone();
    this.projectionMode = mode;
    this.controls.dispose();
    this.camera = mode === "perspective" ? this.createPerspectiveCamera() : this.createOrthographicCamera();
    this.camera.position.copy(position);
    this.camera.up.copy(up);
    this.camera.lookAt(target);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.copy(target);
    this.resize();
  }

  focusView(view: "iso" | "top" | "front" | "back" | "left" | "right"): void {
    const target = this.controls.target.clone();
    const distance = Math.max(this.camera.position.distanceTo(target), 160);
    const directions = {
      iso: new THREE.Vector3(1, -1, 0.8).normalize(),
      top: new THREE.Vector3(0, 0, 1),
      front: new THREE.Vector3(0, -1, 0),
      back: new THREE.Vector3(0, 1, 0),
      left: new THREE.Vector3(-1, 0, 0),
      right: new THREE.Vector3(1, 0, 0),
    };
    const up = view === "top" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const nextPosition = target.clone().add(directions[view].multiplyScalar(distance));
    this.camera.up.copy(up);
    gsap.to(this.camera.position, {
      x: nextPosition.x,
      y: nextPosition.y,
      z: nextPosition.z,
      duration: 0.45,
      ease: "power3.inOut",
      onUpdate: () => this.camera.lookAt(this.controls.target),
    });
  }

  resetCamera(): void {
    this.moveFocus(new THREE.Vector3(0, 0, 0), true);
    gsap.to(this.camera.position, { x: 130, y: -150, z: 115, duration: 0.6, ease: "power3.inOut" });
  }

  focusMaze(): void {
    this.moveFocus(this.getMazeCenter(), true);
  }

  focusBounds(bounds: Vec3Dict): void {
    const radiusZ = Math.max(0, Math.floor((bounds.z - 1) / 2));
    this.moveFocus(new THREE.Vector3(0, 0, radiusZ * GRID_TO_WORLD_SCALE * 0.5), true);
  }

  goBack(): void {
    if (this.focusHistoryIndex <= 0) return;
    this.focusHistoryIndex -= 1;
    this.moveFocus(this.focusHistory[this.focusHistoryIndex], false);
  }

  goForward(): void {
    if (this.focusHistoryIndex >= this.focusHistory.length - 1) return;
    this.focusHistoryIndex += 1;
    this.moveFocus(this.focusHistory[this.focusHistoryIndex], false);
  }

  private moveFocus(target: THREE.Vector3, pushHistory: boolean): void {
    const current = this.controls.target;
    const cameraDelta = this.camera.position.clone().sub(current);

    if (pushHistory) {
      this.focusHistory = this.focusHistory.slice(0, this.focusHistoryIndex + 1);
      const last = this.focusHistory[this.focusHistory.length - 1];
      if (!last || last.distanceTo(target) > 0.01) {
        this.focusHistory.push(target.clone());
        this.focusHistoryIndex = this.focusHistory.length - 1;
      }
    }

    gsap.to(this.controls.target, { x: target.x, y: target.y, z: target.z, duration: 0.55, ease: "power3.inOut" });
    gsap.to(this.camera.position, {
      x: target.x + cameraDelta.x,
      y: target.y + cameraDelta.y,
      z: target.z + cameraDelta.z,
      duration: 0.55,
      ease: "power3.inOut",
    });
  }

  private createPerspectiveCamera(): THREE.PerspectiveCamera {
    return new THREE.PerspectiveCamera(60, this.host.clientWidth / Math.max(this.host.clientHeight, 1), 1, 5000);
  }

  private createOrthographicCamera(): THREE.OrthographicCamera {
    const aspect = this.host.clientWidth / Math.max(this.host.clientHeight, 1);
    const halfHeight = this.orthoHeight / 2;
    return new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, 1, 5000);
  }

  private updateCameraProjection(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = width / height;
    } else {
      const halfHeight = this.orthoHeight / 2;
      const halfWidth = halfHeight * (width / height);
      this.camera.left = -halfWidth;
      this.camera.right = halfWidth;
      this.camera.top = halfHeight;
      this.camera.bottom = -halfHeight;
    }
    this.camera.updateProjectionMatrix();
  }

  private getMazeCenter(): THREE.Vector3 {
    const rails = this.activeLayout?.Rail ?? [];
    const cells = rails.flatMap((rail) => (rail.Occupied_Cells_Rev.length > 0 ? rail.Occupied_Cells_Rev : [rail.Pos_Rev]));
    if (cells.length === 0) return new THREE.Vector3(0, 0, 0);

    const xs = cells.map((cell) => cell.x * GRID_TO_WORLD_SCALE);
    const ys = cells.map((cell) => -cell.y * GRID_TO_WORLD_SCALE);
    const zs = cells.map((cell) => cell.z * GRID_TO_WORLD_SCALE);
    return new THREE.Vector3(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
      (Math.min(...zs) + Math.max(...zs)) / 2,
    );
  }

  private setupBaseScene(): void {
    const gridSize = 3200;
    const gridDivisions = gridSize / GRID_TO_WORLD_SCALE;
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0xd6d8d4, 0xeeeeea);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.set(GRID_TO_WORLD_SCALE / 2, GRID_TO_WORLD_SCALE / 2, 0);
    this.scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(50);
    axesHelper.scale.set(1, -1, 1);
    this.scene.add(axesHelper);

    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(50, 200, 120);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  }

  private drawBounds(): void {
    if (!this.root) return;
    const half = GRID_TO_WORLD_SCALE / 2;
    const radiusX = Math.max(0, Math.floor((this.bounds.x - 1) / 2));
    const radiusY = Math.max(0, Math.floor((this.bounds.y - 1) / 2));
    const radiusZ = Math.max(0, Math.floor((this.bounds.z - 1) / 2));
    const minX = -radiusX * GRID_TO_WORLD_SCALE - half;
    const maxX = radiusX * GRID_TO_WORLD_SCALE + half;
    const minY = -radiusY * GRID_TO_WORLD_SCALE - half;
    const maxY = radiusY * GRID_TO_WORLD_SCALE + half;
    const minZ = -radiusZ * GRID_TO_WORLD_SCALE - half;
    const maxZ = radiusZ * GRID_TO_WORLD_SCALE + half;
    const boxGeo = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineDashedMaterial({ color: 0x9da39f, dashSize: 4, gapSize: 2, transparent: true, opacity: 0.7 }),
    );
    line.computeLineDistances();
    line.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    this.root.add(line);
  }

  private drawRails(rails: MazeRailJson[]): void {
    if (!this.root) return;
    const difficultyByRail = this.calculateRailDifficulties(rails);
    const violationCells = this.calculateViolationCells(rails);

    rails.forEach((rail) => {
      const { center, size } = this.railBounds(rail);
      const color = this.railColor(rail.Rail_ID);
      const meta: RailMeta = {
        id: rail.Rail_Index,
        type: rail.Rail_ID,
        pos: rail.Pos_Abs,
        posRev: rail.Pos_Rev,
        rot: rail.Rot_Abs,
        diff: rail.Diff_Act,
        cumulativeDiff: difficultyByRail.get(rail.Rail_Index)?.cumulativeDiff ?? rail.Diff_Act,
        segmentDiff: difficultyByRail.get(rail.Rail_Index)?.segmentDiff ?? rail.Diff_Act,
      };
      this.railDataMap.set(rail.Rail_Index, meta);
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        this.railMaterials(color, this.localBottomMaterialIndex(rail.Rot_Abs)),
      );
      block.position.copy(center);
      block.userData.isBlock = true;
      block.userData.railMeta = meta;
      this.root?.add(block);
      this.addTextSprite(rail.Rail_Index, new THREE.Vector3(center.x, center.y, center.z));
    });

    this.drawViolationCells(violationCells);

    rails.forEach((rail) => {
      const enterDir = this.forwardDirFromRotAbs(rail.Rot_Abs);
      this.addRailMarker(rail.Rail_Index, this.createEnterMarker(rail.Pos_Abs, enterDir, rail.Rot_Abs));

      rail.Exit.forEach((exit) => {
        this.addRailMarker(rail.Rail_Index, this.createExitMarker(rail.Rail_Index, exit));
      });

      const prev = rails.find((candidate) => candidate.Rail_Index === rail.Prev_Index);
      if (prev) {
        const pts = [
          this.absToView(prev.Pos_Abs),
          this.absToView(rail.Pos_Abs),
        ];
        this.root?.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x303633, opacity: 0.22, transparent: true })));
      }
    });
  }

  private calculateViolationCells(rails: MazeRailJson[]): Set<string> {
    const counts = new Map<string, number>();
    const key = (cell: Vec3Dict) => `${cell.x},${cell.y},${cell.z}`;
    rails.forEach((rail) => {
      this.visualCellsForRail(rail).forEach((cell) => counts.set(key(cell), (counts.get(key(cell)) ?? 0) + 1));
    });

    const radiusX = Math.max(0, Math.floor((this.bounds.x - 1) / 2));
    const radiusY = Math.max(0, Math.floor((this.bounds.y - 1) / 2));
    const radiusZ = Math.max(0, Math.floor((this.bounds.z - 1) / 2));
    const invalid = new Set<string>();
    rails.forEach((rail) => {
      this.visualCellsForRail(rail).forEach((cell) => {
        const cellKey = key(cell);
        const overlaps = (counts.get(cellKey) ?? 0) > 1;
        const outOfBounds = cell.x < -radiusX || cell.x > radiusX || cell.y < -radiusY || cell.y > radiusY || cell.z < -radiusZ || cell.z > radiusZ;
        if (overlaps || outOfBounds) invalid.add(cellKey);
      });
    });
    return invalid;
  }

  private drawViolationCells(cells: Set<string>): void {
    if (!this.root || cells.size === 0) return;
    const material = new THREE.MeshLambertMaterial({
      color: 0xf03b3b,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
      depthWrite: false,
    });
    cells.forEach((cellKey) => {
      const [x, y, z] = cellKey.split(",").map(Number);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(GRID_TO_WORLD_SCALE - 0.8, GRID_TO_WORLD_SCALE - 0.8, GRID_TO_WORLD_SCALE - 0.8),
        material.clone(),
      );
      mesh.position.set(x * GRID_TO_WORLD_SCALE, -y * GRID_TO_WORLD_SCALE, z * GRID_TO_WORLD_SCALE);
      mesh.renderOrder = 30;
      this.root?.add(mesh);
    });
  }

  private calculateRailDifficulties(rails: MazeRailJson[]): Map<number, { cumulativeDiff: number; segmentDiff: number }> {
    const result = new Map<number, { cumulativeDiff: number; segmentDiff: number }>();
    let cumulativeDiff = 0;
    let segmentDiff = 0;

    [...rails]
      .sort((a, b) => a.Rail_Index - b.Rail_Index)
      .forEach((rail) => {
        cumulativeDiff += rail.Diff_Act;
        segmentDiff += rail.Diff_Act;
        result.set(rail.Rail_Index, {
          cumulativeDiff,
          segmentDiff,
        });

        if (rail.Rail_ID.toLowerCase().includes("checkpoint")) {
          segmentDiff = 0;
        }
      });

    return result;
  }

  private railBounds(rail: MazeRailJson): VisualBounds {
    const cells = this.visualCellsForRail(rail);
    const xs = cells.map((cell) => cell.x * GRID_TO_WORLD_SCALE);
    const ys = cells.map((cell) => -cell.y * GRID_TO_WORLD_SCALE);
    const zs = cells.map((cell) => cell.z * GRID_TO_WORLD_SCALE);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    const size = new THREE.Vector3(maxX - minX + GRID_TO_WORLD_SCALE - 1, maxY - minY + GRID_TO_WORLD_SCALE - 1, maxZ - minZ + GRID_TO_WORLD_SCALE - 1);
    const half = size.clone().multiplyScalar(0.5);
    return {
      center,
      size,
      min: center.clone().sub(half),
      max: center.clone().add(half),
    };
  }

  private visualCellsForRail(rail: MazeRailJson): Vec3Dict[] {
    return rail.Occupied_Cells_Rev.length > 0 ? rail.Occupied_Cells_Rev : [rail.Pos_Rev];
  }

  private absToView(pos: Vec3Dict): THREE.Vector3 {
    return new THREE.Vector3(pos.x, -pos.y, pos.z);
  }

  private createEnterMarker(posAbs: Vec3Dict, dirAbs: string, rotAbs: { p?: number; y?: number; r?: number }): THREE.Object3D {
    const size = GRID_TO_WORLD_SCALE / 3;
    const depth = 0.8;
    const shape = new THREE.Shape();
    shape.moveTo(0, size * 0.58);
    shape.lineTo(-size * 0.46, -size * 0.38);
    shape.lineTo(size * 0.46, -size * 0.38);
    shape.lineTo(0, size * 0.58);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.translate(0, 0, -depth / 2);
    const marker = new THREE.Mesh(
      geometry,
      this.markerMaterial(0x2856ff),
    );
    marker.position.copy(this.markerPosition(posAbs, dirAbs));
    marker.quaternion.copy(this.markerQuaternion(dirAbs, rotAbs));
    marker.renderOrder = 20;
    return marker;
  }

  private createExitMarker(parentRailId: number, exit: MazeRailJson["Exit"][number]): THREE.Object3D {
    const group = new THREE.Group();
    group.position.copy(this.markerPosition(exit.Exit_Pos_Abs, exit.Exit_Dir_Abs));
    group.quaternion.copy(this.markerQuaternion(exit.Exit_Dir_Abs, exit.Exit_Rot_Abs));
    group.renderOrder = 20;
    const target: BuildExitTarget = {
      parentRailId,
      exitIndex: exit.Index,
      isConnected: exit.IsConnected,
      exitPosRev: exit.Exit_Pos_Rev,
      exitPosAbs: exit.Exit_Pos_Abs,
      exitRotAbs: exit.Exit_Rot_Abs,
      exitDirAbs: exit.Exit_Dir_Abs,
      spinDiffs: this.exitSpinDiffs(exit),
    };
    const markerKey = this.exitKey(parentRailId, exit.Index);
    group.userData.isExitMarker = true;
    group.userData.buildTarget = target;
    group.userData.exitMarkerKey = markerKey;

    const color = exit.IsConnected ? 0x46d483 : 0xf06363;
    const material = this.markerMaterial(color);
    const size = GRID_TO_WORLD_SCALE / 3;
    const half = size * 0.42;
    const length = size * 0.72;
    const apex = new THREE.Vector3(0, length * 0.5, 0);
    const baseY = -length * 0.5;
    const corners = [
      new THREE.Vector3(-half, baseY, -half),
      new THREE.Vector3(half, baseY, -half),
      new THREE.Vector3(half, baseY, half),
      new THREE.Vector3(-half, baseY, half),
    ];
    const spinDiffs = this.exitSpinDiffs(exit);

    spinDiffs.forEach((ratio, index) => {
      if (ratio <= 0) return;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        apex,
        corners[index],
        corners[(index + 1) % corners.length],
      ]);
      geometry.setIndex([0, 1, 2]);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.renderOrder = 20;
      mesh.userData.isExitMarker = true;
      mesh.userData.buildTarget = target;
      mesh.userData.exitMarkerKey = markerKey;
      group.add(mesh);
    });

    const base = new THREE.BufferGeometry().setFromPoints(corners);
    base.setIndex([0, 1, 2, 0, 2, 3]);
    base.computeVertexNormals();
    const baseMesh = new THREE.Mesh(base, material.clone());
    baseMesh.renderOrder = 20;
    baseMesh.userData.isExitMarker = true;
    baseMesh.userData.buildTarget = target;
    baseMesh.userData.exitMarkerKey = markerKey;
    group.add(baseMesh);

    const hitMesh = new THREE.Mesh(
      new THREE.SphereGeometry(GRID_TO_WORLD_SCALE * 0.42, 16, 10),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hitMesh.userData.isExitMarker = true;
    hitMesh.userData.buildTarget = target;
    hitMesh.userData.exitMarkerKey = markerKey;
    group.add(hitMesh);

    this.exitMarkerMap.set(markerKey, group);

    return group;
  }

  private markerMaterial(color: THREE.ColorRepresentation): THREE.MeshLambertMaterial {
    return new THREE.MeshLambertMaterial({
      color,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
  }

  private exitSpinDiffs(exit: MazeRailJson["Exit"][number]): number[] {
    return exit.SpinDiff?.length ? exit.SpinDiff : [1, 1, 1, 1];
  }

  private markerPosition(posAbs: Vec3Dict, dirAbs: string): THREE.Vector3 {
    return this.absToView(posAbs).add(this.getDirVector(dirAbs).normalize().multiplyScalar(-GRID_TO_WORLD_SCALE / 2));
  }

  private addRailMarker(railId: number, marker: THREE.Object3D): void {
    this.root?.add(marker);
    const current = this.railMarkerMap.get(railId) ?? [];
    current.push(marker);
    this.railMarkerMap.set(railId, current);
  }

  private exitKey(parentRailId: number, exitIndex: number): string {
    return `${parentRailId}:${exitIndex}`;
  }

  private createBuildPreview(rail: MazeRailJson): THREE.Group {
    const group = new THREE.Group();
    group.name = "BuildPreview";
    const { center, size } = this.railBounds(rail);
    const material = new THREE.MeshLambertMaterial({
      color: 0xffe873,
      transparent: true,
      opacity: 0.36,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
    mesh.position.copy(center);
    mesh.renderOrder = 34;
    group.add(mesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
      new THREE.LineBasicMaterial({ color: 0x28302d, transparent: true, opacity: 0.58, depthTest: false }),
    );
    edges.position.copy(center);
    edges.renderOrder = 35;
    group.add(edges);

    return group;
  }

  private clearBuildPreview(): void {
    if (!this.buildPreviewGroup) return;
    this.buildPreviewGroup.parent?.remove(this.buildPreviewGroup);
    this.buildPreviewGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose());
      } else {
        material?.dispose?.();
      }
    });
    this.buildPreviewGroup = undefined;
  }

  private markerQuaternion(dirAbs: string, rotAbs: { p?: number; y?: number; r?: number }): THREE.Quaternion {
    const dir = this.getDirVector(dirAbs).normalize();
    let up = this.logicalAxisToViewVector(this.transformLogicalAxis({ x: 0, y: 0, z: 1 }, rotAbs));
    if (Math.abs(dir.dot(up)) > 0.99) up = Math.abs(dir.z) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    up = new THREE.Vector3().crossVectors(right, dir).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, dir, up));
  }

  private logicalAxisToViewVector(axis: { x: number; y: number; z: number }): THREE.Vector3 {
    return new THREE.Vector3(axis.x, -axis.y, axis.z).normalize();
  }

  private addTextSprite(id: number, pos: THREE.Vector3): void {
    if (!this.root) return;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = '700 58px "JetBrains Mono", "Maple Mono NF CN", "Maple Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "#101214";
    ctx.lineWidth = 5;
    ctx.strokeText(String(id), 64, 64);
    ctx.fillText(String(id), 64, 64);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
    sprite.scale.set(8, 8, 1);
    sprite.position.copy(pos);
    sprite.renderOrder = 10;
    sprite.userData = { isText: true, id };
    this.spriteMap.set(id, sprite);
    this.root.add(sprite);
  }

  private handleMouseMove = (event: MouseEvent): void => {
    if (this.pointerState?.draggingGizmo) return;
    if (this.buildMode) {
      const target = this.pickBuildExit(event);
      this.setBuildExitHover(target);
      this.onBuildHover?.(target);
      return;
    }
    const found = this.pickRail(event);
    if (this.selectedId === null) this.setHover(found?.id ?? null);
    this.onHover?.(found);
  };

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (this.buildMode) {
      this.pointerState = {
        x: event.clientX,
        y: event.clientY,
        action: null,
        axisViewDir: null,
        appliedSteps: 0,
        draggingGizmo: false,
      };
      return;
    }
    const action = this.pickEditAction(event);
    if (action) {
      const center = this.editGizmo?.position.clone() ?? null;
      const axisViewDir = center
        ? action.mode === "move"
          ? this.projectedMoveDirection(center, action)
          : this.projectedRotateDirection(center, event)
        : null;
      this.pointerState = {
        x: event.clientX,
        y: event.clientY,
        action,
        axisViewDir,
        appliedSteps: 0,
        draggingGizmo: true,
      };
      event.preventDefault();
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(event.pointerId);
      return;
    }

    this.pointerState = {
      x: event.clientX,
      y: event.clientY,
      action: null,
      axisViewDir: null,
      appliedSteps: 0,
      draggingGizmo: false,
    };
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const state = this.pointerState;
    if (!state?.action || !state.draggingGizmo || !state.axisViewDir) return;
    event.preventDefault();
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    const stepSize = state.action.mode === "move" ? 1 : 28;
    const rawSteps = (dx * state.axisViewDir.x + dy * state.axisViewDir.y) / stepSize;
    const steps = rawSteps > 0 ? Math.floor(rawSteps) : Math.ceil(rawSteps);
    const delta = steps - state.appliedSteps;
    if (delta === 0) return;
    state.appliedSteps = steps;
    this.onEdit?.({
      ...state.action,
      sign: delta > 0 ? state.action.sign : (state.action.sign === 1 ? -1 : 1),
      amount: Math.abs(delta),
    });
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const state = this.pointerState;
    this.pointerState = null;
    this.controls.enabled = true;
    if (!state) return;
    if (state.draggingGizmo) {
      if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
      return;
    }

    const moved = Math.hypot(event.clientX - state.x, event.clientY - state.y);
    if (state.action) return;
    if (moved >= 5) return;
    if (this.buildMode) {
      const target = this.pickBuildExit(event);
      if (target) this.onBuildPlace?.(target);
      return;
    }
    const found = this.pickRail(event);
    this.setSelection(found?.id ?? null);
    this.onSelect?.(found);
  };

  private handlePointerCancel = (event: PointerEvent): void => {
    this.pointerState = null;
    this.controls.enabled = true;
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
  };

  private pickEditAction(event: MouseEvent): RailEditAction | null {
    if (!this.editGizmo) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.editGizmo.children, true);
    for (const hit of intersects) {
      const action = hit.object.userData.editAction as RailEditAction | undefined;
      if (action) return action;
    }
    return null;
  }

  private pickBuildExit(event: MouseEvent): BuildExitTarget | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    for (const hit of intersects) {
      const obj = hit.object as THREE.Object3D & { userData: Record<string, unknown> };
      const target = obj.userData.buildTarget as BuildExitTarget | undefined;
      if (target && !target.isConnected) return target;
    }

    return null;
  }

  private pickRail(event: MouseEvent): RailMeta | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    let found: RailMeta | null = null;

    for (const hit of intersects) {
      const obj = hit.object as THREE.Object3D & { userData: Record<string, unknown> };
      if (obj.userData.isBlock) {
        if (obj.userData.railMeta) {
          found = obj.userData.railMeta as RailMeta;
          break;
        }
        if (hit.instanceId !== undefined) {
          found = (obj.userData.instanceMap as RailMeta[])[hit.instanceId] ?? null;
          break;
        }
      }
      if (obj.userData.isText) {
        found = this.railDataMap.get(Number(obj.userData.id)) ?? null;
        break;
      }
    }

    return found;
  }

  private setSelection(id: number | null): void {
    this.selectedId = id;
    this.setHover(id);
    this.refreshEditGizmo();
  }

  private setHover(id: number | null): void {
    if (this.lastHoveredId === id) return;
    if (this.lastHoveredId !== null) {
      const previous = this.spriteMap.get(this.lastHoveredId);
      if (previous) {
        gsap.to(previous.scale, { x: 8, y: 8, duration: 0.18, ease: "power2.out" });
        (previous.material as THREE.SpriteMaterial).color.set(0xffffff);
      }
      this.resetMarkerHover();
    }

    this.lastHoveredId = id;
    if (id === null) return;
    const sprite = this.spriteMap.get(id);
    if (sprite) {
      (sprite.material as THREE.SpriteMaterial).color.set(0xffe873);
      gsap.to(sprite.scale, { x: 12, y: 12, duration: 0.18, ease: "power2.out" });
    }
    this.highlightMarkers(id);
  }

  private setBuildExitHover(target: BuildExitTarget | null): void {
    const key = target ? this.exitKey(target.parentRailId, target.exitIndex) : null;
    if (this.buildHoveredExitKey === key) return;
    if (this.buildHoveredExitKey) {
      this.exitMarkerMap.get(this.buildHoveredExitKey)?.scale.setScalar(1);
    }
    this.buildHoveredExitKey = key;
    if (key) {
      this.exitMarkerMap.get(key)?.scale.setScalar(1.72);
    }
  }

  private highlightMarkers(id: number): void {
    this.highlightedMarkers = this.railMarkerMap.get(id) ?? [];
    this.highlightedMarkers.forEach((marker) => marker.scale.setScalar(1.45));
  }

  private resetMarkerHover(): void {
    this.highlightedMarkers.forEach((marker) => marker.scale.setScalar(1));
    this.highlightedMarkers = [];
  }

  private refreshEditGizmo(): void {
    if (this.editGizmo) {
      this.scene.remove(this.editGizmo);
      this.editGizmo.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as THREE.Material | undefined;
        material?.dispose?.();
      });
      this.editGizmo = undefined;
    }
    if (this.buildMode || this.selectedId === null || !this.activeLayout) return;
    const rail = this.activeLayout.Rail.find((item) => item.Rail_Index === this.selectedId);
    if (!rail) return;
    const bounds = this.railBounds(rail);
    this.editGizmo = this.createEditGizmo(this.selectedId, bounds.center);
    this.scene.add(this.editGizmo);
  }

  private createEditGizmo(railId: number, center: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(center);
    group.renderOrder = 40;
    const length = GRID_TO_WORLD_SCALE * 1.35;
    const axes = this.editorMode === "move" ? [
      { axis: "x" as const, sign: 1 as const, dir: new THREE.Vector3(1, 0, 0), color: 0xe85b5b },
      { axis: "x" as const, sign: -1 as const, dir: new THREE.Vector3(-1, 0, 0), color: 0xe85b5b },
      { axis: "y" as const, sign: 1 as const, dir: new THREE.Vector3(0, -1, 0), color: 0x40b870 },
      { axis: "y" as const, sign: -1 as const, dir: new THREE.Vector3(0, 1, 0), color: 0x40b870 },
      { axis: "z" as const, sign: 1 as const, dir: new THREE.Vector3(0, 0, 1), color: 0x4f72ff },
      { axis: "z" as const, sign: -1 as const, dir: new THREE.Vector3(0, 0, -1), color: 0x4f72ff },
    ] : [
      { axis: "x" as const, sign: 1 as const, dir: new THREE.Vector3(1, 0, 0), color: 0xe85b5b },
      { axis: "y" as const, sign: 1 as const, dir: new THREE.Vector3(0, -1, 0), color: 0x40b870 },
      { axis: "z" as const, sign: 1 as const, dir: new THREE.Vector3(0, 0, 1), color: 0x4f72ff },
    ];
    axes.forEach((item) => {
      const obj = this.editorMode === "move"
        ? this.createMoveHandle(item.dir, length, item.color)
        : this.createRotateHandle(item.dir, length, item.color);
      obj.traverse((child) => {
        child.userData.editAction = { railId, mode: this.editorMode, axis: item.axis, sign: item.sign };
      });
      group.add(obj);
    });
    return group;
  }

  private projectedMoveDirection(center: THREE.Vector3, action: RailEditAction): THREE.Vector2 | null {
    const axis = this.actionViewDirection(action).multiplyScalar(GRID_TO_WORLD_SCALE);
    const start = center.clone().project(this.camera);
    const end = center.clone().add(axis).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    const screen = new THREE.Vector2(
      (end.x - start.x) * rect.width * 0.5,
      -(end.y - start.y) * rect.height * 0.5,
    );
    const length = screen.length();
    if (length < 0.001) return null;
    return screen.normalize().divideScalar(length);
  }

  private projectedRotateDirection(center: THREE.Vector3, event: PointerEvent): THREE.Vector2 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const projected = center.clone().project(this.camera);
    const centerScreen = new THREE.Vector2(
      rect.left + ((projected.x + 1) * rect.width) / 2,
      rect.top + ((1 - projected.y) * rect.height) / 2,
    );
    const radial = new THREE.Vector2(event.clientX - centerScreen.x, event.clientY - centerScreen.y);
    if (radial.length() < 1) radial.set(1, 0);
    return new THREE.Vector2(-radial.y, radial.x).normalize();
  }

  private actionViewDirection(action: RailEditAction): THREE.Vector3 {
    if (action.axis === "x") return new THREE.Vector3(action.sign, 0, 0);
    if (action.axis === "y") return new THREE.Vector3(0, -action.sign, 0);
    return new THREE.Vector3(0, 0, action.sign);
  }

  private createMoveHandle(dir: THREE.Vector3, length: number, color: THREE.ColorRepresentation): THREE.Object3D {
    const group = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.86, depthTest: false });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, length, 12), material);
    shaft.position.y = length / 2;
    const head = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5.2, 16), material.clone());
    head.position.y = length + 2.6;
    group.add(shaft, head);
    group.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
    group.renderOrder = 40;
    return group;
  }

  private createRotateHandle(dir: THREE.Vector3, length: number, color: THREE.ColorRepresentation): THREE.Object3D {
    const group = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.82, depthTest: false });
    const radius = Math.max(8, length * 0.44);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.85, 10, 72), material);
    group.add(ring);
    group.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize()));
    group.renderOrder = 40;
    return group;
  }

  private railColor(railId: string): THREE.Color {
    const lower = railId.toLowerCase();
    if (lower.includes("start")) return new THREE.Color(0x2856ff);
    if (lower.includes("end")) return new THREE.Color(0x35b86b);
    if (lower.includes("checkpoint")) return new THREE.Color(0xf2c84b);
    return new THREE.Color(0xe9ecff);
  }

  private forwardDirFromRotAbs(rotAbs: { p?: number; y?: number; r?: number }): "+X" | "+Y" | "-X" | "-Y" | "+Z" | "-Z" {
    return this.dirFromLogicalVector(this.transformLogicalAxis({ x: 1, y: 0, z: 0 }, rotAbs));
  }

  private railMaterials(color: THREE.Color, darkerMaterialIndex: number): THREE.MeshLambertMaterial[] {
    const bottomColor = color.clone().offsetHSL(0, 0.22, -0.18).multiplyScalar(0.82);
    return Array.from({ length: 6 }, (_, index) =>
      new THREE.MeshLambertMaterial({
        color: index === darkerMaterialIndex ? bottomColor : color,
        transparent: true,
        opacity: 0.5,
      }),
    );
  }

  private localBottomMaterialIndex(rotAbs: { p?: number; y?: number; r?: number }): number {
    const bottom = this.transformLogicalAxis({ x: 0, y: 0, z: -1 }, rotAbs);
    if (bottom.x > 0) return 0;
    if (bottom.x < 0) return 1;
    if (bottom.y > 0) return 3;
    if (bottom.y < 0) return 2;
    if (bottom.z > 0) return 4;
    return 5;
  }

  private transformLogicalAxis(
    axis: { x: number; y: number; z: number },
    rotAbs: { p?: number; y?: number; r?: number },
  ): { x: number; y: number; z: number } {
    let { x, y, z } = axis;
    const rotate = (count: number, step: () => void) => {
      for (let i = 0; i < ((count % 4) + 4) % 4; i += 1) step();
    };
    const idx = (degrees: number | undefined) => Math.trunc((degrees ?? 0) / 90) % 4;

    rotate(idx(rotAbs.r), () => {
      [y, z] = [-z, y];
    });
    rotate(idx(rotAbs.p), () => {
      [x, z] = [-z, x];
    });
    rotate(idx(rotAbs.y), () => {
      [x, y] = [-y, x];
    });

    return { x, y, z };
  }

  private dirFromLogicalVector(vec: { x: number; y: number; z: number }): "+X" | "+Y" | "-X" | "-Y" | "+Z" | "-Z" {
    const values = [
      { dir: "+X" as const, value: vec.x },
      { dir: "-X" as const, value: -vec.x },
      { dir: "+Y" as const, value: vec.y },
      { dir: "-Y" as const, value: -vec.y },
      { dir: "+Z" as const, value: vec.z },
      { dir: "-Z" as const, value: -vec.z },
    ];
    return values.reduce((best, item) => (item.value > best.value ? item : best)).dir;
  }

  private getDirVector(dirStr: string): THREE.Vector3 {
    if (dirStr === "+X") return new THREE.Vector3(1, 0, 0);
    if (dirStr === "-X") return new THREE.Vector3(-1, 0, 0);
    if (dirStr === "+Y") return new THREE.Vector3(0, -1, 0);
    if (dirStr === "-Y") return new THREE.Vector3(0, 1, 0);
    if (dirStr === "+Z") return new THREE.Vector3(0, 0, 1);
    if (dirStr === "-Z") return new THREE.Vector3(0, 0, -1);
    return new THREE.Vector3(1, 0, 0);
  }

  private resize = (): void => {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    this.updateCameraProjection();
    this.renderer.setSize(width, height);
  };

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
