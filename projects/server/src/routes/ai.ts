import express, { type Request, type Response } from 'express';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '../storage/database/supabase-client';

const router = express.Router();
const client = getSupabaseClient();

// AI对话系统提示词
const SYSTEM_PROMPT = `你是一个专业的大坝监测智能助手。你的职责是：
1. 分析大坝监测数据，包括流量、水位、水质（TDS）、姿态角和LoRa通信状态
2. 识别异常数据并提供预警建议
3. 回答用户关于大坝监测的专业问题
4. 提供数据分析和趋势预测

监测参数说明（来自OneNET云平台）：
- 瞬时流量 (water_flow)：单位 m³/s，表示当前水流量
- 累计流量 (total_flow)：单位 m³，表示累计总流量
- 水位 (water_level)：单位 cm，正常范围根据大坝设计确定
- TDS值 (water_quality)：单位 ppm，水质指标，<50为优质，50-300为良好，>300为偏高
- 横滚角 (euler_angle_x)：单位度，大坝左右倾斜角度，正常偏差应在±5度以内
- 俯仰角 (euler_angle_y)：单位度，大坝前后倾斜角度，正常偏差应在±5度以内
- 偏航角 (euler_angle_z)：单位度，大坝旋转角度
- LoRa状态 (lora_status)：connected/disconnected，disconnected表示通信异常

当发现异常数据时，请：
1. 明确指出异常参数和数值
2. 分析可能的原因
3. 提供具体的预警建议和处置措施`;

// 获取对话历史
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { limit = '50' } = req.query;
    const limitNum = parseInt(limit as string, 10);

    const { data, error } = await client
      .from('ai_conversations')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(limitNum);

    if (error) throw new Error(`查询对话历史失败: ${error.message}`);

    res.json({ success: true, data });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('获取对话历史失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// AI对话（流式输出）
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, include_context = true } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: '消息不能为空' });
    }

    // 保存用户消息
    await client.from('ai_conversations').insert({
      role: 'user',
      content: message,
    });

    // 获取最近监测数据作为上下文
    let contextData = '';
    if (include_context) {
      const { data: latestData } = await client
        .from('monitoring_data')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(10);

      if (latestData && latestData.length > 0) {
        contextData = `\n\n当前监测数据（最近${latestData.length}条记录）：
${latestData.map((d, i) => 
  `记录${i + 1}: 瞬时流量=${d.water_flow}m³/s, 累计流量=${d.total_flow || 0}m³, 水位=${d.water_level}cm, TDS=${d.water_quality}ppm, 横滚角=${d.euler_angle_x}°, 俯仰角=${d.euler_angle_y}°, 偏航角=${d.euler_angle_z}°, LoRa=${d.lora_status}, 时间=${d.recorded_at}`
).join('\n')}`;
      }
    }

    // 获取对话历史
    const { data: history } = await client
      .from('ai_conversations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT + contextData },
    ];

    // 添加历史对话（倒序后正序添加）
    if (history && history.length > 0) {
      const sortedHistory = history.reverse();
      for (const msg of sortedHistory) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // 设置流式响应头
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate');
    res.setHeader('Connection', 'keep-alive');

    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    const stream = llmClient.stream(messages, {
      model: 'doubao-seed-1-8-251228',
      temperature: 0.7,
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      if (chunk.content) {
        const text = chunk.content.toString();
        fullResponse += text;
        res.write(`data: ${text}\n\n`);
      }
    }

    // 保存AI回复
    if (fullResponse) {
      await client.from('ai_conversations').insert({
        role: 'assistant',
        content: fullResponse,
      });
    }

    // 发送结束标记
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('AI对话失败:', errorMessage);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: errorMessage });
    } else {
      res.write(`data: [ERROR] ${errorMessage}\n\n`);
      res.end();
    }
  }
});

// 清空对话历史
router.delete('/history', async (req: Request, res: Response) => {
  try {
    const { error } = await client
      .from('ai_conversations')
      .delete()
      .neq('id', 0); // 删除所有记录

    if (error) throw new Error(`清空对话历史失败: ${error.message}`);

    res.json({ success: true });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('清空对话历史失败:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

export default router;
