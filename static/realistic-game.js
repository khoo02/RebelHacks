// ═══════════════════════════════════════════════
// BLACKJACK ENGINE
// ═══════════════════════════════════════════════

const SUITS  = ['♠','♥','♦','♣'];
const VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = new Set(['♥','♦']);
const DEALER_HITS_SOFT_17 = true; // H17 — standard Vegas rule

let deck = [], dealerCards = [], playerCards = [];
let phase = 'bet'; // 'bet' | 'player' | 'dealer' | 'done'
let currentBet = 0;
let balance = 500;

function freshDeck(numDecks = 6) {
  let d = [];
  for (let n = 0; n < numDecks; n++)
    for (let s of SUITS) for (let v of VALUES) d.push({ suit: s, value: v });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardVal(card) {
  if (['J','Q','K'].includes(card.value)) return 10;
  if (card.value === 'A') return 11;
  return parseInt(card.value);
}

function handTotal(cards) {
  let total = 0, aces = 0;
  for (const c of cards) { total += cardVal(c); if (c.value === 'A') aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isSoft17(cards) {
  let total = 0, aces = 0;
  for (const c of cards) { total += cardVal(c); if (c.value === 'A') aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  if (total !== 17) return false;
  let base = 0;
  for (const c of cards) base += c.value === 'A' ? 1 : cardVal(c);
  return total > base;
}

function isBlackjack(cards) {
  return cards.length === 2 && handTotal(cards) === 21;
}

// ─── RENDERING ────────────────────────────────

function renderCard(card, container, faceDown = false) {
  const isRed = RED_SUITS.has(card.suit);
  const div = document.createElement('div');
  div.className = 'card';
  if (faceDown) {
    div.innerHTML = `<div class="card-inner"><div class="card-back"></div></div>`;
  } else {
    div.innerHTML = `
      <div class="card-inner">
        <div class="card-face ${isRed ? 'red' : 'black'}">
          <div class="corner tl">${card.value}<br>${card.suit}</div>
          <div class="center-suit">${card.suit}</div>
          <div class="corner br">${card.value}<br>${card.suit}</div>
        </div>
      </div>`;
  }
  div._card = card;
  container.appendChild(div);
  return div;
}

function flipCard(div) {
  const card = div._card;
  const isRed = RED_SUITS.has(card.suit);
  div.classList.add('flip');
  setTimeout(() => {
    div.innerHTML = `
      <div class="card-inner">
        <div class="card-face ${isRed ? 'red' : 'black'}">
          <div class="corner tl">${card.value}<br>${card.suit}</div>
          <div class="center-suit">${card.suit}</div>
          <div class="corner br">${card.value}<br>${card.suit}</div>
        </div>
      </div>`;
  }, 225);
}

function updateScores(revealDealer = false) {
  const ps = handTotal(playerCards);
  document.getElementById('player-score').textContent = ps > 21 ? `${ps} — BUST` : ps;
  if (revealDealer) {
    const ds = handTotal(dealerCards);
    document.getElementById('dealer-score').textContent = ds > 21 ? `${ds} — BUST` : ds;
  } else {
    // Show only first visible card total
    if (dealerCards.length > 0) {
      document.getElementById('dealer-score').textContent = cardVal(dealerCards[0]);
    }
  }
}

function setMsg(text) { document.getElementById('msg-box').textContent = text; }

function flash(color) {
  const el = document.getElementById('flash');
  el.style.background = color;
  el.style.opacity = '0.2';
  setTimeout(() => el.style.opacity = '0', 160);
}

// ─── BETTING ──────────────────────────────────

function addBet(amount) {
  if (phase !== 'bet') return;
  if (currentBet + amount > balance) return;
  currentBet += amount;
  document.getElementById('bet-display').textContent = `$${currentBet}`;
  updateBetButtons();
}

function clearBet() {
  if (phase !== 'bet') return;
  currentBet = 0;
  document.getElementById('bet-display').textContent = '$0';
  updateBetButtons();
}

function updateBetButtons() {
  document.getElementById('btn-deal').disabled = (currentBet === 0);
  document.getElementById('btn-clear').disabled = (currentBet === 0);
  const chips = ['chip1','chip5','chip25','chip100','chip500'];
  const amounts = [1,5,25,100,500];
  chips.forEach((id, i) => {
    document.getElementById(id).disabled = (phase !== 'bet' || currentBet + amounts[i] > balance);
  });
  document.getElementById('balance-display').textContent = `$${balance}`;
}

// ─── DEAL ─────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function deal() {
  if (currentBet === 0 || phase !== 'bet') return;
  if (deck.length < 30) deck = freshDeck(6);

  // Deduct bet
  balance -= currentBet;
  updateBetButtons();
  agHandStart();

  // Clear tables
  document.getElementById('dealer-cards').innerHTML = '';
  document.getElementById('player-cards').innerHTML = '';
  dealerCards = [];
  playerCards = [];
  document.getElementById('dealer-score').textContent = '—';
  document.getElementById('player-score').textContent = '—';

  // Disable bet buttons
  setPhase('deal-anim');

  // Deal sequence: p1, d1, p2, d2(face-down)
  await dealCardTo('player', false, 0);
  await dealCardTo('dealer', false, 250);
  await dealCardTo('player', false, 500);
  await dealCardTo('dealer', true,  750);   // hole card

  await sleep(900);
  updateScores(false);

  // Check naturals
  const pBJ = isBlackjack(playerCards);
  const dBJ = isBlackjack(dealerCards);

  if (pBJ || dBJ) {
    revealHole();
    updateScores(true);
    await sleep(700);
    if (pBJ && dBJ) { settleHand('push', 'Both Blackjack — Push'); }
    else if (pBJ)   { settleHand('blackjack', 'Blackjack! 3:2 payout'); }
    else            { settleHand('lose', 'Dealer Blackjack'); }
    return;
  }

  // Player's turn
  setPhase('player');
  const canDouble = (balance >= currentBet);
  document.getElementById('btn-double').disabled = !canDouble;
  setMsg('Your move: Hit, Stand, or Double Down.');
  updateOddsPanel();
}

async function dealCardTo(target, faceDown, delay) {
  await sleep(delay);
  const card = deck.pop();
  if (target === 'player') playerCards.push(card);
  else dealerCards.push(card);
  const container = document.getElementById(target === 'player' ? 'player-cards' : 'dealer-cards');
  const div = renderCard(card, container, faceDown);
  div._faceDown = faceDown;
  return div;
}

function revealHole() {
  const container = document.getElementById('dealer-cards');
  const cards = container.querySelectorAll('.card');
  cards.forEach((div, i) => {
    if (div._faceDown) { flipCard(div); div._faceDown = false; }
  });
}

// ─── PLAYER ACTIONS ───────────────────────────

function hit() {
  if (phase !== 'player') return;
  const card = deck.pop();
  playerCards.push(card);
  renderCard(card, document.getElementById('player-cards'), false);
  updateScores(false);
  updateOddsPanel();
  if (handTotal(playerCards) > 21) {
    setMsg('Bust! You went over 21.');
    flash('#c0392b');
    settleHand('bust', 'Bust — over 21');
  } else if (handTotal(playerCards) === 21) {
    stand(); // auto-stand on 21
  }
}

function stand() {
  if (phase !== 'player') return;
  setPhase('dealer');
  setMsg('Dealer reveals…');
  revealHole();
  updateScores(true);
  setTimeout(dealerPlay, 700);
}

function doubleDown() {
  if (phase !== 'player' || balance < currentBet) return;
  balance -= currentBet;
  currentBet *= 2;
  document.getElementById('bet-display').textContent = `$${currentBet}`;
  updateBetButtons();
  const card = deck.pop();
  playerCards.push(card);
  renderCard(card, document.getElementById('player-cards'), false);
  updateScores(false);
  if (handTotal(playerCards) > 21) {
    revealHole();
    settleHand('bust', 'Doubled — Bust');
  } else {
    stand();
  }
}

// ─── DEALER PLAY ──────────────────────────────

async function dealerPlay() {
  let total = handTotal(dealerCards);
  while (total < 17 || (DEALER_HITS_SOFT_17 && total === 17 && isSoft17(dealerCards))) {
    await sleep(650);
    const card = deck.pop();
    dealerCards.push(card);
    renderCard(card, document.getElementById('dealer-cards'), false);
    total = handTotal(dealerCards);
    updateScores(true);
  }

  await sleep(500);
  const pTotal = handTotal(playerCards);
  const dTotal = handTotal(dealerCards);

  if (dTotal > 21)         settleHand('win',  `Dealer busts at ${dTotal}!`);
  else if (pTotal > dTotal) settleHand('win',  `${pTotal} beats ${dTotal}`);
  else if (dTotal > pTotal) settleHand('lose', `Dealer ${dTotal} beats your ${pTotal}`);
  else                      settleHand('push', `Both ${pTotal} — Push`);
}

// ─── SETTLE ───────────────────────────────────

function settleHand(result, subtitle) {
  setPhase('done');
  let payout = 0;
  let agResult = 'loss';

  if (result === 'win')       { payout = currentBet * 2; agResult = 'win'; }
  else if (result === 'blackjack') { payout = Math.floor(currentBet * 2.5); agResult = 'win'; }
  else if (result === 'push') { payout = currentBet; agResult = 'push'; }
  else                        { payout = 0; agResult = 'loss'; }

  balance += payout;
  const netChange = payout - currentBet;

  // Flash feedback
  if (result === 'win' || result === 'blackjack') flash('#27ae60');
  else if (result === 'lose' || result === 'bust') flash('#c0392b');

  agRecordHand(agResult, Math.abs(netChange));
  updateLiveDebtPanel();
  document.getElementById('odds-panel').classList.remove('visible');

  // Show game-over report overlay
  const title = document.getElementById('go-title');
  if (result === 'win' || result === 'blackjack') {
    title.textContent = result === 'blackjack' ? '♠ BLACKJACK ♠' : '✓ YOU WIN';
    title.className = 'go-win';
  } else if (result === 'lose' || result === 'bust') {
    title.textContent = result === 'bust' ? '✗ BUST' : '✗ YOU LOSE';
    title.className = 'go-lose';
  } else {
    title.textContent = '— PUSH —';
    title.className = 'go-push';
  }
  document.getElementById('go-subtitle').textContent = subtitle;

  buildReport();
  buildNextHandForecast();
  // Store last bet for forecast reference
  AG.lastBet = currentBet;
  document.getElementById('gameover').classList.add('show');
}

function newHand() {
  document.getElementById('gameover').classList.remove('show');
  if (balance === 0) {
    alert("You're out of chips! Session ending.");
    window.location.href = 'index.html';
    return;
  }
  currentBet = 0;
  document.getElementById('bet-display').textContent = '$0';
  setPhase('bet');
  setMsg('Place your bet and deal to begin.');
  updateBetButtons();
}

function setPhase(p) {
  phase = p;
  const inBet    = (p === 'bet');
  const inPlayer = (p === 'player');
  document.getElementById('btn-deal').disabled   = (p !== 'bet' || currentBet === 0);
  document.getElementById('btn-clear').disabled  = (p !== 'bet');
  document.getElementById('btn-hit').disabled    = !inPlayer;
  document.getElementById('btn-stand').disabled  = !inPlayer;
  document.getElementById('btn-double').disabled = !inPlayer;
  ['chip1','chip5','chip25','chip100','chip500'].forEach(id => {
    document.getElementById(id).disabled = !inBet;
  });
}

// ═══════════════════════════════════════════════
// ANTI-GAMBLING SYSTEM
// ═══════════════════════════════════════════════

const AG = {
  sessionStart: Date.now(),
  timerInterval: null,
  hands: 0,
  wins: 0,
  pushes: 0,
  losses: 0,
  consecutiveLosses: 0,
  consecutiveWins: 0,
  netPL: 0,          // positive = profit, negative = loss
  totalWagered: 0,
  totalLost: 0,       // gross losses only (for could-have-bought)
  warnedTime: false,
};

function agInit() {
  AG.sessionStart = Date.now();
  AG.timerInterval = setInterval(agTick, 1000);
  agTick();
}

function agHandStart() {
  AG.totalWagered += currentBet;
}

function agTick() {
  const elapsed = Math.floor((Date.now() - AG.sessionStart) / 1000);
  const mm = String(Math.floor(elapsed / 60)).padStart(2,'0');
  const ss = String(elapsed % 60).padStart(2,'0');
  const el = document.getElementById('hud-timer');
  el.textContent = `${mm}:${ss}`;

  if (elapsed >= 1800 && !AG.warnedTime) {
    AG.warnedTime = true;
    document.getElementById('banner-time').classList.add('show');
    el.className = 'ag-val warn-red';
  } else if (elapsed >= 900) {
    el.className = 'ag-val warn-orange';
  }
}

function agRecordHand(result, moneyMoved) {
  AG.hands++;
  document.getElementById('hud-hands').textContent = AG.hands;

  if (result === 'win') {
    AG.wins++;
    AG.consecutiveLosses = 0;
    AG.consecutiveWins++;
    AG.netPL += moneyMoved;
    document.getElementById('banner-streak').classList.remove('show');
    if (AG.consecutiveWins >= 3) {
      document.getElementById('win-nudge').classList.add('show');
      AG.consecutiveWins = 0;
    }
  } else if (result === 'loss') {
    AG.losses++;
    AG.consecutiveWins = 0;
    AG.consecutiveLosses++;
    AG.netPL -= moneyMoved;
    AG.totalLost += moneyMoved;
    if (AG.consecutiveLosses >= 3) {
      document.getElementById('banner-streak').classList.add('show');
    }
  } else {
    // push
    AG.pushes++;
    AG.consecutiveLosses = 0;
    AG.consecutiveWins = 0;
  }

  // Update HUD P/L
  const debtEl = document.getElementById('hud-debt');
  if (AG.netPL > 0) {
    debtEl.textContent = `+$${AG.netPL}`;
    debtEl.className = 'ag-val in-profit';
  } else if (AG.netPL < 0) {
    debtEl.textContent = `-$${Math.abs(AG.netPL)}`;
    debtEl.className = 'ag-val in-debt';
  } else {
    debtEl.textContent = '$0';
    debtEl.className = 'ag-val';
  }

  // Update win rate
  const played = AG.wins + AG.losses;
  const wrEl = document.getElementById('hud-winrate');
  if (played > 0) {
    const rate = Math.round((AG.wins / played) * 100);
    wrEl.textContent = `${rate}%`;
    wrEl.className = rate >= 50 ? 'ag-val winning' : 'ag-val losing';
  }
}

// ══════════════════════════════════════════════
// BUYABLE ITEMS DATABASE
// ══════════════════════════════════════════════
// [emoji, name, price, category]
const BUYABLE = [
  ['☕', 'Cup of coffee',          5,   'food'],
  ['🌮', 'Taco',                   3,   'food'],
  ['🍕', 'Pizza slice',            4,   'food'],
  ['🍔', 'Burger meal',            9,   'food'],
  ['🧋', 'Bubble tea',             7,   'food'],
  ['🍦', 'Ice cream cone',         4,   'food'],
  ['🥐', 'Croissant',              3,   'food'],
  ['🌯', 'Burrito',                9,   'food'],
  ['🧁', 'Cupcake',                4,   'food'],
  ['🍿', 'Movie popcorn',          8,   'food'],
  ['🎬', 'Movie ticket',          14,   'entertainment'],
  ['📚', 'Paperback book',        12,   'entertainment'],
  ['🎮', 'Indie Steam game',      10,   'entertainment'],
  ['🎧', 'Spotify month',         11,   'entertainment'],
  ['🎟️', 'Concert ticket',        35,   'entertainment'],
  ['🎲', 'Board game',            25,   'entertainment'],
  ['🎨', 'Sketchbook + pens',     18,   'entertainment'],
  ['🌻', 'Bunch of flowers',      10,   'lifestyle'],
  ['🛁', 'Fancy bath bomb',       12,   'lifestyle'],
  ['📱', 'Phone case',            15,   'lifestyle'],
  ['🎁', 'Birthday gift',         20,   'lifestyle'],
  ['🏋️', 'Gym day pass',          15,   'lifestyle'],
  ['🚌', 'Bus day pass',           3,   'lifestyle'],
  ['🌿', 'Houseplant',            12,   'lifestyle'],
  ['🕯️', 'Scented candle',        14,   'lifestyle'],
  ['☀️', 'Sunscreen (SPF 50)',     10,   'lifestyle'],
  ['💊', 'Multivitamins (month)', 15,   'lifestyle'],
  ['🍷', 'Decent bottle of wine',  18,  'lifestyle'],
  ['🎪', 'Theme park entry',      60,   'experience'],
  ['✈️', 'Budget flight (one-way)',80,  'experience'],
  ['🏨', 'Hostel night',          40,   'experience'],
  ['🎭', 'Theatre ticket',        50,   'experience'],
  ['🚴', 'Bike rental (day)',      25,   'experience'],
];

// Arrange items in tiers for smarter selection
function buildCouldHaveBought(totalLost, containerEl, style='compact') {
  containerEl.innerHTML = '';
  if (totalLost < 3) return;

  // Sort by price descending, pick biggest fitting items first
  const sorted = [...BUYABLE].sort((a, b) => b[2] - a[2]);
  let budget = totalLost;
  const chosen = [];

  // First pass: try to find a few impactful items
  for (const item of sorted) {
    if (budget <= 0 || chosen.length >= 5) break;
    if (item[2] <= budget) {
      const maxQty = Math.min(Math.floor(budget / item[2]), 4);
      const qty = maxQty;
      budget -= qty * item[2];
      chosen.push({ emoji: item[0], name: item[1], price: item[2], qty });
    }
  }

  chosen.forEach((item, idx) => {
    const el = document.createElement('div');
    if (style === 'compact') {
      el.className = idx === 0 ? 'ldp-item hero' : 'ldp-item';
      el.textContent = `${item.emoji} ${item.qty > 1 ? item.qty + '× ' : ''}${item.name}`;
    } else {
      // big style for report overlay
      el.className = 'buy-item-big';
      el.innerHTML = `
        <span class="bi-emoji">${item.emoji}</span>
        <span>
          ${item.qty > 1 ? item.qty + '× ' : ''}${item.name}
          <span class="bi-qty">$${item.price * item.qty}</span>
        </span>`;
    }
    containerEl.appendChild(el);
  });
}

// ── Live debt panel ─────────────────────────────
function updateLiveDebtPanel() {
  const panel = document.getElementById('live-debt-panel');
  const amtEl = document.getElementById('ldp-amount');
  const itemsEl = document.getElementById('ldp-items');
  const loss = AG.totalLost;

  if (loss <= 0) {
    panel.classList.remove('visible');
    return;
  }

  panel.classList.add('visible');

  // Animate number change
  const prev = amtEl.dataset.prev || '0';
  amtEl.textContent = `$${loss}`;
  if (prev !== String(loss)) {
    amtEl.classList.remove('pop');
    void amtEl.offsetWidth;
    amtEl.classList.add('pop');
    amtEl.dataset.prev = loss;
  }

  buildCouldHaveBought(loss, itemsEl, 'compact');
}

// ══════════════════════════════════════════════
// ODDS TRACKER ENGINE
// ══════════════════════════════════════════════

/**
 * ACTUAL WIN % — derived from published basic strategy expected values.
 * Returns approximate win probability given player total and dealer upcard.
 * Based on standard 6-deck, H17 tables (Wizard of Odds / Griffin).
 *
 * Table format: playerTotal -> { dealerUpcardValue: winPct }
 * Dealer upcard 1 = Ace
 */
const BASIC_STRATEGY_WIN_PCT = {
  // Player hard totals
  4:  { 2:41, 3:42, 4:44, 5:46, 6:46, 7:40, 8:38, 9:35, 10:33, 1:30 },
  5:  { 2:41, 3:42, 4:44, 5:46, 6:46, 7:40, 8:38, 9:35, 10:33, 1:30 },
  6:  { 2:41, 3:42, 4:44, 5:46, 6:46, 7:40, 8:38, 9:35, 10:33, 1:30 },
  7:  { 2:41, 3:43, 4:45, 5:46, 6:47, 7:41, 8:39, 9:36, 10:34, 1:31 },
  8:  { 2:42, 3:43, 4:46, 5:47, 6:47, 7:42, 8:40, 9:37, 10:34, 1:31 },
  9:  { 2:44, 3:46, 4:48, 5:50, 6:50, 7:42, 8:40, 9:37, 10:34, 1:31 },
  10: { 2:54, 3:56, 4:58, 5:60, 6:60, 7:53, 8:50, 9:46, 10:40, 1:36 },
  11: { 2:57, 3:58, 4:60, 5:62, 6:62, 7:55, 8:52, 9:48, 10:41, 1:38 },
  12: { 2:36, 3:38, 4:41, 5:43, 6:43, 7:40, 8:38, 9:35, 10:33, 1:30 },
  13: { 2:38, 3:40, 4:43, 5:45, 6:46, 7:40, 8:37, 9:34, 10:31, 1:29 },
  14: { 2:39, 3:41, 4:44, 5:46, 6:47, 7:40, 8:37, 9:34, 10:31, 1:29 },
  15: { 2:39, 3:41, 4:44, 5:46, 6:47, 7:39, 8:36, 9:33, 10:28, 1:27 },
  16: { 2:39, 3:41, 4:43, 5:45, 6:46, 7:38, 8:35, 9:31, 10:27, 1:26 },
  17: { 2:41, 3:43, 4:45, 5:47, 6:47, 7:44, 8:41, 9:37, 10:32, 1:30 },
  18: { 2:56, 3:57, 4:59, 5:60, 6:61, 7:58, 8:53, 9:45, 10:40, 1:38 },
  19: { 2:64, 3:65, 4:67, 5:68, 6:68, 7:66, 8:63, 9:58, 10:52, 1:46 },
  20: { 2:73, 3:74, 4:75, 5:76, 6:76, 7:74, 8:73, 9:70, 10:65, 1:58 },
  21: { 2:92, 3:93, 4:93, 5:94, 6:94, 7:92, 8:91, 9:90, 10:88, 1:85 },
};

/**
 * PERCEIVED WIN % — how confident players typically feel.
 * Based on research showing players overestimate when they have 17-19,
 * and underestimate when holding 12-16 ("stiff hands").
 * This is intentionally biased to show the gap vs actual.
 */
function getPerceivedWinPct(playerTotal, dealerUpcard) {
  // Players anchor heavily on their own total and underweight dealer threat
  // Research suggests a consistent overconfidence bias of +8-15% on good hands
  const dealerThreat = [9,10,1].includes(dealerUpcard) ? -5 : [2,3,4].includes(dealerUpcard) ? 3 : 0;

  if (playerTotal >= 20)      return Math.min(95, 88 + dealerThreat);
  if (playerTotal === 19)     return Math.min(90, 80 + dealerThreat);
  if (playerTotal === 18)     return Math.min(85, 72 + dealerThreat);  // overconfident here
  if (playerTotal === 17)     return Math.min(80, 63 + dealerThreat);  // significantly overconfident
  if (playerTotal >= 13)      return Math.min(70, 48 + dealerThreat);  // "feels bad but maybe"
  if (playerTotal === 12)     return 38 + dealerThreat;
  if (playerTotal >= 9)       return 58 + dealerThreat;                // feels great to have 9/10/11
  return 45 + dealerThreat;
}

/**
 * BUST RISK — probability of busting on the next card.
 * Simple: any 10-value card (4/13 of deck) busts if total > 11.
 */
function getBustRisk(playerTotal) {
  if (playerTotal <= 11) return 0;
  // Cards that would bust: all cards with value > (21 - playerTotal)
  const safeMax = 21 - playerTotal;
  if (safeMax <= 0) return 100;
  // In a standard deck: A=1or11, 2-9 face value, 10/J/Q/K = 10
  // Cards 1-safeMax are safe. Count safe denominations out of 13.
  let safeCount = 0;
  for (let v = 1; v <= Math.min(safeMax, 9); v++) safeCount++;
  if (safeMax >= 10) safeCount += 4; // 10,J,Q,K all count as 10
  return Math.round(((13 - safeCount) / 13) * 100);
}

function getDealerUpcardValue(card) {
  if (!card) return 7; // default if no card
  if (['J','Q','K'].includes(card.value)) return 10;
  if (card.value === 'A') return 1;
  return parseInt(card.value);
}

function updateOddsPanel() {
  const panel = document.getElementById('odds-panel');

  if (phase !== 'player' || playerCards.length === 0) {
    panel.classList.remove('visible');
    return;
  }

  panel.classList.add('visible');

  const pTotal = handTotal(playerCards);
  const dealerUpcard = dealerCards[0] ? getDealerUpcardValue(dealerCards[0]) : 7;

  // Clamp pTotal for table lookup
  const lookupTotal = Math.min(Math.max(pTotal, 4), 21);
  const actualRow = BASIC_STRATEGY_WIN_PCT[lookupTotal];
  const actualPct = actualRow ? (actualRow[dealerUpcard] || actualRow[10] || 40) : 40;
  const perceivedPct = getPerceivedWinPct(pTotal, dealerUpcard);
  const bustPct = getBustRisk(pTotal);

  // Update bars
  document.getElementById('bar-perceived').style.width = perceivedPct + '%';
  document.getElementById('bar-actual').style.width    = actualPct + '%';
  document.getElementById('bar-bust').style.width      = bustPct + '%';

  document.getElementById('pct-perceived').textContent = perceivedPct + '%';
  document.getElementById('pct-actual').textContent    = actualPct + '%';
  document.getElementById('pct-bust').textContent      = bustPct + '%';

  // Gap callout
  const gap = perceivedPct - actualPct;
  const gapEl = document.getElementById('odds-gap');

  if (Math.abs(gap) >= 8) {
    gapEl.classList.add('show');
    if (gap > 0) {
      gapEl.className = 'odds-gap show overconfident';
      if (gap >= 20) {
        gapEl.textContent = `You feel ${gap}% more confident than the math supports. This gap is where casinos profit.`;
      } else {
        gapEl.textContent = `You feel ${gap}% better about this hand than statistics suggest.`;
      }
    } else {
      gapEl.className = 'odds-gap show underconfident';
      gapEl.textContent = `You may be underestimating this hand by ${Math.abs(gap)}%. Basic strategy favours playing it.`;
    }
  } else {
    gapEl.classList.remove('show');
  }
}


// ══════════════════════════════════════════════
// NEXT-HAND FORECAST ENGINE
// ══════════════════════════════════════════════

// Statistical blackjack baselines (6-deck, H17, basic strategy)
const BJ_BASE_LOSS_PCT   = 49.1;  // ~49% of hands result in a loss
const BJ_BASE_WIN_PCT    = 42.4;  // ~42% wins (remainder are pushes)
const BJ_LONG_RUN_LOSS   = 55.0;  // including pushes re-bet, practical loss rate
const HOUSE_EDGE_PCT     = 0.5;   // long-run expected loss per dollar wagered

function getDissuasionMessage(ag) {
  // Loss chasing — most dangerous state
  if (ag.netPL < 0 && ag.consecutiveLosses >= 2) {
    return 'You\'ve lost <strong>\' + ag.consecutiveLosses + \' hands in a row</strong>. The urge to win it back is called "loss chasing" — it\'s one of the strongest gambling urges, and it\'s exactly what keeps people playing past the point of reason.';
  }
  // Significantly down
  if (ag.netPL < -50) {
    return 'You\'re down <strong>$' + Math.abs(ag.netPL) + '</strong> this session. Statistically, continuing to play does not increase your chances of recovering that — it increases the expected total loss.';
  }
  // In the red, multiple hands played
  if (ag.netPL < 0 && ag.hands > 5) {
    return 'After <strong>\' + ag.hands + \' hands</strong> you\'re in the red. The house edge is small but relentless — it compounds with every hand dealt. There is no amount of play that erases it.';
  }
  // Winning streak — overconfidence risk
  if (ag.netPL > 0 && ag.consecutiveWins >= 2) {
    return 'You\'re on a run. This is when most people lose the most money — <strong>winning streaks feel like skill, not luck</strong>. The next hand has no memory of the last. The odds reset completely.';
  }
  // Up on the session
  if (ag.netPL > 30) {
    return 'You\'re ahead by <strong>$\' + ag.netPL + \'</strong>. That money is real. The longer you continue, the more likely the house edge pulls it back — that\'s not pessimism, it\'s arithmetic.';
  }
  // Long session
  if (ag.hands >= 15) {
    return '<strong>' + ag.hands + ' hands in.</strong> A casino processes hundreds of decisions an hour — the longer you play, the more the house edge compounds. Time at the table is the house\'s biggest advantage.';
  }
  if (ag.hands >= 8) {
    return 'Every hand is an independent event. There is no "due" win, no hot table, no momentum. <strong>The cards have no memory</strong> — only the math persists.';
  }
  // Default
  return 'Blackjack has some of the best odds in any casino — and the house still wins more than it loses over time. <strong>The next hand is more likely to lose than win.</strong> That\'s not a warning, it\'s a mathematical fact.';
}

function buildNextHandForecast() {
  // ── Loss probability for next hand ────────────────────────────────────────
  // Base: 49.1%. Adjust slightly for session streak (regression to mean model).
  // NOTE: We show truth — each hand is independent. But we contextualise with
  // the long-run reality rather than implying hot/cold streaks.
  const played = AG.wins + AG.losses;
  let sessionLossPct = played > 0
    ? Math.round((AG.losses / played) * 100)
    : Math.round(BJ_BASE_LOSS_PCT);

  // Weighted blend: session result drifts toward true baseline over time
  // This prevents wild numbers on first few hands while showing truth at scale
  const weight = Math.min(played / 20, 1);  // full trust in session data after 20 hands
  const blendedLoss = Math.round(
    sessionLossPct * weight + BJ_BASE_LOSS_PCT * (1 - weight)
  );

  // Clamp to realistic range
  const displayLoss = Math.max(40, Math.min(70, blendedLoss));

  // ── Circle arc ─────────────────────────────────────────────────────────────
  const circumference = 207.3; // 2π × 33
  const offset = circumference * (1 - displayLoss / 100);
  const circleEl = document.getElementById('nhf-circle-fill');
  const numEl    = document.getElementById('nhf-prob-number');

  // Colour tier
  const tier = displayLoss >= 55 ? 'high' : displayLoss >= 49 ? 'mid' : 'low';
  circleEl.className = `nhf-circle-fill${tier === 'high' ? '' : ' ' + tier}`;
  numEl.className    = `nhf-prob-number${tier === 'high' ? '' : ' ' + tier}`;

  // Animate after a short delay (overlay just appeared)
  setTimeout(() => {
    circleEl.style.strokeDashoffset = offset;
    numEl.textContent = displayLoss + '%';
  }, 120);

  // ── Context bars ───────────────────────────────────────────────────────────
  const sessionLossForBar = played > 0 ? Math.round((AG.losses / played) * 100) : Math.round(BJ_BASE_LOSS_PCT);
  document.getElementById('nhf-bar-session').style.width = Math.min(sessionLossForBar, 100) + '%';
  document.getElementById('nhf-val-session').textContent = sessionLossForBar + '%';

  // ── Headline + sub ─────────────────────────────────────────────────────────
  const headlineEl = document.getElementById('nhf-headline');
  const subEl      = document.getElementById('nhf-sub');

  if (displayLoss >= 55) {
    headlineEl.textContent = `${displayLoss}% chance you lose the next hand`;
    subEl.textContent = 'Above the statistical average. Your session pattern leans unfavourable.';
  } else if (displayLoss >= 50) {
    headlineEl.textContent = `${displayLoss}% chance you lose the next hand`;
    subEl.textContent = 'Near the statistical baseline. Slightly more likely to lose than win.';
  } else {
    headlineEl.textContent = `${displayLoss}% chance you lose the next hand`;
    subEl.textContent = 'Below average — but losing is still the most probable single outcome.';
  }

  // ── Dissuasion message ─────────────────────────────────────────────────────
  document.getElementById('nhf-message').innerHTML = getDissuasionMessage(AG);

  // ── Expected loss projection ───────────────────────────────────────────────
  // House edge = 0.5% of total money wagered (not per hand profit/loss)
  // Per hand: bet × 0.005 = expected loss
  // Over N hands: N × bet × 0.005
  const refBet = currentBet > 0 ? currentBet : (AG.lastBet || 10);
  const perHandLoss   = (refBet * 0.005).toFixed(2);           // e.g. $10 bet → $0.05
  const over20Loss    = (refBet * 20 * 0.005).toFixed(2);      // e.g. 20 hands → $1.00
  const over100Loss   = (refBet * 100 * 0.005).toFixed(2);     // e.g. 100 hands → $5.00
  const totalWagered  = AG.totalWagered > 0 ? AG.totalWagered : refBet * AG.hands;
  const expectedTotalLoss = (totalWagered * 0.005).toFixed(2);

  let projText = 'At <strong>$' + refBet + '/hand</strong>: house expects to keep ';
  projText += '<strong>$' + perHandLoss + '</strong> per hand · ';
  projText += '<strong>$' + over20Loss + '</strong> over 20 hands · ';
  projText += '<strong>$' + over100Loss + '</strong> over 100 hands';
  if (AG.totalWagered > 0) {
    projText += ' · Based on $' + AG.totalWagered + ' wagered this session, expected house take: <strong>$' + expectedTotalLoss + '</strong>';
  }
  document.getElementById('nhf-projection').innerHTML = projText;
}
// ── SESSION REPORT ────────────────────────────
function buildReport() {
  const elapsed = Math.floor((Date.now() - AG.sessionStart) / 1000);
  const mm = Math.floor(elapsed / 60), ss = elapsed % 60;
  document.getElementById('r-time').textContent = mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
  document.getElementById('r-hands').textContent = AG.hands;
  document.getElementById('r-wins').textContent = AG.wins;

  const played = AG.wins + AG.losses;
  document.getElementById('r-winrate').textContent =
    played > 0 ? `${Math.round(AG.wins / played * 100)}%` : '—';

  // Debt / profit box
  const box = document.getElementById('r-debt-box');
  const lbl = document.getElementById('r-debt-lbl');
  const amt = document.getElementById('r-debt-amount');

  if (AG.netPL < 0) {
    box.className = 'debt-box';
    lbl.textContent = 'NET LOSS THIS SESSION';
    amt.textContent = `-$${Math.abs(AG.netPL)}`;
  } else if (AG.netPL > 0) {
    box.className = 'debt-box profit';
    lbl.textContent = 'NET PROFIT THIS SESSION';
    amt.textContent = `+$${AG.netPL}`;
  } else {
    box.className = 'debt-box profit';
    lbl.textContent = 'BROKE EVEN';
    amt.textContent = '$0';
  }

  // Could have bought — richer version in report
  const loss = AG.totalLost;
  const buySection = document.getElementById('r-couldbuy');
  const buyList = document.getElementById('r-buy-list');
  buyList.innerHTML = '';

  if (loss >= 3) {
    buySection.style.display = 'block';
    buildCouldHaveBought(loss, buyList, 'big');
  } else {
    buySection.style.display = 'none';
  }
}

// ─── INIT ──────────────────────────────────────
agInit();
setPhase('bet');
updateBetButtons();