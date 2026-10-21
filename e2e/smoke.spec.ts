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
  drawCalls?: number;
  triangles?: number;
  frameBudget?: { frameMs: number; drawCalls: number; triangles: number };
  peakCarryGrams: number;
  graphics?: string;
  saveVersion?: number;
  panTier?: number;
  claimCount?: number;
  geologyMarks?: number;
  sampleHoles?: number;
  machineCount?: number;
  activeViz?: string | null;
  applyShot?: (name: string) => boolean;
  previewScene?: (who: string) => boolean;
  enterDrift?: () => boolean;
  standInDrift?: (localZ: number) => boolean;
  driftLocalZ?: () => number;
  driftPhase?: () => string;
  driftClock?: () => number;
  sceneView?: (need: string[]) => { black: number; present: string[]; missing: string[] };
  waterRise?: number;
  blackRatio?: number;
}

declare global {
  interface Window {
    __themHills?: Probe & {
      save(): Promise<void>;
      graphics?: string;
      exportLegacyV4?: () => unknown;
      upgradeCost?: (category: string) => number | null;
      buyUpgrade?: (category: string) => boolean;
      stakeClaim?: () => { ok: boolean; reason: string };
      prepareShowcase?: () => { x: number; z: number };
      startMachine?: (kind: string) => boolean;
      cancelProspect?: () => void;
      lookAt?: (x: number, z: number) => void;
      spawnJumper?: () => boolean;
      playerPose?: { clip: string; bind: boolean };
      scatterCount?: () => number;
      propAudit?: () => { overlaps: string[]; intruders: string[] };
      bareMeshes?: () => string[];
      hatFit?: () => { checked: number; floating: string[] };
      crewReady?: () => boolean;
      previewScene?: (who: string) => boolean;
      enterDrift?: () => boolean;
      standInDrift?: (localZ: number) => boolean;
      driftLocalZ?: () => number;
      driftPhase?: () => string;
      driftClock?: () => number;
      sceneView?: (need: string[]) => { black: number; present: string[]; missing: string[] };
      waterRise?: number;
    };
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
      saveVersion: probe.saveVersion,
      panTier: probe.panTier,
      claimCount: probe.claimCount,
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
  await expect(page.locator('button[data-quality="high"]')).toBeVisible();
  await page.evaluate(() => document.exitPointerLock());
  await page.locator('button[data-quality="medium"]').click();
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
  // Eleven SwiftShader readbacks. The lode shot clears its budget check and then
  // the canvas screenshot; 6 minutes ran out on that last readback.
  test.setTimeout(480_000);
  const errors = trackErrors(page);
  const shots = [
    'spawn',
    'creek',
    'camp',
    'dusk',
    'night',
    'dawn',
    'inn',
    'town',
    'creekbank',
    'prospector',
    'lode',
  ] as const;
  await page.goto('/?shot=spawn');
  await waitReady(page);
  for (const shot of shots) {
    const applied = await page.evaluate(
      (name) => window.__themHills?.applyShot?.(name) ?? false,
      shot,
    );
    expect(applied, shot).toBe(true);
    const minLuma = shot === 'night' ? 0.05 : shot === 'dusk' ? 0.15 : shot === 'lode' ? 0.02 : 0.4;
    await page.waitForFunction((floor) => (window.__themHills?.frameLuma ?? 0) > floor, minLuma, {
      timeout: 15_000,
    });
    await page.waitForTimeout(400);
    const budget = await page.evaluate(() => {
      const probe = window.__themHills;
      return {
        calls: probe?.drawCalls ?? 0,
        tris: probe?.triangles ?? 0,
        budgetCalls: probe?.frameBudget?.drawCalls ?? 0,
        budgetTris: probe?.frameBudget?.triangles ?? 0,
      };
    });
    expect(budget.calls, `${shot} draw calls`).toBeGreaterThan(8);
    expect(budget.calls, `${shot} draw calls`).toBeLessThanOrEqual(budget.budgetCalls);
    expect(budget.tris, `${shot} triangles`).toBeGreaterThan(100);
    expect(budget.tris, `${shot} triangles`).toBeLessThanOrEqual(budget.budgetTris);
    if (shot === 'lode') {
      await page.waitForFunction(
        () => {
          const view = window.__themHills?.sceneView?.(['drift-shell', 'drift-lantern']);
          return !!view && view.black < 0.9 && view.missing.length === 0;
        },
        undefined,
        { timeout: 15_000 },
      );
    }
    await page.screenshot({ path: `test-results/visual/${shot}.png` });
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('migrates a v4 save, buys a tool, and stakes a claim', async ({ page }) => {
  // Three boots. The purchase had already landed (wallet at the $80 headroom)
  // when the test clock cut off waitReady on the reload.
  test.setTimeout(300_000);
  const errors = trackErrors(page);
  await page.goto('/?freezeSave=1');
  await page.waitForSelector('#boot-start', { timeout: 120_000 });
  await page.waitForFunction(
    () => typeof window.__themHills?.exportLegacyV4 === 'function',
    undefined,
    {
      timeout: 30_000,
    },
  );
  const panPrice = await page.evaluate(() => window.__themHills?.upgradeCost('pan') ?? null);
  expect(panPrice).not.toBeNull();
  const price = panPrice ?? 0;
  const headroom = 80;
  await page.evaluate(async ({ price, headroom }) => {
    const legacy = window.__themHills?.exportLegacyV4() as { wallet?: { balance?: number } } | undefined;
    if (!legacy?.wallet || typeof legacy.wallet.balance !== 'number') throw new Error('no legacy snapshot');
    legacy.wallet.balance = price + headroom;
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('keyval-store');
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('keyval')) db.createObjectStore('keyval');
      };
      open.onerror = () => reject(open.error ?? new Error('indexedDB open failed'));
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').put(legacy, 'themhills:save:slot1');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error('indexedDB write failed'));
      };
    });
  }, { price, headroom });

  await page.goto('/');
  await page.waitForSelector('#boot-start', { timeout: 120_000 });
  await page.locator('#boot-start').click();
  await waitReady(page);
  const migrated = await page.evaluate(() => {
    const probe = window.__themHills;
    if (!probe) throw new Error('probe missing');
    return {
      saveVersion: probe.saveVersion,
      wallet: probe.wallet,
      carryGrams: probe.carryGrams,
      x: probe.position.x,
      z: probe.position.z,
      panTier: probe.panTier,
      claimCount: probe.claimCount,
    };
  });
  expect(migrated.saveVersion).toBe(6);
  expect(migrated.wallet).toBeGreaterThan(price + headroom - 1);
  expect(migrated.wallet).toBeLessThan(price + headroom + 1);
  expect(migrated.carryGrams).toBeGreaterThan(1.4);
  expect(Math.hypot(migrated.x - 4, migrated.z - -3)).toBeLessThan(8);
  expect(migrated.panTier).toBe(1);
  expect(migrated.claimCount).toBe(0);
  const marks = await page.evaluate(() => window.__themHills?.geologyMarks ?? 0);
  expect(marks).toBeGreaterThan(8);

  const bought = await page.evaluate(() => window.__themHills?.buyUpgrade('pan') ?? false);
  expect(bought).toBe(true);
  const staked = await page.evaluate(
    () => window.__themHills?.stakeClaim() ?? { ok: false, reason: 'missing' },
  );
  expect(staked.ok, staked.reason).toBe(true);

  await page.evaluate(async () => {
    await window.__themHills?.save();
  });
  await page.goto('/');
  await page.waitForSelector('#boot-start', { timeout: 120_000 });
  await page.locator('#boot-start').click();
  await waitReady(page);
  const kept = await page.evaluate(() => {
    const probe = window.__themHills;
    if (!probe) throw new Error('probe missing');
    return {
      saveVersion: probe.saveVersion,
      panTier: probe.panTier,
      claimCount: probe.claimCount,
      wallet: probe.wallet,
      carryGrams: probe.carryGrams,
    };
  });
  expect(kept.saveVersion).toBe(6);
  expect(kept.panTier).toBe(2);
  expect(kept.claimCount).toBe(1);
  expect(kept.wallet).toBeGreaterThan(headroom - 1);
  expect(kept.wallet).toBeLessThan(headroom + 1);
  expect(kept.carryGrams).toBeGreaterThan(1.4);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('places machines on a claim and starts each one', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForSelector('#boot-start', { timeout: 120_000 });
  await page.locator('#boot-start').click();
  await waitReady(page);
  const spot = await page.evaluate(() => window.__themHills?.prepareShowcase?.() ?? { x: 0, z: 0 });
  await page.waitForFunction(() => (window.__themHills?.machineCount ?? 0) >= 4, undefined, {
    timeout: 10_000,
  });
  for (const kind of ['rocker', 'sluice', 'longtom', 'monitor'] as const) {
    const started = await page.evaluate(
      (name) => window.__themHills?.startMachine?.(name) ?? false,
      kind,
    );
    expect(started, kind).toBe(true);
    await page.waitForFunction((name) => window.__themHills?.activeViz === name, kind, {
      timeout: 10_000,
    });
    const fitting: Record<string, string> = {
      rocker: 'rock',
      sluice: 'shovel',
      longtom: 'shovel',
      monitor: 'aim',
    };
    // A shovel cycle is 1.25s. Sample from the test runner so a busy frame
    // cannot collapse the window into one read. None of them may be the bind T.
    const seen: { clip: string; bind: boolean; viz: string | null }[] = [];
    for (let i = 0; i < 8; i++) {
      seen.push(
        await page.evaluate(() => {
          const pose = window.__themHills?.playerPose;
          return {
            clip: pose?.clip ?? 'missing',
            bind: pose?.bind !== false,
            viz: window.__themHills?.activeViz ?? null,
          };
        }),
      );
      await page.waitForTimeout(180);
    }
    expect(seen, kind).toHaveLength(8);
    for (const pose of seen) {
      expect(pose.viz, kind).toBe(kind);
      expect(pose.bind, `${kind} clip ${pose.clip}`).toBe(false);
      expect(pose.clip, kind).toBe(fitting[kind]);
    }
    await page.evaluate(() => window.__themHills?.cancelProspect?.());
  }
  expect(spot.x + spot.z).not.toBeNaN();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('drift, blast, cave-in, flood, and fire stay in frame', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await page.goto('/?shot=spawn&freezeSave=1');
  await waitReady(page);
  await page.waitForFunction(() => (window.__themHills?.scatterCount?.() ?? 0) > 0, undefined, {
    timeout: 20_000,
  });
  const audit = await page.evaluate(
    () => window.__themHills?.propAudit?.() ?? { overlaps: ['missing'], intruders: ['missing'] },
  );
  expect(audit.overlaps, audit.overlaps.join('; ')).toEqual([]);
  expect(audit.intruders, audit.intruders.join('; ')).toEqual([]);
  const bare = await page.evaluate(() => window.__themHills?.bareMeshes?.() ?? ['missing']);
  expect(bare, bare.join('; ')).toEqual([]);
  await page.waitForFunction(() => (window.__themHills?.hatFit?.().checked ?? 0) >= 4, undefined, {
    timeout: 25_000,
  });
  const hats = await page.evaluate(
    () => window.__themHills?.hatFit?.() ?? { checked: 0, floating: ['missing'] },
  );
  expect(hats.floating, hats.floating.join('; ')).toEqual([]);

  const entered = await page.evaluate(() => window.__themHills?.enterDrift?.() ?? false);
  expect(entered).toBe(true);
  await page.waitForFunction(
    () => {
      const view = window.__themHills?.sceneView?.(['drift-shell', 'drift-lantern']);
      return !!view && view.black < 0.9 && view.missing.length === 0;
    },
    undefined,
    { timeout: 20_000 },
  );

  expect(await page.evaluate(() => window.__themHills?.previewScene?.('blast') ?? false)).toBe(true);
  await page.waitForFunction(
    () => {
      const view = window.__themHills?.sceneView?.(['drift-shell', 'fuse-sparks']);
      return !!view && view.black < 0.9 && view.missing.length === 0;
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => {
      const view = window.__themHills?.sceneView?.(['drift-shell', 'drift-flash']);
      return !!view && view.black < 0.9 && view.missing.length === 0;
    },
    undefined,
    { timeout: 45_000 },
  );
  await page.waitForFunction(
    () => {
      const view = window.__themHills?.sceneView?.(['drift-shell', 'drift-ore']);
      return !!view && view.black < 0.9 && view.missing.length === 0;
    },
    undefined,
    { timeout: 40_000 },
  );

  expect(await page.evaluate(() => window.__themHills?.previewScene?.('cavein') ?? false)).toBe(true);
  await page.waitForFunction(
    () => {
      const phase = window.__themHills?.driftPhase?.();
      const clock = window.__themHills?.driftClock?.() ?? 0;
      const view = window.__themHills?.sceneView?.(['drift-shell', 'drift-rubble']);
      return phase === 'cave' && clock > 0.25 && clock < 1.15 && !!view && view.black < 0.9 && view.missing.length === 0;
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(() => window.__themHills?.driftPhase?.() === 'buried', undefined, {
    timeout: 30_000,
  });

  expect(await page.evaluate(() => window.__themHills?.standInDrift?.(-4.65) ?? false)).toBe(true);
  await page.waitForFunction(() => (window.__themHills?.driftLocalZ?.() ?? -9) > -4.5, undefined, {
    timeout: 10_000,
  });
  expect(await page.evaluate(() => window.__themHills?.standInDrift?.(-2.2) ?? false)).toBe(true);
  await page.waitForTimeout(400);
  const portalSide = await page.evaluate(() => {
    const view = window.__themHills?.sceneView?.(['drift-shell']);
    return {
      z: window.__themHills?.driftLocalZ?.() ?? 0,
      black: view?.black ?? 1,
      missing: view?.missing ?? ['drift-shell'],
    };
  });
  expect(portalSide.z).toBeLessThan(-1.4);
  expect(portalSide.z).toBeGreaterThan(-3.2);
  expect(portalSide.black).toBeLessThan(0.9);
  expect(portalSide.missing).toEqual([]);

  for (let i = 0; i < 4; i++) {
    expect(await page.evaluate(() => window.__themHills?.previewScene?.('dig') ?? false)).toBe(true);
  }
  await page.waitForFunction(() => window.__themHills?.driftPhase?.() === 'idle', undefined, {
    timeout: 10_000,
  });
  expect(await page.evaluate(() => window.__themHills?.standInDrift?.(-6.2) ?? false)).toBe(true);
  await page.waitForTimeout(400);
  const faceSide = await page.evaluate(() => window.__themHills?.driftLocalZ?.() ?? 0);
  expect(faceSide).toBeLessThan(-5.6);

  expect(await page.evaluate(() => window.__themHills?.previewScene?.('flood') ?? false)).toBe(true);
  await page.waitForFunction(
    () => {
      const rise = window.__themHills?.waterRise ?? 0;
      const view = window.__themHills?.sceneView?.(['water_coyote_creek', 'gravel-bars']);
      return rise > 0.15 && !!view && view.black < 0.9 && view.missing.length === 0;
    },
    undefined,
    { timeout: 20_000 },
  );

  expect(await page.evaluate(() => window.__themHills?.previewScene?.('rush') ?? false)).toBe(true);
  await page.waitForFunction(
    () => {
      const view = window.__themHills?.sceneView?.(['rush-tent', 'rush-prospector', 'general_store']);
      if (!view || view.black >= 0.9) return false;
      const tents = view.present.includes('rush-tent') && view.present.includes('rush-prospector');
      const storeOut = !view.present.includes('general_store');
      return tents && storeOut;
    },
    undefined,
    { timeout: 20_000 },
  );

  expect(await page.evaluate(() => window.__themHills?.previewScene?.('fire') ?? false)).toBe(true);
  await page.waitForFunction(
    () => {
      const view = window.__themHills?.sceneView?.(['fire-shed', 'fire-flame']);
      return !!view && view.black < 0.9 && view.missing.length === 0;
    },
    undefined,
    { timeout: 20_000 },
  );

  expect(await page.evaluate(() => window.__themHills?.previewScene?.('quench') ?? false)).toBe(true);
  await page.waitForFunction(
    () => {
      const view = window.__themHills?.sceneView?.(['fire-shed', 'fire-flame']);
      return !!view && view.black < 0.9 && view.present.includes('fire-shed') && view.missing.includes('fire-flame');
    },
    undefined,
    { timeout: 20_000 },
  );

  expect(errors, errors.join('\n')).toEqual([]);
});
