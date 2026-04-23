/**
 * Spotify Floating Lyrics - Content Script
 */

const isYouTube = window.location.hostname.includes('youtube.com');
const isSpotify = window.location.hostname.includes('spotify.com');
const isBilibili = window.location.hostname.includes('bilibili.tv');
const serviceName = isYouTube ? 'YouTube' : (isBilibili ? 'Bilibili' : 'Spotify');
const serviceColor = isYouTube ? '#ff0000' : (isBilibili ? '#00aeec' : '#1db954');
let lyricsContainer = null;
let activeIndex = -1;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let currentLibraryView = 'root'; // 'root' (playlists) or 'tracks'
let cachedCSS = ''; // Cache styles for PiP

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
      let title = 'Memuat...';
      let artist = 'SFL Player';
      let cover = safeGetURL('placeholder.png');

      if (isYouTube) {
        title = document.querySelector('h1.ytd-watch-flexy')?.innerText || document.title;
        artist = document.querySelector('#upload-info #channel-name a')?.innerText || 'YouTube Video';
        cover = `https://img.youtube.com/vi/${new URLSearchParams(window.location.search).get('v')}/mqdefault.jpg`;
      } else if (isBilibili) {
        title = document.querySelector('.video-info-title-text')?.innerText || 
                document.querySelector('.bstar-player__main-title-text')?.innerText || 
                document.title;
        artist = document.querySelector('.up-name')?.innerText || 'Bilibili Creator';
        cover = document.querySelector('.bstar-player__main-bg')?.src || 
                document.querySelector('.video-play__player img')?.src || 
                safeGetURL('placeholder.png');
      } else {
        const widget = document.querySelector('[data-testid="now-playing-widget"]');
        title = widget?.querySelector('[data-testid="context-item-info-title"]')?.innerText || 
                widget?.querySelector('[data-testid="context-item-link"]')?.innerText || 'Memuat...';
        artist = widget?.querySelector('[data-testid="context-item-info-artist"]')?.innerText || 
                 widget?.querySelector('[data-testid="context-item-info-subtitles"]')?.innerText || 'SFL Player';
        cover = widget?.querySelector('[data-testid="cover-art-image"]')?.src || safeGetURL('placeholder.png');
      }

      if (!ui.container || !ui.content) {
        sendResponse({
          title: 'Memuat...',
          artist: 'SFL Player',
          cover: safeGetURL('placeholder.png'),
          isPlaying: false,
          activeLyric: null,
          url: window.location.href
        });
        return;
      }

      // Update cover from UI if available
      const uiCover = ui.container?.querySelector('#sfl-cover')?.src;
      const finalCover = uiCover || cover;

      sendResponse({
        title: ui.container.querySelector('#sfl-title')?.innerText || title,
        artist: ui.container.querySelector('#sfl-artist')?.innerText || artist,
        cover: finalCover,
        isPlaying: !document.querySelector(isYouTube || isBilibili ? 'video' : '[data-testid="control-button-playpause"]')?.paused,
        activeLyric: ui.content.querySelector('.active')?.innerText,
        url: window.location.href
      });
    } else if (request.type === 'COMMAND') {
      if (request.command === 'PLAY_PAUSE') simulateControl('playpause');
      if (request.command === 'NEXT') simulateControl('skip-forward');
      if (request.command === 'PREV') simulateControl('skip-back');
      if (request.command === 'TOGGLE_LYRICS') simulateControl('lyrics');
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

    // Load CSS for PiP
    fetch(safeGetURL('styles.css'))
      .then(r => r.text())
      .then(css => { cachedCSS = css; })
      .catch(e => {
        console.warn("SFL: Fetch failed, trying fallback CSS caching", e);
        // Fallback: Try to find injected CSS in document
        try {
          const extensionSheets = Array.from(document.styleSheets).filter(s => s.href && s.href.includes(chrome.runtime.id));
          if (extensionSheets.length > 0) {
            // We can't always read cssRules due to COOP/CORS, but worth a shot
            cachedCSS = Array.from(extensionSheets[0].cssRules).map(r => r.cssText).join('\n');
          }
        } catch (err) {}
      });

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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${serviceColor}">
            ${isYouTube 
              ? '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>' 
              : (isBilibili 
                ? '<path d="M17.869 3L15.01 5.859C14.812 5.71 14.59 5.59 14.353 5.5L16.445 3.408C16.641 3.212 16.641 2.895 16.445 2.699C16.249 2.503 15.932 2.503 15.736 2.699L12.757 5.678C12.474 5.562 12.176 5.5 11.859 5.5C11.542 5.5 11.244 5.562 10.961 5.678L7.982 2.699C7.786 2.503 7.469 2.503 7.273 2.699C7.077 2.895 7.077 3.212 7.273 3.408L9.365 5.5C9.128 5.59 8.906 5.71 8.708 5.859L5.849 3C5.653 2.804 5.336 2.804 5.141 3C4.945 3.196 4.945 3.513 5.141 3.709L8.12 6.688C5.091 6.688 2.645 9.134 2.645 12.163V16.326C2.645 19.355 5.091 21.801 8.12 21.801H15.598C18.627 21.801 21.073 19.355 21.073 16.326V12.163C21.073 9.134 18.627 6.688 15.598 6.688L18.577 3.709C18.773 3.513 18.773 3.196 18.577 3C18.381 2.804 18.064 2.804 17.869 3ZM8.307 10.914C8.91 10.914 9.398 11.402 9.398 12.005V13.821C9.398 14.424 8.91 14.912 8.307 14.912C7.704 14.912 7.216 14.424 7.216 13.821V12.005C7.216 11.402 7.704 10.914 8.307 10.914ZM15.412 10.914C16.015 10.914 16.503 11.402 16.503 12.005V13.821C16.503 14.424 16.015 14.912 15.412 14.912C14.809 14.912 14.321 14.424 14.321 13.821V12.005C14.321 11.402 14.809 10.914 15.412 10.914Z"/>'
                : '<path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.49 17.3c-.22.34-.67.45-1.01.23-2.82-1.72-6.37-2.11-10.55-1.16-.39.09-.78-.17-.87-.56-.09-.39.17-.78.56-.87 4.57-1.04 8.5-.6 11.64 1.32.34.22.45.67.23 1.04zm1.46-3.26c-.28.45-.87.59-1.32.31-3.23-1.99-8.15-2.57-11.97-1.41-.51.15-1.05-.14-1.2-.65-.15-.51.14-1.05.65-1.2 4.36-1.32 9.79-.67 13.52 1.63.45.27.6.86.32 1.32zm.12-3.41c-3.87-2.3-10.26-2.51-13.98-1.38-.6.18-1.23-.17-1.41-.77-.18-.6.17-1.23.77-1.41 4.27-1.3 11.33-1.04 15.8 1.61.54.32.72 1.02.4 1.56-.32.54-1.02.72-1.58.39z"/>')}
          </svg>
          SFL Player
        </div>
        <div class="sfl-controls">
          <button class="sfl-btn" id="sfl-back-btn" title="Back to Player">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </button>
          <button class="sfl-btn" id="sfl-lib-btn" title="Your Library" style="${(isYouTube || isBilibili) ? 'display:none' : ''}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <button class="sfl-btn" id="sfl-pip-btn" title="Global Floating">
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
          <img class="sfl-cover" id="sfl-cover" src="${safeGetURL('placeholder.png')}" alt="Cover Art">
          <div class="sfl-info">
            <div class="sfl-track-title" id="sfl-title">Memuat...</div>
            <div class="sfl-artist-name" id="sfl-artist">SFL Player</div>
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
          <button class="sfl-ctrl-btn" id="sfl-lyrics-toggle" title="${isYouTube ? 'Toggle Subtitles (C)' : 'Toggle Lyrics (Mic)'}">
            ${isYouTube 
              ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5V10h-2v4h2v-1.5H11V15c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-6c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2zm7 0h-1.5V10h-2v4h2v-1.5H18V15c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-6c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2z"/></svg>'
              : '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M13.426 2.574a2.831 2.831 0 0 0-4.797 1.55l3.247 3.247a2.831 2.831 0 0 0 1.55-4.797M10.5 8.118l-2.619-2.62L4.74 9.075 2.065 12.12a1.287 1.287 0 0 0 1.816 1.816l3.06-2.688 3.56-3.129zM7.12 4.094a4.331 4.331 0 1 1 4.786 4.786l-3.974 3.493-3.06 2.689a2.787 2.787 0 0 1-3.933-3.933l2.676-3.045z" fill="currentColor"></path></svg>'}
          </button>
        </div>
      </div>
  
      <div class="sfl-content" id="sfl-content" class="${(isYouTube || isBilibili) ? 'yt-mode' : ''}">
        <div class="sfl-empty">
          ${isYouTube ? 'Nyalakan subtitle di YouTube (C) untuk melihat di sini.' : 
           isBilibili ? 'Nyalakan subtitle di Bstation untuk melihat di sini.' : 
           'Buka tampilan lirik di Spotify (🎤) untuk melihat di sini.'}
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

  const onMouseDown = (e) => {
    isDragging = true;
    const rect = ui.container.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    ui.container.classList.add('dragging');
    ui.header.style.cursor = 'grabbing';
    e.preventDefault(); // Prevent text selection
  };

  const onMouseMove = (e) => {
    if (!isDragging || !ui.container) return;
    
    // Use requestAnimationFrame for smoother dragging
    requestAnimationFrame(() => {
      if (!isDragging) return;
      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;
      ui.container.style.left = x + 'px';
      ui.container.style.top = y + 'px';
      ui.container.style.right = 'auto';
      ui.container.style.bottom = 'auto';
    });
  };

  const onMouseUp = () => {
    if (isDragging && ui.container) {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.runtime?.id) {
          chrome.storage.local.set({
            sfl_pos: { top: ui.container.style.top, left: ui.container.style.left }
          });
        }
      } catch (err) {}
    }
    isDragging = false;
    if (ui.container) ui.container.classList.remove('dragging');
    if (ui.header) ui.header.style.cursor = 'grab';
  };

  ui.header.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

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
    if (currentLibraryView === 'tracks') {
      refreshLibrary('root');
    } else {
      ui.container.classList.remove('showing-library');
    }
  });

  ui.container.querySelector('#sfl-lib-btn')?.addEventListener('click', () => {
    refreshLibrary('root');
    ui.container.classList.add('showing-library');
  });
  
  ui.container.querySelector('#sfl-play')?.addEventListener('click', () => simulateControl('playpause'));
  ui.container.querySelector('#sfl-prev')?.addEventListener('click', () => simulateControl('skip-back'));
  ui.container.querySelector('#sfl-next')?.addEventListener('click', () => simulateControl('skip-forward'));
  ui.container.querySelector('#sfl-lyrics-toggle')?.addEventListener('click', () => simulateControl('lyrics'));
  ui.container.querySelector('#sfl-pip-btn')?.addEventListener('click', () => enterPiP());
}

