import { expect, test } from '@playwright/test';

type XrayWindow = Window & {
  __xray: {
    useSession: { getState: () => Record<string, unknown> & { assets: Record<string, { state: string }>; cameraStatus: string } };
    useSettings: { getState: () => { look: { mode: string } } };
  };
};

test.beforeEach(async ({ page }) => {
  await page.goto('/?e2e');
});

test('renders the three-panel layout with all control groups', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const left = page.getByRole('complementary', { name: 'Anatomy controls' });
  const right = page.getByRole('complementary', { name: 'Calibration and options' });
  for (const name of ['Layers', 'Look', 'Mixed Reality']) {
    await expect(left.getByRole('button', { name, exact: true })).toBeVisible();
  }
  for (const name of ['Fit to my head', 'Presets']) {
    await expect(right.getByRole('button', { name, exact: true })).toBeVisible();
  }
  for (const label of ['Skull', 'Brain', 'Muscles', 'Eyes', 'Head Outline', 'Hand Bones', 'Show Labels']) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible();
  await expect(page.getByText('Model preview — start the camera to enable live tracking')).toBeVisible();
  // The licensed skull model loads and renders in preview mode.
  await page.waitForFunction(() => (window as unknown as XrayWindow).__xray.useSession.getState().assets.skull.state === 'ready');
  await expect(page.locator('canvas').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('camera starts, shows live video and stops every track', async ({ page }) => {
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByText(/^Camera \d+×\d+$/)).toBeVisible();
  const live = await page.evaluate(() => {
    const v = document.querySelector('video')!;
    return (v.srcObject as MediaStream).getVideoTracks().map((t) => t.readyState);
  });
  expect(live).toEqual(['live']);
  // keep a handle to the stream to verify it is released
  await page.evaluate(() => {
    (window as unknown as { __stream: MediaStream }).__stream = document.querySelector('video')!.srcObject as MediaStream;
  });
  await page.getByRole('button', { name: 'Stop camera' }).click();
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible();
  const after = await page.evaluate(() => ({
    tracks: (window as unknown as { __stream: MediaStream }).__stream.getTracks().map((t) => t.readyState),
    src: document.querySelector('video')!.srcObject,
  }));
  expect(after.tracks).toEqual(['ended']);
  expect(after.src).toBeNull();
});

test('screenshot downloads a PNG of the composited view', async ({ page }) => {
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByText(/^Camera \d+×\d+$/)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /take screenshot/i }).click()]);
  expect(download.suggestedFilename()).toMatch(/^xray-mirror-\d{8}-\d{6}\.png$/);
  const path = await download.path();
  const { statSync, readFileSync } = await import('node:fs');
  expect(statSync(path).size).toBeGreaterThan(10_000);
  expect(readFileSync(path).subarray(1, 4).toString()).toBe('PNG');
});

test('keyboard shortcuts toggle render mode and open help', async ({ page }) => {
  await page.locator('body').press('x');
  await expect.poll(() => page.evaluate(() => (window as unknown as XrayWindow).__xray.useSettings.getState().look.mode)).toBe('solid');
  await page.locator('body').press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('privacy: every request is a same-origin GET and nothing is uploaded', async ({ page, baseURL }) => {
  const requests: { url: string; method: string; post: string | null }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), post: r.postData() }));
  await page.reload();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByText(/^Camera \d+×\d+$/)).toBeVisible();
  await page.waitForTimeout(5000);
  const origin = new URL(baseURL!).origin;
  const offending = requests.filter(
    (r) => !(r.url.startsWith(origin) || r.url.startsWith('data:') || r.url.startsWith('blob:')) || r.method !== 'GET' || r.post,
  );
  expect(offending).toEqual([]);
});
