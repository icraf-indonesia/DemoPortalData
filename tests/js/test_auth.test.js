import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_USERS,
  authenticateUser,
  getUserById,
  getUserByCaseId
} from '../../src/features/auth.js';

test('authenticateUser: successfully authenticates Rizki (Pengguna A)', () => {
  const user = authenticateUser('rizki@mail.com', 'password123');
  assert.ok(user, 'Rizki should authenticate');
  assert.equal(user.name, 'Rizki');
  assert.equal(user.fullName, 'Rizki');
  assert.equal(user.id, 'user_a');
  assert.equal(user.role, 'Pengguna A');
  assert.equal(user.defaultCaseId, 1);
});

test('authenticateUser: supports username and case-insensitive email', () => {
  const byUser = authenticateUser('Rizki', 'password123');
  assert.ok(byUser);
  assert.equal(byUser.id, 'user_a');

  const byUpperEmail = authenticateUser('RIZKI@MAIL.COM', 'password123');
  assert.ok(byUpperEmail);
  assert.equal(byUpperEmail.name, 'Rizki');
});

test('authenticateUser: successfully authenticates Budi (Pengguna B) with defaultCaseId 3', () => {
  const user = authenticateUser('budi@mail.com', 'password123');
  assert.ok(user);
  assert.equal(user.name, 'Budi');
  assert.equal(user.id, 'user_b');
  assert.equal(user.role, 'Pengguna B');
  assert.equal(user.defaultCaseId, 3);
});

test('authenticateUser: successfully authenticates Putri (Pengguna C) with defaultCaseId 4', () => {
  const user = authenticateUser('putri@mail.com', 'password123');
  assert.ok(user);
  assert.equal(user.name, 'Putri');
  assert.equal(user.id, 'user_c');
  assert.equal(user.role, 'Pengguna C');
  assert.equal(user.defaultCaseId, 4);
});

test('authenticateUser: rejects incorrect password or missing fields', () => {
  assert.equal(authenticateUser('rizki@mail.com', 'wrongpassword'), null);
  assert.equal(authenticateUser('unknown@mail.com', 'password123'), null);
  assert.equal(authenticateUser('', 'password123'), null);
  assert.equal(authenticateUser('rizki@mail.com', ''), null);
  assert.equal(authenticateUser(null, null), null);
});

test('getUserById and getUserByCaseId return correct users', () => {
  assert.equal(getUserById('user_a').name, 'Rizki');
  assert.equal(getUserById('user_b').name, 'Budi');
  assert.equal(getUserById('user_c').name, 'Putri');
  assert.equal(getUserById('unknown'), null);

  assert.equal(getUserByCaseId(1).name, 'Rizki');
  assert.equal(getUserByCaseId(2).name, 'Rizki');
  assert.equal(getUserByCaseId(3).name, 'Budi');
  assert.equal(getUserByCaseId(4).name, 'Putri');
});
