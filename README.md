# Comparador automático de precios (Coto, Carrefour, Jumbo, Disco)

Buscás un producto y el servidor consulta en el momento el buscador de cada
supermercado, filtra los resultados para que contengan **todas** las palabras
que escribiste, como palabras completas (así "crema de leche" no trae "leche
descremada" y "coca cola zero 1.5" no trae la de 500ml) y los muestra ordenados
por precio, separando los que tienen stock de los que no.

Desde cada producto con stock se elige la cantidad y se agrega a la **Lista de
compras** (otra pestaña de la misma página). La lista se agrupa por súper, suma
el total, se guarda en el dispositivo, se puede copiar para WhatsApp y tiene un
botón "Actualizar precios" que vuelve a consultar cada producto.

## Qué hay en la carpeta

- `index.html`: la página que usa tu papá (buscador + resultados).
- `api/buscar.js`: el "servidor" que le pregunta a cada súper. Es necesario
  porque el navegador no puede consultar esos sitios directamente (CORS).
- `package.json`: configuración mínima.

## Cómo ponerlo online gratis (Vercel)

1. Instalá Node.js (nodejs.org, versión LTS).
2. Abrí una terminal dentro de esta carpeta y ejecutá:

   ```
   npx vercel
   ```

3. La primera vez te pide crear cuenta / iniciar sesión (gratis). Respondé
   con Enter a las preguntas por defecto.
4. Al terminar te da una dirección tipo `https://comparador-xxxx.vercel.app`.
   Esa es la página: guardala como favorito en el celu o la compu de tu papá.
5. Para publicar cambios: `npx vercel --prod`.

Para probarlo en tu compu antes: `npx vercel dev` y abrí `http://localhost:3000`.

## Limitaciones (importante)

- **No pude probar las consultas en vivo** mientras lo armaba, porque mi
  entorno no tiene acceso a internet. La técnica (API pública de búsqueda de
  VTEX) está confirmada como funcional en otras tiendas argentinas, y Coto y
  Carrefour muestran señales claras de usarla. Jumbo y Disco son de la misma
  empresa que otras tiendas donde sí está confirmada, pero es lo más probable
  de fallar: si una columna dice "No se pudo consultar esta tienda", ese es el
  punto a ajustar (dominio o ruta).
- Las tiendas pueden cambiar o bloquear su API sin aviso. Si algo deja de
  andar, hay que revisar la respuesta real y ajustar `api/buscar.js`.
- **Coto puede no funcionar con este método.** Después de armarlo encontré que
  Coto Digital no parece usar VTEX sino otro sistema de catálogo, y además sus
  precios y stock varían por sucursal. Si la columna de Coto falla, hay que
  armar una consulta específica para Coto (ver el chat).
- **Promociones**: se leen los campos de promo que publica VTEX (etiquetas tipo
  "2do al 70%" y el descuento contra el precio de lista). No pude verificar en
  vivo cómo las informa cada súper, así que pueden faltar o venir incompletas.
- **Vital no está incluido**: es un mayorista y solo publica folletos de
  ofertas, no un catálogo consultable por producto.
- El sistema muestra productos por tienda, no los empareja entre cadenas
  (cada súper nombra distinto el mismo producto). Por eso se ve lista por
  súper y se marca el precio más bajo encontrado.
- El uso es personal y de bajo volumen. Si lo compartís con mucha gente o
  hacés miles de consultas, los súper podrían bloquearlo.
