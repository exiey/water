/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2026 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "i2c.h"
#include "usart.h"
#include "gpio.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */
typedef struct
{
  uint8_t online;
  uint8_t who_am_i;
  int16_t accel_x;
  int16_t accel_y;
  int16_t accel_z;
  int16_t gyro_x;
  int16_t gyro_y;
  int16_t gyro_z;
  int16_t temperature_raw;
} mpu6050_data_t;

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */
#define DEBUG_UART_TIMEOUT_MS      100U
#define MPU6050_I2C_ADDR_LOW       (0x68U << 1)
#define MPU6050_I2C_ADDR_HIGH      (0x69U << 1)
#define MPU6050_REG_WHO_AM_I       0x75U
#define MPU6050_REG_PWR_MGMT_1     0x6BU
#define MPU6050_REG_ACCEL_XOUT_H   0x3BU
#define SENSOR_PRINT_PERIOD_MS     1000U
#define LORA_RX_BUFFER_SIZE        64U
#define TDS_K_VALUE                1.0f
#define HX710_READY_TIMEOUT_MS     1200U
#define HX710_SETTLE_SAMPLES       4U
#define HX710_AVERAGE_SAMPLES      3U
#define LORA_TX_TIMEOUT_MS         200U
#define FLOW_PULSES_PER_LITER      450.0f

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/

/* USER CODE BEGIN PV */
static uint8_t s_mpu6050_online = 0U;
static uint16_t s_mpu6050_addr = MPU6050_I2C_ADDR_LOW;
static uint8_t s_mpu6050_who_am_i = 0U;
static uint32_t s_mpu6050_last_error = 0U;
static uint8_t s_hx710_initialized = 0U;
static char s_lora_line[LORA_RX_BUFFER_SIZE];
static uint8_t s_lora_line_len = 0U;
static volatile uint32_t s_flow_pulse_count = 0U;
static uint32_t s_flow_last_sample_pulse_count = 0U;
static float s_total_flow_m3 = 0.0f;
static float s_instant_flow_m3s = 0.0f;
static GPIO_PinState s_flow_pin_last_state = GPIO_PIN_SET;
static uint32_t s_flow_pin_transition_count = 0U;

/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
/* USER CODE BEGIN PFP */
static void debug_printf(const char *fmt, ...);
static void adc1_init(void);
static uint16_t adc1_read_channel(uint32_t channel);
static uint32_t adc_to_millivolts(uint16_t raw);
static float tds_voltage_to_ppm(float voltage, float temperature_celsius);
static void i2c_scan_bus(void);
static HAL_StatusTypeDef mpu6050_write_byte(uint16_t dev_addr, uint8_t reg, uint8_t value);
static HAL_StatusTypeDef mpu6050_read_bytes(uint16_t dev_addr, uint8_t reg, uint8_t *data, uint16_t size);
static uint8_t mpu6050_init(void);
static uint8_t mpu6050_read_data(mpu6050_data_t *data);
static void hx710b_delay_short(void);
static void hx710_reset(void);
static uint8_t hx710_wait_ready(uint32_t timeout_ms);
static uint8_t hx710_read_once(int32_t *raw_value);
static void hx710_init(void);
static uint8_t pressure_read_raw(int32_t *raw_value);
static int16_t clamp_to_i16(int32_t value);
static float clamp_non_negative(float value);
static int32_t estimate_pitch_angle(const mpu6050_data_t *data);
static int32_t estimate_roll_angle(const mpu6050_data_t *data);
static int32_t estimate_yaw_angle(const mpu6050_data_t *data);
static void flow_sensor_poll_pin(void);
static float flow_pulses_to_cubic_meters(uint32_t pulses);
static void flow_sensor_update(uint32_t elapsed_ms);
static void lora_send_packet_line(float water_level, float tds_value,
                                  float total_flow, float instant_flow,
                                  float pitch_angle, float roll_angle, float yaw_angle);
