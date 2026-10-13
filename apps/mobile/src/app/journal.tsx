import { useRouter } from 'expo-router';
import { NotebookPen } from 'lucide-react-native';
import { useQuery } from '../data';
import { dayLong, duration, km, RPE_LABEL } from '../copy';
import { Button, Card, EmptyState, ErrorState, H1, LoadingCards, Screen, Stack, T } from '../ui';

// S17. Everything logged, newest first, with the runner's notes.
const SPORT = { run: 'Course', trail: 'Trail', walk: 'Marche', bike: 'Vélo', swim: 'Natation', strength: 'Renforcement', other: 'Autre' } as const;
const SOURCE = { tracker: 'Téléphone', manual: 'Saisie manuelle', strava: 'Strava', garmin: 'Garmin' } as const;

export default function Journal() {
  const router = useRouter();
  const q = useQuery((api) => api.activities());
  if (q.error) {
    return (
      <Screen>
        <ErrorState message={q.error.message} onRetry={q.reload} />
      </Screen>
    );
  }
  if (q.loading && !q.data) {
    return (
      <Screen>
        <LoadingCards />
      </Screen>
    );
  }
  const items = q.data ?? [];
  if (!items.length) {
    return (
      <Screen testID="S17-empty">
        <EmptyState icon={NotebookPen} title="Ton journal est vide" body="Tes séances et tes notes apparaîtront ici dès ta première sortie." cta={{ label: 'Ajouter une activité', onPress: () => router.push('/activity/new') }} />
      </Screen>
    );
  }
  return (
    <Screen testID="S17">
      <Stack row gap={2}>
        <Stack style={{ flex: 1 }}>
          <H1>Journal</H1>
        </Stack>
        <Button size="sm" variant="secondary" label="Ajouter" onPress={() => router.push('/activity/new')} />
      </Stack>
      <Stack gap={3}>
        {items.map((a) => (
          <Card key={a.id}>
            <Stack row gap={2}>
              <T weight="600">{SPORT[a.sport]}</T>
              <T v="sm" color="text-muted">
                {dayLong(a.date)}
              </T>
            </Stack>
            <T num>
              {duration(a.durationS)}
              {a.distanceM ? ` · ${km(a.distanceM)}` : ''}
              {a.rpe ? ` · ${RPE_LABEL[a.rpe]}` : ''}
            </T>
            {a.note ? <T color="text-muted">« {a.note} »</T> : null}
            <T v="xs" color="text-muted">
              {SOURCE[a.source]}
            </T>
          </Card>
        ))}
      </Stack>
    </Screen>
  );
}
