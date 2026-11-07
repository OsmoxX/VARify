import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * OptionalJwtGuard — nie rzuca błędu gdy brak tokenu JWT.
 * Pozwala na dostęp publiczny, ale ustawia req.user jeśli token jest obecny.
 */
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleRequest(_err: any, user: any) {
    return user ?? null; // null = niezalogowany, nie rzucamy błędu
  }
}
