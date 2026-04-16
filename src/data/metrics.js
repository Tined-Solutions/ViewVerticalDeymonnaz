import { toBooleanFlag, readField, pickField, formatArea, parseNullableNumber } from './mappers.js';
import { toText, normalizeFieldToken, hasValue, toArray, normalizeCountMetricValue, hasAmenityFromDoc } from './utils.js';

export function metricLabelFromKey(key) {
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

export function normalizeMetric(metric, index) {
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

export function normalizeMetrics(metrics) {
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

export function metricPriority(label) {
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

export function buildServiceFeaturesFromFlags(doc) {
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

function resolveSurfaceMetricsModel(doc) {
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

export function buildPanelMetrics(doc, surfaceModel) {
    const metrics = [];
    const cochera = pickField(doc, ["Cochera", "cochera", "garage", "garages", "garageCount", "cocheras"]);
    const banos = pickField(doc, ["Banos", "banos", "Baños", "baños", "bathrooms", "bathroomCount", "cantidadBanos"]);
    const habitaciones = pickField(doc, ["Habitaciones", "habitaciones", "Dormitorios", "dormitorios", "bedrooms", "bedroomCount", "cantidadDormitorios"]);
    const normalizedSurfaceModel = surfaceModel && typeof surfaceModel === "object" ? surfaceModel : resolveSurfaceMetricsModel(doc);
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