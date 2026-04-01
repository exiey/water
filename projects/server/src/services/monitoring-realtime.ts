import type { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { getLatestMonitoringData, type MonitoringRecord } from './onenet-sync.js';

type RealtimeMessage =
  | {
      type: 'connected';
      mode: 'websocket';
      timestamp: string;
    }
  | {
      type: 'snapshot' | 'monitoring_update';
      data: MonitoringRecord;
      source: 'polling' | 'manual-sync';
      timestamp: string;
    };

let websocketServer: WebSocketServer | null = null;

function sendMessage(socket: WebSocket, message: RealtimeMessage): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}

export function initializeMonitoringRealtime(server: HTTPServer): void {
  if (websocketServer) {
    return;
  }

  websocketServer = new WebSocketServer({
    server,
    path: '/ws/monitoring',
  });

  websocketServer.on('connection', async socket => {
    sendMessage(socket, {
      type: 'connected',
      mode: 'websocket',
      timestamp: new Date().toISOString(),
    });

    try {
      const latestRecord = await getLatestMonitoringData();
      if (latestRecord) {
        sendMessage(socket, {
          type: 'snapshot',
          data: latestRecord,
          source: 'polling',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('[Realtime] Failed to send initial snapshot:', error);
    }
  });
}

export function broadcastMonitoringUpdate(
  record: MonitoringRecord,
  source: 'polling' | 'manual-sync'
): void {
  if (!websocketServer) {
    return;
  }

  const message: RealtimeMessage = {
    type: 'monitoring_update',
    data: record,
    source,
    timestamp: new Date().toISOString(),
  };

  for (const client of websocketServer.clients) {
    sendMessage(client, message);
  }
}
