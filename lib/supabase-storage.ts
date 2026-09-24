import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "cloudflare:workers";

type StorageEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_STORAGE_BUCKET?: string;
};

let cachedClient: SupabaseClient | undefined;

function storageConfig() {
  const e = env as unknown as StorageEnv;

  const url = e.SUPABASE_URL?.trim();
  const secret = e.SUPABASE_SECRET_KEY?.trim();
  const bucket = e.SUPABASE_STORAGE_BUCKET?.trim();

  if (!url || !secret || !bucket) {
    throw new Error("Supabase Storage is not configured.");
  }

  return { url, secret, bucket };
}

function storageClient() {
  const config = storageConfig();

  cachedClient ??= createClient(config.url, config.secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return {
    client: cachedClient,
    bucket: config.bucket,
  };
}

export function storagePath(businessId: string, imageId: string) {
  return `${businessId}/${imageId}`;
}

export async function putImage(
  path: string,
  bytes: Uint8Array,
  contentType: string,
) {
  const { client, bucket } = storageClient();

  const { error } = await client.storage.from(bucket).upload(path, bytes, {
    contentType,
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }
}

export async function deleteImage(path: string) {
  const { client, bucket } = storageClient();

  const { error } = await client.storage.from(bucket).remove([path]);

  if (error) {
    throw new Error(`Supabase delete failed: ${error.message}`);
  }
}

export async function getImage(path: string): Promise<Blob | null> {
  const { client, bucket } = storageClient();

  const { data, error } = await client.storage.from(bucket).download(path);

  if (error) {
    const status = Number(
      (error as unknown as { statusCode?: string | number }).statusCode,
    );

    if (
      status === 404 ||
      /not found|does not exist/i.test(error.message)
    ) {
      return null;
    }

    throw new Error(`Supabase download failed: ${error.message}`);
  }

  return data;
}
