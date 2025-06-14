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
  MAX_PLAYERS: 10,
  RESPAWN_TIME: 3000,
  GAME_DURATION: 300000, // 5 minutes
};

// Funny duck names for players
const DUCK_NAMES = [
  "Quackers McGillicuddy",
  "Sir Paddington",
  "Waddles Von Flippers",
  "Captain Quackbeard",
  "Duchess Featherbutt",
  "Professor Mallard",
  "Squeaky McSplash",
  "Admiral Duckworth",
  "Lady Quackalot",
  "Baron Von Waddle",
  "Sir Flapsalot",
  "Puddles the Great",
  "Count Quackula",
  "Commodore Splash",
  "Princess Peep",
  "Duke Duckington",
  "Sir Honks-a-Lot",
  "Captain Featherbottom",
  "Madame Quacksworth",
  "General Gobbles",
  "Lord Splashington",
  "Dame Duckface",
  "Sir Squeaks",
  "Admiral Paddlefoot",
  "Baroness Billsworth",
  "Commander Quack",
  "Lady Webfoot",
  "Earl of Pondshire",
  "Sir Rubber Ducky",
  "Captain Mallardface",
];

class Game {
  constructor(lobbyId) {
    this.id = lobbyId;
    this.players = new Map();
    this.gameState = "waiting"; // waiting, playing, finished
    this.startTime = null;
    this.winner = null;
    this.lastCollisions = new Map(); // Track collision cooldowns
    this.lastSentState = null;
    this.lastCollisionSounds = new Map(); // Track collision sound cooldowns
    this.usedNames = new Set(); // Track used duck names to avoid duplicates
  }

  getRandomDuckName(preferredName = null) {
    // If a preferred name is provided and not currently used, use it
    if (preferredName && !this.usedNames.has(preferredName)) {
      this.usedNames.add(preferredName);
      return preferredName;
    }

    // Get available names (not used yet)
    const availableNames = DUCK_NAMES.filter(
      (name) => !this.usedNames.has(name)
    );

    // If all names are used, reset and start over (shouldn't happen with 30 names and max 6 players)
    if (availableNames.length === 0) {
      this.usedNames.clear();
      return DUCK_NAMES[Math.floor(Math.random() * DUCK_NAMES.length)];
    }

    // Pick a random available name
    const randomName =
      availableNames[Math.floor(Math.random() * availableNames.length)];
    this.usedNames.add(randomName);
    return randomName;
  }

