# Publicar el catálogo + Web App de Apps Script

El catálogo tiene **233 MB** (modelos GLB y ~900 fotos 360°). Apps Script **no**
puede alojar esos archivos, así que el flujo es:

1. **Subir el sitio estático a GitHub Pages** (sirve GLB y fotos sin problema).
2. **Desplegar este Web App de Apps Script** que muestra el sitio a pantalla
   completa en tu URL de Google (`script.google.com/macros/s/.../exec`).

---

## Parte 1 — Subir a GitHub (sitio estático)

Ya dejé el repositorio git inicializado y con el primer commit. Solo falta
conectarlo a GitHub y subirlo.

1. Crea un repositorio vacío en https://github.com/new
   - Nombre sugerido: `catalogo-fusion`
   - **Sin** README, .gitignore ni licencia (ya existen).

2. En la terminal, dentro de la carpeta del proyecto, ejecuta (reemplaza
   `TU-USUARIO`):

   ```bash
   git remote add origin https://github.com/TU-USUARIO/catalogo-fusion.git
   git branch -M main
   git push -u origin main
   ```

3. Activa **GitHub Pages**:
   - Repo → **Settings** → **Pages**
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / carpeta `/ (root)` → **Save**
   - Espera 1–2 min. Tu sitio quedará en:
     `https://TU-USUARIO.github.io/catalogo-fusion/`

4. Abre esa URL para confirmar que el catálogo carga (modelos 3D y vistas 360°).

---

## Parte 2 — Desplegar el Web App de Apps Script

1. Entra a https://script.google.com → **Nuevo proyecto**.

2. Crea estos archivos (copiar/pegar desde la carpeta `apps-script/`):
   - `Code.gs`  → pega el contenido de `apps-script/Code.gs`
   - Archivo HTML llamado **`Index`** → pega `apps-script/Index.html`
   - (Opcional) Manifiesto: menú **Configuración del proyecto** →
     marca *"Mostrar archivo de manifiesto appsscript.json"* y pega
     `apps-script/appsscript.json`.

3. En `Code.gs`, edita la línea:

   ```javascript
   var SITE_URL = 'https://TU-USUARIO.github.io/catalogo-fusion/';
   ```

   y pon tu URL real de GitHub Pages.

4. **Implementar** (botón azul arriba a la derecha) → **Nueva implementación**
   - Tipo: **Aplicación web**
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: el que necesites (cualquiera / tu dominio)
   - **Implementar** y autoriza los permisos.

5. Copia la **URL del Web App** (`.../exec`). Esa es la dirección de tu catálogo
   dentro de Apps Script. Soporta enlaces directos a un producto:
   `.../exec?product=cargador-voltex`

---

## Actualizaciones futuras

Cada vez que cambies productos, modelos o fotos:

```bash
git add -A
git commit -m "Actualiza catálogo"
git push
```

GitHub Pages se actualiza solo en ~1 min. **No necesitas redeployar Apps Script**
(solo muestra el sitio). Si cambias la URL del sitio, edita `SITE_URL` y vuelve a
implementar.
