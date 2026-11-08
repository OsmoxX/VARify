import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * OptionalJwtGuard — nie rzuca błędu, gdy brak/nieprawidłowy token.
 * Ustawia req.user, gdy token jest poprawny; w przeciwnym razie req.user = null.
 */
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // brak tokenu → gość
    }
    return true;
  }

  handleRequest<TUser>(_err: unknown, user: TUser): TUser | null {
    return user ?? null;
  }
}
