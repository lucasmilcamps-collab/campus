import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Gauge, HeartPulse, Mountain, Route, Search, Sprout } from 'lucide-react-native';
import { addDays, type GoalKind } from '@stride/engine';
import { FREE_GOALS, today, useQuery, type GoalWithRace } from '../data';
import { dateLong, km } from '../copy';
import { formatDateFR, parseDateFR, parseTime } from '../parse';
import { Banner, Button, Card, ChoiceGroup, H1, Screen, SectionTitle, Segmented, Stack, T, TextField } from '../ui';

// S05. Pick what you're training for. Race goals can come from the directory (S19/S20).

type Kind = 'race' | 'trail' | 'speed' | 'start_running' | 'injury_return';
type Dist = '5k' | '10k' | 'half' | 'marathon';
const DIST_M: Record<Dist, number> = { '5k': 5000, '10k': 10000, half: 21097, marathon: 42195 };

/** Non-race goals get a fixed horizon and a reference distance for the engine. */
const PRESET: Record<Exclude<Kind, 'race' | 'trail'>, { weeks: number; distanceM: number; kind: GoalKind }> = {
  speed: { weeks: 10, distanceM: 10000, kind: 'speed' },
  start_running: { weeks: 8, distanceM: 5000, kind: 'start_running' },
  injury_return: { weeks: 6, distanceM: 5000, kind: 'injury_return' },
};

