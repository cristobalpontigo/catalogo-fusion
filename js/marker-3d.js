window.Marker3D = (function () {
  function formatVec3(v) {
    if (!v) return '';
    return `${v.x.toFixed(4)}m ${v.y.toFixed(4)}m ${v.z.toFixed(4)}m`;
  }

  function parseVec3(str) {
    if (!str) return null;
    const match = String(str)
      .trim()
      .match(/(-?\d+(?:\.\d+)?)\s*m\s+(-?\d+(?:\.\d+)?)\s*m\s+(-?\d+(?:\.\d+)?)\s*m/i);
    if (!match) return null;
    return { x: parseFloat(match[1]), y: parseFloat(match[2]), z: parseFloat(match[3]) };
  }

  function hasAnchor(marker) {
    return !!(marker?.position && parseVec3(marker.position));
  }

  function clientToLocal(mv, clientX, clientY) {
    const rect = mv.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function pickSurface(mv, clientX, clientY) {
    if (!mv?.positionAndNormalFromPoint) return null;
    const local = clientToLocal(mv, clientX, clientY);
    const hit = mv.positionAndNormalFromPoint(local.x, local.y);
    if (!hit?.position) return null;
    return {
      position: formatVec3(hit.position),
      normal: formatVec3(hit.normal || { x: 0, y: 1, z: 0 }),
    };
  }

  function percentToLocal(mv, xPct, yPct) {
    const rect = mv.getBoundingClientRect();
    return {
      x: (xPct / 100) * rect.width,
      y: (yPct / 100) * rect.height,
    };
  }

  function anchorFromPercent(mv, marker) {
    if (!mv?.positionAndNormalFromPoint || !window.MarkerStore) return null;
    if (marker.orbit) {
      window.MarkerStore.applyOrbitToModelViewer(mv, marker.orbit);
    }
    const local = percentToLocal(mv, marker.x, marker.y);
    const hit = mv.positionAndNormalFromPoint(local.x, local.y);
    if (!hit?.position) return null;
    return {
      position: formatVec3(hit.position),
      normal: formatVec3(hit.normal || { x: 0, y: 1, z: 0 }),
    };
  }

  function ensureMarkerAnchor(mv, marker) {
    if (hasAnchor(marker)) return marker;
    const anchor = anchorFromPercent(mv, marker);
    if (!anchor) return marker;
    return { ...marker, ...anchor };
  }

  function ensureAllAnchors(mv, markers) {
    if (!mv || !markers?.length) return markers;
    return markers.map((marker) => ensureMarkerAnchor(mv, marker));
  }

  function clearHotspots(mv) {
    if (!mv) return;
    mv.querySelectorAll('[data-marker-hotspot]').forEach((el) => el.remove());
  }

  function slotName(id) {
    return `hotspot-${String(id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  function renderHotspots(mv, markers, options) {
    const opts = options || {};
    clearHotspots(mv);
    if (!mv || !markers?.length) return;

    const visible = opts.showAll
      ? markers
      : markers.filter((marker) => hasAnchor(marker) || opts.includeLegacy !== false);

    visible.forEach((marker) => {
      if (!hasAnchor(marker)) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = [
        'marker',
        'hotspot-marker',
        opts.editable ? 'marker--editable' : '',
        marker.id === opts.selectedId ? 'is-active' : '',
      ]
        .filter(Boolean)
        .join(' ');
      btn.dataset.markerHotspot = '1';
      btn.dataset.markerId = marker.id;
      btn.slot = slotName(marker.id);
      btn.dataset.position = marker.position;
      btn.dataset.normal = marker.normal || '0m 1m 0m';
      btn.setAttribute('data-visibility-attribute', 'visible');
      btn.innerHTML = `
        <span class="marker__ring"></span>
        <span class="marker__dot"></span>
        <span class="marker__label">${marker.label || ''}</span>`;
      btn.setAttribute('aria-label', `${marker.label}: ${marker.type || ''}`);

      if (typeof opts.onClick === 'function') {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          opts.onClick(marker.id, e);
        });
      }

      mv.appendChild(btn);
    });
  }

  function syncOverlayVisibility(container, markers, mv, showAll) {
    if (!container || !mv || !window.MarkerStore) return;
    const currentOrbit = window.MarkerStore.getOrbitFromModelViewer(mv);
    $$('.marker:not([data-marker-hotspot])', container).forEach((el) => {
      const marker = markers.find((m) => m.id === el.dataset.markerId);
      if (!marker || hasAnchor(marker)) {
        el.classList.add('hidden');
        return;
      }
      const visible =
        showAll || !marker.orbit || window.MarkerStore.orbitsSimilar(currentOrbit, marker.orbit);
      el.classList.toggle('marker--other-face', !visible);
      el.classList.remove('hidden');
    });
  }

  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  return {
    formatVec3,
    parseVec3,
    hasAnchor,
    pickSurface,
    ensureMarkerAnchor,
    ensureAllAnchors,
    renderHotspots,
    clearHotspots,
    syncOverlayVisibility,
    clientToLocal,
  };
})();
