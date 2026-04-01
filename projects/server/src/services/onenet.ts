import crypto from 'node:crypto';

const DEFAULT_API_BASE = 'https://iot-api.heclouds.com';
const TOKEN_VERSION = '2018-10-31';

const DEFAULT_ONENET_CONFIG = {
  productId: 'Z7Y6GY5MYy',
  deviceId: 'esp8266_01',
  accessKey: 'MWMJmQs1sbkfU7ENJdufrxOv3VHhHYlpK3vd7UWRRZU=',
  deviceKey: 'akpwNWU1YXUzbFVOTGpybThaTktSaXNOSzBpQ2xZa3Y=',
  apiBase: DEFAULT_API_BASE,
} as const;

type OneNETPropertyItem = {
  identifier: string;
  time?: number;
  value?: string | number | boolean | Record<string, unknown>;
  data_type?: string;
};

type OneNETPropertyResponse = {
  code: number;
  data?: OneNETPropertyItem[];
  msg?: string;
  error?: string;
  request_id?: string;
};

export type OneNETConfig = {
  productId: string;
  deviceId: string;
  accessKey: string;
  deviceKey?: string;
  apiBase?: string;
};

export type MonitoringSnapshot = {
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
  source: 'onenet_http';
  raw_payload: OneNETPropertyResponse;
};

function getConfig(): OneNETConfig {
  return {
    productId: process.env.ONENET_PRODUCT_ID || DEFAULT_ONENET_CONFIG.productId,
    deviceId: process.env.ONENET_DEVICE_ID || DEFAULT_ONENET_CONFIG.deviceId,
    accessKey: process.env.ONENET_ACCESS_KEY || DEFAULT_ONENET_CONFIG.accessKey,
    deviceKey: process.env.ONENET_DEVICE_KEY || DEFAULT_ONENET_CONFIG.deviceKey,
    apiBase: process.env.ONENET_API_BASE || DEFAULT_ONENET_CONFIG.apiBase,
  };
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'on', 'yes'].includes(value.toLowerCase());
  }

  return false;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function buildOneNETToken(config: OneNETConfig, expireTs: number): string {
  const resource = `products/${config.productId}`;
  const method = 'md5';
  const signContent = `${expireTs}\n${method}\n${resource}\n${TOKEN_VERSION}`;
  const key = Buffer.from(config.accessKey, 'base64');
  const sign = crypto.createHmac(method, key).update(signContent, 'utf8').digest('base64');

  return [
    `version=${TOKEN_VERSION}`,
    `res=${encodeURIComponent(resource)}`,
    `et=${expireTs}`,
    `method=${method}`,
    `sign=${encodeURIComponent(sign)}`,
  ].join('&');
}

function normalizePropertyList(config: OneNETConfig, payload: OneNETPropertyResponse): MonitoringSnapshot {
  const items = payload.data ?? [];
  const map = new Map(items.map(item => [item.identifier, item]));
  const angle = toObject(map.get('angle')?.value);
  const flow = toObject(map.get('flow')?.value);
  const latestTime = items.reduce((max, item) => Math.max(max, item.time ?? 0), 0);
  const recordedAt = latestTime > 0 ? new Date(latestTime).toISOString() : new Date().toISOString();

  return {
    id: latestTime > 0 ? latestTime : Date.now(),
    water_flow: toNumber(flow?.instant_flow),
    total_flow: toNumber(flow?.total_flow),
    water_level: toNumber(map.get('water_level')?.value),
    water_quality: toNumber(map.get('tds_value')?.value),
    euler_angle_x: toNumber(angle?.roll_angle),
    euler_angle_y: toNumber(angle?.pitch_angle),
    euler_angle_z: toNumber(angle?.yaw_angle),
    lora_status: toBoolean(map.get('lora_comm_status')?.value) ? 'connected' : 'disconnected',
    recorded_at: recordedAt,
    source: 'onenet_http',
    raw_payload: payload,
  };
}

export async function fetchLatestOneNETSnapshot(): Promise<MonitoringSnapshot | null> {
  const config = getConfig();
  if (!config.productId || !config.deviceId || !config.accessKey) {
    console.error('[onenet] Missing required config');
    return null;
  }

  const expireTs = Math.floor(Date.now() / 1000) + 3600;
  const authorization = buildOneNETToken(config, expireTs);
  const url = new URL('/thingmodel/query-device-property', config.apiBase || DEFAULT_API_BASE);

  url.searchParams.set('product_id', config.productId);
  url.searchParams.set('device_name', config.deviceId);

  console.log('[onenet] query url:', url.toString());

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: authorization,
      Accept: 'application/json',
    },
  });

  const payload = (await response.json()) as OneNETPropertyResponse;
  console.log('[onenet] query status:', response.status);
  console.log('[onenet] query payload:', JSON.stringify(payload, null, 2));

  if (!response.ok || payload.code !== 0 || !payload.data) {
    console.error('[onenet] query-device-property failed:', payload);
    return null;
  }

  return normalizePropertyList(config, payload);
}

export function getOneNETPublicConfig() {
  const config = getConfig();
  return {
    productId: config.productId,
    deviceId: config.deviceId,
    apiBase: config.apiBase || DEFAULT_API_BASE,
  };
}
