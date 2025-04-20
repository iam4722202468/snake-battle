'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import useClientGameLoop, { Direction } from '../hooks/useClientGameLoop';
import Snake from './Snake';
import Apple from './Apple';
import BoostMeter from './BoostMeter';
import { useWebSocket } from '../hooks/useWebSocket';
import MapSelector from './MapSelector';
import { Player } from '../types/gameTypes';
import { Tunnels, Teleporters } from './MapFeatures';
import { getMapById } from '../data/maps';

interface Player {
    id: string;
    segments: { x: number; y: number }[];
    direction: Direction;
    hue: number;
    size: number;
    isRespawning: boolean;
    isBoosting: boolean;
}

interface Position { x: number; y: number; }

const DEFAULT_GRID_SIZE = 20;
const CLIENT_TICK_RATE = 200;
const RESPAWN_COUNTDOWN_DURATION = 3;
const BOOST_MAX = 100;
const BOOST_DRAIN_RATE = 0.5;
const BOOST_RECHARGE_RATE = 0.2;

const Game: React.FC = () => {
    const { lastMessage, sendMessage, readyState, latency, connected, reconnect } = useWebSocket();

    const [gridSize, setGridSize] = useState<number>(DEFAULT_GRID_SIZE);
    const [apple, setApple] = useState<Position>({ x: 10, y: 10 });
    const [score, setScore] = useState<number>(0);
    const [respawnCountdown, setRespawnCountdown] = useState<number | null>(null);
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const [clientId, setClientId] = useState<string | null>(null);
    const [otherPlayers, setOtherPlayers] = useState<Player[]>([]);
    const [isRespawning, setIsRespawning] = useState<boolean>(false);
    const [initialPosition, setInitialPosition] = useState<Position | null>(null);
    const [totalPlayers, setTotalPlayers] = useState<number>(0);
    const [playerHue, setPlayerHue] = useState<number>(120);

    const [isBoosting, setIsBoosting] = useState<boolean>(false);
    const [boostAmount, setBoostAmount] = useState<number>(BOOST_MAX);
    const [canBoost, setCanBoost] = useState<boolean>(true);

    const [gameMode, setGameMode] = useState<'selection' | 'playing'>('selection');

    const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
    const [currentMapId, setCurrentMapId] = useState<string>('classic');
    const currentMap = getMapById(currentMapId);

    const handlePositionUpdate = useCallback((segments: Position[], direction: Direction) => {
        if (!connected || isRespawning) return;
        sendMessage({
            type: 'position_update',
            payload: { segments, direction }
        });
    }, [connected, isRespawning, sendMessage]);

    const sendBoostUpdate = useCallback((boosting: boolean) => {
        if (!connected || isRespawning) return;
        sendMessage({
            type: 'boost_update',
            payload: { isBoosting: boosting }
        });
    }, [connected, isRespawning, sendMessage]);

    const handleMapSelection = useCallback((mapId: string) => {
        setSelectedMapId(mapId);
        
        if (connected) {
            sendMessage({
                type: 'map_selection',
                payload: { mapId }
            });
        }
    }, [connected, sendMessage]);

    const sendGameModeUpdate = useCallback((mode: 'selection' | 'playing') => {
        if (!connected) return;
        
        console.log(`Sending game mode update: ${mode}`);
        sendMessage({
            type: 'game_mode_update',
            payload: { mode }
        });
    }, [connected, sendMessage]);
    
    const switchToMapSelection = useCallback(() => {
        sendGameModeUpdate('selection');
    }, [sendGameModeUpdate]);
    
    const startGame = useCallback(() => {
        sendGameModeUpdate('playing');
    }, [sendGameModeUpdate]);

    const {
        segments,
        displayDirection,
        addInput,
        setSegments,
    } = useClientGameLoop({
        gridSize,
        apple,
        tickRate: CLIENT_TICK_RATE,
        isRespawning,
        initialPosition,
        onPositionUpdate: handlePositionUpdate,
        isBoosting,
        tickMultiplier: 1.5,
        gameMode,
    });

    useEffect(() => {
        const boostTimer = setInterval(() => {
            setBoostAmount(prev => {
                if (isBoosting) {
                    const newAmount = Math.max(0, prev - BOOST_DRAIN_RATE);
                    if (newAmount <= 0 && isBoosting) {
                        setIsBoosting(false);
                        sendBoostUpdate(false);
                        setCanBoost(false);
                    }
                    return newAmount;
                } else {
                    const newAmount = Math.min(BOOST_MAX, prev + BOOST_RECHARGE_RATE);
                    if (newAmount >= BOOST_MAX * 0.3 && !canBoost) {
                        setCanBoost(true);
                    }
                    return newAmount;
                }
            });
        }, 16);
        
        return () => clearInterval(boostTimer);
    }, [isBoosting, canBoost, sendBoostUpdate]);

    useEffect(() => {
        if (!lastMessage) return;

        try {
            const data = JSON.parse(lastMessage.data);
            console.log(`Received message type: ${data.type}`, data.payload);

            switch (data.type) {
                case 'assign_id':
                    const newClientId = data.payload.id;
                    console.log(`Processing 'assign_id'. Current clientId: ${clientId}, New clientId: ${newClientId}`);
                    setClientId(newClientId);
                    console.log(`Set clientId to: ${newClientId}`);
                    break;

                case 'game_state':
                    if (typeof data.payload.gridSize === 'number') {
                        setGridSize(data.payload.gridSize);
                    }
                    if (data.payload.apple) {
                        setApple(data.payload.apple);
                    }
                    if (Array.isArray(data.payload.players)) {
                        setTotalPlayers(data.payload.players.length);

                        if (clientId) {
                            const activeOthers = data.payload.players.filter(p => p.id !== clientId && !p.isRespawning);
                            setOtherPlayers(activeOthers);

                            const selfData = data.payload.players.find(p => p.id === clientId);

                            if (selfData) {
                                setSegments(selfData.segments); 
                                setScore(selfData.size || 1);
                                setPlayerHue(selfData.hue);
                                if (selfData.isRespawning !== isRespawning) {
                                    setIsRespawning(selfData.isRespawning);
                                    if (selfData.isRespawning) {
                                        console.log("Syncing local isRespawning to true based on server state");
                                    }
                                }
                                if (selfData.selectedMapId !== selectedMapId) {
                                     setSelectedMapId(selfData.selectedMapId || null);
                                }
                            } else {
                                if (!isRespawning) {
                                    console.log("Syncing local isRespawning to true (self not found in server state)");
                                    setIsRespawning(true);
                                }
                            }
                        } else {
                            console.log("Processing 'game_state' but clientId is not set yet. Clearing other players.");
                        }
                    }
                    if (data.payload.gameMode && data.payload.gameMode !== gameMode) {
                        console.log(`Setting game mode from server: ${data.payload.gameMode}`);
                        setGameMode(data.payload.gameMode);
                    }
                    if (data.payload.currentMap && data.payload.currentMap !== currentMapId) {
                        setCurrentMapId(data.payload.currentMap);
                    }
                    break;

                case 'apple_eat':
                    if (data.payload.newApple) {
                        setApple(data.payload.newApple);
                    }
                    break;

                case 'death':
                    if (data.payload && data.payload.playerId === clientId) {
                        console.log("Received death message FOR ME:", data.payload);
                        if (!isRespawning) {
                            setIsRespawning(true);

                            const respawnDelay = data.payload.respawnDelay || (RESPAWN_COUNTDOWN_DURATION * 1000);
                            const endTime = Date.now() + respawnDelay;

                            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                            setRespawnCountdown(Math.ceil(respawnDelay / 1000));

                            countdownIntervalRef.current = setInterval(() => {
                                const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
                                setRespawnCountdown(remaining);
                                if (remaining <= 0 && countdownIntervalRef.current) {
                                    clearInterval(countdownIntervalRef.current);
                                    countdownIntervalRef.current = null;
                                }
                            }, 500);
                        }
                    } else if (data.payload && clientId) {
                         console.log(`Received death message for other player (${data.payload.playerId}), ignoring.`);
                    }
                    break;

                case 'respawn':
                    if (data.payload && data.payload.playerId === clientId) {
                        console.log("Received respawn message FOR ME:", data.payload);
                        if (isRespawning) {
                            setIsRespawning(false);
                            setRespawnCountdown(null);
                            if (countdownIntervalRef.current) {
                                clearInterval(countdownIntervalRef.current);
                                countdownIntervalRef.current = null;
                            }
                            if (data.payload.position) {
                                setInitialPosition(data.payload.position);
                                setTimeout(() => setInitialPosition(null), 50);
                            }
                        }
                    } else if (data.payload && clientId) {
                         console.log(`Received respawn message for other player (${data.payload.playerId}), ignoring.`);
                    }
                    break;

                case 'game_mode_update':
                    if (data.payload && data.payload.mode) {
                        console.log(`Received game mode update: ${data.payload.mode}`);
                        setGameMode(data.payload.mode);
                    }
                    break;

                default:
                    console.log(`Unhandled message type: ${data.type}`);
                    break;
            }
        } catch (error) {
            console.error("Error processing server message:", error, "Raw data:", lastMessage?.data);
        }
    }, [lastMessage, clientId, setSegments, setScore, isRespawning, setIsRespawning, selectedMapId, gameMode, currentMapId, currentMap]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.repeat || isRespawning) return;

            if (event.key === ' ' && canBoost && !isBoosting) {
                setIsBoosting(true);
                sendBoostUpdate(true);
                return;
            }

            let newDirection: Direction | null = null;
            switch (event.key) {
                case 'ArrowUp': case 'w': case 'W': newDirection = 'up'; event.preventDefault(); break;
                case 'ArrowDown': case 's': case 'S': newDirection = 'down'; event.preventDefault(); break;
                case 'ArrowLeft': case 'a': case 'A': newDirection = 'left'; event.preventDefault(); break;
                case 'ArrowRight': case 'd': case 'D': newDirection = 'right'; event.preventDefault(); break;
                default: return;
            }
            if (newDirection) {
                addInput(newDirection);
            }
        };
        
        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.key === ' ' && isBoosting) {
                setIsBoosting(false);
                sendBoostUpdate(false);
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [addInput, isRespawning, isBoosting, canBoost, sendBoostUpdate]);

    useEffect(() => {
        return () => {
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
        };
    }, []);

    const gameBoardSize = 'min(80vw, 80vh)';

    return (
        <div className="flex flex-col items-center">
            <h1 className="text-3xl font-bold mb-2 text-gray-800 dark:text-gray-200">Snake Online</h1>
            
            {clientId ? (
                <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    Your Player ID: <span className="font-mono">{clientId}</span>
                </div>
            ) : (
                 <div className="mb-1 text-xs text-orange-500 dark:text-orange-400">
                    Player ID: Not assigned yet
                 </div>
            )}
            
            <div className="flex items-center gap-2 mb-1 text-xs">
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span>
                    {readyState === WebSocket.CONNECTING ? 'Connecting...' :
                     readyState === WebSocket.OPEN ? `Connected (${latency}ms)` :
                     readyState === WebSocket.CLOSING ? 'Closing...' : 'Disconnected'}
                </span>
                {readyState === WebSocket.CLOSED && (
                    <button onClick={reconnect} className="px-1 py-0.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">
                        Reconnect
                    </button>
                )}
            </div>

            {clientId && gameMode === 'playing' && (
                <button 
                    onClick={switchToMapSelection}
                    className="mb-4 px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                >
                    Select Map
                </button>
            )}

            {gameMode === 'selection' ? (
                <MapSelector 
                    clientId={clientId}
                    players={[...otherPlayers, ...(clientId ? [{
                        id: clientId,
                        segments,
                        direction: displayDirection,
                        hue: playerHue,
                        size: score,
                        isRespawning,
                        isBoosting,
                        selectedMapId
                    }] : [])]}
                    selectedMapId={selectedMapId}
                    onSelectMap={handleMapSelection}
                    onPlayNow={startGame}
                />
            ) : (
                <>
                    <div className="mb-2 flex items-center gap-4 text-sm">
                        <p className="font-bold">Score: {score}</p>
                        <p>Length: {!isRespawning && segments.length > 0 ? segments.length : 0}</p>
                        <p>Input: <span className="font-mono uppercase">{displayDirection}</span></p>
                        <p>Players: {totalPlayers}</p>
                        
                        <div className="flex items-center gap-2">
                            <span className={`text-xs ${isBoosting ? 'text-red-500 font-bold' : ''}`}>
                                BOOST
                            </span>
                            <BoostMeter boostAmount={boostAmount} isBoosting={isBoosting} />
                        </div>
                        <p>Map: <span className="font-semibold">{currentMap?.name || 'Classic'}</span></p>
                    </div>

                    <div
                        className="relative border-2 border-gray-500 dark:border-gray-700 shadow-lg overflow-hidden game-grid-bg"
                        style={{
                            width: gameBoardSize,
                            height: gameBoardSize,
                            maxWidth: '600px',
                            maxHeight: '600px',
                        }}
                    >
                        {currentMap?.tunnels && <Tunnels tunnels={currentMap.tunnels} gridSize={gridSize} />}
                        {currentMap?.teleporters && (
                            <Teleporters 
                                teleporters={currentMap.teleporters} 
                                gridSize={gridSize}
                            />
                        )}
                        
                         {!connected && readyState !== WebSocket.OPEN && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-30 text-white font-bold">
                                {readyState === WebSocket.CONNECTING ? 'Connecting...' : 'Disconnected'}
                            </div>
                        )}

                        <Apple position={apple} gridSize={gridSize} />

                        {otherPlayers.map(player => (
                            <Snake
                                key={player.id}
                                segments={player.segments}
                                hue={player.hue}
                                gridSize={gridSize}
                                isBoosting={player.isBoosting}
                            />
                        ))}

                        {!isRespawning && segments.length > 0 && (
                            <Snake
                                segments={segments}
                                hue={playerHue}
                                gridSize={gridSize}
                                isBoosting={isBoosting}
                            />
                        )}

                        {isRespawning && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/60 text-xl font-bold z-20">
                                <div>You died!</div>
                                <div className="text-2xl mt-2">Score: {score}</div>
                                {respawnCountdown !== null && respawnCountdown > 0 && (
                                    <>
                                        <div className="text-7xl mt-4 font-mono">{respawnCountdown}</div>
                                        <div className="text-lg mt-4">Respawning...</div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                        Use arrow keys or WASD to control the snake. Press SPACE to boost!
                        {currentMap?.id === 'tunnels' && (
                            <div>Use tunnels to pass through other snakes without collision!</div>
                        )}
                        {currentMap?.id === 'teleporters' && (
                            <div>Pass through teleporters to jump to another location!</div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default Game;
