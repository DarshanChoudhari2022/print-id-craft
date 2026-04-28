import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

// Use service role key on server-side for storage operations
// Falls back to anon key if service key not available
const serverKey = supabaseServiceKey || supabaseAnonKey

// Lazy-initialize clients via a Proxy so a missing/invalid env var does NOT
// throw at module load (which would make API routes return HTML 500s on Vercel).
// The error only surfaces when the client is actually used, where it can be
// caught by the route's try/catch and returned as JSON.
function makeLazyClient(url: string, key: string): SupabaseClient {
  let instance: SupabaseClient | null = null
  const get = (): SupabaseClient => {
    if (instance) return instance
    if (!url || !key) {
      throw new Error(
        "Supabase is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or key. " +
        "Set these env vars in your deployment (Vercel → Settings → Environment Variables)."
      )
    }
    instance = createClient(url, key)
    return instance
  }
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      const client = get() as any
      const value = client[prop]
      return typeof value === "function" ? value.bind(client) : value
    },
  })
}

export const supabase: SupabaseClient = makeLazyClient(supabaseUrl, serverKey)

// Client-side supabase for uploads from the browser
export const supabaseClient: SupabaseClient = makeLazyClient(supabaseUrl, supabaseAnonKey)

// Track if we've warned about missing service key
let warnedAboutServiceKey = false

/**
 * Ensure the storage bucket exists. Should be called once on app start
 * or before first storage operation. Requires service role key.
 */
export async function ensureStorageBucket(
  bucketName: string = "student-photos"
): Promise<boolean> {
  if (!supabaseServiceKey && !warnedAboutServiceKey) {
    warnedAboutServiceKey = true
    console.warn(
      "⚠️  SUPABASE_SERVICE_ROLE_KEY is not set. Storage operations may fail.\n" +
      "   Get it from: Supabase Dashboard → Settings → API → service_role key\n" +
      "   Add to .env: SUPABASE_SERVICE_ROLE_KEY=your_key_here"
    )
  }

  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()
    if (listError) {
      console.error("Failed to list buckets:", listError.message)
      return false
    }

    const exists = buckets?.some((b) => b.name === bucketName)
    if (!exists) {
      console.log(`Creating storage bucket: ${bucketName}`)
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024, // 10MB
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      })
      if (createError) {
        console.error(`Failed to create bucket ${bucketName}:`, createError.message)
        return false
      }
      console.log(`✅ Storage bucket "${bucketName}" created successfully`)
    }
    return true
  } catch (e: any) {
    console.error("Bucket check failed:", e?.message)
    return false
  }
}

// Retry wrapper for storage operations
export async function uploadWithRetry(
  bucket: string,
  path: string,
  file: Blob | Buffer | ArrayBuffer,
  options?: { contentType?: string; upsert?: boolean },
  maxRetries = 3
): Promise<{ data: any; error: any }> {
  let lastError: any = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { ...options, upsert: options?.upsert ?? true })
    if (!error) return { data, error: null }
    lastError = error

    // If bucket not found, try to create it
    if (
      error.message?.includes("Bucket not found") ||
      error.message?.includes("bucket")
    ) {
      await ensureStorageBucket(bucket)
    }

    // Exponential backoff
    if (attempt < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500))
    }
  }
  return { data: null, error: lastError }
}

// Generate a signed URL (1-hour expiry) for private bucket access
// Falls back to public URL if signed URL generation fails
export async function getSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn)
    if (!error && data?.signedUrl) {
      return data.signedUrl
    }
  } catch (e) {
    // Fallback to public URL
  }
  return getPublicUrl(bucket, path)
}

export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

// MIME type validation
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export function validateImageFile(file: { type: string; size: number }): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: `Invalid file type. Allowed: JPEG, PNG, WebP. Got: ${file.type}` }
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Maximum: 10MB. Got: ${(file.size / 1024 / 1024).toFixed(1)}MB` }
  }
  return { valid: true }
}
