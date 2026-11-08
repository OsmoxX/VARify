import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { LoginDto, RegisterDto } from './dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  register(@Body() body: RegisterDto) {
    return this.auth.register(body.email, body.username, body.password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() body: LoginDto) {
    return this.auth.login(await this.auth.validateUser(body.email, body.password));
  }

  /** Aktualny użytkownik + plan (tier czytany z DB, nie z tokenu). */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser | null) {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user!.id },
      select: { id: true, email: true, username: true, profile: { select: { tier: true, subscriptionStatus: true } } },
    });
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      tier: row.profile?.tier ?? 'FREE',
      subscriptionStatus: row.profile?.subscriptionStatus ?? null,
    };
  }
}
