import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch as RNSwitch,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle, CheckCircle2, ChevronRight, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { tabular, useTheme, type ColorRole } from '../theme';

type PState = PressableStateCallbackType & { focused?: boolean; hovered?: boolean };

// ---------------------------------------------------------------- Text

export function T({
  v = 'base',
  color = 'text',
  weight,
  num,
  style,
  ...rest
}: TextProps & {
  v?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | 'display' | 'metric';
  color?: ColorRole;
  weight?: TextStyle['fontWeight'];
  /** tabular figures */
  num?: boolean;
}) {
  const t = useTheme();
  return (
    <Text
      {...rest}
      style={[t.type(v), { color: t.c[color] }, weight ? { fontWeight: weight } : null, num ? tabular : null, style]}
    />
  );
}

export function H1({ children }: { children: ReactNode }) {
  return (
    <T v="xl" accessibilityRole="header">
      {children}
    </T>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <T v="xs" color="text-muted" weight="600" accessibilityRole="header" style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
      {children}
    </T>
  );
}

// ---------------------------------------------------------------- Button

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  block,
  center,
  icon: Icon,
  accessibilityLabel,
  testID,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
  /** centre in a column (empty states) instead of hugging the start edge */
  center?: boolean;
  icon?: LucideIcon;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const t = useTheme();
  const bg: Record<ButtonVariant, string> = {
    primary: t.c.accent,
    secondary: t.c['surface-raised'],
    ghost: 'transparent',
    danger: t.c.danger,
  };
  const fg: Record<ButtonVariant, ColorRole> = { primary: 'on-accent', secondary: 'text', ghost: 'accent', danger: 'on-danger' };
  const height = { sm: 36, md: t.layout.touch_min, lg: 52 }[size];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      aria-disabled={!!disabled}
      aria-busy={!!loading}
      disabled={inactive}
      hitSlop={size === 'sm' ? 4 : 0}
      style={(s: PState) => [
        {
          minHeight: height,
          paddingHorizontal: size === 'sm' ? t.sp(4) : t.sp(5),
          borderRadius: t.r.md,
          backgroundColor: bg[variant],
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: t.c.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.sp(2),
          opacity: disabled ? 0.4 : 1,
          alignSelf: block ? 'stretch' : center ? 'center' : 'flex-start',
          transform: [{ scale: s.pressed ? 0.97 : 1 }],
        },
        t.focusRing(!!s.focused),
      ]}
    >
      {loading ? (
        <ActivityIndicator color={t.c[fg[variant]]} />
      ) : (
        <>
          {Icon ? <Icon size={18} color={t.c[fg[variant]]} strokeWidth={1.75} /> : null}
          <T v={size === 'sm' ? 'sm' : 'base'} weight="600" color={fg[variant]}>
            {label}
          </T>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  filled,
}: {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
  filled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(s: PState) => [
        {
          width: t.layout.touch_min,
          height: t.layout.touch_min,
          borderRadius: t.r.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: filled || s.pressed ? t.c.surface : 'transparent',
        },
        t.focusRing(!!s.focused),
      ]}
    >
      <Icon size={20} color={t.c.text} strokeWidth={1.75} />
    </Pressable>
  );
}

// ---------------------------------------------------------------- Screen

