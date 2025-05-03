console.log("Chess Notation Helper: Content script loaded.");

// --- Constants for Selectors ---
const SELECTORS = {
  "chess.com": {
    moveListContainer:
      ".mode-swap-move-list-wrapper-component.move-list.chessboard-pkg-move-list-component",
    moveNode: ".main-line-row .node-highlight-content",
    boardSquare: (square) => `.square-${square}`,
  },
  "lichess.org": {
    moveListContainer: "rm6",
    moveNode: "kwdb",
    boardContainer: ".round__app__board.main-board",
  },
};

// --- Constants ---
const HIGHLIGHT_CLASS = "notation-helper-highlight";
const TEXT_CLASS = "notation-helper-text";
const HIGHLIGHT_DURATION_MS = 2000;
const OVERLAY_GRID_ID = "notation-helper-overlay-grid";
const OVERLAY_SQUARE_CLASS = "notation-helper-overlay-square";

// --- CSS for Highlighting (Inject once) ---
function injectCSS() {
  const styleId = "notation-helper-styles";
  if (document.getElementById(styleId)) return;

  const css = `
    /* === Chess.com Direct Highlighting === */
    body .square-wrapper .${HIGHLIGHT_CLASS} {
      background-color: rgba(255, 255, 255, 0.8) !important; /* Semi-transparent white */
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
      z-index: 20 !important; /* Above pieces */
      pointer-events: none !important;
      opacity: 1;
    }

    /* === Lichess Overlay Grid === */
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

// --- Site Detection (T1.2) ---
function detectSite() {
  if (window.location.hostname.includes("chess.com")) {
    console.log("Chess Notation Helper: Detected Chess.com");
    return "chess.com";
  } else if (window.location.hostname.includes("lichess.org")) {
    console.log("Chess Notation Helper: Detected Lichess (DEBUG)");
    return "lichess.org";
  } else {
    console.log("Chess Notation Helper: Current site not supported");
    return null;
  }
}

// Debounce timer for processing moves
let debounceTimer = null;
const DEBOUNCE_DELAY_MS = 50;

// --- Mutation Observer Callback (T1.5 / T1.6 / T2.2) ---
function handleMoveListMutation(mutationsList, observer, siteSelectors) {
  console.log("DEBUG: handleMoveListMutation CALLED (Lichess specific test)");
  for (const mutation of mutationsList) {
    console.log("DEBUG: Processing mutation: ", mutation);
    if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
      console.log("DEBUG: Mutation has added nodes: ", mutation.addedNodes);
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
            // --- Site-Specific SAN Extraction (T1.6 for Chess.com, T2.2 for Lichess) ---
            const site = detectSite(); // Detect site again for specific logic

            if (site === "chess.com") {
              console.log("DEBUG: Entering Chess.com SAN extraction");
              // Chess.com: Prefer data-san, fallback to reconstruction
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
            } else if (site === "lichess.org") {
              console.log("DEBUG: Entering Lichess SAN extraction");
              // Lichess: Use direct textContent of the <kwdb> element
              san = moveElement.textContent.trim();
              console.log(`DEBUG: Lichess SAN extracted: [${san}]`);
            }
            // --- End Site-Specific SAN Extraction ---

            if (san) {
              console.log(`DEBUG: SAN found [${san}], preparing debounce`);
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

// --- Lichess Overlay Grid Creation (T2.4) ---
function createOrGetOverlayGrid(boardContainerElement) {
  let overlayGrid = document.getElementById(OVERLAY_GRID_ID);
  if (overlayGrid) {
    // console.log("DEBUG: Found existing overlay grid."); // Keep commented for now
    return overlayGrid;
  }

  console.log("DEBUG: Creating new overlay grid shell..."); // Changed log
  overlayGrid = document.createElement("div");
  overlayGrid.id = OVERLAY_GRID_ID;

  const cgBoard = boardContainerElement.querySelector("cg-board");
  // Check orientation - Lichess adds 'flipped' class to the board container or cg-board itself
  const isFlipped =
    boardContainerElement.classList.contains("flipped") ||
    (cgBoard && cgBoard.classList.contains("flipped"));
  console.log(`DEBUG: Board flipped: ${isFlipped}`);

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const squareDiv = document.createElement("div");
      squareDiv.className = OVERLAY_SQUARE_CLASS;

      // Determine algebraic notation based on orientation
      const fileIndex = isFlipped ? 7 - f : f; // Flip file index if board is flipped
      const rankIndex = isFlipped ? r : 7 - r; // Rank index calculation (remains the same)

      const file = files[fileIndex];
      const rank = ranks[rankIndex];
      const algebraic = `${file}${rank}`;
      squareDiv.dataset.square = algebraic;

      overlayGrid.appendChild(squareDiv);
    }
  }

  // --- Finalize Overlay Grid ---
  // Ensure board container can host the absolutely positioned overlay
  if (getComputedStyle(boardContainerElement).position === "static") {
    console.log("DEBUG: Setting board container position to relative");
    boardContainerElement.style.position = "relative";
  }
  // Append the fully constructed overlay grid to the board container
  boardContainerElement.appendChild(overlayGrid);
  console.log("DEBUG: Overlay grid created and appended.");

  return overlayGrid;
}

// --- Core Logic: Handle New Move (T1.7 - T1.11 / T2.3 / T2.4) ---
let highlightTimeout = null;

function handleNewMove(san, siteSelectors) {
  console.log(`DEBUG: handleNewMove called with SAN [${san}]`);
  // T2.3: Refined SAN Parsing (including Castling)
  const sanCleaned = san.replace(/[+#=].*$/, ""); // Keep check/mate for display, but remove for parsing destination
  let destinationSquare = "";

  if (sanCleaned === "O-O") {
    const moveRow =
      document.querySelector(".main-line-row.selected") ||
      document.querySelector(
        ".main-line-row:has(.node-highlight-content.selected)"
      ); // Simple guess, might be fragile
    let isWhiteMove = true;
    if (
      moveRow &&
      moveRow.children.length > 1 &&
      moveRow.children[1].querySelector(".node-highlight-content")
    ) {
      if (moveRow.children[0].textContent.includes("O-O")) {
        isWhiteMove = true;
      } else {
        isWhiteMove = false;
      }
    } else {
      return;
    }
    destinationSquare = isWhiteMove ? "g1" : "g8";
  } else if (sanCleaned === "O-O-O") {
    // Castling Queenside (similar logic needed)
    const moveRow =
      document.querySelector(".main-line-row.selected") ||
      document.querySelector(
        ".main-line-row:has(.node-highlight-content.selected)"
      );
    let isWhiteMove = true;
    if (
      moveRow &&
      moveRow.children.length > 1 &&
      moveRow.children[1].querySelector(".node-highlight-content")
    ) {
      if (moveRow.children[0].textContent.includes("O-O-O")) {
        isWhiteMove = true;
      } else {
        isWhiteMove = false;
      }
    } else {
      return;
    }
    destinationSquare = isWhiteMove ? "c1" : "c8";
  } else if (sanCleaned.length >= 2) {
    // Standard move parsing
    destinationSquare = sanCleaned.slice(-2);
  }

  if (!destinationSquare || destinationSquare.length !== 2) {
    console.warn(
      `Chess Notation Helper: Could not parse destination square from SAN: ${san}`
    );
    return;
  }

  // T1.8: Find Square Element (Chess.com specific for now)
  // Convert algebraic (e.g., 'e4') to numeric ('54') for Chess.com selector
  const site = detectSite();
  console.log(`DEBUG: handleNewMove detected site: ${site}`);
  let targetHighlightElement = null;

  if (site === "chess.com") {
    console.log("DEBUG: Entering Chess.com highlighting logic");
    const fileChar = destinationSquare.charCodeAt(0);
    const rankChar = destinationSquare.charCodeAt(1);

    // Ensure it's a valid square notation (a-h, 1-8)
    if (fileChar < 97 || fileChar > 104 || rankChar < 49 || rankChar > 56) {
      console.warn(
        `Chess Notation Helper: Invalid destination square parsed: ${destinationSquare}`
      );
      return;
    }

    const fileIndex = fileChar - 97 + 1; // a=1, b=2, ... h=8
    const rankIndex = rankChar - 48; // 1=1, 2=2, ... 8=8
    const squareSelectorValue = `${fileIndex}${rankIndex}`;
    const squareSelector = siteSelectors.boardSquare(squareSelectorValue);
    targetHighlightElement = document.querySelector(squareSelector); // ONLY target the base square
  } else if (site === "lichess.org") {
    console.log("DEBUG: Entering Lichess highlighting logic"); // Updated log
    const boardContainerElement = document.querySelector(
      siteSelectors.boardContainer
    );
    if (!boardContainerElement) {
      console.error(
        "Chess Notation Helper: Could not find Lichess board container element!"
      );
      return;
    }
    // Get or create the overlay grid positioned on the board container
    const overlayGrid = createOrGetOverlayGrid(boardContainerElement);
    if (!overlayGrid) {
      console.error(
        "Chess Notation Helper: Failed to create or get overlay grid!"
      );
      return;
    }

    // Find the specific overlay square div using the data attribute
    const overlaySquareSelector = `.${OVERLAY_SQUARE_CLASS}[data-square="${destinationSquare}"]`;
    targetHighlightElement = overlayGrid.querySelector(overlaySquareSelector);

    if (targetHighlightElement) {
      console.log(
        `DEBUG: Found Lichess overlay square for [${destinationSquare}]:`,
        targetHighlightElement
      );
    } else {
      // This case should ideally not happen if grid generation is correct
      console.error(
        `Could not find overlay square with selector: ${overlaySquareSelector}`
      );
      return; // Don't try to highlight if overlay square wasn't found
    }
    // No longer returning here - proceed to highlight the overlay square
  }

  if (!targetHighlightElement) {
    console.error(
      `Chess Notation Helper: Could not find target element for ${destinationSquare} on ${site}. Cannot highlight. (DEBUG)`
    );
    return; // Exit if target element not found for the site
  }

  // T1.9, T1.10, T1.11: Apply Highlight and Text (should now work on overlay square too)
  highlightSquare(targetHighlightElement, san);
}

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
  // T1.9: Add highlight class
  element.classList.add(HIGHLIGHT_CLASS);

  // T1.10: Create and add text element
  const textElement = document.createElement("div");
  textElement.className = TEXT_CLASS;
  textElement.textContent = san;
  element.appendChild(textElement); // Append text to the highlighted square/piece

  // T1.11: Set timeout to remove highlight and text simultaneously
  highlightTimeout = setTimeout(() => {
    element.classList.remove(HIGHLIGHT_CLASS);
    textElement.remove(); // Remove text immediately with highlight
  }, HIGHLIGHT_DURATION_MS);
}

// --- Initialize Observer (T1.5) ---
function startObserver(site) {
  console.log(`DEBUG: startObserver called for site: ${site}`);
  const siteSelectors = SELECTORS[site];
  if (!siteSelectors || !siteSelectors.moveListContainer) {
    console.error(`Chess Notation Helper: Missing selectors for ${site}`);
    return;
  }

  const targetNode = document.querySelector(siteSelectors.moveListContainer);
  console.log(
    `DEBUG: Attempting to find target node with selector: ${siteSelectors.moveListContainer}`
  );
  if (!targetNode) {
    console.log(
      `Chess Notation Helper: Move list container (${siteSelectors.moveListContainer}) not found yet (DEBUG). Retrying...`
    );
    setTimeout(() => startObserver(site), 2000);
    return;
  }
  console.log(
    `Chess Notation Helper: Found move list container (DEBUG):`,
    targetNode
  );
  const config = { childList: true, subtree: true };
  const observer = new MutationObserver((mutations, obs) => {
    handleMoveListMutation(mutations, obs, siteSelectors);
  });
  console.log("DEBUG: Calling observer.observe on target node");
  observer.observe(targetNode, config);
}

// --- Initialization ---
function initialize() {
  console.log("DEBUG: initialize function called"); // DEBUG
  const site = detectSite();
  if (!site) {
    return; // Do nothing if not on a supported site
  }

  console.log(`Chess Notation Helper: Initializing for ${site}...`); // DEBUG

  // Start the observer for the detected site
  startObserver(site);

  // TODO: Implement Lichess overlay logic (Phase 2)
}

console.log("DEBUG: Functions defined. Preparing to initialize...");

try {
  initialize();
  console.log("DEBUG: initialize() function completed without throwing error.");
} catch (error) {
  console.error("Chess Notation Helper: ERROR during initialization:", error);
}

console.log("DEBUG: Content script execution finished (or error caught).");
