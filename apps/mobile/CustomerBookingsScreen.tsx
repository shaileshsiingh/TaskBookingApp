import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { apiBaseUrl, fetchJson } from './lib/api';
import { authClient } from './lib/auth-client';
import { connectRealtime } from './lib/realtime';

type ProviderReview = {
  rating: number;
  comment: string | null;
} | null;

type CustomerAssignment = {
  id: string;
  providerName: string;
  status: string;
  customerConfirmed: boolean;
  review: ProviderReview;
  startOtp?: string;
};

type CustomerRequirement = {
  id: string;
  serviceName: string;
  people: number;
  status: string;
  assignments: CustomerAssignment[];
};

type CustomerBooking = {
  id: string;
  hours: number;
  date: string;
  time: string;
  address: string;
  instructions?: string;
  estimatedTotal: number;
  status: string;
  disputeReason?: string;
  resolutionNote?: string;
  refundAmount?: number;
  requirements: CustomerRequirement[];
};

const uncancellableStatuses = new Set([
  'completed',
  'cancelled',
  'partially_completed',
  'disputed',
  'refunded',
  'failed',
]);

type CustomerBookingsScreenProps = {
  error: string;
  name: string;
  onBack: () => void;
};

const orderStatusLabels: Record<string, string> = {
  pending: 'Finding providers',
  confirmed: 'Confirmed',
  partially_assigned: 'Partly assigned',
  assigned: 'Provider assigned',
  accepted: 'Accepted',
  on_the_way: 'On the way',
  arrived: 'Arrived',
  in_progress: 'In progress',
  partially_completed: 'Partly completed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Needs attention',
  reassignment_required: 'Finding a replacement',
  disputed: 'Under review',
  refunded: 'Refunded',
};

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

