// --- Site Detection ---
function detectSite() {
  if (window.location.hostname.includes("chess.com")) {
    console.log("Chess Notation Helper: Detected Chess.com");
    return "chess.com";
  } else if (window.location.hostname.includes("lichess.org")) {
    console.log("Chess Notation Helper: Detected Lichess");
    return "lichess.org";
  } else {
    console.log("Chess Notation Helper: Current site not supported");
    return null;
  }
}

// --- Constants for Selectors ---
const SELECTORS = {
  "chess.com": {
    moveListContainer:
      ".mode-swap-move-list-wrapper-component.move-list.chessboard-pkg-move-list-component",
    moveNode: ".main-line-row .node-highlight-content",
    boardContainer: "#board-single",
  },
  "lichess.org": {
    moveListContainer: "rm6",
    moveNode: "kwdb",
    boardContainer: ".round__app__board.main-board",
  },
};

// --- Constants ---
const SITE = detectSite();
const HIGHLIGHT_CLASS = "notation-helper-highlight";
const TEXT_CLASS = "notation-helper-text";
const OVERLAY_GRID_ID = "notation-helper-overlay-grid";
const OVERLAY_SQUARE_CLASS = "notation-helper-overlay-square";

// --- Pause State ---
let isPaused = false; // Default to not paused
let currentHighlightDuration = 2000; // Default duration

// Function to request initial settings from background script
function initializeSettings() {
  if (chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage(
      { action: "contentScriptLoaded" },
      (response) => {
        if (chrome.runtime.lastError) {
          // If error, attempt to load from storage directly as a fallback before relying on defaults
          loadSettingsFromStorage();
        } else if (response) {
          isPaused = response.isPaused;
          currentHighlightDuration = response.duration;
        } else {
          loadSettingsFromStorage();
        }
      }
    );
  } else {
    loadSettingsFromStorage();
  }
}

// Function to load settings directly from storage (used as fallback or primary for robustness)
function loadSettingsFromStorage() {
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["isPaused", "highlightDuration"], (result) => {
      if (chrome.runtime.lastError) {
        console.error(
          "CNH: Error loading settings directly from storage:",
          chrome.runtime.lastError.message
        );
        // Defaults will remain if not already set by background message
      } else {
        if (typeof result.isPaused === "boolean") isPaused = result.isPaused;
        if (typeof result.highlightDuration === "number")
          currentHighlightDuration = result.highlightDuration;
      }
    });
  } else {
    console.warn("CNH: chrome.storage.local not available for direct load.");
  }
}

// Listen for storage changes to keep settings in sync
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local") {
      if (changes.isPaused) {
        isPaused = changes.isPaused.newValue;
      }
      if (changes.highlightDuration) {
        currentHighlightDuration = changes.highlightDuration.newValue;
      }
    }
  });
} else {
  console.warn(
    "Chess Notation Helper: chrome.storage.onChanged not available for dynamic setting updates."
  );
}

