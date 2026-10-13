import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useQuery } from '../data';
import { ErrorState, LoadingCards, Screen } from '../ui';

/** Entry gate: welcome -> questionnaire -> goal -> home. */
export default function Index() {
  const q = useQuery(async (api) => {
    const me = await api.me();
    if (!me) return '/welcome' as const;
    if (!me.onboarded) return '/onboarding' as const;
    const plan = await api.plan();
    return plan ? ('/home' as const) : ('/goal' as const);
  });
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
        <View style={{ height: 48 }} />
        <LoadingCards />
      </Screen>
    );
  }
  return <Redirect href={q.data} />;
}
