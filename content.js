console.log("Chess Notation Helper: Content script loaded.");

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
    return overlayGrid;
  }

  console.log("DEBUG: Creating new overlay grid shell...");
  overlayGrid = document.createElement("div");
  overlayGrid.id = OVERLAY_GRID_ID;

  // --- Site-Specific Orientation Check ---
  const site = detectSite();
  let isFlipped = false;

  if (site === "chess.com") {
    // Chess.com: Check for the .flipped class on the board container itself
    isFlipped = boardContainerElement.classList.contains("flipped");
    console.log(
      `DEBUG: Board orientation check (Chess.com): boardContainer has 'flipped': ${isFlipped}`
    );
  } else if (site === "lichess.org") {
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
    console.log(
      `DEBUG: Board orientation check (Lichess): cg-wrap has 'orientation-black': ${isFlipped}`
    );
  } else {
    console.warn(
      "Chess Notation Helper: Orientation check not implemented for unknown site."
    );
  }

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
    console.log(`DEBUG: Set board container (${site}) to position: relative`); // Added site info
  }
  boardContainerElement.appendChild(overlayGrid);
  console.log(`DEBUG: Appended overlay grid to board container (${site}).`); // Added site info
  return overlayGrid;
}

// --- SAN Parsing and Square Identification (T1.7 / T2.3 / T2.5) ---
// Moved these functions BEFORE handleNewMove to ensure they are defined.

// Store the last move number processed to determine side to move for castling
let lastProcessedMoveNumber = 0;

function getComputedMoveNumber(moveListContainer) {
  const site = detectSite();
  let currentMoveNumber = 0;

  if (site === "chess.com") {
    // Chess.com: Look for move numbers like '1.', '2.' etc.
    const moveNumberElements = moveListContainer.querySelectorAll(
      ".move-element .move-number-component span:first-child"
    );
    if (moveNumberElements.length > 0) {
      const lastMoveNumberText =
        moveNumberElements[moveNumberElements.length - 1].textContent.trim();
      currentMoveNumber = parseInt(lastMoveNumberText.replace(".", ""), 10);
    }
  } else if (site === "lichess.org") {
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

  // console.log(`DEBUG: Computed Move Number: ${lastProcessedMoveNumber}`); // Keep commented for now
  return lastProcessedMoveNumber;
}

function getSideToMove(moveListContainer) {
  const site = detectSite();
  let totalMovesMade = 0;

  if (site === "chess.com") {
    const moveNodes = moveListContainer.querySelectorAll(
      SELECTORS["chess.com"].moveNode
    );
    totalMovesMade = moveNodes.length;
  } else if (site === "lichess.org") {
    const moveElements = moveListContainer.querySelectorAll(
      SELECTORS["lichess.org"].moveNode + ":not(:empty)"
    );
    moveElements.forEach((el) => {
      if (!el.textContent.includes("...")) {
        totalMovesMade++;
      }
    });
  }
  // console.log(`DEBUG: Total valid moves found: ${totalMovesMade}`); // Keep commented for now
  // If 0 or even number of moves made, it's White's turn (or start). If odd, it's Black's turn.
  // However, we want the side that *just* moved, so we look at the parity *before* the current move.
  // If totalMovesMade is 1, White just moved. If 2, Black just moved. If 3, White just moved.
  const sideThatMoved = totalMovesMade % 2 !== 0 ? "white" : "black";
  // console.log(`DEBUG: Side that moved: ${sideThatMoved}`); // Keep commented for now
  return sideThatMoved;
}

function parseSANForDestinationSquare(san, moveListContainer) {
  // Remove checks, checkmates, annotations like !, ?
  const cleanedSan = san.replace(/[+#!?]/g, "").trim();

  // Handle Castling (T1.7)
  if (cleanedSan === "O-O" || cleanedSan === "0-0") {
    // Determine side based on whose move it just was
    const side = getSideToMove(moveListContainer);
    console.log(
      `DEBUG: Castling detected (O-O or 0-0). Side that moved: ${side}`
    ); // Unified log
    return side === "white" ? "g1" : "g8";
  }
  if (cleanedSan === "O-O-O" || cleanedSan === "0-0-0") {
    const side = getSideToMove(moveListContainer);
    console.log(
      `DEBUG: Castling detected (O-O-O or 0-0-0). Side that moved: ${side}`
    ); // Unified log
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
    // console.log(`DEBUG: Parsed destination square: ${match[1]}`); // Keep commented
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
  console.log(`DEBUG: handleNewMove called with SAN [${san}]`);

  const site = detectSite();
  const moveListSelector = SELECTORS[site]?.moveListContainer;
  const moveListContainer = moveListSelector
    ? document.querySelector(moveListSelector)
    : null;
  if (!moveListContainer) {
    console.error(
      `Chess Notation Helper: Could not find move list container for parsing context on ${site}`
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
  console.log(
    `DEBUG: Destination square from parseSANForDestinationSquare: ${destinationSquare}`
  );

  // --- Unified Overlay Grid Logic ---
  console.log(`DEBUG: handleNewMove using overlay logic for site: ${site}`);
  let targetHighlightElement = null;

  const boardContainerSelector = SELECTORS[site]?.boardContainer;
  if (!boardContainerSelector) {
    console.error(
      `Chess Notation Helper: Missing boardContainer selector for ${site}`
    );
    return;
  }
  const boardContainerElement = document.querySelector(boardContainerSelector);
  if (!boardContainerElement) {
    console.error(
      `Chess Notation Helper: Could not find board container element (${boardContainerSelector}) for ${site}!`
    );
    // Attempt to retry finding the board container after a delay? Or just fail.
    // For now, just fail.
    return;
  }

  // Get or create the overlay grid positioned on the board container
  const overlayGrid = createOrGetOverlayGrid(boardContainerElement);
  if (!overlayGrid) {
    console.error(
      `Chess Notation Helper: Failed to create or get overlay grid for ${site}!`
    );
    return;
  }

  // Find the specific overlay square div using the data attribute
  const overlaySquareSelector = `.${OVERLAY_SQUARE_CLASS}[data-square="${destinationSquare}"]`;
  targetHighlightElement = overlayGrid.querySelector(overlaySquareSelector);

  if (!targetHighlightElement) {
    console.error(
      `Could not find overlay square with selector: ${overlaySquareSelector} on site ${site}`
    );
    return;
  }

  // Apply Highlight and Text
  highlightSquare(targetHighlightElement, san); // Pass original SAN for display
}

// --- Highlighting Logic (T1.9 / T1.10 / T1.11 / T2.4) ---
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
