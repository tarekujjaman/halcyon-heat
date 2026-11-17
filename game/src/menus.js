// Menus: the title screen with the Halcyon Heat logo over the live city (New Game, Continue, Load,
// Settings, Controls), the pause menu, save and load slot panels, settings (volume, music, mouse
// sensitivity, shadows), the controls sheet and the mission-complete screen with its rewards.
import { GAME_TITLE } from './config.js';
import { saveSystem } from './save.js';

export function createMenus(ui, actions) {
  const screens = {};
  let current = null;
  let selected = 0;

  const make = (id, build) => {
    const screen = document.createElement('div');
    screen.id = id;
    screen.className = 'screen hidden';
    ui.appendChild(screen);
    screens[id] = screen;
    build(screen);
    return screen;
  };
  const button = (label, sub, onClick, disabled = false) => {
    const b = document.createElement('button');
    b.innerHTML = sub ? `${label}<small>${sub}</small>` : label;
    b.disabled = disabled;
    b.addEventListener('click', () => {
      if (actions.sound) actions.sound('confirm');
      onClick();
    });
    b.addEventListener('mouseenter', () => {
      const list = [...b.parentElement.querySelectorAll('button')];
      selected = list.indexOf(b);
      highlight();
    });
    return b;
  };
  const menu = (parent, items) => {
    const m = document.createElement('div');
    m.className = 'menu';
    for (const [label, sub, fn, disabled] of items) m.appendChild(button(label, sub, fn, disabled));
    parent.appendChild(m);
    return m;
  };
  const highlight = () => {
    if (!current) return;
    const buttons = [...screens[current].querySelectorAll('.menu button, .slots button')];
    buttons.forEach((b, i) => b.classList.toggle('selected', i === selected));
  };

  const slotList = (parent, mode) => {
    parent.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'menu slots';
    for (const s of saveSystem.list()) {
      const when = s.savedAt ? new Date(s.savedAt).toLocaleString() : 'Empty';
      const sum = s.summary ? `${s.summary.missions} missions · $${(s.summary.money || 0).toLocaleString('en-US')} · ${s.summary.title}` : '';
      const label = `Slot ${s.slot}`;
      const disabled = mode === 'load' && !s.savedAt;
      list.appendChild(button(label, `${when}${sum ? ' · ' + sum : ''}`, () => (mode === 'load' ? actions.loadSlot(s.slot) : actions.saveSlot(s.slot)), disabled));
    }
    list.appendChild(button('Back', '', () => api.back()));
    parent.appendChild(list);
  };

  // Title.
  make('title', (s) => {
    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.textContent = GAME_TITLE;
    const sub = document.createElement('div');
    sub.className = 'logo-sub';
    sub.textContent = 'A Halcyon Bay story';
    s.appendChild(logo);
    s.appendChild(sub);
    const holder = document.createElement('div');
    holder.id = 'title-menu';
    s.appendChild(holder);
    const credits = document.createElement('div');
    credits.className = 'hint shadowed';
    credits.style.marginTop = '2em';
    credits.textContent = 'Click to play · WASD move · F enter car · 1-4 weapons · M map · Esc pause';
    s.appendChild(credits);
  });
  const rebuildTitle = () => {
    const holder = screens.title.querySelector('#title-menu');
    holder.innerHTML = '';
    const latest = saveSystem.latest();
    menu(holder, [
      ['New Game', 'Start as Sol Vega, back in Halcyon Bay', () => actions.newGame()],
      ['Continue', latest ? `Latest save · ${new Date(latest.savedAt).toLocaleString()}` : 'No saved game yet', () => actions.continueGame(), !latest],
      ['Load Game', 'Pick one of three slots', () => api.show('load')],
      ['Settings', 'Volume, music, mouse sensitivity', () => api.show('settings')],
      ['Controls', 'Keyboard and mouse', () => api.show('controls')],
    ]);
  };

  // Pause.
  make('pause', (s) => {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = '<h2>Paused</h2>';
    menu(panel, [
      ['Resume', '', () => actions.resume()],
      ['Save Game', 'To one of three slots', () => api.show('save')],
      ['Load Game', '', () => api.show('load')],
      ['Map', 'The whole bay (M)', () => actions.openMap()],
      ['Settings', '', () => api.show('settings')],
      ['Controls', '', () => api.show('controls')],
      ['Quit to Title', '', () => actions.quitToTitle()],
    ]);
    s.appendChild(panel);
  });

  make('save', (s) => {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = '<h2>Save Game</h2>';
    const holder = document.createElement('div');
    holder.id = 'save-slots';
    panel.appendChild(holder);
    s.appendChild(panel);
  });
  make('load', (s) => {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = '<h2>Load Game</h2>';
    const holder = document.createElement('div');
    holder.id = 'load-slots';
    panel.appendChild(holder);
    s.appendChild(panel);
  });

  make('settings', (s) => {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = '<h2>Settings</h2>';
    const settings = actions.getSettings();
    const row = (label, key, min, max, step, format) => {
      const r = document.createElement('div');
      r.className = 'row';
      const l = document.createElement('span');
      l.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = settings[key];
      const value = document.createElement('b');
      value.textContent = format(settings[key]);
      input.addEventListener('input', () => {
        settings[key] = Number(input.value);
        value.textContent = format(settings[key]);
        actions.applySettings(settings);
      });
      r.append(l, input, value);
      panel.appendChild(r);
    };
    row('Master volume', 'volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    row('Music volume', 'music', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    row('Effects volume', 'sfx', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    row('Mouse sensitivity', 'sensitivity', 0.2, 3, 0.1, (v) => `${v.toFixed(1)}x`);
    const shadows = document.createElement('div');
    shadows.className = 'row';
    shadows.innerHTML = '<span>Shadows</span>';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = settings.shadows !== false;
    toggle.addEventListener('change', () => {
      settings.shadows = toggle.checked;
      actions.applySettings(settings);
    });
    shadows.appendChild(toggle);
    panel.appendChild(shadows);
    menu(panel, [['Back', '', () => api.back()]]);
    s.appendChild(panel);
  });

  make('controls', (s) => {
    const panel = document.createElement('div');
    panel.className = 'panel keys';
    panel.innerHTML = `<h2>Controls</h2>
      <h3>On foot</h3>
      <p><b>W A S D</b> move · <b>Shift</b> run · <b>Space</b> jump · <b>Mouse</b> look (click to lock)</p>
      <p><b>Left click</b> punch / fire · <b>Right click</b> aim · <b>1-4 / wheel</b> weapon · <b>Q</b> reload</p>
      <p><b>F</b> enter or steal a car · <b>E</b> interact (safehouse, respray, race, fare)</p>
      <h3>Driving</h3>
      <p><b>W / S</b> accelerate / brake · <b>A / D</b> steer · <b>Space</b> handbrake (drift)</p>
      <p><b>F</b> get out · <b>R</b> radio station · <b>H</b> horn</p>
      <h3>Everywhere</h3>
      <p><b>M</b> map · <b>Esc</b> pause · <b>F5</b> quick save</p>`;
    menu(panel, [['Back', '', () => api.back()]]);
    s.appendChild(panel);
  });

  make('mission-complete', (s) => {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'mission-panel';
    s.appendChild(panel);
  });

  const history = [];
  const api = {
    get current() {
      return current;
    },
    show(name, data) {
      if (current && current !== name) history.push(current);
      if (current) screens[current].classList.add('hidden');
      current = name;
      selected = 0;
      if (name === 'title') rebuildTitle();
      if (name === 'save') slotList(screens.save.querySelector('#save-slots'), 'save');
      if (name === 'load') slotList(screens.load.querySelector('#load-slots'), 'load');
      if (name === 'mission-complete') {
        const p = screens['mission-complete'].querySelector('#mission-panel');
        p.innerHTML = `<div class="title">Mission passed</div><h2>${data.title}</h2>
          <div class="reward">+$${data.reward.toLocaleString('en-US')}</div>
          <div class="stats">${data.stats.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}
            <span>Reputation</span><span>+${data.rep} · ${data.repTitle}${data.levelUp ? ' (level up!)' : ''}</span></div>
          <div class="next">Next: ${data.next}</div>`;
        menu(p, [['Continue', 'Enter', () => actions.resume()]]);
      }
      screens[name].classList.remove('hidden');
      highlight();
    },
    hide() {
      if (current) screens[current].classList.add('hidden');
      current = null;
      history.length = 0;
    },
    back() {
      const prev = history.pop();
      if (prev) {
        screens[current].classList.add('hidden');
        current = null;
        api.show(prev);
        history.pop();
      } else actions.resume();
    },
    /** Keyboard navigation: arrows, Enter, Escape. */
    key(code) {
      if (!current) return false;
      const buttons = [...screens[current].querySelectorAll('.menu button, .slots button')].filter((b) => !b.disabled);
      if (code === 'ArrowDown' || code === 'KeyS') {
        selected = (selected + 1) % buttons.length;
        if (actions.sound) actions.sound('select');
      } else if (code === 'ArrowUp' || code === 'KeyW') {
        selected = (selected - 1 + buttons.length) % buttons.length;
        if (actions.sound) actions.sound('select');
      } else if (code === 'Enter' || code === 'Space') {
        if (buttons[selected]) buttons[selected].click();
      } else if (code === 'Escape') {
        if (current === 'title') return true;
        if (current === 'pause' || current === 'mission-complete') actions.resume();
        else api.back();
      } else return false;
      const all = [...screens[current].querySelectorAll('.menu button, .slots button')];
      all.forEach((b) => b.classList.toggle('selected', b === buttons[selected]));
      return true;
    },
  };
  return api;
}
