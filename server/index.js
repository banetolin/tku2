const path = require("path");
const { spawnSync } = require("child_process");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const coreFileName = process.platform === "win32" ? "mines_core.exe" : "mines_core";
const CORE_EXE = process.env.CORE_EXE || path.join(__dirname, "..", "core", coreFileName);

const DEFAULT_CONFIG = {
  rows: 10,
  cols: 10,
  mines: 12
};

const rooms = new Map();

function emptyBits(len) {
  return "0".repeat(len);
}

function boardToMineBits(board) {
  return board
    .split("")
    .map((ch) => (ch === "*" ? "1" : "0"))
    .join("");
}

function parseKeyValues(line) {
  const out = {};
  for (const token of line.trim().split(/\s+/)) {
    const [k, ...rest] = token.split("=");
    if (!rest.length) {
      out[k] = true;
      continue;
    }
    out[k] = rest.join("=");
  }
  return out;
}

function runCore(args) {
  const proc = spawnSync(CORE_EXE, args, { encoding: "utf-8" });
  if (proc.error) {
    throw new Error(`Failed to run C core: ${proc.error.message}`);
  }
  if (proc.status !== 0) {
    const details = [proc.stdout, proc.stderr].filter(Boolean).join(" | ").trim() || "no output";
    throw new Error(`Core exited with code ${proc.status}: ${details}`);
  }
  const line = (proc.stdout || "").trim();
  if (!line.startsWith("ok")) {
    throw new Error(`Core error: ${(proc.stdout || proc.stderr || "unknown").trim()}`);
  }
  return parseKeyValues(line);
}

function initRoom(roomId) {
  const seed = Date.now() % 1000000007;
  const init = runCore([
    "init",
    String(DEFAULT_CONFIG.rows),
    String(DEFAULT_CONFIG.cols),
    String(DEFAULT_CONFIG.mines),
    String(seed)
  ]);
  const total = DEFAULT_CONFIG.rows * DEFAULT_CONFIG.cols;
  const room = {
    id: roomId,
    config: { ...DEFAULT_CONFIG },
    board: init.board,
    mineMap: boardToMineBits(init.board),
    visible: emptyBits(total),
    flags: emptyBits(total),
    exploded: emptyBits(total),
    players: [],
    scores: {},
    gameOver: false
  };
  rooms.set(roomId, room);
  return room;
}

function getPublicState(room) {
  return {
    config: room.config,
    visible: room.visible,
    flags: room.flags,
    mineMap: room.gameOver ? room.mineMap : emptyBits(room.config.rows * room.config.cols),
    exploded: room.exploded,
    scores: room.scores,
    players: room.players,
    gameOver: room.gameOver
  };
}

function ensureRoom(roomId) {
  return rooms.get(roomId) || initRoom(roomId);
}

function resetRoomState(room) {
  const seed = Date.now() % 1000000007;
  const init = runCore([
    "init",
    String(room.config.rows),
    String(room.config.cols),
    String(room.config.mines),
    String(seed)
  ]);
  const total = room.config.rows * room.config.cols;
  room.board = init.board;
  room.mineMap = boardToMineBits(init.board);
  room.visible = emptyBits(total);
  room.flags = emptyBits(total);
  room.exploded = emptyBits(total);
  room.gameOver = false;
  for (const p of room.players) {
    room.scores[p] = 0;
  }
}

app.use(express.static(path.join(__dirname, "..", "client")));

io.on("connection", (socket) => {
  socket.on("join_room", ({ roomId, playerName }) => {
    if (!roomId || !playerName) return;
    const room = ensureRoom(roomId);

    if (room.players.length >= 2 && !room.players.includes(playerName)) {
      socket.emit("join_failed", { reason: "Room is full (2 players max)." });
      return;
    }

    if (!room.players.includes(playerName)) {
      room.players.push(playerName);
      room.scores[playerName] = 0;
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.playerName = playerName;
    io.to(roomId).emit("state_update", getPublicState(room));
  });

  socket.on("reveal_cell", ({ r, c }) => {
    const { roomId, playerName } = socket.data;
    if (!roomId || !playerName) return;
    const room = rooms.get(roomId);
    if (!room || room.gameOver) return;

    try {
      const result = runCore([
        "reveal",
        String(room.config.rows),
        String(room.config.cols),
        room.board,
        room.visible,
        String(r),
        String(c)
      ]);
      room.visible = result.visible;

      const mine = Number(result.mine || 0);
      const newly = Number(result.newly || 0);
      if (mine) {
        room.scores[playerName] -= 5;
        const i = r * room.config.cols + c;
        room.exploded = room.exploded.substring(0, i) + "1" + room.exploded.substring(i + 1);
        room.gameOver = true;
      } else {
        room.scores[playerName] += newly;
        room.gameOver = Number(result.game_over || 0) === 1;
      }

      io.to(roomId).emit("state_update", getPublicState(room));
      if (room.gameOver) {
        io.to(roomId).emit("game_over", {
          scores: room.scores,
          reason: mine ? `${playerName} 踩到地雷` : "安全格已全部翻開"
        });
      }
    } catch (err) {
      socket.emit("server_error", { message: err.message });
    }
  });

  socket.on("flag_cell", ({ r, c }) => {
    const { roomId } = socket.data;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.gameOver) return;

    try {
      const result = runCore([
        "flag",
        String(room.config.rows),
        String(room.config.cols),
        room.visible,
        room.flags,
        String(r),
        String(c)
      ]);
      room.flags = result.flags;
      io.to(roomId).emit("state_update", getPublicState(room));
    } catch (err) {
      socket.emit("server_error", { message: err.message });
    }
  });

  socket.on("disconnect", () => {
    // Keep room state in memory so players can refresh and reconnect.
  });

  socket.on("restart_game", () => {
    const { roomId, playerName } = socket.data;
    if (!roomId || !playerName) return;
    const room = rooms.get(roomId);
    if (!room) return;
    if (!room.gameOver) {
      socket.emit("server_error", { message: "只能在遊戲結束後重新開局" });
      return;
    }

    try {
      resetRoomState(room);
      io.to(roomId).emit("state_update", getPublicState(room));
      io.to(roomId).emit("game_restarted", { by: playerName });
    } catch (err) {
      socket.emit("server_error", { message: err.message });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
