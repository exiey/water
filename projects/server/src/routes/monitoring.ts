import express, { type Request, type Response } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';

const router = express.Router();
const client = getSupabaseClient();

// 获取监测数据列表（支持时间范围查询和分页）
router.get('/', async (req: Request, res: Response) => {
  try {
    const { start_time, end_time, limit = '100', offset = '0' } = req.query;
    
    let query = client
      .from('monitoring_data')
      .select('*')
      .order('recorded_at', { ascending: false });

    // 时间范围过滤
    if (start_time) {
      query = query.gte('recorded_at', start_time as string);
    }
    if (end_time) {
      query = query.lte('recorded_at', end_time as string);
    }

    // 分页
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data, error } = await query;

    if (error) throw new Error(`查询监测数据失败: ${error.message}`);

    res.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('获取监测数据失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// 获取最新监测数据
router.get('/latest', async (req: Request, res: Response) => {
  try {
    const { data, error } = await client
      .from('monitoring_data')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`查询最新数据失败: ${error.message}`);

    res.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('获取最新数据失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// 获取监测统计数据
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { data, error } = await client
      .from('monitoring_data')
      .select('water_flow, total_flow, water_level, water_quality, euler_angle_x, euler_angle_y, euler_angle_z, lora_status')
      .order('recorded_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(`查询统计数据失败: ${error.message}`);

    if (!data || data.length === 0) {
      return res.json({ success: true, data: null });
    }

    // 计算统计值
    const stats = {
      water_flow: {
        avg: data.reduce((sum, d) => sum + (d.water_flow || 0), 0) / data.length,
        max: Math.max(...data.map(d => d.water_flow || 0)),
        min: Math.min(...data.map(d => d.water_flow || 0)),
      },
      total_flow: {
        max: Math.max(...data.map(d => d.total_flow || 0)),
      },
      water_level: {
        avg: data.reduce((sum, d) => sum + (d.water_level || 0), 0) / data.length,
        max: Math.max(...data.map(d => d.water_level || 0)),
        min: Math.min(...data.map(d => d.water_level || 0)),
      },
      water_quality: {
        avg: data.reduce((sum, d) => sum + (d.water_quality || 0), 0) / data.length,
        max: Math.max(...data.map(d => d.water_quality || 0)),
        min: Math.min(...data.map(d => d.water_quality || 0)),
      },
      lora_status: {
        connected: data.filter(d => d.lora_status === 'connected').length,
        disconnected: data.filter(d => d.lora_status === 'disconnected').length,
      },
    };

    res.json({ success: true, data: stats });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('获取统计数据失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// 新增监测数据
router.post('/', async (req: Request, res: Response) => {
  try {
    const { water_flow, total_flow, water_level, water_quality, euler_angle_x, euler_angle_y, euler_angle_z, lora_status, recorded_at } = req.body;

    const { data, error } = await client
      .from('monitoring_data')
      .insert({
        water_flow,
        total_flow,
        water_level,
        water_quality,
        euler_angle_x,
        euler_angle_y,
        euler_angle_z,
        lora_status: lora_status || 'connected',
        recorded_at: recorded_at || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`新增监测数据失败: ${error.message}`);

    res.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('新增监测数据失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// 删除监测数据
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idNum = Array.isArray(id) ? parseInt(id[0], 10) : parseInt(id, 10);

    const { error } = await client
      .from('monitoring_data')
      .delete()
      .eq('id', idNum);

    if (error) throw new Error(`删除监测数据失败: ${error.message}`);

    res.json({ success: true });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('删除监测数据失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

export default router;
