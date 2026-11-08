import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation } from '../entities/entities.service.js';

// Porównanie z fikcyjnym hashem wyrównuje czas odpowiedzi (brak enumeracji kont po czasie).
const DUMMY_HASH = bcrypt.hashSync('varify-dummy-password', 12);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
    if (!user || !user.password || !valid) throw new UnauthorizedException('Invalid email or password');
    return user;
  }

  login(user: { id: number; email: string; username: string }) {
    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email, username: user.username }),
      user: { id: user.id, email: user.email, username: user.username },
    };
  }

  async register(email: string, username: string, password: string) {
    const hashed = await bcrypt.hash(password, 12);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: email.trim().toLowerCase(),
          username: username.trim(),
          password: hashed,
          profile: { create: { tier: 'FREE' } },
        },
      });
      return this.login(user);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Email or username is already taken');
      throw err;
    }
  }
}