static void lora_poll_and_log(void);

/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */
static void debug_printf(const char *fmt, ...)
{
  char buffer[256];
  va_list args;
  va_start(args, fmt);
  int length = vsnprintf(buffer, sizeof(buffer), fmt, args);
  va_end(args);

  if (length <= 0) {
    return;
  }

  if (length >= (int)sizeof(buffer)) {
    length = (int)sizeof(buffer) - 1;
  }

  HAL_UART_Transmit(&huart1, (uint8_t *)buffer, (uint16_t)length, DEBUG_UART_TIMEOUT_MS);
}

static void adc1_init(void)
{
  __HAL_RCC_ADC1_CLK_ENABLE();

  ADC1->CR1 = 0U;
  ADC1->CR2 = 0U;
  ADC1->SMPR2 = ADC_SMPR2_SMP0 | ADC_SMPR2_SMP1;

  MODIFY_REG(RCC->CFGR, RCC_CFGR_ADCPRE, RCC_CFGR_ADCPRE_DIV6);

  ADC1->CR2 |= ADC_CR2_ADON;
  HAL_Delay(1);

  ADC1->CR2 |= ADC_CR2_RSTCAL;
  while ((ADC1->CR2 & ADC_CR2_RSTCAL) != 0U) {
  }

  ADC1->CR2 |= ADC_CR2_CAL;
  while ((ADC1->CR2 & ADC_CR2_CAL) != 0U) {
  }
}

static uint16_t adc1_read_channel(uint32_t channel)
{
  ADC1->SQR1 = 0U;
  ADC1->SQR2 = 0U;
  ADC1->SQR3 = channel;
  ADC1->SR = 0U;
  ADC1->CR2 |= ADC_CR2_ADON;
  ADC1->CR2 |= ADC_CR2_SWSTART;

  while ((ADC1->SR & ADC_SR_EOC) == 0U) {
  }

  return (uint16_t)ADC1->DR;
}

static uint32_t adc_to_millivolts(uint16_t raw)
{
  return ((uint32_t)raw * 3300U) / 4095U;
}

static float tds_voltage_to_ppm(float voltage, float temperature_celsius)
{
  float compensation_coefficient = 1.0f + 0.02f * (temperature_celsius - 25.0f);
  float compensation_voltage = voltage / compensation_coefficient;
  float tds_value = (133.42f * compensation_voltage * compensation_voltage * compensation_voltage
                   - 255.86f * compensation_voltage * compensation_voltage
                   + 857.39f * compensation_voltage) * 0.5f;
  return tds_value * TDS_K_VALUE;
}

static void i2c_scan_bus(void)
{
  debug_printf("[I2C] scan start\r\n");
  for (uint8_t addr = 0x08U; addr < 0x78U; ++addr) {
    if (HAL_I2C_IsDeviceReady(&hi2c1, (uint16_t)(addr << 1), 2, 20) == HAL_OK) {
      debug_printf("[I2C] found 0x%02X\r\n", addr);
    }
  }
  debug_printf("[I2C] scan end\r\n");
}

static HAL_StatusTypeDef mpu6050_write_byte(uint16_t dev_addr, uint8_t reg, uint8_t value)
{
  HAL_StatusTypeDef status = HAL_I2C_Mem_Write(&hi2c1, dev_addr, reg, I2C_MEMADD_SIZE_8BIT, &value, 1, 100);
  s_mpu6050_last_error = HAL_I2C_GetError(&hi2c1);
  return status;
}

static HAL_StatusTypeDef mpu6050_read_bytes(uint16_t dev_addr, uint8_t reg, uint8_t *data, uint16_t size)
{
  HAL_StatusTypeDef status = HAL_I2C_Mem_Read(&hi2c1, dev_addr, reg, I2C_MEMADD_SIZE_8BIT, data, size, 100);
  s_mpu6050_last_error = HAL_I2C_GetError(&hi2c1);
  return status;
}

