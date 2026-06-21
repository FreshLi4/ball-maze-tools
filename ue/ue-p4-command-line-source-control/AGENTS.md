# Agent Notes

## 工具信息

- **名称**: `ue-p4-command-line-source-control`
- **类型**: UE 编辑器插件 (Editor-only)
- **目标版本**: Unreal Engine 5.3.2
- **平台**: macOS (primary), Windows, Linux
- **语言**: C++

## 文档入口

- `README.md` — 用户面向的安装和使用指南
- `REQUIREMENTS.md` — 详细需求规格和验收标准
- `DESIGN.md` — `不适用`（无自定义 UI，使用标准 Source Control 界面）

## 特殊规则

1. **macOS ABI 兼容**：此插件存在的原因是避免 `libclient` ABI 崩溃。任何改动不得引入原生 Perforce 库依赖。
2. **Revert 必须使用 `-k`**：`p4 revert -k` 保留本地文件。这是硬性要求，不得改为普通 `revert`。
3. **fstat 字段限制**：`p4 fstat` 必须带 `-T` 参数限制输出字段，减少解析脆弱性。
4. **路径处理**：所有文件路径在传入 `p4` 前必须经过 `FP4CommandLineSourceControlUtils::SanitizeFilename()`（替换反斜杠、加引号）。
5. **批量优化**：文件列表超过 10 个时，优先使用 `p4 -x -` 管道方式。
6. **配置优先级**：Settings UI > 环境变量 > `.p4config`。配置变更后需重新调用 `Init()` 生效。
7. **注册名不可变**：Provider 注册名必须是 `FName("P4CommandLine")`，显示名是 `"Perforce CLI"`。改名会破坏已有项目配置。

## 代码变更指南

- 修改 Provider 时先检查 `GitSourceControl` 的对应实现作为参考模式。
- 新增 p4 子命令时，在 `P4CommandLineSourceControlProvider::Execute()` 中添加分支，并在 `CreateOperation()` 中注册。
- 解析器改动需同步更新 `Parse*Result()` 的单元测试（如果有）。
- 头文件保持 `#pragma once` 和最小 include。
- 使用 `LOCTEXT_NAMESPACE "P4CommandLineSourceControl"` 统一文本域。

## 文件模板

新增 C++ 文件时遵循现有结构：
- 头文件 → `Source/P4CommandLineSourceControl/Public/`
- 实现文件 → `Source/P4CommandLineSourceControl/Private/`
- 命名前缀：`FP4CommandLine` (类), `UP4CommandLine` (UObject)

## 日志记录

执行日志见 `agent-log/` 目录。
