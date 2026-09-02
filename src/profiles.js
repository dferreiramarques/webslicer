/**
 * Perfis de impressão nomeados, por impressora — guardados no browser.
 *
 * "Predefinição" (DEFAULT_PROFILE_ID) é um perfil virtual, nunca guardado:
 * representa sempre os valores de fábrica dessa impressora
 * (printer.defaults + GLOBAL_DEFAULTS, ver main.js).
 */
const PROFILES_KEY = (printerId) => `webslicer:profiles:${printerId}`;
const ACTIVE_PROFILE_KEY = (printerId) => `webslicer:activeProfile:${printerId}`;
const LEGACY_PROFILE_KEY = (printerId) => `webslicer:profile:${printerId}`;

export const DEFAULT_PROFILE_ID = '__default__';

/**
 * Versões anteriores só guardavam UM perfil por impressora (guardado/reposto
 * automaticamente). Na primeira leitura, converte esse perfil legado num
 * perfil nomeado "Perfil guardado" para não perder as definições de quem já
 * usava a app.
 */
function migrateLegacyProfile(printerId) {
  const legacyRaw = localStorage.getItem(LEGACY_PROFILE_KEY(printerId));
  if (!legacyRaw) return;

  const existingRaw = localStorage.getItem(PROFILES_KEY(printerId));
  if (!existingRaw) {
    try {
      const settings = JSON.parse(legacyRaw);
      const id = `profile_migrated_${printerId}`;
      localStorage.setItem(PROFILES_KEY(printerId), JSON.stringify([{ id, name: 'Perfil guardado', settings }]));
      localStorage.setItem(ACTIVE_PROFILE_KEY(printerId), id);
    } catch {
      // dados corrompidos — ignora, não há nada para migrar
    }
  }
  localStorage.removeItem(LEGACY_PROFILE_KEY(printerId));
}

export function getProfiles(printerId) {
  migrateLegacyProfile(printerId);
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY(printerId)) || '[]');
  } catch {
    return [];
  }
}

function persistProfiles(printerId, profiles) {
  localStorage.setItem(PROFILES_KEY(printerId), JSON.stringify(profiles));
}

function requireName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Indica um nome para o perfil.');
  return trimmed;
}

export function createProfile(printerId, name, settings) {
  const trimmed = requireName(name);
  const profiles = getProfiles(printerId);
  const id = `profile_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const profile = { id, name: trimmed, settings };
  profiles.push(profile);
  persistProfiles(printerId, profiles);
  return profile;
}

export function updateProfileSettings(printerId, profileId, settings) {
  const profiles = getProfiles(printerId);
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Perfil não encontrado.');
  profile.settings = settings;
  persistProfiles(printerId, profiles);
  return profile;
}

export function renameProfile(printerId, profileId, newName) {
  const trimmed = requireName(newName);
  const profiles = getProfiles(printerId);
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Perfil não encontrado.');
  profile.name = trimmed;
  persistProfiles(printerId, profiles);
  return profile;
}

export function duplicateProfile(printerId, profileId, newName) {
  const profiles = getProfiles(printerId);
  const source = profiles.find((p) => p.id === profileId);
  if (!source) throw new Error('Perfil não encontrado.');
  return createProfile(printerId, newName, { ...source.settings });
}

export function deleteProfile(printerId, profileId) {
  persistProfiles(printerId, getProfiles(printerId).filter((p) => p.id !== profileId));
}

export function getActiveProfileId(printerId) {
  return localStorage.getItem(ACTIVE_PROFILE_KEY(printerId)) || DEFAULT_PROFILE_ID;
}

export function setActiveProfileId(printerId, profileId) {
  localStorage.setItem(ACTIVE_PROFILE_KEY(printerId), profileId);
}

/** Apaga todos os perfis de impressão guardados para uma impressora (ex: ao removê-la). */
export function clearProfiles(printerId) {
  localStorage.removeItem(PROFILES_KEY(printerId));
  localStorage.removeItem(ACTIVE_PROFILE_KEY(printerId));
  localStorage.removeItem(LEGACY_PROFILE_KEY(printerId));
}
