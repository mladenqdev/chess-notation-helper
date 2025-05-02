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
    moveListContainer: ".analyse__moves",
    moveNode: "move",
    boardContainer: ".main-board .board",
  },
};

// --- Constants ---
const HIGHLIGHT_CLASS = "notation-helper-highlight";
const TEXT_CLASS = "notation-helper-text";
const HIGHLIGHT_DURATION_MS = 2000;

// --- CSS for Highlighting (Inject once) ---
function injectCSS() {
  const styleId = "notation-helper-styles";
  if (document.getElementById(styleId)) return;

  const css = `
    /* Use a more specific parent selector if possible, e.g., body or a known Chess.com container */
    body .${HIGHLIGHT_CLASS} {
      background-color: white !important; /* Solid white */
      position: relative !important;
      z-index: 5 !important; /* Below pieces, above board */
      pointer-events: none !important;
    }
    body .${TEXT_CLASS} {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 3.5vh !important; /* Even larger font */
      font-weight: bold !important;
      color: black !important;
      background-color: transparent !important;
      text-shadow: none !important; /* Remove glow, rely on white background */
      padding: 0 !important;
      z-index: 20 !important; /* Above pieces */
      pointer-events: none !important;
      opacity: 1;
      /* No transition needed as it's removed instantly */
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
    console.log("Chess Notation Helper: Detected Lichess");
    return "lichess.org";
  } else {
    console.log("Chess Notation Helper: Current site not supported");
    return null;
  }
}

// Debounce timer for processing moves
let debounceTimer = null;
const DEBOUNCE_DELAY_MS = 50;

// --- Mutation Observer Callback (T1.5 / T1.6) ---
function handleMoveListMutation(mutationsList, observer, siteSelectors) {
  for (const mutation of mutationsList) {
    if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
      mutation.addedNodes.forEach((node) => {
        // Check if the added node itself is a move or contains a move node
        if (node.nodeType === Node.ELEMENT_NODE) {
          let moveElement = null;
          if (node.matches(siteSelectors.moveNode)) {
            moveElement = node;
          }

          if (moveElement) {
            // Extract SAN (Standard Algebraic Notation) - Task T1.6
            let san = "";
            const sanData = moveElement.dataset.san;

            if (sanData) {
              // If data-san exists, trust it as the primary source
              san = sanData;
            } else {
              // data-san not found, try to reconstruct from icon + text
              const pieceIconElement = moveElement.querySelector(
                "span[data-figurine]"
              );
              const pieceLetter = pieceIconElement
                ? pieceIconElement.dataset.figurine || ""
                : "";
              let textPart = "";

              // Iterate through child nodes to find the text content, ignoring the icon span
              moveElement.childNodes.forEach((child) => {
                if (
                  child.nodeType === Node.TEXT_NODE &&
                  child.textContent.trim()
                ) {
                  textPart = child.textContent.trim();
                }
                // Sometimes text might be wrapped in another non-icon span
                else if (
                  child.nodeType === Node.ELEMENT_NODE &&
                  child.tagName === "SPAN" &&
                  !child.hasAttribute("data-figurine") &&
                  child.textContent.trim()
                ) {
                  textPart = child.textContent.trim();
                }
              });

              if (textPart) {
                // Only construct if we have the text part
                san = pieceLetter + textPart;
              } else {
                const fallbackText = moveElement.textContent.trim();
                if (fallbackText) {
                  san = fallbackText;
                }
              }
            }

            if (san) {
              // DEBOUNCE the call to handleNewMove
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

// --- Core Logic: Handle New Move (T1.7 - T1.11) ---
let highlightTimeout = null;

function handleNewMove(san, siteSelectors) {
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

  const targetHighlightElement = document.querySelector(squareSelector); // ONLY target the base square

  if (!targetHighlightElement) {
    console.error(
      `Chess Notation Helper: Could not find BASE target square element for ${destinationSquare} using selector ${squareSelector}. Cannot highlight.`
    );
    return; // Exit if base square not found
  }

  // T1.9, T1.10, T1.11: Apply Highlight and Text
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
  const siteSelectors = SELECTORS[site];
  if (!siteSelectors || !siteSelectors.moveListContainer) {
    console.error(`Chess Notation Helper: Missing selectors for ${site}`);
    return;
  }

  const targetNode = document.querySelector(siteSelectors.moveListContainer);

  if (!targetNode) {
    setTimeout(() => startObserver(site), 2000);
    return;
  }

  const config = { childList: true, subtree: true }; // Watch for added children in the container and its descendants

  const observer = new MutationObserver((mutations, obs) => {
    handleMoveListMutation(mutations, obs, siteSelectors);
  });

  observer.observe(targetNode, config);
}

// --- Initialization ---
function initialize() {
  const site = detectSite();
  if (!site) {
    return; // Do nothing if not on a supported site
  }

  // Start the observer for the detected site
  startObserver(site);

  // TODO: Implement Lichess overlay logic (Phase 2)
}

initialize();
