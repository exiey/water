import express, { type Request, type Response } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client.js';
import { verifyPushSignature, type OneNETConfig } from '../services/onenet.js';
import { broadcastMonitoringUpdate } from '../services/monitoring-realtime.js';
import { syncOneNETData } from '../services/onenet-sync.js';

const router = express.Router();
const client = getSupabaseClient();

interface OneNETPushBody {
  msg: {
    type: string;
    devId: string;
    dsId: string;
    at: number;
    value: unknown;
  }[];
  nonce: string;
  signature: string;
}

async function getFullConfig(): Promise<OneNETConfig | null> {
  const { data, error } = await client
    .from('onenet_config')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    access_key: data.access_key,
    product_id: data.product_id,
    device_id: data.device_id,
    device_key: data.device_key,
  };
}

router.post('/push', async (req: Request, res: Response) => {
  try {
    const body = req.body as OneNETPushBody;
    console.log('收到 OneNET 推送:', JSON.stringify(body, null, 2));

    const config = await getFullConfig();
    if (!config) {
      console.error('未找到 OneNET 配置');
      return res.status(500).json({ code: 500, msg: '未找到 OneNET 配置' });
    }

    const signature = req.headers.signature as string | undefined;
    if (signature && !verifyPushSignature(config, JSON.stringify(body), signature)) {
      return res.status(401).json({ code: 401, msg: '签名验证失败' });
    }

    if (Array.isArray(body.msg)) {
      for (const message of body.msg) {
        console.log('处理推送消息:', message);
      }
    }

    res.json({ code: 200, msg: 'success' });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('处理 OneNET 推送失败:', errorMessage);
    res.status(500).json({ code: 500, msg: errorMessage });
  }
});

router.post('/sync', async (_req: Request, res: Response) => {
  try {
    const result = await syncOneNETData();
    if (!result.success) {
      return res.status(result.reason === 'config-missing' ? 400 : 500).json({
        success: false,
        error: result.error,
      });
    }

    if (result.inserted && result.monitoringData) {
      broadcastMonitoringUpdate(result.monitoringData, 'manual-sync');
    }

    res.json({
      success: true,
      data: {
        monitoring_data: result.monitoringData,
        raw_properties: result.rawProperties,
        inserted: result.inserted,
        reason: result.reason,
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('同步 OneNET 数据失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

router.get('/config', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await client
      .from('onenet_config')
      .select('id, name, product_id, device_id, is_active, last_sync_at, created_at, updated_at')
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new Error(`查询配置失败: ${error.message}`);
    }

    res.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('获取 OneNET 配置失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

router.get('/logs', async (req: Request, res: Response) => {
  try {
    const { limit = '20', offset = '0' } = req.query;
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    const { data, error } = await client
      .from('onenet_sync_log')
      .select('*')
      .order('synced_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (error) {
      throw new Error(`查询日志失败: ${error.message}`);
    }

    res.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('获取同步日志失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

export default router;