export default function CustomerBookingsScreen({
  error: authError,
  name,
  onBack,
}: CustomerBookingsScreenProps) {
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [disputeReasons, setDisputeReasons] = useState<Record<string, string>>({});
  const [submittingDisputeId, setSubmittingDisputeId] = useState<string | null>(null);
  const [error, setError] = useState(authError);

  const loadBookings = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError('');
    try {
      setBookings(
        await authenticatedFetch<CustomerBooking[]>(
          `${apiBaseUrl}/customer/bookings`,
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load your bookings.',
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    let isMounted = true;
    let disconnect: (() => void) | undefined;

    void connectRealtime(() => void loadBookings(true)).then((cleanup) => {
      if (isMounted) disconnect = cleanup;
      else cleanup();
    });

    return () => {
      isMounted = false;
      disconnect?.();
    };
  }, [loadBookings]);

  const updateAssignment = async (
    assignmentId: string,
    action: 'confirm' | 'review',
  ) => {
    setUpdatingId(assignmentId);
    setError('');
    try {
      if (action === 'confirm') {
        await authenticatedFetch(
          `${apiBaseUrl}/customer/assignments/${encodeURIComponent(assignmentId)}/confirmation`,
          { method: 'PATCH' },
        );
      } else {
        const rating = ratings[assignmentId];
        if (!rating) {
          setError('Choose a star rating before submitting.');
          return;
        }
        await authenticatedFetch(
          `${apiBaseUrl}/customer/assignments/${encodeURIComponent(assignmentId)}/review`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rating,
              comment: comments[assignmentId] ?? '',
            }),
          },
        );
      }
      await loadBookings(true);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'Could not update this booking. Please try again.',
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const cancelBooking = (bookingId: string) => {
    Alert.alert(
      'Cancel this booking?',
      'A cancellation fee may apply if the scheduled time is close.',
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: () => void performCancellation(bookingId),
        },
      ],
    );
  };

  const performCancellation = async (bookingId: string) => {
    setCancellingId(bookingId);
    setError('');
    try {
      await authenticatedFetch(
        `${apiBaseUrl}/customer/orders/${encodeURIComponent(bookingId)}/cancellation`,
        { method: 'PATCH' },
      );
      await loadBookings(true);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : 'Could not cancel this booking. Please try again.',
      );
    } finally {
      setCancellingId(null);
    }
  };

  const submitDispute = async (bookingId: string) => {
    const reason = (disputeReasons[bookingId] ?? '').trim();
    if (!reason) {
      setError('Describe the issue before submitting.');
      return;
    }
    setSubmittingDisputeId(bookingId);
    setError('');
    try {
      await authenticatedFetch(
        `${apiBaseUrl}/customer/orders/${encodeURIComponent(bookingId)}/dispute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      );
      setReportingId(null);
      setDisputeReasons((current) => {
        const { [bookingId]: _removed, ...rest } = current;
        return rest;
      });
      await loadBookings(true);
    } catch (disputeError) {
      setError(
        disputeError instanceof Error
          ? disputeError.message
          : 'Could not submit your report. Please try again.',
      );
    } finally {
      setSubmittingDisputeId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to services"
            accessibilityRole="button"
            onPress={onBack}
            style={styles.backButton}
          >
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.brandName}>Taskly</Text>
            <Text style={styles.eyebrow}>YOUR BOOKINGS</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={isRefreshing || isLoading}
            onPress={() => void loadBookings(true)}
          >
            <Text style={styles.refresh}>
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.title}>Your bookings, {name}.</Text>
        <Text style={styles.subtitle}>
          Follow provider updates and confirm each job when it is complete.
        </Text>

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
        ) : bookings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No bookings yet</Text>
            <Text style={styles.emptyText}>
              Your confirmed service requests will appear here.
            </Text>
          </View>
        ) : (
          bookings.map((booking) => (
            <View key={booking.id} style={styles.bookingCard}>
              <View style={styles.bookingTop}>
                <View style={styles.bookingTitleCopy}>
                  <Text style={styles.bookingDate}>
                    {booking.date} · {booking.time}
                  </Text>
                </View>
                <Text style={styles.orderStatus}>
                  {orderStatusLabels[booking.status] ?? booking.status}
                </Text>
              </View>
              <Text style={styles.detail}>
                {booking.hours} {booking.hours === 1 ? 'hour' : 'hours'}
                {' · '}₹{booking.estimatedTotal.toLocaleString('en-IN')}
              </Text>
              <Text style={styles.address}>{booking.address}</Text>
              {booking.instructions ? (
                <Text style={styles.instructions}>
                  Note: {booking.instructions}
                </Text>
              ) : null}

              {booking.requirements.map((requirement) => (
                <View key={requirement.id}>
                  <View style={styles.divider} />
                  <View style={styles.bookingTop}>
                    <View style={styles.bookingTitleCopy}>
                      <Text style={styles.serviceName}>
                        {requirement.serviceName} · {requirement.people}{' '}
                        {requirement.people === 1 ? 'provider' : 'providers'}
                      </Text>
                    </View>
                    <Text style={styles.orderStatus}>
                      {orderStatusLabels[requirement.status] ?? requirement.status}
                    </Text>
                  </View>
                  <Text style={styles.sectionTitle}>Provider progress</Text>
                  {requirement.assignments.length === 0 ? (
                    <Text style={styles.emptyText}>
                      No provider has been assigned yet. Refresh to check for updates.
                    </Text>
                  ) : (
                    requirement.assignments.map((assignment) => (
                      <View key={assignment.id} style={styles.assignment}>
                        <View style={styles.assignmentHeader}>
                          <View style={styles.assignmentCopy}>
                            <Text style={styles.providerName}>
                              {assignment.providerName}
                            </Text>
                            <Text style={styles.assignmentStatus}>
                              {assignment.status.replaceAll('_', ' ')}
                              {assignment.customerConfirmed
                                ? ' · confirmed by you'
                                : ''}
                            </Text>
                          </View>
                        </View>

                        {assignment.status === 'arrived' && assignment.startOtp ? (
                          <View style={styles.otpBox}>
                            <Text style={styles.otpLabel}>
                              Share this code with your provider to start the job
                            </Text>
                            <Text style={styles.otpValue}>{assignment.startOtp}</Text>
                          </View>
                        ) : null}

                        {assignment.status === 'completed' &&
                        !assignment.customerConfirmed ? (
                          <ActionButton
                            disabled={updatingId === assignment.id}
                            label={
                              updatingId === assignment.id
                                ? 'Please wait…'
                                : 'Confirm job completion'
                            }
                            onPress={() =>
                              void updateAssignment(assignment.id, 'confirm')
                            }
                          />
                        ) : null}

                        {assignment.customerConfirmed && !assignment.review ? (
                          <View style={styles.reviewBox}>
                            <Text style={styles.reviewPrompt}>Rate this provider</Text>
                            <View style={styles.stars}>
                              {[1, 2, 3, 4, 5].map((rating) => {
                                const selected =
                                  (ratings[assignment.id] ?? 0) >= rating;
                                return (
                                  <Pressable
                                    accessibilityLabel={`${rating} star${rating === 1 ? '' : 's'}`}
                                    accessibilityRole="button"
                                    accessibilityState={{
                                      selected: ratings[assignment.id] === rating,
                                    }}
                                    key={rating}
                                    onPress={() =>
                                      setRatings((current) => ({
                                        ...current,
                                        [assignment.id]: rating,
                                      }))
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.star,
                                        selected && styles.selectedStar,
                                      ]}
                                    >
                                      ★
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                            <TextInput
                              accessibilityLabel="Optional review comment"
                              maxLength={500}
                              multiline
                              onChangeText={(comment) =>
                                setComments((current) => ({
                                  ...current,
                                  [assignment.id]: comment,
                                }))
                              }
                              placeholder="Optional comment"
                              placeholderTextColor="#9aa39a"
                              style={styles.commentInput}
                              value={comments[assignment.id] ?? ''}
                            />
                            <ActionButton
                              disabled={updatingId === assignment.id}
                              label={
                                updatingId === assignment.id
                                  ? 'Please wait…'
                                  : 'Submit rating'
                              }
                              onPress={() =>
                                void updateAssignment(assignment.id, 'review')
                              }
                            />
                          </View>
                        ) : null}

                        {assignment.review ? (
                          <View style={styles.reviewSubmitted}>
                            <Text style={styles.submittedStars}>
                              {'★'.repeat(assignment.review.rating)}
                              {'☆'.repeat(5 - assignment.review.rating)}
                            </Text>
                            {assignment.review.comment ? (
                              <Text style={styles.instructions}>
                                {assignment.review.comment}
                              </Text>
                            ) : (
                              <Text style={styles.assignmentStatus}>
                                Your rating was submitted.
                              </Text>
                            )}
                          </View>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              ))}

              {!uncancellableStatuses.has(booking.status) ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={cancellingId === booking.id}
                  onPress={() => cancelBooking(booking.id)}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelText}>
                    {cancellingId === booking.id
                      ? 'Cancelling…'
                      : 'Cancel booking'}
                  </Text>
                </Pressable>
              ) : null}

              {booking.status === 'disputed' && booking.disputeReason ? (
                <View style={styles.disputeBox}>
                  <Text style={styles.disputeLabel}>ISSUE REPORTED</Text>
                  <Text style={styles.disputeText}>{booking.disputeReason}</Text>
                  <Text style={styles.disputeStatus}>Our team is reviewing this.</Text>
                </View>
              ) : null}

              {booking.status === 'refunded' ? (
                <View style={styles.disputeBox}>
                  <Text style={styles.disputeLabel}>REFUNDED</Text>
                  {booking.refundAmount ? (
                    <Text style={styles.disputeText}>
                      ₹{booking.refundAmount.toLocaleString('en-IN')} was refunded.
                    </Text>
                  ) : null}
                  {booking.resolutionNote ? (
                    <Text style={styles.disputeStatus}>{booking.resolutionNote}</Text>
                  ) : null}
                </View>
              ) : null}

              {booking.status === 'completed' ? (
                reportingId === booking.id ? (
                  <View style={styles.disputeForm}>
                    <TextInput
                      accessibilityLabel="Describe the issue"
                      maxLength={500}
                      multiline
                      onChangeText={(value) =>
                        setDisputeReasons((current) => ({ ...current, [booking.id]: value }))
                      }
                      placeholder="What went wrong?"
                      placeholderTextColor="#9aa39a"
                      style={styles.disputeInput}
                      value={disputeReasons[booking.id] ?? ''}
                    />
                    <View style={styles.disputeFormActions}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setReportingId(null)}
                        style={styles.disputeCancelButton}
                      >
                        <Text style={styles.disputeCancelText}>Never mind</Text>
                      </Pressable>
                      <ActionButton
                        disabled={submittingDisputeId === booking.id}
                        label={
                          submittingDisputeId === booking.id
                            ? 'Submitting…'
                            : 'Submit report'
                        }
                        onPress={() => void submitDispute(booking.id)}
                      />
                    </View>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setReportingId(booking.id)}
                    style={styles.reportButton}
                  >
                    <Text style={styles.reportText}>Report an issue</Text>
                  </Pressable>
                )
              ) : null}
            </View>
          ))
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
  backButton: {
    alignItems: 'center',
    backgroundColor: '#e9f1e5',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backArrow: { color: '#244c38', fontSize: 29, lineHeight: 32 },
  headerCopy: { flex: 1 },
  brandName: { color: '#244c38', fontSize: 16, fontWeight: '700' },
  eyebrow: {
    color: '#6f826c',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 3,
  },
  refresh: { color: '#416b4c', fontSize: 12, fontWeight: '700' },
  title: {
    color: '#1d3526',
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.6,
    marginTop: 32,
  },
  subtitle: { color: '#6c796e', fontSize: 12, lineHeight: 18, marginTop: 7 },
  loader: { marginTop: 34 },
  error: {
    backgroundColor: '#fff4f1',
    borderRadius: 10,
    color: '#a44338',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
    padding: 12,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderColor: '#e7eae4',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 23,
    padding: 18,
  },
  emptyTitle: { color: '#254a34', fontSize: 14, fontWeight: '700' },
  emptyText: { color: '#6c796e', fontSize: 11, lineHeight: 17, marginTop: 7 },
  bookingCard: {
    backgroundColor: '#fff',
    borderColor: '#e7eae4',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 17,
    padding: 15,
  },
  bookingTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  bookingTitleCopy: { flex: 1 },
  serviceName: { color: '#254a34', fontSize: 15, fontWeight: '700' },
  bookingDate: { color: '#6c796e', fontSize: 11, marginTop: 5 },
  orderStatus: {
    backgroundColor: '#edf3ea',
    borderRadius: 20,
    color: '#416b4c',
    fontSize: 9,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  detail: { color: '#6c796e', fontSize: 11, marginTop: 13 },
  address: { color: '#293a2d', fontSize: 12, lineHeight: 18, marginTop: 6 },
  instructions: { color: '#6c796e', fontSize: 11, lineHeight: 17, marginTop: 7 },
  divider: { backgroundColor: '#edf0ec', height: 1, marginVertical: 14 },
  sectionTitle: { color: '#254a34', fontSize: 12, fontWeight: '700' },
  assignment: {
    borderTopColor: '#edf0ec',
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  assignmentHeader: { alignItems: 'center', flexDirection: 'row' },
  assignmentCopy: { flex: 1 },
  providerName: { color: '#293a2d', fontSize: 12, fontWeight: '700' },
  assignmentStatus: {
    color: '#6c796e',
    fontSize: 10,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#244c38',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 11,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  otpBox: {
    alignItems: 'center',
    backgroundColor: '#edf3ea',
    borderRadius: 10,
    marginTop: 11,
    padding: 12,
  },
  otpLabel: { color: '#557657', fontSize: 10, textAlign: 'center' },
  otpValue: {
    color: '#244c38',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 6,
    marginTop: 6,
  },
  cancelButton: {
    alignItems: 'center',
    borderColor: '#e7c4ba',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 15,
    minHeight: 42,
    justifyContent: 'center',
  },
  cancelText: { color: '#a44338', fontSize: 12, fontWeight: '700' },
  reportButton: {
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 10,
  },
  reportText: { color: '#6c796e', fontSize: 11, fontWeight: '700', textDecorationLine: 'underline' },
  disputeForm: {
    backgroundColor: '#f7f8f5',
    borderRadius: 11,
    marginTop: 12,
    padding: 12,
  },
  disputeInput: {
    backgroundColor: '#fff',
    borderColor: '#e7eae4',
    borderRadius: 9,
    borderWidth: 1,
    color: '#293a2d',
    fontSize: 11,
    minHeight: 70,
    padding: 10,
    textAlignVertical: 'top',
  },
  disputeFormActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  disputeCancelButton: { paddingHorizontal: 4, paddingVertical: 12 },
  disputeCancelText: { color: '#6c796e', fontSize: 11, fontWeight: '700' },
  disputeBox: {
    backgroundColor: '#fff7ea',
    borderRadius: 10,
    marginTop: 12,
    padding: 12,
  },
  disputeLabel: { color: '#8a6113', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  disputeText: { color: '#5c4a26', fontSize: 11, lineHeight: 17, marginTop: 5 },
  disputeStatus: { color: '#8a7b57', fontSize: 10, marginTop: 5 },
  reviewBox: {
    backgroundColor: '#f7f8f5',
    borderRadius: 11,
    marginTop: 11,
    padding: 12,
  },
  reviewPrompt: { color: '#254a34', fontSize: 11, fontWeight: '700' },
  stars: { flexDirection: 'row', gap: 6, marginTop: 8 },
  star: { color: '#c7cec4', fontSize: 29 },
  selectedStar: { color: '#d89b20' },
  commentInput: {
    backgroundColor: '#fff',
    borderColor: '#e7eae4',
    borderRadius: 9,
    borderWidth: 1,
    color: '#293a2d',
    fontSize: 11,
    minHeight: 60,
    marginTop: 8,
    padding: 10,
    textAlignVertical: 'top',
  },
  reviewSubmitted: {
    backgroundColor: '#f7f8f5',
    borderRadius: 10,
    marginTop: 10,
    padding: 10,
  },
  submittedStars: { color: '#d89b20', fontSize: 16 },
});
