import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { today, useApi, useMutation, useQuery, type AdjustmentRow } from '../../../data';
import { SESSION_LABEL } from '../../../copy';
import { Banner, Button, ChoiceGroup, ErrorState, H1, LoadingCards, RPEScale, Screen, SectionTitle, Stack, T, TextField } from '../../../ui';

// S13. Logs the session as done (no watch: by hand) and records how it felt.
// The adaptation result is shown right here, so the runner sees cause and effect.
export default function Feedback() {
  const router = useRouter();
  const { api } = useApi();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery((a) => a.session(id), [id]);
  const [rpe, setRpe] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [pain, setPain] = useState<'no' | 'yes'>('no');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<{ adjustment: AdjustmentRow | null } | null>(null);
  const send = useMutation(async (a, r: 1 | 2 | 3 | 4 | 5) => {
    const s = q.data!;
    // no tracker or watch yet: record the planned numbers as the activity
    if (s.status !== 'done') {
      await a.logActivity({ sessionId: s.id, source: 'manual', sport: 'run', date: s.date <= today() ? s.date : today(), durationS: s.estDurationS, distanceM: s.estDistanceM, rpe: r, note: note || undefined });
    }
    return a.submitFeedback({ sessionId: s.id, rpe: r, pain: pain === 'yes', note: note.trim() || undefined });
  });

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

  const backHome = () => {
    // pop back to the week if we came from it; opened from a link, go there directly
    if (router.canDismiss()) router.dismissAll();
    router.replace('/home');
  };

  if (result) {
    const a = result.adjustment;
    return (
      <Screen testID="S13-done" footer={<Button label="Retour à ma semaine" block size="lg" onPress={backHome} testID="back-home" />}>
        <H1>Séance enregistrée</H1>
        {a ? (
          <Banner kind="info" title="Ton plan s’adapte">
            {a.summary}
          </Banner>
        ) : (
          <Banner kind="success" title="Rien à changer">
            Ton ressenti colle au plan. On continue comme prévu.
          </Banner>
        )}
      </Screen>
    );
  }

  const submit = async () => {
    if (!rpe) {
      setError('Choisis un ressenti pour continuer.');
      return;
    }
    setError(undefined);
    const r = await send.run(rpe);
    if (r) setResult(r);
  };

  return (
    <Screen testID="S13" footer={<Button label="Enregistrer" block size="lg" onPress={submit} loading={send.pending} testID="save-feedback" />}>
      <Stack gap={2}>
        <H1>Comment ça s’est passé ?</H1>
        <T color="text-muted">
          {SESSION_LABEL[q.data.type]} · {q.data.title}
        </T>
      </Stack>
      <Stack gap={2}>
        <SectionTitle>Ressenti</SectionTitle>
        <RPEScale
          value={rpe}
          onChange={(v) => {
            setRpe(v);
            setError(undefined);
          }}
          error={error}
        />
        <T v="xs" color="text-muted">
          Sur une séance intense, « Extrême » ralentit un peu tes prochaines allures. « Très facile » ou « Facile » les accélère légèrement.
        </T>
      </Stack>
      <Stack gap={2}>
        <SectionTitle>Une douleur ?</SectionTitle>
        <ChoiceGroup<'no' | 'yes'>
          label="Douleur pendant ou après la séance"
          value={pain}
          onChange={setPain}
          choices={[
            { value: 'no', title: 'Non' },
            { value: 'yes', title: 'Oui, une douleur inhabituelle', description: 'On allège ta prochaine séance intense.' },
          ]}
        />
      </Stack>
      <TextField label="Note (facultatif)" value={note} onChange={setNote} multiline placeholder="Météo, sensations, parcours…" help="Tu la retrouveras dans ton journal." />
      {send.error ? <Banner kind="error">{send.error.message}</Banner> : null}
    </Screen>
  );
}
