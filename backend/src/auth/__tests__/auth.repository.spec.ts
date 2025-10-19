import { Prisma } from '@prisma/client';
import { AuthRepository } from '../auth.repository';
import { LoggerService } from '../../common/logging/logger.service';

describe('AuthRepository', () => {
  let repository: AuthRepository;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockTx: jest.Mocked<Prisma.TransactionClient>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    mockTx = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    } as any;

    repository = new AuthRepository(mockLogger);
  });

  describe('findByEmail', () => {
    it('should find user by email successfully', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        password: 'hashed-password',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTx.user.findUnique.mockResolvedValue(mockUser);

      const result = await repository.findByEmail(mockTx, 'test@example.com');

      expect(result).toEqual(mockUser);
      expect(mockTx.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Executing database operation',
        expect.objectContaining({
          repository: 'AuthRepository',
          operation: 'findUserByEmail',
          email: 'test@example.com',
        }),
      );
    });

    it('should return null when user not found', async () => {
      mockTx.user.findUnique.mockResolvedValue(null);

      const result = await repository.findByEmail(
        mockTx,
        'nonexistent@example.com',
      );

      expect(result).toBeNull();
      expect(mockTx.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'nonexistent@example.com' },
      });
    });

    it('should handle database errors via BaseRepository', async () => {
      const dbError = new Prisma.PrismaClientKnownRequestError(
        'Database error',
        {
          code: 'P2021',
          clientVersion: '5.0.0',
        },
      );

      mockTx.user.findUnique.mockRejectedValue(dbError);

      await expect(
        repository.findByEmail(mockTx, 'test@example.com'),
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should find user by id successfully', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        password: 'hashed-password',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTx.user.findUnique.mockResolvedValue(mockUser);

      const result = await repository.findById(mockTx, '123');

      expect(result).toEqual(mockUser);
      expect(mockTx.user.findUnique).toHaveBeenCalledWith({
        where: { id: '123' },
      });
    });

    it('should return null when user not found by id', async () => {
      mockTx.user.findUnique.mockResolvedValue(null);

      const result = await repository.findById(mockTx, 'nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create user successfully', async () => {
      const createData = {
        email: 'new@example.com',
        password: 'hashed-password',
        name: 'New User',
      };

      const mockCreatedUser = {
        id: '456',
        ...createData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTx.user.create.mockResolvedValue(mockCreatedUser);

      const result = await repository.create(mockTx, createData);

      expect(result).toEqual(mockCreatedUser);
      expect(mockTx.user.create).toHaveBeenCalledWith({
        data: createData,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Database mutation completed',
        expect.objectContaining({
          repository: 'AuthRepository',
          operation: 'createUser',
          email: 'new@example.com',
        }),
      );
    });

    it('should handle unique constraint violation (duplicate email)', async () => {
      const createData = {
        email: 'existing@example.com',
        password: 'hashed-password',
        name: 'User',
      };

      const uniqueConstraintError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
          meta: { target: ['email'] },
        },
      );

      mockTx.user.create.mockRejectedValue(uniqueConstraintError);

      await expect(repository.create(mockTx, createData)).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Database error',
        expect.objectContaining({
          code: 'P2002',
          email: 'existing@example.com',
        }),
      );
    });

    it('should create user without name (optional field)', async () => {
      const createData = {
        email: 'noname@example.com',
        password: 'hashed-password',
      };

      const mockCreatedUser = {
        id: '789',
        ...createData,
        name: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTx.user.create.mockResolvedValue(mockCreatedUser);

      const result = await repository.create(mockTx, createData);

      expect(result).toEqual(mockCreatedUser);
      expect(result.name).toBeNull();
    });
  });
});
