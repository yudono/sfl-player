/**
 * Spotify Floating Lyrics - Content Script
 */

let lyricsContainer = null;
let activeIndex = -1;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// Main UI Elements
const ui = {
  container: null,
  header: null,
  content: null,
  library: null,
  lines: [],
};

// Safety wrapper for extension URLs
function safeGetURL(path) {
  try {
    return chrome.runtime.getURL(path);
  } catch (e) {
    return path; // Fallback to relative path if context invalidated
  }
}

/**
 * Message Listener for Popup - Defined at top for reliability
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.type === 'GET_METADATA') {
      const widget = document.querySelector('[data-testid="now-playing-widget"]');
      const playBtn = document.querySelector('[data-testid="control-button-playpause"]');
      const label = playBtn?.getAttribute('aria-label') || '';
      const activeLyricNode = document.querySelector('.sfl-line.active');

      // Get info directly from Spotify DOM or our UI
      const title = ui.container?.querySelector('#sfl-title')?.innerText || 
                    widget?.querySelector('[data-testid="context-item-info-title"]')?.innerText ||
                    widget?.querySelector('[data-testid="context-item-link"]')?.innerText;
      
      const artist = ui.container?.querySelector('#sfl-artist')?.innerText || 
                     widget?.querySelector('[data-testid="context-item-info-artist"]')?.innerText ||
                     widget?.querySelector('[data-testid="context-item-info-subtitles"]')?.innerText;

      const cover = ui.container?.querySelector('#sfl-cover')?.src || 
                    widget?.querySelector('[data-testid="cover-art-image"]')?.src ||
                    widget?.querySelector('img')?.src ||
                    chrome.runtime.getURL('placeholder.png');

      sendResponse({
        title: title?.trim() || 'Memuat...',
        artist: artist?.trim() || 'Artis',
        cover: cover || safeGetURL('placeholder.png'),

        isPlaying: label.toLowerCase().includes('pause'),
        activeLyric: activeLyricNode?.innerText
      });
    } else if (request.type === 'COMMAND') {
      if (request.command === 'PLAY_PAUSE') simulateControl('playpause');
      if (request.command === 'NEXT') simulateControl('skip-forward');
      if (request.command === 'PREV') simulateControl('skip-back');
      if (request.command === 'START_PIP') enterPiP();
    }
  } catch (err) {
    console.error("SFL: Message handling error", err);
  }
  return true;
});

/**
 * Initialize the Floating UI
 */
