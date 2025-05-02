# Chess Notation Helper

A Chrome browser extension designed to help users learn standard algebraic chess notation (SAN) interactively while playing games on Chess.com and Lichess.

## Core Features

- **Real-time Move Detection:** Automatically detects when a move is made during a game.
- **Destination Square Highlighting:** Visually highlights the square where the piece landed.
- **Notation Display:** Displays the standard algebraic notation (e.g., "Nf3", "exd5", "O-O") directly on the highlighted destination square.
- **Temporary Feedback:** The highlight and notation appear briefly after the move and then fade out, providing non-intrusive feedback.
- **Platform Support:** Works on live game pages for both Chess.com and Lichess.org.

## Technology & Approach

This extension is built using fundamental web technologies within the Chrome Extension framework (Manifest V3):

### Content Script (JavaScript)

- The core logic resides in `content.js`, which is injected into Chess.com and Lichess pages.
- **Site Detection:** Identifies whether the user is on Chess.com or Lichess to apply the correct logic.
- **DOM Monitoring:** Uses the `MutationObserver` API to efficiently watch for changes in the website's move list DOM structure, allowing for near-instant detection of new moves.
- **Data Extraction:** Parses the newly added move element in the DOM to extract the standard algebraic notation (SAN).
- **DOM Manipulation:** Interacts with the chessboard elements on the page to apply visual highlights and display the notation.

## How to Install / Run Locally

1.  Clone or download this repository.
2.  Open Google Chrome and navigate to `chrome://extensions`.
3.  Enable "Developer mode" using the toggle switch (usually in the top right corner).
4.  Click the "Load unpacked" button (usually in the top left corner).
5.  Select the directory containing this repository (the one with `manifest.json`).
6.  The "Chess Notation Helper" extension should now be installed and active.
7.  Navigate to a live game on Chess.com or Lichess.org to see it in action.

## Project Structure

```
/
├── icons/
│   ├── icon16.png        # 16x16 icon
│   ├── icon48.png        # 48x48 icon
│   └── icon128.png       # 128x128 icon
├── background.js         # Background service worker (currently minimal)
├── content.js            # Main content script logic
├── manifest.json         # Extension manifest file
├── chess-notation.md     # Project plan and task list
├── .gitignore            # Specifies intentionally untracked files
└── README.md             # This file
```
