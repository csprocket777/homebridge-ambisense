import { AmbisenseApi, AmbisenseApiDeviceSample } from "./api";
import { AmbisenseDevice, AmbisenseDeviceInfo } from "./device";
import { AccessoryConfig, AccessoryPlugin, API, Formats, Logging, Perms, Service } from "homebridge";

export class AmbisensePlugin implements AccessoryPlugin {
  private readonly log: Logging;
  private readonly timer: NodeJS.Timer;

  private readonly ambisenseApi: AmbisenseApi;
  private readonly ambisenseConfig: AmbisensePluginConfig;
  private readonly ambisenseDevice: AmbisenseDeviceInfo;

  private readonly informationService: Service;
  private readonly airQualityService: Service;
  private readonly temperatureService: Service;
  private readonly humidityService: Service;
  private readonly carbonDioxideService: Service;

  private latestSamples: AmbisenseApiDeviceSample = {
    // data: {
      // events:[
      // {
        id: "",
        name: "",
        data: {
          firmware_version: undefined,
          uptime: undefined,
          co2: undefined,
          temperature: undefined,
          humidity: undefined,
          tvoc: undefined,
          pm1: undefined,
          pm2_5: undefined,
          pm4: undefined,
          pm10: undefined,
          voltage: undefined,
          mac_address: undefined,
          host_name: undefined,
          rssi: undefined,
          bssid: undefined,
          local_ip: undefined,
          subnet_mask: undefined,
          gateway_ip: undefined,
          dns1: undefined,
          dns2: undefined,
          error_code: undefined,
        },
        timestamp: undefined,
        location: undefined,
        source:{
          name: undefined,
        },
        state: {
          cisco: undefined,
          co2Min: undefined,
          co2Count: undefined,
          co2Delta: undefined,
          notified: undefined,
          co2_limit: undefined,
          firstCalib: undefined,
          location_home: undefined,
          Weather_Station: undefined,
          location_office: undefined,
        }
      // }
    // ]
    // }
  };

  constructor(log: Logging, config: AmbisensePluginConfig, api: API) {
    this.log = log;

    if (config.deviceId == undefined) {
      this.log.error("Missing required config value: deviceId");
    }

    if (config.deviceToken == undefined) {
      this.log.error("Missing required config value: deviceToken");
    }

    if (config.serialNumber == undefined) {
      this.log.error("Missing required config value: serialNumber");
      config.serialNumber = "0000000000";
    }

    if (config.radonLeakThreshold != undefined && !Number.isSafeInteger(config.radonLeakThreshold)) {
      this.log.warn("Invalid config value: radonLeakThreshold (not a valid integer)")
      config.radonLeakThreshold = undefined;
    }

    if (config.refreshInterval == undefined || !Number.isSafeInteger(config.refreshInterval)) {
      this.log.warn("Invalid config value: refreshInterval (not a valid integer)")
      config.refreshInterval = 150;
    }

    if (config.refreshInterval < 60) {
      this.log.warn("Invalid config value: refreshInterval (<60s may cause rate limiting)");
      config.refreshInterval = 60;
    }

    if (config.tokenScope == undefined) {
      config.tokenScope = 'read:device:current_values';
    }

    this.ambisenseApi = new AmbisenseApi(config.deviceId, config.deviceToken, config.dataPackage);
    this.ambisenseConfig = config;
    this.ambisenseDevice = AmbisenseDevice.getDevice(config.serialNumber);

    this.log.info(`Device Model: ${this.ambisenseDevice.model}`);
    this.log.info(`Serial Number: ${this.ambisenseConfig.serialNumber}`);
    this.log.info(`Refresh Interval: ${this.ambisenseConfig.refreshInterval}s`);
    // this.log.info(`Token Scope: ${this.ambisenseConfig.tokenScope}`);

    // HomeKit Accessory Information Service
    this.informationService = new api.hap.Service.AccessoryInformation()
      .setCharacteristic(api.hap.Characteristic.Manufacturer, "Ambisense")
      .setCharacteristic(api.hap.Characteristic.Model, this.ambisenseDevice.model)
      .setCharacteristic(api.hap.Characteristic.Name, config.name)
      .setCharacteristic(api.hap.Characteristic.SerialNumber, config.serialNumber)
      .setCharacteristic(api.hap.Characteristic.FirmwareRevision, "Unknown");


    // HomeKit Air Quality Service
    this.airQualityService = new api.hap.Service.AirQualitySensor("Air Quality");


    this.airQualityService.getCharacteristic(api.hap.Characteristic.VOCDensity).setProps({
      unit: "µg/m³",
      maxValue: 65535
    });

    if (this.ambisenseDevice.sensors.tvoc) {
      this.airQualityService.addCharacteristic(new api.hap.Characteristic("VOC Density (ppb)", "E5B6DA60-E041-472A-BE2B-8318B8A724C5", {
        format: Formats.UINT16,
        perms: [Perms.NOTIFY, Perms.PAIRED_READ],
        unit: "ppb",
        minValue: 0,
        maxValue: 10000,
        minStep: 1
      }));
    }

    // HomeKit Temperature Service
    this.temperatureService = new api.hap.Service.TemperatureSensor("Temp");

    // HomeKit Humidity Service
    this.humidityService = new api.hap.Service.HumiditySensor("Humidity");

    // HomeKit CO2 Service
    this.carbonDioxideService = new api.hap.Service.CarbonDioxideSensor("CO2");

    this.refreshCharacteristics(api);
    this.timer = setInterval(async () => { await this.refreshCharacteristics(api) }, config.refreshInterval * 1000);
  }

