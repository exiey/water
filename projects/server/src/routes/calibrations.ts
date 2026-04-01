import express, { type Request, type Response } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';

const router = express.Router();
const client = getSupabaseClient();

// 获取所有校准设置
router.get('/', async (req: Request, res: Response) => {
  try {
    const { data, error } = await client
      .from('calibrations')
      .select('*')
      .order('parameter_type', { ascending: true });

    if (error) throw new Error(`查询校准设置失败: ${error.message}`);

    res.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('获取校准设置失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// 获取单个参数的校准设置
router.get('/:parameter_type', async (req: Request, res: Response) => {
  try {
    const { parameter_type } = req.params;

    const { data, error } = await client
      .from('calibrations')
      .select('*')
      .eq('parameter_type', parameter_type)
      .maybeSingle();

    if (error) throw new Error(`查询校准设置失败: ${error.message}`);

    res.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('获取校准设置失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// 新增或更新校准设置（upsert）
router.post('/', async (req: Request, res: Response) => {
  try {
    const { parameter_type, offset_value, scale_factor } = req.body;

    const { data, error } = await client
      .from('calibrations')
      .upsert(
        {
          parameter_type,
          offset_value: offset_value ?? 0,
          scale_factor: scale_factor ?? 1,
          applied_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'parameter_type' }
      )
      .select()
      .single();

    if (error) throw new Error(`保存校准设置失败: ${error.message}`);

    res.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('保存校准设置失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// 更新校准设置
router.put('/:parameter_type', async (req: Request, res: Response) => {
  try {
    const { parameter_type } = req.params;
    const { offset_value, scale_factor } = req.body;

    const { data, error } = await client
      .from('calibrations')
      .update({
        offset_value,
        scale_factor,
        applied_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('parameter_type', parameter_type)
      .select()
      .single();

    if (error) throw new Error(`更新校准设置失败: ${error.message}`);

    res.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('更新校准设置失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// 删除校准设置
router.delete('/:parameter_type', async (req: Request, res: Response) => {
  try {
    const { parameter_type } = req.params;

    const { error } = await client
      .from('calibrations')
      .delete()
      .eq('parameter_type', parameter_type);

    if (error) throw new Error(`删除校准设置失败: ${error.message}`);

    res.json({ success: true });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('删除校准设置失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

export default router;
