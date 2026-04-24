const socket = io();

const joinBtn = document.getElementById("joinBtn");
const restartBtn = document.getElementById("restartBtn");
const roomInput = document.getElementById("roomId");
const playerInput = document.getElementById("playerName");
const statusEl = document.getElementById("status");
const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("scoreboard");

let state = null;
restartBtn.disabled = true;

function idx(r, c, cols) {
  return r * cols + c;
}

function renderScores(s) {
  const parts = s.players.map((p) => `${p}: ${s.scores[p] ?? 0}`);
  scoreEl.textContent = `分數 | ${parts.join(" | ")}`;
}

function renderBoard(s) {
  const { rows, cols } = s.config;
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${cols}, 34px)`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(r, c, cols);
      const revealed = s.visible[i] === "1";
      const flagged = s.flags[i] === "1";
      const exploded = s.exploded && s.exploded[i] === "1";
      const mineVisible = s.gameOver && s.mineMap && s.mineMap[i] === "1";

      const cell = document.createElement("div");
      cell.className = `cell ${revealed ? "revealed" : ""} ${exploded || mineVisible ? "mine" : ""}`;

      if (!revealed && flagged) {
        cell.textContent = "🚩";
      } else if (revealed && exploded) {
        cell.textContent = "💣";
      } else if (mineVisible) {
        cell.textContent = "💣";
      } else if (revealed) {
        cell.textContent = "·";
      }

      if (!s.gameOver) {
        cell.addEventListener("click", () => socket.emit("reveal_cell", { r, c }));
        cell.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          socket.emit("flag_cell", { r, c });
        });
      }
      boardEl.appendChild(cell);
    }
  }
}

joinBtn.addEventListener("click", () => {
  const roomId = roomInput.value.trim();
  const playerName = playerInput.value.trim();
  if (!roomId || !playerName) {
    statusEl.textContent = "請輸入房間代碼與玩家名稱";
    return;
  }
  socket.emit("join_room", { roomId, playerName });
});

restartBtn.addEventListener("click", () => {
  if (!state || !state.gameOver) {
    statusEl.textContent = "只能在遊戲結束後重新開局";
    return;
  }
  socket.emit("restart_game");
});

socket.on("state_update", (newState) => {
  state = newState;
  renderScores(state);
  renderBoard(state);
  restartBtn.disabled = !state.gameOver;
  statusEl.textContent = `房間玩家: ${state.players.join(", ")}${state.gameOver ? " | 遊戲結束" : ""}`;
});

socket.on("join_failed", ({ reason }) => {
  statusEl.textContent = `加入失敗: ${reason}`;
});

socket.on("server_error", ({ message }) => {
  statusEl.textContent = `伺服器錯誤: ${message}`;
});

socket.on("game_over", ({ scores, reason }) => {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const winner = entries[0] ? `${entries[0][0]} (${entries[0][1]}分)` : "無";
  statusEl.textContent = `遊戲結束，勝者: ${winner}${reason ? ` | ${reason}` : ""}`;
});

socket.on("game_restarted", ({ by }) => {
  statusEl.textContent = `新局開始（由 ${by} 重新開局）`;
});
