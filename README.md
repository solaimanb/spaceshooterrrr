# Space Shooter

A fast, mobile-friendly HTML5 canvas shooter with touch controls, power-ups, and increasing difficulty.

## Features
- Responsive canvas: portrait (3:4) on phones, landscape (4:3) on desktop
- High-DPI rendering using device pixel ratio
- Touch and keyboard controls
- Sprites: player (`public/jet.png`) and enemy (`public/enemy.png`)
- Power-up: green orb grants double-shot for 5s
- Enemies shoot aimed bullets; difficulty ramps up every 60s
- PWA-ready: web manifest, theme color, mobile meta tags

## Getting started
Serve the folder with any static server. Examples:

### Using Node (http-server)
```bash
npm install -g http-server
http-server -p 5173 -c-1
```
Open http://localhost:5173 in your browser.

### Using Python
```bash
# Python 3
python -m http.server 5173
```

## Controls
- Desktop: Arrow keys / WASD to move, Space to shoot, Enter to restart
- Mobile: Drag to move, hold to auto-fire, tap overlay to restart

## Build/Deploy
No build step required. Deploy the static files to any host (GitHub Pages, Netlify, Vercel, S3, etc.).

Recommended production headers:
- Cache-bust HTML minimally; cache images and JS/CSS for a long time
- Set `Content-Type` correctly for `.webmanifest` (application/manifest+json)

## File structure
```
index.html         # App entry
style.css          # Styles (responsive + mobile tweaks)
script.js          # Game logic and rendering
public/
  jet.png          # Player sprite
  enemy.png        # Enemy sprite
  manifest.webmanifest
robots.txt
```

## Notes
- The canvas renders in logical space that adapts to orientation (600x800 portrait, 800x600 landscape) and scales to device pixels for crisp visuals.
- If hosting under a base path, ensure `public/*` paths are reachable; otherwise, adjust URLs accordingly.
