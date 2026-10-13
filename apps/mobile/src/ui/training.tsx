import { Pressable, View, type PressableStateCallbackType } from 'react-native';
import type { ReactNode } from 'react';
import { Check, Lock } from 'lucide-react-native';
import type { Session, SessionType, Step, PaceZones } from '@stride/engine';
import { effortOf, effortOfZone, useTheme, type Effort } from '../theme';
import { dayLong, dayNum, dayShort, duration, km, pace, paceSpoken, RPE_LABEL, SESSION_LABEL, STEP_LABEL, ZONE_LABEL } from '../copy';
import { T } from './core';

type PState = PressableStateCallbackType & { focused?: boolean };

// ---------------------------------------------------------------- chips

export function EffortChip({ effort, label, size = 'sm' }: { effort: Effort; label: string; size?: 'sm' | 'md' }) {
  const t = useTheme();
  const e = t.effort(effort);
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        height: size === 'sm' ? 24 : 28,
        paddingHorizontal: t.sp(2),
        borderRadius: t.r.pill,
        backgroundColor: e.soft,
        justifyContent: 'center',
      }}
    >
      <T v="xs" weight="600" num style={{ color: e.ink }}>
        {label}
      </T>
    </View>
  );
}

export function TypeChip({ type }: { type: SessionType }) {
  return <EffortChip effort={effortOf(type)} label={SESSION_LABEL[type]} />;
}

export function PaceChip({ zone, value }: { zone: string; value?: number }) {
  return (
    <View accessibilityLabel={value ? `${ZONE_LABEL[zone]}, ${paceSpoken(value)}` : ZONE_LABEL[zone]}>
      <EffortChip effort={effortOfZone(zone)} label={value ? pace(value) : ZONE_LABEL[zone]} />
    </View>
  );
}

// ---------------------------------------------------------------- WeekStrip

export function WeekStrip({
  days,
  sessions,
  selected,
  today,
  onSelect,
}: {
  days: string[];
  sessions: Session[];
  selected: string;
  today: string;
  onSelect: (d: string) => void;
}) {
  const t = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {days.map((d) => {
        const s = sessions.find((x) => x.date === d);
        const on = d === selected;
        const e = s ? t.effort(effortOf(s.type)) : null;
        const status = s ? (s.status === 'done' ? 'faite' : s.status === 'missed' ? 'manquée' : 'prévue') : 'repos';
        return (
          <Pressable
            key={d}
            onPress={() => onSelect(d)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${dayLong(d)}${d === today ? ", aujourd'hui" : ''}, ${s ? `${SESSION_LABEL[s.type]}, ${status}` : 'repos'}`}
            style={(st: PState) => [
              {
                width: t.layout.touch_min,
                paddingVertical: t.sp(1),
                alignItems: 'center',
                gap: 2,
                borderRadius: t.r.pill,
                backgroundColor: on ? t.c.accent : 'transparent',
                borderWidth: d === today && !on ? 1 : 0,
                borderColor: t.c.accent,
              },
              t.focusRing(!!st.focused),
            ]}
          >
            <T v="xs" color={on ? 'on-accent' : 'text-muted'}>
              {dayShort(d)}
            </T>
            <T weight="600" color={on ? 'on-accent' : 'text'} num>
              {dayNum(d)}
            </T>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: !s || s.status === 'missed' ? 'transparent' : on ? t.c['on-accent'] : e!.solid,
                borderWidth: s?.status === 'missed' ? 1.5 : 0,
                borderColor: on ? t.c['on-accent'] : e?.solid,
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- SessionCard

const STATUS_TEXT = { planned: 'Prévue', done: 'Faite', missed: 'Manquée', skipped: 'Passée' } as const;

export function SessionCard({
  session,
  onPress,
  today,
  locked,
  hero,
  children,
}: {
  session: Session;
  onPress?: () => void;
  today?: boolean;
  locked?: boolean;
  hero?: boolean;
  children?: ReactNode;
}) {
  const t = useTheme();
  const e = t.effort(effortOf(session.type));
  const statusText = today && session.status === 'planned' ? "Aujourd'hui" : STATUS_TEXT[session.status];
  const muted = session.status === 'missed' || session.status === 'skipped';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${dayLong(session.date)}, ${SESSION_LABEL[session.type]}, ${session.title}, ${duration(session.estDurationS)}, ${statusText}${locked ? ', verrouillée' : ''}`}
      style={(s: PState) => [
        {
          backgroundColor: t.c['surface-raised'],
          borderRadius: t.r.lg,
          padding: t.sp(4),
          gap: t.sp(2),
          borderWidth: 1,
          borderColor: t.c.border,
          borderLeftWidth: 4,
          borderLeftColor: e.solid,
          transform: [{ scale: s.pressed ? 0.99 : 1 }],
        },
        t.focusRing(!!s.focused),
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.sp(2) }}>
        <TypeChip type={session.type} />
        <T v="xs" color="text-muted">
          {dayLong(session.date)}
        </T>
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {locked ? <Lock size={14} color={t.c['text-muted']} /> : null}
          {session.status === 'done' ? <Check size={14} color={t.c.success} strokeWidth={2.5} /> : null}
          <T v="xs" weight="600" color={session.status === 'done' ? 'success' : today ? 'accent' : 'text-muted'}>
            {statusText}
          </T>
        </View>
      </View>
      <T v={hero ? 'xl' : 'lg'} weight={hero ? '700' : '600'} color={muted ? 'text-muted' : 'text'} numberOfLines={2}>
        {session.title}
      </T>
      <T v="sm" color="text-muted" num>
        {duration(session.estDurationS)} · {km(session.estDistanceM)}
      </T>
      {children}
    </Pressable>
  );
}

// ---------------------------------------------------------------- WorkoutStepList

function stepLength(s: Step): string {
  if (s.durationS) return duration(s.durationS);
  if (s.distanceM) return km(s.distanceM);
  return '';
}

function StepRow({ s, indent }: { s: Step; indent?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.sp(3),
        paddingVertical: t.sp(3),
        paddingLeft: indent ? t.sp(6) : 0,
        borderBottomWidth: 1,
        borderBottomColor: t.c.border,
      }}
    >
      <T v="sm" color="text-muted" style={{ width: 120 }}>
        {STEP_LABEL[s.kind]}
      </T>
      <T num style={{ flex: 1 }}>
        {stepLength(s)}
      </T>
      {s.zone ? <PaceChip zone={s.zone} value={s.targetPace} /> : null}
    </View>
  );
}

export function WorkoutStepList({ steps }: { steps: Step[] }) {
  const t = useTheme();
  return (
    <View accessibilityRole="list">
      {steps.map((s, i) =>
        s.kind === 'repeat' ? (
          <View key={i} accessibilityLabel={`${s.repeat} répétitions`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.sp(3), paddingVertical: t.sp(3), borderBottomWidth: 1, borderBottomColor: t.c.border }}>
              <T v="sm" color="text-muted" style={{ width: 120 }}>
                {STEP_LABEL.repeat}
              </T>
              <T style={{ flex: 1 }}>{s.repeat} répétitions</T>
              <View style={{ backgroundColor: t.c.surface, borderRadius: t.r.pill, paddingHorizontal: t.sp(2), paddingVertical: 2 }}>
                <T v="xs" weight="600" num>
                  × {s.repeat}
                </T>
              </View>
            </View>
            {(s.children ?? []).map((c, j) => (
              <StepRow key={j} s={c} indent />
            ))}
          </View>
        ) : (
          <StepRow key={i} s={s} />
        ),
      )}
    </View>
  );
}

