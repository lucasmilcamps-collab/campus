import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Footprints, Medal, Sprout, TrendingUp } from 'lucide-react-native';
import { useMutation, type OnboardingInput } from '../../data';
import { parseTime } from '../../parse';
import { Banner, Button, ChoiceGroup, H1, NumberStepper, ProgressBar, Screen, Stack, T, TextField } from '../../ui';

// S02. One question per step. Answers feed the level estimate (S04).

type Recent = 'none' | '5k' | '10k' | 'half' | 'marathon';
const RECENT_M: Record<Exclude<Recent, 'none'>, number> = { '5k': 5000, '10k': 10000, half: 21097, marathon: 42195 };

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [age, setAge] = useState(32);
  const [sex, setSex] = useState<OnboardingInput['sex'] | null>(null);
  const [experience, setExperience] = useState<OnboardingInput['experience'] | null>(null);
  const [runs, setRuns] = useState(2);
  const [volume, setVolume] = useState(15);
  const [recent, setRecent] = useState<Recent | null>(null);
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | undefined>();
  const submit = useMutation((a, input: OnboardingInput) => a.onboarding(input));

  const steps = [
    {
      q: 'Comment t’appelles-tu ?',
      body: <TextField label="Prénom (facultatif)" value={firstName} onChange={setFirstName} autoComplete="name" testID="firstName" />,
      valid: () => true,
    },
    {
      q: 'Quel âge as-tu ?',
      body: <NumberStepper label="Âge" value={age} onChange={setAge} min={14} max={99} format={(v) => `${v} ans`} />,
      valid: () => true,
    },
    {
      q: 'Tu es…',
      sub: 'Ça affine l’estimation de tes allures. Tu peux ne pas répondre.',
      body: (
        <ChoiceGroup
          label="Sexe"
          value={sex}
          onChange={setSex}
          error={error}
          choices={[
            { value: 'female', title: 'Une femme' },
            { value: 'male', title: 'Un homme' },
            { value: 'other', title: 'Autre' },
            { value: 'undisclosed', title: 'Je préfère ne pas répondre' },
          ]}
        />
      ),
      valid: () => !!sex,
    },
    {
      q: 'Depuis quand cours-tu ?',
      body: (
        <ChoiceGroup
          label="Expérience"
          value={experience}
          onChange={setExperience}
          error={error}
          choices={[
            { value: 'none', title: 'Je commence', description: 'Peu ou pas de course jusqu’ici', icon: Sprout },
            { value: 'under_1y', title: 'Moins d’un an', icon: Footprints },
            { value: '1_3y', title: 'Entre 1 et 3 ans', icon: TrendingUp },
            { value: 'over_3y', title: 'Plus de 3 ans', icon: Medal },
          ]}
        />
      ),
      valid: () => !!experience,
    },
    {
      q: 'Combien de fois cours-tu par semaine en ce moment ?',
      body: <NumberStepper label="Sorties par semaine" value={runs} onChange={setRuns} min={0} max={7} format={(v) => `${v}`} />,
      valid: () => true,
    },
    {
      q: 'Combien de kilomètres par semaine, environ ?',
      sub: 'Une moyenne sur le dernier mois suffit.',
      body: <NumberStepper label="Kilomètres par semaine" value={volume} onChange={setVolume} min={0} max={150} step={5} format={(v) => `${v} km`} />,
      valid: () => true,
    },
    {
      q: 'As-tu un temps de course récent ?',
      sub: 'Une course ou un chrono de moins de 6 mois. Sinon, on estime ton niveau à partir de tes réponses.',
      body: (
        <Stack gap={4}>
          <ChoiceGroup
            label="Temps récent"
            value={recent}
            onChange={(v) => {
              setRecent(v);
              setError(undefined);
            }}
            error={recent === null ? error : undefined}
            choices={[
              { value: 'none', title: 'Non, estimez pour moi' },
              { value: '5k', title: '5 km' },
              { value: '10k', title: '10 km' },
              { value: 'half', title: 'Semi-marathon' },
              { value: 'marathon', title: 'Marathon' },
            ]}
          />
          {recent && recent !== 'none' ? (
            <TextField
              testID="time"
              label="Ton temps"
              value={time}
              onChange={setTime}
              placeholder={recent === 'half' || recent === 'marathon' ? '1:52:00' : '27:30'}
              keyboardType="numbers-and-punctuation"
              help="Format min:s ou h:min:s"
              error={recent !== null ? error : undefined}
            />
          ) : null}
        </Stack>
      ),
      valid: () => {
        if (!recent) return false;
        if (recent === 'none') return true;
        return parseTime(time) !== null;
      },
      message: () => (!recent ? 'Choisis une réponse.' : 'Saisis un temps au format 27:30 ou 1:52:00.'),
    },
  ];

  const current = steps[step];
  const last = step === steps.length - 1;

  const next = async () => {
    if (!current.valid()) {
      setError(current.message?.() ?? 'Choisis une réponse.');
      return;
    }
    setError(undefined);
    if (!last) {
      setStep(step + 1);
      return;
    }
    const secs = recent && recent !== 'none' ? parseTime(time) : null;
    const level = await submit.run({
      firstName: firstName.trim() || undefined,
      age,
      sex: sex!,
      experience: experience!,
      weeklyVolumeKm: volume,
      runsPerWeekNow: runs,
      recent: secs && recent && recent !== 'none' ? { distanceM: RECENT_M[recent], durationS: secs } : undefined,
    });
    if (level) router.replace('/onboarding/level');
  };

  return (
    <Screen
      testID="S02"
      footer={
        <Stack row gap={3}>
          {step > 0 ? (
            <Button
              label="Précédent"
              variant="secondary"
              onPress={() => {
                setError(undefined);
                setStep(step - 1);
              }}
            />
          ) : null}
          <Stack style={{ flex: 1 }}>
            <Button label={last ? 'Voir mon niveau' : 'Suivant'} block onPress={next} loading={submit.pending} testID="next" />
          </Stack>
        </Stack>
      }
    >
      <Stack gap={2}>
        <ProgressBar value={step + 1} max={steps.length} label={`Étape ${step + 1} sur ${steps.length}`} />
        <T v="xs" color="text-muted">
          Étape {step + 1} sur {steps.length}
        </T>
      </Stack>
      <Stack gap={2}>
        <H1>{current.q}</H1>
        {current.sub ? <T color="text-muted">{current.sub}</T> : null}
      </Stack>
      {current.body}
      {submit.error ? <Banner kind="error">{submit.error.message}</Banner> : null}
    </Screen>
  );
}
