(function () {
  const namespace = (window.InmoUtils = window.InmoUtils || {});
  const priceNoDecimalsFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
  const priceOneDecimalFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
  const clockFormatter = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const preloadedMediaSources = new Set();

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeHexColor(value, fallback) {
    const text = String(value || "").trim();
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text) ? text : fallback;
  }

  function hexToRgbParts(hex) {
    const normalized = normalizeHexColor(hex, "#000000").replace(/^#/, "");
    const expanded = normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized;
    const parsed = Number.parseInt(expanded, 16);

    if (Number.isNaN(parsed)) {
      return [0, 0, 0];
    }

    return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
  }

  function hexToRgb(hex) {
    const [red, green, blue] = hexToRgbParts(hex);

    return `${red}, ${green}, ${blue}`;
  }

  function blendHexColors(baseHex, overlayHex, overlayWeight = 0.2) {
    const normalizedWeight = clamp(overlayWeight, 0, 1);
    const base = hexToRgbParts(baseHex);
    const overlay = hexToRgbParts(overlayHex);

    const red = Math.round(base[0] * (1 - normalizedWeight) + overlay[0] * normalizedWeight);
    const green = Math.round(base[1] * (1 - normalizedWeight) + overlay[1] * normalizedWeight);
    const blue = Math.round(base[2] * (1 - normalizedWeight) + overlay[2] * normalizedWeight);

    return `#${[red, green, blue]
      .map((component) => component.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function formatPrice(value) {
    return priceNoDecimalsFormatter.format(value);
  }

  function formatCompactPrice(value) {
    const valueInMillions = value / 1000000;

    if (valueInMillions >= 10) {
      return `U$S ${priceNoDecimalsFormatter.format(valueInMillions)} M`;
    }

    return `U$S ${priceOneDecimalFormatter.format(valueInMillions)} M`;
  }

  function formatIndex(current, total) {
    return `${String(current).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  }

  function formatCountdown(milliseconds) {
    return `${String(Math.max(0, Math.ceil(milliseconds / 1000))).padStart(2, "0")}s`;
  }

  function formatClock(date = new Date()) {
    return clockFormatter.format(date);
  }

  function applyTheme(theme) {
    const fallbackTheme = {
      primary: "#7dd3fc",
      secondary: "#dbeafe",
      tertiary: "#60a5fa",
      glow: "#f8fafc",
    };
    const source = theme && typeof theme === "object" ? theme : {};
    const palette = {
      primary: blendHexColors(fallbackTheme.primary, normalizeHexColor(source.primary ?? source.theme_primary ?? source.themePrimary ?? source.color, fallbackTheme.primary), 0.12),
      secondary: blendHexColors(fallbackTheme.secondary, normalizeHexColor(source.secondary ?? source.theme_secondary ?? source.themeSecondary, fallbackTheme.secondary), 0.08),
      tertiary: blendHexColors(fallbackTheme.tertiary, normalizeHexColor(source.tertiary ?? source.theme_tertiary ?? source.themeTertiary, fallbackTheme.tertiary), 0.06),
      glow: blendHexColors(fallbackTheme.glow, normalizeHexColor(source.glow ?? source.theme_glow ?? source.themeGlow, fallbackTheme.glow), 0.05),
    };

    const root = document.documentElement;
    const primary = palette.primary;
    const secondary = palette.secondary;
    const tertiary = palette.tertiary;
    const glow = palette.glow;

    root.style.setProperty("--accent-1", primary);
    root.style.setProperty("--accent-1-rgb", hexToRgb(primary));
    root.style.setProperty("--accent-2", secondary);
    root.style.setProperty("--accent-2-rgb", hexToRgb(secondary));
    root.style.setProperty("--accent-3", tertiary);
    root.style.setProperty("--accent-3-rgb", hexToRgb(tertiary));
    root.style.setProperty("--accent-4", glow);
    root.style.setProperty("--accent-4-rgb", hexToRgb(glow));

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute("content", "#07111c");
    }
  }

  function preloadMedia(media) {
    if (!media) {
      return;
    }

    if (media.type === "video") {
      if (media.poster) {
        if (preloadedMediaSources.has(media.poster)) {
          return;
        }

        preloadedMediaSources.add(media.poster);

        const poster = new Image();
        poster.decoding = "async";
        poster.referrerPolicy = "no-referrer";
        poster.src = media.poster;
      }

      return;
    }

    if (!media.src || preloadedMediaSources.has(media.src)) {
      return;
    }

    preloadedMediaSources.add(media.src);

    const image = new Image();
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.src = media.src;
  }

  namespace.clamp = clamp;
  namespace.hexToRgb = hexToRgb;
  namespace.formatPrice = formatPrice;
  namespace.formatCompactPrice = formatCompactPrice;
  namespace.formatIndex = formatIndex;
  namespace.formatCountdown = formatCountdown;
  namespace.formatClock = formatClock;
  namespace.applyTheme = applyTheme;
  namespace.preloadMedia = preloadMedia;
})();
