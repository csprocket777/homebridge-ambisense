export class AmbisenseDevice {
  public static getDevice(serialNumber: string) {
    switch (serialNumber.substring(0, 4)) {
      default:
        return AmbisenseDevice.UNKNOWN;
    }
  }

  static readonly UNKNOWN: AmbisenseDeviceInfo = {
    model: "AMBIAIR_PLUS",
    sensors: {
      co2: true,
      humidity: true,
      pm1: true,
      pm2_5: true,
      pm4: true,
      pm10: true,
      voltage: true,
      temperature: true,
      tvoc: true
    }
  };
}

export interface AmbisenseDeviceInfo {
  model: string;
  sensors: {
    co2: boolean;
    humidity: boolean;
    pm1: boolean;
    pm2_5: boolean;
    pm4: boolean;
    pm10: boolean;
    temperature: boolean;
    tvoc: boolean;
    voltage: boolean;
  }
}
