// ══════════════════════════════════════════════
// GAME STATE
// ══════════════════════════════════════════════
const SUITS  = ['♠','♥','♦','♣'];
const VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = new Set(['♥','♦']);

// Configuration: whether dealer hits on soft 17 (Ace + 6)
const DEALER_HITS_SOFT_17 = false; // S17 by default

const MONSTERS = [
  { name: 'BELLAGIO VAULT',     sprite: '🎲', hp: 90,  difficulty: 1 },
  { name: 'MGM GRANDHOUSE',     sprite: '🎰', hp: 100, difficulty: 1.1 },
  { name: 'CAESARS KEEP',       sprite: '🏛️', hp: 110, difficulty: 1.2 },
  { name: 'THE VENETIAN VAULT', sprite: '🛶', hp: 95,  difficulty: 1.05 },
  { name: 'WYNN RESORT',        sprite: '🌟', hp: 105, difficulty: 1.15 },
];
const ENEMIES_PER_FLOOR = 3;
const FLOOR_BOSS_INDEX = ENEMIES_PER_FLOOR - 1;
const BASE_ENEMY = { name: 'HOUSE ENFORCER', sprite: '🂠', difficulty: 1 };

const ABILITY_COSTS = { special: 8, jokers: { 1: 6, 2: 8, 3: 10, 4: 8, 5: 9, 6: 9 } };
const ABILITY_LABELS = {
  special: 'Special Attack',
  1: "Fool's Luck",
  2: 'Death Draw',
  3: 'Lightning',
  4: 'Iron Skin',
  5: 'Peek',
  6: 'Force Draw',
};
const RUN_SAVE_KEY = 'blackjack_brawl_run_v1';
const SOUND_PREF_KEY = 'blackjack_brawl_sound_muted_v1';

let state = {};
let saveTimer = null;

const audio = {
  ctx: null,
  master: null,
  muted: readSoundMutedPref(),
};

function readSoundMutedPref() {
  try {
    return localStorage.getItem(SOUND_PREF_KEY) === '1';
  } catch (_) {
    return false;
  }
}

function writeSoundMutedPref() {
  try {
    localStorage.setItem(SOUND_PREF_KEY, audio.muted ? '1' : '0');
  } catch (_) {}
}

function initAudio() {
  if (audio.ctx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audio.ctx = new Ctx();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.3;
  audio.master.connect(audio.ctx.destination);
}

function installAudioUnlock() {
  const unlock = () => {
    initAudio();
    if (audio.ctx && audio.ctx.state === 'suspended') {
      audio.ctx.resume().catch(() => {});
    }
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('mousedown', unlock);
}

function playTone(freq, duration = 0.09, type = 'sine', volume = 14.5, sweepTo = null) {
  if (audio.muted) return;
  initAudio();
  if (!audio.ctx || !audio.master) return;
  if (audio.ctx.state === 'suspended') {
    audio.ctx.resume().catch(() => {});
  }

  const now = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (typeof sweepTo === 'number') {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), now + duration);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playSfx(name) {
  switch (name) {
    case 'card':
      playTone(320, 0.05, 'triangle', 0.04, 260);
      break;
    case 'hit':
      playTone(510, 0.06, 'square', 0.06, 420);
      break;
    case 'stand':
      playTone(260, 0.07, 'triangle', 0.05, 220);
      break;
    case 'special':
      playTone(700, 0.08, 'sawtooth', 0.07, 980);
      setTimeout(() => playTone(980, 0.09, 'triangle', 0.06, 680), 55);
      break;
    case 'damage':
      playTone(180, 0.1, 'square', 0.08, 110);
      break;
    case 'block':
      playTone(240, 0.06, 'triangle', 0.06, 330);
      break;
    case 'bust':
      playTone(180, 0.12, 'sawtooth', 0.08, 90);
      break;
    case 'win':
      playTone(520, 0.08, 'triangle', 0.07, 760);
      setTimeout(() => playTone(760, 0.08, 'triangle', 0.06, 980), 80);
      break;
    case 'lose':
      playTone(240, 0.1, 'sawtooth', 0.07, 130);
      break;
    case 'shop':
      playTone(460, 0.06, 'triangle', 0.05, 560);
      break;
  }
}

function updateSoundButton() {
  const label = audio.muted ? 'SOUND OFF' : 'SOUND ON';
  ['btn-sound', 'btn-sound-title'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.textContent = label;
  });
}

function toggleSound() {
  audio.muted = !audio.muted;
  writeSoundMutedPref();
  updateSoundButton();
  if (!audio.muted) {
    initAudio();
    if (audio.ctx && audio.ctx.state === 'suspended') {
      audio.ctx.resume().catch(() => {});
    }
    playTone(520, 0.06, 'triangle', 0.05, 620);
  }
}

function createInitialState() {
  return {
    deck: freshDeck(),
    playerCards: [],
    monsterCards: [],
    playerHP: 100,
    monsterHP: 1,
    monsterMaxHP: 1,
    monster: null,
    phase: 'player', // 'player' | 'monster' | 'resolution'
    specialCharges: 0,
    doubleNext: false,
    blocking: false,
    jokerUsed: { 1:false, 2:false, 3:false, 4:false, 5:false, 6:false },
    unlocked: { special: false, jokers: { 1:false, 2:false, 3:false, 4:false, 5:false, 6:false } },
    peekPending: false,
    forcedMonsterDraws: 0,
    coins: 0,
    round: 1,
    roundsSurvived: 0,
    depth: 1,
    clearedEncounters: 0,
    enemiesDefeatedOnFloor: 0,
    remainingBosses: MONSTERS.map(m => ({ ...m })),
    floorBoss: null,
    defeatedBosses: {},
    defeatedBossCount: 0,
    endlessMode: false,
    shopPendingNextFloor: null,
    inShop: false,
    shopJokerPurchasesThisVisit: 0,
    shopOfferedJoker: null,
    busy: false,
    playerNatural: false,
    monsterNatural: false,
  };
}

function clearSavedRun() {
  try {
    localStorage.removeItem(RUN_SAVE_KEY);
  } catch (_) {}
}

function hasSavedRun() {
  try {
    return !!localStorage.getItem(RUN_SAVE_KEY);
  } catch (_) {
    return false;
  }
}

function saveProgress() {
  if (!state || !state.monster) return;
  const snapshot = {
    playerHP: state.playerHP,
    specialCharges: state.specialCharges,
    unlocked: state.unlocked,
    coins: state.coins,
    roundsSurvived: state.roundsSurvived,
    depth: state.depth,
    clearedEncounters: state.clearedEncounters,
    enemiesDefeatedOnFloor: state.enemiesDefeatedOnFloor,
    remainingBosses: state.remainingBosses,
    floorBoss: state.floorBoss,
    defeatedBosses: state.defeatedBosses,
    defeatedBossCount: state.defeatedBossCount,
    endlessMode: !!state.endlessMode,
    shopPendingNextFloor: state.shopPendingNextFloor,
    inShop: state.inShop,
    shopJokerPurchasesThisVisit: Math.max(0, Number(state.shopJokerPurchasesThisVisit) || 0),
    shopOfferedJoker: state.shopOfferedJoker ?? null,
    peekPending: !!state.peekPending,
    forcedMonsterDraws: Math.max(0, Number(state.forcedMonsterDraws) || 0),
    passives: state.passiveBoosts || [],
  };
  try {
    localStorage.setItem(RUN_SAVE_KEY, JSON.stringify(snapshot));
  } catch (_) {}
}

function scheduleSave(delay = 150) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProgress, delay);
}

