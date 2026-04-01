import { broadcastMonitoringUpdate } from './monitoring-realtime.js';
import { syncOneNETData } from './onenet-sync.js';

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

async function doSync(): Promise<boolean> {
  if (isPolling) {
    return false;
  }

  try {
    isPolling = true;

    const result = await syncOneNETData();
    if (!result.success) {
      console.error('[OneNET轮询] 同步失败:', result.error);
      return false;
    }

    if (result.inserted && result.monitoringData) {
      broadcastMonitoringUpdate(result.monitoringData, 'polling');
      console.log('[OneNET轮询] 已写入并广播新数据');
    } else {
      console.log('[OneNET轮询] 同步成功，数据无变化');
    }

    return true;
  } catch (error) {
    console.error('[OneNET轮询] 同步失败:', error);
    return false;
  } finally {
    isPolling = false;
  }
}

export function startOnenentPolling(intervalMs: number = 10000): void {
  if (pollingInterval) {
    console.log('[OneNET轮询] 服务已在运行');
    return;
  }

  console.log(`[OneNET轮询] 启动服务，间隔 ${intervalMs}ms`);
  void doSync();
  pollingInterval = setInterval(() => {
    void doSync();
  }, intervalMs);
}

export function stopOnenetPolling(): void {
  if (!pollingInterval) {
    return;
  }

  clearInterval(pollingInterval);
  pollingInterval = null;
  console.log('[OneNET轮询] 服务已停止');
}

export function getPollingStatus(): { isRunning: boolean } {
  return { isRunning: pollingInterval !== null };
}
