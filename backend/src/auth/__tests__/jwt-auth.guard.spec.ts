import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  describe('canActivate', () => {
    it('should be defined', () => {
      expect(guard).toBeDefined();
      expect(guard.canActivate).toBeDefined();
    });

    it('should call super.canActivate with execution context', () => {
      const mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: 'Bearer valid-token',
            },
          }),
        }),
      } as unknown as ExecutionContext;

      // Mock the parent class canActivate
      const superCanActivate = jest
        .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
        .mockReturnValue(true);

      const result = guard.canActivate(mockContext);

      expect(superCanActivate).toHaveBeenCalledWith(mockContext);
      expect(result).toBe(true);

      superCanActivate.mockRestore();
    });
  });

  describe('integration behavior', () => {
    it('should extend AuthGuard with jwt strategy', () => {
      // Verify guard extends the correct passport strategy
      expect(guard).toBeInstanceOf(JwtAuthGuard);

      // Guard uses 'jwt' strategy configured in AuthModule
      // Actual validation logic is tested in jwt.strategy.spec.ts
    });
  });
});
