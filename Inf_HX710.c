#include "Inf_HX710.h"

static uint8_t s_inf_hx710_initialized = 0U;

static void Inf_HX710_DelayUs(uint32_t us)
{
    uint32_t delay = (HAL_RCC_GetHCLKFreq() / 4000000U) * us;

    while (delay-- != 0U) {
        __NOP();
    }
}

void Inf_HX710_Init(void)
{
    /*
     * HX710 datasheet:
     * Keep PD_SCK high for more than 60us to enter power-down/reset,
     * then pull it low to return to normal operation.
     */
    HAL_GPIO_WritePin(PRESSURE_SCK_GPIO_Port, PRESSURE_SCK_Pin, GPIO_PIN_SET);
    HAL_Delay(1);
    HAL_GPIO_WritePin(PRESSURE_SCK_GPIO_Port, PRESSURE_SCK_Pin, GPIO_PIN_RESET);
    HAL_Delay(500);
    s_inf_hx710_initialized = 1U;
}

uint8_t Inf_HX710_ReadValue(int32_t *value)
{
    uint32_t raw = 0U;
    uint32_t start_tick = HAL_GetTick();

    if (value == NULL) {
        return 0U;
    }

    if (!s_inf_hx710_initialized) {
        Inf_HX710_Init();
    }

    HAL_GPIO_WritePin(PRESSURE_SCK_GPIO_Port, PRESSURE_SCK_Pin, GPIO_PIN_RESET);

    while (HAL_GPIO_ReadPin(PRESSURE_OUT_GPIO_Port, PRESSURE_OUT_Pin) == GPIO_PIN_SET) {
        if ((HAL_GetTick() - start_tick) >= INF_HX710_READY_TIMEOUT_MS) {
            return 0U;
        }
    }

    for (uint8_t i = 0U; i < 24U; ++i) {
        HAL_GPIO_WritePin(PRESSURE_SCK_GPIO_Port, PRESSURE_SCK_Pin, GPIO_PIN_SET);
        Inf_HX710_DelayUs(5U);
        raw <<= 1;
        HAL_GPIO_WritePin(PRESSURE_SCK_GPIO_Port, PRESSURE_SCK_Pin, GPIO_PIN_RESET);
        if (HAL_GPIO_ReadPin(PRESSURE_OUT_GPIO_Port, PRESSURE_OUT_Pin) == GPIO_PIN_SET) {
            raw |= 1U;
        }
        Inf_HX710_DelayUs(5U);
    }

    HAL_GPIO_WritePin(PRESSURE_SCK_GPIO_Port, PRESSURE_SCK_Pin, GPIO_PIN_SET);
    Inf_HX710_DelayUs(5U);
    HAL_GPIO_WritePin(PRESSURE_SCK_GPIO_Port, PRESSURE_SCK_Pin, GPIO_PIN_RESET);

    raw ^= 0x800000U;
    *value = (int32_t)raw;
    return 1U;
}
