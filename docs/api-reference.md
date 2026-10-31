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

---

## Usuarios

Todas las rutas exigen el permiso **`users.manage`**. Los usuarios **no se borran** (los clientes y gastos guardan quién los creó): se desactivan con `isActive: false`.

### Objeto `User`

```json
{
  "id": 2,
  "fullName": "Pedro Cobrador",
  "email": "pedro@test.com",
  "isActive": true,
  "lastLoginAt": null,
  "roleId": 2,
  "roleName": "Cobrador",
  "createdAt": "2026-10-31T15:00:00.000Z",
  "updatedAt": "2026-10-31T15:00:00.000Z"
}
```

Nunca incluye la contraseña ni su hash.

### `GET /users`

Lista paginada, ordenada por nombre.

| Query              | Descripción                           |
| ------------------ | ------------------------------------- |
| `search`           | Nombre (sin importar tildes) o correo |
| `roleId`           | Solo ese rol                          |
| `isActive`         | `true` o `false`                      |
| `page`, `pageSize` | Paginación                            |

### `GET /users/:id`

`404` si no existe.

### `POST /users` → `201`

| Campo      | Reglas                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| `fullName` | 3–150 caracteres                                                        |
| `email`    | Correo válido; se guarda en minúsculas; único (`409` si ya existe)      |
| `password` | Contraseña inicial: mínimo 8 caracteres, al menos una letra y un número |
| `roleId`   | Rol existente (`400` en `roleId` si no existe)                          |

El administrador le comunica la contraseña inicial al usuario, y este la cambia con `PATCH /auth/password`.

### `PATCH /users/:id`

Campos opcionales: `fullName`, `email`, `roleId`, `isActive`.

- **Desactivar** (`isActive: false`) cierra de inmediato todas las sesiones del usuario. Si después se reactiva, debe volver a iniciar sesión.
- Un cambio de rol aplica desde la siguiente petición del usuario, sin que tenga que volver a entrar.
- Nadie puede **desactivarse** ni **cambiarse el rol** a sí mismo (`400`).
- `409` si el cambio dejaría el sistema sin ningún usuario activo con `users.manage`.

### `PUT /users/:id/password` → `204`

```json
{ "newPassword": "Nueva1234" }
```

Restablece la contraseña de **otro** usuario (por ejemplo, si la olvidó) y cierra todas sus sesiones. Para la propia se usa `PATCH /auth/password`, que pide la actual (`400` si se intenta aquí).

---

## Roles y permisos

Todas las rutas exigen **`users.manage`**. Los cambios de permisos aplican a los usuarios del rol desde su siguiente petición.

### `GET /permissions`

Catálogo fijo de permisos (lo define el seed), para dibujar las casillas del formulario de rol.

```json
{ "data": [{ "id": 1, "code": "clients.create", "description": "Crear clientes" }] }
```

### Objeto `Role`

```json
{
  "id": 2,
  "name": "Cobrador",
  "description": "Cobra en la calle",
  "permissions": ["clients.read", "payments.create", "payments.read"],
  "userCount": 1,
  "createdAt": "2026-10-31T15:00:00.000Z",
  "updatedAt": "2026-10-31T15:00:00.000Z"
}
```

`userCount` incluye a los usuarios inactivos.

### `GET /roles` · `GET /roles/:id`

Ordenados por nombre. `404` si el rol no existe.

### `POST /roles` → `201`

```json
{ "name": "Cobrador", "description": "Cobra en la calle", "permissions": ["clients.read", "payments.create"] }
```

- `name`: 3–50 caracteres; único sin importar mayúsculas (`409`).
- `permissions`: lista de códigos de `GET /permissions`; los repetidos se ignoran; un código que no existe → `400` en `permissions`. Puede ser `[]`.

### `PATCH /roles/:id`

Campos opcionales: `name`, `description`, `permissions`. Si se envía `permissions`, **reemplaza la lista completa**.

### `DELETE /roles/:id` → `204`

`409` si algún usuario tiene ese rol (incluidos los inactivos): primero hay que cambiarlos de rol.

### Protecciones

- El rol **`admin`** del sistema no se puede editar ni eliminar (`409`). Siempre tiene todos los permisos.
- `409` si quitar `users.manage` de un rol dejaría el sistema sin ningún usuario activo que pueda administrar usuarios.

---

## Créditos

