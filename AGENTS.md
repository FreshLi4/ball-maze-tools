# Agent 协作规范模板

本文件分为“标准内容”和“项目专用内容”。除非用户明确要求修改协作规范，否则只允许在“项目专用内容”下补充或调整，不修改标准内容。

## 标准内容

### 0. 文档缺失时先创建

- 如果当前仓库或当前子功能根目录没有 `AGENTS.md`，先阅读 `agent-template/AGENTS.md` ，并在根目录创建属于该目录自己的 `AGENTS.md` 。
- 如果没有 `REQUIREMENTS.md` ，先阅读 `agent-template/REQUIREMENTS.md` ，并在根目录属于该目录自己的`REQUIREMENTS.md` 。
- 如果没有 `DESIGN.md` ，先阅读 `agent-template/DESIGN.md` ，并在根目录属于该目录自己的 `DESIGN.md` 。
- 如果没有 `README.md`，先阅读 `agent-template/README.md` ，并在根目录属于该目录自己的 `README.md` 。
- 如果仓库内已有内容，或已经与当前agent进行过对话，基于仓库内的内容和对话的实际情况，填写上述文件，填写规则会在下文中写明。
- `AGENTS.md`、`REQUIREMENTS.md`、`DESIGN.md` 和 `README.md` 默认使用中文书写；除非用户特别说明，或术语、代码符号、专有名词本身应使用英文。
- `agent-template/` 中的 `README.md`、`REQUIREMENTS.md`、`DESIGN.md` 和 `agent-log/` 日志模板只保留演示内容；具体撰写规则统一以本 `AGENTS.md` 为准，阅读时需要注意分辨规则和示例的差异。
- 上述创建的文件的文件名必须全大写，其中AGENTS和REQUIREMENTS需要复数，即使用户临时写成小写或单数，也应该注意到该统一标准（除非用户数明确要求修改）。
- 由于本template也经由git管理，所以目录下会存在.git等相关文件，所有实际仓库在使用时，应该先删除agent-template下的git相关资产，移除其git仓库特征，避免上层仓库管理问题。

### 1. 每次任务开始前

- 确认当前分支是用户希望工作的分支；分支切换由用户手动完成，Agent 不主动切换分支。
- 如果当前目录属于 git 仓库，先执行 `git pull`，确保任务基准更新到最新。
- 如果 `git pull` 失败、发生冲突，或提示需要人工处理，停止执行并告知用户。
- 阅读用户本次原始 prompt。
- 阅读当前目录适用的 `AGENTS.md`、`README.md`、`REQUIREMENTS.md`、`DESIGN.md` 和 `agent-log/` 中的日志。日志的阅读规则如下：
  - 找到由当前agent/对话创建的最新日志。
  - 如果有任何日志比该日志更新，阅读所有更新。
  - 如果没有，则不阅读任何日志
- 检查 `REQUIREMENTS.md`，确认用户本次需求是否匹配已有需求、子需求、验收项或已标记的阻塞项。
- 如果仓库内有父级与子级 `AGENTS.md`，从父到子依次阅读；更具体目录的规则优先，但不得违反父级标准内容和用户明确要求。

### 2. 每次任务执行中

- 为每次任务执行创建一条新的执行日志，放在当前适用目录的 `agent-log/`。
- 日志命名规则：`YYYYMMDDHHMMSS-utcpN-model.md` 或 `YYYYMMDDHHMMSS-utcnN-model.md`。
- `utcpN` 表示 UTC 正偏移，`utcnN` 表示 UTC 负偏移；不要在文件名中使用 `+` 或 `-`，以确保不同系统和工具链的适配性，N由实际数字代替。
- 示例：`20260530174209-utcp8-gpt5.md`、`20260530094209-utcn8-gpt5.md`。
- 使用任务完成时间作为日志文件名中的时间；如果任务开始时先创建临时日志，交付前按完成时间重命名。
- 一次任务执行从 Agent 开始处理用户请求算起，到交付、提交、阻塞或明确暂停为止。
- 如果用户在同一次执行中补充或修正要求、引导对话，把补充 prompt 原文和时间追加到同一条日志。
- 如果上一次执行已经交付，用户提出新任务时创建新日志。
- 每条日志记录一次任务执行中的对话、行动和总结；中间过程可由 Agent 自行概括，但要足够支持后续接手。
- 每条日志开头必须包含：
  - 用户原始 prompt
  - 启动运行时的分支和版本，也就是 `git pull` 以后实际所在分支与提交版本
  - 任务开始时间
  - 任务结束时间
  - 任务结束时是否执行了提交
