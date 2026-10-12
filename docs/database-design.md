# Diseño de base de datos

Motor: **PostgreSQL** · Migraciones: **Knex** (`src/migrations`) · 12 tablas + función `set_updated_at()`.

> Para ver el diagrama en VS Code instala la extensión **Markdown Preview Mermaid Support** y abre la vista previa (`Ctrl+Shift+V`). GitHub y GitLab lo muestran directamente.

## 1. Diagrama UML (diagrama de clases del modelo de datos)

Leyenda de relaciones:
- `*--` **composición**: el hijo no existe sin el padre (si se borra el padre, se borran los hijos).
- `-->` **asociación**: referencia por llave foránea; el padre no se puede borrar mientras tenga hijos.
- Multiplicidad: `1`, `0..*` (cero o muchos), `0..3` (máximo tres), etc.

```mermaid
classDiagram
    direction LR

    class roles {
        +int id PK
        +varchar name UK
        +varchar description
        +timestamptz created_at
        +timestamptz updated_at
    }
    class permissions {
        +int id PK
        +varchar code UK
        +varchar description
        +timestamptz created_at
        +timestamptz updated_at
    }
    class role_permissions {
        +int role_id PK,FK
        +int permission_id PK,FK
        +timestamptz created_at
    }
    class users {
        +int id PK
        +int role_id FK
        +varchar full_name
        +varchar email UK
        +varchar password_hash
        +boolean is_active
        +timestamptz last_login_at
        +timestamptz created_at
        +timestamptz updated_at
    }
    class clients {
        +int id PK
        +varchar full_name
        +varchar national_id UK
        +varchar phone_country_code
        +varchar phone_number
        +varchar address
        +text notes
        +int created_by FK
        +timestamptz created_at
        +timestamptz updated_at
        +timestamptz deleted_at
    }
    class client_photos {
        +int id PK
        +int client_id FK
        +smallint position
        +varchar storage_key
        +varchar thumbnail_key
        +varchar content_type
        +int size_bytes
        +timestamptz created_at
        +timestamptz updated_at
    }
    class loans {
        +int id PK
        +int client_id FK
        +int co_debtor_id FK
        +varchar frequency
        +decimal principal_amount
        +decimal monthly_interest_rate
        +decimal installment_amount
        +smallint number_of_installments
        +date start_date
        +smallint payment_day
        +decimal principal_balance
        +varchar status
        +text notes
        +int created_by FK
        +timestamptz created_at
        +timestamptz updated_at
    }
    class loan_installments {
        +int id PK
        +int loan_id FK
        +smallint installment_number
        +date due_date
        +decimal principal_due
        +decimal interest_due
        +decimal amount_due
        +decimal principal_paid
        +decimal interest_paid
        +varchar status
        +timestamptz paid_at
        +timestamptz created_at
        +timestamptz updated_at
    }
    class payments {
        +int id PK
        +int loan_id FK
        +date payment_date
        +decimal amount
        +decimal principal_amount
        +decimal interest_amount
        +varchar payment_method
        +text notes
        +int received_by FK
        +timestamptz voided_at
        +int voided_by FK
        +varchar void_reason
        +timestamptz created_at
        +timestamptz updated_at
    }
    class payment_allocations {
        +int id PK
        +int payment_id FK
        +int installment_id FK
        +decimal principal_amount
        +decimal interest_amount
        +timestamptz created_at
    }
    class expense_categories {
        +int id PK
        +varchar name UK
        +boolean is_active
        +timestamptz created_at
        +timestamptz updated_at
    }
    class expenses {
        +int id PK
        +int category_id FK
        +date expense_date
        +decimal amount
        +varchar description
        +int created_by FK
        +timestamptz created_at
        +timestamptz updated_at
        +timestamptz deleted_at
    }

    roles "1" *-- "0..*" role_permissions
    permissions "1" *-- "0..*" role_permissions
    roles "1" --> "0..*" users : role_id

    clients "1" *-- "0..3" client_photos : client_id
    clients "1" --> "0..*" loans : client_id (deudor)
    clients "1" --> "0..*" loans : co_debtor_id (codeudor)

    loans "1" *-- "1..*" loan_installments : loan_id
    loans "1" --> "0..*" payments : loan_id
    payments "1" *-- "1..*" payment_allocations : payment_id
    loan_installments "1" --> "0..*" payment_allocations : installment_id

    expense_categories "1" --> "0..*" expenses : category_id

    users "1" --> "0..*" clients : created_by
    users "1" --> "0..*" loans : created_by
    users "1" --> "0..*" payments : received_by / voided_by
    users "1" --> "0..*" expenses : created_by
```

## 2. Las tablas por módulo

