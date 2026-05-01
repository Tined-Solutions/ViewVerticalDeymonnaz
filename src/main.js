import { React, createRoot, LazyMotion, MotionConfig, create, domAnimation } from "./runtime/react-motion.js";
import { CatalogExperience } from "./features/catalog-experience.js?v=20260411-03";
import { StatusScreen } from "./ui/status-screen.js?v=20260411-03";
import { catalogSignature, isCatalogReady } from "./shared/catalog.js?v=20260411-03";

const rootElement = document.getElementById("app");

const DAILY_RELOAD_HOUR = 3;
const DAILY_RELOAD_MINUTE = 0;
let dailyReloadScheduled = false;

function scheduleDailyReload(hour = DAILY_RELOAD_HOUR, minute = DAILY_RELOAD_MINUTE) {
  if (typeof window === "undefined") {
    return;
  }

  if (dailyReloadScheduled) {
    return;
  }

  dailyReloadScheduled = true;

  const scheduleNext = () => {
    const now = new Date();
    const next = new Date();
    next.setHours(hour, minute, 0, 0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    const delayMs = next.getTime() - now.getTime();

    window.setTimeout(() => {
      try {
        window.location.reload(true);
      } catch {
        window.location.reload();
      }

      scheduleNext();
    }, delayMs);
  };

  scheduleNext();
}

if (typeof window !== "undefined") {
  window.InmoScheduleDailyReload = scheduleDailyReload;
}

function App({ utils, catalogSource, sanityConfig }) {
  const [catalog, setCatalog] = React.useState(null);
  const lastCatalogSignatureRef = React.useRef("");
  const pollingBusyRef = React.useRef(false);
  const [screen, setScreen] = React.useState({
    title: "Conectando a Sanity",
    description: "Cargando inmuebles publicados.",
    details: "Si estas en local, usa npm run dev y agrega http://localhost:3000 como CORS origin en Sanity.",
  });

  React.useEffect(() => {
    let active = true;
    let unsubscribeCallback = null;
    let pollIntervalId = null;

    const applyCatalogUpdate = (nextCatalog) => {
      if (!active || !nextCatalog) {
        return;
      }

      if (isCatalogReady(nextCatalog)) {
        const nextSignature = catalogSignature(nextCatalog);

        if (nextSignature && nextSignature === lastCatalogSignatureRef.current) {
          return;
        }

        lastCatalogSignatureRef.current = nextSignature;
      } else {
        lastCatalogSignatureRef.current = "";
      }

      if (nextCatalog.visualTheme) {
        utils.applyTheme(nextCatalog.visualTheme);
      }

      setCatalog(nextCatalog);

      if (!isCatalogReady(nextCatalog)) {
        setScreen({
          title: nextCatalog.state === "empty" ? "Sin inmuebles publicados" : nextCatalog.state === "unconfigured" ? "Configura Sanity" : "Esperando datos",
          description: nextCatalog.message ? nextCatalog.message : "Completa la configuracion de Sanity y publica al menos un inmueble.",
          details: nextCatalog.siteBaseUrl ? `Base de QR: ${nextCatalog.siteBaseUrl}` : "",
        });
      }
    };

    const pollCatalog = async () => {
      if (!active || pollingBusyRef.current || !catalogSource || typeof catalogSource.loadCatalog !== "function") {
        return;
      }

      pollingBusyRef.current = true;

      try {
        const latestCatalog = await catalogSource.loadCatalog(sanityConfig);
        applyCatalogUpdate(latestCatalog);
      } catch (error) {
        console.error("Error al refrescar catálogo por polling:", error);
      } finally {
        pollingBusyRef.current = false;
      }
    };

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
          details: "Verifica que el script UMD se cargue antes del front.",
        });
        return;
      }

      try {
        const loadedCatalog = await catalogSource.loadCatalog(sanityConfig);

        if (!active) {
          return;
        }

        applyCatalogUpdate(loadedCatalog);
        
        if (typeof catalogSource.listenCatalog === "function") {
          unsubscribeCallback = catalogSource.listenCatalog(sanityConfig, (updatedCatalog) => {
            applyCatalogUpdate(updatedCatalog);
          });
        }

        const configuredIntervalMs = Number(sanityConfig.liveRefreshIntervalMs);
        const refreshIntervalMs = Number.isFinite(configuredIntervalMs) && configuredIntervalMs >= 1000 ? configuredIntervalMs : 2500;

        pollIntervalId = window.setInterval(() => {
          void pollCatalog();
        }, refreshIntervalMs);

        const handleVisibilityChange = () => {
          if (document.visibilityState === "visible") {
            void pollCatalog();
          }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        const previousCleanup = unsubscribeCallback;
        unsubscribeCallback = () => {
          if (typeof previousCleanup === "function") {
            previousCleanup();
          }

          document.removeEventListener("visibilitychange", handleVisibilityChange);
        };

      } catch (error) {
        if (!active) {
          return;
        }

        setCatalog(null);
        setScreen({
          title: "No se pudo conectar a Sanity",
          description: error instanceof Error ? error.message : "Revisa la configuracion del proyecto y el acceso CORS.",
          details: "Vuelve a intentarlo despues de corregir la conexion.",
        });
      }
    }

    loadCatalog();

    return () => {
      active = false;
      if (pollIntervalId) {
        window.clearInterval(pollIntervalId);
      }

      if (unsubscribeCallback) {
        unsubscribeCallback();
      }
    };
  }, [catalogSource, sanityConfig, utils]);

  const performanceMode = sanityConfig.tvPerformanceMode !== false;

  if (catalog && isCatalogReady(catalog)) {
    const configuredDurationMs = Number(sanityConfig.defaultDurationMs);
    const configuredPanelDelayMs = Number(sanityConfig.panelRevealDelayMs);

    return create(CatalogExperience, {
      key: catalogSignature(catalog),
      catalog,
      utils,
      siteBaseUrl: catalog.siteBaseUrl || sanityConfig.publicBaseUrl || "",
      defaultDurationMs: Number.isFinite(configuredDurationMs) && configuredDurationMs > 0 ? configuredDurationMs : 20000,
      performanceMode,
      panelRevealDelayMs: Number.isFinite(configuredPanelDelayMs) && configuredPanelDelayMs >= 0 ? configuredPanelDelayMs : 1000,
      dynamicPanelBlur: sanityConfig.panelDynamicBlur !== false,
    });
  }

  return create(StatusScreen, {
    ...screen,
    performanceMode,
  });
}

function startApp() {
  if (!rootElement) {
    return;
  }

  scheduleDailyReload();

  const utils = window.InmoUtils;
  const catalogSource = window.InmoCatalogSource;
  const sanityConfig = window.InmoSanityConfig || {};
  const performanceMode = sanityConfig.tvPerformanceMode !== false;

  if (!utils || !catalogSource) {
    const root = createRoot(rootElement);

    root.render(
      create(StatusScreen, {
        title: "Faltan los scripts base",
        description: "No se encontro la capa de utilidades o el cargador de contenido.",
        details: "Verifica que src/utils/format.js y src/data/sanity.js se carguen antes del modulo principal.",
        performanceMode,
      })
    );

    return;
  }

  const root = createRoot(rootElement);

  root.render(
    create(LazyMotion, { features: domAnimation },
      create(
        MotionConfig,
        {
          reducedMotion: "user",
          transition: {
            duration: 0.24,
            ease: "easeOut",
            layout: { type: "spring", stiffness: 170, damping: 24, mass: 0.82 },
          },
        },
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
