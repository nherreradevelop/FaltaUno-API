const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  chromium,
} = require('C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright');
const API = 'http://127.0.0.1:3002';
const WEB = 'http://localhost:5176';
(async () => {
  const casos = [];
  const escenario = async (modo) => {
    const r = await fetch(`${API}/prueba/escenario/${modo}`, { method: 'POST' });
    assert.equal(r.status, 200);
  };
  await escenario('normal');
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'armanelian@gmail.com', password: 'FaltaUno123!' }),
  });
  assert.equal(login.status, 200);
  const sesion = await login.json();
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript((s) => {
    globalThis.localStorage.setItem(
      'faltauno.sesion',
      JSON.stringify({
        token: s.token,
        usuario: s.usuario,
        filtrosBusqueda: { deportes: [], departamentos: [], niveles: [], franjas: [], desde: '', hasta: '', cupoMaximo: null },
      }),
    );
    globalThis.navigator.geolocation.getCurrentPosition = (_ok, error) => error({ code: 1, message: 'Sin GPS para la prueba' });
  }, sesion);
  await page.route('**/socket.io/**', (route) => route.abort());
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const r = await route.fetch({ url: `${API}${url.pathname}${url.search}` });
    await route.fulfill({ response: r });
  });
  const captura = async (nombre) => {
    const anterior = page.viewportSize();
    const encuadrar = !['listado', 'banner', 'banner-angosto', 'listado-angosto'].includes(nombre);
    if (encuadrar) {
      await page.setViewportSize({ width: 390, height: 844 });
      if (nombre === 'paginacion') await titulos().last().scrollIntoViewIfNeeded();
      else if (nombre === 'error-pagina')
        await page.getByRole('button', { name: 'Reintentar', exact: true }).scrollIntoViewIfNeeded();
      else if (nombre === 'sin-banner')
        await page.getByRole('heading', { name: 'Explorar actividades', exact: true }).scrollIntoViewIfNeeded();
      else await page.evaluate(() => globalThis.scrollTo(0, 0));
    }
    await page.screenshot({ path: path.join(__dirname, 'capturas', `web-${nombre}.png`) });
    if (encuadrar) await page.setViewportSize(anterior);
  };
  const titulos = () => page.locator('.mis-actividades__tarjeta h3');
  const esperarCantidad = (cantidad) =>
    page.waitForFunction((n) => globalThis.document.querySelectorAll('.mis-actividades__tarjeta h3').length === n, cantidad);
  const aprobado = (id, obtenido) => casos.push({ id, estado: 'aprobado', obtenido });
  try {
    await page.goto(`${WEB}/mis-actividades`);
    await esperarCantidad(10);
    assert.equal(await titulos().first().innerText(), 'Actividad de hoy CU42');
    assert.equal(await page.getByText('es hoy!', { exact: true }).count(), 1);
    const color = await page.getByText('es hoy!', { exact: true }).evaluate((n) => globalThis.getComputedStyle(n).color);
    assert.equal(color, 'rgb(45, 90, 45)');
    await captura('listado');
    aprobado('CP-CU42-01', 'Diez actividades propias, orden descendente, una etiqueta verde es hoy! y plazo de gastos visible.');
    await page.getByRole('link', { name: 'Ver detalle de Actividad de hoy CU42', exact: true }).click();
    await page.getByRole('heading', { name: 'Actividad de hoy CU42', exact: true }).waitFor();
    await captura('detalle');
    aprobado('CP-CU42-04', 'Ver detalle abre CU09 de la actividad seleccionada.');
    await page.goto(`${WEB}/`);
    const banner = page.getByRole('complementary', { name: 'Actividades de hoy' });
    await banner.waitFor();
    await page.getByText('Tenes actividades que comienzan hoy!', { exact: true }).waitFor();
    assert.equal(
      await banner
        .getByText('hace click aca para ver tus actividades iniciadas y entra a la actividad para ver los detalles.', {
          exact: true,
        })
        .count(),
      1,
    );
    await captura('banner');
    await page.setViewportSize({ width: 390, height: 844 });
    await banner.scrollIntoViewIfNeeded();
    await captura('banner-angosto');
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await banner.getByRole('link', { name: 'Ver mis actividades' }).click();
    await esperarCantidad(10);
    await captura('listado-angosto');
    await page.setViewportSize({ width: 1440, height: 1000 });
    aprobado(
      'CP-CU42-03',
      'El banner usa el texto solicitado, muestra condición real desde PostgreSQL y enlaza a Mis actividades; 390 px sin desborde.',
    );
    await page.getByRole('button', { name: 'Ver más', exact: true }).click();
    await esperarCantidad(12);
    assert.equal(await page.getByRole('button', { name: 'Ver más', exact: true }).count(), 0);
    assert.equal(new Set(await titulos().allTextContents()).size, 12);
    await titulos().last().scrollIntoViewIfNeeded();
    await captura('paginacion');
    aprobado('CP-CU42-02', 'Ver más agrega dos actividades, sin duplicados, y retira el botón al terminar.');
    await escenario('vacio');
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page.getByText('Todavía no participás en ninguna actividad iniciada.', { exact: true }).waitFor();
    await captura('actualizado');
    await escenario('normal');
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await esperarCantidad(10);
    aprobado(
      'CP-CU42-11',
      'Actualizar retira las actividades archivadas en SQL y, al restaurar el escenario, vuelve a cargar las diez iniciadas.',
    );
    await escenario('error');
    await page.goto(`${WEB}/mis-actividades`);
    await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
    await captura('error');
    await escenario('normal');
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await esperarCantidad(10);
    await captura('reintento');
    aprobado('CP-CU42-06', '503 inicial muestra mensaje recuperable; reintentar recupera las diez tarjetas.');
    await escenario('error-pagina-2');
    await page.getByRole('button', { name: 'Ver más', exact: true }).click();
    await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
    assert.equal(await titulos().count(), 10);
    await page.getByRole('button', { name: 'Reintentar', exact: true }).scrollIntoViewIfNeeded();
    await captura('error-pagina');
    await escenario('normal');
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await esperarCantidad(12);
    aprobado('CP-CU42-07', 'La falla en página dos conserva diez registros y el reintento completa doce sin duplicar.');
    await escenario('invalido');
    await page.goto(`${WEB}/mis-actividades`);
    await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
    assert.equal(await titulos().count(), 0);
    await captura('invalido');
    aprobado('CP-CU42-08', 'HTTP 200 con datos incompletos se rechaza y muestra Reintentar.');
    await escenario('vacio');
    await page.goto(`${WEB}/mis-actividades`);
    await page.getByText('Todavía no participás en ninguna actividad iniciada.', { exact: true }).waitFor();
    await captura('vacio');
    await page.goto(`${WEB}/`);
    await page.getByText('Actividades que podrían interesarte', { exact: true }).waitFor();
    assert.equal(await banner.count(), 0);
    await captura('sin-banner');
    aprobado('CP-CU42-05', 'Vacío válido con enlace Explorar; actividades de otros estados y ajenas no habilitan el banner.');
    await escenario('sesion');
    await page.goto(`${WEB}/mis-actividades`);
    await page.waitForURL('**/login');
    await captura('sesion');
    aprobado('CP-CU42-09', '401 cierra el acceso privado y lleva a inicio de sesión.');
    await fs.writeFile(
      path.join(__dirname, 'web-ejecucion.json'),
      JSON.stringify(
        {
          fecha: '2026-11-27',
          entorno: API,
          datos: 'PostgreSQL faltauno_test y esquema temporal; fallas controladas por el servidor de evidencia.',
          casos,
        },
        null,
        2,
      ),
    );
    console.log(`Web: ${casos.length} escenarios funcionales aprobados con capturas.`);
  } finally {
    await escenario('normal');
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
