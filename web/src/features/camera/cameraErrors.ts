export type CameraErrorCode =
  | 'permission-denied'
  | 'not-found'
  | 'in-use'
  | 'insecure-context'
  | 'unsupported'
  | 'overconstrained'
  | 'disconnected'
  | 'aborted'
  | 'unknown';

export interface CameraErrorInfo {
  code: CameraErrorCode;
  title: string;
  message: string;
  /** whether retrying without user changes may help */
  retryable: boolean;
}

const MESSAGES: Record<CameraErrorCode, Omit<CameraErrorInfo, 'code'>> = {
  'permission-denied': {
    title: 'Camera permission denied',
    message:
      'Allow camera access for this site in your browser settings (usually the camera icon in the address bar), then try again.',
    retryable: true,
  },
  'not-found': {
    title: 'No camera found',
    message: 'Connect a webcam or select another camera, then try again.',
    retryable: true,
  },
  'in-use': {
    title: 'Camera is busy',
    message: 'Another application or browser tab may be using the camera. Close it and try again.',
    retryable: true,
  },
  'insecure-context': {
    title: 'Secure connection required',
    message: 'Browsers only allow camera access over HTTPS or on localhost.',
    retryable: false,
  },
  unsupported: {
    title: 'Camera not supported',
    message: 'This browser does not support camera access. Try a recent Chrome, Edge, Firefox or Safari.',
    retryable: false,
  },
  overconstrained: {
    title: 'Camera settings unsupported',
    message: 'The selected camera does not support the requested resolution. Trying a lower quality may help.',
    retryable: true,
  },
  disconnected: {
    title: 'Camera disconnected',
    message: 'The camera stopped sending video. Reconnect it or choose another camera.',
    retryable: true,
  },
  aborted: {
    title: 'Camera start was interrupted',
    message: 'Starting the camera was cancelled. Try again.',
    retryable: true,
  },
  unknown: {
    title: 'Camera error',
    message: 'The camera could not be started.',
    retryable: true,
  },
};

export function cameraError(code: CameraErrorCode, detail?: string): CameraErrorInfo {
  const base = MESSAGES[code];
  return { code, ...base, message: detail ? `${base.message} (${detail})` : base.message };
}

/** Maps getUserMedia DOMException names to user-facing errors. */
export function mapGetUserMediaError(err: unknown): CameraErrorInfo {
  const name = (err as { name?: string })?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return cameraError('permission-denied');
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return cameraError('not-found');
    case 'NotReadableError':
    case 'TrackStartError':
      return cameraError('in-use');
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return cameraError('overconstrained');
    case 'SecurityError':
      return cameraError('insecure-context');
    case 'AbortError':
      return cameraError('aborted');
    case 'TypeError':
      return cameraError('unsupported');
    default:
      return cameraError('unknown', name || undefined);
  }
}
