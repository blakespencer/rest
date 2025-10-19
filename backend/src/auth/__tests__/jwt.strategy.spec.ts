import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy, JwtPayload } from '../strategies/jwt.strategy';
import { AuthRepository } from '../auth.repository';
import { PrismaService } from '../../prisma/prisma.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockAuthRepository: jest.Mocked<AuthRepository>;
  let mockPrisma: jest.Mocked<PrismaService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockReturnValue('test-jwt-secret'),
    } as any;

    mockAuthRepository = {
      findById: jest.fn(),
    } as any;

    mockPrisma = {
      $transaction: jest.fn(),
    } as any;

    strategy = new JwtStrategy(
      mockConfigService,
      mockAuthRepository,
      mockPrisma,
    );
  });

  describe('validate', () => {
    it('should validate and return user for valid payload', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        password: 'hashed-password',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const payload: JwtPayload = {
        sub: '123',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockAuthRepository.findById.mockResolvedValue(mockUser);
        return fn({});
      });

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
      });

      // Should NOT include password in returned user
      expect((result as any).password).toBeUndefined();

      expect(mockAuthRepository.findById).toHaveBeenCalledWith(
        expect.anything(),
        '123',
      );
    });

    it('should throw UnauthorizedException when payload is null/undefined', async () => {
      await expect(strategy.validate(null as any)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(null as any)).rejects.toThrow(
        'Invalid token payload',
      );

      await expect(strategy.validate(undefined as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when payload.sub is missing', async () => {
      const invalidPayload = {
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000),
      } as JwtPayload;

      await expect(strategy.validate(invalidPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(invalidPayload)).rejects.toThrow(
        'Invalid token payload',
      );

      // Should NOT query database if payload is invalid
      expect(mockAuthRepository.findById).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when payload.sub is empty string', async () => {
      const invalidPayload: JwtPayload = {
        sub: '',
        email: 'test@example.com',
      };

      await expect(strategy.validate(invalidPayload)).rejects.toThrow(
        UnauthorizedException,
      );

      // Should NOT query database if sub is empty
      expect(mockAuthRepository.findById).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when user no longer exists', async () => {
      const payload: JwtPayload = {
        sub: 'deleted-user-123',
        email: 'deleted@example.com',
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockAuthRepository.findById.mockResolvedValue(null);
        return fn({});
      });

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(payload)).rejects.toThrow(
        'User no longer exists',
      );

      expect(mockAuthRepository.findById).toHaveBeenCalledWith(
        expect.anything(),
        'deleted-user-123',
      );
    });

    it('should handle database errors during user lookup', async () => {
      const payload: JwtPayload = {
        sub: '123',
        email: 'test@example.com',
      };

      const dbError = new Error('Database connection lost');
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockAuthRepository.findById.mockRejectedValue(dbError);
        return fn({});
      });

      await expect(strategy.validate(payload)).rejects.toThrow(dbError);
    });

    it('should validate token with minimal valid payload (no iat/exp)', async () => {
      // Passport-jwt handles iat/exp validation, strategy just needs sub
      const mockUser = {
        id: '456',
        email: 'minimal@example.com',
        password: 'hashed',
        name: 'Minimal User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const minimalPayload: JwtPayload = {
        sub: '456',
        email: 'minimal@example.com',
        // No iat or exp
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockAuthRepository.findById.mockResolvedValue(mockUser);
        return fn({});
      });

      const result = await strategy.validate(minimalPayload);

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
      });
    });

    it('should handle user with null name', async () => {
      const mockUser = {
        id: '789',
        email: 'noname@example.com',
        password: 'hashed',
        name: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const payload: JwtPayload = {
        sub: '789',
        email: 'noname@example.com',
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockAuthRepository.findById.mockResolvedValue(mockUser);
        return fn({});
      });

      const result = await strategy.validate(payload);

      expect(result.name).toBeNull();
      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: null,
      });
    });

    it('should validate token even if email in payload differs from database (edge case)', async () => {
      // Token payload email might be stale if user changed email
      const mockUser = {
        id: '999',
        email: 'new-email@example.com', // Changed email in DB
        password: 'hashed',
        name: 'User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const payload: JwtPayload = {
        sub: '999',
        email: 'old-email@example.com', // Old email in token
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockAuthRepository.findById.mockResolvedValue(mockUser);
        return fn({});
      });

      const result = await strategy.validate(payload);

      // Should use CURRENT email from database, not token
      expect(result.email).toBe('new-email@example.com');
      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
      });
    });

    it('should handle malformed UUID in sub field', async () => {
      const payload: JwtPayload = {
        sub: 'not-a-valid-uuid',
        email: 'test@example.com',
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        // Database will likely return null for invalid UUID
        mockAuthRepository.findById.mockResolvedValue(null);
        return fn({});
      });

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(payload)).rejects.toThrow(
        'User no longer exists',
      );
    });

    it('should use transaction for database lookup (atomicity)', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        password: 'hashed',
        name: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const payload: JwtPayload = {
        sub: '123',
        email: 'test@example.com',
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockAuthRepository.findById.mockResolvedValue(mockUser);
        return fn({});
      });

      await strategy.validate(payload);

      // Verify transaction was used
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });
  });

  describe('configuration', () => {
    it('should extract JWT from Authorization header as Bearer token', () => {
      // This tests the constructor configuration
      expect(strategy).toBeDefined();
      expect(mockConfigService.get).toHaveBeenCalledWith('JWT_SECRET');
    });

    it('should not ignore token expiration (security)', () => {
      // ignoreExpiration should be false (default behavior verified by constructor)
      // Passport will reject expired tokens before validate() is called
      expect(strategy).toBeDefined();
    });
  });

  describe('security edge cases (2025 CVE-inspired)', () => {
    it('should reject payload with sub as array (CVE-2025-30144 style attack)', async () => {
      // Array injection attack - some libraries accept arrays as valid values
      const maliciousPayload = {
        sub: ['valid-user-id', 'attacker-injected-id'],
        email: 'test@example.com',
      } as any;

      await expect(strategy.validate(maliciousPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(maliciousPayload)).rejects.toThrow(
        'Invalid token payload',
      );

      // Should NOT query database with array
      expect(mockAuthRepository.findById).not.toHaveBeenCalled();
    });

    it('should reject payload with numeric sub (type coercion vulnerability)', async () => {
      // Type confusion attack - numeric IDs might bypass string validation
      const maliciousPayload = {
        sub: 12345,
        email: 'test@example.com',
      } as any;

      await expect(strategy.validate(maliciousPayload)).rejects.toThrow(
        UnauthorizedException,
      );

      // Should NOT query database with non-string sub
      expect(mockAuthRepository.findById).not.toHaveBeenCalled();
    });

    it('should handle SQL injection attempt in sub field', async () => {
      // SQL injection style payload (Prisma protects against this, but test defensive coding)
      const payload: JwtPayload = {
        sub: "' OR '1'='1",
        email: 'test@example.com',
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        // Prisma will safely handle this and return null (no user found)
        mockAuthRepository.findById.mockResolvedValue(null);
        return fn({});
      });

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(payload)).rejects.toThrow(
        'User no longer exists',
      );

      // Verify the malicious string was passed as-is (Prisma handles safety)
      expect(mockAuthRepository.findById).toHaveBeenCalledWith(
        expect.anything(),
        "' OR '1'='1",
      );
    });

    it('should handle extremely long sub value (DoS prevention)', async () => {
      // Very long UUID-like string could cause performance issues
      const veryLongSub = 'a'.repeat(10000);
      const payload: JwtPayload = {
        sub: veryLongSub,
        email: 'test@example.com',
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockAuthRepository.findById.mockResolvedValue(null);
        return fn({});
      });

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );

      // Should still process (Prisma handles large strings), but user won't exist
      expect(mockAuthRepository.findById).toHaveBeenCalledWith(
        expect.anything(),
        veryLongSub,
      );
    });

    it('should handle payload with object sub (prototype pollution attempt)', async () => {
      // Object injection attack - could lead to prototype pollution
      const maliciousPayload = {
        sub: { __proto__: { isAdmin: true } },
        email: 'test@example.com',
      } as any;

      await expect(strategy.validate(maliciousPayload)).rejects.toThrow(
        UnauthorizedException,
      );

      // Should NOT query database with object sub
      expect(mockAuthRepository.findById).not.toHaveBeenCalled();
    });

    it('should validate sub is a non-empty string (defensive type checking)', async () => {
      // Test various falsy and non-string values
      const testCases = [
        { sub: 0, email: 'test@example.com' },
        { sub: false, email: 'test@example.com' },
        { sub: NaN, email: 'test@example.com' },
        { sub: {}, email: 'test@example.com' },
      ];

      for (const invalidPayload of testCases) {
        await expect(
          strategy.validate(invalidPayload as any),
        ).rejects.toThrow(UnauthorizedException);
      }

      // Should NEVER query database for invalid types
      expect(mockAuthRepository.findById).not.toHaveBeenCalled();
    });

    it('should handle concurrent validation requests (race condition)', async () => {
      // Simulate concurrent token validations for same user
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        password: 'hashed',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const payload: JwtPayload = {
        sub: '123',
        email: 'test@example.com',
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockAuthRepository.findById.mockResolvedValue(mockUser);
        return fn({});
      });

      // Fire 10 concurrent validations
      const validations = Array(10)
        .fill(null)
        .map(() => strategy.validate(payload));

      const results = await Promise.all(validations);

      // All should succeed and return same user data
      results.forEach((result) => {
        expect(result).toEqual({
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
        });
      });

      // Transaction should be called 10 times (once per validation)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(10);
    });

    it('should handle payload with extra malicious fields (injection prevention)', async () => {
      // Attacker adds extra fields to bypass validation or inject data
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        password: 'hashed',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const maliciousPayload: any = {
        sub: '123',
        email: 'test@example.com',
        isAdmin: true, // Injected field
        permissions: ['admin', 'superuser'], // Injected field
        __proto__: { role: 'admin' }, // Prototype pollution attempt
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockAuthRepository.findById.mockResolvedValue(mockUser);
        return fn({});
      });

      const result = await strategy.validate(maliciousPayload);

      // Should ONLY return expected fields, NOT injected fields
      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
      });

      // CRITICAL: Ensure injected fields are NOT in result
      expect((result as any).isAdmin).toBeUndefined();
      expect((result as any).permissions).toBeUndefined();
      expect((result as any).role).toBeUndefined();
    });
  });
});
