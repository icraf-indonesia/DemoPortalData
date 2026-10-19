/**
 * src/features/auth.js
 * Authentication and dummy user profiles for Portal Data Epistem.
 *
 * Accounts:
 * 1. Admin (Administrator): admin / admin@mail.com / password123
 * 2. Faza (Pengguna A - Kasus 1): faza / faza@mail.com / password123
 * 3. Dony (Pengguna B - Kasus 3): dony / dony@mail.com / password123
 * 4. Arga (Pengguna C - Kasus 4): arga / arga@mail.com / password123
 */

const adminUser = {
  id: 'admin',
  key: 'admin',
  name: 'Admin',
  fullName: 'Administrator',
  email: 'admin@mail.com',
  password: 'password123',
  role: 'Administrator',
  roleTitle: 'Administrator Sistem & Data',
  institution: 'Konsorsium Epistem',
  defaultCaseId: 1,
  avatarBg: '#6366f1', // Indigo / Purple
  avatarInitial: 'A'
};

const fazaUser = {
  id: 'user_a',
  key: 'faza',
  name: 'Faza',
  fullName: 'Faza',
  email: 'faza@mail.com',
  password: 'password123',
  role: 'Pengguna A',
  roleTitle: 'Spesialis Komoditas Perkebunan',
  institution: 'Instansi Perkebunan A',
  defaultCaseId: 1,
  avatarBg: '#059669', // Emerald
  avatarInitial: 'F'
};

const donyUser = {
  id: 'user_b',
  key: 'dony',
  name: 'Dony',
  fullName: 'Dony',
  email: 'dony@mail.com',
  password: 'password123',
  role: 'Pengguna B',
  roleTitle: 'Pengelola Data Kehutanan',
  institution: 'Instansi Kehutanan B',
  defaultCaseId: 3,
  avatarBg: '#2563eb', // Blue
  avatarInitial: 'D'
};

const argaUser = {
  id: 'user_c',
  key: 'arga',
  name: 'Arga',
  fullName: 'Arga',
  email: 'arga@mail.com',
  password: 'password123',
  role: 'Pengguna C',
  roleTitle: 'Penelaah Mutu Independen',
  institution: 'Tim Telaah Mutu / Konsorsium Independen',
  defaultCaseId: 4,
  avatarBg: '#d97706', // Amber
  avatarInitial: 'A'
};

export const DEMO_USERS = Object.freeze({
  admin: adminUser,
  faza: fazaUser,
  dony: donyUser,
  arga: argaUser,
  // Backward compatibility aliases
  rizki: fazaUser,
  budi: donyUser,
  putri: argaUser
});

/**
 * Authenticates user by email/username and password.
 * Case-insensitive match on email, username, or key.
 * Supports both new usernames (faza, dony, arga) and legacy identifiers.
 * @param {string} identifier email or username
 * @param {string} password
 * @returns {Object|null} user object or null if invalid
 */
export function authenticateUser(identifier, password) {
  if (!identifier || !password) return null;
  const cleanId = String(identifier).trim().toLowerCase();
  const cleanPw = String(password).trim();

  // Legacy fallback mapping
  let targetKey = cleanId;
  if (targetKey === 'rizki' || targetKey === 'rizki@mail.com') targetKey = 'faza';
  if (targetKey === 'budi' || targetKey === 'budi@mail.com' || targetKey === 'doni' || targetKey === 'doni@mail.com') targetKey = 'dony';
  if (targetKey === 'putri' || targetKey === 'putri@mail.com') targetKey = 'arga';

  for (const user of Object.values(DEMO_USERS)) {
    if (
      (user.email.toLowerCase() === cleanId ||
       user.name.toLowerCase() === cleanId ||
       user.key.toLowerCase() === cleanId ||
       user.id.toLowerCase() === cleanId ||
       user.key.toLowerCase() === targetKey) &&
      user.password === cleanPw
    ) {
      return user;
    }
  }
  return null;
}

/**
 * Finds user by userId ('user_a', 'user_b', 'user_c', 'admin').
 * @param {string} userId
 * @returns {Object|null}
 */
export function getUserById(userId) {
  return Object.values(DEMO_USERS).find(u => u.id === userId) || null;
}

/**
 * Finds user by caseId (1 or 2 -> faza, 3 -> dony, 4 -> arga).
 * @param {number} caseId
 * @returns {Object|null}
 */
export function getUserByCaseId(caseId) {
  if (caseId === 3) return DEMO_USERS.dony;
  if (caseId === 4) return DEMO_USERS.arga;
  return DEMO_USERS.faza;
}
