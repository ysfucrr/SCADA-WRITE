// CloudSettings model definition
// Note: This project uses native MongoDB driver rather than Mongoose

/**
 * Represents cloud bridge connection settings
 *
 * @typedef {Object} CloudSettings
 * @property {string} serverIp - Domain name of the cloud bridge server (e.g., bridge.example.com)
 * @property {number} httpPort - [DEPRECATED] HTTP port - kept for backward compatibility
 * @property {number} httpsPort - HTTPS port (fixed at 443)
 * @property {number} wsPort - [DEPRECATED] WebSocket port - kept for backward compatibility
 * @property {string} agentName - Name to identify this SCADA agent in the cloud bridge
 * @property {Date} createdAt - When the settings were created
 * @property {Date} updatedAt - When the settings were last updated
 *
 * Note: Cloud Bridge now only supports HTTPS connections on port 443
 */

// Export the collection name
export default 'cloud_settings';