export function Screen({
  children,
  footer,
  scroll = true,
  padded = true,
  topInset,
  testID,
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** screens without a header must clear the status bar / notch themselves */
  topInset?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const inner: ViewStyle = {
    padding: padded ? t.layout.gutter : 0,
    gap: t.sp(6),
    width: '100%',
    maxWidth: t.layout.content_max,
    alignSelf: 'center',
  };
  return (
    <SafeAreaView edges={topInset ? ['top', 'bottom', 'left', 'right'] : ['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: t.c.bg }} testID={testID}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { paddingBottom: t.sp(8) }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[inner, { flex: 1 }]}>{children}</View>
      )}
      {footer ? (
        <View
          style={{
            padding: t.layout.gutter,
            borderTopWidth: 1,
            borderTopColor: t.c.border,
            backgroundColor: t.c.bg,
            width: '100%',
            maxWidth: t.layout.content_max,
            alignSelf: 'center',
          }}
        >
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export function Stack({ gap = 2, row, children, style }: { gap?: number; row?: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ gap: t.sp(gap), flexDirection: row ? 'row' : 'column', alignItems: row ? 'center' : undefined, flexWrap: row ? 'wrap' : undefined }, style]}>
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        { backgroundColor: t.c['surface-raised'], borderRadius: t.r.lg, padding: t.sp(4), borderWidth: 1, borderColor: t.c.border, gap: t.sp(2) },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------- Banner

type BannerKind = 'info' | 'success' | 'warning' | 'error';

export function Banner({
  kind = 'info',
  title,
  children,
  action,
}: {
  kind?: BannerKind;
  title?: string;
  children?: ReactNode;
  action?: { label: string; onPress: () => void };
}) {
  const t = useTheme();
  const map: Record<BannerKind, { bg: ColorRole; fg: ColorRole; icon: LucideIcon }> = {
    info: { bg: 'accent-soft', fg: 'accent-ink', icon: Info },
    success: { bg: 'success-soft', fg: 'success', icon: CheckCircle2 },
    warning: { bg: 'warning-soft', fg: 'warning', icon: TriangleAlert },
    error: { bg: 'danger-soft', fg: 'danger', icon: AlertCircle },
  };
  const m = map[kind];
  return (
    <View
      accessibilityRole={kind === 'error' ? 'alert' : 'summary'}
      accessibilityLiveRegion={kind === 'error' ? 'assertive' : 'polite'}
      style={{ flexDirection: 'row', gap: t.sp(3), padding: t.sp(3), borderRadius: t.r.md, backgroundColor: t.c[m.bg], alignItems: 'flex-start' }}
    >
      <m.icon size={20} color={t.c[m.fg]} strokeWidth={1.75} />
      <View style={{ flex: 1, gap: t.sp(1) }}>
        {title ? (
          <T v="sm" weight="600" color={m.fg}>
            {title}
          </T>
        ) : null}
        {children ? (
          <T v="sm" color={m.fg}>
            {children}
          </T>
        ) : null}
      </View>
      {action ? <Button size="sm" variant="ghost" label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------- EmptyState, Skeleton, ErrorState

export function EmptyState({
  title,
  body,
  cta,
  icon: Icon,
}: {
  title: string;
  body?: string;
  cta?: { label: string; onPress: () => void };
  icon?: LucideIcon;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: t.sp(3), paddingVertical: t.sp(8), paddingHorizontal: t.sp(4) }}>
      {Icon ? (
        <View
          importantForAccessibility="no-hide-descendants"
          style={{ width: 64, height: 64, borderRadius: t.r.pill, backgroundColor: t.c.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon size={28} color={t.c['text-muted']} strokeWidth={1.75} />
        </View>
      ) : null}
      <T v="lg" style={{ textAlign: 'center' }} accessibilityRole="header">
        {title}
      </T>
      {body ? (
        <T v="sm" color="text-muted" style={{ textAlign: 'center' }}>
          {body}
        </T>
      ) : null}
      {cta ? <Button label={cta.label} onPress={cta.onPress} center /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={AlertCircle}
      title="Ça n’a pas marché"
      body={message}
      cta={onRetry ? { label: 'Réessayer', onPress: onRetry } : undefined}
    />
  );
}

export function Skeleton({ height = 16, width = '100%', radius }: { height?: number; width?: ViewStyle['width']; radius?: number }) {
  const t = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height, width, borderRadius: radius ?? t.r.sm, backgroundColor: t.c.surface }}
    />
  );
}

export function LoadingCards({ n = 3 }: { n?: number }) {
  const t = useTheme();
  return (
    <View accessibilityLabel="Chargement" accessibilityRole="progressbar" style={{ gap: t.sp(3) }}>
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} height={96} radius={t.r.lg} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- ProgressBar

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const t = useTheme();
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value }}
      style={{ height: 4, borderRadius: t.r.pill, backgroundColor: t.c.border, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: t.c.accent }} />
    </View>
  );
}

// ---------------------------------------------------------------- ListRow, Switch

export function ListGroup({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ borderRadius: t.r.md, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c['surface-raised'], overflow: 'hidden' }}>
      {children}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  onPress,
  right,
  destructive,
  last,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  destructive?: boolean;
  last?: boolean;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const body = (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        <T color={destructive ? 'danger' : 'text'}>{title}</T>
        {subtitle ? (
          <T v="sm" color="text-muted">
            {subtitle}
          </T>
        ) : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={20} color={t.c['text-muted']} strokeWidth={1.75} /> : null)}
    </>
  );
  const style: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.sp(3),
    minHeight: 52,
    paddingHorizontal: t.sp(4),
    paddingVertical: t.sp(2),
    borderBottomWidth: last ? 0 : 1,
    borderBottomColor: t.c.border,
  };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ')}
      style={(s: PState) => [style, s.pressed ? { backgroundColor: t.c.surface } : null, t.focusRing(!!s.focused)]}
    >
      {body}
    </Pressable>
  );
}

export function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const t = useTheme();
  return (
    <RNSwitch
      value={value}
      onValueChange={onChange}
      accessibilityLabel={label}
      trackColor={{ false: t.c['border-input'], true: t.c.accent }}
      thumbColor={t.c['surface-raised']}
      // react-native-web
      {...({ activeThumbColor: t.c['surface-raised'] } as object)}
    />
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.border }} />;
}
