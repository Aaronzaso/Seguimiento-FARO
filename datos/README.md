# 📂 datos/ — Registro oficial del avance

Aquí se guardan los Excel exportados desde la app. El archivo **más reciente** (por la fecha en el nombre) se publica automáticamente en la página y todos lo pueden cargar con un clic. Cada archivo conserva en la hoja `Histórico avance` los cortes anteriores y el corte del día.

## Cómo actualizar el avance del equipo

En la versión Vercel, registrá el avance y presioná **☁️ Guardar corte**. La Function crea o actualiza este archivo y genera el commit automáticamente.

El flujo manual continúa disponible como respaldo:

1. Abrí la app publicada y registrá tu avance y horas.
2. Presioná **📥 Exportar Excel** — se descarga `FARO_Cronograma_AAAA-MM-DD.xlsx`.
3. Subí ese archivo a esta carpeta: en GitHub, entrá a `datos/` → **Add file → Upload files** → arrastrá el archivo → **Commit changes**.
4. En ~1 minuto la página se actualiza sola con tus datos.

> ⚠️ No cambies el nombre del archivo: la fecha en el nombre (`FARO_Cronograma_2026-07-09.xlsx`) es lo que determina cuál es el más reciente.
