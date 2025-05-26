export const timeRangeToMinutes = {
  'all': null,
  'early': { startMinutes: 0, endMinutes: 360 }, // Before 6 AM
  'morning': { startMinutes: 360, endMinutes: 720 }, // 6 AM to 12 PM
  'afternoon': { startMinutes: 720, endMinutes: 1080 }, // 12 PM to 6 PM
  'evening': { startMinutes: 1080, endMinutes: 1439 } // After 6 PM
};