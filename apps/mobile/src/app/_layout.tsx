import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DataProvider } from '../data';
import { ThemeProvider, useTheme } from '../theme';

function Nav() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.c.bg },
          headerTintColor: t.c.text,
          headerTitleStyle: { fontSize: t.type('lg').fontSize, fontWeight: '600' },
          headerShadowVisible: false,
          headerBackTitle: 'Retour',
          contentStyle: { backgroundColor: t.c.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding/index" options={{ title: 'Faisons connaissance' }} />
        <Stack.Screen name="onboarding/strava" options={{ title: 'Importer ton historique' }} />
        <Stack.Screen name="onboarding/level" options={{ title: 'Ton niveau' }} />
        <Stack.Screen name="goal" options={{ title: 'Ton objectif' }} />
        <Stack.Screen name="plan-setup" options={{ title: 'Ton plan' }} />
        <Stack.Screen name="paywall" options={{ title: 'Offre Entraînement', presentation: 'modal' }} />
        <Stack.Screen name="session/[id]/index" options={{ title: 'Séance' }} />
        <Stack.Screen name="session/[id]/export" options={{ title: 'Envoyer sur la montre', presentation: 'modal' }} />
        <Stack.Screen name="session/[id]/run" options={{ title: 'Course en cours', headerShown: false }} />
        <Stack.Screen name="session/[id]/feedback" options={{ title: 'Ton ressenti', presentation: 'modal' }} />
        <Stack.Screen name="session/[id]/move" options={{ title: 'Déplacer la séance', presentation: 'modal' }} />
        <Stack.Screen name="activity/new" options={{ title: 'Ajouter une activité', presentation: 'modal' }} />
        <Stack.Screen name="activity/[id]" options={{ title: 'Résumé' }} />
        <Stack.Screen name="journal" options={{ title: 'Journal' }} />
        <Stack.Screen name="stats" options={{ title: 'Progression' }} />
        <Stack.Screen name="race/[id]" options={{ title: 'Course' }} />
        <Stack.Screen name="learn/[slug]" options={{ title: 'Comprendre' }} />
        <Stack.Screen name="community" options={{ title: 'Communauté' }} />
        <Stack.Screen name="challenges" options={{ title: 'Défis' }} />
        <Stack.Screen name="settings/connections" options={{ title: 'Applications connectées' }} />
        <Stack.Screen name="reevaluate" options={{ title: 'Mettre à jour mon niveau' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <DataProvider>
          <Nav />
        </DataProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
