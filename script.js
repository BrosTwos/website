/* BrosTwos – Countdown zum nächsten Video (Sonntag, 14:00 Uhr, Europe/Berlin) */

(() => {
  "use strict";

  const CHANNEL_ID = "UC75Snr5EgOnSEALpFigXpdQ";
  const CHANNEL_URL = "https://www.youtube.com/@mcBrosTwos";
  const TIME_ZONE = "Europe/Berlin";
  const RELEASE_HOUR = 14;
  const CACHE_KEY = "brostwos:video:v2";
  const CACHE_TTL = 2 * 60 * 1000;
  const POLL_MS = 2 * 60 * 1000;

  const el = (id) => document.getElementById(id);
  const ui = {
    days: el("days"),
    hours: el("hours"),
    minutes: el("minutes"),
    seconds: el("seconds"),
    nextDate: el("next-date"),
    player: el("player"),
    thumb: el("thumb"),
    play: el("play"),
    title: el("title"),
    date: el("date"),
    status: el("status"),
    link: el("link"),
    refresh: el("refresh"),
    year: el("year")
  };

  let current = null;

  /* ---------------------------------------------------------
     Zeitzone: Berliner Uhrzeit → echter Zeitpunkt
     --------------------------------------------------------- */

  const partsFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const dateFormatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const timeFormatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit"
  });

  function parts(date) {
    const out = {};
    for (const part of partsFormatter.formatToParts(date)) {
      if (part.type !== "literal") out[part.type] = Number(part.value);
    }
    return out;
  }

  function offset(date) {
    const p = parts(date);
    const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUTC - Math.floor(date.getTime() / 1000) * 1000;
  }

  function berlinTime(year, month, day, hour) {
    const guess = Date.UTC(year, month - 1, day, hour, 0, 0);
    return new Date(guess - offset(new Date(guess - offset(new Date(guess)))));
  }

  function nextRelease(now) {
    const p = parts(now);
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    const daysAhead = (7 - weekday) % 7;

    let target = berlinTime(p.year, p.month, p.day + daysAhead, RELEASE_HOUR);
    if (target <= now) {
      target = berlinTime(p.year, p.month, p.day + daysAhead + 7, RELEASE_HOUR);
    }
    return target;
  }

  /* ---------------------------------------------------------
     Countdown
     --------------------------------------------------------- */

  const pad = (n) => String(n).padStart(2, "0");

  function tick() {
    const now = new Date();
    const target = nextRelease(now);
    const total = Math.max(0, Math.floor((target - now) / 1000));

    ui.days.textContent = pad(Math.floor(total / 86400));
    ui.hours.textContent = pad(Math.floor((total % 86400) / 3600));
    ui.minutes.textContent = pad(Math.floor((total % 3600) / 60));
    ui.seconds.textContent = pad(total % 60);
    ui.nextDate.textContent = dateFormatter.format(target);
  }

  /* ---------------------------------------------------------
     Video laden
     --------------------------------------------------------- */

  function readCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (!raw || !raw.id) return null;

      const published = new Date(raw.published);
      if (Number.isNaN(published.getTime())) return null;

      return { id: raw.id, title: raw.title, published, at: Number(raw.at) || 0 };
    } catch (error) {
      return null;
    }
  }

  function writeCache(video) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ...video, at: Date.now() })
      );
    } catch (error) {
      /* localStorage kann gesperrt sein */
    }
  }

  function parseFeed(xml) {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const entries = [...doc.getElementsByTagNameNS("*", "entry")];
    if (!entries.length) throw new Error("Leerer Feed");

    const read = (node, tag) =>
      node.getElementsByTagNameNS("*", tag)[0]?.textContent.trim() || "";

    const videos = entries
      .map((entry) => ({
        id: read(entry, "videoId"),
        title: read(entry, "title"),
        url: entry.getElementsByTagNameNS("*", "link")[0]?.getAttribute("href") || "",
        published: new Date(read(entry, "published"))
      }))
      .filter((v) => v.id && !Number.isNaN(v.published.getTime()));

    // Shorts ignorieren, außer der Kanal hat nur welche.
    const regular = videos.filter((v) => !/\/shorts\//.test(v.url));
    const list = regular.length ? regular : videos;
    list.sort((a, b) => b.published - a.published);

    if (!list.length) throw new Error("Keine Videos im Feed");
    return { id: list[0].id, title: list[0].title, published: list[0].published };
  }

  async function fetchLatest() {
    // 1. Eigener Server (lokal): schnellster und stabilster Weg.
    if (location.protocol !== "file:") {
      try {
        const response = await fetch("/api/latest-video", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          if (data && data.id) {
            return {
              id: data.id,
              title: data.title || "Neues Video",
              published: new Date(data.published)
            };
          }
        }
      } catch (error) {
        /* weiter mit dem Feed */
      }
    }

    // 2. Ohne Server: YouTube-Feed über einen CORS-Proxy.
    const feed = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
    const response = await fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(feed)}`,
      { cache: "no-store" }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data || !data.contents) throw new Error("Leere Antwort");
    return parseFeed(data.contents);
  }

  /* ---------------------------------------------------------
     Anzeige
     --------------------------------------------------------- */

  function formatPublished(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "–";
    const today = parts(new Date());
    const then = parts(date);
    const days = Math.round(
      (Date.UTC(today.year, today.month - 1, today.day) -
        Date.UTC(then.year, then.month - 1, then.day)) / 86400000
    );
    const time = timeFormatter.format(date);

    if (days === 0) return `Heute, ${time} Uhr`;
    if (days === 1) return `Gestern, ${time} Uhr`;
    return `${dateFormatter.format(date)}, ${time} Uhr`;
  }

  function render(video) {
    if (video.id !== current) {
      current = video.id;
      ui.player.querySelector("iframe")?.remove();
      ui.play.hidden = false;
      ui.thumb.dataset.fallback = "";
      ui.thumb.src = `https://i.ytimg.com/vi/${video.id}/hq720.jpg`;
      ui.thumb.alt = video.title;
      ui.play.disabled = false;
    }

    ui.title.textContent = video.title;
    ui.date.textContent = formatPublished(video.published);
    ui.link.href = `https://www.youtube.com/watch?v=${video.id}`;
    ui.play.setAttribute("aria-label", `„${video.title}“ abspielen`);
    ui.status.textContent = "YouTube";
  }

  function renderError() {
    ui.title.textContent = "Video konnte nicht geladen werden";
    ui.date.textContent = "–";
    ui.link.href = CHANNEL_URL;
    ui.play.disabled = true;
    ui.status.textContent = "Feed nicht erreichbar";
  }

  async function loadVideo(force = false) {
    const cached = readCache();
    if (cached) render(cached);
    if (!force && cached && Date.now() - cached.at < CACHE_TTL) return;

    try {
      const video = await fetchLatest();
      writeCache(video);
      render(video);
    } catch (error) {
      if (!cached) renderError();
      else ui.status.textContent = "Zuletzt geladene Daten";
    }
  }

  /* ---------------------------------------------------------
     Player & Start
     --------------------------------------------------------- */

  function play() {
    if (!current) return;
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube-nocookie.com/embed/${current}?autoplay=1&rel=0`;
    iframe.title = ui.title.textContent;
    iframe.allow = "accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;

    ui.play.hidden = true;
    ui.player.append(iframe);
  }

  ui.year.textContent = String(new Date().getFullYear());
  ui.play.addEventListener("click", play);
  ui.refresh.addEventListener("click", () => loadVideo(true));
  ui.thumb.addEventListener("error", () => {
    if (current && !ui.thumb.dataset.fallback) {
      ui.thumb.dataset.fallback = "1";
      ui.thumb.src = `https://i.ytimg.com/vi/${current}/hqdefault.jpg`;
    }
  });

  tick();
  setInterval(tick, 1000);

  loadVideo();
  setInterval(() => {
    if (!document.hidden) loadVideo();
  }, POLL_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadVideo();
  });
})();