Permisos: `loans.read` (ver), `loans.create` (vista previa y crear), `loans.update` (cancelar).

> ⚠️ Varias reglas de cálculo están **pendientes de confirmar con Wilson** y se pueden cambiar sin tocar el código (ver la sección "Reglas configurables" al final).

### Frecuencias

| `frequency` | Campos | Cómo se calcula |
| ----------- | ------ | --------------- |
| `monthly`   | `monthlyInterestRate` (obligatorio, % mensual), `numberOfInstallments` (opcional), `paymentDay` (opcional, 1–31) | Interés = tasa × saldo de capital. **Con** número de cuotas: capital en partes iguales + interés sobre el saldo (cada cuota es un poco menor). **Sin** número de cuotas: cada mes se cobra solo el interés y el capital se abona libremente. |
| `biweekly`  | `installmentAmount` y `numberOfInstallments` (obligatorios) | Cuota pactada fija. El interés total (cuotas × valor − capital) se reparte por igual: $1.000.000 en 10 cuotas de $120.000 = $100.000 capital + $20.000 interés por cuota. |

Fechas de las cuotas:

- **Mensual:** el `paymentDay` de cada mes desde el mes siguiente al desembolso (por defecto, el mismo día del desembolso). Un 31 pasa a 30 o a 28/29 en meses más cortos.
- **Quincenal:** cada 15 días desde el desembolso (configurable: ver abajo).

### `POST /loans/preview`

Calcula la proyección **sin guardar nada** (botón "Vista previa" del formulario). Mismo cuerpo que crear, sin `clientId`, `coDebtorId` ni `notes`.

```json
{ "frequency": "biweekly", "principalAmount": 1000000, "installmentAmount": 120000, "numberOfInstallments": 10 }
```

```json
{
  "data": {
    "paymentDay": 15,
    "installments": [
      { "installmentNumber": 1, "dueDate": "2026-11-15", "principalDue": 100000, "interestDue": 20000, "amountDue": 120000 }
    ],
    "totals": { "principal": 1000000, "interest": 200000, "amount": 1200000 }
  }
}
```

### `POST /loans` → `201`

| Campo                   | Reglas                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `clientId`              | Cliente existente                                                                                     |
| `coDebtorId`            | Otro cliente existente, distinto del deudor                                                           |
| `frequency`             | `monthly` o `biweekly`                                                                                |
| `principalAmount`       | Valor prestado (número > 0)                                                                           |
| `startDate`             | Fecha de desembolso `AAAA-MM-DD`; por defecto hoy; no futura. **Puede ser pasada**, para registrar los créditos que ya existen en el cuaderno (sus cuotas vencidas aparecen como atrasadas). |
| `notes`                 | Opcional, máx. 2000                                                                                   |
| + campos de la frecuencia | Ver tabla de frecuencias. Quincenal: las cuotas deben cubrir el capital.                            |

Crea el crédito **y todas sus cuotas en una transacción**. Responde con el detalle (ver `GET /loans/:id`).

### `GET /loans`

Lista paginada, del desembolso más reciente al más antiguo. Cada crédito trae `clientName`, `clientNationalId` y `coDebtorName`.

| Query              | Descripción                                                     |
| ------------------ | --------------------------------------------------------------- |
| `status`           | `active`, `paid_off`, `defaulted`, `cancelled`                  |
| `frequency`        | `monthly`, `biweekly`                                           |
| `clientId`         | Créditos donde ese cliente es deudor **o** codeudor             |
| `search`           | Nombre (sin tildes) o cédula del deudor                         |
| `page`, `pageSize` | Paginación                                                      |

### `GET /loans/:id`

El crédito con sus cuotas y un resumen:

```json
{
  "data": {
    "id": 1,
    "clientName": "Ana Pérez",
    "coDebtorName": "Luis Gómez",
    "frequency": "biweekly",
    "principalAmount": 1000000,
    "principalBalance": 800000,
    "status": "active",
    "installments": [
      {
        "id": 1, "installmentNumber": 1, "dueDate": "2026-10-15",
        "principalDue": 100000, "interestDue": 20000, "amountDue": 120000,
        "principalPaid": 100000, "interestPaid": 20000, "status": "paid",
        "amountPaid": 120000, "amountRemaining": 0, "isOverdue": false, "daysOverdue": 0
      }
    ],
    "summary": {
      "totalDue": 1200000, "totalPaid": 240000, "totalRemaining": 960000,
      "overdueInstallments": 0, "overdueAmount": 0, "nextDueDate": "2026-11-14"
    }
  }
}
```

