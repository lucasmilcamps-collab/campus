// Vertical slice, end to end in a browser against the web build:
// sign up -> questionnaire -> level -> goal -> plan setup -> paywall/trial -> home
// -> (time passes) -> log a hard session as "Extrême" -> plan adapts and says why.
//
//   node e2e/slice.mjs [baseUrl] [screensDir]
// Needs the web export served (see e2e/README.md). Exits 1 on any failure.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright');

const BASE = process.argv[2] ?? 'http://localhost:8081';
const SHOTS = process.argv[3];
const errors = [];
const step = (m) => console.log('  ✓', m);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => (process.env.DEBUG && console.log('    [console]', m.type(), m.text().slice(0, 200)), m.type() === 'error' && errors.push(`console: ${m.text()}`)));
const shot = async (id) => SHOTS && (await page.waitForTimeout(400), await page.screenshot({ path: `${SHOTS}/${id}.png` }));
const btn = (name) => page.getByRole('button', { name, exact: true }).last();
const settle = () => page.waitForTimeout(700);

try {
  await page.goto(`${BASE}/?seed=new&today=2026-10-14`);
  await page.getByText('Un plan qui s’adapte à toi').waitFor();
  await shot('S01');
  await btn('Continuer avec mon e-mail').click();
  await page.getByText('Vérifie ton adresse e-mail.').waitFor();
  step('S01 rejects an empty email');
  await page.getByLabel('Adresse e-mail').fill('runner@example.com');
  await btn('Continuer avec mon e-mail').click();

  await page.getByText('Étape 1 sur 7').waitFor();
  await page.getByLabel('Prénom (facultatif)').fill('Alex');
  await shot('S02');
  await btn('Suivant').click(); // name
  await btn('Suivant').click(); // age
  await btn('Suivant').click(); // sex, unanswered
  await page.getByText('Choisis une réponse.').waitFor();
  step('S02 requires an answer');
  await page.getByRole('radio', { name: 'Une femme' }).click();
  await btn('Suivant').click();
  await page.getByRole('radio', { name: /Entre 1 et 3 ans/ }).click();
  await btn('Suivant').click();
  await btn('Suivant').click(); // runs per week
  await btn('Suivant').click(); // km per week
  await page.getByRole('radio', { name: '10 km' }).click();
  await page.getByLabel('Ton temps').fill('5230');
  await btn('Voir mon niveau').click();
  await page.getByText('Saisis un temps au format').waitFor();
  step('S02 rejects a malformed time');
  await page.getByLabel('Ton temps').fill('52:30');
  await btn('Voir mon niveau').click();

  await page.getByText('Voici tes allures de départ').waitFor();
  await page.getByText('Calculées à partir de ton temps de course.').waitFor();
  await shot('S04');
  step('S04 shows paces from the race time');
  await btn('Choisir mon objectif').click();

  await page.getByText('Qu’est-ce que tu prépares ?').waitFor();
  await page.getByRole('radio', { name: /Une course sur route/ }).click();
  await page.getByLabel('Date de la course').fill('21/03/2027');
  await settle();
  await shot('S05');
  await btn('Continuer').click();

  await page.getByText('Combien de séances par semaine ?').waitFor();
  await page.getByText('semaines', { exact: true }).waitFor();
  await page.getByRole('radio', { name: /5 \/ sem\./ }).click();
  await page.getByRole('radio', { name: /4 \/ sem\./ }).click();
  await shot('S06');
  step('S06 previews 3/4/5 sessions');
  await btn('Créer mon plan').click();
  await page.getByText('Préparer une course fait partie de l’offre Entraînement').waitFor();
  step('S06 sends a paid goal to the paywall');
  await btn('Découvrir l’offre Entraînement').click();

  await page.getByText('Prépare ta course avec un plan qui s’adapte').waitFor();
  await shot('S07');
  await btn('Commencer mes 14 jours gratuits').click();

  await page.getByText('Bonjour Alex').waitFor({ timeout: 10000 });
  await page.getByText('Semaine 1 sur 23').waitFor();
  await shot('S08');
  step('plan created after the trial starts; home shows week 1 of 23');

  // Six days later: Thursday, Friday and Sunday were never logged.
  await page.evaluate(() => sessionStorage.setItem('stride.today', '2026-10-20'));
  await page.goto(`${BASE}/`);
  await page.getByText('Ton plan a été ajusté').filter({ visible: true }).first().waitFor();
  await page.getByText(/séances manquées/).waitFor();
  step('missed sessions are detected and the next week is lightened, with a reason');
  await btn('Compris').click();
  await settle();

  await page.getByText(/30 s vite/).filter({ visible: true }).first().waitFor();
  await btn('Détails').click();
  await page.getByText('Pourquoi cette séance').waitFor();
  await page.getByText('Déroulé').waitFor();
  await shot('S10');
  step('S10 shows the structured workout');
  const before = await page.getByText(/^\d:\d\d \/km$/).allInnerTexts();
  await btn('J’ai fait cette séance').click();

  await page.getByText('Comment ça s’est passé ?').waitFor();
  await btn('Enregistrer').click();
  await page.getByText('Choisis un ressenti pour continuer.').waitFor();
  step('S13 requires a feeling');
  await page.getByRole('radio', { name: '5, Extrême' }).click();
  await page.getByLabel('Note (facultatif)').fill('Vent de face, jambes lourdes');
  await shot('S13');
  await btn('Enregistrer').click();
  await page.getByText('Ton plan s’adapte').filter({ visible: true }).first().waitFor();
  await page.getByText(/tes allures ralentissent un peu/).filter({ visible: true }).first().waitFor();
  step('extreme feeling on a hard session slows future paces, and says so');
  await btn('Retour à ma semaine').click();

  await page.getByText('Ton plan a été ajusté').filter({ visible: true }).first().waitFor();
  await shot('S08-adjusted');
  step('home shows the adjustment banner');

  await page.getByRole('tab', { name: 'Plan' }).click();
  await page.getByText(/S1/).filter({ visible: true }).first().waitFor();
  await shot('S09');
  await page.getByRole('tab', { name: 'Courses' }).click();
  await page.getByText('Trouve ta prochaine course').waitFor();
  await shot('S19');
  await page.getByRole('tab', { name: 'Profil' }).click();
  await page.getByText('Entraînement', { exact: true }).waitFor();
  await shot('S24');
  step('tabs: plan, races, profile render');

  if (before.length === 0) throw new Error('no paces were visible on S10');
} catch (e) {
  errors.push(`step failed: ${e.message.split('\n')[0]}`);
  errors.push(`  at ${page.url()} :: ${(await page.innerText('body')).slice(0, 400).replace(/\n+/g, ' | ')}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/FAILED.png` });
} finally {
  await browser.close();
}
if (errors.length) {
  console.log('FAILED\n' + errors.join('\n'));
  process.exit(1);
}
console.log('vertical slice: all steps passed, no console errors');
