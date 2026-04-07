import React from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, useReducedMotion } from "https://esm.sh/framer-motion@12.38.0?deps=react@18.3.1,react-dom@18.3.1";

const create = React.createElement;
const fragment = React.Fragment;
const motion = m;
const rootElement = document.getElementById("app");
const baseTitle = "Pantalla Inmobiliaria";
const qrImageCache = new Set();
const qrImagePending = new Map();
const mediaLumaCache = new Map();
const mediaLumaPending = new Map();

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildPanelVisual(brightness, performanceMode) {
  const safeBrightness = Number.isFinite(brightness) ? brightness : 132;
  const normalized = clampNumber((safeBrightness - 54) / 176, 0, 1);
  const blurBase = performanceMode ? 14 : 16;
  const blurRange = performanceMode ? 10 : 14;
  const saturationBase = performanceMode ? 106 : 110;
  const saturationRange = performanceMode ? 12 : 18;

  return {
    blurPx: Math.round(blurBase + normalized * blurRange),
    saturation: Math.round(saturationBase + normalized * saturationRange),
    bgAlpha: Number((0.64 + normalized * 0.2).toFixed(3)),
    borderAlpha: Number((0.1 + normalized * 0.08).toFixed(3)),
  };
}

function resolveImageLuma(src) {
  if (!src) {
    return Promise.resolve(132);
  }

  if (mediaLumaCache.has(src)) {
    return Promise.resolve(mediaLumaCache.get(src));
  }

  const pending = mediaLumaPending.get(src);

  if (pending) {
    return pending;
  }

  const task = new Promise((resolve) => {
    const image = new Image();

    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.onload = () => {
      let brightness = 132;

      try {
        const sampleSize = 28;
        const canvas = document.createElement("canvas");
        canvas.width = sampleSize;
        canvas.height = sampleSize;

        const context = canvas.getContext("2d", { willReadFrequently: true });

        if (context) {
          context.drawImage(image, 0, 0, sampleSize, sampleSize);
          const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;

          let sum = 0;
          let count = 0;

          for (let index = 0; index < pixels.length; index += 16) {
            const alpha = pixels[index + 3];

            if (alpha < 16) {
              continue;
            }

            const red = pixels[index];
            const green = pixels[index + 1];
            const blue = pixels[index + 2];
            sum += red * 0.2126 + green * 0.7152 + blue * 0.0722;
            count += 1;
          }

          if (count > 0) {
            brightness = sum / count;
          }
        }
      } catch {
        brightness = 132;
      }

      const safeBrightness = clampNumber(Math.round(brightness), 0, 255);
      mediaLumaCache.set(src, safeBrightness);
      mediaLumaPending.delete(src);
      resolve(safeBrightness);
    };
    image.onerror = () => {
      mediaLumaPending.delete(src);
      mediaLumaCache.set(src, 132);
      resolve(132);
    };
    image.src = src;
  });

  mediaLumaPending.set(src, task);

  return task;
}

function preloadQrImage(src) {
  if (!src) {
    return Promise.resolve(false);
  }

  if (qrImageCache.has(src)) {
    return Promise.resolve(true);
  }

  const pending = qrImagePending.get(src);

  if (pending) {
    return pending;
  }

  const task = new Promise((resolve) => {
    const image = new Image();

    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.onload = () => {
      qrImageCache.add(src);
      qrImagePending.delete(src);
      resolve(true);
    };
    image.onerror = () => {
      qrImagePending.delete(src);
      resolve(false);
    };
    image.src = src;
  });

  qrImagePending.set(src, task);

  return task;
}

function isCatalogReady(catalog) {
  return Boolean(catalog && Array.isArray(catalog.properties) && catalog.properties.length > 0);
}

function catalogSignature(catalog) {
  return JSON.stringify({
    company: catalog.company || {},
    siteBaseUrl: catalog.siteBaseUrl || "",
    properties: catalog.properties.map((property) => ({
      id: property.id,
      name: property.name,
      publishedUrl: property.publishedUrl || "",
      sortOrder: Number.isFinite(property.sortOrder) ? property.sortOrder : null,
      media: Array.isArray(property.media)
        ? property.media.map((item) => ({
            type: item.type,
            src: item.src,
            duration: item.duration || 0,
          }))
        : [],
    })),
  });
}

