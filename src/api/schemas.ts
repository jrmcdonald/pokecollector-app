/**
 * Runtime checks for the fields the app reads.
 *
 * `generated.ts` is the full description of each endpoint, from upstream's
 * OpenAPI spec. Several endpoints return untyped dicts there (`/api/auth/me`
 * among them), and nothing stops upstream changing a field between releases,
 * so what the app actually depends on is checked here. Objects are loose on
 * purpose: new upstream fields must not break the app.
 */
import { z } from 'zod';

import type { components } from './generated';

export type Schemas = components['schemas'];

export const UserSchema = z.looseObject({
  id: z.number(),
  username: z.string(),
  role: z.string(),
  must_change_password: z.boolean().optional(),
});
export type User = z.infer<typeof UserSchema>;

export const TokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  user: UserSchema,
});

/** GET /api/auth/mode — answerable without a login, so it proves Access alone. */
export const AuthModeSchema = z.looseObject({
  multi_user: z.boolean(),
  locked: z.boolean().optional(),
});
export type AuthMode = z.infer<typeof AuthModeSchema>;
