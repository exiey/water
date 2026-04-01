idf_component_register(SRCS "station_example_main.c"
                    PRIV_REQUIRES esp_wifi nvs_flash mqtt esp_event esp_netif
                    INCLUDE_DIRS ".")
