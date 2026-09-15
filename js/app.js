/* NLS频谱健康站 site app */
(function () {
  const STORE_THEME = "nls-theme";
  const STORE_PLAYER = "nls-player";

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

  /* Data */
  async function loadData() {
    if (window.__NLS_DATA__) return window.__NLS_DATA__;
    const res = await fetch("data/episodes.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("无法加载节目数据");
    window.__NLS_DATA__ = await res.json();
    return window.__NLS_DATA__;
  }

  function audioUrl(site, ep) {
    return `${site.audioBase.replace(/\/$/, "")}/${ep.audioFile}`;
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
      this.el.bar.addEventListener("click", (e) => {
        if (!this.audio.duration) return;
        const rect = this.el.bar.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        this.audio.currentTime = ratio * this.audio.duration;
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

    show(ep, { autoplay = false, seek = null } = {}) {
      this.ep = ep;
      this.root.classList.add("is-on");
      if (this.el.cover) {
        this.el.cover.src = ep.cover;
        this.el.cover.alt = ep.shortTitle || ep.title;
      }
      this.el.title.textContent = `EP.${String(ep.number).padStart(2, "0")} ${ep.shortTitle || ep.title}`;
      this.el.sub.textContent = `${this.site?.author || ""} · ${fmtDur(ep.duration)}`;
      const src = audioUrl(this.site, ep);
      if (this.audio.src !== src && !this.audio.src.endsWith(ep.audioFile)) {
        this.audio.src = src;
      }
      if (seek != null && !Number.isNaN(seek)) {
        const onMeta = () => {
          this.audio.currentTime = seek;
          this.audio.removeEventListener("loadedmetadata", onMeta);
        };
        this.audio.addEventListener("loadedmetadata", onMeta);
        if (this.audio.readyState >= 1) this.audio.currentTime = seek;
      }
      this.persist();
      if (autoplay) this.audio.play().catch(() => {});
      this.syncProgress();
    }

    toggle() {
      if (!this.ep) return;
      if (this.audio.paused) this.audio.play().catch(() => {});
      else this.audio.pause();
    }

    step(dir, autoplay = false) {
      if (!this.episodes?.length || !this.ep) return;
      const idx = this.episodes.findIndex((e) => e.id === this.ep.id);
      const next = this.episodes[idx + dir];
      if (!next) return;
      this.show(next, { autoplay: autoplay || !this.audio.paused });
    }

    setPlayingUI(on) {
      this.el.play.textContent = on ? "暂停" : "播放";
      this.el.play.setAttribute("aria-label", on ? "暂停" : "播放");
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
      const ep = data.episodes.find((e) => e.id === state.id);
      if (!ep) return;
      this.setSite(data.site);
      this.setCatalog(data.episodes);
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
    p.setCatalog(data.episodes);
    const ep = data.episodes.find((e) => e.id === id);
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

  async function boot() {
    initTheme();
    ensurePlayer();
    try {
      const data = await loadData();
      const p = ensurePlayer();
      if (p) {
        p.setSite(data.site);
        p.setCatalog(data.episodes);
      }
      await p?.restore();
    } catch (err) {
      console.error(err);
    }

    const page = document.body.dataset.page;
    if (page === "home") await renderHome();
    if (page === "episodes") await renderEpisodes();
    if (page === "episode") await renderEpisodeDetail();
    if (page === "about" || page === "disclaimer") {
      try {
        fillFooter(await loadData());
      } catch {}
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
