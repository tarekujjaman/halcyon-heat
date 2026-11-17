// The pause map: the whole of Halcyon Bay with its five districts named, every mission, safehouse,
// garage, race and shard icon, a legend, the story's progress, Sol's standing, and a click to set
// a waypoint that shows on the minimap.
import { DISTRICTS } from './config.js';

export function createMapScreen(ui, game) {
  const screen = document.createElement('div');
  screen.id = 'mapscreen';
  screen.className = 'screen hidden';
  const canvas = document.createElement('canvas');
  canvas.id = 'mapcanvas';
  const legend = document.createElement('div');
  legend.id = 'maplegend';
  legend.className = 'panel';
  screen.appendChild(canvas);
  screen.appendChild(legend);
  ui.appendChild(screen);
  const ctx = canvas.getContext('2d');
  let projection = null;
  const state = { open: false, waypoint: null };

  // District names, big enough to read on a thumbnail; the beach strip and the bay read vertically.
  const L = game.layout;
  const labels = [
    { text: 'SALTMARSH DOCKS', x: L.roadX[5], z: L.roadZ[0] + 44, size: 46, color: '#fff' },
    { text: 'GLASSWATER', x: (L.roadX[2] + L.roadX[6]) / 2 - 4, z: L.roadZ[2] + 50, size: 34, color: '#fff' },
    { text: 'DOWNTOWN', x: (L.roadX[2] + L.roadX[6]) / 2 - 4, z: L.roadZ[3] + 10, size: 28, color: '#fff' },
    { text: 'NEON ROW', x: (L.roadX[6] + L.roadX[10]) / 2 + 6, z: L.roadZ[3] + 34, size: 40, color: '#fff' },
    { text: 'PALMETTO HEIGHTS', x: L.width / 2, z: L.roadZ[8] + 50, size: 50, color: '#fff' },
    { text: 'CORAL STRAND', x: L.roadX[1] - 26, z: L.roadZ[4] + 20, size: 28, color: '#fff', angle: -Math.PI / 2 },
    { text: 'HALCYON BAY', x: -60, z: L.depth * 0.66, size: 36, color: '#eaf8ff', angle: -Math.PI / 2 },
    { text: 'GLASS CANAL', x: L.width * 0.5, z: (L.canal.z0 + L.canal.z1) / 2 + 2, size: 20, color: '#eaf8ff' },
    { text: 'CORAL PIER', x: L.pier.x0 + 70, z: L.pier.z0 - 16, size: 18, color: '#ffe8c2' },
  ];

  canvas.addEventListener('click', (e) => {
    if (!projection) return;
    const rect = canvas.getBoundingClientRect();
    const [x, z] = projection.unproject(e.clientX - rect.left, e.clientY - rect.top);
    if (state.waypoint && Math.hypot(state.waypoint.x - x, state.waypoint.z - z) < 20) state.waypoint = null;
    else state.waypoint = { x, z };
    api.draw();
    if (game.audio) game.audio.ui('select');
  });

  const api = {
    state,
    get waypoint() {
      return state.waypoint;
    },
    open() {
      state.open = true;
      screen.classList.remove('hidden');
      const ratio = game.minimap.base.height / game.minimap.base.width;
      const size = Math.min((window.innerHeight - 40) / ratio, window.innerWidth - 470, 1000);
      canvas.width = Math.max(420, Math.round(size));
      canvas.height = Math.max(420, Math.round(size * ratio));
      api.draw();
    },
    close() {
      state.open = false;
      screen.classList.add('hidden');
    },
    draw() {
      const blips = [...game.missions.blips(), ...game.activities.blips()];
      for (const c of game.police.cruisers) blips.push({ x: c.x, z: c.z, kind: 'police', color: '#3b7bff' });
      projection = game.minimap.drawFull(ctx, canvas.width, canvas.height, blips, labels, state.waypoint, game.player);
      const progress = game.missions.progress();
      const eco = game.economy;
      legend.innerHTML = `<h2>Halcyon Bay</h2>
        <div class="legend">
          <div><i style="background:${DISTRICTS.coral.mapColor}"></i>Coral Strand</div>
          <div><i style="background:${DISTRICTS.glasswater.mapColor}"></i>Glasswater</div>
          <div><i style="background:${DISTRICTS.neon.mapColor}"></i>Neon Row</div>
          <div><i style="background:${DISTRICTS.palmetto.mapColor}"></i>Palmetto Heights</div>
          <div><i style="background:${DISTRICTS.docks.mapColor}"></i>Saltmarsh Docks</div>
          <div><i style="background:#ffd34a"></i>M Mission</div>
          <div><i style="background:#8dff7a"></i>S Safehouse</div>
          <div><i style="background:#ff8a5b"></i>G Respray shop</div>
          <div><i style="background:#c58cff"></i>R Street race</div>
          <div><i style="background:#7cf7d4"></i>Sea-glass shard</div>
          <div><i style="background:#3b7bff"></i>Police</div>
          <div><i style="background:#fff"></i>You</div>
        </div>
        <div class="story"><h3>Story · ${progress.filter((p) => p.status === 'done').length}/${progress.length} done</h3>
          ${progress.map((p, i) => `<div class="${p.status === 'active' ? 'next' : p.status}">${i + 1}. ${p.title}${p.status === 'done' ? ' ✓' : p.status === 'next' ? ' ◄' : p.status === 'active' ? ' (in progress)' : ''}</div>`).join('')}
        </div>
        <div class="hint">$${eco.money.toLocaleString('en-US')} · ${eco.title()} · ${game.activities.state.collected.length}/20 shards<br>Click the map to set a waypoint · M or Esc to close</div>`;
    },
  };
  return api;
}
