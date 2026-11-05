export const BODY = {
  radius: .42, height: 1.8, tolerance: 1e-6, skin: 1e-5, iterations: 8, recoveryIterations: 16,
  bounds: { minX: -7.1, maxX: 7.1, minZ: -7, maxZ: 6.7 }, safe: { x: 0, z: -6 },
};
// Metres, seconds. Shared by simulation and rendering.
export const COURT = {
  ballRadius: .12, floorY: .012,
  board: { center: { x: 0, y: 3.55, z: 6.1 }, width: 1.8, height: 1.05, depth: .07 },
  rim: { x: 0, y: 3.05, z: 5.7 }, rimRadius: .24, rimTubeRadius: .0175, rimSegments: 48,
};
// Initial gameplay tuning, not measured material properties.
export const PHYSICS = {
  floor: { restitution: .68, friction: 1.8 },
  board: { restitution: .72, friction: .08 },
  rim: { restitution: .62, friction: .12 },
  sleepVertical: .22, sleepHorizontal: .05, contactIterations: 4,
  maxSubsteps: 192, maxSpeed: 80, maxStep: 1 / 30,
  maxFlight: 8, outDistance: 12,
};
export function rimSegments() {
  return Array.from({ length: COURT.rimSegments }, (_, i) => {
    const point = (j: number) => ({ x: COURT.rim.x + Math.cos(j * 2 * Math.PI / COURT.rimSegments) * COURT.rimRadius, y: COURT.rim.y, z: COURT.rim.z + Math.sin(j * 2 * Math.PI / COURT.rimSegments) * COURT.rimRadius });
    return { a: point(i), b: point(i + 1) };
  });
}

// Fixed practice partner, dimensions in metres (total height 1.8).
export const DUMMY = {
  position: { x: 3, y: COURT.floorY, z: 1.5 }, height: 1.8, collisionRadius: BODY.radius,
  headRadius: .14, headY: 1.66, neckY: 1.51, neckHeight: .06, neckRadius: .07,
  torsoY: 1.18, torsoHeight: .64, torsoWidth: .44, torsoDepth: .26,
  armX: .30, armY: 1.18, armLength: .5, armWidth: .12, armTilt: -.25, handY: .91, handRadius: .075, handForward: .08,
  legX: .13, legY: .44, legLength: .84, legWidth: .15, legDepth: .19,
  catchY: 1.28, catchForward: .38, markerRadius: .6, markerThickness: .025, labelY: 2.12, labelWidth: 1.5, labelHeight: .28,
};
export const PRACTICE = {
  releaseLock: .45, catchRadius: .42, catchHeightTolerance: .36, catchSpeed: 28,
  playerCatchY: 1.28, aimAngle: .20, targetHintRange: 18,
  dummyReturnSpeed: 8,
  dummyHoldSeconds: .7, passFlightSeconds: 4,
  recoverySeconds: 30, playerRadius: BODY.radius,
};

// Ball-centre acquisition volumes; initial gameplay tuning, not measured limits.
// Ground height is world floor-relative; air height follows the player's feet.
export const ACQUISITION = {
  ground: { halfWidth: .8, minForward: -.25, maxForward: .85, minHeight: 0, maxHeight: .5, maxPlayerHeight: .12, maxSpeed: 14 },
  air: { halfWidth: .6, minForward: .08, maxForward: 1.25, minHeight: .5, maxHeight: 1.75, maxSpeed: 18, anchorForward: .6, anchorHeight: 1.2 },
};

export const PLAYER = { eyeHeight: 1.7 };
// Initial manual-pass tuning, not measured values. No automatic aim/height assist.
export const PASS = { minSpeed: 7, maxSpeed: 22, maxCharge: 1.2, releaseOffset: .35 };

// Shared display dimensions; gameplay colliders remain DUMMY/ACQUISITION.
export const CHARACTER = {
  pelvisY: DUMMY.torsoY - DUMMY.torsoHeight / 2, pelvisHeight: .16,
  shoulderY: 1.44, shoulderX: DUMMY.armX, upperArm: .28, forearm: .29,
  handLength: .13, handWidth: .1, jointRadius: .065,
  upperLeg: .40, lowerLeg: .38, kneeRadius: .075,
  footHeight: .08, footLength: .24, footWidth: .16,
};
// Controlled-ball tuning: seconds/metres, not measured motion capture.
export const DRIBBLE = {
  idlePeriod: .84, movePeriod: .62, sprintPeriod: .46, response: 8,
  idleHeight: 1.2, moveHeight: 1.15, sprintHeight: 1.08,
  side: .33, forward: .58, pushFraction: .43, minHandHeight: 1.0,
  gatherSeconds: .22, releaseSeconds: .09, followSeconds: .18, catchSeconds: .18,
  pocketHeight: 1.38, pocketForward: .48, pocketSide: .16,
};

// Photo-inspired set shot: right hand under ball, left guide hand, grounded knee flex.
export const SHOT_FORM = {
  setForward: .40, setUp: .14, setSide: .08,
  releaseForward: .50, releaseUp: .28, releaseSide: 0,
  groundHipBend: .28, shoulderLift: .035, groundedHeight: 0,
};

// Endpoints reuse DRIBBLE.side/forward and idle/move/sprintHeight to avoid seams.
export const CROSSOVER = {
  duration: .28, maxReturnWait: .18, bounceFraction: .48, contactForward: .78,
  maxYawRate: 4.5, bodyShift: .025, kneeBend: .06,
};

// Initial tuning, not measured biomechanics.
export const DEFENSE = {
  stanceBend: .22, response: 10, handSide: .42, handHeight: 1.16, handForward: .28, stepRate: 9, stepAngle: .13,
  steal: { prepare: .10, active: .16, recover: .24, cooldown: .65, reach: .53, radius: .28, angle: 1.0, handY: 1.12 },
  block: { prepare: .06, active: .54, recover: .24, cooldown: .85, radius: .38, handY: 2.0, forward: .40, side: .18, shoulderLift: .09, restitution: .65, impulse: .8, maxSpeed: 28, pickupLock: .25 },
};
export const DEFENSE_PRACTICE = { warningSeconds: 2.5, shotCharge: .7 };

// Ground speeds are final values (previously 3.5 and 5.5 m/s), scaled once by 70%.
export const MOVEMENT = { walk: 2.45, run: 3.85, chargeScale: .35, airScale: .7 };
// Visual tuning only. A period is one complete left/right gait cycle.
export const HEAD_BOB = {
  enabled: true, walkUp: .05, runUp: .1, walkSide: .05, runSide: .008,
  walkPeriod: 1.35 / MOVEMENT.walk, runPeriod: 1.75 / MOVEMENT.run,
  smoothing: 14, chargeScale: 0,
};
export const GAIT = {
  walkStride: MOVEMENT.walk * HEAD_BOB.walkPeriod, runStride: MOVEMENT.run * HEAD_BOB.runPeriod, walkAngle: .28, runAngle: .46, response: 12,
  pelvisSway: .018, pelvisBob: .012, footLift: .055, airBend: .14, stopSpeed: .015,
};
