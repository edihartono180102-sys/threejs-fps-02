// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// alive counts, kill feed, damage direction, buy menu, round banner and the
// overlays. It never touches the simulation; main.js pushes numbers in and
// reads the play and buy callbacks out. Every setter is cheap and cached,
// so it costs nothing per frame. When the magazine runs low the ammo
// number turns ember, so a glance says reload before the click does.
const COPY = {
  start: { title: 'DUSTLINE', copy: 'Five on five in the yard. Plant the charge at A or B — or drop every Ember before the clock runs out.', action: 'Click to play' },
  paused: { title: 'DUSTLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  dead: { title: 'You are down', copy: 'Your team fights on. Click to spectate the round.', action: 'Spectate' },
  match: { title: '', copy: '', action: 'Play again' },
};

// [handle, element id] — one table instead of a long literal, so a missing
// id fails in one place with a clear name.
const ELEMENTS = [
  ['overlay', 'overlay'], ['title', 'overlay-title'], ['copy', 'overlay-copy'], ['play', 'play'],
  ['keys', 'keys-list'], ['hud', 'hud'], ['crosshair', 'crosshair'], ['hitmarker', 'hitmarker'],
  ['vignette', 'vignette'], ['damageArc', 'damage-arc'],
  ['health', 'health-value'], ['healthBar', 'health-fill'], ['armorBar', 'armor-fill'],
  ['ammoMag', 'ammo-mag'], ['ammoReserve', 'ammo-reserve'], ['weaponName', 'weapon-name'],
  ['grenades', 'grenades'], ['money', 'money'], ['timer', 'timer'], ['timerLabel', 'timer-label'],
  ['scoreV', 'score-v'], ['scoreE', 'score-e'], ['aliveV', 'alive-v'], ['aliveE', 'alive-e'],
  ['killfeed', 'killfeed'], ['banner', 'banner'], ['bannerTitle', 'banner-title'], ['bannerSub', 'banner-sub'],
  ['buy', 'buy'], ['buyMoney', 'buy-money'], ['buyItems', 'buy-items'],
  ['bomb', 'bomb'], ['bombTimer', 'bomb-timer'], ['bombLabel', 'bomb-label'],
  ['plant', 'plant'], ['plantFill', 'plant-fill'], ['plantLabel', 'plant-label'],
  ['board', 'board'], ['boardRows', 'board-rows'],
];

export function createHud() {
  const el = {};
  for (const [handle, id] of ELEMENTS) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`DUSTLINE HUD is missing #${id}`);
    el[handle] = node;
  }
  const seen = new Map(); // last text per key: writing the same string twice is free
  let hitTimer = 0;
  let bannerTimer = 0;
  let vignetteTimer = 0;

  function text(node, key, value) {
    if (seen.get(key) !== value) {
      seen.set(key, value);
      node.textContent = value;
    }
  }
  function dots(alive) {
    return '●'.repeat(alive) + '○'.repeat(5 - alive);
  }

  return {
    setHealth(hp, armor) {
      text(el.health, 'hp', String(Math.ceil(hp)));
      const hpPct = Math.max(0, hp);
      if (seen.get('hppct') !== hpPct) {
        seen.set('hppct', hpPct);
        el.healthBar.style.width = `${hpPct}%`;
        el.healthBar.style.background = hpPct > 50 ? 'var(--accent)' : hpPct > 25 ? '#e07b39' : '#d2542e';
      }
      const apPct = Math.max(0, armor);
      if (seen.get('apct') !== apPct) {
        seen.set('apct', apPct);
        el.armorBar.style.width = `${apPct * 2}%`;
      }
    },
    setAmmo(mag, reserve, weapon, grenades) {
      text(el.ammoMag, 'mag', String(mag));
      text(el.ammoReserve, 'res', `/ ${reserve}`);
      text(el.weaponName, 'wpn', weapon);
      text(el.grenades, 'gr', grenades > 0 ? `◉ ${grenades}` : '');
      // A nearly dry magazine turns ember: reload before the click.
      const low = mag > 0 && mag <= 6;
      el.ammoMag.style.color = mag === 0 || low ? 'var(--ember)' : '';
    },
    setMoney(n) {
      text(el.money, 'money', `$${n}`);
      text(el.buyMoney, 'bmoney', `$${n}`);
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      text(el.timer, 'timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      text(el.timerLabel, 'tlabel', phase === 'buy' ? 'BUY' : phase === 'live' ? 'ROUND' : '');
    },
    setScore(v, e) {
      text(el.scoreV, 'sv', String(v));
      text(el.scoreE, 'se', String(e));
    },
    setAlive(v, e) {
      text(el.aliveV, 'av', dots(v));
      text(el.aliveE, 'ae', dots(e));
    },
    setSpread(gapPx) {
      el.crosshair.style.setProperty('--gap', `${gapPx.toFixed(1)}px`);
    },
    hitMarker(killed) {
      el.hitmarker.classList.add('on');
      el.hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        el.hitmarker.classList.remove('on');
        el.hitmarker.style.transform = '';
      }, killed ? 220 : 90);
    },
    damageFrom(angleDeg) {
      el.damageArc.style.transform = `translate(-50%, -50%) rotate(${angleDeg.toFixed(0)}deg)`;
      el.damageArc.classList.add('on');
      el.vignette.classList.add('on');
      clearTimeout(vignetteTimer);
      vignetteTimer = setTimeout(() => {
        el.damageArc.classList.remove('on');
        el.vignette.classList.remove('on');
      }, 450);
    },
    killfeed(killer, victim, headshot) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      const killerName = document.createElement('b');
      killerName.className = killer.team;
      killerName.textContent = killer.name;
      const victimName = document.createElement('b');
      victimName.className = victim.team;
      victimName.textContent = victim.name;
      row.append(killerName, document.createTextNode(headshot ? ' ◉ ' : ' — '), victimName);
      el.killfeed.prepend(row);
      while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 6000);
    },
    banner(title, sub = '') {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub;
      el.banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => el.banner.classList.remove('on'), 2600);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      el.banner.classList.remove('on');
    },
    setBomb(planted, timer, site) {
      if (planted) {
        el.bomb.hidden = false;
        text(el.bombTimer, 'bt', `${timer.toFixed(1)}`);
        text(el.bombLabel, 'bl', `CHARGE AT ${site}`);
      } else {
        el.bomb.hidden = true;
      }
    },
    setPlant(progress, label) {
      if (progress > 0) {
        el.plant.hidden = false;
        el.plantFill.style.width = `${Math.round(progress * 100)}%`;
        text(el.plantLabel, 'pl', label);
      } else {
        el.plant.hidden = true;
      }
    },
    // Buy menu: rows are built once; buying is a click or a number key.
    buildBuy(items, onBuy) {
      el.buyItems.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        const key = document.createElement('span');
        key.className = 'buy-key';
        key.textContent = item.key;
        const name = document.createElement('span');
        name.className = 'buy-name';
        name.textContent = item.name;
        const desc = document.createElement('span');
        desc.className = 'buy-desc';
        desc.textContent = item.desc;
        const price = document.createElement('span');
        price.className = 'buy-price';
        price.textContent = `$${item.price}`;
        row.append(key, name, desc, price);
        row.addEventListener('click', () => onBuy(item.id));
        el.buyItems.appendChild(row);
      }
    },
    showBuy(show) {
      el.buy.hidden = !show;
    },
    showOverlay(mode, data = {}) {
      const copy = COPY[mode];
      if (mode === 'match') {
        el.title.textContent = data.title;
        el.copy.textContent = data.copy;
        el.board.hidden = false;
        el.boardRows.innerHTML = '';
        for (const r of data.rows) {
          const row = document.createElement('div');
          row.className = 'board-row';
          const name = document.createElement('b');
          name.className = r.team;
          name.textContent = r.name;
          const kills = document.createElement('span');
          kills.textContent = `${r.kills} kills`;
          const deaths = document.createElement('span');
          deaths.textContent = `${r.deaths} deaths`;
          row.append(name, kills, deaths);
          el.boardRows.appendChild(row);
        }
      } else {
        el.board.hidden = true;
        el.title.textContent = copy.title;
        el.copy.textContent = copy.copy;
        el.keys.hidden = mode !== 'start';
      }
      el.play.textContent = copy.action;
      el.overlay.hidden = false;
      el.play.focus();
    },
    hideOverlay() {
      el.overlay.hidden = true;
    },
    onPlay(handler) {
      el.play.addEventListener('click', handler);
    },
  };
}