// ---------------------------------------------------------------- PaceZoneTable

const ZONE_ORDER = ['ef', 'marathon', 'half', '10k', 'threshold', 'vma'] as const;

export function PaceZoneTable({ zones }: { zones: PaceZones }) {
  const t = useTheme();
  return (
    <View accessibilityRole="list">
      {ZONE_ORDER.map((z) => {
        const r = zones[z];
        const value = r.min === r.max ? pace(r.min) : `${pace(r.min).replace(' /km', '')}–${pace(r.max)}`;
        return (
          <View
            key={z}
            accessible
            accessibilityLabel={`${ZONE_LABEL[z]} : entre ${paceSpoken(r.min)} et ${paceSpoken(r.max)}`}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: t.sp(2), borderBottomWidth: 1, borderBottomColor: t.c.border }}
          >
            <EffortChip effort={effortOfZone(z)} label={ZONE_LABEL[z]} />
            <T v="sm" weight="600" num style={{ marginLeft: 'auto' }}>
              {value}
            </T>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- RPEScale

export function RPEScale({ value, onChange, error }: { value: number | null; onChange: (v: 1 | 2 | 3 | 4 | 5) => void; error?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.sp(2) }}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Comment t'es-tu senti ?" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {([1, 2, 3, 4, 5] as const).map((n) => {
          const e = t.effort(n);
          const on = value === n;
          return (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${n}, ${RPE_LABEL[n]}`}
              style={(s: PState) => [{ alignItems: 'center', gap: t.sp(1), width: 64, borderRadius: t.r.md }, t.focusRing(!!s.focused)]}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: e.soft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: on ? 3 : 0,
                  borderColor: e.solid,
                }}
              >
                <T v="lg" weight="700" style={{ color: e.ink }}>
                  {n}
                </T>
              </View>
              <T v="xs" weight={on ? '600' : '400'} style={{ textAlign: 'center' }}>
                {RPE_LABEL[n]}
              </T>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <T v="xs" color="danger" accessibilityRole="alert">
          {error}
        </T>
      ) : null}
    </View>
  );
}
