import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useApi, useMutation, type User } from '../data';
import { Banner, Button, H1, Screen, Stack, T, TextField } from '../ui';
import { useTheme } from '../theme';

// S01. Email sign-in with a one-time code (no password), Apple and Google
// when the backend supports them, and a demo on the on-device backend.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Welcome() {
  const t = useTheme();
  const router = useRouter();
  const { api } = useApi();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [touched, setTouched] = useState(false);
  const request = useMutation((a, e: string) => a.requestSignIn(e));
  const verify = useMutation((a, e: string, c: string) => a.verifySignIn(e, c));
  const oauth = useMutation((a, p: 'apple' | 'google') => a.signInWithProvider(p));
  const invalid = touched && !EMAIL.test(email.trim());
  const caps = api.capabilities;

  const go = (u: User | null | undefined) => {
    if (u) router.replace(u.onboarded ? '/' : '/onboarding');
  };

  const submitEmail = async () => {
    setTouched(true);
    if (!EMAIL.test(email.trim())) return;
    const r = await request.run(email);
    if (!r) return;
    if (r.user) go(r.user);
    else if (r.codeSent) setStep('code');
  };

  const submitCode = async () => {
    if (!/^\d{6}$/.test(code.trim())) return;
    go(await verify.run(email, code));
  };

  const demo = async () => {
    const fake = api as unknown as { seedDemo?: () => Promise<void> };
    await fake.seedDemo?.();
    router.replace('/home');
  };

  const error = request.error ?? verify.error ?? oauth.error;

  if (step === 'code') {
    return (
      <Screen
        testID="S01-code"
        footer={
          <Stack gap={3}>
            <Button label="Valider" block size="lg" onPress={submitCode} loading={verify.pending} disabled={!/^\d{6}$/.test(code.trim())} testID="verify" />
            <Button label="Renvoyer le code" variant="ghost" block onPress={() => request.run(email)} loading={request.pending} />
          </Stack>
        }
      >
        <View style={{ height: t.sp(6) }} />
        <Stack gap={2}>
          <H1>Vérifie ta boîte mail</H1>
          <T color="text-muted">On a envoyé un code à 6 chiffres à {email.trim()}. Il est valable une heure.</T>
        </Stack>
        <TextField testID="code" label="Code" value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="off" placeholder="123456" />
        {error ? <Banner kind="error">{error.message}</Banner> : null}
        <Button label="Changer d’adresse" variant="ghost" onPress={() => setStep('email')} />
      </Screen>
    );
  }

  return (
    <Screen
      testID="S01"
      footer={
        <Stack gap={3}>
          <Button label="Continuer avec mon e-mail" icon={Mail} block size="lg" onPress={submitEmail} loading={request.pending} testID="signin" />
          {caps.oauth ? (
            <>
              <Button label="Continuer avec Apple" variant="secondary" block onPress={async () => go(await oauth.run('apple'))} loading={oauth.pending} />
              <Button label="Continuer avec Google" variant="secondary" block onPress={async () => go(await oauth.run('google'))} loading={oauth.pending} />
            </>
          ) : null}
          {caps.demo ? <Button label="Voir une démo" variant="ghost" block onPress={demo} /> : null}
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
        help={caps.emailCode ? 'On t’envoie un code. Pas de mot de passe à retenir.' : 'Pas de mot de passe à retenir.'}
      />
      {error ? <Banner kind="error">{error.message}</Banner> : null}
    </Screen>
  );
}