async function enterPiP() {
  if (!window.documentPictureInPicture) {
    alert("Browser Anda belum mendukung Global Floating.");
    return;
  }

  try {
    const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 380, height: 600 });
    
    // 0. Inject Emergency Reset Styles (CRITICAL for non-blank screen)
    const emergencyStyle = pipWindow.document.createElement('style');
    emergencyStyle.textContent = `
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #121212 !important;
        overflow: hidden !important;
      }
      #spotify-floating-lyrics {
        position: relative !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        display: flex !important;
        flex-direction: column !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
      }
    `;
    pipWindow.document.head.append(emergencyStyle);

    // 1. Inject Cached Extension CSS (The most reliable way)
    if (cachedCSS) {
      const mainStyle = pipWindow.document.createElement('style');
      mainStyle.textContent = cachedCSS;
      pipWindow.document.head.append(mainStyle);
    }

    // 2. Fallback: Copy other style sheets if any
    [...document.styleSheets].forEach(styleSheet => {
      try {
        const cssRules = [...styleSheet.cssRules].map(rule => rule.cssText).join('');
        const newStyle = pipWindow.document.createElement('style');
        newStyle.textContent = cssRules;
        pipWindow.document.head.append(newStyle);
      } catch (e) {
        if (styleSheet.href && !styleSheet.href.includes('styles.css')) {
          const link = pipWindow.document.createElement('link');
          link.rel = 'stylesheet';
          link.href = styleSheet.href;
          pipWindow.document.head.append(link);
        }
      }
    });

    // Move the container to the PiP window
    pipWindow.document.body.append(ui.container);
    ui.container.classList.add('in-pip');

    // YouTube / Bilibili: Move video to PiP window if possible
    let originalVideoParent = null;
    let videoElement = null;
    let timeUpdateHandler = null;

    if (isYouTube || isBilibili) {
      videoElement = document.querySelector(isYouTube ? 'video.html5-main-video' : '#bilibiliPlayer video');
      if (videoElement) {
        originalVideoParent = videoElement.parentNode;
        const videoWrap = pipWindow.document.createElement('div');
        videoWrap.id = 'sfl-video-wrap';
        
        // Custom Controls HTML
        videoWrap.innerHTML = `
          <div class="sfl-video-overlay">
            <div class="sfl-progress-wrap">
              <input type="range" id="sfl-video-progress" min="0" max="100" value="0">
            </div>
            <div class="sfl-video-controls">
              <button class="sfl-btn" id="sfl-pip-play">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M7 20V4L18 12L7 20Z"/></svg>
              </button>
              <button class="sfl-btn" id="sfl-pip-next">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4L15 12L5 20V4ZM17 4V20H19V4H17Z"/></svg>
              </button>
              <button class="sfl-btn" id="sfl-pip-cc" style="margin-left: auto;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5V10h-2v4h2v-1.5H11V15c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-6c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2zm7 0h-1.5V10h-2v4h2v-1.5H18V15c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-6c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2z"/></svg>
              </button>
            </div>
          </div>
        `;

        videoElement.style.cssText = 'width:100%; height:100%; object-fit:contain;';
        videoWrap.prepend(videoElement);
        ui.container.querySelector('.sfl-player').prepend(videoWrap);

        // Hide old controls on YouTube
        ui.container.querySelector('.sfl-playback-controls').style.display = 'none';
        ui.container.querySelector('.sfl-metadata').style.display = 'none';

        // Add Listeners
        const playBtn = videoWrap.querySelector('#sfl-pip-play');
        const nextBtn = videoWrap.querySelector('#sfl-pip-next');
        const ccBtn = videoWrap.querySelector('#sfl-pip-cc');
        const progress = videoWrap.querySelector('#sfl-video-progress');

        const updatePlayIcon = () => {
          const path = playBtn.querySelector('path');
          if (videoElement.paused) {
            path.setAttribute('d', 'M7 20V4L18 12L7 20Z');
          } else {
            path.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
          }
        };

        playBtn.onclick = () => {
          if (videoElement.paused) videoElement.play();
          else videoElement.pause();
          updatePlayIcon();
        };

        nextBtn.onclick = () => simulateControl('skip-forward');
        ccBtn.onclick = () => simulateControl('lyrics');

        timeUpdateHandler = () => {
          const pct = (videoElement.currentTime / videoElement.duration) * 100;
          progress.value = pct || 0;
          updatePlayIcon();
          
          // Dynamic accent color for progress bar
          progress.style.accentColor = serviceColor;
        };
        videoElement.addEventListener('timeupdate', timeUpdateHandler);

        progress.oninput = () => {
          const time = (progress.value / 100) * videoElement.duration;
          videoElement.currentTime = time;
        };
      }
    }

    // Handle PiP window closing
    pipWindow.addEventListener("pagehide", () => {
      ui.container.classList.remove('in-pip');
      if (videoElement && originalVideoParent) {
        if (timeUpdateHandler) videoElement.removeEventListener('timeupdate', timeUpdateHandler);
        videoElement.style.cssText = '';
        originalVideoParent.append(videoElement);
        const wrap = ui.container.querySelector('#sfl-video-wrap');
        if (wrap) wrap.remove();
        
        // Restore controls
        ui.container.querySelector('.sfl-playback-controls').style.display = 'flex';
        ui.container.querySelector('.sfl-metadata').style.display = 'flex';
      }
      document.body.append(ui.container);
    });

    // Mirror drag listeners to the PiP window
    // This solves the "mouse outside element" issue when dragging in PiP
    pipWindow.addEventListener('mousemove', (e) => {
      window.dispatchEvent(new MouseEvent('mousemove', {
        clientX: e.clientX + pipWindow.screenX,
        clientY: e.clientY + pipWindow.screenY
      }));
    });
  } catch (err) {
    console.error("SFL: PiP error", err);
  }
}

