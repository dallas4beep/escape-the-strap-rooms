// Tuning and map positions. Positions are [x, z] in metres on the Backrooms level.
// The level runs roughly from x -70 (lounge, far west) to x +7 (end of the corridor).

export const CONFIG = {
  eyeHeight: 1.55,
  fov: 70,
  playerSpeed: 3.2,            // metres per second
  playerRadius: 0.25,
  turnSpeed: 2.2,              // radians per second (arrow keys)
  mouseSensitivity: 0.0025,
  touchLookSensitivity: 0.007,
  maxPitch: 0.6,

  enemySpeed: 2.3,             // slower than the player, so running away works
  enemyStartDelay: 2.5,        // seconds after the instructions close
  catchDistance: 0.8,
  dangerDistance: 6,           // screen shudders inside this
  keyPickupDistance: 1.0,
  sodaPickupDistance: 0.9,
  doorDistance: 1.4,
  sugarRushSeconds: 60,

  talkRange: 1.4,
  talkCooldown: 8,             // per NPC
  globalTalkCooldown: 3,
  followTime: 12,
  followSpeed: 1.4,
  wanderSpeed: 0.5,

  introWalkDistance: 15,       // metres walked before the camera locks on the phone girl

  music: {
    minVolume: 0.06,           // chase song when Community Strap is far away
    maxVolume: 1.0,            // when she is right on top of you
    hearDistance: 28,
    skitVolume: 0.8,
  },

  maxCharacters: 40,           // everyone on the map, Community Strap included
  danceCrowd: 10,
  bathroomCrowd: 18,
};

export const SPOTS = {
  start: { pos: [0, 0.4], yaw: Math.PI / 2 },
  phoneGirl: [-13.2, 5.6],
  strapIntro: [-32, 5.0],
  key: [-62.5, 12.2],
  exitDoor: [-50.0, -4.1],
  soda: [-23.6, 12.4],

  danceFloor: { min: [-34, -3.0], max: [-23, 4.0] },
  djBooth: { center: [-28.5, -2.9], width: 3.2, depth: 0.8 },
  djs: [[-29.4, -3.75], [-27.6, -3.75]],

  bathroom: { min: [-26.8, 9.3], max: [-20.6, 14.9], doorFrom: -24.4, doorTo: -22.9 },

  named: {
    "Vesper Sin": [-31, 1.5],
    "Sloane Venom": [-18.6, 2.0],
    "Roxanne Riot": [-25, -1.0],
    "Jade Thunder": [-26.0, -1.8],
    "Mercedes Velour": [-48, 10],
    "Blaze Kowalski": [-60, 4],
    "Scarlet Static": [-64.5, 8.5],
  },
  primary: [-44, -2.5],
};