function sanitizeUnlocked(unlocked) {
  return {
    special: !!unlocked?.special,
    jokers: {
      1: !!unlocked?.jokers?.[1],
      2: !!unlocked?.jokers?.[2],
      3: !!unlocked?.jokers?.[3],
      4: !!unlocked?.jokers?.[4],
      5: !!unlocked?.jokers?.[5],
      6: !!unlocked?.jokers?.[6],
    },
  };
}

function tryResumeSavedRun() {
  let raw = null;
  try {
    raw = localStorage.getItem(RUN_SAVE_KEY);
  } catch (_) {
    return false;
  }
  if (!raw) return false;

  let saved = null;
  try {
    saved = JSON.parse(raw);
  } catch (_) {
    clearSavedRun();
    return false;
  }
  if (!saved || typeof saved !== 'object') return false;

  state = createInitialState();
  state.playerHP = Math.max(1, Math.min(100, Number(saved.playerHP) || 100));
  state.specialCharges = Math.max(0, Number(saved.specialCharges) || 0);
  state.unlocked = sanitizeUnlocked(saved.unlocked);
  state.coins = Math.max(0, Number(saved.coins) || 0);
  state.roundsSurvived = Math.max(0, Number(saved.roundsSurvived) || 0);
  state.depth = Math.max(1, Number(saved.depth) || 1);
  state.clearedEncounters = Math.max(0, Number(saved.clearedEncounters) || 0);
  state.enemiesDefeatedOnFloor = Math.max(0, Math.min(ENEMIES_PER_FLOOR - 1, Number(saved.enemiesDefeatedOnFloor) || 0));
  state.remainingBosses = Array.isArray(saved.remainingBosses)
    ? saved.remainingBosses
    : MONSTERS.map(m => ({ ...m }));
  state.floorBoss = saved.floorBoss || null;
  state.defeatedBosses = saved.defeatedBosses || {};
  state.defeatedBossCount = Math.max(0, Number(saved.defeatedBossCount) || 0);
  state.endlessMode = !!saved.endlessMode;
  state.shopPendingNextFloor = saved.shopPendingNextFloor || null;
  state.inShop = !!saved.inShop;
  state.shopJokerPurchasesThisVisit = Math.max(0, Number(saved.shopJokerPurchasesThisVisit) || 0);
  state.shopOfferedJoker = saved.shopOfferedJoker ?? null;
  state.peekPending = !!saved.peekPending;
  state.forcedMonsterDraws = Math.max(0, Number(saved.forcedMonsterDraws) || 0);
  state.passiveBoosts = Array.isArray(saved.passives) ? saved.passives : [];

  setupEncounter(state.depth, state.enemiesDefeatedOnFloor);
  state.playerHP = Math.max(1, Math.min(100, Number(saved.playerHP) || state.playerHP));
  updateHP();
  updateAbilityUI();
  updateSpecialBtn();

  setLog(`Run resumed: Floor ${state.depth}, encounter ${state.enemiesDefeatedOnFloor + 1}.`);
  showTurnBanner('RUN RESUMED', '#2ecc71');

  if (state.inShop) {
    openShop(false);
  } else {
    setButtons(false);
    dealRound();
  }
  scheduleSave();
  return true;
}

function updateContinueButton() {
  const btn = document.getElementById('btn-continue-run');
  if (!btn) return;
  const canContinue = hasSavedRun();
  btn.style.display = canContinue ? 'inline-block' : 'none';
  btn.disabled = !canContinue;
  btn.textContent = 'CONTINUE RUN';
}

function showTitleScreen() {
  document.getElementById('title-screen').style.display = 'flex';
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('game-over-overlay').style.display = 'none';
  document.getElementById('shop-overlay').style.display = 'none';
  updateContinueButton();
}

function quitToTitle() {
  saveProgress();
  state.busy = true;
  state.phase = 'title';
  setButtons(false);
  window.location.href = 'index.html';
}

function returnToMainMenu() {
  clearSavedRun();
  window.location.href = 'index.html';
}

function startNewRun() {
  clearSavedRun();
  startGame(true);
}

function continueRun() {
  startGame(false);
}

function initTitleScreen() {
  updateSoundButton();
  showTitleScreen();
}

