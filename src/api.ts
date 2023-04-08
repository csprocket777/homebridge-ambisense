import axios, {Axios} from "axios";
import { AccessToken, ClientCredentials } from "simple-oauth2";

export class AmbisenseApi {
  // private accessToken?: AccessToken;

  // private readonly client?: ClientCredentials;
  private readonly client?: Axios;
  // private readonly tokenScope: string;

  private readonly deviceId?: string;
  private readonly deviceToken?: string;
  private readonly dataPackage?: string;

  // constructor(tokenScope: string, clientId?: string, clientSecret?: string) {
  constructor(deviceId?: string, deviceToken?: string, dataPackage?:string) {
    this.deviceId = deviceId;
    this.deviceToken = deviceToken;
    this.dataPackage = dataPackage;

    if(deviceId == null || deviceToken == null || dataPackage == null) {
      console.log("Bailing because we don't have what we need")
      return;
    }

    const config = {
      baseURL: 'https://api3.ambisense.net/v1',
      timeout: 1000,
      headers: {
        Authorization: `Bearer d_sk_${this.deviceToken}`
      }
    }

    console.log(config)

    this.client = axios.create(config);
    // this.tokenScope = tokenScope;

    // if (clientId == null || clientSecret == null) {
    //   return;
    // }

    // const config = {
    //   client: {
    //     id: clientId,
    //     secret: clientSecret
    //   },
    //   auth: {
    //     tokenHost: "https://accounts.ambisense.com",
    //     tokenPath: "https://accounts-api.ambisense.com/v1/token"
    //   }
    // };

    // this.client = new ClientCredentials(config);
  }

  public async getLatestSamples(id: string) {
    if (this.client == null) {
      throw new Error("Ambisense API Client not initialized due to invalid configuration...");
    }

    // if (this.accessToken == null || this.accessToken?.expired(300)) {
    //   const tokenParams = {
    //     scope: this.tokenScope
    //   };
    //   this.accessToken = await this.client.getToken(tokenParams);
    // }

    // const requestConfig = {
    //   headers: { "Authorization": this.accessToken.token.access_token }
    // };

    const requestConfig = {
      params: {
        "device.id": `dev_${this.deviceId}`,
        "name": this.dataPackage,
        "limit": 1,
        "page": 0
      }
    }

    const response = await this.client.get(`/events`, requestConfig);
    // console.log(response.data.events[0]);
    return response.data.events[0];
  }
}

export interface AmbisenseApiDeviceSample {
  // data:{
    // events:[
      // {
        id: string,
        name: string,
        data: {
          firmware_version?: string;
          uptime?: number;
          co2?: number;
          temperature?: number;
          humidity?: number;
          tvoc?: number;
          pm1?: number;
          pm2_5?: number;
          pm4?: number;
          pm10?: number;
          voltage?: number;
          mac_address?: string;
          host_name?: string;
          rssi?: string;
          bssid?: string;
          local_ip?: string;
          subnet_mask?: string;
          gateway_ip?: string;
          dns1?: string;
          dns2?: string;
          error_code?: number;
        },
        timestamp?: Date,
        location?: string;
        source?:{
          name?: string;
        };
        state?: {
          cisco?: string;
          co2Min?: string;
          co2Count?: string;
          co2Delta?: string;
          notified?: string;
          co2_limit?: string;
          firstCalib?: string;
          location_home?: string;
          Weather_Station?: string;
          location_office?: string;
        }
      // }
    // ]
  // }
}
