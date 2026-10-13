import { useRouter } from 'expo-router';
import { formatPace, paceFromKmh } from '@stride/engine';
import { useQuery } from '../../data';
import { dateLong } from '../../copy';
import { Banner, Button, Card, EffortChip, ErrorState, H1, LoadingCards, PaceZoneTable, Screen, SectionTitle, Stack, T } from '../../ui';

// S04. What we estimated and why, with the honest caveat.
export default function Level() {
  const router = useRouter();
  const q = useQuery((api) => api.level());

  if (q.error) {
    return (
      <Screen>
        <ErrorState message={q.error.message} onRetry={q.reload} />
      </Screen>
    );
  }
  if (q.data === undefined) {
    return (
      <Screen>
        <LoadingCards n={2} />
      </Screen>
    );
  }
  const level = q.data;
  if (!level) {
    return (
      <Screen>
        <ErrorState message="On n’a pas encore tes réponses. Reprends le questionnaire." />
        <Button label="Reprendre le questionnaire" onPress={() => router.replace('/onboarding')} />
      </Screen>
    );
  }

  return (
    <Screen testID="S04" footer={<Button label="Choisir mon objectif" block size="lg" onPress={() => router.replace('/goal')} testID="to-goal" />}>
      <Stack gap={2}>
        <H1>Voici tes allures de départ</H1>
        <T color="text-muted">
          {level.source === 'race'
            ? 'Calculées à partir de ton temps de course.'
            : 'Estimées à partir de tes réponses. Elles s’affineront dès tes premières séances.'}
        </T>
      </Stack>
      <Card>
        <Stack row gap={2}>
          <SectionTitle>Vitesse maximale aérobie</SectionTitle>
          <EffortChip effort={level.source === 'race' ? 1 : 0} label={level.source === 'race' ? `Course du ${dateLong(level.measuredOn)}` : 'Estimation'} />
        </Stack>
        <T v="display" num>
          {level.vmaKmh.toLocaleString('fr-FR')} km/h
        </T>
        <T v="sm" color="text-muted" num>
          soit {formatPace(paceFromKmh(level.vmaKmh))} /km sur des efforts de quelques minutes
        </T>
      </Card>
      <Stack gap={2}>
        <SectionTitle>Tes allures d’entraînement</SectionTitle>
        <PaceZoneTable zones={level.zones} />
      </Stack>
      {level.source === 'estimate' ? (
        <Banner kind="info" title="Tu préfères un chiffre mesuré ?">
          Après quelques semaines, un test de 1 500 m ou un chrono sur course mettra tes allures à jour.
        </Banner>
      ) : null}
    </Screen>
  );
}
