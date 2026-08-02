// Floor 12 of the Vantek building, transcribed from the architectural blueprint.
//
// The plan is a square donut: a ring of perimeter rooms (executive suites,
// offices, break room, restrooms, stairwell) wrapped around a circulation
// corridor, which in turn wraps a central core (storage, mechanical,
// conference, work area, reception, copy).
//
//        -Z (north / top of the blueprint)
//   -X ................................ +X
//        +Z (south / main entrance)

export const WALL_HEIGHT = 3.2;
export const DOOR_HEIGHT = 2.15;
export const EXTERIOR_THICKNESS = 0.42;
export const INTERIOR_THICKNESS = 0.2;
export const HALF_EXTENT = 22;

const PERIMETER = 15;   // inner face of the perimeter room band
const CORE = 12.4;      // outer face of the central core

// Yaw 0 looks down -Z, i.e. north from the entrance lobby into the building.
export const SPAWN = { x: 0, z: 18.5, heading: 0 };
export const EXIT_DOOR = { x: PERIMETER, z: -2, facing: 'x' };

export const ROOMS = [
    // West column, north to south.
    { id: 'exec-nw', name: 'EXECUTIVE', type: 'executive', x1: -22, z1: -22, x2: -15, z2: -14 },
    { id: 'off-w1', name: 'OFFICE', type: 'office', x1: -22, z1: -14, x2: -15, z2: -8 },
    { id: 'off-w2', name: 'OFFICE', type: 'office', x1: -22, z1: -8, x2: -15, z2: -2 },
    { id: 'off-w3', name: 'OFFICE', type: 'office', x1: -22, z1: -2, x2: -15, z2: 4 },
    { id: 'off-w4', name: 'OFFICE', type: 'office', x1: -22, z1: 4, x2: -15, z2: 11 },
    { id: 'exec-sw', name: 'EXECUTIVE', type: 'executive', x1: -22, z1: 11, x2: -15, z2: 22 },

    // North row, west to east.
    { id: 'off-n1', name: 'OFFICE', type: 'office', x1: -15, z1: -22, x2: -5, z2: -15 },
    { id: 'break', name: 'BREAK', type: 'break', x1: -5, z1: -22, x2: 3, z2: -15 },
    { id: 'off-n2', name: 'OFFICE', type: 'office', x1: 3, z1: -22, x2: 15, z2: -15 },

    // East column, north to south.
    { id: 'exec-ne', name: 'EXECUTIVE', type: 'executive', x1: 15, z1: -22, x2: 22, z2: -12 },
    { id: 'men', name: 'MEN', type: 'restroom', x1: 15, z1: -12, x2: 22, z2: -5 },
    { id: 'stairs', name: 'STAIRS', type: 'stairs', x1: 15, z1: -5, x2: 22, z2: 1 },
    { id: 'women', name: 'WOMEN', type: 'restroom', x1: 15, z1: 1, x2: 22, z2: 8 },
    { id: 'off-e1', name: 'OFFICE', type: 'office', x1: 15, z1: 8, x2: 22, z2: 14 },
    { id: 'exec-se', name: 'EXECUTIVE', type: 'executive', x1: 15, z1: 14, x2: 22, z2: 22 },

    // South row, west to east.
    { id: 'off-s1', name: 'OFFICE', type: 'office', x1: -15, z1: 15, x2: -3, z2: 22 },
    { id: 'lobby', name: 'ENTRANCE', type: 'lobby', x1: -3, z1: 15, x2: 3, z2: 22 },
    { id: 'waiting', name: 'WAITING', type: 'waiting', x1: 3, z1: 15, x2: 15, z2: 22 },

    // Central core.
    { id: 'storage', name: 'STORAGE', type: 'storage', x1: -12.4, z1: -12.4, x2: 0, z2: -5 },
    { id: 'mech', name: 'MECH', type: 'mech', x1: 0, z1: -12.4, x2: 12.4, z2: -5 },
    { id: 'conference', name: 'CONFERENCE', type: 'conference', x1: -12.4, z1: -5, x2: 6, z2: 5 },
    { id: 'copy', name: 'COPY', type: 'copy', x1: 6, z1: -5, x2: 12.4, z2: 12.4 },
    { id: 'work', name: 'WORK', type: 'work', x1: -12.4, z1: 5, x2: 6, z2: 9.5 },
    { id: 'reception', name: 'RECEPTION', type: 'reception', x1: -12.4, z1: 9.5, x2: 6, z2: 12.4 },

    // Circulation ring. The west and east legs run the full height so the four
    // corners of the ring stay connected.
    { id: 'corr-w', name: '', type: 'corridor', x1: -15, z1: -15, x2: -12.4, z2: 15 },
    { id: 'corr-e', name: '', type: 'corridor', x1: 12.4, z1: -15, x2: 15, z2: 15 },
    { id: 'corr-n', name: '', type: 'corridor', x1: -12.4, z1: -15, x2: 12.4, z2: -12.4 },
    { id: 'corr-s', name: '', type: 'corridor', x1: -12.4, z1: 12.4, x2: 12.4, z2: 15 }
];

