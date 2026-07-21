import { CAT_IDS, CAT_PROFILES } from './game/cats';
import { createGame } from './game/createGame';
import { GameAudio } from './game/audio';
import type { CatId, GameController, GameSnapshot } from './game/contracts';
import './styles.css';

const HIGH_SCORE_KEY = 'nine-lives-high-score';
const SELECTED_CAT_KEY = 'nine-lives-selected-cat';
const MUTED_KEY = 'nine-lives-muted';
const app = document.querySelector<HTMLElement>('#app') as HTMLElement;

if (!app) throw new Error('The app mount is missing.');

const storedCat = localStorage.getItem(SELECTED_CAT_KEY) as CatId | null;
let selectedCat: CatId = storedCat && CAT_IDS.includes(storedCat) ? storedCat : 'calico';
let highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
let muted = localStorage.getItem(MUTED_KEY) === 'true';
let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let controller: GameController | null = null;
let carouselDirection: -1 | 0 | 1 = 0;
const titleAudio = new GameAudio();
titleAudio.setMuted(muted);

const money = (value: number) => value.toLocaleString('en-US');
const uiAccent = (cat: (typeof CAT_PROFILES)[CatId]) => cat.id === 'tuxedo' || cat.id === 'white' ? cat.cssAccent : cat.cssPrimary;
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

function catCardPortrait(id: CatId) {
  return `<span class="cat-portrait-stack" aria-hidden="true"><img class="cat-portrait-layer cat-portrait-base" src="/assets/cats/${id}/portrait-v1.png" alt="" decoding="async"><img class="cat-portrait-layer cat-portrait-blink" src="/assets/cats/${id}/portrait-blink-v1.png" alt="" decoding="async"></span>`;
}

function transformationCatArt(id: CatId) {
  return `<img class="comet-cat-art" src="/assets/cats/${id}/ball-v1.png" alt="" aria-hidden="true">`;
}

function catCards() {
  const selectedIndex = CAT_IDS.indexOf(selectedCat);
  return [-2, -1, 0, 1, 2].map((offset) => {
    const id = CAT_IDS[(selectedIndex + offset + CAT_IDS.length) % CAT_IDS.length];
    const cat = CAT_PROFILES[id];
    const selected = id === selectedCat;
    const position = selected ? 'active' : offset === -2 ? 'far-left' : offset === -1 ? 'previous' : offset === 1 ? 'next' : 'far-right';
    const catalogueNumber = String(CAT_IDS.indexOf(id) + 1).padStart(2, '0');
    return `<div class="cat-slot cat-slot-${position} ${selected ? 'is-active' : ''}">
      <button class="cat-card cat-card-${position} ${selected ? 'is-selected' : ''}" type="button" data-cat="${id}" aria-pressed="${selected}" aria-label="Select ${cat.name}, ${cat.title}">
        <span class="cat-card-number" aria-hidden="true">${catalogueNumber}</span>
        <span class="cat-card-art">${catCardPortrait(id)}</span>
        <span class="cat-card-name"><strong>${cat.name}</strong><small>${cat.title}</small></span>
      </button>
      ${selected ? `<div class="active-cat-actions"><button id="play" class="play-button" type="button">Play as ${cat.name} <span aria-hidden="true">↗</span></button></div>` : ''}
    </div>`;
  }).join('');
}

function selectCat(id: CatId) {
  if (id === selectedCat) return;
  const currentIndex = CAT_IDS.indexOf(selectedCat);
  const targetIndex = CAT_IDS.indexOf(id);
  const forwardDistance = (targetIndex - currentIndex + CAT_IDS.length) % CAT_IDS.length;
  const backwardDistance = (currentIndex - targetIndex + CAT_IDS.length) % CAT_IDS.length;
  carouselDirection = forwardDistance <= backwardDistance ? 1 : -1;
  selectedCat = id;
  localStorage.setItem(SELECTED_CAT_KEY, selectedCat);
  playCatSelectionCue(selectedCat);
  renderTitle();
  setLive(`${CAT_PROFILES[selectedCat].name} selected.`);
}

