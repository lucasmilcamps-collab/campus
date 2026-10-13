import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Flag, NotebookPen, Plus } from 'lucide-react-native';
import { addDays, daysBetween, mondayOf } from '@stride/engine';
import { today, useMutation, useQuery } from '../../data';
import { dayLong, GOAL_LABEL, PHASE_LABEL } from '../../copy';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  H1,
  IconButton,
  LoadingCards,
  ProgressBar,
  Screen,
  SectionTitle,
  SessionCard,
  Stack,
  T,
  WeekStrip,
} from '../../ui';
import { useTheme } from '../../theme';

// S08. This week: today's session up top, the rest of the week below, and any
// plan change explained in a banner (the fix for "it's unclear what changed").
export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const now = today();
  const [weekStart, setWeekStart] = useState(mondayOf(now));
  const [selected, setSelected] = useState(now);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const me = useQuery((api) => api.me());
  const plan = useQuery((api) => api.plan());
  const week = useQuery((api) => api.week(weekStart), [weekStart]);
  const seen = useMutation((api, id: string) => api.markAdjustmentSeen(id));

  const err = plan.error ?? week.error;
  if (err) {
    return (
      <Screen testID="S08-error">
        <ErrorState
          message={err.message}
          onRetry={() => {
            plan.reload();
            week.reload();
          }}
        />
      </Screen>
    );
  }
  if (plan.loading && !plan.data) {
    return (
      <Screen>
        <LoadingCards />
      </Screen>
    );
  }
  if (!plan.data) {
    return (
      <Screen testID="S08-empty">
        <EmptyState
          icon={Flag}
          title="Pas encore de plan"
          body="Choisis un objectif : on construit ton plan semaine par semaine, à ton niveau."
          cta={{ label: 'Choisir un objectif', onPress: () => router.push('/goal') }}
        />
      </Screen>
    );
  }

  const p = plan.data;
  const sessions = week.data?.sessions ?? [];
  const adjustments = week.data?.adjustments ?? [];
  const daySession = sessions.find((s) => s.date === selected);
  const weekInfo = p.weeks.find((w) => w.startsOn === weekStart);
  const toGo = daysBetween(now, p.endDate);
  const totalDays = Math.max(1, daysBetween(p.startDate, p.endDate));
  const firstWeek = mondayOf(p.startDate);
  const lastWeek = mondayOf(p.endDate);

  const shiftWeek = (n: number) => {
    const w = addDays(weekStart, 7 * n);
    setWeekStart(w);
    setSelected(w === mondayOf(now) ? now : w);
  };

  return (
    <Screen testID="S08" topInset>
      <Stack gap={1}>
        <T color="text-muted">{dayLong(now)}</T>
        <H1>{me.data?.firstName ? `Bonjour ${me.data.firstName}` : 'Bonjour'}</H1>
      </Stack>

      {adjustments.map((a) => (
        <Banner key={a.id} kind="info" title="Ton plan a été ajusté" action={{ label: 'Compris', onPress: () => seen.run(a.id) }}>
          {a.summary}
        </Banner>
      ))}

      <Card>
        <Stack row gap={2}>
          <Flag size={16} color={t.c['text-muted']} strokeWidth={1.75} />
          <T v="sm" weight="600" numberOfLines={1} style={{ flex: 1 }}>
            {p.goal.name ?? GOAL_LABEL[p.goal.kind]}
          </T>
          <T v="sm" color="text-muted" num>
            {toGo > 0 ? `J-${toGo}` : toGo === 0 ? 'C’est aujourd’hui !' : 'Terminé'}
          </T>
        </Stack>
        <ProgressBar value={totalDays - Math.max(0, toGo)} max={totalDays} label={`Progression du plan, ${toGo} jours restants`} />
      </Card>

      <Stack gap={3}>
        <Stack row gap={1}>
          <View style={{ flex: 1, gap: 2 }}>
            <SectionTitle>{weekInfo ? `Semaine ${weekInfo.index + 1} sur ${p.weeks.length}` : 'Semaine'}</SectionTitle>
            {weekInfo ? (
              <T v="sm" color="text-muted" num>
                {PHASE_LABEL[weekInfo.phase]} · objectif {weekInfo.targetVolumeKm.toLocaleString('fr-FR')} km
              </T>
            ) : null}
          </View>
          {weekStart > firstWeek ? <IconButton icon={ChevronLeft} label="Semaine précédente" onPress={() => shiftWeek(-1)} /> : null}
          {weekStart < lastWeek ? <IconButton icon={ChevronRight} label="Semaine suivante" onPress={() => shiftWeek(1)} /> : null}
        </Stack>
        <WeekStrip days={days} sessions={sessions} selected={selected} today={now} onSelect={setSelected} />
      </Stack>

      {week.loading && !week.data ? (
        <LoadingCards n={1} />
      ) : daySession ? (
        <SessionCard session={daySession} today={daySession.date === now} hero onPress={() => router.push(`/session/${daySession.id}`)}>
          {daySession.status === 'planned' && daySession.date <= now ? (
            <Stack row gap={2} style={{ marginTop: t.sp(2) }}>
              <Button size="sm" label="J’ai fait cette séance" onPress={() => router.push(`/session/${daySession.id}/feedback`)} />
              <Button size="sm" variant="secondary" label="Détails" onPress={() => router.push(`/session/${daySession.id}`)} />
            </Stack>
          ) : null}
        </SessionCard>
      ) : (
        <Card>
          <T v="lg">Repos</T>
          <T v="sm" color="text-muted">
            Pas de séance prévue {selected === now ? 'aujourd’hui' : 'ce jour-là'}. La récupération fait partie du plan.
          </T>
        </Card>
      )}

      <Stack gap={3}>
        <SectionTitle>Toute la semaine</SectionTitle>
        {sessions.length === 0 && !week.loading ? <T color="text-muted">Aucune séance cette semaine.</T> : null}
        {sessions
          .filter((s) => s.id !== daySession?.id)
          .map((s) => (
            <SessionCard key={s.id} session={s} today={s.date === now} onPress={() => router.push(`/session/${s.id}`)} />
          ))}
      </Stack>

      <Stack row gap={2}>
        <Button variant="secondary" icon={Plus} label="Ajouter une activité" onPress={() => router.push('/activity/new')} />
        <Button variant="ghost" icon={NotebookPen} label="Journal" onPress={() => router.push('/journal')} />
      </Stack>
    </Screen>
  );
}
