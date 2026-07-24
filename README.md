# Simple Diff

基于 Tauri 2 的文件/目录对比工具。

> Electron 完整版（含网页部署）保留在 [`electron`](https://github.com/react-laravel/simple-diff/tree/electron) 分支。

## 功能（main / Tauri）

- **本地 / SFTP 目录对比** — BFS 逐层扫描，子目录懒加载；本地侧 rayon 并发 hash
- **双视图** — 分栏 / 合并视图
- **文件 Diff** — 文本差异、行内字符高亮、写回
- **对比策略** — size / mtime / quick_hash / hash（内容哈希统一为 **SHA-256**，与 Electron 的 SHA-1 不同）
- **过滤** — 排除路径、隐藏点文件
- **本地监听** — 目录变更后标记 dirty 并支持局部重扫
- **对比历史** — 最近 50 次对比记录
- **同步** — 左↔右同步（本地↔本地 / 含 SFTP），支持追加、落盘恢复
- **SSH 管理** — 配置（密钥 AES 加密落盘）、测试连接、浏览远程目录
- **设置 / 主题**

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri 2 |
| 后端 | Rust（对比 / 文件 / 同步 / SFTP / 历史 / 监听） |
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
src-tauri/              Rust 后端
  src/commands.rs       Tauri 命令入口
  src/compare.rs        目录对比
  src/sync.rs           同步引擎
  src/ssh.rs            SFTP / SSH
  src/history.rs        对比历史
```

## 许可证

MIT
