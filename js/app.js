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
    const data = await loadData();
    const { site, episodes } = data;
    const latest = episodes[episodes.length - 1];

    const hero = $("#hero-slot");
    if (hero) {
      hero.innerHTML = `
        <div class="hero-kicker">${site.season} · 已完结</div>
        <h1>${site.name}</h1>
        <p class="slogan">${site.slogan}</p>
        <p class="lede">${site.description}</p>
        <div class="hero-actions">
          <button class="btn btn-primary" data-play-ep="${latest.id}">播放最新 EP.${String(latest.number).padStart(2, "0")}</button>
          <a class="btn" href="episodes.html">浏览全部单集</a>
          <a class="btn btn-ghost" href="rss.xml">订阅 RSS</a>
        </div>`;
      bindPlayButtons(hero);
    }

    const latestSlot = $("#latest-slot");
    if (latestSlot) {
      latestSlot.innerHTML = episodeCard(latest);
      bindPlayButtons(latestSlot);
    }

    const grid = $("#home-grid");
    if (grid) {
      grid.innerHTML = [...episodes].reverse().map(episodeCard).join("");
      bindPlayButtons(grid);
    }

    fillFooter(data);
  }

  function episodeCard(ep) {
    return `
      <article class="card">
        <a href="episode.html?id=${ep.id}">
          <div class="card-cover"><img src="${ep.cover}" alt="EP${String(ep.number).padStart(2, "0")} 封面" loading="lazy"></div>
          <div class="card-body">
            <div class="card-meta">
              <span>EP.${String(ep.number).padStart(2, "0")}</span>
              <span>${fmtDate(ep.date)}</span>
              <span>${fmtDur(ep.duration)}</span>
            </div>
            <h3>${ep.title}</h3>
            <p>${ep.summary}</p>
          </div>
        </a>
      </article>`;
  }

  async function renderEpisodes() {
    const data = await loadData();
    const { site, episodes } = data;
    fillFooter(data);
    const list = $("#ep-list");
    const input = $("#search-input");
    const count = $("#search-count");
    if (!list) return;

    function paint(keyword) {
      const kw = (keyword || "").trim().toLowerCase();
      const items = episodes.filter((ep) => {
        if (!kw) return true;
        const hay = [
          ep.title,
          ep.shortTitle,
          ep.summary,
          ...(ep.keywords || []),
          ...(ep.highlights || []).flatMap((h) => [h.title, h.text]),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(kw);
      }).slice().reverse();

      if (count) {
        count.textContent = kw ? `找到 ${items.length} 集` : `共 ${items.length} 集 · ${site.season}`;
      }
      if (!items.length) {
        list.innerHTML = `<div class="empty">没有匹配的单集，试试「频率」「预防」「量子」等关键词。</div>`;
        return;
      }
      list.innerHTML = items
        .map(
          (ep) => `
        <article class="ep-row">
          <a href="episode.html?id=${ep.id}"><img src="${ep.cover}" alt="" loading="lazy"></a>
          <div>
            <div class="meta">EP.${String(ep.number).padStart(2, "0")} · ${fmtDate(ep.date)} · ${fmtDur(ep.duration)}</div>
            <h3><a href="episode.html?id=${ep.id}">${ep.title}</a></h3>
            <p style="margin:0;color:var(--muted);font-size:13px">${ep.summary}</p>
          </div>
          <div class="actions">
            <button class="play-sm" data-play-ep="${ep.id}">播放</button>
          </div>
        </article>`
        )
        .join("");
      bindPlayButtons(list);
    }

    paint("");
    input?.addEventListener("input", (e) => paint(e.target.value));
  }

  async function renderEpisodeDetail() {
    const data = await loadData();
    fillFooter(data);
    const params = new URLSearchParams(location.search);
    const id = params.get("id") || "ep01";
    const ep = data.episodes.find((e) => e.id === id) || data.episodes[0];
    const slot = $("#ep-slot");
    if (!slot) return;

    document.title = `EP.${String(ep.number).padStart(2, "0")} ${ep.shortTitle} · ${data.site.name}`;

    const idx = data.episodes.findIndex((e) => e.id === ep.id);
    const prev = data.episodes[idx - 1];
    const next = data.episodes[idx + 1];

    slot.innerHTML = `
      <div class="cover"><img src="${ep.cover}" alt="EP${String(ep.number).padStart(2, "0")} 封面"></div>
      <div>
        <div class="ep-meta">
          <span>EP.${String(ep.number).padStart(2, "0")}</span>
          <span>${fmtDate(ep.date)}</span>
          <span>${fmtDur(ep.duration)}</span>
          <span>${data.site.season}</span>
        </div>
        <h1>${ep.title}</h1>
        <div class="hero-actions" style="margin-bottom:20px">
          <button class="btn btn-primary" data-play-ep="${ep.id}">播放本集</button>
          <a class="btn" href="${audioUrl(data.site, ep)}" download>下载音频</a>
          <a class="btn btn-ghost" href="episodes.html">全部单集</a>
        </div>
        <div class="ep-summary">${ep.summary}</div>
        <h2 style="margin:8px 0 12px;font-size:18px">分段要点</h2>
        <ol class="highlights">
          ${(ep.highlights || [])
            .map(
              (h) => `
            <li>
              <div class="t">${h.time}</div>
              <div>
                <strong>${h.title}</strong>
                <span>${h.text}</span>
              </div>
            </li>`
            )
            .join("")}
        </ol>
        <div class="chip-row">
          ${(ep.keywords || []).map((k) => `<span class="chip">#${k}</span>`).join("")}
        </div>
        <div class="callout">本集内容仅供科普参考，不构成医疗建议。健康决策请咨询专业医生。</div>
        <div class="pager">
          ${prev ? `<a class="btn" href="episode.html?id=${prev.id}">← EP.${String(prev.number).padStart(2, "0")}</a>` : "<span></span>"}
          ${next ? `<a class="btn" href="episode.html?id=${next.id}">EP.${String(next.number).padStart(2, "0")} →</a>` : "<span></span>"}
        </div>
      </div>`;
    bindPlayButtons(slot);
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
