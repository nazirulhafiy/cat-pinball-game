import { CAT_IDS, CAT_PROFILES } from './game/cats';
import { createGame } from './game/createGame';
import { GameAudio } from './game/audio';
import { addLeaderboardEntry, normalizeLeaderboard } from './game/leaderboard';
import type { ScoreEntry } from './game/leaderboard';
import type { CatId, GameController, GameSnapshot, SpecialMode } from './game/contracts';
import './styles.css';

const HIGH_SCORE_KEY = 'nine-lives-high-score';
const SELECTED_CAT_KEY = 'nine-lives-selected-cat';
const MUTED_KEY = 'nine-lives-muted';
const PLAYER_NAME_KEY = 'nine-lives-player-name';
const PLAYER_ID_KEY = 'nine-lives-player-id';
const LEADERBOARD_KEY = 'cat-balls-all-time-high-scores';
const LOAD_SCREEN_MINIMUM_MS = 1100;
const loadScreenStartedAt = performance.now();
const app = document.querySelector<HTMLElement>('#app') as HTMLElement;

if (!app) throw new Error('The app mount is missing.');

const storedCat = localStorage.getItem(SELECTED_CAT_KEY) as CatId | null;
let selectedCat: CatId = storedCat && CAT_IDS.includes(storedCat) ? storedCat : 'calico';
let highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
let muted = localStorage.getItem(MUTED_KEY) === 'true';
let playerName = localStorage.getItem(PLAYER_NAME_KEY)?.trim() || null;
let leaderboard = loadLeaderboard();
let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let controller: GameController | null = null;
let launchGuideDismissed = false;
const titleAudio = new GameAudio();
titleAudio.setMuted(muted);
const MODE_LABELS: Record<SpecialMode, string> = {
  normal: 'Paws of Chaos',
  'mouse-hunt': 'Mouse Hunt',
  'laser-chase': 'Laser Chase',
  zoomies: 'Zoomies',
  'roomba-rumble': 'Vacuum Fight',
};

const money = (value: number) => value.toLocaleString('en-US');
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
})[character] ?? character);
const uiAccent = (cat: (typeof CAT_PROFILES)[CatId]) => cat.id === 'tuxedo' || cat.id === 'white' ? cat.cssAccent : cat.cssPrimary;
const lifeBalls = (cat: CatId, count: number) => Array.from(
  { length: Math.max(0, count) },
  () => `<img class="life-ball" src="/assets/cats/${cat}/ball-v1.png" alt="" aria-hidden="true">`,
).join('');
const el = <T extends HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};

function setLive(message: string) {
  el('#live-status').textContent = message;
}

function playCatSelectionCue(id: CatId) {
  if (muted) return;
  void titleAudio.unlock().then(() => titleAudio.cue('select', id));
}

function ensurePlayerId() {
  const storedPlayerId = localStorage.getItem(PLAYER_ID_KEY);
  if (storedPlayerId) return storedPlayerId;
  const playerId = crypto.randomUUID();
  localStorage.setItem(PLAYER_ID_KEY, playerId);
  return playerId;
}

function loadLeaderboard(): ScoreEntry[] {
  const storedLeaderboard = localStorage.getItem(LEADERBOARD_KEY);
  if (!storedLeaderboard) return [];
  try {
    return normalizeLeaderboard(JSON.parse(storedLeaderboard));
  } catch {
    return [];
  }
}

function leaderboardRows(currentEntryId: string) {
  return leaderboard.map((entry, index) => {
    const cat = CAT_PROFILES[entry.catId];
    return `<li class="${entry.id === currentEntryId ? 'is-current' : ''}">
      <span class="leaderboard-rank">${index + 1}</span>
      <span class="leaderboard-player"><strong>${escapeHtml(entry.playerName)}</strong><small>${cat.name}</small></span>
      <b>${money(entry.score)}</b>
    </li>`;
  }).join('');
}

