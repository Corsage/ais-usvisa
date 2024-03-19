export class Utils {
  /**
   * Parses a string in 'YYYY-MM-DD' format and returns a Date object.
   * @param date - The date string.
   */
  public static parseDateString(date: string): Date {
    const [year, month, day] = date.split("-").map(Number);
    // Note: months in Date object are 0-indexed, so we subtract 1.
    return new Date(year, month - 1, day);
  }

  /**
   * Finds the first value in array A that is present in array B.
   */
  public static findFirstMatch<T>(A: T[], B: T[]): T | undefined {
    for (let value of A) {
      if (B.includes(value)) {
        return value;
      }
    }

    return undefined;
  }

  /**
   * Allows for String interpolation.
   */
  public static formatString(str: string, ...val: string[]) {
    for (let index = 0; index < val.length; index++) {
      str = str.replace(`{${index}}`, val[index]);
    }
    return str;
  }

  /**
   * Create a random delay within a start and end range in ms.
   */
  public static randomDelay(start: number, end: number) {
    const randomDelay = Math.random() * (end - start) + start;
    return new Promise((resolve) => setTimeout(resolve, randomDelay));
  }

  public static delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
