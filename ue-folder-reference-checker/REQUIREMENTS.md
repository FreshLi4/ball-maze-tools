# Folder Reference Checker 需求

## 引用检查

- [x] [UE-FRC-001] 从 Content Browser 选中的文件夹递归收集资产 #feature #P0
- [x] [UE-FRC-002] 通过 Asset Registry 查询包级引用，不加载资产对象 #feature #P0
- [x] [UE-FRC-003] 提供只检查 `Referenced By` 的脚本 #feature #P0
- [x] [UE-FRC-004] 提供只检查 `Referencing` 的脚本 #feature #P0
- [x] [UE-FRC-005] 提供同时检查双向关系的脚本 #feature #P0
- [x] [UE-FRC-006] 在 UE 日志和消息弹窗中列出跨文件夹关系 #feature #P0
- [x] [UE-FRC-007] 将结果保存为 CSV #feature #P0
  - [x] 每个被检查资产占一行
  - [x] 引用对象按名称、路径列成对展开
  - [x] 配置路径为空或无效时弹出系统保存框
  - [x] 配置路径有效时直接保存
- [x] [UE-FRC-008] 进入 Content Browser 文件夹后可直接运行，并兼容旧版 UE 的文件夹或资产选择回退 #bugfix #P0

## 引用资产迁移

- [x] [UE-FRC-009] 提供独立的 `Referenced By` 增强型迁移脚本，不修改原检查入口 #feature #P0
  - [x] 将被外部引用的资产移动到第一个外部引用者所在目录下的 `ReferenceMigrated` 子目录
  - [x] 目标目录不存在时自动创建
  - [x] 目标位置已有同名资产时跳过并报告，不覆盖已有资产
  - [x] 汇总移动、跳过和失败结果
