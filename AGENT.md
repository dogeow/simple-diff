# Simple Diff — Agent 指南

## 项目概述

基于 Electron + React + TypeScript + Vite 的桌面文件/目录对比工具，支持本地和 SFTP 远程对比。

## 技术栈

- **Runtime**: Electron 41 (Node 22+)
- **Frontend**: React 19 + Zustand 5 (状态管理) + Tailwind CSS 4
- **Build**: Vite 8，手动三配置 (main / preload / renderer)
- **Language**: TypeScript 6 (strict)
- **SSH**: node-ssh (基于 ssh2)
- **持久化**: electron-store

## 项目结构

```
shared/types.ts          # 跨进程共享类型 & IPC 通道
src/main/                # Electron 主进程
  index.ts               # 入口，窗口创建
  ipc/index.ts           # 所有 IPC handler 注册
  compare/               # 对比引擎 (BFS 逐层对比，策略模式)
  file-source/           # FileSource 接口 + Local/SFTP 实现
  ssh/                   # SSH 连接管理 + 配置持久化
  history/               # 对比历史存储
  utils/logger.ts        # 日志广播到渲染进程
src/preload/index.ts     # contextBridge API
src/renderer/            # React SPA
  App.tsx                # 路由 (home/compare/ssh/history)
  stores/                # Zustand stores (app-store, compare-store, log-store)
  pages/                 # 页面组件
  components/            # UI 组件 (CompareTree, SplitTree, LogPanel 等)
  hooks/useCompare.ts    # 对比流程 hook
  utils/tree-utils.ts    # 树结构工具
```

## 构建命令

```bash
npm run dev              # 开发模式 (watch + Electron)
npm run build            # 构建全部 (main + preload + renderer)
npx tsc --noEmit         # 类型检查
```

### 手动构建（调试用）

```bash
npx vite build --config vite.config.main.ts
npx vite build --config vite.config.preload.ts
npx vite build --config vite.config.renderer.ts
```

## 核心架构

### IPC 模式

- **Invoke/Handle**: 请求-响应 (`IpcResult<T>` 信封)
- **Event Streaming**: 主进程 → 渲染进程 (BrowserWindow.webContents.send)
  - `compare:scan-complete` — 逐层推送新发现条目
  - `compare:entry-update` — 单条目状态更新
  - `app:log` — 实时日志

### 对比流程

1. BFS 逐层扫描 (先对比父目录，再对比子目录)
2. 仅左/仅右目录不递归
3. 懒加载：展开目录时按需请求子目录内容
4. 策略模式：size / mtime

### 状态管理

- `app-store`: 页面路由 + Diff Tab 管理
- `compare-store`: 对比配置 + 结果 + 目录展开 + 懒加载
- `log-store`: 日志条目 (max 500)

## 编码规范

- 不可变数据：所有 store 更新返回新对象
- 文件 < 400 行
- 函数 < 50 行
- 使用 `readonly` 标注所有 props 和 interface 字段
- Tailwind 类名用于样式，无 CSS 文件
