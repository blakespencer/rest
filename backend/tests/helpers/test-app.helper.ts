import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Create a test NestJS application instance
 * Used for integration and E2E tests
 */
export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  module: TestingModule;
}> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  // Apply same pipes as main.ts
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  const prisma = app.get<PrismaService>(PrismaService);

  return { app, prisma, module: moduleFixture };
}

/**
 * Clean up test application
 */
export async function cleanupTestApp(testContext: {
  app: INestApplication;
  prisma: PrismaService;
}): Promise<void> {
  // Clean database
  await cleanDatabase(testContext.prisma);

  // Close app
  await testContext.app.close();
}

/**
 * Clean all tables in database (for test isolation)
 * Deletes in reverse order of foreign key dependencies
 */
export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  // Delete in order: child tables first, then parent tables
  // Investment tables (Phase 5)
  await prisma.investmentPosition.deleteMany({});
  await prisma.investmentOrder.deleteMany({});
  await prisma.secclAccount.deleteMany({});
  await prisma.transaction.deleteMany({});

  // Bank connection tables (Phase 4)
  await prisma.bankAccount.deleteMany({});
  await prisma.bankConnection.deleteMany({});

  // User table (Phase 2)
  await prisma.user.deleteMany({});
}
