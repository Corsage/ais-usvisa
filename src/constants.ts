/**
 * Group of URLs to check on page updates.
 */
export const REGEX_URLS = {
  GROUPS: /^https:\/\/ais\.usvisa-info\.com\/en-ca\/niv\/groups\/\d+$/,
  ACTIONS:
    /^https:\/\/ais\.usvisa-info\.com\/en-ca\/niv\/schedule\/\d+\/continue_actions$/,
  APPOINTMENT:
    /^https:\/\/ais\.usvisa-info\.com\/en-ca\/niv\/schedule\/\d+\/appointment$/,
};

/**
 * Urls used throughout the appointment process.
 */
export enum Urls {
  Base = "https://ais.usvisa-info.com/en-ca/niv/",
  Login = "users/sign_in",
  Appointment = "schedule/{0}/appointment",
  Appointment_Days = "schedule/{0}/appointment/days/{1}.json?appointments[expedite]=false",
  Appointment_Times = "schedule/{0}/appointment/times/{1}.json?date={2}&appointments[expedite]=false",
}

/**
 * Elements required in the login page.
 * @url https://ais.usvisa-info.com/en-ca/niv/users/sign_in
 */
export enum LoginPage {
  Email = "#user_email",
  Password = "#user_password",
  Privacy = 'label:has-text("I have read and understood") > div',
  Submit = 'input:has-text("Sign In")',
}

/**
 * Elements required in the group (home) page.
 * @url https://ais.usvisa-info.com/en-ca/niv/groups/XXX
 */
export enum GroupPage {
  Continue = 'a:has-text("Continue")',
}

/**
 * Location Ids from the Appointment page.
 */
export enum Location {
  Calgary = 89,
  Halifax = 90,
  Montreal = 91,
  Ottawa = 92,
  Quebec = 93,
  Toronto = 94,
  Vancouver = 95,
}

/**
 * Appointment form keys.
 */
export enum AppointmentFormKeys {
  AUTHENTICITY_TOKEN = "authenticity_token",
  CONFIRMED_LIMIT_MESSAGE = "confirmed_limit_message",
  USE_CONSULATE_APPOINTMENT_CAPACITY = "use_consulate_appointment_capacity",
  FACILITY_ID = "appointments[consulate_appointment][facility_id]",
  DATE = "appointments[consulate_appointment][date]",
  TIME = "appointments[consulate_appointment][time]",
}
