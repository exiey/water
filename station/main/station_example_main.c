/* WiFi station Example

   This example code is in the Public Domain (or CC0 licensed, at your option.)

   Unless required by applicable law or agreed to in writing, this
   software is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
   CONDITIONS OF ANY KIND, either express or implied.
*/
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "mqtt_client.h"
#include "nvs_flash.h"
#include "driver/gpio.h"
#include "driver/uart.h"

#include "lwip/err.h"
#include "lwip/sys.h"

/* The examples use WiFi configuration that you can set via project configuration menu

   If you'd rather not, just change the below entries to strings with
   the config you want - ie #define EXAMPLE_WIFI_SSID "mywifissid"
*/
#define EXAMPLE_ESP_WIFI_SSID      CONFIG_ESP_WIFI_SSID
#define EXAMPLE_ESP_WIFI_PASS      CONFIG_ESP_WIFI_PASSWORD
#define EXAMPLE_ESP_MAXIMUM_RETRY  CONFIG_ESP_MAXIMUM_RETRY

#if CONFIG_ESP_STATION_EXAMPLE_WPA3_SAE_PWE_HUNT_AND_PECK
#define ESP_WIFI_SAE_MODE WPA3_SAE_PWE_HUNT_AND_PECK
#define EXAMPLE_H2E_IDENTIFIER ""
#elif CONFIG_ESP_STATION_EXAMPLE_WPA3_SAE_PWE_HASH_TO_ELEMENT
#define ESP_WIFI_SAE_MODE WPA3_SAE_PWE_HASH_TO_ELEMENT
#define EXAMPLE_H2E_IDENTIFIER CONFIG_ESP_WIFI_PW_ID
#elif CONFIG_ESP_STATION_EXAMPLE_WPA3_SAE_PWE_BOTH
#define ESP_WIFI_SAE_MODE WPA3_SAE_PWE_BOTH
#define EXAMPLE_H2E_IDENTIFIER CONFIG_ESP_WIFI_PW_ID
#endif
#if CONFIG_ESP_WIFI_AUTH_OPEN
#define ESP_WIFI_SCAN_AUTH_MODE_THRESHOLD WIFI_AUTH_OPEN
#elif CONFIG_ESP_WIFI_AUTH_WEP
#define ESP_WIFI_SCAN_AUTH_MODE_THRESHOLD WIFI_AUTH_WEP
#elif CONFIG_ESP_WIFI_AUTH_WPA_PSK
#define ESP_WIFI_SCAN_AUTH_MODE_THRESHOLD WIFI_AUTH_WPA_PSK
#elif CONFIG_ESP_WIFI_AUTH_WPA2_PSK
#define ESP_WIFI_SCAN_AUTH_MODE_THRESHOLD WIFI_AUTH_WPA2_PSK
#elif CONFIG_ESP_WIFI_AUTH_WPA_WPA2_PSK
#define ESP_WIFI_SCAN_AUTH_MODE_THRESHOLD WIFI_AUTH_WPA_WPA2_PSK
#elif CONFIG_ESP_WIFI_AUTH_WPA3_PSK
#define ESP_WIFI_SCAN_AUTH_MODE_THRESHOLD WIFI_AUTH_WPA3_PSK
#elif CONFIG_ESP_WIFI_AUTH_WPA2_WPA3_PSK
#define ESP_WIFI_SCAN_AUTH_MODE_THRESHOLD WIFI_AUTH_WPA2_WPA3_PSK
#elif CONFIG_ESP_WIFI_AUTH_WAPI_PSK
#define ESP_WIFI_SCAN_AUTH_MODE_THRESHOLD WIFI_AUTH_WAPI_PSK
#endif

/* FreeRTOS event group to signal when we are connected*/
static EventGroupHandle_t s_wifi_event_group;

/* The event group allows multiple bits for each event, but we only care about two events:
 * - we are connected to the AP with an IP
 * - we failed to connect after the maximum amount of retries */
#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT      BIT1

