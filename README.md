# The Ground Beneath Our Shoes — Karaoke

A static karaoke player with audio-aligned word-span timing and real-time audio-reactive visuals.

## Play
Open the GitHub Pages site and press Play. The MP3 and aligned word-timing data are bundled with the page. Word fills are calculated directly from each word's aligned start/end span and the audio playback clock, without a CSS width tween that could trail the voice. The Web Audio API analyses bass, midrange, and high-frequency energy locally in the browser. Frequency energy drives the lyric glow, pulse, cover art, and live frequency meters. Bass transients add beat accents. Seeking and playback-speed changes remain synchronized.

## Repository layout
- `index.html` — karaoke page
- `style.css` — responsive display
- `karaoke.js` — audio playback, word-span timing, Web Audio analysis, and animation loop
- `assets/song.mp3` — uploaded recording
- `assets/song.word-timings.json` — Suno start/end spans for every displayed word
- `assets/song.enhanced.lrc` — downloadable Enhanced LRC export

## Lyrics format
The player reads `song.word-timings.json`, which stores both the start and end of every displayed word. The spans are aligned against the bundled recording and mapped back to all 342 displayed words. The downloadable Enhanced LRC is retained as a compatible start-time export.

## Deployment
GitHub Actions publishes the static site to GitHub Pages from `main`.

## Audio reactivity
The reactivity selector has three presets: Subtle, Balanced, and Dynamic. The audio is analysed locally by the browser after the user presses Play; no audio is uploaded for analysis. Browsers without Web Audio support still play the song and show synchronized lyrics, but do not show frequency-driven effects.

## Visual templates
- **Green Light** is the original green-and-mint player design.
- **Monochrome** uses a black background, white lyrics, and grayscale controls, meters, and page details.
Use the **Template** selector to switch designs without interrupting playback.

## Clean lyrics view
Use **UI ON** to hide the surrounding interface and leave only the synchronized lyrics and BASS / MIDS / AIR meters. Press `U` or double-click / double-tap the lyrics to restore the full interface. Playback can still be controlled with `Space` while the interface is hidden.

## Cinematic lyric transitions
The player uses GSAP 3.12.5 for a FLIP-style lyric reel: on normal line advances, the previous, current, and next lines glide into their new positions together. The incoming current line receives a restrained word stagger, with a brief ambient glow and a subtle cover-art accent. Seeks and larger jumps use a softer cross-fade instead of scrolling through skipped lines. If GSAP is unavailable, the player falls back to a small CSS line reveal; reduced-motion preferences disable the larger movement.
