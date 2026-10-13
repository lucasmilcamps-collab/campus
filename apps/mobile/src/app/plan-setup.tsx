import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Goal } from '@stride/engine';
import { useMutation, useQuery } from '../data';
import { dateLong, km, raceTime } from '../copy';
import { Banner, Button, Card, ErrorState, H1, LoadingCards, Screen, SectionTitle, Segmented, Stack, T } from '../ui';

// S06. How many sessions a week, and what that changes. Creating a paid goal
// without the Training offer opens the paywall (S07), then comes back here.
export default function PlanSetup() {
  const router = useRouter();
  const { goal: raw } = useLocalSearchParams<{ goal?: string }>();
  const goal: Goal | null = raw ? JSON.parse(raw) : null;
  const [spw, setSpw] = useState<3 | 4 | 5>(4);
  const preview = useQuery((api) => (goal ? api.previewPlan(goal) : Promise.resolve(null)), [raw]);
  const create = useMutation((api, g: Goal, n: 3 | 4 | 5) => api.createPlan({ goal: g, sessionsPerWeek: n }));

  if (!goal) {
    return (
      <Screen>
        <ErrorState message="Aucun objectif choisi." />
        <Button label="Choisir un objectif" onPress={() => router.replace('/goal')} />
      </Screen>
    );
  }

  const submit = async () => {
    const r = await create.run(goal, spw);
    if (r) router.replace('/home');
  };
  const paywalled = create.error && 'code' in create.error && create.error.code === 'paywall';
  const opt = preview.data?.options.find((o) => o.sessionsPerWeek === spw);
  const blocked = (preview.data?.warnings.length ?? 0) > 0;

  return (
    <Screen
      testID="S06"
      footer={
        paywalled ? (
          <Button
            label="Découvrir l’offre Entraînement"
            block
            size="lg"
            onPress={() => {
              create.clearError();
              router.push({ pathname: '/paywall', params: { goal: raw, spw: String(spw) } });
            }}
          />
        ) : (
          <Button label="Créer mon plan" block size="lg" onPress={submit} loading={create.pending} disabled={blocked || preview.loading} testID="create-plan" />
        )
      }
    >
      <Stack gap={2}>
        <H1>Combien de séances par semaine ?</H1>
        <T color="text-muted">
          Objectif : {goal.name ?? km(goal.distanceM)} le {dateLong(goal.date)}.
        </T>
      </Stack>

      {preview.error ? <ErrorState message={preview.error.message} onRetry={preview.reload} /> : null}
      {preview.loading ? <LoadingCards n={2} /> : null}

      {preview.data ? (
        <>
          <Segmented<3 | 4 | 5>
            label="Séances par semaine"
            value={spw}
            onChange={setSpw}
            options={preview.data.options.map((o) => ({
              value: o.sessionsPerWeek,
              label: `${o.sessionsPerWeek} / sem.`,
              caption: `jusqu’à ${o.peakVolumeKm} km`,
            }))}
          />
          {opt ? (
            <Card>
              <SectionTitle>Avec {spw} séances par semaine</SectionTitle>
              <Stack row gap={6}>
                <Stack gap={1}>
                  <T v="xl" num>
                    {preview.data.weeks}
                  </T>
                  <T v="xs" color="text-muted">
                    semaines
                  </T>
                </Stack>
                <Stack gap={1}>
                  <T v="xl" num>
                    {opt.peakVolumeKm} km
                  </T>
                  <T v="xs" color="text-muted">
                    semaine la plus chargée
                  </T>
                </Stack>
                {goal.kind === 'race' ? (
                  <Stack gap={1}>
                    <T v="xl" num>
                      {raceTime(opt.predictedTimeS)}
                    </T>
                    <T v="xs" color="text-muted">
                      temps estimé
                    </T>
                  </Stack>
                ) : null}
              </Stack>
              <T v="sm" color="text-muted">
                {spw === 3
                  ? 'Le minimum pour progresser. Idéal si ton emploi du temps est chargé.'
                  : spw === 4
                    ? 'Le bon équilibre entre progression et récupération pour la plupart des coureurs.'
                    : 'Plus de volume, plus de progrès, à condition de bien récupérer.'}
              </T>
            </Card>
          ) : null}
          {goal.targetTimeS && opt && goal.kind === 'race' ? (
            <Banner kind={opt.predictedTimeS <= goal.targetTimeS ? 'success' : 'warning'} title={`Ton objectif : ${raceTime(goal.targetTimeS)}`}>
              {opt.predictedTimeS <= goal.targetTimeS
                ? 'Il est à ta portée avec ce plan.'
                : 'Il est ambitieux par rapport à ton niveau actuel. Le plan vise un temps réaliste et s’ajustera à tes progrès.'}
            </Banner>
          ) : null}
          {preview.data.warnings.map((w) => (
            <Banner key={w} kind="warning">
              {w}
            </Banner>
          ))}
          <T v="xs" color="text-muted">
            Le temps estimé est une indication calculée à partir de ton niveau actuel, pas une promesse.
          </T>
        </>
      ) : null}

      {create.error && !paywalled ? <Banner kind="error">{create.error.message}</Banner> : null}
      {paywalled ? (
        <Banner kind="info" title="Préparer une course fait partie de l’offre Entraînement">
          Essaie-la gratuitement pendant 14 jours. Les programmes Débuter et Reprise restent gratuits.
        </Banner>
      ) : null}
    </Screen>
  );
}
