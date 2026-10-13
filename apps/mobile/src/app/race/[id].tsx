import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '../../data';
import { dateLong, km } from '../../copy';
import { Banner, Button, Card, ErrorState, H1, LoadingCards, Screen, SectionTitle, Stack, T } from '../../ui';

// S20. Race facts and "set as my goal". No map yet (MapView comes with the tracker).
export default function RaceDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery((api) => api.race(id), [id]);
  const plan = useQuery((api) => api.plan());

  if (q.error) {
    return (
      <Screen>
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
  const r = q.data;
  const isGoal = plan.data?.goal.name === r.name && plan.data?.goal.date === r.date;

  return (
    <Screen
      testID="S20"
      footer={
        isGoal ? undefined : (
          <Button label="En faire mon objectif" block size="lg" onPress={() => router.push({ pathname: '/goal', params: { raceId: r.id } })} testID="set-goal" />
        )
      }
    >
      <Stack gap={2}>
        <H1>{r.name}</H1>
        <T color="text-muted">
          {dateLong(r.date)} · {r.city}
        </T>
      </Stack>
      {isGoal ? <Banner kind="success">C’est ton objectif actuel.</Banner> : null}
      <Card>
        <SectionTitle>En bref</SectionTitle>
        <Stack row gap={6}>
          <Stack gap={1}>
            <T v="xl" num>
              {km(r.distanceM)}
            </T>
            <T v="xs" color="text-muted">
              distance
            </T>
          </Stack>
          <Stack gap={1}>
            <T v="xl" num>
              {r.elevationGainM.toLocaleString('fr-FR')} m
            </T>
            <T v="xs" color="text-muted">
              dénivelé +
            </T>
          </Stack>
          <Stack gap={1}>
            <T v="xl" num>
              {r.membersCount}
            </T>
            <T v="xs" color="text-muted">
              la préparent ici
            </T>
          </Stack>
        </Stack>
      </Card>
      {plan.data && !isGoal ? (
        <T v="sm" color="text-muted">
          Tu as déjà un plan en cours. Choisir cette course comme objectif remplacera ton plan actuel.
        </T>
      ) : null}
      <T v="xs" color="text-muted">
        Course de démonstration. Vérifie toujours la date et le parcours auprès de l’organisateur.
      </T>
    </Screen>
  );
}
