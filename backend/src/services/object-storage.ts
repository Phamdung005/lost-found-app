import {
  CreateBucketCommand,
  GetObjectCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface ObjectStorageConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  signedUrlTtlSeconds: number;
}

function getObjectStorageConfig(): ObjectStorageConfig {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3?.trim();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const region = process.env.AWS_REGION?.trim() || "us-east-2";
  const bucket = process.env.NEON_STORAGE_BUCKET?.trim();

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Chưa cấu hình Neon Object Storage: AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, NEON_STORAGE_BUCKET",
    );
  }

  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    throw new Error("AWS_ENDPOINT_URL_S3 phải là một URL hợp lệ");
  }
  if (endpointUrl.protocol !== "https:" && endpointUrl.protocol !== "http:") {
    throw new Error("AWS_ENDPOINT_URL_S3 phải dùng HTTP hoặc HTTPS");
  }

  const ttl = Number(process.env.NEON_SIGNED_URL_TTL_SECONDS || "900");
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400) {
    throw new Error("NEON_SIGNED_URL_TTL_SECONDS phải nằm trong khoảng 60-86400");
  }

  return {
    endpoint: endpointUrl.toString().replace(/\/$/, ""),
    accessKeyId,
    secretAccessKey,
    region,
    bucket,
    signedUrlTtlSeconds: ttl,
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
      forcePathStyle: true,
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
  const { Buckets } = await client.send(new ListBucketsCommand({}));
  if (Buckets?.some((bucket) => bucket.Name === config.bucket)) return;

  await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
}

export async function uploadObject(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string,
): Promise<void> {
  const { client, config } = getClient();
  if (!key.trim()) throw new Error("Object key không được để trống");
  if (!contentType.trim()) throw new Error("Content-Type không được để trống");

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function createObjectReadUrl(key: string): Promise<string> {
  const { client, config } = getClient();
  if (!key.trim()) throw new Error("Object key không được để trống");

  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: config.signedUrlTtlSeconds },
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

  const output = await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  if (!output.Body) throw new Error("Không thể đọc ảnh Neon Object Storage: dữ liệu rỗng");

  return {
    bytes: await output.Body.transformToByteArray(),
    contentType: output.ContentType || "image/jpeg",
  };
}
