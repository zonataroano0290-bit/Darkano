import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../db/database.js';
import { MediaRecord } from '../types.js';

const MEDIA_ROOT = path.join(process.cwd(), 'data', 'media');
if (!fs.existsSync(MEDIA_ROOT)) {
  fs.mkdirSync(MEDIA_ROOT, { recursive: true });
}

export function getUserMediaDir(userId: string): string {
  const cleanUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  const dir = path.join(MEDIA_ROOT, cleanUserId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export interface ValidationResult {
  valid: boolean;
  detectedMime?: string;
  type?: 'image' | 'audio';
  width?: number;
  height?: number;
  error?: string;
}

export class MediaService {
  static readonly MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
  static readonly MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

  /**
   * Validate file buffer header (magic bytes) to ensure authenticity and prevent executable payload spoofing
   */
  static validateMediaBytes(buffer: Buffer, declaredMime?: string): ValidationResult {
    if (!buffer || buffer.length < 4) {
      return { valid: false, error: 'Empty or corrupt media payload.' };
    }

    // 1. Check PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      let width = 0;
      let height = 0;
      if (buffer.length >= 24) {
        width = buffer.readUInt32BE(16);
        height = buffer.readUInt32BE(20);
      }
      return { valid: true, detectedMime: 'image/png', type: 'image', width, height };
    }

    // 2. Check JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      // Basic size detection for JPEG
      let width = 0;
      let height = 0;
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] === 0xff && (buffer[offset + 1] === 0xc0 || buffer[offset + 1] === 0xc2)) {
          height = buffer.readUInt16BE(offset + 5);
          width = buffer.readUInt16BE(offset + 7);
          break;
        }
        offset++;
      }
      return { valid: true, detectedMime: 'image/jpeg', type: 'image', width, height };
    }

    // 3. Check GIF: 47 49 46 38 (GIF87a / GIF89a)
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      let width = 0;
      let height = 0;
      if (buffer.length >= 10) {
        width = buffer.readUInt16LE(6);
        height = buffer.readUInt16LE(8);
      }
      return { valid: true, detectedMime: 'image/gif', type: 'image', width, height };
    }

    // 4. Check WEBP: RIFF....WEBP
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer.length >= 12 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return { valid: true, detectedMime: 'image/webp', type: 'image' };
    }

    // 5. Check WAV Audio: RIFF....WAVE
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer.length >= 12 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x41 &&
      buffer[10] === 0x56 &&
      buffer[11] === 0x45
    ) {
      return { valid: true, detectedMime: 'audio/wav', type: 'audio' };
    }

    // 6. Check MP3: ID3 or 0xFF 0xFB / 0xFF 0xF3
    if (
      (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
      (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
    ) {
      return { valid: true, detectedMime: 'audio/mp3', type: 'audio' };
    }

    // 7. Check OGG: OggS
    if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
      return { valid: true, detectedMime: 'audio/ogg', type: 'audio' };
    }

    // 8. Check WEBM: 1A 45 DF A3 (EBML)
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      return { valid: true, detectedMime: 'audio/webm', type: 'audio' };
    }

    // 9. Check M4A / AAC: ftyp at index 4
    if (
      buffer.length >= 8 &&
      buffer[4] === 0x66 &&
      buffer[5] === 0x74 &&
      buffer[6] === 0x79 &&
      buffer[7] === 0x70
    ) {
      return { valid: true, detectedMime: 'audio/mp4', type: 'audio' };
    }

    // Fallback if declared MIME matches allowed audio or image types
    if (declaredMime) {
      if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(declaredMime)) {
        return { valid: true, detectedMime: declaredMime, type: 'image' };
      }
      if (['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/m4a', 'audio/aac'].includes(declaredMime)) {
        return { valid: true, detectedMime: declaredMime, type: 'audio' };
      }
    }

    return {
      valid: false,
      error: 'Unsupported or unverified media format. Supported formats: PNG, JPG/JPEG, WEBP, GIF, WAV, MP3, WEBM, OGG, M4A.'
    };
  }

  /**
   * Save uploaded or generated media to user's isolated storage vault and database
   */
  static saveMedia(params: {
    userId: string;
    conversationId?: string | null;
    messageId?: string | null;
    buffer: Buffer;
    declaredMime?: string;
    type?: 'image' | 'audio' | 'generated_image' | 'edited_image' | 'tts_audio';
    provider?: string;
    model?: string;
    prompt?: string;
    width?: number;
    height?: number;
    duration?: number;
    metadata?: Record<string, any>;
  }): MediaRecord {
    const { userId, buffer, declaredMime } = params;

    // Validate size
    const isAudio = params.type === 'audio' || params.type === 'tts_audio';
    const maxSize = isAudio ? this.MAX_AUDIO_SIZE_BYTES : this.MAX_IMAGE_SIZE_BYTES;
    if (buffer.length > maxSize) {
      throw new Error(`Media payload exceeds maximum allowed size of ${Math.round(maxSize / (1024 * 1024))} MB.`);
    }

    // Validate contents
    const validation = this.validateMediaBytes(buffer, declaredMime);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid media signature.');
    }

    const mimeType = validation.detectedMime || declaredMime || 'application/octet-stream';
    const mediaType = params.type || (validation.type === 'audio' ? 'audio' : 'image');

    // Generate isolated file path
    const userDir = getUserMediaDir(userId);
    const mediaId = `med_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    let ext = 'bin';
    if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('gif')) ext = 'gif';
    else if (mimeType.includes('wav')) ext = 'wav';
    else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) ext = 'mp3';
    else if (mimeType.includes('webm')) ext = 'webm';
    else if (mimeType.includes('ogg')) ext = 'ogg';

    const filename = `${mediaId}.${ext}`;
    const storagePath = path.join(userDir, filename);

    // Write file securely
    fs.writeFileSync(storagePath, buffer);

    const fileUrl = `/api/media/${mediaId}`;
    const now = new Date().toISOString();
    const width = params.width || validation.width || null;
    const height = params.height || validation.height || null;
    const duration = params.duration || null;
    const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null;

    db.prepare(`
      INSERT INTO media (
        id, userId, conversationId, messageId, type, mimeType,
        storagePath, fileUrl, provider, model, prompt,
        width, height, duration, status, error, metadataJson, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', NULL, ?, ?)
    `).run(
      mediaId,
      userId,
      params.conversationId || null,
      params.messageId || null,
      mediaType,
      mimeType,
      storagePath,
      fileUrl,
      params.provider || null,
      params.model || null,
      params.prompt || null,
      width,
      height,
      duration,
      metadataJson,
      now
    );

    return {
      id: mediaId,
      userId,
      conversationId: params.conversationId || null,
      messageId: params.messageId || null,
      type: mediaType,
      mimeType,
      storagePath,
      fileUrl,
      provider: params.provider || null,
      model: params.model || null,
      prompt: params.prompt || null,
      width,
      height,
      duration,
      status: 'ready',
      metadataJson,
      createdAt: now
    };
  }

  /**
   * Get media record by ID, enforcing user isolation
   */
  static getMedia(userId: string, mediaId: string): MediaRecord | null {
    const row = db.prepare(`
      SELECT * FROM media WHERE id = ? AND userId = ? AND status != 'deleted'
    `).get(mediaId, userId) as any;

    if (!row) return null;
    return row as MediaRecord;
  }

  /**
   * Get media buffer for streaming/downloading
   */
  static getMediaBuffer(userId: string, mediaId: string): { buffer: Buffer; mimeType: string; filename: string } | null {
    const record = this.getMedia(userId, mediaId);
    if (!record || !fs.existsSync(record.storagePath)) {
      return null;
    }
    const buffer = fs.readFileSync(record.storagePath);
    return {
      buffer,
      mimeType: record.mimeType,
      filename: path.basename(record.storagePath)
    };
  }

  /**
   * Get all media for a user, with optional conversation filter
   */
  static getUserMedia(
    userId: string,
    options: { conversationId?: string; type?: string; limit?: number; offset?: number } = {}
  ): { items: MediaRecord[]; total: number } {
    const limit = Math.min(Math.max(options.limit || 50, 1), 100);
    const offset = Math.max(options.offset || 0, 0);

    let query = `SELECT * FROM media WHERE userId = ? AND status != 'deleted'`;
    const params: any[] = [userId];

    if (options.conversationId) {
      query += ` AND conversationId = ?`;
      params.push(options.conversationId);
    }
    if (options.type) {
      query += ` AND type = ?`;
      params.push(options.type);
    }

    query += ` ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const items = db.prepare(query).all(...params) as unknown as MediaRecord[];

    let countQuery = `SELECT COUNT(*) as count FROM media WHERE userId = ? AND status != 'deleted'`;
    const countParams: any[] = [userId];
    if (options.conversationId) {
      countQuery += ` AND conversationId = ?`;
      countParams.push(options.conversationId);
    }
    if (options.type) {
      countQuery += ` AND type = ?`;
      countParams.push(options.type);
    }

    const totalRow = db.prepare(countQuery).get(...countParams) as { count: number };

    return { items, total: totalRow.count };
  }

  /**
   * Delete media, enforcing ownership and deleting local file
   */
  static deleteMedia(userId: string, mediaId: string): boolean {
    const record = this.getMedia(userId, mediaId);
    if (!record) {
      throw new Error('Media not found or access denied.');
    }

    // Remove file from disk
    try {
      if (fs.existsSync(record.storagePath)) {
        fs.unlinkSync(record.storagePath);
      }
    } catch (err: any) {
      console.warn(`[MediaService] Failed to delete disk file:`, err?.message);
    }

    // Mark as deleted in DB
    db.prepare(`UPDATE media SET status = 'deleted' WHERE id = ? AND userId = ?`).run(mediaId, userId);
    return true;
  }
}
