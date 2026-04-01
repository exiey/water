import express, { type Request, type Response } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';

const router = express.Router();
const client = getSupabaseClient();

// 获取所有阈值设置
router.get('/', async (req: Request, res: Response) => {
  try {
    const { data, error } = await client
      .from('thresholds')
      .select('*')
      .order('parameter_type', { ascending: true });

    if (error) throw new Error(`查询阈值设置失败: ${error.message}`);

    res.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('获取阈值设置失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// 获取单个参数的阈值设置
router.get('/:parameter_type', async (req: Request, res: Response) => {
  try {
    const { parameter_type } = req.params;

    const { data, error } = await client
      .from('thresholds')
      .select('*')
      .eq('parameter_type', parameter_type)
      .maybeSingle();

    if (error) throw new Error(`查询阈值设置失败: ${error.message}`);

    res.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('获取阈值设置失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// 新增或更新阈值设置（upsert）
router.post('/', async (req: Request, res: Response) => {
  try {
    const { parameter_type, min_value, max_value, unit, is_enabled } = req.body;

    const { data, error } = await client
      .from('thresholds')
      .upsert(
        {
          parameter_type,
          min_value,
          max_value,
          unit,
          is_enabled: is_enabled ?? true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'parameter_type' }
      )
      .select()
      .single();

    if (error) throw new Error(`保存阈值设置失败: ${error.message}`);

    res.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('保存阈值设置失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// 更新阈值设置
router.put('/:parameter_type', async (req: Request, res: Response) => {
  try {
    const { parameter_type } = req.params;
    const { min_value, max_value, unit, is_enabled } = req.body;

    const { data, error } = await client
      .from('thresholds')
      .update({
        min_value,
        max_value,
        unit,
        is_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('parameter_type', parameter_type)
      .select()
      .single();

    if (error) throw new Error(`更新阈值设置失败: ${error.message}`);

    res.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('更新阈值设置失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// 删除阈值设置
router.delete('/:parameter_type', async (req: Request, res: Response) => {
  try {
    const { parameter_type } = req.params;

    const { error } = await client
      .from('thresholds')
      .delete()
      .eq('parameter_type', parameter_type);

    if (error) throw new Error(`删除阈值设置失败: ${error.message}`);

    res.json({ success: true });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('删除阈值设置失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

export default router;
