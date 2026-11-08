import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { parseGuestId } from '../utils/guest.js';

export interface AuthUser {
  id: number;
  email: string;
  username: string;
}

/** Zalogowany użytkownik (lub null przy OptionalJwtGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | null => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser | null }>();
    return req.user ?? null;
  },
);

/** UUID gościa z nagłówka X-Guest-Id (lub null). */
export const GuestId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    return parseGuestId(req.headers['x-guest-id']);
  },
);
