import type { Entry } from '../../../shared/types';

export interface WeekInfo {
  weekNumber: number;
  year: number;
  startDate: Date;
  endDate: Date;
  days: DayInfo[];
}

export interface DayInfo {
  date: Date;
  dayOfWeek: number; // 0 = Monday, 6 = Sunday
  month: number;
  dayOfMonth: number;
  isCurrentMonth?: boolean;
}

/**
 * Get ISO week number for a date
 * Week 1 is the week containing the first Thursday of the year
 */
export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Get all weeks in a year with their day information
 */
export function getWeeksInYear(year: number): WeekInfo[] {
  const weeks: WeekInfo[] = [];

  // Start from January 1st
  const startDate = new Date(year, 0, 1);

  // Find the first Monday (could be in previous year)
  const dayOfWeek = startDate.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const firstMonday = new Date(year, 0, 1 + daysToMonday);

  let currentDate = new Date(firstMonday);
  let weekNumber = 1;

  // Generate weeks until we pass December 31st
  while (currentDate.getFullYear() <= year ||
         (currentDate.getFullYear() === year + 1 && currentDate.getMonth() === 0 && currentDate.getDate() <= 7)) {
    const week: WeekInfo = {
      weekNumber,
      year,
      startDate: new Date(currentDate),
      endDate: new Date(currentDate.getTime() + 6 * 24 * 60 * 60 * 1000),
      days: [],
    };

    // Add 7 days to this week
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(currentDate.getTime() + i * 24 * 60 * 60 * 1000);
      week.days.push({
        date: dayDate,
        dayOfWeek: i,
        month: dayDate.getMonth() + 1,
        dayOfMonth: dayDate.getDate(),
        isCurrentMonth: dayDate.getFullYear() === year,
      });
    }

    // Only include weeks that have at least one day in the target year
    const hasTargetYearDay = week.days.some(d => d.date.getFullYear() === year);
    if (hasTargetYearDay) {
      weeks.push(week);
      weekNumber++;
    }

    // Move to next week
    currentDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Stop if we've gone too far into next year
    if (currentDate.getFullYear() > year && currentDate.getMonth() > 0) {
      break;
    }
  }

  return weeks;
}

/**
 * Get month label for a week (returns the dominant month)
 */
export function getWeekMonthLabel(week: WeekInfo): { month: number; showLabel: boolean } {
  // Count days per month
  const monthCounts: Record<number, number> = {};
  for (const day of week.days) {
    if (day.date.getFullYear() === week.year) {
      monthCounts[day.month] = (monthCounts[day.month] || 0) + 1;
    }
  }

  // Find dominant month
  let dominantMonth = 1;
  let maxCount = 0;
  for (const [month, count] of Object.entries(monthCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantMonth = parseInt(month);
    }
  }

  // Show label if this week contains day 1 of the month, or it's the first week
  const hasFirstOfMonth = week.days.some(d =>
    d.dayOfMonth === 1 && d.date.getFullYear() === week.year
  );

  return {
    month: dominantMonth,
    showLabel: hasFirstOfMonth || week.weekNumber === 1,
  };
}

/**
 * Check if an entry falls on a specific date
 * Uses date-only comparison to avoid DST/timezone issues
 */
export function entryIncludesDate(entry: Entry, date: Date, year: number): boolean {
  // Normalize all dates to year/month/day only (ignore time)
  const dateYear = date.getFullYear();
  const dateMonth = date.getMonth() + 1; // 1-indexed
  const dateDay = date.getDate();

  const startMonth = entry.month;
  const endMonth = entry.end_month ?? entry.month;
  const startDay = entry.day_start;
  const endDay = entry.day_end;

  // Convert to day-of-year for comparison
  const dateDOY = getDayOfYear(dateYear, dateMonth, dateDay);
  const startDOY = getDayOfYear(year, startMonth, startDay);
  const endDOY = getDayOfYear(year, endMonth, endDay);

  // Handle year boundary - if date is in a different year, check if it matches
  if (dateYear !== year) {
    return false;
  }

  return dateDOY >= startDOY && dateDOY <= endDOY;
}

/**
 * Get day of year (1-366)
 */
function getDayOfYear(year: number, month: number, day: number): number {
  const daysInMonths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Adjust for leap year
  if ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) {
    daysInMonths[2] = 29;
  }

  let doy = day;
  for (let m = 1; m < month; m++) {
    doy += daysInMonths[m];
  }
  return doy;
}

/**
 * Get entries that fall on a specific date
 */
export function getEntriesForDate(entries: Entry[], date: Date, year: number): Entry[] {
  return entries.filter(entry => entryIncludesDate(entry, date, year));
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] || '';
}

/**
 * Get the week number that contains today, for the given year
 * Returns -1 if today is not in the given year
 */
export function getCurrentWeekNumber(year: number): number {
  const today = new Date();

  // If today is not in this year, return -1
  if (today.getFullYear() !== year) {
    return -1;
  }

  const weeks = getWeeksInYear(year);
  const todayTime = today.setHours(0, 0, 0, 0);

  for (const week of weeks) {
    const startTime = new Date(week.startDate).setHours(0, 0, 0, 0);
    const endTime = new Date(week.endDate).setHours(23, 59, 59, 999);

    if (todayTime >= startTime && todayTime <= endTime) {
      return week.weekNumber;
    }
  }

  return -1;
}
