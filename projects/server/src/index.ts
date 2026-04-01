import express from 'express';
import cors from 'cors';
import { getOneNETPublicConfig } from './services/onenet.js';
import {
  getLatestSnapshot,
  getSnapshotHistory,
  startOneNETPolling,
  syncLatestSnapshot,
} from './services/onenet-polling.js';

const app = express();
const port = Number(process.env.PORT || 9091);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/v1/onenet/config', (_req, res) => {
  res.json({ success: true, data: getOneNETPublicConfig() });
});

app.post('/api/v1/onenet/sync', async (_req, res) => {
  try {
    const snapshot = await syncLatestSnapshot();
    if (!snapshot) {
      return res.status(502).json({ success: false, error: '无法从 OneNET 获取数据' });
    }

    res.json({ success: true, data: snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

app.get('/api/v1/monitoring/latest', async (_req, res) => {
  try {
    const snapshot = getLatestSnapshot() ?? await syncLatestSnapshot();
    res.json({ success: true, data: snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

app.get('/api/v1/monitoring', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 20)));
    if (!getLatestSnapshot()) {
      await syncLatestSnapshot();
    }
    res.json({ success: true, data: getSnapshotHistory(limit) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
  startOneNETPolling(3000);
});
