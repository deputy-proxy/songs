# The Ground Beneath Our Shoes — Karaoke

A static karaoke player with Enhanced LRC word timing and real-time audio-reactive visuals.

## Play
Open the GitHub Pages site and press Play. The MP3 and Enhanced LRC are bundled with the page. Word fills follow the audio playback clock, while the Web Audio API analyses bass, midrange, and high-frequency energy locally in the browser. Frequency energy drives the lyric glow, pulse, cover art, and live frequency meters. Bass transients add beat accents. Seeking and playback-speed changes remain synchronized.

## Repository layout
- `index.html` — karaoke page
- `style.css` — responsive display
- `karaoke.js` — audio playback, Enhanced LRC timing, Web Audio analysis, and animation loop
- `assets/song.mp3` — uploaded recording
- `assets/song.enhanced.lrc` — Suno word alignment

## Lyrics format
The LRC uses Enhanced LRC word timestamps, with each word prefixed by its start position, for example `<00:13.14>You <00:13.36>wake`.

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
