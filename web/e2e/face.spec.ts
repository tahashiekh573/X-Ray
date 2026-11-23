import { expect, test, type Page } from '@playwright/test';

/**
 * Real MediaPipe face tracking on a fake camera that plays MediaPipe's portrait.jpg test asset.
 * Verifies the end-to-end path: webcam -> face tracking -> head pose -> skull alignment.
 */
type X = Window & { __xray: { frameState: { face: { present: boolean; matrix: Float32Array; landmarks: Float32Array; mouthRatio: number }; videoWidth: number; videoHeight: number }; useSession: { getState: () => { assets: Record<string, { state: string }>; calibrationRun: { phase: string; message: string } } }; useSettings: { getState: () => { calibration: Record<string, number> } } } };

async function startAndWaitForFace(page: Page) {
  await page.goto('/?e2e');
  await page.getByRole('button', { name: 'Start camera' }).click();
  await page.waitForFunction(() => (window as unknown as X).__xray.frameState.face.present, null, { timeout: 90_000 });
}

test('face is tracked and the virtual camera matches MediaPipe geometry', async ({ page }) => {
  await startAndWaitForFace(page);
  await expect(page.getByText('Face tracked')).toBeVisible();
  // Reproject canonical-face landmarks through the facial transformation matrix at several FOVs.
  const sweep = await page.evaluate(() => {
    const s = (window as unknown as X).__xray.frameState;
    const W = s.videoWidth;
    const H = s.videoHeight;
    const m = s.face.matrix;
    const C: Record<number, number[]> = {
      33: [-4.445859, 2.663991, 3.173422], 263: [4.445859, 2.663991, 3.173422], 133: [-1.856432, 2.585245, 3.757904],
      362: [1.856432, 2.585245, 3.757904], 168: [0, 3.271027, 5.236015], 152: [0, -9.403378, 4.264492], 4: [0, -0.46317, 7.58658],
    };
    const out: [number, number][] = [];
    for (let fov = 50; fov <= 76; fov++) {
      const f = H / 2 / Math.tan((fov * Math.PI) / 360);
      let err = 0;
      for (const [i, c] of Object.entries(C)) {
        const x = m[0] * c[0] + m[4] * c[1] + m[8] * c[2] + m[12];
        const y = m[1] * c[0] + m[5] * c[1] + m[9] * c[2] + m[13];
        const z = m[2] * c[0] + m[6] * c[1] + m[10] * c[2] + m[14];
        err += Math.hypot(W / 2 + (x * f) / -z - s.face.landmarks[+i * 3] * W, H / 2 - (y * f) / -z - s.face.landmarks[+i * 3 + 1] * H);
      }
      out.push([fov, err / Object.keys(C).length]);
    }
    return out;
  });
  const best = sweep.reduce((a, b) => (b[1] < a[1] ? b : a));
  const at63 = sweep.find(([fov]) => fov === 63)![1];
  expect(best[0]).toBeGreaterThanOrEqual(61);
  expect(best[0]).toBeLessThanOrEqual(65);
  expect(at63).toBeLessThan(15); // pixels at 1280x720
});

test('anatomy layers load and the jaw signal is measured', async ({ page }) => {
  await startAndWaitForFace(page);
  await page.getByRole('button', { name: 'Everything', exact: true }).click();
  await page.waitForFunction(
    () => {
      const a = (window as unknown as X).__xray.useSession.getState().assets;
      return ['skull', 'brain', 'eyes', 'muscles', 'hand'].every((k) => a[k].state === 'ready');
    },
    null,
    { timeout: 60_000 },
  );
  const ratio = await page.evaluate(() => (window as unknown as X).__xray.frameState.face.mouthRatio);
  expect(ratio).toBeGreaterThan(0); // the portrait smiles with parted lips
  await page.getByLabel('Show Labels').check();
  await expect(page.getByRole('button', { name: 'Mandible' })).toBeVisible();
  await page.getByRole('button', { name: 'Mandible' }).click();
  await expect(page.getByRole('heading', { name: 'Mandible' })).toBeVisible();
});

test('assisted calibration completes on a steady frontal face', async ({ page }) => {
  await startAndWaitForFace(page);
  await page.getByRole('button', { name: /auto calibration/i }).click();
  await page.waitForFunction(() => ['done', 'failed'].includes((window as unknown as X).__xray.useSession.getState().calibrationRun.phase), null, { timeout: 60_000 });
  const run = await page.evaluate(() => (window as unknown as X).__xray.useSession.getState().calibrationRun);
  expect(run.phase).toBe('done');
  const c = await page.evaluate(() => (window as unknown as X).__xray.useSettings.getState().calibration);
  expect(c.width).toBeGreaterThan(0.75);
  expect(c.width).toBeLessThan(1.3);
  expect(c.height).toBeGreaterThan(0.75);
  expect(c.height).toBeLessThan(1.3);
});
