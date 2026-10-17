// Tuning and map positions. Positions are [x, z] in metres on the Backrooms level.
// The level runs roughly from x -70 (lounge, far west) to x +7 (end of the corridor).

// Phones and tablets get a smaller crowd so they stay smooth.
const PHONE = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0 &&
  typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

export const CONFIG = {
  mapScale: 1.6,               // the whole level is stretched this much in width and length
  eyeHeight: 1.55,
  fov: 70,
  playerSpeed: 3.4,            // metres per second
  playerRadius: 0.25,
  turnSpeed: 2.2,              // radians per second (arrow keys)
  mouseSensitivity: 0.0025,
  touchLookSensitivity: 0.007,
  maxPitch: 0.6,

  enemySpeed: 1.3,             // when she can see you (you run at 3.4)
  enemyBlindSpeed: 0.85,       // when there's a wall between you
  enemyStartDelay: 6,          // seconds after the instructions close before she moves
  catchDistance: 0.65,
  quietNearStrap: 12,          // NPCs won't start a conversation while she's this close to you

  accostEvery: [10, 18],       // seconds between NPCs storming up to Community Strap
  feedRange: 7,                // she sucks in anyone who gets this close (metres)
  feedEvery: [2, 4],           // seconds between those
  accostRange: 30,             // only NPCs this close to her will go
  accostSpeed: 3.0,
  stallCrowd: 30,              // people who burst out of the bathroom stall
  npcSpacing: 2.2,             // minimum gap between patrons when they spawn and wander
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
  },

  maxCharacters: PHONE ? 40 : 60,   // everyone on the map, Community Strap included (fewer on phones)
  hallwayCrowd: 4,             // patrons in the start hallway besides Sock
  scatterSpacing: 3,           // how far apart the patrons spread through the rest of the club
  danceCrowd: 6,
  bathroomCrowd: 3,
};

// Positions below are in the original level's coordinates; they're scaled by mapScale at the bottom.
export const SPOTS = {
  // East end of the long hallway, facing down it. The small room's doorway is a few steps ahead.
  start: { pos: [5.8, 5.2], yaw: Math.PI },
  // Where later runs start (after the intro has been seen): partway down the hallway,
  // with Community Strap well behind you.
  chaseStart: { pos: [-9.2, 5.2], yaw: Math.PI, strap: [4.0, 5.2] },
  phoneGirl: [-5.9, 5.6],
  // The carabiner sits alone in the middle of the video room in the west hall.
  key: [-64.65, -0.85],
  // The Mushroom Dome Bar in the middle hall, doorway facing the way in from the east.
  // It's scaled up so its archway is person-sized; inside a round wall, it rises through a hole in the ceiling.
  mushroom: { pos: [-49.3, 10.3], yaw: 2.6, size: 2.6, hole: 6.35 },
  keyRoom: { min: [-67.9, -4.25], max: [-61.4, 2.55], doorFrom: -1.45, doorTo: -0.35 },
  exitDoor: [-50.0, -4.1],

  danceFloor: { min: [-34, -3.0], max: [-23, 4.0] },
  djBooth: { center: [-28.5, -2.9], width: 3.2, depth: 0.8 },
  djs: [[-29.4, -3.75], [-27.6, -3.75]],

  bathroom: { min: [-27.0, 9.0], max: [-20.6, 14.85], doorFrom: -24.6, doorTo: -23.1 },

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

// Stretch every [x, z] position (and the bathroom door edges) to match the bigger map.
(function scaleSpots(obj, k) {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === "number") obj[key] = [v[0] * k, v[1] * k];
    else if (Array.isArray(v)) v.forEach((item, i) => { if (Array.isArray(item)) v[i] = [item[0] * k, item[1] * k]; });
    else if (v && typeof v === "object") scaleSpots(v, k);
    else if (key === "doorFrom" || key === "doorTo") obj[key] = v * k;
  }
})(SPOTS, CONFIG.mapScale);
