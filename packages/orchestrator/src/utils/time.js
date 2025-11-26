/**
 * Gets the current time in ISO 8601 format.
 * @returns {String} The current time in ISO 8601 format.
 */
export function nowISO() {
    return new Date().toISOString();
}