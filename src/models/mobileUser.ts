// MobileUser model definition
// Note: This project uses native MongoDB driver rather than Mongoose

/**
 * Represents mobile application user
 *
 * @typedef {Object} MobileUser
 * @property {string} username - Unique username for mobile access
 * @property {string} password - Hashed password
 * @property {string} permissionLevel - Permission level (read, readwrite, admin)
 * @property {Date} lastLogin - Last login timestamp
 * @property {Date} createdAt - When the user was created
 * @property {Date} updatedAt - When the user was last updated
 */

// Export the collection name
export default 'mobile_users';