function renderWelcome() {
  if (playerName) {
    renderTitle();
    return;
  }
  controller?.destroy();
  controller = null;
  app.innerHTML = `<main class="shell welcome-shell">
    <header class="welcome-nav">
      <button id="mute" class="icon-button" type="button" aria-label="${muted ? 'Unmute sound' : 'Mute sound'}" aria-pressed="${muted}">${muted ? '♩' : '♫'}</button>
    </header>
    <section class="welcome-stage" aria-labelledby="welcome-title">
      <div class="welcome-story">
        <h1 id="welcome-title"><span>Cat Balls:</span> Paws of Chaos</h1>
      </div>
      <form id="player-form" class="welcome-card" novalidate>
        <h2>What should we call you?</h2>
        <label for="player-name-input">Display name</label>
        <input id="player-name-input" name="playerName" type="text" maxlength="20" autocomplete="nickname" enterkeyhint="go" spellcheck="false" placeholder="Your name" aria-describedby="player-name-help player-name-error" required>
        <p id="player-name-error" class="field-error" aria-live="polite"></p>
        <button class="play-button" type="submit">Continue <span aria-hidden="true">↗</span></button>
        <p id="player-name-help" class="storage-note">Saved on this device.</p>
      </form>
    </section>
    <div id="live-status" class="sr-only" aria-live="polite"></div>
  </main>`;
  const input = el<HTMLInputElement>('#player-name-input');
  window.requestAnimationFrame(() => input.focus());
  el<HTMLFormElement>('#player-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const nextName = input.value.replace(/\s+/g, ' ').trim();
    const error = el('#player-name-error');
    if (!nextName) {
      input.setAttribute('aria-invalid', 'true');
      error.textContent = 'Enter a name to continue.';
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    ensurePlayerId();
    playerName = nextName;
    localStorage.setItem(PLAYER_NAME_KEY, playerName);
    renderTitle();
    setLive(`Welcome, ${playerName}. Choose your cat.`);
  });
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    el('#player-name-error').textContent = '';
  });
  bindMute();
}

function catCardPortrait(id: CatId) {
  return `<span class="cat-portrait-stack" aria-hidden="true"><img class="cat-portrait-layer cat-portrait-base" src="/assets/cats/${id}/portrait-v1.png" alt="" decoding="async"><img class="cat-portrait-layer cat-portrait-blink" src="/assets/cats/${id}/portrait-blink-v1.png" alt="" decoding="async"></span>`;
}

function transformationCatArt(id: CatId) {
  return `<img class="comet-cat-art" src="/assets/cats/${id}/ball-v1.png" alt="" aria-hidden="true">`;
}

function catCards() {
  return CAT_IDS.map((id) => {
    const cat = CAT_PROFILES[id];
    const selected = id === selectedCat;
    return `<div class="cat-slot ${selected ? 'is-active' : ''}">
      <button class="cat-card ${selected ? 'is-selected' : ''}" type="button" data-cat="${id}" aria-pressed="${selected}" aria-label="Select ${cat.name}, ${cat.title}">
        <span class="cat-card-art">${catCardPortrait(id)}</span>
        <span class="cat-card-name"><strong>${cat.name}</strong><small>${cat.title}</small></span>
      </button>
    </div>`;
  }).join('');
}

function selectCat(id: CatId) {
  if (id === selectedCat) return;
  selectedCat = id;
  localStorage.setItem(SELECTED_CAT_KEY, selectedCat);
  playCatSelectionCue(selectedCat);
  renderTitle();
  setLive(`${CAT_PROFILES[selectedCat].name} selected.`);
}

function shiftSelectedCat(direction: -1 | 1) {
  const currentIndex = CAT_IDS.indexOf(selectedCat);
  selectedCat = CAT_IDS[(currentIndex + direction + CAT_IDS.length) % CAT_IDS.length];
  localStorage.setItem(SELECTED_CAT_KEY, selectedCat);
  playCatSelectionCue(selectedCat);
  renderTitle();
  setLive(`${CAT_PROFILES[selectedCat].name} selected.`);
}

