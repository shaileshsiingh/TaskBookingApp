import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { apiBaseUrl, fetchJson } from './lib/api';
import { authClient } from './lib/auth-client';

type AccountRole = 'CUSTOMER' | 'PROVIDER';

type Service = {
  id: string;
  name: string;
};

export type AuthProfileInput = {
  name: string;
  phone: string;
  role: AccountRole;
  serviceArea?: string;
  serviceIds?: string[];
};

type AuthScreenProps = {
  initialError?: string;
  onAuthenticated: (input?: AuthProfileInput) => Promise<void>;
};

const emailPasswordMode = process.env.EXPO_PUBLIC_AUTH_MODE === 'email';

export default function AuthScreen({
  initialError = '',
  onAuthenticated,
}: AuthScreenProps) {
  const [role, setRole] = useState<AccountRole>('CUSTOMER');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignIn, setIsSignIn] = useState(false);
  const [profileSetupRequired, setProfileSetupRequired] = useState(false);
  const [code, setCode] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [error, setError] = useState(initialError);

  useEffect(() => {
    if (role !== 'PROVIDER' || services.length > 0) return;

    let isMounted = true;
    setIsLoadingServices(true);
    fetchJson<Service[]>(`${apiBaseUrl}/services`)
      .then((availableServices) => {
        if (isMounted) setServices(availableServices);
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Could not load available services.',
          );
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingServices(false);
      });

    return () => {
      isMounted = false;
    };
  }, [role, services.length]);

  const phoneNumber = `+91${phone}`;
  const providerDetailsValid =
    role === 'CUSTOMER' ||
    (serviceArea.trim().length > 0 && selectedServiceIds.length > 0);

  const sendCode = async () => {
    setError('');
    if (!name.trim()) {
      setError('Enter your name.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (role === 'PROVIDER' && !providerDetailsValid) {
      setError('Enter your service area and choose at least one service.');
      return;
    }

    setIsSendingCode(true);
    try {
      const result = await authClient.phoneNumber.sendOtp({ phoneNumber });
      if (result.error) throw new Error(result.error.message);
      setIsCodeSent(true);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'Could not send a verification code. Please try again.',
      );
    } finally {
      setIsSendingCode(false);
    }
  };

  const finishSignIn = async () => {
    await onAuthenticated({
      name: name.trim(),
      phone: phoneNumber,
      role,
      ...(role === 'PROVIDER'
        ? { serviceArea: serviceArea.trim(), serviceIds: selectedServiceIds }
        : {}),
    });
  };

  const submitEmailPassword = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email address and password.');
      return;
    }
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }

    if (!isSignIn || profileSetupRequired) {
      if (!name.trim()) {
        setError('Enter your name.');
        return;
      }
      if (!/^[6-9]\d{9}$/.test(phone)) {
        setError('Enter a valid 10-digit Indian mobile number.');
        return;
      }
      if (role === 'PROVIDER' && !providerDetailsValid) {
        setError('Enter your service area and choose at least one service.');
        return;
      }
    }

    setIsVerifying(true);
    try {
      if (isSignIn && !profileSetupRequired) {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (result.error) throw new Error(result.error.message);
        try {
          await onAuthenticated();
        } catch (profileError) {
          setProfileSetupRequired(true);
          throw profileError;
        }
        return;
      }

      if (!profileSetupRequired) {
        const result = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim(),
        });
        if (result.error) throw new Error(result.error.message);
        setProfileSetupRequired(true);
      }
      await finishSignIn();
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : 'Could not sign in. Please check your details and try again.',
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const verifyCode = async () => {
    setError('');
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit verification code.');
      return;
    }

    setIsVerifying(true);
    try {
      if (!isPhoneVerified) {
        const result = await authClient.phoneNumber.verify({
          phoneNumber,
          code,
          name: name.trim(),
        });
        if (result.error) throw new Error(result.error.message);
        setIsPhoneVerified(true);
      }
      await finishSignIn();
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : 'Could not verify the code. Please try again.',
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((selected) =>
      selected.includes(serviceId)
        ? selected.filter((id) => id !== serviceId)
        : [...selected, serviceId],
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandMark}>
          <Text style={styles.brandLetter}>T</Text>
        </View>
        <Text style={styles.brandName}>Taskly</Text>
        <Text style={styles.eyebrow}>SIGN IN OR CREATE AN ACCOUNT</Text>
        <Text style={styles.title}>A better day starts here.</Text>
        <Text style={styles.subtitle}>
          {emailPasswordMode
            ? 'Use your email and password to continue.'
            : 'Verify your mobile number with a one-time code.'}
        </Text>

        {emailPasswordMode ? (
          <View style={styles.roleRow}>
            {([
              [false, 'Create account'],
              [true, 'Sign in'],
            ] as const).map(([signIn, label]) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSignIn === signIn }}
                key={label}
                onPress={() => {
                  setIsSignIn(signIn);
                  setProfileSetupRequired(false);
                  setError('');
                }}
                style={[
                  styles.roleButton,
                  isSignIn === signIn && styles.roleSelected,
                ]}
              >
                <Text
                  style={[
                    styles.roleText,
                    isSignIn === signIn && styles.roleTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {!emailPasswordMode || !isSignIn || profileSetupRequired ? (
          <View style={styles.roleRow}>
            {([
              ['CUSTOMER', 'I need help'],
              ['PROVIDER', 'I provide services'],
            ] as const).map(([value, label]) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: role === value }}
                key={value}
                onPress={() => {
                  setRole(value);
                  setError('');
                }}
                style={[styles.roleButton, role === value && styles.roleSelected]}
              >
                <Text
                  style={[
                    styles.roleText,
                    role === value && styles.roleTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          {emailPasswordMode ? (
            <>
              {(!isSignIn || profileSetupRequired) ? (
                <>
                  <Text style={styles.fieldLabel}>YOUR NAME</Text>
                  <TextInput
                    accessibilityLabel="Your name"
                    autoCapitalize="words"
                    onChangeText={setName}
                    placeholder="Full name"
                    placeholderTextColor="#9aa39a"
                    style={styles.input}
                    value={name}
                  />
                  <Text style={styles.fieldLabel}>MOBILE NUMBER</Text>
                  <View style={styles.phoneRow}>
                    <Text style={styles.countryCode}>+91</Text>
                    <TextInput
                      accessibilityLabel="10-digit mobile number"
                      autoComplete="tel-national"
                      keyboardType="phone-pad"
                      maxLength={10}
                      onChangeText={(value: string) => {
                        const digits = value.replace(/\D/g, '');
                        setPhone(digits.length > 10 ? digits.slice(-10) : digits);
                      }}
                      placeholder="10-digit number"
                      placeholderTextColor="#9aa39a"
                      style={styles.phoneInput}
                      value={phone}
                    />
                  </View>
                </>
              ) : null}
              <Text style={styles.fieldLabel}>EMAIL</Text>
              <TextInput
                accessibilityLabel="Email address"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#9aa39a"
                style={styles.input}
                value={email}
              />
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <TextInput
                accessibilityLabel="Password"
                autoCapitalize="none"
                autoComplete={isSignIn ? 'current-password' : 'new-password'}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor="#9aa39a"
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>YOUR NAME</Text>
              <TextInput
                accessibilityLabel="Your name"
                autoCapitalize="words"
                editable={!isPhoneVerified}
                onChangeText={setName}
                placeholder="Full name"
                placeholderTextColor="#9aa39a"
                style={styles.input}
                value={name}
              />

              <Text style={styles.fieldLabel}>MOBILE NUMBER</Text>
              <View style={styles.phoneRow}>
                <Text style={styles.countryCode}>+91</Text>
                <TextInput
                  accessibilityLabel="10-digit mobile number"
                  autoComplete="tel-national"
                  editable={!isCodeSent}
                  keyboardType="phone-pad"
                  maxLength={10}
                  onChangeText={(value: string) => {
                    const digits = value.replace(/\D/g, '');
                    setPhone(digits.length > 10 ? digits.slice(-10) : digits);
                  }}
                  placeholder="10-digit number"
                  placeholderTextColor="#9aa39a"
                  style={styles.phoneInput}
                  value={phone}
                />
              </View>
            </>
          )}

          {(!emailPasswordMode || !isSignIn || profileSetupRequired) &&
          role === 'PROVIDER' ? (
            <>
              <Text style={styles.fieldLabel}>SERVICE AREA</Text>
              <TextInput
                accessibilityLabel="Service area"
                autoCapitalize="words"
                onChangeText={setServiceArea}
                placeholder="Area or city where you work"
                placeholderTextColor="#9aa39a"
                style={styles.input}
                value={serviceArea}
              />
              <Text style={styles.fieldLabel}>SERVICES YOU PROVIDE</Text>
              {isLoadingServices ? (
                <ActivityIndicator color="#416b4c" style={styles.loader} />
              ) : (
                <View style={styles.serviceList}>
                  {services.map((service) => {
                    const selected = selectedServiceIds.includes(service.id);
                    return (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        key={service.id}
                        onPress={() => toggleService(service.id)}
                        style={[
                          styles.serviceOption,
                          selected && styles.serviceOptionSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.serviceOptionText,
                            selected && styles.serviceOptionTextSelected,
                          ]}
                        >
                          {selected ? '✓  ' : '+  '}
                          {service.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </>
          ) : null}

          {isCodeSent ? (
            <>
              <Text style={styles.fieldLabel}>6-DIGIT CODE</Text>
              <TextInput
                accessibilityLabel="6-digit verification code"
                autoComplete="one-time-code"
                editable={!isPhoneVerified}
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={(value: string) => setCode(value.replace(/\D/g, ''))}
                placeholder="Enter the code from SMS"
                placeholderTextColor="#9aa39a"
                style={styles.input}
                value={code}
              />
            </>
          ) : null}
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        {emailPasswordMode ? (
          <PrimaryButton
            disabled={isVerifying || isLoadingServices}
            label={
              isVerifying
                ? 'Please wait…'
                : profileSetupRequired
                  ? 'Finish account setup'
                  : isSignIn
                    ? 'Sign in'
                    : 'Create account'
            }
            onPress={() => void submitEmailPassword()}
          />
        ) : !isCodeSent ? (
          <PrimaryButton
            disabled={isSendingCode || isLoadingServices}
            label={isSendingCode ? 'Sending code…' : 'Send verification code'}
            onPress={sendCode}
          />
        ) : (
          <>
            <PrimaryButton
              disabled={isVerifying}
              label={
                isVerifying
                  ? 'Please wait…'
                  : isPhoneVerified
                    ? 'Finish account setup'
                    : 'Verify and continue'
              }
              onPress={verifyCode}
            />
            {!isPhoneVerified ? (
              <Pressable
                accessibilityRole="button"
                onPress={sendCode}
                style={styles.resendButton}
              >
                <Text style={styles.resendText}>Send a new code</Text>
              </Pressable>
            ) : null}
          </>
        )}

        <Text style={styles.footnote}>
          {emailPasswordMode
            ? 'Testing only: this mode does not verify your contact phone number. Do not use it with production data.'
            : role === 'PROVIDER'
              ? 'New provider accounts are reviewed by an administrator before they can receive bookings.'
              : 'By continuing, you confirm that you can receive SMS messages on this number.'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PrimaryButton({
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
      style={[styles.primaryButton, disabled && styles.buttonDisabled]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f7f8f5', flex: 1 },
  content: { flexGrow: 1, padding: 22, paddingBottom: 36, paddingTop: 56 },
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
    marginTop: 36,
  },
  title: {
    color: '#1d3526',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.7,
    marginTop: 9,
  },
  subtitle: { color: '#6c796e', fontSize: 13, lineHeight: 20, marginTop: 8 },
  roleRow: { flexDirection: 'row', gap: 9, marginTop: 24 },
  roleButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e7eae4',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 13,
  },
  roleSelected: { backgroundColor: '#edf3ea', borderColor: '#66866a' },
  roleText: { color: '#6c796e', fontSize: 12, fontWeight: '600' },
  roleTextSelected: { color: '#416b4c' },
  card: {
    backgroundColor: '#fff',
    borderColor: '#e7eae4',
    borderRadius: 15,
    borderWidth: 1,
    marginTop: 15,
    padding: 15,
  },
  fieldLabel: {
    color: '#829082',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 7,
    marginTop: 14,
  },
  input: {
    backgroundColor: '#fafbf9',
    borderColor: '#e7eae4',
    borderRadius: 10,
    borderWidth: 1,
    color: '#293a2d',
    fontSize: 13,
    minHeight: 45,
    paddingHorizontal: 12,
  },
  phoneRow: {
    alignItems: 'center',
    backgroundColor: '#fafbf9',
    borderColor: '#e7eae4',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 45,
    paddingHorizontal: 12,
  },
  countryCode: {
    borderRightColor: '#e7eae4',
    borderRightWidth: 1,
    color: '#416b4c',
    fontSize: 13,
    fontWeight: '600',
    marginRight: 12,
    paddingRight: 12,
  },
  phoneInput: { color: '#293a2d', flex: 1, fontSize: 13, paddingVertical: 10 },
  serviceList: { gap: 8 },
  serviceOption: {
    backgroundColor: '#fafbf9',
    borderColor: '#e7eae4',
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  serviceOptionSelected: { backgroundColor: '#edf3ea', borderColor: '#66866a' },
  serviceOptionText: { color: '#6c796e', fontSize: 12, fontWeight: '600' },
  serviceOptionTextSelected: { color: '#416b4c' },
  loader: { marginVertical: 12 },
  error: {
    color: '#a44338',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#244c38',
    borderRadius: 12,
    marginTop: 16,
    minHeight: 50,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.55 },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  resendButton: { alignItems: 'center', paddingVertical: 14 },
  resendText: { color: '#416b4c', fontSize: 12, fontWeight: '600' },
  footnote: {
    color: '#879187',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 18,
    textAlign: 'center',
  },
});