static const char *TAG = "wifi station";
static const char *ONENET_BROKER_URI = "mqtt://183.230.40.96:1883";
static const char *ONENET_CLIENT_ID = "esp8266_01";
static const char *ONENET_USERNAME = "Z7Y6GY5MYy";
static const char *ONENET_PASSWORD = "version=2018-10-31&res=products%2FZ7Y6GY5MYy%2Fdevices%2Fesp8266_01&et=1806547441&method=md5&sign=NOhTuuLFQ%2FWnU1mv4kozxw%3D%3D";
static const char *ONENET_PROPERTY_TOPIC = "$sys/Z7Y6GY5MYy/esp8266_01/thing/property/post";
static const char *ONENET_PROPERTY_REPLY_TOPIC = "$sys/Z7Y6GY5MYy/esp8266_01/thing/property/post/reply";

#define LORA_UART_NUM           UART_NUM_2
#define LORA_UART_TX_PIN        GPIO_NUM_17
#define LORA_UART_RX_PIN        GPIO_NUM_18
#define LORA_UART_AUX_PIN       GPIO_NUM_5
#define LORA_UART_BAUD_RATE     9600
#define LORA_UART_BUF_SIZE      256
#define LORA_LINE_BUF_SIZE      256
#define LORA_FRAME_IDLE_MS      120

static int s_retry_num = 0;
static esp_mqtt_client_handle_t s_mqtt_client = NULL;
static bool s_mqtt_connected = false;

typedef struct {
    float water_level;
    float tds_value;
    float total_flow;
    float instant_flow;
    float pitch_angle;
    float roll_angle;
    float yaw_angle;
} lora_sensor_packet_t;

static void onenet_publish_test_payload(void)
{
    static const char *payload =
        "{\"id\":\"1775011477061\",\"version\":\"1.0\",\"params\":{"
        "\"angle\":{\"value\":{\"pitch_angle\":12,\"roll_angle\":34,\"yaw_angle\":56}},"
        "\"flow\":{\"value\":{\"total_flow\":654321,\"instant_flow\":321}},"
        "\"lora_comm_status\":{\"value\":false},"
        "\"tds_value\":{\"value\":888},"
        "\"water_level\":{\"value\":23}"
        "}}";

    int msg_id = esp_mqtt_client_publish(s_mqtt_client, ONENET_PROPERTY_TOPIC, payload, 0, 1, 0);
    ESP_LOGI(TAG, "published test payload to OneNET, msg_id=%d", msg_id);
}

static void mqtt_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data)
{
    esp_mqtt_event_handle_t event = event_data;

    switch ((esp_mqtt_event_id_t)event_id) {
    case MQTT_EVENT_CONNECTED:
        s_mqtt_connected = true;
        ESP_LOGI(TAG, "OneNET MQTT connected");
        esp_mqtt_client_subscribe(s_mqtt_client, ONENET_PROPERTY_REPLY_TOPIC, 1);
        onenet_publish_test_payload();
        break;
    case MQTT_EVENT_DISCONNECTED:
        s_mqtt_connected = false;
        ESP_LOGW(TAG, "disconnected from OneNET MQTT broker");
        break;
    case MQTT_EVENT_PUBLISHED:
        ESP_LOGI(TAG, "OneNET publish acknowledged, msg_id=%d", event->msg_id);
        break;
    case MQTT_EVENT_DATA:
        ESP_LOGI(TAG, "OneNET reply topic=%.*s", event->topic_len, event->topic);
        ESP_LOGI(TAG, "OneNET reply data=%.*s", event->data_len, event->data);
        break;
    case MQTT_EVENT_ERROR:
        ESP_LOGE(TAG, "mqtt event error");
        break;
    default:
        break;
    }
}

static void onenet_mqtt_start(void)
{
    esp_mqtt_client_config_t mqtt_cfg = {
        .broker.address.uri = ONENET_BROKER_URI,
        .credentials.client_id = ONENET_CLIENT_ID,
        .credentials.username = ONENET_USERNAME,
        .credentials.authentication.password = ONENET_PASSWORD,
        .session.keepalive = 60,
        .network.timeout_ms = 10000,
        .network.reconnect_timeout_ms = 5000,
    };

    s_mqtt_client = esp_mqtt_client_init(&mqtt_cfg);
    ESP_ERROR_CHECK(esp_mqtt_client_register_event(s_mqtt_client, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL));
    ESP_ERROR_CHECK(esp_mqtt_client_start(s_mqtt_client));
}

