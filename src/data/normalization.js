import { parseNumber, parsePrice, readField, pickField, parseDuration, slugify, parseNullableNumber } from './mappers.js';
import { normalizeMedia } from './media.js';
import { buildServiceFeaturesFromFlags, buildPanelMetrics } from './metrics.js';
import { normalizeTheme, resolveVisualTheme } from './theme.js';
import { toText, normalizeFieldToken, hasValue, toArray, isRecordActive, normalizeFeatures, normalizeDetails, joinUniqueTexts, normalizeOperationLabel, buildPropertySummary } from './utils.js';

export function normalizeCompany(settings, config) {
    const source = settings && typeof settings === "object" ? settings : {};

    return {
      name: toText(source.companyName ?? source.name ?? source.title ?? config.companyName),
      tagline: toText(source.companyTagline ?? source.tagline ?? source.description ?? config.companyTagline),
    };
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

export function normalizeProperty(doc, config) {
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

    const fallbackDurationMs = Number(config.defaultDurationMs) || 20000;
    const totalDurationMs = parseDuration(pickField(doc, ["durationMs", "duration_ms", "slideDurationMs", "slideDuration", "duration"]), fallbackDurationMs);
    const media = normalizeMedia(pickField(doc, ["media", "fotos", "images", "gallery", "galeria"]) || doc.media || doc.fotos || doc.images || doc.gallery, totalDurationMs, config);

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

export function createEmptyCatalog(config = {}) {
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