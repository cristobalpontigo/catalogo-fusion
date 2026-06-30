window.Spin360Viewer = (function () {
  const instances = new WeakMap();

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function imagePath(config, u, v) {
    return `${config.folder}/${v}_${u}.jpg`;
  }

  function normalizeU(config, value) {
    let u = value;
    if (config.uWrap) {
      u = u % config.uCount;
      if (u < 0) u += config.uCount;
      return u;
    }
    return clamp(u, 0, config.uCount - 1);
  }

  function normalizeV(config, value) {
    let v = value;
    if (config.vWrap) {
      v = v % config.vCount;
      if (v < 0) v += config.vCount;
      return v;
    }
    return clamp(v, 0, config.vCount - 1);
  }

  function init(container, config, callbacks) {
    const stage = container.querySelector('.spin360-stage__viewport') || container.querySelector('.spin360-stage');
    if (!stage) return null;

    const existing = stage.querySelector('.spin360-stage__img');
    if (existing) existing.remove();

    const img = document.createElement('img');
    img.className = 'spin360-stage__img';
    img.alt = config.alt || 'Vista 360';
    img.draggable = false;
    stage.appendChild(img);

    let u = config.uStart ?? 0;
    let v = config.vStart ?? 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    function getFrame() {
      return {
        u: Math.round(normalizeU(config, u)),
        v: Math.round(normalizeV(config, v)),
      };
    }

    function render() {
      const frame = getFrame();
      u = frame.u;
      v = frame.v;
      img.src = imagePath(config, u, v);
      callbacks?.onFrameChange?.(frame);
    }

    function onPointerDown(e) {
      if (e.target.closest('.marker')) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      stage.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const sens = config.sensitivity ?? 0.2;
      u -= dx * sens;
      if (config.vCount > 1) v -= dy * sens * 0.45;
      render();
    }

    function onPointerUp() {
      dragging = false;
    }

    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', onPointerUp);
    stage.addEventListener('pointercancel', onPointerUp);

    render();

    const api = {
      getFrame,
      setFrame(nextU, nextV) {
        u = nextU;
        v = nextV;
        render();
      },
      destroy() {
        img.remove();
      },
    };

    instances.set(container, api);
    return api;
  }

  function getInstance(container) {
    return instances.get(container) || null;
  }

  function framesSimilar(marker, frame, toleranceU = 2, toleranceV = 1) {
    if (marker.uIndex == null && marker.vIndex == null) return true;
    const uDiff = Math.abs((marker.uIndex ?? frame.u) - frame.u);
    const vDiff = Math.abs((marker.vIndex ?? frame.v) - frame.v);
    return uDiff <= toleranceU && vDiff <= toleranceV;
  }

  return { init, getInstance, framesSimilar, imagePath };
})();
