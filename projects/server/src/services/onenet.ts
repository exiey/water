import * as crypto from 'crypto';

const ONENET_API_BASE = 'https://iot-api.heclouds.com';

interface OneNETPropertyValue {
  value: unknown;
  time?: string;
}

interface OneNETPropertyData {
  angle?: OneNETPropertyValue & {
    value: {
      pitch_angle: number;
      roll_angle: number;
      yaw_angle: number;
    };
  };
  flow?: OneNETPropertyValue & {
    value: {
      total_flow: number;
      instant_flow: number;
    };
  };
  lora_comm_status?: OneNETPropertyValue & {
    value: boolean;
  };
  tds_value?: OneNETPropertyValue & {
    value: number;
  };
  water_level?: OneNETPropertyValue & {
    value: number;
  };
}

interface OneNETConfig {
  access_key: string;
  product_id: string;
  device_id: string;
  device_key?: string;
}

interface OneNETAPIResponse {
  code: number;
  msg?: string;
  error?: string;
  data?: Record<string, unknown>;
}

export function generateToken(config: OneNETConfig, expireHours = 24): string {
  const { access_key, product_id, device_id } = config;
  const et = Math.floor(Date.now() / 1000) + expireHours * 3600;
  const method = 'md5';
  const version = '2018-10-31';
  const res = `products/${product_id}/devices/${device_id}`;

  // OneNET v5 token signing string order is fixed.
  const stringToSign = `${et}\n${method}\n${res}\n${version}`;
  const accessKeyBuffer = Buffer.from(access_key, 'base64');
  const sign = crypto
    .createHmac('md5', accessKeyBuffer)
    .update(stringToSign)
    .digest('base64');

  return `version=${version}&res=${encodeURIComponent(res)}&et=${et}&method=${method}&sign=${encodeURIComponent(sign)}`;
}

export async function getDeviceProperties(config: OneNETConfig): Promise<OneNETPropertyData | null> {
  const token = generateToken(config);
  const { product_id, device_id } = config;
  const url = `${ONENET_API_BASE}/thing/${product_id}/${device_id}/property/last`;

  console.log('Requesting OneNET API:', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: token,
      Accept: 'application/json',
    },
  });

  console.log('OneNET API status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OneNET API error:', errorText);
    throw new Error(`OneNET API error (${response.status}): ${errorText}`);
  }

  const result = await response.json() as OneNETAPIResponse;
  console.log('OneNET API result:', JSON.stringify(result, null, 2));

  if (result.code !== 0) {
    throw new Error(`OneNET API returned code=${result.code}, msg=${result.msg || result.error}`);
  }

  return parseOneNETProperties(result.data || {});
}

function parseOneNETProperties(data: Record<string, unknown>): OneNETPropertyData | null {
  if (!data) {
    return null;
  }

  const result: OneNETPropertyData = {};

  for (const [key, value] of Object.entries(data)) {
    if (key === 'angle' && typeof value === 'object' && value !== null) {
      result.angle = value as OneNETPropertyData['angle'];
    } else if (key === 'flow' && typeof value === 'object' && value !== null) {
      result.flow = value as OneNETPropertyData['flow'];
    } else if (key === 'lora_comm_status' && typeof value === 'object' && value !== null) {
      result.lora_comm_status = value as OneNETPropertyData['lora_comm_status'];
    } else if (key === 'tds_value' && typeof value === 'object' && value !== null) {
      result.tds_value = value as OneNETPropertyData['tds_value'];
    } else if (key === 'water_level' && typeof value === 'object' && value !== null) {
      result.water_level = value as OneNETPropertyData['water_level'];
    }
  }

  return result;
}

export function convertToMonitoringData(properties: OneNETPropertyData) {
  return {
    water_flow: properties.flow?.value?.instant_flow ?? 0,
    total_flow: properties.flow?.value?.total_flow ?? 0,
    water_level: properties.water_level?.value ?? 0,
    water_quality: properties.tds_value?.value ?? 0,
    euler_angle_x: properties.angle?.value?.roll_angle ?? 0,
    euler_angle_y: properties.angle?.value?.pitch_angle ?? 0,
    euler_angle_z: properties.angle?.value?.yaw_angle ?? 0,
    lora_status: properties.lora_comm_status?.value ? 'connected' : 'disconnected',
  };
}

export function verifyPushSignature(config: OneNETConfig, body: string, signature: string): boolean {
  const { device_key } = config;
  if (!device_key) {
    return true;
  }

  const expectedSignature = crypto
    .createHmac('md5', device_key)
    .update(body)
    .digest('base64');

  return signature === expectedSignature;
}

export type { OneNETConfig, OneNETPropertyData };
