/* Mango Coco Production — Mode 3D Lunettes */
(function() {
  const intro = document.getElementById('intro');
  const viewer = document.getElementById('viewer');
  const startButton = document.getElementById('startButton');
  const backButton = document.getElementById('backButton');
  const video = document.getElementById('camera');
  const errorEl = document.getElementById('error');
  const glassesCanvas = document.getElementById('glassesCanvas');
  const glassesSrc = document.getElementById('glassesSrc');
  const orientationHint = document.getElementById('orientationHint');

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
      const constraints = {
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
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

    // We will fit the glasses in the middle ~70% of the shorter side
    const targetShortSideRatio = 0.7;

    let imgW = glassesSrc.naturalWidth;
    let imgH = glassesSrc.naturalHeight;

    let drawW, drawH;
    let dx, dy;

    const containerW = canvas.width;
    const containerH = canvas.height;

    // If portrait, rotate the final canvas via CSS; we still draw un-rotated here then CSS rotates
    // Compute draw size to fit best within container short side
    const shortSide = Math.min(containerW, containerH);
    const targetSize = shortSide * targetShortSideRatio;
    const imgAspect = imgW / imgH;

    if (imgAspect >= 1) {
      drawW = targetSize;
      drawH = targetSize / imgAspect;
    } else {
      drawH = targetSize;
      drawW = targetSize * imgAspect;
    }

    off.width = Math.ceil(drawW);
    off.height = Math.ceil(drawH);

    // Draw original image scaled
    offCtx.clearRect(0, 0, off.width, off.height);
    offCtx.drawImage(glassesSrc, 0, 0, off.width, off.height);

    // Adjust transparency: reduce opacity in strong red or blue regions (simule verres semi-transparents)
    try {
      const imgData = offCtx.getImageData(0, 0, off.width, off.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const a = data[i+3];

        // Heuristics for colored lenses (tweak thresholds as needed)
        const isRedish = r > 140 && g < 120 && b < 120 && r - Math.max(g, b) > 30;
        const isBluish = b > 140 && r < 120 && g < 120 && b - Math.max(r, g) > 30;

        if ((isRedish || isBluish) && a > 0) {
          // Make these pixels semi-transparent but not invisible
          data[i+3] = Math.min(200, Math.max(90, Math.floor(a * 0.55))); // alpha 90..200
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

    // Update UI hint state
    applyOverlayRotation();
  }

  function applyOverlayRotation() {
    isPortrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
    orientationHint.style.display = isPortrait ? 'inline-flex' : 'none';
  }

  function onResize() {
    processGlassesAndRender();
  }

  // Events
  startButton.addEventListener('click', async () => {
    showViewer();
    await startCamera();
    processGlassesAndRender();
  });

  backButton.addEventListener('click', () => {
    showIntro();
  });

  glassesSrc.addEventListener('load', () => {
    processGlassesAndRender();
  });

  window.addEventListener('resize', onResize);
  if (window.matchMedia) {
    try {
      window.matchMedia('(orientation: portrait)').addEventListener('change', () => {
        applyOverlayRotation();
        processGlassesAndRender();
      });
    } catch (_) {
      // Safari iOS older versions do not support addEventListener on MediaQueryList
    }
  }

  // Initial state
  showIntro();
})();
