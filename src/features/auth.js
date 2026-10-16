/**
 * src/features/auth.js
 * Authentication and dummy user profiles for Portal Data Epistem.
 *
 * Accounts:
 * 1. Rizki (Pengguna A - Kasus 1): rizki@mail.com / password123
 * 2. Budi (Pengguna B - Kasus 3): budi@mail.com / password123
 * 3. Putri (Pengguna C - Kasus 4): putri@mail.com / password123
 */

export const DEMO_USERS = Object.freeze({
  rizki: {
    id: 'user_a',
    key: 'rizki',
    name: 'Rizki',
    fullName: 'Rizki',
    email: 'rizki@mail.com',
    password: 'password123',
    role: 'Pengguna A',
    roleTitle: 'Spesialis Komoditas Perkebunan',
    institution: 'Dinas Perkebunan Kabupaten Banyuasin',
    defaultCaseId: 1,
    avatarBg: '#059669', // Emerald
    avatarInitial: 'R'
  },
  budi: {
    id: 'user_b',
    key: 'budi',
    name: 'Budi',
    fullName: 'Budi',
    email: 'budi@mail.com',
    password: 'password123',
    role: 'Pengguna B',
    roleTitle: 'Pengelola Data Kehutanan',
    institution: 'Dinas Kehutanan / KPH Banyuasin',
    defaultCaseId: 3,
    avatarBg: '#2563eb', // Blue
    avatarInitial: 'B'
  },
  putri: {
    id: 'user_c',
    key: 'putri',
    name: 'Putri',
    fullName: 'Putri',
    email: 'putri@mail.com',
    password: 'password123',
    role: 'Pengguna C',
    roleTitle: 'Penelaah Mutu Independen',
    institution: 'Tim Telaah Mutu / Konsorsium Independen',
    defaultCaseId: 4,
    avatarBg: '#d97706', // Amber
    avatarInitial: 'P'
  }
});

/**
 * Authenticates user by email/username and password.
 * Case-insensitive match on email, username, or key.
 * @param {string} identifier email or username
 * @param {string} password
 * @returns {Object|null} user object or null if invalid
 */
export function authenticateUser(identifier, password) {
  if (!identifier || !password) return null;
  const cleanId = String(identifier).trim().toLowerCase();
  const cleanPw = String(password).trim();

  for (const user of Object.values(DEMO_USERS)) {
    if (
      (user.email.toLowerCase() === cleanId ||
       user.name.toLowerCase() === cleanId ||
       user.key.toLowerCase() === cleanId ||
       user.id.toLowerCase() === cleanId) &&
      user.password === cleanPw
    ) {
      return user;
    }
  }
  return null;
}

/**
 * Finds user by userId ('user_a', 'user_b', 'user_c').
 * @param {string} userId
 * @returns {Object|null}
 */
export function getUserById(userId) {
  return Object.values(DEMO_USERS).find(u => u.id === userId) || null;
}

/**
 * Finds user by caseId (1 or 2 -> rizki, 3 -> budi, 4 -> putri).
 * @param {number} caseId
 * @returns {Object|null}
 */
export function getUserByCaseId(caseId) {
  if (caseId === 3) return DEMO_USERS.budi;
  if (caseId === 4) return DEMO_USERS.putri;
  return DEMO_USERS.rizki;
}