function simulateControl(action) {
  if (isYouTube) {
    if (action === 'playpause') {
      const video = document.querySelector('video');
      if (video) video.paused ? video.play() : video.pause();
    }
    if (action === 'skip-forward') document.querySelector('.ytp-next-button')?.click();
    if (action === 'skip-back') window.history.back();
    if (action === 'lyrics') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    return;
  }

  if (isBilibili) {
    if (action === 'playpause') document.querySelector('.player-mobile-state-icon')?.click();
    if (action === 'skip-forward') document.querySelector('.player-mobile-control-btn-next-episode')?.click();
    if (action === 'lyrics') document.querySelector('.player-mobile-control-btn-subtitle')?.click();
    return;
  }

  const bar = document.querySelector('[data-testid="now-playing-bar"]');
  let btn;
  
  if (action === 'lyrics') {
    btn = document.querySelector('[data-testid="lyrics-button"]');
  } else {
    btn = (bar || document).querySelector(`[data-testid="control-button-${action}"]`);
  }
  
  if (btn) btn.click();
}

function syncMetadata() {
  try {
    if (!ui.container) return;

    if (isYouTube) {
      const titleNode = document.querySelector('.ytp-title-link') || 
                        document.querySelector('h1.ytd-watch-metadata') || 
                        document.querySelector('.ytd-video-primary-info-renderer h1');
      
      const artistNode = document.querySelector('.ytp-title-channel-name') || 
                         document.querySelector('#owner-and-teaser #text.ytd-channel-name') || 
                         document.querySelector('#owner-name a');

      const videoId = new URLSearchParams(window.location.search).get('v');
      
      if (titleNode) {
        const titleText = titleNode.innerText.trim();
        if (titleText) ui.container.querySelector('#sfl-title').innerText = titleText;
      }
      
      if (artistNode) {
        const artistText = artistNode.innerText.trim();
        if (artistText) ui.container.querySelector('#sfl-artist').innerText = artistText;
      }

      if (videoId) {
        ui.container.querySelector('#sfl-cover').src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
      }
      return;
    }

    if (isBilibili) {
      const titleNode = document.querySelector('.video-info-title-text') || 
                        document.querySelector('.bstar-player__main-title-text');
      const artistNode = document.querySelector('.up-name');
      const coverNode = document.querySelector('.bstar-player__main-bg') || 
                         document.querySelector('.video-play__player img');
      
      const titleEl = ui.container.querySelector('#sfl-title');
      const artistEl = ui.container.querySelector('#sfl-artist');
      const coverEl = ui.container.querySelector('#sfl-cover');
      
      if (titleNode && titleEl) titleEl.innerText = titleNode.innerText.trim();
      else if (titleEl) titleEl.innerText = document.title.split('-')[0].trim();

      if (artistNode && artistEl) artistEl.innerText = artistNode.innerText.trim();
      
      if (coverNode?.src && coverEl) coverEl.src = coverNode.src;

      syncPlaybackState();
      return;
    }

    const widget = document.querySelector('[data-testid="now-playing-widget"]');
    if (!widget) return;

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
  if (!ui.container) return;

  let isPlaying = false;
  if (isYouTube || isBilibili) {
    isPlaying = !document.querySelector('video')?.paused;
  } else {
    const playBtn = document.querySelector('[data-testid="control-button-playpause"]');
    isPlaying = playBtn?.getAttribute('aria-label') === 'Pause';
  }

  const icon = ui.container.querySelector('#sfl-play-icon path');
  if (!icon) return;

  if (isPlaying) {
    icon.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
  } else {
    icon.setAttribute('d', 'M7 20V4L18 12L7 20Z');
  }
}

function refreshLibrary(view = 'root') {
  if (!ui.library) return;
  currentLibraryView = view;
  
  try {
    if (view === 'root') {
      // SCRAPE PLAYLISTS/ARTISTS FROM SIDEBAR
      let items = Array.from(document.querySelectorAll('[data-encore-id="listRow"]'));
      if (items.length === 0) {
        items = Array.from(document.querySelectorAll('[data-testid="library-item"]'));
      }
      
      if (items.length === 0) {
        ui.library.innerHTML = `
          <div class="sfl-empty" style="padding: 20px;">
            Sidebar pustaka tidak ditemukan.<br>
            <small style="opacity: 0.7;">Pastikan sidebar Spotify terbuka dalam tampilan list.</small>
          </div>`;
        return;
      }

      ui.library.innerHTML = '<div class="sfl-lib-header">Unit Pustaka</div>';
      items.forEach(item => {
        try {
          const title = item.querySelector('[data-encore-id="listRowTitle"], [data-testid="internal-track-link"], [data-testid="item-title"]')?.innerText;
          const meta = item.querySelector('[data-encore-id="listRowSubtitle"], [data-testid="item-subtitle"]')?.innerText;
          const img = item.querySelector('[data-testid="entity-image"], img');
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
            const clickTarget = item.querySelector('.e-10310-legacy-list-row__on-click, [role="button"], .e-10310-legacy-list-row__row-button');
            if (clickTarget) {
              clickTarget.click();
              // Loading state
              ui.library.innerHTML = `<div class="sfl-empty" style="padding: 40px;">Memuat daftar lagu...</div>`;
              setTimeout(() => refreshLibrary('tracks'), 1200);
            }
          };

          ui.library.appendChild(el);
        } catch (e) { }
      });
    } else {
      // SCRAPE TRACKS FROM MAIN VIEW
      const trackRows = Array.from(document.querySelectorAll('[data-testid="tracklist-row"]'));
      const listTitle = document.querySelector('[data-encore-id="adaptiveTitle"]')?.innerText || 
                        document.querySelector('h1')?.innerText || "Daftar Lagu";
      
      if (trackRows.length === 0) {
        ui.library.innerHTML = `
          <div class="sfl-empty" style="padding: 20px;">
            Daftar lagu tidak ditemukan.<br>
            <small style="opacity: 0.7;">Klik baris playlist di Spotify atau tunggu sebentar.</small>
          </div>
          <button class="sfl-lib-item" id="sfl-retry-tracks" style="justify-content: center; margin-top: 10px; background: rgba(255,255,255,0.1);">Coba Lagi</button>
        `;
        ui.library.querySelector('#sfl-retry-tracks')?.addEventListener('click', () => refreshLibrary('tracks'));
        return;
      }

      ui.library.innerHTML = `<div class="sfl-lib-header">${listTitle}</div>`;
      trackRows.forEach(row => {
        try {
          const title = row.querySelector('[data-testid="internal-track-link"]')?.innerText || 
                        row.querySelector('.lkqOvzjBxm0err2b')?.innerText;
          const img = row.querySelector('img');
          const imgSrc = img?.src;

          const el = document.createElement('div');
          el.className = 'sfl-lib-item track-item';
          el.innerHTML = `
            <img src="${imgSrc || safeGetURL('placeholder.png')}" class="sfl-lib-img">
            <div class="sfl-lib-info">
              <div class="sfl-lib-name">${title || 'Tanpa Judul'}</div>
            </div>
            <div class="sfl-track-play">▶</div>
          `;

          el.onclick = () => {
            const playBtn = row.querySelector('.qrR_ZslfmF07R7Kb, [data-testid="play-button"]');
            if (playBtn) {
              playBtn.click();
              // Back to lyrics after playing
              ui.container.classList.remove('showing-library');
            }
          };

          ui.library.appendChild(el);
        } catch (e) { }
      });
    }
  } catch (err) {
    ui.library.innerHTML = `<div class="sfl-empty">Gagal memuat pustaka.</div>`;
    console.error("SFL Library Error:", err);
  }
}