// A doorway punches a hole through whichever wall segment passes through it.
// `kind` drives what gets placed in the opening: a swinging leaf, an open
// cased opening, glass entrance doors, or the locked emergency stair door.
export const DOORWAYS = [
    // Perimeter rooms opening onto the west corridor.
    { x: -15, z: -18, width: 1.3, kind: 'swing' },
    { x: -15, z: -11, width: 1.3, kind: 'swing' },
    { x: -15, z: -5, width: 1.3, kind: 'swing' },
    { x: -15, z: 1, width: 1.3, kind: 'swing' },
    { x: -15, z: 7.5, width: 1.3, kind: 'swing' },
    { x: -15, z: 16, width: 1.3, kind: 'swing' },

    // East corridor.
    { x: 15, z: -17, width: 1.3, kind: 'swing' },
    { x: 15, z: -8.5, width: 1.2, kind: 'open' },
    { x: 15, z: -2, width: 1.5, kind: 'exit' },
    { x: 15, z: 4.5, width: 1.2, kind: 'open' },
    { x: 15, z: 11, width: 1.3, kind: 'swing' },
    { x: 15, z: 18, width: 1.3, kind: 'swing' },

    // North corridor.
    { x: -10, z: -15, width: 1.3, kind: 'swing' },
    { x: -1, z: -15, width: 2.4, kind: 'open' },
    { x: 9, z: -15, width: 1.3, kind: 'swing' },

    // South corridor.
    { x: -9, z: 15, width: 1.3, kind: 'swing' },
    { x: 0, z: 15, width: 3.0, kind: 'open' },
    { x: 9, z: 15, width: 2.4, kind: 'open' },

    // Core, facing the corridor ring.
    { x: -6, z: -12.4, width: 1.3, kind: 'swing' },
    { x: 6, z: -12.4, width: 1.3, kind: 'swing' },
    { x: -12.4, z: 0, width: 1.7, kind: 'swing' },
    { x: -12.4, z: 7, width: 1.3, kind: 'swing' },
    { x: 12.4, z: 3, width: 1.3, kind: 'swing' },
    { x: 0, z: 12.4, width: 2.6, kind: 'open' },
    { x: 9, z: 12.4, width: 1.3, kind: 'swing' },

    // Core internal connections.
    { x: -8, z: -5, width: 1.2, kind: 'swing' },
    { x: 0, z: -8, width: 1.2, kind: 'swing' },
    { x: 8, z: -5, width: 1.2, kind: 'swing' },
    { x: 6, z: 0, width: 1.2, kind: 'swing' },
    { x: 0, z: 5, width: 2.0, kind: 'open' },
    { x: 2, z: 9.5, width: 1.3, kind: 'open' },

    // Main entrance in the south facade.
    { x: 0, z: 22, width: 3.0, kind: 'glass' }
];

