(function(){
  const socketUrl = (() => {
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return protocol + '//' + loc.host + '/ws';
  })();

  let ws = null;
  let reconnectDelayMs = 1000;
  let overlayActive = false;

  // Create or reuse a full-screen GIF overlay element
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

  function showOverlay(name, on) {
    const el = ensureGifOverlay();
    if (name === 'chicken') {
      el.style.display = on ? 'flex' : 'none';
      overlayActive = on;
    }
  }

  function handleMessage(msg) {
    const { type, payload } = msg;
    if (type === 'overlay' && payload) {
      showOverlay(payload.name, !!payload.on);
    } else if (type === 'state' && payload && payload.overlays) {
      // Sync full state
      const chickenOn = !!payload.overlays['chicken'];
      showOverlay('chicken', chickenOn);
    }
  }

  function connect() {
    try {
      ws = new WebSocket(socketUrl);
      ws.onopen = () => { reconnectDelayMs = 1000; };
      ws.onmessage = (ev) => {
        try { handleMessage(JSON.parse(ev.data)); } catch {}
      };
      ws.onclose = () => {
        setTimeout(connect, reconnectDelayMs);
        reconnectDelayMs = Math.min(10000, reconnectDelayMs * 2);
      };
      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
    } catch {}
  }

  connect();
})();
