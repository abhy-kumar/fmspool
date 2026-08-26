import { CFG } from "./config.js";
import { makeRng, shuffle } from "./rng.js";
import { dist, sub, norm, mul, add } from "./vec.js";

export const POCKETS = [
  { id: "TL", x:   0, y:   0, r: CFG.POCKET_R_CORNER },
  { id: "TM", x: 400, y:  -4, r: CFG.POCKET_R_SIDE },
  { id: "TR", x: 800, y:   0, r: CFG.POCKET_R_CORNER },
  { id: "BL", x:   0, y: 400, r: CFG.POCKET_R_CORNER },
  { id: "BM", x: 400, y: 404, r: CFG.POCKET_R_SIDE },
  { id: "BR", x: 800, y: 400, r: CFG.POCKET_R_CORNER },
];

export function createBall(id, x, y) {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    r: CFG.BALL_R,
    spin: { x: 0, y: 0 },
    inPlay: true,
    pocketed: false,
    pocketedInto: null,
    distanceTravelled: 0,
  };
}

export function createInitialRack(seed = 12345) {
  const rng = makeRng(seed);
  const balls = new Array(16);

  // Cue ball at head spot
  balls[0] = createBall(0, CFG.HEAD_SPOT.x, CFG.HEAD_SPOT.y);

  // 15 object balls in triangle rack at foot spot (600, 200)
  const dx = CFG.BALL_R * Math.sqrt(3); // ~15.588

  // Triangular positions array [row][slot]
  const positions = [];
  for (let row = 0; row < 5; row++) {
    positions[row] = [];
    for (let slot = 0; slot <= row; slot++) {
      const x = CFG.FOOT_SPOT.x + row * dx;
      const y = CFG.FOOT_SPOT.y + (slot - row / 2) * (CFG.BALL_R * 2);
      positions[row][slot] = { x, y };
    }
  }

  // Shuffle object balls excluding 8
  const objectBallIds = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
  const shuffled = shuffle(rng, objectBallIds);

  const solids = shuffled.filter((id) => id >= 1 && id <= 7);
  const stripes = shuffled.filter((id) => id >= 9 && id <= 15);

  const corner1 = solids.pop();
  const corner2 = stripes.pop();

  const remaining = [];
  shuffled.forEach((id) => {
    if (id !== corner1 && id !== corner2) {
      remaining.push(id);
    }
  });

  // Assign to slots:
  // Apex [0][0]: remaining[0]
  // Row 1: [1][0]=remaining[1], [1][1]=remaining[2]
  // Row 2: [2][0]=remaining[3], [2][1]=8 (center), [2][2]=remaining[4]
  // Row 3: [3][0]=remaining[5], [3][1]=remaining[6], [3][2]=remaining[7], [3][3]=remaining[8]
  // Row 4: [4][0]=corner1, [4][1]=remaining[9], [4][2]=remaining[10], [4][3]=remaining[11], [4][4]=corner2
  const rackMap = [
    [remaining[0]],
    [remaining[1], remaining[2]],
    [remaining[3], 8, remaining[4]],
    [remaining[5], remaining[6], remaining[7], remaining[8]],
    [corner1, remaining[9], remaining[10], remaining[11], corner2],
  ];

  for (let row = 0; row < 5; row++) {
    for (let slot = 0; slot <= row; slot++) {
      const ballId = rackMap[row][slot];
      const pos = positions[row][slot];
      balls[ballId] = createBall(ballId, pos.x, pos.y);
    }
  }

  // Settle rack: 40 iterations of separation relaxation
  for (let iter = 0; iter < 40; iter++) {
    for (let i = 1; i <= 15; i++) {
      for (let j = i + 1; j <= 15; j++) {
        const bi = balls[i];
        const bj = balls[j];
        const d = dist(bi, bj);
        const minD = CFG.BALL_R * 2;
        if (d < minD && d > 0.0001) {
          const overlap = minD - d;
          const delta = mul(sub(bj, bi), 1 / d);
          const push = mul(delta, overlap * 0.5 + CFG.SEPARATION_SLOP);
          bi.x -= push.x;
          bi.y -= push.y;
          bj.x += push.x;
          bj.y += push.y;
        }
      }
    }
  }

  return balls;
}
