import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { SearchX } from 'lucide-react-native';
import { useQuery } from '../../data';
import { EmptyState, ErrorState, H1, LoadingCards, RaceCard, Screen, Segmented, Stack, TextField } from '../../ui';

// S19. Race calendar search. Demo races only until our own race data source exists.
type Filter = 'all' | 'short' | 'half' | 'long' | 'trail';
const FILTER: Record<Filter, { maxDistanceM?: number; discipline?: 'road' | 'trail' }> = {
  all: {},
  short: { maxDistanceM: 10_500, discipline: 'road' },
  half: { maxDistanceM: 21_500, discipline: 'road' },
  long: { discipline: 'road' },
  trail: { discipline: 'trail' },
};

export default function Races() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => {
    const h = setTimeout(() => setDebounced(text), 250);
    return () => clearTimeout(h);
  }, [text]);
  const q = useQuery((api) => api.searchRaces({ text: debounced, ...FILTER[filter] }), [debounced, filter]);
  const races = (q.data ?? []).filter((r) => filter !== 'long' || r.distanceM > 21_500);

  return (
    <Screen testID="S19">
      <H1>Trouve ta prochaine course</H1>
      <TextField label="Rechercher" value={text} onChange={setText} placeholder="Nom ou ville" testID="race-search" />
      <Segmented<Filter>
        label="Type de course"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Tout' },
          { value: 'short', label: '≤ 10 km' },
          { value: 'half', label: 'Semi' },
          { value: 'long', label: 'Marathon+' },
          { value: 'trail', label: 'Trail' },
        ]}
      />
      {q.error ? <ErrorState message={q.error.message} onRetry={q.reload} /> : null}
      {q.loading && !q.data ? <LoadingCards /> : null}
      {!q.loading && !q.error && races.length === 0 ? (
        <EmptyState icon={SearchX} title="Aucune course trouvée" body="Essaie un autre nom, une autre ville, ou un autre filtre. Tu peux aussi saisir ta course à la main dans ton objectif." cta={{ label: 'Saisir ma course', onPress: () => router.push('/goal') }} />
      ) : null}
      <Stack gap={3}>
        {races.map((r) => (
          <RaceCard key={r.id} race={r} onPress={() => router.push(`/race/${r.id}`)} />
        ))}
      </Stack>
    </Screen>
  );
}