function renderTitle() {
  controller?.destroy();
  controller = null;
  const cat = CAT_PROFILES[selectedCat];
  app.innerHTML = `<main class="shell title-shell" style="--cat-primary:${uiAccent(cat)};--cat-secondary:${cat.cssSecondary};--cat-accent:${cat.cssAccent}">
    <header class="title-nav">
      <span class="title-mark" aria-hidden="true">✦</span>
      <div class="title-nav-actions"><button id="how-to-play" class="title-nav-button" type="button">How to play</button>${highScore > 0 ? `<span class="title-best">Best <b>${money(highScore)}</b></span>` : ''}<button id="mute" class="icon-button" type="button" aria-label="${muted ? 'Unmute sound' : 'Mute sound'}" aria-pressed="${muted}">${muted ? '♩' : '♫'}</button></div>
    </header>
    <section class="title-stage" aria-labelledby="choose-title">
      <div class="title-intro"><h1 id="choose-title"><span>Cat Balls:</span> Paws of Chaos</h1><p>Choose your cat.</p></div>
      <div class="cat-showcase">
        <div class="player-session"><span>Playing as <strong id="player-name"></strong></span></div>
        <div class="carousel-frame">
          <button id="previous-cat" class="carousel-arrow previous" type="button" aria-label="Previous cat">←</button>
          <div class="cat-carousel">${catCards()}</div>
          <button id="next-cat" class="carousel-arrow next" type="button" aria-label="Next cat">→</button>
        </div>
        <div class="selection-actions"><button id="play" class="play-button" type="button">Play as ${cat.name} <span aria-hidden="true">↗</span></button></div>
      </div>
    </section>
  </main><div id="live-status" class="sr-only" aria-live="polite"></div>`;
  el('#player-name').textContent = playerName ?? '';
  document.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((button) => button.addEventListener('click', () => {
    selectCat(button.dataset.cat as CatId);
  }));
  document.querySelectorAll<HTMLImageElement>('.cat-portrait-blink').forEach((image) => image.addEventListener('error', () => image.remove(), { once: true }));
  el<HTMLButtonElement>('#previous-cat').addEventListener('click', () => shiftSelectedCat(-1));
  el<HTMLButtonElement>('#next-cat').addEventListener('click', () => shiftSelectedCat(1));
  el<HTMLButtonElement>('#how-to-play').addEventListener('click', showHowToPlay);
  el<HTMLButtonElement>('#play').addEventListener('click', beginTransformation);
  bindMute();
}

function showHowToPlay() {
  app.insertAdjacentHTML('beforeend', `<section class="overlay" role="dialog" aria-modal="true" aria-labelledby="how-to-title"><div class="overlay-card how-to-card"><p class="eyebrow">House rules</p><h2 id="how-to-title">Make some mischief</h2><div class="how-to-steps"><p><b>1</b><span><strong>Wind and launch</strong>Hold Space or Launch, then release.</span></p><p><b>2</b><span><strong>Bat the ball</strong>Use A for the left flipper and D for the right.</span></p><p><b>3</b><span><strong>Hit what moves</strong>Catch the mouse for a bonus. Hit the moving red dot four times to finish Laser Chase.</span></p><p><b>4</b><span><strong>Wake the vacuum</strong>Open the box three times for Zoomies. Finish Laser Chase and Zoomies to wake the vacuum.</span></p></div><button id="close-how-to" class="play-button" type="button">Got it</button></div></section>`);
  el<HTMLButtonElement>('#close-how-to').focus();
  el<HTMLButtonElement>('#close-how-to').addEventListener('click', () => document.querySelector('.overlay')?.remove());
}

function beginTransformation() {
  const cat = CAT_PROFILES[selectedCat];
  app.insertAdjacentHTML('beforeend', `<section class="transformation ${reducedMotion ? 'reduced' : ''}" aria-label="Starting game">${transformationCatArt(selectedCat)}<p>${cat.name} is catching the moonbeam...</p><button id="skip-transform" type="button">Skip</button></section>`);
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    startGame();
  };
  el('#skip-transform').addEventListener('click', start, { once: true });
  window.setTimeout(start, reducedMotion ? 120 : 1100);
}

function startGame() {
  document.querySelector('.transformation')?.remove();
  renderGame();
  const mount = el<HTMLElement>('#game-mount');
  controller = createGame({
    parent: mount,
    cat: selectedCat,
    highScore,
    muted,
    reducedMotion,
    callbacks: {
      onSnapshot(next) { updateHud(next); },
      onGameOver(score) { showGameOver(score); },
      onFirstInteraction() { setLive('Pinball table active.'); },
    },
  });
  window.requestAnimationFrame(() => mount.focus());
  setLive(`${CAT_PROFILES[selectedCat].name} is on the table. Hold Space, then release to launch.`);
}

