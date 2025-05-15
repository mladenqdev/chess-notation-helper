console.log("Chess Notation Helper: Background service worker started.");

let isPaused = false;
let highlightDuration = 2000;

// Load settings from storage when the service worker starts
function loadSettings() {
  chrome.storage.local.get(["isPaused", "highlightDuration"], (result) => {
    if (chrome.runtime.lastError) {
      console.error(
        "Error loading settings:",
        chrome.runtime.lastError.message
      );
      // Keep defaults if error, and content scripts will get these defaults initially
    } else {
      if (typeof result.isPaused === "boolean") isPaused = result.isPaused;
      if (typeof result.highlightDuration === "number")
        highlightDuration = result.highlightDuration;
      console.log(
        `Settings loaded from storage: pause=${isPaused}, duration=${highlightDuration}ms`
      );
    }
  });
}

loadSettings(); // Load settings on startup

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPauseState") {
    sendResponse({ isPaused: isPaused });
  } else if (request.action === "togglePauseState") {
    isPaused = !isPaused;
    chrome.storage.local.set({ isPaused: isPaused }, () => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error saving isPaused:",
          chrome.runtime.lastError.message
        );
      }
      console.log(`Pause state set to ${isPaused} and saved to storage.`);
      sendResponse({ isPaused: isPaused }); // Respond to popup
    });
    return true; // Indicates async response due to storage.set
  } else if (request.action === "getHighlightDuration") {
    sendResponse({ duration: highlightDuration });
  } else if (request.action === "setHighlightDuration") {
    highlightDuration = parseInt(request.duration, 10);
    chrome.storage.local.set({ highlightDuration: highlightDuration }, () => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error saving highlightDuration:",
          chrome.runtime.lastError.message
        );
      }
      // No broadcast from here. Content script listens to storage.onChanged.
      console.log(
        `Highlight duration set to ${highlightDuration}ms and saved to storage.`
      );
      sendResponse({ duration: highlightDuration }); // Respond to popup
    });
    return true; // Indicates async response due to storage.set
  } else if (request.action === "contentScriptLoaded") {
    // Content script is asking for the current state upon its own loading.
    // Provide the current in-memory state (which should be from storage).
    sendResponse({ isPaused: isPaused, duration: highlightDuration });
    console.log(
      `Content script loaded, sent current in-memory states: pause=${isPaused}, duration=${highlightDuration}ms`
    );
  }
});