function shiftSelectedCat(direction: -1 | 1) {
  const currentIndex = CAT_IDS.indexOf(selectedCat);
  carouselDirection = direction;
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
  const transitionClass = carouselDirection === 1 ? 'carousel-shift-next' : carouselDirection === -1 ? 'carousel-shift-previous' : '';
  app.innerHTML = `<main class="shell title-shell ${transitionClass}" style="--cat-primary:${uiAccent(cat)};--cat-secondary:${cat.cssSecondary};--cat-accent:${cat.cssAccent}">
    <header class="title-nav">
      <div class="title-wordmark"><span aria-hidden="true">✦</span><strong>Midnight Pinball</strong></div>
      <div class="title-nav-actions"><button id="how-to-play" class="title-nav-button" type="button">How to play</button><span class="title-best">Best <b>${money(highScore)}</b></span><button id="mute" class="icon-button" type="button" aria-label="${muted ? 'Unmute sound' : 'Mute sound'}" aria-pressed="${muted}">${muted ? '♩' : '♫'}</button></div>
    </header>
    <section class="title-stage" aria-labelledby="choose-title">
      <div class="title-intro"><p class="eyebrow">The house is asleep. The cats are not.</p><h1 id="choose-title"><span>Nine Lives</span> Midnight Zoomies</h1><p>Pick your midnight troublemaker and turn the whole house into a pinball table.</p></div>
      <div class="cat-showcase">
        <div class="carousel-frame">
          <button id="previous-cat" class="carousel-arrow previous" type="button" aria-label="Previous cat">←</button>
          <div class="cat-carousel">${catCards()}</div>
          <button id="next-cat" class="carousel-arrow next" type="button" aria-label="Next cat">→</button>
        </div>
        <p class="cosmetic-choice-note"><b>${CAT_IDS.indexOf(selectedCat) + 1} / ${CAT_IDS.length}</b><span>Same table, same physics. Pick the cat you love.</span></p>
      </div>
    </section>
    <footer class="title-footer"><span>Use <b>←</b> <b>→</b> to choose</span><span>Keyboard and touch friendly</span><span>${CAT_IDS.length} cats. One very awake house.</span></footer>
  </main><div id="live-status" class="sr-only" aria-live="polite"></div>`;
  carouselDirection = 0;
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
  app.insertAdjacentHTML('beforeend', `<section class="overlay" role="dialog" aria-modal="true" aria-labelledby="how-to-title"><div class="overlay-card how-to-card"><p class="eyebrow">House rules</p><h2 id="how-to-title">Make some mischief</h2><div class="how-to-steps"><p><b>1</b><span><strong>Wind and launch</strong>Hold Space or Launch, then release.</span></p><p><b>2</b><span><strong>Bat the ball</strong>Use A and D, or the arrow keys.</span></p><p><b>3</b><span><strong>Chase the laser</strong>Follow the moving red beam and hit its active target.</span></p></div><button id="close-how-to" class="play-button" type="button">Got it</button></div></section>`);
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
  app.innerHTML = `<main class="shell game-shell" style="--cat-primary:${uiAccent(cat)};--cat-secondary:${cat.cssSecondary};--cat-accent:${cat.cssAccent}">
    <header class="game-header"><button id="home" class="word-button" type="button">← Cats</button><div class="game-title"><span>Nine Lives</span><b>Midnight Zoomies</b></div><div class="header-actions"><button id="mute" class="icon-button" type="button" aria-label="${muted ? 'Unmute sound' : 'Mute sound'}" aria-pressed="${muted}">${muted ? '♩' : '♫'}</button><button id="pause" class="icon-button" type="button" aria-label="Pause game">Ⅱ</button></div></header>
    <section class="hud" aria-label="Game status"><div><span>Score</span><strong id="score">0</strong></div><div><span>High score</span><strong id="high-score">${money(highScore)}</strong></div><div><span>Lives</span><strong id="lives" aria-label="3 lives">● ● ●</strong></div><div class="hunt"><span>Hunt Meter <b id="hunt-text">0 / 3</b></span><i><b id="hunt-fill"></b></i></div></section>
    <section class="play-area"><aside class="mode-card"><p id="mode-label">Tonight's hunt</p><strong id="objective">Light the windows</strong><span id="mode-timer">Ready when you are</span></aside><div class="table-column"><div class="table-wrap"><div id="game-mount" tabindex="0" aria-label="Pinball table"></div><div id="save-status" class="save-status">Ball save ready</div></div><div class="key-help" aria-label="Keyboard controls"><span><kbd>A</kbd><kbd>←</kbd> left</span><span><kbd>D</kbd><kbd>→</kbd> right</span><span><kbd>Space</kbd> hold/release</span><span><kbd>P</kbd> pause</span><span><kbd>R</kbd> restart</span></div></div><aside class="combo-card"><p>Combo</p><strong id="combo">×0</strong><span id="objective-status">Ready to launch</span><span id="balls-in-play">0 balls in play</span></aside></section>
    <section class="control-row" aria-label="Touch controls"><div class="touch-controls"><button class="touch-button" data-control="left" type="button" aria-label="Left flipper">Left</button><button class="touch-button launch" data-control="launch" type="button" aria-label="Hold and release to launch ball">Launch</button><button class="touch-button" data-control="right" type="button" aria-label="Right flipper">Right</button></div></section>
    <div id="live-status" class="sr-only" aria-live="polite"></div>
  </main>`;
  el('#home').addEventListener('click', renderTitle);
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
  el('#lives').textContent = Array.from({ length: Math.max(next.lives, 0) }, () => '●').join(' ') || '0';
  el('#lives').setAttribute('aria-label', `${next.lives} lives`);
  el('#combo').textContent = `×${next.combo}`;
  el('#hunt-text').textContent = `${next.hunt} / ${next.huntGoal}`;
  el<HTMLElement>('#hunt-fill').style.width = `${Math.min(100, (next.hunt / Math.max(1, next.huntGoal)) * 100)}%`;
  el('#objective').textContent = next.objective;
  el('#objective-status').textContent = next.combo > 0 ? `Combo ×${next.combo}` : next.phase === 'ready' ? 'Ready to launch' : next.mode === 'normal' ? 'On the hunt' : next.mode.replace('-', ' ');
  el('#mode-label').textContent = next.mode === 'normal' ? "Tonight's hunt" : next.mode.replace('-', ' ');
  el('#mode-timer').textContent = next.modeSeconds ? `${next.modeSeconds}s remaining` : next.message || 'Ready when you are';
  el('#save-status').classList.toggle('active', next.ballSaveActive);
  el('#save-status').textContent = next.phase === 'ready' ? 'Ball save starts on launch' : next.ballSaveActive ? 'Ball save active' : 'Ball save used';
  el('#balls-in-play').textContent = `${next.ballsInPlay} ball${next.ballsInPlay === 1 ? '' : 's'} in play`;
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
  controller?.restart();
  controller?.resume();
  setLive('New game started.');
}

function showGameOver(score: number) {
  highScore = Math.max(highScore, score);
  localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
  const cat = CAT_PROFILES[selectedCat];
  app.insertAdjacentHTML('beforeend', `<section class="overlay" role="dialog" aria-modal="true" aria-labelledby="game-over-title"><div class="overlay-card game-over"><p class="eyebrow">The sun is coming up</p><h2 id="game-over-title">Nine lives spent</h2><div class="final-score"><span>Final score</span><strong>${money(score)}</strong><span>High score: ${money(highScore)}</span></div><button id="retry" class="play-button" type="button">Zoom again as ${cat.name}</button><button id="choose-again" class="text-button" type="button">Choose another cat</button></div></section>`);
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
renderTitle();