static void lora_publish_packet_to_onenet(const lora_sensor_packet_t *packet)
{
    if (s_mqtt_client == NULL || !s_mqtt_connected) {
        ESP_LOGW(TAG, "mqtt is not connected, skip LoRa payload publish");
        return;
    }

    char payload[512];
    int payload_len = snprintf(payload, sizeof(payload),
                               "{\"id\":\"%lu\",\"version\":\"1.0\",\"params\":{"
                               "\"angle\":{\"value\":{\"pitch_angle\":%.2f,\"roll_angle\":%.2f,\"yaw_angle\":%.2f}},"
                               "\"flow\":{\"value\":{\"total_flow\":%.3f,\"instant_flow\":%.3f}},"
                               "\"lora_comm_status\":{\"value\":true},"
                               "\"tds_value\":{\"value\":%.2f},"
                               "\"water_level\":{\"value\":%.2f}"
                               "}}",
                               (unsigned long)esp_log_timestamp(),
                               (double)packet->pitch_angle, (double)packet->roll_angle, (double)packet->yaw_angle,
                               (double)packet->total_flow, (double)packet->instant_flow,
                               (double)packet->tds_value, (double)packet->water_level);

    if (payload_len <= 0 || payload_len >= sizeof(payload)) {
        ESP_LOGE(TAG, "failed to build OneNET payload from LoRa packet");
        return;
    }

    ESP_LOGI(TAG, "OneNET payload: %s", payload);
    int msg_id = esp_mqtt_client_publish(s_mqtt_client, ONENET_PROPERTY_TOPIC, payload, 0, 1, 0);
    ESP_LOGI(TAG, "OneNET publish requested, msg_id=%d", msg_id);
}

static void trim_in_place(char *text)
{
    char *start = text;
    while (*start == ' ' || *start == '\r' || *start == '\n' || *start == '\t') {
        start++;
    }

    if (start != text) {
        memmove(text, start, strlen(start) + 1);
    }

    size_t len = strlen(text);
    while (len > 0) {
        char ch = text[len - 1];
        if (ch != ' ' && ch != '\r' && ch != '\n' && ch != '\t') {
            break;
        }
        text[len - 1] = '\0';
        len--;
    }
}

static bool lora_parse_packet_line(char *line, lora_sensor_packet_t *packet)
{
    bool got_any_field = false;

    trim_in_place(line);
    if (line[0] == '\0') {
        return false;
    }

    memset(packet, 0, sizeof(*packet));

    char *token = strtok(line, ",");
    while (token != NULL) {
        char *separator = strchr(token, '=');
        if (separator == NULL) {
            separator = strchr(token, ':');
        }

        if (separator != NULL) {
            *separator = '\0';
            char *key = token;
            char *value = separator + 1;
            trim_in_place(key);
            trim_in_place(value);
            float parsed_value = strtof(value, NULL);

            if (strcmp(key, "water_level") == 0 || strcmp(key, "wl") == 0) {
                packet->water_level = parsed_value;
                got_any_field = true;
            } else if (strcmp(key, "tds") == 0 || strcmp(key, "tds_value") == 0) {
                packet->tds_value = parsed_value;
                got_any_field = true;
            } else if (strcmp(key, "total_flow") == 0 || strcmp(key, "tf") == 0) {
                packet->total_flow = parsed_value;
                got_any_field = true;
            } else if (strcmp(key, "instant_flow") == 0 || strcmp(key, "if") == 0) {
                packet->instant_flow = parsed_value;
                got_any_field = true;
            } else if (strcmp(key, "pitch") == 0 || strcmp(key, "pitch_angle") == 0 || strcmp(key, "p") == 0) {
                packet->pitch_angle = parsed_value;
                got_any_field = true;
            } else if (strcmp(key, "roll") == 0 || strcmp(key, "roll_angle") == 0 || strcmp(key, "r") == 0) {
                packet->roll_angle = parsed_value;
                got_any_field = true;
            } else if (strcmp(key, "yaw") == 0 || strcmp(key, "yaw_angle") == 0 || strcmp(key, "y") == 0) {
                packet->yaw_angle = parsed_value;
                got_any_field = true;
            } else {
                ESP_LOGW(TAG, "unknown LoRa field: %s=%s", key, value);
            }
        }

        token = strtok(NULL, ",");
    }

    return got_any_field;
}

