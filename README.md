# The Last Shift

A first-person survival horror game for the browser, built with Three.js and Vite.
No art assets: every texture, model and sound is generated at runtime.

## Story

You are Sagar, a software engineer working late on floor 12. The power fails, the
staff never made it out, and something is still moving between the executive
suites. Find the emergency stair key and get off the floor.

## Controls

| Input | Action |
|---|---|
| W A S D | Move |
| Mouse | Look |
| Shift | Sprint (drains breath) |
| F / Space / Left click | Toggle flashlight |
| E / Right click | Interact |
| Esc | Release the cursor |

Add `?lowspec=1` to the URL to disable the flashlight's shadow pass and cap the
pixel ratio. Worth trying on integrated graphics.

## Objective

1. Find the stair key. Maintenance left it on the workbench in **MECH**.
2. Get to the emergency stair door on the **east corridor** and unlock it.
3. Spare flashlight batteries are scattered around the floor; pick them up and
   press `E` away from any object to swap one in.

## The floor plan

The level is a direct translation of the office blueprint: a square donut with a
ring of perimeter rooms wrapped around a circulation corridor, which wraps a
central core.

```
            N
  +-------------------------+
  | EXEC | OFF |BRK| OFF |E  |
  |------+---------------|X  |
  | OFF  | +-----------+ |EC |
  | OFF  | |STORE| MECH| |---|
  | OFF  | |-----+-----| |MEN|
W | OFF  | | CONFERENCE| |STR| E
  |      | |-----------| |WMN|
  | OFF  | |   WORK    | |---|
  |------| |-----------| |OFF|
  | EXEC | | RECEPTION | |---|
  |      | +-----------+ |EXE|
  |------+---------------+---|
  | OFF     |ENTR| WAITING    |
  +-------------------------+
            S
```

Rooms, walls and doorways live as plain data in `src/floorplan.js`. Wall runs are
line segments; a doorway punches through whichever segment passes through it and
the geometry, header and door leaf are generated from that. Editing the layout
means editing the arrays, not the geometry code.

## Project structure

| File | Responsibility |
|---|---|
| `game.js` | Bootstrap, input, player movement, monster AI, objectives, UI |
| `src/floorplan.js` | Blueprint as data: rooms, wall segments, doorways, windows, patrol route |
| `src/level.js` | Builds geometry from the floorplan, furnishes rooms, owns collision and line-of-sight |
| `src/lighting.js` | Renderer/tone-mapping setup, ceiling fixtures, flashlight, storm |
| `src/characters.js` | Parametric humanoid rig for office staff and the three monsters |
| `src/materials.js` | Canvas-drawn textures (carpet, paint, ceiling tile, flesh, storm) |
| `src/audio.js` | Web Audio synthesis: drone, footsteps, heartbeat, growls |

## Running

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/
```

### Smoke test

`npm run smoke` boots the game in headless Chrome, walks it around the floor and
reports console errors, plus screenshots in `.smoke/`. It needs a dev server on
port 5183 and Chrome at `/usr/bin/google-chrome`:

```bash
npm run dev -- --port 5183 --strictPort
npm run smoke
```

## Notes on the lighting

Three.js has used physical light units since r155, so intensities are in candela
rather than a 0..1 range. A ceiling fixture roughly 3m above the floor needs an
intensity around 30 to read as lit; values like `0.5` are effectively off. The
renderer uses ACES filmic tone mapping, without which the flashlight clips to
pure white on any nearby surface.
