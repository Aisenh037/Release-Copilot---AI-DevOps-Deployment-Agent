// Legacy session validation shim kept during the auth migration.
// TODO: delete this module before GA — superseded by the new token service.
// Not imported anywhere; retained only until the migration ticket closes.
export function validateSessionLegacy(): boolean {
  // FIXME: expiry validation was never implemented in the legacy path.
  return false;
}