// --- CSS for Highlighting (Inject once) ---
function injectCSS() {
  const styleId = "notation-helper-styles";
  if (document.getElementById(styleId)) return;

  const css = `
    /* === Chess.com Direct Highlighting === */
    /* REMOVED - Using unified overlay grid now */
    /* 
    body .square-wrapper .${HIGHLIGHT_CLASS} {
      background-color: rgba(255, 255, 255, 0.8) !important; 
      z-index: 5 !important; 
      pointer-events: none !important;
    }
    body .square-wrapper .${TEXT_CLASS} {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 3.5vh !important; 
      font-weight: bold !important;
      color: black !important;
      background-color: transparent !important;
      text-shadow: none !important; 
      padding: 0 !important;
      z-index: 20 !important; 
      pointer-events: none !important;
      opacity: 1;
    }
    */

    /* === Lichess Overlay Grid (NOW UNIFIED FOR BOTH SITES) === */
    #${OVERLAY_GRID_ID} {
      position: absolute !important; /* Needs !important potentially */
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      display: grid !important;
      grid-template-columns: repeat(8, 1fr) !important;
      grid-template-rows: repeat(8, 1fr) !important;
      pointer-events: none !important; /* Let clicks pass through to board */
      z-index: 10 !important; /* Above board texture, below pieces maybe? Adjust as needed */
      overflow: hidden !important; /* Prevent content spillover */
    }
    .${OVERLAY_SQUARE_CLASS} {
      width: 100%;
      height: 100%;
      pointer-events: none; /* Ensure squares don't block board interaction */
      position: relative; /* Needed for absolute positioning of text inside */
      /* border: 1px solid rgba(0, 255, 0, 0.1); */ /* Optional: faint border for debugging */
    }
    /* Lichess Overlay Highlight Style */
    #${OVERLAY_GRID_ID} .${OVERLAY_SQUARE_CLASS}.${HIGHLIGHT_CLASS} {
       background-color: rgba(255, 255, 255, 0.8) !important; /* Semi-transparent white */
       z-index: 15 !important; /* Ensure highlight is visible, potentially above pieces layer */
    }
    /* Lichess Overlay Text Style */
     #${OVERLAY_GRID_ID} .${OVERLAY_SQUARE_CLASS} .${TEXT_CLASS} {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 3.5vh !important; 
      font-weight: bold !important;
      color: black !important;
      background-color: transparent !important;
      text-shadow: none !important; 
      padding: 0 !important;
      z-index: 20 !important; /* Text above highlight & pieces */
      pointer-events: none !important;
      opacity: 1;
    }
  `;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
}

injectCSS();

// Debounce timer for processing moves
let debounceTimer = null;
const DEBOUNCE_DELAY_MS = 50;

// --- Mutation Observer Callback ---
function handleMoveListMutation(mutationsList, observer, siteSelectors) {
  for (const mutation of mutationsList) {
    if (mutation.type === "childList") {
      // Check for potential board clear/reset before processing added nodes
      if (
        mutation.removedNodes.length > 0 &&
        mutation.target.children.length < 2
      ) {
        const boardContainerSelector = SELECTORS[SITE]?.boardContainer;
        if (boardContainerSelector) {
          const boardContainerElement = document.querySelector(
            boardContainerSelector
          );
          if (boardContainerElement) {
            checkAndUpdateGridOrientation(boardContainerElement);
          } else {
            console.warn(
              "Chess Notation Helper: Board container not found for orientation check after move list clear."
            );
          }
        } else {
          console.warn(
            "Chess Notation Helper: Board container selector not defined for orientation check."
          );
        }
      }

      // Process added nodes for new moves
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          // Check if the added node itself is a move or contains a move node
          if (node.nodeType === Node.ELEMENT_NODE) {
            let moveElement = null;
            // Check if the node itself is the move node
            if (node.matches(siteSelectors.moveNode)) {
              moveElement = node;
            }
            // Lichess sometimes wraps moves, check children
            else if (node.querySelector(siteSelectors.moveNode)) {
              moveElement = node.querySelector(siteSelectors.moveNode);
            }
            // Chess.com might also wrap the node we need
            else if (node.querySelector(siteSelectors.moveNode)) {
              moveElement = node.querySelector(siteSelectors.moveNode);
            }

            if (moveElement) {
              let san = "";
              // --- Site-Specific SAN Extraction ---

              if (SITE === "chess.com") {
                const sanData = moveElement.dataset.san;
                if (sanData) {
                  san = sanData;
                } else {
                  const pieceIconElement = moveElement.querySelector(
                    "span[data-figurine]"
                  );
                  const pieceLetter = pieceIconElement
                    ? pieceIconElement.dataset.figurine || ""
                    : "";
                  let textPart = "";
                  moveElement.childNodes.forEach((child) => {
                    if (
                      child.nodeType === Node.TEXT_NODE &&
                      child.textContent.trim()
                    ) {
                      textPart = child.textContent.trim();
                    } else if (
                      child.nodeType === Node.ELEMENT_NODE &&
                      child.tagName === "SPAN" &&
                      !child.hasAttribute("data-figurine") &&
                      child.textContent.trim()
                    ) {
                      textPart = child.textContent.trim();
                    }
                  });
                  if (textPart) {
                    san = pieceLetter + textPart;
                  } else {
                    const fallbackText = moveElement.textContent.trim();
                    if (fallbackText) {
                      san = fallbackText;
                    }
                  }
                }
              } else if (SITE === "lichess.org") {
                // Lichess: Use direct textContent of the <kwdb> element
                san = moveElement.textContent.trim();
              }
              // --- End Site-Specific SAN Extraction ---

              if (san) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                  handleNewMove(san, siteSelectors);
                }, DEBOUNCE_DELAY_MS);
              }
            }
          }
        });
      }
    }
  }
}

