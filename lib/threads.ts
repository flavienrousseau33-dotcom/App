import { supabase } from '@/lib/supabase';
import type { ThreadComment, ThreadOverview, ThreadPhoto } from '@/types/database';

const PHOTOS_BUCKET = 'thread-photos';

/**
 * Opens the thread for a crossing between one of my stays and a friend's,
 * creating it on first view. Idempotent — safe to call every time someone
 * taps "Voir le thread".
 */
export async function getOrCreateThread(myStayId: string, friendStayId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_crossing_thread', {
    p_my_stay_id: myStayId,
    p_friend_stay_id: friendStayId,
  });
  if (error) throw error;
  return data;
}

export async function fetchThreadOverview(threadId: string): Promise<ThreadOverview> {
  const { data, error } = await supabase.rpc('get_thread_overview', { p_thread_id: threadId });
  if (error) throw error;
  return data;
}

export async function fetchThreadComments(threadId: string): Promise<ThreadComment[]> {
  const { data, error } = await supabase.rpc('get_thread_comments', { p_thread_id: threadId });
  if (error) throw error;
  return data ?? [];
}

export async function fetchThreadPhotos(threadId: string): Promise<ThreadPhoto[]> {
  const { data, error } = await supabase.rpc('get_thread_photos', { p_thread_id: threadId });
  if (error) throw error;
  return data ?? [];
}

export async function likeThread(threadId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('crossing_thread_likes').insert({ thread_id: threadId, user_id: userId });
  if (error) throw error;
}

export async function unlikeThread(threadId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('crossing_thread_likes')
    .delete()
    .eq('thread_id', threadId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function addThreadComment(threadId: string, userId: string, body: string): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;
  const { error } = await supabase
    .from('crossing_thread_comments')
    .insert({ thread_id: threadId, user_id: userId, body: trimmed });
  if (error) throw error;
}

/**
 * Uploads a locally-picked photo to the private thread-photos bucket and
 * records it. Storage RLS keys access off the `{thread_id}/...` path prefix
 * (see supabase/schema.sql), so the path must start with the thread id.
 */
export async function addThreadPhoto(threadId: string, userId: string, localUri: string): Promise<void> {
  const extension = localUri.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${threadId}/${userId}-${Date.now()}.${extension}`;

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(path, arrayBuffer, { contentType: response.headers.get('content-type') ?? 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase
    .from('crossing_thread_photos')
    .insert({ thread_id: threadId, user_id: userId, storage_path: path });
  if (insertError) throw insertError;
}

export async function getThreadPhotoUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}
