import { CAT_IDS, CAT_PROFILES } from './game/cats';
import { asset } from './game/asset';
import { createGame } from './game/createGame';
import { GameAudio } from './game/audio';
import { addLeaderboardEntry, normalizeLeaderboard } from './game/leaderboard';
import type { ScoreEntry } from './game/leaderboard';
import type { CatId, GameController, GameSnapshot, SpecialMode } from './game/contracts';
import './styles.css';
import './start.css';

const HIGH_SCORE_KEY = 'nine-lives-high-score';
const SELECTED_CAT_KEY = 'nine-lives-selected-cat';
const MUTED_KEY = 'nine-lives-muted';
const PLAYER_NAME_KEY = 'nine-lives-player-name';
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
let runStartingHighScore = highScore;
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
const uiAccent = (cat: (typeof CAT_PROFILES)[CatId]) => cat.id === 'tuxedo' || cat.id === 'white' ? cat.cssAccent : cat.cssPrimary;
const lifeBalls = (cat: CatId, count: number) => Array.from(
  { length: Math.max(0, count) },
  () => `<img class="life-ball" src="${asset(`/assets/cats/${cat}/ball-v1.png`)}" alt="" aria-hidden="true">`,
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

function loadLeaderboard(): ScoreEntry[] {
  const storedLeaderboard = localStorage.getItem(LEADERBOARD_KEY);
  if (!storedLeaderboard) return [];
  try {
    return normalizeLeaderboard(JSON.parse(storedLeaderboard));
  } catch {
    return [];
  }
}

function titleHighScoreMarkup() {
  const topScoreValue = leaderboard[0]?.score ?? highScore;
  if (topScoreValue <= 0) return '';
  const formattedScore = money(topScoreValue);
  return `<span class="start-score" aria-label="High score ${formattedScore}"><small>High score</small><strong>${formattedScore}</strong></span>`;
}

function transformationCatArt(id: CatId) {
  return `<img class="comet-cat-art" src="${asset(`/assets/cats/${id}/ball-v1.png`)}" alt="" aria-hidden="true">`;
}

function ballPickers() {
  return CAT_IDS.map((id) => {
    const cat = CAT_PROFILES[id];
    const selected = id === selectedCat;
    return `<button class="ball-pick ${selected ? 'is-selected' : ''}" type="button" data-cat="${id}" aria-pressed="${selected}" aria-label="Select ${cat.name}, ${cat.title}">
      <img src="${asset(`/assets/cats/${id}/ball-v1.png`)}" alt="" decoding="async">
    </button>`;
  }).join('');
}

function chevronGlyph(direction: 'prev' | 'next') {
  const path = direction === 'prev' ? 'M19.2 7.4 11 16l8.2 8.6' : 'M12.8 7.4 21 16l-8.2 8.6';
  return `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="${path}" fill="none" stroke="currentColor" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement.id : '';
  const currentIndex = CAT_IDS.indexOf(selectedCat);
  selectedCat = CAT_IDS[(currentIndex + direction + CAT_IDS.length) % CAT_IDS.length];
  localStorage.setItem(SELECTED_CAT_KEY, selectedCat);
  playCatSelectionCue(selectedCat);
  renderTitle();
  if (returnFocus === 'cat-prev' || returnFocus === 'cat-next') {
    el<HTMLButtonElement>(`#${returnFocus}`).focus();
  }
  setLive(`${CAT_PROFILES[selectedCat].name} selected.`);
}

