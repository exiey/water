#ifndef __INF_HX710_H__
#define __INF_HX710_H__

#include "main.h"

#define INF_HX710_READY_TIMEOUT_MS 1500U

void Inf_HX710_Init(void);
uint8_t Inf_HX710_ReadValue(int32_t *value);

#endif
