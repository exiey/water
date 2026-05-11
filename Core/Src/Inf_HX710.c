#include "Inf_HX710.h"

static uint8_t s_inf_hx710_initialized = 0U;

static void Inf_HX710_DelayUs(uint32_t us)
{
    uint32_t delay = (HAL_RCC_GetHCLKFreq() / 4000000U) * us;

    while (delay-- != 0U) {
        __NOP();
    }
}

void Inf_HX710_Reset(void)
{
    INF_HX710_SCK_HIGH();
    HAL_Delay(1);
    INF_HX710_SCK_LOW();
    HAL_Delay(500);
    s_inf_hx710_initialized = 0U;
}

uint8_t Inf_HX710_ReadRaw(int32_t *value)
{
    uint32_t raw = 0U;
    uint32_t start_tick = HAL_GetTick();

    if (value == NULL) {
        return 0U;
    }

    INF_HX710_SCK_LOW();
    Inf_HX710_DelayUs(1U);

    while (INF_HX710_OUT_IS_HIGH()) {
        if ((HAL_GetTick() - start_tick) >= INF_HX710_READY_TIMEOUT_MS) {
            return 0U;
        }
    }

    for (uint8_t i = 0U; i < 24U; ++i) {
        INF_HX710_SCK_HIGH();
        raw <<= 1;
        Inf_HX710_DelayUs(1U);
        INF_HX710_SCK_LOW();
        Inf_HX710_DelayUs(1U);
        if (INF_HX710_OUT_IS_HIGH()) {
            raw |= 1U;
        }
    }

    INF_HX710_SCK_HIGH();
    Inf_HX710_DelayUs(1U);
    INF_HX710_SCK_LOW();
    Inf_HX710_DelayUs(1U);

    if ((raw & 0x800000UL) != 0U) {
        raw |= 0xFF000000UL;
    }

    *value = (int32_t)raw;
    return 1U;
}

uint8_t Inf_HX710_Init(void)
{
    Inf_HX710_Reset();

    for (uint8_t i = 0U; i < INF_HX710_SETTLE_SAMPLES; ++i) {
        int32_t throwaway_value = 0;
        if (!Inf_HX710_ReadRaw(&throwaway_value)) {
            return 0U;
        }
    }

    s_inf_hx710_initialized = 1U;
    return 1U;
}

uint8_t Inf_HX710_ReadAverage(uint8_t samples, int32_t *value)
{
    int64_t sum = 0;
    uint8_t success_count = 0U;
    int32_t sample_value = 0;

    if (value == NULL) {
        return 0U;
    }

    if (!s_inf_hx710_initialized) {
        if (!Inf_HX710_Init()) {
            return 0U;
        }
    }

    if (samples == 0U) {
        samples = 1U;
    }

    for (uint8_t i = 0U; i < samples; ++i) {
        if (!Inf_HX710_ReadRaw(&sample_value)) {
            break;
        }
        sum += sample_value;
        success_count++;
    }

    if (success_count == 0U) {
        s_inf_hx710_initialized = 0U;
        return 0U;
    }

    *value = (int32_t)(sum / (int64_t)success_count);
    return 1U;
}
