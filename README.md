# capsuleerOS

Companion de escritorio para [EVE Online](https://www.eveonline.com/). Consulta habilidades, inventario, órdenes de mercado y monedero de uno o varios personajes a través de la [ESI](https://developers.eveonline.com/api-explorer) y del inicio de sesión de EVE (SSO).

La interfaz está en español. Los datos del personaje se leen en vivo; el Client ID y los tokens de refresco se guardan solo en el equipo.

## Qué incluye

| Módulo | Contenido |
| --- | --- |
| Resumen | Identidad, corporación, alianza, sistema, estación, nave, clon, puntos de habilidad, saldo y entrenamiento en curso |
| Habilidades | Cola de entrenamiento, habilidades entrenadas, habilidades no obtenidas y cálculo de puntos |
| Inventario | Activos agrupados por ubicación, con contenido anidado, volumen y valor |
| Mercado | Órdenes de compra y venta del personaje |
| Monedero | Saldo y diario de movimientos |
| Market | Búsqueda de objetos, libro de órdenes y historial de precios |
| UniWiki | Acceso rápido a anomalías y exploración de EVE University, con la wiki incrustada |

En Market se puede mirar la región actual del personaje, el conjunto de hubs (The Forge, Domain, Sinq Laison, Heimatar, Metropolis y Essence) o todas las regiones del k-space. El catálogo de objetos vive en `src/shared/market-types.json`.

Se pueden conectar varios personajes, reordenarlos y quitarlos. La ventana no tiene marco del sistema y recuerda tamaño y posición.

## Requisitos

- [Node.js](https://nodejs.org/) 22.12 o superior y npm
- Una cuenta de EVE Online
- Una aplicación ya creada en [EVE Developers](https://developers.eveonline.com/)

## Configurar la aplicación de EVE

1. Entra en [developers.eveonline.com](https://developers.eveonline.com/) y abre la aplicación existente.
2. Añade esta callback, tal cual:

   ```
   http://127.0.0.1:47821/callback
   ```

3. Activa estos scopes:

   - `esi-skills.read_skills.v1`
   - `esi-skills.read_skillqueue.v1`
   - `esi-wallet.read_character_wallet.v1`
   - `esi-assets.read_assets.v1`
   - `esi-location.read_location.v1`
   - `esi-location.read_ship_type.v1`
   - `esi-clones.read_clones.v1`
   - `esi-universe.read_structures.v1`
   - `esi-markets.read_character_orders.v1`
   - `esi-markets.structure_markets.v1`

4. Copia el Client ID. El Client Secret solo hace falta si la aplicación lo muestra.

El inicio de sesión usa PKCE. capsuleerOS abre el navegador y escucha la respuesta en `127.0.0.1:47821`. Si ese puerto está ocupado, ciérralo y vuelve a conectar el personaje.

## Instalación

```bash
git clone https://github.com/tutanra/capsuleerOS.git
cd capsuleerOS
npm install
```

## Ejecución

```bash
npm run dev
```

En la aplicación, pulsa **Añadir personaje**, pega el Client ID y conecta la cuenta de EVE. El navegador suelto no puede completar el acceso: hay que usar la ventana de Electron.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Arranca Electron con recarga de desarrollo |
| `npm run build` | Compila main, preload y renderer en `out/` |
| `npm run preview` | Abre la compilación de `out/` |
| `npm run typecheck` | Comprueba los tipos con TypeScript |
| `npm run dist:win` | Genera el instalador de Windows (NSIS) en `release/`, sin subirlo |
| `npm run dist:linux` | Genera un AppImage en `release/`, sin subirlo |
| `npm run dist:mac` | Genera un zip de macOS en `release/`, sin subirlo |

## Publicar una versión

Nada se publica solo. Un push a `main` no crea instaladores. La versión sale cuando tú creas una etiqueta `vX.Y.Z` y la subes. El número de `package.json` no decide la release: lo decide la etiqueta.

La última publicada es `v0.1.1`. La siguiente tiene que ser mayor, por ejemplo `v0.1.2` si es un arreglo o `v0.2.0` si es un cambio más amplio.

1. Deja el código que quieres publicar ya commiteado y subido a `main`.

   ```bash
   git push origin main
   ```

2. Crea la etiqueta sobre ese commit y súbela. Sustituye el número por el que hayas elegido.

   ```bash
   git tag v0.1.2
   git push origin v0.1.2
   ```

Eso es todo lo que hay que hacer a mano. GitHub Actions, en [`.github/workflows/release.yml`](.github/workflows/release.yml), compila en Windows y en Linux, genera el instalador NSIS y el AppImage, y los deja en https://github.com/tutanra/capsuleerOS/releases/tag/v0.1.2 (con el número de tu etiqueta). El progreso se ve en https://github.com/tutanra/capsuleerOS/actions. Cuando el flujo termina en verde, la release está visible y marcada como última.

No reutilices una etiqueta ya publicada. Si el flujo falla, corrige el código, súbelo a `main` y usa un número nuevo.

`npm run dist:win` y `npm run dist:linux` solo dejan los archivos en la carpeta local `release/`. No los envían a GitHub.

La aplicación instalada mira esa release al arrancar y cada cuatro horas. Si hay una versión más nueva, la descarga y pide reiniciar. En Windows tiene que haberse instalado con el setup, no con un ejecutable suelto. En Linux hay que abrir el propio AppImage: un binario extraído no puede sustituirse solo. `npm run dev` no busca actualizaciones. El instalador de Windows no está firmado, así que SmartScreen puede avisar la primera vez.

Para regenerar el catálogo de objetos del mercado desde la ESI:

```bash
node scripts/build-market-types.mjs
```

El script recorre categorías, grupos y nombres publicados y reescribe `src/shared/market-types.json`.

## Datos locales

Client ID, secreto (si se indicó) y tokens de refresco se guardan en `capsuleeros.json`, dentro de la carpeta de datos de usuario de Electron. En Windows esa ruta es:

```
%APPDATA%\capsuleeros\capsuleeros.json
```

Ese archivo no forma parte del repositorio. No lo copies al proyecto ni lo subas a ningún sitio.

## Estructura

```
src/main       Proceso principal: ventana, SSO, ESI y almacén local
src/preload    Puente IPC expuesto como window.os
src/renderer   Interfaz React
src/shared     Scopes, callback y catálogo de tipos
scripts        Regeneración del catálogo de mercado
```

## Stack

Electron, electron-vite, React 19 y TypeScript. El identificador de la aplicación empaquetada es `app.capsuleeros.desktop`.
