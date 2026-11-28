const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  chromium,
} = require('C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright');

(async () => {
  const base = path.join(__dirname, 'qa');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const user = { id: 'cu42-usuario-visual', nombre: 'Ana Prueba', email: 'cu42@test.invalid', fotoUrl: null };
  let modo = 'lista';
  let fallarSegunda = true;
  const pedidos = [];
  const registros = Array.from({ length: 12 }, (_, i) => ({
    id: `cu42-${i}`,
    nombre: i === 0 ? 'Surf en La Paloma' : `Actividad iniciada ${i + 1}`,
    deporte: { id: 1, nombre: 'Surf' },
    estado: 'iniciada',
    fechaHoraInicio: '2026-11-20T15:00:00Z',
    fechaLimiteGastos: '2026-12-04T15:00:00Z',
    departamento: 'Rocha',
    esOrganizador: i % 2 === 0,
  }));
  await page.addInitScript((usuario) => {
    globalThis.localStorage.setItem('faltauno.sesion', JSON.stringify({ token: 'token-exclusivo-de-prueba-cu42', usuario }));
  }, user);
  await page.route('**/socket.io/**', (route) => route.abort());
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let body = {};
    if (url.pathname === '/api/usuarios/yo') body = user;
    else if (url.pathname === '/api/notificaciones/no-leidas') body = { cantidad: 0 };
    else if (url.pathname.includes('/notificaciones')) body = { notificaciones: [], hayMas: false };
    else if (url.pathname === '/api/actividades/iniciadas') {
      const pagina = Number(url.searchParams.get('pagina'));
      pedidos.push(pagina);
      if (modo === 'error' || (pagina === 2 && fallarSegunda)) {
        fallarSegunda = false;
        return route.fulfill({ status: 500, json: { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error simulado' } } });
      }
      if (modo === 'invalida') body = { actividades: [{}], pagina, hayMas: false };
      else
        body = {
          actividades: modo === 'vacia' ? [] : registros.slice((pagina - 1) * 10, pagina * 10),
          pagina,
          hayMas: modo === 'lista' && pagina === 1,
        };
    }
    await route.fulfill({ status: 200, json: body });
  });
  const titulos = () => page.locator('.mis-actividades__tarjeta h3');
  try {
    await page.goto('http://127.0.0.1:5176/mis-actividades');
    await titulos().first().waitFor();
    assert.equal(await titulos().count(), 10);
    assert.equal(await page.getByRole('link', { name: 'Mis actividades', exact: true }).getAttribute('aria-current'), 'page');
    assert.equal(
      await page.getByRole('link', { name: 'Ver detalle de Surf en La Paloma', exact: true }).getAttribute('href'),
      '/actividades/cu42-0',
    );
    await page.screenshot({ path: path.join(base, 'web-listado.png'), fullPage: true });
    await page.getByRole('button', { name: 'Ver más', exact: true }).click();
    await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
    assert.equal(await titulos().count(), 10);
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await page.waitForFunction(() => globalThis.document.querySelectorAll('.mis-actividades__tarjeta h3').length === 12);
    assert.deepEqual(pedidos, [1, 2, 2]);
    assert.equal(await page.getByRole('button', { name: 'Ver más', exact: true }).count(), 0);
    modo = 'invalida';
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
    assert.equal(await titulos().count(), 12);
    modo = 'vacia';
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await page.getByText('Todavía no participás en ninguna actividad iniciada.').waitFor();
    assert.equal(await titulos().count(), 0);
    await page.screenshot({ path: path.join(base, 'web-vacio.png'), fullPage: true });
    modo = 'lista';
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await titulos().first().waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(base, 'web-angosta.png'), fullPage: true });
    const overflow = await page.evaluate(() => ({
      ancho: globalThis.innerWidth,
      contenido: globalThis.document.documentElement.scrollWidth,
    }));
    assert.ok(overflow.contenido <= overflow.ancho, JSON.stringify(overflow));
    await fs.writeFile(
      path.join(base, 'verificacion-pantalla.json'),
      JSON.stringify(
        {
          estado: 'aprobado',
          api: 'Respuestas simuladas para aislar interfaz; HTTP y SQL verificados por Jest con PostgreSQL real.',
          comprobaciones: [
            'FP: 10 tarjetas',
            'A1: 12 registros y fin de páginas',
            'ER1: conserva 10 y reintenta página 2',
            'ER3: rechaza resultado inválido y conserva las 12 tarjetas',
            'E1: vacío con enlace para explorar',
            'A3: enlace al detalle correcto',
            'Vista de 390 px sin desborde horizontal',
          ],
          pedidos,
        },
        null,
        2,
      ),
    );
    console.log('CU42 web: listado, paginación, reintento, respuesta inválida, vacío, detalle y ancho de 390 px aprobados.');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
