import { Tabs } from 'expo-router';
import { CalendarDays, Flag, House, UserRound } from 'lucide-react-native';
import { useTheme } from '../../theme';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.c.bg },
        headerTintColor: t.c.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: t.type('lg').fontSize, fontWeight: '600' },
        tabBarActiveTintColor: t.c.accent,
        tabBarInactiveTintColor: t.c['text-muted'],
        tabBarStyle: { backgroundColor: t.c['surface-raised'], borderTopColor: t.c.border, height: t.layout.tabbar },
        tabBarLabelStyle: { fontSize: t.type('xs').fontSize, fontWeight: '500' },
        sceneStyle: { backgroundColor: t.c.bg },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Accueil', headerShown: false, tabBarIcon: ({ color }) => <House size={24} color={color} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: ({ color }) => <CalendarDays size={24} color={color} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="races" options={{ title: 'Courses', tabBarIcon: ({ color }) => <Flag size={24} color={color} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: ({ color }) => <UserRound size={24} color={color} strokeWidth={1.75} /> }} />
    </Tabs>
  );
}