  addPlayer(playerId, playerData) {
    if (this.players.size >= GAME_CONFIG.MAX_PLAYERS) {
      return false;
    }

    const angle = (this.players.size * (Math.PI * 2)) / GAME_CONFIG.MAX_PLAYERS;
    const spawnRadius = GAME_CONFIG.ARENA_RADIUS * 0.7;

    const assignedName = this.getRandomDuckName(playerData.preferredName);

    this.players.set(playerId, {
      id: playerId,
      name: assignedName,
      x: Math.cos(angle) * spawnRadius,
      y: Math.sin(angle) * spawnRadius,
      vx: 0,
      vy: 0,
      angle: angle + Math.PI,
      alive: true,
      score: 0,
      color: this.getPlayerColor(this.players.size),
    });

    return assignedName; // Return the assigned name
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player && player.name) {
      this.usedNames.delete(player.name); // Free up the name for reuse
    }
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
      return false;
    }

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

    // This turning logic is more direct. Instead of accumulating acceleration,
    // we now steer the duck's velocity towards the desired direction. This makes
    // turning much more responsive, as requested.
    const turnFactor = 0.3; // Increased from 0.25 for more responsiveness
    const maxSpeed = 12; // Must match maxSpeed in update()

    // Desired velocity from input
    let dx = 0;
    let dy = 0;

    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.forward) dy -= 1;
    if (input.backward) dy += 1;

    // If there is input, steer towards the target direction
    if (dx !== 0 || dy !== 0) {
      // Normalize diagonal movement
      if (dx !== 0 && dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy);
        dx /= length;
        dy /= length;
      }

      const targetVx = dx * maxSpeed;
      const targetVy = dy * maxSpeed;

      // Interpolate from current velocity to the target velocity
      player.vx += (targetVx - player.vx) * turnFactor;
      player.vy += (targetVy - player.vy) * turnFactor;
    }
  }

  update() {
    const maxSpeed = 12; // Increased max speed
    const friction = 0.92; // Slightly reduced friction for a smoother stop

    this.players.forEach((player) => {
      if (!player.alive) return;

      player.vx *= friction;
      player.vy *= friction;

      // Deadzone to prevent jittering when stopping
      if (Math.sqrt(player.vx * player.vx + player.vy * player.vy) < 0.1) {
        player.vx = 0;
        player.vy = 0;
      }

      // Update angle to face the direction of movement
      if (Math.abs(player.vx) > 0.1 || Math.abs(player.vy) > 0.1) {
        player.angle = Math.atan2(player.vy, player.vx);
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
    });
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

          // Much more aggressive separation to prevent sticking
          const overlap = GAME_CONFIG.DUCK_SIZE - distance;
          const separationForce = 2.0; // Increased separation force
          const separateX = (dx / distance) * overlap * separationForce;
          const separateY = (dy / distance) * overlap * separationForce;

          p1.x -= separateX;
          p1.y -= separateY;
          p2.x += separateX;
          p2.y += separateY;

          const repulsionForce = 10;
          const nx = dx / distance;
          const ny = dy / distance;

          // Repel p1
          p1.vx -= nx * repulsionForce;
          p1.vy -= ny * repulsionForce;

          // Repel p2
          p2.vx += nx * repulsionForce;
          p2.vy += ny * repulsionForce;

          // Record collision time for cooldown
          this.lastCollisions.set(collisionKey, now);

          // Throttle collision sound events to prevent audio spam
          const soundKey = `sound-${collisionKey}`;
          const lastSoundTime = this.lastCollisionSounds.get(soundKey) || 0;

          if (now - lastSoundTime > 200) {
            // Only emit sound every 200ms per pair
            io.to(this.id).emit("duckCollision", {
              player1: p1.id,
              player2: p2.id,
              x: (p1.x + p2.x) / 2,
              y: (p1.y + p2.y) / 2,
            });
            this.lastCollisionSounds.set(soundKey, now);
          }
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

  checkForChanges(gameState) {
    if (!this.lastSentState) return true;

    // Compare key game state properties instead of full JSON stringify
    const current = gameState.players;
    const last = this.lastSentState.players;

    if (current.length !== last.length) return true;

    for (let i = 0; i < current.length; i++) {
      const c = current[i];
      const l = last[i];

      // Check if position changed significantly (> 0.5 pixel for smoother movement)
      if (Math.abs(c.x - l.x) > 0.5 || Math.abs(c.y - l.y) > 0.5) return true;
      if (c.alive !== l.alive) return true;
    }

    return false;
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
  socket.on("joinLobby", (data = {}) => {
    const lobby = lobbies.get(SINGLE_LOBBY_ID);

    if (!lobby) {
      // This should not happen if the lobby is created at startup
      return socket.emit("error", { message: "The game server is not ready." });
    }

    const assignedName = lobby.addPlayer(socket.id, {
      preferredName: data.preferredName,
    });

    if (assignedName) {
      socket.join(lobby.id);
      players.set(socket.id, { lobbyId: lobby.id });

      socket.emit("joinedLobby", {
        lobbyId: lobby.id,
        playerName: assignedName,
      });
      io.to(lobby.id).emit("gameUpdate", lobby.getGameState());
    } else {
      socket.emit("error", { message: "Lobby is full" });
    }
  });

  socket.on("startGame", () => {
    // Spectator is not in the players map, so we don't look them up.
    // We know they are in the single lobby's room.
    const lobby = lobbies.get(SINGLE_LOBBY_ID);
    if (lobby) {
      io.to(lobby.id).emit("game-starting");

      setTimeout(() => {
        if (lobby.startGame()) {
          io.to(lobby.id).emit("gameStarted", lobby.getGameState());
        }
      }, 3000);
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
      lobby.update();
      lobby.handleCollisions();

      // Only send updates if something actually changed
      const gameState = lobby.getGameState();
      const hasChanges = lobby.checkForChanges(gameState);

      if (hasChanges) {
        io.to(lobby.id).emit("gameUpdate", gameState);
        lobby.lastSentState = JSON.parse(JSON.stringify(gameState));
      }
    }
  });
}, 1000 / 30); // 30 FPS

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Radio Duck Game server running on port ${PORT}`);
});
