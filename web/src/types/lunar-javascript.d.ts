// Minimal ambient types for lunar-javascript (the package ships untyped JS).
// Only the surface used by src/lib/lunar.ts is declared.
declare module 'lunar-javascript' {
  export interface LunarDate {
    getYear(): number
    getMonth(): number
    getDay(): number
    getYearInChinese(): string
    getMonthInChinese(): string
    getDayInChinese(): string
    getSolar(): SolarDate
  }

  export interface SolarDate {
    getYear(): number
    getMonth(): number
    getDay(): number
    getLunar(): LunarDate
  }

  export const Lunar: {
    fromYmd(year: number, month: number, day: number): LunarDate
  }
  export const Solar: {
    fromYmd(year: number, month: number, day: number): SolarDate
  }
  export interface LunarMonthLike {
    getDayCount(): number
  }
  export const LunarYear: {
    fromYear(year: number): { getMonth(month: number): LunarMonthLike | null }
  }
  export const LunarUtil: {
    MONTH: string[]
    DAY: string[]
  }
}
