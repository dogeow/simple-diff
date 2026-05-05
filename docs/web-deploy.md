# Web 部署说明

本项目现在支持构建为纯静态网页，并在浏览器中完成本地目录对比。

## 适用范围

- 支持：本地目录选择、拖入目录、目录内容对比、文本 diff、浏览器内保存文本修改
- 不支持：SFTP、同步任务、历史记录、在 Finder/资源管理器中定位文件
- 推荐浏览器：Chrome / Edge 最新版

原因：网页模式依赖 File System Access API 来读取目录、保存文件以及处理目录拖放。

## 本地开发

```bash
npm install
npm run dev:web
```

默认会启动 Vite 开发服务器。打开终端输出中的地址即可。

## 构建静态产物

```bash
npm run build:web
```

构建结果输出到 dist/renderer。

这个目录就是可部署的静态站点根目录。

## 部署方式

### Vercel

- Framework Preset 选择 Other
- Build Command 填 `npm run build:web`
- Output Directory 填 `dist/renderer`

### Netlify

- Build command 填 `npm run build:web`
- Publish directory 填 `dist/renderer`

### GitHub Pages / Nginx / 静态文件服务器

- 先执行 `npm run build:web`
- 将 `dist/renderer` 目录内容发布到站点根目录或任意静态子路径

当前 Vite 配置使用相对资源路径，因此根路径部署和子路径部署都可以直接工作。

## 使用说明

1. 进入网页后，在左右两侧选择文件夹，或直接把文件夹拖进输入框。
2. 选择至少一个对比策略。
3. 点击开始对比。
4. 双击文件可查看文本差异；如果浏览器已授予写权限，可以在网页里直接保存文本修改。

## 兼容性说明

如果当前浏览器不支持目录选择器或目录拖放：

- 文本对比仍然可用
- 目录对比入口会保留，但相关按钮会自动禁用或降级提示

如果你需要完整的 SFTP、同步和本地系统操作能力，请继续使用 Electron 桌面版。