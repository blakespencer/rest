import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { BaseService } from '../common/base/base.service';
import { LoggerService } from '../common/logging/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRepository } from './auth.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserMapper } from './mappers/user.mapper';

@Injectable()
export class AuthService extends BaseService {
  protected readonly logger: LoggerService;
  protected readonly prisma: PrismaClient;

  private readonly SALT_ROUNDS = 10;

  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    private readonly authRepository: AuthRepository,
  ) {
    super();
    this.logger = logger;
    this.logger.setContext('AuthService');
    this.prisma = prisma;
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    return this.executeInTransaction(async (tx) => {
      // Check if user already exists
      const existingUser = await this.authRepository.findByEmail(tx, dto.email);

      if (existingUser) {
        this.logger.warn('Registration failed: email already exists', {
          email: dto.email,
        });
        throw new ConflictException('User with this email already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

      // Create user
      const user = await this.authRepository.create(tx, {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
      });

      this.logger.info('User registered successfully', {
        userId: user.id,
        email: user.email,
      });

      return UserMapper.toAuthResponseDto(user);
    });
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    return this.executeInTransaction(async (tx) => {
      // Find user by email
      const user = await this.authRepository.findByEmail(tx, dto.email);

      if (!user) {
        this.logger.warn('Login failed: user not found', { email: dto.email });
        throw new UnauthorizedException('Invalid credentials');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(dto.password, user.password);

      if (!isPasswordValid) {
        this.logger.warn('Login failed: invalid password', {
          email: dto.email,
          userId: user.id,
        });
        throw new UnauthorizedException('Invalid credentials');
      }

      this.logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
      });

      return UserMapper.toAuthResponseDto(user);
    });
  }
}
