import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import * as mammoth from 'mammoth';
import * as xlsx from 'xlsx';
import { db } from '../db/database.js';
import { SERVER_CONFIG } from '../config.js';

export interface FileRecord {
  id: string;
  userId: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  status: 'uploaded' | 'processing' | 'ready' | 'failed' | 'deleted';
  processingError?: string | null;
  extractedText?: string | null;
  metadataJson?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileMetadata {
  format: string;
  lineCount?: number;
  pageCount?: number;
  sheetNames?: string[];
  rowCount?: number;
  columnCount?: number;
  previewSnippet?: string;
  isVisionReady?: boolean;
  tablePreview?: Array<Record<string, any>>;
}

const UPLOADS_ROOT = path.join(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(UPLOADS_ROOT)) {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
}

export function getUserUploadDir(userId: string): string {
  // Sanitize userId to prevent directory traversal
  const cleanUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  const userDir = path.join(UPLOADS_ROOT, cleanUserId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  return userDir;
}

export function sanitizeFileName(name: string): string {
  const base = path.basename(name);
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req: any, file, cb) => {
    const userId = req.user?.userId;
    if (!userId) {
      return cb(new Error('Unauthorized: User session required for file uploads.'), '');
    }
    const userDir = getUserUploadDir(userId);
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const fileId = `file_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const cleanName = sanitizeFileName(file.originalname);
    cb(null, `${fileId}-${cleanName}`);
  }
});

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: SERVER_CONFIG.maxUploadSizeBytes,
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (!SERVER_CONFIG.allowedExtensions.includes(ext)) {
      return cb(new Error(`Unsupported file extension '.${ext}'. Allowed extensions: ${SERVER_CONFIG.allowedExtensions.join(', ')}`));
    }
    cb(null, true);
  }
});

export class FileService {
  /**
   * Create initial file record in the database
   */
  static createFileRecord(params: {
    userId: string;
    originalName: string;
    storagePath: string;
    mimeType: string;
    fileSize: number;
  }): FileRecord {
    const id = `doc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO files (
        id, userId, originalName, storagePath, mimeType, fileSize,
        status, processingError, extractedText, metadataJson, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, 'uploaded', NULL, NULL, NULL, ?, ?)
    `);

    stmt.run(
      id,
      params.userId,
      params.originalName,
      params.storagePath,
      params.mimeType,
      params.fileSize,
      now,
      now
    );

    return this.getFile(params.userId, id)!;
  }

  /**
   * Retrieve file verifying user ownership
   */
  static getFile(userId: string, fileId: string): FileRecord | null {
    const stmt = db.prepare(`
      SELECT * FROM files
      WHERE id = ? AND userId = ? AND status != 'deleted'
    `);
    const row = stmt.get(fileId, userId) as any;
    return row || null;
  }

  /**
   * List all files for user
   */
  static getUserFiles(userId: string): FileRecord[] {
    const stmt = db.prepare(`
      SELECT * FROM files
      WHERE userId = ? AND status != 'deleted'
      ORDER BY createdAt DESC
    `);
    return (stmt.all(userId) as any[]) || [];
  }

  /**
   * Delete file verifying ownership
   */
  static deleteFile(userId: string, fileId: string): boolean {
    const file = this.getFile(userId, fileId);
    if (!file) {
      throw new Error('File not found or permission denied.');
    }

    // Delete physical file from disk
    try {
      if (fs.existsSync(file.storagePath)) {
        fs.unlinkSync(file.storagePath);
      }
    } catch (err: any) {
      console.warn(`[Darkano FileService] Could not remove disk file at ${file.storagePath}:`, err?.message);
    }

    // Soft delete in database
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE files
      SET status = 'deleted', updatedAt = ?
      WHERE id = ? AND userId = ?
    `);
    stmt.run(now, fileId, userId);

    return true;
  }

