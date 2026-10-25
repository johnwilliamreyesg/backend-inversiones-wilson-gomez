const { z } = require('zod');

// Zod's default error messages reach the end user, so switch them to Spanish
// once for the whole app. Schemas can still override messages per field.
z.config(z.locales.es());

module.exports = { z };
