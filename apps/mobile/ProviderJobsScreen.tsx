import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { apiBaseUrl, fetchJson } from './lib/api';
import { authClient } from './lib/auth-client';

type AssignmentStatus =
  | 'offered'
  | 'accepted'
  | 'on_the_way'
  | 'arrived'
  | 'started'
  | 'completed'
  | 'rejected'
  | 'cancelled'
  | 'replacement_required';

type ProviderAssignment = {
  id: string;
  status: AssignmentStatus;
  serviceName: string;
  customerName: string;
  date: string;
  time: string;
  address: string;
  instructions?: string;
  hours?: number;
};

type ProviderJobsScreenProps = {
  error: string;
  initialAvailable: boolean;
  name: string;
  onSignOut: () => void;
};

type Earnings = {
  totalJobsCompleted: number;
  totalEarnings: number;
};

const statusLabels: Record<AssignmentStatus, string> = {
  offered: 'New request',
  accepted: 'Accepted',
  on_the_way: 'On the way',
  arrived: 'Arrived',
  started: 'In progress',
  completed: 'Completed',
  rejected: 'Declined',
  cancelled: 'Cancelled',
  replacement_required: 'Replacement needed',
};

const nextAction: Partial<
  Record<AssignmentStatus, { status: AssignmentStatus; label: string }>
> = {
  accepted: { status: 'on_the_way', label: 'On my way' },
  on_the_way: { status: 'arrived', label: 'I have arrived' },
  arrived: { status: 'started', label: 'Start job' },
  started: { status: 'completed', label: 'Complete job' },
};

const cancellableStatuses = new Set<AssignmentStatus>([
  'accepted',
  'on_the_way',
  'arrived',
]);

async function authenticatedFetch<T>(url: string, init?: RequestInit) {
  const cookie = await authClient.getCookie();
  if (!cookie) throw new Error('Your sign-in session expired. Sign in again.');
  return fetchJson<T>(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      cookie,
    },
  });
}

