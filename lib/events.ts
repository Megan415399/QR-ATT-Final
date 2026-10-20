
import { supabase } from './supabase';

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  venue?: string;
  description?: string;
};

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  created_by: string | null;
  created_at: string;
  venue?: string | null;
  description?: string | null;
  status?: 'open' | 'closed';
};

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

function toIso(value: string | undefined): string | null {
  if (!value || !value.trim()) return null;

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return null;

  return date.toISOString();
}

function hasEnded(endTime: string | null | undefined): boolean {
  if (!endTime) return false;

  const time = new Date(endTime).getTime();

  return Number.isFinite(time) && time <= Date.now();
}

async function getCurrentUserAndRole() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      user: null,
      role: null,
      error: 'Please log in before managing events.',
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    console.error('Could not verify user role:', profileError?.message);

    return {
      user: null,
      role: null,
      error: 'Could not verify your account permissions.',
    };
  }

  if (profile.role !== 'teacher' && profile.role !== 'admin') {
    return {
      user: null,
      role: null,
      error: 'Only teachers and administrators can manage events.',
    };
  }

  return {
    user,
    role: profile.role as 'teacher' | 'admin',
    error: null,
  };
}

export async function createEvent(
  event: Event
): Promise<{ error: string | null }> {
  const eventCode = event.eventId.trim();
  const title = event.title.trim();
  const venue = event.venue?.trim() ?? '';
  const description = event.description?.trim() ?? '';

  if (!eventCode || !title) {
    return { error: 'Please enter an event code and title.' };
  }

  if (eventCode.length > 50) {
    return { error: 'Event code must be 50 characters or fewer.' };
  }

  if (title.length > 150) {
    return { error: 'Event title must be 150 characters or fewer.' };
  }

  if (event.start.trim() && !toIso(event.start)) {
    return { error: 'Please enter a valid start date and time.' };
  }

  if (event.end.trim() && !toIso(event.end)) {
    return { error: 'Please enter a valid end date and time.' };
  }

  const startIso = toIso(event.start) ?? new Date().toISOString();

  const endIso =
    toIso(event.end) ??
    new Date(
      new Date(startIso).getTime() + DEFAULT_DURATION_MS
    ).toISOString();

  if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
    return { error: 'The event end time must be after the start time.' };
  }

  try {
    const access = await getCurrentUserAndRole();

    if (!access.user || !access.role) {
      return { error: access.error };
    }

    const { data: existingEvent, error: lookupError } = await supabase
      .from('events')
      .select('id')
      .eq('event_code', eventCode)
      .maybeSingle();

    if (lookupError) {
      console.error('Event lookup failed:', lookupError.message);

      return {
        error: 'Could not check whether this event code already exists.',
      };
    }

    if (existingEvent) {
      return {
        error: 'This event code already exists. Please use a different code.',
      };
    }

    const { error: insertError } = await supabase.from('events').insert({
      event_code: eventCode,
      title,
      start_time: startIso,
      end_time: endIso,
      venue: venue || null,
      description: description || null,
      created_by: access.user.id,
      status: 'open',
    });

    if (insertError) {
      console.error('Event creation failed:', insertError.message);

      if (insertError.code === '23505') {
        return {
          error: 'This event code already exists. Please use a different code.',
        };
      }

      return {
        error: 'Could not create the event. Please try again.',
      };
    }

    return { error: null };
  } catch (error) {
    console.error('Unexpected event creation error:', error);

    return { error: 'Something went wrong while creating the event.' };
  }
}

export async function getEventsByTeacher(
  teacherId: string
): Promise<CloudEvent[]> {
  if (!teacherId) return [];

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user || user.id !== teacherId) {
      console.error('Could not verify the current user.');
      return [];
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error('Could not verify user role:', profileError?.message);
      return [];
    }

    let query = supabase
      .from('events')
      .select(
        'id, event_code, title, start_time, end_time, created_by, created_at, venue, description, status'
      );

    if (profile.role === 'teacher') {
      query = query.eq('created_by', user.id);
    } else if (profile.role !== 'admin') {
      console.error('Unauthorized user attempted to load events.');
      return [];
    }

    const { data, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error || !data) {
      console.error('Could not load events:', error?.message);
      return [];
    }

    return data as CloudEvent[];
  } catch (error) {
    console.error('Unexpected event loading error:', error);
    return [];
  }
}

export async function getEventByCode(
  code: string
): Promise<CloudEvent | null> {
  const eventCode = code.trim();

  if (!eventCode) return null;

  const { data, error } = await supabase
    .from('events')
    .select(
      'id, event_code, title, start_time, end_time, created_by, created_at, venue, description, status'
    )
    .eq('event_code', eventCode)
    .maybeSingle();

  if (error) {
    console.error('Could not find event:', error.message);
    return null;
  }

  return data as CloudEvent | null;
}

