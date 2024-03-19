import "dotenv/config";
import { Location } from "./constants";
import { Utils } from "./utils";

export const CONFIG = {
  EMAIL: process.env.EMAIL as string,
  PASSWORD: process.env.PASSWORD as string,
  SELECTED_LOCATIONS: [
    Location.Vancouver,
    Location.Calgary,
    Location.Toronto,
    Location.Ottawa,
  ],
  CURRENT_APPOINTMENT_DATE: Utils.parseDateString("2025-02-28").getTime(),
};
