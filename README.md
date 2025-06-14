# 🚗 Radio Car Battle

A multiplayer web-based bumper car game where players try to push each other off a circular platform. The last car standing wins!

## 🎮 Features

- **Multiplayer Gameplay**: Up to 6 players can compete in the same lobby
- **Mobile Optimized**: Designed for mobile browsers with touch controls
- **Real-time Physics**: Smooth car movement and collision detection
- **Lobby System**: Create or join lobbies with friends using lobby IDs
- **Cross-Platform**: Works on desktop and mobile devices

## 🚀 How to Play

1. **Join a Game**:

   - Enter your name
   - Optionally enter a lobby ID to join friends, or leave blank to create a new lobby
   - Click "Join Game"

2. **In the Lobby**:

   - Share your lobby ID with friends
   - Wait for at least 2 players to join
   - Click "Start Game" when ready

3. **Game Controls**:

   - **Mobile**: Use the on-screen arrow buttons
   - **Desktop**: Use arrow keys or WASD
   - **Forward**: Accelerate in the direction you're facing
   - **Backward**: Reverse (slower than forward)
   - **Left/Right**: Turn your car

4. **Objective**:
   - Bump into other players to push them around
   - Try to push opponents off the circular platform
   - Avoid falling off yourself
   - Be the last car standing to win!

## 🎯 Game Mechanics

- **Arena**: Circular platform with warning zones near the edge
- **Physics**: Realistic car movement with momentum and friction
- **Collisions**: Cars bounce off each other when they collide
- **Fall Off**: Players are eliminated when they fall off the platform
- **Timer**: 5-minute maximum game duration

## 🛠️ Setup & Installation

### Prerequisites

- Node.js (v14 or higher)
- npm

### Installation

1. Clone or download this repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the server:

   ```bash
   npm start
   ```

4. Open your browser and go to:
   ```
   http://localhost:3000
   ```

### For Development

Use nodemon for auto-restart during development:

```bash
npm run dev
```

## 🌐 Server Deployment

The game is designed to work on servers with Node.js and Caddy. Make sure your server has:

- Node.js runtime
- Port 3000 available (or configure with PORT environment variable)

## 🎨 Game Features

- **Responsive Design**: Adapts to different screen sizes
- **Touch Controls**: Optimized for mobile gameplay
- **Visual Feedback**: Clear indicators for your car and game state
- **Real-time Updates**: Instant synchronization between players
- **Lobby Management**: Easy lobby creation and joining

## 🔧 Technical Details

- **Backend**: Node.js with Express and Socket.io
- **Frontend**: HTML5 Canvas with vanilla JavaScript
- **Real-time Communication**: WebSocket-based multiplayer
- **Physics**: Custom 2D physics engine for car movement
- **Mobile Support**: Touch events and responsive design

## 📱 Mobile Optimization

- Prevents zooming and scrolling
- Touch-friendly control buttons
- Responsive layout for different screen sizes
- Optimized for portrait and landscape modes

Enjoy the game! 🏁
