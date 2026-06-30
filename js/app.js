(function () {
  const products = window.CATALOG.products;
  const categories = window.CATALOG.categories;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => (root || document).querySelectorAll(sel);

  let activeCategory = 'all';
  let activeManufacturer = 'all';
  let searchQuery = '';
  let gridView = true;

  const manufacturers = [...new Set(products.map((p) => p.manufacturer))];

  function isModel3D(product) {
    return !!(product && product.model3d);
  }

  function isSpin360(product) {
    return !!(product && product.spin360);
  }

  function getProductBadge(product) {
    if (isSpin360(product)) return '360°';
    if (isModel3D(product)) return '3D';
    return '2D';
  }

  function getDocumentation(product) {
    return product?.documentation || [];
  }

  function getManuals(product) {
    return product?.manuals || [];
  }

  function getDocItemCount(product) {
    return getDocumentation(product).length + getManuals(product).length;
  }

  function hasDocumentation(product) {
    return getDocItemCount(product) > 0;
  }

  const DOC_PLACEHOLDER = 'assets/images/placeholder-front.svg';

  function getMarkers(product, view) {
    if (window.MarkerStore) return window.MarkerStore.getMarkers(product, view);
    if (isModel3D(product) || isSpin360(product)) return product.markers?.features || [];
    return product.markers?.[view] || [];
  }

  function getAllProductMarkers(product) {
    if (isModel3D(product) || isSpin360(product)) return getMarkers(product, 'features');
    return [...getMarkers(product, 'front'), ...getMarkers(product, 'back')];
  }

  function getSearchableText(product) {
    const markerText = getAllProductMarkers(product)
      .flatMap((m) => [m.label, m.type, m.desc, m.id])
      .join(' ');
    return [
      product.name,
      product.manufacturer,
      product.category,
      product.tagline,
      product.description,
      ...product.highlights,
      markerText,
      ...getDocumentation(product).map((d) => [d.title, d.caption].join(' ')),
      ...getManuals(product).map((m) => [m.title, m.caption].join(' ')),
    ]
      .join(' ')
      .toLowerCase();
  }

  function renderCardPreview(product) {
    const markers = getAllProductMarkers(product);
    const previewImg =
      product.previewImage || getDocumentation(product)[0]?.src || (isModel3D(product) ? null : product.images?.front);

    if (previewImg) {
      return `
        <div class="card-preview card-preview--image" style="--accent: ${product.accent}">
          <img src="${previewImg}" alt="${product.name}" loading="lazy" onerror="this.onerror=null;this.src='${DOC_PLACEHOLDER}'" />
          <span class="card-preview__badge">${getProductBadge(product)}</span>
          <span class="card-preview__count">${markers.length} puntos</span>
        </div>`;
    }

    return `
      <div class="card-preview card-preview--placeholder" style="--accent: ${product.accent}">
        <span class="card-preview__icon">◎</span>
        <span class="card-preview__badge">${isSpin360(product) ? 'Vista 360°' : isModel3D(product) ? 'Modelo 3D' : 'Señalización'}</span>
        <span class="card-preview__count">${markers.length} componentes</span>
      </div>`;
  }

  function renderProductView(product, view, options) {
    if (isSpin360(product)) return renderSpin360View(product, options);
    if (isModel3D(product)) return renderModel3DView(product, options);
    return renderAnnotatedView(product, view || 'front', options);
  }

  function isFileProtocol() {
    return location.protocol === 'file:';
  }

  function getModelLoadErrorMessage(product) {
    return `No se pudo cargar <strong>${product.name}</strong>. Verifica <code>${product.model3d}</code> y recarga con Ctrl+F5.`;
  }

  function showModelLoadError(placeholder, message) {
    if (!placeholder) return;
    placeholder.innerHTML = `<p class="model-viewer-placeholder__error">${message}</p>`;
    placeholder.classList.remove('hidden');
  }

  function showFileProtocolBanner() {
    if (!isFileProtocol() || $('#fileProtocolBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'fileProtocolBanner';
    banner.className = 'file-protocol-banner';
    banner.innerHTML =
      'Los modelos 3D no cargan con <code>file://</code>. Ejecuta <strong>INICIAR.bat</strong> y abre <a href="http://localhost:5500">http://localhost:5500</a>.';
    document.body.prepend(banner);
  }

  function activateDeferredModel(container, product) {
    const mv = $('.model-viewer[data-deferred-src]', container);
    if (!mv || mv.dataset.loaded === '1') return;
    const placeholder = $('.model-viewer-placeholder', container);

    if (isFileProtocol()) {
      showModelLoadError(
        placeholder,
        'Los modelos 3D requieren servidor HTTP. Ejecuta <strong>INICIAR.bat</strong> y abre <strong>http://localhost:5500</strong>.'
      );
      return;
    }

    const startLoad = () => {
      mv.addEventListener(
        'load',
        () => {
          placeholder?.classList.add('hidden');
          mv.classList.remove('model-viewer--deferred');
          mv.style.opacity = '1';
        },
        { once: true }
      );
      mv.addEventListener(
        'error',
        () => {
          showModelLoadError(placeholder, getModelLoadErrorMessage(product));
          mv.classList.add('hidden');
        },
        { once: true }
      );
      mv.src = mv.dataset.deferredSrc;
      mv.dataset.loaded = '1';
      bindModelViewerMarkers(container, product);
    };

    const ready = window.__modelViewerReady || customElements.whenDefined('model-viewer');
    Promise.resolve(ready).then(startLoad).catch(() => {
      showModelLoadError(placeholder, 'No se pudo cargar el visor 3D (model-viewer).');
    });
  }

  /* ── Vista 3D (GLB) ── */
  function renderModel3DView(product, options) {
    const opts = options || {};
    const compact = !!opts.compact;
    const deferLoad = !!opts.deferLoad;
    const training = !!opts.training;
    const hidePanelActions = !!opts.hidePanelActions;
    const markers = getMarkers(product, 'features');
    const mvId = `mv-${product.id}${compact ? '-c' : ''}-${Math.random().toString(36).slice(2, 7)}`;

    return `
      <div class="signal-view signal-view--3d ${compact ? 'signal-view--compact' : ''} ${training ? 'signal-view--training' : ''}" data-view="3d" data-product="${product.id}" data-mode="3d" ${training ? 'data-show-all-markers="1"' : ''}>
        <div class="signal-view__toolbar">
          <div class="signal-view__tabs">
            <span class="signal-tab signal-tab--3d is-active">Vista 3D</span>
            <span class="model-badge">◎ Modelo GLB</span>
          </div>
          ${
            hidePanelActions
              ? ''
              : `<div class="signal-view__actions">
            <div class="signal-view__presets">${renderCatalogPresets()}</div>
            <button type="button" class="signal-toggle is-on" data-action="toggle-markers">
              <span class="signal-toggle__icon">◎</span> Señalización
            </button>
            <button type="button" class="signal-toggle" data-action="toggle-all-markers" title="Mostrar puntos de todas las caras">
              <span class="signal-toggle__icon">◉</span> Todas las caras
            </button>
            <button type="button" class="signal-toggle is-on" data-action="toggle-rotate">
              <span class="signal-toggle__icon">↻</span> Auto rotar
            </button>
          </div>`
          }
        </div>
        <div class="signal-view__layout">
          <div class="signal-stage signal-stage--3d">
            ${
              deferLoad
                ? `<div class="model-viewer-placeholder" data-load-3d="${product.id}">
              <span class="model-viewer-placeholder__spinner"></span>
              <p>Cargando modelo 3D…</p>
            </div>`
                : ''
            }
            <model-viewer
              id="${mvId}"
              class="model-viewer ${deferLoad ? 'model-viewer--deferred' : ''}"
              ${deferLoad ? `data-deferred-src="${product.model3d}"` : `src="${product.model3d}"`}
              alt="${product.name}"
              camera-controls
              touch-action="pan-y"
              auto-rotate
              shadow-intensity="1"
              exposure="1"
              environment-image="neutral"
              interaction-prompt="none"
              loading="lazy"
            ></model-viewer>
            <div class="signal-stage__markers is-visible" data-markers-layer></div>
            <div class="signal-stage__hint">${training ? 'Haz click en el marcador correcto' : 'Arrastra para rotar · Los puntos siguen al modelo 3D'}</div>
          </div>
          ${
            hidePanelActions
              ? ''
              : `<aside class="signal-panel">
            <div class="signal-panel__header">
              <h3>Señalización ${product.name}</h3>
              <p>Componentes señalizados del producto</p>
            </div>
            <div class="signal-info">${renderSignalInfoEmpty()}</div>
            <div class="signal-list">${renderSignalList(markers)}</div>
          </aside>`
          }
        </div>
      </div>`;
  }

  function renderSpin360View(product, options) {
    const opts = options || {};
    const compact = !!opts.compact;
    const training = !!opts.training;
    const hidePanelActions = !!opts.hidePanelActions;
    const markers = getMarkers(product, 'features');
    const cfg = product.spin360;
    const startU = cfg.uStart ?? 0;
    const startV = cfg.vStart ?? 0;
    const startImg = window.Spin360Viewer
      ? window.Spin360Viewer.imagePath(cfg, startU, startV)
      : `${cfg.folder}/${startV}_${startU}.jpg`;

    return `
      <div class="signal-view signal-view--spin360 ${compact ? 'signal-view--compact' : ''} ${training ? 'signal-view--training' : ''}" data-view="360" data-product="${product.id}" data-mode="spin360" ${training ? 'data-show-all-markers="1"' : ''}>
        <div class="signal-view__toolbar">
          <div class="signal-view__tabs">
            <span class="signal-tab signal-tab--360 is-active">Vista 360°</span>
            <span class="model-badge">↻ ${cfg.uCount}×${cfg.vCount} fotos</span>
          </div>
          ${
            hidePanelActions
              ? ''
              : `<div class="signal-view__actions">
            <button type="button" class="signal-toggle is-on" data-action="toggle-markers">
              <span class="signal-toggle__icon">◎</span> Señalización
            </button>
            <button type="button" class="signal-toggle" data-action="toggle-all-markers" title="Mostrar puntos de todos los ángulos">
              <span class="signal-toggle__icon">◉</span> Todos los ángulos
            </button>
          </div>`
          }
        </div>
        <div class="signal-view__layout">
          <div class="signal-stage signal-stage--spin360 spin360-stage">
            <div class="spin360-stage__viewport">
              <img class="spin360-stage__img" src="${startImg}" alt="${product.name}" draggable="false" />
            </div>
            <div class="signal-stage__markers is-visible" data-markers-layer>${renderMarkersLayer(markers)}</div>
            <div class="signal-stage__hint">${training ? 'Haz click en el marcador correcto' : 'Arrastra horizontal para girar · vertical para inclinar'}</div>
          </div>
          ${
            hidePanelActions
              ? ''
              : `<aside class="signal-panel">
            <div class="signal-panel__header">
              <h3>Señalización ${product.name}</h3>
              <p>Componentes señalizados del producto</p>
            </div>
            <div class="signal-info">${renderSignalInfoEmpty()}</div>
            <div class="signal-list">${renderSignalList(markers)}</div>
          </aside>`
          }
        </div>
      </div>`;
  }

  function bindSpin360View(container, product) {
    if (!container || !isSpin360(product) || !window.Spin360Viewer) return;
    if (container.dataset.spin360Bound) return;
    container.dataset.spin360Bound = '1';

    const cfg = product.spin360;
    const refreshMarkers = () => updateSpin360MarkerVisibility(container, product);

    window.Spin360Viewer.init(container, cfg, {
      onFrameChange: refreshMarkers,
    });
    refreshMarkers();
  }

  function updateSpin360MarkerVisibility(container, product) {
    if (!container || !isSpin360(product) || !window.Spin360Viewer) return;
    const api = window.Spin360Viewer.getInstance(container);
    if (!api) return;

    const frame = api.getFrame();
    const showAll = container.dataset.showAllMarkers === '1';
    $$('.marker', container).forEach((el) => {
      const marker = getMarker(product, '360', el.dataset.markerId);
      const visible = showAll || window.Spin360Viewer.framesSimilar(marker, frame);
      el.classList.toggle('marker--other-face', !visible);
    });
  }

  function focusSpin360Marker(container, marker) {
    if (!container || !marker || !window.Spin360Viewer) return;
    const api = window.Spin360Viewer.getInstance(container);
    if (!api || marker.uIndex == null) return;
    api.setFrame(marker.uIndex, marker.vIndex ?? api.getFrame().v);
    updateSpin360MarkerVisibility(container, products.find((p) => p.id === container.dataset.product));
  }

  function renderCatalogPresets() {
    if (!window.MarkerStore) return '';
    return window.MarkerStore.CAMERA_PRESETS.map(
      (preset) =>
        `<button type="button" class="view-preset view-preset--compact" data-preset-orbit="${preset.orbit}" title="Vista ${preset.label}">${preset.label}</button>`
    ).join('');
  }

  function getManualBadge(src) {
    const ext = String(src || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'PDF';
    if (ext === 'skp') return 'SKP';
    return ext ? ext.toUpperCase() : 'DOC';
  }

  function isPdfManual(src) {
    return String(src || '').toLowerCase().endsWith('.pdf');
  }

  /* ── Documentación fotográfica ── */
  function renderManualCards(manuals) {
    if (!manuals.length) return '';

    return `
      <div class="doc-manuals">
        <h4 class="doc-section__title">Manuales y archivos</h4>
        <div class="doc-manuals__grid">
          ${manuals
            .map(
              (manual) => `
            <article class="doc-manual">
              <button
                type="button"
                class="doc-manual__open"
                data-manual-src="${manual.src}"
                data-manual-title="${manual.title}"
                aria-label="Abrir ${manual.title}"
              >
                <span class="doc-manual__icon">${getManualBadge(manual.src)}</span>
                <span class="doc-manual__meta">
                  <strong>${manual.title}</strong>
                  <small>${manual.caption}${manual.language ? ` · ${manual.language}` : ''}</small>
                </span>
              </button>
              <a class="doc-manual__download" href="${manual.src}" ${manual.external ? 'target="_blank" rel="noopener"' : 'download target="_blank" rel="noopener"'}>${manual.external ? 'Abrir en web' : 'Descargar'}</a>
            </article>`
            )
            .join('')}
        </div>
      </div>`;
  }

  function renderDocumentationView(product, options) {
    const compact = !!(options && options.compact);
    const docs = getDocumentation(product);
    const manuals = getManuals(product);

    if (!docs.length && !manuals.length) {
      return `
        <div class="doc-view ${compact ? 'doc-view--compact' : ''}">
          <div class="doc-view__empty">
            <span class="doc-view__empty-icon">📷</span>
            <p>Sin documentación disponible</p>
            <small>Agrega imágenes en <code>assets/images/${product.id}/</code></small>
          </div>
        </div>`;
    }

    return `
      <div class="doc-view ${compact ? 'doc-view--compact' : ''}" data-product="${product.id}">
        <div class="doc-view__header">
          <h3>Documentación</h3>
          <p>Manuales, fotos de referencia e instalación</p>
        </div>
        ${renderManualCards(manuals)}
        ${
          docs.length
            ? `
        <div class="doc-gallery-wrap">
          <h4 class="doc-section__title">Fotografías</h4>
          <div class="doc-gallery">
            ${docs
              .map(
                (doc) => `
              <figure class="doc-photo">
                <button type="button" class="doc-photo__frame" data-doc-src="${doc.src}" data-doc-title="${doc.title}" aria-label="Ampliar ${doc.title}">
                  <img
                    src="${doc.src}"
                    alt="${doc.title}"
                    loading="lazy"
                    onerror="this.onerror=null;this.src='${DOC_PLACEHOLDER}'"
                  />
                </button>
                <figcaption class="doc-photo__caption">
                  <strong>${doc.title}</strong>
                  <span>${doc.caption}</span>
                </figcaption>
              </figure>`
              )
              .join('')}
          </div>
        </div>`
            : ''
        }
      </div>`;
  }

  function renderDetailViews(product) {
    const showDocs = hasDocumentation(product);

    return `
      <div class="detail__views" data-product="${product.id}">
        ${
          showDocs
            ? `
        <div class="detail__tabs">
          <button type="button" class="detail-tab is-active" data-detail-tab="signal">Señalización</button>
          <button type="button" class="detail-tab" data-detail-tab="docs">Documentación <span class="detail-tab__count">${getDocItemCount(product)}</span></button>
        </div>`
            : ''
        }
        <div class="detail__panel detail__panel--signal is-active">
          ${renderProductView(product, 'front', { compact: false, deferLoad: isModel3D(product) })}
        </div>
        ${
          showDocs
            ? `
        <div class="detail__panel detail__panel--docs">
          ${renderDocumentationView(product, { compact: false })}
        </div>`
            : ''
        }
      </div>`;
  }

  function bindDetailTabs(container, product) {
    if (!container || container.dataset.tabsBound) return;
    container.dataset.tabsBound = '1';

    container.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-detail-tab]');
      if (!tab) return;

      const target = tab.dataset.detailTab;
      $$('.detail-tab', container).forEach((t) => t.classList.toggle('is-active', t.dataset.detailTab === target));
      $$('.detail__panel', container).forEach((p) => {
        p.classList.toggle('is-active', p.classList.contains(`detail__panel--${target}`));
      });
    });

    bindDocumentationView(container, product);
    const signalView = $('.detail__panel--signal .signal-view', container);
    bindSignalView(signalView, product);
    if (isModel3D(product)) activateDeferredModel(signalView, product);
  }

  function bindDocumentationView(container, product) {
    const docView = $('.doc-view', container);
    if (!docView || docView.dataset.bound) return;
    docView.dataset.bound = '1';

    docView.addEventListener('click', (e) => {
      const manualBtn = e.target.closest('.doc-manual__open');
      if (manualBtn) {
        const src = manualBtn.dataset.manualSrc;
        const manual = getManuals(product).find((m) => m.src === src);
        if (manual?.external || String(src).startsWith('http')) {
          window.open(src, '_blank', 'noopener');
          return;
        }
        if (isPdfManual(src)) {
          const viewer = $('#pdfViewer');
          const frame = $('#pdfViewerFrame');
          const title = $('#pdfViewerTitle');
          if (!viewer || !frame) return;
          frame.src = src;
          if (title) title.textContent = manualBtn.dataset.manualTitle || 'Manual';
          viewer.showModal();
        } else {
          window.open(src, '_blank', 'noopener');
        }
        return;
      }

      const frame = e.target.closest('.doc-photo__frame');
      if (!frame) return;

      const lightbox = $('#docLightbox');
      const img = $('#docLightboxImg');
      const caption = $('#docLightboxCaption');
      if (!lightbox || !img) return;

      img.src = frame.dataset.docSrc;
      img.alt = frame.dataset.docTitle || '';
      if (caption) caption.textContent = frame.dataset.docTitle || '';
      lightbox.showModal();
    });
  }

  /* ── Vista señalizada 2D ── */
  function renderMarkersLayer(markers) {
    return markers
      .map(
        (m) => `
        <button type="button" class="marker" data-marker-id="${m.id}" style="left:${m.x}%;top:${m.y}%" aria-label="${m.label}: ${m.type}">
          <span class="marker__ring"></span>
          <span class="marker__dot"></span>
          <span class="marker__label">${m.label}</span>
        </button>`
      )
      .join('');
  }

  function renderSignalList(markers) {
    return markers
      .map(
        (m) => `
        <button type="button" class="signal-item" data-marker-id="${m.id}">
          <span class="signal-item__dot"></span>
          <span class="signal-item__text">
            <strong>${m.label}</strong>
            <small>${m.type}</small>
          </span>
        </button>`
      )
      .join('');
  }

  function renderSignalInfoEmpty() {
    return `
      <div class="signal-info__empty">
        <span class="signal-info__icon">◎</span>
        <p>Ningún puerto seleccionado</p>
        <small>Activa la señalización y elige un marcador</small>
      </div>`;
  }

  function renderAnnotatedView(product, view, options) {
    const opts = options || {};
    const compact = !!opts.compact;
    const markers = (product.markers && product.markers[view]) || [];
    const imgSrc = `${product.images[view]}?v=2`;

    return `
      <div class="signal-view ${compact ? 'signal-view--compact' : ''}" data-view="${view}" data-product="${product.id}">
        <div class="signal-view__toolbar">
          <div class="signal-view__tabs">
            <button type="button" class="signal-tab ${view === 'front' ? 'is-active' : ''}" data-switch="front">Frontal</button>
            <button type="button" class="signal-tab ${view === 'back' ? 'is-active' : ''}" data-switch="back">Trasera</button>
          </div>
          <button type="button" class="signal-toggle is-on" data-action="toggle-markers" title="Mostrar/ocultar señalización">
            <span class="signal-toggle__icon">◎</span> Señalización
          </button>
        </div>

        <div class="signal-view__layout">
          <div class="signal-stage">
            <img class="signal-stage__img" src="${imgSrc}" alt="${product.name} - ${view === 'front' ? 'Frontal' : 'Trasera'}" />
            <div class="signal-stage__markers is-visible">${renderMarkersLayer(markers)}</div>
            <div class="signal-stage__hint">Click en un marcador para señalizar el puerto</div>
          </div>

          <aside class="signal-panel">
            <div class="signal-panel__header">
              <h3>Señalización de puertos</h3>
              <p>Selecciona un punto en la imagen o en la lista</p>
            </div>
            <div class="signal-info">${renderSignalInfoEmpty()}</div>
            <div class="signal-list">${renderSignalList(markers)}</div>
          </aside>
        </div>
      </div>`;
  }

  function getMarker(product, view, id) {
    return getMarkers(product, view).find((m) => m.id === id);
  }

  function syncModelHotspots(container, product) {
    const mv = $('.model-viewer', container);
    if (!mv || !window.Marker3D) return;

    let markers = getMarkers(product, 'features');
    if (mv.modelIsVisible) {
      markers = window.Marker3D.ensureAllAnchors(mv, markers);
    }

    const layer = $('[data-markers-layer]', container) || $('.signal-stage__markers', container);
    const showAll = container.dataset.showAllMarkers === '1';
    const has3d = markers.some((m) => window.Marker3D.hasAnchor(m));

    if (has3d) {
      if (layer) layer.innerHTML = '';
      window.Marker3D.renderHotspots(mv, markers, {
        showAll: true,
        onClick: (id) => selectMarker(container, product, '3d', id),
      });
    } else if (layer) {
      window.Marker3D.clearHotspots(mv);
      layer.innerHTML = renderMarkersLayer(markers);
      window.Marker3D.syncOverlayVisibility(container, markers, mv, showAll);
    }
  }

  function focusModelMarker(container, marker) {
    const mv = $('.model-viewer', container);
    if (!mv || !marker) return;
    if (window.Marker3D?.hasAnchor(marker)) {
      mv.autoRotate = false;
      const rotateBtn = $('[data-action="toggle-rotate"]', container);
      if (rotateBtn) rotateBtn.classList.remove('is-on');
      return;
    }
    if (marker.orbit && window.MarkerStore) {
      window.MarkerStore.applyOrbitToModelViewer(mv, marker.orbit);
    }
    mv.autoRotate = false;
    const rotateBtn = $('[data-action="toggle-rotate"]', container);
    if (rotateBtn) rotateBtn.classList.remove('is-on');
    updateModelMarkerVisibility(container, mv);
  }

  function updateModelMarkerVisibility(container, mv) {
    if (!container || !mv || !window.MarkerStore) return;
    const productId = container.dataset.product;
    const product = products.find((p) => p.id === productId);
    if (!product || !isModel3D(product)) return;

    const markers = getMarkers(product, 'features');
    if (markers.some((m) => window.Marker3D?.hasAnchor(m))) return;

    const showAll = container.dataset.showAllMarkers === '1';
    const currentOrbit = window.MarkerStore.getOrbitFromModelViewer(mv);
    $$('.marker', container).forEach((el) => {
      const marker = getMarker(product, '3d', el.dataset.markerId);
      const visible = showAll || !marker?.orbit || window.MarkerStore.orbitsSimilar(currentOrbit, marker.orbit);
      el.classList.toggle('marker--other-face', !visible);
    });
  }

  function bindModelViewerMarkers(container, product) {
    const mv = $('.model-viewer', container);
    if (!mv || !isModel3D(product)) return;

    const refresh = () => syncModelHotspots(container, product);
    const onReady = () => {
      if (container.closest('.detail') && window.MarkerStore && !container.dataset.cameraInit) {
        container.dataset.cameraInit = '1';
        mv.autoRotate = false;
        const rotateBtn = $('[data-action="toggle-rotate"]', container);
        if (rotateBtn) rotateBtn.classList.remove('is-on');
      }
      refresh();
    };

    mv.addEventListener('camera-change', () => {
      updateModelMarkerVisibility(container, mv);
    });
    mv.addEventListener('load', onReady);
    if (mv.src && mv.dataset.loaded === '1') onReady();
    else refresh();
  }

  function selectMarker(container, product, view, markerId) {
    const marker = getMarker(product, view, markerId);
    if (!marker) return;

    $$('.marker', container).forEach((el) => {
      el.classList.toggle('is-active', el.dataset.markerId === markerId);
    });
    $$('.signal-item', container).forEach((el) => {
      el.classList.toggle('is-active', el.dataset.markerId === markerId);
    });

    const viewLabel =
      view === '3d' ? 'Vista 3D' : view === '360' ? 'Vista 360°' : view === 'front' ? 'Frontal' : 'Trasera';
    const info = $('.signal-info', container);
    if (info) {
      info.innerHTML = `
        <div class="signal-info__active">
          <span class="signal-info__badge">${viewLabel}</span>
          <h4>${marker.label}</h4>
          <p class="signal-info__type">${marker.type}</p>
          <p class="signal-info__desc">${marker.desc}</p>
        </div>`;
    }

    if (isSpin360(product)) focusSpin360Marker(container, marker);
    else if (isModel3D(product)) focusModelMarker(container, marker);
  }

  function switchSignalView(container, product, newView) {
    if (isModel3D(product) || isSpin360(product)) return;
    const markers = getMarkers(product, newView);
    const markersVisible = $('.signal-stage__markers', container)?.classList.contains('is-visible');

    container.dataset.view = newView;

    const img = $('.signal-stage__img', container);
    img.src = `${product.images[newView]}?v=2`;
    img.alt = `${product.name} - ${newView === 'front' ? 'Frontal' : 'Trasera'}`;

    $$('.signal-tab', container).forEach((t) => {
      t.classList.toggle('is-active', t.dataset.switch === newView);
    });

    const layer = $('.signal-stage__markers', container);
    layer.innerHTML = renderMarkersLayer(markers);
    layer.classList.toggle('is-visible', markersVisible);

    $('.signal-list', container).innerHTML = renderSignalList(markers);
    $('.signal-info', container).innerHTML = renderSignalInfoEmpty();
  }

  function bindSignalView(container, product, options) {
    if (!container || container.dataset.bound) return;
    container.dataset.bound = '1';
    const opts = options || {};

    container.addEventListener('click', (e) => {
      const markerBtn = e.target.closest('.marker,[data-marker-hotspot]');
      if (markerBtn) {
        e.stopPropagation();
        if (opts.training && opts.onMarkerClick) {
          opts.onMarkerClick(markerBtn.dataset.markerId);
          return;
        }
        selectMarker(container, product, container.dataset.view, markerBtn.dataset.markerId);
        return;
      }

      const listBtn = e.target.closest('.signal-item');
      if (listBtn) {
        e.stopPropagation();
        if (opts.training) return;
        selectMarker(container, product, container.dataset.view, listBtn.dataset.markerId);
        return;
      }

      const tab = e.target.closest('.signal-tab[data-switch]');
      if (tab) {
        e.stopPropagation();
        const newView = tab.dataset.switch;
        if (newView !== container.dataset.view) {
          switchSignalView(container, product, newView);
        }
        return;
      }

      const rotateBtn = e.target.closest('[data-action="toggle-rotate"]');
      if (rotateBtn) {
        e.stopPropagation();
        const mv = $('.model-viewer', container);
        if (!mv) return;
        const on = rotateBtn.classList.toggle('is-on');
        mv.autoRotate = on;
        return;
      }

      const allMarkersBtn = e.target.closest('[data-action="toggle-all-markers"]');
      if (allMarkersBtn) {
        e.stopPropagation();
        const on = allMarkersBtn.classList.toggle('is-on');
        container.dataset.showAllMarkers = on ? '1' : '0';
        if (isSpin360(product)) updateSpin360MarkerVisibility(container, product);
        else syncModelHotspots(container, product);
        return;
      }

      const presetBtn = e.target.closest('[data-preset-orbit]');
      if (presetBtn && container.contains(presetBtn)) {
        e.stopPropagation();
        const mv = $('.model-viewer', container);
        if (!mv || !window.MarkerStore) return;
        window.MarkerStore.applyOrbitToModelViewer(mv, presetBtn.dataset.presetOrbit);
        mv.autoRotate = false;
        const rotateToggle = $('[data-action="toggle-rotate"]', container);
        if (rotateToggle) rotateToggle.classList.remove('is-on');
        $$('[data-preset-orbit]', container).forEach((b) => b.classList.toggle('is-active', b === presetBtn));
        syncModelHotspots(container, product);
        return;
      }

      const toggle = e.target.closest('[data-action="toggle-markers"]');
      if (toggle) {
        e.stopPropagation();
        const layer = $('.signal-stage__markers', container);
        const on = toggle.classList.toggle('is-on');
        layer?.classList.toggle('is-visible', on);
        toggle.innerHTML = on
          ? '<span class="signal-toggle__icon">◎</span> Señalización'
          : '<span class="signal-toggle__icon">○</span> Señalización';
      }
    });

    if (isSpin360(product)) bindSpin360View(container, product);
    else if (!opts.training) bindModelViewerMarkers(container, product);
    else if (isModel3D(product)) {
      $$('.marker', container).forEach((el) => el.classList.remove('marker--other-face'));
    }
  }

  /* ── Catálogo ── */
  function productCard(p, index) {
    return `
      <article class="product-card reveal" data-product="${p.id}" style="--accent: ${p.accent}; --reveal-delay: ${index * 0.1}s">
        <div class="product-card__header">
          <span class="product-card__category">${p.category}</span>
          <span class="product-card__brand">${p.manufacturer}</span>
        </div>
        <div class="product-card__signal">
          ${renderCardPreview(p)}
        </div>
        <div class="product-card__body">
          <h2 class="product-card__name">${p.name}</h2>
          <p class="product-card__tagline">${p.tagline}</p>
          <div class="product-card__tags">
            ${p.highlights.slice(0, 3).map((h) => `<span class="tag">${h}</span>`).join('')}
          </div>
        </div>
        <div class="product-card__actions">
          <button type="button" class="btn btn--sm btn--primary btn-open-detail">Explorar señalización</button>
        </div>
      </article>`;
  }

  function setProductUrl(id) {
    const url = new URL(window.location.href);
    url.searchParams.set('product', id);
    history.replaceState({ productId: id }, '', url);
  }

  function clearProductUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('product');
    history.replaceState({}, '', url.pathname + url.hash);
  }

  async function copyProductLink(id) {
    const url = new URL(window.location.href);
    url.searchParams.set('product', id);
    try {
      await navigator.clipboard.writeText(url.toString());
      showAppToast('Enlace copiado al portapapeles');
    } catch {
      prompt('Copia este enlace:', url.toString());
    }
  }

  function showAppToast(message) {
    let toast = $('#appToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appToast';
      toast.className = 'app-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showAppToast._t);
    showAppToast._t = setTimeout(() => toast.classList.remove('is-visible'), 2400);
  }

  function openProductModal(id) {
    const p = products.find((x) => x.id === id);
    if (!p) return;

    const content = $('#modalContent');
    const markerCount = getAllProductMarkers(p).length;
    content.innerHTML = `
      <div class="detail" style="--accent: ${p.accent}">
        <div class="detail__header">
          <div>
            <span class="detail__category">${p.category}</span>
            <h2 class="detail__name">${p.name}</h2>
            <p class="detail__manufacturer">${p.manufacturer}</p>
          </div>
          <div class="detail__header-actions">
            <button type="button" class="btn btn--sm btn-share-link" data-product-id="${p.id}">Compartir</button>
            ${markerCount >= 2 ? `<button type="button" class="btn btn--sm btn-training" data-product-id="${p.id}">Capacitación</button>` : ''}
            <button type="button" class="btn btn--sm btn-open-editor" data-product-id="${p.id}">Editar puntos</button>
          </div>
        </div>
        <p class="detail__desc">${p.description}</p>
        <div class="detail__highlights">
          ${p.highlights.map((h) => `<span class="tag tag--accent">${h}</span>`).join('')}
        </div>
        ${renderDetailViews(p)}
      </div>`;

    bindDetailTabs($('.detail__views', content), p);

    $('.btn-open-editor', content)?.addEventListener('click', () => {
      $('#productModal').close();
      window.MarkerEditor?.open(p.id);
    });

    $('.btn-share-link', content)?.addEventListener('click', () => copyProductLink(p.id));
    $('.btn-training', content)?.addEventListener('click', () => {
      $('#productModal').close();
      window.TrainingMode?.open(p.id);
    });

    setProductUrl(p.id);
    $('#productModal').showModal();
  }

  function renderCatalog() {
    const filtered = products.filter((p) => {
      const matchCategory = activeCategory === 'all' || p.category === activeCategory;
      const matchManufacturer = activeManufacturer === 'all' || p.manufacturer === activeManufacturer;
      const searchable = getSearchableText(p);
      return matchCategory && matchManufacturer && (!searchQuery || searchable.includes(searchQuery));
    });

    const grid = $('#catalogGrid');
    const empty = $('#emptyState');

    if (filtered.length === 0) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');
    grid.innerHTML = filtered.map((p, i) => productCard(p, i)).join('');

    grid.querySelectorAll('.product-card').forEach((card) => {
      const product = products.find((p) => p.id === card.dataset.product);

      $('.btn-open-detail', card)?.addEventListener('click', (e) => {
        e.stopPropagation();
        openProductModal(product.id);
      });

      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-open-detail')) return;
        openProductModal(product.id);
      });
    });

    $$('.reveal', grid).forEach((el, i) => {
      setTimeout(() => el.classList.add('is-visible'), 80 + i * 100);
    });
  }

  function renderManufacturerFilters() {
    const container = $('#manufacturerFilters');
    if (!container) return;
    const chips = [{ id: 'all', label: 'Todos los fabricantes' }, ...manufacturers.map((m) => ({ id: m, label: m }))];
    container.innerHTML = chips
      .map((c) => `<button type="button" class="chip chip--manufacturer ${c.id === activeManufacturer ? 'chip--active' : ''}" data-manufacturer="${c.id}">${c.label}</button>`)
      .join('');

    container.querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeManufacturer = btn.dataset.manufacturer;
        container.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip--active'));
        btn.classList.add('chip--active');
        renderCatalog();
      });
    });
  }

  function renderCategoryFilters() {
    const container = $('#categoryFilters');
    const chips = [{ id: 'all', label: 'Todos' }, ...categories.map((c) => ({ id: c, label: c }))];
    container.innerHTML = chips
      .map((c) => `<button type="button" class="chip ${c.id === activeCategory ? 'chip--active' : ''}" data-category="${c.id}">${c.label}</button>`)
      .join('');

    container.querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.category;
        container.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip--active'));
        btn.classList.add('chip--active');
        renderCatalog();
      });
    });
  }

  function initHeroSignal() {
    const hero = $('#heroSignal');
    if (!hero || !products[0]) return;
    hero.innerHTML = renderCardPreview(products[0]);
  }

  function handleDeepLink() {
    const id = new URLSearchParams(window.location.search).get('product');
    if (id && products.some((p) => p.id === id)) {
      setTimeout(() => openProductModal(id), 350);
    }
  }

  function openEditorWithPicker() {
    if (window.MarkerEditor?.openPicker) {
      window.MarkerEditor.openPicker();
      return;
    }
    window.MarkerEditor?.open(products[0]?.id);
  }

  function bindEvents() {
    $('#searchInput').addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      renderCatalog();
    });

    $('#viewToggle')?.addEventListener('click', () => {
      gridView = !gridView;
      $('#catalogGrid').classList.toggle('catalog__grid--list', !gridView);
    });

    $$('[data-close]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const dialog = el.closest('dialog');
        if (dialog?.open) dialog.close();
      });
    });

    $('#productModal')?.addEventListener('click', (e) => {
      if (e.target === $('#productModal')) $('#productModal').close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const modal = $('#productModal');
      if (modal?.open) modal.close();
    });

    $('#openEditorBtn')?.addEventListener('click', openEditorWithPicker);

    $('#docLightbox')?.addEventListener('close', () => {
      const img = $('#docLightboxImg');
      if (img) img.src = '';
    });

    $('#pdfViewer')?.addEventListener('close', () => {
      const frame = $('#pdfViewerFrame');
      if (frame) frame.src = '';
    });

    $('#productModal').addEventListener('close', () => {
      $('#modalContent').innerHTML = '';
      clearProductUrl();
    });

    window.addEventListener('catalog:markers-updated', () => {
      renderCatalog();
      initHeroSignal();
    });
  }

  function init() {
    showFileProtocolBanner();
    renderCategoryFilters();
    renderManufacturerFilters();
    renderCatalog();
    initHeroSignal();
    bindEvents();
    const countEl = $('#productCount');
    if (countEl) countEl.textContent = products.length;
    handleDeepLink();
  }

  window.CatalogApp = {
    renderProductView,
    bindSignalView,
    activateDeferredModel,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
