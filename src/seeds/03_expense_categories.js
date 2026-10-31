// Starter categories (display data, editable later from the app).
const CATEGORIES = ['Transporte', 'Papelería', 'Servicios públicos', 'Nómina', 'Arriendo', 'Otros'];

exports.seed = (knex) =>
  knex('expense_categories')
    .insert(CATEGORIES.map((name) => ({ name })))
    // No conflict target: the unique index is on LOWER(name), an expression.
    .onConflict()
    .ignore();
