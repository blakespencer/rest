import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth.service';
import { AuthRepository } from '../auth.repository';
import { LoggerService } from '../../common/logging/logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';

// Mock bcrypt
jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockPrisma: jest.Mocked<PrismaService>;
  let mockAuthRepository: jest.Mocked<AuthRepository>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    mockPrisma = {
      $transaction: jest.fn(),
    } as any;

    mockAuthRepository = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    } as any;

    service = new AuthService(mockLogger, mockPrisma, mockAuthRepository);
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    };

    it('should register user successfully with hashed password', async () => {
      const hashedPassword = 'hashed-password-123';
      const mockUser = {
        id: '123',
        email: registerDto.email,
        password: hashedPassword,
        name: registerDto.name,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(null); // No existing user
        mockAuthRepository.create.mockResolvedValue(mockUser);
        return fn(mockTx);
      });

      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);

      const result = await service.register(registerDto);

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        createdAt: mockUser.createdAt,
      });

      // Verify password was hashed with correct salt rounds
      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 10);

      // Verify user was created with hashed password, NOT plaintext
      expect(mockAuthRepository.create).toHaveBeenCalledWith(
        expect.anything(),
        {
          email: registerDto.email,
          password: hashedPassword, // Hashed, NOT plaintext!
          name: registerDto.name,
        },
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'User registered successfully',
        expect.objectContaining({
          userId: mockUser.id,
          email: mockUser.email,
        }),
      );
    });

    it('should throw ConflictException when email already exists', async () => {
      const existingUser = {
        id: '456',
        email: registerDto.email,
        password: 'existing-hash',
        name: 'Existing User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(existingUser);
        return fn(mockTx);
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        'User with this email already exists',
      );

      // Should NOT call create if user exists
      expect(mockAuthRepository.create).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Registration failed: email already exists',
        expect.objectContaining({ email: registerDto.email }),
      );
    });

    it('should register user without name (optional field)', async () => {
      const dtoWithoutName: RegisterDto = {
        email: 'noname@example.com',
        password: 'password123',
      };

      const hashedPassword = 'hashed-password';
      const mockUser = {
        id: '789',
        email: dtoWithoutName.email,
        password: hashedPassword,
        name: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(null);
        mockAuthRepository.create.mockResolvedValue(mockUser);
        return fn(mockTx);
      });

      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);

      const result = await service.register(dtoWithoutName);

      expect(result.name).toBeNull();
      expect(mockAuthRepository.create).toHaveBeenCalledWith(
        expect.anything(),
        {
          email: dtoWithoutName.email,
          password: hashedPassword,
          name: undefined,
        },
      );
    });

    it('should NOT store plaintext password (critical security test)', async () => {
      const plaintextPassword = 'my-secret-password';
      const hashedPassword = 'bcrypt-hashed-version';

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(null);
        mockAuthRepository.create.mockResolvedValue({
          id: '1',
          email: 'test@example.com',
          password: hashedPassword,
          name: 'Test',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        return fn(mockTx);
      });

      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);

      await service.register({
        email: 'test@example.com',
        password: plaintextPassword,
      });

      // CRITICAL: Verify plaintext password is NEVER passed to create
      const createCall = mockAuthRepository.create.mock.calls[0];
      expect(createCall[1].password).not.toBe(plaintextPassword);
      expect(createCall[1].password).toBe(hashedPassword);
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should login successfully with correct credentials', async () => {
      const hashedPassword = 'hashed-password';
      const mockUser = {
        id: '123',
        email: loginDto.email,
        password: hashedPassword,
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(mockUser);
        return fn(mockTx);
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        createdAt: mockUser.createdAt,
      });

      expect(bcrypt.compare).toHaveBeenCalledWith(
        loginDto.password,
        hashedPassword,
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'User logged in successfully',
        expect.objectContaining({
          userId: mockUser.id,
          email: mockUser.email,
        }),
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(null);
        return fn(mockTx);
      });

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Login failed: user not found',
        expect.objectContaining({ email: loginDto.email }),
      );

      // Should NOT call bcrypt.compare if user doesn't exist
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when password is incorrect', async () => {
      const mockUser = {
        id: '123',
        email: loginDto.email,
        password: 'hashed-password',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(mockUser);
        return fn(mockTx);
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(false); // Wrong password

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Login failed: invalid password',
        expect.objectContaining({
          email: loginDto.email,
          userId: mockUser.id,
        }),
      );
    });

    it('should use same error message for nonexistent user and wrong password (security)', async () => {
      // Case 1: User doesn't exist
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(null);
        return fn(mockTx);
      });

      let error1: any;
      try {
        await service.login(loginDto);
      } catch (e) {
        error1 = e;
      }

      // Case 2: Wrong password
      const mockUser = {
        id: '123',
        email: loginDto.email,
        password: 'hashed-password',
        name: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(mockUser);
        return fn(mockTx);
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      let error2: any;
      try {
        await service.login(loginDto);
      } catch (e) {
        error2 = e;
      }

      // CRITICAL SECURITY: Both errors should have same message
      // This prevents attackers from discovering valid emails
      expect(error1.message).toBe(error2.message);
      expect(error1.message).toBe('Invalid credentials');
    });

    it('should correctly compare password with bcrypt', async () => {
      const mockUser = {
        id: '123',
        email: loginDto.email,
        password: 'stored-hash',
        name: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(mockUser);
        return fn(mockTx);
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login(loginDto);

      // Verify bcrypt.compare is called with correct arguments
      expect(bcrypt.compare).toHaveBeenCalledWith(
        loginDto.password,
        mockUser.password,
      );
    });

    it('should handle bcrypt.compare throwing an error', async () => {
      const mockUser = {
        id: '123',
        email: loginDto.email,
        password: 'stored-hash',
        name: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(mockUser);
        return fn(mockTx);
      });

      const bcryptError = new Error('bcrypt comparison failed');
      (bcrypt.compare as jest.Mock).mockRejectedValue(bcryptError);

      await expect(service.login(loginDto)).rejects.toThrow(bcryptError);

      // Transaction should rollback on bcrypt failure
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('edge cases and security hardening', () => {
    it('should handle bcrypt.hash throwing an error during registration', async () => {
      const registerDto: RegisterDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(null);
        return fn(mockTx);
      });

      const bcryptError = new Error('bcrypt hashing failed');
      (bcrypt.hash as jest.Mock).mockRejectedValue(bcryptError);

      await expect(service.register(registerDto)).rejects.toThrow(bcryptError);

      // Should NOT create user if hashing fails
      expect(mockAuthRepository.create).not.toHaveBeenCalled();

      // Transaction should rollback
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle transaction rollback on user creation failure', async () => {
      const registerDto: RegisterDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(null);
        mockAuthRepository.create.mockRejectedValue(
          new Error('Database connection lost'),
        );
        return fn(mockTx);
      });

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

      await expect(service.register(registerDto)).rejects.toThrow(
        'Database connection lost',
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle very long passwords (bcrypt limit edge case)', async () => {
      // bcrypt has a max input length of 72 bytes
      const longPassword = 'a'.repeat(100);
      const registerDto: RegisterDto = {
        email: 'test@example.com',
        password: longPassword,
      };

      const hashedPassword = 'hashed-long-password';
      const mockUser = {
        id: '123',
        email: registerDto.email,
        password: hashedPassword,
        name: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(null);
        mockAuthRepository.create.mockResolvedValue(mockUser);
        return fn(mockTx);
      });

      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);

      await service.register(registerDto);

      // Verify bcrypt.hash was called with the long password
      expect(bcrypt.hash).toHaveBeenCalledWith(longPassword, 10);
    });

    it('should handle empty string password from corrupted data', async () => {
      // Even though DTO validation should catch this, test defensive coding
      const registerDto = {
        email: 'test@example.com',
        password: '', // Empty password
      } as RegisterDto;

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        mockAuthRepository.findByEmail.mockResolvedValue(null);
        return fn(mockTx);
      });

      (bcrypt.hash as jest.Mock).mockResolvedValue('hash-of-empty-string');

      // Service should still try to hash (DTO validation is controller's job)
      const mockUser = {
        id: '123',
        email: registerDto.email,
        password: 'hash-of-empty-string',
        name: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAuthRepository.create.mockResolvedValue(mockUser);

      await service.register(registerDto);

      // Service layer doesn't validate password strength (that's DTO's job)
      expect(bcrypt.hash).toHaveBeenCalledWith('', 10);
    });

    it('should handle race condition - concurrent duplicate registrations', async () => {
      // Simulates two requests checking for user simultaneously
      const registerDto: RegisterDto = {
        email: 'concurrent@example.com',
        password: 'password123',
      };

      let callCount = 0;

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;

        // First call: user doesn't exist yet
        // Second call: user was just created by first request
        if (callCount === 0) {
          mockAuthRepository.findByEmail.mockResolvedValue(null);
          mockAuthRepository.create.mockResolvedValue({
            id: '123',
            email: registerDto.email,
            password: 'hashed',
            name: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          callCount++;
        } else {
          // Second concurrent request finds existing user
          mockAuthRepository.findByEmail.mockResolvedValue({
            id: '123',
            email: registerDto.email,
            password: 'hashed',
            name: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        return fn(mockTx);
      });

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

      // First request succeeds
      await service.register(registerDto);

      // Second concurrent request should fail with ConflictException
      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should handle NULL or undefined email gracefully', async () => {
      // Defensive coding test - even if DTO validation fails
      const badDto = {
        email: null,
        password: 'password123',
      } as any;

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {} as any;
        // Repository will throw on null email
        mockAuthRepository.findByEmail.mockRejectedValue(
          new Error('Invalid email'),
        );
        return fn(mockTx);
      });

      await expect(service.register(badDto)).rejects.toThrow();
    });
  });
});