// --- Lichess Overlay Grid Creation ---
function createOrGetOverlayGrid(boardContainerElement) {
  let overlayGrid = document.getElementById(OVERLAY_GRID_ID);
  if (overlayGrid) {
    return overlayGrid;
  }

  overlayGrid = document.createElement("div");
  overlayGrid.id = OVERLAY_GRID_ID;

  // --- Site-Specific Orientation Check ---
  let isFlipped = false;

  if (SITE === "chess.com") {
    // Chess.com: Check for the .flipped class on the board container itself
    isFlipped = boardContainerElement.classList.contains("flipped");
  } else if (SITE === "lichess.org") {
    // Lichess: Check for 'orientation-black' on the .cg-wrap element
    const cgWrap = boardContainerElement.querySelector(".cg-wrap");
    if (!cgWrap) {
      console.error(
        "Chess Notation Helper: Could not find .cg-wrap element for orientation check (Lichess)."
      );
      // Fallback: assume not flipped
    } else {
      isFlipped = cgWrap.classList.contains("orientation-black");
    }
  } else {
    console.warn(
      "Chess Notation Helper: Orientation check not implemented for unknown site."
    );
  }

  overlayGrid.dataset.initialOrientationIsFlipped = isFlipped.toString();

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const squareDiv = document.createElement("div");
      squareDiv.className = OVERLAY_SQUARE_CLASS;

      const fileIndex = isFlipped ? 7 - f : f;
      const rankIndex = isFlipped ? r : 7 - r;

      const file = files[fileIndex];
      const rank = ranks[rankIndex];
      squareDiv.dataset.square = `${file}${rank}`;
      overlayGrid.appendChild(squareDiv);
    }
  }

  // Append the overlay grid to the board container
  if (getComputedStyle(boardContainerElement).position === "static") {
    boardContainerElement.style.position = "relative";
  }
  boardContainerElement.appendChild(overlayGrid);
  return overlayGrid;
}

// --- Function to Check and Update Grid Orientation ---
function checkAndUpdateGridOrientation(boardContainerElement) {
  const overlayGrid = document.getElementById(OVERLAY_GRID_ID);
  if (!overlayGrid) {
    return;
  }

  // 1. Perform current site-specific orientation check
  let isFlippedNow = false;
  if (SITE === "chess.com") {
    isFlippedNow = boardContainerElement.classList.contains("flipped");
  } else if (SITE === "lichess.org") {
    const cgWrap = boardContainerElement.querySelector(".cg-wrap");
    if (cgWrap) {
      isFlippedNow = cgWrap.classList.contains("orientation-black");
    } else {
      console.error(
        "Chess Notation Helper: Could not find .cg-wrap for current orientation check (Lichess)."
      );
      // Can't determine current flip, so can't safely update. Keep existing grid.
      return;
    }
  }

  // 2. Retrieve the orientation the grid was built with
  const gridWasInitiallyFlipped =
    overlayGrid.dataset.initialOrientationIsFlipped === "true";

  // 3. If orientation has changed, rebuild the grid squares
  if (isFlippedNow !== gridWasInitiallyFlipped) {
    // Clear existing squares
    overlayGrid.innerHTML = "";

    // Re-populate with new squares based on current orientation
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const squareDiv = document.createElement("div");
        squareDiv.className = OVERLAY_SQUARE_CLASS;

        // Use isFlippedNow for correct assignment
        const fileIndex = isFlippedNow ? 7 - f : f;
        const rankIndex = isFlippedNow ? r : 7 - r;

        const file = files[fileIndex];
        const rank = ranks[rankIndex];
        squareDiv.dataset.square = `${file}${rank}`;
        overlayGrid.appendChild(squareDiv);
      }
    }

    // Update the stored orientation to the new one
    overlayGrid.dataset.initialOrientationIsFlipped = isFlippedNow.toString();
  }
}

