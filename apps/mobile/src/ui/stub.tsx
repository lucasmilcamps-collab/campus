import { Hammer } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { EmptyState, Screen } from './core';

/** A screen that has its route but not its build yet. Says so plainly, and which milestone it's in. */
export function StubScreen({ id, title, milestone, body }: { id: string; title: string; milestone: 3 | 4; body: string }) {
  const router = useRouter();
  return (
    <Screen testID={`stub-${id}`}>
      <EmptyState
        icon={Hammer}
        title={title}
        body={`${body}\n\nCet écran arrive au jalon ${milestone}.`}
        cta={router.canGoBack() ? { label: 'Retour', onPress: () => router.back() } : undefined}
      />
    </Screen>
  );
}
