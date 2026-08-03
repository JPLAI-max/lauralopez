/**
 * Cloudflare R2 storage module.
 *
 * Degrades gracefully when env vars are absent — same pattern as mailer.ts.
 * Every exported function checks isConfigured() first; callers that need
 * to surface a user-facing 503 should do so themselves.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "./logger";

interface StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
}

function loadConfig(): StorageConfig | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL } =
    process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_BASE_URL) {
    return null;
  }
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
    publicBaseUrl: R2_PUBLIC_BASE_URL.replace(/\/$/, ""),
  };
}

let _client: S3Client | null = null;
let _config: StorageConfig | null | undefined = undefined; // undefined = not loaded yet

function getConfig(): StorageConfig | null {
  if (_config === undefined) {
    _config = loadConfig();
    if (!_config) {
      logger.info("storage not configured — R2 env vars missing; upload endpoints will return 503");
    }
  }
  return _config;
}

function getClient(): S3Client {
  if (!_client) {
    const cfg = getConfig()!;
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }
  return _client;
}

export function isConfigured(): boolean {
  return getConfig() !== null;
}

export function publicUrl(storageKey: string): string {
  const cfg = getConfig();
  if (!cfg) return storageKey; // raw key fallback; callers should gate on isConfigured
  return `${cfg.publicBaseUrl}/${storageKey}`;
}

/**
 * Returns a presigned PUT URL for direct client-side upload.
 * Expires in 10 minutes.
 */
export async function getPresignedPutUrl(
  storageKey: string,
  contentType: string,
  _sizeBytes: number,
): Promise<string> {
  const cfg = getConfig()!;
  const cmd = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: storageKey,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), cmd, { expiresIn: 600 });
}

/**
 * Fetches an object from R2 and returns its raw bytes.
 */
export async function getObjectBuffer(storageKey: string): Promise<Buffer> {
  const cfg = getConfig()!;
  const response = await getClient().send(
    new GetObjectCommand({ Bucket: cfg.bucket, Key: storageKey }),
  );
  if (!response.Body) throw new Error(`No body for object: ${storageKey}`);
  const bytes = await (response.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * Uploads a buffer to R2.
 */
export async function putObject(
  storageKey: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const cfg = getConfig()!;
  await getClient().send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: storageKey,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/**
 * Deletes an object from R2.
 */
export async function deleteObject(storageKey: string): Promise<void> {
  const cfg = getConfig()!;
  await getClient().send(
    new DeleteObjectCommand({ Bucket: cfg.bucket, Key: storageKey }),
  );
}
