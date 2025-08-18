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
  let processedCanvas = null; // Canvas hors-écran avec les lunettes traitées
  let processedW = 0;
  let processedH = 0;
  let rafId = null;

  // Sprite mangue (PNG local 'mango.png' si présent, sinon fallback emoji)
  let mangoImage = null;
  let mangoReady = false;
  let mangoSpriteW = 64;
  let mangoSpriteH = 64;
  let lastMangoSpawnMs = 0;
  const mangoes = []; // { x, y, vx, w, h, rotate }

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

    // Mémoriser pour l'animation; le loop dessinera à chaque frame
    processedCanvas = off;
    processedW = off.width;
    processedH = off.height;

    // Effacer la frame courante pour éviter un flash
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function applyOverlayRotation() { /* supprimé */ }

  function drawFrame(ts) {
    if (!processedCanvas) return;
    const canvas = glassesCanvas;
    const ctx = canvas.getContext('2d');
    const containerW = canvas.width;
    const containerH = canvas.height;

    // Nettoyage
    ctx.clearRect(0, 0, containerW, containerH);

    // Animation légère: rebond vertical + micro respiration
    const t = (ts || performance.now()) / 1000;
    const freqHz = 0.7; // vitesse
    const phase = t * Math.PI * 2 * freqHz;
    const amp = Math.round(Math.min(containerW, containerH) * 0.01); // 1% d'amplitude
    const bob = Math.sin(phase) * amp;
    const scale = 1 + 0.03 * Math.sin(phase * 0.5); // 3% de pulsation (breathing accentué)

    isPortrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
    ctx.save();
    ctx.translate(containerW / 2, containerH / 2 + bob);
    if (isPortrait) ctx.rotate(Math.PI / 2);
    ctx.scale(scale, scale);
    ctx.drawImage(processedCanvas, -processedW / 2, -processedH / 2);
    ctx.restore();

    // ---- FX: Mangue qui traverse l'écran ----
    animateMangoes(ts || performance.now(), containerW, containerH, ctx);
  }

  function startAnimation() {
    if (rafId) cancelAnimationFrame(rafId);
    const loop = (ts) => {
      drawFrame(ts);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }

  function onResize() {
    processGlassesAndRender();
  }

  function ensureMangoLoaded() {
    if (mangoImage || mangoReady) return;
    // Utiliser directement un sprite emoji hors-écran
    const off = document.createElement('canvas');
    const size = 64;
    off.width = size; off.height = size;
    const octx = off.getContext('2d');
    octx.clearRect(0, 0, size, size);
    octx.font = `${Math.floor(size*0.9)}px serif`;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillText('🥭', size/2, size/2);
    const dataUrl = off.toDataURL('image/png');
    const fallback = new Image();
    fallback.onload = () => {
      mangoImage = fallback;
      mangoSpriteW = size;
      mangoSpriteH = size;
      mangoReady = true;
    };
    fallback.src = dataUrl;
  }

  function spawnMango(containerW, containerH) {
    if (!mangoReady || !mangoImage) return;
    const direction = Math.random() < 0.5 ? 'ltr' : 'rtl';
    const travelTimeMs = 1800 + Math.random()*400; // ~2s
    const speedPxPerMs = (containerW + mangoSpriteW*2) / travelTimeMs;
    const y = Math.floor(containerH * (0.15 + Math.random()*0.7));
    const scale = 0.5 + Math.random()*0.5; // 0.5x .. 1x
    const w = Math.floor(mangoSpriteW * scale);
    const h = Math.floor(mangoSpriteH * scale);
    const rotate = (Math.random()-0.5) * 0.3; // petite inclinaison
    const x = direction === 'ltr' ? -w : containerW + w;
    const vx = direction === 'ltr' ? speedPxPerMs : -speedPxPerMs;
    mangoes.push({ x, y, vx, w, h, rotate });
  }

  function animateMangoes(nowMs, containerW, containerH, ctx) {
    // Spawn toutes les ~2s
    if (nowMs - lastMangoSpawnMs > 2000) {
      spawnMango(containerW, containerH);
      lastMangoSpawnMs = nowMs;
    }

    // Avancer et dessiner
    for (let i = mangoes.length - 1; i >= 0; i--) {
      const m = mangoes[i];
      m.x += m.vx * (1/60); // approx dt pour fluidité sans stocker dt
      // Retirer si hors écran
      if (m.x < -m.w*2 || m.x > containerW + m.w*2) {
        mangoes.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.rotate);
      ctx.drawImage(mangoImage, -m.w/2, -m.h/2, m.w, m.h);
      ctx.restore();
    }
  }

  // Events
  startButton.addEventListener('click', async () => {
    showViewer();
    await startCamera();
    processGlassesAndRender();
    startAnimation();
    ensureMangoLoaded();
  });

  // Aucun bouton retour

  glassesSrc.addEventListener('load', () => {
    processGlassesAndRender();
    startAnimation();
    ensureMangoLoaded();
  });

  window.addEventListener('resize', onResize);
  if (window.matchMedia) {
    try {
      window.matchMedia('(orientation: portrait)').addEventListener('change', () => {
        processGlassesAndRender();
        // Redémarrer l'animation pour recalculer le centre
        startAnimation();
      });
    } catch (_) {
      // Safari iOS older versions do not support addEventListener on MediaQueryList
    }
  }

  // Initial state
  showIntro();
})();
