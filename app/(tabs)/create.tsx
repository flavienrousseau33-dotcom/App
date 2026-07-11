import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

const MAX_LENGTH = 500;

export default function CreatePostScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [content, setContent] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function uploadImage(uri: string, userId: string) {
    const response = await fetch(uri);
    const blob = await response.arrayBuffer();
    const path = `${userId}/${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(path, blob, { contentType: 'image/jpeg' });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('post-images').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handlePost() {
    if (!user) return;
    if (!content.trim()) {
      setError('Écris quelque chose avant de publier.');
      return;
    }

    setError(null);
    setPosting(true);
    try {
      let imageUrl: string | null = null;
      if (imageUri) {
        imageUrl = await uploadImage(imageUri, user.id);
      }

      const { error: insertError } = await supabase.from('posts').insert({
        author_id: user.id,
        content: content.trim(),
        image_url: imageUrl,
      });

      if (insertError) throw insertError;

      setContent('');
      setImageUri(null);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Quoi de neuf ?"
        multiline
        maxLength={MAX_LENGTH}
        value={content}
        onChangeText={setContent}
      />
      <Text style={styles.counter}>
        {content.length}/{MAX_LENGTH}
      </Text>

      {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} contentFit="cover" /> : null}

      <Pressable style={styles.secondaryButton} onPress={pickImage}>
        <Text style={styles.secondaryButtonText}>{imageUri ? "Changer l'image" : 'Ajouter une image'}</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={handlePost} disabled={posting}>
        {posting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Publier</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  counter: { alignSelf: 'flex-end', opacity: 0.5, fontSize: 12 },
  preview: { width: '100%', height: 200, borderRadius: 10, backgroundColor: '#ddd' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#2f95dc',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#2f95dc', fontWeight: '600' },
  button: {
    backgroundColor: '#2f95dc',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#e33' },
});
