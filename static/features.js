function obtainDamageBoostPassive() {
    const roundsSurvived = typeof state.roundsSurvived === "number"
        ? state.roundsSurvived
        : Math.max((state.round || 1) - 1, 0);
    const boostAmount = Math.min(0.2 * Math.min(roundsSurvived, 5), 1.0);
    state.damageBoost = boostAmount;
    state.passiveBoosts = state.passiveBoosts || [];
    state.passiveBoosts.push({
        type: "damageBoost",
        amount: boostAmount
    });
    setLog(`Damage boost passive obtained! +${(boostAmount * 100).toFixed(0)}% damage.`);
}

function tryGrantRandomPassiveAfterBattle() {
    const passiveChance = 0.3; // 30% chance to obtain a passive
    if (Math.random() < passiveChance) {
        obtainDamageBoostPassive();
    }
}

function getTotalDamageBoost() {
    if (!state.passiveBoosts) return 0;
    return state.passiveBoosts
        .filter(b => b.type === "damageBoost")
        .reduce((sum, b) => sum + b.amount, 0);
}

// implement a shop menu that appears after every 3 battles, allowing the player to spend coins on upgrades/healing and the damage boost passive. The shop should have a simple UI and update the player's stats accordingly.

function openShop() {
    const shopEl = document.getElementById('shop-menu');
    shopEl.style.display = 'block';
    document.getElementById('shop-coins').textContent = `Coins: ${state.coins}`;
    // Update shop options based on unlocked abilities and current stats
    document.getElementById('shop-heal').disabled = (state.playerHP >= 100);
    document.getElementById('shop-damage-boost').disabled = state.unlocked?.damageBoost || state.coins < 50;
}

function closeShop() {
    document.getElementById('shop-menu').style.display = 'none';
}

function buyHeal() {
    if (state.coins >= 20 && state.playerHP < 100) {
        state.coins -= 20;
        state.playerHP = Math.min(100, state.playerHP + 30);
        updateHP();
        document.getElementById('shop-coins').textContent = `Coins: ${state.coins}`;
    }
}

function buyDamageBoost() {
    if (state.coins >= 50 && !state.unlocked?.damageBoost) {
        state.coins -= 50;
        state.unlocked = state.unlocked || {};
        state.unlocked.damageBoost = true;
        setLog('Damage Boost passive unlocked! +20% damage on all attacks.');
        document.getElementById('shop-coins').textContent = `Coins: ${state.coins}`;
        document.getElementById('shop-damage-boost').disabled = true;
    }      
}