- 每条日志还应包含：
  - 已阅读上下文
  - 对话与行动记录
  - 完成工作
  - 更新的需求 ID
  - 更新的 README 或 DESIGN 章节
  - 验证方式
  - 备注
- 日志模板文件只保留演示内容；日志命名、必填字段、撰写规则以本 `AGENTS.md` 为准。

### 3. REQUIREMENTS.md 的维护标准

- `REQUIREMENTS.md` 使用 Obsidian 原生友好的 Markdown 格式：标题层级、缩进任务列表、稳定 ID、少量标签。
- 不使用复杂表格。
- 不使用 YAML 字段。
- 通过标题分级拆分阶段、模块和主题；阶段如何命名、是否使用 Phase、Phase 如何划分，由具体项目自行决定。
- 更频繁地通过缩进 checkbox 表达父子任务、子任务、验收项和检查点关系。
- 每个可执行需求必须有稳定 ID。
- 任务状态使用原生 Markdown checkbox：
  - `- [ ]` 表示未完成。
  - `- [x]` 表示已完成。
  - 阻塞、延后、取消在任务后追加 `#blocked`、`#deferred` 或 `#cut`。
  - 如果条目本身不适合涵盖已完成、未完成的信息，但确实需要被记录，则checkbox视作是否已读。
  - 如果条目本身既不适合记录是否已读、也不适合记录完成状态，但确实需要记录，则酌情使用有序、无序列表。
