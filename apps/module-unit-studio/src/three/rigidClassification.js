export function isUboltRigid(rigid) {
  if (!rigid) return false
  if (String(rigid.remark ?? '').trim().toUpperCase() === 'UBOLT') return true
  return rigid.cm != null && String(rigid.cm).trim() !== ''
}
