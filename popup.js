/**
 * SFL Player - Popup Script
 */

let activeTabId = null;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  findActiveTab();
  setupClickHandlers();
  // Refresh popup state periodically
  setInterval(updatePopup, 1000);
});

async function findActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ 
      url: ["https://open.spotify.com/*", "https://www.youtube.com/*"] 
    });
    if (tabs.length > 0) {
      activeTabId = tabs[0].id;
      updatePopup();
    } else {
      updateStatus("Spotify/YouTube tidak terbuka");
    }
  } catch (err) {
    console.error("Error finding active tab:", err);
  }
}

function updateStatus(msg) {
  const artistEl = document.getElementById('sfl-artist');
  const titleEl = document.getElementById('sfl-title');
  if (artistEl) artistEl.innerText = msg;
  if (titleEl && msg.includes("tidak terbuka")) titleEl.innerText = "SFL Offline";

  // Update Header Icon
  const brandIcon = document.getElementById('sfl-brand-icon');
  if (brandIcon && msg.includes("tidak terbuka") && brandIcon) {
    brandIcon.innerHTML = ''; // Clear if disconnected
  }
}

async function updatePopup() {
  if (!activeTabId) {
    findActiveTab();
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(activeTabId, { type: 'GET_METADATA' });

    if (response) {
      const els = {
        title: document.getElementById('sfl-title'),
        artist: document.getElementById('sfl-artist'),
        cover: document.getElementById('sfl-cover'),
        icon: document.getElementById('sfl-play-icon')
      };

      if (els.title) els.title.innerText = response.title || 'Memuat...';
      if (els.artist) els.artist.innerText = response.artist || 'SFL Player';
      if (els.cover) els.cover.src = response.cover || 'placeholder.png';
      
      // Update Branding Icon
      const isYT = response.url && response.url.includes('youtube.com');
      const brandIcon = document.getElementById('sfl-brand-icon');
      if (brandIcon) {
        brandIcon.innerHTML = isYT 
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="#ff0000" style="vertical-align:middle;margin-right:4px;"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>'
          : '<svg width="16" height="16" viewBox="0 0 24 24" fill="#1db954" style="vertical-align:middle;margin-right:4px;"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.49 17.3c-.22.34-.67.45-1.01.23-2.82-1.72-6.37-2.11-10.55-1.16-.39.09-.78-.17-.87-.56-.09-.39.17-.78.56-.87 4.57-1.04 8.5-.6 11.64 1.32.34.22.45.67.23 1.04zm1.46-3.26c-.28.45-.87.59-1.32.31-3.23-1.99-8.15-2.57-11.97-1.41-.51.15-1.05-.14-1.2-.65-.15-.51.14-1.05.65-1.2 4.36-1.32 9.79-.67 13.52 1.63.45.27.6.86.32 1.32zm.12-3.41c-3.87-2.3-10.26-2.51-13.98-1.38-.6.18-1.23-.17-1.41-.77-.18-.6.17-1.23.77-1.41 4.27-1.3 11.33-1.04 15.8 1.61.54.32.72 1.02.4 1.56-.32.54-1.02.72-1.58.39z"/></svg>';
      }

      if (els.icon) {
        const isYT = response.url && response.url.includes('youtube.com');
        
        // Update Toggle Lyrics/Subtitle Icon
        const toggleBtn = document.getElementById('sfl-lyrics-toggle');
        if (toggleBtn) {
          if (isYT) {
            toggleBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5V10h-2v4h2v-1.5H11V15c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-6c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2zm7 0h-1.5V10h-2v4h2v-1.5H18V15c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-6c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2z"/></svg>';
            toggleBtn.title = "Toggle Subtitles (C)";
          } else {
            toggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M13.426 2.574a2.831 2.831 0 0 0-4.797 1.55l3.247 3.247a2.831 2.831 0 0 0 1.55-4.797M10.5 8.118l-2.619-2.62L4.74 9.075 2.065 12.12a1.287 1.287 0 0 0 1.816 1.816l3.06-2.688 3.56-3.129zM7.12 4.094a4.331 4.331 0 1 1 4.786 4.786l-3.974 3.493-3.06 2.689a2.787 2.787 0 0 1-3.933-3.933l2.676-3.045z" fill="currentColor"></path></svg>';
            toggleBtn.title = "Toggle Lyrics (Mic)";
          }
        }

        // Update Play/Pause Icon Path
        const path = els.icon.querySelector('path');
        if (path) {
          if (response.isPlaying) {
            path.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z'); // Pause Icon
          } else {
            path.setAttribute('d', 'M7 20V4L18 12L7 20Z'); // Play Icon
          }
        }
      }

      // Update lyrics summary or active line
      const content = document.getElementById('sfl-content');
      if (response.activeLyric) {
        content.innerHTML = `<div class="sfl-line active" style="text-align:center">${response.activeLyric}</div>`;
      } else {
        const isYT = response.url && response.url.includes('youtube.com');
        content.innerHTML = `<div class="sfl-empty">${isYT ? 'Nyalakan subtitle di YouTube (C) untuk melihat di sini.' : 'Buka tampilan lirik di Spotify (🎤) untuk melihat di sini.'}</div>`;
      }
    }
  } catch (err) {
    // If connection is lost, reset tab state
    activeTabId = null;
  }
}

function sendCommand(command) {
  if (!activeTabId) {
    findActiveTab().then(() => {
      if (activeTabId) executeCommand(command);
    });
  } else {
    executeCommand(command);
  }
}

function executeCommand(command) {
  chrome.tabs.sendMessage(activeTabId, { type: 'COMMAND', command }, (response) => {
    if (!chrome.runtime.lastError) {
      setTimeout(updatePopup, 100);
    }
  });
}

function setupClickHandlers() {
  const map = {
    'sfl-play': () => sendCommand('PLAY_PAUSE'),
    'sfl-prev': () => sendCommand('PREV'),
    'sfl-next': () => sendCommand('NEXT'),
    'sfl-lyrics-toggle': () => sendCommand('TOGGLE_LYRICS'),
    'sfl-pip-btn': () => sendCommand('START_PIP')
  };

  for (const [id, fn] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.onclick = fn;
  }
}
