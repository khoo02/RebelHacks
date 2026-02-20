// ══════════════════════════════════════════════
// GAME STATE
// ══════════════════════════════════════════════
const SUITS  = ['♠','♥','♦','♣'];
const VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = new Set(['♥','♦']);

const MONSTERS = [
  { name: 'VOID DEALER',  sprite: '👹', hp: 80,  difficulty: 1 },
  { name: 'SKULL BANKER', sprite: '💀', hp: 100, difficulty: 1.2 },
  { name: 'SHADOW DUKE',  sprite: '🐉', hp: 120, difficulty: 1.4 },
];

let state = {};

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

// ══════════════════════════════════════════════
// START / INIT
// ══════════════════════════════════════════════
function startGame() {
  document.getElementById('title-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'flex';
  document.getElementById('game-over-overlay').style.display = 'none';

  const monsterIdx = Math.floor(Math.random() * MONSTERS.length);
  const monster = MONSTERS[monsterIdx];

  state = {
    deck: freshDeck(),
    playerCards: [],
    monsterCards: [],
    playerHP: 100,
    monsterHP: monster.hp,
    monsterMaxHP: monster.hp,
    monster,
    phase: 'player', // 'player' | 'monster' | 'resolution'
    specialCharges: 2,
    doubleNext: false,
    blocking: false,
    jokerUsed: { 1:false, 2:false, 3:false, 4:false },
    round: 1,
    busy: false,
  };

  // Update monster UI
  document.getElementById('monster-sprite').textContent = monster.sprite;
  document.getElementById('monster-name').textContent = monster.name;
  updateHP();

  // Reset jokers
  for (let i=1; i<=4; i++) {
    const j = document.getElementById(`joker-${i}`);
    j.classList.remove('used');
  }

  // Reset cards
  document.getElementById('player-cards').innerHTML = '';
  document.getElementById('monster-cards').innerHTML = '';
  document.getElementById('monster-score').textContent = '?';
  document.getElementById('player-score').textContent = '0';

  updateSpecialBtn();
  setLog("A new challenger appears! Draw your first card...");
  setButtons(true);

  // Deal opening hands
  dealRound();
}

async function dealRound() {
  state.busy = true;
  setButtons(false);
  state.playerCards = [];
  state.monsterCards = [];
  document.getElementById('player-cards').innerHTML = '';
  document.getElementById('monster-cards').innerHTML = '';
  document.getElementById('monster-score').textContent = '?';

  // Deal 2 cards each, alternating
  await drawCard('player', false, 200);
  await drawCard('monster', true,  400);
  await drawCard('player', false, 600);
  await drawCard('monster', true,  800);

  updateScores();
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
    await playerStand();
    return;
  }

  setLog(`You drew! Score: ${score}. Hit again or Stand?`);
  state.busy = false;
  setButtons(true);
}

