# Homebridge Ambisense

Inspired by (and extrapolated from) the [Airthings Homebridge plugin from Michael Lahern](https://github.com/michaelahern/homebridge-airthings)

<!-- [![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins) -->
<!-- [![npm](https://badgen.net/npm/v/homebridge-airthings)](https://www.npmjs.com/package/homebridge-airthings)
[![npm](https://badgen.net/npm/dt/homebridge-airthings)](https://www.npmjs.com/package/homebridge-airthings)
[![License](https://badgen.net/github/license/michaelahern/homebridge-airthings)](LICENSE)
[![Build](https://github.com/michaelahern/homebridge-airthings/actions/workflows/build.yml/badge.svg)](https://github.com/michaelahern/homebridge-airthings/actions/workflows/build.yml)
[![Donate](https://badgen.net/badge/Donate/PayPal/green)](https://paypal.me/michaeljahern) -->

A [Homebridge](https://homebridge.io) plugin for
[Ambisense](https://www.ambisense.net) air quality monitors via the 
[Ambisense Enterprise Dashboard](https://dashboard.ambisense.net/).

## Requirements

 * [Homebridge](https://homebridge.io/)
 * One or more supported [Ambisense](https://www.ambisense.net/) air quality monitors
 

## Configuration

Example accessory config in the Homebridge config.json:

```json
"accessories": [
  {
    "accessory": "Ambisense",
    "name": "Living Room Ambisense+",
    "clientId": "00000000-0000-0000-0000-000000000000",
    "clientSecret": "11111111-1111-1111-1111-111111111111",
    "serialNumber": "2960123456",
    "refreshInterval": 150,
    "radonLeakThreshold": 150
  }
]
```

### Configuration Details

Field           	     | Description
-----------------------|------------
**accessory**   	     | (required) Must be "Ambisense"
**name**					     | (required) Name for the device in HomeKit
**clientId**			     | (required) API Client ID generated in the [Airthings Dashboard](https://dashboard.airthings.com)
**clientSecret**	     | (required) API Client Secret generated in the [Airthings Dashboard](https://dashboard.airthings.com)
**serialNumber**	     | (required) Serial number of the device
**radonLeakThreshold** | (optional) Enable a Radon Leak Sensor with a threshold in Bq/m³, disabled by default
**refreshInterval**	   | (optional) Interval in seconds for refreshng sensor data, default is 150s<br/>_Note: The Airthings Consumer API has a [rate limit of 120 requests per hour](https://developer.airthings.com/docs/api-rate-limit#airthings-consumer)_
**tokenScope**         | (optional, *experimental*) Configure a custom [Airthings API Token Scope](https://developer.airthings.com/api-docs#section/Authentication), default is read:device:current_values

### How to request an Airthings API Client ID & Secret

1. Login to the [Airthings Dashboard](https://dashboard.airthings.com)
2. Navigate to *Integrations*, then *API*, then *Request API Client*
3. Create a new API Client with the following configuration:
    * Name: Homebridge
    * Resource Scope: read:device:current_values
    * Access Type: confidential
    * Flow Type: Client Credentials (machine-to-machine)
    * Enable: On

## HomeKit Sensors

### Air Quality

Air Quality Sensors are supported and implemented using standard Apple-defined services. Air Quality in this plugin is a composite of Radon, Particulate Matter (PM2.5), Volatile Organic Compound (VOC), Carbon Dioxide (CO2), and Humidity sensors, depending on the sensors supported by your device. Air Quality values (Excellent, Fair, Poor) are based on [Airthings-defined thresholds](https://help.airthings.com/en/articles/5367327-view-understanding-the-sensor-thresholds) for each sensor.

Sensor                            | 🟢 Excellent  | 🟠 Fair                             | 🔴 Poor            |
----------------------------------|---------------|------------------------------------|--------------------|
Radon                             | <100 Bq/m³    | ≥100 and <150 Bq/m³                | ≥150 Bq/m³         |
Particulate Matter (PM2.5)        | <10 μg/m³     | ≥10 and <25 μg/m³                  | ≥25 μg/m³          |
Volatile Organic Compounds (VOCs) | <250 ppb      | ≥250 and <2000 ppb                 | ≥2000 ppb          |
Carbon Dioxide (CO2)              | <800 ppm      | ≥800 and <1000 ppm                 | ≥1000 ppm          |
Humidity                          | ≥30 and <60 % | ≥25 and <30 % <br /> ≥60 and <70 % | <25 % <br /> ≥70 % |

Notes:
* Radon measurements are not visible in the Apple Home app, but are visible within some third-party HomeKit apps, including [Eve](https://www.evehome.com/en-us/eve-app) and [Home+](https://hochgatterer.me/home+/). See the below section for more details on Radon sensors.
* This plugin converts Volatile Organic Compound (VOC) measurements from ppb (units Airthings devices report) to µg/m³ (units expected by Apple HomeKit).

### Radon

Radon Sensors are not natively supported by Apple HomeKit. However, by default, Radon is used as a factor in the Air Quality Sensor (see above).

This HomeBridge plugin optionally supports a Radon Sensor by implementing a Leak Sensor, which is a standard Apple-defined HomeKit service. To enable this, specify a value for the optional radonLeakThreshold configuration property. Note this value is in Bq/m³, not pCi/L. This will be the Leak Detected threshold for the sensor in HomeKit, which can be used for Notifications and within Automations. The Radon measurement itself will not be visible in the Apple Home app, but is visible within some third-party HomeKit apps, including [Eve](https://www.evehome.com/en-us/eve-app) and [Home+](https://hochgatterer.me/home+/).

### Air Pressure

Air Pressure Sensors are implemented using a custom HomeKit service that is supported by some third-party HomeKit apps, including [Eve](https://www.evehome.com/en-us/eve-app) and [Home+](https://hochgatterer.me/home+/). Air Pressure Sensors are not natively supported by Apple HomeKit and therefore not visible in the Apple Home app.

### Carbon Dioxide (CO2)

Carbon Dioxide Sensors are supported and implemented using standard Apple-defined services. The Carbon Dioxide Detected threshold is ≥1000 ppm.

### Temperature & Humidity

Temperature & Humidity Sensors are supported and implemented using standard Apple-defined services.
