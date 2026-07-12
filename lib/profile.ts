import { supabase } from '@/lib/supabase';

const AVATARS_BUCKET = 'avatars';

/**
 * Uploads a locally-picked photo as the user's profile picture, overwriting
 * any previous one (fixed path per user), and updates profiles.avatar_url.
 * Returns the new (cache-busted) public URL.
 */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const extension = localUri.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userId}/avatar.${extension}`;

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, arrayBuffer, { contentType: response.headers.get('content-type') ?? 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  // Bust CDN/client caches — the path is stable across re-uploads, the URL wasn't.
  const avatarUrl = `${publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId);
  if (updateError) throw updateError;

  return avatarUrl;
}

export async function removeAvatar(userId: string, currentAvatarUrl: string | null): Promise<void> {
  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
  if (updateError) throw updateError;

  if (!currentAvatarUrl) return;
  const extension = currentAvatarUrl.split('?')[0].split('.').pop();
  await supabase.storage.from(AVATARS_BUCKET).remove([`${userId}/avatar.${extension}`]);
}
