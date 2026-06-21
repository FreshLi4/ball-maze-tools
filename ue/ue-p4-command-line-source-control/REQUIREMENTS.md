# P4 Command Line Source Control Plugin Requirements

> 插件版本：UE 5.3.2  
> 目标平台：macOS (primary), Windows, Linux  
> 参考基线：Engine/Plugins/Developer/GitSourceControl (renamed pattern)  
> 创建日期：2026-06-21  
> 作者：Taobe

## 1. 目的

用 `p4` 命令行替代 UE5 原生 `PerforceSourceControl` 插件中的 `libclient` 库调用，避免在 macOS 上发生 ABI 不兼容导致的 `EXC_BAD_ACCESS` crash（`__cxxabiv1::__isOurExceptionClass()`）。

## 2. 功能范围 (MVP)

### 2.1 必须实现的操作
- `CheckOut` — `p4 edit <file>`
- `Revert` — `p4 revert -k <file>` （`-k` 保留本地文件）
- `Add` — `p4 add <file>`
- `Delete` — `p4 delete <file>`
- `Move` — `p4 move <source> <destination>`
- `Sync` — `p4 sync <file>`
- `UpdateStatus` — `p4 fstat -T "depotFile,clientFile,headRev,haveRev,action,otherOpen,otherOpen0,user"`
- `CheckIn` — `p4 submit -d "<description>" <files>`
- `History` — `p4 filelog -l <file>`
- `Annotate` — `p4 annotate <file>`

### 2.2 状态解析
- `GetState()` 必须解析 `p4 fstat` 输出，检测：
  - `action` — `edit`/`add`/`delete` → IsCheckedOut/IsAdded/IsDeleted
  - `otherOpen` / `otherOpen0-user` → IsCheckedOutOther (显示其他用户 lock 图标)
  - `headRev` vs `haveRev` → IsCurrent
- 对于未跟踪文件返回 `IsNew()` = true

### 2.3 批量操作
- 使用 `p4 -x - fstat` 通过 stdin 传入文件列表，减少进程开销。
- 对于 edit/add/delete/revert 等操作，批量拼接命令行参数。

### 2.4 历史与差异
- `GetHistory()` 解析 `p4 filelog -l` 输出，返回 `TArray<FSourceControlRevisionRef>`
- `DiffAgainstBase()` / `DiffAgainstLocal()` 调用 `p4 diff`
- `Annotate` 解析 `p4 annotate` 输出

### 2.5 配置
- `P4PORT`, `P4USER`, `P4CLIENT`, `P4PASSWD` 支持三种来源：
  1. Editor Project Settings (`UP4CommandLineSourceControlSettings`)
  2. 环境变量
  3. `.p4config` 文件（由 `p4` CLI 自动读取）

## 3. 非目标

- 不实现 Stream 管理
- 不实现多 Changelist 支持（MVP 使用 default changelist）
- 不实现 10k+ 文件仓库的性能优化
- 不实现 Shelve/Unshelve
- 不实现 Branch/Integration 的 UI 操作（底层 `p4 move` 已覆盖）

## 4. 技术约束

- UE 5.3.2 编辑器模块
- 仅编辑器加载 (`Type: Editor`, `LoadingPhase: PostEngineInit`)
- 依赖模块：`Engine`, `Editor`, `Projects`, `Core`, `CoreUObject`, `InputCore`, `SourceControl`, `Slate`, `SlateCore`, `EditorStyle`
- 注册名：`FName("P4CommandLine")`
- 显示名：`FText::FromString("Perforce CLI")`
- 命令执行使用 `FPlatformProcess::CreatePipe` + `ExecProcess` + `ReadPipe`
- 默认命令超时 30 秒

## 5. 文件清单

| 文件 | 职责 |
|------|------|
| `P4CommandLineSourceControl.uplugin` | 插件清单 |
| `P4CommandLineSourceControl.Build.cs` | 构建规则 |
| `P4CommandLineSourceControlModule.h/cpp` | 模块注册/注销 Provider |
| `P4CommandLineSourceControlProvider.h/cpp` | 操作分发、状态缓存 |
| `P4CommandLineSourceControlState.h/cpp` | 状态判断、图标映射 |
| `P4CommandLineSourceControlRevision.h/cpp` | 历史版本数据 |
| `P4CommandLineSourceControlOperations.h/cpp` | 操作类型定义 |
| `P4CommandLineSourceControlCommand.h/cpp` | p4 进程封装 |
| `P4CommandLineSourceControlUtils.h/cpp` | 输出解析、路径工具 |
| `P4CommandLineSourceControlSettings.h/cpp` | 配置持久化 |

## 6. 验收标准

- [ ] 插件在 UE 5.3.2 编辑器中成功编译并加载
- [ ] `p4 info` 成功时 Provider 显示为可用
- [ ] 在 Content Browser 中右键文件可以 Check Out / Revert / Submit
- [ ] Revert 操作使用 `-k` 参数，本地文件不丢失
- [ ] 其他用户已 Check Out 的文件显示 lock 图标
- [ ] History 面板能显示 `p4 filelog` 的提交历史
- [ ] Diff 操作正常调用 `p4 diff`
- [ ] macOS 上不再出现 `libclient` 相关的 `EXC_BAD_ACCESS`

## 7. 已知限制

- `p4` 必须安装且位于系统 PATH 中（或在 Settings 中指定绝对路径）
- 首次使用需要配置 P4 连接参数
- 大型文件集（>1000 文件）的 `fstat` 可能较慢，建议后续优化为异步批量查询