export default function GoalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ raceId?: string }>();
  const race = useQuery((api) => (params.raceId ? api.race(params.raceId) : Promise.resolve(null)), [params.raceId]);
  const [kind, setKind] = useState<Kind | null>(null);
  const [dist, setDist] = useState<Dist>('half');
  const [trailKm, setTrailKm] = useState('25');
  const [trailDplus, setTrailDplus] = useState('800');
  const [date, setDate] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | undefined>();

  // Prefill from a race picked in the directory.
  useEffect(() => {
    const r = race.data;
    if (!r) return;
    setKind(r.discipline === 'trail' ? 'trail' : 'race');
    setDate(formatDateFR(r.date));
    if (r.discipline === 'trail') {
      setTrailKm(String(Math.round(r.distanceM / 1000)));
      setTrailDplus(String(r.elevationGainM));
    } else {
      const d = (Object.keys(DIST_M) as Dist[]).find((k) => Math.abs(DIST_M[k] - r.distanceM) < 200);
      if (d) setDist(d);
    }
  }, [race.data]);

  const build = (): GoalWithRace | string => {
    if (!kind) return 'Choisis un objectif.';
    if (kind === 'race' || kind === 'trail') {
      const iso = parseDateFR(date);
      if (!iso) return 'Saisis la date de ta course au format JJ/MM/AAAA.';
      if (iso <= today()) return 'La date de ta course doit être dans le futur.';
      const t = target.trim() ? parseTime(target) : undefined;
      if (t === null) return 'Objectif de temps : format 52:00 ou 1:45:00.';
      if (kind === 'trail') {
        const d = Number(trailKm.replace(',', '.'));
        const e = Number(trailDplus);
        if (!(d >= 5 && d <= 200)) return 'Distance du trail : entre 5 et 200 km.';
        if (!(e >= 0 && e <= 12000)) return 'Dénivelé : entre 0 et 12 000 m.';
        return { kind: 'race', surface: 'trail', distanceM: Math.round(d * 1000), elevationGainM: Math.round(e), date: iso, targetTimeS: t, name: race.data?.name, raceId: race.data?.id };
      }
      return { kind: 'race', surface: 'road', distanceM: DIST_M[dist], date: iso, targetTimeS: t, name: race.data?.name, raceId: race.data?.id };
    }
    const p = PRESET[kind];
    return { kind: p.kind, distanceM: p.distanceM, date: addDays(today(), p.weeks * 7 - 1) };
  };

  const next = () => {
    const g = build();
    if (typeof g === 'string') {
      setError(g);
      return;
    }
    setError(undefined);
    router.push({ pathname: '/plan-setup', params: { goal: JSON.stringify(g) } });
  };

  const isRace = kind === 'race' || kind === 'trail';
  return (
    <Screen testID="S05" footer={<Button label="Continuer" block size="lg" onPress={next} testID="goal-next" />}>
      <Stack gap={2}>
        <H1>Qu’est-ce que tu prépares ?</H1>
        <T color="text-muted">Ton plan est construit à rebours depuis cet objectif.</T>
      </Stack>

      {race.data ? (
        <Card>
          <SectionTitle>Course choisie</SectionTitle>
          <T v="lg">{race.data.name}</T>
          <T v="sm" color="text-muted" num>
            {dateLong(race.data.date)} · {race.data.city} · {km(race.data.distanceM)}
          </T>
        </Card>
      ) : null}

      <ChoiceGroup<Kind>
        label="Objectif"
        value={kind}
        onChange={(v) => {
          setKind(v);
          setError(undefined);
        }}
        choices={[
          { value: 'race', title: 'Une course sur route', description: 'Du 5 km au marathon, avec une date', icon: Route, badge: 'Entraînement' },
          { value: 'trail', title: 'Un trail', description: 'Distance et dénivelé', icon: Mountain, badge: 'Entraînement' },
          { value: 'speed', title: 'Gagner en vitesse', description: '10 semaines sans course précise', icon: Gauge, badge: 'Entraînement' },
          { value: 'start_running', title: 'Commencer à courir', description: '8 semaines pour courir 30 minutes sans t’arrêter', icon: Sprout },
          { value: 'injury_return', title: 'Reprendre après une blessure', description: '6 semaines progressives', icon: HeartPulse },
        ]}
      />
      {!race.data ? (
        <Button label="Chercher une course dans le calendrier" variant="secondary" icon={Search} onPress={() => router.push('/races')} />
      ) : null}

      {kind === 'race' ? (
        <Stack gap={2}>
          <SectionTitle>Distance</SectionTitle>
          <Segmented<Dist>
            label="Distance"
            value={dist}
            onChange={setDist}
            options={[
              { value: '5k', label: '5 km' },
              { value: '10k', label: '10 km' },
              { value: 'half', label: 'Semi' },
              { value: 'marathon', label: 'Marathon' },
            ]}
          />
        </Stack>
      ) : null}
      {kind === 'trail' ? (
        <Stack row gap={3}>
          <Stack style={{ flex: 1 }}>
            <TextField label="Distance (km)" value={trailKm} onChange={setTrailKm} keyboardType="decimal-pad" />
          </Stack>
          <Stack style={{ flex: 1 }}>
            <TextField label="Dénivelé + (m)" value={trailDplus} onChange={setTrailDplus} keyboardType="number-pad" />
          </Stack>
        </Stack>
      ) : null}
      {isRace ? (
        <Stack gap={4}>
          <TextField testID="race-date" label="Date de la course" value={date} onChange={setDate} placeholder="21/03/2027" keyboardType="numbers-and-punctuation" help="JJ/MM/AAAA" />
          <TextField
            label="Objectif de temps (facultatif)"
            value={target}
            onChange={setTarget}
            placeholder={dist === '5k' || dist === '10k' ? '52:00' : '1:55:00'}
            keyboardType="numbers-and-punctuation"
            help="Laisse vide si tu veux simplement finir. On t’indiquera un temps réaliste."
          />
        </Stack>
      ) : null}
      {kind && FREE_GOALS.includes(kind as GoalKind) ? (
        <Banner kind="success">Cet objectif est inclus gratuitement.</Banner>
      ) : null}
      {error ? (
        <Banner kind="error" title="Il manque quelque chose">
          {error}
        </Banner>
      ) : null}
      {kind && !isRace ? (
        <T v="sm" color="text-muted">
          Durée du programme : {PRESET[kind].weeks} semaines à partir d’aujourd’hui.
        </T>
      ) : null}
    </Screen>
  );
}
