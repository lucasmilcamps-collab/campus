import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Goal } from '@stride/engine';
import { useApi, useMutation, useQuery } from '../data';
import { dateLong } from '../copy';
import { Banner, Button, ChoiceGroup, ErrorState, H1, LoadingCards, Screen, Stack, T } from '../ui';

// S07. Prices are placeholders until /replica-launch sets ours. Purchases go
// through the stores (RevenueCat) in /replica-backend; here they are simulated.
const PRICES = { year: { label: '119 €', per: '/ an', monthly: '9,92 €' }, month: { label: '15 €', per: '/ mois' } };

export default function Paywall() {
  const router = useRouter();
  const { api } = useApi();
  const params = useLocalSearchParams<{ goal?: string; spw?: string }>();
  const ent = useQuery((a) => a.entitlements());
  const [period, setPeriod] = useState<'year' | 'month'>('year');
  const buy = useMutation((a, p: 'year' | 'month') => a.purchase(p));
  const restore = useMutation((a) => a.restorePurchases());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  if (ent.error) {
    return (
      <Screen>
        <ErrorState message={ent.error.message} onRetry={ent.reload} />
      </Screen>
    );
  }
  if (!ent.data) {
    return (
      <Screen>
        <LoadingCards n={2} />
      </Screen>
    );
  }

  const e = ent.data;
  const active = e.tier === 'training' && (e.status === 'trial' || e.status === 'active');
  const trial = !e.trialUsed;

  const afterPurchase = async () => {
    if (!params.goal) {
      router.back();
      return;
    }
    // came from S06: finish creating the plan the runner asked for
    setCreating(true);
    try {
      const goal: Goal = JSON.parse(params.goal);
      await api.createPlan({ goal, sessionsPerWeek: (Number(params.spw) || 4) as 3 | 4 | 5 });
      router.replace('/home');
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  if (active) {
    return (
      <Screen testID="S07-active" footer={<Button label={params.goal ? 'Créer mon plan' : 'Fermer'} block size="lg" onPress={afterPurchase} loading={creating} />}>
        <H1>Tu as l’offre Entraînement</H1>
        <T color="text-muted">
          {e.status === 'trial' && e.trialEndsAt
            ? `Ton essai gratuit se termine le ${dateLong(e.trialEndsAt)}. On te prévient quelques jours avant.`
            : 'Ton abonnement est actif.'}
        </T>
        {createError ? <Banner kind="error">{createError}</Banner> : null}
      </Screen>
    );
  }

  return (
    <Screen
      testID="S07"
      footer={
        <Stack gap={2}>
          <Button
            label={trial ? 'Commencer mes 14 jours gratuits' : 'S’abonner'}
            block
            size="lg"
            loading={buy.pending || creating}
            onPress={async () => {
              const r = await buy.run(period);
              if (r) await afterPurchase();
            }}
            testID="buy"
          />
          <Button label="Restaurer mes achats" variant="ghost" block onPress={() => restore.run()} loading={restore.pending} />
        </Stack>
      }
    >
      <Stack gap={2}>
        <H1>Prépare ta course avec un plan qui s’adapte</H1>
        <T color="text-muted">Plans pour toutes les distances, allures recalculées après chaque séance, export vers ta montre.</T>
      </Stack>
      <ChoiceGroup<'year' | 'month'>
        label="Formule"
        value={period}
        onChange={setPeriod}
        choices={[
          {
            value: 'year',
            title: `Annuel · ${PRICES.year.label} ${PRICES.year.per}`,
            description: `soit ${PRICES.year.monthly} par mois${trial ? ' · 14 jours offerts' : ''}`,
            badge: 'Le plus avantageux',
          },
          { value: 'month', title: `Mensuel · ${PRICES.month.label} ${PRICES.month.per}`, description: trial ? 'Sans engagement · 14 jours offerts' : 'Sans engagement' },
        ]}
      />
      {buy.error ? <Banner kind="error">{buy.error.message}</Banner> : null}
      {restore.error ? <Banner kind="error">{restore.error.message}</Banner> : null}
      {createError ? <Banner kind="error">{createError}</Banner> : null}
      <T v="xs" color="text-muted">
        {trial ? 'Aucun paiement aujourd’hui. ' : ''}L’abonnement se renouvelle automatiquement sauf annulation au moins 24 h avant la fin de la période, depuis les réglages de ton compte App Store ou Google Play.
      </T>
    </Screen>
  );
}
