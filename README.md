# Ball Maze Tools

Ball Maze Tools 是为 Ball Maze / 迷宫球项目准备的一组开发辅助工具。目录名按主要运行环境分组：`web-*` 是浏览器/Vite 工具，`ue-*` 是 Unreal Editor Python 工具，`blender-*` 是 Blender Python 工具。

## Tools

| Tool | Runtime | Purpose | Entry |
|---|---|---|---|
| Maze Builder | Web / Vite | 生成、预览、导出 3D 轨道迷宫布局 | [`web-maze-builder/README.md`](web-maze-builder/README.md) |
| Hermite Spline Generator | Web / Vite | Hermite 曲线编辑、预览和 CSV 导出 | [`web-hermite-spline-generator/README.md`](web-hermite-spline-generator/README.md) |
| JSON Rail Exporter | Unreal Editor Python | 从 UE 关卡导出 rail JSON | [`ue-json-rail-exporter/README.md`](ue-json-rail-exporter/README.md) |
| JSON Rail Importer | Unreal Editor Python | 将 maze JSON 导入 UE 关卡 | [`ue-json-rail-importer/README.md`](ue-json-rail-importer/README.md) |
| Asset Pivot Editor | Unreal Editor Python | 批量烘焙 Static Mesh Pivot | [`ue-asset-pivot-editor/README.md`](ue-asset-pivot-editor/README.md) |
| Material Instance Creator | Unreal Editor Python | 在当前 Content Browser 路径按选中 Material 批量创建材质实例 | [`ue-material-instance-creator/README.md`](ue-material-instance-creator/README.md) |
| Texture Assigner | Unreal Editor Python | 按命名规范自动绑定贴图、材质实例和 Static Mesh | [`ue-texture-assigner/README.md`](ue-texture-assigner/README.md) |
| Voxel Ball Shatter | Blender Python | 将选中 Mesh 转为体素小方块集合 | [`blender-voxel-ball-shatter/README.md`](blender-voxel-ball-shatter/README.md) |

## Repository Docs

- [`AGENTS.md`](AGENTS.md): 全仓库通用协作规则。
- [`PROGRESS.md`](PROGRESS.md): 全仓库路线图和各工具状态。
- 工具目录下的 `README.md`: 该工具的用途、运行方式和关键配置。
- 工具目录下的 `AGENTS.md`: 仅当该工具有特殊实现规则时存在。
- 工具目录下的 `PROGRESS.md`: 仅当该工具有独立开发状态时存在。

## Environment

- Node.js / npm for `web-*` Vite tools.
- Unreal Engine 5 with `Python Editor Script Plugin` and `Editor Scripting Utilities` enabled for `ue-*` tools.
- Blender with Python API access for `blender-*` tools.
- Python 3.8+ only for legacy standalone scripts where noted.

## Quick Start

```bash
cd web-maze-builder
npm install
npm run dev
```

```bash
cd web-hermite-spline-generator
npm install
npm run dev
```

UE scripts must be run inside Unreal Editor Python. Blender scripts must be run inside Blender Python.
