import { useEffect, useMemo, useState } from 'react'
import { Link2, X } from 'lucide-react'
import { useStageStore } from '../store/useStageStore.js'
import { useEditStore } from '../store/useEditStore.js'
import { GROUP_AUTO_DEFAULTS, GROUP_SKIP_LABEL, planGroupConnections } from '../data/groupAutoConnect.js'
import { PROPOSAL_COLOR_HEX } from '../three/GroupConnectPreview.js'
import { getGroupDisplayCount, groupColorCss } from '../utils/groupPalette.js'
import { BG, LINE, INK, FONT, RADIUS } from '../utils/tokens.js'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * GroupAutoConnectSection — Edit 탭의 "자동 연결" 도구 (ModelBuilderStudio 에서 이식).
 *
 * 분리된 소그룹을 주 구조에 잇는 RBE2 후보를 계산해 뷰포트에 라임 점선으로 미리 보여 주고,
 * 사용자가 표에서 체크한 것만 addRigid intent 로 적용한다. 적용분은 다른 편집과 똑같이
 * 편집 의도로 쌓이고, 실제 모델 반영은 Hoist 탭의 "자세안정성 평가 실행" 시점이다.
 *
 * 규칙(planGroupConnections): 요소 수 최대 그룹 = 주 구조. 소그룹의 자유단(Free) 노드를
 * 반경 안 최근접 주 구조 **Structure** 부재 노드에 잇는다(배관 노드는 타깃 제외).
 */
