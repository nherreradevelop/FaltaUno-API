const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  chromium,
} = require('C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const base = path.join(__dirname, 'qa');
  const usuario = { id: 'cu42-banner-prueba', nombre: 'Ana Prueba', email: 'banner@test.invalid', fotoUrl: null };
  let hayIniciadasHoy = true;
  const rutas = [];
  await page.addInitScript((user) => {
    globalThis.localStorage.setItem(
      'faltauno.sesion',
      JSON.stringify({
        token: 'prueba-banner-cu42',
        usuario: user,
        filtrosBusqueda: { deportes: [], departamentos: [], niveles: [], franjas: [], desde: '', hasta: '', cupoMaximo: null },
      }),
    );
    globalThis.navigator.geolocation.getCurrentPosition = (_ok, error) =>
      error({ code: 1, message: 'Sin ubicación para esta prueba' });
  }, usuario);
  await page.route('**/socket.io/**', (route) => route.abort());
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    rutas.push(url.pathname);
    let body = {};
    if (url.pathname === '/api/usuarios/yo') body = usuario;
    else if (url.pathname === '/api/notificaciones/no-leidas') body = { cantidad: 0 };
    else if (url.pathname === '/api/deportes' || url.pathname === '/api/actividades/departamentos') body = [];
    else if (url.pathname === '/api/actividades')
      body = {
        actividades: [],
        pagina: 1,
        hayMas: false,
        ...(url.searchParams.get('grupo') === 'otras' ? { hayIniciadasHoy } : {}),
      };
    else if (url.pathname === '/api/actividades/iniciadas') body = { actividades: [], pagina: 1, hayMas: false };
    await route.fulfill({ status: 200, json: body });
  });
  try {
    await page.goto('http://localhost:5176/');
    const banner = page.getByRole('complementary', { name: 'Actividades de hoy' });
    await banner.waitFor();
    assert.equal(await banner.getByRole('link', { name: 'Ver mis actividades' }).getAttribute('href'), '/mis-actividades');
    assert.equal(await page.locator('.actividad-tarjeta').count(), 0);
    await page.screenshot({ path: path.join(base, 'banner-web.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(base, 'banner-web-angosto.png'), fullPage: true });
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await banner.getByRole('link', { name: 'Ver mis actividades' }).click();
    await page.waitForURL('**/mis-actividades');
    hayIniciadasHoy = false;
    await page.goto('http://localhost:5176/');
    await page.getByText('Actividades que podrían interesarte', { exact: true }).waitFor();
    await page.getByText('Todavía no hay actividades que coincidan con tu búsqueda.').count();
    assert.equal(await banner.count(), 0);
    assert.ok(!rutas.some((ruta) => ruta.includes('/iniciadas/hoy')));
    await fs.writeFile(
      path.join(base, 'verificacion-banner.json'),
      JSON.stringify(
        {
          estado: 'aprobado',
          casos: [
            'Marca verdadera con búsqueda vacía: banner visible',
            'Enlace a Mis actividades',
            'Marca falsa: banner ausente',
            '390 píxeles sin desborde',
            'La marca llega en la búsqueda; sin petición HTTP adicional',
          ],
          api: 'Respuestas simuladas para interfaz; pertenencia y fecha verificadas además con HTTP y PostgreSQL reales.',
        },
        null,
        2,
      ),
    );
    console.log('Banner CU42: condición, enlace, búsqueda vacía y ancho de 390 px aprobados.');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
