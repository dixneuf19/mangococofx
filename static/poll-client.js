(function(){
  let version = -1;
  let aborted = false;
  let gifMapCache = null;

  function ensureGifOverlay() {
    let el = document.getElementById('gif-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gif-overlay';
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.zIndex = '50';
      el.style.display = 'none';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.background = 'rgba(0,0,0,0.9)';
      el.style.pointerEvents = 'none';

      const img = document.createElement('img');
      img.id = 'gif-overlay-img';
      img.alt = 'overlay';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.objectFit = 'contain';
      img.style.transformOrigin = '50% 50%';
      img.src = '/static/chicken-run-movie-dancing.gif';

      // mapping overlay -> gif path
      const map = document.createElement('script');
      map.type = 'application/json';
      map.id = 'gif-map';
      map.textContent = JSON.stringify({
        chicken: '/static/gif/chicken-run-movie-dancing.gif',
        matrix: '/static/gif/matrix-bullet-dodge.gif',
        superman: '/static/gif/superman-flying.gif',
        mangococo: '/static/gif/mgcc.gif'
      });

      el.appendChild(img);
      document.body.appendChild(el);
      document.body.appendChild(map);
    }
    return el;
  }

  function getGifMap(){
    if (gifMapCache) return gifMapCache;
    const mapEl = document.getElementById('gif-map');
    try { gifMapCache = JSON.parse(mapEl?.textContent || '{}'); }
    catch { gifMapCache = {}; }
    return gifMapCache;
  }

  function preloadGifs(){
    const gifs = getGifMap();
    let holder = document.getElementById('gif-preloads');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'gif-preloads';
      holder.style.position = 'fixed';
      holder.style.width = '0';
      holder.style.height = '0';
      holder.style.overflow = 'hidden';
      holder.style.pointerEvents = 'none';
      holder.style.opacity = '0';
      document.body.appendChild(holder);
    }
    Object.values(gifs).forEach(src => {
      if (!src) return;
      // Create a tiny hidden img to warm cache
      const im = new Image();
      im.decoding = 'async';
      im.loading = 'eager';
      im.src = src;
      holder.appendChild(im);
    });
  }

  function updateGifLayout() {
    const img = document.getElementById('gif-overlay-img');
    const el = document.getElementById('gif-overlay');
    if (!img || !el || el.style.display === 'none') return;
    const isPortrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
    if (isPortrait) {
      img.style.transform = 'rotate(90deg)';
      img.style.width = window.innerHeight + 'px';
      img.style.height = window.innerWidth + 'px';
      img.style.maxWidth = '';
      img.style.maxHeight = '';
    } else {
      img.style.transform = 'none';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
    }
  }

  function applyState(state) {
    const overlays = (state && state.overlays) || {};
    const el = ensureGifOverlay();
    let anyOn = null;
    for (const key of Object.keys(overlays)) {
      if (overlays[key]) { anyOn = key; break; }
    }
    if (anyOn) {
      try {
        const gifMap = getGifMap();
        const src = gifMap[anyOn] || gifMap['chicken'];
        const img = document.getElementById('gif-overlay-img');
        if (img && src) img.src = src;
      } catch {}
    }
    el.style.display = anyOn ? 'flex' : 'none';
    if (anyOn) updateGifLayout();
  }

  async function pollLoop() {
    while (!aborted) {
      try {
        const res = await fetch(`/api/poll?since=${version}&timeout_ms=25000`, { cache: 'no-store' });
        if (!res.ok) throw new Error('poll failed');
        const data = await res.json();
        version = data.version;
        applyState(data.state);
      } catch (e) {
        // backoff court
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  // Prepare overlay and warm GIF cache immediately
  ensureGifOverlay();
  preloadGifs();
  pollLoop();
  window.addEventListener('resize', updateGifLayout);
  if (window.matchMedia) {
    try { window.matchMedia('(orientation: portrait)').addEventListener('change', updateGifLayout); } catch {}
  }
})();
