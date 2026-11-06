// Names the code relies on. Kept in one place so a rename is a one-line change.

// Permission that allows managing users and roles. The system must always
// keep at least one active user with it, or nobody could administer it again.
const USERS_MANAGE_PERMISSION = 'users.manage';

// Role created by the seed with every permission. It cannot be edited or
// deleted from the API (the seed would undo the change anyway).
const ADMIN_ROLE_NAME = 'admin';

// Permission that allows changing the catalog of interest rates.
const INTEREST_RATES_MANAGE_PERMISSION = 'interest_rates.manage';

module.exports = { USERS_MANAGE_PERMISSION, ADMIN_ROLE_NAME, INTEREST_RATES_MANAGE_PERMISSION };
