import React, { useEffect, useRef, useState } from 'react';
import { Client, Room } from 'colyseus.js';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import './App.css';

// --- Client-Side Schema Definition ---
class Player extends Schema {
  x: number = 0;
  y: number = 0;
  score: number = 0;
}
defineTypes(Player, {
  x: 'number',
  y: 'number',
  score: 'number',
});

class Ball extends Schema {
  x: number = 0;
  y: number = 0;
  vx: number = 0;
  vy: number = 0;
}
defineTypes(Ball, {
  x: 'number',
  y: 'number',
  vx: 'number',
  vy: 'number',
});

class MyRoomState extends Schema {
  players = new MapSchema<Player>();
  ball = new Ball();
  scores = new MapSchema<number>();
  gameState: string = 'waiting_for_players';
  stateMessage: string = 'Waiting for players...';
}
defineTypes(MyRoomState, {
  players: { map: Player },
  ball: Ball,
  scores: { map: 'number' },
  gameState: 'string',
  stateMessage: 'string',
});
// -----------------------------------------

export default function App() {
  // Game canvas size (optimized for mobile portrait mode)
  const GAME_WIDTH = 350;
  const GAME_HEIGHT = 600;
  const PADDLE_WIDTH = 80; // Wider paddle for horizontal movement
  const PADDLE_HEIGHT = 15; // Thinner paddle for vertical layout
  const BALL_RADIUS = 10;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<Room<MyRoomState> | null>(null);
  const [message, setMessage] = useState('');
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [playerNo, setPlayerNo] = useState(0);

  // Touch position state for paddle control
  const [touchPosition, setTouchPosition] = useState<number | null>(null);
  
  // Handle game start
  const startGame = () => {
    if (roomRef.current?.connection.isOpen) {
      roomRef.current.send('join');
      setMessage('Waiting for other player...');
    } else {
      setMessage('Connection error. Refresh the page and try again.');
    }
  };

  // Handle restart game
  const restartGame = () => {
    if (roomRef.current?.connection.isOpen) {
      roomRef.current.send('restart');
      setMessage('Waiting for other player to restart...');
    } else {
      setMessage('Connection error. Refresh the page and try again.');
    }
  };

  // Touch controls for paddle movement
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isGameStarted || !roomRef.current) return;
    
    e.preventDefault(); // Prevent scrolling while playing
    
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    
    // Update local touch position for smooth rendering
    setTouchPosition(x);
    
    // Send paddle position to server
    // Constrain paddle to stay within game bounds
    const paddleX = Math.max(0, Math.min(GAME_WIDTH - PADDLE_WIDTH, x - PADDLE_WIDTH / 2));
    roomRef.current.send('move', { x: paddleX });
  };
  
  // Handle touch start - same as touch move for immediate paddle positioning
  const handleTouchStart = (e: React.TouchEvent) => {
    handleTouchMove(e);
  };
  
  // Handle touch end - clear touch position
  const handleTouchEnd = () => {
    setTouchPosition(null);
  };

  // Connection and game logic
  useEffect(() => {
    const serverAddress = `wss://multi-pacman-game.westeurope.cloudapp.azure.com/colyseus`;
    const client = new Client(serverAddress);
    
    const connect = async () => {
      try {
        // Try to join an existing room or create a new one
        let roomInstance;
        try {
          roomInstance = await client.join<MyRoomState>('my_room');
        } catch (e) {
          console.log('Could not join room, creating a new one...', e);
          roomInstance = await client.create<MyRoomState>('my_room');
        }

        roomRef.current = roomInstance;
        console.log('Successfully joined room!', roomInstance.sessionId);
        
        // Game state and player management
        roomInstance.onMessage('playerNo', (no) => {
          console.log('Received player number:', no);
          // Ensure playerNo is either 1 or 2
          const playerNumber = no === 0 ? 1 : no;
          console.log('Setting player number to:', playerNumber);
          setPlayerNo(playerNumber);
        });
        
        roomInstance.onStateChange((state) => {
          if (state.gameState === 'waiting_for_players') {
            setMessage('Waiting for other player...');
            setIsGameStarted(false);
            setIsGameOver(false);
          } else if (state.gameState === 'starting') {
            setMessage('We are going to start the game...');
            setIsGameStarted(true);
            setIsGameOver(false);
          } else if (state.gameState === 'playing') {
            setMessage('');
            setIsGameStarted(true);
            setIsGameOver(false);
            requestAnimationFrame(draw);
          } else if (state.gameState === 'game_over') {
            setIsGameStarted(false);
            setIsGameOver(true);
            const isWinner = state.stateMessage.includes(roomInstance.sessionId);
            setMessage(isWinner ? 'You Win!' : 'You Lose!');
            
            setTimeout(() => {
              if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
              }
            }, 2000);
          }
        });

        return () => {
          if (roomInstance) roomInstance.leave();
        };
      } catch (e: any) {
        console.error('Connection error:', e);
        setMessage('Connection error: ' + e.message);
      }
    };

    connect();
  }, []);

  // Draw function for canvas rendering
  const draw = () => {
    if (!canvasRef.current || !roomRef.current?.state) {
      return;
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const { players, ball } = roomRef.current.state;

    // Clear canvas
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Draw center line
    ctx.strokeStyle = 'white';
    ctx.beginPath();
    ctx.setLineDash([10, 10]);
    ctx.moveTo(0, GAME_HEIGHT / 2);
    ctx.lineTo(GAME_WIDTH, GAME_HEIGHT / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw players (paddles)
    const playerIds = Array.from(players.keys()).sort();
    playerIds.forEach((sessionId, index) => {
      const player = players.get(sessionId);
      if (player) {
        // Position paddles at top and bottom
        // If player is the current player, position at bottom, otherwise at top
        const yPos = sessionId === roomRef.current?.sessionId 
          ? GAME_HEIGHT - PADDLE_HEIGHT - 10 // Bottom paddle (10px from bottom)
          : 10; // Top paddle (10px from top)
        
        // Color: blue for current player, red for opponent
        ctx.fillStyle = sessionId === roomRef.current?.sessionId ? 'blue' : 'red';
        
        // Draw paddle
        ctx.fillRect(player.x, yPos, PADDLE_WIDTH, PADDLE_HEIGHT);
      }
    });

    // Draw ball
    if (ball) {
      ctx.fillStyle = 'white';
      ctx.beginPath();
      
      // Adjust perspective for player 2 (top player)
      // Note: playerNo is 1-indexed (1 for bottom player, 2 for top player)
      let displayX = ball.x;
      let displayY = ball.y;
      
      if (playerNo === 2) {
        // For the player at the top, flip the y-coordinate
        displayY = GAME_HEIGHT - ball.y;
        
        // Add slight client-side prediction using velocity for smoother animation
        // Note: We also need to invert the velocity direction for player 2
        if (isGameStarted) {
          // Use a small prediction factor (0.1 means predict 10% of a frame ahead)
          // For top player, we need to negate the y-velocity for correct visual direction
          displayY -= ball.vy * 0.1;
        }
      } else {
        // For player 1 (bottom), still use prediction for smoothness
        if (isGameStarted) {
          displayY += ball.vy * 0.1;
        }
      }
      
      ctx.arc(displayX, displayY, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      
      // Optional: Draw a small indicator showing the ball's direction
      if (isGameStarted) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        
        // Calculate end point of direction indicator
        const dirLength = 10; // Length of direction indicator
        let dirX = ball.vx;
        let dirY = ball.vy;
        
        // Flip direction indicator for player 2
        if (playerNo === 2) {
          dirY = -dirY;
        }
        
        // Normalize and scale
        const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
        if (magnitude > 0) {
          dirX = (dirX / magnitude) * dirLength;
          dirY = (dirY / magnitude) * dirLength;
        }
        
        ctx.moveTo(displayX, displayY);
        ctx.lineTo(displayX + dirX, displayY + dirY);
        ctx.stroke();
      }
    }
    
    // Draw score
    ctx.fillStyle = 'white';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    
    // Display scores
    let topScore = 0;
    let bottomScore = 0;
    
    playerIds.forEach((sessionId, index) => {
      const player = players.get(sessionId);
      if (player) {
        if (sessionId === roomRef.current?.sessionId) {
          bottomScore = player.score;
        } else {
          topScore = player.score;
        }
      }
    });
    
    // Draw scores
    ctx.fillText(topScore.toString(), GAME_WIDTH / 2, GAME_HEIGHT / 4);
    ctx.fillText(bottomScore.toString(), GAME_WIDTH / 2, GAME_HEIGHT * 3 / 4);

    if (isGameStarted) {
      requestAnimationFrame(draw);
    }
  };

  return (
    <div className="container">
      <h1 id="heading">
        PING PONG
      </h1>
      <div className="game">
        <canvas 
          id="canvas" 
          ref={canvasRef} 
          width={GAME_WIDTH} 
          height={GAME_HEIGHT}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        ></canvas>
        
        {message && <p id="message">{message}</p>}
        
        {!isGameStarted && !isGameOver && (
          <button id="startBtn" onClick={startGame}>
            START GAME
          </button>
        )}

        {isGameOver && (
          <button id="restartBtn" onClick={restartGame}>
            RESTART GAME
          </button>
        )}
      </div>
      
      {isGameStarted && (
        <div className="instructions">
          Slide your finger to move the paddle
        </div>
      )}
    </div>
  );
}