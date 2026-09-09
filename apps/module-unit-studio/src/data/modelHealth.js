export function getModelHealth(stage) {
  if (!stage) return { status: 'empty', errors: 0, warnings: 0, issues: [], blocking: ['모델이 없습니다.'] }

  const hm = stage.healthMetrics ?? {}
  const dc = hm.diagnosticCounts ?? {}
  const rawIssues = hm.issues ?? {}
  const errors = Math.max(0, Number(dc.error) || 0)
  const warnings = Math.max(0, Number(dc.warning) || 0)
  const issues = [
    ['Free-end Node', rawIssues.freeEndNodes],
    ['Orphan Node', rawIssues.orphanNodes],
    ['Short Element', rawIssues.shortElements],
    ['미해결 U-bolt', rawIssues.unresolvedUbolts],
    ['분리 연결 그룹', rawIssues.disconnectedGroups],
  ].map(([label, value]) => ({ label, value: Math.max(0, Number(value) || 0) }))

  const blocking = []
  if (errors > 0) blocking.push(`모델 진단 오류 ${errors.toLocaleString('ko-KR')}건`)
  if (!stage.nodeMap?.size) blocking.push('Node 없음')
  if (!(stage.elements?.length > 0)) blocking.push('Element 없음')

  return {
    status: blocking.length > 0 ? 'error' : (warnings > 0 || issues.some(i => i.value > 0) ? 'warn' : 'pass'),
    errors,
    warnings,
    issues,
    blocking,
  }
}

export function isModelHealthRunnable(stage) {
  return getModelHealth(stage).status !== 'empty' && getModelHealth(stage).blocking.length === 0
}