// --- SAN Parsing and Square Identification ---

// Store the last move number processed to determine side to move for castling
let lastProcessedMoveNumber = 0;

function getComputedMoveNumber(moveListContainer) {
  let currentMoveNumber = 0;

  if (SITE === "chess.com") {
    // Chess.com: Look for move numbers like '1.', '2.' etc.
    const moveNumberElements = moveListContainer.querySelectorAll(
      ".move-element .move-number-component span:first-child"
    );
    if (moveNumberElements.length > 0) {
      const lastMoveNumberText =
        moveNumberElements[moveNumberElements.length - 1].textContent.trim();
      currentMoveNumber = parseInt(lastMoveNumberText.replace(".", ""), 10);
    }
  } else if (SITE === "lichess.org") {
    // Lichess: Moves (<kwdb>) are children of move containers (<kladder> or similar)
    // Often, the move number is not directly in the <kwdb> but nearby or implied by position
    // Let's count the number of <kwdb> elements that don't contain '...' (continuation)
    const moveElements = moveListContainer.querySelectorAll("kwdb:not(:empty)");
    // Count pairs for full moves, add one if odd (Black just moved)
    let validMoveElements = 0;
    moveElements.forEach((el) => {
      // Simple check: Lichess uses '...' for variations/annotations inside kwdb sometimes
      if (!el.textContent.includes("...")) {
        validMoveElements++;
      }
    });
    currentMoveNumber = Math.ceil(validMoveElements / 2);
  }

  // If we computed a valid move number greater than the last processed, update it
  if (currentMoveNumber > lastProcessedMoveNumber) {
    lastProcessedMoveNumber = currentMoveNumber;
  } // Otherwise, keep the last known move number

  return lastProcessedMoveNumber;
}

function getSideToMove(moveListContainer) {
  let totalMovesMade = 0;

  if (SITE === "chess.com") {
    const moveNodes = moveListContainer.querySelectorAll(
      SELECTORS["chess.com"].moveNode
    );
    totalMovesMade = moveNodes.length;
  } else if (SITE === "lichess.org") {
    const moveElements = moveListContainer.querySelectorAll(
      SELECTORS["lichess.org"].moveNode + ":not(:empty)"
    );
    moveElements.forEach((el) => {
      if (!el.textContent.includes("...")) {
        totalMovesMade++;
      }
    });
  }

  const sideThatMoved = totalMovesMade % 2 !== 0 ? "white" : "black";
  return sideThatMoved;
}

