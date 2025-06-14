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

    // Input throttling
    this.lastInputSent = 0;
    this.inputThrottleMs = 33; // Send input max every 33ms (30 FPS)
    this.lastInput = { ...this.input };

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
      // Get the device's pixel ratio for high-DPI scaling
      const dpr = window.devicePixelRatio || 1;

      // Get the actual display size of the canvas element
      const rect = this.canvas.getBoundingClientRect();

      // Set canvas internal size to match display size scaled by DPR
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;

      // Set CSS size to maintain original display size
      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;
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

      // Get stored duck name from localStorage if available
      const storedDuckName = localStorage.getItem("sumoduck_player_name");
      this.socket.emit("joinLobby", { preferredName: storedDuckName });
    });

    this.socket.on("joinedLobby", (data) => {
      this.lobbyId = data.lobbyId;

      // Store the assigned duck name in localStorage for future sessions
      if (data.playerName) {
        localStorage.setItem("sumoduck_player_name", data.playerName);
      }

      this.showScreen("lobbyScreen");
    });

    this.socket.on("game-starting", () => {
      this.showScreen("gameScreen");
      const countdownElement = document.getElementById("countdown");
      countdownElement.style.display = "block";
      let count = 2;
      countdownElement.textContent = count;

      const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
          countdownElement.textContent = count;
        } else if (count === 0) {
          countdownElement.textContent = "GO!";
        } else {
          clearInterval(countdownInterval);
          countdownElement.style.display = "none";
        }
      }, 1000);
    });

    this.socket.on("gameUpdate", (gameState) => {
      this.gameState = gameState;
      this.updateLobbyDisplay();

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
      this.playRandomQuack();
    });
  }

  setupJoystickControls() {
    const joystickBase = document.getElementById("joystickBase");
    const joystickKnob = document.getElementById("joystickKnob");

    if (!joystickBase || !joystickKnob) return;

    const updateBasePosition = () => {
      const rect = joystickBase.getBoundingClientRect();
      this.joystick.baseX = rect.left + rect.width / 2;
      this.joystick.baseY = rect.top + rect.height / 2;
    };

    const startJoystick = (e, pointer) => {
      e.preventDefault();
      updateBasePosition();
      this.joystick.active = true;
      this.handleJoystickMove(pointer);
    };

    const moveJoystick = (e, pointer) => {
      if (this.joystick.active) {
        e.preventDefault();
        this.handleJoystickMove(pointer);
      }
    };

    const endJoystick = (e) => {
      if (this.joystick.active) {
        e.preventDefault();
        this.joystick.active = false;
        this.resetJoystick();
      }
    };

    const elements = [joystickBase, joystickKnob];
    elements.forEach((el) => {
      el.addEventListener("touchstart", (e) => startJoystick(e, e.touches[0]));
      el.addEventListener("mousedown", (e) => startJoystick(e, e));
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    });

    document.addEventListener("touchmove", (e) =>
      moveJoystick(e, e.touches[0])
    );
    document.addEventListener("mousemove", (e) => moveJoystick(e, e));
    document.addEventListener("touchend", endJoystick);
    document.addEventListener("mouseup", endJoystick);

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
    this.quackSounds.forEach((audio, index) => {
      audio.load();
      // Test play one sound to unlock audio context
      if (index === 0) {
        audio
          .play()
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
          })
          .catch((error) => {});
      }
    });
  }

  playRandomQuack() {
    if (this.quackSounds.length === 0) {
      return;
    }

    // Pick a random quack sound
    const randomIndex = Math.floor(Math.random() * this.quackSounds.length);
    const selectedQuack = this.quackSounds[randomIndex];

    // Reset the audio to beginning in case it was already playing
    selectedQuack.currentTime = 0;

    // Play the sound (with error handling for browser audio policies)
    selectedQuack.play();
  }

  showScreen(screenId) {
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.remove("active");
    });
    document.getElementById(screenId).classList.add("active");
  }

  updateLobbyDisplay() {
    if (!this.gameState) return;

    // Find the current player to show their duck name
    const myPlayer = this.gameState.players.find(
      (player) => player.id === this.playerId
    );

    if (myPlayer) {
      const userDuckNameElement = document.getElementById("userDuckName");
      if (userDuckNameElement) {
        userDuckNameElement.textContent = myPlayer.name || "Duck";
      }
    }

    const startBtn = document.getElementById("startGameBtn");
    if (startBtn) {
      startBtn.style.display =
        this.gameState.players.length >= 2 ? "block" : "none";
    }
  }

  showGameOver() {
    this.showScreen("gameOverScreen");
    const winnerInfo = document.getElementById("winnerInfo");
    const gameOverTitle = document.getElementById("gameOverTitle");
    if (this.gameState.winner) {
      if (this.gameState.winner.id === this.playerId) {
        gameOverTitle.textContent = "You Won! 🏆";
        winnerInfo.textContent =
          "Congratulations! You are the last duck standing!";
      } else {
        gameOverTitle.textContent = "Game Over";
        winnerInfo.textContent = "Another duck won this round!";
      }
    } else {
      gameOverTitle.textContent = "Game Over";
      winnerInfo.textContent = "It's a draw!";
    }
  }

  gameLoop() {
    if (this.gameState && this.gameState.gameState === "playing") {
      // Throttle input sending to reduce network traffic
      const now = Date.now();
      const inputChanged =
        JSON.stringify(this.input) !== JSON.stringify(this.lastInput);

      if (inputChanged || now - this.lastInputSent > this.inputThrottleMs) {
        this.socket.emit("playerInput", this.input);
        this.lastInput = { ...this.input };
        this.lastInputSent = now;
      }

      // Render game
      this.render();
    }

    requestAnimationFrame(() => this.gameLoop());
  }

  render() {
    if (!this.gameState || !this.canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas with soft cream background
    ctx.fillStyle = "#E8F9FF";
    ctx.fillRect(0, 0, width, height);

    // Find player's duck for camera following
    const myPlayer = this.gameState.players.find((p) => p.id === this.playerId);

    // Adjust scale for high-DPI displays
    const displayWidth = width / dpr;
    const displayHeight = height / dpr;
    const baseScale = Math.min(displayWidth, displayHeight) / 300;
    const scale = baseScale * dpr;

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

    // Draw arena border
    ctx.strokeStyle = "#e74c3c";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
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
