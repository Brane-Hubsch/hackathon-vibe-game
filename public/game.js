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

    // Load duck image
    this.duckImage = new Image();
    this.duckImage.src = "/images/duck.png";
    this.duckImageLoaded = false;

    this.duckImage.onload = () => {
      this.duckImageLoaded = true;
    };

    // Load quack sound effects
    this.quackSounds = [];
    this.soundsLoaded = 0;

    for (let i = 1; i <= 7; i++) {
      const audio = new Audio(`/audio/quack${i}.mp3`);
      audio.preload = "auto";
      audio.volume = 1; // Adjust volume as needed

      audio.addEventListener("canplaythrough", () => {
        this.soundsLoaded++;
        console.log(`Quack${i}.mp3 loaded (${this.soundsLoaded}/7)`);
      });

      audio.addEventListener("error", (e) => {
        console.error(`Failed to load quack${i}.mp3:`, e);
      });

      this.quackSounds.push(audio);
    }

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

  setupSocketListeners() {
    this.socket.on("connect", () => {
      this.playerId = this.socket.id;
      // Auto-join lobby on connect
      this.enableAudio();
      this.socket.emit("joinLobby");
    });

    this.socket.on("joinedLobby", (data) => {
      this.lobbyId = data.lobbyId;
      this.showScreen("lobbyScreen");
    });

    this.socket.on("gameUpdate", (gameState) => {
      this.gameState = gameState;
      this.updateLobbyDisplay();
      this.updateGameInfo();

      if (this.gameState.gameState === "waiting") {
        this.showScreen("lobbyScreen");
      } else if (this.gameState.gameState === "finished") {
        this.showScreen("gameOverScreen");
      }
    });

    this.socket.on("gameStarted", (gameState) => {
      this.gameState = gameState;
      this.showScreen("gameScreen");
      this.playRandomQuack();
    });

    this.socket.on("error", (error) => {
      alert(error.message);
    });

    this.socket.on("duckCollision", (data) => {
      // Play quack sound when any duck collision happens
      console.log("🦆 Duck collision - playing quack!");
      this.playRandomQuack();
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

  enableAudio() {
    // Pre-load and enable audio on user interaction
    console.log("Enabling audio with", this.quackSounds.length, "quack sounds");

    this.quackSounds.forEach((audio, index) => {
      audio.load();
      // Test play one sound to unlock audio context
      if (index === 0) {
        audio
          .play()
          .then(() => {
            console.log("Audio context unlocked successfully");
            audio.pause();
            audio.currentTime = 0;
          })
          .catch((error) => {
            console.log("Audio unlock failed:", error);
          });
      }
    });
  }

  playRandomQuack() {
    if (this.quackSounds.length === 0) {
      console.log("No quack sounds loaded");
      return;
    }

    // Pick a random quack sound
    const randomIndex = Math.floor(Math.random() * this.quackSounds.length);
    const selectedQuack = this.quackSounds[randomIndex];

    console.log(`Playing quack${randomIndex + 1}.mp3`);

    // Reset the audio to beginning in case it was already playing
    selectedQuack.currentTime = 0;

    // Play the sound (with error handling for browser audio policies)
    selectedQuack
      .play()
      .then(() => {
        console.log("Quack played successfully");
      })
      .catch((error) => {
        console.log("Audio play failed:", error);
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

    this.gameState.players.forEach((player, index) => {
      const playerCard = document.createElement("div");
      playerCard.className = "player-card";
      playerCard.style.borderColor = player.color;
      playerCard.textContent = `Duck ${index + 1}`;
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
        winnerInfo.innerHTML = "<p>Another duck won this round!</p>";
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

    // Clear canvas with soft cream background
    ctx.fillStyle = "#faf9f7";
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

    // Draw arena background - slightly darker than game background
    ctx.fillStyle = "#f0efe9";
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

    // Draw center circle - darker for visibility on light background
    ctx.fillStyle = "#7f8c8d";
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  drawDuck(ctx, player) {
    if (!this.duckImageLoaded) {
      // Fallback: draw a simple circle if image isn't loaded yet
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2); // Increased to match new duck size
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle + Math.PI / 2); // Add 90-degree rotation to fix orientation

    // Draw the duck image (centered) - no color tinting needed
    const duckSize = 50; // Increased size for cuter, easier to hit ducks
    ctx.drawImage(
      this.duckImage,
      -duckSize / 2,
      -duckSize / 2,
      duckSize,
      duckSize
    );

    // No player names displayed

    // Highlight own duck with pulsing effect
    if (player.id === this.playerId) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2); // Adjusted for larger duck size
      ctx.stroke();

      // Add a subtle glow effect
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#ffffff";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 36, 0, Math.PI * 2); // Adjusted for larger duck size
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }
}

// Initialize game when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new RadioDuckGame();
});
