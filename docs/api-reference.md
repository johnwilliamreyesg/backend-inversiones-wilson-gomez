# Referencia de la API

Base: `http://localhost:3000/api` (desarrollo). Todo el intercambio es JSON (UTF-8).

## Convenciones

**Autenticación:** todas las rutas, excepto `GET /health` y `POST /auth/login`, exigen la cabecera:

```
Authorization: Bearer <token>
```

El token se obtiene en el login y dura `JWT_EXPIRES_IN` (12 h por defecto). Para cerrar sesión, el frontend simplemente descarta el token.

**Respuesta exitosa**

```jsonc
{ "data": { ... } }                       // un recurso
{ "data": [ ... ], "meta": { ... } }      // lista paginada
```

**Respuesta de error** (siempre la misma forma)

```jsonc
{
  "error": {
    "code": "VALIDATION_ERROR", // código estable para el frontend
    "message": "Los datos enviados no son válidos.", // texto para mostrar al usuario
    "details": [
      // opcional
      {
        "location": "body",
        "field": "phoneNumber",
        "message": "El teléfono debe tener entre 6 y 15 dígitos.",
      },
    ],
  },
}
```

| HTTP | `code`              | Cuándo                                                                                      |
| ---- | ------------------- | ------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`  | Datos con formato inválido (`details` trae cada campo)                                      |
| 400  | `INVALID_JSON`      | El cuerpo no es JSON válido                                                                 |
| 401  | `UNAUTHORIZED`      | Sin token, token inválido o caducado, o usuario inactivo → el frontend debe enviar al login |
| 403  | `FORBIDDEN`         | Sesión válida pero sin permiso para esa acción                                              |
| 404  | `NOT_FOUND`         | El recurso o la ruta no existe                                                              |
| 409  | `CONFLICT`          | Choca con datos existentes (cédula repetida, cliente con créditos abiertos…)                |
| 429  | `TOO_MANY_REQUESTS` | Demasiados logins fallidos (10 cada 15 min por IP)                                          |
| 500  | `INTERNAL_ERROR`    | Error inesperado del servidor                                                               |

**Paginación** (query): `page` (por defecto 1), `pageSize` (por defecto 20, máximo 100).
`meta`: `{ page, pageSize, total, totalPages }`.

---

## Health

### `GET /health`

Estado del servidor y de la base de datos. `200` si todo está bien, `503` si la BD no responde.

```json
{
  "data": {
    "status": "ok",
    "database": "up",
    "uptimeSeconds": 42,
    "timestamp": "2026-10-24T15:00:00.000Z"
  }
}
```

---

## Autenticación

### `POST /auth/login` _(pública)_

```json
{ "email": "admin@example.com", "password": "Secret123" }
```

Respuesta `200`:

```json
{
  "data": {
    "token": "eyJhbGciOi...",
    "user": {
      "id": 1,
      "fullName": "Administrador",
      "email": "admin@example.com",
      "isActive": true,
      "lastLoginAt": "2026-10-24T15:00:00.000Z",
      "roleId": 1,
      "roleName": "admin",
      "permissions": ["clients.create", "clients.read", "..."]
    }
  }
}
```

- El correo no distingue mayúsculas y se recortan espacios.
- Correo inexistente y contraseña errada devuelven **el mismo** `401 Correo o contraseña incorrectos.` (no revela qué correos existen).
- Usuario inactivo → `401`.
- 10 intentos fallidos en 15 min desde la misma IP → `429` (los logins exitosos no cuentan).

`permissions` sirve al frontend para mostrar u ocultar botones; la API igual valida cada permiso.

### `GET /auth/me`

Devuelve el mismo objeto `user` del login, con datos y permisos actuales.

### `PATCH /auth/password`

```json
{ "currentPassword": "Secret123", "newPassword": "NewSecret456" }
```

- Nueva contraseña: mínimo 8 caracteres, al menos una letra y un número, distinta de la actual.
- Respuesta `200`: `{ "data": { "token": "..." } }`. **El frontend debe reemplazar su token por este**: todas las demás sesiones abiertas (otros dispositivos) quedan cerradas.

---

## Clientes

Permisos: `clients.read` (listar/ver), `clients.create`, `clients.update`, `clients.delete`. `createdBy` se llena con el usuario de la sesión.

### Objeto `Client`

```json
{
  "id": 1,
  "fullName": "Ana Pérez",
  "nationalId": "AB-100",
  "phoneCountryCode": "+57",
  "phoneNumber": "3001234567",
  "address": null,
  "notes": "Paga los viernes",
  "createdBy": null,
  "createdAt": "2026-10-24T15:00:00.000Z",
  "updatedAt": "2026-10-24T15:05:00.000Z"
}
```

### `GET /clients`

Lista paginada, ordenada por nombre.

| Query              | Descripción                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `search`           | Busca en nombre (sin importar mayúsculas ni tildes: `gomez` encuentra `Gómez`), cédula o teléfono |
| `page`, `pageSize` | Paginación                                                                                        |

### `GET /clients/:id`

`404` si no existe o fue eliminado.

### `POST /clients` → `201`

| Campo              | Obligatorio | Reglas                                                                                                     |
| ------------------ | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `fullName`         | Sí          | 3–150 caracteres; se recortan espacios                                                                     |
| `nationalId`       | Sí          | 3–20 letras, números o guiones; se guarda en mayúsculas; única entre clientes activos (`409` si se repite) |
| `phoneCountryCode` | No          | Formato `+57` (por defecto `+57`)                                                                          |
| `phoneNumber`      | Sí          | 6–15 dígitos; acepta espacios y guiones (`300 123-4567`) y guarda solo dígitos                             |
| `address`          | No          | Máx. 255; vacío se guarda como `null`                                                                      |
| `notes`            | No          | Máx. 2000; vacío se guarda como `null`                                                                     |

### `PATCH /clients/:id`

Actualización parcial: solo se envían los campos a cambiar (mismas reglas que `POST`). Enviar `""` en `address` o `notes` los borra. Cuerpo vacío → `400`.

### `DELETE /clients/:id` → `204`

Borrado lógico (el historial se conserva). `409` si el cliente tiene créditos abiertos (`active` o `defaulted`) como deudor **o** como codeudor. Tras eliminarlo, su cédula queda libre para registrarse de nuevo.

---

## Fotos de clientes

Hasta 3 fotos por cliente, cada una en un "espacio" (`position` 1, 2 o 3). Permisos: `clients.read` para ver, `clients.update` para subir o borrar.

### Objeto `ClientPhoto`

```json
{
  "id": 7,
  "position": 1,
  "contentType": "image/jpeg",
  "sizeBytes": 284311,
  "createdAt": "2026-10-26T15:00:00.000Z",
  "updatedAt": "2026-10-26T15:00:00.000Z",
  "url": "https://.../clients/1/9f1c....jpg?...firma...",
  "thumbnailUrl": "https://.../clients/1/9f1c...-thumb.jpg?...firma..."
}
```

- `url` y `thumbnailUrl` son **enlaces temporales firmados** (1 hora por defecto, `SIGNED_URL_TTL_SECONDS`). Se usan directo en `<img src="...">`, sin cabecera de sesión.
- Cuando un enlace expira, el frontend vuelve a pedir `GET /clients/:id/photos` para obtener enlaces nuevos.
- `thumbnailUrl` (320×320) es para listas; `url` (máx. 1600 px) para ver la foto completa.

### `GET /clients/:clientId/photos`

Lista las fotos del cliente ordenadas por posición (`[]` si no tiene).

### `PUT /clients/:clientId/photos/:position`

Sube la foto a ese espacio; **si ya había una, la reemplaza** (la anterior se borra). Respuesta `200` con el objeto `ClientPhoto`.

- Cuerpo `multipart/form-data` con el archivo en el campo **`photo`**.
- Formatos: JPG, PNG, WEBP. Máximo 15 MB.
- El servidor endereza la foto según la orientación del celular, la reduce a máx. 1600 px (JPEG 80 %), genera la miniatura y **elimina los metadatos** (ubicación GPS, modelo del teléfono).

Errores: `400` posición fuera de 1–3, sin archivo, campo distinto de `photo`, archivo de más de 15 MB o que no es una imagen compatible (por ejemplo, HEIC del iPhone sin convertir); `404` cliente inexistente.

```js
// Ejemplo desde el frontend
const form = new FormData();
form.append('photo', fileInput.files[0]);
await fetch(`/api/clients/${id}/photos/1`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form });
```

### `DELETE /clients/:clientId/photos/:position` → `204`

Borra la foto y sus archivos. `404` si ese espacio estaba vacío.

---

## Categorías de gasto

Catálogo pequeño (sin paginación). Las categorías **no se borran**, porque los gastos antiguos las referencian: se desactivan con `isActive: false` y dejan de ofrecerse para gastos nuevos.

Permisos (fase 1, se reutilizan los de gastos): `expenses.read` para listar, `expenses.create` para crear, `expenses.update` para editar o desactivar.

### Objeto `ExpenseCategory`

```json
{
  "id": 1,
  "name": "Transporte",
  "isActive": true,
  "createdAt": "2026-10-31T15:00:00.000Z",
  "updatedAt": "2026-10-31T15:00:00.000Z"
}
```

### `GET /expense-categories`

Ordenadas por nombre. Por defecto solo las activas (para el selector del formulario de gasto).

| Query             | Descripción                                                     |
| ----------------- | --------------------------------------------------------------- |
| `includeInactive` | `true` para incluir las inactivas (pantalla de administración) |

### `POST /expense-categories` → `201`

```json
{ "name": "Mantenimiento" }
```

`name`: 2–100 caracteres. Único **sin importar mayúsculas**: si existe "Transporte", "TRANSPORTE" devuelve `409`.

### `PATCH /expense-categories/:id`

```json
{ "name": "Transporte urbano", "isActive": false }
```

Uno o ambos campos. `404` si no existe; `409` si el nombre ya es de otra categoría.

---

## Gastos

Permisos: `expenses.read`, `expenses.create`, `expenses.update`, `expenses.delete`. `createdBy` se llena con el usuario de la sesión.

### Objeto `Expense`

```json
{
  "id": 1,
  "categoryId": 1,
  "categoryName": "Transporte",
  "expenseDate": "2026-10-31",
  "amount": 15000,
  "description": "Taxi a cobrar en Bosa",
  "createdBy": 1,
  "createdAt": "2026-10-31T15:00:00.000Z",
  "updatedAt": "2026-10-31T15:00:00.000Z"
}
```

`expenseDate` es una fecha sin hora (`AAAA-MM-DD`). `amount` es un número (pesos, máximo 2 decimales).

### `GET /expenses`

Lista paginada, del más reciente al más antiguo.

| Query              | Descripción                                                      |
| ------------------ | ---------------------------------------------------------------- |
| `from`, `to`       | Rango de fechas `AAAA-MM-DD`, ambos incluidos; `from` ≤ `to`     |
| `categoryId`       | Solo esa categoría                                               |
| `search`           | Texto en la descripción (sin importar mayúsculas ni tildes)      |
| `page`, `pageSize` | Paginación                                                       |

`meta` trae además **`totalAmount`**: la suma de **todos** los gastos que cumplen el filtro (no solo los de la página). Sirve para mostrar "Total del mes: $ 1.250.000" sin otra petición.

```json
{ "page": 1, "pageSize": 20, "total": 3, "totalPages": 1, "totalAmount": 167000.5 }
```

### `GET /expenses/:id`

`404` si no existe o fue eliminado.

### `POST /expenses` → `201`

| Campo         | Obligatorio | Reglas                                                                  |
| ------------- | ----------- | ----------------------------------------------------------------------- |
| `categoryId`  | Sí          | Categoría existente y **activa**                                        |
| `expenseDate` | No          | `AAAA-MM-DD`; por defecto **hoy (hora de Colombia)**; no puede ser futura |
| `amount`      | Sí          | Número (no texto) mayor que 0, máximo 2 decimales                       |
| `description` | Sí          | 3–255 caracteres                                                        |

Una categoría inexistente o inactiva devuelve `400` con `details` en el campo `categoryId`, para que el formulario lo marque.

### `PATCH /expenses/:id`

Actualización parcial con las mismas reglas. Un gasto puede seguir en una categoría que se desactivó después, pero no se puede **mover** a una categoría inactiva. Cuerpo vacío → `400`.

### `DELETE /expenses/:id` → `204`

Borrado lógico: desaparece de las listas y de los totales, pero queda en la base de datos.
