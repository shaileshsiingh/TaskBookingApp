import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

type ProviderStatusScreenProps = {
  error: string;
  name: string;
  verified: boolean;
  onSignOut: () => void;
};

export default function ProviderStatusScreen({
  error,
  name,
  verified,
  onSignOut,
}: ProviderStatusScreenProps) {
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.brandMark}>
        <Text style={styles.brandLetter}>T</Text>
      </View>
      <Text style={styles.brandName}>Taskly</Text>
      <Text style={styles.eyebrow}>PROVIDER ACCOUNT</Text>
      <Text style={styles.title}>Welcome, {name}.</Text>
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>
          {verified ? 'Provider verified' : 'Application received'}
        </Text>
        <Text style={styles.statusText}>
          {verified
            ? 'Your account is verified. Provider job tools are the next part of the app to build.'
            : 'An administrator needs to review your services before you can receive bookings.'}
        </Text>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Pressable accessibilityRole="button" onPress={onSignOut} style={styles.button}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#f7f8f5',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: '#244c38',
    borderRadius: 13,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  brandLetter: { color: '#fff', fontSize: 20, fontWeight: '700' },
  brandName: {
    color: '#244c38',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
  },
  eyebrow: {
    color: '#6f826c',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginTop: 42,
  },
  title: {
    color: '#1d3526',
    fontSize: 29,
    fontWeight: '700',
    letterSpacing: -0.7,
    marginTop: 9,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderColor: '#e7eae4',
    borderRadius: 15,
    borderWidth: 1,
    marginTop: 21,
    padding: 17,
  },
  statusTitle: { color: '#254a34', fontSize: 14, fontWeight: '700' },
  statusText: { color: '#6c796e', fontSize: 12, lineHeight: 18, marginTop: 7 },
  error: { color: '#a44338', fontSize: 11, lineHeight: 16, marginTop: 12 },
  button: {
    alignItems: 'center',
    backgroundColor: '#244c38',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 48,
  },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
