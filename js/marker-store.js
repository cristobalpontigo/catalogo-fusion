window.MarkerStore = (function () {
  const PREFIX = 'catalogo-fusion-markers-';

  function isModel3D(product) {
    return !!(product && product.model3d);
  }

  function isSpin360(product) {
    return !!(product && product.spin360);
  }

  function usesFeatureMarkers(product) {
    return isModel3D(product) || isSpin360(product);
  }

  function getViewKey(product, view) {
    if (usesFeatureMarkers(product)) return 'features';
    return view || 'front';
  }

  function getDefaultMarkers(product, viewKey) {
    if (!product?.markers) return [];
    return JSON.parse(JSON.stringify(product.markers[viewKey] || []));
  }

  function loadOverrides(productId) {
    try {
      const raw = localStorage.getItem(PREFIX + productId);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveOverrides(productId, data) {
    localStorage.setItem(PREFIX + productId, JSON.stringify(data));
  }

  function clearOverrides(productId) {
    localStorage.removeItem(PREFIX + productId);
  }

  function getMarkers(product, view) {
    const viewKey = getViewKey(product, view);
    const overrides = loadOverrides(product.id);
    if (overrides && Array.isArray(overrides[viewKey])) {
      return JSON.parse(JSON.stringify(overrides[viewKey]));
    }
    return getDefaultMarkers(product, viewKey);
  }

  function getAllMarkers(product) {
    const overrides = loadOverrides(product.id);
    const result = {};

    if (usesFeatureMarkers(product)) {
      result.features =
        overrides?.features !== undefined
          ? JSON.parse(JSON.stringify(overrides.features))
          : getDefaultMarkers(product, 'features');
      return result;
    }

    result.front =
      overrides?.front !== undefined
        ? JSON.parse(JSON.stringify(overrides.front))
        : getDefaultMarkers(product, 'front');
    result.back =
      overrides?.back !== undefined
        ? JSON.parse(JSON.stringify(overrides.back))
        : getDefaultMarkers(product, 'back');
    return result;
  }

  function setAllMarkers(product, markersObj) {
    const normalized = JSON.parse(JSON.stringify(markersObj));
    Object.keys(normalized).forEach((key) => {
      if (!Array.isArray(normalized[key])) return;
      normalized[key] = normalized[key].map((marker) => {
        if (!marker?.orbit) return marker;
        const parsed = parseOrbit(marker.orbit);
        if (!parsed) return marker;
        return { ...marker, orbit: formatOrbit(parsed.theta, parsed.phi, parsed.radius) };
      });
    });
    saveOverrides(product.id, normalized);
  }

  function hasOverrides(productId) {
    return !!loadOverrides(productId);
  }

  function exportForProductsJs(product) {
    return JSON.stringify(getAllMarkers(product), null, 2);
  }

  function parseOrbit(str) {
    if (!str) return null;
    const match = String(str).trim().match(/(-?\d+(?:\.\d+)?)\s*deg\s+(-?\d+(?:\.\d+)?)\s*deg\s+(-?\d+(?:\.\d+)?)\s*%/i);
    if (!match) return null;
    return { theta: parseFloat(match[1]), phi: parseFloat(match[2]), radius: parseFloat(match[3]) };
  }

  function formatOrbit(theta, phi, radius) {
    return `${Math.round(theta * 10) / 10}deg ${Math.round(phi * 10) / 10}deg ${Math.round(radius * 10) / 10}%`;
  }

  function getOrbitFromModelViewer(mv) {
    if (!mv?.getCameraOrbit) return '';
    const orbit = mv.getCameraOrbit();
    return formatOrbit(orbit.theta.deg, orbit.phi.deg, orbit.radius);
  }

  function applyOrbitToModelViewer(mv, orbitStr) {
    if (!mv || !orbitStr) return;
    mv.cameraOrbit = orbitStr;
    mv.autoRotate = false;
  }

  function angularDiff(a, b) {
    let diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
  }

  function orbitsSimilar(orbitA, orbitB, toleranceDeg = 38) {
    const a = typeof orbitA === 'string' ? parseOrbit(orbitA) : orbitA;
    const b = typeof orbitB === 'string' ? parseOrbit(orbitB) : orbitB;
    if (!a || !b) return true;
    return angularDiff(a.theta, b.theta) <= toleranceDeg && Math.abs(a.phi - b.phi) <= toleranceDeg;
  }

  const CAMERA_PRESETS = [
    { id: 'front', label: 'Frontal', orbit: '0deg 75deg 110%' },
    { id: 'back', label: 'Trasera', orbit: '180deg 75deg 110%' },
    { id: 'left', label: 'Izquierda', orbit: '270deg 75deg 110%' },
    { id: 'right', label: 'Derecha', orbit: '90deg 75deg 110%' },
    { id: 'top', label: 'Superior', orbit: '0deg 28deg 130%' },
  ];

  function getClosestPreset(orbitStr) {
    const current = parseOrbit(orbitStr);
    if (!current) return null;

    let best = null;
    let bestScore = Infinity;
    CAMERA_PRESETS.forEach((preset) => {
      const parsed = parseOrbit(preset.orbit);
      if (!parsed) return;
      const score = angularDiff(current.theta, parsed.theta) + Math.abs(current.phi - parsed.phi) * 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = preset;
      }
    });

    return bestScore <= 42 ? best : null;
  }

  function getViewLabel(orbitStr) {
    return getClosestPreset(orbitStr)?.label || 'Personalizada';
  }

  function filterMarkersByOrbit(markers, orbitStr, toleranceDeg = 38) {
    return markers.filter((marker) => !marker.orbit || orbitsSimilar(orbitStr, marker.orbit, toleranceDeg));
  }

  function filterMarkersByFrame(markers, frame, toleranceU = 2, toleranceV = 1) {
    if (!window.Spin360Viewer) return markers;
    return markers.filter((marker) => window.Spin360Viewer.framesSimilar(marker, frame, toleranceU, toleranceV));
  }

  return {
    isModel3D,
    isSpin360,
    usesFeatureMarkers,
    getViewKey,
    getMarkers,
    getAllMarkers,
    setAllMarkers,
    clearOverrides,
    hasOverrides,
    exportForProductsJs,
    getDefaultMarkers,
    parseOrbit,
    formatOrbit,
    getOrbitFromModelViewer,
    applyOrbitToModelViewer,
    orbitsSimilar,
    CAMERA_PRESETS,
    getClosestPreset,
    getViewLabel,
    filterMarkersByOrbit,
    filterMarkersByFrame,
  };
})();