  getServices(): Service[] {
    const services = [this.informationService, this.airQualityService];

    if (this.ambisenseDevice.sensors.temperature) {
      services.push(this.temperatureService);
    }

    if (this.ambisenseDevice.sensors.humidity) {
      services.push(this.humidityService);
    }

    if (this.ambisenseDevice.sensors.co2) {
      services.push(this.carbonDioxideService);
    }

    return services;
  }

  async getLatestSamples() {
    if (this.ambisenseConfig.serialNumber == undefined) {
      return;
    }

    try {
      this.latestSamples = await this.ambisenseApi.getLatestSamples();
      this.log.info(JSON.stringify(this.latestSamples.data));
    }
    catch (err) {
      if (err instanceof Error) {
        this.log.error(err.message);
      }
    }
  }

  async refreshCharacteristics(api: API) {
    await this.getLatestSamples();

    this.informationService.setCharacteristic(api.hap.Characteristic.FirmwareRevision, this.latestSamples.data.firmware_version ?? "")

    // HomeKit Air Quality Service
    this.airQualityService.getCharacteristic(api.hap.Characteristic.AirQuality).updateValue(
      this.getAirQuality(api, this.latestSamples)
    );

    if (this.ambisenseDevice.sensors.pm2_5) {
      this.airQualityService.getCharacteristic(api.hap.Characteristic.PM2_5Density).updateValue(
        this.latestSamples.data.pm2_5 ?? 0
      );
    }

    if (this.ambisenseDevice.sensors.pm10) {
      this.airQualityService.getCharacteristic(api.hap.Characteristic.PM10Density).updateValue(
        this.latestSamples.data.pm10 ?? 0
      );
    }

    if (this.ambisenseDevice.sensors.tvoc) {
      const temp = this.latestSamples.data.temperature ?? 25;
      const pressure = 1013;
      this.airQualityService.getCharacteristic(api.hap.Characteristic.VOCDensity)?.updateValue(
        this.latestSamples.data.tvoc != undefined ? this.latestSamples.data.tvoc * (78 / (22.41 * ((temp + 273) / 273) * (1013 / pressure))) : 0
      );

      this.airQualityService.getCharacteristic("VOC Density (ppb)")?.updateValue(
        this.latestSamples.data.tvoc ?? 0
      );
    }

    this.airQualityService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
      this.latestSamples.data.uptime != undefined && Date.now() / 1000 - this.latestSamples.data.uptime < 2 * 60 * 60
    );

    // HomeKit Temperature Service
    this.temperatureService.getCharacteristic(api.hap.Characteristic.CurrentTemperature).updateValue(
      this.latestSamples.data.temperature ?? 0
    );

    this.temperatureService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
      this.latestSamples.data.temperature != undefined && this.latestSamples.data.uptime != undefined && Date.now() / 1000 - this.latestSamples.data.uptime < 2 * 60 * 60
    );

    // HomeKit Humidity Service
    this.humidityService.getCharacteristic(api.hap.Characteristic.CurrentRelativeHumidity).updateValue(
      this.latestSamples.data.humidity ?? 0
    );

    this.humidityService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
      this.latestSamples.data.humidity != undefined && this.latestSamples.data.uptime != undefined && Date.now() / 1000 - this.latestSamples.data.uptime < 2 * 60 * 60
    );

    // HomeKit CO2 Service
    this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.CarbonDioxideDetected).updateValue(
      this.latestSamples.data.co2 == undefined || this.latestSamples.data.co2 < 1000
        ? api.hap.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL
        : api.hap.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL
    );

    this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.CarbonDioxideLevel).updateValue(
      this.latestSamples.data.co2 ?? 0
    );

    this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
      this.latestSamples.data.co2 != undefined && this.latestSamples.data.uptime != undefined && Date.now() / 1000 - this.latestSamples.data.uptime < 2 * 60 * 60
    );
  }

  getAirQuality(api: API, latestSamples: AmbisenseApiDeviceSample) {
    let aq = api.hap.Characteristic.AirQuality.UNKNOWN;

    const humidity = latestSamples.data.humidity;
    if (humidity != undefined) {
      if (humidity < 25 || humidity >= 70) {
        aq = api.hap.Characteristic.AirQuality.POOR;
      }
      else if (humidity < 30 || humidity >= 60) {
        aq = api.hap.Characteristic.AirQuality.FAIR;
      }
      else {
        aq = api.hap.Characteristic.AirQuality.EXCELLENT;
      }
    }

    const co2 = latestSamples.data.co2;
    if (co2 != undefined) {
      if (co2 >= 1000) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
      }
      else if (co2 >= 800) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
      }
      else {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.EXCELLENT);
      }
    }

    const pm2_5 = latestSamples.data.pm2_5;
    if (pm2_5 != undefined) {
      if (pm2_5 >= 25) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
      }
      else if (pm2_5 >= 10) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
      }
      else {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.EXCELLENT);
      }
    }

    const voc = latestSamples.data.tvoc;
    if (voc != undefined) {
      if (voc >= 2000) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
      }
      else if (voc >= 250) {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
      }
      else {
        aq = Math.max(aq, api.hap.Characteristic.AirQuality.EXCELLENT);
      }
    }

    return aq;
  }
}

interface AmbisensePluginConfig extends AccessoryConfig {
  clientId?: string;
  clientSecret?: string;
  serialNumber?: string;
  radonLeakThreshold?: number;
  refreshInterval?: number;
  tokenScope?: string;
  deviceId?: string;
  deviceToken?: string;
  dataPackage?: string;
}
