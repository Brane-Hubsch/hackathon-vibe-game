class RadioDuckGame {
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

    // Joystick state
    this.joystick = {
      active: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      baseX: 0,
      baseY: 0,
      maxDistance: 40, // half the base radius minus knob radius
    };

    this.setupCanvas();
    this.setupEventListeners();
    this.setupSocketListeners();
    this.gameLoop();
  }

  setupCanvas() {
    const resizeCanvas = () => {
      // Get the actual display size of the canvas element
      const rect = this.canvas.getBoundingClientRect();

      // Set canvas internal size to match display size for crisp rendering
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    };

    // Initial resize
    setTimeout(resizeCanvas, 100); // Delay to ensure CSS is applied
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
    this.setupJoystickControls();

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

  setupJoystickControls() {
    const joystickBase = document.getElementById("joystickBase");
    const joystickKnob = document.getElementById("joystickKnob");

    if (!joystickBase || !joystickKnob) return;

    // Get base center position
    const updateBasePosition = () => {
      const rect = joystickBase.getBoundingClientRect();
      this.joystick.baseX = rect.left + rect.width / 2;
      this.joystick.baseY = rect.top + rect.height / 2;
    };

    // Touch events
    joystickBase.addEventListener("touchstart", (e) => {
      e.preventDefault();
      updateBasePosition();
      this.joystick.active = true;
      this.handleJoystickMove(e.touches[0]);
    });

    document.addEventListener("touchmove", (e) => {
      if (this.joystick.active) {
        e.preventDefault();
        this.handleJoystickMove(e.touches[0]);
      }
    });

    document.addEventListener("touchend", (e) => {
      if (this.joystick.active) {
        e.preventDefault();
        this.joystick.active = false;
        this.resetJoystick();
      }
    });

    // Mouse events for desktop testing
    joystickBase.addEventListener("mousedown", (e) => {
      e.preventDefault();
      updateBasePosition();
      this.joystick.active = true;
      this.handleJoystickMove(e);
    });

    document.addEventListener("mousemove", (e) => {
      if (this.joystick.active) {
        e.preventDefault();
        this.handleJoystickMove(e);
      }
    });

    document.addEventListener("mouseup", (e) => {
      if (this.joystick.active) {
        e.preventDefault();
        this.joystick.active = false;
        this.resetJoystick();
      }
    });

    // Prevent context menu
    joystickBase.addEventListener("contextmenu", (e) => e.preventDefault());

    // Initial position update
    setTimeout(updateBasePosition, 100);
  }

  handleJoystickMove(pointer) {
    const deltaX = pointer.clientX - this.joystick.baseX;
    const deltaY = pointer.clientY - this.joystick.baseY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Limit movement to joystick base
    let x = deltaX;
    let y = deltaY;
    if (distance > this.joystick.maxDistance) {
      x = (deltaX / distance) * this.joystick.maxDistance;
      y = (deltaY / distance) * this.joystick.maxDistance;
    }

    // Update knob position
    const knob = document.getElementById("joystickKnob");
    knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

    // Convert to input
    const deadZone = 0.1;
    const normalizedX = x / this.joystick.maxDistance;
    const normalizedY = y / this.joystick.maxDistance;

    // Calculate angle and magnitude
    const angle = Math.atan2(normalizedY, normalizedX);
    const magnitude = Math.sqrt(
      normalizedX * normalizedX + normalizedY * normalizedY
    );

    if (magnitude > deadZone) {
      // Forward/backward based on Y axis (up is forward)
      this.input.forward = normalizedY < -deadZone;
      this.input.backward = normalizedY > deadZone;

      // Left/right based on X axis
      this.input.left = normalizedX < -deadZone;
      this.input.right = normalizedX > deadZone;
    } else {
      this.resetInput();
    }
  }

  resetJoystick() {
    const knob = document.getElementById("joystickKnob");
    knob.style.transform = "translate(-50%, -50%)";
    this.resetInput();
  }

  resetInput() {
    this.input.forward = false;
    this.input.backward = false;
    this.input.left = false;
    this.input.right = false;
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
          "<p>Congratulations! You are the last duck standing!</p>";
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

    // Find player's duck for camera following
    const myPlayer = this.gameState.players.find((p) => p.id === this.playerId);

    // Calculate scale - much more zoomed in for mobile visibility
    const baseScale = Math.min(width, height) / 300; // Much more zoom (was 500)
    const scale = baseScale;

    // Center on player or arena center if player not found
    let cameraX = 0;
    let cameraY = 0;

    if (myPlayer && myPlayer.alive) {
      cameraX = -myPlayer.x;
      cameraY = -myPlayer.y;
    }

    const centerX = width / 2;
    const centerY = height / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.translate(cameraX, cameraY);

    // Draw arena
    this.drawArena(ctx);

    // Draw players
    this.gameState.players.forEach((player) => {
      if (player.alive) {
        this.drawDuck(ctx, player);
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

  drawDuck(ctx, player) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);

    // Duck main body (large oval at bottom) - like in the image
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.ellipse(0, 6, 16, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Duck main body outline
    ctx.strokeStyle = "#2c3e50";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 6, 16, 12, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Duck chest/upper body (medium circle) - lighter color like in image
    ctx.fillStyle = this.lightenColor(player.color, 40);
    ctx.beginPath();
    ctx.arc(0, -2, 10, 0, Math.PI * 2);
    ctx.fill();

    // Duck chest outline
    ctx.strokeStyle = "#2c3e50";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -2, 10, 0, Math.PI * 2);
    ctx.stroke();

    // Duck head (small oval at top) - orange like in image
    ctx.fillStyle = "#ff6b47";
    ctx.beginPath();
    ctx.ellipse(0, -12, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Duck head outline
    ctx.strokeStyle = "#2c3e50";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -12, 7, 5, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Duck beak (small triangle pointing forward)
    ctx.fillStyle = "#ff8c00";
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(5, -13);
    ctx.lineTo(5, -11);
    ctx.closePath();
    ctx.fill();

    // Duck eyes (two small black dots)
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(-2, -13, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(2, -13, 1, 0, Math.PI * 2);
    ctx.fill();

    // Player name - bigger and more visible
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.strokeText(player.name, 0, -28);
    ctx.fillText(player.name, 0, -28);

    // Highlight own duck with pulsing effect
    if (player.id === this.playerId) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.stroke();

      // Add a subtle glow effect
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#ffffff";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  // Helper function to lighten colors for duck head
  lightenColor(color, percent) {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = ((num >> 8) & 0x00ff) + amt;
    const B = (num & 0x0000ff) + amt;
    return (
      "#" +
      (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
      )
        .toString(16)
        .slice(1)
    );
  }
}

// Initialize game when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new RadioDuckGame();
});
