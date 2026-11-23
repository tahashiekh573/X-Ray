import type { PerformanceMode } from '@/types/settings';
import { cameraError, mapGetUserMediaError, type CameraErrorInfo } from './cameraErrors';

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
}

export interface CameraStartResult {
  stream: MediaStream;
  deviceId: string | null;
  width: number;
  height: number;
}

export const QUALITY: Record<PerformanceMode, { width: number; height: number; frameRate: number }> = {
  low: { width: 640, height: 480, frameRate: 30 },
  balanced: { width: 1280, height: 720, frameRate: 30 },
  high: { width: 1280, height: 720, frameRate: 60 },
};

export function buildConstraints(deviceId: string | null, quality: PerformanceMode): MediaStreamConstraints {
  const q = QUALITY[quality];
  const video: MediaTrackConstraints = {
    width: { ideal: q.width },
    height: { ideal: q.height },
    frameRate: { ideal: q.frameRate, max: 60 },
  };
  if (deviceId) video.deviceId = { exact: deviceId };
  else video.facingMode = 'user';
  return { audio: false, video };
}

export type CameraEvent =
  | { type: 'ended'; error: CameraErrorInfo }
  | { type: 'devicechange'; devices: CameraDeviceInfo[] };

/**
 * Owns the MediaStream lifecycle. Framework-agnostic so it can be unit-tested with a mocked
 * navigator.mediaDevices. Video is never recorded or transmitted.
 */
export class CameraController {
  private stream: MediaStream | null = null;
  private startToken = 0;
  private listeners = new Set<(e: CameraEvent) => void>();
  private readonly onDeviceChange = () => {
    void this.listDevices().then((devices) => this.emit({ type: 'devicechange', devices }));
  };

  constructor(private readonly media: MediaDevices | undefined = globalThis.navigator?.mediaDevices) {
    this.media?.addEventListener?.('devicechange', this.onDeviceChange);
  }

  static isSupported(media: MediaDevices | undefined = globalThis.navigator?.mediaDevices): boolean {
    return typeof media?.getUserMedia === 'function';
  }

  get active(): boolean {
    return this.stream?.getVideoTracks().some((t) => t.readyState === 'live') ?? false;
  }

  subscribe(fn: (e: CameraEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: CameraEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  async listDevices(): Promise<CameraDeviceInfo[]> {
    if (!this.media?.enumerateDevices) return [];
    const all = await this.media.enumerateDevices();
    return all
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  }

  async start(deviceId: string | null, quality: PerformanceMode): Promise<CameraStartResult> {
    if (!globalThis.isSecureContext && globalThis.location?.hostname !== 'localhost') {
      throw cameraError('insecure-context');
    }
    if (!CameraController.isSupported(this.media)) throw cameraError('unsupported');
    this.stop();
    const token = ++this.startToken;
    let stream: MediaStream;
    try {
      stream = await this.media!.getUserMedia(buildConstraints(deviceId, quality));
    } catch (err) {
      const mapped = mapGetUserMediaError(err);
      if (mapped.code === 'overconstrained' && quality !== 'low') {
        return this.start(deviceId, 'low');
      }
      throw mapped;
    }
    if (token !== this.startToken) {
      // A newer start/stop superseded this request: release the camera immediately.
      stream.getTracks().forEach((t) => t.stop());
      throw cameraError('aborted');
    }
    this.stream = stream;
    const track = stream.getVideoTracks()[0];
    track?.addEventListener('ended', () => {
      if (this.stream === stream) {
        this.stop();
        this.emit({ type: 'ended', error: cameraError('disconnected') });
      }
    });
    const settings = track?.getSettings?.() ?? {};
    return {
      stream,
      deviceId: settings.deviceId ?? deviceId,
      width: settings.width ?? QUALITY[quality].width,
      height: settings.height ?? QUALITY[quality].height,
    };
  }

  /** Stops every track. Safe to call repeatedly. */
  stop(): void {
    this.startToken++;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
  }

  dispose(): void {
    this.stop();
    this.media?.removeEventListener?.('devicechange', this.onDeviceChange);
    this.listeners.clear();
  }
}
