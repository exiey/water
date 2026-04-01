import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { initWebSocket, getConnectedClientsCount, getLastData } from './websocket.js';
import { getOneNETPublicConfig } from './onenet.js';
import aiRoutes from './routes/ai.js';

const app = express();
const port = process.env.PORT || 9091;
const server = createServer(app);

// 初始化 WebSocket 服务
initWebSocket(server);

app.use(cors());
app.use(express.json());

app.get('/api/v1/health', (_req, res) => {
  res.json({ 
    status: 'ok',
    websocketClients: getConnectedClientsCount(),
  });
});

app.get('/api/v1/onenet/config', (_req, res) => {
  res.json({ success: true, data: getOneNETPublicConfig() });
});

app.get('/api/v1/monitoring/latest', (_req, res) => {
  const data = getLastData();
  res.json({ success: true, data });
});

// AI智能分析路由
app.use('/api/v1/ai', aiRoutes);

server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
  console.log(`WebSocket available at ws://localhost:${port}/ws/monitoring`);
});
