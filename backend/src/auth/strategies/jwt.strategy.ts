import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthRepository } from '../auth.repository';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authRepository: AuthRepository,
    private readonly prisma: PrismaService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload) {
    // CRITICAL: Defensive type checking to prevent CVE-2025-30144 style attacks
    // Reject arrays, objects, numbers, null, undefined, or empty strings
    if (
      !payload ||
      typeof payload.sub !== 'string' ||
      payload.sub.trim() === ''
    ) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Verify user still exists in database
    const user = await this.prisma.$transaction(async (tx) => {
      return this.authRepository.findById(tx, payload.sub);
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    // Return user object for request.user (explicitly defined fields only)
    // This prevents field injection attacks
    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }
}
