const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../errors/app-error');

const ALGORITHM = 'HS256';
const MIN_SECRET_LENGTH = 32;

// Issues and verifies JWTs. Services only see sign/verify, never the library.
class TokenProvider {
  constructor({ secret, expiresIn }) {
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET must be set and have at least ${MIN_SECRET_LENGTH} characters (see .env.example).`,
      );
    }
    this.secret = secret;
    this.expiresIn = expiresIn;
  }

  /** Payload stays minimal: who (sub) and which token generation (tokenVersion). */
  sign({ userId, tokenVersion }) {
    return jwt.sign({ tokenVersion }, this.secret, {
      algorithm: ALGORITHM,
      subject: String(userId),
      expiresIn: this.expiresIn,
    });
  }

  /** Returns { userId, tokenVersion } or throws UnauthorizedError. */
  verify(token) {
    try {
      // Pinning the algorithm blocks "alg: none" and algorithm-confusion attacks.
      const payload = jwt.verify(token, this.secret, { algorithms: [ALGORITHM] });
      return { userId: Number(payload.sub), tokenVersion: payload.tokenVersion };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('La sesión expiró. Inicie sesión de nuevo.');
      }
      throw new UnauthorizedError('La sesión no es válida. Inicie sesión de nuevo.');
    }
  }
}

module.exports = { TokenProvider };
