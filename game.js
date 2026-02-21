// ══════════════════════════════════════════════
// GAME STATE
// ══════════════════════════════════════════════
const SUITS  = ['♠','♥','♦','♣'];
const VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = new Set(['♥','♦']);

// Configuration: whether dealer hits on soft 17 (Ace + 6)
const DEALER_HITS_SOFT_17 = false; // S17 by default

const MONSTERS = [
  { name: 'BELLAGIO VAULT',    sprite: '🎲', hp: 90,  difficulty: 1 },
  { name: 'MGM GRANDHOUSE',    sprite: '🎰', hp: 100, difficulty: 1.1 },
  { name: 'CAESARS KEEP',      sprite: '🏛️', hp: 110, difficulty: 1.2 },
  { name: 'THE VENETIAN VAULT',sprite: '🛶', hp: 95,  difficulty: 1.05 },
  { name: 'WYNN RESORT',       sprite: '🌟', hp: 105, difficulty: 1.15 },
];

let state = {};

function isSoft17(cards) {
  // soft 17: total 17 where an Ace counts as 11 (i.e., there's at least one ace counted as 11)
  let total = 0, aces = 0;
  for (let c of cards) {
    if (c.value === 'A') { total += 11; aces++; }
    else if (['J','Q','K'].includes(c.value)) total += 10;
    else total += parseInt(c.value);
  }
  // reduce aces from 11->1 as needed
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  // It's soft if total == 17 and there is at least one ace that could be counted as 11
  // We can detect soft by checking original sum with an ace as 11 at least once.
  if (total !== 17) return false;
  // Check if there exists an ace that is effectively counted as 11
  // Recalculate treating all aces as 1 to see baseline
  let baseline = 0;
  for (let c of cards) {
    if (c.value === 'A') baseline += 1;
    else if (['J','Q','K'].includes(c.value)) baseline += 10;
    else baseline += parseInt(c.value);
  }
  return (total > baseline);
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

// ══════════════════════════════════════════════
// START / INIT
// ══════════════════════════════════════════════
function startGame() {
  
  // Check if elements exist before trying to hide them
  const titleScreen = document.getElementById('title-screen');
  if (titleScreen) titleScreen.style.display = 'none';
  
  const gameScreen = document.getElementById('game-screen');
  if (gameScreen) gameScreen.style.display = 'flex';
  
  // Rest of your existing setup logic...

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
    playerNatural: false,
    monsterNatural: false,
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
  state.playerNatural = false;
  state.monsterNatural = false;
  document.getElementById('player-cards').innerHTML = '';
  document.getElementById('monster-cards').innerHTML = '';
  document.getElementById('monster-score').textContent = '?';

  // Deal 2 cards each, alternating
  await drawCard('player', false, 200);
  // Show dealer's first card face-up (standard blackjack shows one dealer card)
  await drawCard('monster', false,  400);
  await drawCard('player', false, 600);
  // Dealer second card remains face-down
  await drawCard('monster', true,  800);

  updateScores();

  // Check for naturals (blackjack) immediately after the opening deal
  state.playerNatural = handScore(state.playerCards) === 21 && state.playerCards.length === 2;
  state.monsterNatural = handScore(state.monsterCards) === 21 && state.monsterCards.length === 2;
  if (state.playerNatural || state.monsterNatural) {
    state.phase = 'resolution';
    setButtons(false);
    setLog("Checking for blackjacks...");
    // Reveal dealer's hidden card(s)
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
  // Use standard dealer rule: hit until 17 (configure soft-17 behavior separately if desired)
  const targetScore = 17;
  setLog(`${state.monster.name} draws cards...`);

  // Dealer drawing loop with soft-17 handling
  while (state.monsterCards.length < 7) {
    const mScoreNow = handScore(state.monsterCards);
    if (mScoreNow < targetScore) {
      await drawCard('monster', false, 0);
      renderFlippedMonsterCard();
      await sleep(700);
      continue;
    }
    if (mScoreNow > targetScore) break;
    // mScoreNow === targetScore (17): check soft-17 rule
    if (mScoreNow === targetScore) {
      if (DEALER_HITS_SOFT_17 && isSoft17(state.monsterCards)) {
        await drawCard('monster', false, 0);
        renderFlippedMonsterCard();
        await sleep(700);
        continue;
      }
      break;
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
  const pNatural = !!state.playerNatural;
  const mNatural = !!state.monsterNatural;
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
    // Apply natural double-damage for player if configured
    if (pNatural) {
      monsterDmg = monsterDmg * 2;
      msg += " (Natural blackjack! Damage doubled.)";
    }
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
  // Monster counterattack after player busts
  const dmg = fromBust ? Math.floor(Math.random() * 15) + 5 : Math.floor(Math.random() * 15) + 5;

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

// UI helper functions were moved to ../static/ui.js

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