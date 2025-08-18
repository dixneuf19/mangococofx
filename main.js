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

    // Dimension cible: occuper jusqu'à 90% du viewport dans les deux dimensions
    // (en portrait, l'image est tournée, donc on inverse les contraintes)
    isPortrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
    const limitW = containerW * 0.95;
    const limitH = containerH * 0.95;
    let k;
    if (isPortrait) {
      // Après rotation: width_perçue = drawH, height_perçue = drawW
      k = Math.min(limitW / imgH, limitH / imgW);
    } else {
      k = Math.min(limitW / imgW, limitH / imgH);
    }
    drawW = Math.ceil(imgW * k);
    drawH = Math.ceil(imgH * k);

    off.width = Math.ceil(drawW);
    off.height = Math.ceil(drawH);

    // Draw original image scaled
    offCtx.clearRect(0, 0, off.width, off.height);
    offCtx.drawImage(glassesSrc, 0, 0, off.width, off.height);

    // Adjust transparency: reduce opacity in strong red or blue/cyan regions (simule verres semi-transparents)
    try {
      const imgData = offCtx.getImageData(0, 0, off.width, off.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const a = data[i+3];

        // Heuristics for colored lenses (tweak thresholds as needed)
        // Red/magenta dominant
        const isRedish = (r > 135 && r - g > 25 && r - b > 25) || (r > 150 && b > 120 && r - g > 30);
        // Blue or cyan dominant (allow high green for cyan)
        const isBlueCyan = (b > 135 && b - r > 20 && b >= g - 10) || (b > 125 && g > 125 && r < 160 && ((b + g) / 2 - r) > 25);

        if (a > 0 && (isRedish || isBlueCyan)) {
          // Stronger transparency for blue/cyan to ensure it's clearly see-through
          const factor = isBlueCyan ? 0.35 : 0.5; // blue/cyan more transparent than red
          const minA = isBlueCyan ? 40 : 70;
          const maxA = isBlueCyan ? 160 : 190;
          data[i+3] = Math.min(maxA, Math.max(minA, Math.floor(a * factor)));
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
