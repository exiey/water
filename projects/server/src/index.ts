import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import monitoringRoutes from './routes/monitoring.js';
import thresholdRoutes from './routes/thresholds.js';
import calibrationRoutes from './routes/calibrations.js';
import aiRoutes from './routes/ai.js';
import onenetRoutes from './routes/onenet.js';
import { initializeMonitoringRealtime } from './services/monitoring-realtime.js';
import { startOnenentPolling } from './services/onenet-polling.js';

const app = express();
const port = process.env.PORT || 9091;
const server = createServer(app);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/v1/health', (_req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

app.use('/api/v1/monitoring', monitoringRoutes);
app.use('/api/v1/thresholds', thresholdRoutes);
app.use('/api/v1/calibrations', calibrationRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/onenet', onenetRoutes);

initializeMonitoringRealtime(server);

server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
  startOnenentPolling(10000);
});
