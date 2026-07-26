# Simple Diff — Agent 指南

## 项目概述

基于 **Tauri 2 + React + TypeScript + Vite** 的桌面文件/目录对比工具。`main` 为 Tauri 实现；完整 Electron 版在 `electron` 分支。

## 技术栈

- **Runtime**: Tauri 2（系统 WebView）
- **Backend**: Rust（`src-tauri/`）
- **Frontend**: React 19 + Zustand 5 + Tailwind CSS 4
- **Build**: Vite 8（renderer）+ cargo（tauri）

## 项目结构

```text
shared/                 共享类型、text-diff、path-filter
src/renderer/           React SPA
  runtime/tauri-api.ts  对接 Tauri invoke / events 的 AppAPI
src-tauri/
  src/commands.rs       Tauri commands
  src/compare.rs        BFS 目录对比
  src/files.rs          本地文件读写
  src/watch.rs          notify 本地监听
  src/sync.rs           同步任务队列（暂停 / 恢复 / 持久化）
  src/ssh.rs            SSH/SFTP 会话与远端操作
  src/history.rs        对比历史持久化
```

## 构建命令

```bash
npm run dev       # tauri dev
npm run build     # tauri build
npm test          # vitest（前端 / shared）
cargo check --manifest-path src-tauri/Cargo.toml
```

## 运行时能力

`window.api.runtime`：

- `mode: 'tauri'`
- `supportsSftp / supportsHistory / supportsSync: true`
- 本地选目录、写回、拖放路径（浏览对话框）可用

## 编码规范

- 不可变数据：store 更新返回新对象
- 文件尽量 < 400 行
- 函数尽量 < 50 行
- TypeScript 严格模式；Rust 显式错误用 `Result` / `IpcResult`
