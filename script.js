/* =========================================================
   BrosTwos – Countdown zum nächsten YouTube-Video
   Release: jeden Sonntag um 14:00 Uhr (Europe/Berlin)
   ========================================================= */

(() => {
  "use strict";

  const CONFIG = {
    channelId: "UC75Snr5EgOnSEALpFigXpdQ",
    channelUrl: "https://www.youtube.com/@mcBrosTwos",
    timeZone: "Europe/Berlin",
    releaseWeekday: 0, // 0 = Sonntag
    releaseHour: 14,
    releaseMinute: 0,
    // Ein Video gilt 48 Stunden lang als "neu".
    freshWindowMs: 48 * 60 * 60 * 1000,
    // Toleranz, falls YouTube ein Video ein paar Minuten früher freigibt.
    graceBeforeMs: 20 * 60 * 1000,
    // Nach dem Release so lange "0" anzeigen, falls das Video noch nicht im Feed steht.
    graceAfterMs: 45 * 60 * 1000,
    pollMs: 2 * 60 * 1000,
    cacheTtlMs: 60 * 1000,
    requestTimeoutMs: 10000
  };

  const FEED_URL =
    "https://www.youtube.com/feeds/videos.xml?channel_id=" + CONFIG.channelId;
  const CACHE_KEY = "brostwos:latest-video:v1";

  const els = {
    banner: document.getElementById("release-banner"),
    nextDate: document.getElementById("next-release-date"),
    days: document.getElementById("cd-days"),
    hours: document.getElementById("cd-hours"),
    minutes: document.getElementById("cd-minutes"),
    seconds: document.getElementById("cd-seconds"),
    progress: document.getElementById("week-progress"),
    status: document.getElementById("status"),
    statusText: document.getElementById("status-text"),
    badge: document.getElementById("new-badge"),
    refresh: document.getElementById("refresh-button"),
    player: document.getElementById("player"),
    poster: document.getElementById("player-poster"),
    embed: document.getElementById("player-embed"),
    play: document.getElementById("play-button"),
    thumbnail: document.getElementById("video-thumbnail"),
    kicker: document.getElementById("video-kicker"),
    title: document.getElementById("video-title"),
    date: document.getElementById("video-date"),
    link: document.getElementById("video-link"),
    hint: document.getElementById("video-hint"),
    note: document.getElementById("load-note"),
    year: document.getElementById("year")
  };

  let latestVideo = null;
  let currentVideoId = null;
  let loading = false;
  let feedFailed = false;
  let lastSeconds = null;
  let lastProgress = -1;

  /* ---------------------------------------------------------
     Zeitzonen-Helfer (Europe/Berlin, inkl. Sommerzeit)
     --------------------------------------------------------- */

  const zonedPartsFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: CONFIG.timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const longDateFormatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: CONFIG.timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const shortDateFormatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: CONFIG.timeZone,
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  const weekdayFormatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: CONFIG.timeZone,
    weekday: "long"
  });

  const timeFormatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: CONFIG.timeZone,
    hour: "2-digit",
    minute: "2-digit"
  });

  function zonedParts(date) {
    const raw = {};
    for (const part of zonedPartsFormatter.formatToParts(date)) {
      if (part.type !== "literal") raw[part.type] = part.value;
    }
    return {
      year: Number(raw.year),
      month: Number(raw.month),
      day: Number(raw.day),
      hour: Number(raw.hour),
      minute: Number(raw.minute),
      second: Number(raw.second)
    };
  }

  function timeZoneOffset(date) {
    const p = zonedParts(date);
    const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const truncated = Math.floor(date.getTime() / 1000) * 1000;
    return asUTC - truncated;
  }

  // Wandelt eine Berliner Wanduhrzeit in einen echten Zeitpunkt um.
  function zonedDate(year, month, day, hour, minute) {
    const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    let timestamp = guess - timeZoneOffset(new Date(guess));
    timestamp = guess - timeZoneOffset(new Date(timestamp));
    return new Date(timestamp);
  }

  function getLastRelease(now = new Date()) {
    const p = zonedParts(now);
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    let candidate = zonedDate(
      p.year,
      p.month,
      p.day - weekday,
      CONFIG.releaseHour,
      CONFIG.releaseMinute
    );
    if (candidate.getTime() > now.getTime()) {
      candidate = zonedDate(
        p.year,
        p.month,
        p.day - weekday - 7,
        CONFIG.releaseHour,
        CONFIG.releaseMinute
      );
    }
    return candidate;
  }

  function getNextRelease(now = new Date()) {
    const p = zonedParts(now);
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    const daysAhead = (CONFIG.releaseWeekday - weekday + 7) % 7;
    let candidate = zonedDate(
      p.year,
      p.month,
      p.day + daysAhead,
      CONFIG.releaseHour,
      CONFIG.releaseMinute
    );
    if (candidate.getTime() <= now.getTime()) {
      candidate = zonedDate(
        p.year,
        p.month,
        p.day + daysAhead + 7,
        CONFIG.releaseHour,
        CONFIG.releaseMinute
      );
    }
    return candidate;
  }

  function formatPublished(date) {
    const today = zonedParts(new Date());
    const then = zonedParts(date);
    const dayDiff = Math.round(
      (Date.UTC(today.year, today.month - 1, today.day) -
        Date.UTC(then.year, then.month - 1, then.day)) /
        86400000
    );
    const time = timeFormatter.format(date);

    if (dayDiff === 0) return `Heute, ${time} Uhr`;
    if (dayDiff === 1) return `Gestern, ${time} Uhr`;
    if (dayDiff > 1 && dayDiff < 7) {
      return `${weekdayFormatter.format(date)}, ${time} Uhr`;
    }
    return `${shortDateFormatter.format(date)}, ${time} Uhr`;
  }

  /* ---------------------------------------------------------
     Video-Status
     --------------------------------------------------------- */

  function isFreshVideo(video) {
    if (!video) return false;
    const now = Date.now();
    const published = video.published.getTime();
    const age = now - published;
    if (age < 0 || age > CONFIG.freshWindowMs) return false;
    const lastRelease = getLastRelease(new Date(now)).getTime();
    return published >= lastRelease - CONFIG.graceBeforeMs;
  }

  function isWaitingForRelease(now = Date.now()) {
    if (isFreshVideo(latestVideo)) return false;
    const last = getLastRelease(new Date(now)).getTime();
    return now >= last && now - last < CONFIG.graceAfterMs;
  }

  /* ---------------------------------------------------------
     Countdown
     --------------------------------------------------------- */

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function updateCountdown() {
    const now = new Date();
    const next = getNextRelease(now);
    const last = getLastRelease(now);
    const waiting = isWaitingForRelease(now.getTime());
    const target = waiting ? last : next;

    const diff = Math.max(0, target.getTime() - now.getTime());
    const totalSeconds = Math.floor(diff / 1000);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    els.days.textContent = pad(days);
    els.hours.textContent = pad(hours);
    els.minutes.textContent = pad(minutes);
    els.seconds.textContent = pad(seconds);

    if (seconds !== lastSeconds) {
      if (lastSeconds !== null) {
        els.seconds.classList.remove("is-ticking");
        void els.seconds.offsetWidth;
        els.seconds.classList.add("is-ticking");
      }
      lastSeconds = seconds;
    }

    els.nextDate.textContent = longDateFormatter.format(next);

    const cycle = next.getTime() - last.getTime();
    const progress = waiting
      ? 1
      : cycle > 0
        ? Math.min(1, Math.max(0, (now.getTime() - last.getTime()) / cycle))
        : 0;
    const progressPercent = Math.round(progress * 1000) / 10;
    if (progressPercent !== lastProgress) {
      els.progress.style.width = `${progressPercent}%`;
      lastProgress = progressPercent;
    }

    updateStatus(now.getTime());
  }

  function updateStatus(now = Date.now()) {
    const fresh = isFreshVideo(latestVideo);
    const waiting = isWaitingForRelease(now);

    if (fresh) {
      els.status.dataset.state = "online";
      els.statusText.textContent = "Neues Video online – das nächste kommt am Sonntag";
    } else if (waiting) {
      els.status.dataset.state = "waiting";
      els.statusText.textContent = "Wir warten auf das neue Video …";
    } else if (!latestVideo && feedFailed) {
      els.status.dataset.state = "waiting";
      els.statusText.textContent = "YouTube-Feed gerade nicht erreichbar";
    } else if (!latestVideo) {
      els.status.dataset.state = "loading";
      els.statusText.textContent = "Neuestes Video wird geladen …";
    } else {
      els.status.dataset.state = "waiting";
      els.statusText.textContent = "Alles im Zeitplan – jeden Sonntag um 14:00 Uhr";
    }

    updateFreshnessUI(fresh);
  }

  function updateFreshnessUI(fresh = isFreshVideo(latestVideo)) {
    if (els.banner.hidden === fresh) els.banner.hidden = !fresh;
    if (els.badge.hidden === fresh) els.badge.hidden = !fresh;
    if (latestVideo && els.kicker.textContent !== (fresh ? "Gerade veröffentlicht" : "Zuletzt veröffentlicht")) {
      els.kicker.textContent = fresh ? "Gerade veröffentlicht" : "Zuletzt veröffentlicht";
    }
  }

  /* ---------------------------------------------------------
     Cache
     --------------------------------------------------------- */

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.video || !parsed.video.id || !parsed.video.published) {
        return null;
      }
      return {
        fetchedAt: Number(parsed.fetchedAt) || 0,
        video: {
          id: parsed.video.id,
          title: parsed.video.title,
          url: parsed.video.url,
          published: new Date(parsed.video.published)
        }
      };
    } catch (error) {
      return null;
    }
  }

  function writeCache(video) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          fetchedAt: Date.now(),
          video: {
            id: video.id,
            title: video.title,
            url: video.url,
            published: video.published.toISOString()
          }
        })
      );
    } catch (error) {
      /* localStorage kann z. B. im privaten Modus gesperrt sein. */
    }
  }

  /* ---------------------------------------------------------
     Feed laden (mit CORS-Proxy- und JSONP-Fallback)
     --------------------------------------------------------- */

  function buildFeedUrl() {
    const separator = FEED_URL.includes("?") ? "&" : "?";
    return `${FEED_URL}${separator}_=${Date.now()}`;
  }

  async function requestAllOrigins(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
    try {
      const response = await fetch(
        `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        { signal: controller.signal, cache: "no-store" }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data || typeof data.contents !== "string" || !data.contents) {
        throw new Error("Leere Antwort");
      }
      return data.contents;
    } finally {
      clearTimeout(timer);
    }
  }

  function requestJsonp(url) {
    return new Promise((resolve, reject) => {
      const callbackName = `__brosTwosFeed_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      let timer = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        delete window[callbackName];
        script.remove();
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new Error("Zeitüberschreitung"));
      }, CONFIG.requestTimeoutMs);

      window[callbackName] = (data) => {
        const contents = data && typeof data.contents === "string" ? data.contents : "";
        cleanup();
        if (contents) resolve(contents);
        else reject(new Error("Leere Antwort"));
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Netzwerkfehler"));
      };

      script.src =
        `https://api.allorigins.win/get?url=${encodeURIComponent(url)}` +
        `&callback=${callbackName}`;
      document.head.appendChild(script);
    });
  }

  async function requestCodetabs(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
    try {
      const response = await fetch(
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        { signal: controller.signal, cache: "no-store" }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!text || text.length < 100) throw new Error("Leere Antwort");
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  function parseFeed(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    const entries = Array.from(doc.getElementsByTagNameNS("*", "entry"));
    if (!entries.length) throw new Error("Keine Videos im Feed");

    const videos = entries
      .map((entry) => {
        const read = (tag) => {
          const node = entry.getElementsByTagNameNS("*", tag)[0];
          return node ? node.textContent.trim() : "";
        };
        const id = read("videoId");
        const published = new Date(read("published"));
        const linkNode = entry.getElementsByTagNameNS("*", "link")[0];
        const url = linkNode
          ? linkNode.getAttribute("href")
          : `https://www.youtube.com/watch?v=${id}`;

        return {
          id,
          title: read("title") || "Neues Video von BrosTwos",
          url: url || `https://www.youtube.com/watch?v=${id}`,
          published
        };
      })
      .filter((video) => video.id && !Number.isNaN(video.published.getTime()));

    if (!videos.length) throw new Error("Keine gültigen Videos im Feed");
    videos.sort((a, b) => b.published.getTime() - a.published.getTime());
    return videos[0];
  }

  async function fetchLatestVideo() {
    const url = buildFeedUrl();
    // JSONP funktioniert auch beim direkten Öffnen über file:// ohne CORS-Probleme.
    const attempts = [requestJsonp, requestAllOrigins, requestCodetabs];

    let lastError = null;
    for (const attempt of attempts) {
      try {
        const text = await attempt(url);
        return parseFeed(text);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Feed konnte nicht geladen werden");
  }

  async function loadLatestVideo(force = false) {
    if (loading) return;

    const cache = readCache();
    if (!force && cache && Date.now() - cache.fetchedAt < CONFIG.cacheTtlMs) {
      latestVideo = cache.video;
      feedFailed = false;
      renderVideo();
      return;
    }

    loading = true;
    els.refresh.classList.add("is-spinning");
    els.refresh.disabled = true;

    try {
      const video = await fetchLatestVideo();
      latestVideo = video;
      feedFailed = false;
      writeCache(video);
      renderVideo();
      showNote("");
    } catch (error) {
      feedFailed = true;
      if (cache && cache.video) {
        latestVideo = cache.video;
        renderVideo();
        showNote(
          "YouTube ist gerade nicht erreichbar – angezeigt wird das zuletzt geladene Video.",
          false
        );
      } else {
        latestVideo = null;
        renderVideoError();
      }
    } finally {
      loading = false;
      els.refresh.classList.remove("is-spinning");
      els.refresh.disabled = false;
      updateStatus();
    }
  }

  function showNote(text, isError = true) {
    els.note.textContent = text;
    els.note.classList.toggle("load-note--error", Boolean(text) && isError);
    els.note.hidden = !text;
  }

  /* ---------------------------------------------------------
     Video-Karte rendern
     --------------------------------------------------------- */

  function resetPlayer() {
    els.embed.hidden = true;
    els.embed.replaceChildren();
    els.player.classList.remove("is-playing");
  }

  function renderVideo() {
    const video = latestVideo;
    if (!video) {
      renderVideoError();
      return;
    }

    if (video.id !== currentVideoId) {
      resetPlayer();
      currentVideoId = video.id;
      els.thumbnail.dataset.fallback = "";
      els.thumbnail.src = `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`;
      els.thumbnail.alt = `Vorschaubild: ${video.title}`;
    }

    els.player.classList.remove("is-loading");
    els.title.textContent = video.title;
    els.kicker.textContent = isFreshVideo(video) ? "Gerade veröffentlicht" : "Zuletzt veröffentlicht";
    els.date.textContent = formatPublished(video.published);
    els.date.setAttribute("datetime", video.published.toISOString());
    els.link.href = video.url;
    els.link.setAttribute("target", "_blank");
    els.link.setAttribute("rel", "noopener");
    els.hint.textContent = "Falls das Video nicht lädt, öffne es direkt auf YouTube.";
    els.play.disabled = false;
    els.play.setAttribute("aria-label", `„${video.title}“ abspielen`);

    updateFreshnessUI();
  }

  function renderVideoError() {
    resetPlayer();
    els.player.classList.remove("is-loading");
    els.thumbnail.removeAttribute("src");
    els.thumbnail.alt = "";
    els.kicker.textContent = "Verbindung fehlgeschlagen";
    els.title.textContent = "Das neueste Video konnte gerade nicht geladen werden.";
    els.date.textContent = "–";
    els.date.removeAttribute("datetime");
    els.link.href = CONFIG.channelUrl;
    els.play.disabled = true;
    els.play.setAttribute("aria-label", "Video konnte nicht geladen werden");
    els.hint.textContent = "Öffne den Kanal direkt auf YouTube, um das neueste Video zu sehen.";
    els.badge.hidden = true;
    els.banner.hidden = true;
    showNote(
      "Der YouTube-Feed ist gerade nicht erreichbar. Bitte später erneut versuchen oder den Kanal direkt öffnen.",
      true
    );
  }

  /* ---------------------------------------------------------
     Player
     --------------------------------------------------------- */

  function playLatestVideo() {
    if (!latestVideo) return;
    const iframe = document.createElement("iframe");
    iframe.src =
      `https://www.youtube-nocookie.com/embed/${latestVideo.id}` +
      "?autoplay=1&rel=0&modestbranding=1";
    iframe.title = latestVideo.title;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.loading = "eager";

    els.embed.replaceChildren(iframe);
    els.embed.hidden = false;
    els.player.classList.add("is-playing");
  }

  /* ---------------------------------------------------------
     Start
     --------------------------------------------------------- */

  function init() {
    els.year.textContent = String(new Date().getFullYear());

    els.play.addEventListener("click", playLatestVideo);
    els.poster.addEventListener("click", (event) => {
      if (event.target === els.play || els.play.contains(event.target)) return;
      playLatestVideo();
    });

    els.thumbnail.addEventListener("error", () => {
      if (!latestVideo) return;
      if (els.thumbnail.dataset.fallback !== "1") {
        els.thumbnail.dataset.fallback = "1";
        els.thumbnail.src = `https://i.ytimg.com/vi/${latestVideo.id}/hqdefault.jpg`;
      } else if (els.thumbnail.dataset.fallback !== "2") {
        els.thumbnail.dataset.fallback = "2";
        els.thumbnail.src = `https://i.ytimg.com/vi/${latestVideo.id}/default.jpg`;
      }
    });

    els.refresh.addEventListener("click", () => loadLatestVideo(true));

    const cached = readCache();
    if (cached) {
      latestVideo = cached.video;
      renderVideo();
      if (Date.now() - cached.fetchedAt > 10 * 60 * 1000) {
        showNote("Zeige das zuletzt geladene Video – aktuelle Daten werden geprüft …", false);
      }
    }

    updateCountdown();
    updateStatus();
    loadLatestVideo(false);

    setInterval(updateCountdown, 250);

    setInterval(() => {
      if (!document.hidden) loadLatestVideo(false);
    }, CONFIG.pollMs);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) loadLatestVideo(false);
    });
  }

  init();
})();
