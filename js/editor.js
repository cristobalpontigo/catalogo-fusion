(function () {
  const products = window.CATALOG.products;
  const store = window.MarkerStore;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => (root || document).querySelectorAll(sel);

  let currentProduct = null;
  let currentView = 'front';
  let drafts = {};
  let selectedId = null;
  let addMode = false;
  let dirty = false;
  let dragState = null;
  let clickPlaceMode = false;
  let showAllMarkers = false;
  let orbitTolerance = 38;
  let undoStack = [];
  const MAX_UNDO = 40;

  function pushUndo() {
    undoStack.push(JSON.stringify(drafts));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    updateUndoButton();
  }

  function undoLastChange() {
    if (!undoStack.length) return;
    drafts = JSON.parse(undoStack.pop());
    selectedId = null;
    setDirty(true);
    renderEditorBody();
    showToast('Cambio deshecho');
    updateUndoButton();
  }

  function updateUndoButton() {
    const btn = $('#editorUndo');
    if (btn) btn.disabled = undoStack.length === 0;
  }

  function snapshotBeforeChange() {
    pushUndo();
  }

  function renderCameraPresets(prefix) {
    return store.CAMERA_PRESETS.map(
      (preset) =>
        `<button type="button" class="view-preset" data-preset-orbit="${preset.orbit}" data-preset-label="${preset.label}">${preset.label}</button>`
    ).join('');
  }

  function is3DProduct() {
    return store.isModel3D(currentProduct);
  }

  function isSpin360Product() {
    return store.isSpin360(currentProduct);
  }

  function getEditorSpin360Root() {
    return $('.editor-stage.spin360-stage');
  }

  function getSpin360Instance() {
    const root = getEditorSpin360Root();
    return root && window.Spin360Viewer ? window.Spin360Viewer.getInstance(root) : null;
  }

  function getCurrentFrame() {
    const api = getSpin360Instance();
    return api ? api.getFrame() : { u: 0, v: 0 };
  }

  function updateEditorFrameLive() {
    const live = $('#editorFrameLive');
    if (!live || !isSpin360Product()) return;
    const frame = getCurrentFrame();
    live.textContent = `Ángulo: u=${frame.u} · v=${frame.v}`;
    updateViewBadge();
  }

  function updateEditorMarkerVisibility() {
    if (isSpin360Product()) {
      const frame = getCurrentFrame();
      $$('.editor-markers .marker').forEach((el) => {
        const marker = getCurrentMarkers().find((m) => m.id === el.dataset.markerId);
        const visible =
          showAllMarkers || window.Spin360Viewer?.framesSimilar(marker, frame) !== false;
        el.classList.toggle('marker--other-face', !visible);
      });
      updateViewBadge();
      updateMarkerListHeader();
      return;
    }

    if (!is3DProduct()) return;
    const currentOrbit = getCurrentOrbitString();
    $$('.editor-markers .marker').forEach((el) => {
      const marker = getCurrentMarkers().find((m) => m.id === el.dataset.markerId);
      const visible =
        showAllMarkers || !marker?.orbit || store.orbitsSimilar(currentOrbit, marker.orbit, orbitTolerance);
      el.classList.toggle('marker--other-face', !visible);
    });
    updateViewBadge();
    updateMarkerListHeader();
  }

  function updateViewBadge() {
    const badge = $('#editorViewBadge');
    if (!badge) return;

    if (isSpin360Product()) {
      const frame = getCurrentFrame();
      const visibleCount = window.MarkerStore
        ? window.MarkerStore.filterMarkersByFrame(getCurrentMarkers(), frame).length
        : getCurrentMarkers().length;
      badge.textContent = `Frame: u=${frame.u} v=${frame.v} · ${visibleCount} punto(s) visible(s)`;
      return;
    }

    if (!is3DProduct()) return;
    const label = store.getViewLabel(getCurrentOrbitString());
    const visibleCount = store.filterMarkersByOrbit(getCurrentMarkers(), getCurrentOrbitString(), orbitTolerance).length;
    badge.textContent = `Vista: ${label} · ${visibleCount} punto(s) visible(s)`;
  }

  function updateMarkerListHeader() {
    const header = $('#editorMarkerListHeader');
    if (!header) return;
    const total = getCurrentMarkers().length;

    if (isSpin360Product()) {
      const frame = getCurrentFrame();
      const visible = window.MarkerStore
        ? window.MarkerStore.filterMarkersByFrame(getCurrentMarkers(), frame).length
        : total;
      header.textContent = `En este ángulo: ${visible} · Total: ${total}`;
      return;
    }

    if (!is3DProduct()) {
      header.textContent = `Puntos (${total})`;
      return;
    }
    const visible = store.filterMarkersByOrbit(getCurrentMarkers(), getCurrentOrbitString(), orbitTolerance).length;
    header.textContent = `En esta vista: ${visible} · Total: ${total}`;
  }

  function getEditorModelViewer() {
    return $('.editor-model-viewer');
  }

  function getCurrentOrbitString() {
    return store.getOrbitFromModelViewer(getEditorModelViewer());
  }

  function applyOrbitToEditor(orbitStr) {
    store.applyOrbitToModelViewer(getEditorModelViewer(), orbitStr);
    updateEditorOrbitLive();
    updateEditorMarkerVisibility();
  }

  function updateEditorOrbitLive() {
    const live = $('#editorOrbitLive');
    if (!live || !is3DProduct()) return;
    const orbit = getCurrentOrbitString();
    live.textContent = orbit || '—';
    updateViewBadge();
  }

  function updateEditorHint() {
    const hint = $('.editor-stage .signal-stage__hint');
    if (!hint) return;
    if (isSpin360Product()) {
      hint.textContent = 'Arrastra para girar · Coloca puntos · Guarda el ángulo de cada marcador';
      return;
    }
    if (is3DProduct()) {
      hint.textContent = 'Elige vista · Rota libre · Coloca con Centro o Click · Arrastra para ajustar';
      return;
    }
    hint.textContent = addMode
      ? 'Click en la imagen para colocar un punto'
      : 'Arrastra un punto o selecciónalo para editar';
  }

  function toggleAddModeControl() {
    const addBtn = $('#editorAddMode');
    if (!addBtn) return;
    if (is3DProduct()) {
      addBtn.classList.add('hidden');
      return;
    }
    addBtn.classList.remove('hidden');
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function slugify(text) {
    return (
      String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'punto'
    );
  }

  function uniqueId(base, markers) {
    let id = slugify(base);
    let i = 1;
    while (markers.some((m) => m.id === id)) {
      id = `${slugify(base)}-${i++}`;
    }
    return id;
  }

  function getViewKey() {
    return store.getViewKey(currentProduct, currentView);
  }

  function getCurrentMarkers() {
    const key = getViewKey();
    if (!drafts[key]) {
      drafts[key] = store.getMarkers(currentProduct, currentView);
    }
    return drafts[key];
  }

  function setDirty(value) {
    dirty = value;
    const badge = $('#editorDirty');
    if (badge) badge.classList.toggle('hidden', !dirty);
  }

  function getSelectedMarker() {
    return getCurrentMarkers().find((m) => m.id === selectedId) || null;
  }

  function readNumberInput(value, fallback) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function commitMarkerPositionsFromDom() {
    $$('.editor-markers .marker').forEach((btn) => {
      const id = btn.dataset.markerId;
      const markers = getCurrentMarkers();
      const index = markers.findIndex((m) => m.id === id);
      if (index === -1) return;

      const x = parseFloat(btn.style.left);
      const y = parseFloat(btn.style.top);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      markers[index] = {
        ...markers[index],
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
      };
    });
  }

  function commit3DAnchorsFromEditor() {
    const mv = getEditorModelViewer();
    if (!mv || !window.Marker3D) return;

    const key = getViewKey();
    const markers = getCurrentMarkers().map((marker) => {
      if (window.Marker3D.hasAnchor(marker)) return { ...marker };
      return window.Marker3D.ensureMarkerAnchor(mv, marker);
    });
    drafts[key] = markers;
  }

  function syncEditorHotspots() {
    const mv = getEditorModelViewer();
    if (!mv || !window.Marker3D) return;

    const markers = getCurrentMarkers();
    window.Marker3D.renderHotspots(mv, markers, {
      editable: true,
      selectedId,
      showAll: showAllMarkers,
      onClick: (id) => selectMarker(id),
    });

    const layer = $('.editor-markers');
    if (layer) layer.innerHTML = '';
  }

  function flushPendingEdits() {
    if (isSpin360Product()) {
      commitMarkerPositionsFromDom();
      const marker = getSelectedMarker();
      if (marker) {
        const index = getCurrentMarkers().findIndex((m) => m.id === marker.id);
        if (index !== -1) {
          getCurrentMarkers()[index] = {
            ...getCurrentMarkers()[index],
            label: $('#editorLabel')?.value.trim() || marker.label,
            type: $('#editorType')?.value.trim() || marker.type,
            desc: $('#editorDesc')?.value.trim() || '',
            x: readNumberInput($('#editorX')?.value, marker.x),
            y: readNumberInput($('#editorY')?.value, marker.y),
            uIndex: readNumberInput($('#editorUIndex')?.value, marker.uIndex),
            vIndex: readNumberInput($('#editorVIndex')?.value, marker.vIndex),
          };
        }
      }
      return;
    }

    if (is3DProduct()) {
      commitMarkerPositionsFromDom();
      const marker = getSelectedMarker();
      if (marker) {
        const index = getCurrentMarkers().findIndex((m) => m.id === marker.id);
        if (index !== -1) {
          getCurrentMarkers()[index] = {
            ...getCurrentMarkers()[index],
            label: $('#editorLabel')?.value.trim() || marker.label,
            type: $('#editorType')?.value.trim() || marker.type,
            desc: $('#editorDesc')?.value.trim() || '',
            x: readNumberInput($('#editorX')?.value, marker.x),
            y: readNumberInput($('#editorY')?.value, marker.y),
            orbit: $('#editorOrbit')?.value.trim() || marker.orbit || getCurrentOrbitString() || '',
          };
        }
      }
      commit3DAnchorsFromEditor();
      syncEditorHotspots();
      return;
    }

    commitMarkerPositionsFromDom();

    const marker = getSelectedMarker();
    if (!marker) return;

    const markers = getCurrentMarkers();
    const index = markers.findIndex((m) => m.id === marker.id);
    if (index === -1) return;

    const patch = {
      label: $('#editorLabel')?.value.trim() || marker.label,
      type: $('#editorType')?.value.trim() || marker.type,
      desc: $('#editorDesc')?.value.trim() || '',
      x: readNumberInput($('#editorX')?.value, markers[index].x),
      y: readNumberInput($('#editorY')?.value, markers[index].y),
    };

    if (is3DProduct()) {
      const orbitInput = $('#editorOrbit')?.value.trim();
      patch.orbit = orbitInput || getCurrentOrbitString() || markers[index].orbit || '';
    }

    markers[index] = { ...markers[index], ...patch };
  }

  function renderMarkerButtons(markers, editable) {
    return markers
      .map(
        (m) => `
        <button
          type="button"
          class="marker ${editable ? 'marker--editable' : ''} ${m.id === selectedId ? 'is-active' : ''}"
          data-marker-id="${m.id}"
          style="left:${m.x}%;top:${m.y}%"
          aria-label="${m.label}: ${m.type}"
        >
          <span class="marker__ring"></span>
          <span class="marker__dot"></span>
          <span class="marker__label">${m.label}</span>
        </button>`
      )
      .join('');
  }

  function renderEditorStage() {
    if (!currentProduct) return '';

    const markers = getCurrentMarkers();
    const viewKey = getViewKey();

    if (store.isModel3D(currentProduct)) {
      const mvId = `editor-mv-${currentProduct.id}`;
      return `
        <div class="editor-stage signal-stage signal-stage--3d" data-view-key="${viewKey}">
          <div class="editor-stage-tools">
            <div class="editor-stage-tools__group">
              <span class="editor-stage-tools__label">Vistas</span>
              <div class="view-presets">${renderCameraPresets('editor')}</div>
            </div>
            <div class="editor-stage-tools__group editor-stage-tools__group--actions">
              <button type="button" class="btn btn--sm btn--primary" id="editorPlaceAtView">+ Centro</button>
              <button type="button" class="btn btn--sm" id="editorClickPlace">Click para colocar</button>
              <button type="button" class="btn btn--sm" id="editorGoToMarkerView">Ir al punto</button>
              <button type="button" class="btn btn--sm" id="editorCaptureOrbitToolbar">Guardar ángulo</button>
              <label class="editor-toggle-all">
                <input type="checkbox" id="editorShowAllMarkers" ${showAllMarkers ? 'checked' : ''} />
                Ver todos
              </label>
            </div>
            <div class="editor-stage-tools__meta">
              <span class="editor-view-badge" id="editorViewBadge">Vista: —</span>
              <span class="editor-orbit-live" id="editorOrbitLive">—</span>
            </div>
          </div>
          <div class="editor-stage__viewport">
            <model-viewer
              id="${mvId}"
              class="model-viewer editor-model-viewer"
              src="${currentProduct.model3d}"
              alt="${currentProduct.name}"
              camera-controls
              touch-action="pan-y"
              shadow-intensity="1"
              exposure="1"
              environment-image="neutral"
              interaction-prompt="none"
            ></model-viewer>
            <div class="editor-crosshair" aria-hidden="true"></div>
            <div class="signal-stage__markers editor-markers is-visible">${renderMarkerButtons(markers, true)}</div>
          </div>
          <div class="signal-stage__hint">Elige vista · Rota libre · Coloca con Centro o Click · Arrastra para ajustar</div>
        </div>`;
    }

    if (store.isSpin360(currentProduct)) {
      const cfg = currentProduct.spin360;
      const startImg = window.Spin360Viewer
        ? window.Spin360Viewer.imagePath(cfg, cfg.uStart ?? 0, cfg.vStart ?? 0)
        : `${cfg.folder}/${cfg.vStart ?? 0}_${cfg.uStart ?? 0}.jpg`;
      return `
        <div class="editor-stage signal-stage signal-stage--spin360 spin360-stage" data-view-key="${viewKey}">
          <div class="editor-stage-tools">
            <div class="editor-stage-tools__group editor-stage-tools__group--actions">
              <button type="button" class="btn btn--sm btn--primary" id="editorPlaceAtView">+ Centro</button>
              <button type="button" class="btn btn--sm" id="editorCaptureFrameToolbar">Guardar ángulo</button>
              <button type="button" class="btn btn--sm" id="editorGoToMarkerView">Ir al ángulo</button>
              <label class="editor-toggle-all">
                <input type="checkbox" id="editorShowAllMarkers" ${showAllMarkers ? 'checked' : ''} />
                Ver todos
              </label>
            </div>
            <div class="editor-stage-tools__meta">
              <span class="editor-view-badge" id="editorViewBadge">Frame: —</span>
              <span class="editor-orbit-live" id="editorFrameLive">—</span>
            </div>
          </div>
          <div class="editor-stage__viewport spin360-stage__viewport">
            <img class="spin360-stage__img" src="${startImg}" alt="${currentProduct.name}" draggable="false" />
            <div class="signal-stage__markers editor-markers is-visible">${renderMarkerButtons(markers, true)}</div>
          </div>
          <div class="signal-stage__hint">Arrastra para girar · Coloca puntos · Guarda el ángulo de cada marcador</div>
        </div>`;
    }

    const imgSrc = `${currentProduct.images[currentView]}?v=2`;
    return `
      <div class="editor-stage signal-stage" data-view-key="${viewKey}">
        <img class="signal-stage__img" src="${imgSrc}" alt="${currentProduct.name} - ${currentView}" />
        <div class="signal-stage__markers editor-markers is-visible">${renderMarkerButtons(markers, true)}</div>
        <div class="signal-stage__hint">${addMode ? 'Click en la imagen para colocar un punto' : 'Arrastra un punto o selecciónalo para editar'}</div>
      </div>`;
  }

  function renderMarkerForm() {
    const marker = getSelectedMarker();
    if (!marker) {
      return `
        <div class="editor-form__empty">
          <span>◎</span>
          <p>Ningún punto seleccionado</p>
          <small>${is3DProduct() ? 'Rota el modelo, pulsa "Colocar en esta vista" y arrastra el punto' : isSpin360Product() ? 'Gira el producto, coloca el punto y guarda el ángulo' : 'Activa "Agregar punto" y haz click en la imagen'}</small>
        </div>`;
    }

    const is3d = store.isModel3D(currentProduct);
    const isSpin = store.isSpin360(currentProduct);
    return `
      <form class="editor-form" id="editorMarkerForm">
        <div class="editor-form__row">
          <label for="editorLabel">Nombre</label>
          <input id="editorLabel" name="label" type="text" value="${escapeAttr(marker.label)}" required />
        </div>
        <div class="editor-form__row">
          <label for="editorType">Tipo</label>
          <input id="editorType" name="type" type="text" value="${escapeAttr(marker.type)}" />
        </div>
        <div class="editor-form__row">
          <label for="editorDesc">Descripción</label>
          <textarea id="editorDesc" name="desc" rows="4">${escapeHtml(marker.desc)}</textarea>
        </div>
        <div class="editor-form__grid">
          <div class="editor-form__row">
            <label for="editorX">Posición X (%)</label>
            <input id="editorX" name="x" type="number" min="0" max="100" step="0.1" value="${marker.x}" />
          </div>
          <div class="editor-form__row">
            <label for="editorY">Posición Y (%)</label>
            <input id="editorY" name="y" type="number" min="0" max="100" step="0.1" value="${marker.y}" />
          </div>
        </div>
        ${
          isSpin
            ? `
        <div class="editor-form__grid">
          <div class="editor-form__row">
            <label for="editorUIndex">Índice horizontal (u)</label>
            <input id="editorUIndex" name="uIndex" type="number" min="0" max="${currentProduct.spin360.uCount - 1}" step="1" value="${marker.uIndex ?? ''}" />
          </div>
          <div class="editor-form__row">
            <label for="editorVIndex">Índice vertical (v)</label>
            <input id="editorVIndex" name="vIndex" type="number" min="0" max="${currentProduct.spin360.vCount - 1}" step="1" value="${marker.vIndex ?? ''}" />
          </div>
        </div>
        <div class="editor-form__row">
          <button type="button" class="btn btn--sm" id="editorCaptureFrame">Guardar ángulo actual</button>
        </div>`
            : is3d
            ? `
        <div class="editor-form__row">
          <label for="editorOrbit">Ángulo cámara 3D</label>
          <div class="editor-form__orbit">
            <input id="editorOrbit" name="orbit" type="text" value="${escapeAttr(marker.orbit || '')}" placeholder="0deg 75deg 110%" />
            <button type="button" class="btn btn--sm" id="editorCaptureOrbit">Capturar ángulo</button>
          </div>
        </div>`
            : ''
        }
        <div class="editor-form__actions">
          <button type="button" class="btn btn--sm" id="editorDuplicateMarker">Duplicar</button>
          <button type="button" class="btn btn--sm btn--danger" id="editorDeleteMarker">Eliminar punto</button>
        </div>
      </form>`;
  }

  function renderMarkerList() {
    const markers = getCurrentMarkers();
    if (!markers.length) {
      return `<p class="editor-list__empty">Sin puntos en esta vista</p>`;
    }

    const sorted = is3DProduct()
      ? [...markers].sort((a, b) => {
          const aMatch = !a.orbit || store.orbitsSimilar(getCurrentOrbitString(), a.orbit, orbitTolerance);
          const bMatch = !b.orbit || store.orbitsSimilar(getCurrentOrbitString(), b.orbit, orbitTolerance);
          return Number(bMatch) - Number(aMatch);
        })
      : isSpin360Product()
      ? [...markers].sort((a, b) => {
          const frame = getCurrentFrame();
          const aMatch = window.Spin360Viewer?.framesSimilar(a, frame) !== false;
          const bMatch = window.Spin360Viewer?.framesSimilar(b, frame) !== false;
          return Number(bMatch) - Number(aMatch);
        })
      : markers;

    return sorted
      .map((m) => {
        const inView = isSpin360Product()
          ? window.Spin360Viewer?.framesSimilar(m, getCurrentFrame()) !== false
          : !is3DProduct() || !m.orbit || store.orbitsSimilar(getCurrentOrbitString(), m.orbit, orbitTolerance);
        const viewLabel = isSpin360Product()
          ? m.uIndex != null
            ? `u=${m.uIndex} v=${m.vIndex ?? '—'}`
            : 'Sin ángulo'
          : m.orbit
          ? store.getViewLabel(m.orbit)
          : 'Sin vista';
        return `
        <button type="button" class="editor-list__item ${m.id === selectedId ? 'is-active' : ''} ${inView ? '' : 'editor-list__item--dim'}" data-select-id="${m.id}">
          <strong>${escapeHtml(m.label)}</strong>
          <small>${escapeHtml(m.type)} · ${m.x.toFixed(1)}%, ${m.y.toFixed(1)}%${is3DProduct() || isSpin360Product() ? ` · ${viewLabel}` : ''}</small>
        </button>`;
      })
      .join('');
  }

  function escapeAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderEditorBody() {
    const panel = $('#editorPanelBody');
    if (!panel || !currentProduct) return;

    panel.innerHTML = `
      <div class="editor-layout">
        <div class="editor-layout__stage-wrap">
          <div class="editor-layout__view-tabs">
            ${
              store.isSpin360(currentProduct)
                ? `<span class="signal-tab signal-tab--360 is-active">Vista 360°</span>`
                : store.isModel3D(currentProduct)
                ? `<span class="signal-tab signal-tab--3d is-active">Vista 3D</span>`
                : `
              <button type="button" class="signal-tab ${currentView === 'front' ? 'is-active' : ''}" data-editor-view="front">Frontal</button>
              <button type="button" class="signal-tab ${currentView === 'back' ? 'is-active' : ''}" data-editor-view="back">Trasera</button>`
            }
          </div>
          ${renderEditorStage()}
        </div>
        <aside class="editor-sidebar">
          <div class="editor-sidebar__section">
            <div class="editor-sidebar__header">
              <h3>Punto seleccionado</h3>
              <p>Edita nombre, tipo y descripción</p>
            </div>
            <div id="editorFormWrap">${renderMarkerForm()}</div>
          </div>
          <div class="editor-sidebar__section editor-sidebar__section--list">
            <div class="editor-sidebar__header">
              <h3 id="editorMarkerListHeader">Puntos (${getCurrentMarkers().length})</h3>
              <p>${is3DProduct() ? 'Puntos visibles en la vista actual' : isSpin360Product() ? 'Puntos visibles en el ángulo actual' : 'Lista de la vista actual'}</p>
            </div>
            <div class="editor-list" id="editorMarkerList">${renderMarkerList()}</div>
          </div>
        </aside>
      </div>`;

    bindEditorStage();
    bindEditorForm();
    bindEditorList();
    bindEditorViewTabs();
    if (isSpin360Product()) bindEditorSpin360Tools();
    else bindEditor3DTools();
    bindEditorKeyboard();
    toggleAddModeControl();
    updateEditorOrbitLive();
    updateEditorFrameLive();
    updateEditorMarkerVisibility();
    if (is3DProduct()) syncEditorHotspots();
  }

  function refreshMarkersUI() {
    if (is3DProduct()) {
      syncEditorHotspots();
      const formWrap = $('#editorFormWrap');
      if (formWrap) formWrap.innerHTML = renderMarkerForm();
      const list = $('#editorMarkerList');
      if (list) list.innerHTML = renderMarkerList();
      bindEditorForm();
      bindEditorList();
      updateGoToMarkerButton();
      updateEditorMarkerVisibility();
      return;
    }

    if (isSpin360Product()) {
      const layer = $('.editor-markers');
      if (layer) layer.innerHTML = renderMarkerButtons(getCurrentMarkers(), true);
      const formWrap = $('#editorFormWrap');
      if (formWrap) formWrap.innerHTML = renderMarkerForm();
      const list = $('#editorMarkerList');
      if (list) list.innerHTML = renderMarkerList();
      bindEditorForm();
      bindEditorList();
      bindEditorStageMarkers();
      updateGoToMarkerButton();
      updateEditorMarkerVisibility();
      updateEditorFrameLive();
      return;
    }

    const layer = $('.editor-markers');
    if (layer) layer.innerHTML = renderMarkerButtons(getCurrentMarkers(), true);
    const formWrap = $('#editorFormWrap');
    if (formWrap) formWrap.innerHTML = renderMarkerForm();
    const list = $('#editorMarkerList');
    if (list) list.innerHTML = renderMarkerList();
    bindEditorForm();
    bindEditorList();
    bindEditorStageMarkers();
    updateGoToMarkerButton();
    updateEditorMarkerVisibility();
  }

  function updateMarker(id, patch, options) {
    const opts = options || {};
    const markers = getCurrentMarkers();
    const index = markers.findIndex((m) => m.id === id);
    if (index === -1) return;
    markers[index] = { ...markers[index], ...patch };
    setDirty(true);
    if (opts.silent) {
      refreshMarkerVisual(markers[index]);
      return;
    }
    refreshMarkersUI();
  }

  function refreshMarkerVisual(marker) {
    if (!marker) return;

    const btn = $(`.editor-markers [data-marker-id="${marker.id}"]`);
    if (btn) {
      btn.style.left = `${marker.x}%`;
      btn.style.top = `${marker.y}%`;
      const label = $('.marker__label', btn);
      if (label) label.textContent = marker.label;
    }

    const listItem = $(`.editor-list__item[data-select-id="${marker.id}"]`);
    if (listItem) {
      listItem.innerHTML = `
        <strong>${escapeHtml(marker.label)}</strong>
        <small>${escapeHtml(marker.type)} · ${marker.x.toFixed(1)}%, ${marker.y.toFixed(1)}%</small>`;
      listItem.classList.toggle('is-active', marker.id === selectedId);
      listItem.addEventListener('click', () => selectMarker(marker.id));
    }
  }

  function selectMarker(id, options) {
    const opts = options || {};
    selectedId = id;
    const marker = getCurrentMarkers().find((m) => m.id === id);
    if (
      opts.applyOrbit !== false &&
      isSpin360Product() &&
      marker?.uIndex != null
    ) {
      getSpin360Instance()?.setFrame(marker.uIndex, marker.vIndex ?? getCurrentFrame().v);
    } else if (
      opts.applyOrbit !== false &&
      marker?.orbit &&
      is3DProduct() &&
      !(window.Marker3D && window.Marker3D.hasAnchor(marker))
    ) {
      applyOrbitToEditor(marker.orbit);
    }
    refreshMarkersUI();
    updateGoToMarkerButton();
  }

  function updateGoToMarkerButton() {
    const btn = $('#editorGoToMarkerView');
    if (!btn) return;
    const marker = getSelectedMarker();
    if (isSpin360Product()) {
      btn.disabled = marker?.uIndex == null;
      return;
    }
    btn.disabled = !marker?.orbit;
  }

  function addMarkerAt(clientX, clientY, options) {
    const opts = options || {};
    snapshotBeforeChange();
    const markers = getCurrentMarkers();
    const stage = $('.editor-stage');
    const mv = getEditorModelViewer();
    const rect = stage ? getStageElement(stage).getBoundingClientRect() : null;
    const x = rect ? clamp(((clientX - rect.left) / rect.width) * 100, 0, 100) : 50;
    const y = rect ? clamp(((clientY - rect.top) / rect.height) * 100, 0, 100) : 50;
    const anchor = mv && window.Marker3D ? window.Marker3D.pickSurface(mv, clientX, clientY) : null;

    const marker = {
      id: uniqueId('nuevo-punto', markers),
      label: 'Nuevo punto',
      type: 'Componente',
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      desc: 'Descripción del componente.',
    };

    if (is3DProduct()) {
      marker.orbit = opts.orbit || getCurrentOrbitString();
      if (anchor) {
        marker.position = anchor.position;
        marker.normal = anchor.normal;
      }
    }

    if (isSpin360Product()) {
      const frame = getCurrentFrame();
      marker.uIndex = frame.u;
      marker.vIndex = frame.v;
    }

    markers.push(marker);
    selectedId = marker.id;
    if (!is3DProduct() && !isSpin360Product()) {
      addMode = false;
      $('#editorAddMode')?.classList.remove('is-on');
    }
    setDirty(true);
    refreshMarkersUI();
    disableClickPlaceMode();
    showToast(anchor ? 'Punto anclado al modelo 3D' : 'Punto colocado · Haz click sobre el modelo');
  }

  function addMarkerAtCurrentView() {
    const mv = getEditorModelViewer();
    if (!mv) return addMarkerAt(0, 0);
    const rect = mv.getBoundingClientRect();
    addMarkerAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function enableClickPlaceMode() {
    clickPlaceMode = true;
    $('.editor-stage')?.classList.add('editor-stage--click-place');
    $('#editorClickPlace')?.classList.add('is-on');
    showToast('Haz click directamente sobre el modelo para anclar el punto');
  }

  function disableClickPlaceMode() {
    clickPlaceMode = false;
    $('.editor-stage')?.classList.remove('editor-stage--click-place');
    $('#editorClickPlace')?.classList.remove('is-on');
  }

  function duplicateSelectedMarker() {
    const marker = getSelectedMarker();
    if (!marker) {
      showToast('Selecciona un punto para duplicar');
      return;
    }
    snapshotBeforeChange();
    const markers = getCurrentMarkers();
    const copy = {
      ...JSON.parse(JSON.stringify(marker)),
      id: uniqueId(`${marker.label}-copia`, markers),
      label: `${marker.label} (copia)`,
      x: clamp(marker.x + 4, 0, 100),
      y: clamp(marker.y + 4, 0, 100),
    };
    markers.push(copy);
    selectedId = copy.id;
    setDirty(true);
    refreshMarkersUI();
    showToast('Punto duplicado');
  }

  function captureFrameForSelected() {
    const marker = getSelectedMarker();
    if (!marker) {
      showToast('Selecciona un punto primero');
      return;
    }

    const frame = getCurrentFrame();
    snapshotBeforeChange();
    updateMarker(marker.id, { uIndex: frame.u, vIndex: frame.v });
    if ($('#editorUIndex')) $('#editorUIndex').value = frame.u;
    if ($('#editorVIndex')) $('#editorVIndex').value = frame.v;
    showToast('Ángulo 360° guardado para este punto');
  }

  function captureOrbitForSelected() {
    if (isSpin360Product()) {
      captureFrameForSelected();
      return;
    }

    const marker = getSelectedMarker();
    const mv = getEditorModelViewer();
    if (!marker) {
      showToast('Selecciona un punto primero');
      return;
    }

    const orbit = getCurrentOrbitString();
    const input = $('#editorOrbit');
    if (input) input.value = orbit;

    let patch = {
      orbit,
      x: marker.x,
      y: marker.y,
    };

    if (is3DProduct() && mv && window.Marker3D) {
      const anchored = window.Marker3D.ensureMarkerAnchor(mv, { ...marker, orbit });
      patch = {
        ...patch,
        x: anchored.x,
        y: anchored.y,
        position: anchored.position,
        normal: anchored.normal,
      };
    }

    snapshotBeforeChange();
    updateMarker(marker.id, patch);
    showToast('Punto anclado al modelo y vista guardada');
  }

  function deleteSelectedMarker() {
    const marker = getSelectedMarker();
    if (!marker || !confirm(`¿Eliminar el punto "${marker.label}"?`)) return;

    snapshotBeforeChange();
    const key = getViewKey();
    drafts[key] = getCurrentMarkers().filter((m) => m.id !== marker.id);
    selectedId = null;
    setDirty(true);
    refreshMarkersUI();
  }

  function getStageElement(stage) {
    return $('.editor-stage__viewport', stage) || stage;
  }

  function getStagePoint(event, stage) {
    const target = getStageElement(stage);
    const rect = target.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    return { x, y };
  }

  function bindEditorHotspotDrag() {
    const mv = getEditorModelViewer();
    if (!mv || !is3DProduct() || !window.Marker3D || mv.dataset.hotspotDragBound) return;
    mv.dataset.hotspotDragBound = '1';

    let dragId = null;

    mv.addEventListener('pointerdown', (e) => {
      const hotspot = e.target.closest('[data-marker-hotspot]');
      if (!hotspot) return;
      dragId = hotspot.dataset.markerId;
      selectMarker(dragId, { applyOrbit: false });
      mv.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });

    mv.addEventListener('pointermove', (e) => {
      if (!dragId) return;
      const anchor = window.Marker3D.pickSurface(mv, e.clientX, e.clientY);
      if (!anchor) return;
      const stage = $('.editor-stage');
      const { x, y } = getStagePoint(e, stage);
      updateMarker(
        dragId,
        {
          ...anchor,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          orbit: getCurrentOrbitString(),
        },
        { silent: true }
      );
      syncEditorHotspots();
    });

    mv.addEventListener('pointerup', (e) => {
      if (!dragId) return;
      snapshotBeforeChange();
      const anchor = window.Marker3D.pickSurface(mv, e.clientX, e.clientY);
      const stage = $('.editor-stage');
      const { x, y } = getStagePoint(e, stage);
      if (anchor) {
        updateMarker(dragId, {
          ...anchor,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          orbit: getCurrentOrbitString(),
        });
      }
      dragId = null;
    });
  }

  function bindEditorStageMarkers() {
    if (is3DProduct()) return;
    const stage = $('.editor-stage');
    if (!stage) return;

    $$('.editor-markers .marker', stage).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dragState?.moved) return;
        selectMarker(btn.dataset.markerId);
      });

      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const markerId = btn.dataset.markerId;
        selectMarker(markerId, { applyOrbit: false });

        dragState = {
          id: markerId,
          moved: false,
          pointerId: e.pointerId,
          stage,
        };

        btn.setPointerCapture(e.pointerId);
      });

      btn.addEventListener('pointermove', (e) => {
        if (!dragState || dragState.pointerId !== e.pointerId || dragState.id !== btn.dataset.markerId) return;

        dragState.moved = true;
        const { x, y } = getStagePoint(e, dragState.stage);
        btn.style.left = `${x}%`;
        btn.style.top = `${y}%`;
      });

      btn.addEventListener('pointerup', (e) => {
        if (!dragState || dragState.pointerId !== e.pointerId || dragState.id !== btn.dataset.markerId) return;

        const markerId = dragState.id;

        if (dragState.moved) {
          snapshotBeforeChange();
          const { x, y } = getStagePoint(e, dragState.stage);
          const patch = {
            x: Math.round(x * 10) / 10,
            y: Math.round(y * 10) / 10,
          };
          if (is3DProduct()) {
            const orbit = getCurrentOrbitString();
            if (orbit) patch.orbit = orbit;
          }
          updateMarker(markerId, patch, { silent: true });
          setDirty(true);
          refreshMarkerVisual(getCurrentMarkers().find((m) => m.id === markerId));
          updateMarkerListHeader();
        }

        dragState = null;
      });
    });
  }

  function bindEditorStage() {
    const stage = $('.editor-stage');
    const layer = $('.editor-markers', stage);
    if (!stage || !layer) return;

    if (isSpin360Product()) {
      const root = getEditorSpin360Root();
      if (root && window.Spin360Viewer && !root.dataset.spin360Init) {
        root.dataset.spin360Init = '1';
        window.Spin360Viewer.init(root, currentProduct.spin360, {
          onFrameChange: () => {
            updateEditorFrameLive();
            updateEditorMarkerVisibility();
          },
        });
      }

      layer.addEventListener('click', (e) => {
        if (!addMode) return;
        if (e.target.closest('.marker')) return;
        addMarkerAt(e.clientX, e.clientY);
      });
      bindEditorStageMarkers();
      bindEditorHotspotDrag();
      return;
    }

    if (is3DProduct()) {
      const viewport = $('.editor-stage__viewport', stage);
      const mv = getEditorModelViewer();
      viewport?.addEventListener('click', (e) => {
        if (!clickPlaceMode) return;
        if (e.target.closest('[data-marker-hotspot]')) return;
        if (selectedId && mv && window.Marker3D) {
          const anchor = window.Marker3D.pickSurface(mv, e.clientX, e.clientY);
          if (anchor) {
            snapshotBeforeChange();
            const { x, y } = getStagePoint(e, stage);
            updateMarker(selectedId, {
              ...anchor,
              x: Math.round(x * 10) / 10,
              y: Math.round(y * 10) / 10,
              orbit: getCurrentOrbitString(),
            });
            disableClickPlaceMode();
            showToast('Punto reubicado en el modelo');
            return;
          }
        }
        addMarkerAt(e.clientX, e.clientY);
      });
    } else {
      layer.addEventListener('click', (e) => {
        if (!addMode) return;
        if (e.target.closest('.marker')) return;
        addMarkerAt(e.clientX, e.clientY);
      });
    }

    if (!is3DProduct()) bindEditorStageMarkers();
    bindEditorHotspotDrag();
    bindEditorModelViewer();
  }

  function bindEditorModelViewer() {
    const mv = getEditorModelViewer();
    if (!mv || mv.dataset.orbitBound) return;
    mv.dataset.orbitBound = '1';

    const refreshHotspots = () => {
      updateEditorOrbitLive();
      updateEditorMarkerVisibility();
      if (mv.modelIsVisible) syncEditorHotspots();
    };

    mv.addEventListener('camera-change', () => {
      updateEditorOrbitLive();
      updateEditorMarkerVisibility();
    });
    mv.addEventListener('load', () => {
      commit3DAnchorsFromEditor();
      refreshHotspots();
    });
    if (mv.modelIsVisible) {
      commit3DAnchorsFromEditor();
      refreshHotspots();
    }
  }

  function bindEditorSpin360Tools() {
    $('#editorPlaceAtView')?.addEventListener('click', addMarkerAtCurrentView);
    $('#editorCaptureFrameToolbar')?.addEventListener('click', captureFrameForSelected);
    $('#editorGoToMarkerView')?.addEventListener('click', () => {
      const marker = getSelectedMarker();
      if (marker?.uIndex != null) {
        getSpin360Instance()?.setFrame(marker.uIndex, marker.vIndex ?? getCurrentFrame().v);
        updateEditorMarkerVisibility();
      }
    });
    $('#editorShowAllMarkers')?.addEventListener('change', (e) => {
      showAllMarkers = e.target.checked;
      updateEditorMarkerVisibility();
    });
    updateGoToMarkerButton();
    updateEditorFrameLive();
  }

  function bindEditor3DTools() {
    $$('.editor-stage-tools [data-preset-orbit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyOrbitToEditor(btn.dataset.presetOrbit);
        $$('.editor-stage-tools [data-preset-orbit]').forEach((b) => b.classList.toggle('is-active', b === btn));
      });
    });

    $('#editorPlaceAtView')?.addEventListener('click', addMarkerAtCurrentView);
    $('#editorClickPlace')?.addEventListener('click', () => {
      if (clickPlaceMode) disableClickPlaceMode();
      else enableClickPlaceMode();
    });
    $('#editorGoToMarkerView')?.addEventListener('click', () => {
      const marker = getSelectedMarker();
      if (marker?.orbit) applyOrbitToEditor(marker.orbit);
    });
    $('#editorCaptureOrbitToolbar')?.addEventListener('click', captureOrbitForSelected);
    $('#editorShowAllMarkers')?.addEventListener('change', (e) => {
      showAllMarkers = e.target.checked;
      updateEditorMarkerVisibility();
    });
    updateGoToMarkerButton();
  }

  function bindEditorForm() {
    const form = $('#editorMarkerForm');
    if (!form) return;

    if (!getSelectedMarker()) return;

    let formSnapshotted = false;
    const sync = () => {
      const current = getSelectedMarker();
      if (!current) return;
      updateMarker(
        current.id,
        {
          label: $('#editorLabel')?.value.trim() || current.label,
          type: $('#editorType')?.value.trim() || 'Componente',
          desc: $('#editorDesc')?.value.trim() || '',
          x: readNumberInput($('#editorX')?.value, current.x),
          y: readNumberInput($('#editorY')?.value, current.y),
          ...(store.isSpin360(currentProduct)
            ? {
                uIndex: readNumberInput($('#editorUIndex')?.value, current.uIndex),
                vIndex: readNumberInput($('#editorVIndex')?.value, current.vIndex),
              }
            : store.isModel3D(currentProduct)
            ? { orbit: $('#editorOrbit')?.value.trim() || current.orbit || '' }
            : {}),
        },
        { silent: true }
      );
    };

    form.addEventListener('focusin', () => {
      if (!formSnapshotted) {
        snapshotBeforeChange();
        formSnapshotted = true;
      }
    });
    form.addEventListener('focusout', () => {
      formSnapshotted = false;
    });
    form.addEventListener('input', sync);

    $('#editorCaptureOrbit')?.addEventListener('click', captureOrbitForSelected);
    $('#editorCaptureFrame')?.addEventListener('click', captureFrameForSelected);

    $('#editorDeleteMarker')?.addEventListener('click', deleteSelectedMarker);
    $('#editorDuplicateMarker')?.addEventListener('click', duplicateSelectedMarker);
  }

  function bindEditorKeyboard() {
    if (window.__editorKeyboardBound) return;
    window.__editorKeyboardBound = true;

    document.addEventListener('keydown', (e) => {
      if ($('#editorPanel')?.classList.contains('hidden')) return;
      if (e.target.matches('input, textarea, select')) return;

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (is3DProduct()) addMarkerAtCurrentView();
      }
      if ((e.key === 'g' || e.key === 'G') && is3DProduct()) {
        e.preventDefault();
        const marker = getSelectedMarker();
        if (marker?.orbit) applyOrbitToEditor(marker.orbit);
      }
      if ((e.key === 's' || e.key === 'S') && is3DProduct()) {
        e.preventDefault();
        captureOrbitForSelected();
      }
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undoLastChange();
      }
      if (e.key === 'Escape') disableClickPlaceMode();
    });
  }

  function bindEditorList() {
    $$('.editor-list__item').forEach((btn) => {
      btn.addEventListener('click', () => selectMarker(btn.dataset.selectId));
    });
  }

  function bindEditorViewTabs() {
    $$('[data-editor-view]').forEach((tab) => {
      tab.addEventListener('click', () => {
        const nextView = tab.dataset.editorView;
        if (nextView === currentView) return;
        currentView = nextView;
        selectedId = null;
        renderEditorBody();
      });
    });
  }

  function saveDrafts() {
    if (!currentProduct) return;
    flushPendingEdits();
    store.setAllMarkers(currentProduct, drafts);
    setDirty(false);
    showToast('Puntos guardados en este navegador');
    window.dispatchEvent(new CustomEvent('catalog:markers-updated', { detail: { productId: currentProduct.id } }));
  }

  function resetDrafts() {
    if (!currentProduct) return;
    if (!confirm('¿Restaurar los puntos originales del catálogo? Se perderán tus cambios guardados.')) return;
    store.clearOverrides(currentProduct.id);
    drafts = {};
    selectedId = null;
    setDirty(false);
    renderEditorBody();
    showToast('Puntos restaurados');
    window.dispatchEvent(new CustomEvent('catalog:markers-updated', { detail: { productId: currentProduct.id } }));
  }

  function importDraftsFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ''));
        if (!data || typeof data !== 'object') throw new Error('invalid');
        snapshotBeforeChange();
        drafts = data;
        selectedId = null;
        setDirty(true);
        renderEditorBody();
        showToast('JSON importado correctamente');
      } catch {
        showToast('Archivo JSON inválido');
      }
    };
    reader.readAsText(file);
  }

  function exportDrafts() {
    if (!currentProduct) return;
    flushPendingEdits();
    store.setAllMarkers(currentProduct, drafts);
    const json = store.exportForProductsJs(currentProduct);
    const output = $('#editorExportOutput');
    if (output) {
      output.value = json;
      output.focus();
      output.select();
    }

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentProduct.id}-markers.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('JSON exportado');
  }

  function showToast(message) {
    const toast = $('#editorToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function bindToolbar() {
    $('#editorProductSelect')?.addEventListener('change', (e) => {
      if (dirty && !confirm('Tienes cambios sin guardar. ¿Cambiar de producto igualmente?')) {
        e.target.value = currentProduct.id;
        return;
      }
      open(e.target.value);
    });

    $('#editorAddMode')?.addEventListener('click', () => {
      if (is3DProduct()) return;
      addMode = !addMode;
      $('#editorAddMode').classList.toggle('is-on', addMode);
      updateEditorHint();
    });

    $('#editorSave')?.addEventListener('click', saveDrafts);
    $('#editorReset')?.addEventListener('click', resetDrafts);
    $('#editorExport')?.addEventListener('click', exportDrafts);
    $('#editorUndo')?.addEventListener('click', undoLastChange);
    $('#editorImport')?.addEventListener('click', () => $('#editorImportFile')?.click());
    $('#editorImportFile')?.addEventListener('change', (e) => {
      importDraftsFromFile(e.target.files?.[0]);
      e.target.value = '';
    });
    $('#editorClose')?.addEventListener('click', close);
  }

  function showProductPicker() {
    const dialog = $('#editorPicker');
    const list = $('#editorPickerList');
    if (!dialog || !list) {
      open(products[0]?.id);
      return;
    }
    list.innerHTML = products
      .map(
        (p) =>
          `<button type="button" class="editor-picker__item" data-pick-product="${p.id}">
            <strong>${escapeHtml(p.name)}</strong>
            <small>${escapeHtml(p.manufacturer)} · ${escapeHtml(p.category)}</small>
          </button>`
      )
      .join('');
    list.querySelectorAll('[data-pick-product]').forEach((btn) => {
      btn.addEventListener('click', () => {
        dialog.close();
        open(btn.dataset.pickProduct);
      });
    });
    dialog.showModal();
  }

  function openPicker() {
    showProductPicker();
  }

  function buildProductOptions(selectedId) {
    return products
      .map((p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.name}</option>`)
      .join('');
  }

  function open(productId) {
    currentProduct = products.find((p) => p.id === productId) || products[0];
    if (!currentProduct) return;

    currentView = store.isSpin360(currentProduct) ? '360' : store.isModel3D(currentProduct) ? '3d' : 'front';
    drafts = JSON.parse(JSON.stringify(store.getAllMarkers(currentProduct)));
    selectedId = null;
    addMode = false;
    clickPlaceMode = false;
    showAllMarkers = false;
    dirty = false;
    undoStack = [];

    const select = $('#editorProductSelect');
    if (select) select.innerHTML = buildProductOptions(currentProduct.id);

    $('#editorAddMode')?.classList.remove('is-on');
    toggleAddModeControl();
    setDirty(false);
    renderEditorBody();
    updateUndoButton();

    const panel = $('#editorPanel');
    panel?.classList.remove('hidden');
    document.body.classList.add('editor-open');
  }

  function close() {
    if (dirty && !confirm('Tienes cambios sin guardar. ¿Salir del editor?')) return;
    $('#editorPanel')?.classList.add('hidden');
    document.body.classList.remove('editor-open');
    addMode = false;
    dirty = false;
  }

  function init() {
    bindToolbar();
    $$('#editorPicker [data-close]').forEach((el) => {
      el.addEventListener('click', () => $('#editorPicker')?.close());
    });
  }

  window.MarkerEditor = { open, close, openPicker, init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
