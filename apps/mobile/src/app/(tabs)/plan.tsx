import { useState } from 'react';
import { Pressable, View, type PressableStateCallbackType } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronUp, Flag } from 'lucide-react-native';
import { mondayOf, type Session, type Week } from '@stride/engine';
import { today, useQuery } from '../../data';
import { dateLong, PHASE_LABEL } from '../../copy';
import { EmptyState, ErrorState, H1, LoadingCards, Screen, SessionCard, Stack, T } from '../../ui';
import { useTheme } from '../../theme';

// S09. The whole plan, week by week, with a volume bar per week. Bars are
// labelled with their number, so the chart never relies on colour or length alone.
export default function PlanOverview() {
  const router = useRouter();
  const q = useQuery((api) => api.plan());
  const now = today();
  const [open, setOpen] = useState<number | null>(null);

  if (q.error) {
    return (
      <Screen>
        <ErrorState message={q.error.message} onRetry={q.reload} />
      </Screen>
    );
  }
  if (q.loading && !q.data) {
    return (
      <Screen>
        <LoadingCards />
      </Screen>
    );
  }
  if (!q.data) {
    return (
      <Screen testID="S09-empty">
        <EmptyState icon={Flag} title="Pas encore de plan" body="Ton plan apparaîtra ici, semaine par semaine." cta={{ label: 'Choisir un objectif', onPress: () => router.push('/goal') }} />
      </Screen>
    );
  }
  const p = q.data;
  const peak = Math.max(...p.weeks.map((w) => w.targetVolumeKm));
  const current = mondayOf(now);
  const openIndex = open ?? p.weeks.find((w) => w.startsOn === current)?.index ?? 0;

  return (
    <Screen testID="S09">
      <Stack gap={1}>
        <H1>{p.goal.name ?? 'Ton plan'}</H1>
        <T color="text-muted" num>
          {p.weeks.length} semaines · jusqu’au {dateLong(p.endDate)} · {p.sessionsPerWeek} séances par semaine
        </T>
      </Stack>
      <Stack gap={2}>
        {p.weeks.map((w) => (
          <WeekRow
            key={w.index}
            week={w}
            peak={peak}
            current={w.startsOn === current}
            past={w.startsOn < current}
            open={openIndex === w.index}
            sessions={p.sessions.filter((s) => s.weekIndex === w.index)}
            onToggle={() => setOpen(openIndex === w.index ? -1 : w.index)}
            onSession={(id) => router.push(`/session/${id}`)}
          />
        ))}
      </Stack>
    </Screen>
  );
}

function WeekRow({
  week,
  peak,
  current,
  past,
  open,
  sessions,
  onToggle,
  onSession,
}: {
  week: Week;
  peak: number;
  current: boolean;
  past: boolean;
  open: boolean;
  sessions: Session[];
  onToggle: () => void;
  onSession: (id: string) => void;
}) {
  const t = useTheme();
  const done = sessions.filter((s) => s.status === 'done').length;
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View style={{ gap: t.sp(2) }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        aria-expanded={open}
        accessibilityLabel={`Semaine ${week.index + 1}, ${PHASE_LABEL[week.phase]}, ${week.targetVolumeKm} kilomètres${current ? ', semaine en cours' : ''}`}
        style={(s: PressableStateCallbackType & { focused?: boolean }) => [
          {
            padding: t.sp(3),
            borderRadius: t.r.md,
            borderWidth: current ? 2 : 1,
            borderColor: current ? t.c.accent : t.c.border,
            backgroundColor: t.c['surface-raised'],
            gap: t.sp(2),
          },
          t.focusRing(!!s.focused),
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.sp(2) }}>
          <T weight="600" num style={{ width: 40 }}>
            S{week.index + 1}
          </T>
          <T v="sm" color="text-muted" style={{ flex: 1 }}>
            {PHASE_LABEL[week.phase]}
            {current ? ' · en cours' : ''}
          </T>
          <T v="sm" weight="600" num>
            {week.targetVolumeKm.toLocaleString('fr-FR')} km
          </T>
          <Chevron size={18} color={t.c['text-muted']} />
        </View>
        <View style={{ height: 6, borderRadius: t.r.pill, backgroundColor: t.c.surface, overflow: 'hidden' }}>
          <View
            style={{
              width: `${(week.targetVolumeKm / peak) * 100}%`,
              height: '100%',
              borderRadius: t.r.pill,
              backgroundColor: current ? t.c.accent : past ? t.c['border-input'] : t.c['accent-soft'],
            }}
          />
        </View>
        {past || current ? (
          <T v="xs" color="text-muted" num>
            {done} / {sessions.length} séances faites
          </T>
        ) : null}
      </Pressable>
      {open ? (
        <View style={{ gap: t.sp(2), paddingLeft: t.sp(2) }}>
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} onPress={() => onSession(s.id)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
