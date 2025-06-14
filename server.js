const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Game state
const lobbies = new Map();
const players = new Map();

// Game constants
const GAME_CONFIG = {
  ARENA_RADIUS: 300,
  CAR_SIZE: 20,
  MAX_PLAYERS: 6,
  RESPAWN_TIME: 3000,
  GAME_DURATION: 300000, // 5 minutes
};

class Game {
  constructor(lobbyId) {
    this.id = lobbyId;
    this.players = new Map();
    this.gameState = "waiting"; // waiting, playing, finished
    this.startTime = null;
    this.winner = null;
  }

  addPlayer(playerId, playerData) {
    if (this.players.size >= GAME_CONFIG.MAX_PLAYERS) {
      return false;
    }

    const angle = (this.players.size * (Math.PI * 2)) / GAME_CONFIG.MAX_PLAYERS;
    const spawnRadius = GAME_CONFIG.ARENA_RADIUS * 0.7;

    this.players.set(playerId, {
      id: playerId,
      name: playerData.name,
      x: Math.cos(angle) * spawnRadius,
      y: Math.sin(angle) * spawnRadius,
      vx: 0,
      vy: 0,
      angle: angle + Math.PI,
      alive: true,
      score: 0,
      color: this.getPlayerColor(this.players.size),
    });

    return true;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    if (this.players.size <= 1 && this.gameState === "playing") {
      this.endGame();
    }
  }

  getPlayerColor(index) {
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#96CEB4",
      "#FFEAA7",
      "#DDA0DD",
    ];
    return colors[index % colors.length];
  }

  startGame() {
    if (this.players.size < 2) return false;

    this.gameState = "playing";
    this.startTime = Date.now();

    // Reset all players
    this.players.forEach((player) => {
      player.alive = true;
    });

    return true;
  }

  updatePlayer(playerId, input) {
    const player = this.players.get(playerId);
    if (!player || !player.alive) return;

    const acceleration = 0.5;
    const maxSpeed = 4;
    const friction = 0.95;
    const rotationSpeed = 0.1;

    // Handle input
    if (input.left) player.angle -= rotationSpeed;
    if (input.right) player.angle += rotationSpeed;

    if (input.forward) {
      player.vx += Math.cos(player.angle) * acceleration;
      player.vy += Math.sin(player.angle) * acceleration;
    }
    if (input.backward) {
      player.vx -= Math.cos(player.angle) * acceleration * 0.5;
      player.vy -= Math.sin(player.angle) * acceleration * 0.5;
    }

    // Apply friction
    player.vx *= friction;
    player.vy *= friction;

    // Limit speed
    const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (speed > maxSpeed) {
      player.vx = (player.vx / speed) * maxSpeed;
      player.vy = (player.vy / speed) * maxSpeed;
    }

    // Update position
    player.x += player.vx;
    player.y += player.vy;

    // Check if player fell off
    const distanceFromCenter = Math.sqrt(
      player.x * player.x + player.y * player.y
    );
    if (distanceFromCenter > GAME_CONFIG.ARENA_RADIUS) {
      player.alive = false;
      this.checkGameEnd();
    }
  }

  handleCollisions() {
    const players = Array.from(this.players.values()).filter((p) => p.alive);

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const p1 = players[i];
        const p2 = players[j];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < GAME_CONFIG.CAR_SIZE) {
          // Simple collision response
          const overlap = GAME_CONFIG.CAR_SIZE - distance;
          const separateX = (dx / distance) * overlap * 0.5;
          const separateY = (dy / distance) * overlap * 0.5;

          p1.x -= separateX;
          p1.y -= separateY;
          p2.x += separateX;
          p2.y += separateY;

          // Exchange some velocity
          const tempVx = p1.vx;
          const tempVy = p1.vy;
          p1.vx = p2.vx * 0.8;
          p1.vy = p2.vy * 0.8;
          p2.vx = tempVx * 0.8;
          p2.vy = tempVy * 0.8;
        }
      }
    }
  }

  checkGameEnd() {
    const alivePlayers = Array.from(this.players.values()).filter(
      (p) => p.alive
    );
    if (alivePlayers.length <= 1) {
      this.endGame();
    }
  }

  endGame() {
    this.gameState = "finished";
    const alivePlayers = Array.from(this.players.values()).filter(
      (p) => p.alive
    );
    this.winner = alivePlayers.length > 0 ? alivePlayers[0] : null;
  }

  getGameState() {
    return {
      id: this.id,
      players: Array.from(this.players.values()),
      gameState: this.gameState,
      timeLeft:
        this.gameState === "playing"
          ? Math.max(
              0,
              GAME_CONFIG.GAME_DURATION - (Date.now() - this.startTime)
            )
          : 0,
      winner: this.winner,
    };
  }
}

// Socket handling
io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("joinLobby", (data) => {
    const { lobbyId, playerName } = data;
    let lobby;

    if (lobbyId && lobbies.has(lobbyId)) {
      lobby = lobbies.get(lobbyId);
    } else {
      const newLobbyId = uuidv4();
      lobby = new Game(newLobbyId);
      lobbies.set(newLobbyId, lobby);
    }

    if (lobby.addPlayer(socket.id, { name: playerName })) {
      socket.join(lobby.id);
      players.set(socket.id, { lobbyId: lobby.id, name: playerName });

      socket.emit("joinedLobby", { lobbyId: lobby.id });
      io.to(lobby.id).emit("gameUpdate", lobby.getGameState());
    } else {
      socket.emit("error", { message: "Lobby is full" });
    }
  });

  socket.on("startGame", () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const lobby = lobbies.get(playerData.lobbyId);
    if (lobby && lobby.startGame()) {
      io.to(lobby.id).emit("gameStarted", lobby.getGameState());
    }
  });

  socket.on("playerInput", (input) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const lobby = lobbies.get(playerData.lobbyId);
    if (lobby && lobby.gameState === "playing") {
      lobby.updatePlayer(socket.id, input);
    }
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);

    const playerData = players.get(socket.id);
    if (playerData) {
      const lobby = lobbies.get(playerData.lobbyId);
      if (lobby) {
        lobby.removePlayer(socket.id);
        io.to(lobby.id).emit("gameUpdate", lobby.getGameState());

        if (lobby.players.size === 0) {
          lobbies.delete(lobby.id);
        }
      }
      players.delete(socket.id);
    }
  });
});

// Game loop
setInterval(() => {
  lobbies.forEach((lobby) => {
    if (lobby.gameState === "playing") {
      lobby.handleCollisions();
      io.to(lobby.id).emit("gameUpdate", lobby.getGameState());
    }
  });
}, 1000 / 60); // 60 FPS

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Radio Car Game server running on port ${PORT}`);
});
