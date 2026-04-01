import { Router } from 'express';
import type { Request, Response } from 'express';
import { LLMClient, Config } from 'coze-coding-dev-sdk';
import { getLastData } from '../websocket.js';

const router = Router();
const config = new Config();
const llmClient = new LLMClient(config);

// 对话历史存储（内存）
interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

let conversationHistory: Message[] = [];
let messageIdCounter = 0;

// 系统提示词
const SYSTEM_PROMPT = `你是大坝监测系统的AI智能分析助手。你的职责是：

1. **数据分析**：分析监测数据，包括：
   - 瞬时流量 (m³/s)
   - 累计流量 (m³)
   - 水位 (m)
   - TDS水质 (ppm)
   - 姿态角（欧拉角：roll/pitch/yaw）
   - LoRa通信状态

2. **异常识别**：识别以下异常情况：
   - 水位异常（过高或过低）
   - 流量异常（突变或持续异常）
   - TDS水质超标（正常范围：50-500ppm）
   - 姿态角异常（可能表示结构变形）
   - LoRa通信故障

3. **预警建议**：提供专业建议：
   - 针对异常数据给出预警
   - 提供可能的解决方案
   - 建议检查或维护措施

4. **交互风格**：
   - 专业、简洁、友好
   - 使用中文回答
   - 数据异常时明确指出风险等级
   - 提供具体数值和建议阈值

当前监测数据将作为上下文提供给你，请基于真实数据进行分析。`;

// 格式化时间为北京时间
function formatBeijingTime(isoString: string): string {
  const date = new Date(isoString);
  // 转换为北京时间 (UTC+8)
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = beijingTime.getUTCFullYear();
  const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getUTCDate()).padStart(2, '0');
  const hour = String(beijingTime.getUTCHours()).padStart(2, '0');
  const minute = String(beijingTime.getUTCMinutes()).padStart(2, '0');
  const second = String(beijingTime.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second} (北京时间)`;
}

// 获取监测数据上下文
function getMonitoringContext(): string {
  const latest = getLastData();

  if (!latest) {
    return '当前无法获取监测数据，请检查设备连接状态。';
  }

  const dataTime = formatBeijingTime(latest.recorded_at);
  const currentTime = formatBeijingTime(new Date().toISOString());

  let context = `## 当前监测数据\n`;
  context += `- 数据时间: ${dataTime}\n`;
  context += `- 分析时间: ${currentTime}\n\n`;
  context += `### 监测数值\n`;
  context += `- 瞬时流量: ${latest.water_flow} m³/s\n`;
  context += `- 累计流量: ${latest.total_flow} m³\n`;
  context += `- 水位: ${latest.water_level} m\n`;
  context += `- TDS水质: ${latest.water_quality} ppm\n`;
  context += `- 姿态角: Roll=${latest.euler_angle_x}°, Pitch=${latest.euler_angle_y}°, Yaw=${latest.euler_angle_z}°\n`;
  context += `- LoRa状态: ${latest.lora_status === 'connected' ? '在线' : '离线'}\n`;

  return context;
}

// GET /api/v1/ai/history - 获取对话历史
router.get('/history', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: conversationHistory,
  });
});

// DELETE /api/v1/ai/history - 清空对话历史
router.delete('/history', (_req: Request, res: Response) => {
  conversationHistory = [];
  messageIdCounter = 0;
  res.json({
    success: true,
    message: '对话历史已清空',
  });
});

// POST /api/v1/ai/chat - SSE流式聊天
router.post('/chat', async (req: Request, res: Response) => {
  const { message, include_context = true } = req.body;

  if (!message || typeof message !== 'string') {
    res.status(400).json({
      success: false,
      error: '消息内容不能为空',
    });
    return;
  }

  // 设置SSE响应头
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    // 添加用户消息到历史
    const userMessage: Message = {
      id: ++messageIdCounter,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    };
    conversationHistory.push(userMessage);

    // 构建消息列表
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // 添加监测数据上下文
    if (include_context) {
      const context = getMonitoringContext();
      messages.push({ role: 'system', content: `以下是当前监测数据，请基于此进行分析：\n\n${context}` });
    }

    // 添加历史对话（保留最近10轮）
    const recentHistory = conversationHistory.slice(-20);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // 添加当前用户消息
    messages.push({ role: 'user', content: message });

    // 调用LLM流式接口
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

    // 添加AI回复到历史
    const assistantMessage: Message = {
      id: ++messageIdCounter,
      role: 'assistant',
      content: fullResponse,
      created_at: new Date().toISOString(),
    };
    conversationHistory.push(assistantMessage);

    // 发送结束标记
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('[AI Chat] 错误:', error);
    res.write(`data: [ERROR] ${error.message || 'AI服务暂时不可用，请稍后重试'}\n\n`);
    res.end();
  }
});

export default router;
