# NLS频谱健康站 · 网站

多端适配的播客官网（手机优先 / 深浅色 / 迷你播放器 / 搜索 / RSS）。

## 本地预览

```powershell
cd D:\podcast-project\website
# 已复制 12 集 mp3 到 audio/（该目录不进 Git）
python -m http.server 8765
# 浏览器打开 http://127.0.0.1:8765/
```

本地 `data/episodes.json` 里 `audioBase` 默认是 `audio`（相对路径），所以本地能直接播。

## 上线 Cloudflare 前必改

编辑 `data/episodes.json`：

1. `siteUrl` → 你的 `https://xxx.pages.dev`
2. `audioBase` → R2 公开地址（不要用本地 `audio`）
3. `email` → 真实联系邮箱

改完后同步更新 `rss.xml`（可让我帮你生成）。

详细步骤见 [DEPLOY.md](./DEPLOY.md)。

## 目录

```text
website/
  index.html          首页
  episodes.html       单集列表 + 搜索
  episode.html        单集详情 ?id=ep01
  about.html          关于
  disclaimer.html     免责
  rss.xml             播客 RSS
  data/episodes.json  唯一内容源
  js/app.js           主题 / 播放器 / 搜索
  css/styles.css
  assets/covers/      占位封面
  audio/              本地音频（勿提交 Git）
  DEPLOY.md           部署手册
```

## 加新一集

1. mp3 放到 R2（文件名建议 `epXX-audio-YYYYMMDD.mp3`）
2. 在 `data/episodes.json` 的 `episodes` 数组追加一项
3. 更新 `rss.xml` 的 enclosure 绝对地址
4. push GitHub → Pages 自动部署
