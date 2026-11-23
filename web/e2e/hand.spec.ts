import { expect, test } from '@playwright/test';

/** Real MediaPipe hand tracking on a fake camera playing MediaPipe's thumb_up.jpg test asset. */
type X = Window & { __xray: { frameState: { hands: { present: boolean; handedness: string; score: number }[] }; useSession: { getState: () => { assets: Record<string, { state: string }>; handTracker: string } } } };

test('detects the hand and renders the anatomical hand skeleton', async ({ page }) => {
  await page.goto('/?e2e');
  await page.getByRole('button', { name: 'Start camera' }).click();
  await page.waitForFunction(() => (window as unknown as X).__xray.frameState.hands.some((h) => h.present), null, { timeout: 90_000 });
  const hands = await page.evaluate(() => (window as unknown as X).__xray.frameState.hands.filter((h) => h.present));
  expect(hands).toHaveLength(1);
  expect(hands[0].score).toBeGreaterThan(0.8);
  await page.waitForFunction(() => (window as unknown as X).__xray.useSession.getState().assets.hand.state === 'ready', null, { timeout: 30_000 });
  await expect(page.getByText('1 hand')).toBeVisible();
  // The detailed BodyParts3D skeleton is in use (the simplified fallback notice is absent).
  await expect(page.getByText(/simplified joint-and-bone fallback/i)).toHaveCount(0);
});
