import moment from 'moment-timezone';
import { SINGAPORE_BANKING_CONSTANTS } from './constants';

export class DateUtils {
  private static timezone = SINGAPORE_BANKING_CONSTANTS.TIMEZONE;

  static getCurrentDate(): string {
    return moment.tz(this.timezone).format('DD/MM/YYYY');
  }

  static getCurrentDateTime(): string {
    return moment.tz(this.timezone).format('DD/MM/YYYY HH:mm:ss');
  }

  static generateOpenDate(): string {
    // Generate a random past date within the last 5 years
    const yearsAgo = Math.floor(Math.random() * 5) + 1;
    const randomDate = moment.tz(this.timezone)
      .subtract(yearsAgo, 'years')
      .subtract(Math.floor(Math.random() * 365), 'days');
    return randomDate.format('DD/MM/YYYY');
  }

  static generateExpiryDate(): string {
    // Generate a future date 2-5 years from now
    const yearsFromNow = Math.floor(Math.random() * 3) + 2;
    const futureDate = moment.tz(this.timezone)
      .add(yearsFromNow, 'years')
      .add(Math.floor(Math.random() * 365), 'days');
    return futureDate.format('DD/MM/YYYY');
  }

  static formatTimestamp(timestamp: number): string {
    return moment.tz(timestamp, this.timezone).format('DD/MM/YYYY HH:mm:ss');
  }

  static getTimestamp(): number {
    return moment.tz(this.timezone).valueOf();
  }

  static addDays(date: string, days: number): string {
    return moment.tz(date, 'DD/MM/YYYY', this.timezone)
      .add(days, 'days')
      .format('DD/MM/YYYY');
  }

  static isValidDate(date: string): boolean {
    return moment(date, 'DD/MM/YYYY', true).isValid();
  }

  static isDateInFuture(date: string): boolean {
    const inputDate = moment.tz(date, 'DD/MM/YYYY', this.timezone);
    const currentDate = moment.tz(this.timezone);
    return inputDate.isAfter(currentDate);
  }

  static isDateInPast(date: string): boolean {
    const inputDate = moment.tz(date, 'DD/MM/YYYY', this.timezone);
    const currentDate = moment.tz(this.timezone);
    return inputDate.isBefore(currentDate);
  }
} 