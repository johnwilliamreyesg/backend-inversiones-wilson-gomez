const bcrypt = require('bcryptjs');

const DEFAULT_SALT_ROUNDS = 12;

// Wraps bcrypt behind a tiny interface (hash / compare) so services depend on
// "something that hashes passwords", not on a specific library.
class PasswordHasher {
  constructor({ saltRounds = DEFAULT_SALT_ROUNDS } = {}) {
    this.saltRounds = saltRounds;
  }

  hash(plainPassword) {
    return bcrypt.hash(plainPassword, this.saltRounds);
  }

  compare(plainPassword, passwordHash) {
    return bcrypt.compare(plainPassword, passwordHash);
  }
}

module.exports = { PasswordHasher };