function renderGame() {
  const cat = CAT_PROFILES[selectedCat];
  launchGuideDismissed = false;
  app.innerHTML = `<main class="shell game-shell" style="--cat-primary:${uiAccent(cat)};--cat-secondary:${cat.cssSecondary};--cat-accent:${cat.cssAccent}">
    <header class="game-header arcade-hud" aria-label="Game status"><button id="home" class="word-button" type="button">← Cats</button><div class="score-stat"><span>Score</span><strong id="score">0</strong><small>Best <b id="high-score">${money(highScore)}</b></small></div><div class="lives-stat"><span>Lives</span><strong id="lives" data-count="3" aria-label="3 lives">${lifeBalls(selectedCat, 3)}</strong></div><div class="game-title"><span>Cat Balls:</span><b id="game-subtitle">Paws of Chaos</b></div><div class="header-actions"><button id="game-help" class="icon-button" type="button" aria-label="How to play">?</button><button id="mute" class="icon-button" type="button" aria-label="${muted ? 'Unmute sound' : 'Mute sound'}" aria-pressed="${muted}">${muted ? '♩' : '♫'}</button><button id="pause" class="icon-button" type="button" aria-label="Pause game">Ⅱ</button></div></header>
    <section class="play-area"><div class="table-column"><div class="table-wrap"><div id="game-mount" tabindex="0" aria-label="Pinball table"></div><div id="launch-guide" class="launch-guide" role="note"><p>Launcher</p><strong>Hold <kbd>Space</kbd> · Release</strong><small><kbd>A</kbd> left · <kbd>D</kbd> right</small></div></div></div></section>
    <section class="control-row" aria-label="Touch controls"><div class="touch-controls"><button class="touch-button" data-control="left" type="button" aria-label="Left flipper">Left</button><button class="touch-button launch" data-control="launch" type="button" aria-label="Hold and release to launch ball">Launch</button><button class="touch-button" data-control="right" type="button" aria-label="Right flipper">Right</button></div></section>
    <div id="live-status" class="sr-only" aria-live="polite"></div>
  </main>`;
  el('#home').addEventListener('click', renderTitle);
  el('#game-help').addEventListener('click', showHowToPlay);
  el('#pause').addEventListener('click', pauseGame);
  bindMute();
  document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(bindTouchControl);
}

function bindTouchControl(button: HTMLButtonElement) {
  const control = button.dataset.control;
  const dispatch = (down: boolean) => window.dispatchEvent(new CustomEvent(`nine-lives:${control}`, { detail: { down } }));
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); dispatch(true); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((eventName) => button.addEventListener(eventName, () => dispatch(false)));
}

function updateHud(next: GameSnapshot) {
  el('#score').textContent = money(next.score);
  highScore = Math.max(highScore, next.highScore, next.score);
  localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
  el('#high-score').textContent = money(highScore);
  const lives = el('#lives');
  const lifeCount = Math.max(next.lives, 0);
  if (lives.dataset.count !== String(lifeCount)) {
    lives.dataset.count = String(lifeCount);
    lives.innerHTML = lifeBalls(selectedCat, lifeCount);
  }
  lives.setAttribute('aria-label', `${next.lives} lives`);
  el('#game-subtitle').textContent = next.mode !== 'normal'
    ? `${MODE_LABELS[next.mode]}${next.modeSeconds ? ` · ${next.modeSeconds}s` : ''}`
    : next.bossReady
      ? 'Vacuum ready'
      : MODE_LABELS.normal;
  if (next.phase !== 'ready') launchGuideDismissed = true;
  const launchGuide = document.querySelector<HTMLElement>('#launch-guide');
  if (launchGuide) {
    const showLaunchGuide = next.phase === 'ready' && !launchGuideDismissed;
    launchGuide.classList.toggle('is-hidden', !showLaunchGuide);
    launchGuide.setAttribute('aria-hidden', String(!showLaunchGuide));
  }
}

