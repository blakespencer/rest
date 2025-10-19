import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;
  let mockConfigService: jest.Mocked<ConfigService>;

  const VALID_KEY = 'a'.repeat(64); // 32 bytes in hex

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockReturnValue(VALID_KEY),
    } as any;

    service = new EncryptionService(mockConfigService);
  });

  describe('constructor', () => {
    it('should throw if ENCRYPTION_KEY is not configured', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(() => new EncryptionService(mockConfigService)).toThrow(
        'ENCRYPTION_KEY is not configured',
      );
    });

    it('should throw if ENCRYPTION_KEY is not 32 bytes (64 hex chars)', () => {
      mockConfigService.get.mockReturnValue('tooshort');

      expect(() => new EncryptionService(mockConfigService)).toThrow(
        'ENCRYPTION_KEY must be 32 bytes (64 hex characters) for AES-256',
      );
    });

    it('should accept valid 64-character hex key', () => {
      expect(() => new EncryptionService(mockConfigService)).not.toThrow();
    });
  });

  describe('encrypt', () => {
    it('should encrypt plaintext successfully', () => {
      const plaintext = 'sensitive-data';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(':'); // IV:ciphertext format
    });

    it('should throw on empty string', () => {
      expect(() => service.encrypt('')).toThrow('Cannot encrypt empty string');
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'same-data';

      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2); // Different IVs
    });

    it('should encrypt long strings', () => {
      const longText = 'x'.repeat(10000);
      const encrypted = service.encrypt(longText);

      expect(encrypted).toBeDefined();
      expect(encrypted.split(':').length).toBe(2);
    });

    it('should encrypt special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`\n\t\r';
      const encrypted = service.encrypt(specialChars);

      expect(encrypted).toBeDefined();
      expect(service.decrypt(encrypted)).toBe(specialChars);
    });

    it('should encrypt unicode characters', () => {
      const unicode = '你好世界 🚀 émoji';
      const encrypted = service.encrypt(unicode);

      expect(encrypted).toBeDefined();
      expect(service.decrypt(encrypted)).toBe(unicode);
    });
  });

  describe('decrypt', () => {
    it('should decrypt ciphertext successfully (round trip)', () => {
      const plaintext = 'secret-access-token';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw on empty string', () => {
      expect(() => service.decrypt('')).toThrow('Cannot decrypt empty string');
    });

    it('should throw on invalid format (missing colon)', () => {
      expect(() => service.decrypt('invalidformat')).toThrow(
        'Invalid ciphertext format (expected iv:data)',
      );
    });

    it('should throw on tampered IV', () => {
      const encrypted = service.encrypt('data');
      const [iv, data] = encrypted.split(':');

      // Tamper with IV (flip one character)
      const tamperedIv = iv.substring(0, iv.length - 1) + 'X';
      const tampered = `${tamperedIv}:${data}`;

      // Decryption should fail (wrong IV = wrong decryption)
      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should throw on tampered data', () => {
      const encrypted = service.encrypt('data');
      const [iv, data] = encrypted.split(':');

      // Tamper with encrypted data
      const tamperedData = data.substring(0, data.length - 1) + 'X';
      const tampered = `${iv}:${tamperedData}`;

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should fail to decrypt with wrong key', () => {
      const plaintext = 'secret';
      const encrypted = service.encrypt(plaintext);

      // Create new service with different key
      const wrongKeyConfig = {
        get: jest.fn().mockReturnValue('b'.repeat(64)),
      } as any;
      const wrongKeyService = new EncryptionService(wrongKeyConfig);

      // Decryption should fail with wrong key
      expect(() => wrongKeyService.decrypt(encrypted)).toThrow();
    });

    it('should handle multiple encrypt/decrypt cycles', () => {
      let data = 'original-data';

      // Encrypt/decrypt 10 times
      for (let i = 0; i < 10; i++) {
        const encrypted = service.encrypt(data);
        data = service.decrypt(encrypted);
      }

      expect(data).toBe('original-data');
    });
  });

  describe('security properties', () => {
    it('should use different IVs for each encryption', () => {
      const plaintext = 'test';
      const ivs = new Set<string>();

      // Encrypt same plaintext 100 times
      for (let i = 0; i < 100; i++) {
        const encrypted = service.encrypt(plaintext);
        const iv = encrypted.split(':')[0];
        ivs.add(iv);
      }

      // All IVs should be unique
      expect(ivs.size).toBe(100);
    });

    it('should produce ciphertext that looks random', () => {
      const plaintext = 'a'.repeat(100); // Repetitive plaintext

      const encrypted = service.encrypt(plaintext);
      const [, ciphertext] = encrypted.split(':');

      // Ciphertext should not contain repetitive patterns
      // (not a perfect test, but basic check)
      const hasRepetition = /(.{4})\1{3,}/.test(ciphertext);
      expect(hasRepetition).toBe(false);
    });
  });
});
