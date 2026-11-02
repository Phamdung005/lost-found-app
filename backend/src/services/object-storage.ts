import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface ObjectStorageConfig {
  url: string;
  serviceRoleKey: string;
  bucket: string;
  signedUrlTtlSeconds: number;
}

function getObjectStorageConfig(): ObjectStorageConfig {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();

  if (!url || !serviceRoleKey || !bucket) {
    throw new Error(
      "Chưa cấu hình Supabase Storage: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET",
    );
  }

  const ttl = Number(process.env.SUPABASE_SIGNED_URL_TTL_SECONDS || "900");
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400) {
    throw new Error("SUPABASE_SIGNED_URL_TTL_SECONDS phải nằm trong khoảng 60-86400");
  }

  return { url, serviceRoleKey, bucket, signedUrlTtlSeconds: ttl };
}

let client: SupabaseClient | null = null;
let config: ObjectStorageConfig | null = null;

function getClient(): { client: SupabaseClient; config: ObjectStorageConfig } {
  if (!client || !config) {
    config = getObjectStorageConfig();
    client = createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return { client, config };
}

export async function ensureObjectStorageBucket(): Promise<void> {
  const { client, config } = getClient();
  const { data: buckets, error: listError } = await client.storage.listBuckets();
  if (listError) throw new Error(`Không thể kiểm tra Supabase Storage: ${listError.message}`);
  if (buckets.some((bucket) => bucket.name === config.bucket)) return;

  const { error } = await client.storage.createBucket(config.bucket, {
    public: false,
    fileSizeLimit: "5242880",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Không thể tạo bucket Supabase: ${error.message}`);
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

  const { error } = await client.storage.from(config.bucket).upload(key, body, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`Không thể upload ảnh lên Supabase: ${error.message}`);
}

export async function createObjectReadUrl(key: string): Promise<string> {
  const { client, config } = getClient();
  if (!key.trim()) throw new Error("Object key không được để trống");

  const { data, error } = await client.storage
    .from(config.bucket)
    .createSignedUrl(key, config.signedUrlTtlSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`Không thể tạo URL ảnh Supabase: ${error?.message || "URL rỗng"}`);
  }
  return data.signedUrl;
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

  const { data, error } = await client.storage.from(config.bucket).download(key);
  if (error || !data) {
    throw new Error(`Không thể đọc ảnh Supabase: ${error?.message || "dữ liệu rỗng"}`);
  }

  return {
    bytes: new Uint8Array(await data.arrayBuffer()),
    contentType: data.type || "image/jpeg",
  };
}
