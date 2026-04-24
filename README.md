# Minesweeper Duel (C Core + Socket.IO)

This is a starter skeleton for a two-player online minesweeper project:

- C core handles game logic (`core/mines_core.c`)
- Node.js server handles rooms and real-time sync (`server/index.js`)
- Browser client renders the board (`client/*`)

## 1) Build C core

From project root:

```bash
cd core
gcc mines_core.c -O2 -o mines_core.exe
```

## 2) Install server dependencies

```bash
cd ../server
npm install
```

## 3) Run server

```bash
npm start
```

Open browser:

`http://localhost:3000`

## 4) Test two-player mode

1. Open two browser windows.
2. Enter the same room ID.
3. Use different player names.
4. Left click to reveal, right click to flag.

## Notes

- This is an MVP skeleton for class project use.
- Score rule:
  - reveal safe cells: `+ newly revealed cells`
  - hit mine: `-5`
- Game ends when all safe cells are revealed.

## Suggested next upgrades

- Hide mine hits from all players except the mover
- Add timer and room restart
- Add difficulty options
- Persist match history
