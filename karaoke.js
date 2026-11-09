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
  const transitionGlow = document.querySelector(".lyric-transition-glow");
  const lyricPosition = $("lyricPosition");
  const lyricsMessage = $("lyricsMessage");
  const coverArt = document.querySelector(".cover-art");
  const reactivitySelect = $("reactivitySelect");
  const bassMeter = $("bassMeter");
  const midMeter = $("midMeter");
  const highMeter = $("highMeter");
  const templateSelect = $("templateSelect");
  const uiToggleButton = $("uiToggleButton");
  const lyricsPanel = document.querySelector(".lyrics-panel");

  const reactivityModes = {
    subtle: { gain: 0.62, beatThreshold: 0.13, label: "Subtle" },
    balanced: { gain: 1, beatThreshold: 0.09, label: "Balanced" },
    dynamic: { gain: 1.42, beatThreshold: 0.065, label: "Dynamic" }
  };

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let reactivityMode = "balanced";
  let isUiVisible = true;
  let lastTouchTap = 0;
  let lyricLines = [];
  let flatWords = [];
  let renderedLineIndex = -2;
  let lastActiveIndex = -1;
  let lineTransitionTimeline = null;
  let currentWordElements = [];
  let isSeeking = false;

  let audioContext = null;
  let analyser = null;
  let frequencyData = null;
  let animationFrameId = null;
  let lastFrameTime = 0;
  let previousBassRaw = 0;
  let lastBeatTime = 0;
  let beatPulse = 0;
  const smoothedEnergy = { bass: 0, mid: 0, high: 0 };

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
    const words = [];
    lines.forEach((line, lineIndex) => {
      line.startIndex = words.length;
      line.words.forEach((word, wordIndex) => {
        words.push({ ...word, lineIndex, wordIndex });
      });
    });
    return words;
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

  function renderLine(target, line, role) {
    target.className = "lyric-line " + role;
    if (!line) {
      target.textContent = "";
      return;
    }

    target.innerHTML = line.words.map((word, wordIndex) => {
      const globalIndex = line.startIndex + wordIndex;
      const safeWord = escapeHtml(word.text);
      return '<span class="word upcoming" data-global-index="' + globalIndex +
        '" style="--word-progress:0"><span class="word-visual"><span class="word-base">' + safeWord +
        '</span><span class="word-highlight" aria-hidden="true">' + safeWord + "</span></span></span>";
    }).join(" ");

    if (role === "lyric-current") {
      currentWordElements = [...target.querySelectorAll(".word")];
      target.classList.remove("line-enter");
      if (!window.gsap && !prefersReducedMotion) {
        void target.offsetWidth;
        target.classList.add("line-enter");
      }
    }
  }

  function captureLyricSlotPositions() {
    const rect = (element) => {
      if (!element || !element.textContent.trim()) return null;
      const bounds = element.getBoundingClientRect();
      return { top: bounds.top, height: bounds.height };
    };

    return {
      previous: rect(previousLine),
      current: rect(currentLine),
      next: rect(nextLine)
    };
  }

  function animateLyricTransition(oldLineIndex, newLineIndex, oldPositions) {
    const gsap = window.gsap;
    const slots = [previousLine, currentLine, nextLine];

    if (!gsap || prefersReducedMotion) {
      currentLine.classList.remove("line-enter");
      if (!gsap && !prefersReducedMotion) {
        void currentLine.offsetWidth;
        currentLine.classList.add("line-enter");
      }
      return;
    }

    if (lineTransitionTimeline) {
      lineTransitionTimeline.kill();
      lineTransitionTimeline = null;
    }

    slots.forEach((element) => {
      gsap.killTweensOf(element);
      gsap.set(element, { clearProps: "transform,opacity,filter,visibility" });
    });
    if (transitionGlow) {
      gsap.killTweensOf(transitionGlow);
      gsap.set(transitionGlow, { clearProps: "opacity,scale,visibility" });
    }

    const difference = oldLineIndex >= 0 ? newLineIndex - oldLineIndex : 0;
    const isAdjacent = Math.abs(difference) === 1;
    const direction = difference >= 0 ? 1 : -1;
    const currentTop = currentLine.getBoundingClientRect().top;
    const previousTop = previousLine.getBoundingClientRect().top;
    const nextTop = nextLine.getBoundingClientRect().top;

    // FLIP offsets make the three lyric slots glide like one vertical lyric reel.
    const previousFromY = isAdjacent && difference > 0 && oldPositions.current
      ? oldPositions.current.top - previousTop
      : -16;
    const currentSource = isAdjacent
      ? (difference > 0 ? oldPositions.next : oldPositions.previous)
      : null;
    const currentFromY = currentSource
      ? currentSource.top - currentTop
      : (oldLineIndex < 0 ? 22 : 12 * direction);
    const nextFromY = isAdjacent && difference < 0 && oldPositions.current
      ? oldPositions.current.top - nextTop
      : 16;

    const hasPrevious = Boolean(previousLine.textContent.trim());
    const hasNext = Boolean(nextLine.textContent.trim());
    const timeline = gsap.timeline({
      defaults: { overwrite: "auto" },
      onComplete: () => {
        slots.forEach((element) => gsap.set(element, { clearProps: "transform,opacity,filter,visibility" }));
        if (transitionGlow) gsap.set(transitionGlow, { clearProps: "opacity,scale,visibility" });
        lineTransitionTimeline = null;
      }
    });
    lineTransitionTimeline = timeline;

    if (hasPrevious) {
      timeline.fromTo(previousLine,
        { y: previousFromY, autoAlpha: isAdjacent && difference > 0 ? 0.12 : 0, filter: "blur(5px)", scale: .985 },
        { y: 0, autoAlpha: .52, filter: "blur(.2px)", scale: 1, duration: .62, ease: "power3.out" },
        0
      );
    }

    timeline.fromTo(currentLine,
      { y: currentFromY, autoAlpha: isAdjacent ? .24 : 0, filter: "blur(7px)", scale: .975 },
      { y: 0, autoAlpha: 1, filter: "blur(0px)", scale: 1, duration: .72, ease: "power4.out" },
      0
    );

    const wordVisualLayers = currentWordElements
      .map((element) => element.querySelector(".word-visual"))
      .filter(Boolean);
    if (wordVisualLayers.length) {
      timeline.fromTo(wordVisualLayers,
        { y: 13, autoAlpha: .28, filter: "blur(3px)" },
        { y: 0, autoAlpha: 1, filter: "blur(0px)", duration: .46, stagger: { each: .022, from: "start" }, ease: "power3.out" },
        .055
      );
    }

    if (hasNext) {
      timeline.fromTo(nextLine,
        { y: nextFromY, autoAlpha: isAdjacent && difference < 0 ? .16 : 0, filter: "blur(5px)", scale: .99 },
        { y: 0, autoAlpha: .52, filter: "blur(.2px)", scale: 1, duration: .66, ease: "power3.out" },
        .035
      );
    }

    if (transitionGlow) {
      gsap.set(transitionGlow, { clearProps: "opacity,scale" });
      timeline.fromTo(transitionGlow,
        { autoAlpha: 0, scale: .72 },
        { autoAlpha: .78, scale: 1.08, duration: .24, ease: "power2.out", yoyo: true, repeat: 1 },
        .015
      );
    }

    if (coverArt && isAdjacent) {
      timeline.fromTo(coverArt,
        { scale: 1 },
        { scale: 1.025, duration: .22, ease: "power2.out", yoyo: true, repeat: 1 },
        0
      );
    }
  }

  function renderLyrics(time = audio.currentTime || 0) {
    if (!lyricLines.length) return;

    const activeIndex = findActiveWord(time);
    if (activeIndex < 0) {
      if (renderedLineIndex !== -1) {
        previousLine.textContent = "";
        currentLine.className = "lyric-line lyric-current";
        currentLine.textContent = "The song is about to begin.";
        renderLine(nextLine, lyricLines[0], "lyric-next");
        currentWordElements = [];
        renderedLineIndex = -1;
        lastActiveIndex = -1;
        lyricPosition.textContent = "INTRO";
      }
      return;
    }

    const active = flatWords[activeIndex];
    const lineIndex = active.lineIndex;

    if (lineIndex !== renderedLineIndex) {
      const oldLineIndex = renderedLineIndex;
      const oldPositions = captureLyricSlotPositions();

      renderLine(previousLine, lyricLines[lineIndex - 1], "lyric-previous");
      renderLine(currentLine, lyricLines[lineIndex], "lyric-current");
      renderLine(nextLine, lyricLines[lineIndex + 1], "lyric-next");
      renderedLineIndex = lineIndex;
      lastActiveIndex = -1;
      lyricPosition.textContent = "LINE " + String(lineIndex + 1).padStart(2, "0") +
        " / " + String(lyricLines.length).padStart(2, "0");

      animateLyricTransition(oldLineIndex, lineIndex, oldPositions);
    }

    if (activeIndex !== lastActiveIndex) {
      currentWordElements.forEach((element) => {
        const globalIndex = Number(element.dataset.globalIndex);
        const state = globalIndex < activeIndex ? "done"
          : globalIndex === activeIndex ? "active" : "upcoming";
        if (element.dataset.state !== state) {
          element.dataset.state = state;
          element.classList.remove("done", "active", "upcoming");
          element.classList.add(state);
        }
      });
      lastActiveIndex = activeIndex;
      currentLine.dataset.activeWord = String(active.wordIndex);
    }

    const activeElement = currentWordElements[active.wordIndex];
    if (activeElement) {
      const nextWord = flatWords[activeIndex + 1];
      const nextTime = nextWord && nextWord.time > active.time
        ? nextWord.time
        : active.time + 0.32;
      const duration = Math.max(0.12, Math.min(1.15, nextTime - active.time));
      const progress = Math.min(1, Math.max(0, (time - active.time) / duration));
      activeElement.style.setProperty("--word-progress", progress.toFixed(3));
    }
  }

  function setUiVisible(visible) {
    isUiVisible = Boolean(visible);
    document.body.classList.toggle("ui-hidden", !isUiVisible);
    uiToggleButton.setAttribute("aria-pressed", String(isUiVisible));
    uiToggleButton.setAttribute("aria-label", isUiVisible ? "Hide interface" : "Show interface");
    uiToggleButton.textContent = isUiVisible ? "UI ON" : "UI OFF";
    if (!isUiVisible) uiToggleButton.blur();
  }

  function applyTemplate(templateName) {
    const allowedTemplates = ["green-light", "monochrome"];
    const selected = allowedTemplates.includes(templateName) ? templateName : "green-light";
    document.body.dataset.template = selected;
    templateSelect.value = selected;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";
    const safe = Math.max(0, Math.floor(seconds));
    return String(Math.floor(safe / 60)).padStart(2, "0") + ":" +
      String(safe % 60).padStart(2, "0");
  }

  function setRangeProgress(input, fraction) {
    input.style.setProperty("--range-progress",
      (Math.max(0, Math.min(1, fraction)) * 100) + "%");
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

    renderLyrics(current);
  }

  function smoothValue(current, target, deltaSeconds, attackSeconds, releaseSeconds) {
    const timeConstant = target > current ? attackSeconds : releaseSeconds;
    const amount = 1 - Math.exp(-deltaSeconds / timeConstant);
    return current + (target - current) * amount;
  }

  function readFrequencyBand(minHz, maxHz) {
    if (!analyser || !frequencyData || !audioContext) return 0;
    const binWidth = audioContext.sampleRate / analyser.fftSize;
    const firstBin = Math.max(1, Math.floor(minHz / binWidth));
    const lastBin = Math.min(frequencyData.length - 1, Math.ceil(maxHz / binWidth));
    if (lastBin <= firstBin) return 0;

    let total = 0;
    let count = 0;
    for (let index = firstBin; index <= lastBin; index += 1) {
      total += frequencyData[index];
      count += 1;
    }
    return count ? Math.pow(total / count / 255, 0.88) : 0;
  }

  function setMeter(element, value) {
    if (element) element.style.transform = "scaleX(" + Math.max(0, Math.min(1, value)).toFixed(3) + ")";
  }

  function updateAudioVisuals(deltaSeconds, now) {
    if (!analyser || !frequencyData) return;

    analyser.getByteFrequencyData(frequencyData);

    const bassRaw = readFrequencyBand(35, 150);
    const midRaw = readFrequencyBand(150, 2000);
    const highRaw = readFrequencyBand(2000, 9000);

    smoothedEnergy.bass = smoothValue(smoothedEnergy.bass, bassRaw, deltaSeconds, 0.045, 0.24);
    smoothedEnergy.mid = smoothValue(smoothedEnergy.mid, midRaw, deltaSeconds, 0.055, 0.2);
    smoothedEnergy.high = smoothValue(smoothedEnergy.high, highRaw, deltaSeconds, 0.035, 0.16);

    const mode = reactivityModes[reactivityMode];
    const motionGain = prefersReducedMotion ? mode.gain * 0.45 : mode.gain;
    const bassFlux = Math.max(0, bassRaw - previousBassRaw);
    const beatCooldown = reactivityMode === "dynamic" ? 190 : 245;

    if (bassFlux > mode.beatThreshold && bassRaw > 0.2 && now - lastBeatTime > beatCooldown) {
      beatPulse = Math.min(1, 0.48 + bassFlux * 3.4);
      lastBeatTime = now;
    }
    previousBassRaw = bassRaw;
    beatPulse *= Math.exp(-deltaSeconds / 0.2);

    const bassLevel = Math.min(1, smoothedEnergy.bass * motionGain + beatPulse * 0.46);
    const midLevel = Math.min(1, smoothedEnergy.mid * motionGain);
    const highLevel = Math.min(1, smoothedEnergy.high * motionGain);
    const pulseLevel = prefersReducedMotion ? 0 : beatPulse * motionGain;

    lyricsPanel.style.setProperty("--bass-level", bassLevel.toFixed(3));
    lyricsPanel.style.setProperty("--mid-level", midLevel.toFixed(3));
    lyricsPanel.style.setProperty("--high-level", highLevel.toFixed(3));
    lyricsPanel.style.setProperty("--beat-pulse", pulseLevel.toFixed(3));

    if (coverArt) {
      coverArt.style.setProperty("--bass-level", bassLevel.toFixed(3));
      coverArt.style.setProperty("--high-level", highLevel.toFixed(3));
      coverArt.style.setProperty("--beat-pulse", pulseLevel.toFixed(3));
    }

    setMeter(bassMeter, smoothedEnergy.bass);
    setMeter(midMeter, smoothedEnergy.mid);
    setMeter(highMeter, smoothedEnergy.high);
  }

  async function initialiseAudioAnalysis() {
    if (analyser) {
      if (audioContext && audioContext.state === "suspended") await audioContext.resume();
      return true;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      lyricsMessage.textContent = "Audio visual effects are unavailable in this browser. Lyrics will remain synchronized.";
      return false;
    }

    let mediaSource = null;
    let sourceConnectedToAnalyser = false;
    let analyserConnectedToDestination = false;
    try {
      audioContext = new AudioContextClass();
      mediaSource = audioContext.createMediaElementSource(audio);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      analyser.minDecibels = -88;
      analyser.maxDecibels = -18;
      analyser.smoothingTimeConstant = 0.68;
      mediaSource.connect(analyser);
      sourceConnectedToAnalyser = true;
      analyser.connect(audioContext.destination);
      analyserConnectedToDestination = true;
      frequencyData = new Uint8Array(analyser.frequencyBinCount);

      if (audioContext.state === "suspended") await audioContext.resume();
      lyricsMessage.textContent = flatWords.length + " word cues · live audio analysis enabled";
      return true;
    } catch (error) {
      // Keep the MP3 audible even if frequency analysis is unsupported or fails.
      try {
        if (mediaSource && audioContext && (!sourceConnectedToAnalyser || !analyserConnectedToDestination)) {
          mediaSource.connect(audioContext.destination);
        }
        if (audioContext && audioContext.state === "suspended") await audioContext.resume();
      } catch (_) {
        // The failure message below explains that only the visual effects are unavailable.
      }
      analyser = null;
      frequencyData = null;
      lyricsMessage.textContent = "Live audio analysis could not start. Synchronized lyrics remain available.";
      return false;
    }
  }

  function animationFrame(now) {
    const deltaSeconds = lastFrameTime
      ? Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000))
      : 1 / 60;
    lastFrameTime = now;

    updateAudioVisuals(deltaSeconds, now);
    updateClock();
    animationFrameId = window.requestAnimationFrame(animationFrame);
  }

  function startAnimationLoop() {
    if (animationFrameId !== null) return;
    lastFrameTime = 0;
    animationFrameId = window.requestAnimationFrame(animationFrame);
  }

  function relaxAudioVisuals() {
    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    lastFrameTime = 0;
    beatPulse = 0;
    previousBassRaw = 0;
    smoothedEnergy.bass = 0;
    smoothedEnergy.mid = 0;
    smoothedEnergy.high = 0;

    [lyricsPanel, coverArt].filter(Boolean).forEach((element) => {
      element.style.setProperty("--bass-level", "0");
      element.style.setProperty("--mid-level", "0");
      element.style.setProperty("--high-level", "0");
      element.style.setProperty("--beat-pulse", "0");
    });
    setMeter(bassMeter, 0);
    setMeter(midMeter, 0);
    setMeter(highMeter, 0);
  }

  async function loadLyrics() {
    try {
      const response = await fetch("./assets/song.enhanced.lrc", { cache: "no-cache" });
      if (!response.ok) throw new Error("Lyrics request failed: " + response.status);
      const source = await response.text();
      lyricLines = parseEnhancedLrc(source);
      flatWords = flattenWords(lyricLines);
      if (!flatWords.length) throw new Error("No word timestamps found in the LRC file.");
      lyricsMessage.textContent = flatWords.length + " word cues · ready for live audio analysis";
      renderLyrics(0);
    } catch (error) {
      lyricsMessage.textContent = "Could not load the synchronized lyrics. " + error.message;
      currentLine.textContent = "Lyrics unavailable.";
    }
  }

  playButton.addEventListener("click", async () => {
    if (audio.paused) {
      try {
        await initialiseAudioAnalysis();
        await audio.play();
      } catch (error) {
        lyricsMessage.textContent = "Playback could not start: " + error.message;
      }
    } else {
      audio.pause();
    }
  });

  audio.addEventListener("play", () => {
    playButton.classList.add("is-playing");
    playButton.setAttribute("aria-label", "Pause");
    startAnimationLoop();
  });

  audio.addEventListener("pause", () => {
    playButton.classList.remove("is-playing");
    playButton.setAttribute("aria-label", "Play");
    relaxAudioVisuals();
    updateClock();
  });

  audio.addEventListener("ended", () => {
    relaxAudioVisuals();
    updateClock();
  });
  audio.addEventListener("timeupdate", updateClock);
  audio.addEventListener("loadedmetadata", updateClock);
  audio.addEventListener("durationchange", updateClock);
  audio.addEventListener("seeking", () => {
    if (lineTransitionTimeline) {
      lineTransitionTimeline.kill();
      lineTransitionTimeline = null;
    }
    if (window.gsap) {
      [previousLine, currentLine, nextLine].forEach((element) => {
        window.gsap.killTweensOf(element);
        window.gsap.set(element, { clearProps: "transform,opacity,filter,visibility" });
      });
      if (transitionGlow) {
        window.gsap.killTweensOf(transitionGlow);
        window.gsap.set(transitionGlow, { clearProps: "opacity,scale,visibility" });
      }
    }
  });
  audio.addEventListener("seeked", () => {
    renderedLineIndex = -2;
    lastActiveIndex = -1;
    updateClock();
  });

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

  reactivitySelect.addEventListener("change", (event) => {
    reactivityMode = event.target.value in reactivityModes ? event.target.value : "balanced";
    reactivitySelect.title = reactivityModes[reactivityMode].label + " audio response";
  });

  templateSelect.addEventListener("change", (event) => {
    applyTemplate(event.target.value);
  });

  uiToggleButton.addEventListener("click", () => {
    setUiVisible(!isUiVisible);
  });

  // Double-click (or double-tap on touch screens) the lyrics to restore the controls.
  lyricsPanel.addEventListener("dblclick", () => {
    if (!isUiVisible) setUiVisible(true);
  });
  lyricsPanel.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch" || isUiVisible) return;
    const now = performance.now();
    if (now - lastTouchTap < 360) {
      lastTouchTap = 0;
      setUiVisible(true);
    } else {
      lastTouchTap = now;
    }
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
      if (isUiVisible) $("fullscreenButton").click();
    } else if (event.key.toLowerCase() === "u") {
      setUiVisible(!isUiVisible);
    }
  });

  audio.addEventListener("error", () => {
    lyricsMessage.textContent = "The audio file could not be loaded. Try refreshing the page.";
  });

  loadLyrics();
})();