async function initUI() {
  try {
    if (document.getElementById('spotify-floating-lyrics')) return;
    if (!document.body) {
      setTimeout(initUI, 1000);
      return;
    }

    const container = document.createElement('div');
    container.id = 'spotify-floating-lyrics';
    
    // Load saved position
    const saved = await chrome.storage.local.get(['sfl_pos']);
    if (saved.sfl_pos) {
      container.style.top = saved.sfl_pos.top;
      container.style.left = saved.sfl_pos.left;
      container.style.right = 'auto';
    }

    container.innerHTML = `
      <div class="sfl-header">
        <div class="sfl-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--spotify-green)"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.49 17.3c-.22.34-.67.45-1.01.23-2.82-1.72-6.37-2.11-10.55-1.16-.39.09-.78-.17-.87-.56-.09-.39.17-.78.56-.87 4.57-1.04 8.5-.6 11.64 1.32.34.22.45.67.23 1.04zm1.46-3.26c-.28.45-.87.59-1.32.31-3.23-1.99-8.15-2.57-11.97-1.41-.51.15-1.05-.14-1.2-.65-.15-.51.14-1.05.65-1.2 4.36-1.32 9.79-.67 13.52 1.63.45.27.6.86.32 1.32zm.12-3.41c-3.87-2.3-10.26-2.51-13.98-1.38-.6.18-1.23-.17-1.41-.77-.18-.6.17-1.23.77-1.41 4.27-1.3 11.33-1.04 15.8 1.61.54.32.72 1.02.4 1.56-.32.54-1.02.72-1.58.39z"/></svg>
          SFL Player
        </div>
        <div class="sfl-controls">
          <button class="sfl-btn" id="sfl-back-btn" title="Back to Player">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </button>
          <button class="sfl-btn" id="sfl-lib-btn" title="Your Library / Playlists">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <button class="sfl-btn" id="sfl-pip-btn" title="Global Floating (Always on Top)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M13 3v7h8"></path></svg>
          </button>
          <button class="sfl-btn" id="sfl-min-btn" title="Minimize">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <button class="sfl-btn" id="sfl-close-btn" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>
      
      <div class="sfl-player">
        <div class="sfl-metadata">
          <img class="sfl-cover" id="sfl-cover" src="${safeGetURL('placeholder.png')}" alt="Album Art">
          <div class="sfl-info">
            <div class="sfl-track-title" id="sfl-title">Buka Spotify...</div>
            <div class="sfl-artist-name" id="sfl-artist">Artis</div>
          </div>
        </div>
        
        <div class="sfl-playback-controls">
          <button class="sfl-ctrl-btn" id="sfl-prev" title="Previous">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 20L9 12L19 4V20ZM5 20V4H7V20H5Z"/></svg>
          </button>
          <button class="sfl-ctrl-btn sfl-play-pause" id="sfl-play" title="Play/Pause">
            <svg id="sfl-play-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M7 20V4L18 12L7 20Z"/></svg>
          </button>
          <button class="sfl-ctrl-btn" id="sfl-next" title="Next">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4L15 12L5 20V4ZM17 4V20H19V4H17Z"/></svg>
          </button>
        </div>
      </div>
  
      <div class="sfl-content" id="sfl-content">
        <div class="sfl-empty">
          Buka tampilan lirik di Spotify (🎤) untuk melihat di sini.
        </div>
      </div>
      <div class="sfl-library-view" id="sfl-library">
        <!-- Playlists will be injected here -->
      </div>
    `;
  
    document.body.appendChild(container);
    ui.container = container;
    ui.header = container.querySelector('.sfl-header');
    ui.content = container.querySelector('#sfl-content');
    ui.library = container.querySelector('#sfl-library');
  
    setupEvents();
    startObserving();
  } catch (err) {
    console.error("SFL: Initialization failed", err);
  }
}

function setupEvents() {
  if (!ui.header || !ui.container) return;

  ui.header.onmousedown = (e) => {
    isDragging = true;
    dragOffset.x = e.clientX - ui.container.offsetLeft;
    dragOffset.y = e.clientY - ui.container.offsetTop;
    ui.header.style.cursor = 'grabbing';
  };

  document.onmousemove = (e) => {
    if (!isDragging || !ui.container) return;
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;
    ui.container.style.left = x + 'px';
    ui.container.style.top = y + 'px';
    ui.container.style.right = 'auto';
  };

  document.onmouseup = () => {
    if (isDragging && ui.container && typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({
        sfl_pos: { top: ui.container.style.top, left: ui.container.style.left }
      });
    }
    isDragging = false;
    if (ui.header) ui.header.style.cursor = 'grab';
  };

  ui.container.querySelector('#sfl-min-btn')?.addEventListener('click', () => {
    ui.container.classList.toggle('minimized');
  });

  ui.container.querySelector('#sfl-close-btn')?.addEventListener('click', () => {
    if (window.documentPictureInPicture?.window) {
      window.documentPictureInPicture.window.close();
    } else {
      ui.container.style.display = 'none';
    }
  });

  ui.container.querySelector('#sfl-back-btn')?.addEventListener('click', () => {
    ui.container.classList.remove('showing-library');
  });

  ui.container.querySelector('#sfl-lib-btn')?.addEventListener('click', () => {
    refreshLibrary();
    ui.container.classList.add('showing-library');
  });
  
  ui.container.querySelector('#sfl-play')?.addEventListener('click', () => simulateControl('playpause'));
  ui.container.querySelector('#sfl-prev')?.addEventListener('click', () => simulateControl('skip-back'));
  ui.container.querySelector('#sfl-next')?.addEventListener('click', () => simulateControl('skip-forward'));
  ui.container.querySelector('#sfl-pip-btn')?.addEventListener('click', () => enterPiP());
}

