// CloudSettings model definition
// Note: This project uses native MongoDB driver rather than Mongoose

/**
 * Represents cloud bridge connection settings
 *
 * @typedef {Object} CloudSettings
 * @property {string} serverIp - IP address or hostname of the cloud bridge server
 * @property {number} httpPort - HTTP port for web requests (default: 4000)
 * @property {number} wsPort - WebSocket port for agent connections (default: 4001)
 * @property {Date} createdAt - When the settings were created
 * @property {Date} updatedAt - When the settings were last updated
 */

// Export the collection name
export default 'cloud_settings';