export async function updateEventStatus(
  eventId: string,
  status: 'open' | 'closed'
): Promise<{ error: string | null }> {
  if (!eventId.trim()) {
    return { error: 'Invalid event.' };
  }

  if (status !== 'open' && status !== 'closed') {
    return { error: 'Invalid event status.' };
  }

  try {
    const access = await getCurrentUserAndRole();

    if (!access.user || !access.role) {
      return { error: access.error };
    }

    let eventQuery = supabase
      .from('events')
      .select('id, end_time, created_by')
      .eq('id', eventId);

    if (access.role === 'teacher') {
      eventQuery = eventQuery.eq('created_by', access.user.id);
    }

    const { data: event, error: eventError } =
      await eventQuery.maybeSingle();

    if (eventError) {
      console.error('Could not check event:', eventError.message);

      return { error: 'Could not verify this event. Please try again.' };
    }

    if (!event) {
      return {
        error: 'Event not found or you do not have permission to update it.',
      };
    }

    // Ended events cannot have their status changed by either role.
    if (hasEnded(event.end_time)) {
      return {
        error: 'This event has ended. Its status can no longer be changed.',
      };
    }

    const { data, error } = await supabase
      .from('events')
      .update({ status })
      .eq('id', eventId)
      .select('id');

    if (error) {
      console.error('Event status update failed:', error.message);

      return {
        error: 'Could not update event status. Check your database permissions.',
      };
    }

    if (!data || data.length === 0) {
      return {
        error: 'Event not found or you do not have permission to update it.',
      };
    }

    return { error: null };
  } catch (error) {
    console.error('Unexpected event status error:', error);

    return {
      error: 'Something went wrong while updating the event.',
    };
  }
}

export async function updateEventDetails(
  eventId: string,
  event: Event
): Promise<{ error: string | null }> {
  if (!eventId.trim()) {
    return { error: 'Invalid event.' };
  }

  const title = event.title.trim();
  const venue = event.venue?.trim() ?? '';
  const description = event.description?.trim() ?? '';

  if (!title) {
    return { error: 'Please enter an event title.' };
  }

  if (title.length > 150) {
    return { error: 'Event title must be 150 characters or fewer.' };
  }

  const startIso = toIso(event.start);
  const endIso = toIso(event.end);

  if (!startIso || !endIso) {
    return {
      error: 'Please enter valid start and end dates and times.',
    };
  }

  if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
    return { error: 'The event end time must be after the start time.' };
  }

  try {
    const access = await getCurrentUserAndRole();

    if (!access.user || !access.role) {
      return { error: access.error };
    }

    let eventQuery = supabase
      .from('events')
      .select('id, end_time, created_by')
      .eq('id', eventId);

    if (access.role === 'teacher') {
      eventQuery = eventQuery.eq('created_by', access.user.id);
    }

    const { data: existingEvent, error: lookupError } =
      await eventQuery.maybeSingle();

    if (lookupError) {
      console.error('Could not check event before editing:', lookupError.message);

      return { error: 'Could not verify the event before editing.' };
    }

    if (!existingEvent) {
      return {
        error: 'Event not found or you do not have permission to edit it.',
      };
    }

    // Teachers cannot edit ended events. Admins can.
    if (
      access.role === 'teacher' &&
      hasEnded(existingEvent.end_time)
    ) {
      return {
        error: 'This event has ended. Teachers cannot edit ended events.',
      };
    }

    const { data, error } = await supabase
      .from('events')
      .update({
        title,
        start_time: startIso,
        end_time: endIso,
        venue: venue || null,
        description: description || null,
      })
      .eq('id', eventId)
      .select('id');

    if (error) {
      console.error('Event details update failed:', error.message);

      return {
        error: 'Could not edit event details. Check database permissions.',
      };
    }

    if (!data || data.length === 0) {
      return {
        error: 'Event not found or you do not have permission to edit it.',
      };
    }

    return { error: null };
  } catch (error) {
    console.error('Unexpected event details error:', error);

    return {
      error: 'Something went wrong while editing the event.',
    };
  }
}

export async function getAvailableEvents(): Promise<CloudEvent[]> {
  try {
    const { data, error } = await supabase
      .from('events')
      .select(
        'id, event_code, title, start_time, end_time, created_by, created_at, venue, description, status'
      )
      .eq('status', 'open')
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Could not load available events:', error.message);
      return [];
    }

    const now = Date.now();

    return ((data ?? []) as CloudEvent[]).filter((event) => {
      if (!event.end_time) return false;

      const endTime = new Date(event.end_time).getTime();

      return Number.isFinite(endTime) && endTime > now;
    });
  } catch (error) {
    console.error('Unexpected available events error:', error);

    return [];
  }
}
