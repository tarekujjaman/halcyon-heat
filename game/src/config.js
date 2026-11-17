// Halcyon Heat: the numbers and names every system shares. The city grid, district palette,
// time of day, player tuning, wanted thresholds and key bindings live here so no module
// hides a magic number of its own.

export const GAME_TITLE = 'HALCYON HEAT';
export const GAME_VERSION = '1.0';
export const SAVE_PREFIX = 'halcyon-heat';

/** The city grid: blocksX by blocksZ lots, each `block` metres square, between roads `road` metres wide. */
export const CITY = {
  blocksX: 10,
  blocksZ: 10,
  block: 64,
  road: 18,
  asphalt: 12,
  sidewalk: 3,
  canalRow: 6,
  canalWidth: 36,
};

/** Lane geometry along every road, measured from the road centreline (right-hand traffic). */
export const LANES = {
  drive: 2.4,
  park: 4.7,
  sidewalk: 7.5,
  curb: 6.0,
};

/** The beach west of ocean drive: boardwalk, sand, then the sea. */
export const BEACH = {
  boardwalkFrom: -9,
  boardwalkTo: -17,
  sandTo: -78,
  seaEdge: -78,
  pierZ: 330,
  pierLength: 150,
};

export const DISTRICTS = {
  coral: { id: 'coral', name: 'Coral Strand', color: '#f6c177', mapColor: '#f4d9a8' },
  glasswater: { id: 'glasswater', name: 'Glasswater Downtown', color: '#7fd3e8', mapColor: '#a9d8e6' },
  neon: { id: 'neon', name: 'Neon Row', color: '#ff6fb5', mapColor: '#f3b3d6' },
  palmetto: { id: 'palmetto', name: 'Palmetto Heights', color: '#9fd98a', mapColor: '#bfe3ad' },
  docks: { id: 'docks', name: 'Saltmarsh Docks', color: '#c9a37c', mapColor: '#d6c3a6' },
  canal: { id: 'canal', name: 'Glass Canal', color: '#4aa3c8', mapColor: '#8fc6dd' },
  sea: { id: 'sea', name: 'Halcyon Bay', color: '#2f86b8', mapColor: '#5fa9cf' },
};

export const TIME = {
  startHour: 17.75,
  hoursPerRealMinute: 0.5,
  sunrise: 6.2,
  sunset: 19.3,
};

export const PLAYER = {
  walkSpeed: 3.4,
  runSpeed: 7.2,
  jumpSpeed: 5.6,
  gravity: 16,
  radius: 0.42,
  height: 1.78,
  maxHealth: 100,
  maxArmor: 100,
  punchRange: 1.9,
  punchDamage: 18,
  interactRange: 3.2,
};

export const CAMERA = {
  footDistance: 4.6,
  footHeight: 1.9,
  carDistance: 8.5,
  carHeight: 3.2,
  aimDistance: 3.1,
  sensitivity: 0.0022,
  fov: 62,
  near: 0.3,
  far: 2400,
};

export const WANTED = {
  maxStars: 5,
  heatPerStar: 100,
  decayPerSecond: 1.6,
  evadeSeconds: [0, 12, 18, 26, 34, 44],
  searchRadius: [0, 90, 120, 160, 200, 240],
  copsPerStar: [0, 1, 2, 3, 4, 5],
  roadblockStars: 3,
  helicopterStars: 4,
};

export const CRIMES = {
  stealCar: 60,
  hitPedestrian: 70,
  killPedestrian: 90,
  shoot: 35,
  attackPolice: 160,
  destroyCar: 120,
  bankAlarm: 320,
};

export const ECONOMY = {
  startMoney: 850,
  arrestFee: 0.1,
  hospitalFee: 0.08,
  resprayCost: 500,
  shardReward: 250,
  shardSetBonus: 5000,
  repLevels: [0, 100, 260, 500, 850, 1300, 1900, 2700, 3800, 5200],
  repTitles: [
    'Newcomer', 'Street Rookie', 'Wheelman', 'Getaway Driver', 'Crew Regular',
    'Fixer', 'Enforcer', 'Underboss', 'Bay Kingpin', 'Halcyon Legend',
  ],
};

export const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  handbrake: ['Space'],
  enterCar: ['KeyF'],
  interact: ['KeyE'],
  radio: ['KeyR'],
  map: ['KeyM'],
  pause: ['Escape'],
  horn: ['KeyH'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  weapon3: ['Digit3'],
  weapon4: ['Digit4'],
  reload: ['KeyQ'],
  quickSave: ['F5'],
};
