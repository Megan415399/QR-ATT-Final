
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';
import {
  getAvailableEvents,
  type CloudEvent,
} from '@/lib/events';

function formatEventDate(value: string | null): string {
  if (!value) return 'Not specified';

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return 'Not specified';
  }

  return date.toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  });
}

export default function Index() {
  const { user, loading: authLoading } = useAuth();

  const [role, setRole] = useState<Role | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadRole() {
      if (authLoading) return;

      if (!user) {
        if (active) {
          setRole(null);
          setProfileLoading(false);
          setEvents([]);
        }
        return;
      }

      setProfileLoading(true);

      try {
        const profile = await getProfile(user.id);

        if (active) {
          setRole(profile?.role ?? null);
        }
      } catch (error) {
        console.error('Failed to load Home role:', error);

        if (active) {
          setRole(null);
        }
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    }

    void loadRole();

    return () => {
      active = false;
    };
  }, [user?.id, authLoading]);

  const loadEvents = useCallback(async () => {
    if (!user || role !== 'student') {
      setEvents([]);
      setEventsError(false);
      return;
    }

    setEventsLoading(true);
    setEventsError(false);

    try {
      const availableEvents = await getAvailableEvents();
      setEvents(availableEvents);
    } catch (error) {
      console.error('Failed to load available events:', error);
      setEvents([]);
      setEventsError(true);
    } finally {
      setEventsLoading(false);
    }
  }, [user, role]);

  useFocusEffect(
    useCallback(() => {
      void loadEvents();
    }, [loadEvents])
  );

  const isStudent = role === 'student';
  const isTeacher = role === 'teacher';
  const isAdmin = role === 'admin';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerBox}>
          <View style={styles.iconCircle}>
            <Ionicons
              name="school"
              size={32}
              color={COLORS.primary}
            />
          </View>

          <Text style={styles.appTitle}>QR Attendance</Text>

          <Text style={styles.authorText}>
            by: Rongeline Megan B. Cajuelan
          </Text>
        </View>

        {/* Welcome Card */}
        <View style={styles.card}>
          <Text style={styles.cardTag}>
            SCHOOL EVENT SYSTEM
          </Text>

          <Text style={styles.cardTitle}>
            School Event Attendance
          </Text>

          <Text style={styles.cardDescription}>
            {isStudent
              ? 'Record your attendance at school activities by scanning an event QR code. You can also review your attendance history and manage your profile.'
              : isTeacher
                ? 'Create school events, generate event QR codes, and review attendance information for your events.'
                : isAdmin
                  ? 'Manage school events, monitor attendance records, and manage your account.'
                  : 'Welcome to the School Event Attendance System.'}
          </Text>
        </View>

        {/* Student Instructions */}
        {isStudent && (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>
              How to get started
            </Text>

            <Text style={styles.infoText}>
              1. Open Scan QR Code.
            </Text>

            <Text style={styles.infoText}>
              2. Allow camera access when prompted.
            </Text>

            <Text style={styles.infoText}>
              3. Scan the QR code provided for your school event.
            </Text>
          </View>
        )}

        {/* Available Events - Students Only */}
        {isStudent && (
          <View style={styles.eventsSection}>
            <View style={styles.eventsHeader}>
              <View style={styles.eventsHeading}>
                <Ionicons
                  name="calendar-outline"
                  size={22}
                  color={COLORS.primary}
                />
                <Text style={styles.eventsTitle}>
                  Available Events
                </Text>
              </View>

              <Text style={styles.eventsSubtitle}>
                School events that are still open for attendance.
              </Text>
            </View>

            {eventsLoading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator
                  size="small"
                  color={COLORS.primary}
                />
                <Text style={styles.stateText}>
                  Loading available events...
                </Text>
              </View>
            ) : eventsError ? (
              <View style={styles.stateCard}>
                <Ionicons
                  name="alert-circle-outline"
                  size={24}
                  color={COLORS.textSecondary}
                />
                <Text style={styles.stateText}>
                  Could not load events. Please try again later.
                </Text>

                <View style={styles.retryButton}>
                  <AppButton
                    theme="primary"
                    title="Retry"
                    icon="refresh-outline"
                    onPress={() => void loadEvents()}
                  />
                </View>
              </View>
            ) : events.length === 0 ? (
              <View style={styles.stateCard}>
                <Ionicons
                  name="calendar-clear-outline"
                  size={28}
                  color={COLORS.textSecondary}
                />
                <Text style={styles.emptyTitle}>
                  No Available Events
                </Text>
                <Text style={styles.stateText}>
                  There are no open events available at the moment.
                </Text>

                <View style={styles.retryButton}>
                  <AppButton
                    theme="primary"
                    title="Refresh Events"
                    icon="refresh-outline"
                    onPress={() => void loadEvents()}
                  />
                </View>
              </View>
            ) : (
              events.map((event) => (
                <View
                  key={event.id}
                  style={styles.eventCard}
                >
                  <View style={styles.eventTitleRow}>
                    <View style={styles.eventIcon}>
                      <Ionicons
                        name="calendar"
                        size={21}
                        color={COLORS.primary}
                      />
                    </View>

                    <View style={styles.eventTitleContainer}>
                      <Text style={styles.eventTitle}>
                        {event.title}
                      </Text>

                      <Text style={styles.eventCode}>
                        Event Code: {event.event_code}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.eventDetail}>
                    <Ionicons
                      name="time-outline"
                      size={17}
                      color={COLORS.textSecondary}
                    />
                    <Text style={styles.eventDetailText}>
                      Starts: {formatEventDate(event.start_time)}
                    </Text>
                  </View>

                  <View style={styles.eventDetail}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={17}
                      color={COLORS.textSecondary}
                    />
                    <Text style={styles.eventDetailText}>
                      Ends: {formatEventDate(event.end_time)}
                    </Text>
                  </View>

                  {event.venue ? (
                    <View style={styles.eventDetail}>
                      <Ionicons
                        name="location-outline"
                        size={17}
                        color={COLORS.textSecondary}
                      />
                      <Text style={styles.eventDetailText}>
                        {event.venue}
                      </Text>
                    </View>
                  ) : null}

                  {event.description ? (
                    <Text style={styles.eventDescription}>
                      {event.description}
                    </Text>
                  ) : null}

                  <View style={styles.eventStatus}>
                    <View style={styles.statusDot} />
                    <Text style={styles.statusText}>
                      Open for Attendance
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Role-Based Action Buttons */}
        <View style={styles.actionsContainer}>
          {(isTeacher || isAdmin) && (
            <View style={styles.buttonSpacing}>
              <AppButton
                theme="primary"
                title="Create / Manage Events"
                icon="calendar-outline"
                onPress={() => router.push('/teacher')}
              />
            </View>
          )}

          {isStudent && (
            <View style={styles.buttonSpacing}>
              <AppButton
                theme="primary"
                title="Scan QR Code"
                icon="qr-code-outline"
                onPress={() => router.push('/scan')}
              />
            </View>
          )}

          {(isStudent || isTeacher) && (
            <View style={styles.buttonSpacing}>
              <AppButton
                theme="primary"
                title="Attendance History"
                icon="time-outline"
                onPress={() => router.push('/history')}
              />
            </View>
          )}

          {isAdmin && (
            <View style={styles.buttonSpacing}>
              <AppButton
                theme="primary"
                title="Attendance Dashboard"
                icon="stats-chart-outline"
                onPress={() => router.push('/admin')}
              />
            </View>
          )}

          {role !== null && (
            <View style={styles.buttonSpacing}>
              <AppButton
                theme="primary"
                title="My Profile"
                icon="person-outline"
                onPress={() => router.push('/profile')}
              />
            </View>
          )}
        </View>

        {!authLoading && !profileLoading && !role && (
          <Text style={styles.warningText}>
            Your account role could not be loaded. Please sign in again or contact the administrator.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },

  headerBox: {
    alignItems: 'center',
    marginBottom: 20,
  },

  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E4F4EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },

  appTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  authorText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    marginBottom: 20,
  },

  cardTag: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 1,
    marginBottom: 8,
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },

  cardDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
  },

  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
  },

  infoTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },

  infoText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: 6,
  },

  eventsSection: {
    marginBottom: 20,
  },

  eventsHeader: {
    marginBottom: 14,
  },

  eventsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },

  eventsTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  eventsSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },

  eventCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },

  eventTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },

  eventIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E4F4EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  eventTitleContainer: {
    flex: 1,
  },

  eventTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },

  eventCode: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  eventDetail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 9,
  },

  eventDetailText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },

  eventDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginBottom: 10,
  },

  eventStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E4F4EA',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
    marginBottom: 4,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginRight: 7,
  },

  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },

  stateCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },

  stateText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 10,
  },

  retryButton: {
    width: '100%',
    marginTop: 14,
  },

  actionsContainer: {
    gap: 0,
  },

  buttonSpacing: {
    marginBottom: 12,
  },

  warningText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 12,
  },
});