- 稳定 ID 不因排序、插入或移动而改变。
- 拆分任务时保留原 ID，并新增子 ID。
- 不静默删除需求；取消的需求保留并标记 `#cut`，附简短原因。
- 每次任务开始前，先检查 `REQUIREMENTS.md` 中是否已有匹配需求。
- 每次任务完成后，再根据本次记忆或重新检查 `REQUIREMENTS.md`，把已经完成的需求、子需求或验收项勾选为完成。
- 如果任务改变范围、状态、验收标准、优先级或阻塞条件，必须同步更新 `REQUIREMENTS.md`。
- 具体需求、验收标准、任务拆分、优先级、阻塞状态和完成状态只写入 `REQUIREMENTS.md`，不要写入 `README.md` 或 `DESIGN.md`。
- 当用户通过对话反馈或新增需求，且该需求需要进入核心实现（例如应用代码、业务逻辑、数据结构或界面流程）时，应先将其整理为一条 requirement，再开始执行。新增 requirement 应优先归入现有 Phase；如果适合挂在已有任务下，应作为其子任务记录。若需要新建 Phase 或新增三级任务区块，先征询用户确认，再继续执行。
- 条目的命名规则严格按照如下描述：
  - # 一级标题总是用于区分大的段落，例如哪部份是真的任务，哪部份是示例；真正的任务记录内容总是在第一个一级标题 #任务清单 下
    - 对于非任务清单下的内容，暂时不做特别约束，以项目为标准自行设计
  - ## 二级标题总是以Phase为单位区分，格式形如 ## Phase - v0.1.0 - xxx；其中xxx的部份可以按照实际情况填写该phase的核心内容
  - ### 三级标题总是以任务区块区分，形如：### DOC-A：xxx；其中xxx的部份可以按照实际情况填写该phase的该任务区块的内容
    - 对于任务区块，除非必要，否则不可以单独创建新的区块类型；如果需要创建，咨询用户；可用的区块类型如下：
      - DOC：文档、说明、协作规范、需求整理、知识库维护。
      - PM：产品目标、范围定义、路线图、优先级、验收标准。
      - UX：用户体验、信息架构、用户路径、交互流程、可用性。
      - UI：界面视觉、设计系统、组件外观、响应式与可访问性。
      - FE：前端应用、客户端界面、状态管理、前端工程化。
      - BE：后端服务、业务逻辑、服务端接口、任务调度。
      - API：对外或内部接口契约、协议、Schema、SDK 集成边界。
      - DB：数据库、数据模型、迁移脚本、索引、查询与持久化。
      - DATA：内容数据、配置数据、导入导出、数据清洗、数据质量。
      - CONTENT：文案、素材、关卡、数值、运营内容等非代码内容资产。
      - QA：测试策略、自动化测试、人工验收、质量检查、回归验证。
      - OPS：部署、运维、监控、日志、告警、备份与恢复。
      - CI：持续集成、构建流水线、发布流程、版本管理自动化。
      - SEC：安全、权限、隐私、合规、密钥与敏感信息处理。
      - ARCH：系统架构、技术选型、模块边界、跨模块约束。
      - TOOL：开发工具、脚本、CLI、代码生成器、内部效率工具。
    - 三级标题的任务区块可以在不同 Phase 中复用；也可以在同一 Phase 内使用相同区块类型创建多个区块，但区块描述必须能明确区分其关注范围。例如：
      - `UI-A：用户页设计`
      - `UI-B：登录页设计`
    - 同一 Phase 内，同一类型区块的字母后缀按出现顺序递增；跨 Phase 可重新从 `A` 开始。即使某类区块只有一个，也默认使用 `A` 后缀。
  - 三级标题以下不再继续拆分标题；所有具体事项都以 task 形式记录。每条 task 必须使用稳定 ID，并保持如下结构：
    - `[ ] \[0.1.0-DOC-A-001] xxx`
  - 其中 `xxx` 是具体任务内容。

### 4. README.md 的维护纪律

- `README.md` 记录系统、仓库或应用的整体说明，而不是视觉规范或具体任务清单。
- `README.md` 应说明项目是什么、解决什么问题、当前能力、目录结构、运行方式、文档入口和适用边界，可以视作对外的项目介绍文档，便于不了解项目的人用于第一时间了解项目。
- 当系统范围、仓库结构、应用能力、运行方式或用户入口发生变化时，同步更新 `README.md`。
- 不要把具体待办、验收项和任务状态写进 `README.md`；这些内容写入 `REQUIREMENTS.md`。

### 5. DESIGN 维护纪律

- `DESIGN.md` 不是系统整体设计文档；它是视觉规范和界面风格文档。
- `DESIGN.md` 参考 Google Stitch / DESIGN.md 的语义：用 Markdown 描述 AI 和开发者可执行的视觉设计系统，包括颜色、字体、间距、布局、组件样式、视觉语气、响应式规则和可访问性约束。
- 如果该文件在首次创建时仓库中已有内容、或者已有agent对话记录，则应该根据已有内容总结并创建符合实际情况的文件。
- `DESIGN.md` 用于让 AI 在实现 UI 时不猜测视觉风格；它不记录系统架构、数据模型、产品路线图或任务列表。
- 当品牌视觉、UI 风格、设计 token、组件外观、布局原则或可访问性规则变化时，同步更新 `DESIGN.md`。
- 如果项目没有 UI 或视觉界面，`DESIGN.md` 可只记录“不适用”和原因。
- 如果仓库中已有旧名 `DESIGNS.md` 且内容其实是系统/架构说明，后续整理时应迁移：系统/仓库/应用说明进入 `README.md`，视觉规范进入 `DESIGN.md`，具体需求进入 `REQUIREMENTS.md`。
- 如果项目的设计风格发生了大幅度、颠覆性的改变，应该将老版本的内容创建为一个DESIGN-yyyymmddhhmmss.md的文件，保存到根目录/archive/design/的地址，如果改地址不存在，创建。
- 针对更复杂的、存在“内容”和“系统”的项目，应当在agent-log下再创建2个文件夹，分别为agent-log/system和agent-log/content。每次实际执行任务时，应该针对性的记录log而非总是都记录。内容和系统改动任务的分类由ai自行判断，通常来说，web系统的数据、游戏的装备数值和技能等属于内容更新。

