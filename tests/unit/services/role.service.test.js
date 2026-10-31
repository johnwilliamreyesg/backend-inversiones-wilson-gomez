const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { RoleService } = require('../../../src/services/role.service');
const {
  NotFoundError,
  ConflictError,
  ValidationError,
} = require('../../../src/errors/app-error');

const PERMISSIONS = [
  { id: 1, code: 'clients.read' },
  { id: 2, code: 'expenses.read' },
  { id: 3, code: 'users.manage' },
];

const fakePermissionRepository = {
  async findAll() {
    return PERMISSIONS;
  },
  async findByCodes(codes) {
    return PERMISSIONS.filter(({ code }) => codes.includes(code));
  },
};

const createFakeRoleRepository = (roles) => ({
  rows: roles.map((role) => ({ ...role })),
  lastSaved: null,
  async findAllWithDetails() {
    return this.rows;
  },
  async findById(id) {
    return this.rows.find((role) => role.id === id);
  },
  async findByName(name, { excludeId } = {}) {
    return this.rows.find(
      (role) => role.name.toLowerCase() === name.toLowerCase() && role.id !== excludeId,
    );
  },
  async create(data) {
    this.lastSaved = data;
    return { id: 9, ...data };
  },
  async update(id, data) {
    this.lastSaved = data;
    return { ...(await this.findById(id)), ...data };
  },
  async delete(id) {
    this.rows = this.rows.filter((role) => role.id !== id);
  },
});

const createFakeSafeguard = ({ managersLeft }) => ({
  calls: [],
  async ensureAnotherManagerRemains(options) {
    this.calls.push(options);
    if (managersLeft === 0) throw new ConflictError('sin ningún usuario activo');
  },
});

const ADMIN = { id: 1, name: 'admin', permissions: ['clients.read', 'users.manage'], userCount: 1 };
const SUPERVISOR = { id: 2, name: 'Supervisor', permissions: ['clients.read', 'users.manage'], userCount: 1 };
const COLLECTOR = { id: 3, name: 'Cobrador', permissions: ['clients.read'], userCount: 0 };

describe('RoleService', () => {
  let roleRepository;
  let safeguard;
  let service;

  const build = ({ managersLeft = 1 } = {}) => {
    roleRepository = createFakeRoleRepository([ADMIN, SUPERVISOR, COLLECTOR]);
    safeguard = createFakeSafeguard({ managersLeft });
    service = new RoleService({
      roleRepository,
      permissionRepository: fakePermissionRepository,
      managerSafeguard: safeguard,
    });
  };

  beforeEach(() => build());

  it('creates a role translating permission codes into ids', async () => {
    await service.create({ name: 'Auditor', permissions: ['clients.read', 'expenses.read'] });
    assert.deepEqual(roleRepository.lastSaved.permissionIds, [1, 2]);
  });

  it('rejects unknown permission codes on the permissions field', async () => {
    await assert.rejects(
      service.create({ name: 'Auditor', permissions: ['clients.read', 'loans.fly'] }),
      (error) =>
        error instanceof ValidationError &&
        error.details[0].field === 'permissions' &&
        /loans\.fly/.test(error.message),
    );
  });

  it('rejects a duplicate name ignoring case', async () => {
    await assert.rejects(service.create({ name: 'COBRADOR', permissions: [] }), ConflictError);
  });

  it('never edits or deletes the admin role', async () => {
    await assert.rejects(service.update(1, { name: 'Jefe' }), /administrador/);
    await assert.rejects(service.delete(1), /administrador/);
  });

  it('checks the safeguard only when users.manage is removed', async () => {
    await service.update(3, { permissions: ['clients.read', 'expenses.read'] });
    assert.equal(safeguard.calls.length, 0);

    await service.update(2, { permissions: ['clients.read'] });
    assert.deepEqual(safeguard.calls, [{ excludeRoleId: 2 }]);
  });

  it('refuses removing users.manage when no other manager would remain', async () => {
    build({ managersLeft: 0 });
    await assert.rejects(service.update(2, { permissions: ['clients.read'] }), ConflictError);
  });

  it('deletes a role without users, refuses one with users', async () => {
    await service.delete(3);
    await assert.rejects(service.getById(3), NotFoundError);
    await assert.rejects(service.delete(2), /1 usuario\(s\)/);
  });
});
