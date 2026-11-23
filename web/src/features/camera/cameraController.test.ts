import { describe, expect, it, vi } from 'vitest';
import { CameraController, buildConstraints } from './cameraController';
import { mapGetUserMediaError } from './cameraErrors';

class FakeTrack extends EventTarget {
  readyState: 'live' | 'ended' = 'live';
  stop = vi.fn(() => {
    this.readyState = 'ended';
  });
  getSettings = () => ({ deviceId: 'cam-1', width: 1280, height: 720 });
  /** simulate the device being unplugged */
  unplug() {
    this.readyState = 'ended';
    this.dispatchEvent(new Event('ended'));
  }
}

function fakeStream(track = new FakeTrack()) {
  return {
    track,
    stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream,
  };
}

function fakeMedia(impl: (c: MediaStreamConstraints) => Promise<MediaStream>) {
  const media = new EventTarget() as unknown as MediaDevices & EventTarget;
  Object.assign(media, {
    getUserMedia: vi.fn(impl),
    enumerateDevices: vi.fn(async () => [
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Laptop camera' },
      { kind: 'audioinput', deviceId: 'mic', label: 'Mic' },
      { kind: 'videoinput', deviceId: 'cam-2', label: '' },
    ]),
  });
  return media;
}

const domError = (name: string) => Object.assign(new Error(name), { name });

describe('camera constraints', () => {
  it('requests 720p from the front camera by default and never audio', () => {
    const c = buildConstraints(null, 'balanced');
    expect(c.audio).toBe(false);
    expect(c.video).toMatchObject({ facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } });
  });
  it('pins a specific device when selected', () => {
    expect(buildConstraints('abc', 'low').video).toMatchObject({ deviceId: { exact: 'abc' }, width: { ideal: 640 } });
  });
});

describe('CameraController lifecycle', () => {
  it('starts a stream and stops every track', async () => {
    const { stream, track } = fakeStream();
    const cam = new CameraController(fakeMedia(async () => stream));
    const res = await cam.start(null, 'balanced');
    expect(res).toMatchObject({ deviceId: 'cam-1', width: 1280, height: 720 });
    expect(cam.active).toBe(true);
    cam.stop();
    expect(track.stop).toHaveBeenCalled();
    expect(cam.active).toBe(false);
  });

  it('stops the previous stream when switching cameras', async () => {
    const a = fakeStream();
    const b = fakeStream();
    const streams = [a.stream, b.stream];
    const cam = new CameraController(fakeMedia(async () => streams.shift()!));
    await cam.start('cam-1', 'balanced');
    await cam.start('cam-2', 'balanced');
    expect(a.track.stop).toHaveBeenCalled();
    expect(b.track.stop).not.toHaveBeenCalled();
  });

  it('releases a stream that resolves after stop() (no leaked camera)', async () => {
    const { stream, track } = fakeStream();
    let resolve!: (s: MediaStream) => void;
    const cam = new CameraController(fakeMedia(() => new Promise((r) => (resolve = r))));
    const pending = cam.start(null, 'balanced');
    cam.stop();
    resolve(stream);
    await expect(pending).rejects.toMatchObject({ code: 'aborted' });
    expect(track.stop).toHaveBeenCalled();
  });

  it('reports a disconnected camera', async () => {
    const { stream, track } = fakeStream();
    const cam = new CameraController(fakeMedia(async () => stream));
    const events: string[] = [];
    cam.subscribe((e) => events.push(e.type === 'ended' ? e.error.code : e.type));
    await cam.start(null, 'balanced');
    track.unplug();
    expect(events).toContain('disconnected');
    expect(cam.active).toBe(false);
  });

  it('maps permission denial to a friendly error', async () => {
    const cam = new CameraController(fakeMedia(async () => Promise.reject(domError('NotAllowedError'))));
    await expect(cam.start(null, 'balanced')).rejects.toMatchObject({ code: 'permission-denied', retryable: true });
  });

  it('falls back to low quality when constraints cannot be satisfied', async () => {
    const { stream } = fakeStream();
    const media = fakeMedia(async (c) => {
      if ((c.video as MediaTrackConstraints).width && ((c.video as { width: { ideal: number } }).width.ideal > 640)) {
        throw domError('OverconstrainedError');
      }
      return stream;
    });
    const cam = new CameraController(media);
    await expect(cam.start(null, 'high')).resolves.toBeTruthy();
    expect(media.getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('reports unsupported browsers', async () => {
    const cam = new CameraController(undefined);
    expect(CameraController.isSupported(undefined)).toBe(false);
    await expect(cam.start(null, 'balanced')).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('lists only video inputs, with fallback labels', async () => {
    const cam = new CameraController(fakeMedia(async () => fakeStream().stream));
    expect(await cam.listDevices()).toEqual([
      { deviceId: 'cam-1', label: 'Laptop camera' },
      { deviceId: 'cam-2', label: 'Camera 2' },
    ]);
  });
});

describe('getUserMedia error mapping', () => {
  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['NotFoundError', 'not-found'],
    ['NotReadableError', 'in-use'],
    ['OverconstrainedError', 'overconstrained'],
    ['SecurityError', 'insecure-context'],
    ['Weird', 'unknown'],
  ])('%s -> %s', (name, code) => {
    expect(mapGetUserMediaError(domError(name)).code).toBe(code);
  });
});
