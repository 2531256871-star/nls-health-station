# Cloudflare 免费部署手册（小白版）

目标：把本目录 `website/` 部署成 `https://nls-health-station.pages.dev`，音频放 R2，**全程免费、不绑卡**。

---

## 0. 你需要准备

| 项目 | 状态 |
|------|------|
| 邮箱 | 用于注册 Cloudflare |
| GitHub 账号 | 你已有 |
| 本仓库/新建仓库 | 存放网站代码 |
| 真实联系邮箱 | 替换 `hello@example.com` |

---

## 1. 注册 Cloudflare（约 5 分钟）

1. 打开 <https://dash.cloudflare.com/sign-up>
2. 用邮箱 + 密码注册，查收验证邮件
3. 登录后若提示「选择计划」→ 选 **Free**（免费）
4. 不要绑信用卡

---

## 2. 把网站代码放到 GitHub

在 GitHub 新建仓库（建议名 `nls-health-station`，Public 或 Private 均可）。

把本项目 `website/` 目录内容作为仓库根目录推送，或仓库内保留 `website/` 并在 Pages 设置里指定目录。

**推荐结构（仓库根即站点）：**

```text
nls-health-station/
  index.html
  episodes.html
  episode.html
  about.html
  disclaimer.html
  rss.xml
  css/
  js/
  data/episodes.json
  assets/
```

本地示例（在 `D:\podcast-project\website` 下）：

```powershell
cd D:\podcast-project\website
git init
git add .
git commit -m "feat(site): NLS频谱健康站 MVP"
# 按 GitHub 页面提示 add remote 并 push
```

---

## 3. 创建 R2 桶并上传音频（约 15 分钟）

1. Cloudflare 左侧菜单 → **R2 Object Storage**
2. 首次使用点 **Enable R2**（免费额度，不绑卡）
3. **Create bucket**
   - 名称建议：`nls-podcast-audio`
   - 位置：默认
4. 进入桶 → **Settings**
   - 找到 **Public Development URL**（形如 `https://pub-xxxx.r2.dev`）
   - 打开公开访问（Public access / R2.dev subdomain）
5. 在桶中创建前缀文件夹逻辑：把 12 个 mp3 **直接放在桶根目录**（不要多层文件夹），文件名保持：

```text
ep01-audio-20260609.mp3
ep02-audio-20260610.mp3
...
ep12-audio-20260715.mp3
```

6. 上传后任选一个文件 → 复制 **public URL**，确认浏览器能打开播放

把你的公开域名填进 `data/episodes.json`：

```json
"audioBase": "https://pub-xxxxxxxxxxxx.r2.dev"
```

（不要结尾多余斜杠；脚本会自动拼 `/epXX-audio-....mp3`）

同时把 `siteUrl` 改成你的真实 Pages 地址（第 4 步完成后）。

---

## 4. 创建 Pages 项目并连 GitHub

1. 左侧 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 授权 GitHub，选择仓库 `nls-health-station`
3. 构建设置：
   - Framework preset：**None**
   - Build command：留空
   - Build output directory：如果仓库根就是站点，填 `.` 或留空；若代码在 `website/` 子目录，填 `website`
4. **Save and Deploy**
5. 完成后得到地址：`https://nls-health-station.pages.dev`（以实际为准）

可选：Settings → Domains 里自定义子域名（免费可改一次展示名，最终仍是 `*.pages.dev`）。

---

## 5. 打开 Analytics

Pages 项目 → **Analytics & Logs** → 打开 Web Analytics（免费）。

无需 Cookie 同意横幅。

---

## 6. 上线后自检清单

- [ ] 手机打开首页，能显示节目名与最新一集
- [ ] 点「播放」有声音（确认 R2 URL 已写入 `audioBase`）
- [ ] 切换深/浅色
- [ ] 从列表进详情，播放器条常驻，切页不丢
- [ ] 搜索「预防」「量子」有结果
- [ ] 打开 `https://你的站/rss.xml` 能看到 XML
- [ ] 页脚邮箱正确（替换占位）
- [ ] 免责声明页可访问

---

## 7. 日常更新（第二季加集）

1. 把新 mp3 传到 R2
2. 编辑 `data/episodes.json` 增加一条
3. 需要时更新 `rss.xml`（或告诉我，我帮你生成）
4. `git add/commit/push` → Pages 自动部署

也可以直接叫我：「加 EP13，标题是…，文件在…」

---

## 8. 占位信息（上线前请改）

| 位置 | 当前值 | 改成 |
|------|--------|------|
| `data/episodes.json` → `email` | `hello@example.com` | 你的真实邮箱 |
| `data/episodes.json` → `siteUrl` | `https://nls-health-station.pages.dev` | 实际 Pages 地址 |
| `data/episodes.json` → `audioBase` | `https://YOUR_R2_PUBLIC_URL/audio` | 实际 R2 公开地址（通常无 `/audio` 后缀，按你上传路径改） |
| `rss.xml` | 已按占位生成 | 改 JSON 后请同步重新生成 RSS |

若 mp3 上传在 R2 根目录，`audioBase` 应为 `https://pub-xxxx.r2.dev`（**不要**加 `/audio`）。

---

## 9. 免费额度提醒

| 服务 | 免费额度 | 本项目 |
|------|----------|--------|
| Pages | 静态托管足够 | 网页很小 |
| R2 | 10GB 存储 | 现约 0.11GB |
| Analytics | 免费 | 已建议开启 |

---

## 10. 故障排查

| 现象 | 原因 | 处理 |
|------|------|------|
| 播放无声/404 | `audioBase` 未改或文件名不对 | 对照 R2 公开 URL 与 `audioFile` |
| 页面空白 | 构建目录不对 | Pages 里把 output directory 设为站点根 |
| 跨页播放器丢失 | 浏览器禁了 localStorage | 换浏览器/允许站点数据 |
| RSS 客户端打不开 | 站点刚部署完缓存 | 稍等或强制刷新 |
