(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const audio = $("song");
  const playButton = $("playButton");
  const seekBar = $("seekBar");
  const volumeBar = $("volumeBar");
  const currentTimeLabel = $("currentTime");
  const totalTimeLabel = $("totalTime");
  const durationLabel = $("durationLabel");
  const previousLine = $("previousLine");
  const currentLine = $("currentLine");
  const nextLine = $("nextLine");
  const lyricPosition = $("lyricPosition");
  const lyricsMessage = $("lyricsMessage");
  const lyricsStage = $("lyricsStage");

  let lyricLines = [];
  let flatWords = [];
  let lastRenderedKey = "";
  let isSeeking = false;
  let localAudioUrl = null;
  const localAudioButton = $("localAudioButton");
  const localAudioInput = $("localAudioInput");
  const audioFileStatus = $("audioFileStatus");

  function parseEnhancedLrc(source) {
    const parsed = [];
    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || /^\[(ti|ar|al|length|by|offset|re|ve):/i.test(line)) continue;
      const matches = [...line.matchAll(/<(\d{2}):(\d{2})\.(\d{2,3})>([^<]*)/g)];
      const words = matches.map((match) => ({
        text: match[4].trim(),
        time: Number(match[1]) * 60 + Number(match[2]) + Number("0." + match[3])
      })).filter((word) => word.text);
      if (words.length) parsed.push({ start: words[0].time, words });
    }
    return parsed;
  }

  function flattenWords(lines) {
    return lines.flatMap((line, lineIndex) =>
      line.words.map((word, wordIndex) => ({ ...word, lineIndex, wordIndex }))
    );
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function findActiveWord(time) {
    let low = 0;
    let high = flatWords.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (flatWords[mid].time <= time) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return found;
  }

  function renderLine(target, line, activeWordIndex, lineIndex, role) {
    if (!line) {
      target.textContent = "";
      target.className = "lyric-line " + role;
      return;
    }
    target.className = "lyric-line " + role;
    target.innerHTML = line.words.map((word, wordIndex) => {
      const globalIndex = flatWords.findIndex((item) =>
        item.lineIndex === lineIndex && item.wordIndex === wordIndex
      );
      const state = globalIndex < activeWordIndex ? "done"
        : globalIndex === activeWordIndex ? "active" : "upcoming";
      return '<span class="word ' + state + '">' + escapeHtml(word.text) + "</span>";
    }).join(" ");
  }

  function renderLyrics() {
    if (!lyricLines.length) return;
    const activeIndex = findActiveWord(audio.currentTime || 0);
    if (activeIndex < 0) {
      previousLine.textContent = "";
      currentLine.textContent = "The song is about to begin.";
      nextLine.textContent = lyricLines[0].words.map((word) => word.text).join(" ");
      lyricPosition.textContent = "INTRO";
      return;
    }

    const active = flatWords[activeIndex];
    const lineIndex = active.lineIndex;
    const key = lineIndex + ":" + activeIndex;
    if (key === lastRenderedKey) return;
    lastRenderedKey = key;

    renderLine(previousLine, lyricLines[lineIndex - 1], activeIndex, lineIndex - 1, "lyric-previous");
    renderLine(currentLine, lyricLines[lineIndex], activeIndex, lineIndex, "lyric-current");
    renderLine(nextLine, lyricLines[lineIndex + 1], activeIndex, lineIndex + 1, "lyric-next");

    lyricPosition.textContent = "LINE " + String(lineIndex + 1).padStart(2, "0") +
      " / " + String(lyricLines.length).padStart(2, "0");
    currentLine.dataset.activeWord = String(active.wordIndex);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";
    const safe = Math.max(0, Math.floor(seconds));
    return String(Math.floor(safe / 60)).padStart(2, "0") + ":" +
      String(safe % 60).padStart(2, "0");
  }

  function setRangeProgress(input, fraction) {
    input.style.setProperty("--range-progress", (Math.max(0, Math.min(1, fraction)) * 100) + "%");
  }

  function updateClock() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const current = audio.currentTime || 0;
    currentTimeLabel.textContent = formatTime(current);
    totalTimeLabel.textContent = formatTime(duration);
    durationLabel.textContent = formatTime(duration);
    if (!isSeeking && duration > 0) {
      const fraction = current / duration;
      seekBar.value = String(Math.round(fraction * 1000));
      setRangeProgress(seekBar, fraction);
    }
    renderLyrics();
  }

  async function loadLyrics() {
    try {
      const response = await fetch("./assets/song.enhanced.lrc", { cache: "no-cache" });
      if (!response.ok) throw new Error("Lyrics request failed: " + response.status);
      const source = await response.text();
      lyricLines = parseEnhancedLrc(source);
      flatWords = flattenWords(lyricLines);
      if (!flatWords.length) throw new Error("No word timestamps found in the LRC file.");
      lyricsMessage.textContent = flatWords.length + " word cues · Suno alignment";
      renderLyrics();
    } catch (error) {
      lyricsMessage.textContent = "Could not load the synchronized lyrics. " + error.message;
      currentLine.textContent = "Lyrics unavailable.";
    }
  }

  playButton.addEventListener("click", async () => {
    if (audio.paused) {
      try { await audio.play(); } catch (error) {
        lyricsMessage.textContent = "Playback could not start: " + error.message;
      }
    } else {
      audio.pause();
    }
  });

  audio.addEventListener("play", () => {
    playButton.classList.add("is-playing");
    playButton.setAttribute("aria-label", "Pause");
  });
  audio.addEventListener("pause", () => {
    playButton.classList.remove("is-playing");
    playButton.setAttribute("aria-label", "Play");
  });
  audio.addEventListener("timeupdate", updateClock);
  audio.addEventListener("loadedmetadata", updateClock);
  audio.addEventListener("durationchange", updateClock);
  audio.addEventListener("seeked", () => { lastRenderedKey = ""; updateClock(); });

  seekBar.addEventListener("input", () => {
    isSeeking = true;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = (Number(seekBar.value) / 1000) * audio.duration;
      setRangeProgress(seekBar, Number(seekBar.value) / 1000);
      updateClock();
    }
  });
  seekBar.addEventListener("change", () => { isSeeking = false; });

  volumeBar.addEventListener("input", () => {
    audio.volume = Number(volumeBar.value);
    audio.muted = audio.volume === 0;
    setRangeProgress(volumeBar, audio.volume);
  });
  audio.volume = Number(volumeBar.value);
  setRangeProgress(volumeBar, audio.volume);

  $("muteButton").addEventListener("click", () => {
    audio.muted = !audio.muted;
    $("muteButton").setAttribute("aria-label", audio.muted ? "Unmute" : "Mute");
  });
  $("speedSelect").addEventListener("change", (event) => {
    audio.playbackRate = Number(event.target.value);
  });

  $("fullscreenButton").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      lyricsMessage.textContent = "Fullscreen is unavailable in this browser.";
    }
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target && ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"].includes(target.tagName)) return;
    if (event.code === "Space") {
      event.preventDefault();
      playButton.click();
    } else if (event.key === "ArrowLeft") {
      audio.currentTime = Math.max(0, audio.currentTime - 5);
    } else if (event.key === "ArrowRight") {
      audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 5);
    } else if (event.key.toLowerCase() === "f") {
      $("fullscreenButton").click();
    }
  });

  audio.addEventListener("error", () => {
    lyricsMessage.textContent = "The audio file could not be loaded. Check that assets/song.mp3 exists.";
  });


  localAudioButton.addEventListener("click", () => localAudioInput.click());
  localAudioInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (localAudioUrl) URL.revokeObjectURL(localAudioUrl);
    localAudioUrl = URL.createObjectURL(file);
    audio.src = localAudioUrl;
    audio.load();
    audioFileStatus.textContent = file.name;
    lyricsMessage.textContent = "Local audio loaded. Word highlighting is using the uploaded LRC timeline.";
    lastRenderedKey = "";
  });

  loadLyrics();
})();
