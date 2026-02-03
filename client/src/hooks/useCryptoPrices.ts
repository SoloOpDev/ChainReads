import { useState, useEffect, useRef } from 'react';

interface PriceData {
  btc: number | null;
  eth: number | null;
}

export function useCryptoPrices() {
  const [prices, setPrices] = useState<PriceData>({ btc: null, eth: null });
  const wsRefs = useRef<{ btc?: WebSocket; eth?: WebSocket }>({});
  const reconnectTimeouts = useRef<{ btc?: NodeJS.Timeout; eth?: NodeJS.Timeout }>({});

  useEffect(() => {
    const connectWebSocket = (symbol: 'btc' | 'eth', url: string) => {
      // Clear any existing reconnect timeout
      if (reconnectTimeouts.current[symbol]) {
        clearTimeout(reconnectTimeouts.current[symbol]);
      }

      // Close existing connection if any
      if (wsRefs.current[symbol]) {
        wsRefs.current[symbol]?.close();
      }

      const ws = new WebSocket(url);
      wsRefs.current[symbol] = ws;

      ws.onopen = () => {
        console.log(`${symbol.toUpperCase()} WebSocket connected`);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const price = parseFloat(data.p); // 'p' is the price field in Binance trade stream
          
          setPrices((prev) => ({
            ...prev,
            [symbol]: price,
          }));
        } catch (error) {
          console.error(`Error parsing ${symbol} price:`, error);
        }
      };

      ws.onerror = (error) => {
        console.error(`${symbol.toUpperCase()} WebSocket error:`, error);
      };

      ws.onclose = () => {
        console.log(`${symbol.toUpperCase()} WebSocket closed, reconnecting...`);
        // Reconnect after 3 seconds
        reconnectTimeouts.current[symbol] = setTimeout(() => {
          connectWebSocket(symbol, url);
        }, 3000);
      };
    };

    // Connect to both BTC and ETH streams
    connectWebSocket('btc', 'wss://stream.binance.com:9443/ws/btcusdt@trade');
    connectWebSocket('eth', 'wss://stream.binance.com:9443/ws/ethusdt@trade');

    // Cleanup on unmount
    return () => {
      Object.values(wsRefs.current).forEach((ws) => ws?.close());
      Object.values(reconnectTimeouts.current).forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  return prices;
}
