import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY is not configured');
    }

    // Convert hex string to buffer (32 bytes for AES-256)
    this.key = Buffer.from(encryptionKey, 'hex');

    if (this.key.length !== 32) {
      throw new Error(
        'ENCRYPTION_KEY must be 32 bytes (64 hex characters) for AES-256',
      );
    }
  }

  /**
   * Encrypts plaintext using AES-256-CBC
   * Returns: iv:encryptedData (both in hex format)
   */
  encrypt(plaintext: string): string {
    if (!plaintext) {
      throw new Error('Cannot encrypt empty string');
    }

    // Generate random IV (16 bytes for AES)
    const iv = crypto.randomBytes(16);

    // Create cipher
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    // Encrypt
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Return IV + encrypted data (separated by colon)
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts ciphertext using AES-256-CBC
   * Expects format: iv:encryptedData (both in hex format)
   */
  decrypt(ciphertext: string): string {
    if (!ciphertext) {
      throw new Error('Cannot decrypt empty string');
    }

    // Split IV and encrypted data
    const parts = ciphertext.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid ciphertext format (expected iv:data)');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encryptedData = parts[1];

    // Create decipher
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);

    // Decrypt
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
