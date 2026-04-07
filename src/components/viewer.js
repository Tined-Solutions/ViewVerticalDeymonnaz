(function () {
  const namespace = (window.InmoUI = window.InmoUI || {});

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildMetric(metric) {
    return `
      <div class="metric">
        <div class="metric-value">${escapeHtml(metric && metric.value)}</div>
        <div class="metric-label">${escapeHtml(metric && metric.label)}</div>
      </div>
    `;
  }

  function buildFeature(feature) {
    return `<span class="feature-pill">${escapeHtml(feature)}</span>`;
  }

  function createViewer(root, data, utils, options = {}) {
    const company = (data && data.company) || { name: "" };

    function buildPropertyUrl(property) {
      if (property && property.publishedUrl) {
        try {
          const configuredBase = String(options.siteBaseUrl || "").trim();
          const fallbackBase = configuredBase ? new URL(configuredBase, window.location.href) : new URL(window.location.href);
          const resolvedUrl = new URL(String(property.publishedUrl), fallbackBase);

          if (["http:", "https:"].includes(resolvedUrl.protocol)) {
            return resolvedUrl.toString();
          }
        } catch {
          // Fallback below uses the kiosk URL when the published link cannot be resolved.
        }
      }

      const configuredBase = String(options.siteBaseUrl || "").trim();
      const baseUrl = configuredBase ? new URL(configuredBase, window.location.href) : new URL(window.location.href);

      baseUrl.search = "";
      baseUrl.hash = "";
      baseUrl.searchParams.set("property", property.id);

      return baseUrl.toString();
    }

    root.innerHTML = `
      <div class="experience-shell kiosk-shell">
        <div class="stage-frame kiosk-frame">
          <div class="media-stage-shell">
            <div class="media-stage" data-media-stage></div>
            <div class="media-stage__overlay"></div>
            <div class="media-stage__glow"></div>
          </div>

          <section class="property-panel floating-card scroll-panel" data-property-panel>
            <div class="property-panel__head">
              <div class="property-panel__copy">
                <p class="property-panel__kicker" data-property-kicker></p>
                <h1 class="font-display property-panel__title" data-property-title></h1>
                <p class="property-panel__location" data-property-location></p>
              </div>

              <div class="property-panel__price-wrap">
                <div class="property-panel__price-copy">
                  <p class="property-panel__price" data-property-price></p>
                  <p class="property-panel__price-label">U$S</p>
                </div>
                <div class="property-panel__qr" data-property-qr role="img" aria-label="Codigo QR del inmueble"></div>
              </div>
            </div>

            <p class="property-panel__summary" data-property-summary></p>

            <div class="property-panel__body">
              <div class="property-panel__metrics" data-property-metrics></div>
              <div class="property-panel__features" data-property-features></div>
            </div>
          </section>
        </div>
      </div>
    `;

    const refs = {
      panel: root.querySelector("[data-property-panel]"),
      mediaStage: root.querySelector("[data-media-stage]"),
      propertyKicker: root.querySelector("[data-property-kicker]"),
      propertyTitle: root.querySelector("[data-property-title]"),
      propertyLocation: root.querySelector("[data-property-location]"),
      propertyPrice: root.querySelector("[data-property-price]"),
      propertySummary: root.querySelector("[data-property-summary]"),
      propertyFeatures: root.querySelector("[data-property-features]"),
      propertyMetrics: root.querySelector("[data-property-metrics]"),
      propertyQr: root.querySelector("[data-property-qr]"),
    };

    function pulsePanel() {
      refs.panel.classList.remove("is-refreshing");
      void refs.panel.offsetWidth;
      refs.panel.classList.add("is-refreshing");
    }

    function renderPropertyDetails(property, isPropertyStart) {
      const kickerText = [property.type, property.badge].filter(Boolean).join(" · ");
      const features = Array.isArray(property.features) ? property.features : [];
      const metrics = Array.isArray(property.metrics) ? property.metrics : [];
      const hasPrice = Number.isFinite(property.price) && property.price > 0;

      refs.propertyKicker.textContent = kickerText;
      refs.propertyTitle.textContent = property.name || "";
      refs.propertyLocation.textContent = property.location || "";
      refs.propertyPrice.textContent = hasPrice ? utils.formatPrice(property.price) : "-";
      refs.propertySummary.textContent = property.summary || "";
      refs.propertyFeatures.innerHTML = features.map(buildFeature).join("");
      refs.propertyMetrics.innerHTML = metrics.map(buildMetric).join("");

      if (isPropertyStart) {
        pulsePanel();
      }
    }

    function renderPropertyQr(property) {
      const propertyUrl = buildPropertyUrl(property);

      refs.propertyQr.innerHTML = "";
      refs.propertyQr.dataset.link = propertyUrl;
      refs.propertyQr.setAttribute("aria-label", `Codigo QR del inmueble ${property.name}`);

      const image = document.createElement("img");
      image.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(propertyUrl)}`;
      image.alt = `Codigo QR para abrir ${property.name}`;
      image.loading = "eager";
      image.decoding = "async";
      image.draggable = false;

      image.addEventListener("error", () => {
        refs.propertyQr.innerHTML = '<span class="property-panel__qr-fallback">QR</span>';
      });

      refs.propertyQr.appendChild(image);
    }

    function renderStageMedia(property, media) {
      if (!media) {
        return;
      }

      const activeMedia = refs.mediaStage.querySelector(".media-stage__item.is-active");

      if (activeMedia) {
        activeMedia.classList.remove("is-active");
        activeMedia.classList.add("is-leaving");

        window.setTimeout(() => {
          activeMedia.remove();
        }, 1000);
      }

      const wrapper = document.createElement("div");
      wrapper.className = "media-stage__item media-entering";

      const image = document.createElement("img");
      image.src = media.src;
      image.alt = media.caption ? `${property.name} - ${media.caption}` : property.name;
      image.loading = "eager";
      image.decoding = "async";
      image.draggable = false;
      image.addEventListener("error", () => {
        if (!wrapper.dataset.fallbackShown) {
          wrapper.dataset.fallbackShown = "1";
          wrapper.innerHTML = `
            <div class="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(0,0,0,0.35))] p-8 text-center">
              <div>
                <p class="text-[10px] uppercase tracking-[0.4em] text-white/45">Media no disponible</p>
                <p class="mt-3 text-xl font-semibold text-white">${escapeHtml(media.caption || property.name)}</p>
              </div>
            </div>
          `;
        }
      });

      wrapper.appendChild(image);
      refs.mediaStage.appendChild(wrapper);

      window.requestAnimationFrame(() => {
        wrapper.classList.remove("media-entering");
        wrapper.classList.add("is-active");
      });
    }

    function renderFrame(property, media, isPropertyStart = false) {
      utils.applyTheme(property.theme);
      refs.panel.style.setProperty("--panel-accent", property.theme?.primary || "#00833b");
      refs.panel.dataset.propertyId = property.id;
      refs.propertyTitle.textContent = property.name;
      document.title = company.name ? `${company.name} | ${property.name}` : property.name;

      renderPropertyDetails(property, isPropertyStart);
      renderPropertyQr(property);
      renderStageMedia(property, media);
    }

    return {
      renderFrame,
    };
  }

  namespace.createViewer = createViewer;
})();