static void lora_uart_init(void)
{
    const uart_config_t uart_config = {
        .baud_rate = LORA_UART_BAUD_RATE,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };

    ESP_ERROR_CHECK(uart_driver_install(LORA_UART_NUM, LORA_UART_BUF_SIZE * 2, 0, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(LORA_UART_NUM, &uart_config));
    ESP_ERROR_CHECK(uart_set_pin(LORA_UART_NUM, LORA_UART_TX_PIN, LORA_UART_RX_PIN, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));

    gpio_config_t aux_config = {
        .pin_bit_mask = 1ULL << LORA_UART_AUX_PIN,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_ERROR_CHECK(gpio_config(&aux_config));

    ESP_LOGI(TAG, "LoRa UART ready: uart=%d tx=%d rx=%d aux=%d baud=%d",
             LORA_UART_NUM, LORA_UART_TX_PIN, LORA_UART_RX_PIN, LORA_UART_AUX_PIN, LORA_UART_BAUD_RATE);
}

static void lora_uart_receive_task(void *arg)
{
    uint8_t rx_data[LORA_UART_BUF_SIZE];
    char line_buf[LORA_LINE_BUF_SIZE];
    size_t line_len = 0;

    while (1) {
        int read_len = uart_read_bytes(LORA_UART_NUM, rx_data, sizeof(rx_data), pdMS_TO_TICKS(LORA_FRAME_IDLE_MS));
        if (read_len <= 0) {
            if (line_len > 0) {
                line_buf[line_len] = '\0';
                lora_sensor_packet_t packet;
                if (lora_parse_packet_line(line_buf, &packet)) {
                    ESP_LOGI(TAG, "LoRa rx: %s", line_buf);
                    ESP_LOGI(TAG,
                             "LoRa parsed: wl=%.2f tds=%.2f tf=%.3f if=%.3f pitch=%.2f roll=%.2f yaw=%.2f",
                             packet.water_level, packet.tds_value, packet.total_flow,
                             packet.instant_flow, packet.pitch_angle, packet.roll_angle, packet.yaw_angle);
                    lora_publish_packet_to_onenet(&packet);
                } else {
                    ESP_LOGW(TAG, "LoRa parse failed: %s", line_buf);
                }
                line_len = 0;
            }
            continue;
        }

        for (int i = 0; i < read_len; ++i) {
            char ch = (char)rx_data[i];

            if (ch == '\0') {
                continue;
            }

            if (ch == '\n') {
                line_buf[line_len] = '\0';
                if (line_len > 0) {
                    lora_sensor_packet_t packet;
                    if (lora_parse_packet_line(line_buf, &packet)) {
                        ESP_LOGI(TAG, "LoRa rx: %s", line_buf);
                        ESP_LOGI(TAG,
                                 "LoRa parsed: wl=%.2f tds=%.2f tf=%.3f if=%.3f pitch=%.2f roll=%.2f yaw=%.2f",
                                 packet.water_level, packet.tds_value, packet.total_flow,
                                 packet.instant_flow, packet.pitch_angle, packet.roll_angle, packet.yaw_angle);
                        lora_publish_packet_to_onenet(&packet);
                    } else {
                        ESP_LOGW(TAG, "LoRa parse failed: %s", line_buf);
                    }
                }
                line_len = 0;
            } else if (ch != '\r') {
                if (line_len < (sizeof(line_buf) - 1)) {
                    line_buf[line_len++] = ch;
                } else {
                    ESP_LOGW(TAG, "LoRa line too long, dropping current line");
                    line_len = 0;
                }
            }
        }
    }
}


static void event_handler(void* arg, esp_event_base_t event_base,
                                int32_t event_id, void* event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        if (s_retry_num < EXAMPLE_ESP_MAXIMUM_RETRY) {
            esp_wifi_connect();
            s_retry_num++;
            ESP_LOGI(TAG, "retry to connect to the AP");
        } else {
            xEventGroupSetBits(s_wifi_event_group, WIFI_FAIL_BIT);
        }
        ESP_LOGI(TAG,"connect to the AP fail");
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "got ip:" IPSTR, IP2STR(&event->ip_info.ip));
        s_retry_num = 0;
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

void wifi_init_sta(void)
{
    s_wifi_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());

    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    esp_event_handler_instance_t instance_any_id;
    esp_event_handler_instance_t instance_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT,
                                                        ESP_EVENT_ANY_ID,
                                                        &event_handler,
                                                        NULL,
                                                        &instance_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT,
                                                        IP_EVENT_STA_GOT_IP,
                                                        &event_handler,
                                                        NULL,
                                                        &instance_got_ip));

    wifi_config_t wifi_config = {
        .sta = {
            .ssid = EXAMPLE_ESP_WIFI_SSID,
            .password = EXAMPLE_ESP_WIFI_PASS,
            /* Authmode threshold resets to WPA2 as default if password matches WPA2 standards (password len => 8).
             * If you want to connect the device to deprecated WEP/WPA networks, Please set the threshold value
             * to WIFI_AUTH_WEP/WIFI_AUTH_WPA_PSK and set the password with length and format matching to
             * WIFI_AUTH_WEP/WIFI_AUTH_WPA_PSK standards.
             */
            .threshold.authmode = ESP_WIFI_SCAN_AUTH_MODE_THRESHOLD,
            .sae_pwe_h2e = ESP_WIFI_SAE_MODE,
            .sae_h2e_identifier = EXAMPLE_H2E_IDENTIFIER,
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA) );
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config) );
    ESP_ERROR_CHECK(esp_wifi_start() );

    ESP_LOGI(TAG, "wifi_init_sta finished.");

    /* Waiting until either the connection is established (WIFI_CONNECTED_BIT) or connection failed for the maximum
     * number of re-tries (WIFI_FAIL_BIT). The bits are set by event_handler() (see above) */
    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
            WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
            pdFALSE,
            pdFALSE,
            portMAX_DELAY);

    /* xEventGroupWaitBits() returns the bits before the call returned, hence we can test which event actually
     * happened. */
    if (bits & WIFI_CONNECTED_BIT) {
        ESP_LOGI(TAG, "connected to ap SSID:%s password:%s",
                 EXAMPLE_ESP_WIFI_SSID, EXAMPLE_ESP_WIFI_PASS);
    } else if (bits & WIFI_FAIL_BIT) {
        ESP_LOGI(TAG, "Failed to connect to SSID:%s, password:%s",
                 EXAMPLE_ESP_WIFI_SSID, EXAMPLE_ESP_WIFI_PASS);
    } else {
        ESP_LOGE(TAG, "UNEXPECTED EVENT");
    }
}

void app_main(void)
{
    //Initialize NVS
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
      ESP_ERROR_CHECK(nvs_flash_erase());
      ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    if (CONFIG_LOG_MAXIMUM_LEVEL > CONFIG_LOG_DEFAULT_LEVEL) {
        /* If you only want to open more logs in the wifi module, you need to make the max level greater than the default level,
         * and call esp_log_level_set() before esp_wifi_init() to improve the log level of the wifi module. */
        esp_log_level_set("wifi", CONFIG_LOG_MAXIMUM_LEVEL);
    }

    ESP_LOGI(TAG, "ESP_WIFI_MODE_STA");
    wifi_init_sta();
    onenet_mqtt_start();
    lora_uart_init();
    xTaskCreate(lora_uart_receive_task, "lora_uart_receive", 4096, NULL, 5, NULL);
}
