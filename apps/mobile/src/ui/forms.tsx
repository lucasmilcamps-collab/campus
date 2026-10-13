import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View, type KeyboardTypeOptions, type PressableStateCallbackType } from 'react-native';
import { Check, Minus, Plus, type LucideIcon } from 'lucide-react-native';
import { keyActivate, useTheme } from '../theme';
import { T } from './core';

type PState = PressableStateCallbackType & { focused?: boolean };

// ---------------------------------------------------------------- ChoiceCard / ChoiceGroup

export interface Choice<V extends string> {
  value: V;
  title: string;
  description?: string;
  icon?: LucideIcon;
  badge?: string;
  disabled?: boolean;
  extra?: ReactNode;
}

export function ChoiceGroup<V extends string>({
  label,
  choices,
  value,
  onChange,
  multi,
  error,
}: {
  label: string;
  choices: Choice<V>[];
  value: V | V[] | null;
  onChange: (v: V) => void;
  multi?: boolean;
  error?: string;
}) {
  const t = useTheme();
  const selected = (v: V) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <View accessibilityRole={multi ? undefined : 'radiogroup'} accessibilityLabel={label} style={{ gap: t.sp(2) }}>
      {choices.map((c) => (
        <ChoiceCard key={c.value} choice={c} selected={selected(c.value)} onPress={() => onChange(c.value)} multi={multi} />
      ))}
      {error ? (
        <T v="xs" color="danger" accessibilityRole="alert">
          {error}
        </T>
      ) : null}
    </View>
  );
}

export function ChoiceCard<V extends string>({
  choice,
  selected,
  onPress,
  multi,
}: {
  choice: Choice<V>;
  selected: boolean;
  onPress: () => void;
  multi?: boolean;
}) {
  const t = useTheme();
  const Icon = choice.icon;
  return (
    <Pressable
      onPress={choice.disabled ? undefined : onPress}
      {...keyActivate(choice.disabled ? undefined : onPress)}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      aria-disabled={!!choice.disabled}
      accessibilityLabel={[choice.title, choice.description, choice.badge].filter(Boolean).join(', ')}
      style={(s: PState) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.sp(3),
          padding: t.sp(4) - (selected ? 1 : 0),
          borderRadius: t.r.md,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? t.c.accent : t.c.border,
          backgroundColor: selected ? t.c['accent-soft'] : t.c['surface-raised'],
          opacity: choice.disabled ? 0.4 : 1,
          transform: [{ scale: s.pressed ? 0.99 : 1 }],
        },
        t.focusRing(!!s.focused),
      ]}
    >
      {Icon ? <Icon size={24} color={selected ? t.c['accent-ink'] : t.c.text} strokeWidth={1.75} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.sp(2), flexWrap: 'wrap' }}>
          <T weight="600" color={selected ? 'accent-ink' : 'text'}>
            {choice.title}
          </T>
          {choice.badge ? (
            <View style={{ backgroundColor: t.c.accent, borderRadius: t.r.pill, paddingHorizontal: t.sp(2), paddingVertical: 2 }}>
              <T v="xs" weight="600" color="on-accent">
                {choice.badge}
              </T>
            </View>
          ) : null}
        </View>
        {choice.description ? (
          <T v="sm" color={selected ? 'accent-ink' : 'text-muted'}>
            {choice.description}
          </T>
        ) : null}
        {choice.extra}
      </View>
      {selected ? <Check size={20} color={t.c.accent} strokeWidth={2} /> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------- Segmented

export function Segmented<V extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: V; label: string; caption?: string }>;
  value: V;
  onChange: (v: V) => void;
}) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: t.c.surface, borderRadius: t.r.md, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            {...keyActivate(() => onChange(o.value))}
            accessibilityRole="radio"
            aria-checked={on}
            accessibilityLabel={[o.label, o.caption].filter(Boolean).join(', ')}
            style={(s: PState) => [
              {
                flex: 1,
                minHeight: t.layout.touch_min,
                borderRadius: t.r.sm,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: t.sp(2),
                backgroundColor: on ? t.c['surface-raised'] : 'transparent',
                borderWidth: on ? 1 : 0,
                borderColor: t.c.border,
              },
              t.focusRing(!!s.focused),
            ]}
          >
            <T weight={on ? '600' : '400'} color={on ? 'text' : 'text-muted'} num>
              {o.label}
            </T>
            {o.caption ? (
              <T v="xs" color="text-muted" num>
                {o.caption}
              </T>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- TextField

export function TextField({
  label,
  value,
  onChange,
  help,
  error,
  placeholder,
  keyboardType,
  multiline,
  autoComplete,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  error?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  autoComplete?: 'email' | 'name' | 'off';
  testID?: string;
}) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: t.sp(1) }}>
      <T v="sm" weight="600" nativeID={`${testID ?? label}-label`}>
        {label}
      </T>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.c['text-muted']}
        keyboardType={keyboardType}
        multiline={multiline}
        autoComplete={autoComplete}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        accessibilityLabel={label}
        accessibilityHint={error ?? help}
        aria-invalid={!!error}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          t.type('base'),
          {
            minHeight: multiline ? 96 : t.layout.touch_min,
            paddingHorizontal: t.sp(4),
            paddingVertical: multiline ? t.sp(3) : 0,
            borderRadius: t.r.md,
            borderWidth: 1,
            borderColor: error ? t.c.danger : focused ? t.c.accent : t.c['border-input'],
            backgroundColor: t.c.bg,
            color: t.c.text,
            textAlignVertical: multiline ? 'top' : 'center',
          },
          t.focusRing(focused),
        ]}
      />
      {error || help ? (
        <T v="xs" color={error ? 'danger' : 'text-muted'} accessibilityLiveRegion={error ? 'polite' : 'none'}>
          {error ?? help}
        </T>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- Stepper (number)

export function NumberStepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = String,
  spoken,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  /** how a screen reader should say the value */
  spoken?: (v: number) => string;
}) {
  const t = useTheme();
  const btn = (Icon: LucideIcon, delta: number, a11y: string) => {
    const disabled = delta < 0 ? value <= min : value >= max;
    return (
      <Pressable
        onPress={() => !disabled && onChange(Math.min(max, Math.max(min, value + delta)))}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        aria-disabled={disabled}
        style={(s: PState) => [
          {
            width: t.layout.touch_min,
            height: t.layout.touch_min,
            borderRadius: t.r.pill,
            backgroundColor: t.c.surface,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.4 : 1,
          },
          t.focusRing(!!s.focused),
        ]}
      >
        <Icon size={20} color={t.c.text} strokeWidth={1.75} />
      </Pressable>
    );
  };
  return (
    <View style={{ gap: t.sp(1) }}>
      <T v="sm" weight="600">
        {label}
      </T>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value, text: (spoken ?? format)(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? step : -step))))}
        style={{ flexDirection: 'row', alignItems: 'center', gap: t.sp(4) }}
      >
        {btn(Minus, -step, `Diminuer ${label.toLowerCase()}`)}
        <T v="lg" num style={{ minWidth: 88, textAlign: 'center' }}>
          {format(value)}
        </T>
        {btn(Plus, step, `Augmenter ${label.toLowerCase()}`)}
      </View>
    </View>
  );
}
