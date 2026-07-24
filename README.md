# Simple Diff

基于 Tauri 2 的文件/目录对比工具（本地目录对比）。

> Electron 完整版（含 SFTP / 同步 / 历史 / 网页版）保留在 [`electron`](https://github.com/react-laravel/simple-diff/tree/electron) 分支。

## 功能（main / Tauri）

- **本地目录对比** — BFS 逐层扫描，子目录懒加载
- **双视图** — 分栏 / 合并视图
- **文件 Diff** — 文本差异、行内字符高亮、写回
- **对比策略** — size / mtime / quick_hash / hash
- **过滤** — 排除路径、隐藏点文件
- **本地监听** — 目录变更后标记 dirty 并支持局部重扫
- **设置 / 主题**

暂未迁入 Tauri：SFTP、同步任务、对比历史（界面入口已隐藏）。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri 2 |
| 后端 | Rust（对比 / 文件 / 监听） |
| 前端 | React 19 + Zustand 5 + Tailwind CSS 4 |
| 构建 | Vite 8 |

## 快速开始

```bash
npm install
npm run dev      # tauri dev（会启动 Vite + Rust）
npm run build    # tauri build
npm test
```

## 项目结构

```text
shared/                 前后端共享 TS 类型与纯算法（text-diff）
src/renderer/           React UI
src-tauri/              Rust 后端（commands / compare / files / watch）
```

## 许可证

MIT
