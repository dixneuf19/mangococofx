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
      img.src = '/static/@chicken-run-movie-dancing.gif';

      el.appendChild(img);
      document.body.appendChild(el);
    }
    return el;
  }

  function applyState(state) {
    const overlays = (state && state.overlays) || {};
    const chicken = !!overlays['chicken'];
    const el = ensureGifOverlay();
    el.style.display = chicken ? 'flex' : 'none';
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
})();
