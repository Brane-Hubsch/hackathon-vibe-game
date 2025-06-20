class RadioDuckSpectator {
  constructor() {
    this.socket = io();
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.gameState = null;
    this.lobbyId = null;
    this.isSpectator = true;

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

    // Load winner sound
    this.winnerSound = new Audio("/audio/winner.mp3");
    this.winnerSound.preload = "auto";
    this.winnerSound.volume = 0.7; // Adjust volume as needed
    this.lastWinnerId = null; // Track the last winner to avoid replaying sound
    this.winnerSoundLoaded = false;

    this.winnerSound.addEventListener("canplaythrough", () => {
      this.winnerSoundLoaded = true;
    });

    this.winnerSound.addEventListener("error", (e) => {
      console.warn("Winner sound failed to load:", e);
    });

    this.countdownSound = new Audio("/audio/countdown.mp3");
    this.startSound = new Audio("/audio/sumoduck_4.mp3");

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
    // Spectator controls
    document
      .getElementById("spectatorStartGameBtn")
      .addEventListener("click", () => {
        this.enableAudio();
        this.countdownSound.currentTime = 0;
        this.countdownSound.play();
        this.socket.emit("startGame");

        setTimeout(() => {
          this.startSound.currentTime = 0;
          this.startSound.play();
        }, 2000);
      });
  }

  setupSocketListeners() {
    this.socket.on("connect", () => {
      this.socket.emit("spectateGame");
    });

    this.socket.on("gameUpdate", (gameState) => {
      this.gameState = gameState;
      this.updateWinnerDisplay();
    });

    this.socket.on("gameStarted", (gameState) => {
      this.gameState = gameState;
      this.updateWinnerDisplay(); // This will hide the winner display since game is now "playing"
      this.playRandomQuack();
    });

    this.socket.on("duckCollision", (data) => {
      // Play quack sound when any duck collision happens
      this.playRandomQuack();
    });
  }

  updateWinnerDisplay() {
    const winnerDisplay = document.getElementById("winnerDisplay");
    const winnerName = document.getElementById("winnerName");

    if (
      this.gameState &&
      this.gameState.gameState === "finished" &&
      this.gameState.winner
    ) {
      // Show winner display
      const winner = this.gameState.players.find(
        (player) => player.id === this.gameState.winner.id
      );
      const displayName = winner ? winner.name : "Unknown Duck";
      winnerName.textContent = displayName;
      winnerDisplay.classList.add("show");

      // Play winner sound
      if (this.gameState.winner.id !== this.lastWinnerId) {
        this.playWinnerSound();
        this.lastWinnerId = this.gameState.winner.id;
      }
    } else {
      // Hide winner display (when game is waiting or playing)
      winnerDisplay.classList.remove("show");
      this.lastWinnerId = null; // Reset so sound can play for next winner
    }
  }

  enableAudio() {
    // This needs to be called after a user interaction to enable audio
    const allSounds = [...this.quackSounds, this.winnerSound, this.countdownSound, this.startSound];
    allSounds.forEach((sound) => {
        if(sound.HAVE_CURRENT_DATA > 0) {
            sound.play().then(()=> {
                sound.pause();
                sound.currentTime = 0;
            }).catch(()=>{

            });
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

  playWinnerSound() {
    if (this.winnerSoundLoaded) {
      this.winnerSound.play();
    }
  }

  gameLoop() {
    if (this.gameState) {
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
    ctx.fillStyle = "#E8F9FF";
    ctx.fillRect(0, 0, width, height);

    // For spectators, show an overview of the entire arena
    // Calculate scale to show full arena
    const baseScale = Math.min(width, height) / 700; // Show more of the arena
    const scale = baseScale;

    // Center on arena center
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
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle + Math.PI / 2); // Add 90-degree rotation to fix orientation

    // Draw the duck image (centered)
    const duckSize = 70;
    ctx.drawImage(
      this.duckImage,
      -duckSize / 2,
      -duckSize / 2,
      duckSize,
      duckSize
    );

    // No player names displayed

    // Add colored border around each duck for spectator visibility
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

// Initialize spectator when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new RadioDuckSpectator();
});
