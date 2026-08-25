# JLPT N2 学习 Dashboard

手机优先的学习 Dashboard。学习路径固定为“阶段 → 模块 → 任务 → 检查点”；不会生成日期、日历或每日目标。

## iPhone PWA 使用

此项目应通过 HTTPS 网页链接使用，而不是作为本地 HTML 文件打开。首次在 iPhone Safari 打开 GitHub Pages 链接后，选择“分享 → 添加到主屏幕 → 作为 Web App 打开”。应用会缓存界面与任务清单，之后可离线打开；使用者不需要 GitHub 或 ChatGPT 账号。

## 本地使用

需要 Node.js 22 或更高版本。

```bash
pnpm install
pnpm run dev
```

浏览器打开开发服务器显示的地址。首次联网打开后，PWA 会缓存界面与任务基线；在 iPhone Safari 使用“分享 → 添加到主屏幕”即可作为独立应用打开。

## 构建

```bash
pnpm run build
```

构建产物位于 `dist/`，且不包含教材 PDF。PWA 构建会生成含版本化资源清单的 `sw.js`，确保首次成功打开后，界面和任务基线可离线使用。

## 数据与备份

- `public/data/tasks.json` 是只读教材基线，运行期间不会写回。
- 用户进度、步骤、笔记、错因、阻塞和跳过理由只保存在浏览器 `localStorage`。
- 在“数据”页导出 JSON 作为备份；导入时可选择“合并，保留较新记录”或“覆盖本机记录”。

## 静态部署

构建不需要环境变量，站点资源和 PWA 文件均使用相对路径。

### Vercel

导入仓库后，Build Command 设置为 `pnpm run build`，Output Directory 设置为 `dist`。不要上传 `sources/` 或教材 PDF。

### Netlify

Build Command 设置为 `pnpm run build`，Publish directory 设置为 `dist`。无需环境变量。

### GitHub Pages

仓库附带 `.github/workflows/deploy-pages.yml`。将仓库推送到 GitHub 的 `main` 分支后，在仓库的 **Settings → Pages** 中将 Source 选择为 **GitHub Actions**；工作流会构建并发布 `dist/`。项目站点使用仓库子路径时不需要改代码：manifest、服务工作线程和任务清单均使用相对路径。

所有 HTTPS 部署会启用 service worker；本地 HTTP 开发不会影响正常使用。
