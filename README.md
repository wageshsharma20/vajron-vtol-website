# VAJRON VTOL

Product website for the VAJRON VTOL long-endurance surveillance drone (in development).

The aircraft imagery is generated from a procedural 3D model (`js/vtol.js`, three.js),
so every render, drawing and film shot shows the same airframe. The same model runs live
in the page hero and in the flight-mode viewer.

## Re-rendering media
1. Serve the folder: `python3 -m http.server 4192`
2. Stills and frames: `node tools/capture.mjs <jobs.json>` (drives headless Chrome, no npm packages)
3. Shots and camera paths live in `tools/render.html`; preview the model in `tools/studio.html`.

`tools/` is excluded from deployment (`.vercelignore`).
