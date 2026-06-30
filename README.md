# Catálogo de equipamiento interactivo Copec

Catálogo web estático con señalización de puertos y componentes sobre modelos 3D (GLB) y fotografías 2D.

## Inicio rápido

1. Ejecuta **`INICIAR.bat`** (recomendado).
2. Abre **`http://localhost:5500`** en el navegador.
3. Usa **Ctrl + F5** si no ves cambios recientes.

> Los modelos GLB requieren servidor HTTP. Abrir `index.html` directo (`file://`) puede fallar.

## Estructura

| Archivo / carpeta | Descripción |
|---|---|
| `js/products.js` | Datos de productos, marcadores, documentación |
| `js/app.js` | Catálogo, modal, búsqueda, vistas 3D |
| `js/marker-store.js` | Persistencia local y utilidades de cámara 3D |
| `js/editor.js` | Editor de puntos |
| `js/training.js` | Modo capacitación (quiz) |
| `assets/models/` | Modelos GLB |
| `assets/images/` | Fotos y placeholders |
| `assets/vendor/` | `model-viewer` local (fallback offline) |

## Funciones principales

### Catálogo
- Filtros por **categoría** y **fabricante**
- Búsqueda por nombre, highlights **y etiquetas de marcadores** (COM, LAN, WAN, etc.)
- Tarjetas ligeras (sin cargar GLB hasta abrir el detalle)
- Enlace directo: `?product=cisco-meraki-mx`
- Botón **Compartir** en el detalle del producto

### Señalización 3D
- Vistas rápidas: Frontal, Trasera, Izquierda, Derecha, Superior
- Filtrado de puntos por cara visible
- Toggle **Todas las caras**

### Editor de puntos
- Acceso desde header o desde el detalle de un producto
- Selector de producto al abrir desde el header
- Colocación por vista, click-to-place, arrastre
- **Deshacer** (Ctrl+Z), **Duplicar**, **Importar/Exportar JSON**
- Guardado en `localStorage` del navegador
- Exportar JSON → pegar en `products.js` para persistir en el proyecto

### Modo capacitación
- Botón **Capacitación** en el detalle (mínimo 2 puntos)
- Pregunta aleatoria: encuentra el componente indicado en el modelo

## Agregar un producto

1. Copia el GLB a `assets/models/`.
2. Añade la entrada en `js/products.js` (copia una existente como plantilla).
3. Coloca fotos en `assets/images/{product-id}/` si aplica.
4. Usa el editor para afinar marcadores y exporta el JSON al campo `markers`.

## Modelos pesados

Algunos GLB superan 30–40 MB. Para mejor rendimiento:
- Comprimir con [gltf-transform](https://gltf-transform.dev/) o Blender
- Usar miniaturas en `previewImage` o fotos en `documentation`

## Offline

`model-viewer` se carga primero desde `assets/vendor/`. Si falla, intenta el CDN de Google.
