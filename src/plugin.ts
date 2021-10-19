import { AirthingsApi, AirthingsApiDeviceSample } from "./api";
import { AirthingsDevice, AirthingsDeviceInfo } from "./device";
import { Mutex } from "async-mutex";
import { AccessoryConfig, AccessoryPlugin, API, Logging, Service } from "homebridge";

export = (api: API) => {
  api.registerAccessory("Airthings", AirthingsPlugin);
};

class AirthingsPlugin implements AccessoryPlugin {
  private readonly log: Logging;
  private readonly mutex: Mutex;

  private readonly airthingsApi: AirthingsApi;
  private readonly airthingsConfig: AirthingsPluginConfig;
  private readonly airthingsDevice: AirthingsDeviceInfo;

  private readonly informationService: Service;
  private readonly airQualityService: Service;
  private readonly temperatureService: Service;
  private readonly humidityService: Service;
  private readonly carbonDioxideService: Service;

  private latestSamples: AirthingsApiDeviceSample = {
    data: {}
  };
  private latestSamplesTimestamp: number = 0;

  constructor(log: Logging, config: AirthingsPluginConfig, api: API) {
    if (config.clientId == null) {
      throw new Error("Missing config value: clientId");
    }

    if (config.clientSecret == null) {
      throw new Error("Missing config value: clientSecret");
    }

    if (config.serialNumber == null) {
      throw new Error("Missing config value: serialNumber");
    }

    this.log = log;
    this.mutex = new Mutex();

    this.airthingsApi = new AirthingsApi(config.clientId, config.clientSecret);
    this.airthingsConfig = config;
    this.airthingsDevice = AirthingsDevice.getDevice(config.serialNumber);

    this.log.info(`Device Model: ${this.airthingsDevice.model}`);
    this.log.info(`Serial Number: ${config.serialNumber}`);

    // HomeKit Information Service
    this.informationService = new api.hap.Service.AccessoryInformation()
      .setCharacteristic(api.hap.Characteristic.Manufacturer, "Airthings")
      .setCharacteristic(api.hap.Characteristic.Model, this.airthingsDevice.model)
      .setCharacteristic(api.hap.Characteristic.Name, config.name)
      .setCharacteristic(api.hap.Characteristic.SerialNumber, config.serialNumber)
      .setCharacteristic(api.hap.Characteristic.FirmwareRevision, "Unknown");

    // HomeKit Air Quality Service
    this.airQualityService = new api.hap.Service.AirQualitySensor("Air Quality");

    this.airQualityService.getCharacteristic(api.hap.Characteristic.AirQuality)
      .onGet(async () => {
        await this.getLatestSamples();

        let aq = api.hap.Characteristic.AirQuality.UNKNOWN;

        const humidity = this.latestSamples.data.humidity;
        if (humidity) {
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

        const co2 = this.latestSamples.data.co2;
        if (co2) {
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

        const pm25 = this.latestSamples.data.pm25;
        if (pm25) {
          if (pm25 >= 25) {
            aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
          }
          else if (pm25 >= 10) {
            aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
          }
          else {
            aq = Math.max(aq, api.hap.Characteristic.AirQuality.EXCELLENT);
          }
        }

        const voc = this.latestSamples.data.voc;
        if (voc) {
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
      });

    if (this.airthingsDevice.sensors.pm25) {
      this.airQualityService.getCharacteristic(api.hap.Characteristic.PM2_5Density)
        .onGet(async () => {
          await this.getLatestSamples();
          return this.latestSamples.data.pm25 ?? 0;
        });
    }

    if (this.airthingsDevice.sensors.voc) {
      this.airQualityService.getCharacteristic(api.hap.Characteristic.VOCDensity)
        .onGet(async () => {
          await this.getLatestSamples();
          const temp = this.latestSamples.data.temp ?? 25;
          const pressure = this.latestSamples.data.pressure ?? 1013;
          return this.latestSamples.data.voc != null ? this.latestSamples.data.voc * (78 / (22.41 * ((temp + 273) / 273) * (1013 / pressure))) : 0;
        });
    }

    this.airQualityService.getCharacteristic(api.hap.Characteristic.StatusActive)
      .onGet(async () => {
        await this.getLatestSamples();
        return this.latestSamples.data.time != null && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60;
      });

    this.airQualityService.getCharacteristic(api.hap.Characteristic.StatusLowBattery)
      .onGet(async () => {
        await this.getLatestSamples();
        return this.latestSamples.data.battery == null || this.latestSamples.data.battery > 10
          ? api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
          : api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
      });

    // HomeKit Temperature Service
    this.temperatureService = new api.hap.Service.TemperatureSensor("Temp");

    this.temperatureService.getCharacteristic(api.hap.Characteristic.CurrentTemperature)
      .onGet(async () => {
        await this.getLatestSamples();
        return this.latestSamples.data.temp ?? null;
      });

    this.temperatureService.getCharacteristic(api.hap.Characteristic.StatusActive)
      .onGet(async () => {
        await this.getLatestSamples();
        return this.latestSamples.data.time != null && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60;
      });

    this.temperatureService.getCharacteristic(api.hap.Characteristic.StatusLowBattery)
      .onGet(async () => {
        await this.getLatestSamples();
        return this.latestSamples.data.battery == null || this.latestSamples.data.battery > 10
          ? api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
          : api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
      });

    // HomeKit Humidity Service
    this.humidityService = new api.hap.Service.HumiditySensor("Humidity");

    this.humidityService.getCharacteristic(api.hap.Characteristic.CurrentRelativeHumidity)
      .onGet(async () => {
        await this.getLatestSamples();
        return this.latestSamples.data.humidity ?? 0;
      });

    this.humidityService.getCharacteristic(api.hap.Characteristic.StatusActive)
      .onGet(async () => {
        await this.getLatestSamples();
        return this.latestSamples.data.time != null && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60;
      });

    this.humidityService.getCharacteristic(api.hap.Characteristic.StatusLowBattery)
      .onGet(async () => {
        await this.getLatestSamples();
        return this.latestSamples.data.battery == null || this.latestSamples.data.battery > 10
          ? api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
          : api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
      });

    // HomeKit CO2 Service
    this.carbonDioxideService = new api.hap.Service.CarbonDioxideSensor("CO2");

    this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.CarbonDioxideDetected)
      .onGet(async () => {
        await this.getLatestSamples();
        return this.latestSamples.data.co2 == null || this.latestSamples.data.co2 < 1000
          ? api.hap.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL
          : api.hap.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL;
      });

    this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.CarbonDioxideLevel)
      .onGet(async () => {
        await this.getLatestSamples();
        return this.latestSamples.data.co2 ?? 0;
      });

    this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.StatusActive)
      .onGet(async () => {
        await this.getLatestSamples();
        return this.latestSamples.data.time != null && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60;
      });

    this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.StatusLowBattery)
      .onGet(async () => {
        await this.getLatestSamples();
        return this.latestSamples.data.battery == null || this.latestSamples.data.battery > 10
          ? api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
          : api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
      });
  }

  getServices(): Service[] {
    const services = [this.informationService, this.airQualityService];

    if (this.airthingsDevice.sensors.temp) {
      services.push(this.temperatureService);
    }

    if (this.airthingsDevice.sensors.humidity) {
      services.push(this.humidityService);
    }

    if (this.airthingsDevice.sensors.co2) {
      services.push(this.carbonDioxideService);
    }

    return services;
  }

  async getLatestSamples() {
    await this.mutex.runExclusive(async () => {
      if (this.airthingsConfig.serialNumber == null) {
        return;
      }

      if (Date.now() - this.latestSamplesTimestamp > 300 * 1000) {
        this.log.info(`Refreshing latest samples...`)

        try {
          this.latestSamples = await this.airthingsApi.getLatestSamples(this.airthingsConfig.serialNumber);
          this.latestSamplesTimestamp = Date.now();
          this.log.info(JSON.stringify(this.latestSamples.data));
        }
        catch (err) {
          if (err instanceof Error) {
            this.log.error(err.message);
          }
        }
      }
    });
  }
}

interface AirthingsPluginConfig extends AccessoryConfig {
  clientId?: string;
  clientSecret?: string;
  serialNumber?: string;
}