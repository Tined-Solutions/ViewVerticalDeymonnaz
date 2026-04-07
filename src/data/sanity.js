(function () {
  const namespace = (window.InmoCatalogSource = window.InmoCatalogSource || {});
  const defaultTheme = {
    primary: "#7dd3fc",
    secondary: "#dbeafe",
    tertiary: "#60a5fa",
    glow: "#f8fafc",
  };

  function toText(value) {
    return String(value ?? "").trim();
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

  function parseNumber(value) {
    const cleaned = toText(value).replace(/[^0-9.-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
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

    if (type === "video" || type === "image") {
      return type;
    }

    const lowerSrc = toText(src).split("?")[0].toLowerCase();

    return /\.(mp4|webm|mov|m4v)$/i.test(lowerSrc) ? "video" : "image";
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
      const format = toText(config.imageFormat || "webp").toLowerCase();

      if (format === "webp") {
        url.searchParams.set("fm", "webp");
      }

      const quality = clampNumber(toPositiveInteger(config.imageQuality, 72), 45, 90);
      const maxWidth = clampNumber(toPositiveInteger(config.imageMaxWidth, 2160), 640, 4096);
      const maxHeight = clampNumber(toPositiveInteger(config.imageMaxHeight, 3840), 640, 4096);

      url.searchParams.set("fit", "max");
      url.searchParams.set("q", String(quality));
      url.searchParams.set("w", String(maxWidth));
      url.searchParams.set("h", String(maxHeight));

      return url.toString();
    } catch {
      return safeSrc;
    }
  }

  function normalizeTheme(theme, fallback = defaultTheme) {
    const source = theme && typeof theme === "object" ? theme : {};

    return {
      primary: sanitizeHexColor(source.primary ?? source.theme_primary ?? source.themePrimary ?? source.color, fallback.primary),
      secondary: sanitizeHexColor(source.secondary ?? source.theme_secondary ?? source.themeSecondary, fallback.secondary),
      tertiary: sanitizeHexColor(source.tertiary ?? source.theme_tertiary ?? source.themeTertiary, fallback.tertiary),
      glow: sanitizeHexColor(source.glow ?? source.theme_glow ?? source.themeGlow, fallback.glow),
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
    return toArray(metrics)
      .map((metric, index) => normalizeMetric(metric, index))
      .filter(Boolean)
      .slice(0, 3);
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
    return toArray(features)
      .map(normalizeFeature)
      .filter(Boolean)
      .slice(0, 12);
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

    pushDetail("Tipo", property.type);
    pushDetail("Operación", normalizeOperationLabel(doc.operacion ?? doc.operation ?? doc.badge));
    pushDetail("Ubicación", joinUniqueTexts([doc.Ubicacion, doc.location, doc.neighborhood]));
    pushDetail("Dirección", toText(doc.Direccion ?? doc.address));

    return details;
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
    const ambientes = doc.Ambientes ?? doc.ambientes;
    const cochera = doc.Cochera ?? doc.cochera;

    if (hasValue(ambientes)) {
      metrics.push({
        label: "Ambientes",
        value: ambientes,
      });
    }

    if (hasValue(cochera)) {
      metrics.push({
        label: "Cochera",
        value: cochera,
      });
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

    const src = safeUrl(item.src ?? item.url ?? item.asset?.url ?? item.image?.asset?.url ?? item.video?.asset?.url ?? item.file?.asset?.url);

    if (!src) {
      return null;
    }

    const mediaType = inferMediaType(item.type ?? item.mediaType ?? item.kind ?? item._type, src);
    const optimizedSrc = mediaType === "image" ? optimizeImageUrl(src, config) : src;
    const posterSrc = safeUrl(item.poster ?? item.posterUrl ?? item.poster_image ?? item.posterImage?.asset?.url ?? item.image?.asset?.url);

    return {
      type: mediaType,
      src: optimizedSrc,
      caption: toText(item.caption ?? item.alt ?? item.title ?? item.name),
      duration: parseDuration(item.duration ?? item.durationMs ?? item.duration_ms, 0),
      poster: optimizeImageUrl(posterSrc, config),
    };
  }

  function normalizeMedia(media, totalDurationMs, config = {}) {
    const items = toArray(media)
      .map((item) => normalizeMediaItem(item, config))
      .filter((item) => item && item.src);

    if (items.length > 0) {
      const derivedDuration = Math.max(1000, Math.round(totalDurationMs / items.length));

      items.forEach((item) => {
        if (!item.duration) {
          item.duration = derivedDuration;
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

  function normalizeProperty(doc, config) {
    if (!doc || typeof doc !== "object" || !isRecordActive(doc)) {
      return null;
    }

    const name = toText(doc.titulo ?? doc.name ?? doc.title);

    if (!name) {
      return null;
    }

    const fallbackDurationMs = Number(config.defaultDurationMs) || 20000;
    const totalDurationMs = parseDuration(doc.durationMs ?? doc.duration_ms ?? doc.slideDurationMs, fallbackDurationMs);
    const media = normalizeMedia(doc.media ?? doc.fotos ?? doc.images ?? doc.gallery, totalDurationMs, config);

    if (media.length === 0) {
      return null;
    }

    const type = toText(doc.Tipo ?? doc.tipo ?? doc.type ?? doc.propertyType);
    const operationLabel = normalizeOperationLabel(doc.operacion ?? doc.operation ?? doc.badge);
    const location = joinUniqueTexts([doc.Ubicacion, doc.location, doc.neighborhood]) || toText(doc.Direccion ?? doc.address);
    const publishedUrl = toText(
      doc.publishedUrl ??
        doc.Link ??
        doc.propertyUrl ??
        doc.publicUrl ??
        doc.qrLink ??
        doc.link ??
        doc.url ??
        doc.href ??
        doc.siteUrl ??
        doc.canonicalUrl ??
        doc.permalink
    );

    let metrics = normalizeMetrics(doc.metrics ?? doc.stats ?? doc.highlights);
    const generatedMetrics = normalizeMetrics(buildPropertyMetrics(doc));

    if (generatedMetrics.length > 0) {
      const seenMetrics = new Set(metrics.map((metric) => metric.label.toLowerCase()));

      generatedMetrics.forEach((metric) => {
        const key = metric.label.toLowerCase();

        if (seenMetrics.has(key)) {
          return;
        }

        seenMetrics.add(key);
        metrics.push(metric);
      });
    }

    const property = {
      id: toText(doc.id ?? doc.slug?.current ?? doc.slug ?? doc._id ?? slugify(name)) || slugify(name),
      slug: toText(doc.slug?.current ?? doc.slug ?? ""),
      name,
      title: toText(doc.title ?? doc.titulo ?? name),
      type,
      location,
      price: parsePrice(doc.price ?? doc.precio),
      badge: toText(doc.badge) || operationLabel,
      summary: buildPropertySummary(doc, type, location, operationLabel),
      publishedUrl,
      metrics: metrics.slice(0, 3),
      features: normalizeFeatures(
        doc.Servicios ??
          doc.servicios ??
          doc.ServiciosDisponibles ??
          doc.serviciosDisponibles ??
          doc.services ??
          doc.serviceList ??
          doc.amenidades ??
          doc.comodidades ??
          doc.caracteristicas ??
          doc.features ??
          doc.amenities
      ),
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
      useCdn: config.useCdn !== false,
      perspective: config.perspective || "published",
    });
  }

  function buildSettingsQuery() {
    return `*[_type == $settingsType][0]{
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
      _id,
      _type,
      id,
      slug{current},
      name,
      title,
      titulo,
      Tipo,
      operacion,
      type,
      propertyType,
      Ubicacion,
      Direccion,
      location,
      address,
      neighborhood,
      Ambientes,
      Cochera,
      Servicios,
      servicios,
      ServiciosDisponibles,
      serviciosDisponibles,
      services,
      serviceList,
      amenidades,
      comodidades,
      caracteristicas,
      price,
      precio,
      badge,
      Link,
      publishedUrl,
      propertyUrl,
      publicUrl,
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
      media[]{
        ...,
        "src": coalesce(src, url, asset->url, image.asset->url, video.asset->url, file.asset->url),
        "poster": coalesce(poster, posterUrl, poster_image, posterImage.asset->url, image.asset->url, asset->url),
        "caption": coalesce(caption, alt, title, name),
        "duration": coalesce(duration, durationMs, duration_ms)
      },
      fotos[]{
        ...,
        "src": asset->url,
        "poster": asset->url,
        "caption": coalesce(caption, alt, title, name),
        "duration": coalesce(duration, durationMs, duration_ms)
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
      const settingsType = toText(config.settingsType) || "siteSettings";
      const propertyTypes = Array.isArray(config.propertyTypes) && config.propertyTypes.length > 0 ? config.propertyTypes.map(toText).filter(Boolean) : [toText(config.propertyType) || "property"];
      const [settingsDocument, propertyDocuments] = await Promise.all([
        client.fetch(buildSettingsQuery(), { settingsType }),
        client.fetch(buildPropertiesQuery(), { propertyTypes }),
      ]);

      const company = normalizeCompany(settingsDocument, config);
      const properties = Array.isArray(propertyDocuments) ? propertyDocuments.map((document) => normalizeProperty(document, config)).filter(Boolean) : [];
      const siteBaseUrl = toText(settingsDocument && (settingsDocument.publicBaseUrl || settingsDocument.siteBaseUrl)) || toText(config.publicBaseUrl);

      if (properties.length === 0) {
        return {
          company,
          properties,
          siteBaseUrl,
          state: "empty",
          message: "Todavia no hay inmuebles publicados.",
        };
      }

      properties.sort(sortProperties);

      return {
        company,
        properties,
        siteBaseUrl,
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
})();