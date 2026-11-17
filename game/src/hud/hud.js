// The in-game HUD: wanted stars, money, weapon and ammo, health and armour bars, the circular
// minimap with its district name, the speedometer and radio station in a car, the objective line,
// a mission timer, notifications, dialogue subtitles with speaker names, the interact prompt, the
// crosshair, district title cards, screen fades and the big ARRESTED / HOSPITALIZED cards.
export function createHud(ui, minimap) {
  const el = (tag, id, parent, className) => {
    const node = document.createElement(tag);
    if (id) node.id = id;
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  };
  const hud = el('div', 'hud', ui);
  const topRight = el('div', 'hud-topright', hud);
  const stars = el('div', 'stars', topRight, 'shadowed');
  const wantedBanner = el('div', 'wantedbanner', topRight, 'shadowed hidden');
  const money = el('div', 'money', topRight, 'shadowed');
  const weapon = el('div', 'weapon', topRight, 'shadowed');
  const bottomLeft = el('div', 'hud-bottomleft', hud);
  const bars = el('div', 'bars', bottomLeft);
  const health = el('div', 'health', bars, 'bar');
  const healthFill = el('div', null, health);
  const armor = el('div', 'armor', bars, 'bar');
  const armorFill = el('div', null, armor);
  const mapWrap = el('div', 'minimap-wrap', bottomLeft);
  const mapCanvas = el('canvas', 'minimap', mapWrap);
  const districtLabel = el('div', 'minimap-district', mapWrap, 'shadowed');
  const bottomRight = el('div', 'hud-bottomright', hud);
  const speedo = el('div', 'speedo', bottomRight, 'shadowed hidden');
  const radio = el('div', 'radio', bottomRight, 'shadowed hidden');
  const objective = el('div', 'objective', hud, 'hidden');
  const objectiveLabel = el('span', null, objective, 'label');
  const objectiveText = el('span', null, objective);
  const timer = el('div', 'timer', hud, 'hidden');
  const notify = el('div', 'notify', hud);
  const subtitle = el('div', 'subtitle', hud, 'hidden');
  const subtitleWho = el('span', null, subtitle, 'who');
  const subtitleText = el('span', null, subtitle);
  const interact = el('div', 'interact', hud, 'hidden');
  const crosshair = el('div', 'crosshair', hud, 'hidden');
  const districtTitle = el('div', 'district-title', hud);
  const fade = el('div', 'fade', ui);
  const bigText = el('div', 'bigtext', ui, 'hidden');
  mapCanvas.width = 240;
  mapCanvas.height = 240;
  const mapCtx = mapCanvas.getContext('2d');

  let subtitleTimer = 0;
  let districtTimer = 0;
  let lastDistrict = null;
  let moneyShown = 0;
  let moneyTarget = 0;
  const notes = [];

  const api = {
    root: hud,
    show(visible) {
      hud.classList.toggle('hidden', !visible);
    },
    setHealth(value, max) {
      healthFill.style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
    },
    setArmor(value, max) {
      armorFill.style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
    },
    setStars(count, hot) {
      let html = '';
      for (let i = 0; i < 5; i += 1) html += `<span class="${i < count ? 'lit' : ''}">★</span>`;
      stars.innerHTML = html;
      stars.classList.toggle('hot', hot && count > 0);
    },
    setWantedBanner(text) {
      wantedBanner.textContent = text || '';
      wantedBanner.classList.toggle('hidden', !text);
    },
    setMoney(value, instant = false) {
      moneyTarget = value;
      if (instant) {
        moneyShown = value;
        money.textContent = `$${Math.round(value).toLocaleString('en-US')}`;
        money.classList.remove('delta');
      }
    },
    clearNotes() {
      for (const n of notes) n.node.remove();
      notes.length = 0;
    },
    setWeapon(name, ammo, clip) {
      if (ammo === null) weapon.innerHTML = `<span class="name">${name}</span>`;
      else weapon.innerHTML = `<span class="name">${name}</span><span class="ammo">${clip} / ${ammo}</span>`;
    },
    setObjective(text, label = 'Objective') {
      objective.classList.toggle('hidden', !text);
      objectiveLabel.textContent = label;
      objectiveText.textContent = text || '';
    },
    setTimer(seconds) {
      if (seconds === null || seconds === undefined) {
        timer.classList.add('hidden');
        return;
      }
      timer.classList.remove('hidden');
      const s = Math.max(0, Math.ceil(seconds));
      timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      timer.style.color = s <= 10 ? '#ff5a3c' : '#fff';
    },
    setSpeed(kmhValue) {
      if (kmhValue === null) speedo.classList.add('hidden');
      else {
        speedo.classList.remove('hidden');
        speedo.innerHTML = `${Math.round(kmhValue)}<small>km/h</small>`;
      }
    },
    setRadio(name) {
      if (!name) radio.classList.add('hidden');
      else {
        radio.classList.remove('hidden');
        radio.textContent = name;
      }
    },
    setDistrict(name) {
      districtLabel.textContent = name || '';
      if (name && name !== lastDistrict) {
        if (lastDistrict !== null) {
          districtTitle.textContent = name;
          districtTitle.classList.add('show');
          districtTimer = 3.5;
        }
        lastDistrict = name;
      }
    },
    notify(text, kind = '') {
      const n = document.createElement('div');
      n.className = `note ${kind}`;
      n.textContent = text;
      notify.appendChild(n);
      notes.push({ node: n, life: 4.5 });
      if (notes.length > 4) {
        const old = notes.shift();
        old.node.remove();
      }
    },
    subtitle(who, text, seconds = 4) {
      subtitle.classList.remove('hidden');
      subtitleWho.textContent = who ? `${who}:` : '';
      subtitleText.textContent = text;
      subtitleTimer = seconds;
    },
    clearSubtitle() {
      subtitle.classList.add('hidden');
      subtitleTimer = 0;
    },
    showInteract(key, text) {
      interact.classList.remove('hidden');
      interact.innerHTML = `<b>${key}</b>${text}`;
    },
    hideInteract() {
      interact.classList.add('hidden');
    },
    showCrosshair(visible) {
      crosshair.classList.toggle('hidden', !visible);
    },
    fade(opacity, seconds = 0.5) {
      fade.style.transition = `opacity ${seconds}s`;
      fade.style.opacity = String(opacity);
    },
    bigText(title, sub) {
      if (!title) {
        bigText.classList.add('hidden');
        return;
      }
      bigText.classList.remove('hidden');
      bigText.innerHTML = `${title}<small>${sub || ''}</small>`;
    },
    /** Redraw the minimap around the player with the current blips and search circle. */
    drawMinimap(px, pz, yaw, blips, search, zoom) {
      minimap.drawCircular(mapCtx, mapCanvas.width, px, pz, yaw, blips, search, zoom);
    },
    update(dt) {
      if (subtitleTimer > 0) {
        subtitleTimer -= dt;
        if (subtitleTimer <= 0) subtitle.classList.add('hidden');
      }
      if (districtTimer > 0) {
        districtTimer -= dt;
        if (districtTimer <= 0) districtTitle.classList.remove('show');
      }
      for (let i = notes.length - 1; i >= 0; i -= 1) {
        notes[i].life -= dt;
        if (notes[i].life <= 0) {
          notes[i].node.remove();
          notes.splice(i, 1);
        }
      }
      if (moneyShown !== moneyTarget) {
        const diff = moneyTarget - moneyShown;
        const step = Math.sign(diff) * Math.max(1, Math.abs(diff) * Math.min(1, dt * 6));
        moneyShown = Math.abs(step) >= Math.abs(diff) ? moneyTarget : moneyShown + step;
        money.textContent = `$${Math.round(moneyShown).toLocaleString('en-US')}`;
        money.classList.toggle('delta', moneyShown !== moneyTarget);
      }
    },
  };
  api.setStars(0, false);
  api.setMoney(0, true);
  money.textContent = '$0';
  return api;
}
