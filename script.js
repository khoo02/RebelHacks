// State
let balance = 100;
let totalDeposited = 100;
let bet = 0;
let deck = [];
let playerHand = [];
let dealerHand = [];
let gameActive = false;
let handsWon = 0;
let handsLost = 0;
let biggestWin = 0;
let biggestLoss = 0;
let netPL = 0;

// Deck
const suits = ['♠','♣','♥','♦'];
const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function buildDeck() {
  deck = [];
  for (let s of suits) for (let v of values) deck.push({s, v});
  // 4 decks
  deck = [...deck,...deck,...deck,...deck];
  for (let i = deck.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [deck[i],deck[j]] = [deck[j],deck[i]];
  }
}

function drawCard() { return deck.pop(); }

function cardValue(card) {
  if (['J','Q','K'].includes(card.v)) return 10;
  if (card.v === 'A') return 11;
  return parseInt(card.v);
}

function handTotal(hand) {
  let total = 0, aces = 0;
  for (let c of hand) {
    total += cardValue(c);
    if (c.v === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isRed(card) { return card.s === '♥' || card.s === '♦'; }

function renderCard(card, hidden=false) {
  const div = document.createElement('div');
  div.className = 'card' + (hidden ? ' hidden' : (isRed(card) ? ' red-card' : ' black-card'));
  if (!hidden) {
    div.innerHTML = `<div class="card-top"><span>${card.v}</span><span>${card.s}</span></div><div class="card-center">${card.s}</div><div class="card-bottom"><span>${card.v}</span><span>${card.s}</span></div>`;
  }
  return div;
}

function renderHands(hideDealer=false) {
  const dc = document.getElementById('dealerCards');
  const pc = document.getElementById('playerCards');
  dc.innerHTML = ''; pc.innerHTML = '';

  dealerHand.forEach((c,i) => dc.appendChild(renderCard(c, hideDealer && i===1)));
  playerHand.forEach(c => pc.appendChild(renderCard(c)));

  document.getElementById('playerScore').textContent = handTotal(playerHand);
  document.getElementById('dealerScore').textContent = hideDealer
    ? cardValue(dealerHand[0])
    : handTotal(dealerHand);
}

function setMessage(text, cls='') {
  const el = document.getElementById('messageText');
  el.textContent = text;
  el.className = 'message-text ' + cls;
}

function updateUI() {
  const bal = balance;
  const balEl = document.getElementById('balanceDisplay');
  balEl.textContent = '$' + bal.toLocaleString();
  balEl.className = 'stat-value' + (bal < 0 ? ' negative' : '');
  document.getElementById('balanceBox').className = 'stat-box' + (bal < 0 ? ' debt' : '');

  document.getElementById('totalDepositedDisplay').textContent = '$' + totalDeposited.toLocaleString();

  const netLoss = balance - totalDeposited;
  const nlEl = document.getElementById('netLossDisplay');
  nlEl.textContent = (netLoss >= 0 ? '+$' : '-$') + Math.abs(netLoss).toLocaleString();
  nlEl.className = 'stat-value' + (netLoss < 0 ? ' negative' : '');

  document.getElementById('currentBetDisplay').textContent = 'Bet: $' + bet;

  // Dim chips player can't afford
  const chipMap = {chip5:5, chip10:10, chip25:25, chip50:50, chip100:100};
  Object.entries(chipMap).forEach(([id, val]) => {
    const chip = document.getElementById(id);
    const canAfford = (bet + val) <= bal;
    chip.style.opacity = (!gameActive && !canAfford) ? '0.25' : '';
    chip.style.pointerEvents = (!gameActive && !canAfford) ? 'none' : '';
  });

  // Broke / debt warning
  const dw = document.getElementById('debtWarning');
  if (bal <= 0) {
    dw.className = 'debt-warning show';
    document.getElementById('debtText').textContent =
      bal < 0
        ? `You owe $${Math.abs(bal).toLocaleString()}. Betting borrowed money is one of the most common warning signs of gambling addiction.`
        : `You're out of money. In a real casino, you'd need to deposit more to keep playing — or walk away.`;
  } else {
    dw.className = 'debt-warning';
  }

  // Stats
  const total = handsWon + handsLost;
  document.getElementById('handsWon').textContent = handsWon;
  document.getElementById('handsLost').textContent = handsLost;
  document.getElementById('winRate').textContent = total ? Math.round(handsWon/total*100)+'%' : '—';
  document.getElementById('biggestWin').textContent = '$' + biggestWin;
  document.getElementById('biggestLoss').textContent = '$' + biggestLoss;
  const np = document.getElementById('netPL');
  np.textContent = (netPL >= 0 ? '+$' : '-$') + Math.abs(netPL).toLocaleString();
  np.className = 'loss-stat-val' + (netPL < 0 ? ' bad' : netPL > 0 ? ' good' : '');
}

function setChipsDisabled(dis) {
  ['chip5','chip10','chip25','chip50','chip100'].forEach(id => {
    document.getElementById(id).style.pointerEvents = dis ? 'none' : 'auto';
    document.getElementById(id).style.opacity = dis ? '0.3' : '1';
  });
}

function addBet(amt) {
  if (gameActive) return;
  if (bet + amt > balance) {
    // Flash a warning
    const el = document.getElementById('currentBetDisplay');
    el.style.color = '#ff3d3d';
    el.textContent = "Not enough funds!";
    setTimeout(() => {
      el.style.color = '';
      updateUI();
    }, 1200);
    return;
  }
  bet += amt;
  updateUI();
}

function clearBet() {
  if (gameActive) return;
  bet = 0;
  updateUI();
}

function deal() {
  if (balance <= 0) { setMessage("You're out of money — deposit to continue."); openDeposit(true); return; }
  if (bet <= 0) { setMessage('Place a bet first!'); return; }
  if (deck.length < 20) buildDeck();

  gameActive = true;
  playerHand = [drawCard(), drawCard()];
  dealerHand = [drawCard(), drawCard()];

  setChipsDisabled(true);
  document.getElementById('dealBtn').disabled = true;
  document.getElementById('hitBtn').disabled = false;
  document.getElementById('standBtn').disabled = false;
  document.getElementById('clearBetBtn').disabled = true;

  renderHands(true);
  setMessage('');

  const pt = handTotal(playerHand);
  const dt = handTotal(dealerHand);

  if (pt === 21 && dt === 21) { endGame('push'); return; }
  if (pt === 21) { endGame('blackjack'); return; }
  if (dt === 21) { endGame('lose'); return; }

  updateUI();
}

function hit() {
  playerHand.push(drawCard());
  renderHands(true);
  const total = handTotal(playerHand);
  if (total > 21) { endGame('bust'); }
  else if (total === 21) { stand(); }
}

function stand() {
  document.getElementById('hitBtn').disabled = true;
  document.getElementById('standBtn').disabled = true;

  // Dealer draws
  while (handTotal(dealerHand) < 17) dealerHand.push(drawCard());

  renderHands(false);

  const pt = handTotal(playerHand);
  const dt = handTotal(dealerHand);

  if (dt > 21 || pt > dt) endGame('win');
  else if (pt === dt) endGame('push');
  else endGame('lose');
}

function endGame(result) {
  gameActive = false;
  document.getElementById('hitBtn').disabled = true;
  document.getElementById('standBtn').disabled = true;
  document.getElementById('dealBtn').disabled = false;
  document.getElementById('clearBetBtn').disabled = false;
  setChipsDisabled(false);
  renderHands(false);

  let winAmount = 0;

  if (result === 'blackjack') {
    winAmount = Math.floor(bet * 1.5);
    balance += winAmount;
    netPL += winAmount;
    handsWon++;
    if (winAmount > biggestWin) biggestWin = winAmount;
    setMessage('Blackjack! +$' + winAmount, 'blackjack');
  } else if (result === 'win') {
    winAmount = bet;
    balance += winAmount;
    netPL += winAmount;
    handsWon++;
    if (winAmount > biggestWin) biggestWin = winAmount;
    setMessage('You Win! +$' + winAmount, 'win');
  } else if (result === 'push') {
    setMessage('Push — Bet Returned', 'push');
  } else if (result === 'bust') {
    balance -= bet;
    netPL -= bet;
    handsLost++;
    if (bet > biggestLoss) biggestLoss = bet;
    setMessage('Bust! -$' + bet, 'bust');
    if (balance <= 0) setTimeout(() => { setMessage("Out of funds — deposit to keep playing."); openDeposit(true); }, 1200);
  } else {
    balance -= bet;
    netPL -= bet;
    handsLost++;
    if (bet > biggestLoss) biggestLoss = bet;
    setMessage('Dealer Wins. -$' + bet, 'lose');
    if (balance <= 0) setTimeout(() => { setMessage("Out of funds — deposit to keep playing."); openDeposit(true); }, 1200);
  }

  bet = 0;
  updateUI();
}

// What you could have bought data
const purchases = [
  { emoji:'🍕', name:'Pizza nights', unit:15 },
  { emoji:'☕', name:'Coffees', unit:6 },
  { emoji:'🎬', name:'Movie tickets', unit:14 },
  { emoji:'📚', name:'Books', unit:18 },
  { emoji:'🎮', name:'Video games', unit:60 },
  { emoji:'👟', name:'Pairs of shoes', unit:80 },
  { emoji:'✈️', name:'Flights (budget)', unit:150 },
  { emoji:'🎸', name:'Guitar lessons', unit:50 },
  { emoji:'🏋️', name:'Gym months', unit:40 },
  { emoji:'🎁', name:'Birthday gifts', unit:35 },
  { emoji:'🛒', name:'Grocery runs', unit:100 },
  { emoji:'🍣', name:'Sushi dinners', unit:45 },
  { emoji:'🎧', name:'Months of Spotify', unit:11 },
  { emoji:'💊', name:'Therapy sessions', unit:120 },
  { emoji:'🚗', name:'Tank of gas', unit:55 },
  { emoji:'🧾', name:'Utility bills', unit:90 },
  { emoji:'👕', name:'New outfits', unit:40 },
  { emoji:'🎟️', name:'Concert tickets', unit:75 },
];

function getCouldHaveBought(amount) {
  if (amount <= 0) return [];
  const affordable = purchases.filter(p => p.unit <= amount);
  if (affordable.length === 0) return [];
  // Pick 3 varied items
  const picked = [];
  const shuffled = [...affordable].sort(() => Math.random() - 0.5);
  for (const item of shuffled) {
    if (picked.length >= 3) break;
    const qty = Math.floor(amount / item.unit);
    if (qty >= 1) picked.push({ ...item, qty });
  }
  return picked;
}

function openDeposit(brokeTrigger = false) {
  const lostAmount = totalDeposited - Math.max(balance, 0);

  // Toggle broke vs normal header
  document.getElementById('modalBrokeHeader').style.display = brokeTrigger ? 'block' : 'none';
  document.getElementById('modalNormalHeader').style.display = brokeTrigger ? 'none' : 'block';
  document.getElementById('leaveBtn').style.display = brokeTrigger ? 'block' : 'none';
  document.getElementById('modalCancelBtn').textContent = brokeTrigger ? 'Continue Playing' : 'Cancel';

  // Could have bought section
  const chbSection = document.getElementById('couldHaveBought');
  if (lostAmount >= 15) {
    document.getElementById('lostAmountLabel').textContent = lostAmount.toLocaleString();
    const items = getCouldHaveBought(lostAmount);
    const container = document.getElementById('purchaseItems');
    container.innerHTML = items.map(i => `
      <div style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.04); border-radius:8px; padding:9px 12px; border:1px solid rgba(255,255,255,0.06);">
        <span style="font-size:1.4rem;">${i.emoji}</span>
        <div>
          <div style="font-size:0.9rem; font-weight:700; color:rgba(232,220,200,0.85);">${i.qty} ${i.name}</div>
          <div style="font-size:0.65rem; color:rgba(232,220,200,0.35);">$${i.unit} each × ${i.qty} = $${(i.unit * i.qty).toLocaleString()}</div>
        </div>
      </div>
    `).join('');
    chbSection.style.display = items.length ? 'block' : 'none';
  } else {
    chbSection.style.display = 'none';
  }

  document.getElementById('depositModal').className = 'modal-overlay active';
}

function closeDeposit() {
  document.getElementById('depositModal').className = 'modal-overlay';
}

function deposit(amount) {
  balance += amount;
  totalDeposited += amount;
  closeDeposit();
  updateUI();
  setMessage('Deposited $' + amount.toLocaleString(), 'push');
  setTimeout(() => { if (!gameActive) setMessage('Place your bet to begin'); }, 1500);
}

function leaveCasino() {
  closeDeposit();
  // Populate summary screen
  document.getElementById('summaryDeposited').textContent = '$' + totalDeposited.toLocaleString();
  document.getElementById('summaryBalance').textContent = '$' + Math.max(balance, 0).toLocaleString();
  document.getElementById('summaryWon').textContent = handsWon;
  document.getElementById('summaryLost').textContent = handsLost;

  const lostAmount = totalDeposited - Math.max(balance, 0);
  const items = getCouldHaveBought(lostAmount);
  document.getElementById('summaryCouldHave').innerHTML = items.length
    ? items.map(i => `${i.emoji} <strong style="color:rgba(232,220,200,0.8)">${i.qty} ${i.name}</strong>`).join('&nbsp;&nbsp;·&nbsp;&nbsp;')
    : 'Nothing lost yet — great decision to walk away.';

  document.getElementById('leftCasinoScreen').className = 'modal-overlay active';
}

function resetGame() {
  balance = 100; totalDeposited = 100; bet = 0;
  playerHand = []; dealerHand = [];
  gameActive = false; handsWon = 0; handsLost = 0;
  biggestWin = 0; biggestLoss = 0; netPL = 0;
  document.getElementById('leftCasinoScreen').className = 'modal-overlay';
  document.getElementById('dealerCards').innerHTML = '';
  document.getElementById('playerCards').innerHTML = '';
  document.getElementById('dealerScore').textContent = '';
  document.getElementById('playerScore').textContent = '';
  document.getElementById('hitBtn').disabled = true;
  document.getElementById('standBtn').disabled = true;
  document.getElementById('dealBtn').disabled = false;
  buildDeck();
  updateUI();
  setMessage('Place your bet to begin');
}

// Init
buildDeck();
updateUI();
setMessage('Place your bet to begin');