static uint8_t mpu6050_init(void)
{
  uint8_t who_am_i = 0U;
  const uint16_t candidate_addrs[2] = {MPU6050_I2C_ADDR_LOW, MPU6050_I2C_ADDR_HIGH};

  for (uint8_t i = 0U; i < 2U; ++i) {
    uint16_t dev_addr = candidate_addrs[i];

    if (HAL_I2C_IsDeviceReady(&hi2c1, dev_addr, 2, 50) != HAL_OK) {
      s_mpu6050_last_error = HAL_I2C_GetError(&hi2c1);
      continue;
    }

    if (mpu6050_read_bytes(dev_addr, MPU6050_REG_WHO_AM_I, &who_am_i, 1) != HAL_OK) {
      continue;
    }

    s_mpu6050_addr = dev_addr;
    s_mpu6050_who_am_i = who_am_i;

    if (mpu6050_write_byte(dev_addr, MPU6050_REG_PWR_MGMT_1, 0x00U) != HAL_OK) {
      continue;
    }

    HAL_Delay(50);

    return 1U;
  }

  return 0U;
}

static uint8_t mpu6050_read_data(mpu6050_data_t *data)
{
  uint8_t raw_data[14];

  if (mpu6050_read_bytes(s_mpu6050_addr, MPU6050_REG_ACCEL_XOUT_H, raw_data, sizeof(raw_data)) != HAL_OK) {
    return 0U;
  }

  data->online = 1U;
  data->who_am_i = s_mpu6050_who_am_i;
  data->accel_x = (int16_t)((raw_data[0] << 8) | raw_data[1]);
  data->accel_y = (int16_t)((raw_data[2] << 8) | raw_data[3]);
  data->accel_z = (int16_t)((raw_data[4] << 8) | raw_data[5]);
  data->temperature_raw = (int16_t)((raw_data[6] << 8) | raw_data[7]);
  data->gyro_x = (int16_t)((raw_data[8] << 8) | raw_data[9]);
  data->gyro_y = (int16_t)((raw_data[10] << 8) | raw_data[11]);
  data->gyro_z = (int16_t)((raw_data[12] << 8) | raw_data[13]);

  return 1U;
}

static void hx710b_delay_short(void)
{
  for (volatile uint32_t i = 0; i < 48U; ++i) {
    __NOP();
  }
}

static void hx710_reset(void)
{
  HAL_GPIO_WritePin(PRESSURE_SCK_GPIO_Port, PRESSURE_SCK_Pin, GPIO_PIN_SET);
  HAL_Delay(1);
  HAL_GPIO_WritePin(PRESSURE_SCK_GPIO_Port, PRESSURE_SCK_Pin, GPIO_PIN_RESET);
  HAL_Delay(500);
}

static uint8_t hx710_wait_ready(uint32_t timeout_ms)
{
  uint32_t start_tick = HAL_GetTick();

  while (HAL_GPIO_ReadPin(PRESSURE_OUT_GPIO_Port, PRESSURE_OUT_Pin) == GPIO_PIN_SET) {
    if ((HAL_GetTick() - start_tick) >= timeout_ms) {
      return 0U;
    }
  }

  return 1U;
}

static uint8_t hx710_read_once(int32_t *raw_value)
{
  uint32_t value = 0U;

  if (!hx710_wait_ready(HX710_READY_TIMEOUT_MS)) {
    return 0U;
  }

  for (uint8_t i = 0U; i < 24U; ++i) {
    HAL_GPIO_WritePin(PRESSURE_SCK_GPIO_Port, PRESSURE_SCK_Pin, GPIO_PIN_SET);
    hx710b_delay_short();
    value = (value << 1) | (HAL_GPIO_ReadPin(PRESSURE_OUT_GPIO_Port, PRESSURE_OUT_Pin) == GPIO_PIN_SET ? 1U : 0U);
    HAL_GPIO_WritePin(PRESSURE_SCK_GPIO_Port, PRESSURE_SCK_Pin, GPIO_PIN_RESET);
    hx710b_delay_short();
  }

  /* 25th pulse selects differential input, 10 Hz for the next conversion. */
  HAL_GPIO_WritePin(PRESSURE_SCK_GPIO_Port, PRESSURE_SCK_Pin, GPIO_PIN_SET);
  hx710b_delay_short();
  HAL_GPIO_WritePin(PRESSURE_SCK_GPIO_Port, PRESSURE_SCK_Pin, GPIO_PIN_RESET);
  hx710b_delay_short();

  if ((value & 0x800000UL) != 0UL) {
    value |= 0xFF000000UL;
  }

  *raw_value = (int32_t)value;
  return 1U;
}

