#ifndef __INF_HX710_H__
#define __INF_HX710_H__

#include "main.h"

#define INF_HX710_READY_TIMEOUT_MS    1500U
#define INF_HX710_SETTLE_SAMPLES      4U
#define INF_HX710_DEFAULT_AVG_SAMPLES 5U

#define INF_HX710_SCK_HIGH()    (PRESSURE_SCK_GPIO_Port->BSRR = PRESSURE_SCK_Pin)
#define INF_HX710_SCK_LOW()     (PRESSURE_SCK_GPIO_Port->BRR = PRESSURE_SCK_Pin)
#define INF_HX710_OUT_IS_HIGH() ((PRESSURE_OUT_GPIO_Port->IDR & PRESSURE_OUT_Pin) != 0U)

uint8_t Inf_HX710_Init(void);
void Inf_HX710_Reset(void);
uint8_t Inf_HX710_ReadRaw(int32_t *value);
uint8_t Inf_HX710_ReadAverage(uint8_t samples, int32_t *value);

#endif
