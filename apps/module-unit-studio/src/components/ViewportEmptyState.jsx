import { useRef } from 'react'
import { FolderOpen, FileJson, Loader2, AlertTriangle } from 'lucide-react'
import { useStageStore } from '../store/useStageStore.js'
import { getHost } from '../host/host.js'
import { BG, LINE, INK, STATUS, ACCENT, FONT, RADIUS } from '../utils/tokens.js'

/**
 * 모델이 없을 때 뷰포트 자리에 나오는 화면.
 *
 * 이전 구현은 세 가지가 문제였다.
 *  1. "csv/01/20260424_172924/ 폴더의 JSON 파일들" — 개발자 PC 경로가 그대로 노출됐다.
 *  2. "파일을 선택하세요"라고 안내하면서 정작 여기에는 버튼이 없었다. 실제 버튼은
 *     좌측 사이드바 최상단이고, 그 아래 레이어 토글 10개와 시각적 무게가 같았다.
 *  3. stages.length === 0 만 보고 그렸기 때문에, 10MB 짜리 JSON 을 읽는 동안에도
 *     "파일을 선택하세요"가 떠 있었다. 로드 중인지 안 누른 건지 구분이 안 됐다.
 *
 * Workbench(Electron) 호스트에서는 백엔드가 폴더를 자동 주입하므로 파일 열기 버튼을
 * 노출하지 않는다(Sidebar 의 isHosted 규칙과 동일). 대신 어디서 모델이 오는지 알린다.
 */
export default function ViewportEmptyState() {
  const loading = useStageStore(s => s.loading)
  const error = useStageStore(s => s.error)
  const loadStages = useStageStore(s => s.loadStages)
  const fileInputRef = useRef(null)
  const isHosted = getHost().name === 'electron'

  if (loading) {
    return (
      <Frame>
        <Loader2 size={30} color={STATUS.info} className="spin" />
        <Title>모델을 읽는 중입니다</Title>
        <Hint>단계 JSON 이 수십 MB 일 수 있어 잠시 걸립니다.</Hint>
      </Frame>
    )
  }

  if (error) {
    return (
      <Frame>
        <AlertTriangle size={30} color={STATUS.fail} />
        <Title>모델을 불러오지 못했습니다</Title>
        <Hint>{String(error)}</Hint>
      </Frame>
    )
  }

  if (isHosted) {
    return (
      <Frame>
        <FolderOpen size={30} color={INK.dim} />
        <Title>표시할 모델이 없습니다</Title>
        <Hint>WorkBench 의 “Group &amp; Module Unit 권상 구조 해석”에서 모델을 선택하면 이 화면에 자동으로 열립니다.</Hint>
      </Frame>
    )
  }

  return (
    <Frame>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { loadStages(Array.from(e.target.files)); e.target.value = '' }}
      />
      <FileJson size={30} color={INK.dim} />
      <Title>모델을 열어 시작하세요</Title>
      <Hint>ModelBuilder 가 만든 단계 JSON(00_InputAudit, 01_Preprocess … 06_Validation)을 한 번에 선택합니다.</Hint>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        style={{
          marginTop: 4,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 18px',
          fontSize: FONT.md, fontWeight: 700,
          color: BG.deepest,
          background: ACCENT.brand,
          border: 'none',
          borderRadius: RADIUS.md,
          cursor: 'pointer',
        }}
      >
        <FolderOpen size={15} /> JSON 파일 열기
      </button>
    </Frame>
  )
}

function Frame({ children }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 10, padding: 24, textAlign: 'center',
      background: BG.viewport,
    }}>
      {children}
    </div>
  )
}

function Title({ children }) {
  return <p style={{ fontSize: FONT.lg, fontWeight: 700, color: INK.body }}>{children}</p>
}

function Hint({ children }) {
  return (
    <p style={{
      fontSize: FONT.base, color: INK.dim, lineHeight: 1.6,
      maxWidth: 420,
      border: `1px solid ${LINE.subtle}`, borderRadius: RADIUS.md,
      padding: '8px 12px', background: BG.panel,
    }}>{children}</p>
  )
}
