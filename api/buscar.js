// api/buscar.js
//
// Busca un producto en varios supermercados argentinos al mismo tiempo.
// Coto, Carrefour, Jumbo y Disco corren su tienda online sobre la misma
// plataforma de e-commerce (VTEX), que expone un buscador público de
// productos en formato JSON. Por eso no hace falta "leer" cada página web:
// se le pregunta directamente a esa API, igual que hace el propio buscador
// de cada supermercado.
//
// Esto corre en un servidor (no en el navegador del usuario), que es lo
// que permite esquivar el bloqueo de CORS del que hablamos en el chat.

const TIENDAS = {
  coto: { nombre: 'Coto', dominio: 'www.cotodigital.com.ar' },
  carrefour: { nombre: 'Carrefour', dominio: 'www.carrefour.com.ar' },
  jumbo: { nombre: 'Jumbo', dominio: 'www.jumbo.com.ar' },
  disco: { nombre: 'Disco', dominio: 'www.disco.com.ar' },
};

// Saca acentos y pasa a minúsculas, para que "colón" matchee con "colon".
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// El problema que mencionaste ("coca cola zero" mostrando toda la línea
// Coca-Cola) pasa porque estos buscadores matchean por relevancia, no por
// coincidencia exacta. Acá exigimos que el nombre del producto contenga
// TODAS las palabras buscadas, no solo alguna.
function coincideTodasLasPalabras(nombreProducto, termino) {
  const palabras = normalizar(termino).split(/\s+/).filter(Boolean);
  const nombreNorm = normalizar(nombreProducto);
  return palabras.every((palabra) => nombreNorm.includes(palabra));
}

async function buscarEnTienda(clave, termino) {
  const tienda = TIENDAS[clave];
  const url = `https://${tienda.dominio}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termino)}&_from=0&_to=29`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Un User-Agent de navegador reduce la chance de que algún
        // filtro anti-bot rechace la consulta.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/json',
      },
    });

    // VTEX suele responder 206 (Partial Content) en vez de 200 cuando
    // hay paginación de por medio. resp.ok ya lo contempla (200-299).
    if (!resp.ok) {
      return { tienda: tienda.nombre, ok: false, error: `HTTP ${resp.status}`, productos: [] };
    }

    const data = await resp.json();

    const productos = (Array.isArray(data) ? data : [])
      .filter((p) => p && p.productName && coincideTodasLasPalabras(p.productName, termino))
      .map((p) => {
        const item = p.items?.[0];
        const oferta = item?.sellers?.[0]?.commertialOffer;
        const link = p.link || p.linkText || null;
        return {
          nombre: p.productName,
          marca: p.brand || null,
          precio: oferta?.Price ?? null,
          precioLista: oferta?.ListPrice ?? null,
          disponible: (oferta?.AvailableQuantity ?? 0) > 0,
          imagen: item?.images?.[0]?.imageUrl || null,
          url: link
            ? link.startsWith('http')
              ? link
              : `https://${tienda.dominio}${link.startsWith('/') ? '' : '/'}${link}`
            : null,
        };
      })
      .filter((p) => typeof p.precio === 'number' && p.precio > 0)
      .sort((a, b) => a.precio - b.precio);

    return { tienda: tienda.nombre, ok: true, productos };
  } catch (err) {
    return {
      tienda: tienda.nombre,
      ok: false,
      error: err.name === 'AbortError' ? 'Tiempo de espera agotado' : String(err.message || err),
      productos: [],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  const termino = (req.query.q || '').toString().trim();

  if (!termino) {
    res.status(400).json({ error: 'Falta el parámetro de búsqueda (q)' });
    return;
  }

  const claves = Object.keys(TIENDAS);
  const resultados = await Promise.all(claves.map((clave) => buscarEnTienda(clave, termino)));

  const respuesta = {};
  resultados.forEach((r, i) => {
    respuesta[claves[i]] = r;
  });

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate');
  res.status(200).json({ termino, tiendas: respuesta });
}
