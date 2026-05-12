import { useEffect } from 'react'
import { useEditStore } from '../store/useEditStore.js'
import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'

/**
 * 편집 모드가 켜져 있을 때 viewport 우상단에 표시되는 EDIT MODE 워터마크.
 * 최초 진입 시 1회 한해 안내 토스트를 함께 띄운다 (5초 후 자동 dismiss 가능).
 *
 * ViewportContainer 의 position:relative 컨테이너 안에 마운트하면
 * 자동으로 그 영역에 잡힌다.
 */
export default function EditModeWatermark() {
  const enabled = useEditStore(s => s.enabled)
  const hasShownEntryToast = useEditStore(s => s.hasShownEntryToast)
  const markEntryToastShown = useEditStore(s => s.markEntryToastShown)

  // 활성 viewport 가 마지막 단계 viewport 인지 판단
  const stages = useStageStore(s => s.stages)
  const viewports = useViewerStore(s => s.viewports)
  const activeViewportId = useViewerStore(s => s.activeViewportId)
  const activeVp = viewports.find(v => v.id === activeViewportId) ?? viewports[0]
  const isEditTargetStage = stages.length > 0 && activeVp?.stageIndex === stages.length - 1

  const accent = isEditTargetStage ? '#FFB800' : '#7a8aaa'
  const label  = isEditTargetStage ? 'EDIT MODE' : 'EDIT — 비대상 단계'

  const showToast = enabled && !hasShownEntryToast

  useEffect(() => {
    if (!showToast) return
    const t = setTimeout(markEntryToastShown, 5000)
    return () => clearTimeout(t)
  }, [showToast, markEntryToastShown])

  if (!enabled) return null

  return (
    <>
      {/* 우상단 워터마크 라벨 */}
      <div style={{
        position: 'absolute',
        top: 8, right: 12,
        background: `${accent}2e`,
        color: accent,
        border: `1px solid ${accent}73`,
        borderRadius: 4,
        padding: '3px 9px',
        fontSize: 10, fontWeight: 800,
        letterSpacing: 1.3,
        pointerEvents: 'none',
        zIndex: 50,
        textShadow: isEditTargetStage ? '0 0 6px rgba(255, 184, 0, 0.6)' : 'none',
      }}>
        {label}
      </div>

      {/* 활성 viewport 보더 — 대상 단계는 강한 노랑, 그 외는 약한 회색 */}
      <div style={{
        position: 'absolute', inset: 0,
        boxShadow: `inset 0 0 0 2px ${accent}${isEditTargetStage ? '8c' : '4d'}`,
        pointerEvents: 'none',
        zIndex: 49,
      }} />

      {/* 첫 진입 안내 토스트 */}
      {showToast && (
        <div
          onClick={markEntryToastShown}
          style={{
            position: 'absolute',
            top: 44, right: 12,
            background: 'rgba(20, 16, 8, 0.96)',
            color: '#FFE6A8',
            border: '1px solid rgba(255, 184, 0, 0.45)',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 11, lineHeight: 1.5,
            maxWidth: 320,
            zIndex: 51,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,0.55)',
          }}
          title="클릭하여 닫기"
        >
          <strong style={{ color: '#FFB800' }}>편집 모드 안내</strong>
          <div style={{ marginTop: 4, color: '#cad8e8' }}>
            원본 데이터는 변경되지 않습니다. 편집 의도는 <strong>자세안정성 평가 실행</strong> 시
            모델에 자동 반영되어 <code>_edited.json</code> 으로 저장됩니다.
          </div>
        </div>
      )}
    </>
  )
}
