import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Bike, Dumbbell, Footprints, Mountain, Waves } from 'lucide-react-native';
import { addDays } from '@stride/engine';
import { today, useMutation, type Activity } from '../../data';
import { dayLong, km } from '../../copy';
import { parseTime } from '../../parse';
import { Banner, Button, ChoiceGroup, H1, RPEScale, Screen, SectionTitle, Segmented, Stack, T, TextField } from '../../ui';

// S15. Log something done outside the plan, or a planned run without a watch.
// A run on a day with a planned session is matched to it automatically.
export default function NewActivity() {
  const router = useRouter();
  const now = today();
  const [sport, setSport] = useState<Activity['sport']>('run');
  const [day, setDay] = useState<string>(now);
  const [dur, setDur] = useState('');
  const [dist, setDist] = useState('');
  const [rpe, setRpe] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ matched: boolean } | null>(null);
  const save = useMutation((api, a: Omit<Activity, 'id'>) => api.logActivity(a));

  const submit = async () => {
    const e: Record<string, string> = {};
    const secs = parseTime(dur.includes(':') ? dur : dur ? `${dur}:00` : '');
    if (!secs) e.dur = 'Saisis une durée, par exemple 45:00 ou 1:10:00.';
    const meters = dist.trim() ? Math.round(Number(dist.replace(',', '.')) * 1000) : 0;
    if (dist.trim() && !(meters > 0 && meters < 400_000)) e.dist = 'Saisis une distance en km, par exemple 8,5.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const r = await save.run({ source: 'manual', sport, date: day, durationS: secs!, distanceM: meters, rpe: rpe ?? undefined, note: note.trim() || undefined });
    if (r) setDone({ matched: !!r.matchedSessionId });
  };

  if (done) {
    return (
      <Screen testID="S15-done" footer={<Button label="Terminé" block size="lg" onPress={() => router.back()} />}>
        <H1>Activité ajoutée</H1>
        <Banner kind="success">
          {done.matched ? 'On l’a rattachée à la séance prévue ce jour-là, qui est maintenant marquée comme faite.' : 'Elle apparaît dans ton journal.'}
        </Banner>
      </Screen>
    );
  }

  const recent = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(now, -i));
  return (
    <Screen testID="S15" footer={<Button label="Enregistrer" block size="lg" onPress={submit} loading={save.pending} testID="save-activity" />}>
      <H1>Ajouter une activité</H1>
      <Stack gap={2}>
        <SectionTitle>Sport</SectionTitle>
        <ChoiceGroup<Activity['sport']>
          label="Sport"
          value={sport}
          onChange={setSport}
          choices={[
            { value: 'run', title: 'Course à pied', icon: Footprints },
            { value: 'trail', title: 'Trail', icon: Mountain },
            { value: 'bike', title: 'Vélo', icon: Bike },
            { value: 'swim', title: 'Natation', icon: Waves },
            { value: 'strength', title: 'Renforcement', icon: Dumbbell },
          ]}
        />
      </Stack>
      <Stack gap={2}>
        <SectionTitle>Jour</SectionTitle>
        <Segmented
          label="Jour"
          value={day}
          onChange={setDay}
          options={recent.slice(0, 4).map((d, i) => ({ value: d, label: i === 0 ? 'Auj.' : i === 1 ? 'Hier' : dayLong(d).split(' ')[0].slice(0, 3) + '.', caption: dayLong(d).split(' ')[1] }))}
        />
      </Stack>
      <Stack row gap={3} style={{ alignItems: 'flex-start' }}>
        <Stack style={{ flex: 1 }}>
          <TextField label="Durée" value={dur} onChange={setDur} placeholder="45:00" keyboardType="numbers-and-punctuation" error={errors.dur} help="min:s ou h:min:s" testID="duration" />
        </Stack>
        <Stack style={{ flex: 1 }}>
          <TextField label="Distance (km)" value={dist} onChange={setDist} placeholder="8,5" keyboardType="decimal-pad" error={errors.dist} help={dist && !errors.dist ? km(Number(dist.replace(',', '.')) * 1000) : 'Facultatif'} />
        </Stack>
      </Stack>
      <Stack gap={2}>
        <SectionTitle>Ressenti (facultatif)</SectionTitle>
        <RPEScale value={rpe} onChange={setRpe} />
      </Stack>
      <TextField label="Note (facultatif)" value={note} onChange={setNote} multiline />
      {save.error ? <Banner kind="error">{save.error.message}</Banner> : null}
      <T v="xs" color="text-muted">
        Un ressenti saisi ici n’ajuste pas le plan. Pour ça, enregistre la séance prévue depuis son écran.
      </T>
    </Screen>
  );
}
