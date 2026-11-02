import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface ObjectStorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
  presignedUrlTtlSeconds: number;
}

function getObjectStorageConfig(): ObjectStorageConfig {
  const endpoint = process.env.MINIO_ENDPOINT?.trim();
  const accessKeyId = process.env.MINIO_ACCESS_KEY?.trim();
  const secretAccessKey = process.env.MINIO_SECRET_KEY?.trim();
  const bucket = process.env.MINIO_BUCKET?.trim();

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Chưa cấu hình đầy đủ MinIO: MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET",
    );
  }

  const ttl = Number(process.env.MINIO_PRESIGNED_URL_TTL_SECONDS || "900");
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400) {
    throw new Error("MINIO_PRESIGNED_URL_TTL_SECONDS phải nằm trong khoảng 60-86400");
  }

  return {
    endpoint,
    region: process.env.MINIO_REGION?.trim() || "us-east-1",
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle: process.env.MINIO_FORCE_PATH_STYLE !== "false",
    presignedUrlTtlSeconds: ttl,
  };
}

let client: S3Client | null = null;
let config: ObjectStorageConfig | null = null;

function getClient(): { client: S3Client; config: ObjectStorageConfig } {
  if (!client || !config) {
    config = getObjectStorageConfig();
    client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return { client, config };
}

export async function ensureObjectStorageBucket(): Promise<void> {
  const { client, config } = getClient();
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
  } catch (error: unknown) {
    const statusCode =
      typeof error === "object" && error !== null && "$metadata" in error
        ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined;
    if (statusCode !== 404 && statusCode !== 400) throw error;

    await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
  }
}

export async function uploadObject(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string,
): Promise<void> {
  const { client, config } = getClient();
  if (!key.trim()) throw new Error("Object key không được để trống");
  if (!contentType.trim()) throw new Error("Content-Type không được để trống");

  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

export async function createObjectReadUrl(key: string): Promise<string> {
  const { client, config } = getClient();
  if (!key.trim()) throw new Error("Object key không được để trống");

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
    { expiresIn: config.presignedUrlTtlSeconds },
  );
}

export async function createObjectReadUrls(keys: unknown): Promise<string[]> {
  if (!Array.isArray(keys)) return [];
  const validKeys = keys.filter((key): key is string => typeof key === "string" && key.trim().length > 0);
  return Promise.all(validKeys.map((key) => createObjectReadUrl(key)));
}

export async function readObject(
  key: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const { client, config } = getClient();
  if (!key.trim()) throw new Error("Object key không được để trống");

  const response = await client.send(new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  }));
  if (!response.Body) throw new Error(`Không đọc được object ${key}`);

  const bytes = await response.Body.transformToByteArray();
  return {
    bytes,
    contentType: response.ContentType || "image/jpeg",
  };
}