function pauseGame() {
  controller?.pause();
  app.insertAdjacentHTML('beforeend', `<section class="overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="overlay-card"><p class="eyebrow">Paws for a moment</p><h2 id="pause-title">Game paused</h2><p>The house will wait for you.</p><button id="resume" class="play-button" type="button">Resume game</button><button id="restart-from-pause" class="text-button" type="button">Restart run</button></div></section>`);
  el('#resume').focus();
  el('#resume').addEventListener('click', () => { document.querySelector('.overlay')?.remove(); controller?.resume(); });
  el('#restart-from-pause').addEventListener('click', restartGame);
}

function restartGame() {
  document.querySelector('.overlay')?.remove();
  launchGuideDismissed = false;
  controller?.restart();
  controller?.resume();
  setLive('New game started.');
}

function showGameOver(score: number) {
  highScore = Math.max(highScore, score);
  localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
  const cat = CAT_PROFILES[selectedCat];
  const currentEntry: ScoreEntry = {
    id: crypto.randomUUID(),
    playerName: playerName ?? 'Player',
    score,
    catId: selectedCat,
    achievedAt: Date.now(),
  };
  leaderboard = addLeaderboardEntry(leaderboard, currentEntry);
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard));
  app.insertAdjacentHTML('beforeend', `<section class="overlay" role="dialog" aria-modal="true" aria-labelledby="game-over-title"><div class="overlay-card game-over" style="--cat-primary:${uiAccent(cat)}"><p class="eyebrow">The sun is coming up</p><h2 id="game-over-title">Nine lives spent</h2><div class="final-score"><span>Final score</span><strong>${money(score)}</strong><span>Personal best: ${money(highScore)}</span></div><section class="leaderboard-panel" aria-labelledby="leaderboard-title"><div class="leaderboard-heading"><h3 id="leaderboard-title">All-time high scores</h3><span>On this device</span></div><ol>${leaderboardRows(currentEntry.id)}</ol></section><button id="retry" class="play-button" type="button">Zoom again as ${cat.name}</button><button id="choose-again" class="text-button" type="button">Choose another cat</button></div></section>`);
  el('#retry').focus();
  el('#retry').addEventListener('click', restartGame);
  el('#choose-again').addEventListener('click', renderTitle);
  setLive(`Game over. Score ${money(score)}. High score ${money(highScore)}.`);
}

function bindMute() {
  el<HTMLButtonElement>('#mute').addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem(MUTED_KEY, String(muted));
    document.documentElement.dataset.muted = String(muted);
    controller?.setMuted(muted);
    titleAudio.setMuted(muted);
    const button = el<HTMLButtonElement>('#mute');
    button.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    button.setAttribute('aria-pressed', String(muted));
    button.textContent = muted ? '♩' : '♫';
    setLive(muted ? 'Sound muted.' : 'Sound on.');
  });
}

window.addEventListener('keydown', (event) => {
  if (!controller && document.querySelector('.title-shell') && !document.querySelector('.overlay')) {
    if (event.key === 'ArrowLeft') shiftSelectedCat(-1);
    if (event.key === 'ArrowRight') shiftSelectedCat(1);
  }
  if (event.key.toLowerCase() === 'p' && controller && !document.querySelector('.overlay')) pauseGame();
  if (event.key.toLowerCase() === 'r' && controller) restartGame();
});
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (event) => { reducedMotion = event.matches; });
document.documentElement.dataset.muted = String(muted);

const windowLoaded = document.readyState === 'complete'
  ? Promise.resolve()
  : new Promise<void>((resolve) => window.addEventListener('load', () => resolve(), { once: true }));

async function startApp() {
  const minimumDelay = Math.max(0, LOAD_SCREEN_MINIMUM_MS - (performance.now() - loadScreenStartedAt));
  await Promise.all([
    windowLoaded,
    new Promise<void>((resolve) => window.setTimeout(resolve, reducedMotion ? 0 : minimumDelay)),
  ]);
  const loader = document.querySelector<HTMLElement>('.site-loader');
  loader?.classList.add('is-complete');
  if (!reducedMotion) await new Promise<void>((resolve) => window.setTimeout(resolve, 260));
  if (playerName) renderTitle();
  else renderWelcome();
}

void startApp();