static void hx710_init(void)
{
  int32_t throwaway_raw = 0;

  hx710_reset();

  for (uint8_t i = 0U; i < HX710_SETTLE_SAMPLES; ++i) {
    if (!hx710_read_once(&throwaway_raw)) {
      s_hx710_initialized = 0U;
      debug_printf("[HX710] settle timeout step=%u dout=%u after reset\r\n",
                   (unsigned int)(i + 1U),
                   (unsigned int)(HAL_GPIO_ReadPin(PRESSURE_OUT_GPIO_Port, PRESSURE_OUT_Pin) == GPIO_PIN_SET));
      return;
    }
  }

  s_hx710_initialized = 1U;
  debug_printf("[HX710] ready after %u settle samples\r\n", (unsigned int)HX710_SETTLE_SAMPLES);
}

static uint8_t pressure_read_raw(int32_t *raw_value)
{
  int64_t sum = 0;
  uint8_t success_count = 0U;
  int32_t sample = 0;

  if (!s_hx710_initialized) {
    hx710_init();
    if (!s_hx710_initialized) {
      return 0U;
    }
  }

  for (uint8_t i = 0U; i < HX710_AVERAGE_SAMPLES; ++i) {
    if (!hx710_read_once(&sample)) {
      break;
    }
    sum += sample;
    success_count++;
  }

  if (success_count == 0U) {
    s_hx710_initialized = 0U;
    return 0U;
  }

  *raw_value = (int32_t)(sum / (int64_t)success_count);
  return 1U;
}

static int16_t clamp_to_i16(int32_t value)
{
  if (value > 32767) {
    return 32767;
  }
  if (value < -32768) {
    return -32768;
  }
  return (int16_t)value;
}

static float clamp_non_negative(float value)
{
  return value < 0.0f ? 0.0f : value;
}

static int32_t estimate_pitch_angle(const mpu6050_data_t *data)
{
  return (int32_t)(clamp_to_i16(data->accel_x) / 182);
}

static int32_t estimate_roll_angle(const mpu6050_data_t *data)
{
  return (int32_t)(clamp_to_i16(data->accel_y) / 182);
}

static int32_t estimate_yaw_angle(const mpu6050_data_t *data)
{
  return (int32_t)(clamp_to_i16(data->gyro_z) / 16);
}

static void flow_sensor_poll_pin(void)
{
  GPIO_PinState current_state = HAL_GPIO_ReadPin(FLOW_SENSOR_GPIO_Port, FLOW_SENSOR_Pin);

  if (current_state != s_flow_pin_last_state) {
    s_flow_pin_last_state = current_state;
    s_flow_pin_transition_count++;
  }
}

static float flow_pulses_to_cubic_meters(uint32_t pulses)
{
  return ((float)pulses / FLOW_PULSES_PER_LITER) / 1000.0f;
}

static void flow_sensor_update(uint32_t elapsed_ms)
{
  uint32_t total_pulses = s_flow_pulse_count;
  uint32_t delta_pulses = total_pulses - s_flow_last_sample_pulse_count;
  float elapsed_seconds = (float)elapsed_ms / 1000.0f;

  s_flow_last_sample_pulse_count = total_pulses;
  s_total_flow_m3 = flow_pulses_to_cubic_meters(total_pulses);

  if (elapsed_seconds > 0.0f) {
    s_instant_flow_m3s = flow_pulses_to_cubic_meters(delta_pulses) / elapsed_seconds;
  } else {
    s_instant_flow_m3s = 0.0f;
  }
}

