idf_component_register(SRCS "station_example_main.c"
                    PRIV_REQUIRES esp_wifi nvs_flash mqtt esp_event esp_netif esp_driver_gpio esp_driver_uart
                    INCLUDE_DIRS ".")
