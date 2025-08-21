/* Mango Coco Production — Mode 3D Lunettes */
(function () {
  const intro = document.getElementById('intro');
  const viewer = document.getElementById('viewer');
  const startButton = document.getElementById('startButton');
  const video = document.getElementById('camera');
  const errorEl = document.getElementById('error');
  const glassesCanvas = document.getElementById('glassesCanvas');
  const spritesCanvas = document.getElementById('spritesCanvas');
  const glassesSrc = document.getElementById('glassesSrc');
  const captureButton = document.getElementById('captureButton');
  // Pas d'UI overlay

  let mediaStream = null;
  let isPortrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
  let processedCanvas = null; // Canvas hors-écran avec les lunettes traitées
  let processedW = 0;
  let processedH = 0;
  let rafId = null;
  let lastTickMs = 0;
  // Ajustement de remplissage (1.0 = 100% de l'écran). Plus grand peut rogner.
  let GLASSES_FILL = 1.19; // par défaut: un peu plus grand que l'écran
  function setGlassesFill(next) {
    const v = Number(next);
    if (!Number.isFinite(v)) return;
    GLASSES_FILL = Math.max(0.6, Math.min(1.5, v));
    processGlassesAndRender();
  }
  function getGlassesFill() { return GLASSES_FILL; }
  // Expose pour réglage rapide via la console
  window.setGlassesFill = setGlassesFill;
  window.getGlassesFill = getGlassesFill;

  // Sprites (emojis) qui traversent l'écran
  const SPRITE_EMOJIS = ['🥭', '🥥', '🎺', '🥁'];
  const spriteImages = []; // { img, w, h }
  let spritesReady = false;
  let lastSpriteSpawnMs = 0;
  const sprites = []; // { startX, endX, yBase, amp, phase, waves, w, h, img, elapsedMs, durationMs, baseRot, spin }

  function showIntro() {
    viewer.classList.remove('active');
    intro.classList.add('active');
    stopCamera();
  }

  function showViewer() {
    intro.classList.remove('active');
    viewer.classList.add('active');
    // Affiche le bouton capture dans ce mode
    captureButton.hidden = false;
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

      // iOS Safari nécessite playsinline + interaction utilisateur (déjà via bouton)
      video.srcObject = mediaStream;
      video.setAttribute('playsinline', '');
      await video.play().catch(() => { });
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
    captureButton.hidden = true;
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
    const limitW = containerW * GLASSES_FILL;
    const limitH = containerH * GLASSES_FILL;
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
      // La manipulation de pixels nécessite un contexte non "tainted" (HTTPS/serveur). Si ça échoue, on garde l'image brute.
      const imgData = offCtx.getImageData(0, 0, off.width, off.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

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
          data[i + 3] = Math.min(maxA, Math.max(minA, Math.floor(a * factor)));
        }
      }
      offCtx.putImageData(imgData, 0, 0);
    } catch (e) {
      // En local file:// ou sans HTTPS, getImageData peut échouer. On ne modifie pas l'image.
    }

    // Mémoriser pour l'animation; le loop dessinera à chaque frame
    processedCanvas = off;
    processedW = off.width;
    processedH = off.height;

    // Dessiner immédiatement les lunettes fixes sur le canvas overlay
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    isPortrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
    ctx.save();
    ctx.translate(containerW / 2, containerH / 2);
    if (isPortrait) ctx.rotate(Math.PI / 2);
    ctx.drawImage(processedCanvas, -processedW / 2, -processedH / 2);
    ctx.restore();
  }

  function applyOverlayRotation() { /* supprimé */ }

  function drawFrame(ts) {
    if (!processedCanvas) return;
    const containerW = spritesCanvas.width;
    const containerH = spritesCanvas.height;
    const spritesCtx = spritesCanvas.getContext('2d');

    // Nettoyage uniquement des sprites
    spritesCtx.clearRect(0, 0, containerW, containerH);

    // Timing
    const now = ts || performance.now();
    const dtMs = lastTickMs ? Math.min(50, now - lastTickMs) : 16;
    lastTickMs = now;

    // ---- FX: Sprites entre caméra et lunettes ----
    animateSprites(now, dtMs, containerW, containerH, spritesCtx);
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
    // Adapter la taille des canvases AVANT de redessiner
    const rect = document.getElementById('cameraContainer').getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    glassesCanvas.width = Math.floor(rect.width * dpr);
    glassesCanvas.height = Math.floor(rect.height * dpr);
    glassesCanvas.style.width = rect.width + 'px';
    glassesCanvas.style.height = rect.height + 'px';
    spritesCanvas.width = Math.floor(rect.width * dpr);
    spritesCanvas.height = Math.floor(rect.height * dpr);
    spritesCanvas.style.width = rect.width + 'px';
    spritesCanvas.style.height = rect.height + 'px';
    processGlassesAndRender();
  }

  // Capture d'une photo: composite vidéo + sprites + lunettes dans un canvas
  async function capturePhoto() {
    try {
      // Taille de sortie basée sur le conteneur pour coller au rendu
      const rect = document.getElementById('cameraContainer').getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const outW = Math.floor(rect.width * dpr);
      const outH = Math.floor(rect.height * dpr);

      const out = document.createElement('canvas');
      out.width = outW; out.height = outH;
      const ctx = out.getContext('2d');

      // 1) Caméra: dessine la frame vidéo courante
      // Utilise drawImage avec cover pour respecter l'object-fit
      // Calcule le rectangle source de la vidéo pour remplir outW/outH en conservant le ratio
      const vw = video.videoWidth || outW;
      const vh = video.videoHeight || outH;
      if (vw > 0 && vh > 0) {
        const scale = Math.max(outW / vw, outH / vh);
        const drawW = Math.floor(vw * scale);
        const drawH = Math.floor(vh * scale);
        const dx = Math.floor((outW - drawW) / 2);
        const dy = Math.floor((outH - drawH) / 2);
        ctx.drawImage(video, 0, 0, vw, vh, dx, dy, drawW, drawH);
      }

      // 2) Sprites: copier le canvas sprites au même scale
      if (spritesCanvas.width && spritesCanvas.height) {
        ctx.drawImage(spritesCanvas, 0, 0, spritesCanvas.width, spritesCanvas.height, 0, 0, outW, outH);
      }

      // 3) Lunettes: copier le canvas lunettes (déjà orienté)
      if (glassesCanvas.width && glassesCanvas.height) {
        ctx.drawImage(glassesCanvas, 0, 0, glassesCanvas.width, glassesCanvas.height, 0, 0, outW, outH);
      }

      // Export en blob (meilleure qualité que dataURL) et proposer partage/téléchargement
      let blob = await new Promise(resolve => out.toBlob(resolve, 'image/jpeg', 0.95));
      if (!blob) {
        // Fallback Safari anciens: via dataURL → blob
        const dataUrl = out.toDataURL('image/jpeg', 0.95);
        try {
          const resp = await fetch(dataUrl);
          blob = await resp.blob();
        } catch (_) {
          throw new Error('Capture échouée');
        }
      }

      const file = new File([blob], `mangococo-${Date.now()}.jpg`, { type: 'image/jpeg' });

      // Partage natif si disponible (mobile). Essaye d'abord avec fichiers, puis sans fichier (légende seulement)
      const shareTitle = 'Mango Coco FX';
      const shareText = 'Photo 3D 🥭🥥🎺 — @mangococo.brassband';
      if (navigator.share) {
        try {
          // Même si canShare renvoie false par prudence, de nombreux navigateurs acceptent share(files)
          await navigator.share({ files: [file], title: shareTitle, text: shareText });
          return; // succès
        } catch (err) {
          // Si le partage avec fichier n'est pas supporté, tente un partage texte simple (sans image)
          try {
            await navigator.share({ title: shareTitle, text: shareText });
            // L'image ne peut pas être jointe: on tombe ensuite sur le téléchargement pour la récupérer
          } catch (_) { /* ignore and continue to download */ }
        }
      }

      // Téléchargement direct
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      console.error('capture error', e);
    }
  }

  function ensureSpritesLoaded() {
    if (spritesReady) return;
    const size = 96;
    const font = `${Math.floor(size * 0.9)}px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, system-ui, sans-serif`;
    let loaded = 0;
    SPRITE_EMOJIS.forEach((emoji, idx) => {
      const off = document.createElement('canvas');
      off.width = size; off.height = size;
      const octx = off.getContext('2d');
      octx.clearRect(0, 0, size, size);
      octx.font = font;
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';
      octx.fillText(emoji, size / 2, size / 2);
      const img = new Image();
      img.onload = () => {
        spriteImages[idx] = { img, w: size, h: size };
        loaded += 1;
        if (loaded === SPRITE_EMOJIS.length) spritesReady = true;
      };
      img.src = off.toDataURL('image/png');
    });
  }

  function spawnSprite(containerW, containerH) {
    if (!spritesReady || spriteImages.length === 0) return;
    const kindIndex = Math.floor(Math.random() * spriteImages.length);
    const { img, w: baseW, h: baseH } = spriteImages[kindIndex] || spriteImages[0];
    const directionLTR = Math.random() < 0.5;
    const r = Math.random();
    const bias = 1 - r * r; // favorise les tailles grandes
    const scale = 1.0 + bias * 0.8; // 1.0..1.8
    const w = Math.floor(baseW * scale);
    const h = Math.floor(baseH * scale);
    const startX = directionLTR ? -w : containerW + w;
    const endX = directionLTR ? containerW + w : -w;
    const yBase = Math.floor(containerH * (0.1 + Math.random() * 0.8));
    const amp = Math.floor(containerH * (0.05 + Math.random() * 0.12));
    const waves = 0.5 + Math.random() * 1.5;
    const phase = Math.random() * Math.PI * 2;
    const durationMs = 2500 + Math.random() * 3000; // 2.5..5.5s
    const baseRot = (Math.random() - 0.5) * 0.5;
    const spin = (Math.random() - 0.5) * 0.8;
    sprites.push({ startX, endX, yBase, amp, phase, waves, w, h, img, elapsedMs: 0, durationMs, baseRot, spin });
  }

  function animateSprites(nowMs, dtMs, containerW, containerH, ctx) {
    // Fréquence: 1 toutes les ~2.5s (avec un premier spawn rapide)
    if ((sprites.length === 0 && nowMs - lastSpriteSpawnMs > 200) || (nowMs - lastSpriteSpawnMs > 2500)) {
      spawnSprite(containerW, containerH);
      lastSpriteSpawnMs = nowMs;
    }
    for (let i = sprites.length - 1; i >= 0; i--) {
      const s = sprites[i];
      s.elapsedMs += dtMs;
      const u = s.elapsedMs / s.durationMs;
      if (u >= 1) { sprites.splice(i, 1); continue; }
      const x = s.startX + (s.endX - s.startX) * u;
      const y = s.yBase + s.amp * Math.sin(s.phase + u * Math.PI * 2 * s.waves);
      const rot = s.baseRot + 0.25 * Math.sin(s.phase + u * Math.PI * 2) + s.spin * (u - 0.5);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(s.img, -s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
    }
  }

  // Events
  startButton.addEventListener('click', async () => {
    showViewer();
    await startCamera();
    processGlassesAndRender();
    startAnimation();
    ensureSpritesLoaded();
    onResize();
  });

  captureButton.addEventListener('click', capturePhoto);

  // Aucun bouton retour

  glassesSrc.addEventListener('load', () => {
    onResize(); // met à l'échelle les canvases puis dessine
    startAnimation();
    ensureSpritesLoaded();
  });

  window.addEventListener('resize', onResize);
  if (window.matchMedia) {
    try {
      window.matchMedia('(orientation: portrait)').addEventListener('change', () => {
        processGlassesAndRender();
        // Redémarrer l'animation pour recalculer le centre
        startAnimation();
        onResize();
      });
    } catch (_) {
      // Safari iOS older versions do not support addEventListener on MediaQueryList
    }
  }

  // Initial state
  showIntro();
})();
