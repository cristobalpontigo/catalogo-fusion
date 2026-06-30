(function () {
  const products = window.CATALOG.products;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => (root || document).querySelectorAll(sel);

  let product = null;
  let markers = [];
  let target = null;
  let score = { correct: 0, asked: 0, streak: 0 };
  let bound = false;

  function getMarkers(product) {
    if (window.MarkerStore) return window.MarkerStore.getMarkers(product, 'features');
    return product.markers?.features || [];
  }

  function pickQuestion() {
    if (!markers.length) return null;
    if (markers.length === 1) return markers[0];
    let next = markers[Math.floor(Math.random() * markers.length)];
    while (target && markers.length > 1 && next.id === target.id) {
      next = markers[Math.floor(Math.random() * markers.length)];
    }
    return next;
  }

  function renderTrainingView() {
    const stage = $('#trainingStage');
    if (!stage || !product) return;

    stage.innerHTML = window.CatalogApp.renderProductView(product, '3d', {
      compact: false,
      training: true,
      hidePanelActions: true,
    });

    const container = $('.signal-view', stage);
    if (container && window.CatalogApp.activateDeferredModel) {
      window.CatalogApp.activateDeferredModel(container, product);
    }
    if (container && window.CatalogApp.bindSignalView) {
      window.CatalogApp.bindSignalView(container, product, { training: true, onMarkerClick: handleMarkerClick });
    }
  }

  function updateHud() {
    const prompt = $('#trainingPrompt');
    const scoreEl = $('#trainingScore');
    const progress = $('#trainingProgress');
    if (prompt && target) prompt.textContent = `Encuentra: ${target.label}`;
    if (scoreEl) scoreEl.textContent = `${score.correct} aciertos · racha ${score.streak}`;
    if (progress) progress.textContent = `${score.asked} preguntas`;
  }

  function flashFeedback(ok) {
    const fb = $('#trainingFeedback');
    if (!fb) return;
    fb.textContent = ok ? 'Correcto' : 'Incorrecto — intenta de nuevo';
    fb.className = `training-feedback training-feedback--${ok ? 'ok' : 'bad'} is-visible`;
    clearTimeout(flashFeedback._t);
    flashFeedback._t = setTimeout(() => fb.classList.remove('is-visible'), 1400);
  }

  function nextQuestion() {
    target = pickQuestion();
    score.asked += 1;
    updateHud();
    $$('.marker', $('#trainingStage')).forEach((el) => el.classList.remove('is-active'));
  }

  function handleMarkerClick(markerId) {
    if (!target) return;
    if (markerId === target.id) {
      score.correct += 1;
      score.streak += 1;
      flashFeedback(true);
      nextQuestion();
      return;
    }
    score.streak = 0;
    flashFeedback(false);
    updateHud();
  }

  function open(productId) {
    product = products.find((p) => p.id === productId);
    if (!product) return;

    markers = getMarkers(product);
    if (markers.length < 2) {
      alert('Este producto necesita al menos 2 puntos señalizados para el modo capacitación.');
      return;
    }

    score = { correct: 0, asked: 0, streak: 0 };
    target = null;

    const title = $('#trainingTitle');
    if (title) title.textContent = `Capacitación — ${product.name}`;

    renderTrainingView();
    nextQuestion();

    const dialog = $('#trainingModal');
    dialog?.showModal();
  }

  function close() {
    $('#trainingModal')?.close();
    product = null;
    target = null;
    $('#trainingStage').innerHTML = '';
  }

  function bind() {
    if (bound) return;
    bound = true;

    $('#trainingClose')?.addEventListener('click', close);
    $$('#trainingModal [data-close]').forEach((el) => el.addEventListener('click', close));
    $('#trainingRestart')?.addEventListener('click', () => {
      score = { correct: 0, asked: 0, streak: 0 };
      nextQuestion();
      updateHud();
    });
    $('#trainingModal')?.addEventListener('close', () => {
      product = null;
      target = null;
      $('#trainingStage').innerHTML = '';
    });
  }

  window.TrainingMode = { open, close, bind };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
