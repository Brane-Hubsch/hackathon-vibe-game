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

    this.setupCanvas();
    this.setupEventListeners();
    this.setupSocketListeners();
    this.gameLoop();
    
    // Setup QR code after a short delay to ensure DOM is ready
    setTimeout(() => {
      this.setupQRCode();
    }, 500);
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

  setupQRCode() {
    // Generate QR code pointing to the game URL
    const gameUrl = window.location.origin;
    const qrCanvas = document.getElementById('qrcode');
    
    if (qrCanvas) {
      // Set canvas size explicitly
      qrCanvas.width = 150;
      qrCanvas.height = 150;
      
      if (typeof QRCode !== 'undefined') {
        QRCode.toCanvas(qrCanvas, gameUrl, {
          width: 150,
          height: 150,
          margin: 2,
          color: {
            dark: '#000000',    // Black QR code
            light: '#FFFFFF'    // White background
          },
          errorCorrectionLevel: 'M'
        }, (error) => {
          if (error) {
            console.error('QR Code generation failed:', error);
            this.createFallbackQR(qrCanvas, gameUrl);
          } else {
            console.log('QR Code generated successfully');
          }
        });
      } else {
        console.error('QRCode library not loaded');
        this.createFallbackQR(qrCanvas, gameUrl);
      }
    }
  }

  createFallbackQR(canvas, url) {
    // Fallback: create a simple text-based indicator
    const ctx = canvas.getContext('2d');
    canvas.width = 150;
    canvas.height = 150;
    
    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 150, 150);
    
    // Black border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 150, 150);
    
    // Text
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('QR CODE', 75, 70);
    ctx.fillText('FAILED', 75, 90);
    
    console.log('Using fallback QR display');
  }

  setupEventListeners() {
    // Spectator controls
    document.getElementById("spectatorStartGameBtn").addEventListener("click", () => {
      this.socket.emit("startGame");
    });
  }

  setupSocketListeners() {
    this.socket.on("connect", () => {
      console.log("Connected as spectator, joining main lobby...");
      this.socket.emit("spectateGame");
    });

    this.socket.on("gameUpdate", (gameState) => {
      this.gameState = gameState;
    });
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
    ctx.fillStyle = "#faf9f7";
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
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle + Math.PI / 2); // Add 90-degree rotation to fix orientation

    // Draw the duck image (centered)
    const duckSize = 40;
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
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

// Initialize spectator when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new RadioDuckSpectator();
}); 