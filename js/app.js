/* NLS频谱健康站 site app */
(function () {
  const STORE_THEME = "nls-theme";
  const STORE_PLAYER = "nls-player";
  const STORE_DATA = "nls-episodes-cache";
  const STORE_DATA_AT = "nls-episodes-cache-at";
  const DATA_TTL_MS = 30 * 60 * 1000; // 30 分钟后后台刷新

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${y}.${m}.${d}`;
  }

  /* Theme */
  function initTheme() {
    const saved = localStorage.getItem(STORE_THEME);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
    $$("[data-theme-toggle]").forEach((btn) => {
      btn.setAttribute("aria-label", theme === "dark" ? "切换到浅色" : "切换到深色");
      btn.textContent = theme === "dark" ? "浅色" : "深色";
      btn.addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem(STORE_THEME, next);
        $$("[data-theme-toggle]").forEach((b) => {
          b.textContent = next === "dark" ? "浅色" : "深色";
        });
      });
    });
  }

  /* Data — localStorage 优先，网络后台刷新 */
  function readDataCache() {
    try {
      const raw = localStorage.getItem(STORE_DATA);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeDataCache(data) {
    try {
      localStorage.setItem(STORE_DATA, JSON.stringify(data));
      localStorage.setItem(STORE_DATA_AT, String(Date.now()));
    } catch {}
  }

  async function fetchEpisodes() {
    const res = await fetch("data/episodes.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("无法加载节目数据");
    const data = await res.json();
    writeDataCache(data);
    return data;
  }

  async function loadData() {
    if (window.__NLS_DATA__) return window.__NLS_DATA__;

    const cached = readDataCache();
    const age = Date.now() - Number(localStorage.getItem(STORE_DATA_AT) || 0);
    if (cached && cached.site) {
      window.__NLS_DATA__ = cached;
      if (!(age >= 0 && age < DATA_TTL_MS)) {
        // 过期则后台刷新，不阻塞渲染
        fetchEpisodes()
          .then((fresh) => {
            window.__NLS_DATA__ = fresh;
          })
          .catch(() => {});
      }
      return cached;
    }

    const data = await fetchEpisodes();
    window.__NLS_DATA__ = data;
    return data;
  }

  function prefetchUrl(href) {
    if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.endsWith(".xml")) return;
    if (document.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = href;
    link.as = href.endsWith(".css") ? "style" : href.endsWith(".js") ? "script" : "document";
    document.head.appendChild(link);
  }

  function prefetchKeyPages() {
    const run = () => {
      const page = document.body.dataset.page || "";
      const list = new Set(["episodes.html", "derivatives.html"]);
      if (page === "episode" || page === "transcript") {
        const id = document.body.dataset.epId || "ep01";
        list.add(`${id}.html`);
        list.add("index.html");
        // 上下集
        const m = /^ep(\d{2})$/.exec(id);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > 1) list.add(`ep${String(n - 1).padStart(2, "0")}.html`);
          if (n < 12) list.add(`ep${String(n + 1).padStart(2, "0")}.html`);
        }
        if (id === "dv01") list.add("ep04.html");
      }
      if (page === "home") {
        list.add("ep12.html");
        list.add("ep01.html");
      }
      list.forEach((u) => prefetchUrl(u));
      // 预取列表页样式已在缓存；再预取几集封面
      $$('a[href^="ep"], a[href^="dv"]').slice(0, 6).forEach((a) => {
        const href = a.getAttribute("href");
        if (href && href.includes(".html")) prefetchUrl(href);
      });
    };
    if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 400);
  }

  function audioUrl(site, ep) {
    const base = (site?.audioBase || "audio").replace(/\/$/, "");
    // 相对路径在 Audio 上有时解析不稳，补成绝对 URL
    if (/^https?:\/\//i.test(base)) return `${base}/${ep.audioFile}`;
    return new URL(`${base}/${ep.audioFile}`, location.href).href;
  }

  function loadPlayerState() {
    try {
      return JSON.parse(localStorage.getItem(STORE_PLAYER) || "null");
    } catch {
      return null;
    }
  }

  function savePlayerState(state) {
    localStorage.setItem(STORE_PLAYER, JSON.stringify(state));
  }

  /* Mini player */
  class MiniPlayer {
    constructor(root) {
      this.root = root;
      this.audio = new Audio();
      this.audio.preload = "metadata";
      this.ep = null;
      this.site = null;
      this.hideTimer = null;

      this.el = {
        cover: root.querySelector("[data-mp-cover]"),
        title: root.querySelector("[data-mp-title]"),
        sub: root.querySelector("[data-mp-sub]"),
        play: root.querySelector("[data-mp-play]"),
        prev: root.querySelector("[data-mp-prev]"),
        next: root.querySelector("[data-mp-next]"),
        bar: root.querySelector("[data-mp-bar]"),
        fill: root.querySelector("[data-mp-fill]"),
        time: root.querySelector("[data-mp-time]"),
      };

      this.el.play.addEventListener("click", () => this.toggle());
      this.el.prev.addEventListener("click", () => this.step(-1));
      this.el.next.addEventListener("click", () => this.step(1));
      this.el.bar.addEventListener("pointerdown", (e) => {
        if (!this.audio.duration) return;
        e.preventDefault();
        this.el.bar.setPointerCapture?.(e.pointerId);
        this.seeking = true;
        this.seekFromEvent(e);
      });
      this.el.bar.addEventListener("pointermove", (e) => {
        if (!this.seeking || !this.audio.duration) return;
        this.seekFromEvent(e);
      });
      const endSeek = (e) => {
        if (!this.seeking) return;
        this.seeking = false;
        try { this.el.bar.releasePointerCapture?.(e.pointerId); } catch {}
      };
      this.el.bar.addEventListener("pointerup", endSeek);
      this.el.bar.addEventListener("pointercancel", endSeek);
      // 兼容只支持 click 的环境
      this.el.bar.addEventListener("click", (e) => {
        if (this.seeking || !this.audio.duration) return;
        this.seekFromEvent(e);
      });

      this.audio.addEventListener("timeupdate", () => this.syncProgress());
      this.audio.addEventListener("loadedmetadata", () => this.syncProgress());
      this.audio.addEventListener("ended", () => {
        this.setPlayingUI(false);
        this.step(1, true);
      });
      this.audio.addEventListener("play", () => this.setPlayingUI(true));
      this.audio.addEventListener("pause", () => this.setPlayingUI(false));

      window.addEventListener("beforeunload", () => this.persist());
      setInterval(() => this.persist(), 5000);
    }

    setSite(site) {
      this.site = site;
    }

    setCatalog(episodes) {
      this.episodes = episodes;
    }

    seekFromEvent(e) {
      const rect = this.el.bar.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      this.audio.currentTime = ratio * (this.audio.duration || 0);
      this.syncProgress();
    }

    epLabel(ep) {
      const num = String(ep.number).padStart(2, "0");
      const prefix = String(ep.id || "").startsWith("dv") ? "DV." : "EP.";
      return `${prefix}${num}`;
    }

    show(ep, { autoplay = false, seek = null } = {}) {
      this.ep = ep;
      this.root.classList.add("is-on");
      if (this.el.cover) {
        this.el.cover.src = ep.cover;
        this.el.cover.alt = ep.shortTitle || ep.title;
      }
      this.el.title.textContent = `${this.epLabel(ep)} ${ep.shortTitle || ep.title}`;
      this.el.sub.textContent = `${this.site?.author || ""} · ${fmtDur(ep.duration)}`;
      const src = audioUrl(this.site, ep);
      const currentFile = (this.audio.currentSrc || this.audio.src || "").split("/").pop();
      if (currentFile !== ep.audioFile) {
        this.audio.src = src;
        this.audio.load();
      }
      if (seek != null && !Number.isNaN(seek)) {
        const applySeek = () => { this.audio.currentTime = seek; };
        if (this.audio.readyState >= 1) applySeek();
        else this.audio.addEventListener("loadedmetadata", applySeek, { once: true });
      }
      this.persist();
      if (autoplay) {
        const p = this.audio.play();
        if (p && p.catch) p.catch(() => { /* 自动播放被浏览器拦截时忽略 */ });
      }
      this.syncProgress();
    }

    toggle() {
      if (!this.ep) {
        // 未选集时尝试恢复上次
        const state = loadPlayerState();
        if (state?.id) {
          playEpisodeById(state.id, { autoplay: true, seek: state.time || 0 });
        }
        return;
      }
      if (this.audio.paused) {
        const p = this.audio.play();
        if (p && p.catch) p.catch(() => {});
      } else this.audio.pause();
    }

    step(dir, autoplay = false) {
      if (!this.episodes?.length || !this.ep) return;
      const idx = this.episodes.findIndex((e) => e.id === this.ep.id);
      const next = this.episodes[idx + dir];
      if (!next) return;
      this.show(next, { autoplay: autoplay || !this.audio.paused });
    }

    setPlayingUI(on) {
      const ico = on
        ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7V5zm6.5 0H17v14h-3.5V5z" fill="currentColor"/></svg>'
        : '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5L8 5.5z" fill="currentColor"/></svg>';
      this.el.play.innerHTML = ico;
      this.el.play.setAttribute("aria-label", on ? "暂停" : "播放");
      this.el.play.setAttribute("title", on ? "暂停" : "播放");
    }

    syncProgress() {
      const cur = this.audio.currentTime || 0;
      const dur = this.audio.duration || this.ep?.duration || 0;
      const ratio = dur ? (cur / dur) * 100 : 0;
      this.el.fill.style.width = `${ratio}%`;
      this.el.time.textContent = `${fmtDur(cur)} / ${fmtDur(dur)}`;
    }

    persist() {
      if (!this.ep) return;
      savePlayerState({
        id: this.ep.id,
        time: this.audio.currentTime || 0,
        playing: !this.audio.paused,
      });
    }

    async restore() {
      const state = loadPlayerState();
      if (!state?.id) return;
      const data = await loadData();
      const ep = [...(data.episodes || []), ...(data.derivativeEpisodes || [])].find((e) => e.id === state.id);
      if (!ep) return;
      this.setSite(data.site);
      this.setCatalog([...(data.episodes || []), ...(data.derivativeEpisodes || [])]);
      this.show(ep, { autoplay: false, seek: state.time || 0 });
    }
  }

  let player = null;

  function ensurePlayer() {
    if (player) return player;
    const root = $("#mini-player");
    if (!root) return null;
    player = new MiniPlayer(root);
    return player;
  }

  function bindPlayButtons(root = document) {
    $$("[data-play-ep]", root).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute("data-play-ep");
        const autoplay = btn.getAttribute("data-autoplay") !== "0";
        playEpisodeById(id, { autoplay });
      });
    });
  }

  async function playEpisodeById(id, opts = {}) {
    const data = await loadData();
    const p = ensurePlayer();
    if (!p) return;
    p.setSite(data.site);
    p.setCatalog([...(data.episodes || []), ...(data.derivativeEpisodes || [])]);
    const ep = p.episodes.find((e) => e.id === id);
    if (!ep) return;
    p.show(ep, opts);
  }

  /* Pages */
  async function renderHome() {
    try {
      fillFooter(await loadData());
    } catch {}
    bindPlayButtons(document);
  }

  async function renderEpisodes() {
    let data = null;
    try {
      data = await loadData();
      fillFooter(data);
    } catch {}
    const list = $("#ep-list");
    const input = $("#search-input");
    const count = $("#search-count");
    if (!list) return;
    const rows = $$(".ep-row", list);
    const season = data?.site?.season || "第一季";

    function paint(keyword) {
      const kw = (keyword || "").trim().toLowerCase();
      let shown = 0;
      rows.forEach((row) => {
        const hay = row.textContent.toLowerCase();
        const ok = !kw || hay.includes(kw);
        row.style.display = ok ? "" : "none";
        if (ok) shown += 1;
      });
      let empty = $("#search-empty");
      if (!shown) {
        if (!empty) {
          empty = document.createElement("div");
          empty.id = "search-empty";
          empty.className = "empty";
          empty.textContent = "没有匹配的单集，试试「频率」「预防」「量子」等关键词。";
          list.appendChild(empty);
        }
        empty.style.display = "";
      } else if (empty) {
        empty.style.display = "none";
      }
      if (count) count.textContent = kw ? `找到 ${shown} 集` : `共 ${rows.length} 集 · ${season}`;
    }

    paint("");
    input?.addEventListener("input", (e) => paint(e.target.value));
    bindPlayButtons(list);
  }

  async function renderEpisodeDetail() {
    try {
      const data = await loadData();
      fillFooter(data);
    } catch {}
    // 静态单集页已含完整 HTML；仅绑定播放按钮
    bindPlayButtons(document);
  }

  function fillFooter(data) {
    $$("[data-site-name]").forEach((el) => (el.textContent = data.site.name));
    $$("[data-site-email]").forEach((el) => {
      el.textContent = data.site.email;
      el.href = `mailto:${data.site.email}`;
    });
    $$("[data-site-copyright]").forEach((el) => (el.textContent = data.site.copyright));
    $$("[data-site-slogan]").forEach((el) => (el.textContent = data.site.slogan));
    $$("[data-site-author]").forEach((el) => (el.textContent = data.site.author));
  }

  /* Page transition veil */
  const VEIL_KEY = "nls-veil-pending";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function ensureVeil() {
    let el = document.getElementById("page-veil");
    if (el) return el;
    el = document.createElement("div");
    el.id = "page-veil";
    el.className = "page-veil";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML =
      '<div class="page-veil-card">' +
      '<div class="page-veil-orb" aria-hidden="true"></div>' +
      '<div class="page-veil-bar" aria-hidden="true"></div>' +
      '<div>加载中</div>' +
      "</div>";
    document.body.appendChild(el);
    return el;
  }

  function showVeil() {
    const el = ensureVeil();
    el.classList.add("is-on");
    try { sessionStorage.setItem(VEIL_KEY, "1"); } catch {}
  }

  function hideVeil() {
    const el = document.getElementById("page-veil");
    if (el) el.classList.remove("is-on");
    try { sessionStorage.removeItem(VEIL_KEY); } catch {}
  }

  function shouldSkipNav(a) {
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return true;
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("http")) return true;
    if (href.endsWith(".xml") || href.endsWith(".mp3") || href.endsWith(".svg")) return true;
    // 同页锚点
    if (href.startsWith("#")) return true;
    const url = new URL(href, location.href);
    if (url.pathname === location.pathname && url.search === location.search) {
      return true;
    }
    return false;
  }

  function initPageTransition() {
    // 进入本页：若上一页标记了导航，先遮住再淡出，避免闪白
    let pending = false;
    try { pending = sessionStorage.getItem(VEIL_KEY) === "1"; } catch {}
    if (pending || (performance.getEntriesByType && performance.getEntriesByType("navigation")[0]?.type === "reload")) {
      const el = ensureVeil();
      el.classList.add("is-on");
      const hide = () => hideVeil();
      // 内容可交互后尽快淡出；长页也不拖太久
      if (document.readyState === "complete") setTimeout(hide, prefersReducedMotion() ? 40 : 120);
      else window.addEventListener("load", () => setTimeout(hide, prefersReducedMotion() ? 40 : 100), { once: true });
      // 兜底：最多 2s 强制关掉
      setTimeout(hide, 2000);
    }

    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a");
      if (!a || shouldSkipNav(a)) return;
      showVeil();
      // 兜底：导航卡住时 8s 后放开交互
      setTimeout(() => hideVeil(), 8000);
    }, true);

    // bfcache 恢复时关掉遮罩
    window.addEventListener("pageshow", (ev) => {
      if (ev.persisted) hideVeil();
    });
  }

  async function boot() {
    initTheme();
    initPageTransition();
    ensurePlayer();
    try {
      const data = await loadData();
      const p = ensurePlayer();
      if (p) {
        p.setSite(data.site);
        p.setCatalog([...(data.episodes || []), ...(data.derivativeEpisodes || [])]);
      }
      await p?.restore();
    } catch (err) {
      console.error(err);
    }

    const page = document.body.dataset.page;
    if (page === "home") await renderHome();
    if (page === "episodes") await renderEpisodes();
    if (page === "episode" || page === "transcript" || page === "derivative") {
      if (page === "episode") await renderEpisodeDetail();
      else bindPlayButtons(document);
    }
    if (page === "about" || page === "disclaimer") {
      try { fillFooter(await loadData()); } catch {}
    }
    // 所有页面兜底：绑定播放按钮
    bindPlayButtons(document);
    prefetchKeyPages();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
