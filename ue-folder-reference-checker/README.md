# Folder Reference Checker

Unreal Editor Python 工具：检查 Content Browser 中选中文件夹的资产引用是否跨出该文件夹，并导出 CSV。

## 检查入口

| Script | 检查内容 |
|---|---|
| `check_referenced_by_external.py` | 文件夹内资产是否被外部资产引用 |
| `check_referencing_external.py` | 文件夹内资产是否引用外部资产 |
| `check_external_references_both.py` | 同时检查上述两个方向 |

## 迁移入口

`migrate_referenced_by_external.py` 是独立的增强型入口。它查找文件夹内被外部资产引用的资产，然后将每个被查出的资产移动到第一个外部引用者所在文件夹下的 `ReferenceMigrated` 子文件夹。

例如，第一个外部引用者为：

```text
/Game/Item/Gimmick/Material/MI_Grass_Rock_Tri_01
```

被检查资产 `M_Triplainar_Base` 会移动到：

```text
/Game/Item/Gimmick/Material/ReferenceMigrated/M_Triplainar_Base
```

外部引用者按 package path 排序，因此“第一个”引用者是稳定的。若目标位置已经存在同名资产，脚本会跳过该资产并报告，不会覆盖。

迁移入口会在日志和消息弹窗中汇总移动、跳过和失败结果，不导出 CSV。三个只读检查入口仍按下方流程导出 CSV。

## 使用方式

1. 在 Content Browser 中进入要检查的文件夹。旧版 UE 若无法读取当前地址，可改为选中文件夹；选中资产时也会回退到该资产所在目录。
2. 在 Unreal Editor 中使用 `Tools > Execute Python Script` 运行需要的入口脚本，例如：

```text
C:\path\to\ball-maze-tools\ue-folder-reference-checker\check_external_references_both.py
```

3. 查看 Unreal 日志和消息弹窗。
4. 选择 CSV 保存位置。取消保存框不会影响消息报告。

## 保存路径配置

编辑 `folder_reference_checker.py` 顶部：

```python
DEFAULT_OUTPUT_CSV = ""
```

- 留空：每次运行时弹出系统保存框。
- 填入有效 `.csv` 文件路径，且父目录存在：直接保存，不弹窗。
- 填入无效路径：回退到系统保存框。

## 输出

消息中的每行示例：

```text
AssetName - Relative/AssetPath; Referenced By: OtherAsset - [/Game/Other/OtherAsset]; Referencing: ExternalAsset - [/Game/External/ExternalAsset]
```

CSV 每个文件占一行，引用对象按 `名称`、`路径` 两列一组向右展开。双向检查时，`Referenced By` 和 `Referencing` 分别占一组列。

## 实现说明

工具使用 Unreal Asset Registry 的包级 dependency / referencer 查询，不加载资产对象。查询包含 hard、soft 和 management package references；`SearchableName` 引用默认不计入报告。
