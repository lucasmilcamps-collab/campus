import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useApi, useMutation } from '../data';
import { Banner, Button, H1, Screen, Stack, T, TextField } from '../ui';
import { useTheme } from '../theme';

// S01. Email sign-in on the fake layer; Apple and Google buttons arrive with
// Supabase Auth in /replica-backend (they need real provider config).
export default function Welcome() {
  const t = useTheme();
  const router = useRouter();
  const { api } = useApi();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const signIn = useMutation((a, e: string) => a.signIn(e));
  const invalid = touched && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async () => {
    setTouched(true);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
    const u = await signIn.run(email);
    if (u) router.replace(u.onboarded ? '/' : '/onboarding');
  };

  const demo = async () => {
    const fake = api as unknown as { seedDemo?: () => Promise<void> };
    await fake.seedDemo?.();
    router.replace('/home');
  };

  return (
    <Screen
      testID="S01"
      footer={
        <Stack gap={3}>
          <Button label="Continuer avec mon e-mail" icon={Mail} block size="lg" onPress={submit} loading={signIn.pending} testID="signin" />
          <Button label="Voir une démo" variant="ghost" block onPress={demo} />
        </Stack>
      }
    >
      <View style={{ height: t.sp(8) }} />
      <Stack gap={3}>
        <T v="xs" weight="600" color="accent">
          COACH DE COURSE À PIED
        </T>
        <H1>Un plan qui s’adapte à toi, semaine après semaine.</H1>
        <T color="text-muted">
          Dis-nous où tu en es et quelle course tu vises. On construit ton plan, tu cours, tu nous dis comment ça s’est passé, et on ajuste.
        </T>
      </Stack>
      <Stack gap={2}>
        {['Des allures calculées pour toi', 'Un plan qui bouge quand ta vie bouge', 'Tu sais toujours pourquoi une séance change'].map((line) => (
          <View key={line} style={{ flexDirection: 'row', gap: t.sp(2), alignItems: 'center' }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.c.accent }} />
            <T>{line}</T>
          </View>
        ))}
      </Stack>
      <TextField
        testID="email"
        label="Adresse e-mail"
        value={email}
        onChange={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        placeholder="toi@exemple.com"
        error={invalid ? 'Vérifie ton adresse e-mail.' : undefined}
        help="Pas de mot de passe à retenir."
      />
      {signIn.error ? <Banner kind="error">{signIn.error.message}</Banner> : null}
    </Screen>
  );
}