export default function GroupAutoConnectSection() {
  const stages         = useStageStore(s => s.stages)
  const stage          = stages.length > 0 ? stages[stages.length - 1] : null
  const intents        = useEditStore(s => s.intents)
  const setProposals   = useEditStore(s => s.setGroupConnectProposals)
  const clearProposals = useEditStore(s => s.clearGroupConnectProposals)
  const setHover       = useEditStore(s => s.setGroupConnectHoverIndex)
  const apply          = useEditStore(s => s.applyGroupConnectProposals)

  const [radiusText, setRadiusText] = useState(String(GROUP_AUTO_DEFAULTS.radiusMm))
  // 기본 true — 소스는 소그룹의 자유단(부재 하나에만 붙은 끝점)만. 내부 노드까지 이으면
  // 소그룹이 통째로 주 구조에 매달려 실제 연결 의도와 달라진다.
  const [freeOnly, setFreeOnly] = useState(GROUP_AUTO_DEFAULTS.freeOnly)
  // 기본 true — 후보 노드마다 1건 제안(false 면 축방향 프레임마다 1건, 요약).
  const [perNode, setPerNode] = useState(GROUP_AUTO_DEFAULTS.perNode)
  const [plan, setPlan]       = useState(null)      // planGroupConnections 결과 + radiusMm
  const [checked, setChecked] = useState(() => new Set())
  const [result, setResult]   = useState(null)      // { applied, warned, failed }

  const radius = clamp(Number(radiusText) || GROUP_AUTO_DEFAULTS.radiusMm,
    GROUP_AUTO_DEFAULTS.radiusMinMm, GROUP_AUTO_DEFAULTS.radiusMaxMm)

  const groups = useMemo(() => stage?.finalGroups ?? stage?.groups ?? [], [stage])
  const displayCount = useMemo(() => getGroupDisplayCount(groups), [groups])

  // 섹션이 사라지면(탭 이탈) 뷰포트 미리보기도 함께 지운다.
  useEffect(() => () => clearProposals(), [clearProposals])

  if (!stage) return null
  if (groups.length < 2) {
    return (
      <div style={{ fontSize: FONT.xs, color: INK.dim, lineHeight: 1.5 }}>
        분리된 그룹이 없습니다 — 모델이 하나로 연결돼 있습니다.
      </div>
    )
  }

  const compute = () => {
    const r = planGroupConnections(stage, { radiusMm: radius, perNode, freeOnly, existingIntents: intents })
    setPlan({ ...r, radiusMm: radius })
    setProposals(r.proposals)
    setChecked(new Set(r.proposals.map((_, i) => i)))
    setResult(null)
  }
  const cancel = () => { setPlan(null); setChecked(new Set()); setResult(null); clearProposals() }
  const onApply = () => {
    const chosen = (plan?.proposals ?? []).filter((_, i) => checked.has(i))
    const res = apply(chosen)
    setResult(res)
    // 전량 실패면 표·미리보기를 남겨 실패 사유를 보면서 재시도할 수 있게 한다.
    if (res.applied > 0) { setPlan(null); setChecked(new Set()) }
  }
  // 체크를 해제해도 표의 행 순서·인덱스는 그대로 두고 미리보기에만 disabled 를 붙인다
  // — 뷰포트가 표와 같은 인덱스로 hover 를 맞출 수 있어야 한다.
  const applyChecked = (next) => {
    setChecked(next)
    setProposals(plan.proposals.map((pr, idx) => (next.has(idx) ? pr : { ...pr, disabled: true })))
  }
  const toggleRow = (i) => {
    const next = new Set(checked)
    if (next.has(i)) next.delete(i); else next.add(i)
    applyChecked(next)
    setHover(i)
  }
  const checkAll = (on) => applyChecked(on ? new Set((plan?.proposals ?? []).map((_, i) => i)) : new Set())

  const skippedCounts = {}
  for (const s of plan?.skipped ?? []) skippedCounts[s.reason] = (skippedCounts[s.reason] ?? 0) + 1
  const checkedCount = checked.size

  const btn = (extra) => ({
    fontSize: FONT.sm, fontWeight: 800, borderRadius: RADIUS.sm, padding: '5px 10px', cursor: 'pointer',
    background: 'transparent', color: INK.body, border: `1px solid ${LINE.base}`, ...extra,
  })
  const checkboxLabel = { display: 'flex', alignItems: 'center', gap: 6, fontSize: FONT.sm, color: INK.body, cursor: 'pointer' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ fontSize: FONT.xs, color: INK.dim, lineHeight: 1.55 }}>
        요소 수가 가장 많은 그룹을 <strong style={{ color: INK.body }}>주 구조</strong>로 보고, 나머지
        소그룹 {groups.length - 1}개의 <strong style={{ color: INK.body }}>자유단(Free) 노드</strong>를
        반경 안 가장 가까운 <strong style={{ color: INK.body }}>주 구조 부재 노드</strong>에
        RBE2(독립=주 구조, 종속=소그룹)로 잇는 후보를 제안합니다. 배관 노드는 타깃에서 제외합니다.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <label style={checkboxLabel}
          title="켜면 소그룹의 자유단(부재 하나에만 붙은 끝점)만 후보로 봅니다. 끄면 소그룹의 모든 노드를 후보로 봅니다.">
          <input type="checkbox" checked={freeOnly} onChange={e => setFreeOnly(e.target.checked)} />
          자유단(Free) 노드만
          <span style={{ color: INK.disabled }}>{freeOnly ? '(소그룹 끝점)' : '(모든 노드)'}</span>
        </label>
        <label style={checkboxLabel}
          title="켜면 후보 노드마다 가장 가까운 구조 노드 1개씩 제안합니다. 끄면 축방향 프레임마다 1건만 제안합니다(요약).">
          <input type="checkbox" checked={perNode} onChange={e => setPerNode(e.target.checked)} />
          후보 노드마다 1건
          <span style={{ color: INK.disabled }}>{perNode ? '' : '(프레임당 1건 — 요약)'}</span>
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: FONT.sm, color: INK.dim, display: 'flex', alignItems: 'center', gap: 4 }}>
          탐색 반경
          <input type="number" min={GROUP_AUTO_DEFAULTS.radiusMinMm} max={GROUP_AUTO_DEFAULTS.radiusMaxMm} step={50}
            value={radiusText}
            onChange={e => setRadiusText(e.target.value)}
            onBlur={() => setRadiusText(String(radius))}
            style={{
              width: 64, fontSize: FONT.sm, padding: '3px 5px', borderRadius: RADIUS.sm,
              background: BG.raised, color: INK.strong, border: `1px solid ${LINE.base}`,
            }} />
          mm
        </label>
        <button type="button" onClick={compute} title="반경 안 후보를 계산해 뷰포트에 미리 표시합니다"
          style={btn({
            color: '#EAFFC0', border: `1px solid ${PROPOSAL_COLOR_HEX}`, background: 'rgba(182,255,61,0.14)',
            display: 'flex', alignItems: 'center', gap: 5,
          })}>
          <Link2 size={12} /> 후보 계산
        </button>
      </div>

      {plan?.warnings?.length > 0 && (
        <div style={{
          fontSize: FONT.sm, color: '#FFE6A8', background: 'rgba(255,184,0,0.12)',
          border: '1px solid rgba(255,184,0,0.45)', borderRadius: RADIUS.sm, padding: '5px 8px',
        }}>
          {plan.warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {plan && plan.proposals.length === 0 && (
        <div style={{ fontSize: FONT.sm, color: INK.dim, lineHeight: 1.5 }}>
          반경 {plan.radiusMm} mm 안에서 연결할 주 구조 노드를 찾지 못했습니다. 반경을 늘리거나
          Shift+Node 2개 선택으로 직접 연결하세요.
        </div>
      )}

      {plan && plan.proposals.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: FONT.xs, color: INK.dim }}>
            <span>후보 <strong style={{ color: INK.body }}>{plan.proposals.length}</strong>건 · 선택 {checkedCount}건</span>
            <button type="button" onClick={() => checkAll(true)} style={btn({ marginLeft: 'auto', padding: '3px 7px', fontSize: FONT.xs })}>전체 선택</button>
            <button type="button" onClick={() => checkAll(false)} style={btn({ padding: '3px 7px', fontSize: FONT.xs })}>전체 해제</button>
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${LINE.subtle}`, borderRadius: RADIUS.sm }}
            onMouseLeave={() => setHover(null)}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT.sm }}>
              <thead>
                <tr style={{ color: INK.disabled, textAlign: 'left' }}>
                  <th scope="col" aria-label="선택" style={{ padding: '4px 6px' }} />
                  <th scope="col" style={{ padding: '4px 6px' }}>그룹</th>
                  <th scope="col" style={{ padding: '4px 6px' }}>소그룹 노드</th>
                  <th scope="col" style={{ padding: '4px 6px' }}>→ 구조 노드</th>
                  <th scope="col" style={{ padding: '4px 6px', textAlign: 'right' }}>거리</th>
                </tr>
              </thead>
              <tbody>
                {plan.proposals.map((pr, i) => (
                  <tr key={`${pr.srcNode}-${pr.tgtNode}`} onMouseEnter={() => setHover(i)}
                    onClick={() => toggleRow(i)}
                    style={{ color: checked.has(i) ? INK.strong : INK.disabled, borderTop: `1px solid ${LINE.subtle}`, cursor: 'pointer' }}>
                    <td style={{ padding: '3px 6px' }}>
                      <input type="checkbox" checked={checked.has(i)} onChange={() => toggleRow(i)}
                        onClick={e => e.stopPropagation()} aria-label={`후보 ${i + 1} 선택`} />
                    </td>
                    <td style={{ padding: '3px 6px' }}>
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 4,
                        background: groupColorCss(pr.groupIndex, displayCount), verticalAlign: 'middle',
                      }} />
                      {pr.groupIndex + 1}
                    </td>
                    <td style={{ padding: '3px 6px', fontFamily: 'monospace' }}>N{pr.srcNode}</td>
                    <td style={{ padding: '3px 6px', fontFamily: 'monospace' }}>
                      N{pr.tgtNode}
                      <span style={{ color: INK.disabled, marginLeft: 4 }}>{pr.tgtKind}</span>
                      {pr.replacedFrom != null && (
                        <span title={`원래 타깃 N${pr.replacedFrom} 이 기존 RBE 종속이라 그 RBE 의 독립노드로 대체`}
                          style={{ color: '#FFC447', marginLeft: 4 }}>대체</span>
                      )}
                    </td>
                    <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{Math.round(pr.distMm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {Object.keys(skippedCounts).length > 0 && (
            <div style={{ fontSize: FONT.xs, color: INK.disabled, lineHeight: 1.5 }}>
              건너뜀: {Object.entries(skippedCounts).map(([k, n]) => `${GROUP_SKIP_LABEL[k] ?? k} ${n}`).join(' · ')}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={onApply} disabled={checkedCount === 0}
              style={btn({
                flex: 1, color: checkedCount ? '#06130f' : INK.disabled,
                background: checkedCount ? PROPOSAL_COLOR_HEX : 'transparent',
                border: `1px solid ${checkedCount ? PROPOSAL_COLOR_HEX : LINE.base}`,
                cursor: checkedCount ? 'pointer' : 'not-allowed',
              })}>
              적용 {checkedCount}건
            </button>
            <button type="button" onClick={cancel} style={btn({ display: 'flex', alignItems: 'center', gap: 4 })}>
              <X size={12} /> 취소
            </button>
          </div>
        </>
      )}

      {result && (
        <div style={{
          fontSize: FONT.sm, lineHeight: 1.5, borderRadius: RADIUS.sm, padding: '5px 8px',
          color: result.applied > 0 ? '#9CFFC2' : '#FF9B9B',
          background: result.applied > 0 ? 'rgba(55,224,138,0.10)' : 'rgba(255,85,102,0.12)',
          border: `1px solid ${result.applied > 0 ? 'rgba(55,224,138,0.45)' : 'rgba(255,85,102,0.5)'}`,
        }}>
          {result.applied > 0
            ? <>RBE {result.applied}건을 편집 의도에 추가했습니다{result.warned > 0 ? ` (경고 ${result.warned})` : ''}. 실제 모델 반영은 Hoist 탭의 “자세안정성 평가 실행” 시점입니다.</>
            : <>적용된 건이 없습니다.</>}
          {result.failed.length > 0 && (
            <div style={{ marginTop: 3, color: '#FF9B9B' }}>
              실패 {result.failed.length}건: {result.failed.slice(0, 3).map(f => `N${f.srcNode}→N${f.tgtNode} (${f.errors[0]})`).join(' · ')}{result.failed.length > 3 ? ' …' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
