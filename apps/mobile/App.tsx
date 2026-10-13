import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const timeSlots = ['8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM', '6:00 PM'];
const maximumPeople = 20;
const maximumHours = 12;
type Service = {
  id: string;
  name: string;
  detail: string;
  price: number;
  icon: string;
  color: string;
  area?: string;
};

type BookingResponse = {
  id: string;
};

const getApiBaseUrl = () => {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (configuredUrl) return configuredUrl;

  return Platform.select({
    ios: 'http://localhost:3000/api',
    android: 'http://10.0.2.2:3000/api',
    default: 'http://localhost:3000/api',
  }) ?? 'http://localhost:3000/api';
};

const formatPrice = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    let message = `Request failed (${response.status}).`;
    try {
      const parsed: { message?: string | string[] } = JSON.parse(body);
      message = Array.isArray(parsed.message)
        ? parsed.message.join(' ')
        : parsed.message || message;
    } catch {
      message = `Request failed (${response.status}).`;
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function getDateOptions() {
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setDate(day.getDate() + index);
    return {
      value: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
      weekday: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : weekdays[day.getDay()],
      date: `${day.getDate()} ${months[day.getMonth()]}`,
    };
  });
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function App() {
  const [step, setStep] = useState(0);
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [service, setService] = useState<Service | null>(null);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [isApiConnected, setIsApiConnected] = useState(false);
  const [serviceError, setServiceError] = useState('');
  const [people, setPeople] = useState(1);
  const [hours, setHours] = useState(2);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastBookingId, setLastBookingId] = useState<string | null>(null);
  const total = (service?.price ?? 0) * people * hours;
  const connectionLabel = isLoadingServices ? 'CONNECTING' : isApiConnected ? 'LIVE' : 'OFFLINE';

  const goBack = () => {
    setError('');
    setStep((current) => Math.max(0, current - 1));
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 0) {
        goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [step]);

  useEffect(() => {
    let isMounted = true;

    const loadServices = async () => {
      try {
        const response = await fetchJson<Service[]>(`${getApiBaseUrl()}/services`);
        if (isMounted) {
          setIsApiConnected(true);
          if (response.length === 0) {
            setServiceError('No services are available right now.');
            return;
          }
          setService(response[0]);
          setAvailableServices(response);
        }
      } catch (loadError) {
        if (isMounted) {
          setIsApiConnected(false);
          setServiceError(loadError instanceof Error ? loadError.message : 'Could not load services.');
        }
      } finally {
        if (isMounted) setIsLoadingServices(false);
      }
    };

    loadServices();
    return () => {
      isMounted = false;
    };
  }, []);

  const continueToReview = () => {
    if (!customerName.trim() || !/^\d{10}$/.test(customerPhone.replace(/\D/g, ''))) {
      setError('Enter your name and a valid 10-digit phone number.');
      return;
    }
    if (!date || !time || !address.trim()) {
      setError('Choose a date and time, then add the service address.');
      return;
    }
    setError('');
    setStep(2);
  };

  const confirmRequest = async () => {
    if (!service) {
      setError('Choose an available service before placing your booking.');
      return;
    }
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetchJson<BookingResponse>(`${getApiBaseUrl()}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerName,
          customerPhone,
          serviceId: service.id,
          people,
          hours,
          date,
          time,
          address,
          instructions,
        }),
      });

      setLastBookingId(response.id);
      setStep(3);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not create booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startAgain = () => {
    setStep(0);
    setService(availableServices[0] ?? null);
    setPeople(1);
    setHours(2);
    setCustomerName('');
    setCustomerPhone('');
    setDate('');
    setTime('');
    setAddress('');
    setInstructions('');
    setError('');
    setLastBookingId(null);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          {step > 0 ? (
            <Pressable
              accessibilityLabel="Go back"
              accessibilityRole="button"
              onPress={goBack}
              style={styles.backButton}
              hitSlop={8}
            >
              <Text style={styles.backArrow}>‹</Text>
            </Pressable>
          ) : (
            <View style={styles.brandMark}><Text style={styles.brandLetter}>T</Text></View>
          )}
          <View>
            <Text style={styles.brandName}>Taskly</Text>
            <Text style={styles.brandCaption}>HELP, ON YOUR TERMS</Text>
          </View>
          <View style={styles.connectionBadge}>
            <View style={[styles.connectionDot, !isApiConnected && !isLoadingServices && styles.connectionDotOffline]} />
            <Text style={styles.connectionText}>{connectionLabel}</Text>
          </View>
        </View>

        {step < 3 ? (
          <View style={styles.progressRow}>
            {['Service', 'Details', 'Review'].map((label, index) => (
              <View key={label} style={styles.progressItem}>
                <View style={[styles.progressTrack, index <= step && styles.progressTrackActive]} />
                <Text style={[styles.progressLabel, index === step && styles.progressLabelActive]}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {step === 0 ? (
          <>
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>YOUR DAY, A LITTLE EASIER</Text>
              <Text style={styles.title}>Good help makes{'\n'}all the difference.</Text>
              <Text style={styles.subtitle}>Choose a service and we’ll help you find the right people for the job.</Text>
            </View>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>What do you need help with?</Text>
              <Text style={styles.sectionHint}>{isLoadingServices ? 'Loading services…' : 'Choose one service'}</Text>
            </View>

            <View style={styles.serviceList}>
              {availableServices.map((item) => {
                const selected = service?.id === item.id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={item.id}
                    onPress={() => setService(item)}
                    style={[styles.serviceCard, selected && styles.serviceCardSelected]}
                  >
                    <View style={[styles.serviceIcon, { backgroundColor: item.color }]}>
                      <Text style={styles.serviceIconText}>{item.icon}</Text>
                    </View>
                    <View style={styles.serviceCopy}>
                      <Text style={styles.serviceName}>{item.name}</Text>
                      <Text style={styles.serviceDetail}>{item.detail}</Text>
                      <Text style={styles.servicePrice}>{formatPrice(item.price)} <Text style={styles.priceUnit}>/ person / hour</Text></Text>
                    </View>
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {serviceError ? <Text accessibilityRole="alert" style={styles.error}>{serviceError}</Text> : null}
            <View style={styles.trustNote}>
              <Text style={styles.trustIcon}>✓</Text>
              <Text style={styles.trustText}>One booking can bring your whole team together.</Text>
            </View>
            <PrimaryButton disabled={isLoadingServices || availableServices.length === 0} label="Continue" onPress={() => setStep(1)} />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={styles.eyebrow}>YOUR BOOKING</Text>
            <Text style={styles.title}>Let’s plan the details.</Text>
            <Text style={styles.subtitle}>Tell us when and where your team is needed.</Text>

            <View style={styles.sectionCard}>
              <Text style={styles.fieldLabel}>YOUR DETAILS</Text>
              <TextInput
                accessibilityLabel="Your name"
                autoCapitalize="words"
                onChangeText={(value) => { setCustomerName(value); setError(''); }}
                placeholder="Full name"
                placeholderTextColor="#9aa39a"
                style={styles.input}
                value={customerName}
              />
              <TextInput
                accessibilityLabel="Phone number"
                keyboardType="phone-pad"
                maxLength={14}
                onChangeText={(value) => { setCustomerPhone(value); setError(''); }}
                placeholder="10-digit mobile number"
                placeholderTextColor="#9aa39a"
                style={[styles.input, styles.phoneInput]}
                value={customerPhone}
              />
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionCardHeader}>
                <View>
                  <Text style={styles.fieldLabel}>SELECTED SERVICE</Text>
                  <Text style={styles.selectedService}>{service?.name}</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => setStep(0)} hitSlop={8}>
                  <Text style={styles.editLink}>Change</Text>
                </Pressable>
              </View>
              <View style={styles.ratePill}><Text style={styles.rateText}>{formatPrice(service?.price ?? 0)} / person / hour</Text></View>
              <View style={styles.counterRow}>
                <View style={styles.counterCopy}>
                  <Text style={styles.counterLabel}>People needed</Text>
                  <Text style={styles.counterHint}>Book your team in one order</Text>
                </View>
                <Counter label="people" value={people} minimum={1} maximum={maximumPeople} onChange={setPeople} />
              </View>
              <View style={styles.counterRow}>
                <View style={styles.counterCopy}>
                  <Text style={styles.counterLabel}>Duration</Text>
                  <Text style={styles.counterHint}>How long will you need help?</Text>
                </View>
                <Counter label="hours" value={hours} minimum={1} maximum={maximumHours} onChange={setHours} />
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.fieldLabel}>PICK A DATE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>
                {getDateOptions().map((option) => {
                  const selected = date === option.value;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={option.value}
                      onPress={() => { setDate(option.value); setError(''); }}
                      style={[styles.dateCard, selected && styles.dateCardSelected]}
                    >
                      <Text style={[styles.dateWeekday, selected && styles.dateTextSelected]}>{option.weekday}</Text>
                      <Text style={[styles.dateDay, selected && styles.dateTextSelected]}>{option.date}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={[styles.fieldLabel, styles.timeLabel]}>START TIME</Text>
              <View style={styles.timeList}>
                {timeSlots.map((slot) => {
                  const selected = time === slot;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={slot}
                      onPress={() => { setTime(slot); setError(''); }}
                      style={[styles.timeChip, selected && styles.timeChipSelected]}
                    >
                      <Text style={[styles.timeText, selected && styles.timeTextSelected]}>{slot}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.fieldLabel}>SERVICE ADDRESS</Text>
              <TextInput
                accessibilityLabel="Service address"
                autoCapitalize="words"
                onChangeText={(value) => { setAddress(value); setError(''); }}
                placeholder="House / building, street, area"
                placeholderTextColor="#9aa39a"
                returnKeyType="next"
                style={styles.input}
                value={address}
              />
              <Text style={[styles.fieldLabel, styles.instructionLabel]}>NOTES FOR YOUR TEAM <Text style={styles.optional}>(OPTIONAL)</Text></Text>
              <TextInput
                accessibilityLabel="Notes for your team"
                multiline
                onChangeText={setInstructions}
                placeholder="Anything the providers should know?"
                placeholderTextColor="#9aa39a"
                style={[styles.input, styles.multilineInput]}
                value={instructions}
              />
            </View>

            <View style={styles.estimateCard}>
              <View style={styles.estimateTop}>
                <View>
                  <Text style={styles.estimateLabel}>ESTIMATED TOTAL</Text>
                  <Text style={styles.estimateFormula}>{formatPrice(service?.price ?? 0)} × {people} people × {hours} {hours === 1 ? 'hour' : 'hours'}</Text>
                </View>
                <Text style={styles.estimateAmount}>{formatPrice(total)}</Text>
              </View>
              <Text style={styles.estimateFootnote}>Estimate only. Final price is confirmed before payment.</Text>
            </View>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <PrimaryButton label="Review booking" onPress={continueToReview} />
            <Text style={styles.disclaimer}>No payment is taken in this preview.</Text>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.eyebrow}>FINAL CHECK</Text>
            <Text style={styles.title}>Does everything look right?</Text>
            <Text style={styles.subtitle}>You can go back and make changes before confirming.</Text>
            <View style={styles.sectionCard}>
              <View style={styles.reviewHeader}>
                <View style={[styles.reviewIcon, { backgroundColor: service?.color ?? '#e9f1e5' }]}><Text style={styles.serviceIconText}>{service?.icon}</Text></View>
                <View style={styles.reviewServiceCopy}>
                  <Text style={styles.reviewMain}>{service?.name}</Text>
                  <Text style={styles.reviewSub}>{formatPrice(service?.price ?? 0)} / person / hour</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => setStep(0)} hitSlop={8}>
                  <Text style={styles.editLink}>Edit</Text>
                </Pressable>
              </View>

              <View style={styles.divider} />
              <View style={styles.reviewLine}>
                <Text style={styles.reviewIconLabel}>♙</Text>
                <View style={styles.reviewLineCopy}>
                  <Text style={styles.reviewLabel}>CUSTOMER</Text>
                  <Text style={styles.reviewValue}>{customerName} · {customerPhone}</Text>
                </View>
              </View>
              <View style={styles.reviewLine}>
                <Text style={styles.reviewIconLabel}>♙</Text>
                <View style={styles.reviewLineCopy}>
                  <Text style={styles.reviewLabel}>TEAM SIZE & DURATION</Text>
                  <Text style={styles.reviewValue}>{people} {people === 1 ? 'person' : 'people'} · {hours} {hours === 1 ? 'hour' : 'hours'}</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => setStep(1)} hitSlop={8}>
                  <Text style={styles.editLink}>Edit</Text>
                </Pressable>
              </View>
              <View style={styles.reviewLine}>
                <Text style={styles.reviewIconLabel}>◷</Text>
                <View style={styles.reviewLineCopy}>
                  <Text style={styles.reviewLabel}>DATE & TIME</Text>
                  <Text style={styles.reviewValue}>{formatDate(date)} · {time}</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => setStep(1)} hitSlop={8}>
                  <Text style={styles.editLink}>Edit</Text>
                </Pressable>
              </View>
              <View style={styles.reviewLine}>
                <Text style={styles.reviewIconLabel}>⌖</Text>
                <View style={styles.reviewLineCopy}>
                  <Text style={styles.reviewLabel}>SERVICE ADDRESS</Text>
                  <Text style={styles.reviewValue}>{address}</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => setStep(1)} hitSlop={8}>
                  <Text style={styles.editLink}>Edit</Text>
                </Pressable>
              </View>
              {instructions.trim() ? (
                <View style={styles.notesBox}>
                  <Text style={styles.reviewLabel}>NOTE FOR THE TEAM</Text>
                  <Text style={styles.reviewValue}>{instructions}</Text>
                </View>
              ) : null}
              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <View>
                  <Text style={styles.totalTitle}>Estimated total</Text>
                  <Text style={styles.reviewSub}>Taxes or fees may apply</Text>
                </View>
                <Text style={styles.estimateAmount}>{formatPrice(total)}</Text>
              </View>
            </View>
            <View style={styles.paymentNote}>
              <Text style={styles.paymentIcon}>i</Text>
              <Text style={styles.paymentText}>Your booking will be saved. Payment is not collected in this version.</Text>
            </View>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <PrimaryButton disabled={isSubmitting} label={isSubmitting ? 'Submitting…' : 'Confirm booking'} onPress={confirmRequest} />
          </>
        ) : null}

        {step === 3 ? (
          <View style={styles.confirmation}>
            <View style={styles.successIcon}><Text style={styles.successCheck}>✓</Text></View>
            <Text style={styles.eyebrow}>REQUEST SAVED</Text>
            <Text style={styles.confirmTitle}>Your booking request is saved.</Text>
            <Text style={styles.confirmText}>
              {lastBookingId ? `Booking reference: ${lastBookingId}. ` : ''}Your {service?.name.toLowerCase()} request is pending for {people} {people === 1 ? 'person' : 'people'} on {formatDate(date)} at {time}.
            </Text>
            <View style={styles.confirmCard}>
              <View style={styles.confirmTop}>
                <View style={[styles.reviewIcon, { backgroundColor: service?.color ?? '#e9f1e5' }]}><Text style={styles.serviceIconText}>{service?.icon}</Text></View>
                <View>
                  <Text style={styles.reviewMain}>{service?.name}</Text>
                  <Text style={styles.reviewSub}>{people} {people === 1 ? 'person' : 'people'} · {hours} {hours === 1 ? 'hour' : 'hours'}</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <Text style={styles.reviewLabel}>WHEN</Text>
              <Text style={styles.reviewValue}>{formatDate(date)} at {time}</Text>
              <Text style={[styles.reviewLabel, styles.confirmAddressLabel]}>WHERE</Text>
              <Text style={styles.reviewValue}>{address}</Text>
              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalTitle}>Estimated total</Text>
                <Text style={styles.estimateAmount}>{formatPrice(total)}</Text>
              </View>
            </View>
            <PrimaryButton label="Start a new request" onPress={startAgain} />
            <Text style={styles.disclaimer}>Preview only · Nothing was sent or charged.</Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Counter({
  label,
  value,
  minimum,
  maximum,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.counterControls}>
      <Pressable
        accessibilityLabel={`Decrease ${label}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: value <= minimum }}
        disabled={value <= minimum}
        onPress={() => onChange(value - 1)}
        style={[styles.counterButton, value <= minimum && styles.counterButtonDisabled]}
      >
        <Text style={styles.counterButtonText}>−</Text>
      </Pressable>
      <Text style={styles.counterValue}>{value}</Text>
      <Pressable
        accessibilityLabel={`Increase ${label}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: value >= maximum }}
        disabled={value >= maximum}
        onPress={() => onChange(value + 1)}
        style={[styles.counterButton, value >= maximum && styles.counterButtonDisabled]}
      >
        <Text style={styles.counterButtonText}>+</Text>
      </Pressable>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primaryButton, disabled && styles.primaryButtonDisabled]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
      <Text style={styles.primaryButtonArrow}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f6f1' },
  content: { flexGrow: 1, paddingHorizontal: 21, paddingTop: 52, paddingBottom: 36 },
  topBar: { alignItems: 'center', flexDirection: 'row', marginBottom: 27 },
  brandMark: { alignItems: 'center', backgroundColor: '#244c38', borderRadius: 11, height: 39, justifyContent: 'center', marginRight: 10, width: 39 },
  brandLetter: { color: '#fff', fontSize: 19, fontWeight: '700' },
  brandName: { color: '#1b3024', fontSize: 15, fontWeight: '700', letterSpacing: 0.1 },
  brandCaption: { color: '#8a958a', fontSize: 8, fontWeight: '700', letterSpacing: 1.3, marginTop: 3 },
  connectionBadge: { alignItems: 'center', backgroundColor: '#e9eee6', borderRadius: 20, flexDirection: 'row', marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 7 },
  connectionDot: { backgroundColor: '#6e936a', borderRadius: 4, height: 7, marginRight: 6, width: 7 },
  connectionDotOffline: { backgroundColor: '#bd6b54' },
  connectionText: { color: '#557052', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  backButton: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#e7eae4', borderRadius: 12, borderWidth: 1, height: 39, justifyContent: 'center', marginRight: 10, width: 39 },
  backArrow: { color: '#244c38', fontSize: 31, lineHeight: 34, marginTop: -3 },
  progressRow: { flexDirection: 'row', gap: 12, marginBottom: 31 },
  progressItem: { flex: 1 },
  progressTrack: { backgroundColor: '#e3e7df', borderRadius: 5, height: 4, marginBottom: 8 },
  progressTrackActive: { backgroundColor: '#477354' },
  progressLabel: { color: '#a0a79f', fontSize: 10, fontWeight: '500' },
  progressLabelActive: { color: '#3e6549', fontWeight: '700' },
  hero: { backgroundColor: '#e9efe4', borderRadius: 22, marginBottom: 25, overflow: 'hidden', paddingHorizontal: 20, paddingTop: 21, paddingBottom: 23 },
  eyebrow: { color: '#557a59', fontSize: 10, fontWeight: '700', letterSpacing: 1.35, marginBottom: 11 },
  title: { color: '#1d3526', fontSize: 31, fontWeight: '700', letterSpacing: -0.8, lineHeight: 38, marginBottom: 9 },
  subtitle: { color: '#6c796e', fontSize: 13, lineHeight: 20, marginBottom: 21 },
  sectionHeading: { marginBottom: 13 },
  sectionTitle: { color: '#26362a', fontSize: 15, fontWeight: '700' },
  sectionHint: { color: '#899389', fontSize: 11, marginTop: 4 },
  serviceList: { gap: 10, marginBottom: 14 },
  serviceCard: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#e6e9e3', borderRadius: 16, borderWidth: 1, flexDirection: 'row', padding: 14 },
  serviceCardSelected: { borderColor: '#648a68', borderWidth: 1.5, backgroundColor: '#fcfdfb' },
  serviceIcon: { alignItems: 'center', borderRadius: 13, height: 47, justifyContent: 'center', marginRight: 12, width: 47 },
  serviceIconText: { color: '#3f6849', fontSize: 23, fontWeight: '600' },
  serviceCopy: { flex: 1 },
  serviceName: { color: '#26362a', fontSize: 14, fontWeight: '700', marginBottom: 3 },
  serviceDetail: { color: '#808a80', fontSize: 10, marginBottom: 7 },
  servicePrice: { color: '#416b4c', fontSize: 12, fontWeight: '700' },
  priceUnit: { color: '#929a91', fontSize: 9, fontWeight: '400' },
  radio: { alignItems: 'center', borderColor: '#cbd3ca', borderRadius: 10, borderWidth: 1, height: 19, justifyContent: 'center', marginLeft: 8, width: 19 },
  radioSelected: { borderColor: '#4f7956' },
  radioDot: { backgroundColor: '#4f7956', borderRadius: 5, height: 9, width: 9 },
  trustNote: { alignItems: 'center', flexDirection: 'row', marginBottom: 14, paddingHorizontal: 3 },
  trustIcon: { alignItems: 'center', backgroundColor: '#e4ede1', borderRadius: 10, color: '#4f7956', fontSize: 12, fontWeight: '700', height: 20, overflow: 'hidden', paddingTop: 3, textAlign: 'center', width: 20 },
  trustText: { color: '#788378', fontSize: 11, marginLeft: 8 },
  primaryButton: { alignItems: 'center', backgroundColor: '#244c38', borderRadius: 14, flexDirection: 'row', justifyContent: 'center', marginTop: 7, minHeight: 53, paddingHorizontal: 18 },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  primaryButtonArrow: { color: '#dcebdd', fontSize: 19, marginLeft: 10 },
  disclaimer: { color: '#9aa198', fontSize: 10, lineHeight: 15, marginTop: 12, textAlign: 'center' },
  sectionCard: { backgroundColor: '#fff', borderColor: '#e7eae4', borderRadius: 16, borderWidth: 1, marginBottom: 12, padding: 15 },
  sectionCardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  fieldLabel: { color: '#90998f', fontSize: 9, fontWeight: '700', letterSpacing: 1.1, marginBottom: 8 },
  selectedService: { color: '#293a2d', fontSize: 14, fontWeight: '700' },
  editLink: { color: '#4a7653', fontSize: 11, fontWeight: '700' },
  ratePill: { alignSelf: 'flex-start', backgroundColor: '#edf3ea', borderRadius: 7, marginTop: 9, marginBottom: 4, paddingHorizontal: 9, paddingVertical: 6 },
  rateText: { color: '#557657', fontSize: 10, fontWeight: '600' },
  counterRow: { alignItems: 'center', borderTopColor: '#eff1ed', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 59 },
  counterCopy: { flex: 1 },
  counterLabel: { color: '#344437', fontSize: 12, fontWeight: '600' },
  counterHint: { color: '#929a91', fontSize: 10, marginTop: 3 },
  counterControls: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  counterButton: { alignItems: 'center', backgroundColor: '#edf3ea', borderRadius: 9, height: 31, justifyContent: 'center', width: 31 },
  counterButtonDisabled: { backgroundColor: '#f3f4f2', opacity: 0.7 },
  counterButtonText: { color: '#416b4c', fontSize: 19, lineHeight: 23 },
  counterValue: { color: '#293a2d', fontSize: 13, fontWeight: '700', minWidth: 18, textAlign: 'center' },
  dateList: { gap: 8, paddingRight: 3 },
  dateCard: { alignItems: 'center', backgroundColor: '#fafbf9', borderColor: '#e7eae4', borderRadius: 12, borderWidth: 1, minWidth: 66, paddingHorizontal: 9, paddingVertical: 10 },
  dateCardSelected: { backgroundColor: '#244c38', borderColor: '#244c38' },
  dateWeekday: { color: '#879187', fontSize: 9, fontWeight: '600', marginBottom: 5 },
  dateDay: { color: '#344437', fontSize: 11, fontWeight: '700' },
  dateTextSelected: { color: '#fff' },
  timeLabel: { marginTop: 18 },
  timeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { alignItems: 'center', backgroundColor: '#fafbf9', borderColor: '#e7eae4', borderRadius: 9, borderWidth: 1, minWidth: '30%', paddingHorizontal: 9, paddingVertical: 10 },
  timeChipSelected: { backgroundColor: '#edf3ea', borderColor: '#66866a' },
  timeText: { color: '#6c796e', fontSize: 10, fontWeight: '600' },
  timeTextSelected: { color: '#416b4c' },
  input: { backgroundColor: '#fafbf9', borderColor: '#e7eae4', borderRadius: 10, borderWidth: 1, color: '#293a2d', fontSize: 12, minHeight: 45, paddingHorizontal: 12 },
  phoneInput: { marginTop: 9 },
  instructionLabel: { marginTop: 17 },
  optional: { color: '#adb3ab', fontSize: 8, fontWeight: '500' },
  multilineInput: { minHeight: 67, paddingTop: 12, textAlignVertical: 'top' },
  estimateCard: { backgroundColor: '#e9efe4', borderRadius: 14, marginBottom: 10, padding: 15 },
  estimateTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  estimateLabel: { color: '#557454', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  estimateFormula: { color: '#7d897c', fontSize: 9, marginTop: 5 },
  estimateAmount: { color: '#254a34', fontSize: 19, fontWeight: '700' },
  estimateFootnote: { borderTopColor: '#dce6d8', borderTopWidth: 1, color: '#869184', fontSize: 9, marginTop: 11, paddingTop: 8 },
  error: { color: '#a44338', fontSize: 11, marginBottom: 5, textAlign: 'center' },
  reviewHeader: { alignItems: 'center', flexDirection: 'row' },
  reviewIcon: { alignItems: 'center', borderRadius: 11, height: 42, justifyContent: 'center', marginRight: 11, width: 42 },
  reviewServiceCopy: { flex: 1 },
  reviewMain: { color: '#293a2d', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  reviewSub: { color: '#818b81', fontSize: 10, lineHeight: 16 },
  divider: { backgroundColor: '#edf0ec', height: 1, marginVertical: 14 },
  reviewLine: { alignItems: 'flex-start', flexDirection: 'row', marginBottom: 18 },
  reviewIconLabel: { color: '#65806a', fontSize: 17, textAlign: 'center', width: 28 },
  reviewLineCopy: { flex: 1, paddingRight: 5 },
  reviewLabel: { color: '#90998f', fontSize: 8, fontWeight: '700', letterSpacing: 0.9, marginBottom: 5 },
  reviewValue: { color: '#39483c', fontSize: 11, lineHeight: 17 },
  notesBox: { backgroundColor: '#f7f8f5', borderRadius: 9, marginTop: -3, padding: 11 },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  totalTitle: { color: '#293a2d', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  paymentNote: { alignItems: 'flex-start', backgroundColor: '#f0f2ed', borderRadius: 11, flexDirection: 'row', marginBottom: 11, padding: 12 },
  paymentIcon: { alignItems: 'center', backgroundColor: '#e1e9de', borderRadius: 8, color: '#557454', fontSize: 10, fontWeight: '700', height: 18, overflow: 'hidden', paddingTop: 2, textAlign: 'center', width: 18 },
  paymentText: { color: '#788378', flex: 1, fontSize: 10, lineHeight: 15, marginLeft: 9 },
  confirmation: { flex: 1, justifyContent: 'center', paddingBottom: 24, paddingTop: 30 },
  successIcon: { alignItems: 'center', backgroundColor: '#e2eddf', borderColor: '#d1e1ce', borderRadius: 30, borderWidth: 1, height: 60, justifyContent: 'center', marginBottom: 23, width: 60 },
  successCheck: { color: '#416b4c', fontSize: 28, fontWeight: '600' },
  confirmTitle: { color: '#1d3526', fontSize: 29, fontWeight: '700', letterSpacing: -0.7, marginBottom: 9 },
  confirmText: { color: '#6c796e', fontSize: 13, lineHeight: 20, marginBottom: 21 },
  confirmCard: { backgroundColor: '#fff', borderColor: '#e7eae4', borderRadius: 16, borderWidth: 1, marginBottom: 13, padding: 15 },
  confirmTop: { alignItems: 'center', flexDirection: 'row' },
  confirmAddressLabel: { marginTop: 12 },
});
