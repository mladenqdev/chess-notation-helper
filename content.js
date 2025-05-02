console.log("Chess Notation Helper: Content script loaded.");

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

// --- Initialization ---
function initialize() {
  const site = detectSite();
  if (!site) {
    return; // Do nothing if not on a supported site
  }

  console.log(`Chess Notation Helper: Initializing for ${site}...`);

  // TODO: Add MutationObserver setup (T1.5)
  // TODO: Add logic for the specific site
}

// Run initialization logic
initialize();
