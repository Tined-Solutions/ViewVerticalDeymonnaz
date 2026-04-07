(function () {
  const utils = window.InmoUtils;
  const viewerFactory = window.InmoUI;
  const catalogSource = window.InmoCatalogSource;
  const sanityConfig = window.InmoSanityConfig || {};
  const root = document.getElementById("app");

  if (!utils || !viewerFactory || !root) {
    return;
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  let controller = null;
  let activeSignature = "";

  function destroyController(options = {}) {
    if (controller) {
      controller.destroy();
      controller = null;
    }

    if (options.resetSignature) {
      activeSignature = "";
    }
  }

  function renderStatus(title, description, details = "") {
    destroyController({ resetSignature: true });
    document.title = "Pantalla Inmobiliaria";
    root.innerHTML = `
      <div class="experience-shell">
        <div class="stage-frame flex h-full w-full items-center justify-center p-6">
          <div class="floating-card max-w-2xl px-8 py-10 text-center">
            <p class="section-kicker">Sanity</p>
            <h1 class="font-display mt-5 text-4xl uppercase tracking-[0.12em] text-white">${escapeHtml(title)}</h1>
            <p class="mx-auto mt-5 max-w-xl text-sm leading-7 text-white/70">${escapeHtml(description)}</p>
            ${details ? `<p class="mt-6 text-[10px] uppercase tracking-[0.4em] text-white/35">${escapeHtml(details)}</p>` : ""}
          </div>
        </div>
      </div>
    `;
  }

  function createController(catalog) {
    const viewer = viewerFactory.createViewer(root, catalog, utils, {
      siteBaseUrl: catalog.siteBaseUrl || sanityConfig.publicBaseUrl || "",
    });
    const state = {
      propertyIndex: resolveInitialPropertyIndex(catalog),
      mediaIndex: 0,
      timerId: 0,
    };

    function currentProperty() {
      return catalog.properties[state.propertyIndex];
    }

    function currentMedia() {
      const property = currentProperty();

      if (!property || !Array.isArray(property.media) || property.media.length === 0) {
        return null;
      }

      return property.media[state.mediaIndex] || property.media[0];
    }

    function clearTimer() {
      if (state.timerId) {
        window.clearTimeout(state.timerId);
        state.timerId = 0;
      }
    }

    function preloadUpcoming(property) {
      if (!property || !Array.isArray(property.media) || property.media.length === 0) {
        return;
      }

      const currentMedia = property.media[state.mediaIndex] || property.media[0];
      const nextMedia = property.media[(state.mediaIndex + 1) % property.media.length];
      const nextProperty = catalog.properties[(state.propertyIndex + 1) % catalog.properties.length];

      utils.preloadMedia(currentMedia);
      utils.preloadMedia(nextMedia);

      if (nextProperty && Array.isArray(nextProperty.media) && nextProperty.media.length > 0) {
        utils.preloadMedia(nextProperty.media[0]);
      }
    }

    function scheduleNext() {
      clearTimer();

      const media = currentMedia();

      if (!media) {
        return;
      }

      state.timerId = window.setTimeout(nextSlide, media.duration || 5000);
    }

    function renderCurrent() {
      const property = currentProperty();
      const media = currentMedia();

      if (!property || !media) {
        return;
      }

      viewer.renderFrame(property, media, state.mediaIndex === 0);
      preloadUpcoming(property);
      scheduleNext();
    }

    function nextSlide() {
      const property = currentProperty();

      if (!property || !Array.isArray(property.media) || property.media.length === 0) {
        return;
      }

      if (state.mediaIndex < property.media.length - 1) {
        state.mediaIndex += 1;
      } else {
        state.propertyIndex = (state.propertyIndex + 1) % catalog.properties.length;
        state.mediaIndex = 0;
      }

      renderCurrent();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        renderCurrent();
        return;
      }

      clearTimer();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return {
      start() {
        renderCurrent();
      },
      destroy() {
        clearTimer();
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      },
    };
  }

  function activateCatalog(catalog) {
    if (!isCatalogReady(catalog)) {
      destroyController({ resetSignature: true });

      const title = catalog && catalog.state === "empty" ? "Sin inmuebles publicados" : catalog && catalog.state === "unconfigured" ? "Configura Sanity" : "Esperando datos";
      const description = catalog && catalog.message ? catalog.message : "Completa la configuracion de Sanity y publica al menos un inmueble.";
      const details = catalog && catalog.siteBaseUrl ? `Base de QR: ${catalog.siteBaseUrl}` : "";

      renderStatus(title, description, details);
      return;
    }

    const signature = catalogSignature(catalog);

    if (signature === activeSignature) {
      return;
    }

    activeSignature = signature;
    destroyController();
    controller = createController(catalog);
    controller.start();
  }

  async function loadCatalog() {
    renderStatus(
      "Conectando a Sanity",
      "Cargando inmuebles publicados.",
      "Si estas en local, usa npm run dev y agrega http://localhost:3000 como CORS origin en Sanity."
    );

    if (!catalogSource || typeof catalogSource.loadCatalog !== "function") {
      renderStatus(
        "Falta el cargador de Sanity",
        "No se encontro el cliente de Sanity en el navegador.",
        "Verificá que el script UMD se cargue antes del front."
      );
      return;
    }

    try {
      const catalog = await catalogSource.loadCatalog(sanityConfig);
      activateCatalog(catalog);
    } catch (error) {
      renderStatus(
        "No se pudo conectar a Sanity",
        error instanceof Error ? error.message : "Revisá la configuración del proyecto y el acceso CORS.",
        "Vuelve a intentarlo después de corregir la conexión."
      );
    }
  }

  loadCatalog();
})();