import { User } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

/**
 * Generate a JWT token for testing authenticated endpoints
 */
export function generateTestJWT(user: User, secret?: string): string {
  const jwtSecret = secret || process.env.JWT_SECRET || 'test-secret';

  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
    },
    jwtSecret,
    { expiresIn: '1h' },
  );
}

/**
 * Create authorization header for HTTP requests
 */
export function createAuthHeader(token: string): { Authorization: string } {
  return {
    Authorization: `Bearer ${token}`,
  };
}
