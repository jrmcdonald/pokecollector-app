/**
 * Every way a request can fail, as a class the UI can switch on.
 *
 * The split that matters most is AccessError vs AuthError. Cloudflare Access
 * rejects the service token before the request reaches PokeCollector, and says
 * so with a redirect or an HTML page rather than JSON; PokeCollector rejects
 * the password with a JSON 401. They are fixed in different places, so the
 * message has to say which.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Cloudflare Access turned the request away: the service token is missing, wrong or expired. */
export class AccessError extends ApiError {}

/** PokeCollector rejected the username or password, or the account is deactivated. */
export class AuthError extends ApiError {}

export class NotFoundError extends ApiError {}

export class ConflictError extends ApiError {}

/** FastAPI's 422: the request did not match the endpoint's schema. */
export class ValidationError extends ApiError {}

/**
 * The backend allows 60 requests a minute per client IP, and 5 logins. Every
 * client behind the tunnel shares one IP, so this is a real possibility.
 */
export class RateLimitError extends ApiError {
  constructor(
    message: string,
    /** Seconds to wait, from Retry-After, when the server sent one. */
    readonly retryAfter?: number,
  ) {
    super(message, 429);
  }
}

/** No response at all: offline, DNS, TLS, or the timeout fired. */
export class NetworkError extends ApiError {}

export class ServerError extends ApiError {}

/** A 2xx whose body did not have the shape the app relies on. */
export class ResponseShapeError extends ApiError {}
