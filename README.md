# 📊 Seguimiento FARO — Cronograma de Avance

Tablero para dar seguimiento al avance del Proyecto FARO (Wave 1): tareas por fase, horas por persona, vista ejecutiva e histórico de cortes.

**👉 Versión de consulta: https://aaronzaso.github.io/Seguimiento-FARO/**

La versión desplegada en Vercel habilita el trabajo colaborativo y la publicación automática. Cada integrante inicia sesión con su propia clave; los borradores siguen guardándose localmente y los cortes oficiales permanecen en [`datos/`](datos/).

## 🔄 Flujo del equipo

1. **Entrar**: abrí la URL de producción de Vercel y pulsá **Iniciar sesión**. Usá únicamente tu clave personal.
2. **Cargar**: antes de editar, verificá que el tablero indique que tu borrador coincide con la versión publicada.
3. **Registrar**: actualizá el porcentaje, responsables, horas y notas de las tareas.
4. **Publicar**: pulsá **Guardar corte**. La Function actualiza el Excel en GitHub y registra tu identidad, fecha y operación.
5. Si otra persona publicó mientras editabas, FARO bloquea el guardado, conserva tu borrador y muestra opciones para **Exportar respaldo** o **Cargar versión nueva**.

La pestaña **🕘 Histórico** muestra el avance general y por fase de cada corte guardado en la hoja `Histórico avance` del Excel.

También podés importar cualquier Excel exportado con **📤 Importar Excel** (por si lo compartieron por Teams/correo).

Cada Excel conserva una fila por día en `Histórico avance` y todos los guardados individuales en la hoja append-only `Auditoría`. GitHub mantiene además el historial completo de commits.

## 💻 Correr localmente (opcional, para desarrollo)

Requiere [Node.js](https://nodejs.org) 18+.

```bash
cd app
npm install
npm run dev
```

## ☁️ Publicación automática con Vercel

La carpeta `app/` está preparada para desplegarse como un proyecto Vite en Vercel. El botón **☁️ Guardar corte** llama a `POST /api/cuts`, reconstruye el Excel del día y lo publica en `datos/` mediante un commit de GitHub. El token de GitHub y las claves personales nunca forman parte del bundle del navegador.

Configuración requerida en **Vercel → Project Settings → Environment Variables**:

- `GITHUB_TOKEN`: token fine-grained con acceso únicamente a `Aaronzaso/Seguimiento-FARO` y permiso **Contents: Read and write**.
- `FARO_USERS_JSON`: JSON sensible con una identidad y una clave aleatoria por integrante.
- `FARO_SESSION_SECRET`: secreto aleatorio usado para firmar sesiones de ocho horas.
- `GITHUB_REPOSITORY`: `Aaronzaso/Seguimiento-FARO` (opcional; ya es el valor predeterminado).
- `GITHUB_BRANCH`: `main` (opcional; ya es el valor predeterminado).

Para generar todas las claves sin escribirlas en el repositorio:

```bash
cd app
npm run generate-users
```

Pegá el JSON completo como `FARO_USERS_JSON` y el secreto generado como `FARO_SESSION_SECRET`; marcá ambos como **Sensitive** y habilitalos para **Production**. Compartí cada clave solo con su titular por un canal privado. La clave compartida anterior solo funciona si se habilita explícitamente `FARO_ALLOW_SHARED_TOKEN=true`; una vez creadas las cuentas, eliminá `FARO_SAVE_TOKEN` y ese flag.

La sesión usa una cookie firmada `HttpOnly`, `Secure` y `SameSite=Strict` con duración validada por el servidor de ocho horas. La cookie no contiene la clave personal. El servidor deriva la identidad desde la sesión, valida el origen de cada escritura y nunca acepta un autor enviado por el navegador.

El proyecto debe usar `app/` como **Root Directory**, `main` como rama de producción y **Standard Protection** (o `None`) si todo el equipo debe entrar sin pertenecer al equipo de Vercel. Después de modificar variables, hay que crear o promover un deployment nuevo para que Production las reciba.

Los valores reales se guardan en Vercel; [`app/.env.example`](app/.env.example) solo documenta los nombres y no contiene secretos.

> La autenticación individual protege y atribuye la escritura. La versión de GitHub Pages y los Excel de un repositorio público siguen siendo visibles; si el contenido también debe ser confidencial, se necesita un repositorio privado y autenticación de lectura/SSO.

## 🛠️ Estructura

- [`app/`](app/) — la aplicación React + Vite y la Function `/api/cuts`. GitHub Pages conserva la versión de solo lectura y Vercel habilita la publicación automática.
- [`datos/`](datos/) — registro oficial del avance: los Excel exportados. El más reciente (por la fecha del nombre) es el que se publica en la página.
