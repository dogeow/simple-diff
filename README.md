# Simple Diff

文件/目录对比工具，支持 Electron 桌面版，也支持浏览器静态部署版。

## 功能

- **目录对比** — 本地 ↔ 本地、本地 ↔ SFTP、SFTP ↔ SFTP
- **网页目录对比** — 浏览器中选择或拖入本地文件夹，直接完成目录分析与文本 diff
- **逐层扫描** — BFS 逐层对比，父目录优先展示，子目录懒加载
- **双视图** — 分栏（左右独立文件列表）和合并视图可切换
- **文件 Diff** — 双击文件查看文本差异，Tab 管理多文件
- **对比策略** — 文件大小 / 修改时间，可组合
- **过滤** — 排除目录/路径、隐藏隐藏文件（.开头）
- **SSH 管理** — 多服务器配置，密码/密钥认证，自动发现 ~/.ssh
- **历史记录** — 保存对比历史，快速重新对比
- **实时日志** — 底部面板实时展示扫描/连接/对比进度

## 技术栈

| 层         | 技术                          |
|-----------|-------------------------------|
| 框架       | Electron 41                   |
| 前端       | React 19 + Zustand 5          |
| 样式       | Tailwind CSS 4                |
| 构建       | Vite 8 (3-config)             |
| 语言       | TypeScript 6                  |
| SSH       | node-ssh / ssh2               |
| 持久化     | electron-store                |
| 打包       | electron-builder              |

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 网页开发模式
npm run dev:web

# 构建
npm run build

# 构建网页静态产物
npm run build:web

# 打包
npm run dist
```

## 网页版

网页模式适合本地目录拖入、浏览器内文本对比和静态部署场景。

- 当前支持：本地目录 ↔ 本地目录、目录拖放、文本 diff、浏览器内保存文本改动
- 当前不支持：SFTP、同步任务、系统文件管理器定位、历史记录
- 推荐浏览器：Chrome / Edge（依赖 File System Access API）

部署说明见 [docs/web-deploy.md](docs/web-deploy.md)。

## 项目结构

```plain
shared/types.ts        跨进程共享类型
src/main/              Electron 主进程
src/preload/           contextBridge
src/renderer/          React 前端
  stores/              Zustand 状态管理
  pages/               页面 (Home, Compare, SSH, History)
  components/          UI 组件
  hooks/               自定义 Hooks
  runtime/             浏览器运行时 API / 目录句柄实现
```

## TODO

- [ ] 文件内容对比时的对齐不精准

## 许可证

MIT
