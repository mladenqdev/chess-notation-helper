console.log("Popup script loaded.");

document.addEventListener("DOMContentLoaded", () => {
  const togglePauseButton = document.getElementById("togglePauseButton");
  const durationSelect = document.getElementById("durationSelect");

  function updatePauseButton(pausedState) {
    togglePauseButton.textContent = pausedState ? "Resume" : "Pause";
    if (pausedState) {
      togglePauseButton.classList.add("paused");
    } else {
      togglePauseButton.classList.remove("paused");
    }
  }

  // Load initial states from background script
  chrome.runtime.sendMessage({ action: "getPauseState" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(
        "Error getting pause state:",
        chrome.runtime.lastError.message
      );
      updatePauseButton(false); // Fallback
    } else if (response) {
      updatePauseButton(response.isPaused);
    }
  });

  chrome.runtime.sendMessage({ action: "getHighlightDuration" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(
        "Error getting highlight duration:",
        chrome.runtime.lastError.message
      );
      durationSelect.value = "2000"; // Fallback
    } else if (response) {
      durationSelect.value = response.duration.toString();
    }
  });

  togglePauseButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "togglePauseState" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error toggling pause state:",
          chrome.runtime.lastError.message
        );
        return;
      }
      updatePauseButton(response.isPaused);
    });
  });

  durationSelect.addEventListener("change", () => {
    const newDuration = parseInt(durationSelect.value, 10);
    chrome.runtime.sendMessage(
      { action: "setHighlightDuration", duration: newDuration },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error setting highlight duration:",
            chrome.runtime.lastError.message
          );
          return;
        }
      }
    );
  });

  // Listen for changes from background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "pauseStateChanged") {
      updatePauseButton(request.isPaused);
    } else if (request.action === "highlightDurationChanged") {
      durationSelect.value = request.duration.toString();
    }
  });
});
