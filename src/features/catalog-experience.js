import { React, create, motion, useReducedMotion } from "../runtime/react-motion.js";
import { baseTitle, deymonnazLogoSrc } from "../constants/ui.js";
import { buildQrUrl, resolveInitialPropertyIndex } from "../shared/catalog.js?v=20260411-03";
import { DEFAULT_MEDIA_VISUAL, buildPanelVisual, resolveImageVisual } from "../shared/media-visual.js?v=20260411-03";
import { hasQrImageCached, preloadQrImage } from "../shared/qr.js?v=20260411-03";
import { BackgroundOrbs } from "../ui/background-orbs.js?v=20260411-03";
import { MediaStage } from "../ui/media-stage.js?v=20260411-03";
import { PropertyPanel } from "../ui/property-panel.js?v=20260411-03";

function resolveMediaDurationMs(media, fallbackDurationMs) {
  const explicitDurationMs = Number(media && media.duration);

  if (Number.isFinite(explicitDurationMs) && explicitDurationMs > 0) {
    return explicitDurationMs;
  }

  return Number.isFinite(fallbackDurationMs) && fallbackDurationMs > 0 ? fallbackDurationMs : 20000;
}

export function CatalogExperience({ catalog, utils, siteBaseUrl, defaultDurationMs, performanceMode, panelRevealDelayMs, dynamicPanelBlur }) {
  const reduceMotion = Boolean(useReducedMotion());
  const properties = Array.isArray(catalog.properties) ? catalog.properties : [];
  const companyName = catalog.company?.name || "";
  const visualTheme = catalog && catalog.visualTheme && typeof catalog.visualTheme === "object" ? catalog.visualTheme : null;
  const [propertyIndex, setPropertyIndex] = React.useState(() => resolveInitialPropertyIndex(catalog));
  const [mediaIndex, setMediaIndex] = React.useState(0);
  const [mediaDurationMs, setMediaDurationMs] = React.useState(() => resolveMediaDurationMs(null, defaultDurationMs));
  const [panelDelayDone, setPanelDelayDone] = React.useState(() => Boolean(reduceMotion || performanceMode));
  const [qrReady, setQrReady] = React.useState(() => Boolean(reduceMotion || performanceMode));
  const [panelVisual, setPanelVisual] = React.useState(() => buildPanelVisual(DEFAULT_MEDIA_VISUAL, performanceMode));

  const property = properties[propertyIndex] || null;
  const media = property && Array.isArray(property.media) ? property.media[mediaIndex] || property.media[0] || null : null;
  const activeTheme = visualTheme || (property && property.theme) || null;
  const mediaPerspective = performanceMode ? "1650px" : "1450px";
  const qrUrl = property ? buildQrUrl(property, siteBaseUrl) : "";
  const isSinZocaloMedia = Boolean(media && media.zocaloVariant === "sin");
  const shouldShowZocaloPanel = Boolean(property && property.isConZocalo !== false && !isSinZocaloMedia);
  const panelVisible = shouldShowZocaloPanel && panelDelayDone && (reduceMotion || performanceMode || qrReady);

  React.useEffect(() => {
    setMediaDurationMs(resolveMediaDurationMs(media, defaultDurationMs));
  }, [defaultDurationMs, media && media.duration, media && media.src, media && media.type]);

  React.useEffect(() => {
    document.documentElement.classList.toggle("tv-performance-mode", Boolean(performanceMode));

    return () => {
      document.documentElement.classList.remove("tv-performance-mode");
    };
  }, [performanceMode]);

  React.useEffect(() => {
    let active = true;

    const defaultVisual = buildPanelVisual(DEFAULT_MEDIA_VISUAL, performanceMode);

    if (performanceMode || !dynamicPanelBlur) {
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

    resolveImageVisual(sampleSource, { performanceMode }).then((visual) => {
      if (!active) {
        return;
      }

      setPanelVisual(buildPanelVisual(visual, performanceMode));
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

    if (performanceMode) {
      setPanelDelayDone(true);
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

    if (!shouldShowZocaloPanel) {
      setQrReady(true);
      return () => {
        active = false;
      };
    }

    if (!property || !qrUrl) {
      setQrReady(false);
      return () => {
        active = false;
      };
    }

    if (performanceMode) {
      setQrReady(true);
      return () => {
        active = false;
      };
    }

    if (hasQrImageCached(qrUrl)) {
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
  }, [property, propertyIndex, qrUrl, shouldShowZocaloPanel]);

  React.useEffect(() => {
    const selectedTheme = visualTheme || (property && property.theme) || null;

    if (selectedTheme) {
      utils.applyTheme(selectedTheme);
    }

    if (!property) {
      document.title = baseTitle;
      return;
    }

    document.title = companyName ? `${companyName} | ${property.title || property.name}` : property.title || property.name;
  }, [companyName, property, utils, visualTheme]);

  React.useEffect(() => {
    if (!property || !Array.isArray(property.media) || property.media.length === 0) {
      return;
    }

    if (performanceMode) {
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
  }, [mediaIndex, performanceMode, propertyIndex, property, properties.length, utils]);

  React.useEffect(() => {
    if (!property || !media) {
      return undefined;
    }

    let timerId = 0;
    const slideDurationMs = resolveMediaDurationMs({ duration: mediaDurationMs }, defaultDurationMs);

    const schedule = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        if (mediaIndex < property.media.length - 1) {
          setMediaIndex((value) => value + 1);
          return;
        }

        setPropertyIndex((value) => (value + 1) % properties.length);
        setMediaIndex(0);
      }, slideDurationMs);
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
  }, [defaultDurationMs, media, mediaDurationMs, mediaIndex, property, properties.length]);

  const handleMediaDurationChange = (durationMs) => {
    if (!media || media.type !== "video") {
      return;
    }

    if (Number.isFinite(durationMs) && durationMs > 0) {
      setMediaDurationMs(durationMs);
    }
  };

  return create(
    "div",
    { className: "experience-shell kiosk-shell" },
    performanceMode ? null : create(BackgroundOrbs, { reduceMotion }),
    create(
      motion.div,
      {
        className: "stage-frame kiosk-frame transform-gpu will-change-[transform,opacity]",
        initial: reduceMotion || performanceMode ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.99 },
        animate: reduceMotion || performanceMode
          ? { opacity: 1 }
          : { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 90, damping: 18 } },
      },
      create(
        motion.div,
        {
          className: "tv-logo-fixed transform-gpu will-change-[transform,opacity]",
          initial: reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 },
          animate: reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut", delay: 0.05 } },
          layout: "position",
        },
        create("img", {
          src: deymonnazLogoSrc,
          alt: "Logo de Organización Deymonnaz",
          className: "tv-logo",
          loading: "eager",
          decoding: "async",
          draggable: false,
          referrerPolicy: "no-referrer",
        })
      ),
      create(
        "div",
        { className: "media-stage-shell" },
        create("div", { className: "media-stage", style: reduceMotion ? undefined : { perspective: mediaPerspective } }, create(MediaStage, { property, media, reduceMotion, performanceMode, onMediaDurationChange: handleMediaDurationChange })),
        shouldShowZocaloPanel ? create("div", { className: "media-stage__overlay" }) : null,
        performanceMode || !shouldShowZocaloPanel ? null : create("div", { className: "media-stage__glow" })
      ),
      panelVisible ? create(PropertyPanel, { property, siteBaseUrl, qrUrl, utils, reduceMotion, performanceMode, panelVisual, activeTheme }) : null
    )
  );
}
