import { Browser, BrowserContext, LaunchOptions, Page } from "@playwright/test";
import { CONFIG } from "./config";
import Playwright from "playwright";
import {
  AppointmentFormKeys,
  GroupPage,
  Location,
  LoginPage,
  REGEX_URLS,
  Urls,
} from "./constants";
import { Utils } from "./utils";
import { AppointmentDay } from "./models/appointment-day";
import { AppointmentTime } from "./models/appointment-time";
import { URLSearchParams } from "url";
import { Logger } from "@hammerhq/logger";

type AppointmentParams = {
  url: string;
  csrfToken: string;
  referrer: string;
};

type SubmitParams = {
  url: string;
  referrer: string;
  form: string;
};

enum States {
  ERROR,
  NOT_LOGGED_IN,
  NAVIGATE_TO_RESCHEDULE,
  RESCHEDULING,
  REFRESH,
  COMPLETE,
}

enum RescheduleStates {
  ERROR,
  RETRY,
  REFRESH,
  SUCCESS,
}

export class AppointmentService {
  private logger = new Logger("[AppointmentService]");
  private state: States = States.NOT_LOGGED_IN;

  /**
   * User configuration data.
   */
  private config = CONFIG;

  /**
   * Playwright session.
   */
  private browser!: Browser;
  private context!: BrowserContext;
  private page!: Page;

  private launchOptions: LaunchOptions = {
    headless: false,
  };

  /**
   * Additional info needed for ais.usvisa-info.com
   */
  private actionId?: string;
  private csrfToken?: string;
  private retryCount = 0;

  /**
   * Selected appointment data.
   */
  private location?: Location;
  private selectedDay?: AppointmentDay;
  private selectedTime?: string;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    this.browser = await Playwright.chromium.launch(this.launchOptions);
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();

    let running = true;
    let result = false;

