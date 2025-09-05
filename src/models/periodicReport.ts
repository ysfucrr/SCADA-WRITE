// PeriodicReport model definition
// Note: This project uses native MongoDB driver rather than Mongoose

/**
 * Represents a periodic report configuration
 *
 * @typedef {Object} PeriodicReport
 * @property {string} name - The name of the report
 * @property {string} description - Optional description of the report
 * @property {string} frequency - Frequency of the report (daily, weekly, monthly)
 * @property {Object} schedule - When to send the report
 * @property {number} [schedule.dayOfWeek] - Day of week (0-6, Sunday-Saturday) for weekly reports
 * @property {number} [schedule.dayOfMonth] - Day of month (1-31) for monthly reports
 * @property {number} schedule.hour - Hour of the day (0-23)
 * @property {number} schedule.minute - Minute of the hour (0-59)
 * @property {string} format - Report format (html or pdf)
 * @property {string[]} trendLogIds - Array of trend log IDs to include in the report
 * @property {string} timezone - Timezone for the report (default: Europe/Istanbul)
 * @property {Date} [lastSent] - When the report was last sent
 * @property {boolean} active - Whether the report is active
 * @property {Date} createdAt - When the report was created
 * @property {Date} updatedAt - When the report was last updated
 */

// Note: Recipients are now managed through centralized mail settings

// Export the collection name
export default 'periodicReports';