  /**
   * Real file processor: extracts text, structure, sheets, pages, and metadata.
   */
  static async processFile(fileId: string): Promise<FileRecord> {
    const stmt = db.prepare(`SELECT * FROM files WHERE id = ?`);
    const file = stmt.get(fileId) as FileRecord | undefined;
    if (!file) {
      throw new Error(`File ${fileId} not found`);
    }

    // Update status to processing
    const now = new Date().toISOString();
    db.prepare(`UPDATE files SET status = 'processing', updatedAt = ? WHERE id = ?`).run(now, fileId);

    try {
      if (!fs.existsSync(file.storagePath)) {
        throw new Error('Stored file payload missing from disk.');
      }

      const ext = path.extname(file.originalName).toLowerCase().replace('.', '');
      let extractedText = '';
      const metadata: FileMetadata = {
        format: ext
      };

      const buffer = fs.readFileSync(file.storagePath);

      switch (ext) {
        case 'pdf': {
          const pdfData = await (pdfParse as any)(buffer);
          metadata.pageCount = pdfData.numpages || 1;
          extractedText = pdfData.text || '';
          metadata.previewSnippet = extractedText.slice(0, 3000);
          break;
        }

        case 'docx': {
          const docResult = await (mammoth as any).extractRawText({ buffer });
          extractedText = docResult.value || '';
          metadata.previewSnippet = extractedText.slice(0, 3000);
          metadata.lineCount = extractedText.split('\n').length;
          break;
        }

        case 'xlsx': {
          const workbook = xlsx.read(buffer, { type: 'buffer' });
          metadata.sheetNames = workbook.SheetNames;
          const sheetTexts: string[] = [];

          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
            const rowCount = jsonData.length;
            const colCount = jsonData[0]?.length || 0;

            if (!metadata.rowCount) metadata.rowCount = rowCount;
            if (!metadata.columnCount) metadata.columnCount = colCount;

            // Generate structured markdown table for first 25 rows
            const sampleRows = jsonData.slice(0, 25);
            const csvText = xlsx.utils.sheet_to_csv(sheet);
            sheetTexts.push(`--- Sheet: ${sheetName} (${rowCount} rows, ${colCount} cols) ---\n${csvText}`);

            if (!metadata.tablePreview && sampleRows.length > 0) {
              const headers = (sampleRows[0] || []).map((h, i) => String(h || `Col_${i + 1}`));
              const rows = sampleRows.slice(1).map(r => {
                const obj: Record<string, any> = {};
                headers.forEach((h, i) => {
                  obj[h] = r[i] !== undefined ? r[i] : '';
                });
                return obj;
              });
              metadata.tablePreview = rows.slice(0, 10);
            }
          }

          extractedText = sheetTexts.join('\n\n');
          metadata.previewSnippet = extractedText.slice(0, 3000);
          break;
        }

        case 'csv': {
          const workbook = xlsx.read(buffer, { type: 'buffer' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          extractedText = xlsx.utils.sheet_to_csv(firstSheet);
          const rawRows = xlsx.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
          metadata.rowCount = rawRows.length;
          metadata.columnCount = rawRows[0]?.length || 0;

          if (rawRows.length > 0) {
            const headers = (rawRows[0] || []).map((h, i) => String(h || `Col_${i + 1}`));
            const rows = rawRows.slice(1, 15).map(r => {
              const obj: Record<string, any> = {};
              headers.forEach((h, i) => {
                obj[h] = r[i] !== undefined ? r[i] : '';
              });
              return obj;
            });
            metadata.tablePreview = rows;
          }
          metadata.previewSnippet = extractedText.slice(0, 3000);
          break;
        }

        case 'json': {
          const rawStr = buffer.toString('utf-8');
          const parsed = JSON.parse(rawStr);
          extractedText = typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : rawStr;
          metadata.lineCount = extractedText.split('\n').length;
          metadata.previewSnippet = extractedText.slice(0, 3000);
          break;
        }

        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'webp':
        case 'gif': {
          metadata.isVisionReady = true;
          metadata.previewSnippet = `[Visual Media Asset: ${file.originalName} (${(file.fileSize / 1024).toFixed(1)} KB) ready for multimodal inspection]`;
          extractedText = `[Image File: ${file.originalName}, Size: ${file.fileSize} bytes, Format: ${ext}]`;
          break;
        }

        default: {
          // Plain text / source code files
          extractedText = buffer.toString('utf-8');
          metadata.lineCount = extractedText.split('\n').length;
          metadata.previewSnippet = extractedText.slice(0, 3000);
          break;
        }
      }

      // Update file with ready status and extracted metadata
      const updateStmt = db.prepare(`
        UPDATE files
        SET status = 'ready',
            extractedText = ?,
            metadataJson = ?,
            processingError = NULL,
            updatedAt = ?
        WHERE id = ?
      `);
      updateStmt.run(extractedText, JSON.stringify(metadata), new Date().toISOString(), fileId);

      return (db.prepare(`SELECT * FROM files WHERE id = ?`).get(fileId) as unknown as FileRecord)!;
    } catch (processError: any) {
      console.error(`[Darkano FileProcessor] Error processing file ${fileId}:`, processError?.message);
      const failStmt = db.prepare(`
        UPDATE files
        SET status = 'failed',
            processingError = ?,
            updatedAt = ?
        WHERE id = ?
      `);
      failStmt.run(processError?.message || 'File processing failed', new Date().toISOString(), fileId);

      return (db.prepare(`SELECT * FROM files WHERE id = ?`).get(fileId) as unknown as FileRecord)!;
    }
  }

  /**
   * Get user storage total
   */
  static getUserStorageUsage(userId: string): { totalBytes: number; fileCount: number } {
    const stmt = db.prepare(`
      SELECT SUM(fileSize) as totalBytes, COUNT(id) as fileCount
      FROM files
      WHERE userId = ? AND status != 'deleted'
    `);
    const row = stmt.get(userId) as any;
    return {
      totalBytes: row?.totalBytes || 0,
      fileCount: row?.fileCount || 0
    };
  }
}
