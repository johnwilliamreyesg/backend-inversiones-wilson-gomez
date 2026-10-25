# Referencia de la API

Base: `http://localhost:3000/api` (desarrollo). Todo el intercambio es JSON (UTF-8).

## Convenciones

**Respuesta exitosa**

```jsonc
{ "data": { ... } }                       // un recurso
{ "data": [ ... ], "meta": { ... } }      // lista paginada
```

**Respuesta de error** (siempre la misma forma)

```jsonc
{
  "error": {
    "code": "VALIDATION_ERROR",           // código estable para el frontend
    "message": "Los datos enviados no son válidos.",   // texto para mostrar al usuario
    "details": [                          // opcional
      { "location": "body", "field": "phoneNumber", "message": "El teléfono debe tener entre 6 y 15 dígitos." }
    ]
  }
}
```

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Datos con formato inválido (`details` trae cada campo) |
| 400 | `INVALID_JSON` | El cuerpo no es JSON válido |
| 401 | `UNAUTHORIZED` | Falta iniciar sesión *(cuando exista autenticación)* |
| 403 | `FORBIDDEN` | Sin permiso para la acción *(cuando exista autenticación)* |
| 404 | `NOT_FOUND` | El recurso o la ruta no existe |
| 409 | `CONFLICT` | Choca con datos existentes (cédula repetida, cliente con créditos abiertos…) |
| 500 | `INTERNAL_ERROR` | Error inesperado del servidor |

**Paginación** (query): `page` (por defecto 1), `pageSize` (por defecto 20, máximo 100).
`meta`: `{ page, pageSize, total, totalPages }`.

---

## Health

### `GET /health`
Estado del servidor y de la base de datos. `200` si todo está bien, `503` si la BD no responde.

```json
{ "data": { "status": "ok", "database": "up", "uptimeSeconds": 42, "timestamp": "2026-10-24T15:00:00.000Z" } }
```

---

## Clientes

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

| Query | Descripción |
|---|---|
| `search` | Busca en nombre (sin importar mayúsculas ni tildes: `gomez` encuentra `Gómez`), cédula o teléfono |
| `page`, `pageSize` | Paginación |

### `GET /clients/:id`
`404` si no existe o fue eliminado.

### `POST /clients` → `201`

| Campo | Obligatorio | Reglas |
|---|---|---|
| `fullName` | Sí | 3–150 caracteres; se recortan espacios |
| `nationalId` | Sí | 3–20 letras, números o guiones; se guarda en mayúsculas; única entre clientes activos (`409` si se repite) |
| `phoneCountryCode` | No | Formato `+57` (por defecto `+57`) |
| `phoneNumber` | Sí | 6–15 dígitos; acepta espacios y guiones (`300 123-4567`) y guarda solo dígitos |
| `address` | No | Máx. 255; vacío se guarda como `null` |
| `notes` | No | Máx. 2000; vacío se guarda como `null` |

### `PATCH /clients/:id`
Actualización parcial: solo se envían los campos a cambiar (mismas reglas que `POST`). Enviar `""` en `address` o `notes` los borra. Cuerpo vacío → `400`.

### `DELETE /clients/:id` → `204`
Borrado lógico (el historial se conserva). `409` si el cliente tiene créditos abiertos (`active` o `defaulted`) como deudor **o** como codeudor. Tras eliminarlo, su cédula queda libre para registrarse de nuevo.
