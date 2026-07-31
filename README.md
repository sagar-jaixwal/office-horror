# The Last Shift - Horror Game

A psychological first-person survival horror game built for the web using Three.js.

## Story

You are **Sagar**, a 27-year-old software engineer working late in a corporate office. After everyone leaves, the power suddenly goes out, leaving only emergency red lights. Something evil lurks in the darkness...

## Gameplay Features

### Core Mechanics
- **First-Person Perspective** - Immersive 3D gameplay
- **Flashlight System** - Limited battery that drains over time
- **Stealth Survival** - No combat, only evasion
- **Ghost AI** - Intelligent ghosts that patrol and react to player actions

### Ghosts
1. **The Broken Head** - Office employee with cracked head, worms crawling
2. **The Acid Mouth** - Demon with acid-dripping mouth
3. **The Ceiling Crawler** - Spider-like creature on walls/ceiling
4. **The Shadow** - Appears only in reflections

### Fear System
- Heartbeat increases when ghosts are nearby
- Vision blurs and hands shake
- Flashlight shakes when afraid

## Controls

| Key | Action |
|-----|--------|
| W/A/S/D | Move |
| Mouse | Look Around |
| Left Click / Space | Toggle Flashlight |
| Shift | Run |
| E | Interact |

## Objective (Chapter 1)

1. Find the emergency stair key (glowing golden object on a desk)
2. Navigate through the dark office avoiding ghosts
3. Reach the emergency exit door (red door with green exit sign)
4. Escape to Floor 11

## Technical Details

- **Engine**: Three.js
- **Build Tool**: Vite
- **Graphics**: Real-time shadows, dynamic lighting, fog effects
- **Audio**: Procedural sound effects using Web Audio API
- **Platform**: Web Browser (Chrome, Firefox, Edge recommended)

## Installation & Running

### Development
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
```

The built files will be in the `dist/` folder and can be deployed to any static hosting service.

## Requirements

- Modern web browser with WebGL support
- JavaScript enabled
- Audio enabled for full experience

## Tips for Survival

1. **Conserve Battery** - Only use flashlight when necessary
2. **Listen Carefully** - Audio cues warn of nearby ghosts
3. **Stay Calm** - Running increases noise and attracts attention
4. **Hide When Needed** - Use desks and furniture for cover
5. **Watch Your Fear Level** - High fear affects movement and vision

---

*Inspired by Resident Evil 7, Outlast, and Visage*
