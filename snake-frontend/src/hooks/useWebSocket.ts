import { useState, useEffect, useRef, useCallback } from 'react';

const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://192.168.1.11:8080'; // Use environment variable or default
const PING_INTERVAL = 5000; // Send a ping every 5 seconds

interface WebSocketHook {
    sendMessage: (message: any) => void;
    lastMessage: MessageEvent | null;
    readyState: number;
    latency: number; // Added latency tracking
}

export function useWebSocket(): WebSocketHook {
    const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
    const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);
    const [latency, setLatency] = useState<number>(0); // Track round-trip time
    const ws = useRef<WebSocket | null>(null);
    const pingTimeRef = useRef<number | null>(null);
    const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!ws.current) {
            ws.current = new WebSocket(WEBSOCKET_URL);

            ws.current.onopen = () => {
                console.log('WebSocket Connected');
                setReadyState(WebSocket.OPEN);
                
                // Start ping interval
                pingIntervalRef.current = setInterval(() => {
                    if (ws.current?.readyState === WebSocket.OPEN) {
                        pingTimeRef.current = Date.now();
                        ws.current.send(JSON.stringify({ type: 'ping' }));
                    }
                }, PING_INTERVAL);
            };

            ws.current.onclose = () => {
                console.log('WebSocket Disconnected');
                setReadyState(WebSocket.CLOSED);
                ws.current = null;
                if (pingIntervalRef.current) {
                    clearInterval(pingIntervalRef.current);
                    pingIntervalRef.current = null;
                }
            };

            ws.current.onerror = (error) => {
                console.error('WebSocket Error:', error);
                setReadyState(WebSocket.CLOSED);
            };

            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // Handle pong message for latency calculation
                    if (data.type === 'pong' && pingTimeRef.current) {
                        const rtt = Date.now() - pingTimeRef.current;
                        setLatency(rtt);
                        pingTimeRef.current = null;
                    }
                } catch (e) {
                    // Not a JSON message or not a pong, continue
                }
                
                setLastMessage(event);
            };
        }

        // Cleanup function
        return () => {
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                ws.current.close();
            }
            ws.current = null;
            if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
                pingIntervalRef.current = null;
            }
        };
    }, []); // Empty dependency array ensures this runs only once on mount

    const sendMessage = useCallback((message: any) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(message));
        } else {
            console.log('WebSocket not connected.');
        }
    }, []);

    return { sendMessage, lastMessage, readyState, latency };
}
