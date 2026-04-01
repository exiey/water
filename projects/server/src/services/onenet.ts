import * as crypto from 'crypto';

/**
 * OneNET 云平台服务
 * 文档：https://open.iot.10086.cn/doc/v5/fuse/detail/912
 */

const ONENET_API_BASE = 'https://iot-api.heclouds.com';

// OneNET 设备属性数据结构
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

/**
 * 生成 OneNET Token
 * 格式：version=2018-10-31&res=products/{pid}/devices/{device_name}&et={et}&method=md5&sign={sign}
 */
export function generateToken(config: OneNETConfig, expireHours = 24): string {
  const { access_key, product_id, device_id } = config;

  // 计算过期时间戳（当前时间 + expireHours 小时）
  const et = Math.floor(Date.now() / 1000) + expireHours * 3600;

  // 资源路径
  const res = `products/${product_id}/devices/${device_id}`;

  // 签名字符串：res + '\n' + et
  const stringToSign = `${res}\n${et}`;

  // 解码 access_key（Base64）
  const accessKeyBuffer = Buffer.from(access_key, 'base64');

  // 使用 HMAC-MD5 签名
  const hmac = crypto.createHmac('md5', accessKeyBuffer);
  hmac.update(stringToSign);
  const sign = hmac.digest('base64');

  // 构建 Token
  const token = `version=2018-10-31&res=${encodeURIComponent(res)}&et=${et}&method=md5&sign=${encodeURIComponent(sign)}`;

  return token;
}

/**
 * 调用 OneNET API 获取设备最新属性
 * API文档：https://open.iot.10086.cn/doc/v5/fuse/detail/892
 */
export async function getDeviceProperties(config: OneNETConfig): Promise<OneNETPropertyData | null> {
  const token = generateToken(config);
  const { product_id, device_id } = config;

  // OneNET 查询设备属性 API
  const url = `https://iot-api.heclouds.com/thing/${product_id}/${device_id}/property/last`;

  console.log('请求 OneNET API:', url);
  console.log('Token:', token);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    console.log('OneNET API 响应状态:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OneNET API 响应错误:', errorText);
      throw new Error(`OneNET API 错误 (${response.status}): ${errorText}`);
    }

    const result = await response.json() as OneNETAPIResponse;
    console.log('OneNET API 返回数据:', JSON.stringify(result, null, 2));

    if (result.code !== 0) {
      throw new Error(`OneNET API 返回错误: code=${result.code}, msg=${result.msg || result.error}`);
    }

    // 解析返回的数据
    return parseOneNETProperties(result.data || {});
  } catch (error) {
    console.error('获取 OneNET 设备属性失败:', error);
    throw error;
  }
}

/**
 * 解析 OneNET 属性数据
 */
function parseOneNETProperties(data: Record<string, unknown>): OneNETPropertyData | null {
  if (!data) return null;

  const result: OneNETPropertyData = {};

  // 遍历属性数据
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

/**
 * 将 OneNET 数据转换为监测数据格式
 */
export function convertToMonitoringData(properties: OneNETPropertyData) {
  return {
    // 瞬时流量
    water_flow: properties.flow?.value?.instant_flow ?? 0,
    // 累计流量
    total_flow: properties.flow?.value?.total_flow ?? 0,
    // 水位
    water_level: properties.water_level?.value ?? 0,
    // TDS值（水质）
    water_quality: properties.tds_value?.value ?? 0,
    // 欧拉角：roll_angle -> X, pitch_angle -> Y, yaw_angle -> Z
    euler_angle_x: properties.angle?.value?.roll_angle ?? 0,
    euler_angle_y: properties.angle?.value?.pitch_angle ?? 0,
    euler_angle_z: properties.angle?.value?.yaw_angle ?? 0,
    // LoRa状态
    lora_status: properties.lora_comm_status?.value ? 'connected' : 'disconnected',
  };
}

/**
 * 验证 OneNET HTTP 推送签名
 */
export function verifyPushSignature(config: OneNETConfig, body: string, signature: string): boolean {
  const { device_key } = config;
  if (!device_key) return true; // 如果没有配置 device_key，跳过验证

  const hmac = crypto.createHmac('md5', device_key);
  hmac.update(body);
  const expectedSignature = hmac.digest('base64');

  return signature === expectedSignature;
}

export type { OneNETConfig, OneNETPropertyData };
