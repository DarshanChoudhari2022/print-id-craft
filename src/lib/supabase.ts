import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

export const supabase = createClient(supabaseUrl, supabaseKey)

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
    // Exponential backoff
    if (attempt < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500))
    }
  }
  return { data: null, error: lastError }
}

export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}