export default function ProviderJobsScreen({
  error: authError,
  initialAvailable,
  name,
  onSignOut,
}: ProviderJobsScreenProps) {
  const [jobs, setJobs] = useState<ProviderAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState(authError);
  const [isAvailable, setIsAvailable] = useState(initialAvailable);
  const [isTogglingAvailability, setIsTogglingAvailability] = useState(false);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [otpDrafts, setOtpDrafts] = useState<Record<string, string>>({});

  const loadJobs = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError('');
    try {
      const result = await authenticatedFetch<ProviderAssignment[]>(
        `${apiBaseUrl}/provider/assignments`,
      );
      setJobs(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load your assigned jobs.',
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const loadEarnings = useCallback(async () => {
    try {
      setEarnings(await authenticatedFetch<Earnings>(`${apiBaseUrl}/provider/earnings`));
    } catch {
      // Earnings are a nice-to-have summary; a failed fetch just leaves the card hidden.
    }
  }, []);

  useEffect(() => {
    void loadJobs();
    void loadEarnings();
  }, [loadJobs, loadEarnings]);

  const toggleAvailability = async (value: boolean) => {
    setIsAvailable(value);
    setIsTogglingAvailability(true);
    setError('');
    try {
      await authenticatedFetch(`${apiBaseUrl}/provider/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: value }),
      });
    } catch (toggleError) {
      setIsAvailable(!value);
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Could not update your availability. Please try again.',
      );
    } finally {
      setIsTogglingAvailability(false);
    }
  };

  const confirmCancelJob = (job: ProviderAssignment) => {
    Alert.alert(
      'Cancel this job?',
      'The platform will try to find a replacement provider for the customer.',
      [
        { text: 'Keep job', style: 'cancel' },
        {
          text: 'Cancel job',
          style: 'destructive',
          onPress: () => void updateStatus(job, 'cancelled'),
        },
      ],
    );
  };

  const updateStatus = async (
    job: ProviderAssignment,
    status: AssignmentStatus,
    otp?: string,
  ) => {
    setUpdatingId(job.id);
    setError('');
    try {
      await authenticatedFetch<{ id: string; status: AssignmentStatus }>(
        `${apiBaseUrl}/provider/assignments/${encodeURIComponent(job.id)}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(otp ? { status, otp } : { status }),
        },
      );
      setOtpDrafts((current) => {
        const { [job.id]: _removed, ...rest } = current;
        return rest;
      });
      await loadJobs(true);
      if (status === 'completed') await loadEarnings();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'Could not update this job. Please try again.',
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Text style={styles.brandLetter}>T</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.brandName}>Taskly</Text>
            <Text style={styles.eyebrow}>PROVIDER JOBS</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onSignOut}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>

        <Text style={styles.title}>Hello, {name}.</Text>
        <Text style={styles.subtitle}>
          Review your assigned work and keep each job status up to date.
        </Text>

        <View style={styles.availabilityRow}>
          <View style={styles.availabilityCopy}>
            <Text style={styles.availabilityTitle}>
              {isAvailable ? 'Available for new jobs' : 'Not taking new jobs'}
            </Text>
            <Text style={styles.availabilityHint}>
              Turn this off when you are done for the day.
            </Text>
          </View>
          <Switch
            disabled={isTogglingAvailability}
            onValueChange={(value) => void toggleAvailability(value)}
            value={isAvailable}
          />
        </View>

        {earnings ? (
          <View style={styles.earningsCard}>
            <View>
              <Text style={styles.earningsLabel}>JOBS COMPLETED</Text>
              <Text style={styles.earningsValue}>{earnings.totalJobsCompleted}</Text>
            </View>
            <View>
              <Text style={styles.earningsLabel}>TOTAL EARNINGS</Text>
              <Text style={styles.earningsValue}>
                ₹{earnings.totalEarnings.toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your jobs</Text>
          <Pressable
            accessibilityRole="button"
            disabled={isRefreshing || isLoading}
            onPress={() => void loadJobs(true)}
          >
            <Text style={styles.refresh}>
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </Text>
          </Pressable>
        </View>

        {authError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {authError}
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        {isLoading ? (
          <ActivityIndicator color="#416b4c" style={styles.loader} />
        ) : jobs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No assigned jobs yet</Text>
            <Text style={styles.emptyText}>
              New assignments from the admin team will appear here.
            </Text>
          </View>
        ) : (
          jobs.map((job) => {
            const action = nextAction[job.status];
            const isUpdating = updatingId === job.id;
            return (
              <View key={job.id} style={styles.jobCard}>
                <View style={styles.jobTop}>
                  <View style={styles.jobHeading}>
                    <Text style={styles.jobName}>{job.serviceName}</Text>
                    <Text style={styles.customer}>For {job.customerName}</Text>
                  </View>
                  <Text
                    style={[
                      styles.status,
                      job.status === 'offered' && styles.offeredStatus,
                    ]}
                  >
                    {statusLabels[job.status]}
                  </Text>
                </View>
                <Text style={styles.detail}>
                  {job.date} · {job.time}
                  {job.hours ? ` · ${job.hours} hr` : ''}
                </Text>
                <Text style={styles.address}>{job.address}</Text>
                {job.instructions ? (
                  <Text style={styles.instructions}>
                    Note: {job.instructions}
                  </Text>
                ) : null}
                {job.status === 'offered' ? (
                  <View style={styles.offerActions}>
                    <ActionButton
                      disabled={isUpdating}
                      label={isUpdating ? 'Please wait…' : 'Accept job'}
                      onPress={() => void updateStatus(job, 'accepted')}
                    />
                    <Pressable
                      accessibilityRole="button"
                      disabled={isUpdating}
                      onPress={() => void updateStatus(job, 'rejected')}
                      style={styles.declineButton}
                    >
                      <Text style={styles.declineText}>Decline</Text>
                    </Pressable>
                  </View>
                ) : job.status === 'arrived' ? (
                  <View style={styles.otpBox}>
                    <Text style={styles.otpLabel}>
                      Ask the customer for their start code
                    </Text>
                    <TextInput
                      accessibilityLabel="Customer start code"
                      keyboardType="number-pad"
                      maxLength={4}
                      onChangeText={(value) =>
                        setOtpDrafts((current) => ({
                          ...current,
                          [job.id]: value.replace(/\D/g, ''),
                        }))
                      }
                      placeholder="4-digit code"
                      placeholderTextColor="#9aa39a"
                      style={styles.otpInput}
                      value={otpDrafts[job.id] ?? ''}
                    />
                    <ActionButton
                      disabled={isUpdating || (otpDrafts[job.id] ?? '').length !== 4}
                      label={isUpdating ? 'Please wait…' : 'Start job'}
                      onPress={() =>
                        void updateStatus(job, 'started', otpDrafts[job.id])
                      }
                    />
                  </View>
                ) : action ? (
                  <ActionButton
                    disabled={isUpdating}
                    label={isUpdating ? 'Please wait…' : action.label}
                    onPress={() => void updateStatus(job, action.status)}
                  />
                ) : null}
                {cancellableStatuses.has(job.status) ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={isUpdating}
                    onPress={() => confirmCancelJob(job)}
                    style={styles.cancelJobButton}
                  >
                    <Text style={styles.declineText}>Cancel job</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function ActionButton({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionButton, disabled && styles.disabled]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f7f8f5', flex: 1 },
  content: { padding: 22, paddingBottom: 40, paddingTop: 56 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  brandMark: {
    alignItems: 'center',
    backgroundColor: '#244c38',
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  brandLetter: { color: '#fff', fontSize: 20, fontWeight: '700' },
  headerText: { flex: 1 },
  brandName: { color: '#244c38', fontSize: 16, fontWeight: '700' },
  eyebrow: {
    color: '#6f826c',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 3,
  },
  signOut: { color: '#557454', fontSize: 11, fontWeight: '700' },
  title: {
    color: '#1d3526',
    fontSize: 29,
    fontWeight: '700',
    letterSpacing: -0.7,
    marginTop: 35,
  },
  subtitle: { color: '#6c796e', fontSize: 12, lineHeight: 18, marginTop: 7 },
  availabilityRow: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e7eae4',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    padding: 15,
  },
  availabilityCopy: { flex: 1 },
  availabilityTitle: { color: '#254a34', fontSize: 13, fontWeight: '700' },
  availabilityHint: { color: '#6c796e', fontSize: 10, marginTop: 3 },
  earningsCard: {
    backgroundColor: '#244c38',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 24,
    marginTop: 12,
    padding: 15,
  },
  earningsLabel: {
    color: '#b9ccb9',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  earningsValue: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 4 },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 29,
  },
  sectionTitle: { color: '#1d3526', fontSize: 17, fontWeight: '700' },
  refresh: { color: '#416b4c', fontSize: 12, fontWeight: '700' },
  loader: { marginTop: 34 },
  error: {
    backgroundColor: '#fff4f1',
    borderRadius: 10,
    color: '#a44338',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
    padding: 12,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderColor: '#e7eae4',
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
  },
  emptyTitle: { color: '#254a34', fontSize: 14, fontWeight: '700' },
  emptyText: { color: '#6c796e', fontSize: 12, lineHeight: 18, marginTop: 6 },
  jobCard: {
    backgroundColor: '#fff',
    borderColor: '#e7eae4',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 15,
  },
  jobTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  jobHeading: { flex: 1 },
  jobName: { color: '#254a34', fontSize: 15, fontWeight: '700' },
  customer: { color: '#6c796e', fontSize: 11, marginTop: 4 },
  status: {
    backgroundColor: '#edf3ea',
    borderRadius: 20,
    color: '#416b4c',
    fontSize: 9,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  offeredStatus: { backgroundColor: '#fff2db', color: '#875b11' },
  detail: { color: '#6c796e', fontSize: 11, marginTop: 14 },
  address: { color: '#293a2d', fontSize: 12, lineHeight: 18, marginTop: 7 },
  instructions: {
    color: '#6c796e',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 7,
  },
  offerActions: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 14 },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#244c38',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 43,
    paddingHorizontal: 12,
  },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  declineButton: { paddingHorizontal: 10, paddingVertical: 12 },
  declineText: { color: '#a44338', fontSize: 12, fontWeight: '700' },
  cancelJobButton: {
    alignItems: 'center',
    borderColor: '#e7c4ba',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 40,
  },
  otpBox: { marginTop: 14 },
  otpLabel: { color: '#6c796e', fontSize: 11, marginBottom: 8 },
  otpInput: {
    backgroundColor: '#fafbf9',
    borderColor: '#e7eae4',
    borderRadius: 10,
    borderWidth: 1,
    color: '#293a2d',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 4,
    minHeight: 45,
    paddingHorizontal: 14,
    textAlign: 'center',
  },
});
