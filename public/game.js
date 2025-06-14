class RadioCarGame {
  constructor() {
    this.socket = io();
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.gameState = null;
    this.playerId = null;
    this.lobbyId = null;
    this.input = {
      forward: false,
      backward: false,
      left: false,
      right: false,
    };

    this.setupCanvas();
    this.setupEventListeners();
    this.setupSocketListeners();
    this.gameLoop();
  }

  setupCanvas() {
    const resizeCanvas = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
  }

  setupEventListeners() {
    // Login form
    document.getElementById("joinGameBtn").addEventListener("click", () => {
      const playerName = document
        .getElementById("playerNameInput")
        .value.trim();
      const lobbyId = document.getElementById("lobbyIdInput").value.trim();

      if (!playerName) {
        alert("Please enter your name!");
        return;
      }

      this.socket.emit("joinLobby", { playerName, lobbyId });
    });

    // Lobby controls
    document.getElementById("startGameBtn").addEventListener("click", () => {
      this.socket.emit("startGame");
    });

    document.getElementById("copyLobbyBtn").addEventListener("click", () => {
      if (this.lobbyId) {
        navigator.clipboard.writeText(this.lobbyId).then(() => {
          const btn = document.getElementById("copyLobbyBtn");
          const originalText = btn.textContent;
          btn.textContent = "Copied!";
          setTimeout(() => {
            btn.textContent = originalText;
          }, 2000);
        });
      }
    });

    // Game over controls
    document.getElementById("playAgainBtn").addEventListener("click", () => {
      this.showScreen("lobbyScreen");
    });

    document.getElementById("newLobbyBtn").addEventListener("click", () => {
      this.showScreen("loginScreen");
    });

    // Touch controls
    this.setupTouchControls();

    // Keyboard controls (for desktop testing)
    document.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          this.input.forward = true;
          break;
        case "ArrowDown":
        case "s":
        case "S":
          this.input.backward = true;
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          this.input.left = true;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          this.input.right = true;
          break;
      }
    });

    document.addEventListener("keyup", (e) => {
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          this.input.forward = false;
          break;
        case "ArrowDown":
        case "s":
        case "S":
          this.input.backward = false;
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          this.input.left = false;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          this.input.right = false;
          break;
      }
    });
  }

  setupTouchControls() {
    const buttons = {
      forwardBtn: "forward",
      backwardBtn: "backward",
      leftBtn: "left",
      rightBtn: "right",
    };

    Object.entries(buttons).forEach(([btnId, inputKey]) => {
      const btn = document.getElementById(btnId);

      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.input[inputKey] = true;
        btn.classList.add("pressed");
      });

      btn.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.input[inputKey] = false;
        btn.classList.remove("pressed");
      });

      btn.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        this.input[inputKey] = false;
        btn.classList.remove("pressed");
      });

      // Mouse events for desktop
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.input[inputKey] = true;
        btn.classList.add("pressed");
      });

      btn.addEventListener("mouseup", (e) => {
        e.preventDefault();
        this.input[inputKey] = false;
        btn.classList.remove("pressed");
      });

      btn.addEventListener("mouseleave", (e) => {
        e.preventDefault();
        this.input[inputKey] = false;
        btn.classList.remove("pressed");
      });
    });
  }

  setupSocketListeners() {
    this.socket.on("connect", () => {
      this.playerId = this.socket.id;
    });

    this.socket.on("joinedLobby", (data) => {
      this.lobbyId = data.lobbyId;
      document.getElementById("currentLobbyId").textContent = this.lobbyId;
      this.showScreen("lobbyScreen");
    });

    this.socket.on("gameUpdate", (gameState) => {
      this.gameState = gameState;
      this.updateLobbyDisplay();
      this.updateGameInfo();
    });

    this.socket.on("gameStarted", (gameState) => {
      this.gameState = gameState;
      this.showScreen("gameScreen");
    });

    this.socket.on("error", (error) => {
      alert(error.message);
    });
  }

  showScreen(screenId) {
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.remove("active");
    });
    document.getElementById(screenId).classList.add("active");
  }

  updateLobbyDisplay() {
    if (!this.gameState) return;

    const container = document.getElementById("playersContainer");
    container.innerHTML = "";

    this.gameState.players.forEach((player) => {
      const playerCard = document.createElement("div");
      playerCard.className = "player-card";
      playerCard.style.borderColor = player.color;
      playerCard.textContent = player.name;
      container.appendChild(playerCard);
    });

    const startBtn = document.getElementById("startGameBtn");
    startBtn.style.display =
      this.gameState.players.length >= 2 ? "block" : "none";
  }

  updateGameInfo() {
    if (!this.gameState) return;

    if (this.gameState.gameState === "playing") {
      const timeLeft = Math.ceil(this.gameState.timeLeft / 1000);
      const minutes = Math.floor(timeLeft / 60);
      const seconds = timeLeft % 60;
      document.getElementById(
        "timeLeft"
      ).textContent = `Time: ${minutes}:${seconds.toString().padStart(2, "0")}`;

      const alivePlayers = this.gameState.players.filter((p) => p.alive).length;
      document.getElementById(
        "playersAlive"
      ).textContent = `Players: ${alivePlayers}`;
    }

    if (this.gameState.gameState === "finished") {
      this.showGameOver();
    }
  }

  showGameOver() {
    const winnerInfo = document.getElementById("winnerInfo");
    if (this.gameState.winner) {
      if (this.gameState.winner.id === this.playerId) {
        document.getElementById("gameOverTitle").textContent = "You Won! 🏆";
        winnerInfo.innerHTML =
          "<p>Congratulations! You are the last car standing!</p>";
      } else {
        document.getElementById("gameOverTitle").textContent = "Game Over";
        winnerInfo.innerHTML = `<p>Winner: <strong>${this.gameState.winner.name}</strong></p>`;
      }
    } else {
      document.getElementById("gameOverTitle").textContent = "Game Over";
      winnerInfo.innerHTML = "<p>No winner this round!</p>";
    }

    this.showScreen("gameOverScreen");
  }

  gameLoop() {
    if (this.gameState && this.gameState.gameState === "playing") {
      // Send input to server
      this.socket.emit("playerInput", this.input);

      // Render game
      this.render();
    }

    requestAnimationFrame(() => this.gameLoop());
  }

  render() {
    if (!this.gameState || !this.canvas) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas
    ctx.fillStyle = "#2c3e50";
    ctx.fillRect(0, 0, width, height);

    // Calculate scale and center
    const scale = Math.min(width, height) / 700;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);

    // Draw arena
    this.drawArena(ctx);

    // Draw players
    this.gameState.players.forEach((player) => {
      if (player.alive) {
        this.drawCar(ctx, player);
      }
    });

    ctx.restore();
  }

  drawArena(ctx) {
    const radius = 300;

    // Draw arena background
    ctx.fillStyle = "#34495e";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw arena border
    ctx.strokeStyle = "#e74c3c";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw warning zone
    ctx.strokeStyle = "#f39c12";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, radius - 40, 0, Math.PI * 2);
    ctx.stroke();

    // Draw center circle
    ctx.fillStyle = "#95a5a6";
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCar(ctx, player) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);

    // Car body
    ctx.fillStyle = player.color;
    ctx.fillRect(-15, -10, 30, 20);

    // Car outline
    ctx.strokeStyle = "#2c3e50";
    ctx.lineWidth = 2;
    ctx.strokeRect(-15, -10, 30, 20);

    // Car front
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(10, -8, 8, 16);

    // Player name
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(player.name, 0, -20);

    // Highlight own car
    if (player.id === this.playerId) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

// Initialize game when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new RadioCarGame();
});
