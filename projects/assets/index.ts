import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import sensorsRouter from "./routes/sensors";
import tasksRouter from "./routes/tasks";
import aiRouter from "./routes/ai";
import versionRouter from "./routes/version";
import { initWebSocket, getConnectedClientsCount } from "./services/websocket";

const app = express();
const port = process.env.PORT || 9091;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check
app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ 
    status: 'ok',
    websocketClients: getConnectedClientsCount(),
  });
});

// Routes
app.use('/api/v1/sensors', sensorsRouter);
app.use('/api/v1/tasks', tasksRouter);
app.use('/api/v1/ai', aiRouter);
app.use('/api/v1/version', versionRouter);

// 创建 HTTP 服务器
const server = createServer(app);

// 初始化 WebSocket 服务
initWebSocket(server);

server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
  console.log(`WebSocket available at ws://localhost:${port}/ws/sensors`);
});
