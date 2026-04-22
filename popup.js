/**
 * Spotify Mini Player - Popup Script
 */

let spotifyTabId = null;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  findSpotifyTab();
  setupClickHandlers();
  // Refresh popup state periodically
  setInterval(updatePopup, 1000);
});

async function findSpotifyTab() {
  try {
    const tabs = await chrome.tabs.query({ url: "https://open.spotify.com/*" });
    if (tabs.length > 0) {
      spotifyTabId = tabs[0].id;
      updatePopup();
    } else {
      updateStatus("Spotify tidak terbuka");
    }
  } catch (err) {
    console.error("Error finding Spotify tab:", err);
  }
}

function updateStatus(msg) {
  const artistEl = document.getElementById('sfl-artist');
  const titleEl = document.getElementById('sfl-title');
  if (artistEl) artistEl.innerText = msg;
  if (titleEl && msg.includes("tidak terbuka")) titleEl.innerText = "Spotify Offline";
}

async function updatePopup() {
  if (!spotifyTabId) {
    findSpotifyTab();
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(spotifyTabId, { type: 'GET_METADATA' });

    if (response) {
      const els = {
        title: document.getElementById('sfl-title'),
        artist: document.getElementById('sfl-artist'),
        cover: document.getElementById('sfl-cover'),
        icon: document.getElementById('sfl-play-icon')
      };

      if (els.title) els.title.innerText = response.title || 'Unknown Title';
      if (els.artist) els.artist.innerText = response.artist || 'Unknown Artist';
      if (els.cover) els.cover.src = response.cover || 'placeholder.png';
      
      if (els.icon) {
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
      if (content) {
        if (response.activeLyric) {
          content.innerHTML = `<div class="sfl-line active">${response.activeLyric}</div>`;
        } else {
          content.innerHTML = `<div class="sfl-empty">Menunggu lirik...</div>`;
        }
      }
    }
  } catch (err) {
    // If connection is lost, inform the user and reset tab state
    const isDisconnected = err.message?.includes("Could not establish connection") || 
                           err.message?.includes("context invalidated");
    
    if (isDisconnected) {
      updateStatus("Koneksi terputus. Silakan Refresh Spotify.");
    } else {
      console.warn("Popup connection issue:", err.message);
    }
    spotifyTabId = null;
  }
}

function sendCommand(command) {
  if (!spotifyTabId) {
    findSpotifyTab().then(() => {
      if (spotifyTabId) executeCommand(command);
    });
  } else {
    executeCommand(command);
  }
}

function executeCommand(command) {
  chrome.tabs.sendMessage(spotifyTabId, { type: 'COMMAND', command }, (response) => {
    if (chrome.runtime.lastError) {
      const msg = chrome.runtime.lastError.message;
      if (msg.includes("context invalidated") || msg.includes("connection")) {
         updateStatus("Refresh Spotify Anda.");
      }
    } else {
      setTimeout(updatePopup, 100);
    }
  });
}

function setupClickHandlers() {
  const map = {
    'sfl-play': () => sendCommand('PLAY_PAUSE'),
    'sfl-prev': () => sendCommand('PREV'),
    'sfl-next': () => sendCommand('NEXT'),
    'sfl-pip-btn': () => sendCommand('START_PIP')
  };

  for (const [id, fn] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.onclick = fn;
  }
}
