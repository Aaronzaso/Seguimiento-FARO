# 📊 Seguimiento FARO — Cronograma de Avance

Tablero para dar seguimiento al avance del Proyecto FARO (Wave 1): tareas por fase, horas por persona y vista ejecutiva.

**👉 App publicada: https://aaronzaso.github.io/Seguimiento-FARO/**

No hay que instalar nada: se abre en el navegador. Cada quien trabaja en su navegador (los cambios se guardan localmente) y el avance del equipo se comparte con Excel a través de la carpeta [`datos/`](datos/).

## 🔄 Flujo del equipo

1. **Ver el avance**: abrí la URL de arriba. La primera vez, la app carga automáticamente el último Excel publicado por el equipo. Si ya la habías usado, presioná **🔄 Cargar** en la barra morada para traer los datos publicados.
2. **Registrar tu avance**: actualizá el % de tus tareas, tus horas y notas.
3. **Compartirlo**: presioná **📥 Exportar Excel** y subí el archivo descargado a la carpeta [`datos/`](datos/) del repo (en GitHub: `datos/` → **Add file → Upload files** → arrastrar → **Commit changes**). No le cambiés el nombre.
4. En ~1 minuto la página se actualiza sola con el nuevo Excel y todos pueden cargarlo.

También podés importar cualquier Excel exportado con **📤 Importar Excel** (por si lo compartieron por Teams/correo).

> 💡 Para no pisarse entre varios: antes de registrar tu avance, cargá primero los datos publicados (paso 1) y después agregá lo tuyo.

## 💻 Correr localmente (opcional, para desarrollo)

Requiere [Node.js](https://nodejs.org) 18+.

```bash
cd app
npm install
npm run dev
```

## 🛠️ Estructura

- [`app/`](app/) — la aplicación (React + Vite). Se despliega sola a GitHub Pages con cada push a `main` ([workflow](.github/workflows/deploy.yml)).
- [`datos/`](datos/) — registro oficial del avance: los Excel exportados. El más reciente (por la fecha del nombre) es el que se publica en la página.
