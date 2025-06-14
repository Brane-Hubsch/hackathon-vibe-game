const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Game constants
const GAME_CONFIG = {
  ARENA_RADIUS: 300,
  DUCK_SIZE: 25, // Increased to match larger duck visuals
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
    this.lastCollisions = new Map(); // Track collision cooldowns
  }

  addPlayer(playerId, playerData) {
    if (this.players.size >= GAME_CONFIG.MAX_PLAYERS) {
      return false;
    }

    const angle = (this.players.size * (Math.PI * 2)) / GAME_CONFIG.MAX_PLAYERS;
    const spawnRadius = GAME_CONFIG.ARENA_RADIUS * 0.7;

    this.players.set(playerId, {
      id: playerId,
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
    // This method can now be called at any time to start/restart.
    if (this.players.size < 2) {
      console.log("Spectator tried to start game with less than 2 players.");
      return false;
    }

    console.log("Starting/restarting game...");
    this.gameState = "playing";
    this.startTime = Date.now();
    this.winner = null;

    // Reset all players to spawn positions
    const playersArray = Array.from(this.players.values());

    playersArray.forEach((player, index) => {
      const angle = (index * (Math.PI * 2)) / GAME_CONFIG.MAX_PLAYERS;
      const spawnRadius = GAME_CONFIG.ARENA_RADIUS * 0.7;

      const p = this.players.get(player.id);
      p.x = Math.cos(angle) * spawnRadius;
      p.y = Math.sin(angle) * spawnRadius;
      p.vx = 0;
      p.vy = 0;
      p.angle = angle + Math.PI;
      p.alive = true;
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

    // Debug: Only log when we have players to check
    // (Removed excessive logging since audio is working)

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const p1 = players[i];
        const p2 = players[j];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < GAME_CONFIG.DUCK_SIZE) {
          // Check collision cooldown to prevent getting stuck
          const collisionKey = `${p1.id}-${p2.id}`;
          const reverseKey = `${p2.id}-${p1.id}`;
          const now = Date.now();
          const cooldownTime = 200; // 200ms cooldown between same pair collisions

          const lastCollision = Math.max(
            this.lastCollisions.get(collisionKey) || 0,
            this.lastCollisions.get(reverseKey) || 0
          );

          if (now - lastCollision < cooldownTime) {
            continue; // Skip this collision, still in cooldown
          }

          console.log(
            `Duck collision: ${p1.name} vs ${
              p2.name
            } (distance: ${distance.toFixed(1)})`
          );

          // Much more aggressive separation to prevent sticking
          const overlap = GAME_CONFIG.DUCK_SIZE - distance;
          const separationForce = 2.0; // Increased separation force
          const separateX = (dx / distance) * overlap * separationForce;
          const separateY = (dy / distance) * overlap * separationForce;

          p1.x -= separateX;
          p1.y -= separateY;
          p2.x += separateX;
          p2.y += separateY;

          // Much stronger velocity transfer for bouncy collisions
          const pushForce = 2.5; // Significantly increased from 1.2
          const velocityTransfer = 0.5; // Reduced velocity transfer to make bounces cleaner
          const tempVx = p1.vx;
          const tempVy = p1.vy;

          p1.vx = p2.vx * velocityTransfer + (dx / distance) * pushForce;
          p1.vy = p2.vy * velocityTransfer + (dy / distance) * pushForce;
          p2.vx = tempVx * velocityTransfer - (dx / distance) * pushForce;
          p2.vy = tempVy * velocityTransfer - (dy / distance) * pushForce;

          // Record collision time for cooldown
          this.lastCollisions.set(collisionKey, now);

          // Emit collision sound event to all players in the lobby
          io.to(this.id).emit("duckCollision", {
            player1: p1.id,
            player2: p2.id,
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2,
          });
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

    // The game stays in "finished" state. The spectator must restart it.
    io.to(this.id).emit("gameUpdate", this.getGameState());
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

// Game state
const SINGLE_LOBBY_ID = "radio-duck-main-lobby";
const lobbies = new Map();
lobbies.set(SINGLE_LOBBY_ID, new Game(SINGLE_LOBBY_ID));
const players = new Map();
const spectators = new Map(); // Track spectators

// Socket handling
io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("joinLobby", () => {
    const lobby = lobbies.get(SINGLE_LOBBY_ID);

    if (!lobby) {
      // This should not happen if the lobby is created at startup
      return socket.emit("error", { message: "The game server is not ready." });
    }

    if (lobby.addPlayer(socket.id, {})) {
      socket.join(lobby.id);
      players.set(socket.id, { lobbyId: lobby.id });

      socket.emit("joinedLobby", { lobbyId: lobby.id });
      io.to(lobby.id).emit("gameUpdate", lobby.getGameState());
    } else {
      socket.emit("error", { message: "Lobby is full" });
    }
  });

  socket.on("startGame", () => {
    // Spectator is not in the players map, so we don't look them up.
    // We know they are in the single lobby's room.
    const lobby = lobbies.get(SINGLE_LOBBY_ID);
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

  // Spectator functionality
  socket.on("spectateGame", () => {
    const lobby = lobbies.get(SINGLE_LOBBY_ID);

    if (!lobby) {
      socket.emit("gameNotFound");
      return;
    }

    // Join the lobby room as a spectator
    socket.join(lobby.id);
    spectators.set(socket.id, { lobbyId: lobby.id });

    socket.emit("spectateJoined", { lobbyId: lobby.id });
    socket.emit("gameUpdate", lobby.getGameState());

    // If game is already in progress, notify spectator
    if (lobby.gameState === "playing") {
      socket.emit("gameStarted", lobby.getGameState());
    }
  });

  socket.on("leaveSpectate", () => {
    const spectatorData = spectators.get(socket.id);
    if (spectatorData) {
      socket.leave(spectatorData.lobbyId);
      spectators.delete(socket.id);
    }
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);

    // Handle player disconnect
    const playerData = players.get(socket.id);
    if (playerData) {
      const lobby = lobbies.get(playerData.lobbyId);
      if (lobby) {
        lobby.removePlayer(socket.id);
        io.to(lobby.id).emit("gameUpdate", lobby.getGameState());
      }
      players.delete(socket.id);
    }

    // Handle spectator disconnect
    const spectatorData = spectators.get(socket.id);
    if (spectatorData) {
      socket.leave(spectatorData.lobbyId);
      spectators.delete(socket.id);
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
}, 1000 / 25); // 25 FPS

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Radio Duck Game server running on port ${PORT}`);
});