async function enterPiP() {
  if (!window.documentPictureInPicture) {
    alert("Browser Anda belum mendukung Global Floating.");
    return;
  }

  try {
    const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 380, height: 500 });
    
    // Move container IMMEDIATELY so user doesn't see a blank screen
    pipWindow.document.body.append(ui.container);
    ui.container.classList.add('in-pip');

    // Handle closing
    pipWindow.addEventListener("pagehide", () => {
      ui.container.classList.remove('in-pip');
      document.body.append(ui.container);
    });

    // INJECT STYLES (Non-blocking)
    try {
      // 0. Inject Reset CSS + Emergency Styles for the PiP window
      const resetStyle = document.createElement('style');
      resetStyle.textContent = `
        html, body { 
          margin: 0 !important; 
          padding: 0 !important; 
          background: #121212 !important; 
          overflow: hidden !important;
          width: 100vw !important;
          height: 100vh !important;
        }
        /* Emergency styles in case external CSS fails */
        #spotify-floating-lyrics {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
          color: white !important;
          font-family: sans-serif;
        }
      `;
      pipWindow.document.head.appendChild(resetStyle);

      // 1. Try simple link first
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = safeGetURL('styles.css');
      pipWindow.document.head.appendChild(link);

      // 2. Also try fetching as fallback
      fetch(safeGetURL('styles.css'))
        .then(r => r.text())
        .then(css => {
          const styleTag = document.createElement('style');
          styleTag.textContent = css;
          pipWindow.document.head.appendChild(styleTag);
        })
        .catch(e => console.warn("SFL: Fallback style fetch failed", e));
    } catch (e) {
      console.warn("SFL: Style injection error", e);
    }
  } catch (err) {
    console.error("SFL: PiP error", err);
  }
}

function simulateControl(type) {
  const bar = document.querySelector('[data-testid="now-playing-bar"]');
  const btn = (bar || document).querySelector(`[data-testid="control-button-${type}"]`);
  if (btn) btn.click();
}

function syncMetadata() {
  try {
    const widget = document.querySelector('[data-testid="now-playing-widget"]');
    if (!widget || !ui.container) return;

    const titleNode = widget.querySelector('[data-testid="context-item-info-title"]') || 
                      widget.querySelector('[data-testid="context-item-link"]');
    const artistNode = widget.querySelector('[data-testid="context-item-info-artist"]') || 
                       widget.querySelector('[data-testid="context-item-info-subtitles"]');
    const coverNode = widget.querySelector('[data-testid="cover-art-image"]');

    const titleEl = ui.container.querySelector('#sfl-title');
    const artistEl = ui.container.querySelector('#sfl-artist');
    const coverEl = ui.container.querySelector('#sfl-cover');

    if (titleNode && titleEl) {
      const text = titleNode.innerText.trim();
      if (titleEl.innerText !== text) titleEl.innerText = text;
    }
    
    if (artistNode && artistEl) {
      const text = artistNode.innerText.trim();
      if (artistEl.innerText !== text) artistEl.innerText = text;
    }
    
    if (coverNode?.src && coverEl) {
      if (coverEl.src !== coverNode.src) coverEl.src = coverNode.src;
    } else if (coverEl && !coverEl.src.includes('placeholder.png')) {
      coverEl.src = safeGetURL('placeholder.png');
    }

    syncPlaybackState();
  } catch (err) {
    console.debug("SFL: Metadata sync paused (context issue)");
  }
}

function syncPlaybackState() {
  const playBtn = document.querySelector('[data-testid="control-button-playpause"]');
  const icon = ui.container?.querySelector('#sfl-play-icon path');
  if (!playBtn || !icon) return;

  const label = playBtn.getAttribute('aria-label') || '';
  if (label.toLowerCase().includes('pause')) {
    icon.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
  } else {
    icon.setAttribute('d', 'M7 20V4L18 12L7 20Z');
  }
}

