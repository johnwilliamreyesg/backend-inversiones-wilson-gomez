// Converts between JS naming (camelCase) and database naming (snake_case).
// Used by src/config/database.js so repositories never handle snake_case keys.

const toSnakeCase = (value) => value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const toCamelCase = (value) => value.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

// Shallow on purpose: only column names are converted, never the contents
// of a value (e.g. a JSON column keeps its keys exactly as stored).
const keysToCamelCase = (row) =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamelCase(key), value]));

/**
 * Converts a Knex query result to camelCase keys.
 * Handles arrays of rows, a single row (`.first()`), raw results (`{ rows }`)
 * and scalars such as update/delete counts.
 */
const convertResultToCamelCase = (result) => {
  if (Array.isArray(result)) {
    return result.map((row) => (isPlainObject(row) ? keysToCamelCase(row) : row));
  }
  if (result && Array.isArray(result.rows)) {
    result.rows = convertResultToCamelCase(result.rows);
    return result;
  }
  return isPlainObject(result) ? keysToCamelCase(result) : result;
};

module.exports = { toSnakeCase, toCamelCase, convertResultToCamelCase };
