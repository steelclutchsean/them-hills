import { expect, test, type Page } from '@playwright/test';

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
  graphics?: string;
  applyShot?: (name: string) => boolean;
}

declare global {
  interface Window {
    __themHills?: Probe & { save(): Promise<void>; graphics?: string };
  }
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
  test.setTimeout(240_000);
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
  await expect(page.locator('[data-quality="high"]')).toBeVisible();
  await page.locator('[data-quality="medium"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.quality === 'medium');
  await page.waitForFunction(() => window.__themHills?.graphics === 'medium');
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
  test.setTimeout(300_000);
  const errors = trackErrors(page);
  await page.goto('/?smoke=1');
  const deadline = Date.now() + 180_000;
  let lastPhase = '';
  let done: Probe | null = null;
  while (Date.now() < deadline) {
    const probe = await page
      .evaluate(() => {
        const live = window.__themHills;
        if (!live) return null;
        return {
          ready: live.ready,
          phase: live.phase,
          position: live.position,
          carryGrams: live.carryGrams,
          wallet: live.wallet,
          loopComplete: live.loopComplete,
          error: live.error,
          frameLuma: live.frameLuma,
          peakCarryGrams: live.peakCarryGrams,
        };
      })
      .catch(() => null);
    if (probe && probe.phase !== lastPhase) {
      console.log(
        `[smoke] ${probe.phase} carry=${probe.carryGrams.toFixed(3)} wallet=${probe.wallet.toFixed(2)}`,
      );
      lastPhase = probe.phase;
    }
    if (probe && (probe.loopComplete || probe.error !== null)) {
      done = probe;
      break;
    }
    await page.waitForTimeout(500);
  }
  expect(done, `pilot still in ${lastPhase || 'boot'}`).not.toBeNull();
  expect(done!.error, done!.phase).toBeNull();
  expect(done!.loopComplete).toBe(true);
  expect(done!.peakCarryGrams).toBeGreaterThan(0.04);
  expect(done!.wallet).toBeGreaterThan(0.2);
  await page.evaluate(async () => {
    await window.__themHills?.save();
  });
  const wallet = done!.wallet;
  await page.goto('/');
  await page.waitForSelector('#boot-start', { timeout: 120_000 });
  await page.locator('#boot-start').click();
  await waitReady(page);
  const restored = await readProbe(page);
  expect(restored.wallet).toBeGreaterThan(wallet - 0.05);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('captures fixed cameras', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  const shots = [
    'spawn',
    'creek',
    'camp',
    'dusk',
    'night',
    'dawn',
    'inn',
    'creekbank',
    'prospector',
  ] as const;
  await page.goto('/?shot=spawn');
  await waitReady(page);
  for (const shot of shots) {
    const applied = await page.evaluate(
      (name) => window.__themHills?.applyShot?.(name) ?? false,
      shot,
    );
    expect(applied, shot).toBe(true);
    const minLuma = shot === 'night' ? 0.05 : shot === 'dusk' ? 0.15 : 0.4;
    await page.waitForFunction((floor) => (window.__themHills?.frameLuma ?? 0) > floor, minLuma, {
      timeout: 15_000,
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/visual/${shot}.png` });
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
