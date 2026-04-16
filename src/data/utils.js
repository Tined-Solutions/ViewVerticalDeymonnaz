import { createClientInstance } from './client.js';
import { readField, pickField, formatArea, parseDuration, parseNullableNumber } from './mappers.js';
import { safeUrl, inferMediaType, optimizeImageUrl } from './media.js';
import { metricLabelFromKey, metricPriority } from './metrics.js';
import { normalizeCompany, normalizeProperty, createEmptyCatalog } from './normalization.js';
import { buildSettingsQuery, buildPropertiesQuery } from './queries.js';
import { resolveVisualTheme } from './theme.js';

export function toText(value) {
    return String(value ?? "").trim();
  }

export function normalizeFieldToken(value) {
    return toText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

export function hasValue(value) {
    return value !== undefined && value !== null && toText(value) !== "";
  }

export function toArray(value) {
    if (Array.isArray(value)) {
      return value;
    }

    if (!hasValue(value)) {
      return [];
    }

    return [value];
  }

export function isTruthy(value) {
    const text = toText(value).toLowerCase();
    return ["1", "true", "yes", "si", "sí", "on", "active", "published", "live"].includes(text);
  }

export function isFalsey(value) {
    const text = toText(value).toLowerCase();
    return ["0", "false", "no", "off", "inactive", "archived", "disabled", "hidden", "draft"].includes(text);
  }

export function isRecordActive(record) {
    if (Object.prototype.hasOwnProperty.call(record, "active")) {
      return isTruthy(record.active) || !isFalsey(record.active);
    }

    if (Object.prototype.hasOwnProperty.call(record, "status")) {
      return !isFalsey(record.status);
    }

    return true;
  }

export function sortMetricsByPriority(metrics) {
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

export function normalizeFeature(feature) {
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

export function normalizeFeatures(features) {
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

export function normalizeDetailValue(value) {
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

export function isSimpleFieldValue(value) {
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

export function shouldSkipDynamicDetailKey(normalizedKey) {
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

export function collectDynamicDetails(doc, existingDetails = []) {
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

export function normalizeDetails(doc, property) {
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

export function joinUniqueTexts(values, separator = " · ") {
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

export function normalizeOperationLabel(value) {
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

function resolveSurfaceModelFromDoc(doc) {
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

export function buildPropertyMetrics(doc) {
    const metrics = [];
    const ambientes = pickField(doc, ["Ambientes", "ambientes", "rooms", "roomCount", "cantidadAmbientes"]);
    const dormitorios = pickField(doc, ["Dormitorios", "dormitorios", "habitaciones", "bedrooms", "bedroomCount", "cantidadDormitorios"]);
    const banos = pickField(doc, ["Banos", "banos", "Baños", "baños", "bathrooms", "bathroomCount", "cantidadBanos"]);
    const cochera = pickField(doc, ["Cochera", "cochera", "garage", "garages", "garageCount", "cocheras"]);
    const surfaceModel = resolveSurfaceModelFromDoc(doc);
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

export function buildDynamicMetricsFromDoc(doc) {
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

export function normalizeCountMetricValue(value) {
    const text = normalizeDetailValue(value);
    return text || "-";
  }

export function isPositiveAmenityValue(value) {
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

export function hasAmenityFromDoc(doc, keys, servicePattern) {
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

export function buildPropertySummary(doc, type, location, operationLabel) {
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

export function normalizeMediaItem(item, config = {}) {
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

export function sortProperties(left, right) {
    const leftSort = Number.isFinite(left.sortOrder) ? left.sortOrder : Number.MAX_SAFE_INTEGER;
    const rightSort = Number.isFinite(right.sortOrder) ? right.sortOrder : Number.MAX_SAFE_INTEGER;

    if (leftSort !== rightSort) {
      return leftSort - rightSort;
    }

    return left.name.localeCompare(right.name, "es");
  }

export const loadCatalog = async function loadCatalog(config = {}) {
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