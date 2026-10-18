import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  createEvent,
  getEventsByTeacher,
  updateEventDetails,
  updateEventStatus,
  type CloudEvent,
} from '@/lib/events';
import { buildQRPayload } from '@/lib/qr';
import { getProfile, type Role } from '@/lib/profiles';

function startOfMinute(date: Date) {
  const copy = new Date(date);
  copy.setSeconds(0, 0);
  return copy;
}

function toManilaISO(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00+08:00`
  );
}

function formatDateTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });

  return `${month} ${pad(date.getDate())}, ${date.getFullYear()} at ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function formatCloudDateTime(value: string | null) {
  if (!value) return 'Not set';

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return 'Invalid date';

  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function hasEventEnded(event: CloudEvent) {
  if (!event.end_time) return false;

  const endTime = new Date(event.end_time).getTime();

  return Number.isFinite(endTime) && endTime <= Date.now();
}

const QUICK_END_OPTIONS = [
  { label: '+30 min', ms: 30 * 60 * 1000 },
  { label: '+1 hour', ms: 60 * 60 * 1000 },
  { label: '+2 hours', ms: 2 * 60 * 60 * 1000 },
];

type EditTarget = 'start' | 'end';

export default function TeacherScreen() {
  const { user } = useAuth();
  const scrollRef = useRef<ScrollView>(null);

  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');

  const [startDate, setStartDate] = useState(() =>
    startOfMinute(new Date())
  );
  const [endDate, setEndDate] = useState(() =>
    startOfMinute(new Date(Date.now() + 60 * 60 * 1000))
  );

  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editingPart, setEditingPart] = useState<'date' | 'time'>('date');
  const [payload, setPayload] = useState<string | null>(null);
  const [qrEvent, setQrEvent] = useState<CloudEvent | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);

  const isAndroid = Platform.OS === 'android';

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const showMessage = (text: string, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
    // The message is shown at the top, so scroll up to make it visible.
    scrollToTop();
  };

  const loadEvents = useCallback(async () => {
    if (!user) {
      setEvents([]);
      return;
    }

    setEventsLoading(true);

    try {
      const loadedEvents = await getEventsByTeacher(user.id);
      setEvents(loadedEvents);
    } catch (error) {
      console.error('Could not load events:', error);
      showMessage('Could not load saved events. Please try again.', true);
    } finally {
      setEventsLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadScreen() {
        setRoleLoading(true);

        if (!user) {
          if (active) {
            setRole(null);
            setEvents([]);
            setRoleLoading(false);
          }
          return;
        }

        try {
          const profile = await getProfile(user.id);

          if (!active) return;

          const currentRole = profile?.role ?? null;
          setRole(currentRole);

          if (currentRole === 'teacher' || currentRole === 'admin') {
            setEventsLoading(true);
            const loadedEvents = await getEventsByTeacher(user.id);

            if (active) setEvents(loadedEvents);
          } else if (active) {
            setEvents([]);
          }
        } catch (error) {
          console.error('Teacher screen loading failed:', error);

          if (active) {
            setRole(null);
            showMessage('Could not load your account or events.', true);
          }
        } finally {
          if (active) {
            setEventsLoading(false);
            setRoleLoading(false);
          }
        }
      }

      void loadScreen();

      return () => {
        active = false;
      };
    }, [user])
  );

  const clearResult = () => {
    setPayload(null);
    setQrEvent(null);
    setMessage(null);
    setMessageIsError(false);
  };

  const resetForm = () => {
    setEditingEventId(null);
    setTitle('');
    setEventId('');
    setVenue('');
    setDescription('');
    setStartDate(startOfMinute(new Date()));
    setEndDate(startOfMinute(new Date(Date.now() + 60 * 60 * 1000)));
    setEditTarget(null);
    setEditingPart('date');
    clearResult();
  };

  const openPicker = (target: EditTarget) => {
    setMessage(null);
    setEditTarget(target);
    setEditingPart('date');
  };

  const onPickerChange = (
    event: DateTimePickerEvent,
    selected?: Date
  ) => {
    if (!editTarget) return;

    if (event.type === 'dismissed' || !selected) {
      setEditTarget(null);
      setEditingPart('date');
      return;
    }

    const current = editTarget === 'start' ? startDate : endDate;
    const next = new Date(current);

    if (isAndroid && editingPart === 'date') {
      next.setFullYear(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate()
      );
      next.setSeconds(0, 0);

      if (editTarget === 'start') {
        setStartDate(next);
      } else {
        setEndDate(next);
      }

      setEditingPart('time');
      return;
    }

    if (isAndroid && editingPart === 'time') {
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);

      if (editTarget === 'start') {
        setStartDate(next);
      } else {
        setEndDate(next);
      }

      setEditTarget(null);
      setEditingPart('date');
      return;
    }

    next.setTime(selected.getTime());
    next.setSeconds(0, 0);

    if (editTarget === 'start') {
      setStartDate(next);
    } else {
      setEndDate(next);
    }

    setEditTarget(null);
    setEditingPart('date');
  };

  const handleQuickEnd = (ms: number) => {
    clearResult();
    setEndDate(startOfMinute(new Date(startDate.getTime() + ms)));
  };

  const handleCreateEvent = async () => {
    if (creating) return;

    const cleanedEventId = eventId.trim();
    const cleanedTitle = title.trim();

    if (!cleanedEventId || !cleanedTitle) {
      showMessage('Event title and code are required.', true);
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      showMessage('End time must be after start time.', true);
      return;
    }

    const event = {
      eventId: cleanedEventId,
      title: cleanedTitle,
      start: toManilaISO(startDate),
      end: toManilaISO(endDate),
      venue: venue.trim(),
      description: description.trim(),
    };

    setCreating(true);
    setPayload(null);
    setQrEvent(null);
    setMessage(null);
    setMessageIsError(false);

    try {
      const { error } = await createEvent(event);

      if (error) {
        showMessage(error, true);
        return;
      }

      const nextPayload = buildQRPayload(event);
      setPayload(nextPayload);
      setQrEvent(null);

      showMessage('Event saved successfully! You can now scan the QR code.');
      void loadEvents();
    } catch (error) {
      console.error('Create event or QR generation failed:', error);
      showMessage(
        'The event may have been saved, but QR generation failed. Check Saved Events and try View QR Code.',
        true
      );
    } finally {
      setCreating(false);
    }
  };

  const handleEditEvent = (event: CloudEvent) => {
    const parsedStart = event.start_time ? new Date(event.start_time) : null;
    const parsedEnd = event.end_time ? new Date(event.end_time) : null;

    const startValid = !!parsedStart && Number.isFinite(parsedStart.getTime());
    const endValid = !!parsedEnd && Number.isFinite(parsedEnd.getTime());

    // If the event has no valid time, start with default times
    // (start = now, end = +1 hour) so it can still be edited.
    const nextStart = startValid
      ? startOfMinute(parsedStart as Date)
      : startOfMinute(new Date());

    const nextEnd = endValid
      ? startOfMinute(parsedEnd as Date)
      : startOfMinute(new Date(nextStart.getTime() + 60 * 60 * 1000));

    setEditingEventId(event.id);
    setTitle(event.title);
    setEventId(event.event_code);
    setVenue(event.venue ?? '');
    setDescription(event.description ?? '');
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setEditTarget(null);
    setEditingPart('date');
    setPayload(null);
    setQrEvent(null);

    if (!startValid || !endValid) {
      showMessage(
        `Editing: ${event.title}. This event had no start/end time, so default times were filled in. Please set the correct times, then save.`
      );
    } else {
      showMessage(`Editing event: ${event.title}`);
    }
  };

  const handleSaveEventChanges = async () => {
    if (!editingEventId || creating) return;

    if (!title.trim()) {
      showMessage('Please enter an event title.', true);
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      showMessage('End time must be after start time.', true);
      return;
    }

    setCreating(true);
    setPayload(null);
    setQrEvent(null);
    setMessage(null);
    setMessageIsError(false);

    try {
      const { error } = await updateEventDetails(editingEventId, {
        eventId: eventId.trim(),
        title: title.trim(),
        start: toManilaISO(startDate),
        end: toManilaISO(endDate),
        venue: venue.trim(),
        description: description.trim(),
      });

      if (error) {
        showMessage(error, true);
        return;
      }

      setEditingEventId(null);
      setTitle('');
      setEventId('');
      setVenue('');
      setDescription('');
      setStartDate(startOfMinute(new Date()));
      setEndDate(startOfMinute(new Date(Date.now() + 60 * 60 * 1000)));
      setEditTarget(null);

      showMessage('Event details updated successfully.');
      await loadEvents();
    } catch (error) {
      console.error('Could not save event changes:', error);
      showMessage('Could not save event changes. Please try again.', true);
    } finally {
      setCreating(false);
    }
  };

  const handleCancelEdit = () => {
    resetForm();
    showMessage('Editing cancelled.');
  };

  const handleViewQR = (event: CloudEvent) => {
    try {
      const nextPayload = buildQRPayload({
        eventId: event.event_code,
        title: event.title,
        start: event.start_time ?? undefined,
        end: event.end_time ?? undefined,
      });

      setQrEvent(event);
      setPayload(nextPayload);
      showMessage('QR code is ready for this event.');
    } catch (error) {
      console.error('Could not generate event QR:', error);
      setPayload(null);
      setQrEvent(null);
      showMessage(
        error instanceof Error
          ? error.message
          : 'Could not generate the QR code. Please try again.',
        true
      );
    }
  };

  const handleCloseQR = () => {
    setPayload(null);
    setQrEvent(null);
  };

  const handleToggleEvent = async (event: CloudEvent) => {
    if (updatingEventId) return;

    if (hasEventEnded(event)) {
      showMessage(
        'This event has already ended and cannot be reopened.',
        true
      );
      return;
    }

    const nextStatus = event.status === 'closed' ? 'open' : 'closed';

    setUpdatingEventId(event.id);
    setMessage(null);

    try {
      const { error } = await updateEventStatus(event.id, nextStatus);

      if (error) {
        showMessage(error, true);
        return;
      }

      setEvents((current) =>
        current.map((item) =>
          item.id === event.id ? { ...item, status: nextStatus } : item
        )
      );

      showMessage(`${event.title} is now ${nextStatus.toUpperCase()}.`);
    } catch (error) {
      console.error('Event status update failed:', error);
      showMessage('Could not update event status. Please try again.', true);
    } finally {
      setUpdatingEventId(null);
    }
  };

  if (roleLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Checking your account...</Text>
      </View>
    );
  }

  if (role !== 'teacher' && role !== 'admin') {
    return (
      <View style={styles.centerContainer}>
        <Ionicons
          name="lock-closed-outline"
          size={48}
          color={COLORS.textSecondary}
        />
        <Text style={styles.lockTitle}>Authorized Accounts Only</Text>
        <Text style={styles.lockSubtitle}>
          Only teacher and administrator accounts can manage events.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Event Management</Text>
      <Text style={styles.subtitle}>
        Create events, generate QR codes, edit details, and open or close
        attendance.
      </Text>

      {message && (
        <View
          style={[
            styles.messageBox,
            messageIsError && styles.errorMessageBox,
          ]}
        >
          <Text
            style={[
              styles.message,
              messageIsError && styles.errorMessage,
            ]}
          >
            {message}
          </Text>
        </View>
      )}

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>
          {editingEventId ? 'Edit Event' : 'Create Event QR'}
        </Text>
        <Text style={styles.cardSubtitle}>
          {editingEventId
            ? 'Update the event details and save your changes. The event code stays the same.'
            : 'The QR code appears after the event has been saved successfully.'}
        </Text>

        <Text style={styles.label}>Event Title *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            clearResult();
          }}
          placeholder="e.g. Founders Day Assembly"
          placeholderTextColor={COLORS.textSecondary}
          editable={!creating}
          maxLength={150}
        />

        <Text style={styles.label}>Event Code *</Text>
        <TextInput
          style={[styles.input, editingEventId && styles.readOnlyInput]}
          value={eventId}
          onChangeText={(value) => {
            setEventId(value.toUpperCase());
            clearResult();
          }}
          placeholder="e.g. EVT-2026-0002"
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!creating && !editingEventId}
          maxLength={50}
        />

        <Text style={styles.hint}>
          {editingEventId
            ? 'The event code cannot be changed while editing.'
            : 'Use a unique code for each event.'}
        </Text>

        <Text style={styles.label}>Venue</Text>
        <TextInput
          style={styles.input}
          value={venue}
          onChangeText={(value) => {
            setVenue(value);
            clearResult();
          }}
          placeholder="e.g. CCTC Covered Court"
          placeholderTextColor={COLORS.textSecondary}
          editable={!creating}
          maxLength={150}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.descriptionInput]}
          value={description}
          onChangeText={(value) => {
            setDescription(value);
            clearResult();
          }}
          placeholder="Enter event details (optional)"
          placeholderTextColor={COLORS.textSecondary}
          editable={!creating}
          multiline
          maxLength={1000}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Starts</Text>
        <PickerField
          value={formatDateTime(startDate)}
          icon="sunny-outline"
          onPress={() => openPicker('start')}
          disabled={creating}
        />

        <Text style={styles.label}>Ends</Text>
        <PickerField
          value={formatDateTime(endDate)}
          icon="moon-outline"
          onPress={() => openPicker('end')}
          disabled={creating}
        />

        <View style={styles.chipRow}>
          {QUICK_END_OPTIONS.map((option) => (
            <Pressable
              key={option.label}
              style={({ pressed }) => [
                styles.chip,
                pressed && styles.chipPressed,
                creating && styles.disabled,
              ]}
              onPress={() => handleQuickEnd(option.ms)}
              disabled={creating}
            >
              <Text style={styles.chipText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.hint}>
          Choose how long the event will last, starting from the selected
          start time.
        </Text>

        <AppButton
          theme="primary"
          title={
            creating
              ? 'Saving...'
              : editingEventId
                ? 'Save Changes'
                : 'Create Event'
          }
          icon={editingEventId ? 'save-outline' : 'add-circle-outline'}
          onPress={
            editingEventId ? handleSaveEventChanges : handleCreateEvent
          }
          disabled={creating}
        />

        {editingEventId && (
          <View style={styles.secondaryEventButton}>
            <AppButton
              theme="primary"
              title="Cancel Editing"
              icon="close-circle-outline"
              onPress={handleCancelEdit}
              disabled={creating}
            />
          </View>
        )}

        {creating && (
          <ActivityIndicator
            style={styles.savingIndicator}
            size="small"
            color={COLORS.primary}
          />
        )}

        {editTarget && (
          <View style={styles.pickerContainer}>
            {isAndroid && (
              <Text style={styles.pickerHint}>
                {editingPart === 'date' ? 'Select date' : 'Select time'}
              </Text>
            )}

            <DateTimePicker
              value={editTarget === 'start' ? startDate : endDate}
              mode={isAndroid ? editingPart : 'datetime'}
              display={isAndroid ? 'default' : 'spinner'}
              onChange={onPickerChange}
            />
          </View>
        )}

        {payload && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Event QR Code</Text>
            <Text style={styles.resultSubtitle}>
              Scan this code using the Scan tab to test attendance.
            </Text>

            <View style={styles.qrBox}>
              <QRCode value={payload} size={200} />
            </View>

            <Text style={styles.eventTitle}>
              {qrEvent?.title ?? title.trim()}
            </Text>
            <Text style={styles.eventCode}>
              Code: {qrEvent?.event_code ?? eventId.trim()}
            </Text>

            {!!(qrEvent?.venue ?? venue.trim()) && (
              <Text style={styles.eventDetails}>
                Venue: {qrEvent?.venue ?? venue.trim()}
              </Text>
            )}

            {!!(qrEvent?.description ?? description.trim()) && (
              <Text style={styles.eventDetails}>
                {qrEvent?.description ?? description.trim()}
              </Text>
            )}

            <Text style={styles.eventDetails}>
              Starts:{' '}
              {qrEvent
                ? formatCloudDateTime(qrEvent.start_time)
                : formatDateTime(startDate)}
            </Text>
            <Text style={styles.eventDetails}>
              Ends:{' '}
              {qrEvent
                ? formatCloudDateTime(qrEvent.end_time)
                : formatDateTime(endDate)}
            </Text>

            <Text style={styles.payloadText}>{payload}</Text>

            <View style={styles.qrCloseButton}>
              <AppButton
                theme="primary"
                title="Hide QR Code"
                icon="close-circle-outline"
                onPress={handleCloseQR}
              />
            </View>
          </View>
        )}
      </View>

      <View style={styles.eventsSection}>
        <View style={styles.eventsHeading}>
          <View style={styles.eventsHeadingText}>
            <Text style={styles.sectionTitle}>Saved Events</Text>
            <Text style={styles.cardSubtitle}>
              View QR codes, edit details, and manage event attendance status.
            </Text>
          </View>

          <Pressable
            onPress={() => void loadEvents()}
            disabled={eventsLoading || !!updatingEventId}
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && styles.chipPressed,
            ]}
          >
            <Ionicons name="refresh-outline" size={20} color={COLORS.primary} />
          </Pressable>
        </View>

        {eventsLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading events...</Text>
          </View>
        ) : events.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name="calendar-outline"
              size={34}
              color={COLORS.textSecondary}
            />
            <Text style={styles.emptyTitle}>No saved events found</Text>
            <Text style={styles.emptyText}>
              Create an event above. Teachers see their own events, while
              administrators can view events according to their access.
            </Text>
          </View>
        ) : (
          events.map((event) => {
            const isEnded = hasEventEnded(event);
            const isClosed = event.status === 'closed';
            const isUpdating = updatingEventId === event.id;

            const displayedStatus = isEnded
              ? 'ENDED'
              : isClosed
                ? 'CLOSED'
                : 'OPEN';

            return (
              <View key={event.id} style={styles.eventCard}>
                <View style={styles.eventCardHeader}>
                  <View style={styles.eventCardTitleArea}>
                    <Text style={styles.eventTitleLeft}>{event.title}</Text>
                    <Text style={styles.eventCodeLeft}>
                      Code: {event.event_code}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      isEnded
                        ? styles.endedBadge
                        : isClosed
                          ? styles.closedBadge
                          : styles.openBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        isEnded
                          ? styles.endedText
                          : isClosed
                            ? styles.closedText
                            : styles.openText,
                      ]}
                    >
                      {displayedStatus}
                    </Text>
                  </View>
                </View>

                {!!event.venue && (
                  <Text style={styles.eventDetailsLeft}>
                    Venue: {event.venue}
                  </Text>
                )}

                {!!event.description && (
                  <Text style={styles.eventDetailsLeft}>
                    {event.description}
                  </Text>
                )}

                <Text style={styles.eventDetailsLeft}>
                  Starts: {formatCloudDateTime(event.start_time)}
                </Text>
                <Text style={styles.eventDetailsLeft}>
                  Ends: {formatCloudDateTime(event.end_time)}
                </Text>

                <View style={styles.eventCardButtonContainer}>
                  <AppButton
                    theme="primary"
                    title="View QR Code"
                    icon="qr-code-outline"
                    onPress={() => handleViewQR(event)}
                  />

                  <View style={styles.secondaryEventButton}>
                    <AppButton
                      theme="primary"
                      title={
                        role === 'teacher' && isEnded
                          ? 'Event Ended'
                          : 'Edit Event'
                      }
                      icon={
                        role === 'teacher' && isEnded
                          ? 'checkmark-circle-outline'
                          : 'create-outline'
                      }
                      onPress={() => handleEditEvent(event)}
                      disabled={
                        creating ||
                        !!updatingEventId ||
                        (role === 'teacher' && isEnded)
                      }
                    />
                  </View>

                  <View style={styles.secondaryEventButton}>
                    <AppButton
                      theme="primary"
                      title={
                        isUpdating
                          ? 'Updating...'
                          : isEnded
                            ? 'Event Ended'
                            : isClosed
                              ? 'Open Event'
                              : 'Close Event'
                      }
                      icon={
                        isUpdating
                          ? 'time-outline'
                          : isEnded
                            ? 'checkmark-circle-outline'
                            : isClosed
                              ? 'lock-open-outline'
                              : 'lock-closed-outline'
                      }
                      onPress={() => void handleToggleEvent(event)}
                      disabled={isUpdating || isEnded || creating}
                    />
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

type PickerFieldProps = {
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
};

function PickerField({
  value,
  icon,
  onPress,
  disabled = false,
}: PickerFieldProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.pickerField,
        pressed && styles.pickerFieldPressed,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={20} color={COLORS.primary} />
      <Text style={styles.pickerValue}>{value}</Text>
      <Ionicons
        name="calendar-outline"
        size={18}
        color={COLORS.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 12,
  },
  lockTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  lockSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  readOnlyInput: {
    backgroundColor: COLORS.surface,
    opacity: 0.8,
  },
  descriptionInput: {
    minHeight: 80,
  },
  pickerField: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerFieldPressed: {
    backgroundColor: COLORS.surface,
  },
  pickerValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textPrimary,
    marginHorizontal: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  chip: {
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 6,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  disabled: {
    opacity: 0.5,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 6,
    marginBottom: 16,
  },
  pickerContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  pickerHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  messageBox: {
    backgroundColor: '#E4F4EA',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  errorMessageBox: {
    backgroundColor: '#FCE8E6',
  },
  message: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
  },
  errorMessage: {
    color: '#B3261E',
  },
  savingIndicator: {
    marginTop: 10,
  },
  resultCard: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginTop: 20,
    alignItems: 'center',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  resultSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  qrBox: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  eventCode: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginBottom: 8,
  },
  eventDetails: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  payloadText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 12,
  },
  qrCloseButton: {
    width: '100%',
    marginTop: 12,
  },
  eventsSection: {
    marginBottom: 20,
  },
  eventsHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eventsHeadingText: {
    flex: 1,
    paddingRight: 12,
  },
  refreshButton: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 10,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  eventCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },
  eventCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eventCardTitleArea: {
    flex: 1,
    paddingRight: 8,
  },
  eventTitleLeft: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  eventCodeLeft: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  openBadge: {
    backgroundColor: '#E4F4EA',
  },
  closedBadge: {
    backgroundColor: '#FCE8E6',
  },
  endedBadge: {
    backgroundColor: '#E5E7EB',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  openText: {
    color: '#216E39',
  },
  closedText: {
    color: '#B3261E',
  },
  endedText: {
    color: '#4B5563',
  },
  eventDetailsLeft: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: 3,
  },
  eventCardButtonContainer: {
    marginTop: 12,
  },
  secondaryEventButton: {
    marginTop: 8,
  },
});