function renderTitle() {
  titleAudio.stopMusic();
  controller?.destroy();
  controller = null;
  const cat = CAT_PROFILES[selectedCat];
  app.innerHTML = `<main class="start-shell">
    <div class="start-sky" aria-hidden="true"></div>
    <div class="start-moon" aria-hidden="true"></div>
    <header class="start-bar">
      ${titleHighScoreMarkup()}
      <button id="mute" class="start-mute" type="button" aria-label="${muted ? 'Unmute sound' : 'Mute sound'}" aria-pressed="${muted}">${muted ? 'Muted' : 'Sound'}</button>
    </header>
    <section class="start-stage" aria-labelledby="choose-title">
      <p class="start-kicker">Polah · House Pinball</p>
      <div class="title-card">
        <h1 id="choose-title">CAT BALLS.</h1>
        <p>Paws of Chaos</p>
      </div>
      <p class="start-lede">Midnight house-cat pinball. Pick a cat, smash the bumpers, chase chaos — Polah doodle, not a day-hill clone.</p>
      <div class="ball-row" role="group" aria-label="Choose your cat">
        <button id="cat-prev" class="ball-chevron" type="button" aria-label="Previous cat">${chevronGlyph('prev')}</button>
        ${ballPickers()}
        <button id="cat-next" class="ball-chevron" type="button" aria-label="Next cat">${chevronGlyph('next')}</button>
      </div>
      <button id="play" class="start-play" type="button">Play</button>
      <article class="hero-panel">
        <div class="hero-tools">
          <p class="hero-pill">${cat.name} · ${cat.title}</p>
          <p class="chaos-pill"><span aria-hidden="true">•</span> Chaos mode</p>
        </div>
        <img class="hero-sit" src="${asset(`/assets/cats/${selectedCat}/portrait-v1.png`)}" alt="" decoding="async">
      </article>
    </section>
    <div class="start-table" aria-hidden="true">
      <span class="table-rail table-rail-left"></span>
      <span class="table-rail table-rail-right"></span>
      <span class="table-bumper table-bumper-gold"></span>
      <span class="table-bumper table-bumper-pink"></span>
      <span class="table-flipper table-flipper-left"></span>
      <span class="table-flipper table-flipper-right"></span>
    </div>
  </main><div id="live-status" class="sr-only" aria-live="polite"></div>`;
  document.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((button) => button.addEventListener('click', () => {
    selectCat(button.dataset.cat as CatId);
  }));
  el<HTMLButtonElement>('#cat-prev').addEventListener('click', () => shiftSelectedCat(-1));
  el<HTMLButtonElement>('#cat-next').addEventListener('click', () => shiftSelectedCat(1));
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
  void titleAudio.unlock().then(() => titleAudio.startMusic(true));
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
  runStartingHighScore = highScore;
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
    <section class="control-row" aria-label="Touch controls"><div class="touch-controls"><button class="touch-button flipper" data-control="left" type="button" aria-label="Left flipper"><span class="controller-symbol" aria-hidden="true">L</span><span class="control-label">Left</span></button><button class="touch-button launch" data-control="launch" type="button" aria-label="Hold and release to launch ball"><span class="controller-symbol" aria-hidden="true">A</span><span class="control-label">Launch</span></button><button class="touch-button flipper" data-control="right" type="button" aria-label="Right flipper"><span class="control-label">Right</span><span class="controller-symbol" aria-hidden="true">R</span></button></div></section>
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
  titleAudio.pauseMusic();
  app.insertAdjacentHTML('beforeend', `<section class="overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="overlay-card"><p class="eyebrow">Paws for a moment</p><h2 id="pause-title">Game paused</h2><p>The house will wait for you.</p><button id="resume" class="play-button" type="button">Resume game</button><button id="restart-from-pause" class="secondary-button" type="button">Restart run</button></div></section>`);
  el('#resume').focus();
  el('#resume').addEventListener('click', () => { document.querySelector('.overlay')?.remove(); controller?.resume(); titleAudio.resumeMusic(); });
  el('#restart-from-pause').addEventListener('click', restartGame);
}

function restartGame() {
  document.querySelector('.overlay')?.remove();
  launchGuideDismissed = false;
  runStartingHighScore = highScore;
  controller?.restart();
  controller?.resume();
  titleAudio.startMusic(true);
  setLive('New game started.');
}

function showGameOver(score: number) {
  titleAudio.stopMusic();
  const isNewPersonalBest = score > runStartingHighScore;
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
  const resultNote = isNewPersonalBest
    ? 'New personal best'
    : score === runStartingHighScore && score > 0
      ? 'Matched personal best'
      : `Personal best ${money(highScore)}`;
  app.insertAdjacentHTML('beforeend', `<section class="overlay" role="dialog" aria-modal="true" aria-labelledby="game-over-title"><div class="overlay-card game-over" style="--cat-primary:${uiAccent(cat)}"><p class="eyebrow">The sun is coming up</p><h2 id="game-over-title">Nine lives spent</h2><div class="final-score"><span>Final score</span><strong>${money(score)}</strong><small class="result-note${isNewPersonalBest ? ' is-best' : ''}">${resultNote}</small></div><button id="retry" class="play-button" type="button">Zoom again as ${cat.name}</button><button id="choose-again" class="text-button" type="button">Choose another cat</button></div></section>`);
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
    const inGame = Boolean(document.querySelector('.game-shell'));
    button.textContent = inGame ? (muted ? '♩' : '♫') : (muted ? 'Muted' : 'Sound');
    setLive(muted ? 'Sound muted.' : 'Sound on.');
  });
}

window.addEventListener('keydown', (event) => {
  if (!controller && document.querySelector('.start-shell') && !document.querySelector('.overlay')) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      shiftSelectedCat(event.key === 'ArrowLeft' ? -1 : 1);
    }
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
  renderTitle();
}

void startApp();