static void lora_send_packet_line(float water_level, float tds_value,
                                  float total_flow, float instant_flow,
                                  float pitch_angle, float roll_angle, float yaw_angle)
{
  char packet[192];
  int length = snprintf(packet, sizeof(packet),
                        "water_level=%.2f,tds=%.2f,total_flow=%.6f,instant_flow=%.6f,pitch=%.2f,roll=%.2f,yaw=%.2f\r\n",
                        (double)water_level, (double)tds_value,
                        (double)total_flow, (double)instant_flow,
                        (double)pitch_angle, (double)roll_angle, (double)yaw_angle);

  if (length <= 0) {
    return;
  }

  if (length >= (int)sizeof(packet)) {
    length = (int)sizeof(packet) - 1;
  }

  HAL_UART_Transmit(&huart2, (uint8_t *)packet, (uint16_t)length, LORA_TX_TIMEOUT_MS);
  debug_printf("[LORA-TX] %s", packet);
}

static void lora_poll_and_log(void)
{
  uint8_t byte = 0U;

  while (HAL_UART_Receive(&huart2, &byte, 1, 2) == HAL_OK) {
    if (byte == '\r') {
      continue;
    }

    if (byte == '\n') {
      if (s_lora_line_len > 0U) {
        s_lora_line[s_lora_line_len] = '\0';
        debug_printf("[LORA] AUX=%u RX=\"%s\"\r\n",
                     (unsigned int)(HAL_GPIO_ReadPin(LORA_AUX_GPIO_Port, LORA_AUX_Pin) == GPIO_PIN_SET),
                     s_lora_line);
        s_lora_line_len = 0U;
      }
      continue;
    }

    if (s_lora_line_len < (LORA_RX_BUFFER_SIZE - 1U)) {
      s_lora_line[s_lora_line_len++] = (char)byte;
    } else {
      s_lora_line[s_lora_line_len] = '\0';
      debug_printf("[LORA] line too long, partial=\"%s\"\r\n", s_lora_line);
      s_lora_line_len = 0U;
    }
  }
}

