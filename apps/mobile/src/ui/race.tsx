import { Pressable, View, type PressableStateCallbackType } from 'react-native';
import { Users } from 'lucide-react-native';
import { toDate } from '@stride/engine';
import type { Race } from '../data';
import { km } from '../copy';
import { useTheme } from '../theme';
import { T } from './core';

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function RaceCard({ race, onPress }: { race: Race; onPress?: () => void }) {
  const t = useTheme();
  const d = toDate(race.date);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${race.name}, ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${race.city}, ${km(race.distanceM)}`}
      style={(s: PressableStateCallbackType & { focused?: boolean }) => [
        {
          flexDirection: 'row',
          gap: t.sp(4),
          padding: t.sp(4),
          borderRadius: t.r.lg,
          borderWidth: 1,
          borderColor: t.c.border,
          backgroundColor: t.c['surface-raised'],
        },
        t.focusRing(!!s.focused),
      ]}
    >
      <View style={{ width: 48, alignItems: 'center' }}>
        <T v="xl" num>
          {d.getUTCDate()}
        </T>
        <T v="xs" color="text-muted">
          {MONTHS_SHORT[d.getUTCMonth()]}
        </T>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="lg" numberOfLines={2}>
          {race.name}
        </T>
        <T v="sm" color="text-muted" num>
          {race.city} · {km(race.distanceM)}
          {race.elevationGainM > 200 ? ` · D+ ${race.elevationGainM.toLocaleString('fr-FR')} m` : ''}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Users size={14} color={t.c['text-muted']} />
          <T v="xs" color="text-muted" num>
            {race.membersCount} coureurs la préparent
          </T>
        </View>
      </View>
    </Pressable>
  );
}
