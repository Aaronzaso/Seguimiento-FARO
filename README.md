# 📊 Seguimiento FARO — Cronograma de Avance

Tablero para dar seguimiento al avance del Proyecto FARO (Wave 1): tareas por fase, horas por persona, vista ejecutiva e histórico de cortes.

**👉 App actual: https://aaronzaso.github.io/Seguimiento-FARO/**

No hay que instalar nada: se abre en el navegador. Cada quien trabaja en su navegador (los cambios se guardan localmente) y el avance del equipo se comparte con Excel a través de la carpeta [`datos/`](datos/).

## 🔄 Flujo del equipo

1. **Ver el avance**: abrí la URL de arriba. La primera vez, la app carga automáticamente el último Excel publicado por el equipo. Si ya la habías usado, presioná **🔄 Cargar** en la barra morada para traer los datos publicados.
2. **Registrar tu avance**: actualizá el % de tus tareas, tus horas y notas.
3. **Compartirlo**: presioná **📥 Exportar Excel** y subí el archivo descargado a la carpeta [`datos/`](datos/) del repo (en GitHub: `datos/` → **Add file → Upload files** → arrastrar → **Commit changes**). No le cambiés el nombre. La exportación conserva los cortes anteriores y agrega o actualiza el corte del día.
4. En ~1 minuto la página se actualiza sola con el nuevo Excel y todos pueden cargarlo.

La pestaña **🕘 Histórico** muestra el avance general y por fase de cada corte guardado en la hoja `Histórico avance` del Excel.

También podés importar cualquier Excel exportado con **📤 Importar Excel** (por si lo compartieron por Teams/correo).

> 💡 Para no pisarse entre varios: antes de registrar tu avance, cargá primero los datos publicados (paso 1) y después agregá lo tuyo.

## 💻 Correr localmente (opcional, para desarrollo)

Requiere [Node.js](https://nodejs.org) 18+.

```bash
cd app
npm install
npm run dev
```

## ☁️ Publicación automática con Vercel

La carpeta `app/` también está preparada para desplegarse como un proyecto Vite en Vercel. En esa versión, el botón **☁️ Guardar corte** llama a `POST /api/cuts`, reconstruye el Excel del día y lo publica en `datos/` mediante un commit de GitHub. El token de GitHub nunca se entrega al navegador.

Configuración requerida en **Vercel → Project Settings → Environment Variables**:

- `GITHUB_TOKEN`: token fine-grained con acceso únicamente a `Aaronzaso/Seguimiento-FARO` y permiso **Contents: Read and write**.
- `FARO_SAVE_TOKEN`: clave privada larga que se solicita al presionar **Guardar corte**.
- `GITHUB_REPOSITORY`: `Aaronzaso/Seguimiento-FARO` (opcional; ya es el valor predeterminado).
- `GITHUB_BRANCH`: `main` (opcional; ya es el valor predeterminado).

El proyecto debe usar `app/` como raíz. Los valores reales se guardan en Vercel; [`app/.env.example`](app/.env.example) solo documenta los nombres y no contiene secretos.

## 🛠️ Estructura

- [`app/`](app/) — la aplicación React + Vite y la Function `/api/cuts`. GitHub Pages conserva la versión de solo lectura y Vercel habilita la publicación automática.
- [`datos/`](datos/) — registro oficial del avance: los Excel exportados. El más reciente (por la fecha del nombre) es el que se publica en la página.
