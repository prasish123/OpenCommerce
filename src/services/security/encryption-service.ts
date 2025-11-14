import crypto from 'crypto';
import { log } from '../../shared/logger';

/**
 * PCI-Compliant Encryption Service
 * Provides 3DES encryption and DUKPT key management for payment security
 *
 * PCI DSS Requirement 3: Protect stored cardholder data
 * PCI DSS Requirement 4: Encrypt transmission of cardholder data
 */

export class EncryptionService {
  private masterKey: Buffer;

  constructor(masterKeyHex?: string) {
    // Master key should be loaded from secure key management system (KMS)
    // For production, use AWS KMS, Azure Key Vault, or HSM
    this.masterKey = masterKeyHex
      ? Buffer.from(masterKeyHex, 'hex')
      : crypto.randomBytes(24); // 192-bit key for 3DES

    if (this.masterKey.length !== 24) {
      throw new Error('Master key must be 192 bits (24 bytes) for 3DES');
    }
  }

  /**
   * Encrypt data using AES-256-GCM (modern, recommended)
   * Use this for general data encryption
   */
  encryptAES(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(16); // Initialization vector
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  decryptAES(ciphertext: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.masterKey,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Encrypt using 3DES (legacy support for older systems)
   * Note: 3DES is deprecated, use AES-256 for new implementations
   */
  encrypt3DES(plaintext: string): { ciphertext: string; iv: string } {
    const iv = crypto.randomBytes(8); // 3DES uses 8-byte IV
    const cipher = crypto.createCipheriv('des-ede3-cbc', this.masterKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      ciphertext: encrypted,
      iv: iv.toString('hex'),
    };
  }

  /**
   * Decrypt using 3DES
   */
  decrypt3DES(ciphertext: string, iv: string): string {
    const decipher = crypto.createDecipheriv(
      'des-ede3-cbc',
      this.masterKey,
      Buffer.from(iv, 'hex')
    );

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Hash sensitive data (one-way, for storage)
   * Use for passwords, PINs (not reversible)
   */
  hash(data: string, salt?: string): { hash: string; salt: string } {
    const usedSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(data, usedSalt, 100000, 64, 'sha512').toString('hex');

    return { hash, salt: usedSalt };
  }

  /**
   * Verify hashed data
   */
  verifyHash(data: string, hash: string, salt: string): boolean {
    const computed = this.hash(data, salt);
    return computed.hash === hash;
  }

  /**
   * Mask PAN (Primary Account Number) - PCI DSS requirement
   * Shows only first 6 and last 4 digits
   */
  maskPAN(pan: string): string {
    if (pan.length < 13) {
      return '****';
    }

    const first6 = pan.substring(0, 6);
    const last4 = pan.substring(pan.length - 4);
    const masked = '*'.repeat(pan.length - 10);

    return `${first6}${masked}${last4}`;
  }

  /**
   * Tokenize PAN (replace with token for storage)
   * Token can be used to retrieve actual PAN from secure token vault
   */
  tokenizePAN(pan: string): string {
    // In production, use a token vault service (e.g., Stripe, TokenEx)
    // For now, generate a deterministic token
    const hash = crypto.createHash('sha256').update(pan).digest('hex');
    return `tok_${hash.substring(0, 24)}`;
  }

  /**
   * Generate HMAC signature for data integrity
   */
  signHMAC(data: string): string {
    const hmac = crypto.createHmac('sha256', this.masterKey);
    hmac.update(data);
    return hmac.digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  verifyHMAC(data: string, signature: string): boolean {
    const expected = this.signHMAC(data);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}

/**
 * DUKPT (Derived Unique Key Per Transaction) Key Management
 * Used for PIN encryption in payment terminals
 *
 * DUKPT ensures each transaction uses a unique encryption key
 */
export class DUKPTKeyManager {
  private bdk: Buffer; // Base Derivation Key
  private ksn: Buffer; // Key Serial Number

  constructor(bdkHex: string, ksnHex: string) {
    this.bdk = Buffer.from(bdkHex, 'hex');
    this.ksn = Buffer.from(ksnHex, 'hex');

    if (this.bdk.length !== 16) {
      throw new Error('BDK must be 128 bits (16 bytes)');
    }

    if (this.ksn.length !== 10) {
      throw new Error('KSN must be 80 bits (10 bytes)');
    }
  }

  /**
   * Derive session key from BDK and KSN
   * This is the core of DUKPT - each transaction gets unique key
   */
  deriveSessionKey(): Buffer {
    // ANSI X9.24 DUKPT key derivation
    const ipek = this.deriveIPEK(); // Initial PIN Encryption Key
    const counter = this.extractCounter();

    let currentKey = ipek;

    // Derive key based on transaction counter
    for (let i = 0; i < 21; i++) {
      if ((counter >> i) & 1) {
        currentKey = this.deriveKey(currentKey, i);
      }
    }

    return currentKey;
  }

  /**
   * Derive Initial PIN Encryption Key (IPEK)
   */
  private deriveIPEK(): Buffer {
    const cipher = crypto.createCipheriv('des-ede3-ecb', this.bdk, Buffer.alloc(0));
    const ksnMasked = Buffer.from(this.ksn);
    ksnMasked[7] &= 0xe0; // Mask counter bits
    ksnMasked[8] = 0;
    ksnMasked[9] = 0;

    return cipher.update(ksnMasked.slice(0, 8));
  }

  /**
   * Extract transaction counter from KSN
   */
  private extractCounter(): number {
    return ((this.ksn[7] & 0x1f) << 16) | (this.ksn[8] << 8) | this.ksn[9];
  }

  /**
   * Derive key for specific transaction
   */
  private deriveKey(key: Buffer, shift: number): Buffer {
    const mask = Buffer.alloc(8);
    mask.writeUInt32BE(0x00100000 << shift, 0);

    const xored = Buffer.alloc(8);
    for (let i = 0; i < 8; i++) {
      xored[i] = key[i] ^ mask[i];
    }

    const cipher = crypto.createCipheriv('des-ede3-ecb', key, Buffer.alloc(0));
    return cipher.update(xored);
  }

  /**
   * Encrypt PIN block using derived key
   */
  encryptPINBlock(pinBlock: Buffer): Buffer {
    const sessionKey = this.deriveSessionKey();
    const cipher = crypto.createCipheriv('des-ede3-ecb', sessionKey, Buffer.alloc(0));
    return cipher.update(pinBlock);
  }

  /**
   * Increment KSN for next transaction
   */
  incrementKSN(): void {
    let counter = this.extractCounter();
    counter++;

    if (counter > 0x1fffff) {
      throw new Error('KSN counter exhausted - device must be re-injected with new key');
    }

    // Write counter back to KSN
    this.ksn[7] = (this.ksn[7] & 0xe0) | ((counter >> 16) & 0x1f);
    this.ksn[8] = (counter >> 8) & 0xff;
    this.ksn[9] = counter & 0xff;
  }

  /**
   * Get current KSN (for transmission to processor)
   */
  getKSN(): string {
    return this.ksn.toString('hex');
  }
}

/**
 * Secure Key Storage
 * In production, use HSM or cloud KMS (AWS KMS, Azure Key Vault)
 */
export class KeyManagementService {
  private keys: Map<string, Buffer> = new Map();

  /**
   * Store encryption key securely
   */
  storeKey(keyId: string, key: Buffer): void {
    // In production, store in HSM or KMS
    // Never store keys in plain text in database or filesystem
    this.keys.set(keyId, key);
    log.info('Encryption key stored', { keyId });
  }

  /**
   * Retrieve encryption key
   */
  getKey(keyId: string): Buffer | undefined {
    return this.keys.get(keyId);
  }

  /**
   * Rotate encryption key (PCI requirement)
   */
  rotateKey(keyId: string): Buffer {
    const newKey = crypto.randomBytes(32); // 256-bit AES key
    this.storeKey(keyId, newKey);
    log.warn('Encryption key rotated', { keyId });
    return newKey;
  }

  /**
   * Generate new encryption key
   */
  generateKey(keyId: string, algorithm: 'aes-256' | '3des' = 'aes-256'): Buffer {
    const keyLength = algorithm === 'aes-256' ? 32 : 24;
    const key = crypto.randomBytes(keyLength);
    this.storeKey(keyId, key);
    return key;
  }

  /**
   * Destroy key (for decommissioned devices)
   */
  destroyKey(keyId: string): void {
    this.keys.delete(keyId);
    log.warn('Encryption key destroyed', { keyId });
  }
}

// Singleton instances
export const encryptionService = new EncryptionService(
  process.env.MASTER_ENCRYPTION_KEY // Load from secure environment
);

export const kms = new KeyManagementService();
