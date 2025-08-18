/* Mango Coco Production — Mode 3D Lunettes */
(function() {
  const intro = document.getElementById('intro');
  const viewer = document.getElementById('viewer');
  const startButton = document.getElementById('startButton');
  const video = document.getElementById('camera');
  const errorEl = document.getElementById('error');
  const glassesCanvas = document.getElementById('glassesCanvas');
  const glassesSrc = document.getElementById('glassesSrc');
  // Pas d'UI overlay

  let mediaStream = null;
  let isPortrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;

  function showIntro() {
    viewer.classList.remove('active');
    intro.classList.add('active');
    stopCamera();
  }

  function showViewer() {
    intro.classList.remove('active');
    viewer.classList.add('active');
  }

  async function startCamera() {
    errorEl.hidden = true;
    try {
      // Préfère la caméra arrière; essaie plusieurs variantes.
      const attempts = [
        { audio: false, video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
        { audio: false, video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } },
        { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        { audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } }
      ];

      stopCamera();

      let lastErr = null;
      for (const c of attempts) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia(c);
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!mediaStream) throw lastErr || new Error('Impossible d\'accéder à la caméra');

      video.srcObject = mediaStream;
      await video.play().catch(() => {});
    } catch (err) {
      console.error('Camera error', err);
      errorEl.hidden = false;
    }
  }

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
  }

  function processGlassesAndRender() {
    if (!glassesSrc.complete) return;

    const containerRect = document.getElementById('cameraContainer').getBoundingClientRect();
    const canvas = glassesCanvas;
    const ctx = canvas.getContext('2d');

    // Match canvas resolution to container for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(containerRect.width * dpr);
    canvas.height = Math.floor(containerRect.height * dpr);
    canvas.style.width = containerRect.width + 'px';
    canvas.style.height = containerRect.height + 'px';

    // Create an offscreen canvas to draw/transform the PNG at natural ratio
    const off = document.createElement('canvas');
    const offCtx = off.getContext('2d');

    // Couvrir tout l'écran avec l'image des lunettes (comme object-fit: cover)
    let imgW = glassesSrc.naturalWidth;
    let imgH = glassesSrc.naturalHeight;

    let drawW, drawH;
    let dx, dy;

    const containerW = canvas.width;
    const containerH = canvas.height;

    // Calcul de l'échelle pour couvrir, en tenant compte de la rotation en portrait
    isPortrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
    const scale = isPortrait
      ? Math.max(containerW / imgH, containerH / imgW) // l'image sera tournée de 90°
      : Math.max(containerW / imgW, containerH / imgH);
    drawW = Math.ceil(imgW * scale);
    drawH = Math.ceil(imgH * scale);

    off.width = Math.ceil(drawW);
    off.height = Math.ceil(drawH);

    // Draw original image scaled
    offCtx.clearRect(0, 0, off.width, off.height);
    offCtx.drawImage(glassesSrc, 0, 0, off.width, off.height);

    // Adjust transparency: reduce opacity in strong red or blue/cyan regions (simule verres semi-transparents)
    try {
      const imgData = offCtx.getImageData(0, 0, off.width, off.height);
      const data = imgData.data;

      // 1) Rendre les verres rouge/bleu plus transparents
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const a = data[i+3];

        const isRedish = (r > 135 && r - g > 25 && r - b > 25) || (r > 150 && b > 120 && r - g > 30);
        const isBlueCyan = (b > 135 && b - r > 20 && b >= g - 10) || (b > 125 && g > 125 && r < 160 && ((b + g) / 2 - r) > 25);

        if (a > 0 && (isRedish || isBlueCyan)) {
          const factor = isBlueCyan ? 0.35 : 0.5;
          const minA = isBlueCyan ? 40 : 70;
          const maxA = isBlueCyan ? 160 : 190;
          data[i+3] = Math.min(maxA, Math.max(minA, Math.floor(a * factor)));
        }
      }

      // 2) Amincir la monture à l'intérieur des verres: pixels sombres dans 2 ellipses centrales deviennent translucides
      const w = off.width;
      const h = off.height;
      const lenses = [
        { cx: w * 0.33, cy: h * 0.5 },
        { cx: w * 0.67, cy: h * 0.5 }
      ];
      const rx = w * 0.24; // demi-largeur des verres (ajustable)
      const ry = h * 0.28; // demi-hauteur des verres (ajustable)

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          if (a === 0) continue;

          // inside any lens ellipse?
          let inLens = false;
          for (let k = 0; k < lenses.length; k++) {
            const dx = (x - lenses[k].cx) / rx;
            const dy = (y - lenses[k].cy) / ry;
            if (dx * dx + dy * dy <= 1.0) { inLens = true; break; }
          }
          if (!inLens) continue;

          // Luminance (pixels très sombres = bord/monture)
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const isDark = luminance < 80;

          if (isDark) {
            // amincir fortement les bords à l'intérieur de la zone des verres
            data[idx + 3] = Math.min(120, Math.floor(a * 0.3));
          }
        }
      }

      offCtx.putImageData(imgData, 0, 0);
    } catch (e) {
      // Some browsers may restrict getImageData if tainted; we simply skip
      // If the image is local file, should be fine; otherwise overlay full image
      console.warn('Image processing skipped:', e);
    }

    // Clear destination
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw rotated inside canvas for portrait so it does not crop
    isPortrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
    if (isPortrait) {
      ctx.save();
      ctx.translate(containerW / 2, containerH / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(off, -off.width / 2, -off.height / 2);
      ctx.restore();
    } else {
      dx = Math.floor((containerW - off.width) / 2);
      dy = Math.floor((containerH - off.height) / 2);
      ctx.drawImage(off, dx, dy);
    }

    // Aucun hint, rien à faire
  }

  function applyOverlayRotation() { /* supprimé */ }

  function onResize() {
    processGlassesAndRender();
  }

  // Events
  startButton.addEventListener('click', async () => {
    showViewer();
    await startCamera();
    processGlassesAndRender();
  });

  // Aucun bouton retour

  glassesSrc.addEventListener('load', () => {
    processGlassesAndRender();
  });

  window.addEventListener('resize', onResize);
  if (window.matchMedia) {
    try {
      window.matchMedia('(orientation: portrait)').addEventListener('change', () => {
        processGlassesAndRender();
      });
    } catch (_) {
      // Safari iOS older versions do not support addEventListener on MediaQueryList
    }
  }

  // Initial state
  showIntro();
})();