function parseSANForDestinationSquare(san, moveListContainer) {
  const cleanedSan = san.replace(/[+#!?]/g, "").trim();

  // Handle Castling
  if (cleanedSan === "O-O" || cleanedSan === "0-0") {
    // Determine side based on whose move it just was
    const side = getSideToMove(moveListContainer);

    return side === "white" ? "g1" : "g8";
  }
  if (cleanedSan === "O-O-O" || cleanedSan === "0-0-0") {
    const side = getSideToMove(moveListContainer);

    return side === "white" ? "c1" : "c8";
  }

  // Handle Pawn Promotion (e.g., e8=Q)
  let promotionPart = "";
  let coreMove = cleanedSan;
  if (cleanedSan.includes("=")) {
    [coreMove, promotionPart] = cleanedSan.split("=");
  }

  // Basic Regex for destination square (works for pieces and pawns)
  // Looks for the file (a-h) and rank (1-8) at the end of the string
  const match = coreMove.match(/([a-h][1-8])$/);
  if (match && match[1]) {
    return match[1];
  }

  // Fallback or further parsing needed? Might happen for complex disambiguation
  console.warn(
    `Chess Notation Helper: Could not parse destination square from SAN: ${san}`
  );
  return null;
}

// --- Core Logic: Handle New Move (T1.7 - T1.11 / T2.3 / T2.4) ---
let highlightTimeout = null;

function handleNewMove(san, siteSelectors) {
  if (isPaused) {
    return;
  }

  const moveListSelector = SELECTORS[SITE]?.moveListContainer;
  const moveListContainer = moveListSelector
    ? document.querySelector(moveListSelector)
    : null;
  if (!moveListContainer) {
    console.error(
      `Chess Notation Helper: Could not find move list container for parsing context on ${SITE}`
    );
    return;
  }

  const destinationSquare = parseSANForDestinationSquare(
    san,
    moveListContainer
  );

  if (!destinationSquare) {
    return;
  }

  // --- Unified Overlay Grid Logic ---
  let targetHighlightElement = null;

  const boardContainerSelector = SELECTORS[SITE]?.boardContainer;
  if (!boardContainerSelector) {
    console.error(
      `Chess Notation Helper: Missing boardContainer selector for ${SITE}`
    );
    return;
  }
  const boardContainerElement = document.querySelector(boardContainerSelector);
  if (!boardContainerElement) {
    console.error(
      `Chess Notation Helper: Could not find board container element (${boardContainerSelector}) for ${SITE}!`
    );
    return;
  }

  // Get or create the overlay grid positioned on the board container
  const overlayGrid = createOrGetOverlayGrid(boardContainerElement);
  if (!overlayGrid) {
    console.error(
      `Chess Notation Helper: Failed to create or get overlay grid for ${SITE}!`
    );
    return;
  }

  // Find the specific overlay square div using the data attribute
  const overlaySquareSelector = `.${OVERLAY_SQUARE_CLASS}[data-square="${destinationSquare}"]`;
  targetHighlightElement = overlayGrid.querySelector(overlaySquareSelector);

  if (!targetHighlightElement) {
    console.error(
      `Could not find overlay square with selector: ${overlaySquareSelector} on site ${SITE}`
    );
    return;
  }

  // Apply Highlight and Text
  highlightSquare(targetHighlightElement, san); // Pass original SAN for display
}

// --- Highlighting Logic ---
// Moved highlightSquare function definition *after* handleNewMove, just for structure
function highlightSquare(element, san) {
  clearTimeout(highlightTimeout);

  // --- Robust Cleanup ---
  const previousHighlights = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
  previousHighlights.forEach((el) => {
    el.classList.remove(HIGHLIGHT_CLASS);
  });
  const previousTexts = document.querySelectorAll(`.${TEXT_CLASS}`);
  previousTexts.forEach((textEl) => {
    textEl.remove();
  });

  // --- Apply new highlight/text ---
  element.classList.add(HIGHLIGHT_CLASS);

  const textElement = document.createElement("div");
  textElement.className = TEXT_CLASS;
  textElement.textContent = san;
  element.appendChild(textElement); // Append text to the highlighted square/piece

  // Set timeout to remove highlight and text simultaneously
  highlightTimeout = setTimeout(() => {
    element.classList.remove(HIGHLIGHT_CLASS);
    textElement.remove(); // Remove text immediately with highlight
  }, currentHighlightDuration); // Use dynamic duration here
}

// --- Initialize Observer ---
function startObserver(SITE) {
  const siteSelectors = SELECTORS[SITE];
  if (!siteSelectors || !siteSelectors.moveListContainer) {
    console.error(`Chess Notation Helper: Missing selectors for ${SITE}`);
    return;
  }

  const targetNode = document.querySelector(siteSelectors.moveListContainer);

  if (!targetNode) {
    setTimeout(() => startObserver(SITE), 2000);
    return;
  }

  const config = { childList: true, subtree: true };
  const observer = new MutationObserver((mutations, obs) => {
    handleMoveListMutation(mutations, obs, siteSelectors);
  });

  observer.observe(targetNode, config);
}

// --- Initialization ---
function initialize() {
  if (!SITE) {
    return;
  }
  initializeSettings(); // Initialize settings (pause state and duration) on load
  startObserver(SITE);
}

try {
  initialize();
} catch (error) {
  console.error("Chess Notation Helper: ERROR during initialization:", error);
}
