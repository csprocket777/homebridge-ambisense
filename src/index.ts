import { API } from "homebridge";

import { AmbisensePlugin } from "./plugin";

export = (api: API) => {
  api.registerAccessory("Ambisense", AmbisensePlugin);
};
