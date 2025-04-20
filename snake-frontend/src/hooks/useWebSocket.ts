import { useState, useEffect, useRef, useCallback } from 'react';

const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:8080';
const PING_INTERVAL = 5000;
const RECONNECT_DELAY = 5000;

interface WebSocketHook {
    sendMessage: (message: any) => void;
    lastMessage: MessageEvent | null;
    readyState: number;
    latency: number;
    connected: boolean;
    reconnect: () => void;
}

export function useWebSocket(): WebSocketHook {
    const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
    const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);
    const [latency, setLatency] = useState<number>(0);
    const ws = useRef<WebSocket | null>(null);
    const pingTimeRef = useRef<number | null>(null);
    const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const messageQueueRef = useRef<MessageEvent[]>([]);
    const processingMessageRef = useRef<boolean>(false);
    const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const processNextMessage = useCallback(() => {
        if (processingMessageRef.current || messageQueueRef.current.length === 0) {
            return;
        }
        
        processingMessageRef.current = true;
        const message = messageQueueRef.current.shift()!;
        
        try {
            const data = JSON.parse(message.data);
            console.log(`Processing queued message: ${data.type}`);
        } catch (e) {
            // Ignore parse errors
        }

        setLastMessage(message);
        
        // Schedule the next message processing with a slight delay
        processingTimeoutRef.current = setTimeout(() => {
            processingMessageRef.current = false;
            processNextMessage();
        }, 10); 
    }, []);

    const sendMessage = useCallback((message: any) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket not connected. Message not sent:', message);
        }
    }, []);


    const queueMessage = useCallback((event: MessageEvent) => {
        messageQueueRef.current.push(event);
        processNextMessage();
    }, [processNextMessage]);

    const connect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
            console.log("WebSocket already connecting/open.");
            return;
        }

        console.log(`Attempting to connect to ${WEBSOCKET_URL}...`);
        setReadyState(WebSocket.CONNECTING);

        if (ws.current) {
            ws.current.onopen = null;
            ws.current.onclose = null;
            ws.current.onerror = null;
            ws.current.onmessage = null;
        }

        ws.current = new WebSocket(WEBSOCKET_URL);

        ws.current.onopen = () => {
            console.log('WebSocket Connected');
            setReadyState(WebSocket.OPEN);
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }

            if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = setInterval(() => {
                if (ws.current?.readyState === WebSocket.OPEN) {
                    pingTimeRef.current = Date.now();
                    sendMessage({ type: 'ping', payload: { ts: pingTimeRef.current } });
                }
            }, PING_INTERVAL);
        };

        ws.current.onclose = (event) => {
            console.log(`WebSocket Disconnected (Code: ${event.code}, Reason: ${event.reason})`);
            setReadyState(WebSocket.CLOSED);
            ws.current = null;
            messageQueueRef.current = [];
            processingMessageRef.current = false;
            if (processingTimeoutRef.current) {
                clearTimeout(processingTimeoutRef.current);
                processingTimeoutRef.current = null;
            }
            if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
                pingIntervalRef.current = null;
            }
            if (event.code !== 1000 && !reconnectTimeoutRef.current) {
                 console.log(`Scheduling reconnect in ${RECONNECT_DELAY / 1000} seconds...`);
                 reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY);
            }
        };

        ws.current.onerror = (error) => {
            console.error('WebSocket Error:', error);
             if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
                pingIntervalRef.current = null;
            }
        };

        ws.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'pong' && data.payload?.ts && pingTimeRef.current) {
                    const rtt = Date.now() - data.payload.ts;
                    setLatency(rtt);
                    pingTimeRef.current = null;
                    return; 
                }
                
                // Special handling for assign_id: prioritize it
                if (data.type === 'assign_id') {
                    console.log('Received assign_id message, processing immediately');
                    messageQueueRef.current = [];
                    if (processingTimeoutRef.current) {
                        clearTimeout(processingTimeoutRef.current);
                        processingTimeoutRef.current = null;
                    }
                    processingMessageRef.current = false;
                    
                    setLastMessage(event);
                    return;
                }
            } catch (e) {
                // Ignore parse errors
            }
            
            queueMessage(event);
        };
    }, [queueMessage, sendMessage]);

    useEffect(() => {
        connect();

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
            }
            if (processingTimeoutRef.current) {
                clearTimeout(processingTimeoutRef.current);
            }
            if (ws.current) {
                console.log("Closing WebSocket connection on unmount.");
                ws.current.onclose = null;
                ws.current.close(1000);
            }
            ws.current = null;
        };
    }, [connect]);

    const reconnect = useCallback(() => {
        if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
            console.log("Closing existing connection before manual reconnect...");
            ws.current.onclose = null;
            ws.current.close(1000, "Manual reconnect requested");
        }
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        console.log("Manual reconnect initiated.");
        connect();
    }, [connect]);

    const connected = readyState === WebSocket.OPEN;

    return { sendMessage, lastMessage, readyState, latency, connected, reconnect };
}
