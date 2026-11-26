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

// ---------------------------------------------------------------------------
// FILTRO DE RESULTADOS
//
// Los buscadores de los súper devuelven cosas "parecidas". Acá dejamos solo
// los productos cuyo nombre contiene TODAS las palabras buscadas, pero como
// PALABRAS COMPLETAS (no pedazos de palabra). Así "crema de leche" ya no trae
// "leche descremada" (donde "crema" aparecía adentro de "descremada").
//
// - Se ignoran palabras de relleno ("de", "la", "el"...). Ojo: "sin" y "con"
//   NO se ignoran, porque cambian el producto ("leche sin lactosa").
// - Singular/plural cuentan igual ("huevo" = "huevos").
// - Los tamaños se comparan como números: "1.5" o "1,5" encuentra
//   "1.5 Lts", "1,5L" o "1.5l", pero no "500ml". "900" encuentra "900ml".
// ---------------------------------------------------------------------------

const PALABRAS_DE_RELLENO = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'para', 'un', 'una', 'al', 'por',
]);

const UNIDADES = {
  l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
  kg: 'kg', kilo: 'kg', kilos: 'kg',
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g',
  ml: 'ml', cc: 'ml',
  un: 'u', u: 'u', unid: 'u', unidad: 'u', unidades: 'u',
};

// Saca acentos y pasa a minúsculas, para que "colón" matchee con "colon".
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function tokenizar(texto) {
  return normalizar(texto)
    .replace(/(\d),(\d)/g, '$1.$2') // 1,5 -> 1.5
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean);
}

// "1.5" -> { num: "1.5", unidad: "" } ; "900ml" -> { num: "900", unidad: "ml" }
function parseNumero(token) {
  const m = token.match(/^(\d+(?:\.\d+)?)([a-z]*)$/);
  if (!m) return null;
  const num = String(parseFloat(m[1]));
  if (m[2] === '') return { num, unidad: '' };
  if (UNIDADES[m[2]]) return { num, unidad: UNIDADES[m[2]] };
  return null;
}

function variantes(palabra) {
  const v = new Set([palabra, palabra + 's', palabra + 'es']);
  if (palabra.length > 3 && palabra.endsWith('es')) v.add(palabra.slice(0, -2));
  if (palabra.length > 3 && palabra.endsWith('s')) v.add(palabra.slice(0, -1));
  return v;
}

function coincideTodasLasPalabras(nombreProducto, termino) {
  let consulta = tokenizar(termino).filter((t) => !PALABRAS_DE_RELLENO.has(t));
  if (consulta.length === 0) consulta = tokenizar(termino);
  if (consulta.length === 0) return false;

  const tokensNombre = tokenizar(nombreProducto);
  const palabrasNombre = new Set(tokensNombre);

  // Medidas del nombre: "1.5", "1.5lts", "1 lt" (número suelto + unidad al lado)
  const medidas = [];
  tokensNombre.forEach((t, i) => {
    const n = parseNumero(t);
    if (!n) return;
    medidas.push(n);
    const siguiente = tokensNombre[i + 1];
    if (n.unidad === '' && siguiente && UNIDADES[siguiente]) {
      medidas.push({ num: n.num, unidad: UNIDADES[siguiente] });
    }
  });

  return consulta.every((palabra) => {
    const n = parseNumero(palabra);
    if (n) {
      return medidas.some(
        (m) => m.num === n.num && (n.unidad === '' || m.unidad === '' || m.unidad === n.unidad)
      );
    }
    for (const v of variantes(palabra)) {
      if (palabrasNombre.has(v)) return true;
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// PROMOCIONES
//
// Las tiendas VTEX publican las promociones de cada producto en la misma
// respuesta: "Teasers" (ej. "2do al 70%", "20% off con banco") y
// "DiscountHighLight". Además, si el precio de lista es mayor al precio
// actual, se calcula el porcentaje de descuento.
// OJO: estos campos los armé según la documentación pública de VTEX, sin poder
// probarlos en vivo. Si una tienda usa otro formato, la promo simplemente no
// aparece (no rompe nada).
// ---------------------------------------------------------------------------

function limpiarTexto(t) {
  return String(t ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extraerPromos(oferta) {
  const textos = [];
  (oferta?.DiscountHighLight || []).forEach((d) => textos.push(typeof d === 'string' ? d : d?.Name ?? d?.name));
  (oferta?.Teasers || oferta?.teasers || []).forEach((t) => textos.push(t?.Name ?? t?.name));

  const vistos = new Set();
  const promos = [];
  textos.map(limpiarTexto).filter(Boolean).forEach((texto) => {
    const clave = normalizar(texto);
    if (!vistos.has(clave)) {
      vistos.add(clave);
      promos.push(texto.slice(0, 90));
    }
  });
  return promos.slice(0, 3);
}

function calcularDescuentoPct(precio, precioLista) {
  if (typeof precio !== 'number' || typeof precioLista !== 'number') return null;
  if (precio <= 0 || precioLista <= precio) return null;
  const pct = Math.round((1 - precio / precioLista) * 100);
  return pct >= 1 ? pct : null;
}

async function buscarEnTienda(clave, termino) {
  const tienda = TIENDAS[clave];
  const url = `https://${tienda.dominio}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termino)}&_from=0&_to=49`;

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
          promos: extraerPromos(oferta),
          descuentoPct: calcularDescuentoPct(oferta?.Price, oferta?.ListPrice),
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