Estados de cuota: `pending`, `partially_paid`, `paid`, `cancelled`. `isOverdue` / `daysOverdue` se calculan contra hoy (hora de Colombia): una cuota que vence hoy todavía no está atrasada.

### `GET /clients/:clientId/loans`

Créditos de un cliente separados por papel: `{ "asDebtor": [...], "asCoDebtor": [...] }`. `404` si el cliente no existe.

### `POST /loans/:id/cancel`

Para un crédito registrado por error. Solo si está `active` y **no tiene pagos** (anule los pagos primero); si no, `409`. Sus cuotas pendientes pasan a `cancelled`.

---

## Pagos

Permisos: `payments.read`, `payments.create`, `payments.void`.

### Cómo se reparte un pago

1. Primero la cuota **más antigua**; dentro de cada cuota, primero el **interés** y luego el capital.
2. **Créditos con plazo** (quincenales y mensuales con número de cuotas): se puede pagar por adelantado, pero nunca más de lo que se debe en total.
3. **Mensuales sin plazo:** el pago cubre el interés de las cuotas ya vencidas; **lo que sobre es abono a capital**. Baja el saldo, y el interés de las cuotas futuras se recalcula con el nuevo saldo.
4. Si el saldo llega a 0 y no queda nada pendiente, el crédito pasa a `paid_off`.

Si el valor supera lo que se debe → `400` indicando el máximo a recibir.

### `POST /loans/:loanId/payments` → `201`

```json
{ "amount": 120000, "paymentMethod": "cash", "paymentDate": "2026-10-31", "notes": "Pagó en la tienda" }
```

| Campo           | Reglas                                                                   |
| --------------- | ------------------------------------------------------------------------ |
| `amount`        | Número > 0, máx. 2 decimales                                             |
| `paymentMethod` | `cash` (por defecto) o `transfer`                                        |
| `paymentDate`   | Por defecto hoy; no futura ni anterior al desembolso                     |
| `notes`         | Opcional                                                                 |

`409` si el crédito está pagado o cancelado. Respuesta: el objeto `Payment` con su distribución:

```json
{
  "data": {
    "id": 3, "loanId": 1, "clientName": "Ana Pérez", "paymentDate": "2026-10-31",
    "amount": 190000, "interestAmount": 20000, "principalAmount": 170000,
    "paymentMethod": "transfer", "receivedByName": "Admin",
    "voidedAt": null, "voidedByName": null, "voidReason": null,
    "allocations": [
      { "installmentId": 1, "installmentNumber": 1, "dueDate": "2026-10-15", "principalAmount": 70000, "interestAmount": 0 },
      { "installmentId": 2, "installmentNumber": 2, "dueDate": "2026-10-30", "principalAmount": 100000, "interestAmount": 20000 }
    ]
  }
}
```

Dos cobradores que registren un pago al mismo crédito al mismo tiempo no pueden cobrar dos veces la misma cuota: el segundo espera al primero y se calcula sobre lo que quede.

### `GET /loans/:loanId/payments`

Historial de pagos del crédito (incluye los anulados, marcados con `voidedAt`).

### `GET /payments`

Todos los pagos, del más reciente al más antiguo (por ejemplo, el cuadre de caja del día).

| Query           | Descripción                                    |
| --------------- | ---------------------------------------------- |
| `from`, `to`    | Rango de fechas de pago                        |
| `loanId`        | Solo ese crédito                               |
| `receivedBy`    | Id del usuario que recibió el pago             |
| `paymentMethod` | `cash` o `transfer`                            |
| `includeVoided` | `true` para incluir los anulados en la lista   |

`meta.totals` = `{ count, amount, principal, interest }` de **todos** los pagos no anulados del filtro.

### `GET /payments/:id`

### `POST /payments/:id/void`

```json
{ "reason": "Se registró en el crédito equivocado" }
```

Anula el pago (motivo obligatorio, mínimo 5 caracteres). Deshace todo: lo pagado de cada cuota, el saldo de capital y, si el crédito estaba pagado, lo reabre. El pago no se borra: queda con `voidedAt`, `voidedByName` y `voidReason`, y deja de contar en los reportes. `409` si ya estaba anulado.

---

