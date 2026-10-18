CREATE OR REPLACE FUNCTION public.register_attendance(p_event_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_status text := 'present';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'unauthorized',
      'message', 'Please log in first.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_uid AND role = 'student'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'unauthorized',
      'message', 'Only students can record attendance.'
    );
  END IF;

  SELECT *
  INTO v_event
  FROM public.events
  WHERE event_code = p_event_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'invalid_qr',
      'message', 'Invalid QR code.'
    );
  END IF;

  IF v_event.status <> 'open' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'closed',
      'message', 'This event is closed.',
      'eventTitle', v_event.title
    );
  END IF;

  IF v_event.start_time IS NOT NULL
     AND now() < v_event.start_time THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'not_started',
      'message', 'Event has not started yet.',
      'eventTitle', v_event.title
    );
  END IF;

  -- Hard cutoff: reject at the exact end time or later.
  IF v_event.end_time IS NOT NULL
     AND now() >= v_event.end_time THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ended',
      'message', 'Event has already ended.',
      'eventTitle', v_event.title
    );
  END IF;

  IF v_event.start_time IS NOT NULL
     AND now() > v_event.start_time + interval '15 minutes' THEN
    v_status := 'late';
  END IF;

  BEGIN
    INSERT INTO public.attendance (student_id, event_id, status)
    VALUES (v_uid, v_event.id, v_status);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'duplicate',
      'message', 'Already registered for this event.',
      'eventTitle', v_event.title
    );
  END;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'ok',
    'message', CASE
      WHEN v_status = 'late' THEN 'Recorded as LATE.'
      ELSE 'Attendance recorded!'
    END,
    'status', v_status,
    'eventTitle', v_event.title
  );
END;
$function$;