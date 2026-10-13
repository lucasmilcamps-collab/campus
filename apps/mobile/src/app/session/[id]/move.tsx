import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDays, mondayOf } from '@stride/engine';
import { today, useMutation, useQuery } from '../../../data';
import { dayLong } from '../../../copy';
import { Banner, Button, ChoiceGroup, ErrorState, H1, LoadingCards, Screen, Stack, T } from '../../../ui';

// S16. Move a session within this week or the next. Warns on back-to-back hard
// days and double-booked days; the runner can still go ahead.
export default function MoveSession() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery((api) => api.session(id), [id]);
  const plan = useQuery((api) => api.plan());
  const [to, setTo] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const move = useMutation((api, d: string, force: boolean) => api.moveSession(id, d, force));
  const now = today();

  const days = useMemo(() => {
    if (!q.data || !plan.data) return [];
    const start = now > mondayOf(q.data.date) ? now : mondayOf(q.data.date);
    return Array.from({ length: 10 }, (_, i) => addDays(start, i)).filter((d) => d !== q.data!.date && d <= plan.data!.endDate && d >= now);
  }, [q.data, plan.data, now]);

  if (q.error || plan.error) {
    return (
      <Screen>
        <ErrorState message={(q.error ?? plan.error)!.message} onRetry={() => (q.reload(), plan.reload())} />
      </Screen>
    );
  }
  if (!q.data || !plan.data) {
    return (
      <Screen>
        <LoadingCards n={2} />
      </Screen>
    );
  }

  const submit = async (force: boolean) => {
    if (!to) return;
    const r = await move.run(to, force);
    if (!r) return;
    if (r.session) router.back();
    else setWarnings(r.warnings);
  };

  const taken = new Set(plan.data.sessions.filter((s) => s.id !== id).map((s) => s.date));

  return (
    <Screen
      testID="S16"
      footer={
        warnings.length ? (
          <Stack row gap={2}>
            <Button label="Choisir un autre jour" variant="secondary" onPress={() => setWarnings([])} />
            <Button label="Déplacer quand même" onPress={() => submit(true)} loading={move.pending} />
          </Stack>
        ) : (
          <Button label="Déplacer" block size="lg" disabled={!to} onPress={() => submit(false)} loading={move.pending} testID="confirm-move" />
        )
      }
    >
      <Stack gap={2}>
        <H1>Déplacer « {q.data.title} »</H1>
        <T color="text-muted">Prévue le {dayLong(q.data.date)}. Choisis un autre jour.</T>
      </Stack>
      {days.length === 0 ? <Banner kind="warning">Aucun autre jour disponible avant ta course.</Banner> : null}
      <ChoiceGroup
        label="Nouveau jour"
        value={to}
        onChange={(v) => {
          setTo(v);
          setWarnings([]);
        }}
        choices={days.map((d) => ({
          value: d,
          title: d === now ? `Aujourd’hui, ${dayLong(d)}` : dayLong(d),
          description: taken.has(d) ? 'Une séance est déjà prévue ce jour-là' : undefined,
        }))}
      />
      {warnings.map((w) => (
        <Banner key={w} kind="warning" title="Attention">
          {w}
        </Banner>
      ))}
      {move.error ? <Banner kind="error">{move.error.message}</Banner> : null}
    </Screen>
  );
}
