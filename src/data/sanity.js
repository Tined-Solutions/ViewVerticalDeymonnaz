(function () {
  const namespace = (window.InmoCatalogSource = window.InmoCatalogSource || {});
  const defaultTheme = {
    primary: "#128a70",
    secondary: "#6ecfb1",
    tertiary: "#d1f7ea",
    glow: "#f7fffb",
    panelGradientTop: "rgba(4, 34, 27, 0.7)",
    panelGradientBottom: "rgba(2, 16, 13, 0.61)",
  };
  const fallbackVisualThemePresets = {
    tema1: {
      primary: "#128a70",
      secondary: "#6ecfb1",
      tertiary: "#d1f7ea",
      glow: "#f7fffb",
      panelGradientTop: "rgba(4, 34, 27, 0.7)",
      panelGradientBottom: "rgba(2, 16, 13, 0.61)",
    },
    tema2: {
      primary: "#5d6670",
      secondary: "#737c86",
      tertiary: "#8f98a3",
      glow: "#bcc3ca",
      panelGradientTop: "rgba(22, 25, 30, 0.69)",
      panelGradientBottom: "rgba(13, 16, 19, 0.59)",
    },
    tema3: {
      primary: "#173b5d",
      secondary: "#235784",
      tertiary: "#387ab0",
      glow: "#c9ddf5",
      panelGradientTop: "rgba(10, 16, 28, 0.69)",
      panelGradientBottom: "rgba(6, 10, 18, 0.59)",
    },
  };

  function getVisualThemePresets() {
    return window.InmoVisualThemePresets || fallbackVisualThemePresets;
  }

  function toText(value) {
    return String(value ?? "").trim();
  }

  function normalizeFieldToken(value) {
    return toText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function hasValue(value) {
    return value !== undefined && value !== null && toText(value) !== "";
  }

  function toArray(value) {
    if (Array.isArray(value)) {
      return value;
    }

    if (!hasValue(value)) {
      return [];
    }

    return [value];
  }

  function isTruthy(value) {
    const text = toText(value).toLowerCase();
    return ["1", "true", "yes", "si", "sí", "on", "active", "published", "live"].includes(text);
  }

  function isFalsey(value) {
    const text = toText(value).toLowerCase();
    return ["0", "false", "no", "off", "inactive", "archived", "disabled", "hidden", "draft"].includes(text);
  }

  function isRecordActive(record) {
    if (Object.prototype.hasOwnProperty.call(record, "active")) {
      return isTruthy(record.active) || !isFalsey(record.active);
    }

    if (Object.prototype.hasOwnProperty.call(record, "status")) {
      return !isFalsey(record.status);
    }

    return true;
  }

  function collectPublicationTargets(value, targets, seen = new Set()) {
    if (!hasValue(value)) {
      return;
    }

    if (value && typeof value === "object") {
      if (seen.has(value)) {
        return;
      }

      seen.add(value);
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => collectPublicationTargets(entry, targets, seen));
      return;
    }

    if (typeof value === "object") {
      const keys = [
        "value",
        "label",
        "title",
        "name",
        "current",
        "publicarEn",
        "publicacion",
        "canal",
        "canalPublicacion",
        "publicationChannel",
        "publicationTarget",
      ];

      keys.forEach((key) => {
        const nested = readField(value, key);

        if (hasValue(nested)) {
          collectPublicationTargets(nested, targets, seen);
        }
      });

      return;
    }

    const text = toText(value);

    if (text) {
      targets.push(text);
    }
  }

  function isVerticalPublicationTarget(value) {
    const normalized = normalizeFieldToken(value);

    if (!normalized) {
      return false;
    }

    if (normalized === "vertical" || normalized === "ambos") {
      return true;
    }

    const segments = toText(value)
      .toLowerCase()
      .split(/[,;/|+&]|\by\b|\band\b/)
      .map((segment) => normalizeFieldToken(segment))
      .filter(Boolean);

    return segments.includes("vertical") || segments.includes("ambos");
  }

  function isPublishedForVertical(doc) {
    const publishInValue = pickField(
      doc,
      [
        "Difusion.Publicar en",
        "Difusion.publicarEn",
        "Difusion.canalPublicacion",
        "Difusion.publicationChannel",
        "Difusion.publicationTarget",
        "difusion.Publicar en",
        "difusion.publicarEn",
        "difusion.publicar_en",
        "difusion.publicacion",
        "difusion.canal",
        "difusion.canalPublicacion",
        "difusion.publicationChannel",
        "difusion.publicationTarget",
        "diffusion.publishIn",
        "diffusion.publicationChannel",
        "diffusion.publicationTarget",
        "Publicar en",
        "publicar en",
        "publicarEn",
        "publicar_en",
        "sitioPublicacion",
        "sitio_publicacion",
        "sitioDePublicacion",
        "publicacion",
        "canalPublicacion",
        "publicationChannel",
        "publicationTarget",
      ],
      undefined
    );

    if (!hasValue(publishInValue)) {
      return false;
    }

    const targets = [];
    collectPublicationTargets(publishInValue, targets);

    return targets.some((target) => isVerticalPublicationTarget(target));
  }

  function parseNumber(value) {
    const cleaned = toText(value).replace(/[^0-9.-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseNullableNumber(value) {
    if (!hasValue(value)) {
      return null;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    const cleaned = toText(value).replace(/[^0-9.,-]/g, "").replace(",", ".");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function toPositiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function parsePrice(value) {
    return Math.round(parseNumber(value));
  }

  function toBooleanFlag(value) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value !== 0;
    }

    if (!hasValue(value)) {
      return false;
    }

    return isTruthy(value) && !isFalsey(value);
  }

  function readField(record, key) {
    if (!record || typeof record !== "object") {
      return undefined;
    }

    if (!key || typeof key !== "string") {
      return undefined;
    }

    const segments = key.split(".").filter(Boolean);
    let cursor = record;

    for (const segment of segments) {
      if (!cursor || typeof cursor !== "object") {
        return undefined;
      }

      let targetKey = segment;

      if (!Object.prototype.hasOwnProperty.call(cursor, targetKey)) {
        const normalizedSegment = normalizeFieldToken(segment);
        const matchedKey = Object.keys(cursor).find((candidate) => normalizeFieldToken(candidate) === normalizedSegment);

        if (!matchedKey) {
          return undefined;
        }

        targetKey = matchedKey;
      }

      cursor = cursor[targetKey];
    }

    return cursor;
  }

  function metricLabelFromKey(key) {
    const normalized = normalizeFieldToken(key);
    const aliases = {
      ambientes: "Ambientes",
      dormitorios: "Dormitorios",
      habitaciones: "Habitaciones",
      banos: "Baños",
      bathrooms: "Baños",
      cochera: "Cochera",
      garage: "Cochera",
      garages: "Cocheras",
      superficieterreno: "Superficie terreno",
      superficieedificada: "Superficie edificada",
      superficielegacy: "Superficie terreno",
      superficie: "Superficie terreno",
      superficietotal: "Superficie terreno",
      superficiecubierta: "Superficie edificada",
      totalarea: "Superficie terreno",
      coveredarea: "Superficie edificada",
      m2: "Superficie terreno",
      m2totales: "Superficie terreno",
      m2cubiertos: "Superficie edificada",
      metros: "Superficie terreno",
      metroscuadrados: "Superficie terreno",
      metrostotales: "Superficie terreno",
      metroscubiertos: "Superficie edificada",
      expensas: "Expensas",
    };

    if (aliases[normalized]) {
      return aliases[normalized];
    }

    return toText(key)
      .replace(/[_-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^./, (char) => char.toUpperCase());
  }

  function pickField(record, keys, fallback = "") {
    for (const key of toArray(keys)) {
      const value = readField(record, key);

      if (hasValue(value)) {
        return value;
      }
    }

    return fallback;
  }

  function resolveSurfaceModel(doc) {
    const superficieLegacy = parseNullableNumber(pickField(doc, ["Superficie", "superficie", "m2", "metros", "area", "metrosCuadrados", "mts2"], null));
    const superficieTerreno = parseNullableNumber(
      pickField(
        doc,
        [
          "SuperficieTerreno",
          "superficieTerreno",
          "superficie_terreno",
          "surfaceLand",
          "landArea",
          "superficieTotal",
          "SuperficieTotal",
          "totalArea",
          "m2Totales",
          "metrosTotales",
        ],
        null
      )
    );
    const superficieEdificada = parseNullableNumber(
      pickField(
        doc,
        [
          "SuperficieEdificada",
          "superficieEdificada",
          "superficie_edificada",
          "superficieCubierta",
          "SuperficieCubierta",
          "coveredArea",
          "m2Cubiertos",
          "metrosCubiertos",
        ],
        null
      )
    );

    return {
      superficieTerreno: superficieTerreno ?? superficieLegacy ?? null,
      superficieEdificada: superficieEdificada ?? null,
      superficieLegacy,
    };
  }

  function formatArea(value) {
    const text = toText(value);

    if (!text) {
      return "";
    }

    if (/m2|m\^2|mt2|metros/i.test(text)) {
      return text;
    }

    const numeric = parseNumber(text);

    if (Number.isFinite(numeric) && numeric > 0) {
      return `${Math.round(numeric)} m2`;
    }

    return text;
  }

  function parseDuration(value, fallbackMs = 0) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }

    const text = toText(value).toLowerCase();

    if (!text) {
      return fallbackMs;
    }

    const numeric = Number.parseFloat(text.replace(/[^0-9.,-]/g, "").replace(",", "."));

    if (!Number.isFinite(numeric) || numeric <= 0) {
      return fallbackMs;
    }

    if (text.includes("ms")) {
      return Math.round(numeric);
    }

    if (text.includes("s") || numeric <= 60) {
      return Math.round(numeric * 1000);
    }

    return Math.round(numeric);
  }

  function sanitizeHexColor(value, fallback) {
    const text = toText(value);
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text) ? text : fallback;
  }

  function normalizeThemeGradient(value, fallback) {
    const text = toText(value);
    return text || fallback;
  }

  function slugify(value) {
    return toText(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function safeUrl(value) {
    if (!value) {
      return "";
    }

    if (typeof value === "object") {
      if (typeof value.url === "string") {
        return safeUrl(value.url);
      }

      if (typeof value.src === "string") {
        return safeUrl(value.src);
      }

      if (value.asset && typeof value.asset.url === "string") {
        return safeUrl(value.asset.url);
      }

      if (value.image && value.image.asset && typeof value.image.asset.url === "string") {
        return safeUrl(value.image.asset.url);
      }

      if (value.video && value.video.asset && typeof value.video.asset.url === "string") {
        return safeUrl(value.video.asset.url);
      }

      if (value.file && value.file.asset && typeof value.file.asset.url === "string") {
        return safeUrl(value.file.asset.url);
      }
    }

    const text = toText(value);

    if (!text) {
      return "";
    }

    try {
      const url = new URL(text, window.location.href);

      if (!["http:", "https:", "data:"].includes(url.protocol)) {
        return "";
      }

      return url.href;
    } catch {
      return "";
    }
  }

  function inferMediaType(explicitType, src) {
    const type = toText(explicitType).toLowerCase();

    if (type === "video" || type.includes("video")) {
      return "video";
    }

    if (type === "image" || type.includes("image")) {
      return "image";
    }

    const lowerSrc = toText(src).split("?")[0].toLowerCase();

    return /(\.m3u8$|\.mpd$|stream\.mux\.com|\.mp4$|\.webm$|\.mov$|\.m4v$)/i.test(lowerSrc) ? "video" : "image";
  }

  function isSanityImageUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname === "cdn.sanity.io" && /\/images\//.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function optimizeImageUrl(src, config = {}) {
    const safeSrc = safeUrl(src);

    if (!safeSrc || !isSanityImageUrl(safeSrc)) {
      return safeSrc;
    }

    try {
      const url = new URL(safeSrc);
      const format = toText(config.imageFormat || "auto").toLowerCase();
      const performanceMode = config.tvPerformanceMode !== false;

      if (format === "original" || format === "none") {
        url.searchParams.delete("auto");
        url.searchParams.delete("fm");
      } else if (format === "webp" || format === "auto" || format === "format") {
        url.searchParams.delete("fm");
        url.searchParams.set("auto", "format");
      } else {
        url.searchParams.delete("auto");
        url.searchParams.set("fm", format);
      }

      const quality = performanceMode ? clampNumber(Math.min(toPositiveInteger(config.imageQuality, 68), 66), 45, 72) : clampNumber(toPositiveInteger(config.imageQuality, 72), 45, 90);
      const maxWidth = performanceMode ? clampNumber(Math.min(toPositiveInteger(config.imageMaxWidth, 1920), 1600), 640, 1920) : clampNumber(toPositiveInteger(config.imageMaxWidth, 2160), 640, 4096);
      const maxHeight = performanceMode ? clampNumber(Math.min(toPositiveInteger(config.imageMaxHeight, 3200), 2880), 640, 3200) : clampNumber(toPositiveInteger(config.imageMaxHeight, 3840), 640, 4096);

      url.searchParams.set("fit", "max");
      url.searchParams.set("q", String(quality));
      url.searchParams.set("w", String(maxWidth));
      url.searchParams.set("h", String(maxHeight));

      if (performanceMode) {
        url.searchParams.set("dpr", "1");
      }

      return url.toString();
    } catch {
      return safeSrc;
    }
  }

  function normalizeTheme(theme, fallback = defaultTheme) {
    if (typeof theme === "string") {
      const presetKey = resolveVisualPresetKey(theme);
      const presetTheme = getVisualThemePresets()[presetKey] || fallback;

      return {
        primary: sanitizeHexColor(presetTheme.primary, fallback.primary),
        secondary: sanitizeHexColor(presetTheme.secondary, fallback.secondary),
        tertiary: sanitizeHexColor(presetTheme.tertiary, fallback.tertiary),
        glow: sanitizeHexColor(presetTheme.glow, fallback.glow),
        panelGradientTop: normalizeThemeGradient(
          presetTheme.panelGradientTop ?? presetTheme.panel_gradient_top ?? presetTheme.panelGradient?.top,
          fallback.panelGradientTop
        ),
        panelGradientBottom: normalizeThemeGradient(
          presetTheme.panelGradientBottom ?? presetTheme.panel_gradient_bottom ?? presetTheme.panelGradient?.bottom,
          fallback.panelGradientBottom
        ),
      };
    }

    const source = theme && typeof theme === "object" ? theme : {};
    const hasDirectPalette =
      hasValue(source.primary) ||
      hasValue(source.secondary) ||
      hasValue(source.tertiary) ||
      hasValue(source.glow) ||
      hasValue(source.theme_primary) ||
      hasValue(source.theme_secondary) ||
      hasValue(source.theme_tertiary) ||
      hasValue(source.theme_glow);

    if (!hasDirectPalette) {
      const tokenFromObject = normalizeFieldToken(
        pickField(source, [
          "value",
          "name",
          "title",
          "label",
          "slug.current",
          "slug",
          "key",
          "id",
          "themePreset",
          "themeMode",
          "configuracionVisual",
          "tema",
        ])
      );

      if (tokenFromObject) {
        const presetKey = resolveVisualPresetKey(tokenFromObject);
        const presetTheme = getVisualThemePresets()[presetKey] || fallback;

        return {
          primary: sanitizeHexColor(presetTheme.primary, fallback.primary),
          secondary: sanitizeHexColor(presetTheme.secondary, fallback.secondary),
          tertiary: sanitizeHexColor(presetTheme.tertiary, fallback.tertiary),
          glow: sanitizeHexColor(presetTheme.glow, fallback.glow),
          panelGradientTop: normalizeThemeGradient(
            source.panelGradientTop ?? source.panel_gradient_top ?? source.panelGradient?.top ?? presetTheme.panelGradientTop ?? presetTheme.panel_gradient_top ?? presetTheme.panelGradient?.top,
            fallback.panelGradientTop
          ),
          panelGradientBottom: normalizeThemeGradient(
            source.panelGradientBottom ?? source.panel_gradient_bottom ?? source.panelGradient?.bottom ?? presetTheme.panelGradientBottom ?? presetTheme.panel_gradient_bottom ?? presetTheme.panelGradient?.bottom,
            fallback.panelGradientBottom
          ),
        };
      }
    }

    return {
      primary: sanitizeHexColor(source.primary ?? source.theme_primary ?? source.themePrimary ?? source.color, fallback.primary),
      secondary: sanitizeHexColor(source.secondary ?? source.theme_secondary ?? source.themeSecondary, fallback.secondary),
      tertiary: sanitizeHexColor(source.tertiary ?? source.theme_tertiary ?? source.themeTertiary, fallback.tertiary),
      glow: sanitizeHexColor(source.glow ?? source.theme_glow ?? source.themeGlow, fallback.glow),
      panelGradientTop: normalizeThemeGradient(
        source.panelGradientTop ?? source.panel_gradient_top ?? source.panelGradient?.top ?? source.gradientTop ?? source.gradient_top,
        fallback.panelGradientTop
      ),
      panelGradientBottom: normalizeThemeGradient(
        source.panelGradientBottom ?? source.panel_gradient_bottom ?? source.panelGradient?.bottom ?? source.gradientBottom ?? source.gradient_bottom,
        fallback.panelGradientBottom
      ),
    };
  }

  function resolveVisualPresetKey(token) {
    const normalized = normalizeFieldToken(token);

    if (!normalized) {
      return "tema1";
    }

    if (["tema1", "preset1", "estilo1", "opcion1", "1", "default", "clasico", "classic", "verde", "green", "emerald", "teal", "turquesa", "turquoise", "jade", "mint", "forest", "moss", "natural"].includes(normalized)) {
      return "tema1";
    }

    if (["tema2", "preset2", "estilo2", "opcion2", "2", "neutro", "neutral", "gris", "gray", "slate", "metal", "metalico", "grismetalico", "graphite", "graphito", "gunmetal", "steel", "plata", "silver"].includes(normalized)) {
      return "tema2";
    }

    if (["tema3", "preset3", "estilo3", "opcion3", "3", "intenso", "intense", "vibrante", "vibrant", "bold", "alto", "azul", "blue", "oceano", "ocean", "azuloscuro", "darkblue", "navy", "midnight", "deepblue", "oceanooscuro"].includes(normalized)) {
      return "tema3";
    }

    if (/tema2|preset2|estilo2|opcion2/.test(normalized)) {
      return "tema2";
    }

    if (/tema3|preset3|estilo3|opcion3/.test(normalized)) {
      return "tema3";
    }

    return "tema1";
  }

  function readVisualSelectionValue(settings, config = {}) {
    const source = settings && typeof settings === "object" ? settings : {};

    const directValue = pickField(source, [
      "configuracionVisual",
      "configuracion_visual",
      "visualConfig",
      "visualConfiguration",
      "themePreset",
      "estiloColor",
      "estiloColores",
      "estilo_colores",
      "temaVisual",
      "tema",
      "estiloVisual",
      "configuracion.visual",
      "visual.theme",
      "visual.preset",
      "themeChoice",
      "theme_mode",
      "themeMode",
    ]);

    if (hasValue(directValue)) {
      return directValue;
    }

    return pickField(config, ["configuracionVisual", "visualConfig", "themePreset", "themeMode", "estiloColor", "estiloColores"], "");
  }

  function resolveVisualTheme(settings, config = {}) {
    const source = settings && typeof settings === "object" ? settings : {};
    const fallbackTheme = normalizeTheme(config.theme || config.defaultTheme || {}, defaultTheme);
    const selectionValue = readVisualSelectionValue(source, config);
    const selectionToken =
      selectionValue && typeof selectionValue === "object"
        ? normalizeFieldToken(pickField(selectionValue, ["value", "name", "title", "label", "slug.current", "slug", "key", "id"]))
        : normalizeFieldToken(selectionValue);
    const themeTokenFromSource =
      typeof source.theme === "string"
        ? normalizeFieldToken(source.theme)
        : source.theme && typeof source.theme === "object"
          ? normalizeFieldToken(pickField(source.theme, ["value", "name", "title", "label", "slug.current", "slug", "key", "id", "themePreset", "themeMode", "configuracionVisual", "tema"]))
          : "";
    const resolvedSelectionToken = selectionToken || themeTokenFromSource;

    const hasLegacyTheme =
      (source.theme &&
        typeof source.theme === "object" &&
        (hasValue(source.theme.primary) ||
          hasValue(source.theme.secondary) ||
          hasValue(source.theme.tertiary) ||
          hasValue(source.theme.glow) ||
          hasValue(source.theme.theme_primary) ||
          hasValue(source.theme.theme_secondary) ||
          hasValue(source.theme.theme_tertiary) ||
          hasValue(source.theme.theme_glow))) ||
      hasValue(source.theme_primary) ||
      hasValue(source.theme_secondary) ||
      hasValue(source.theme_tertiary) ||
      hasValue(source.theme_glow);

    if (!resolvedSelectionToken && hasLegacyTheme) {
      return {
        ...normalizeTheme(
          source.theme || {
            primary: source.theme_primary,
            secondary: source.theme_secondary,
            tertiary: source.theme_tertiary,
            glow: source.theme_glow,
          },
          fallbackTheme
        ),
        visualPresetKey: "legacy",
        visualPresetValue: "legacy",
        forceExactTheme: true,
      };
    }

    if (selectionValue && typeof selectionValue === "object") {
      const hasDirectPalette =
        hasValue(selectionValue.primary) ||
        hasValue(selectionValue.secondary) ||
        hasValue(selectionValue.tertiary) ||
        hasValue(selectionValue.glow) ||
        hasValue(selectionValue.theme_primary) ||
        hasValue(selectionValue.theme_secondary) ||
        hasValue(selectionValue.theme_tertiary) ||
        hasValue(selectionValue.theme_glow);

      if (hasDirectPalette) {
        return {
          ...normalizeTheme(selectionValue, fallbackTheme),
          visualPresetKey: "custom",
          visualPresetValue: toText(pickField(selectionValue, ["value", "name", "title", "label"])),
          forceExactTheme: true,
        };
      }
    }

    if (!resolvedSelectionToken) {
      return null;
    }

    const presetKey = resolveVisualPresetKey(resolvedSelectionToken);
    const presetTheme = getVisualThemePresets()[presetKey] || defaultTheme;
    const presetValueSource = hasValue(selectionValue)
      ? selectionValue
      : typeof source.theme === "string"
        ? source.theme
        : resolvedSelectionToken;

    return {
      ...normalizeTheme(presetTheme, fallbackTheme),
      visualPresetKey: presetKey,
      visualPresetValue: toText(presetValueSource),
      forceExactTheme: true,
    };
  }

  function normalizeMetric(metric, index) {
    if (metric === null || metric === undefined) {
      return null;
    }

    if (typeof metric === "string" || typeof metric === "number") {
      const value = toText(metric);
      return value ? { label: `Dato ${index + 1}`, value } : null;
    }

    if (typeof metric === "object") {
      const label = toText(metric.label ?? metric.title ?? metric.name ?? metric.kicker ?? metric.key);
      const value = toText(metric.value ?? metric.text ?? metric.amount ?? metric.display);

      if (!label && !value) {
        return null;
      }

      return {
        label: label || `Dato ${index + 1}`,
        value: value || "-",
      };
    }

    return null;
  }

  function normalizeMetrics(metrics) {
    if (metrics && typeof metrics === "object" && !Array.isArray(metrics)) {
      const metricLikeKeys = ["label", "value", "title", "name", "text", "amount", "display", "kicker", "key"];
      const isMetricLikeObject = metricLikeKeys.some((key) => Object.prototype.hasOwnProperty.call(metrics, key));

      if (!isMetricLikeObject) {
        return Object.entries(metrics)
          .filter(([, value]) => value !== null && value !== undefined && value !== "" && typeof value !== "object")
          .map(([key, value], index) => normalizeMetric({ label: metricLabelFromKey(key), value }, index))
          .filter(Boolean)
          .slice(0, 8);
      }
    }

    return toArray(metrics)
      .map((metric, index) => normalizeMetric(metric, index))
      .filter(Boolean)
      .slice(0, 8);
  }

  function metricPriority(label) {
    const normalized = normalizeFieldToken(label);

    if (["ambientes", "ambiente", "rooms", "roomcount"].includes(normalized)) {
      return 0;
    }

    if (["dormitorios", "dormitorio", "habitaciones", "habitacion", "bedrooms", "bedroomcount"].includes(normalized)) {
      return 1;
    }

    if (["banos", "bano", "bathrooms", "bathroomcount"].includes(normalized)) {
      return 2;
    }

    if (["superficieterreno", "superficie", "superficietotal", "suptotal", "m2", "m2totales", "metros", "metroscuadrados", "metrostotales", "totalarea", "area"].includes(normalized)) {
      return 3;
    }

    if (["superficieedificada", "superficiecubierta", "supcubierta", "m2cubiertos", "metroscubiertos", "coveredarea"].includes(normalized)) {
      return 4;
    }

    if (["cochera", "cocheras", "garage", "garages", "garagecount", "parking"].includes(normalized)) {
      return 5;
    }

    return 99;
  }

  function sortMetricsByPriority(metrics) {
    return toArray(metrics)
      .slice()
      .sort((left, right) => {
        const leftPriority = metricPriority(left && left.label);
        const rightPriority = metricPriority(right && right.label);

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }

        return toText(left && left.label).localeCompare(toText(right && right.label), "es");
      });
  }

  function normalizeFeature(feature) {
    if (feature === null || feature === undefined) {
      return "";
    }

    if (typeof feature === "string" || typeof feature === "number") {
      return toText(feature);
    }

    if (typeof feature === "object") {
      return toText(feature.label ?? feature.title ?? feature.name ?? feature.value ?? feature.text);
    }

    return "";
  }

  function normalizeFeatures(features) {
    const seen = new Set();
    const normalized = [];

    toArray(features).forEach((feature) => {
      const value = normalizeFeature(feature);

      if (!value) {
        return;
      }

      value
        .split(/[;,|·]/)
        .map((part) => toText(part))
        .filter(Boolean)
        .forEach((part) => {
          const key = part.toLowerCase();

          if (seen.has(key)) {
            return;
          }

          seen.add(key);
          normalized.push(part);
        });
    });

    return normalized.slice(0, 16);
  }

  function normalizeDetailValue(value) {
    if (value === null || value === undefined) {
      return "";
    }

    if (Array.isArray(value)) {
      return value.map(toText).filter(Boolean).join(" · ");
    }

    if (typeof value === "object") {
      return toText(value.label ?? value.title ?? value.name ?? value.value ?? value.text);
    }

    return toText(value);
  }

  function isSimpleFieldValue(value) {
    if (value === null || value === undefined) {
      return false;
    }

    if (["string", "number", "boolean"].includes(typeof value)) {
      return true;
    }

    if (Array.isArray(value)) {
      return value.every((item) => item === null || item === undefined || ["string", "number", "boolean"].includes(typeof item));
    }

    return false;
  }

  function shouldSkipDynamicDetailKey(normalizedKey) {
    const excludedExact = new Set([
      "id",
      "slug",
      "type",
      "status",
      "active",
      "createdat",
      "updatedat",
      "rev",
      "system",
      "sortorder",
      "order",
      "rank",
      "name",
      "title",
      "titulo",
      "tipo",
      "propertytype",
      "operacion",
      "operation",
      "tipoperacion",
      "badge",
      "ubicacion",
      "location",
      "direccion",
      "address",
      "neighborhood",
      "barrio",
      "zona",
      "city",
      "ciudad",
      "summary",
      "description",
      "descripcion",
      "price",
      "precio",
      "valor",
      "importe",
      "amount",
      "link",
      "url",
      "href",
      "publishedurl",
      "publicurl",
      "publicaren",
      "sitiopublicacion",
      "sitiodepublicacion",
      "canalpublicacion",
      "publicationchannel",
      "publicationtarget",
      "publicacionurl",
      "landingurl",
      "qrlink",
      "siteurl",
      "canonicalurl",
      "permalink",
      "superficieterreno",
      "superficieedificada",
      "superficielegacy",
      "superficie",
      "superficietotal",
      "superficiecubierta",
      "m2",
      "m2totales",
      "m2cubiertos",
      "metros",
      "metroscuadrados",
      "metrostotales",
      "metroscubiertos",
      "totalarea",
      "coveredarea",
    ]);

    if (excludedExact.has(normalizedKey)) {
      return true;
    }

    const excludedStartsWith = ["media", "foto", "image", "gallery", "galeria", "theme", "duration", "servicio", "services", "ameni", "feature"];

    return excludedStartsWith.some((prefix) => normalizedKey.startsWith(prefix));
  }

  function collectDynamicDetails(doc, existingDetails = []) {
    const details = [];
    const seen = new Set(
      toArray(existingDetails).map((detail) => `${normalizeFieldToken(detail && detail.label)}|${normalizeFieldToken(detail && detail.value)}`)
    );

    Object.entries(doc || {}).forEach(([key, value]) => {
      const normalizedKey = normalizeFieldToken(key);

      if (!normalizedKey || shouldSkipDynamicDetailKey(normalizedKey)) {
        return;
      }

      if (!isSimpleFieldValue(value)) {
        return;
      }

      const rawText = typeof value === "boolean" ? (value ? "Sí" : "") : normalizeDetailValue(value);

      if (!rawText) {
        return;
      }

      const detailValue = /superficie|m2|metros|area/.test(normalizedKey) ? formatArea(rawText) || rawText : rawText;
      const label = metricLabelFromKey(key);
      const signature = `${normalizeFieldToken(label)}|${normalizeFieldToken(detailValue)}`;

      if (seen.has(signature)) {
        return;
      }

      seen.add(signature);
      details.push({
        label,
        value: detailValue,
      });
    });

    return details;
  }

  function normalizeDetails(doc, property) {
    const details = [];

    function pushDetail(label, value) {
      const text = normalizeDetailValue(value);

      if (!text) {
        return;
      }

      details.push({
        label,
        value: text,
      });
    }

    pushDetail("Superficie terreno", formatArea(property && property.superficieTerreno));
    pushDetail("Superficie edificada", formatArea(property && property.superficieEdificada));
    pushDetail("Expensas", toText(pickField(doc, ["expensas", "Expensas", "expenses"])));
    pushDetail("Antigüedad", toText(pickField(doc, ["antiguedad", "Antiguedad", "age", "yearsOld"])));

    function detailMetricKey(label) {
      const normalized = normalizeFieldToken(label);

      if (["dormitorios", "habitaciones", "bedrooms", "bedroomcount"].includes(normalized)) {
        return "habitaciones";
      }

      if (["banos", "bano", "bathrooms", "bathroomcount"].includes(normalized)) {
        return "banos";
      }

      if (["cochera", "cocheras", "garage", "garages", "parking"].includes(normalized)) {
        return "cochera";
      }

      if (["superficieterreno", "superficie", "superficielegacy", "superficietotal", "m2", "m2totales", "metros", "metroscuadrados", "metrostotales", "totalarea", "area"].includes(normalized)) {
        return "superficie-terreno";
      }

      if (["superficieedificada", "superficiecubierta", "m2cubiertos", "metroscubiertos", "coveredarea"].includes(normalized)) {
        return "superficie-edificada";
      }

      if (["patio"].includes(normalized)) {
        return "patio";
      }

      if (["piscina", "pileta", "pool"].includes(normalized)) {
        return "piscina";
      }

      return normalized;
    }

    const metricKeys = new Set(toArray(property && property.metrics).map((metric) => detailMetricKey(metric && metric.label)).filter(Boolean));
    const repeatedKeys = new Set(["tipo", "ubicacion", "direccion", "barrio", "moneda", "currency", "currencycode"]);

    return [...details, ...collectDynamicDetails(doc, details)]
      .filter((detail) => {
        const key = detailMetricKey(detail && detail.label);
        return !metricKeys.has(key) && !repeatedKeys.has(key);
      })
      .slice(0, 32);
  }

  function joinUniqueTexts(values, separator = " · ") {
    const seen = new Set();
    const texts = [];

    toArray(values).forEach((value) => {
      const text = toText(value);

      if (!text) {
        return;
      }

      const key = text.toLowerCase();

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      texts.push(text);
    });

    return texts.join(separator);
  }

  function normalizeOperationLabel(value) {
    const text = toText(value);
    const lower = text.toLowerCase();

    if (!lower) {
      return "";
    }

    if (["venta", "sell", "sale"].includes(lower)) {
      return "Venta";
    }

    if (["alquiler", "rent", "renta", "lease", "leasing"].includes(lower)) {
      return "Alquiler";
    }

    return text;
  }

  function buildPropertyMetrics(doc) {
    const metrics = [];
    const ambientes = pickField(doc, ["Ambientes", "ambientes", "rooms", "roomCount", "cantidadAmbientes"]);
    const dormitorios = pickField(doc, ["Dormitorios", "dormitorios", "habitaciones", "bedrooms", "bedroomCount", "cantidadDormitorios"]);
    const banos = pickField(doc, ["Banos", "banos", "Baños", "baños", "bathrooms", "bathroomCount", "cantidadBanos"]);
    const cochera = pickField(doc, ["Cochera", "cochera", "garage", "garages", "garageCount", "cocheras"]);
    const surfaceModel = resolveSurfaceModel(doc);
    const superficieTerreno = formatArea(surfaceModel.superficieTerreno);
    const superficieEdificada = formatArea(surfaceModel.superficieEdificada);

    if (hasValue(ambientes)) {
      metrics.push({
        label: "Ambientes",
        value: ambientes,
      });
    }

    if (hasValue(dormitorios)) {
      metrics.push({
        label: "Dormitorios",
        value: dormitorios,
      });
    }

    if (hasValue(banos)) {
      metrics.push({
        label: "Baños",
        value: banos,
      });
    }

    if (hasValue(cochera)) {
      metrics.push({
        label: "Cochera",
        value: cochera,
      });
    }

    if (hasValue(superficieTerreno)) {
      metrics.push({
        label: "Superficie terreno",
        value: superficieTerreno,
      });
    }

    if (hasValue(superficieEdificada)) {
      metrics.push({
        label: "Superficie edificada",
        value: superficieEdificada,
      });
    }

    return metrics;
  }

  function buildDynamicMetricsFromDoc(doc) {
    const metrics = [];
    const seen = new Set();

    Object.entries(doc || {}).forEach(([key, value]) => {
      const normalizedKey = normalizeFieldToken(key);

      if (!normalizedKey || !isSimpleFieldValue(value)) {
        return;
      }

      let label = "";

      if (/ambiente|room/.test(normalizedKey)) {
        label = "Ambientes";
      } else if (/dorm|habit|bedroom/.test(normalizedKey)) {
        label = "Dormitorios";
      } else if (/bano|bath|toilet|wc/.test(normalizedKey)) {
        label = "Baños";
      } else if (/cochera|garage|parking/.test(normalizedKey)) {
        label = "Cochera";
      } else if (/superficieedificada|superficiecubierta|covered|m2cubiertos|metroscubiertos/.test(normalizedKey)) {
        label = "Superficie edificada";
      } else if (/superficieterreno|superficietotal|totalarea|m2totales|metrostotales|^superficie$|^m2$|metroscuadrados|metros|area/.test(normalizedKey)) {
        label = "Superficie terreno";
      }

      if (!label) {
        return;
      }

      const rawText = typeof value === "boolean" ? (value ? "Sí" : "") : normalizeDetailValue(value);

      if (!rawText) {
        return;
      }

      const displayValue = /superficie/.test(normalizeFieldToken(label)) ? formatArea(rawText) || rawText : rawText;
      const signature = `${normalizeFieldToken(label)}|${normalizeFieldToken(displayValue)}`;

      if (seen.has(signature)) {
        return;
      }

      seen.add(signature);
      metrics.push({
        label,
        value: displayValue,
      });
    });

    return metrics;
  }

  function buildServiceFeaturesFromFlags(doc) {
    const candidateServices = [
      { label: "Agua", keys: ["agua", "servicioAgua", "water"] },
      { label: "Luz", keys: ["luz", "electricidad", "electricity", "servicioLuz"] },
      { label: "Gas", keys: ["gas", "servicioGas"] },
      { label: "Internet", keys: ["internet", "wifi", "wiFi", "servicioInternet"] },
      { label: "Cloacas", keys: ["cloacas", "cloaca", "sewer"] },
      { label: "Seguridad", keys: ["seguridad", "security"] },
      { label: "Pileta", keys: ["pileta", "piscina", "pool"] },
      { label: "Parrilla", keys: ["parrilla", "bbq"] },
      { label: "SUM", keys: ["sum", "salonUsosMultiples"] },
      { label: "Gym", keys: ["gym", "gimnasio"] },
      { label: "Ascensor", keys: ["ascensor", "elevator"] },
      { label: "Lavadero", keys: ["lavadero", "laundry"] },
      { label: "Calefacción", keys: ["calefaccion", "heating"] },
      { label: "Aire", keys: ["aire", "aireAcondicionado", "ac"] },
    ];

    const services = [];

    candidateServices.forEach(({ label, keys }) => {
      const enabled = keys.some((key) => toBooleanFlag(readField(doc, key)));

      if (enabled) {
        services.push(label);
      }
    });

    return services;
  }

  function normalizeCountMetricValue(value) {
    const text = normalizeDetailValue(value);
    return text || "-";
  }

  function isPositiveAmenityValue(value) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value > 0;
    }

    const text = toText(value).toLowerCase();

    if (!text) {
      return false;
    }

    if (isFalsey(text) || /\b(no|sin|none|ninguno|ninguna)\b/.test(text)) {
      return false;
    }

    if (isTruthy(text)) {
      return true;
    }

    return true;
  }

  function hasAmenityFromDoc(doc, keys, servicePattern) {
    const hasDirectAmenity = toArray(keys).some((key) => isPositiveAmenityValue(readField(doc, key)));

    if (hasDirectAmenity) {
      return true;
    }

    const normalizedServices = normalizeFeatures(
      toArray(
        pickField(doc, [
          "Servicios",
          "servicios",
          "ServiciosDisponibles",
          "serviciosDisponibles",
          "services",
          "serviceList",
          "service_list",
          "amenidades",
          "comodidades",
          "caracteristicas",
          "features",
          "amenities",
        ])
      )
    ).map((service) => normalizeFieldToken(service));

    return normalizedServices.some((service) => servicePattern.test(service));
  }

  function buildPanelMetrics(doc, surfaceModel) {
    const metrics = [];
    const cochera = pickField(doc, ["Cochera", "cochera", "garage", "garages", "garageCount", "cocheras"]);
    const banos = pickField(doc, ["Banos", "banos", "Baños", "baños", "bathrooms", "bathroomCount", "cantidadBanos"]);
    const habitaciones = pickField(doc, ["Habitaciones", "habitaciones", "Dormitorios", "dormitorios", "bedrooms", "bedroomCount", "cantidadDormitorios"]);
    const normalizedSurfaceModel = surfaceModel && typeof surfaceModel === "object" ? surfaceModel : resolveSurfaceModel(doc);
    const superficieTerreno = formatArea(normalizedSurfaceModel.superficieTerreno);
    const superficieEdificada = formatArea(normalizedSurfaceModel.superficieEdificada);
    const piscina = hasAmenityFromDoc(doc, ["Piscina", "piscina", "pileta", "pool"], /piscina|pileta|pool/);
    const patio = hasAmenityFromDoc(doc, ["Patio", "patio"], /patio/);

    if (hasValue(cochera)) {
      metrics.push({ label: "Cochera", value: normalizeCountMetricValue(cochera) });
    }

    if (hasValue(banos)) {
      metrics.push({ label: "Baños", value: normalizeCountMetricValue(banos) });
    }

    if (hasValue(habitaciones)) {
      metrics.push({ label: "Habitaciones", value: normalizeCountMetricValue(habitaciones) });
    }

    if (hasValue(superficieTerreno)) {
      metrics.push({ label: "Superficie terreno", value: superficieTerreno });
    }

    if (hasValue(superficieEdificada)) {
      metrics.push({ label: "Superficie edificada", value: superficieEdificada });
    }

    if (piscina) {
      metrics.push({ label: "Piscina", value: "Sí" });
    }

    if (patio) {
      metrics.push({ label: "Patio", value: "Sí" });
    }

    return metrics;
  }

  function buildPropertySummary(doc, type, location, operationLabel) {
    const summary = toText(doc.summary ?? doc.description ?? doc.descripcion);

    if (summary) {
      return summary;
    }

    if (operationLabel && location) {
      return `${operationLabel} · ${location}`;
    }

    if (location) {
      return location;
    }

    if (type && operationLabel) {
      return `${type} · ${operationLabel}`;
    }

    return type || operationLabel;
  }

  function normalizeMediaItem(item, config = {}) {
    if (!item) {
      return null;
    }

    if (typeof item === "string") {
      const src = safeUrl(item);

      if (!src) {
        return null;
      }

      const mediaType = inferMediaType("", src);

      return {
        type: mediaType,
        src: mediaType === "image" ? optimizeImageUrl(src, config) : src,
        caption: "",
        duration: 0,
        poster: "",
      };
    }

    const playbackId = toText(
      pickField(item, [
        "playbackId",
        "asset.metadata.playbacks.0._id",
        "video.asset.metadata.playbacks.0._id",
        "file.asset.metadata.playbacks.0._id",
      ])
    );
    const playbackUrl = playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : "";
    const src = safeUrl(item.src ?? item.url ?? item.asset?.url ?? item.image?.asset?.url ?? item.video?.asset?.url ?? item.file?.asset?.url ?? playbackUrl);

    if (!src) {
      return null;
    }

    const mimeType = toText(
      pickField(item, [
        "mimeType",
        "asset.mimeType",
        "image.asset.mimeType",
        "video.asset.mimeType",
        "file.asset.mimeType",
      ])
    ).toLowerCase();
    let mediaType = inferMediaType(item.type ?? item.mediaType ?? item.kind ?? item._type, src);

    if (mimeType.startsWith("video/")) {
      mediaType = "video";
    } else if (mimeType.startsWith("image/")) {
      mediaType = "image";
    }

    const optimizedSrc = mediaType === "image" ? optimizeImageUrl(src, config) : src;
    const posterSrc = safeUrl(item.poster ?? item.posterUrl ?? item.poster_image ?? item.posterImage?.asset?.url ?? item.image?.asset?.url);
    const durationSeconds = Number(
      pickField(item, [
        "durationSeconds",
        "duration_seconds",
        "asset.metadata.duration",
        "video.asset.metadata.duration",
        "file.asset.metadata.duration",
      ])
    );
    const durationFromAsset = Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds * 1000) : 0;
    const durationFromField = parseDuration(item.duration ?? item.durationMs ?? item.duration_ms, 0);

    return {
      type: mediaType,
      src: optimizedSrc,
      caption: toText(item.caption ?? item.alt ?? item.title ?? item.name),
      duration: durationFromAsset || durationFromField,
      poster: optimizeImageUrl(posterSrc, config),
    };
  }

  function normalizeMedia(media, totalDurationMs, config = {}) {
    const seenSources = new Set();
    const items = [];

    toArray(media).forEach((entry) => {
      const sourceItems = Array.isArray(entry) ? entry : [entry];

      sourceItems.forEach((item) => {
        const normalizedItem = normalizeMediaItem(item, config);

        if (!normalizedItem || !normalizedItem.src || seenSources.has(normalizedItem.src)) {
          return;
        }

        seenSources.add(normalizedItem.src);
        items.push(normalizedItem);
      });
    });

    if (items.length > 0) {
      const derivedDuration = Math.max(1000, Math.round(totalDurationMs / items.length));

      items.forEach((item) => {
        if (!item.duration) {
          item.duration = item.type === "video" ? 0 : derivedDuration;
        }
      });
    }

    return items;
  }

  function normalizeCompany(settings, config) {
    const source = settings && typeof settings === "object" ? settings : {};

    return {
      name: toText(source.companyName ?? source.name ?? source.title ?? config.companyName),
      tagline: toText(source.companyTagline ?? source.tagline ?? source.description ?? config.companyTagline),
    };
  }

  function resolveAllowedPublicationTargets(config) {
    const defaults = ["vertical", "ambos"];
    const configuredTargets = toArray(config.verticalPublicationTargets ?? config.allowedPublicationTargets ?? config.allowedPublishTargets);
    const normalizedTargets = configuredTargets.map((value) => normalizeFieldToken(value)).filter(Boolean);
    const targets = normalizedTargets.length > 0 ? normalizedTargets : defaults;
    return new Set(targets);
  }

  function appendPublicationTargets(value, targets, visited = new Set()) {
    if (value === undefined || value === null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => appendPublicationTargets(entry, targets, visited));
      return;
    }

    if (typeof value === "object") {
      if (visited.has(value)) {
        return;
      }

      visited.add(value);

      const nestedKeys = [
        "value",
        "label",
        "title",
        "name",
        "slug.current",
        "slug",
        "channel",
        "canal",
        "target",
        "targets",
        "publicarEn",
        "publicar_en",
        "publicadoEn",
        "publishOn",
        "publicationChannel",
        "sitioPublicacion",
        "sitio_publicacion",
        "sitioDePublicacion",
        "platform",
        "plataforma",
      ];

      let consumedNested = false;

      nestedKeys.forEach((key) => {
        const nestedValue = readField(value, key);

        if (nestedValue === undefined || nestedValue === null) {
          return;
        }

        consumedNested = true;
        appendPublicationTargets(nestedValue, targets, visited);
      });

      if (!consumedNested) {
        Object.values(value).forEach((nestedValue) => appendPublicationTargets(nestedValue, targets, visited));
      }

      return;
    }

    const rawText = toText(value);

    if (!rawText) {
      return;
    }

    rawText
      .split(/[;,|/]+/)
      .map((entry) => normalizeFieldToken(entry))
      .filter(Boolean)
      .forEach((token) => {
        if (token.includes("vertical")) {
          targets.push("vertical");
          return;
        }

        if (token.includes("amb") || token.includes("both")) {
          targets.push("ambos");
          return;
        }

        targets.push(token);
      });
  }

  function extractPublicationTargets(doc) {
    const rawPublicationTarget = pickField(
      doc,
      [
        "publicarEn",
        "publicar_en",
        "publicadoEn",
        "sitioPublicacion",
        "sitio_publicacion",
        "sitioDePublicacion",
        "publicationChannel",
        "publishOn",
        "publish_channel",
        "canalPublicacion",
        "canal_publicacion",
        "canalDifusion",
        "difusion.sitioPublicacion",
        "difusion.sitio_publicacion",
        "Difusion.sitioPublicacion",
        "Difusion.sitio_publicacion",
        "difusion.publicarEn",
        "difusion.publicar_en",
        "difusion.publicadoEn",
        "difusion.publishOn",
        "difusion.publicationChannel",
        "Difusion.publicarEn",
        "Difusion.publicar_en",
        "Difusion.publicadoEn",
      ],
      null
    );

    if (rawPublicationTarget === undefined || rawPublicationTarget === null) {
      return [];
    }

    const tokens = [];
    appendPublicationTargets(rawPublicationTarget, tokens);

    return Array.from(new Set(tokens));
  }

  function isPropertyVisibleInVertical(doc, config) {
    const allowedTargets = resolveAllowedPublicationTargets(config);
    const propertyTargets = extractPublicationTargets(doc);

    if (propertyTargets.length === 0) {
      return false;
    }

    return propertyTargets.some((target) => allowedTargets.has(target));
  }

  function normalizeProperty(doc, config) {
    if (!doc || typeof doc !== "object") {
      return null;
    }

    if (!isPublishedForVertical(doc) || !isRecordActive(doc)) {
      return null;
    }

    const name = toText(doc.titulo ?? doc.name ?? doc.title);

    if (!name) {
      return null;
    }

    if (!isPropertyVisibleInVertical(doc, config)) {
      return null;
    }

    const fallbackDurationMs = Number(config.defaultDurationMs) || 20000;
    const totalDurationMs = parseDuration(pickField(doc, ["durationMs", "duration_ms", "slideDurationMs", "slideDuration", "duration"]), fallbackDurationMs);
    const media = normalizeMedia(
      [
        pickField(doc, ["media", "Media"]),
        pickField(doc, ["fotos", "Fotos"]),
        pickField(doc, ["images", "Images"]),
        pickField(doc, ["gallery", "Gallery"]),
        pickField(doc, ["galeria", "Galeria"]),
        pickField(doc, ["videoMp4", "video_mp4", "videoFile", "video_file"]),
        pickField(doc, ["video", "Video"]),
        pickField(doc, ["videos", "Videos"]),
        pickField(doc, ["videoGallery", "video_gallery", "videoGalleryItems", "videoItems"]),
        pickField(doc, ["videoUrl", "video_url", "videoSrc", "video_src", "videoFile", "video_file"]),
      ],
      totalDurationMs,
      config
    );

    if (media.length === 0) {
      return null;
    }

    const type = toText(pickField(doc, ["Tipo", "tipo", "type", "propertyType", "inmuebleTipo"]));
    const operationLabel = normalizeOperationLabel(pickField(doc, ["operacion", "operation", "tipoOperacion", "operationType", "badge"]));
    const location = joinUniqueTexts([
      pickField(doc, ["Ubicacion", "ubicacion", "location"]),
      pickField(doc, ["neighborhood", "barrio", "zona"]),
      pickField(doc, ["city", "ciudad"]),
    ]) || toText(pickField(doc, ["Direccion", "direccion", "address"]));
    const publishedUrl = toText(
      pickField(doc, [
        "publishedUrl",
        "Link",
        "propertyUrl",
        "publicUrl",
        "qrLink",
        "link",
        "url",
        "href",
        "siteUrl",
        "canonicalUrl",
        "permalink",
        "publicacionUrl",
        "landingUrl",
      ])
    );

    const surfaceModel = resolveSurfaceModel(doc);
    const metrics = buildPanelMetrics(doc, surfaceModel);

    const property = {
      id: toText(doc.id ?? doc.slug?.current ?? doc.slug ?? doc._id ?? slugify(name)) || slugify(name),
      slug: toText(doc.slug?.current ?? doc.slug ?? ""),
      name,
      title: toText(doc.title ?? doc.titulo ?? name),
      type,
      location,
      price: parsePrice(pickField(doc, ["price", "precio", "valor", "importe", "amount"])),
      currency: toText(pickField(doc, ["moneda", "currency", "currencyCode", "currency_code"])),
      badge: toText(doc.badge) || operationLabel,
      summary: buildPropertySummary(doc, type, location, operationLabel),
      publishedUrl,
      superficieTerreno: surfaceModel.superficieTerreno,
      superficieEdificada: surfaceModel.superficieEdificada,
      superficieLegacy: surfaceModel.superficieLegacy,
      SuperficieTerreno: surfaceModel.superficieTerreno,
      SuperficieEdificada: surfaceModel.superficieEdificada,
      SuperficieLegacy: surfaceModel.superficieLegacy,
      metrics,
      features: normalizeFeatures([
        ...toArray(
          pickField(doc, [
            "Servicios",
            "servicios",
            "ServiciosDisponibles",
            "serviciosDisponibles",
            "services",
            "serviceList",
            "service_list",
            "amenidades",
            "comodidades",
            "caracteristicas",
            "features",
            "amenities",
          ])
        ),
        ...buildServiceFeaturesFromFlags(doc),
      ]),
      theme: normalizeTheme(doc.theme ?? {
        primary: doc.theme_primary,
        secondary: doc.theme_secondary,
        tertiary: doc.theme_tertiary,
        glow: doc.theme_glow,
      }),
      media,
    };

    property.details = normalizeDetails(doc, property);

    const rawSortOrder = doc.sortOrder ?? doc.sort_order ?? doc.order ?? doc.rank;

    if (hasValue(rawSortOrder)) {
      const sortOrder = parseNumber(rawSortOrder);

      if (Number.isFinite(sortOrder)) {
        property.sortOrder = sortOrder;
      }
    }

    return property;
  }

  function sortProperties(left, right) {
    const leftSort = Number.isFinite(left.sortOrder) ? left.sortOrder : Number.MAX_SAFE_INTEGER;
    const rightSort = Number.isFinite(right.sortOrder) ? right.sortOrder : Number.MAX_SAFE_INTEGER;

    if (leftSort !== rightSort) {
      return leftSort - rightSort;
    }

    return left.name.localeCompare(right.name, "es");
  }

  function createEmptyCatalog(config = {}) {
    return {
      company: {
        name: "",
        tagline: "",
      },
      properties: [],
      siteBaseUrl: toText(config.publicBaseUrl),
      visualTheme: resolveVisualTheme({}, config),
      state: "unconfigured",
      message: "Completa projectId y dataset en src/config/sanity.js.",
    };
  }

  function createClientInstance(config) {
    const createClient = window.SanityClient && window.SanityClient.createClient;

    if (typeof createClient !== "function") {
      return null;
    }

    return createClient({
      projectId: toText(config.projectId),
      dataset: toText(config.dataset),
      apiVersion: toText(config.apiVersion) || "2026-04-02",
      timeout: Number.isFinite(Number(config.timeoutMs)) && Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 8000,
      useCdn: config.useCdn !== false,
      perspective: config.perspective || "published",
    });
  }

  function buildSettingsQuery() {
    return `*[_type in $settingsTypes] | order(_updatedAt desc)[0]{
      ...,
      _type,
      companyName,
      companyTagline,
      publicBaseUrl,
      siteBaseUrl,
      name,
      title
    }`;
  }

  function buildPropertiesQuery() {
    return `*[_type in $propertyTypes && active != false] | order(coalesce(sortOrder, sort_order, order, rank, 0) asc, coalesce(name, title, titulo, slug.current, _id) asc) {
      ...,
      _id,
      _type,
      id,
      slug{current},
      name,
      title,
      titulo,
      Tipo,
      tipo,
      operacion,
      tipoOperacion,
      type,
      propertyType,
      Ubicacion,
      ubicacion,
      Direccion,
      direccion,
      location,
      address,
      neighborhood,
      barrio,
      zona,
      city,
      ciudad,
      Ambientes,
      ambientes,
      Dormitorios,
      dormitorios,
      habitaciones,
      Banos,
      banos,
      Cochera,
      cochera,
      garage,
      garages,
      SuperficieTerreno,
      superficieTerreno,
      SuperficieEdificada,
      superficieEdificada,
      superficie,
      Superficie,
      superficieTotal,
      SuperficieTotal,
      superficieCubierta,
      SuperficieCubierta,
      totalArea,
      coveredArea,
      m2,
      metros,
      m2Totales,
      metrosTotales,
      m2Cubiertos,
      metrosCubiertos,
      expensas,
      Expensas,
      antiguedad,
      Antiguedad,
      Servicios,
      servicios,
      ServiciosDisponibles,
      serviciosDisponibles,
      services,
      serviceList,
      service_list,
      amenidades,
      comodidades,
      caracteristicas,
      amenities,
      agua,
      luz,
      gas,
      internet,
      wifi,
      cloacas,
      seguridad,
      pileta,
      piscina,
      parrilla,
      sum,
      gimnasio,
      gym,
      ascensor,
      lavadero,
      calefaccion,
      aire,
      aireAcondicionado,
      price,
      precio,
      valor,
      importe,
      badge,
      Link,
      publishedUrl,
      propertyUrl,
      publicUrl,
      publicacionUrl,
      landingUrl,
      qrLink,
      link,
      url,
      href,
      siteUrl,
      canonicalUrl,
      permalink,
      summary,
      description,
      descripcion,
      metrics,
      features,
      theme,
      theme_primary,
      theme_secondary,
      theme_tertiary,
      theme_glow,
      durationMs,
      duration_ms,
      slideDurationMs,
      sortOrder,
      sort_order,
      order,
      rank,
      active,
      videoMp4{
        ...,
        "src": coalesce(src, url, asset->url),
        "poster": coalesce(poster, posterUrl, poster_image, posterImage.asset->url),
        "caption": coalesce(caption, alt, title, name),
        "duration": coalesce(duration, durationMs, duration_ms),
        "mimeType": coalesce(mimeType, asset->mimeType, image.asset->mimeType, video.asset->mimeType, file.asset->mimeType),
        "type": coalesce(type, mediaType, kind, _type)
      },
      video{
        ...,
        "src": coalesce(src, url, asset->url, image.asset->url, video.asset->url, file.asset->url),
        "playbackId": coalesce(asset->metadata.playbacks[policy == "public"][0]._id, video.asset->metadata.playbacks[policy == "public"][0]._id, file.asset->metadata.playbacks[policy == "public"][0]._id),
        "durationSeconds": coalesce(asset->metadata.duration, asset->metadata.durationMs, video.asset->metadata.duration, file.asset->metadata.duration),
        "poster": coalesce(poster, posterUrl, poster_image, posterImage.asset->url, image.asset->url, asset->url),
        "caption": coalesce(caption, alt, title, name),
        "duration": coalesce(duration, durationMs, duration_ms),
        "mimeType": coalesce(mimeType, asset->mimeType, image.asset->mimeType, video.asset->mimeType, file.asset->mimeType),
        "type": coalesce(type, mediaType, kind, _type)
      },
      videos{
        ...,
        "src": coalesce(src, url, asset->url, image.asset->url, video.asset->url, file.asset->url),
        "playbackId": coalesce(asset->metadata.playbacks[policy == "public"][0]._id, video.asset->metadata.playbacks[policy == "public"][0]._id, file.asset->metadata.playbacks[policy == "public"][0]._id),
        "durationSeconds": coalesce(asset->metadata.duration, asset->metadata.durationMs, video.asset->metadata.duration, file.asset->metadata.duration),
        "poster": coalesce(poster, posterUrl, poster_image, posterImage.asset->url, image.asset->url, asset->url),
        "caption": coalesce(caption, alt, title, name),
        "duration": coalesce(duration, durationMs, duration_ms),
        "mimeType": coalesce(mimeType, asset->mimeType, image.asset->mimeType, video.asset->mimeType, file.asset->mimeType),
        "type": coalesce(type, mediaType, kind, _type)
      },
      media[]{
        ...,
        "src": coalesce(src, url, asset->url, image.asset->url, video.asset->url, file.asset->url),
        "playbackId": coalesce(asset->metadata.playbacks[policy == "public"][0]._id, video.asset->metadata.playbacks[policy == "public"][0]._id, file.asset->metadata.playbacks[policy == "public"][0]._id),
        "durationSeconds": coalesce(asset->metadata.duration, asset->metadata.durationMs, video.asset->metadata.duration, file.asset->metadata.duration),
        "poster": coalesce(poster, posterUrl, poster_image, posterImage.asset->url, image.asset->url, asset->url),
        "caption": coalesce(caption, alt, title, name),
        "duration": coalesce(duration, durationMs, duration_ms),
        "mimeType": coalesce(mimeType, asset->mimeType, image.asset->mimeType, video.asset->mimeType, file.asset->mimeType),
        "type": coalesce(type, mediaType, kind, _type)
      },
      fotos[]{
        ...,
        "src": asset->url,
        "playbackId": coalesce(asset->metadata.playbacks[policy == "public"][0]._id, video.asset->metadata.playbacks[policy == "public"][0]._id, file.asset->metadata.playbacks[policy == "public"][0]._id),
        "durationSeconds": coalesce(asset->metadata.duration, asset->metadata.durationMs, video.asset->metadata.duration, file.asset->metadata.duration),
        "poster": asset->url,
        "caption": coalesce(caption, alt, title, name),
        "duration": coalesce(duration, durationMs, duration_ms),
        "mimeType": coalesce(mimeType, asset->mimeType, image.asset->mimeType, video.asset->mimeType, file.asset->mimeType),
        "type": coalesce(type, mediaType, kind, _type)
      }
    }`;
  }

  namespace.loadCatalog = async function loadCatalog(config = {}) {
    const fallback = createEmptyCatalog(config);
    const projectId = toText(config.projectId);
    const dataset = toText(config.dataset);

    if (!projectId || !dataset) {
      return fallback;
    }

    const client = createClientInstance(config);

    if (!client) {
      return {
        ...fallback,
        state: "error",
        message: "No se pudo cargar el cliente de Sanity.",
      };
    }

    try {
      const settingsTypes = Array.from(
        new Set(
          [
            ...toArray(config.settingsTypes).map((item) => toText(item)).filter(Boolean),
            toText(config.settingsType) || "siteSettings",
            "siteSettings",
            "visualSettings",
            "configuracionVisual",
            "configuracionDashboard",
            "siteConfig",
          ].filter(Boolean)
        )
      );
      const propertyTypes = Array.isArray(config.propertyTypes) && config.propertyTypes.length > 0 ? config.propertyTypes.map(toText).filter(Boolean) : [toText(config.propertyType) || "property"];
      const [settingsDocument, propertyDocuments] = await Promise.all([
        client.fetch(buildSettingsQuery(), { settingsTypes }),
        client.fetch(buildPropertiesQuery(), { propertyTypes }),
      ]);

      const company = normalizeCompany(settingsDocument, config);
      let visualTheme = resolveVisualTheme(settingsDocument, config);

      if (!visualTheme && Array.isArray(propertyDocuments) && propertyDocuments.length > 0) {
        visualTheme = resolveVisualTheme(propertyDocuments[0], config);
      }

      const properties = Array.isArray(propertyDocuments) ? propertyDocuments.map((document) => normalizeProperty(document, config)).filter(Boolean) : [];
      const siteBaseUrl = toText(settingsDocument && (settingsDocument.publicBaseUrl || settingsDocument.siteBaseUrl)) || toText(config.publicBaseUrl);

      if (properties.length === 0) {
        return {
          company,
          properties,
          siteBaseUrl,
          visualTheme,
          state: "empty",
          message: "Todavia no hay inmuebles publicados.",
        };
      }

      properties.sort(sortProperties);

      return {
        company,
        properties,
        siteBaseUrl,
        visualTheme,
        state: "ready",
      };
    } catch (error) {
      return {
        ...fallback,
        state: "error",
        message: error instanceof Error ? error.message : "No se pudo conectar con Sanity.",
      };
    }
  };

  namespace.listenCatalog = function listenCatalog(config = {}, callback) {
    if (typeof callback !== "function") return () => {};

    const projectId = toText(config.projectId);
    const dataset = toText(config.dataset);

    if (!projectId || !dataset) {
      return () => {};
    }

    const client = createClientInstance(config);

    if (!client || typeof client.listen !== "function") {
      return () => {};
    }

    const settingsTypes = Array.from(
      new Set(
        [
          ...toArray(config.settingsTypes).map((item) => toText(item)).filter(Boolean),
          toText(config.settingsType) || "siteSettings",
          "siteSettings",
          "visualSettings",
          "configuracionVisual",
          "configuracionDashboard",
          "siteConfig",
        ].filter(Boolean)
      )
    );

    const propertyTypes = Array.isArray(config.propertyTypes) && config.propertyTypes.length > 0 ? config.propertyTypes.map(toText).filter(Boolean) : [toText(config.propertyType) || "property"];

    // Combine all types to listen for any document mutations within these types.
    const allRelevantTypes = [...settingsTypes, ...propertyTypes];
    
    // We listen to any changes (creation, update, deletion) on the relevant types.
    const query = `*[_type in $types]`;
    const params = { types: allRelevantTypes };
    const configuredDebounceMs = Number(config.listenDebounceMs);
    const listenDebounceMs = Number.isFinite(configuredDebounceMs) ? Math.max(100, configuredDebounceMs) : 250;
    const configuredVisibility = toText(config.listenVisibility).toLowerCase();
    const listenVisibility = ["query", "transaction"].includes(configuredVisibility) ? configuredVisibility : "query";
    const listenOptions = { includeResult: false, visibility: listenVisibility };

    let updateTimeout;

    const subscription = client.listen(query, params, listenOptions)
      .subscribe(() => {
        // Debounce to avoid multiple rapid re-fetches if many documents are published down at once
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(async () => {
          try {
            const latestCatalog = await namespace.loadCatalog(config);
            callback(latestCatalog);
          } catch (error) {
            console.error("Error al actualizar catálogo vía Listen API:", error);
          }
        }, listenDebounceMs);
      }, (error) => {
        console.error("Listen API desconectada:", error);
      });

    return () => {
      clearTimeout(updateTimeout);
      subscription.unsubscribe();
    };
  };
})();