async function playerStand() {
  if (state.busy || state.phase !== 'player') return;
  state.busy = true;
  setButtons(false);
  state.phase = 'resolution';

  // Flip monster cards
  setLog("You stand! Revealing the monster's hand...");
  flipMonsterCards();
  await sleep(1000);

  // Monster draws to reach strategy score
  const difficulty = state.monster.difficulty;
  const targetScore = Math.round(16 * difficulty);
  setLog(`${state.monster.name} draws cards...`);

  while (handScore(state.monsterCards) < targetScore && state.monsterCards.length < 7) {
    await drawCard('monster', false, 0);
    renderFlippedMonsterCard();
    await sleep(700);
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
  if (state.busy || state.phase !== 'player' || state.specialCharges <= 0) return;
  state.specialCharges--;
  updateSpecialBtn();
  state.busy = true;
  setButtons(false);

  const dmg = Math.floor(Math.random() * 15) + 10;
  showDamageNumber(dmg, '#c0392b', 'monster');
  flashScreen('#c0392b');
  dealDamage('monster', dmg);
  setLog(`💥 SPECIAL ATTACK! You unleash arcane energy for ${dmg} damage!`);
  await sleep(1000);

  if (state.monsterHP <= 0) { endGame(true); return; }

  state.busy = false;
  setButtons(true);
}

// ══════════════════════════════════════════════
// RESOLUTION
// ══════════════════════════════════════════════
async function resolveRound(pScore, mScore) {
  const mBust  = mScore > 21;
  const pBust  = pScore > 21;
  let msg = '';
  let playerDmg = 0, monsterDmg = 0;

  if (mBust && !pBust) {
    monsterDmg = 20 + pScore;
    msg = `Monster BUSTS at ${mScore}! You deal ${monsterDmg} damage!`;
  } else if (pBust && !mBust) {
    playerDmg = 15;
    msg = `You busted! Monster deals ${playerDmg} damage as punishment.`;
  } else if (pBust && mBust) {
    msg = "Both busted! A chaotic draw — no damage!";
  } else if (pScore > mScore) {
    monsterDmg = pScore - mScore + 10;
    msg = `Victory! ${pScore} vs ${mScore} — Monster takes ${monsterDmg} damage!`;
  } else if (mScore > pScore) {
    playerDmg = mScore - pScore + 5;
    msg = `Defeat! ${mScore} vs ${pScore} — You take ${playerDmg} damage!`;
  } else {
    msg = `TIE! Both at ${pScore}. No damage — but the monster plots...`;
  }

  setLog(msg);
  await sleep(600);

  if (monsterDmg > 0) {
    let finalDmg = state.doubleNext ? monsterDmg * 2 : monsterDmg;
    state.doubleNext = false;
    showDamageNumber(finalDmg, '#d4a017', 'monster');
    flashScreen('#d4a017');
    dealDamage('monster', finalDmg);
    document.getElementById('monster-zone').classList.add('shake');
    setTimeout(() => document.getElementById('monster-zone').classList.remove('shake'), 400);
    await sleep(600);
    if (state.monsterHP <= 0) { endGame(true); return; }
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

  // Next round
  state.round++;
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

  // New round after bust
  state.round++;
  state.busy = false;
  await sleep(600);
  dealRound();
}

// ══════════════════════════════════════════════
// JOKERS
// ══════════════════════════════════════════════
function useJoker(id) {
  if (state.jokerUsed[id] || state.phase !== 'player' || state.busy) return;
  state.jokerUsed[id] = true;
  document.getElementById(`joker-${id}`).classList.add('used');

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
    dealDamage('monster', 15);
    showDamageNumber(15, '#8b1a6b', 'monster');
    setLog("💀 Death Draw! You deal 15 unavoidable shadow damage!");
    if (state.monsterHP <= 0) { endGame(true); return; }
  } else if (id === 3) {
    state.doubleNext = true;
    setLog("⚡ Lightning charged! Your next attack deals DOUBLE damage!");
  } else if (id === 4) {
    state.blocking = true;
    setLog("🛡 Iron Skin activated! The next monster attack is blocked.");
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

// ══════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════
function dealDamage(target, amount) {
  if (target === 'monster') {
    state.monsterHP = Math.max(0, state.monsterHP - amount);
  } else {
    state.playerHP = Math.max(0, state.playerHP - amount);
  }
  updateHP();
}

function updateHP() {
  const mPct = (state.monsterHP / state.monsterMaxHP * 100).toFixed(1);
  document.getElementById('monster-hp-fill').style.width = mPct + '%';
  document.getElementById('monster-hp-text').textContent = Math.round(state.monsterHP);
  const pPct = (state.playerHP / 100 * 100).toFixed(1);
  document.getElementById('player-hp-fill').style.width = pPct + '%';
  document.getElementById('player-hp-text').textContent = Math.round(state.playerHP);
}

function updateScores() {
  const ps = handScore(state.playerCards);
  document.getElementById('player-score').textContent = ps;
  if (state.phase === 'player') {
    document.getElementById('monster-score').textContent = '?';
  }
}

function setLog(text) {
  document.getElementById('battle-log-text').textContent = text;
}

function setButtons(enabled) {
  ['btn-hit','btn-stand','btn-special'].forEach(id => {
    document.getElementById(id).disabled = !enabled;
  });
  if (enabled) document.getElementById('btn-special').disabled = (state.specialCharges <= 0);
}

function updateSpecialBtn() {
  document.getElementById('special-charges').textContent = `(${state.specialCharges} charges left)`;
  document.getElementById('btn-special').disabled = (state.specialCharges <= 0);
}

function showTurnBanner(text, color) {
  const el = document.getElementById('turn-indicator');
  el.textContent = text;
  el.style.color = color;
  el.style.textShadow = `0 0 40px ${color}`;
  el.classList.remove('show');
  void el.offsetWidth; // reflow
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1200);
}

function flashScreen(color) {
  const el = document.getElementById('damage-flash');
  el.style.background = color;
  el.style.opacity = '0.25';
  setTimeout(() => { el.style.opacity = '0'; }, 150);
}

function showDamageNumber(amount, color, target) {
  const zone = document.getElementById(target === 'monster' ? 'monster-zone' : 'player-zone');
  const rect = zone.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'damage-number';
  el.textContent = `-${amount}`;
  el.style.color = color;
  el.style.textShadow = `0 0 20px ${color}`;
  el.style.left = (rect.left + rect.width/2 - 30 + Math.random()*60) + 'px';
  el.style.top  = (rect.top + rect.height/2) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ══════════════════════════════════════════════
// GAME END
// ══════════════════════════════════════════════
function endGame(playerWon) {
  const overlay = document.getElementById('game-over-overlay');
  const title   = document.getElementById('game-over-title');
  const msg     = document.getElementById('game-over-msg');

  if (playerWon) {
    title.textContent = '✨ VICTORY ✨';
    title.className = 'victory';
    msg.textContent = `${state.monster.name} has been defeated! The dungeon trembles before you.`;
  } else {
    title.textContent = '💀 DEFEATED 💀';
    title.className = 'defeat';
    msg.textContent = `${state.monster.name} claims your soul. The cards were not in your favor.`;
  }

  overlay.style.display = 'flex';
}