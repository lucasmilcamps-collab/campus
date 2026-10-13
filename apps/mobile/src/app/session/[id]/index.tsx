import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarClock, CheckCircle2, Play, SkipForward, Watch } from 'lucide-react-native';
import { today, useMutation, useQuery } from '../../../data';
import { dayLong, duration, km, RPE_LABEL } from '../../../copy';
import {
  Banner,
  Button,
  Card,
  ErrorState,
  H1,
  LoadingCards,
  Screen,
  SectionTitle,
  Stack,
  T,
  TypeChip,
  WorkoutStepList,
} from '../../../ui';

// S10. The structured workout, why it matters, and what to do with it.
export default function SessionDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery((api) => api.session(id), [id]);
  const fb = useQuery((api) => api.feedbackFor(id), [id]);
  const skip = useMutation((api) => api.skipSession(id));
  const [confirmSkip, setConfirmSkip] = useState(false);
  const now = today();

  if (q.error) {
    return (
      <Screen testID="S10-error">
        <ErrorState message={q.error.message} onRetry={q.reload} />
      </Screen>
    );
  }
  if (!q.data) {
    return (
      <Screen>
        <LoadingCards n={2} />
      </Screen>
    );
  }
  const s = q.data;
  const isFuture = s.date > now;
  const canLog = s.status === 'planned' && !isFuture;

  return (
    <Screen
      testID="S10"
      footer={
        s.status === 'planned' ? (
          <Stack gap={2}>
            {canLog ? (
              <Button label="J’ai fait cette séance" icon={CheckCircle2} block size="lg" onPress={() => router.push(`/session/${s.id}/feedback`)} testID="log-session" />
            ) : null}
            <Stack row gap={2}>
              <Button label="Courir avec le téléphone" icon={Play} variant="secondary" size="sm" onPress={() => router.push(`/session/${s.id}/run`)} />
              {s.type !== 'test' ? (
                <Button label="Envoyer sur la montre" icon={Watch} variant="secondary" size="sm" onPress={() => router.push(`/session/${s.id}/export`)} />
              ) : null}
            </Stack>
          </Stack>
        ) : undefined
      }
    >
      <Stack gap={2}>
        <Stack row gap={2}>
          <TypeChip type={s.type} />
          <T v="sm" color="text-muted">
            {dayLong(s.date)}
          </T>
        </Stack>
        <H1>{s.title}</H1>
        <T color="text-muted" num>
          {duration(s.estDurationS)} · {km(s.estDistanceM)}
        </T>
      </Stack>

      {s.status === 'done' ? (
        <Banner kind="success" title="Séance faite">
          {fb.data ? `Ressenti : ${RPE_LABEL[fb.data.rpe]}${fb.data.note ? ` · « ${fb.data.note} »` : ''}` : 'Bravo.'}
        </Banner>
      ) : null}
      {s.status === 'missed' ? (
        <Banner kind="warning" title="Séance manquée">
          Pas de souci : ton plan en tient compte. Si tu l’as faite, tu peux quand même l’enregistrer.
        </Banner>
      ) : null}
      {s.status === 'skipped' ? <Banner kind="info">Tu as choisi de passer cette séance.</Banner> : null}

      <Card>
        <SectionTitle>Pourquoi cette séance</SectionTitle>
        <T>{s.purpose}</T>
      </Card>

      <Stack gap={2}>
        <SectionTitle>Déroulé</SectionTitle>
        <WorkoutStepList steps={s.steps} />
        <T v="xs" color="text-muted">
          Les allures sont des repères : sur terrain vallonné ou par forte chaleur, cours à la sensation.
        </T>
      </Stack>

      {s.status === 'planned' && s.type !== 'race' ? (
        <Stack gap={2}>
          <SectionTitle>Ta semaine change ?</SectionTitle>
          <Stack row gap={2}>
            <Button label="Déplacer" icon={CalendarClock} variant="secondary" onPress={() => router.push(`/session/${s.id}/move`)} />
            {confirmSkip ? (
              <Button
                label="Confirmer : passer"
                variant="danger"
                loading={skip.pending}
                onPress={async () => {
                  await skip.run();
                  setConfirmSkip(false);
                }}
              />
            ) : (
              <Button label="Passer cette séance" icon={SkipForward} variant="ghost" onPress={() => setConfirmSkip(true)} />
            )}
          </Stack>
          {confirmSkip ? (
            <T v="sm" color="text-muted">
              Passer une séance de temps en temps ne compromet rien. On n’ajuste rien tant que ça reste ponctuel.
            </T>
          ) : null}
          {skip.error ? <Banner kind="error">{skip.error.message}</Banner> : null}
        </Stack>
      ) : null}
    </Screen>
  );
}