## Cobros del día

### `GET /collections`

Permiso `payments.read`. Un registro por crédito con cuotas que vencen **hasta hoy** sin pagar, pensado para el celular del cobrador. Ordenado del atraso más antiguo al más reciente.

| Query         | Descripción                                          |
| ------------- | ---------------------------------------------------- |
| `date`        | Otra fecha `AAAA-MM-DD` (por defecto hoy)            |
| `frequency`   | `monthly` o `biweekly`                               |
| `search`      | Nombre (sin tildes), cédula o dirección del cliente  |
| `onlyOverdue` | `true` para solo los atrasados                       |

```json
{
  "data": [
    {
      "loanId": 2, "frequency": "monthly", "principalBalance": 2000000,
      "clientId": 2, "clientName": "Luis Gómez", "clientPhoneCountryCode": "+57",
      "clientPhoneNumber": "3001234567", "clientAddress": "Calle 4 # 5-6",
      "coDebtorName": "Marta Ruiz", "coDebtorPhoneNumber": "3007654321",
      "installmentsDue": 2, "oldestDueDate": "2026-09-30", "amountDue": 200000,
      "daysOverdue": 31, "isOverdue": true
    }
  ],
  "meta": {
    "date": "2026-10-31", "loans": 1, "overdueLoans": 1, "amountDue": 200000,
    "collected": { "count": 0, "amount": 0, "principal": 0, "interest": 0 }
  }
}
```

`meta.collected` = lo ya cobrado en esa fecha.

---

## Reportes

Permiso `reports.read`. Siempre excluyen pagos anulados, créditos cancelados y gastos eliminados. El reporte 1 de la cotización (listado diario de cobros) es `GET /collections`.

**Ganancia neta** = intereses recaudados − gastos. (El capital que regresa es dinero del prestamista que vuelve, no ganancia.)

### `GET /reports/daily`

Reportes 2, 3 y 4 de la cotización: ganancia, colocación y recolección de capital **por día**. Incluye los días sin movimiento (en 0).

Query: `from`, `to` (por defecto, del 1 del mes actual a hoy; máximo 366 días).

```json
{
  "data": {
    "from": "2026-10-01", "to": "2026-10-31",
    "rows": [
      {
        "date": "2026-10-31", "interestCollected": 340000, "principalCollected": 2700000,
        "totalCollected": 3040000, "paymentsCount": 4, "disbursed": 300000, "loansCreated": 1,
        "expenses": 40000, "netProfit": 300000
      }
    ],
    "totals": { "interestCollected": 340000, "...": "mismos campos sumados" }
  }
}
```

### `GET /reports/monthly`

Reportes 5 y 6: consolidado mensual y **efectividad de cobro**. Query: `year` (por defecto el actual). Siempre 12 filas (`month`: `"2026-10"`), con los mismos campos del diario más:

| Campo                  | Significado                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| `installmentsDue`      | Cuotas que vencían en el mes                                                |
| `amountDue`            | Lo que sumaban                                                              |
| `amountCollectedOnDue` | Lo cobrado sobre **esas** cuotas hasta el último día del mismo mes          |
| `effectiveness`        | `amountCollectedOnDue / amountDue × 100` (2 decimales); `null` si no vencía nada |

Un pago atrasado que llega el mes siguiente **no** mejora la efectividad del mes en que vencía la cuota. Es justamente lo que mide el indicador.

### `GET /reports/portfolio`

Foto actual para la pantalla de inicio:

```json
{
  "data": {
    "date": "2026-10-31", "openLoans": 2, "principalOutstanding": 600000,
    "overdueLoans": 0, "overdueAmount": 0, "clients": 3
  }
}
```

---

## Reglas configurables (pendientes de confirmar con Wilson)

| Variable `.env`      | Valores                                          | Por defecto     |
| -------------------- | ------------------------------------------------ | --------------- |
| `LOAN_ROUNDING_UNIT` | Redondeo de interés/capital en pesos: `1`, `100`, `1000` | `1`       |
| `BIWEEKLY_DUE_DATES` | `every_15_days` (cada 15 días desde el desembolso) o `fixed_15_and_end_of_month` (el 15 y el último día de cada mes; se salta una fecha a menos de 8 días del desembolso) | `every_15_days` |

Cambiarlas afecta **solo a los créditos nuevos**: las cuotas de los existentes ya están guardadas.
