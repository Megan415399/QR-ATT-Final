export type QRPayload = {
  v: 1;
  event: string;
  title?: string;
  start?: string;
  end?: string;
};

export function buildQRPayload(event: {
  eventId: string;
  title: string;
  start?: string;
  end?: string;
}): string {
  const eventCode = event.eventId.trim();
  const title = event.title.trim();

  if (!eventCode) {
    throw new Error('Event code is required to generate a QR code.');
  }

  if (!title) {
    throw new Error('Event title is required to generate a QR code.');
  }

  const payload: QRPayload = {
    v: 1,
    event: eventCode,
    title,
  };

  if (event.start) {
    payload.start = event.start;
  }

  if (event.end) {
    payload.end = event.end;
  }

  return JSON.stringify(payload);
}

export type ParseQRResult =
  | { ok: true; payload: QRPayload }
  | { ok: false; message: string };

export function parseQRPayload(raw: string): ParseQRResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      message: 'Invalid QR code.',
    };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    return {
      ok: false,
      message: 'Not an attendance QR code.',
    };
  }

  const value = parsed as Record<string, unknown>;

  if (
    value.v !== 1 ||
    typeof value.event !== 'string' ||
    value.event.trim().length === 0
  ) {
    return {
      ok: false,
      message: 'Not an attendance QR code.',
    };
  }

  if (
    value.title !== undefined &&
    typeof value.title !== 'string'
  ) {
    return {
      ok: false,
      message: 'Invalid event details in QR code.',
    };
  }

  if (
    value.start !== undefined &&
    typeof value.start !== 'string'
  ) {
    return {
      ok: false,
      message: 'Invalid event start time in QR code.',
    };
  }

  if (
    value.end !== undefined &&
    typeof value.end !== 'string'
  ) {
    return {
      ok: false,
      message: 'Invalid event end time in QR code.',
    };
  }

  return {
    ok: true,
    payload: {
      v: 1,
      event: value.event.trim(),
      ...(typeof value.title === 'string'
        ? { title: value.title }
        : {}),
      ...(typeof value.start === 'string'
        ? { start: value.start }
        : {}),
      ...(typeof value.end === 'string'
        ? { end: value.end }
        : {}),
    },
  };
}