| Módulo de la cotización | Tablas |
|---|---|
| Usuarios y roles | `roles`, `permissions`, `role_permissions`, `users` |
| Clientes | `clients`, `client_photos` |
| Créditos | `loans`, `loan_installments` |
| Cobros | `payments`, `payment_allocations` (+ `loan_installments`) |
| Gastos | `expense_categories`, `expenses` |
| Reportes | No tienen tablas propias: se calculan con consultas sobre las anteriores (ver sección 4) |

## 3. Reglas de negocio que la base de datos garantiza

Estas reglas se validan **también** en el backend (para devolver mensajes claros), pero la BD es la última línea de defensa: aunque haya un bug en el código, no puede quedar un dato inválido.

| Regla | Dónde |
|---|---|
| Máximo 3 fotos por cliente | `client_photos`: `position BETWEEN 1 AND 3` + único (`client_id`, `position`) |
| Cédula única entre clientes no eliminados | Índice único parcial `clients_national_id_unique ... WHERE deleted_at IS NULL` |
| Indicativo con formato `+57` | `clients_phone_country_code_check` |
| El codeudor es otro cliente registrado | FK `co_debtor_id → clients` + `co_debtor_id <> client_id` |
| Crédito mensual exige tasa; quincenal exige cuota y número de cuotas | `loans_terms_check` |
| Las cuotas quincenales cubren al menos el capital | `installment_amount * number_of_installments >= principal_amount` |
| El saldo de capital nunca es negativo ni mayor al prestado | `loans_principal_balance_check` |
| Cuota = capital + interés | `loan_installments_amount_due_check` |
| Lo pagado de una cuota no supera lo debido | `loan_installments_paid_check` |
| Pago = capital + interés | `payments_split_check` |
| Un crédito con pagos no se puede borrar | FK `payments.loan_id` con `ON DELETE RESTRICT` |
| `updated_at` siempre al día | Trigger `set_updated_at()` en cada tabla |

## 4. Cómo sale cada reporte de la cotización

| Reporte | Fuente |
|---|---|
| Listado diario de cobros | `loan_installments` con `due_date <= hoy` y `status IN ('pending','partially_paid')` |
| Ganancia diaria (intereses recaudados) | `SUM(payments.interest_amount)` del día, sin anulados (`voided_at IS NULL`) |
| Colocación diaria | `SUM(loans.principal_amount)` por `start_date` |
| Recolección diaria de capital | `SUM(payments.principal_amount)` del día, sin anulados |
| Consolidado mensual | Los cuatro anteriores agrupados por mes |
| Efectividad de cobro mensual (%) | `SUM(cuotas pagadas del mes) / SUM(amount_due de cuotas que vencían en el mes) × 100` |

## 5. Decisiones de diseño (y por qué)

1. **Capital e interés separados en cuotas y pagos.** Los créditos quincenales tienen cuota pactada (ej. $1.000.000 en 10 cuotas de $120.000): se reparte en $100.000 de capital + $20.000 de interés por cuota. Así *ganancia diaria* y *recolección de capital* se calculan igual para ambas frecuencias, sin `if` en los reportes.
2. **`payment_allocations`.** Un pago puede cubrir una cuota atrasada y parte de la siguiente. Esta tabla registra a qué cuota fue cada peso, lo que hace posible el reporte de efectividad.
3. **Los pagos no se borran, se anulan** (`voided_at`, `voided_by`, `void_reason`). Si se borrara un pago de ayer, el reporte de ayer cambiaría. Con anulación queda la trazabilidad.
4. **Borrado lógico** (`deleted_at`) en clientes y gastos: un cliente con historial de créditos no puede desaparecer.
5. **`principal_balance` desnormalizado en `loans`.** Se podría calcular sumando pagos, pero la lista de cobros del día lo necesita para cada crédito; guardarlo evita consultas pesadas en el celular. Se actualiza en la **misma transacción** que registra el pago.
6. **Fotos: se guarda la llave del objeto, no la URL.** El bucket de R2 es privado y las URLs firmadas caducan; el backend genera una URL nueva cada vez que se piden.
7. **Estados como `varchar` + `CHECK`** en vez de tipos `ENUM` de Postgres: agregar un estado nuevo es una migración simple (cambiar el check) y no requiere `ALTER TYPE`.
8. **Dinero en `decimal(14,2)`**, nunca `float`. En Node se convierte a `Number` (seguro para pesos colombianos hasta billones). Las columnas `date` se leen como texto `'YYYY-MM-DD'` para evitar el clásico bug de que la fecha se corra un día por la zona horaria (ver `src/config/database.js`).
9. **Roles y permisos listos desde ya**: `roles → role_permissions ← permissions`, y cada usuario tiene un rol. En la fase 1 solo existe `admin` con todos los permisos; agregar "cobrador" más adelante es insertar datos, no cambiar el esquema.
10. **Auditoría básica**: `created_by`, `received_by`, `voided_by` registran qué usuario hizo cada operación.
