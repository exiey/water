import { fetchLatestOneNETSnapshot, type MonitoringSnapshot } from './onenet.js';

const HISTORY_LIMIT = 20;

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;
let latestSnapshot: MonitoringSnapshot | null = null;
const snapshotHistory: MonitoringSnapshot[] = [];

function hasChanged(previous: MonitoringSnapshot | null, next: MonitoringSnapshot): boolean {
  if (!previous) {
    return true;
  }

  return (
    previous.water_flow !== next.water_flow ||
    previous.total_flow !== next.total_flow ||
    previous.water_level !== next.water_level ||
    previous.water_quality !== next.water_quality ||
    previous.euler_angle_x !== next.euler_angle_x ||
    previous.euler_angle_y !== next.euler_angle_y ||
    previous.euler_angle_z !== next.euler_angle_z ||
    previous.lora_status !== next.lora_status
  );
}

function pushHistory(snapshot: MonitoringSnapshot): void {
  snapshotHistory.unshift(snapshot);
  if (snapshotHistory.length > HISTORY_LIMIT) {
    snapshotHistory.length = HISTORY_LIMIT;
  }
}

export async function syncLatestSnapshot(): Promise<MonitoringSnapshot | null> {
  if (isPolling) {
    return latestSnapshot;
  }

  try {
    isPolling = true;
    const nextSnapshot = await fetchLatestOneNETSnapshot();
    if (!nextSnapshot) {
      return latestSnapshot;
    }

    if (hasChanged(latestSnapshot, nextSnapshot)) {
      latestSnapshot = nextSnapshot;
      pushHistory(nextSnapshot);
      console.log('[OneNET轮询] 新数据:', JSON.stringify(nextSnapshot, null, 2));
    } else {
      latestSnapshot = nextSnapshot;
    }

    return latestSnapshot;
  } finally {
    isPolling = false;
  }
}

export function startOneNETPolling(intervalMs = 3000): void {
  if (pollingInterval) {
    console.log('[OneNET轮询] 服务已在运行');
    return;
  }

  console.log(`[OneNET轮询] 启动服务，间隔 ${intervalMs}ms`);
  void syncLatestSnapshot();
  pollingInterval = setInterval(() => {
    void syncLatestSnapshot();
  }, intervalMs);
}

export function getLatestSnapshot(): MonitoringSnapshot | null {
  return latestSnapshot;
}

export function getSnapshotHistory(limit = HISTORY_LIMIT): MonitoringSnapshot[] {
  return snapshotHistory.slice(0, limit);
}
