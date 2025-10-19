import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { BaseRepository } from '../common/base/base.repository';
import { LoggerService } from '../common/logging/logger.service';

@Injectable()
export class AuthRepository extends BaseRepository {
  protected readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    super();
    this.logger = logger;
    this.logger.setContext('AuthRepository');
  }

  async findByEmail(
    tx: Prisma.TransactionClient,
    email: string,
  ): Promise<User | null> {
    return this.executeQuery(
      'findUserByEmail',
      () => tx.user.findUnique({ where: { email } }),
      { email },
    );
  }

  async findById(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<User | null> {
    return this.executeQuery(
      'findUserById',
      () => tx.user.findUnique({ where: { id } }),
      { userId: id },
    );
  }

  async create(
    tx: Prisma.TransactionClient,
    data: { email: string; password: string; name?: string },
  ): Promise<User> {
    return this.executeMutation(
      'createUser',
      () =>
        tx.user.create({
          data: {
            email: data.email,
            password: data.password,
            name: data.name,
          },
        }),
      { email: data.email },
    );
  }
}