function refreshLibrary() {
  if (!ui.library) return;
  try {
    const items = Array.from(document.querySelectorAll('[data-testid="library-item"]'));
    
    if (items.length === 0) {
      ui.library.innerHTML = `<div class="sfl-empty" style="padding: 20px;">Sidebar pustaka tidak ditemukan. Pastikan sidebar Spotify terbuka.</div>`;
      return;
    }

    ui.library.innerHTML = '';
    items.forEach(item => {
      try {
        const title = item.querySelector('[data-testid="internal-track-link"], [data-testid="item-title"]')?.innerText;
        const meta = item.querySelector('[data-testid="item-subtitle"]')?.innerText;
        const img = item.querySelector('img');
        const imgSrc = img?.src;
        const isArtist = meta?.toLowerCase().includes('artist') || meta?.toLowerCase().includes('artis');

        const el = document.createElement('div');
        el.className = 'sfl-lib-item';
        el.innerHTML = `
          <img src="${imgSrc || safeGetURL('placeholder.png')}" class="sfl-lib-img ${isArtist ? 'artist' : ''}">
          <div class="sfl-lib-info">
            <div class="sfl-lib-name">${title || 'Tanpa Judul'}</div>
            <div class="sfl-lib-meta">${meta || ''}</div>
          </div>
        `;

        el.onclick = () => {
          const clickTarget = item.querySelector('[role="button"], .e-10310-legacy-list-row__on-click');
          if (clickTarget) {
            clickTarget.click();
            ui.container.classList.remove('showing-library');
          }
        };

        ui.library.appendChild(el);
      } catch (e) { /* Skip individual failed items */ }
    });
  } catch (err) {
    ui.library.innerHTML = `<div class="sfl-empty">Gagal memuat pustaka.</div>`;
  }
}

function syncLyrics() {
  try {
    if (!ui.content) return;
    const targetLines = Array.from(document.querySelectorAll('[data-testid="lyrics-line"]'));

    if (targetLines.length === 0) {
      if (ui.lines.length > 0) {
         ui.content.innerHTML = `<div class="sfl-empty">Lirik hilang. Pastikan mode lirik (🎤) aktif.</div>`;
         ui.lines = [];
         ui.content.dataset.lyricsText = '';
      }
      return;
    }

    const lyricsData = targetLines.map(line => line.innerText.trim()).filter(t => t !== '');
    const lyricsHash = lyricsData.join('|');
    
    if (ui.content.dataset.lyricsText !== lyricsHash) {
      ui.content.innerHTML = '';
      ui.lines = lyricsData.map((text) => {
        const el = document.createElement('div');
        el.className = 'sfl-line';
        el.innerText = text;
        ui.content.appendChild(el);
        return el;
      });
      ui.content.dataset.lyricsText = lyricsHash;
      activeIndex = -1;
    }

    let currentActiveDOMIndex = -1;
    targetLines.forEach((line, idx) => {
      const style = window.getComputedStyle(line);
      const isWhite = style.color === 'rgb(255, 255, 255)' || style.color === 'white';
      const isFullOpacity = parseFloat(style.opacity) > 0.8; // Lowered threshold for better detection
      const isActiveByClass = line.classList.contains('active') || line.dataset.active === 'true';

      if (((isWhite && isFullOpacity) || isActiveByClass) && line.innerText.trim() !== '') {
        currentActiveDOMIndex = idx;
      }
    });

    if (currentActiveDOMIndex !== -1) {
      const activeText = targetLines[currentActiveDOMIndex].innerText.trim();
      const uiIndex = ui.lines.findIndex((el, i) => el.innerText === activeText && (i >= activeIndex));
      if (uiIndex !== -1 && uiIndex !== activeIndex) {
        activeIndex = uiIndex;
        updateActiveLine(uiIndex);
      }
    }
  } catch (err) {
    console.debug("SFL: Lyrics sync paused (context issue)");
  }
}

function updateActiveLine(index) {
  ui.lines.forEach((line, i) => {
    line.classList.toggle('active', i === index);
    line.classList.toggle('passed', i < index);
  });

  const activeLine = ui.lines[index];
  if (activeLine && ui.content) {
    // Standard native centering - more robust and smoother
    activeLine.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });
  }
}

function startObserving() {
  const observer = new MutationObserver(() => {
    syncLyrics();
    syncMetadata();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  syncMetadata();
}

// Initial delay to ensure Spotify app is loaded
setTimeout(initUI, 3000);