function h(z, x1, x2, extra = {}) { return { x1, z1: z, x2, z2: z, ...extra }; }
function v(x, z1, z2, extra = {}) { return { x1: x, z1, x2: x, z2, ...extra }; }

export const WALLS = [
    // Exterior shell.
    h(-HALF_EXTENT, -HALF_EXTENT, HALF_EXTENT, { exterior: true }),
    h(HALF_EXTENT, -HALF_EXTENT, HALF_EXTENT, { exterior: true }),
    v(-HALF_EXTENT, -HALF_EXTENT, HALF_EXTENT, { exterior: true }),
    v(HALF_EXTENT, -HALF_EXTENT, HALF_EXTENT, { exterior: true }),

    // Perimeter band inner faces.
    v(-PERIMETER, -HALF_EXTENT, HALF_EXTENT),
    v(PERIMETER, -HALF_EXTENT, HALF_EXTENT),
    h(-PERIMETER, -PERIMETER, PERIMETER),
    h(PERIMETER, -PERIMETER, PERIMETER),

    // West column dividers.
    h(-14, -HALF_EXTENT, -PERIMETER),
    h(-8, -HALF_EXTENT, -PERIMETER),
    h(-2, -HALF_EXTENT, -PERIMETER),
    h(4, -HALF_EXTENT, -PERIMETER),
    h(11, -HALF_EXTENT, -PERIMETER),

    // East column dividers.
    h(-12, PERIMETER, HALF_EXTENT),
    h(-5, PERIMETER, HALF_EXTENT),
    h(1, PERIMETER, HALF_EXTENT),
    h(8, PERIMETER, HALF_EXTENT),
    h(14, PERIMETER, HALF_EXTENT),

    // North and south row dividers.
    v(-5, -HALF_EXTENT, -PERIMETER),
    v(3, -HALF_EXTENT, -PERIMETER),
    v(-3, PERIMETER, HALF_EXTENT),
    v(3, PERIMETER, HALF_EXTENT),

    // Core shell.
    h(-CORE, -CORE, CORE),
    h(CORE, -CORE, CORE),
    v(-CORE, -CORE, CORE),
    v(CORE, -CORE, CORE),

    // Core internal.
    h(-5, -CORE, CORE),
    v(0, -CORE, -5),
    v(6, -5, CORE),
    h(5, -CORE, 6),
    h(9.5, -CORE, 6)
];

// Exterior glazing, expressed as centre points on the outer shell.
export const WINDOWS = [];
for (let i = 0; i < 5; i++) {
    const z = -18 + i * 9;
    WINDOWS.push({ x: -HALF_EXTENT, z, facing: 'west' });
    if (z < -6 || z > 9) WINDOWS.push({ x: HALF_EXTENT, z, facing: 'east' });
}
for (let i = 0; i < 5; i++) {
    const x = -18 + i * 9;
    WINDOWS.push({ x, z: -HALF_EXTENT, facing: 'north' });
    if (Math.abs(x) > 4) WINDOWS.push({ x, z: HALF_EXTENT, facing: 'south' });
}

export function roomCenter(room) {
    return { x: (room.x1 + room.x2) / 2, z: (room.z1 + room.z2) / 2 };
}

export function roomById(id) {
    return ROOMS.find((room) => room.id === id);
}

// Waypoints threaded around the corridor ring, used for monster patrols.
export const PATROL_LOOP = [
    { x: -13.7, z: -13.7 }, { x: 0, z: -13.7 }, { x: 13.7, z: -13.7 },
    { x: 13.7, z: 0 }, { x: 13.7, z: 13.7 }, { x: 0, z: 13.7 },
    { x: -13.7, z: 13.7 }, { x: -13.7, z: 0 }
];
