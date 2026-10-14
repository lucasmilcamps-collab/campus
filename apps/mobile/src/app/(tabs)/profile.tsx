import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from '../../data';
import { dateLong } from '../../copy';
import { Banner, Button, ErrorState, H1, ListGroup, ListRow, LoadingCards, Screen, SectionTitle, Segmented, Stack, Switch, T } from '../../ui';

// S24. Account, training settings, connected apps, subscription.
export default function Profile() {
  const router = useRouter();
  const me = useQuery((api) => api.me());
  const settings = useQuery((api) => api.settings());
  const ent = useQuery((api) => api.entitlements());
  const plan = useQuery((api) => api.plan());
  const conns = useQuery((api) => api.connections());
  const update = useMutation((api, patch: Parameters<typeof api.updateSettings>[0]) => api.updateSettings(patch));
  const signOut = useMutation((api, everywhere: boolean) => api.signOut(everywhere));
  const abandon = useMutation((api) => api.abandonPlan());
  const del = useMutation((api) => api.deleteAccount());
  const [confirm, setConfirm] = useState<'abandon' | 'delete' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const err = me.error ?? settings.error ?? ent.error;
  if (err) {
    return (
      <Screen>
        <ErrorState message={err.message} onRetry={() => [me, settings, ent].forEach((x) => x.reload())} />
      </Screen>
    );
  }
  if (!me.data || !settings.data || !ent.data) {
    return (
      <Screen>
        <LoadingCards n={3} />
      </Screen>
    );
  }
  const s = settings.data;
  const e = ent.data;
  const paid = e.tier === 'training' && (e.status === 'trial' || e.status === 'active');

  return (
    <Screen testID="S24">
      <Stack gap={1}>
        <H1>{me.data.firstName ?? 'Ton profil'}</H1>
        <T color="text-muted">{me.data.email}</T>
      </Stack>

      {notice ? (
        <Banner kind="info" action={{ label: 'OK', onPress: () => setNotice(null) }}>
          {notice}
        </Banner>
      ) : null}

      <Stack gap={2}>
        <SectionTitle>Entraînement</SectionTitle>
        <Segmented<3 | 4 | 5>
          label="Séances par semaine"
          value={s.sessionsPerWeek}
          onChange={async (v) => {
            const r = await update.run({ sessionsPerWeek: v });
            if (r?.adjustment) setNotice(r.adjustment.summary);
          }}
          options={[3, 4, 5].map((n) => ({ value: n as 3 | 4 | 5, label: `${n} / sem.` }))}
        />
        <ListGroup>
          <ListRow title="Conseils nutrition" subtitle="Quoi manger et boire pendant les sorties longues" right={<Switch label="Conseils nutrition" value={s.nutritionEnabled} onChange={(v) => update.run({ nutritionEnabled: v })} />} />
          <ListRow title="Rappel de séance" subtitle="Le matin des jours de séance" right={<Switch label="Rappel de séance" value={s.sessionReminder} onChange={(v) => update.run({ sessionReminder: v })} />} />
          <ListRow title="Mettre à jour mon niveau" subtitle="Nouveau chrono ou test de 1 500 m" onPress={() => router.push('/reevaluate')} />
          <ListRow title="Changer d’objectif" onPress={() => router.push('/goal')} last />
        </ListGroup>
        {update.error ? <Banner kind="error">{update.error.message}</Banner> : null}
      </Stack>

      <Stack gap={2}>
        <SectionTitle>Applications connectées</SectionTitle>
        <ListGroup>
          <ListRow
            title="Montres et applications"
            subtitle={conns.data?.length ? conns.data.map((c) => c.provider[0].toUpperCase() + c.provider.slice(1)).join(', ') : 'Aucune connectée'}
            onPress={() => router.push('/settings/connections')}
            last
          />
        </ListGroup>
      </Stack>

      <Stack gap={2}>
        <SectionTitle>Abonnement</SectionTitle>
        <ListGroup>
          <ListRow
            title={paid ? 'Offre Entraînement' : 'Offre gratuite'}
            subtitle={
              e.status === 'trial' && e.trialEndsAt
                ? `Essai gratuit jusqu’au ${dateLong(e.trialEndsAt)}`
                : paid
                  ? `Abonnement ${e.period === 'year' ? 'annuel' : 'mensuel'}`
                  : 'Débuter, Reprise et Semaine d’évaluation'
            }
            onPress={() => router.push('/paywall')}
            last
          />
        </ListGroup>
      </Stack>

      <Stack gap={2}>
        <SectionTitle>Compte</SectionTitle>
        <ListGroup>
          {plan.data ? <ListRow title="Abandonner mon plan" destructive onPress={() => setConfirm('abandon')} /> : null}
          <ListRow title="Se déconnecter" onPress={async () => (await signOut.run(false), router.replace('/welcome'))} />
          <ListRow title="Se déconnecter de tous les appareils" onPress={async () => (await signOut.run(true), router.replace('/welcome'))} />
          <ListRow title="Supprimer mon compte" destructive onPress={() => setConfirm('delete')} last />
        </ListGroup>
      </Stack>

      {confirm ? (
        <Banner kind="warning" title={confirm === 'abandon' ? 'Abandonner ton plan ?' : 'Supprimer ton compte ?'}>
          {confirm === 'abandon'
            ? 'Ton historique reste dans ton journal. Tu pourras choisir un nouvel objectif.'
            : 'Toutes tes données (plan, séances, ressentis, connexions) seront effacées définitivement. Ton abonnement n’est pas annulé automatiquement : annule-le dans les réglages de ton App Store ou Google Play.'}
        </Banner>
      ) : null}
      {confirm ? (
        <Stack row gap={2}>
          <Button label="Annuler" variant="secondary" onPress={() => setConfirm(null)} />
          <Button
            label={confirm === 'abandon' ? 'Abandonner' : 'Supprimer définitivement'}
            variant="danger"
            loading={abandon.pending || del.pending}
            onPress={async () => {
              if (confirm === 'abandon') {
                await abandon.run();
                setConfirm(null);
              } else {
                await del.run();
                router.replace('/welcome');
              }
            }}
          />
        </Stack>
      ) : null}
    </Screen>
  );
}