function syncLyrics() {
  if (!ui.content) return;

  if (isYouTube) {
    const captionSegments = Array.from(document.querySelectorAll('.ytp-caption-segment'));
    if (captionSegments.length > 0) {
      const fullCaption = captionSegments.map(s => s.innerText).join(' ');
      ui.content.innerHTML = `<div class="sfl-line active">${fullCaption}</div>`;
    } else {
      ui.content.innerHTML = `<div class="sfl-empty">Nyalakan subtitle di YouTube (C) untuk melihat di sini.</div>`;
    }
    return;
  }

  if (isBilibili) {
    const subtitleGroups = Array.from(document.querySelectorAll('.subtitle-group'));
    const assSubtitles = Array.from(document.querySelectorAll('.BILI-SUBTITLEX-ASS-dialogue span'));
    const allSubtitles = [...subtitleGroups, ...assSubtitles];
    
    if (allSubtitles.length > 0) {
      const fullText = allSubtitles.map(g => g.innerText).filter(t => t.trim()).join(' ');
      if (fullText) {
        ui.content.innerHTML = `<div class="sfl-line active">${fullText}</div>`;
      }
    } else {
      ui.content.innerHTML = `<div class="sfl-empty">Nyalakan subtitle di Bstation untuk melihat di sini.</div>`;
    }
    return;
  }

  try {
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

function updateUI() {
  syncLyrics();
  syncMetadata();
}

let updateTimer = null;
function throttledUpdate() {
  if (updateTimer) return;
  updateTimer = setTimeout(() => {
    updateUI();
    updateTimer = null;
  }, 300); // Max twice a second
}

function startObserving() {
  if (isYouTube) {
    // YouTube Specific Optimization: 
    // Use interval for metadata and specific observer for subtitles to avoid infinite loops
    setInterval(updateUI, 1000);
    
    const captionContainer = document.querySelector('.ytp-caption-window-container');
    if (captionContainer) {
      const subObserver = new MutationObserver(syncLyrics);
      subObserver.observe(captionContainer, { childList: true, subtree: true });
    }
  } else {
    // Spotify logic remains same
    const observer = new MutationObserver((mutations) => {
      if (mutations.every(m => ui.container && ui.container.contains(m.target))) return;
      throttledUpdate();
    });
    try {
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  
  updateUI();
}

// Initial delay to ensure Spotify app is loaded
setTimeout(initUI, 3000);
