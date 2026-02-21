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

const ABILITY_COSTS = { special: 8, jokers: { 1: 6, 2: 8, 3: 10, 4: 8 } };
const ABILITY_LABELS = { special: 'Special Attack', 1: "Fool's Luck", 2: 'Death Draw', 3: 'Lightning', 4: 'Iron Skin' };

let state = {};

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

function buildEncounterMonster(depth, enemyIndex) {
  const floorHP = floorEnemyHP(depth);
  const diffScale = 0.85 + depth * 0.07;
  const isBossEncounter = enemyIndex === FLOOR_BOSS_INDEX;

  if (isBossEncounter) {
    if (!state.floorBoss) state.floorBoss = pickNextBoss();
    const boss = state.floorBoss;
    if (!boss) return null;
    return {
      name: `${boss.name} • BOSS`,
      sprite: boss.sprite,
      hp: floorHP * 2,
      difficulty: +(boss.difficulty * diffScale).toFixed(2),
      isBoss: true,
      bossName: boss.name,
    };
  }

  return {
    name: `${BASE_ENEMY.name} • F${depth}-${enemyIndex + 1}`,
    sprite: BASE_ENEMY.sprite,
    hp: floorHP,
    difficulty: +(BASE_ENEMY.difficulty * diffScale).toFixed(2),
    isBoss: false,
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
  state.jokerUsed = { 1:false, 2:false, 3:false, 4:false };
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
  state.clearedEncounters++;
  const defeatedBossName = state.monster && state.monster.isBoss ? state.monster.bossName : null;
  if (defeatedBossName && !state.defeatedBosses[defeatedBossName]) {
    state.defeatedBosses[defeatedBossName] = true;
    state.defeatedBossCount++;
    if (state.defeatedBossCount >= MONSTERS.length) {
      setLog(`Final boss defeated. All ${MONSTERS.length} bosses are down.`);
      await sleep(900);
      endGame(true);
      return;
    }
  }
  state.enemiesDefeatedOnFloor++;

  if (state.enemiesDefeatedOnFloor < ENEMIES_PER_FLOOR) {
    const nextEncounterIndex = state.enemiesDefeatedOnFloor;
    const enemyNum = nextEncounterIndex + 1;
    const isBossNext = nextEncounterIndex === FLOOR_BOSS_INDEX;
    const nextLabel = isBossNext ? 'boss' : `enemy ${enemyNum}`;
    setLog(`Enemy defeated. Floor ${state.depth}: ${state.enemiesDefeatedOnFloor}/${ENEMIES_PER_FLOOR} down. Next: ${nextLabel}.`);
    await sleep(900);
    setupEncounter(state.depth, nextEncounterIndex);
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
  setLog(`Floor ${state.depth} cleared. Visit the shop before Floor ${state.depth + 1}.`);
  await sleep(900);
  openShop();
}

// ══════════════════════════════════════════════
// START / INIT
// ══════════════════════════════════════════════
function startGame() {
  document.getElementById('title-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'flex';
  document.getElementById('game-over-overlay').style.display = 'none';
  document.getElementById('shop-overlay').style.display = 'none';

  state = {
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
    jokerUsed: { 1:false, 2:false, 3:false, 4:false },
    unlocked: { special: false, jokers: { 1:false, 2:false, 3:false, 4:false } },
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
    shopPendingNextFloor: null,
    inShop: false,
    busy: false,
    playerNatural: false,
    monsterNatural: false,
  };

  setupEncounter(1, 0);
  setLog(`Run started. Floor 1 enemies have 10 HP. Bosses appear at the end of each floor with double HP.`);
  setButtons(false);

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

// ══════════════════════════════════════════════
// PLAYER ACTIONS
// ══════════════════════════════════════════════
async function playerHit() {
  if (state.busy || state.phase !== 'player') return;
  state.busy = true;
  setButtons(false);

  await drawCard('player', false, 0);
  updateScores();

  const score = handScore(state.playerCards);
  if (score > 21) {
    setLog(`💥 BUST! Your score of ${score} exceeds 21! Monster strikes!`);
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

  setLog(msg);
  await sleep(600);

  if (monsterDmg > 0) {
    if (pNatural) {
      monsterDmg = monsterDmg * 2;
      msg += " (Natural blackjack! Damage doubled.)";
    }
    let finalDmg = state.doubleNext ? monsterDmg * 2 : monsterDmg;
    state.doubleNext = false;
    finalDmg = applyPlayerDamageBoost(finalDmg);
    showDamageNumber(finalDmg, '#d4a017', 'monster');
    flashScreen('#d4a017');
    dealDamage('monster', finalDmg);
    document.getElementById('monster-zone').classList.add('shake');
    setTimeout(() => document.getElementById('monster-zone').classList.remove('shake'), 400);
    await sleep(600);
    if (state.monsterHP <= 0) { await handleMonsterDefeated(); return; }
  }

  if (playerDmg > 0) {
    if (state.blocking) {
      setLog("🛡 Iron Skin absorbed the blow!");
      state.blocking = false;
    } else {
      showDamageNumber(playerDmg, '#e74c3c', 'player');
      flashScreen('#c0392b');
      dealDamage('player', playerDmg);
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
  await sleep(800);
  showTurnBanner("NEW ROUND", "#d4a017");
  await sleep(1200);
  dealRound();
}

async function monsterAttack(fromBust=false) {
  const dmg = fromBust ? 10 : Math.floor(Math.random() * 15) + 5;
  if (state.blocking) {
    setLog("🛡 Iron Skin absorbed the monster's counterattack!");
    state.blocking = false;
  } else {
    showDamageNumber(dmg, '#e74c3c', 'player');
    flashScreen('#c0392b');
    dealDamage('player', dmg);
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
  }
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
}

function updateShopUI() {
  const coinsEl = document.getElementById('shop-coins');
  if (coinsEl) coinsEl.textContent = `${state.coins}`;
  const canHeal = state.coins >= 8 && state.playerHP < 100;
  const canCharge = state.coins >= 6;
  const canRefresh = state.coins >= 7;
  document.getElementById('shop-heal-btn').disabled = !canHeal;
  document.getElementById('shop-charge-btn').disabled = !canCharge;
  document.getElementById('shop-refresh-btn').disabled = !canRefresh;
}

function openShop() {
  state.inShop = true;
  state.busy = true;
  state.phase = 'shop';
  setButtons(false);
  updateSpecialBtn();
  updateAbilityUI();
  updateShopUI();
  document.getElementById('shop-overlay').style.display = 'flex';
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
  } else if (kind === 'refresh') {
    if (state.coins < 7) return;
    state.coins -= 7;
    state.jokerUsed = { 1:false, 2:false, 3:false, 4:false };
    setLog('Shop: Jokers refreshed for the next floor.');
  }
  updateSpecialBtn();
  updateAbilityUI();
  updateShopUI();
}

async function leaveShop() {
  if (!state.inShop) return;
  if (!state.remainingBosses || state.remainingBosses.length === 0) {
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
  await sleep(500);
  dealRound();
}

function tryRandomUnlock() {
  if (Math.random() >= 0.35) return null;
  const locked = [];
  if (!state.unlocked.special) locked.push('special');
  for (let i=1; i<=4; i++) if (!state.unlocked.jokers[i]) locked.push(i);
  if (locked.length === 0) return null;

  const pick = locked[Math.floor(Math.random() * locked.length)];
  unlockAbility(pick, pick === 'special');
  return ABILITY_LABELS[pick];
}

function buyAbilitiesWithCoins() {
  const bought = [];
  const locked = [];
  if (!state.unlocked.special) locked.push({ key: 'special', cost: ABILITY_COSTS.special });
  for (let i=1; i<=4; i++) {
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
  for (let i=1; i<=4; i++) {
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
  const overlay = document.getElementById('game-over-overlay');
  const title   = document.getElementById('game-over-title');
  const msg     = document.getElementById('game-over-msg');

  if (playerWon) {
    title.textContent = '✨ RUN CLEARED ✨';
    title.className = 'victory';
    msg.textContent = `You defeated all ${MONSTERS.length} bosses and escaped with ${state.playerHP} HP.`;
  } else {
    title.textContent = '💀 DEFEATED 💀';
    title.className = 'defeat';
    msg.textContent = `${state.monster.name} ended your run on Floor ${state.depth}.`;
  }

  overlay.style.display = 'flex';
}
