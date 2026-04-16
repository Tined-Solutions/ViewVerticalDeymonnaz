import { toText, normalizeFieldToken, hasValue, toArray, isTruthy, isFalsey } from './utils.js';

export function parseNumber(value) {
    const cleaned = toText(value).replace(/[^0-9.-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

export function parseNullableNumber(value) {
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

export function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

export function toPositiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

export function parsePrice(value) {
    return Math.round(parseNumber(value));
  }

export function toBooleanFlag(value) {
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

export function readField(record, key) {
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

export function pickField(record, keys, fallback = "") {
    for (const key of toArray(keys)) {
      const value = readField(record, key);

      if (hasValue(value)) {
        return value;
      }
    }

    return fallback;
  }

export function formatArea(value) {
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

export function parseDuration(value, fallbackMs = 0) {
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

export function sanitizeHexColor(value, fallback) {
    const text = toText(value);
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text) ? text : fallback;
  }

export function slugify(value) {
    return toText(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }