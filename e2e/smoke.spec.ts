import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __themHills?: Probe & { save(): Promise<void> };
  }
}

interface Probe {
  ready: boolean;
  phase: string;
  position: { x: number; y: number; z: number };
  carryGrams: number;
  wallet: number;
  loopComplete: boolean;
  error: string | null;
  frameLuma: number;
  peakCarryGrams: number;
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/favicon|swiftshader|AudioContext|downloadable font/i.test(text)) return;
    errors.push(text);
  });
  return errors;
}

async function readProbe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const probe = window.__themHills;
    if (!probe) throw new Error('probe missing');
    return {
      ready: probe.ready,
      phase: probe.phase,
      position: probe.position,
      carryGrams: probe.carryGrams,
      wallet: probe.wallet,
      loopComplete: probe.loopComplete,
      error: probe.error,
      frameLuma: probe.frameLuma,
      peakCarryGrams: probe.peakCarryGrams,
    };
  });
}

async function waitReady(page: Page): Promise<Probe> {
  await page.waitForFunction(
    () => {
      const probe = window.__themHills;
      return !!probe?.ready && probe.frameLuma > 0.4;
    },
    undefined,
    { timeout: 90_000 },
  );
  return readProbe(page);
}

test('boots, guides the first claim, and the panels respond', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.locator('#boot-status')).toBeVisible();
  await page.waitForSelector('#boot-start', { timeout: 90_000 });
  await expect(page.locator('#boot-status')).toContainText(/Coyote Creek/i);
  await page.locator('#boot-start').click();
  await page.waitForFunction(
    () => {
      const tracker = document.querySelector('.hud-quest-tracker');
      return (
        !!tracker &&
        !tracker.hasAttribute('hidden') &&
        /First claim/.test(tracker.textContent ?? '')
      );
    },
    undefined,
    { timeout: 30_000 },
  );
  const probe = await readProbe(page);
  expect(probe.frameLuma).toBeGreaterThan(0.4);
  await expect(page.locator('.hud-quest-tracker')).toContainText(/east/i);

  await page.keyboard.press('KeyH');
  await expect(page.locator('.panel-card h2')).toHaveText('Controls');
  await page.keyboard.press('KeyH');
  await page.keyboard.press('Tab');
  await expect(page.locator('#panel-inventory')).toContainText(/Shovel/);
  await page.keyboard.press('Tab');
  await page.keyboard.press('KeyM');
  await expect(page.locator('.panel-map-note')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.panel-map-note')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.panel-card h2')).toHaveText('Paused');
  await page.keyboard.press('Escape');

  const origin = (await readProbe(page)).position;
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    (start) => {
      const probe = window.__themHills;
      if (!probe) return false;
      const dx = probe.position.x - start.x;
      const dz = probe.position.z - start.z;
      return Math.hypot(dx, dz) > 0.6;
    },
    origin,
    { timeout: 8_000 },
  );
  await page.keyboard.up('KeyW');

  const icon = await page.request.get('/favicon.ico');
  expect(icon.status()).toBe(200);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('plays the prospect loop and reloads the save', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = trackErrors(page);
  await page.goto('/?smoke=1');
  await page.waitForFunction(
    () => {
      const probe = window.__themHills;
      return !!probe && (probe.loopComplete || probe.error !== null);
    },
    undefined,
    { timeout: 120_000 },
  );
  const done = await readProbe(page);
  expect(done.error, done.phase).toBeNull();
  expect(done.loopComplete).toBe(true);
  expect(done.peakCarryGrams).toBeGreaterThan(0.04);
  expect(done.wallet).toBeGreaterThan(0.2);
  await page.evaluate(async () => {
    await window.__themHills?.save();
  });
  const wallet = done.wallet;
  await page.goto('/');
  await page.waitForSelector('#boot-start', { timeout: 90_000 });
  await page.locator('#boot-start').click();
  await waitReady(page);
  const restored = await readProbe(page);
  expect(restored.wallet).toBeGreaterThan(wallet - 0.05);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('captures fixed cameras', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  for (const shot of ['spawn', 'creek', 'camp', 'dusk', 'night', 'dawn']) {
    await page.goto(`/?shot=${shot}`);
    await waitReady(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/visual/${shot}.png` });
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
