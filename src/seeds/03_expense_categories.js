// Starter categories (display data, editable later from the app).
const CATEGORIES = ['Transporte', 'Papelería', 'Servicios públicos', 'Nómina', 'Arriendo', 'Otros'];

exports.seed = (knex) =>
  knex('expense_categories')
    .insert(CATEGORIES.map((name) => ({ name })))
    .onConflict('name')
    .ignore();
