import { createHash, timingSafeEqual } from "crypto";
import { createUser, findUserByEmail, type User } from "./users.js";

/**
 * Self-service account creation, gated by an invite code. The code comes
 * from SIGNUP_INVITE_CODE in the server's environment; when it's unset,
 * signup is closed entirely - the safe default, so deploying this never
 * opens registration by accident.
 */

export type SignupErrorCode =
  | "closed"
  | "inviteCode"
  | "email"
  | "nameTooLong"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordMismatch"
  | "exists";

/** Why a sign-up was refused: a code for the form's own wording, and its figure. */
export class SignupError extends Error {
  constructor(
    readonly code: SignupErrorCode,
    message: string,
    readonly n = 0
  ) {
    super(message);
  }
}

export const MIN_PASSWORD_LENGTH = 8;
// scrypt's cost grows with input size - no reason to hash a novel.
const MAX_PASSWORD_LENGTH = 256;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
// Deliberately loose: one @, something on both sides, a dot in the domain.
// The browser's type="email" does the friendlier check; this only stops
// garbage from being stored as an identity.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SignupInput {
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
  inviteCode: string;
}

export function configuredInviteCode(): string | null {
  return process.env.SIGNUP_INVITE_CODE?.trim() || null;
}

export function isSignupOpen(): boolean {
  return configuredInviteCode() !== null;
}

/** Constant-time comparison, so response timing can't be used to guess the code
 * character by character. Hashing first makes both sides the same length. */
function inviteCodeMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided.trim()).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Validates a signup form and creates the account. Throws SignupError with
 * a message fit to show the user. The invite code is checked before
 * anything else, so without it the form reveals nothing - in particular,
 * not which emails already have accounts.
 */
export function registerUser(input: SignupInput, expectedCode = configuredInviteCode()): User {
  if (!expectedCode) throw new SignupError("closed", "Sign-ups are closed.");
  if (!inviteCodeMatches(input.inviteCode, expectedCode)) {
    throw new SignupError("inviteCode", "Invalid invite code.");
  }

  const email = input.email.trim();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL.test(email)) {
    throw new SignupError("email", "Enter a valid email address.");
  }

  const name = input.name.trim();
  if (name.length > MAX_NAME_LENGTH) {
    throw new SignupError(
      "nameTooLong",
      `Name must be at most ${MAX_NAME_LENGTH} characters.`,
      MAX_NAME_LENGTH
    );
  }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new SignupError(
      "passwordTooShort",
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      MIN_PASSWORD_LENGTH
    );
  }
  if (input.password.length > MAX_PASSWORD_LENGTH) {
    throw new SignupError(
      "passwordTooLong",
      `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
      MAX_PASSWORD_LENGTH
    );
  }
  if (input.password !== input.confirmPassword) {
    throw new SignupError("passwordMismatch", "Passwords don't match.");
  }

  if (findUserByEmail(email)) {
    throw new SignupError("exists", "An account with this email already exists. Log in instead.");
  }

  return createUser(email, input.password, name || undefined);
}
