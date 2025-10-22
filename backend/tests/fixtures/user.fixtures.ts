import { User } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

/**
 * Create a test user with hashed password
 */
export async function createTestUser(
  prisma: PrismaService,
  overrides?: Partial<{
    email: string;
    name: string;
    password: string;
  }>,
): Promise<User> {
  const email = overrides?.email || 'test@example.com';
  const name = overrides?.name || 'Test User';
  const password = overrides?.password || 'Password123!';

  const hashedPassword = await bcrypt.hash(password, 10);

  return prisma.user.create({
    data: {
      email,
      name,
      password: hashedPassword,
    },
  });
}

/**
 * Create multiple test users
 */
export async function createTestUsers(
  prisma: PrismaService,
  count: number,
): Promise<User[]> {
  const users: User[] = [];

  for (let i = 0; i < count; i++) {
    const user = await createTestUser(prisma, {
      email: `user${i}@example.com`,
      name: `Test User ${i}`,
    });
    users.push(user);
  }

  return users;
}
