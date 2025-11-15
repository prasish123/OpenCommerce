/**
 * Photo Storage Service
 *
 * Handles secure storage of age verification photos for compliance.
 * Features:
 * - Encrypted photo storage
 * - Secure file naming (UUID-based)
 * - Automatic directory creation
 * - File size validation
 * - Mimetype validation
 * - Photo retention and cleanup
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import log from '../../utils/logger';

export interface PhotoStorageOptions {
  storageDir?: string;
  maxFileSize?: number; // in bytes
  allowedMimeTypes?: string[];
  encryptionEnabled?: boolean;
  retentionDays?: number;
}

export interface StoredPhoto {
  filePath: string;
  fileName: string;
  size: number;
  mimeType: string;
  encrypted: boolean;
}

export class PhotoStorageService {
  private storageDir: string;
  private maxFileSize: number;
  private allowedMimeTypes: string[];
  private encryptionEnabled: boolean;
  private retentionDays: number;
  private encryptionKey: Buffer;

  constructor(options: PhotoStorageOptions = {}) {
    this.storageDir = options.storageDir || path.join(process.cwd(), 'data', 'age-verification-photos');
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB default
    this.allowedMimeTypes = options.allowedMimeTypes || [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp'
    ];
    this.encryptionEnabled = options.encryptionEnabled !== false; // Default true
    this.retentionDays = options.retentionDays || 365; // 1 year default

    // Generate or load encryption key
    const keyFromEnv = process.env.PHOTO_ENCRYPTION_KEY;
    if (keyFromEnv) {
      this.encryptionKey = Buffer.from(keyFromEnv, 'hex');
    } else {
      // For development, generate a key (in production, use environment variable)
      this.encryptionKey = crypto.randomBytes(32);
      log.warn('Using generated encryption key. Set PHOTO_ENCRYPTION_KEY in production!');
    }
  }

  /**
   * Initialize storage directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.access(this.storageDir);
      log.info(`Photo storage directory exists: ${this.storageDir}`);
    } catch {
      await fs.mkdir(this.storageDir, { recursive: true });
      log.info(`Created photo storage directory: ${this.storageDir}`);
    }
  }

  /**
   * Store a photo securely
   */
  async storePhoto(
    fileBuffer: Buffer,
    mimeType: string,
    metadata?: {
      transactionId?: string;
      verifiedBy?: string;
    }
  ): Promise<StoredPhoto> {
    // Validate file size
    if (fileBuffer.length > this.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${this.maxFileSize} bytes`);
    }

    // Validate mime type
    if (!this.allowedMimeTypes.includes(mimeType)) {
      throw new Error(`Invalid file type. Allowed types: ${this.allowedMimeTypes.join(', ')}`);
    }

    // Generate unique filename
    const fileExtension = this.getExtensionFromMimeType(mimeType);
    const fileName = `${uuidv4()}.${fileExtension}`;
    const filePath = path.join(this.storageDir, fileName);

    // Encrypt if enabled
    let dataToStore = fileBuffer;
    let encrypted = false;

    if (this.encryptionEnabled) {
      dataToStore = this.encryptData(fileBuffer);
      encrypted = true;
    }

    // Store the file
    await fs.writeFile(filePath, dataToStore);

    log.info('Stored age verification photo', {
      fileName,
      size: fileBuffer.length,
      encrypted,
      transactionId: metadata?.transactionId,
      verifiedBy: metadata?.verifiedBy
    });

    return {
      filePath,
      fileName,
      size: fileBuffer.length,
      mimeType,
      encrypted
    };
  }

  /**
   * Retrieve a photo
   */
  async retrievePhoto(fileName: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const filePath = path.join(this.storageDir, fileName);

    try {
      let fileData = await fs.readFile(filePath);

      // Decrypt if encrypted
      if (this.encryptionEnabled) {
        fileData = this.decryptData(fileData);
      }

      // Determine mime type from extension
      const mimeType = this.getMimeTypeFromExtension(path.extname(fileName));

      return {
        buffer: fileData,
        mimeType
      };
    } catch (error) {
      log.error('Failed to retrieve photo', { fileName, error });
      throw new Error('Photo not found or failed to retrieve');
    }
  }

  /**
   * Delete a photo
   */
  async deletePhoto(fileName: string): Promise<void> {
    const filePath = path.join(this.storageDir, fileName);

    try {
      await fs.unlink(filePath);
      log.info('Deleted age verification photo', { fileName });
    } catch (error) {
      log.error('Failed to delete photo', { fileName, error });
      throw new Error('Failed to delete photo');
    }
  }

  /**
   * Cleanup old photos based on retention policy
   */
  async cleanupOldPhotos(): Promise<number> {
    try {
      const files = await fs.readdir(this.storageDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.storageDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
          log.info('Cleaned up old photo', { file, age: stats.mtime });
        }
      }

      log.info(`Cleanup completed: ${deletedCount} photos deleted`);
      return deletedCount;
    } catch (error) {
      log.error('Failed to cleanup old photos', error);
      return 0;
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private encryptData(data: Buffer): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    // Return: [IV (16 bytes)][Auth Tag (16 bytes)][Encrypted Data]
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private decryptData(encryptedData: Buffer): Buffer {
    if (encryptedData.length < 32) {
      throw new Error('Invalid encrypted data');
    }

    const iv = encryptedData.subarray(0, 16);
    const authTag = encryptedData.subarray(16, 32);
    const encrypted = encryptedData.subarray(32);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
  }

  /**
   * Get file extension from mime type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp'
    };
    return map[mimeType] || 'bin';
  }

  /**
   * Get mime type from file extension
   */
  private getMimeTypeFromExtension(ext: string): string {
    const map: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
    };
    return map[ext.toLowerCase()] || 'application/octet-stream';
  }
}

// Singleton instance
let photoStorageService: PhotoStorageService;

export async function initPhotoStorageService(options?: PhotoStorageOptions): Promise<PhotoStorageService> {
  if (!photoStorageService) {
    photoStorageService = new PhotoStorageService(options);
    await photoStorageService.initialize();
  }
  return photoStorageService;
}

export function getPhotoStorageService(): PhotoStorageService {
  if (!photoStorageService) {
    throw new Error('PhotoStorageService not initialized. Call initPhotoStorageService first.');
  }
  return photoStorageService;
}
