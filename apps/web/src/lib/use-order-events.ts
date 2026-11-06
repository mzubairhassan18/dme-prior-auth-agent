'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export interface OrderRealtimeEvent {
  type: string;
  occurredAt: string;
  data: {
    orderId?: string;
    status?: string;
    outcome?: string;
    policyReference?: string;
    confidence?: number;
    error?: string;
  };
}

function socketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (configured) {
    return configured;
  }
  try {
    return new URL(API_URL).origin;
  } catch {
    return 'http://localhost:3001';
  }
}

/** Subscribes to `order.*` events and refreshes affected queries. */
export function useOrderEvents() {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<OrderRealtimeEvent | null>(null);

  useEffect(() => {
    const socket = io(`${socketUrl()}/orders`);
    const connect = () => setConnected(true);
    const disconnect = () => setConnected(false);
    const onEvent = (event: OrderRealtimeEvent) => {
      setLastEvent(event);

      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (event.data?.orderId) {
        void queryClient.invalidateQueries({ queryKey: ['order', event.data.orderId] });
      }
    };

    socket.on('connect', connect);
    socket.on('disconnect', disconnect);
    socket.on('connect_error', disconnect);
    socket.on('order.event', onEvent);

    return () => {
      socket.off('connect', connect);
      socket.off('disconnect', disconnect);
      socket.off('connect_error', disconnect);
      socket.off('order.event', onEvent);
      socket.disconnect();
    };
  }, [queryClient]);

  return { connected, lastEvent };
}
