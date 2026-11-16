// The HUD of Emberworks: every DOM readout the player sees — health, armour,
// ammunition, money, round timer, team score, kill feed, buy menu, minimap,
// banners and overlays. It only touches the DOM when a value changes, and the
// minimap redraws on a small canvas from positions the match hands it.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    health: $('health-value'),
    healthBar: $('health-bar'),
    armor: $('armor-value'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    ammo: $('ammo'),
    weaponName: $('weapon-name'),
    money: $('money-value'),
    timer: $('timer-value'),
    timerBox: $('timer'),
    scoreEmber: $('score-ember'),
    scoreWarden: $('score-warden'),
    roundLabel: $('round-label'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    damage: $('damage-vignette'),
    plantBar: $('plant-bar'),
    plantFill: $('plant-fill'),
    plantLabel: $('plant-label'),
    buy: $('buy-menu'),
    buyMoney: $('buy-money'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    overlayScore: $('overlay-score'),
    play: $('play'),
    minimap: $('minimap'),
  };
  const mapCtx = el.minimap.getContext('2d');
  const cache = {};
  let hitTimer = null;
  let bannerTimer = null;

  function setText(node, value) {
    if (!node) return;
    if (cache[node.id] !== value) {
      cache[node.id] = value;
      node.textContent = value;
    }
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    onPlay(callback) {
      el.play.addEventListener('click', callback);
    },
    setAmmo(mag, reserve, name) {
      setText(el.ammoMag, String(mag));
      setText(el.ammoReserve, `/ ${reserve}`);
      setText(el.weaponName, name);
      el.ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(health, armor) {
      setText(el.health, String(Math.ceil(health)));
      setText(el.armor, armor > 0 ? `ARMOR ${Math.ceil(armor)}` : '');
      el.healthBar.style.width = `${Math.max(0, health)}%`;
      el.healthBar.classList.toggle('low', health <= 30);
    },
    setMoney(money) {
      setText(el.money, `$${money}`);
      setText(el.buyMoney, `$${money}`);
    },
    setTimer(seconds, phase) {
      setText(el.timer, formatTime(seconds));
      el.timerBox.classList.toggle('freeze', phase === 'freeze');
      el.timerBox.classList.toggle('planted', phase === 'planted');
    },
    setScore(ember, warden, round) {
      setText(el.scoreEmber, String(ember));
      setText(el.scoreWarden, String(warden));
      setText(el.roundLabel, `ROUND ${round}`);
    },
    setCrosshair(spreadPx) {
      el.crosshair.style.setProperty('--gap', `${spreadPx.toFixed(1)}px`);
    },
    hitMarker(kill) {
      el.hitmarker.classList.add('on');
      el.hitmarker.classList.toggle('kill', kill);
      if (hitTimer) clearTimeout(hitTimer);
      hitTimer = setTimeout(() => el.hitmarker.classList.remove('on', 'kill'), kill ? 220 : 120);
    },
    damageFlash() {
      el.damage.classList.add('on');
      setTimeout(() => el.damage.classList.remove('on'), 180);
    },
    killfeed(killer, victim, headshot, killerTeam) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      const killerSpan = document.createElement('b');
      killerSpan.className = killerTeam === 'ember' ? 'team-ember' : 'team-warden';
      killerSpan.textContent = killer;
      const victimSpan = document.createElement('b');
      victimSpan.className = victim === 'YOU' ? 'team-you' : '';
      victimSpan.textContent = victim;
      row.append(killerSpan, document.createTextNode(headshot ? '  ◉  ' : '  —  '), victimSpan);
      el.killfeed.prepend(row);
      while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 6000);
    },
    banner(title, sub, ms = 2600) {
      setText(el.bannerTitle, title);
      setText(el.bannerSub, sub);
      el.banner.classList.add('show');
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => el.banner.classList.remove('show'), ms);
    },
    hideBanner() {
      el.banner.classList.remove('show');
    },
    plantProgress(label, fraction) {
      if (fraction === null) {
        el.plantBar.hidden = true;
        return;
      }
      el.plantBar.hidden = false;
      setText(el.plantLabel, label);
      el.plantFill.style.width = `${Math.round(fraction * 100)}%`;
    },
    showBuy(items, money) {
      el.buy.hidden = false;
      this.setMoney(money);
      const list = $('buy-list');
      list.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('div');
        row.className = `buy-row${item.owned ? ' owned' : ''}${item.affordable ? '' : ' poor'}`;
        const key = document.createElement('kbd');
        key.textContent = item.key;
        const name = document.createElement('span');
        name.className = 'buy-name';
        name.textContent = item.name;
        const price = document.createElement('span');
        price.className = 'buy-price';
        price.textContent = item.owned ? 'OWNED' : `$${item.price}`;
        row.append(key, name, price);
        list.append(row);
      }
    },
    hideBuy() {
      el.buy.hidden = true;
    },
    showOverlay(kind, scoreText) {
      el.overlay.hidden = false;
      if (kind === 'start') {
        setText(el.overlayTitle, 'EMBERWORKS');
        setText(el.overlayCopy, 'Foundry Yard — plant the charge at Furnace Hall or the Silo Yard, or eliminate the Wardens. First to 5 rounds takes the match.');
        setText(el.overlayScore, scoreText || '');
        el.play.textContent = 'Click to play';
      } else if (kind === 'paused') {
        setText(el.overlayTitle, 'PAUSED');
        setText(el.overlayCopy, 'Click to keep playing. Buy menu: B. Grenade: G.');
        setText(el.overlayScore, scoreText || '');
        el.play.textContent = 'Resume';
      } else if (kind === 'dead') {
        setText(el.overlayTitle, 'YOU ARE DOWN');
        setText(el.overlayCopy, 'Spectating a teammate — the round plays on without you.');
        setText(el.overlayScore, scoreText || '');
        el.play.textContent = 'Spectate';
      } else if (kind === 'end') {
        setText(el.overlayTitle, 'ROUND OVER');
        setText(el.overlayCopy, scoreText || '');
        setText(el.overlayScore, '');
        el.play.textContent = 'Next round';
      } else if (kind === 'match') {
        setText(el.overlayTitle, 'MATCH OVER');
        setText(el.overlayCopy, scoreText || '');
        setText(el.overlayScore, '');
        el.play.textContent = 'Play again';
      }
    },
    hideOverlay() {
      el.overlay.hidden = true;
    },
    overlayVisible() {
      return !el.overlay.hidden;
    },
    drawMinimap(map, playerPos, playerYaw, allies, enemies, bomb) {
      const ctx = mapCtx;
      const W = el.minimap.width;
      const H = el.minimap.height;
      const toX = (x) => ((x + 31) / 62) * W;
      const toZ = (z) => ((z + 23) / 46) * H;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(20,22,26,0.85)';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#2c323a';
      ctx.lineWidth = 1;
      for (const c of map.colliders) {
        if (c.h < 1) continue;
        ctx.fillStyle = '#3a3e44';
        ctx.fillRect(toX(c.x0), toZ(c.z0), toX(c.x1) - toX(c.x0), toZ(c.z1) - toZ(c.z0));
      }
      for (const site of Object.values(map.sites)) {
        ctx.fillStyle = '#f0a830';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(site.key, toX(site.x) - 4, toZ(site.z) + 4);
        ctx.strokeStyle = 'rgba(240,168,48,0.7)';
        ctx.beginPath();
        ctx.arc(toX(site.x), toZ(site.z), 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (bomb && bomb.planted) {
        ctx.fillStyle = '#ff4d2e';
        ctx.beginPath();
        ctx.arc(toX(bomb.x), toZ(bomb.z), 5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const ally of allies) {
        ctx.fillStyle = '#ff8c2e';
        ctx.beginPath();
        ctx.arc(toX(ally.x), toZ(ally.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const enemy of enemies) {
        ctx.fillStyle = '#e5484d';
        ctx.beginPath();
        ctx.arc(toX(enemy.x), toZ(enemy.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Player arrow.
      ctx.save();
      ctx.translate(toX(playerPos.x), toZ(playerPos.z));
      ctx.rotate(Math.atan2(-Math.sin(playerYaw), -Math.cos(playerYaw)) + Math.PI / 2);
      ctx.fillStyle = '#e9e6df';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}
