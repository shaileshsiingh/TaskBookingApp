import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
};

type CustomerBooking = {
  id: string;
  serviceName: string;
  people: number;
  hours: number;
  date: string;
  time: string;
  address: string;
  instructions?: string;
  estimatedTotal: number;
  status: string;
  assignments: CustomerAssignment[];
};

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
                  <Text style={styles.serviceName}>{booking.serviceName}</Text>
                  <Text style={styles.bookingDate}>
                    {booking.date} · {booking.time}
                  </Text>
                </View>
                <Text style={styles.orderStatus}>
                  {orderStatusLabels[booking.status] ?? booking.status}
                </Text>
              </View>
              <Text style={styles.detail}>
                {booking.people} {booking.people === 1 ? 'provider' : 'providers'}
                {' · '}{booking.hours} {booking.hours === 1 ? 'hour' : 'hours'}
                {' · '}₹{booking.estimatedTotal.toLocaleString('en-IN')}
              </Text>
              <Text style={styles.address}>{booking.address}</Text>
              {booking.instructions ? (
                <Text style={styles.instructions}>
                  Note: {booking.instructions}
                </Text>
              ) : null}

              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Provider progress</Text>
              {booking.assignments.length === 0 ? (
                <Text style={styles.emptyText}>
                  No provider has been assigned yet. Refresh to check for updates.
                </Text>
              ) : (
                booking.assignments.map((assignment) => (
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
