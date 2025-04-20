import { useState, useEffect, useRef, useCallback } from 'react';

const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://192.168.1.11:8080'; // Use environment variable or default

interface WebSocketHook {
    sendMessage: (message: any) => void;
    lastMessage: MessageEvent | null;
    readyState: number;
}

export function useWebSocket(): WebSocketHook {
    const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
    const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);
    const ws = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!ws.current) {
            ws.current = new WebSocket(WEBSOCKET_URL);

            ws.current.onopen = () => {
                console.log('WebSocket Connected');
                setReadyState(WebSocket.OPEN);
            };

            ws.current.onclose = () => {
                console.log('WebSocket Disconnected');
                setReadyState(WebSocket.CLOSED);
                ws.current = null; // Ensure cleanup allows reconnect attempt if desired
            };

            ws.current.onerror = (error) => {
                console.error('WebSocket Error:', error);
                setReadyState(WebSocket.CLOSED); // Consider state CLOSING or specific error state
            };

            ws.current.onmessage = (event) => {
                setLastMessage(event);
            };
        }

        // Cleanup function
        return () => {
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                ws.current.close();
            }
            ws.current = null;
        };
    }, []); // Empty dependency array ensures this runs only once on mount

    const sendMessage = useCallback((message: any) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(message));
        } else {
            console.log('WebSocket not connected.');
        }
    }, []);

    return { sendMessage, lastMessage, readyState };
}
