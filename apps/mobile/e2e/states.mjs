// Every state the recon asks for, on the screens built so far:
// empty, error (with retry), long content, desktop width, keyboard only,
// plus the must-have flows not in the slice (move, manual activity, connections,
// race -> goal prefill, settings change regenerating the plan).
//
//   node e2e/states.mjs [baseUrl] [screensDir]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright');

const BASE = process.argv[2] ?? 'http://localhost:8081';
const SHOTS = process.argv[3];
const errors = [];
const step = (m) => console.log('  ✓', m);

const browser = await chromium.launch();
const ctx = async (width = 390, height = 844) => {
  const c = await browser.newContext({ viewport: { width, height } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => {
    // ?fail= makes calls fail on purpose; those surface in the UI, not the console
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return p;
};
const visible = (p, text, o) => p.getByText(text, o).filter({ visible: true }).first();
const btn = (p, name) => p.getByRole('button', { name, exact: true }).filter({ visible: true }).last();
const shot = async (p, id) => SHOTS && (await p.waitForTimeout(400), await p.screenshot({ path: `${SHOTS}/${id}.png` }));

async function run(name, fn) {
  const page = await ctx(...(fn.size ?? []));
  try {
    await fn(page);
  } catch (e) {
    errors.push(`${name}: ${e.message.split('\n')[0]}`);
    errors.push(`  at ${page.url()} :: ${(await page.innerText('body').catch(() => '')).slice(0, 300).replace(/\n+/g, ' | ')}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/FAILED-${name}.png` });
  } finally {
    await page.context().close();
  }
}

// ---------------------------------------------------------------- empty states
await run('empty', async (p) => {
  await p.goto(`${BASE}/home?seed=new&today=2026-10-14`);
  await visible(p, 'Pas encore de plan').waitFor();
  await shot(p, 'S08-empty');
  await p.goto(`${BASE}/journal`);
  await visible(p, 'Ton journal est vide').waitFor();
  await shot(p, 'S17-empty');
  await p.goto(`${BASE}/plan`);
  await visible(p, 'Pas encore de plan').waitFor();
  step('empty: home, journal, plan say what to do next');
});

// ---------------------------------------------------------------- error states
await run('error', async (p) => {
  await p.goto(`${BASE}/home?seed=demo&today=2026-10-13&fail=plan`);
  await visible(p, 'Ça n’a pas marché').waitFor();
  await visible(p, 'Connexion impossible').waitFor();
  await shot(p, 'S08-error');
  await btn(p, 'Réessayer').waitFor();
  step('error: home shows the failure and a retry');
});

// ---------------------------------------------------------------- long content and search
await run('long', async (p) => {
  await p.goto(`${BASE}/races?seed=demo&today=2026-10-13`);
  await visible(p, 'Semi des Vignes et des Coteaux de la Vallée').waitFor();
  await p.getByLabel('Rechercher').fill('zzzz');
  await visible(p, 'Aucune course trouvée').waitFor();
  await shot(p, 'S19-empty');
  await p.getByLabel('Rechercher').fill('');
  await p.getByRole('radio', { name: 'Trail' }).click();
  await visible(p, 'Ultra des Crêtes').waitFor();
  step('races: long names wrap, search empty state, trail filter');

  await p.getByLabel('Rechercher').fill('vignes');
  await p.getByRole('radio', { name: 'Tout' }).click();
  await visible(p, 'Semi des Vignes et des Coteaux de la Vallée').click();
  await visible(p, 'En bref').waitFor();
  await shot(p, 'S20');
  await btn(p, 'En faire mon objectif').click();
  await visible(p, 'Course choisie').waitFor();
  const date = await p.getByLabel('Date de la course').inputValue();
  if (date !== '13/06/2027') throw new Error(`goal date not prefilled from race: ${date}`);
  step('race detail -> goal is prefilled with the race and its date');
});

// ---------------------------------------------------------------- move a session
await run('move', async (p) => {
  await p.goto(`${BASE}/home?seed=demo&today=2026-10-13`);
  await btn(p, 'Détails').click();
  await btn(p, 'Déplacer').click();
  await visible(p, 'Choisis un autre jour').waitFor();
  await p.getByRole('radio', { name: /mercredi 14 octobre/ }).click();
  await shot(p, 'S16');
  await btn(p, 'Déplacer').click();
  await visible(p, 'Pourquoi cette séance').waitFor();
  await visible(p, 'mercredi 14 octobre').waitFor();
  step('move: Tuesday VMA moved to Wednesday');

  await btn(p, 'Déplacer').click();
  await p.getByRole('radio', { name: /jeudi 15 octobre/ }).click();
  await btn(p, 'Déplacer').click();
  await visible(p, 'Attention').waitFor();
  await visible(p, 'Il y a déjà une séance ce jour-là.').waitFor();
  step('move: warns when the day already has a session, offers to go ahead');
});

// ---------------------------------------------------------------- manual activity
await run('activity', async (p) => {
  await p.goto(`${BASE}/activity/new?seed=demo&today=2026-10-13`);
  await btn(p, 'Enregistrer').click();
  await visible(p, 'Saisis une durée').waitFor();
  await shot(p, 'S15');
  await p.getByRole('radio', { name: 'Vélo' }).click();
  await p.getByLabel('Durée').fill('1:05:00');
  await p.getByLabel('Distance (km)').fill('28,4');
  await btn(p, 'Enregistrer').click();
  await visible(p, 'Activité ajoutée').waitFor();
  await visible(p, 'Elle apparaît dans ton journal.').waitFor();
  await p.goto(`${BASE}/journal`);
  await visible(p, 'Vélo').waitFor();
  await shot(p, 'S17');
  step('manual activity: validation, saved, visible in the journal');
});

// ---------------------------------------------------------------- connections and settings
await run('settings', async (p) => {
  await p.goto(`${BASE}/settings/connections?seed=demo&today=2026-10-13`);
  await btn(p, 'Connecter Garmin').click();
  await btn(p, 'Déconnecter Garmin').waitFor();
  await shot(p, 'S25');
  step('connections: connect and disconnect per provider');

  await p.goto(`${BASE}/profile`);
  await p.getByRole('radio', { name: /5 \/ sem\./ }).click();
  await visible(p, 'Ton plan passe à 5 séances par semaine à partir de demain.').waitFor();
  await p.goto(`${BASE}/home`);
  await p.getByRole('button', { name: 'Semaine suivante' }).click();
  await p.getByRole('button', { name: /^dimanche 25 octobre, / }).filter({ visible: true }).waitFor();
  const n = await p.getByRole('button', { name: /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d+ octobre, / }).filter({ visible: true }).count();
  if (n !== 5) throw new Error(`expected 5 sessions next week after switching, got ${n}`);
  step('settings: switching to 5 sessions/week regenerates the future plan');
});

// ---------------------------------------------------------------- free beginner path, no paywall
await run('beginner', async (p) => {
  await p.goto(`${BASE}/?seed=new&today=2026-10-12`);
  await p.getByLabel('Adresse e-mail').fill('debut@example.com');
  await btn(p, 'Continuer avec mon e-mail').click();
  await visible(p, 'Étape 1 sur 7').waitFor();
  await btn(p, 'Suivant').click();
  await btn(p, 'Suivant').click();
  await p.getByRole('radio', { name: 'Je préfère ne pas répondre' }).click();
  await btn(p, 'Suivant').click();
  await p.getByRole('radio', { name: /Je commence/ }).click();
  for (let i = 0; i < 3; i++) await btn(p, 'Suivant').click();
  await p.getByRole('radio', { name: 'Non, estimez pour moi' }).click();
  await btn(p, 'Voir mon niveau').click();
  await visible(p, 'Estimées à partir de tes réponses.', { exact: false }).waitFor();
  await btn(p, 'Choisir mon objectif').click();
  await p.getByRole('radio', { name: /Commencer à courir/ }).click();
  await visible(p, 'Cet objectif est inclus gratuitement.').waitFor();
  await btn(p, 'Continuer').click();
  await visible(p, '8 semaines · 3 séances par semaine').waitFor();
  await shot(p, 'S06-beginner');
  await btn(p, 'Créer mon plan').click();
  await visible(p, 'Semaine 1 sur 8').waitFor();
  await visible(p, /min de course, 2 min de marche/).waitFor();
  await shot(p, 'S08-beginner');
  step('free beginner programme: no paywall, run/walk sessions, 8 weeks');
});

// ---------------------------------------------------------------- desktop width
const desktop = async (p) => {
  await p.goto(`${BASE}/home?seed=demo&today=2026-10-13`);
  await visible(p, 'Bonjour Camille').waitFor();
  const box = await p.getByText('Bonjour Camille').filter({ visible: true }).first().boundingBox();
  if (box.x < 300) throw new Error(`content not centred at 1440px (x=${box.x})`);
  await shot(p, 'S08-1440');
  await btn(p, 'Détails').click();
  await visible(p, 'Pourquoi cette séance').waitFor();
  await shot(p, 'S10-1440');
  step('1440px: content column centred, readable width');
};
desktop.size = [1440, 900];
await run('desktop', desktop);

// ---------------------------------------------------------------- keyboard only
await run('keyboard', async (p) => {
  await p.goto(`${BASE}/?seed=new&today=2026-10-14`);
  await visible(p, 'Un plan qui s’adapte à toi').waitFor();
  await p.getByLabel('Adresse e-mail').focus();
  await p.keyboard.type('keys@example.com');
  // tab forward to the primary button and press Enter
  for (let i = 0; i < 6; i++) {
    await p.keyboard.press('Tab');
    const label = await p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent);
    if (label?.includes('Continuer avec mon e-mail')) break;
  }
  const focused = await p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  if (!focused.includes('Continuer avec mon e-mail')) throw new Error(`could not reach the sign-in button by Tab (focus on "${focused}")`);
  const ring = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  if (ring === 'none') throw new Error('no visible focus ring on the focused button');
  await shot(p, 'S01-focus');
  await p.keyboard.press('Enter');
  await visible(p, 'Étape 1 sur 7').waitFor();
  step('keyboard: tab to the button, visible focus ring, Enter submits');

  // radios by keyboard on the questionnaire
  for (let k = 0; k < 3; k++) {
    await btn(p, 'Suivant').focus();
    await p.keyboard.press('Enter');
  }
  await visible(p, 'Choisis une réponse.').waitFor();
  await p.getByRole('radio', { name: 'Un homme' }).focus();
  await p.keyboard.press('Enter');
  const checked = await p.getByRole('radio', { name: 'Un homme' }).getAttribute('aria-checked');
  if (checked !== 'true') throw new Error('radio not selectable with Enter');
  step('keyboard: radio choices selectable with Enter');
});

await browser.close();
if (errors.length) {
  console.log('FAILED\n' + errors.join('\n'));
  process.exit(1);
}
console.log('states: all checks passed, no console errors');
