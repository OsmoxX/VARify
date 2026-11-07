import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) throw new UnauthorizedException();
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException();
    return user;
  }

  async login(user: { id: number; email: string; username: string }) {
    const payload = { sub: user.id, email: user.email, username: user.username };
    return {
      accessToken: this.jwt.sign(payload),
      user: { id: user.id, email: user.email, username: user.username },
    };
  }

  async register(email: string, username: string, password: string) {
    const hashed = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        password: hashed,
        profile: { create: { tier: 'FREE' } },
      },
    });
    return this.login(user);
  }

  /** Obsługa OAuth (Google / GitHub) — upsert usera bez hasła */
  async findOrCreateOAuthUser(email: string, username: string) {
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          username,
          profile: { create: { tier: 'FREE' } },
        },
      });
    }
    return this.login(user);
  }
}
