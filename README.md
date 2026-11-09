# The Ground Beneath Our Shoes — Karaoke

A small, static karaoke page with word-by-word lyric highlighting.

## Play
Open the GitHub Pages site and press Play. The Enhanced LRC is bundled with the page. The MP3 asset still needs to be added at `assets/song.mp3`; until then, use **LOAD MP3 FROM DEVICE** to select the recording locally. The player uses the audio element's playback clock, so seeking and playback-speed changes keep the lyric highlight synchronized.

## Repository layout
- `index.html` — karaoke page
- `style.css` — responsive display
- `karaoke.js` — audio and Enhanced LRC playback logic
- `assets/song.mp3` — uploaded recording (pending binary upload)
- `assets/song.enhanced.lrc` — Suno word alignment

## Lyrics format
The LRC uses Enhanced LRC word timestamps, with each word prefixed by its start position, for example `<00:13.14>You <00:13.36>wake`.

## Deployment
GitHub Actions publishes the static site to GitHub Pages from `main`.
