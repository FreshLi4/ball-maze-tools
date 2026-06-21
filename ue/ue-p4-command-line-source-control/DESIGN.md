# 设计指南

此插件不提供自定义 UI，所有界面均通过 UE 内置的 Source Control 框架呈现。因此本设计文档标记为 **不适用**。

用户交互通过以下标准渠道：
- Content Browser 右键菜单（Check Out, Revert, Submit, History, Diff）
- Editor → Source Control 工具栏按钮
- Editor → Project Settings → Perforce CLI 配置面板

如需未来添加自定义 Slate 面板，再补充 DESIGN.md。
