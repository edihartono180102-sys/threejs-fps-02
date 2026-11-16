// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// alive counts, kill feed, damage direction, buy menu, round banner and the
// overlays. It never touches the simulation; main.js pushes numbers in and
// reads the play and buy callbacks out. Every setter is cheap and cached, so
// it costs nothing per frame.
const COPY = {
  start: { title: 'DUSTLINE', copy: 'Five on five in the yard. Plant the charge at A or B — or drop every Ember before the clock runs out.', action: 'Click to play' },
  paused: { title: 'DUSTLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  dead: { title: 'You are down', copy: 'Your team fights on. Click to spectate the round.', action: 'Spectate' },
  match: { title: '', copy: '', action: 'Play again' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $('overlay'), title: $('overlay-title'), copy: $('overlay-copy'), play: $('play'),
    keys: $('keys-list'), hud: $('hud'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    vignette: $('vignette'), damageArc: $('damage-arc'),
    health: $('health-value'), healthBar: $('health-fill'), armorBar: $('armor-fill'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), weaponName: $('weapon-name'),
    grenades: $('grenades'), money: $('money'), timer: $('timer'), timerLabel: $('timer-label'),
    scoreV: $('score-v'), scoreE: $('score-e'), aliveV: $('alive-v'), aliveE: $('alive-e'),
    killfeed: $('killfeed'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    buy: $('buy'), buyMoney: $('buy-money'), buyItems: $('buy-items'),
    bomb: $('bomb'), bombTimer: $('bomb-timer'), bombLabel: $('bomb-label'),
    plant: $('plant'), plantFill: $('plant-fill'), plantLabel: $('plant-label'),
    board: $('board'), boardRows: $('board-rows'),
  };
  let last = {};
  let hitTimer = 0;
  let bannerTimer = 0;
  let vignetteTimer = 0;

  function setText(el, key, value) {
    if (last[key] !== value) {
      last[key] = value;
      el.textContent = value;
    }
  }

  return {
    setHealth(hp, armor) {
      setText(els.health, 'hp', String(Math.ceil(hp)));
      const pct = Math.max(0, hp);
      if (last.hppct !== pct) {
        last.hppct = pct;
        els.healthBar.style.width = `${pct}%`;
        els.healthBar.style.background = pct > 50 ? 'var(--accent)' : pct > 25 ? '#e07b39' : '#d2542e';
      }
      const apct = Math.max(0, armor);
      if (last.apct !== apct) {
        last.apct = apct;
        els.armorBar.style.width = `${apct * 2}%`;
      }
    },
    setAmmo(mag, reserve, weapon, grenades) {
      setText(els.ammoMag, 'mag', String(mag));
      setText(els.ammoReserve, 'res', `/ ${reserve}`);
      setText(els.weaponName, 'wpn', weapon);
      setText(els.grenades, 'gr', grenades > 0 ? `◉ ${grenades}` : '');
    },
    setMoney(n) {
      setText(els.money, 'money', `$${n}`);
      setText(els.buyMoney, 'bmoney', `$${n}`);
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(els.timer, 'timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      setText(els.timerLabel, 'tlabel', phase === 'buy' ? 'BUY' : phase === 'live' ? 'ROUND' : '');
    },
    setScore(v, e) {
      setText(els.scoreV, 'sv', String(v));
      setText(els.scoreE, 'se', String(e));
    },
    setAlive(v, e) {
      setText(els.aliveV, 'av', '●'.repeat(v) + '○'.repeat(5 - v));
      setText(els.aliveE, 'ae', '●'.repeat(e) + '○'.repeat(5 - e));
    },
    setSpread(gapPx) {
      els.crosshair.style.setProperty('--gap', `${gapPx.toFixed(1)}px`);
    },
    hitMarker(killed) {
      els.hitmarker.classList.add('on');
      els.hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        els.hitmarker.classList.remove('on');
        els.hitmarker.style.transform = '';
      }, killed ? 220 : 90);
    },
    damageFrom(angleDeg) {
      els.damageArc.style.transform = `translate(-50%, -50%) rotate(${angleDeg.toFixed(0)}deg)`;
      els.damageArc.classList.add('on');
      els.vignette.classList.add('on');
      clearTimeout(vignetteTimer);
      vignetteTimer = setTimeout(() => {
        els.damageArc.classList.remove('on');
        els.vignette.classList.remove('on');
      }, 450);
    },
    killfeed(killer, victim, headshot) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      row.innerHTML = `<b class="${killer.team}">${killer.name}</b> ${headshot ? '◉' : '—'} <b class="${victim.team}">${victim.name}</b>`;
      els.killfeed.prepend(row);
      while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 6000);
    },
    banner(title, sub = '') {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub;
      els.banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => els.banner.classList.remove('on'), 2600);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      els.banner.classList.remove('on');
    },
    setBomb(planted, timer, site) {
      if (planted) {
        els.bomb.hidden = false;
        setText(els.bombTimer, 'bt', `${timer.toFixed(1)}`);
        setText(els.bombLabel, 'bl', `CHARGE AT ${site}`);
      } else {
        els.bomb.hidden = true;
      }
    },
    setPlant(progress, label) {
      if (progress > 0) {
        els.plant.hidden = false;
        els.plantFill.style.width = `${Math.round(progress * 100)}%`;
        setText(els.plantLabel, 'pl', label);
      } else {
        els.plant.hidden = true;
      }
    },
    // Buy menu: rows are built once; buying is a click or a number key.
    buildBuy(items, onBuy) {
      els.buyItems.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
        row.addEventListener('click', () => onBuy(item.id));
        els.buyItems.appendChild(row);
      }
    },
    showBuy(show) {
      els.buy.hidden = !show;
    },
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      if (mode === 'match') {
        els.title.textContent = data.title;
        els.copy.textContent = data.copy;
        els.board.hidden = false;
        els.boardRows.innerHTML = data.rows.map((r) => `<div class="board-row"><b class="${r.team}">${r.name}</b><span>${r.kills} kills</span><span>${r.deaths} deaths</span></div>`).join('');
      } else {
        els.board.hidden = true;
        els.title.textContent = text.title;
        els.copy.textContent = mode === 'dead' ? text.copy : text.copy;
        if (mode === 'start') els.keys.hidden = false;
        else els.keys.hidden = true;
      }
      els.play.textContent = text.action;
      els.overlay.hidden = false;
      els.play.focus();
    },
    hideOverlay() {
      els.overlay.hidden = true;
    },
    onPlay(handler) {
      els.play.addEventListener('click', handler);
    },
  };
}