function resolveInitialPropertyIndex(catalog) {
  const searchParams = new URLSearchParams(window.location.search);
  const rawTarget = searchParams.get("property") || searchParams.get("inmueble") || searchParams.get("slug") || window.location.hash.replace(/^#/, "");
  const target = String(rawTarget || "").trim().toLowerCase();

  if (!target) {
    return 0;
  }

  const matchingIndex = catalog.properties.findIndex((property) => String(property.id || "").trim().toLowerCase() === target);

  return matchingIndex >= 0 ? matchingIndex : 0;
}

function buildPropertyUrl(property, siteBaseUrl) {
  if (property && property.publishedUrl) {
    try {
      const fallbackBase = String(siteBaseUrl || "").trim() ? new URL(siteBaseUrl, window.location.href) : new URL(window.location.href);
      const resolvedUrl = new URL(String(property.publishedUrl), fallbackBase);

      if (["http:", "https:"].includes(resolvedUrl.protocol)) {
        return resolvedUrl.toString();
      }
    } catch {
      // If resolution fails, fall back to the default site URL logic below.
    }
  }

  const configuredBase = String(siteBaseUrl || "").trim();
  const baseUrl = configuredBase ? new URL(configuredBase, window.location.href) : new URL(window.location.href);

  baseUrl.search = "";
  baseUrl.hash = "";
  baseUrl.searchParams.set("property", property.id);

  return baseUrl.toString();
}

function buildQrUrl(property, siteBaseUrl) {
  const propertyUrl = buildPropertyUrl(property, siteBaseUrl);
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(propertyUrl)}`;
}

function normalizeComparableText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function summaryIsRedundant(summary, occupiedValues) {
  const normalizedSummary = normalizeComparableText(summary);

  if (!normalizedSummary) {
    return true;
  }

  if (occupiedValues.has(normalizedSummary)) {
    return true;
  }

  const parts = String(summary ?? "")
    .split(/·|\||,|;/)
    .map((part) => normalizeComparableText(part))
    .filter(Boolean);

  return parts.length > 0 && parts.every((part) => occupiedValues.has(part));
}

function proceduralDelay(index, base = 0, step = 0.012) {
  const pattern = [0, 2, 1, 4, 3, 5, 7, 6];
  const safeIndex = Number.isFinite(index) ? Math.max(0, index) : 0;
  const cycle = pattern[safeIndex % pattern.length] * step;
  const wave = Math.floor(safeIndex / pattern.length) * step * 0.45;

  return base + cycle + wave;
}

function AnimatedBlock({ as = "div", className, children, reduceMotion, delay = 0, y = 14, transition = {}, style = {}, ...rest }) {
  const MotionTag = motion[as] || motion.div;
  const initialState = reduceMotion ? { opacity: 0 } : { opacity: 0, y };
  const animateState = reduceMotion
    ? { opacity: 1 }
    : {
        opacity: 1,
        y: 0,
        transition: { duration: 0.28, ease: "easeOut", delay, ...transition },
      };
  const exitState = reduceMotion
    ? { opacity: 0 }
    : {
        opacity: 0,
        y: Math.max(0, y * 0.4),
        transition: { duration: 0.2, ease: "easeIn" },
      };

  return create(
    MotionTag,
    {
      className,
      style,
      initial: initialState,
      animate: animateState,
      exit: exitState,
      ...rest,
    },
    children
  );
}

function BackgroundOrbs({ reduceMotion }) {
  const primaryAnimate = reduceMotion
    ? { opacity: 0.5 }
    : { x: [0, 20, -12, 0], y: [0, -16, 8, 0], scale: [1, 1.08, 1.02, 1], opacity: [0.55, 0.9, 0.55] };
  const secondaryAnimate = reduceMotion
    ? { opacity: 0.34 }
    : { x: [0, -16, 18, 0], y: [0, 14, -10, 0], scale: [1, 1.04, 1], opacity: [0.34, 0.72, 0.34] };
  const tertiaryAnimate = reduceMotion
    ? { opacity: 0.26 }
    : { x: [0, 12, -8, 0], y: [0, 12, -12, 0], scale: [1, 1.03, 1], opacity: [0.26, 0.54, 0.26] };

  const primaryTransition = reduceMotion ? { duration: 0.01 } : { duration: 18, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" };
  const secondaryTransition = reduceMotion ? { duration: 0.01 } : { duration: 22, repeat: Infinity, repeatType: "mirror", ease: "easeInOut", delay: 1.2 };
  const tertiaryTransition = reduceMotion ? { duration: 0.01 } : { duration: 26, repeat: Infinity, repeatType: "mirror", ease: "easeInOut", delay: 2.1 };

  return create(
    fragment,
    null,
    create(motion.div, {
      className: "stage-shell-orb stage-shell-orb--primary",
      "aria-hidden": true,
      animate: primaryAnimate,
      transition: primaryTransition,
    }),
    create(motion.div, {
      className: "stage-shell-orb stage-shell-orb--secondary",
      "aria-hidden": true,
      animate: secondaryAnimate,
      transition: secondaryTransition,
    }),
    create(motion.div, {
      className: "stage-shell-orb stage-shell-orb--tertiary",
      "aria-hidden": true,
      animate: tertiaryAnimate,
      transition: tertiaryTransition,
    })
  );
}

function StatusScreen({ title, description, details }) {
  const reduceMotion = Boolean(useReducedMotion());

  React.useEffect(() => {
    document.title = title || baseTitle;
  }, [title]);

  return create(
    "div",
    { className: "experience-shell" },
    create(BackgroundOrbs, { reduceMotion }),
    create(
      "div",
      { className: "stage-frame flex h-full w-full items-center justify-center p-6" },
      create(
        motion.div,
        {
          className: "floating-card max-w-2xl px-8 py-10 text-center",
          initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.985 },
          animate: reduceMotion
            ? { opacity: 1 }
            : { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 120, damping: 18 } },
        },
        create("p", { className: "section-kicker" }, "Sanity"),
        create("h1", { className: "font-display mt-5 text-4xl uppercase tracking-[0.12em] text-white" }, title),
        create("p", { className: "mx-auto mt-5 max-w-xl text-sm leading-7 text-white/70" }, description),
        details ? create("p", { className: "mt-6 text-[10px] uppercase tracking-[0.4em] text-white/35" }, details) : null
      )
    )
  );
}

function MetricTile({ metric, index, reduceMotion }) {
  if (!metric) {
    return null;
  }

  const appearDelay = reduceMotion ? 0 : proceduralDelay(index, 0.02, 0.009);
  const startY = 6 + (index % 3) * 2;
  const startX = index % 2 === 0 ? -3 : 3;

  return create(
    motion.div,
    {
      className: "rounded-xl border border-white/15 bg-white/[0.05] px-2.5 py-2 text-white/90",
      initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: startY, x: startX, scale: 0.985 },
      animate: reduceMotion
        ? { opacity: 1 }
        : {
            opacity: 1,
            y: 0,
            x: 0,
            scale: 1,
            transition: { duration: 0.2, ease: "easeOut", delay: appearDelay },
          },
    },
    create("div", { className: "text-[0.95rem] font-semibold leading-tight text-white sm:text-base" }, metric.value || ""),
    create("div", { className: "mt-1 text-[0.56rem] uppercase tracking-[0.18em] text-cyan-200/80" }, metric.label || "")
  );
}

function FeaturePill({ feature, index, reduceMotion }) {
  if (!feature) {
    return null;
  }

  const appearDelay = reduceMotion ? 0 : proceduralDelay(index, 0.015, 0.008);

  return create(
    motion.span,
    {
      className: "inline-flex max-w-full items-center rounded-full border border-cyan-200/25 bg-cyan-100/10 px-2.5 py-1 text-[0.66rem] font-medium leading-tight text-cyan-50",
      initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 7, x: index % 2 === 0 ? -2 : 2, scale: 0.99 },
      animate: reduceMotion
        ? { opacity: 1 }
        : {
            opacity: 1,
            y: 0,
            x: 0,
            scale: 1,
            transition: { duration: 0.16, ease: "easeOut", delay: appearDelay },
          },
    },
    feature
  );
}

function DetailCard({ detail, index, reduceMotion }) {
  if (!detail) {
    return null;
  }

  const appearDelay = reduceMotion ? 0 : proceduralDelay(index, 0.018, 0.009);

  return create(
    motion.div,
    {
      className: "rounded-xl border border-white/15 bg-white/[0.045] px-2.5 py-2",
      initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, x: index % 2 === 0 ? -2 : 2, scale: 0.99 },
      animate: reduceMotion
        ? { opacity: 1 }
        : {
            opacity: 1,
            y: 0,
            x: 0,
            scale: 1,
            transition: { duration: 0.17, ease: "easeOut", delay: appearDelay },
          },
    },
    create("div", { className: "text-[0.54rem] uppercase tracking-[0.2em] text-cyan-200/80" }, detail.label || ""),
    create("div", { className: "mt-1 text-[0.76rem] leading-tight text-white/90" }, detail.value || "")
  );
}

function AnimatedQr({ qrUrl, propertyName, reduceMotion }) {
  const frameVariants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      }
    : {
        hidden: { opacity: 0, scale: 0.94 },
        visible: {
          opacity: 1,
          scale: 1,
          transition: { duration: 0.14, ease: "easeOut", delay: 0 },
        },
      };

  const scanVariants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 0 },
      }
    : {
        hidden: { opacity: 0, y: "-120%" },
        visible: {
          opacity: [0, 0.55, 0],
          y: ["-120%", "120%"],
          transition: { duration: 1.2, ease: "easeInOut", delay: 0.08 },
        },
      };

  const glowVariants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 0 },
      }
    : {
        hidden: { opacity: 0, scale: 0.88 },
        visible: {
          opacity: [0, 0.24, 0],
          scale: [0.95, 1.02, 1.08],
          transition: { duration: 0.9, ease: "easeOut", delay: 0.04 },
        },
      };

  return create(
    motion.div,
    {
      className:
        "relative grid h-[82px] w-[82px] place-items-center overflow-hidden rounded-xl border border-cyan-200/30 bg-white p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.3)] sm:h-[92px] sm:w-[92px] lg:h-[104px] lg:w-[104px] 2xl:h-[128px] 2xl:w-[128px]",
      variants: frameVariants,
      initial: "hidden",
      animate: "visible",
    },
    create("img", {
      src: qrUrl,
      alt: `Codigo QR para abrir ${propertyName}`,
      className: "relative z-[1] block h-full w-full object-contain",
      loading: "eager",
      decoding: "async",
      draggable: false,
      referrerPolicy: "no-referrer",
    }),
    create(motion.span, {
      className: "pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.2)_0%,rgba(186,230,253,0.08)_36%,transparent_72%)] mix-blend-screen",
      "aria-hidden": true,
      variants: glowVariants,
      initial: "hidden",
      animate: "visible",
    }),
    create(motion.span, {
      className: "pointer-events-none absolute inset-x-0 top-[-20%] z-[2] h-[40%] bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.9)_50%,transparent_100%)] mix-blend-screen",
      "aria-hidden": true,
      variants: scanVariants,
      initial: "hidden",
      animate: "visible",
    })
  );
}

function MediaStage({ property, media, reduceMotion, performanceMode }) {
  const mediaVariants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        hidden: {
          opacity: 0.96,
          rotateY: -20,
          rotateZ: -0.85,
          x: -38,
          y: 2,
          scale: 1.018,
        },
        visible: {
          opacity: 1,
          rotateY: 0,
          rotateZ: 0,
          x: 0,
          y: 0,
          scale: 1,
          transition: { duration: performanceMode ? 0.56 : 0.62, ease: [0.2, 0.8, 0.18, 1] },
        },
        exit: {
          opacity: 0.94,
          rotateY: 106,
          rotateZ: 1.35,
          x: 118,
          y: -2,
          scale: 0.984,
          transition: { duration: performanceMode ? 0.52 : 0.58, ease: [0.58, 0.02, 0.96, 0.46] },
        },
      };

  if (!media) {
    return create(
      motion.div,
      {
        className: "media-stage__item",
        initial: reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.02 },
        animate: reduceMotion
          ? { opacity: 1 }
          : { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 90, damping: 18 } },
      },
      create(
        "div",
        {
          className:
            "flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(0,0,0,0.35))] p-8 text-center",
        },
        create("div", null, create("p", { className: "text-[10px] uppercase tracking-[0.4em] text-white/45" }, "Media no disponible"), create("p", { className: "mt-3 text-xl font-semibold text-white" }, property ? property.name : "Sin contenido"))
      )
    );
  }

  return create(
    AnimatePresence,
    { mode: "sync", initial: false },
    create(
      motion.div,
      {
        key: media.src,
        className: "media-stage__item",
        style: reduceMotion
          ? undefined
          : { transformStyle: "preserve-3d", transformOrigin: "left center", willChange: "transform, opacity" },
        variants: mediaVariants,
        initial: "hidden",
        animate: "visible",
        exit: "exit",
      },
      media.type === "video"
        ? create("video", {
            src: media.src,
            poster: media.poster || "",
            autoPlay: true,
            muted: true,
            loop: true,
            playsInline: true,
            preload: performanceMode ? "metadata" : "auto",
            "aria-label": media.caption ? `${property.name} - ${media.caption}` : property.name,
            style: reduceMotion ? undefined : { backfaceVisibility: "hidden", transform: "translateZ(0)" },
          })
        : create("img", {
            src: media.src,
            alt: media.caption ? `${property.name} - ${media.caption}` : property.name,
            loading: "eager",
            decoding: "async",
            fetchPriority: "high",
            draggable: false,
            referrerPolicy: "no-referrer",
            style: reduceMotion ? undefined : { backfaceVisibility: "hidden", transform: "translateZ(0)" },
          }),
      !reduceMotion
        ? create(motion.span, {
            "aria-hidden": true,
            initial: { opacity: 0.12, x: -10 },
            animate: { opacity: 0.3, x: 0, transition: { duration: 0.52, ease: "easeOut" } },
            exit: { opacity: 0.56, x: 28, transition: { duration: 0.48, ease: "easeIn" } },
            style: {
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: performanceMode ? "30%" : "36%",
              pointerEvents: "none",
              zIndex: 2,
              background: "linear-gradient(90deg, rgba(7,14,30,0.72) 0%, rgba(7,14,30,0.3) 44%, rgba(7,14,30,0) 100%)",
              mixBlendMode: "multiply",
            },
          })
        : null,
      !reduceMotion && !performanceMode
        ? create(motion.span, {
            "aria-hidden": true,
            initial: { opacity: 0, x: -6 },
            animate: { opacity: 0.34, x: 0, transition: { duration: 0.5, ease: "easeOut" } },
            exit: { opacity: 0.18, x: 14, transition: { duration: 0.44, ease: "easeIn" } },
            style: {
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: "2px",
              pointerEvents: "none",
              zIndex: 2,
              background: "linear-gradient(180deg, rgba(255,255,255,0.58) 0%, rgba(255,255,255,0.2) 35%, rgba(255,255,255,0) 100%)",
            },
          })
        : null
    )
  );
}

function PropertyPanel({ property, siteBaseUrl, qrUrl, utils, reduceMotion, performanceMode, panelVisual }) {
  if (!property) {
    return null;
  }

  const panelReduceMotion = reduceMotion || performanceMode;
  const panelIntroBaseDelay = panelReduceMotion ? 0 : 0.06;
  const panelClassName = performanceMode
    ? "absolute inset-x-2 bottom-2 z-40 overflow-hidden rounded-2xl border border-white/12 bg-slate-950/78 p-3 shadow-[0_14px_34px_rgba(0,0,0,0.4)] backdrop-blur-md sm:inset-x-3 sm:bottom-3 sm:p-4 lg:inset-x-5 lg:bottom-4 lg:p-5 xl:inset-x-6 xl:bottom-5 xl:p-6 2xl:inset-x-8 2xl:bottom-7 2xl:p-7"
    : "absolute inset-x-2 bottom-2 z-40 overflow-hidden rounded-2xl border border-white/15 bg-slate-950/72 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-md sm:inset-x-3 sm:bottom-3 sm:p-4 lg:inset-x-5 lg:bottom-4 lg:p-5 xl:inset-x-6 xl:bottom-5 xl:p-6 2xl:inset-x-8 2xl:bottom-7 2xl:p-7";

  const kickerValues = [property.type, property.badge]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((value, index, values) => values.findIndex((candidate) => normalizeComparableText(candidate) === normalizeComparableText(value)) === index);
  const kickerText = kickerValues.join(" · ");
  const titleText = property.title || property.name || "";
  const locationText = property.location || "";
  const rawSummaryText = property.summary || "";
  const priceText = Number.isFinite(property.price) && property.price > 0 ? utils.formatPrice(property.price) : "-";
  const rawMetrics = Array.isArray(property.metrics) ? property.metrics : [];
  const rawDetails = Array.isArray(property.details) ? property.details : [];
  const rawFeatures = Array.isArray(property.features) ? property.features : [];
  const resolvedQrUrl = qrUrl || buildQrUrl(property, siteBaseUrl);
  const surfaceBlur = panelVisual && Number.isFinite(panelVisual.blurPx) ? panelVisual.blurPx : 20;
  const surfaceSaturation = panelVisual && Number.isFinite(panelVisual.saturation) ? panelVisual.saturation : 116;
  const surfaceAlpha = panelVisual && Number.isFinite(panelVisual.bgAlpha) ? panelVisual.bgAlpha : 0.72;
  const surfaceBorderAlpha = panelVisual && Number.isFinite(panelVisual.borderAlpha) ? panelVisual.borderAlpha : 0.14;
  const panelSurfaceStyle = {
    backgroundColor: `rgba(2, 8, 20, ${surfaceAlpha})`,
    borderColor: `rgba(255, 255, 255, ${surfaceBorderAlpha})`,
    backdropFilter: `blur(${surfaceBlur}px) saturate(${surfaceSaturation}%)`,
    WebkitBackdropFilter: `blur(${surfaceBlur}px) saturate(${surfaceSaturation}%)`,
  };

  const occupiedValues = new Set(
    [titleText, locationText, ...kickerValues]
      .map((value) => normalizeComparableText(value))
      .filter(Boolean)
  );

  const metricKeys = new Set();
  const metrics = rawMetrics.filter((metric) => {
    if (!metric) {
      return false;
    }

    const label = normalizeComparableText(metric.label);
    const value = normalizeComparableText(metric.value);

    if (!label && !value) {
      return false;
    }

    const key = `${label}|${value}`;

    if (metricKeys.has(key)) {
      return false;
    }

    metricKeys.add(key);

    if (value) {
      occupiedValues.add(value);
    }

    return true;
  });

  const detailKeys = new Set();
  const details = rawDetails.filter((detail) => {
    if (!detail) {
      return false;
    }

    const label = normalizeComparableText(detail.label);
    const value = normalizeComparableText(detail.value);

    if (!value) {
      return false;
    }

    if (occupiedValues.has(value)) {
      return false;
    }

    const key = `${label}|${value}`;

    if (detailKeys.has(key)) {
      return false;
    }

    detailKeys.add(key);
    occupiedValues.add(value);

    return true;
  });

  const summaryText = summaryIsRedundant(rawSummaryText, occupiedValues) ? "" : rawSummaryText;

  if (summaryText) {
    occupiedValues.add(normalizeComparableText(summaryText));

    String(summaryText)
      .split(/·|\||,|;/)
      .map((part) => normalizeComparableText(part))
      .filter(Boolean)
      .forEach((part) => occupiedValues.add(part));
  }

  const featureKeys = new Set();
  const features = rawFeatures.filter((feature) => {
    const value = normalizeComparableText(feature);

    if (!value) {
      return false;
    }

    if (occupiedValues.has(value)) {
      return false;
    }

    if (featureKeys.has(value)) {
      return false;
    }

    featureKeys.add(value);
    occupiedValues.add(value);

    return true;
  });

  const panelVariants = panelReduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        hidden: { opacity: 0, y: 10 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.2, ease: "easeOut", delay: panelIntroBaseDelay },
        },
        exit: { opacity: 0, y: 4, transition: { duration: 0.12, ease: "easeIn" } },
      };

  const sectionVariants = panelReduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      }
    : {
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.16, ease: "easeOut" } },
      };

  return create(
    AnimatePresence,
    { mode: "sync" },
    create(
      motion.section,
      {
        key: property.id,
        className: panelClassName,
        style: panelSurfaceStyle,
        variants: panelVariants,
        initial: "hidden",
        animate: "visible",
        exit: "exit",
      },
      create(
        motion.div,
        { className: "grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start xl:gap-4 2xl:gap-5", variants: sectionVariants },
        create(
          motion.div,
          {
            className: "min-w-0",
            variants: sectionVariants,
          },
          create(AnimatedBlock, { as: "p", className: "text-[clamp(0.58rem,0.95vw,0.86rem)] uppercase tracking-[0.24em] text-cyan-200/80", reduceMotion: panelReduceMotion, delay: panelIntroBaseDelay + 0.01, y: 8 }, kickerText),
          create(AnimatedBlock, { as: "h1", className: "font-display mt-1 text-[clamp(1.35rem,3.8vw,4.2rem)] leading-[0.92] text-white", reduceMotion: panelReduceMotion, delay: panelIntroBaseDelay + 0.03, y: 8 }, titleText),
          create(AnimatedBlock, { as: "p", className: "mt-2 text-[clamp(0.62rem,1vw,1rem)] uppercase tracking-[0.2em] text-slate-200/70", reduceMotion: panelReduceMotion, delay: panelIntroBaseDelay + 0.05, y: 7 }, locationText)
        ),
        create(
          motion.div,
          { className: "flex items-start gap-3 md:justify-end xl:gap-4 2xl:gap-5", variants: sectionVariants },
          create(
            motion.div,
            {
              className: "grid gap-1 text-left md:text-right",
            },
            create(AnimatedBlock, { as: "p", className: "text-[clamp(1.25rem,3vw,3.3rem)] font-bold leading-none tracking-tight text-white", reduceMotion: panelReduceMotion, delay: panelIntroBaseDelay + 0.03, y: 8 }, priceText),
            create(AnimatedBlock, { as: "p", className: "text-[clamp(0.58rem,0.9vw,0.82rem)] uppercase tracking-[0.3em] text-cyan-200/80", reduceMotion: panelReduceMotion, delay: panelIntroBaseDelay + 0.05, y: 6 }, "U$S")
          ),
          create(
            motion.div,
            { className: "grid justify-items-center gap-1" },
            create(AnimatedQr, { key: resolvedQrUrl, qrUrl: resolvedQrUrl, propertyName: property.name, reduceMotion: panelReduceMotion }),
            create(
              "p",
              { className: "text-[clamp(0.5rem,0.75vw,0.72rem)] uppercase tracking-[0.22em] text-cyan-100/75" },
              property.publishedUrl ? "Publicación" : "Inmueble"
            )
          )
        )
      ),
      summaryText
        ? create(AnimatedBlock, { as: "p", className: "mt-2 text-[clamp(0.8rem,1.05vw,1.08rem)] leading-relaxed text-slate-100/85", reduceMotion: panelReduceMotion, delay: panelIntroBaseDelay + 0.06, y: 7 }, summaryText)
        : null,
      create(
        motion.div,
        { className: "mt-3 grid grid-cols-1 gap-2.5 xl:gap-3 2xl:gap-4", variants: sectionVariants },
        create(
          motion.div,
          { className: "grid min-w-0 gap-2.5 xl:gap-3 2xl:gap-4", variants: sectionVariants },
          metrics.length
            ? create(
                "div",
                { className: "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5" },
                metrics.map((metric, index) => create(MetricTile, { metric, index, reduceMotion: panelReduceMotion, key: `${property.id}-metric-${index}` }))
              )
            : null,
          details.length
            ? create(
                "div",
                { className: "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" },
                details.map((detail, index) => create(DetailCard, { detail, index, reduceMotion: panelReduceMotion, key: `${property.id}-detail-${index}` }))
              )
            : null,
          features.length
            ? create(
                "div",
                { className: "flex flex-wrap items-start gap-2" },
                features.map((feature, index) => create(FeaturePill, { feature, index, reduceMotion: panelReduceMotion, key: `${property.id}-feature-${index}` }))
              )
            : null
        )
      )
    )
  );
}

function CatalogExperience({ catalog, utils, siteBaseUrl, defaultDurationMs, performanceMode, panelRevealDelayMs, dynamicPanelBlur }) {
  const reduceMotion = Boolean(useReducedMotion());
  const properties = Array.isArray(catalog.properties) ? catalog.properties : [];
  const companyName = catalog.company?.name || "";
  const [propertyIndex, setPropertyIndex] = React.useState(() => resolveInitialPropertyIndex(catalog));
  const [mediaIndex, setMediaIndex] = React.useState(0);
  const [panelDelayDone, setPanelDelayDone] = React.useState(() => Boolean(reduceMotion));
  const [qrReady, setQrReady] = React.useState(() => Boolean(reduceMotion));
  const [panelVisual, setPanelVisual] = React.useState(() => buildPanelVisual(132, performanceMode));

  const property = properties[propertyIndex] || null;
  const media = property && Array.isArray(property.media) ? property.media[mediaIndex] || property.media[0] || null : null;
  const mediaPerspective = performanceMode ? "1650px" : "1450px";
  const qrUrl = property ? buildQrUrl(property, siteBaseUrl) : "";
  const panelVisible = Boolean(property) && panelDelayDone && (reduceMotion || qrReady);

  React.useEffect(() => {
    document.documentElement.classList.toggle("tv-performance-mode", Boolean(performanceMode));

    return () => {
      document.documentElement.classList.remove("tv-performance-mode");
    };
  }, [performanceMode]);

  React.useEffect(() => {
    let active = true;

    const defaultVisual = buildPanelVisual(132, performanceMode);

    if (!dynamicPanelBlur) {
      setPanelVisual(defaultVisual);
      return () => {
        active = false;
      };
    }

    const sampleSource = media
      ? media.type === "video"
        ? media.poster || media.src
        : media.src
      : "";

    if (!sampleSource) {
      setPanelVisual(defaultVisual);
      return () => {
        active = false;
      };
    }

    resolveImageLuma(sampleSource).then((brightness) => {
      if (!active) {
        return;
      }

      setPanelVisual(buildPanelVisual(brightness, performanceMode));
    });

    return () => {
      active = false;
    };
  }, [dynamicPanelBlur, media && media.poster, media && media.src, media && media.type, performanceMode]);

  React.useEffect(() => {
    if (!property) {
      setPanelDelayDone(false);
      return undefined;
    }

    const revealDelay = reduceMotion
      ? 0
      : Number.isFinite(panelRevealDelayMs)
      ? Math.max(0, panelRevealDelayMs)
      : 1000;

    if (revealDelay <= 0) {
      setPanelDelayDone(true);
      return undefined;
    }

    setPanelDelayDone(false);

    const revealTimerId = window.setTimeout(() => {
      setPanelDelayDone(true);
    }, revealDelay);

    return () => {
      window.clearTimeout(revealTimerId);
    };
  }, [panelRevealDelayMs, property, propertyIndex, reduceMotion]);

  React.useEffect(() => {
    let active = true;

    if (!property || !qrUrl) {
      setQrReady(false);
      return () => {
        active = false;
      };
    }

    if (qrImageCache.has(qrUrl)) {
      setQrReady(true);
      return () => {
        active = false;
      };
    }

    setQrReady(false);

    preloadQrImage(qrUrl).then(() => {
      if (active) {
        // If preload fails, we still reveal the panel and let the image request happen in-place.
        setQrReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, [property, propertyIndex, qrUrl]);

  React.useEffect(() => {
    if (!property) {
      document.title = baseTitle;
      return;
    }

    utils.applyTheme(property.theme);
    document.title = companyName ? `${companyName} | ${property.title || property.name}` : property.title || property.name;
  }, [companyName, property, utils]);

  React.useEffect(() => {
    if (!property || !Array.isArray(property.media) || property.media.length === 0) {
      return;
    }

    const currentMedia = property.media[mediaIndex] || property.media[0];
    const nextMedia = property.media[(mediaIndex + 1) % property.media.length];
    const nextProperty = properties[(propertyIndex + 1) % properties.length];

    utils.preloadMedia(currentMedia);
    utils.preloadMedia(nextMedia);

    if (nextProperty && Array.isArray(nextProperty.media) && nextProperty.media.length > 0) {
      utils.preloadMedia(nextProperty.media[0]);
    }
  }, [mediaIndex, propertyIndex, property, properties.length, utils]);

  React.useEffect(() => {
    if (!property || !media) {
      return undefined;
    }

    let timerId = 0;

    const schedule = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        if (mediaIndex < property.media.length - 1) {
          setMediaIndex((value) => value + 1);
          return;
        }

        setPropertyIndex((value) => (value + 1) % properties.length);
        setMediaIndex(0);
      }, media.duration || defaultDurationMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        schedule();
        return;
      }

      window.clearTimeout(timerId);
    };

    schedule();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(timerId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [defaultDurationMs, media, mediaIndex, property, properties.length]);

  return create(
    "div",
    { className: "experience-shell kiosk-shell" },
    performanceMode ? null : create(BackgroundOrbs, { reduceMotion }),
    create(
      motion.div,
      {
        className: "stage-frame kiosk-frame",
        initial: reduceMotion || performanceMode ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.99 },
        animate: reduceMotion || performanceMode
          ? { opacity: 1 }
          : { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 90, damping: 18 } },
      },
      create(
        "div",
        { className: "media-stage-shell" },
        create("div", { className: "media-stage", style: reduceMotion ? undefined : { perspective: mediaPerspective } }, create(MediaStage, { property, media, reduceMotion, performanceMode })),
        create("div", { className: "media-stage__overlay" }),
        performanceMode ? null : create("div", { className: "media-stage__glow" })
      ),
      panelVisible ? create(PropertyPanel, { property, siteBaseUrl, qrUrl, utils, reduceMotion, performanceMode, panelVisual }) : null
    )
  );
}

function App({ utils, catalogSource, sanityConfig }) {
  const [catalog, setCatalog] = React.useState(null);
  const [screen, setScreen] = React.useState({
    title: "Conectando a Sanity",
    description: "Cargando inmuebles publicados.",
    details: "Si estas en local, usa npm run dev y agrega http://localhost:3000 como CORS origin en Sanity.",
  });

  React.useEffect(() => {
    let active = true;

    async function loadCatalog() {
      setScreen({
        title: "Conectando a Sanity",
        description: "Cargando inmuebles publicados.",
        details: "Si estas en local, usa npm run dev y agrega http://localhost:3000 como CORS origin en Sanity.",
      });

      if (!catalogSource || typeof catalogSource.loadCatalog !== "function") {
        if (!active) {
          return;
        }

        setCatalog(null);
        setScreen({
          title: "Falta el cargador de Sanity",
          description: "No se encontro el cliente de Sanity en el navegador.",
          details: "Verificá que el script UMD se cargue antes del front.",
        });
        return;
      }

      try {
        const loadedCatalog = await catalogSource.loadCatalog(sanityConfig);

        if (!active) {
          return;
        }

        setCatalog(loadedCatalog);

        if (isCatalogReady(loadedCatalog)) {
          return;
        }

        setScreen({
          title: loadedCatalog && loadedCatalog.state === "empty" ? "Sin inmuebles publicados" : loadedCatalog && loadedCatalog.state === "unconfigured" ? "Configura Sanity" : "Esperando datos",
          description: loadedCatalog && loadedCatalog.message ? loadedCatalog.message : "Completa la configuracion de Sanity y publica al menos un inmueble.",
          details: loadedCatalog && loadedCatalog.siteBaseUrl ? `Base de QR: ${loadedCatalog.siteBaseUrl}` : "",
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setCatalog(null);
        setScreen({
          title: "No se pudo conectar a Sanity",
          description: error instanceof Error ? error.message : "Revisá la configuración del proyecto y el acceso CORS.",
          details: "Vuelve a intentarlo después de corregir la conexión.",
        });
      }
    }

    loadCatalog();

    return () => {
      active = false;
    };
  }, [catalogSource, sanityConfig]);

  if (catalog && isCatalogReady(catalog)) {
    const configuredDurationMs = Number(sanityConfig.defaultDurationMs);
    const configuredPanelDelayMs = Number(sanityConfig.panelRevealDelayMs);

    return create(CatalogExperience, {
      key: catalogSignature(catalog),
      catalog,
      utils,
      siteBaseUrl: catalog.siteBaseUrl || sanityConfig.publicBaseUrl || "",
      defaultDurationMs: Number.isFinite(configuredDurationMs) && configuredDurationMs > 0 ? configuredDurationMs : 20000,
      performanceMode: sanityConfig.tvPerformanceMode !== false,
      panelRevealDelayMs: Number.isFinite(configuredPanelDelayMs) && configuredPanelDelayMs >= 0 ? configuredPanelDelayMs : 1000,
      dynamicPanelBlur: sanityConfig.panelDynamicBlur !== false,
    });
  }

  return create(StatusScreen, screen);
}

function startApp() {
  if (!rootElement) {
    return;
  }

  const utils = window.InmoUtils;
  const catalogSource = window.InmoCatalogSource;
  const sanityConfig = window.InmoSanityConfig || {};

  if (!utils || !catalogSource) {
    const root = createRoot(rootElement);

    root.render(
      create(StatusScreen, {
        title: "Faltan los scripts base",
        description: "No se encontro la capa de utilidades o el cargador de contenido.",
        details: "Verificá que src/utils/format.js y src/data/sanity.js se carguen antes del módulo principal.",
      })
    );

    return;
  }

  const root = createRoot(rootElement);

  root.render(
    create(LazyMotion, { features: domAnimation },
      create(
        MotionConfig,
        { reducedMotion: "user", transition: { duration: 0.24, ease: "easeOut" } },
      create(App, {
        utils,
        catalogSource,
        sanityConfig,
      })
      )
    )
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp, { once: true });
} else {
  startApp();
}