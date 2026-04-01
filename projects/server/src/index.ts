import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { fetchLatestOneNETSnapshot, getOneNETPublicConfig, type MonitoringSnapshot } from './onenet.js';
import { startOneNETPolling, syncLatestSnapshot, getLatestSnapshot, getSnapshotHistory } from './onenet-polling.js';
import aiRoutes from './routes/ai.js';

const app = express();
const port = process.env.PORT || 9091;
const server = createServer(app);

// WebSocket 服务器
const wss = new WebSocketServer({ server, path: '/ws/monitoring' });

function broadcastUpdate(snapshot: MonitoringSnapshot): void {
  const message = JSON.stringify({
    type: 'monitoring_update',
    data: snapshot,
    timestamp: new Date().toISOString(),
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (socket) => {
  console.log('[WebSocket] 客户端连接');

  // 发送连接确认
  socket.send(JSON.stringify({
    type: 'connected',
    mode: 'websocket',
    timestamp: new Date().toISOString(),
  }));

  // 发送当前最新数据
  const latest = getLatestSnapshot();
  if (latest) {
    socket.send(JSON.stringify({
      type: 'snapshot',
      data: latest,
      timestamp: new Date().toISOString(),
    }));
  }

  socket.on('close', () => {
    console.log('[WebSocket] 客户端断开');
  });

  socket.on('error', (error) => {
    console.error('[WebSocket] 错误:', error.message);
  });
});

app.use(cors());
app.use(express.json());

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/v1/onenet/config', (_req, res) => {
  res.json({ success: true, data: getOneNETPublicConfig() });
});

app.get('/api/v1/onenet/sync', async (_req, res) => {
  const previousId = getLatestSnapshot()?.id;
  const snapshot = await syncLatestSnapshot();
  
  // 如果有新数据，广播给所有 WebSocket 客户端
  if (snapshot && snapshot.id !== previousId) {
    broadcastUpdate(snapshot);
  }
  
  res.json({ success: !!snapshot, data: snapshot });
});

app.get('/api/v1/onenet/latest', (_req, res) => {
  res.json({ success: true, data: getLatestSnapshot() });
});

app.get('/api/v1/onenet/history', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  res.json({ success: true, data: getSnapshotHistory(limit) });
});

app.get('/api/v1/monitoring', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const history = getSnapshotHistory(limit);
  res.json({ success: true, data: history });
});

app.get('/api/v1/monitoring/latest', (_req, res) => {
  res.json({ success: true, data: getLatestSnapshot() });
});

// AI智能分析路由
app.use('/api/v1/ai', aiRoutes);

server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
  console.log(`WebSocket listening at ws://localhost:${port}/ws/monitoring`);
  
  // 启动 OneNET 轮询，当有新数据时广播
  startOneNETPolling(3000, (snapshot) => {
    broadcastUpdate(snapshot);
  });
});
