import React from 'react';
import { Client, getStateCallbacks, Room } from 'colyseus.js';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import nipplejs from 'nipplejs';

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
  countdownTime: number = 3;
  winningScore: number = 10;
}
defineTypes(MyRoomState, {
  players: { map: Player },
  ball: Ball,
  scores: { map: 'number' },
  gameState: 'string',
  stateMessage: 'string',
  countdownTime: 'number',
  winningScore: 'number',
});
// -----------------------------------------

const GAME_WIDTH = 600;
const GAME_HEIGHT = 400;
const PADDLE_HEIGHT = 80;
const PADDLE_WIDTH = 10;
const BALL_RADIUS = 5;

// --- Main App Component ---
export default function App() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const roomRef = React.useRef<Room<MyRoomState> | null>(null);
  const joystickControllerRef = React.useRef<any>(null);
  const joystickStateRef = React.useRef<{ active: boolean; vector: { x: number; y: number } }>({
    active: false,
    vector: { x: 0, y: 0 },
  });
  const joystickContainerRef = React.useRef<HTMLDivElement>(null);
  const [status, setStatus] = React.useState('Connecting...');
  const [scores, setScores] = React.useState<{ [key: string]: number }>({});
  const [gameState, setGameState] = React.useState('waiting_for_players');
  const [stateMessage, setStateMessage] = React.useState('Waiting for players...');
  const [showOverlay, setShowOverlay] = React.useState(true);
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [buttonState, setButtonState] = React.useState({ up: false, down: false });
  const buttonStateRef = React.useRef({ up: false, down: false });

  // Sound effects references
  const paddleHitSound = React.useRef<HTMLAudioElement | null>(null);
  const scoreSound = React.useRef<HTMLAudioElement | null>(null);
  const gameStartSound = React.useRef<HTMLAudioElement | null>(null);
  const gameOverSound = React.useRef<HTMLAudioElement | null>(null);

  // Initialize sound effects
  React.useEffect(() => {
    // Create audio elements for sound effects
    paddleHitSound.current = new Audio('data:audio/wav;base64,UklGRl9vT19wYWRkbGVIaXQAAGJzb3J0');
    scoreSound.current = new Audio('data:audio/wav;base64,UklGRpNvT19zY29yZQAAAABic29ydA==');
    gameStartSound.current = new Audio('data:audio/wav;base64,UklGRqtvT19nYW1lU3RhcnQAYnNvcnQ=');
    gameOverSound.current = new Audio('data:audio/wav;base64,UklGRqFvT19nYW1lT3ZlcgBic29ydA==');

    // Simple sound synthesis for paddle hit (using Web Audio API)
    const createPaddleHitSound = (): Promise<void> => {
      return new Promise((resolve) => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(220, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(110, audioContext.currentTime + 0.1);

        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.2);
        resolve();
      });
    };

    // Simple sound synthesis for score (using Web Audio API)
    const createScoreSound = (): Promise<void> => {
      return new Promise((resolve) => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.2);

        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
        resolve();
      });
    };

    // Assign the sound creation functions
    paddleHitSound.current.play = createPaddleHitSound;
    scoreSound.current.play = createScoreSound;

    // Create game start and game over sounds
    gameStartSound.current.play = (): Promise<void> => {
      return new Promise((resolve) => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(330, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime + 0.2);
        oscillator.frequency.setValueAtTime(554, audioContext.currentTime + 0.4);

        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.6);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.6);
        resolve();
      });
    };

    gameOverSound.current.play = (): Promise<void> => {
      return new Promise<void>((resolve) => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(110, audioContext.currentTime + 0.5);

        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
        resolve();
      });
    };
  }, []);

  // Play sound effect based on game state changes
  React.useEffect(() => {
    if (gameState === 'playing' && paddleHitSound.current) {
      gameStartSound.current?.play();
    } else if (gameState === 'game_over' && gameOverSound.current) {
      gameOverSound.current.play();
    } else if (gameState === 'point_scored' && scoreSound.current) {
      scoreSound.current.play();
    }
  }, [gameState]);

  // Handle paddle movement with buttons
  const handlePaddleMove = (direction: 'up' | 'down', isPressed: boolean) => {
    // Update button state
    if (direction === 'up') {
      setButtonState((prev) => ({ ...prev, up: isPressed }));
      buttonStateRef.current.up = isPressed;
    } else {
      setButtonState((prev) => ({ ...prev, down: isPressed }));
      buttonStateRef.current.down = isPressed;
    }
    
    // Directly move paddle on press/release in addition to the animation loop
    const player = roomRef.current?.state.players.get(roomRef.current.sessionId);
    if (player && roomRef.current && isPressed) {
      const moveSpeed = 25;
      let newY = player.y;
      
      if (direction === 'up') {
        newY = Math.max(0, player.y - moveSpeed);
      } else {
        newY = Math.min(GAME_HEIGHT - PADDLE_HEIGHT, player.y + moveSpeed);
      }
      
      // Send move command directly
      roomRef.current.send('move', { y: newY });
    }
  };

  // Effect for continuous button movement
  React.useEffect(() => {
    let animationFrameId: number;

    const moveLoop = () => {
      const player = roomRef.current?.state.players.get(roomRef.current.sessionId);
      if (player && roomRef.current) {
        const moveSpeed = 10;
        let newY = player.y;

        if (buttonStateRef.current.up) {
          newY = Math.max(0, player.y - moveSpeed);
        }

        if (buttonStateRef.current.down) {
          newY = Math.min(GAME_HEIGHT - PADDLE_HEIGHT, player.y + moveSpeed);
        }

        if (buttonStateRef.current.up || buttonStateRef.current.down) {
          roomRef.current.send('move', { y: newY });
        }
      }

      animationFrameId = requestAnimationFrame(moveLoop);
    };

    animationFrameId = requestAnimationFrame(moveLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Main connection and game logic effect
  React.useEffect(() => {
    const serverAddress = `wss://multi-pacman-game.westeurope.cloudapp.azure.com/colyseus`;
    const client = new Client(serverAddress);
    let roomInstance: Room<MyRoomState> | undefined;
    let joystick: any | undefined;
    let previousBallX = 0;
    let previousBallY = 0;

    const connect = async () => {
      if (isConnecting) return;

      try {
        setIsConnecting(true);

        // Matchmaking
        try {
          roomInstance = await client.join<MyRoomState>('my_room');
        } catch (e) {
          console.log('Could not join room, creating a new one...', e);
          roomInstance = await client.create<MyRoomState>('my_room');
        }

        roomRef.current = roomInstance;
        setStatus('Connected!');
        console.log('✅ Successfully joined room!', roomInstance.sessionId);

        const $ = getStateCallbacks(roomInstance);

        // Listen for state changes to update scores
        $(roomInstance.state).players.onAdd((player, sessionId) => {
          setScores((prev) => ({ ...prev, [sessionId]: player.score }));

          // Also listen for score changes
          $(player).listen('score', (currentValue) => {
            setScores((prev) => ({ ...prev, [sessionId]: currentValue }));
          });
        });

        $(roomInstance.state).players.onRemove((_, sessionId) => {
          setScores((prev) => {
            const newScores = { ...prev };
            delete newScores[sessionId];
            return newScores;
          });
        });

        // Listen for game state changes
        $(roomInstance.state).listen('gameState', (value) => {
          console.log('Game state changed to:', value);
          setGameState(value);
          setShowOverlay(value !== 'playing');

          // Play sound effects based on game state changes
          if (value === 'playing' && gameStartSound.current) {
            gameStartSound.current.play();
          } else if (value === 'game_over' && gameOverSound.current) {
            gameOverSound.current.play();
          } else if (value === 'point_scored' && scoreSound.current) {
            scoreSound.current.play();
          }
        });

        // Listen for state message changes
        $(roomInstance.state).listen('stateMessage', (value) => {
          setStateMessage(value);
        });

        roomInstance.onMessage('__playground_message_types', (data) => {
          // This is an internal Colyseus message, we just need a handler to avoid warnings
          console.debug('Received playground message types', data);
        });

        // Listen for ball changes to detect paddle hits
        $(roomInstance.state).ball.listen('x', (newX) => {
          if (!roomInstance) return;

          // Get the current ball and its velocity
          const ball = roomInstance.state.ball;

          // If ball direction changed, it hit a paddle
          if ((previousBallX < newX && ball.vx < 0) || (previousBallX > newX && ball.vx > 0)) {
            // Play paddle hit sound
            if (paddleHitSound.current) paddleHitSound.current.play();
          }
          previousBallX = newX;
        });

        // --- JOYSTICK INITIALIZATION ---
        if (joystickContainerRef.current) {
          const options = {
            zone: joystickContainerRef.current,
            mode: 'static',
            position: { top: '50%', left: '50%' },
            color: 'cyan',
            lockY: true, // We only care about vertical movement
          };
          const joystickInstance = nipplejs.create(options);
          joystick = joystickInstance;
          joystickControllerRef.current = joystickInstance;

          // Listen for joystick movement - just update state
          joystickInstance.on('move', (evt, data) => {
            joystickStateRef.current.active = true;
            joystickStateRef.current.vector = data.vector;
          });

          // Listen for joystick end - reset state
          joystickInstance.on('end', () => {
            joystickStateRef.current.active = false;
            joystickStateRef.current.vector = { x: 0, y: 0 };
          });
        }

        // ---------------------------------

        // Start the rendering loop
        requestAnimationFrame(render);
      } catch (e: any) {
        console.error('❌ MATCHMAKING ERROR', e);
        setStatus(`Error: ${e.message}`);
      } finally {
        setIsConnecting(false);
      }
    };

    const render = () => {
      if (!canvasRef.current || !roomRef.current?.state) {
        requestAnimationFrame(render);
        return;
      }

      const context = canvasRef.current.getContext('2d');
      if (!context) return;

      // Clear canvas
      context.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      context.fillStyle = '#111';
      context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // Draw paddles
      const { players, ball } = roomRef.current.state;

      if (!players || !ball) {
        requestAnimationFrame(render);
        return;
      }

      const playerIds = Array.from(players.keys()).sort();
      playerIds.forEach((sessionId, index) => {
        const player = players.get(sessionId);
        if (player) {
          const xPos = index === 0 ? PADDLE_WIDTH * 2 : GAME_WIDTH - PADDLE_WIDTH * 3;
          context.fillStyle = sessionId === roomRef.current?.sessionId ? 'cyan' : 'white';
          context.fillRect(xPos, player.y, PADDLE_WIDTH, PADDLE_HEIGHT);
        }
      });

      // Draw ball
      if (ball) {
        context.fillStyle = 'white';
        context.beginPath();
        context.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
        context.fill();
        context.closePath();
      }

      // Draw center line
      context.setLineDash([5, 5]);
      context.beginPath();
      context.moveTo(GAME_WIDTH / 2, 0);
      context.lineTo(GAME_WIDTH / 2, GAME_HEIGHT);
      context.strokeStyle = 'white';
      context.stroke();
      context.setLineDash([]);

      if (joystickStateRef.current.active && roomRef.current) {
        const player = roomRef.current.state.players.get(roomRef.current.sessionId);
        if (player) {
          const newY = player.y - joystickStateRef.current.vector.y * 10 * SCALE_FACTOR; // Adjust the multiplier for sensitivity

          // Clamp the paddle's position to stay within the game bounds
          const clampedY = Math.max(0, Math.min(GAME_HEIGHT - PADDLE_HEIGHT, newY));

          roomRef.current.send('move', { y: clampedY });
        }
      }

      requestAnimationFrame(render);
    };

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      const player = roomRef.current?.state.players.get(roomRef.current.sessionId);
      if (!player || !roomRef.current) return;

      let newY = player.y;
      const moveSpeed = 25;

      // Handle up/down arrow keys and W/S keys
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        newY = Math.max(0, player.y - moveSpeed);
        roomRef.current.send('move', { y: newY });
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        newY = Math.min(GAME_HEIGHT - PADDLE_HEIGHT, player.y + moveSpeed);
        roomRef.current.send('move', { y: newY });
      }
    };

    // Add keyboard event listeners
    window.addEventListener('keydown', handleKeyDown);

    connect();

    // Cleanup
    return () => {
      if (roomInstance) {
        roomInstance.leave();
      }
      if (joystickControllerRef.current) {
        joystickControllerRef.current.destroy();
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className='game-container'>
      <h1 className='game-title'>Colyseus Pong</h1>
      <p
        className={`game-status ${
          status === 'Connected!' ? 'connected' : status.includes('Error') ? 'error' : 'waiting'
        }`}
      >
        {status}
      </p>

      {/* Scoreboard */}
      <div className='scoreboard'>
        <div className={`player-info ${Object.keys(scores)[0] === roomRef.current?.sessionId ? 'current-player' : ''}`}>
          <div className='player-label'>
            Player 1{' '}
            {Object.keys(scores)[0] === roomRef.current?.sessionId ? <span className='you-indicator'>(You)</span> : ''}:
          </div>
          <div className='player-score'>{Object.values(scores)[0] || 0}</div>
        </div>

        <div className='score-spacer'>VS</div>

        <div className={`player-info ${Object.keys(scores)[1] === roomRef.current?.sessionId ? 'current-player' : ''}`}>
          <div className='player-label'>
            Player 2{' '}
            {Object.keys(scores)[1] === roomRef.current?.sessionId ? <span className='you-indicator'>(You)</span> : ''}:
          </div>
          <div className='player-score'>{Object.values(scores)[1] || 0}</div>
        </div>
      </div>

      {/* Game content wrapper - fixed width */}
      <div style={{ width: `${GAME_WIDTH}px`, margin: '0 auto' }}>
        {/* Game canvas */}
        <div className='canvas-container' style={{ position: 'relative', width: GAME_WIDTH, height: GAME_HEIGHT }}>
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className='game-canvas'
            style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}
          />
        </div>

        {/* Control buttons - replacing joystick */}
        <div className='control-buttons-column'>
          <button
            className='control-button up-button'
            onMouseDown={() => handlePaddleMove('up', true)}
            onMouseUp={() => handlePaddleMove('up', false)}
            onMouseLeave={() => handlePaddleMove('up', false)}
            onTouchStart={() => handlePaddleMove('up', true)}
            onTouchEnd={() => handlePaddleMove('up', false)}
            onClick={() => {
              // Move paddle a significant distance on click for webview
              const player = roomRef.current?.state.players.get(roomRef.current?.sessionId);
              if (player && roomRef.current) {
                const moveSpeed = 40;
                const newY = Math.max(0, player.y - moveSpeed);
                roomRef.current.send('move', { y: newY });
              }
            }}
            aria-label='Move paddle up'
          >
            ▲
          </button>
          <div style={{ height: '10px' }} />
          <button
            className='control-button down-button'
            onMouseDown={() => handlePaddleMove('down', true)}
            onMouseUp={() => handlePaddleMove('down', false)}
            onMouseLeave={() => handlePaddleMove('down', false)}
            onTouchStart={() => handlePaddleMove('down', true)}
            onTouchEnd={() => handlePaddleMove('down', false)}
            onClick={() => {
              // Move paddle a significant distance on click for webview
              const player = roomRef.current?.state.players.get(roomRef.current?.sessionId);
              if (player && roomRef.current) {
                const moveSpeed = 40;
                const newY = Math.min(GAME_HEIGHT - PADDLE_HEIGHT, player.y + moveSpeed);
                roomRef.current.send('move', { y: newY });
              }
            }}
            aria-label='Move paddle down'
          >
            ▼
          </button>
        </div>

        <div className='controls-hint'>
          <p>Controls: Arrow Keys/WASD or use the buttons</p>
        </div>

        {/* Game state message container - moved outside controls-hint */}
        <div className='game-state-container' style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 5 }}>
          {gameState !== 'playing' && gameState !== 'game_over' && !stateMessage.includes('wins') ? (
            <div className='game-state-message'>
              <div className='state-message'>{stateMessage}</div>
              {gameState === 'countdown' && <div className='state-subtext'>Get ready!</div>}
            </div>
          ) : (
            <div className='game-state-message hidden'>
              <div className='state-message'>&nbsp;</div>
            </div>
          )}
        </div>

        {/* Game over UI - moved outside controls-hint */}
        {(gameState === 'game_over' || stateMessage.includes('wins')) && (
          <div className='game-over-message-container' style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}>
            <div className='game-over-message'>Game Over!</div>
            <div className='game-over-subtext'>{stateMessage}</div>
            <button
              className='restart-button'
              onClick={() => {
                console.log('Restart button clicked!');
                if (roomRef.current) {
                  roomRef.current.send('restart');
                }
              }}
            >
              Play Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
