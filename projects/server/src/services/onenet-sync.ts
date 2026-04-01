import { getSupabaseClient } from '../storage/database/supabase-client.js';
import { convertToMonitoringData, getDeviceProperties, type OneNETConfig, type OneNETPropertyData } from './onenet.js';

const client = getSupabaseClient();

export interface MonitoringRecord {
  id: number;
  water_flow: number;
  total_flow: number;
  water_level: number;
  water_quality: number;
  euler_angle_x: number;
  euler_angle_y: number;
  euler_angle_z: number;
  lora_status: string;
  recorded_at: string;
}

interface ActiveOneNETConfig extends OneNETConfig {
  id: number;
}

export interface OneNETSyncResult {
  success: boolean;
  inserted: boolean;
  monitoringData: MonitoringRecord | null;
  rawProperties: OneNETPropertyData | null;
  reason: 'inserted' | 'unchanged' | 'config-missing' | 'fetch-failed';
  error?: string;
}

async function getActiveConfig(): Promise<ActiveOneNETConfig | null> {
  const { data, error } = await client
    .from('onenet_config')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    access_key: data.access_key,
    product_id: data.product_id,
    device_id: data.device_id,
    device_key: data.device_key,
  };
}

export async function getLatestMonitoringData(): Promise<MonitoringRecord | null> {
  const { data, error } = await client
    .from('monitoring_data')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Query latest monitoring data failed: ${error.message}`);
  }

  return data;
}

function hasMonitoringDataChanged(
  previous: MonitoringRecord | null,
  next: ReturnType<typeof convertToMonitoringData>
): boolean {
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

async function logSync(configId: number, status: 'success' | 'failed', message: string, snapshot?: OneNETPropertyData): Promise<void> {
  const { error } = await client
    .from('onenet_sync_log')
    .insert({
      config_id: configId,
      status,
      message,
      data_snapshot: snapshot ? JSON.stringify(snapshot) : null,
    });

  if (error) {
    console.error('[OneNET Sync] Failed to write sync log:', error.message);
  }
}

export async function syncOneNETData(options?: { forceInsert?: boolean }): Promise<OneNETSyncResult> {
  const config = await getActiveConfig();
  if (!config) {
    return {
      success: false,
      inserted: false,
      monitoringData: null,
      rawProperties: null,
      reason: 'config-missing',
      error: '未找到启用中的 OneNET 配置',
    };
  }

  try {
    const properties = await getDeviceProperties(config);
    if (!properties) {
      await logSync(config.id, 'failed', 'OneNET 未返回设备属性');
      return {
        success: false,
        inserted: false,
        monitoringData: null,
        rawProperties: null,
        reason: 'fetch-failed',
        error: 'OneNET 未返回设备属性',
      };
    }

    const monitoringData = convertToMonitoringData(properties);
    const latestRecord = await getLatestMonitoringData();
    const shouldInsert = options?.forceInsert || hasMonitoringDataChanged(latestRecord, monitoringData);

    let insertedRecord: MonitoringRecord | null = null;
    if (shouldInsert) {
      const { data, error } = await client
        .from('monitoring_data')
        .insert({
          water_flow: monitoringData.water_flow,
          total_flow: monitoringData.total_flow,
          water_level: monitoringData.water_level,
          water_quality: monitoringData.water_quality,
          euler_angle_x: monitoringData.euler_angle_x,
          euler_angle_y: monitoringData.euler_angle_y,
          euler_angle_z: monitoringData.euler_angle_z,
          lora_status: monitoringData.lora_status,
          recorded_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (error) {
        throw new Error(`插入监测数据失败: ${error.message}`);
      }

      insertedRecord = data;
    }

    const syncTime = new Date().toISOString();
    await client
      .from('onenet_config')
      .update({ last_sync_at: syncTime })
      .eq('id', config.id);

    await logSync(
      config.id,
      'success',
      shouldInsert ? '同步成功并写入新监测数据' : '同步成功，数据无变化',
      properties
    );

    return {
      success: true,
      inserted: Boolean(insertedRecord),
      monitoringData: insertedRecord ?? latestRecord,
      rawProperties: properties,
      reason: shouldInsert ? 'inserted' : 'unchanged',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await logSync(config.id, 'failed', message);

    return {
      success: false,
      inserted: false,
      monitoringData: null,
      rawProperties: null,
      reason: 'fetch-failed',
      error: message,
    };
  }
}
