import { useMutation, useQuery, type Connection } from '../../data';
import { Banner, Button, ErrorState, H1, ListGroup, ListRow, LoadingCards, Screen, Stack, T } from '../../ui';

// S25. Linking is simulated until /replica-backend (OAuth with each provider,
// and Garmin/Coros/Suunto need partner approval first).
const PROVIDERS: Array<{ id: Connection['provider']; name: string; what: string }> = [
  { id: 'strava', name: 'Strava', what: 'Importe tes sorties automatiquement' },
  { id: 'garmin', name: 'Garmin', what: 'Envoie tes séances sur ta montre, importe tes sorties' },
  { id: 'coros', name: 'Coros', what: 'Envoie tes séances sur ta montre, importe tes sorties' },
  { id: 'suunto', name: 'Suunto', what: 'Envoie tes séances sur ta montre, importe tes sorties' },
];

export default function Connections() {
  const q = useQuery((api) => api.connections());
  const connect = useMutation((api, p: Connection['provider']) => api.connect(p));
  const disconnect = useMutation((api, p: Connection['provider']) => api.disconnect(p));

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
  const linked = new Map(q.data.map((c) => [c.provider, c]));

  return (
    <Screen testID="S25">
      <Stack gap={2}>
        <H1>Applications connectées</H1>
        <T color="text-muted">Seules les sorties faites après la connexion sont importées.</T>
      </Stack>
      <ListGroup>
        {PROVIDERS.map((p, i) => {
          const c = linked.get(p.id);
          return (
            <ListRow
              key={p.id}
              title={p.name}
              subtitle={c ? (c.status === 'error' ? 'Erreur de synchronisation, reconnecte-toi' : 'Connecté') : p.what}
              last={i === PROVIDERS.length - 1}
              right={
                c ? (
                  <Button size="sm" variant="ghost" label="Déconnecter" accessibilityLabel={`Déconnecter ${p.name}`} onPress={() => disconnect.run(p.id)} />
                ) : (
                  <Button size="sm" variant="secondary" label="Connecter" accessibilityLabel={`Connecter ${p.name}`} onPress={() => connect.run(p.id)} loading={connect.pending} />
                )
              }
            />
          );
        })}
      </ListGroup>
      {connect.error || disconnect.error ? <Banner kind="error">{(connect.error ?? disconnect.error)!.message}</Banner> : null}
      <T v="xs" color="text-muted">
        Un compte de montre ou d’application ne peut être relié qu’à un seul compte ici.
      </T>
    </Screen>
  );
}
