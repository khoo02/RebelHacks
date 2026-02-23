// UI helpers for DOM updates and effects
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
  const monsterMaxEl = document.getElementById('monster-hp-max');
  if (monsterMaxEl) monsterMaxEl.textContent = Math.round(state.monsterMaxHP);
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
  if (enabled) {
    document.getElementById('btn-special').disabled = (!state.unlocked?.special || state.specialCharges <= 0);
  }
}

function updateSpecialBtn() {
  const label = document.getElementById('special-charges');
  if (state.unlocked?.special) {
    label.textContent = `(${state.specialCharges} charges left | ${state.coins} coins)`;
  } else {
    label.textContent = `(Locked | ${state.coins} coins)`;
  }
  document.getElementById('btn-special').disabled = (!state.unlocked?.special || state.specialCharges <= 0);
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