    while (running) {
      switch (this.state) {
        case States.NOT_LOGGED_IN:
          result = await this.login();
          this.state = result ? States.NAVIGATE_TO_RESCHEDULE : States.ERROR;
          break;

        case States.NAVIGATE_TO_RESCHEDULE:
          result = await this.gotoRescheduleAppointment();
          this.state = result ? States.RESCHEDULING : States.ERROR;
          break;

        case States.RESCHEDULING:
          const reschedule = await this.rescheduleAppointment();
          if (reschedule === RescheduleStates.REFRESH) {
            this.state = States.REFRESH;
          } else if (reschedule === RescheduleStates.ERROR) {
            this.state = States.ERROR;
          } else if (reschedule === RescheduleStates.SUCCESS) {
            this.state = States.COMPLETE;
          }
          break;

        case States.REFRESH:
          await this.reload();
          this.state = States.RESCHEDULING;
          break;

        case States.COMPLETE:
          this.logger.success("Successfully rescheduled appointment.");
          running = false;
          break;

        case States.ERROR:
          this.logger.event("Reached an error state, stopping...");
          running = false;
          break;
      }

      await Utils.randomDelay(500, 1500);
    }
  }

  private reset(): void {
    this.actionId = undefined;
    this.csrfToken = undefined;
    this.location = undefined;
    this.selectedDay = undefined;
    this.selectedTime = undefined;
  }

  private async reload(): Promise<void> {
    this.logger.event("Reloading page.");

    this.retryCount = 0;
    await this.page.reload();
  }

  /**
   * Submits the new appointment.
   * NOTE: This has never been tested.
   */
  private async submitAppointment(): Promise<boolean> {
    const url = Utils.formatString(
      `${Urls.Base}${Urls.Appointment}`,
      `${this.actionId}`
    );

    const formData = new URLSearchParams();
    formData.append(
      AppointmentFormKeys.AUTHENTICITY_TOKEN,
      `${this.csrfToken}`
    );
    formData.append(AppointmentFormKeys.CONFIRMED_LIMIT_MESSAGE, "1");
    formData.append(
      AppointmentFormKeys.USE_CONSULATE_APPOINTMENT_CAPACITY,
      "true"
    );
    formData.append(AppointmentFormKeys.FACILITY_ID, `${this.location}`);
    formData.append(AppointmentFormKeys.DATE, `${this.selectedDay?.date}`);
    formData.append(AppointmentFormKeys.TIME, `${this.selectedTime}`);

    const data: SubmitParams = {
      url,
      referrer: this.page.url(),
      form: formData.toString(),
    };

    try {
      const response = await this.page.evaluate(async (data: SubmitParams) => {
        const request = await fetch(data.url, {
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "sec-ch-ua": '"Chromium";v="123", "Not:A-Brand";v="8"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "upgrade-insecure-requests": "1",
          },
          referrer: data.referrer,
          referrerPolicy: "strict-origin-when-cross-origin",
          body: data.form,
          method: "POST",
          mode: "cors",
          credentials: "omit",
        });

        return request;
      }, data);

      if (response) {
        this.logger.log(
          `Submitted appointment with response status: ${response.status} and message: ${response.statusText}.`
        );
      }
    } catch (e) {
      this.logger.error(e);
      return false;
    }

    return true;
  }

  private async rescheduleAppointment(): Promise<RescheduleStates> {
    this.csrfToken = await this.getCsrfToken();

    if (!this.csrfToken) {
      this.logger.error("Unable to find X-CSRF-Token.");
      return RescheduleStates.ERROR;
    }

    for (let i = 0; i < this.config.SELECTED_LOCATIONS.length; i++) {
      const location = this.config.SELECTED_LOCATIONS[i];
      this.logger.log(
        `Getting available appointment days for location ${location}.`
      );

      const url = Utils.formatString(
        `${Urls.Base}${Urls.Appointment_Days}`,
        `${this.actionId}`,
        `${location}`
      );

      const days = await this.getAppointmentData<AppointmentDay[]>({
        url,
        csrfToken: this.csrfToken,
        referrer: this.page.url(),
      });

      if (days) {
        this.selectedDay = this.findEarlierAppointmentDay(days);

        if (this.selectedDay) {
          this.location = location;
          break;
        } else {
          this.logger.info(
            `Found no earlier appointment day at location ${location}.`
          );
        }
      }

      await Utils.randomDelay(500, 1500);
    }

    if (this.selectedDay) {
      this.logger.success(
        `Found an earlier appointment day: ${this.selectedDay.date} at location ${this.location}.`
      );

      if (!(await this.getAppointmentTime())) {
        this.logger.error(
          `Unable to find an appointment time for date ${this.selectedDay.date} at location ${this.location}.`
        );
        return RescheduleStates.ERROR;
      }

      this.logger.success(
        `Found a time ${this.selectedTime} for date ${this.selectedDay.date} at location ${this.location}.`
      );

      if (!(await this.submitAppointment())) {
        this.logger.error("There was an error submitting this appointment.");
        return RescheduleStates.ERROR;
      }

      return RescheduleStates.SUCCESS;
    }

    this.retryCount++;
    this.logger.log(`Retry count at ${this.retryCount}.`);
    return this.retryCount >= 10
      ? RescheduleStates.REFRESH
      : RescheduleStates.RETRY;
  }

  private async getAppointmentTime(): Promise<boolean> {
    this.logger.log(
      `Getting available appointment times for date ${this.selectedDay?.date} at location ${this.location}.`
    );

    const url = Utils.formatString(
      `${Urls.Base}${Urls.Appointment_Times}`,
      `${this.actionId}`,
      `${this.location}`,
      `${this.selectedDay?.date}`
    );

    const data: AppointmentParams = {
      url,
      csrfToken: this.csrfToken!,
      referrer: this.page.url(),
    };

    const times = await this.getAppointmentData<AppointmentTime>(data);

    if (times) {
      this.selectedTime = this.findAppointmentTime(times);
    }

    return this.selectedTime !== undefined;
  }

  /**
   * Finds the first available appointment time.
   */
  private findAppointmentTime(times: AppointmentTime): string | undefined {
    this.logger.log(
      `Comparing ${times.available_times.length} available times for date ${this.selectedDay?.date} at location ${this.location}.`
    );

    const time = Utils.findFirstMatch(
      times.available_times,
      times.business_times
    );

    return time;
  }

  /**
   * Finds the first earlier appointment than the given date in {@link CONFIG.CURRENT_APPOINTMENT_DATE}.
   * @param days - A list of days to compare against.
   */
  private findEarlierAppointmentDay(
    days: AppointmentDay[]
  ): AppointmentDay | undefined {
    this.logger.log(`Comparing ${days.length} appointment days.`);

    for (let i = 0; i < days.length; i++) {
      const day = days[i];

      if (day.business_day) {
        const date = Utils.parseDateString(day.date);
        if (date.getTime() < this.config.CURRENT_APPOINTMENT_DATE) {
          return day;
        }
      }
    }

    return undefined;
  }

  private async getAppointmentData<T>(
    data: AppointmentParams
  ): Promise<T | undefined> {
    try {
      const response = await this.page.evaluate(
        async (data: AppointmentParams) => {
          const request = await fetch(data.url, {
            credentials: "include",
            headers: {
              Accept: "application/json, text/javascript, */*; q=0.01",
              "Accept-Language": "en-CA,en-US;q=0.7,en;q=0.3",
              "X-CSRF-Token": data.csrfToken,
              "X-Requested-With": "XMLHttpRequest",
              "Sec-Fetch-Dest": "empty",
              "Sec-Fetch-Mode": "no-cors",
              "Sec-Fetch-Site": "same-origin",
              "Sec-GPC": "1",
              Pragma: "no-cache",
              "Cache-Control": "no-cache",
            },
            referrer: data.referrer,
            method: "GET",
            mode: "cors",
          });

          return request.json();
        },
        data
      );

      if (response) {
        return response as T;
      }
    } catch (e) {
      this.logger.error(e);
    }

    return undefined;
  }

  /**
   * Logs the user into ais.usvisa-info.com
   * On success, the user is redirected to @url https://ais.usvisa-info.com/en-ca/niv/groups/XXX
   */
  private async login(): Promise<boolean> {
    await this.page.goto(`${Urls.Base}${Urls.Login}`);

    const email = this.page.locator(LoginPage.Email);
    const password = this.page.locator(LoginPage.Password);
    const privacy = this.page.locator(LoginPage.Privacy);
    const submit = this.page.locator(LoginPage.Submit);

    await email.fill(this.config.EMAIL);
    await password.fill(this.config.PASSWORD);
    await privacy.click();
    await submit.click();

    // TODO: add checks for incorrect login.

    await this.page.waitForURL(REGEX_URLS.GROUPS);
    this.logger.success("Successfully logged in.");
    return true;
  }

  /**
   * Navigates the user to the reschedule appointment page.
   * On success, the user is directed to @url https://ais.usvisa-info.com/en-ca/niv/schedule/XXX/appointment
   */
  private async gotoRescheduleAppointment(): Promise<boolean> {
    const continueLink = this.page.locator(GroupPage.Continue);
    if (!continueLink) {
      this.logger.error(
        `Could not find continue link on page ${this.page.url()}.`
      );
      return false;
    }

    await continueLink.click();

    await this.page.waitForURL(REGEX_URLS.ACTIONS);
    this.actionId = this.getActionId(this.page.url());

    if (!this.actionId) {
      this.logger.error("Unable to get action id!");
      return false;
    }

    // Go directly to appointments page with the action id.
    const url = Utils.formatString(
      `${Urls.Base}${Urls.Appointment}`,
      this.actionId
    );
    await this.page.goto(url);
    await this.page.waitForURL(REGEX_URLS.APPOINTMENT);

    this.logger.success("Navigated to reschedule appointment page.");
    return true;
  }

  /**
   * Retrieves the X-CSRF-Token from the website.
   */
  private async getCsrfToken(): Promise<string | undefined> {
    const token = await this.page.$eval(
      'meta[name="csrf-token"]',
      (element: HTMLElement) => element.getAttribute("content")
    );

    return token !== null ? token : undefined;
  }

  /**
   * Retrieves the action id from a given URL.
   * @param url - A url in the format of /schedule/XXX/continue_actions
   */
  private getActionId(url: string): string {
    let id = "";

    const regex = /\/schedule\/(\d+)\/continue_actions$/;
    const match = url.match(regex);
    if (match && match.length > 1 && match[1]) {
      id = match[1];
    }

    return id;
  }
}