### 6. 父子文档关系

- 如果仓库内有明显的多个子功能、子应用、子游戏、工具包或独立模块，应在根目录和每一层子功能根目录创建一套文档：
  - `AGENTS.md`
  - `README.md`
  - `REQUIREMENTS.md`
  - `DESIGN.md`
  - `agent-log/`
- 根目录 `README.md` 描述全局目标、共享约束、目录索引和跨子功能关系。
- 子功能 `README.md` 只描述该子功能独有的用途、入口、命令和边界，避免复制父级已有内容。
- 子功能 `DESIGN.md` 只描述该子功能独有视觉规范；如果沿用父级视觉规范，写明继承关系即可。
- 父级 `AGENTS.md` 必须索引子功能目录，并说明每个子功能的文档入口。
- 当一个任务只影响某个子功能时，优先更新该子功能的 `README.md`、`REQUIREMENTS.md`、`DESIGN.md` 和 `agent-log/`；如影响全局规则或跨子功能关系，再同步更新父级文档。
- 如果仓库中存在 `reference/`、`references/`、`third_party/`、`vendor/`、`examples/`、`project/` 等目录，并且其中嵌套了外部 GitHub 仓库、参考项目、示例项目或只读资料，这些目录不需要创建本规范涉及的文档；更新 `README.md`、`REQUIREMENTS.md`、`DESIGN.md` 和 `agent-log/` 时也不把这些外部参考仓库纳入项目自身范围，除非用户明确要求整理或改造这些目录。

### 7. 工程默认规则

- 优先遵循仓库已有技术栈、目录结构、命名和风格。
- 保持改动聚焦在用户请求范围内。
- 不覆盖用户改动，不回滚无关文件。
- 行为、共享逻辑或用户可见流程发生变化时，补充或更新测试。
- 交付前运行相关验证命令；如果无法运行，说明原因并记录剩余风险。
- 搜索优先使用 `rg`。
- 手工编辑文件优先使用补丁方式，避免产生无关格式化或大范围重写。

## 项目专用内容

### 项目概况

This file records repository-level rules for agents working in `ball-maze-tools`.

## Tool-Specific Rules

Read a tool's local docs before editing it:

- `blender/blender-voxel-ball-shatter/AGENTS.md`
- `ue/ue-asset-pivot-editor/AGENTS.md`
- `ue/ue-folder-reference-checker/AGENTS.md`
- `ue/ue-json-rail-exporter/AGENTS.md`
- `ue/ue-json-rail-importer/AGENTS.md`
- `ue/ue-material-instance-creator/AGENTS.md`
- `ue/ue-rail-content-checker/AGENTS.md`
- `ue/ue-selected-static-mesh-arranger/AGENTS.md`
- `ue/ue-texture-assigner/AGENTS.md`
- `web/web-hermite-spline-generator/AGENTS.md`
- `web/web-maze-builder/AGENTS.md` contains the authoritative Maze Builder generation, coordinate, footprint, exit, seed, checkpoint, and self-spin rules.

For `web-maze-builder`, always run:

```bash
cd web/web-maze-builder
npm test
npm run build
```

Prefer relative paths (for example, `cd web/web-maze-builder`) so instructions work across different machines.