/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{

  /* USER CODE BEGIN 1 */

  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
  MX_I2C1_Init();
  MX_USART1_UART_Init();
  MX_USART2_UART_Init();
  /* USER CODE BEGIN 2 */
  adc1_init();
  i2c_scan_bus();
  s_mpu6050_online = mpu6050_init();
  hx710_init();
  s_flow_pin_last_state = HAL_GPIO_ReadPin(FLOW_SENSOR_GPIO_Port, FLOW_SENSOR_Pin);

  debug_printf("\r\nwater board boot\r\n");
  debug_printf("USART1=115200 for debug, USART2=9600 for LoRa\r\n");
  if (s_mpu6050_online) {
    debug_printf("IMU: online addr=0x%02X who_am_i=0x%02X\r\n",
                 (unsigned int)(s_mpu6050_addr >> 1),
                 (unsigned int)s_mpu6050_who_am_i);
  } else {
    debug_printf("IMU: not found err=0x%08lX\r\n", (unsigned long)s_mpu6050_last_error);
  }

  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
    static uint32_t last_print_tick = 0U;
    uint32_t now = HAL_GetTick();

    flow_sensor_poll_pin();
    lora_poll_and_log();

    if ((now - last_print_tick) >= SENSOR_PRINT_PERIOD_MS) {
      uint32_t elapsed_ms = now - last_print_tick;
      uint16_t pa1_raw = adc1_read_channel(1U);
      uint32_t pa1_mv = adc_to_millivolts(pa1_raw);
      mpu6050_data_t mpu = {0};
      int32_t pressure_raw = 0;
      uint8_t pressure_ready = pressure_read_raw(&pressure_raw);
      uint8_t mpu_ready = s_mpu6050_online ? mpu6050_read_data(&mpu) : 0U;
      float water_temperature_c = 25.0f;
      float tds_voltage = (float)pa1_mv / 1000.0f;
      float tds_ppm = tds_voltage_to_ppm(tds_voltage, water_temperature_c);
      float pitch_angle = mpu_ready ? (float)estimate_pitch_angle(&mpu) : 0.0f;
      float roll_angle = mpu_ready ? (float)estimate_roll_angle(&mpu) : 0.0f;
      float yaw_angle = mpu_ready ? (float)estimate_yaw_angle(&mpu) : 0.0f;
      float water_level = pressure_ready ? clamp_non_negative((float)pressure_raw) : 0.0f;
      float tds_value = tds_ppm;
      flow_sensor_update(elapsed_ms);

      debug_printf("[SENSOR] t=%lu ms FLOW_PIN=%u FLOW_EDGE=%lu FLOW_PULSE=%lu FLOW_TOTAL=%.6f m3 FLOW_INSTANT=%.6f m3/s TDS_AO=%u (%lu mV, %.1f ppm@25C) AUX=%u PRESS_OUT=%u PRESS_READY=%u PRESS_RAW=%ld\r\n",
                   (unsigned long)now,
                   (unsigned int)(HAL_GPIO_ReadPin(FLOW_SENSOR_GPIO_Port, FLOW_SENSOR_Pin) == GPIO_PIN_SET),
                   (unsigned long)s_flow_pin_transition_count,
                   (unsigned long)s_flow_pulse_count,
                   (double)s_total_flow_m3,
                   (double)s_instant_flow_m3s,
                   (unsigned int)pa1_raw,
                   (unsigned long)pa1_mv,
                   (double)tds_ppm,
                   (unsigned int)(HAL_GPIO_ReadPin(LORA_AUX_GPIO_Port, LORA_AUX_Pin) == GPIO_PIN_SET),
                   (unsigned int)(HAL_GPIO_ReadPin(PRESSURE_OUT_GPIO_Port, PRESSURE_OUT_Pin) == GPIO_PIN_SET),
                   (unsigned int)pressure_ready,
                   (long)pressure_raw);

      if (mpu_ready) {
        debug_printf("[MPU6050] addr=0x%02X who=0x%02X AX=%d AY=%d AZ=%d GX=%d GY=%d GZ=%d TEMP_RAW=%d\r\n",
                     (unsigned int)(s_mpu6050_addr >> 1),
                     (unsigned int)mpu.who_am_i,
                     mpu.accel_x, mpu.accel_y, mpu.accel_z,
                     mpu.gyro_x, mpu.gyro_y, mpu.gyro_z,
                     mpu.temperature_raw);
      } else {
        debug_printf("[MPU6050] read failed addr=0x%02X err=0x%08lX\r\n",
                     (unsigned int)(s_mpu6050_addr >> 1),
                     (unsigned long)s_mpu6050_last_error);
      }

      lora_send_packet_line(water_level, tds_value, s_total_flow_m3, s_instant_flow_m3s,
                            pitch_angle, roll_angle, yaw_angle);

      last_print_tick = now;
    }
  }
  /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSE;
  RCC_OscInitStruct.HSEState = RCC_HSE_ON;
  RCC_OscInitStruct.HSEPredivValue = RCC_HSE_PREDIV_DIV1;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSE;
  RCC_OscInitStruct.PLL.PLLMUL = RCC_PLL_MUL9;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_2) != HAL_OK)
  {
    Error_Handler();
  }
}

/* USER CODE BEGIN 4 */
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
  if (GPIO_Pin == FLOW_SENSOR_Pin) {
    s_flow_pulse_count++;
  }
}

/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}

#ifdef  USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
