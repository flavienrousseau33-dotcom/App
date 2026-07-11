import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/hooks/useAuth';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setError(null);

    if (username.trim().length < 3) {
      setError("Le nom d'utilisateur doit contenir au moins 3 caractères.");
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    setLoading(true);
    const { error } = await signUp(email.trim(), password, username.trim());
    setLoading(false);

    if (error) {
      setError(error);
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Vérifie ta boîte mail</Text>
        <Text style={styles.subtitle}>
          Un email de confirmation vient de t'être envoyé. Confirme ton compte puis reviens te connecter.
        </Text>
        <Link href="/(auth)/login" style={styles.link}>
          <Text style={styles.linkText}>Retour à la connexion</Text>
        </Link>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Créer un compte</Text>
      <Text style={styles.subtitle}>Découvre où tes chemins ont croisé ceux de tes amis</Text>

      <TextInput
        style={styles.input}
        placeholder="Nom d'utilisateur"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>S'inscrire</Text>}
      </Pressable>

      <Link href="/(auth)/login" style={styles.link}>
        <Text style={styles.linkText}>Déjà un compte ? Connecte-toi</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { opacity: 0.6, marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#2f95dc',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: '#e33', marginTop: -4 },
  link: { marginTop: 20, alignSelf: 'center' },
  linkText: { color: '#2f95dc' },
});