window.toggleSound = toggleSound;
window.startNewRun = startNewRun;
window.continueRun = continueRun;
window.quitToTitle = quitToTitle;
window.returnToMainMenu = returnToMainMenu;
window.initTitleScreen = initTitleScreen;
window.startEndlessMode = startEndlessMode;
window.finishRunNow = finishRunNow;
window.startEndlessFromGameOver = startEndlessFromGameOver;
installAudioUnlock();

function isSoft17(cards) {
  // soft 17: total 17 where an Ace counts as 11
  let total = 0, aces = 0;
  for (let c of cards) {
    if (c.value === 'A') { total += 11; aces++; }
    else if (['J','Q','K'].includes(c.value)) total += 10;
    else total += parseInt(c.value);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  if (total !== 17) return false;

  let baseline = 0;
  for (let c of cards) {
    if (c.value === 'A') baseline += 1;
    else if (['J','Q','K'].includes(c.value)) baseline += 10;
    else baseline += parseInt(c.value);
  }
  return total > baseline;
}

function freshDeck() {
  let d = [];
  for (let s of SUITS) for (let v of VALUES) d.push({ suit:s, value:v });
  for (let i = d.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardPoints(card) {
  if (['J','Q','K'].includes(card.value)) return 10;
  if (card.value === 'A') return 11;
  return parseInt(card.value);
}

function handScore(cards) {
  let score = 0, aces = 0;
  for (let c of cards) {
    score += cardPoints(c);
    if (c.value === 'A') aces++;
  }
  while (score > 21 && aces > 0) { score -= 10; aces--; }
  return score;
}

function applyPlayerDamageBoost(baseDamage) {
  const boost = typeof getTotalDamageBoost === 'function' ? getTotalDamageBoost() : 0;
  return Math.max(0, Math.round(baseDamage * (1 + boost)));
}

function floorEnemyHP(depth) {
  return Math.max(10, depth * 10);
}

function pickNextBoss() {
  if (!Array.isArray(state.remainingBosses) || state.remainingBosses.length === 0) return null;
  const idx = Math.floor(Math.random() * state.remainingBosses.length);
  const [boss] = state.remainingBosses.splice(idx, 1);
  return boss || null;
}

function buildEndlessBoss(depth) {
  const archetype = MONSTERS[(depth - 1) % MONSTERS.length] || BASE_ENEMY;
  return {
    name: `ENDLESS ${archetype.name} F${depth}`,
    bossName: archetype.name,
    sprite: archetype.sprite || BASE_ENEMY.sprite,
    difficulty: +(1.2 + depth * 0.08).toFixed(2),
    isEndless: true,
  };
}

function grantEnemyDefeatRewards() {
  const isBoss = !!state.monster?.isBoss;
  const coinsEarned = (isBoss ? 12 : 6) + Math.floor(state.depth / 2) + Math.floor(Math.random() * 4);
  const notes = [`+${coinsEarned} coins`];
  state.coins += coinsEarned;

  if (state.playerHP < 100 && Math.random() < (isBoss ? 0.65 : 0.25)) {
    const healAmt = isBoss ? 10 : 4;
    state.playerHP = Math.min(100, state.playerHP + healAmt);
    updateHP();
    notes.push(`+${healAmt} HP`);
  }

  if (state.unlocked?.special && Math.random() < (isBoss ? 0.45 : 0.2)) {
    state.specialCharges++;
    notes.push('+1 Special charge');
  }

  updateSpecialBtn();
  updateAbilityUI();
  scheduleSave();
  return `Defeat rewards: ${notes.join(' | ')}.`;
}

function buildEncounterMonster(depth, enemyIndex) {
  const floorHP = floorEnemyHP(depth);
  const diffScale = 0.85 + depth * 0.07;
  const isBossEncounter = enemyIndex === FLOOR_BOSS_INDEX;

  if (isBossEncounter) {
    if (!state.floorBoss) {
      state.floorBoss = pickNextBoss();
      if (!state.floorBoss && state.endlessMode) state.floorBoss = buildEndlessBoss(depth);
    }
    const boss = state.floorBoss;
    if (!boss) return null;
    return {
      name: `${boss.name} • BOSS`,
      sprite: boss.sprite,
      hp: floorHP * 2,
      difficulty: +(boss.difficulty * diffScale).toFixed(2),
      isBoss: true,
      isEndless: !!boss.isEndless,
      bossName: boss.bossName || boss.name,
    };
  }

  return {
    name: `${BASE_ENEMY.name} • F${depth}-${enemyIndex + 1}`,
    sprite: BASE_ENEMY.sprite,
    hp: floorHP,
    difficulty: +(BASE_ENEMY.difficulty * diffScale).toFixed(2),
    isBoss: false,
    isEndless: false,
    bossName: null,
  };
}

function setupEncounter(depth, enemyIndex) {
  const monster = buildEncounterMonster(depth, enemyIndex);
  if (!monster) {
    endGame(true);
    return;
  }
  state.monster = monster;
  state.monsterHP = monster.hp;
  state.monsterMaxHP = monster.hp;
  state.round = 1;
  state.doubleNext = false;
  state.blocking = false;
  state.jokerUsed = { 1:false, 2:false, 3:false, 4:false, 5:false, 6:false };
  state.peekPending = false;
  state.forcedMonsterDraws = 0;
  state.playerCards = [];
  state.monsterCards = [];
  state.playerNatural = false;
  state.monsterNatural = false;
  state.phase = 'player';
  state.busy = false;

  document.getElementById('monster-sprite').textContent = monster.sprite;
  document.getElementById('monster-name').textContent = monster.name;
  document.getElementById('player-cards').innerHTML = '';
  document.getElementById('monster-cards').innerHTML = '';
  document.getElementById('monster-score').textContent = '?';
  document.getElementById('player-score').textContent = '0';

  updateHP();
  updateAbilityUI();
  updateSpecialBtn();
}

async function handleMonsterDefeated() {
  state.busy = true;
  state.phase = 'resolution';
  setButtons(false);
  playSfx('win');
  state.clearedEncounters++;
  const rewardSummary = grantEnemyDefeatRewards();
  const defeatedBossName = state.monster && state.monster.isBoss && !state.monster.isEndless
    ? state.monster.bossName
    : null;
  if (defeatedBossName && !state.defeatedBosses[defeatedBossName]) {
    state.defeatedBosses[defeatedBossName] = true;
    state.defeatedBossCount++;
    if (state.defeatedBossCount >= MONSTERS.length && !state.endlessMode) {
      state.enemiesDefeatedOnFloor = ENEMIES_PER_FLOOR;
      setLog(`Final boss defeated. All ${MONSTERS.length} bosses are down. ${rewardSummary}`);
      await sleep(900);
      openEndlessChoice();
      return;
    }
  }
  state.enemiesDefeatedOnFloor++;

  if (state.enemiesDefeatedOnFloor < ENEMIES_PER_FLOOR) {
    const nextEncounterIndex = state.enemiesDefeatedOnFloor;
    const enemyNum = nextEncounterIndex + 1;
    const isBossNext = nextEncounterIndex === FLOOR_BOSS_INDEX;
    const nextLabel = isBossNext ? 'boss' : `enemy ${enemyNum}`;
    setLog(`Enemy defeated. Floor ${state.depth}: ${state.enemiesDefeatedOnFloor}/${ENEMIES_PER_FLOOR} down. ${rewardSummary} Next: ${nextLabel}.`);
    await sleep(900);
    setupEncounter(state.depth, nextEncounterIndex);
    scheduleSave();
    if (isBossNext && state.monster?.isBoss) {
      showTurnBanner(`BOSS: ${state.monster.bossName}`, '#e74c3c');
    } else {
      showTurnBanner(`ENEMY ${enemyNum}`, '#8b1a6b');
    }
    await sleep(400);
    dealRound();
    return;
  }

  state.floorBoss = null;
  state.shopPendingNextFloor = state.depth + 1;
  scheduleSave();
  setLog(`Floor ${state.depth} cleared. ${rewardSummary} Visit the shop before Floor ${state.depth + 1}.`);
  await sleep(900);
  openShop();
}

// ══════════════════════════════════════════════
// START / INIT
// ══════════════════════════════════════════════
function startGame(forceNew = false) {
  document.getElementById('title-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'flex';
  document.getElementById('game-over-overlay').style.display = 'none';
  document.getElementById('shop-overlay').style.display = 'none';
  closeEndlessChoice();
  updateSoundButton();
  if (!forceNew && tryResumeSavedRun()) return;

  state = createInitialState();

  setupEncounter(1, 0);
  setLog(`Run started. Floor 1 enemies have 10 HP. Bosses appear at the end of each floor with double HP.`);
  setButtons(false);
  scheduleSave();

  // Deal opening hands
  dealRound();
}

async function dealRound() {
  state.busy = true;
  setButtons(false);
  state.playerCards = [];
  state.monsterCards = [];
  state.playerNatural = false;
  state.monsterNatural = false;
  document.getElementById('player-cards').innerHTML = '';
  document.getElementById('monster-cards').innerHTML = '';
  document.getElementById('monster-score').textContent = '?';

  // Deal 2 cards each, alternating
  await drawCard('player', false, 200);
  await drawCard('monster', false, 400);
  await drawCard('player', false, 600);
  await drawCard('monster', true,  800);

  updateScores();
  state.playerNatural = handScore(state.playerCards) === 21 && state.playerCards.length === 2;
  state.monsterNatural = handScore(state.monsterCards) === 21 && state.monsterCards.length === 2;
  if (state.playerNatural || state.monsterNatural) {
    state.phase = 'resolution';
    setButtons(false);
    setLog("Checking for blackjacks...");
    flipMonsterCards();
    await sleep(800);
    const pScore = handScore(state.playerCards);
    const mScore = handScore(state.monsterCards);
    document.getElementById('monster-score').textContent = mScore > 21 ? `${mScore}💀` : mScore;
    await resolveRound(pScore, mScore);
    return;
  }
  setLog(`Round ${state.round} — Your move! Hit for another card, or Stand to attack.`);
  state.phase = 'player';
  state.busy = false;
  setButtons(true);
  showTurnBanner("YOUR TURN", "#3498db");
  scheduleSave();
}

// ══════════════════════════════════════════════
// CARD DRAW
// ══════════════════════════════════════════════
function drawCard(target, faceDown, delay=0) {
  return new Promise(resolve => {
    setTimeout(() => {
      if (state.deck.length === 0) state.deck = freshDeck();
      const card = state.deck.pop();
      if (target === 'player') state.playerCards.push(card);
      else                     state.monsterCards.push(card);
      renderCard(card, target, faceDown);
      playSfx('card');
      resolve();
    }, delay);
  });
}

function renderCard(card, target, faceDown) {
  const container = document.getElementById(target === 'player' ? 'player-cards' : 'monster-cards');
  const isRed = RED_SUITS.has(card.suit);
  const div = document.createElement('div');
  div.className = `card deal-in${isRed?' red-card':' black-card'}`;

  if (faceDown) {
    div.innerHTML = `<div class="card-inner"><div class="card-back"></div></div>`;
  } else {
    div.innerHTML = `
      <div class="card-inner">
        <div class="card-front">
          <div class="card-corner tl">${card.value}<br>${card.suit}</div>
          <div class="card-center">${card.suit}</div>
          <div class="card-corner br">${card.value}<br>${card.suit}</div>
        </div>
      </div>`;
  }
  container.appendChild(div);
  updateScores();
  return div;
}

function flipMonsterCards() {
  const container = document.getElementById('monster-cards');
  const cards = container.querySelectorAll('.card');
  cards.forEach((div, i) => {
    const card = state.monsterCards[i];
    const isRed = RED_SUITS.has(card.suit);
    setTimeout(() => {
      div.classList.remove('red-card','black-card');
      div.classList.add(isRed ? 'red-card' : 'black-card', 'flipping');
      setTimeout(() => {
        div.innerHTML = `
          <div class="card-inner">
            <div class="card-front">
              <div class="card-corner tl">${card.value}<br>${card.suit}</div>
              <div class="card-center">${card.suit}</div>
              <div class="card-corner br">${card.value}<br>${card.suit}</div>
            </div>
          </div>`;
      }, 250);
    }, i * 200);
  });
}

function peekUpcomingCards(count = 2) {
  const upcoming = [];
  for (let i = 1; i <= count; i++) {
    const card = state.deck[state.deck.length - i];
    if (!card) break;
    upcoming.push(card);
  }
  return upcoming;
}

function formatCard(card) {
  return `${card.value}${card.suit}`;
}

// ══════════════════════════════════════════════
// PLAYER ACTIONS
// ══════════════════════════════════════════════
async function playerHit() {
  if (state.busy || state.phase !== 'player') return;

  if (state.peekPending) {
    const upcoming = peekUpcomingCards(2);
    const preview = upcoming.length > 0
      ? upcoming.map(formatCard).join(', ')
      : 'unknown (deck will reshuffle)';
    const shouldDraw = window.confirm(`Peek: next cards are ${preview}. Draw now?`);
    state.peekPending = false;
    if (!shouldDraw) {
      setLog('Peek used: you skipped drawing. Choose another action.');
      scheduleSave();
      return;
    }
  }

  state.busy = true;
  setButtons(false);
  playSfx('hit');

  await drawCard('player', false, 0);
  updateScores();
  scheduleSave();

  const score = handScore(state.playerCards);
  if (score > 21) {
    setLog(`💥 BUST! Your score of ${score} exceeds 21! Monster strikes!`);
    playSfx('bust');
    await sleep(800);
    await monsterAttack(true); // bust penalty
    return;
  }

  if (score === 21) {
    setLog(`✨ BLACKJACK! Score 21 — automatically standing!`);
    await sleep(600);
    await playerStand(true);
    return;
  }

  setLog(`You drew! Score: ${score}. Hit again or Stand?`);
  state.busy = false;
  setButtons(true);
}

async function playerStand(force = false) {
  if ((!force && state.busy) || state.phase !== 'player') return;
  state.busy = true;
  setButtons(false);
  state.phase = 'resolution';
  playSfx('stand');

  // Flip monster cards
  setLog("You stand! Revealing the monster's hand...");
  flipMonsterCards();
  await sleep(1000);

  // Dealer rule: hit until 17, with configurable soft-17 behavior.
  const targetScore = 17;
  setLog(`${state.monster.name} draws cards...`);

  while (state.monsterCards.length < 7) {
    const mScoreNow = handScore(state.monsterCards);
    if (mScoreNow < targetScore) {
      await drawCard('monster', false, 0);
      await sleep(700);
      continue;
    }
    if (mScoreNow > targetScore) break;
    if (DEALER_HITS_SOFT_17 && isSoft17(state.monsterCards)) {
      await drawCard('monster', false, 0);
      await sleep(700);
      continue;
    }
    break;
  }

  if (state.forcedMonsterDraws > 0) {
    const forcedDraws = state.forcedMonsterDraws;
    state.forcedMonsterDraws = 0;
    setLog(`${ABILITY_LABELS[6]} triggers: monster is forced to draw ${forcedDraws} extra cards.`);
    for (let i = 0; i < forcedDraws; i++) {
      await drawCard('monster', false, 0);
      await sleep(350);
    }
  }

  const pScore = handScore(state.playerCards);
  const mScore = handScore(state.monsterCards);
  document.getElementById('monster-score').textContent = mScore > 21 ? `${mScore}💀` : mScore;

  await sleep(500);
  await resolveRound(pScore, mScore);
}

function renderFlippedMonsterCard() {
  // The last card added to monster hand — render it face up
  const container = document.getElementById('monster-cards');
  const card = state.monsterCards[state.monsterCards.length - 1];
  const isRed = RED_SUITS.has(card.suit);
  const div = document.createElement('div');
  div.className = `card deal-in ${isRed ? 'red-card' : 'black-card'}`;
  div.innerHTML = `
    <div class="card-inner">
      <div class="card-front">
        <div class="card-corner tl">${card.value}<br>${card.suit}</div>
        <div class="card-center">${card.suit}</div>
        <div class="card-corner br">${card.value}<br>${card.suit}</div>
      </div>
    </div>`;
  container.appendChild(div);
}

async function playerSpecial() {
  if (state.busy || state.phase !== 'player') return;
  if (!state.unlocked.special) {
    setLog(`Special Attack is locked. Earn coins in battle to unlock it (${ABILITY_COSTS.special} coins).`);
    return;
  }
  if (state.specialCharges <= 0) {
    setLog("No Special Attack charges left.");
    return;
  }
  state.specialCharges--;
  updateSpecialBtn();
  state.busy = true;
  setButtons(false);
  playSfx('special');

  const baseDmg = Math.floor(Math.random() * 15) + 10;
  const dmg = applyPlayerDamageBoost(baseDmg);
  showDamageNumber(dmg, '#c0392b', 'monster');
  flashScreen('#c0392b');
  dealDamage('monster', dmg);
  setLog(`💥 SPECIAL ATTACK! You unleash arcane energy for ${dmg} damage!`);
  await sleep(1000);

  if (state.monsterHP <= 0) { await handleMonsterDefeated(); return; }

  state.busy = false;
  setButtons(true);
  scheduleSave();
}

// ══════════════════════════════════════════════
// RESOLUTION
// ══════════════════════════════════════════════
async function resolveRound(pScore, mScore) {
  const mBust  = mScore > 21;
  const pBust  = pScore > 21;
  const pNatural = !!state.playerNatural;
  let msg = '';
  let playerDmg = 0, monsterDmg = 0;
  let outcome = 'draw';
  let useFlatTieDamage = false;

  if (mBust && !pBust) {
    monsterDmg = 20 + pScore;
    msg = `Monster BUSTS at ${mScore}! You deal ${monsterDmg} damage!`;
    outcome = 'win';
  } else if (pBust && !mBust) {
    playerDmg = 15;
    msg = `You busted! Monster deals ${playerDmg} damage as punishment.`;
    outcome = 'loss';
  } else if (pBust && mBust) {
    msg = "Both busted! A chaotic draw — no damage!";
  } else if (pScore > mScore) {
    monsterDmg = pScore - mScore + 10;
    msg = `Victory! ${pScore} vs ${mScore} — Monster takes ${monsterDmg} damage!`;
    outcome = 'win';
  } else if (mScore > pScore) {
    playerDmg = mScore - pScore + 5;
    msg = `Defeat! ${mScore} vs ${pScore} — You take ${playerDmg} damage!`;
    outcome = 'loss';
  } else {
    msg = `TIE! Both at ${pScore}. No damage — but the monster plots...`;
  }

  if (!mBust && !pBust && pScore === mScore) {
    const tieScore = pScore;
    const goDouble = window.confirm(`Push at ${tieScore}. OK = DOUBLE, Cancel = NOTHING.`);
    if (goDouble) {
      setLog(`PUSH: Double or Nothing! Both sides draw 1 card...`);
      await sleep(350);
      await drawCard('player', false, 0);
      await drawCard('monster', false, 0);
      await sleep(300);

      const newP = handScore(state.playerCards);
      const newM = handScore(state.monsterCards);
      document.getElementById('monster-score').textContent = newM > 21 ? `${newM}💀` : newM;

      const pDist = Math.abs(21 - newP);
      const mDist = Math.abs(21 - newM);
      const doubled = tieScore * 2;
      useFlatTieDamage = true;

      if (pDist < mDist) {
        monsterDmg = doubled;
        outcome = 'win';
        msg = `Double wins! You: ${newP}, Monster: ${newM}. Monster takes ${doubled} damage.`;
      } else if (mDist < pDist) {
        playerDmg = doubled;
        outcome = 'loss';
        msg = `Double lost! You: ${newP}, Monster: ${newM}. You take ${doubled} damage.`;
      } else {
        playerDmg = tieScore;
        monsterDmg = tieScore;
        msg = `Double re-tied (${newP} vs ${newM}). Both take ${tieScore} damage.`;
      }
    } else {
      playerDmg = tieScore;
      monsterDmg = tieScore;
      useFlatTieDamage = true;
      msg = `Nothing chosen: both tied at ${tieScore}, so both take ${tieScore} damage.`;
    }
  }

  setLog(msg);
  await sleep(600);

  if (monsterDmg > 0) {
    if (!useFlatTieDamage && pNatural) {
      monsterDmg = monsterDmg * 2;
      msg += " (Natural blackjack! Damage doubled.)";
    }
    let finalDmg = monsterDmg;
    if (!useFlatTieDamage) {
      finalDmg = state.doubleNext ? monsterDmg * 2 : monsterDmg;
      state.doubleNext = false;
      finalDmg = applyPlayerDamageBoost(finalDmg);
    }
    showDamageNumber(finalDmg, '#d4a017', 'monster');
    flashScreen('#d4a017');
    dealDamage('monster', finalDmg);
    playSfx('damage');
    document.getElementById('monster-zone').classList.add('shake');
    setTimeout(() => document.getElementById('monster-zone').classList.remove('shake'), 400);
    await sleep(600);
    if (state.monsterHP <= 0) { await handleMonsterDefeated(); return; }
  }

  if (playerDmg > 0) {
    if (!useFlatTieDamage && state.blocking) {
      setLog("🛡 Iron Skin absorbed the blow!");
      playSfx('block');
      state.blocking = false;
    } else {
      showDamageNumber(playerDmg, '#e74c3c', 'player');
      flashScreen('#c0392b');
      dealDamage('player', playerDmg);
      playSfx('damage');
      document.getElementById('player-zone').classList.add('shake');
      setTimeout(() => document.getElementById('player-zone').classList.remove('shake'), 400);
    }
    await sleep(600);
    if (state.playerHP <= 0) { endGame(false); return; }
  }

  grantBattleRewards(outcome);

  // Next round
  state.round++;
  state.roundsSurvived++;
  scheduleSave();
  await sleep(800);
  showTurnBanner("NEW ROUND", "#d4a017");
  await sleep(1200);
  dealRound();
}

async function monsterAttack(fromBust=false) {
  const dmg = fromBust ? 10 : Math.floor(Math.random() * 15) + 5;
  if (state.blocking) {
    setLog("🛡 Iron Skin absorbed the monster's counterattack!");
    playSfx('block');
    state.blocking = false;
  } else {
    showDamageNumber(dmg, '#e74c3c', 'player');
    flashScreen('#c0392b');
    dealDamage('player', dmg);
    playSfx('damage');
    document.getElementById('player-zone').classList.add('shake');
    setTimeout(() => document.getElementById('player-zone').classList.remove('shake'), 400);
  }
  await sleep(800);
  if (state.playerHP <= 0) { endGame(false); return; }

  grantBattleRewards('loss');

  // New round after bust
  state.round++;
  state.roundsSurvived++;
  state.busy = false;
  scheduleSave();
  await sleep(600);
  dealRound();
}

// ══════════════════════════════════════════════
// JOKERS
// ══════════════════════════════════════════════
async function useJoker(id) {
  if (!state.unlocked.jokers[id]) {
    setLog(`${ABILITY_LABELS[id]} is locked. Keep battling to earn it.`);
    return;
  }
  if (state.jokerUsed[id] || state.phase !== 'player' || state.busy) return;
  state.jokerUsed[id] = true;
  updateAbilityUI();
  playSfx('special');

  if (id === 1) {
    // Remove highest value card
    if (state.playerCards.length === 0) return;
    let maxIdx = 0;
    state.playerCards.forEach((c,i) => { if(cardPoints(c) > cardPoints(state.playerCards[maxIdx])) maxIdx=i; });
    const removed = state.playerCards.splice(maxIdx, 1)[0];
    refreshPlayerCards();
    updateScores();
    setLog(`🃏 Fool's Luck! Removed the ${removed.value}${removed.suit}. Score: ${handScore(state.playerCards)}`);
  } else if (id === 2) {
    const dmg = applyPlayerDamageBoost(15);
    dealDamage('monster', dmg);
    showDamageNumber(dmg, '#8b1a6b', 'monster');
    setLog(`💀 Death Draw! You deal ${dmg} unavoidable shadow damage!`);
    if (state.monsterHP <= 0) { await handleMonsterDefeated(); return; }
  } else if (id === 3) {
    state.doubleNext = true;
    setLog("⚡ Lightning charged! Your next attack deals DOUBLE damage!");
  } else if (id === 4) {
    state.blocking = true;
    setLog("🛡 Iron Skin activated! The next monster attack is blocked.");
  } else if (id === 5) {
    const upcoming = peekUpcomingCards(2);
    if (upcoming.length === 0) {
      setLog('Peek: deck is empty; next cards are unknown until reshuffle.');
    } else {
      setLog(`Peek active: next cards are ${upcoming.map(formatCard).join(', ')}. Press HIT to choose whether to draw.`);
    }
    state.peekPending = true;
  } else if (id === 6) {
    state.forcedMonsterDraws += 3;
    setLog(`Force Draw stacked: monster will draw ${state.forcedMonsterDraws} extra card(s) after your turn.`);
  }
  scheduleSave();
}

function grantBattleRewards(outcome) {
  const baseCoins = outcome === 'win' ? 6 : outcome === 'draw' ? 4 : 3;
  const bonusCoins = Math.floor(Math.random() * 3);
  const earned = baseCoins + bonusCoins;
  state.coins += earned;

  const rewardNotes = [`+${earned} coins`];
  const randomlyUnlocked = tryRandomUnlock();
  if (randomlyUnlocked) rewardNotes.push(`random unlock: ${randomlyUnlocked}`);
  rewardNotes.push('saved for shop');

  if (typeof tryGrantRandomPassiveAfterBattle === 'function') {
    tryGrantRandomPassiveAfterBattle();
  }

  updateAbilityUI();
  updateSpecialBtn();
  setLog(`Battle rewards: ${rewardNotes.join(' | ')}.`);
  scheduleSave();
}

function updateShopUI() {
  const coinsEl = document.getElementById('shop-coins');
  if (coinsEl) coinsEl.textContent = `${state.coins}`;
  const canHeal = state.coins >= 8 && state.playerHP < 100;
  const canCharge = state.coins >= 6;
  const jokerPrice = 10 + (state.shopJokerPurchasesThisVisit || 0);
  const lockedJokers = [];
  for (let i=1; i<=6; i++) {
    if (!state.unlocked.jokers[i]) lockedJokers.push(i);
  }
  if (!lockedJokers.includes(state.shopOfferedJoker)) {
    state.shopOfferedJoker = lockedJokers.length
      ? lockedJokers[Math.floor(Math.random() * lockedJokers.length)]
      : null;
  }
  const canBuyJoker = lockedJokers.length > 0 && state.coins >= jokerPrice;
  const healBtn = document.getElementById('shop-heal-btn');
  const chargeBtn = document.getElementById('shop-charge-btn');
  const jokerBtn = document.getElementById('shop-joker-btn');
  if (healBtn) healBtn.disabled = !canHeal;
  if (chargeBtn) chargeBtn.disabled = !canCharge;
  if (jokerBtn) {
    jokerBtn.disabled = !canBuyJoker;
    jokerBtn.textContent = lockedJokers.length > 0 && state.shopOfferedJoker
      ? `${ABILITY_LABELS[state.shopOfferedJoker]} (${jokerPrice})`
      : 'ALL JOKERS BOUGHT';
  }
}

function openEndlessChoice() {
  state.busy = true;
  state.phase = 'endless_choice';
  setButtons(false);
  const overlay = document.getElementById('endless-overlay');
  if (!overlay) {
    endGame(true);
    return;
  }
  overlay.style.display = 'flex';
}

function closeEndlessChoice() {
  const overlay = document.getElementById('endless-overlay');
  if (overlay) overlay.style.display = 'none';
}

function startEndlessMode() {
  state.endlessMode = true;
  state.floorBoss = null;
  state.shopPendingNextFloor = state.depth + 1;
  closeEndlessChoice();
  setLog(`Endless mode activated. Floor ${state.depth + 1} and beyond never end.`);
  scheduleSave();
  openShop();
}

function finishRunNow() {
  closeEndlessChoice();
  endGame(true);
}

function startEndlessFromGameOver() {
  const overlay = document.getElementById('game-over-overlay');
  if (overlay) overlay.style.display = 'none';
  state.endlessMode = true;
  state.inShop = false;
  state.busy = false;
  state.phase = 'player';
  state.floorBoss = null;
  state.shopPendingNextFloor = state.depth + 1;
  setLog(`Endless mode activated. Floor ${state.depth + 1} and beyond never end.`);
  scheduleSave();
  openShop();
}

function openShop(resetVisitPricing = true) {
  state.inShop = true;
  state.busy = true;
  state.phase = 'shop';
  if (resetVisitPricing) {
    state.shopJokerPurchasesThisVisit = 0;
    state.shopOfferedJoker = null;
  }
  playSfx('shop');
  setButtons(false);
  updateSpecialBtn();
  updateAbilityUI();
  updateShopUI();
  document.getElementById('shop-overlay').style.display = 'flex';
  scheduleSave();
}

function shopBuy(kind) {
  if (!state.inShop) return;
  if (kind === 'heal') {
    if (state.coins < 8 || state.playerHP >= 100) return;
    state.coins -= 8;
    state.playerHP = Math.min(100, state.playerHP + 20);
    updateHP();
    setLog('Shop: Restored 20 HP.');
  } else if (kind === 'charge') {
    if (state.coins < 6) return;
    state.coins -= 6;
    state.specialCharges++;
    setLog('Shop: Bought +1 Special charge.');
  } else if (kind === 'joker') {
    const locked = [];
    for (let i=1; i<=6; i++) if (!state.unlocked.jokers[i]) locked.push(i);
    if (locked.length === 0) {
      setLog('Shop: All joker cards are already unlocked.');
      updateShopUI();
      return;
    }
    const price = 10 + (state.shopJokerPurchasesThisVisit || 0);
    if (state.coins < price) return;
    const pick = locked.includes(state.shopOfferedJoker)
      ? state.shopOfferedJoker
      : locked[Math.floor(Math.random() * locked.length)];
    state.coins -= price;
    state.shopJokerPurchasesThisVisit = (state.shopJokerPurchasesThisVisit || 0) + 1;
    unlockAbility(pick, false);
    const remaining = locked.filter(k => k !== pick);
    state.shopOfferedJoker = remaining.length
      ? remaining[Math.floor(Math.random() * remaining.length)]
      : null;
    setLog(`Shop: Bought joker -> ${ABILITY_LABELS[pick]} (${price} coins). Next offer rotated.`);
  }
  playSfx('shop');
  updateSpecialBtn();
  updateAbilityUI();
  updateShopUI();
  scheduleSave();
}

async function leaveShop() {
  if (!state.inShop) return;
  if ((!state.remainingBosses || state.remainingBosses.length === 0) && !state.endlessMode) {
    state.inShop = false;
    document.getElementById('shop-overlay').style.display = 'none';
    endGame(true);
    return;
  }
  const nextFloor = state.shopPendingNextFloor || (state.depth + 1);
  state.depth = nextFloor;
  state.enemiesDefeatedOnFloor = 0;
  state.floorBoss = null;
  state.shopPendingNextFloor = null;
  state.inShop = false;
  state.busy = false;
  state.phase = 'player';
  document.getElementById('shop-overlay').style.display = 'none';
  showTurnBanner(`FLOOR ${state.depth}`, '#d4a017');
  setupEncounter(state.depth, 0);
  scheduleSave();
  await sleep(500);
  dealRound();
}

function tryRandomUnlock() {
  if (Math.random() >= 0.35) return null;
  const locked = [];
  if (!state.unlocked.special) locked.push('special');
  for (let i=1; i<=6; i++) if (!state.unlocked.jokers[i]) locked.push(i);
  if (locked.length === 0) return null;

  const pick = locked[Math.floor(Math.random() * locked.length)];
  unlockAbility(pick, pick === 'special');
  return ABILITY_LABELS[pick];
}

function buyAbilitiesWithCoins() {
  const bought = [];
  const locked = [];
  if (!state.unlocked.special) locked.push({ key: 'special', cost: ABILITY_COSTS.special });
  for (let i=1; i<=6; i++) {
    if (!state.unlocked.jokers[i]) locked.push({ key: i, cost: ABILITY_COSTS.jokers[i] });
  }

  // Buy at most one locked ability per battle so progression feels steady.
  const affordable = locked.filter(a => state.coins >= a.cost).sort((a,b) => a.cost - b.cost);
  if (affordable.length > 0) {
    const choice = affordable[0];
    state.coins -= choice.cost;
    unlockAbility(choice.key, true);
    bought.push(ABILITY_LABELS[choice.key]);
  }

  // If special is already unlocked, excess coins can refill one charge.
  if (state.unlocked.special && state.coins >= 5) {
    state.coins -= 5;
    state.specialCharges++;
    bought.push('Special Charge');
  }
  return bought;
}

function unlockAbility(key, addSpecialCharge) {
  if (key === 'special') {
    state.unlocked.special = true;
    if (addSpecialCharge) state.specialCharges++;
    return;
  }
  state.unlocked.jokers[key] = true;
}

function updateAbilityUI() {
  for (let i=1; i<=6; i++) {
    const el = document.getElementById(`joker-${i}`);
    if (!el) continue;
    const unlocked = !!state.unlocked.jokers[i];
    const consumed = !!state.jokerUsed[i];
    el.classList.toggle('used', !unlocked || consumed);
    el.title = unlocked
      ? ABILITY_LABELS[i]
      : `Locked (${ABILITY_COSTS.jokers[i]} coins)`;
  }
}

function refreshPlayerCards() {
  const container = document.getElementById('player-cards');
  container.innerHTML = '';
  state.playerCards.forEach(card => {
    const isRed = RED_SUITS.has(card.suit);
    const div = document.createElement('div');
    div.className = `card ${isRed ? 'red-card' : 'black-card'}`;
    div.innerHTML = `
      <div class="card-inner">
        <div class="card-front">
          <div class="card-corner tl">${card.value}<br>${card.suit}</div>
          <div class="card-center">${card.suit}</div>
          <div class="card-corner br">${card.value}<br>${card.suit}</div>
        </div>
      </div>`;
    container.appendChild(div);
  });
}

// UI helper functions were moved to ../static/ui.js

// ══════════════════════════════════════════════
// GAME END
// ══════════════════════════════════════════════
function endGame(playerWon) {
  closeEndlessChoice();
  const overlay = document.getElementById('game-over-overlay');
  const title   = document.getElementById('game-over-title');
  const msg     = document.getElementById('game-over-msg');
  const endlessBtn = document.getElementById('btn-endless-from-end');
  if (endlessBtn) endlessBtn.style.display = 'none';

  if (playerWon) {
    title.textContent = '✨ RUN CLEARED ✨';
    title.className = 'victory';
    msg.textContent = `You defeated all ${MONSTERS.length} bosses and escaped with ${state.playerHP} HP.`;
    if (!state.endlessMode && endlessBtn) endlessBtn.style.display = 'inline-block';
    playSfx('win');
  } else {
    title.textContent = '💀 DEFEATED 💀';
    title.className = 'defeat';
    msg.textContent = `${state.monster.name} ended your run on Floor ${state.depth}.`;
    playSfx('lose');
  }

  clearSavedRun();
  overlay.style.display = 'flex';
}
