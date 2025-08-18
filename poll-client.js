(function(){
  let version = -1;
  let aborted = false;

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

      el.appendChild(img);
      document.body.appendChild(el);
    }
    return el;
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
    const chicken = !!overlays['chicken'];
    const el = ensureGifOverlay();
    el.style.display = chicken ? 'flex' : 'none';
    if (chicken) updateGifLayout();
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

  pollLoop();
  window.addEventListener('resize', updateGifLayout);
  if (window.matchMedia) {
    try { window.matchMedia('(orientation: portrait)').addEventListener('change', updateGifLayout); } catch {}
  }
})();
