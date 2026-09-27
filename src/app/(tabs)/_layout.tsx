import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useColors } from '@/theme';

export default function TabLayout() {
  const colors = useColors();
  return (
    <NativeTabs tintColor={colors.accent}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scan">
        <NativeTabs.Trigger.Label>Scan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'camera', selected: 'camera.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="binders">
        <NativeTabs.Trigger.Label>Binders</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="ellipsis" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
